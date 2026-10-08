import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { promisify } from 'node:util'
import { lstat, mkdir, open, readdir, readlink, realpath, rm } from 'node:fs/promises'
import { hostname } from 'node:os'
import path from 'node:path'
import semver from 'semver'
import type { AddRequest, Host, PackageManager, ProjectManifest } from '../model.js'
import { installedPackageSchema, projectManifestSchema, ToolkitError } from '../model.js'
import { digest, stateDirectory } from './attempts.js'

const exec = promisify(execFile)
export async function exists(filename: string): Promise<boolean> {
  try {
    await lstat(filename)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}
export async function manifest(directory: string): Promise<ProjectManifest> {
  return projectManifestSchema.parse(
    JSON.parse(await Bun.file(path.join(directory, 'package.json')).text()),
  )
}
export async function canonicalTarget(directory: string): Promise<string> {
  const absolute = path.resolve(directory)
  let parent = absolute
  const suffix: string[] = []
  while (!(await exists(parent))) {
    suffix.unshift(path.basename(parent))
    const next = path.dirname(parent)
    if (next === parent) throw new ToolkitError('invalid-target', 'Cannot resolve project parent')
    parent = next
  }
  const stat = await lstat(parent)
  if (stat.isSymbolicLink())
    throw new ToolkitError('invalid-target', 'Project target may not be a symlink')
  return path.join(await realpath(parent), ...suffix)
}

async function git(
  directory: string,
  args: string[],
  optional?: 'outside-repository' | 'unborn-head' | 'detached-head',
): Promise<string | null> {
  try {
    return (
      await exec('git', ['--no-optional-locks', '-C', directory, ...args], {
        encoding: 'utf8',
        maxBuffer: 32 * 1024 * 1024,
      })
    ).stdout.trimEnd()
  } catch (error) {
    const failure = error as Error & { code?: string | number; stderr?: string; stdout?: string }
    const stderr = failure.stderr?.trim() || ''
    if (
      optional === 'outside-repository' &&
      failure.code === 128 &&
      /^fatal: not a git repository(?: \(or any of the parent directories\))?(?::|\s)/.test(stderr)
    )
      return null
    if (
      (optional === 'unborn-head' || optional === 'detached-head') &&
      failure.code === 1 &&
      !stderr &&
      !failure.stdout?.trim()
    )
      return null
    throw new ToolkitError(
      'git-unavailable',
      `Could not inspect Git ${args.join(' ')}: ${stderr || failure.message}`,
    )
  }
}
export type Snapshot = {
  root: string
  git: null | {
    head: string | null
    branch: string | null
    indexSha256: string | null
    indexEntries: string
    indexEntriesSha256: string
    status: string
  }
  files: readonly { path: string; sha256: string; kind: 'file' | 'symlink' | 'missing' }[]
  sha256: string
}
async function nearestDirectory(target: string): Promise<string> {
  let directory = target
  while (!(await exists(directory))) directory = path.dirname(directory)
  return directory
}
async function fileDigest(filename: string): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(filename)) hash.update(chunk)
  return hash.digest('hex')
}
export async function listSourceFiles(root: string): Promise<string[]> {
  const result: string[] = []
  async function walk(relative: string): Promise<void> {
    for (const entry of await readdir(path.join(root, relative), { withFileTypes: true })) {
      if (
        ['node_modules', '.git', '.next', '.output', '.tanstack', 'dist', 'build'].includes(
          entry.name,
        )
      )
        continue
      const filename = path.join(relative, entry.name)
      if (entry.isDirectory()) await walk(filename)
      else result.push(filename)
    }
  }
  await walk('')
  return result.toSorted()
}
export async function snapshot(target: string): Promise<Snapshot> {
  const directory = await nearestDirectory(target)
  const gitRoot = await git(directory, ['rev-parse', '--show-toplevel'], 'outside-repository')
  const root = gitRoot || directory
  const status = gitRoot
    ? await git(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all'])
    : null
  const tracked = gitRoot
    ? await git(root, ['ls-files', '--cached', '--others', '--exclude-standard', '-z'])
    : null
  const names =
    tracked !== null
      ? [...new Set(tracked.split('\0').filter(Boolean))].toSorted()
      : (await exists(target))
        ? await listSourceFiles(root)
        : []
  const files: Snapshot['files'][number][] = []
  for (const filename of names) {
    const full = path.join(root, filename)
    try {
      const stat = await lstat(full)
      if (stat.isSymbolicLink())
        files.push({ path: filename, sha256: digest(await readlink(full)), kind: 'symlink' })
      else if (stat.isFile())
        files.push({ path: filename, sha256: await fileDigest(full), kind: 'file' })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT')
        files.push({ path: filename, sha256: digest('absent'), kind: 'missing' })
      else throw error
    }
  }
  const indexPath = gitRoot ? await git(root, ['rev-parse', '--git-path', 'index']) : null
  const indexBytes = indexPath
    ? await Bun.file(path.resolve(root, indexPath))
        .bytes()
        .catch((error) => {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
          throw new ToolkitError('git-unavailable', `Could not read Git index: ${String(error)}`)
        })
    : null
  const indexEntries = gitRoot ? (await git(root, ['ls-files', '--stage', '-z'])) || '' : ''
  if (gitRoot && (!indexPath || (indexEntries && !indexBytes)))
    throw new ToolkitError('git-unavailable', 'Git index identity could not be read')
  const gitFacts = gitRoot
    ? {
        head: await git(root, ['rev-parse', '--verify', '--quiet', 'HEAD'], 'unborn-head'),
        branch: await git(root, ['symbolic-ref', '--quiet', '--short', 'HEAD'], 'detached-head'),
        indexSha256: indexBytes ? digest(indexBytes) : null,
        indexEntries,
        indexEntriesSha256: digest(indexEntries),
        status: status || '',
      }
    : null
  return {
    root,
    git: gitFacts,
    files,
    sha256: digest(JSON.stringify({ root, git: gitFacts, files })),
  }
}
export function requireClean(baseline: Snapshot, allowDirty: boolean): void {
  if (!allowDirty && baseline.git?.status)
    throw new ToolkitError(
      'dirty-project',
      'Git has staged, unstaged or untracked changes. Review them or explicitly use --allow-dirty.',
    )
}
export async function requireUnchanged(target: string, before: Snapshot): Promise<void> {
  if ((await snapshot(target)).sha256 !== before.sha256)
    throw new ToolkitError(
      'external-drift',
      'Project changed since preflight. Review the attempt before retrying.',
    )
}
export function requireExpectedChanges(
  target: string,
  before: Snapshot,
  after: Snapshot,
  allowed: 'project' | readonly string[],
): void {
  if (
    Boolean(before.git) !== Boolean(after.git) ||
    (before.git &&
      after.git &&
      (before.git.head !== after.git.head ||
        before.git.branch !== after.git.branch ||
        before.git.indexSha256 !== after.git.indexSha256 ||
        before.git.indexEntriesSha256 !== after.git.indexEntriesSha256))
  )
    throw new ToolkitError(
      'external-drift',
      'Git HEAD or staged changes moved during installation. Integration was not started.',
    )
  if (before.root !== after.root) return // A new non-Git project had no source root before publication.
  const prefix = path.relative(before.root, target)
  const permitted = (filename: string) => {
    const relative = prefix ? path.relative(prefix, filename) : filename
    if (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative))
      return false
    return allowed === 'project' || allowed.includes(relative.split(path.sep).join('/'))
  }
  const old = new Map(before.files.map((file) => [file.path, file.sha256]))
  const fresh = new Map(after.files.map((file) => [file.path, file.sha256]))
  for (const filename of new Set([...old.keys(), ...fresh.keys()]))
    if (old.get(filename) !== fresh.get(filename) && !permitted(filename))
      throw new ToolkitError(
        'external-drift',
        `Unexpected source changed during installation: ${filename}. Integration was not started.`,
      )
}

