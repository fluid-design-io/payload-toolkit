import { cp, mkdir, readdir } from 'node:fs/promises'
import path from 'node:path'
import semver from 'semver'
import validatePackageName from 'validate-npm-package-name'
import { z } from 'zod'
import type { InitRequest } from '../model.js'
import { installedPackageSchema, ToolkitError } from '../model.js'
import { Attempt, runProcess } from './attempts.js'
import { exists, listSourceFiles, manifest } from './project.js'

export const bootstrap = z
  .object({
    generator: z.string(),
    payload: z.string(),
    templateCommit: z.string().length(40),
    nodeMinimum: z.string(),
    templates: z.object({ next: z.string(), tanstack: z.string() }),
  })
  .parse(
    JSON.parse(await Bun.file(new URL('../../../catalog/bootstrap.json', import.meta.url)).text()),
  )
// Payload's official generator and generated scripts still require an actual Node binary.
// Bun's process.versions.node describes compatibility, not the installed Node runtime.
export function requireNode(): void {
  const node = Bun.which('node', { PATH: process.env.PATH || process.env.Path || '' })
  const result = node ? Bun.spawnSync([node, '-p', 'process.versions.node']) : null
  const version = result?.success ? result.stdout.toString().trim() : null
  if (!version || !semver.valid(version) || !semver.gte(version, bootstrap.nodeMinimum))
    throw new ToolkitError(
      'node-version',
      `Payload's official generator requires Node >=${bootstrap.nodeMinimum}; installed Node is ${version ?? 'unavailable'}`,
    )
}
export function projectName(directory: string): string {
  const name = path.basename(directory)
  const validation = validatePackageName(name)
  if (!validation.validForNewPackages)
    throw new ToolkitError(
      'invalid-target',
      `Project directory must be a valid npm package name: ${name}`,
    )
  return name
}
export function databaseUrl(request: InitRequest, name: string): string {
  return (
    request.databaseUrl ||
    (request.database === 'postgres'
      ? `postgresql://payload:replace-me@127.0.0.1:5432/${name.replaceAll('-', '_')}`
      : `mongodb://127.0.0.1:27017/${name.replaceAll('-', '_')}`)
  )
}
export async function createOfficialSource(
  stagingParent: string,
  name: string,
  request: InitRequest,
  attempt?: Attempt,
  signal?: AbortSignal,
): Promise<string> {
  requireNode()
  const uri = databaseUrl(request, name)
  await runProcess(
    'npm',
    [
      'exec',
      '--yes',
      `--package=${bootstrap.generator}`,
      '--',
      'create-payload-app',
      '--name',
      name,
      '--template',
      bootstrap.templates[request.framework],
      '--db',
      request.database,
      '--db-connection-string',
      uri,
      '--branch',
      bootstrap.templateCommit,
      '--payload-version',
      bootstrap.payload,
      `--use-${request.packageManager}`,
      '--no-deps',
      '--no-git',
      '--no-agent',
    ],
    { cwd: stagingParent, attempt, signal, secrets: [uri] },
  )
  const source = path.join(stagingParent, name)
  await inspectOfficialSource(source, request)
  if (
    (await exists(path.join(source, 'node_modules'))) ||
    (await exists(path.join(source, '.git')))
  )
    throw new ToolkitError(
      'official-postcondition',
      'Source generator unexpectedly created dependencies or Git',
    )
  return source
}
export async function inspectOfficialSource(project: string, request: InitRequest): Promise<void> {
  const pkg = await manifest(project)
  const dependencies = pkg.dependencies
  if (
    dependencies.payload !== bootstrap.payload ||
    dependencies[`@payloadcms/db-${request.database}`] !== bootstrap.payload
  )
    throw new ToolkitError(
      'official-postcondition',
      'Generated Payload version or adapter does not match the pinned tuple',
    )
  for (const [name, version] of Object.entries(dependencies))
    if ((name === 'payload' || name.startsWith('@payloadcms/')) && version !== bootstrap.payload)
      throw new ToolkitError(
        'official-postcondition',
        `Generated ${name} does not match the pinned tuple`,
      )
  if (!dependencies[request.framework === 'next' ? 'next' : '@tanstack/react-start'])
    throw new ToolkitError(
      'official-postcondition',
      'Generated framework does not match the request',
    )
  const files = await listSourceFiles(project)
  const configPath = files.find((file) => /(^|[/\\])payload\.config\.ts$/.test(file))
  if (
    !configPath ||
    !(await Bun.file(path.join(project, configPath)).text()).includes(
      `@payloadcms/db-${request.database}`,
    )
  )
    throw new ToolkitError(
      'official-postcondition',
      'Generated config does not use the requested database adapter',
    )
  const users = files.find((file) => /(^|[/\\])Users\.ts$/.test(file))
  if (!users || !/auth\s*:\s*true/.test(await Bun.file(path.join(project, users)).text()))
    throw new ToolkitError(
      'official-postcondition',
      'Generated native Users authentication is missing',
    )
}
export async function publishOfficialSource(source: string, destination: string): Promise<void> {
  // Exclusive reservation is the no-clobber boundary. Partial output is retained.
  await mkdir(path.dirname(destination), { recursive: true })
  await mkdir(destination)
  for (const entry of await readdir(source)) {
    if (entry === 'node_modules' || entry === '.git') continue
    await cp(path.join(source, entry), path.join(destination, entry), {
      recursive: true,
      force: false,
      errorOnExist: true,
      filter: (filename) => !['node_modules', '.git'].includes(path.basename(filename)),
    })
  }
}
export async function completeOfficialProject(
  project: string,
  request: InitRequest,
  attempt?: Attempt,
  signal?: AbortSignal,
): Promise<void> {
  await runProcess(request.packageManager, ['install'], {
    cwd: project,
    attempt,
    signal,
    secrets: request.databaseUrl ? [request.databaseUrl] : [],
  })
  const pkg = await manifest(project)
  const dependencies = pkg.dependencies
  for (const name of Object.keys(dependencies).filter(
    (packageName) => packageName === 'payload' || packageName.startsWith('@payloadcms/'),
  )) {
    const installed = installedPackageSchema.parse(
      JSON.parse(await Bun.file(path.join(project, 'node_modules', name, 'package.json')).text()),
    )
    if (installed.version !== bootstrap.payload)
      throw new ToolkitError(
        'official-postcondition',
        `Installed ${name} does not match ${bootstrap.payload}`,
      )
  }
  const scripts = pkg.scripts
  for (const script of ['generate:types', 'generate:importmap']) {
    if (!scripts?.[script])
      throw new ToolkitError('official-postcondition', `Official template has no ${script} script`)
    await runProcess(request.packageManager, ['run', script], {
      cwd: project,
      attempt,
      signal,
      secrets: request.databaseUrl ? [request.databaseUrl] : [],
    })
  }
  const files = await listSourceFiles(project)
  if (
    !files.some((file) => /(^|[/\\])payload-types\.ts$/.test(file)) ||
    !files.some((file) => /(^|[/\\])importMap\.[jt]s$/.test(file))
  )
    throw new ToolkitError(
      'official-postcondition',
      'Official artifact generation did not produce Payload types and the admin import map',
    )
}