export async function acquireLease(
  target: string,
  attempt: string,
): Promise<(recoveryReason?: string) => Promise<void>> {
  const directory = path.join(stateDirectory(), 'leases')
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const filename = path.join(directory, digest(target) + '.json')
  const value = JSON.stringify({
    target,
    attempt,
    pid: process.pid,
    host: hostname(),
    startedAt: new Date().toISOString(),
  })
  try {
    const file = await open(filename, 'wx', 0o600)
    try {
      await file.writeFile(value)
      await file.sync()
    } finally {
      await file.close()
    }
    return async (recoveryReason) => {
      if (
        (await Bun.file(filename)
          .text()
          .catch(() => null)) !== value
      )
        return
      if (recoveryReason) {
        const retained = await open(filename, 'r+')
        try {
          await retained.truncate(0)
          await retained.writeFile(
            JSON.stringify({ ...JSON.parse(value), recoveryRequired: true, recoveryReason }),
          )
          await retained.sync()
        } finally {
          await retained.close()
        }
      } else await rm(filename)
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    const old = await Bun.file(filename).text()
    let owner: { attempt?: string; recoveryRequired?: boolean }
    try {
      owner = JSON.parse(old)
    } catch {
      throw new ToolkitError('target-busy', `Target has an unreadable lease at ${filename}`)
    }
    if (owner.recoveryRequired)
      throw new ToolkitError(
        'target-busy',
        `Attempt ${owner.attempt || 'unknown'} could not confirm process-tree termination. Review the retained lease at ${filename} before removing it.`,
      )
    throw new ToolkitError(
      'target-busy',
      `Another toolkit attempt owns the project: ${owner.attempt || 'unknown'}. Review ownership and any surviving child processes before manually removing its lease at ${filename}.`,
    )
  }
}

export async function detectPackageManager(directory: string): Promise<PackageManager> {
  let current = directory
  while (true) {
    const found = new Set<PackageManager>()
    for (const [file, manager] of [
      ['pnpm-lock.yaml', 'pnpm'],
      ['package-lock.json', 'npm'],
      ['npm-shrinkwrap.json', 'npm'],
      ['bun.lock', 'bun'],
      ['bun.lockb', 'bun'],
    ] as const)
      if (await exists(path.join(current, file))) found.add(manager)
    if (await exists(path.join(current, 'package.json'))) {
      const value = (await manifest(current)).packageManager
      if (typeof value === 'string') {
        const manager = value.split('@')[0]
        if (manager !== 'npm' && manager !== 'pnpm' && manager !== 'bun')
          throw new ToolkitError('package-manager', `Unsupported package manager ${manager}`)
        found.add(manager)
      }
    }
    if (found.size > 1)
      throw new ToolkitError('package-manager', `Conflicting package-manager markers in ${current}`)
    if (found.size === 1) return [...found][0]!
    const parent = path.dirname(current)
    if (parent === current) return 'npm'
    current = parent
  }
}

export async function inspectHost(
  directory: string,
  hints: Pick<AddRequest, 'framework' | 'database'> = {},
): Promise<Host> {
  const pkg = await manifest(directory)
  const dependencies = { ...pkg.dependencies, ...pkg.devDependencies }
  const frameworks = (['next', 'tanstack'] as const).filter(
    (value) => dependencies[value === 'next' ? 'next' : '@tanstack/react-start'],
  )
  const framework = hints.framework || (frameworks.length === 1 ? frameworks[0] : undefined)
  if (!framework || !frameworks.includes(framework))
    throw new ToolkitError(
      'incompatible',
      'Cannot identify one supported framework from the project manifest',
    )
  const configs = (await listSourceFiles(directory)).filter((file) =>
    /(^|[/\\])payload\.config\.[cm]?[jt]s$/.test(file),
  )
  const config = (
    await Promise.all(configs.map((file) => Bun.file(path.join(directory, file)).text()))
  ).join('\n')
  const imported = (['postgres', 'mongodb'] as const).filter((database) =>
    config.includes(`@payloadcms/db-${database}`),
  )
  const available = imported.length
    ? imported
    : (['postgres', 'mongodb'] as const).filter(
        (database) => dependencies[`@payloadcms/db-${database}`],
      )
  const database = hints.database || (available.length === 1 ? available[0] : undefined)
  if (!database || !available.includes(database))
    throw new ToolkitError('incompatible', 'Cannot identify one supported Payload database adapter')
  let payloadVersion = dependencies.payload
  const installed = path.join(directory, 'node_modules', 'payload', 'package.json')
  if (await exists(installed))
    payloadVersion = installedPackageSchema.parse(
      JSON.parse(await Bun.file(installed).text()),
    ).version
  if (!payloadVersion || !semver.valid(payloadVersion))
    throw new ToolkitError(
      'incompatible',
      'Payload must have an identifiable exact installed version',
    )
  return {
    framework,
    database,
    payloadVersion,
    packageManager: await detectPackageManager(directory),
  }
}
