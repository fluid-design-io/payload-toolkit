import { spawn, type ChildProcess } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { createReadStream } from 'node:fs'
import net from 'node:net'
import path from 'node:path'

export type Check = { name: string; status: 'passed' | 'failed' | 'blocked'; detail?: string }
export type Evidence = {
  schemaVersion: 1
  runId: string
  source: { revision: string; dirty: boolean; sha256: string }
  framework: string
  database: string
  packageManager: string
  mode: 'cli-only' | 'installation-only' | 'runtime'
  node: string
  bun: string
  startedAt: string
  finishedAt?: string
  status: 'running' | 'passed' | 'failed' | 'blocked'
  checks: Check[]
  commands: {
    command: string
    args: string[]
    exitCode: number | null
    log: string
    termination?: 'timeout' | 'output-limit'
    cleanup?: 'complete' | 'unsafe'
  }[]
  identities: Record<string, string>
  cleanup: { status: string; resources: string[] }
}
export class Blocked extends Error {}
export const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex')
export const readJson = async (file: string) => JSON.parse(await Bun.file(file).text())
export async function exists(file: string) {
  return fs.stat(file).then(
    () => true,
    () => false,
  )
}
export async function files(directory: string, prefix = ''): Promise<string[]> {
  const output: string[] = []
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (
      [
        'node_modules',
        '.git',
        '.next',
        '.output',
        '.tanstack',
        'dist',
        'build',
        'media',
        '.scratch',
      ].includes(entry.name)
    )
      continue
    const name = path.join(prefix, entry.name)
    if (entry.isDirectory()) output.push(...(await files(path.join(directory, entry.name), name)))
    else if (entry.isFile()) output.push(name)
  }
  return output.toSorted()
}
export async function treeHash(directory: string) {
  const entries = await files(directory)
  const digest = createHash('sha256')
  for (const name of entries) {
    const content = createHash('sha256')
    for await (const chunk of createReadStream(path.join(directory, name))) content.update(chunk)
    digest.update(`${name}\0${content.digest('hex')}\n`)
  }
  return digest.digest('hex')
}
export async function selectedSourceHash(directory: string, entries: string[]) {
  const digest = createHash('sha256')
  for (const name of [...new Set(entries)].toSorted()) {
    digest.update(`${name}\0`)
    const filename = path.join(directory, name)
    const metadata = await fs.lstat(filename).catch((error) => {
      if (error.code === 'ENOENT') return null
      throw error
    })
    if (!metadata) {
      digest.update('<deleted>\n')
      continue
    }
    if (metadata.isSymbolicLink()) {
      digest.update(`<symlink>${await fs.readlink(filename)}\n`)
      continue
    }
    if (!metadata.isFile()) throw new Error(`Unexpected directory in selected source: ${name}`)
    const fileDigest = createHash('sha256')
    for await (const chunk of createReadStream(filename)) fileDigest.update(chunk)
    digest.update(`<file>${fileDigest.digest('hex')}\n`)
  }
  return digest.digest('hex')
}
export const runId = () => `${Date.now()}-${randomUUID().slice(0, 8)}`
export function sanitize(text: string) {
  return text
    .replace(/(mongodb(?:\+srv)?|postgres(?:ql)?):\/\/[^\s"']+/g, '$1://[redacted]')
    .replace(/(Bearer\s+)[\w.-]+/gi, '$1[redacted]')
    .replace(/("?(?:password|token|secret|apiKey)"?\s*[:=]\s*)"?[^\s",}]+/gi, '$1[redacted]')
}
export async function launch(
  commandName: string,
  args: string[],
  options: Parameters<typeof spawn>[2],
) {
  if (process.platform === 'win32' && ['npm', 'pnpm'].includes(commandName)) {
    const env = options?.env ?? process.env
    const searchPath = env.PATH || env.Path
    const node = Bun.which('node', { PATH: searchPath })
    if (!node) throw new Blocked('Node is required by the output package manager on Windows')
    const directories = [
      ...new Set([...(searchPath || '').split(path.delimiter).filter(Boolean), path.dirname(node)]),
    ]
    for (const directory of directories) {
      const candidates: string[] = []
      candidates.push(
        path.join(
          directory,
          commandName === 'npm'
            ? 'node_modules/npm/bin/npm-cli.js'
            : 'node_modules/pnpm/bin/pnpm.cjs',
        ),
        path.join(directory, `node_modules/corepack/dist/${commandName}.js`),
      )
      const wrapper = await Bun.file(path.join(directory, `${commandName}.cmd`))
        .text()
        .catch(() => '')
      for (const match of wrapper.matchAll(
        /(?:%~dp0|%dp0%)[\\/]?([^"\r\n]*?(?:npm-cli\.js|pnpm\.(?:cjs|js)))"/gi,
      )) {
        if (!match[1]!.includes('%'))
          candidates.push(path.resolve(directory, match[1]!.replaceAll('\\', path.sep)))
      }
      for (const script of candidates)
        if (await Bun.file(script).exists())
          return spawn(node, [script, ...args], { ...options, shell: false })
      const executable = path.join(directory, `${commandName}.exe`)
      if (await Bun.file(executable).exists())
        return spawn(executable, args, { ...options, shell: false })
    }
    throw new Blocked(`Cannot locate the ${commandName} JavaScript launcher on Windows`)
  }
  return spawn(commandName, args, { ...options, shell: false })
}
export async function command(
  commandName: string,
  args: string[],
  options: {
    cwd: string
    env?: NodeJS.ProcessEnv
    timeout?: number
    evidence?: Evidence
    directory?: string
    allowFailure?: boolean
  },
): Promise<{ code: number; stdout: string; stderr: string }> {
  const child = await launch(commandName, args, {
    cwd: options.cwd,
    env: { ...process.env, ...options.env },
    shell: false,
    windowsHide: true,
    detached: process.platform !== 'win32',
  })
  let stdout = ''
  let stderr = ''
  let termination: 'timeout' | 'output-limit' | undefined
  let cancellation: Promise<void> | undefined
  let cancellationError: unknown
  let resolveCancellation!: (code: number) => void
  const cancellationFinished = new Promise<number>((resolve) => {
    resolveCancellation = resolve
  })
  const cancel = (reason: 'timeout' | 'output-limit') => {
    if (termination) return
    termination = reason
    cancellation = terminateOwned(child)
      .catch((error) => {
        cancellationError = error
      })
      .finally(() => resolveCancellation(1))
  }
  child.stdout?.on('data', (data) => {
    stdout += data.toString()
    if (stdout.length > 20_000_000) cancel('output-limit')
  })
  child.stderr?.on('data', (data) => {
    stderr += data.toString()
    if (stderr.length > 20_000_000) cancel('output-limit')
  })
  const timer = setTimeout(() => cancel('timeout'), options.timeout ?? 900_000)
  const code = await Promise.race([
    new Promise<number>((resolve, reject) => {
      child.once('error', reject)
      child.once('close', (result) => resolve(result ?? 1))
    }),
    cancellationFinished,
  ]).finally(() => clearTimeout(timer))
  await cancellation
  if (options.evidence && options.directory) {
    const log = `command-${options.evidence.commands.length}.log`
    const portable = (text: string) =>
      sanitize(text).replaceAll(options.directory!, '<evidence>').replaceAll(options.cwd, '<cwd>')
    await Bun.write(path.join(options.directory, log), portable(stdout + '\n' + stderr), {
      createPath: false,
    })
    options.evidence.commands.push({
      command: path.basename(commandName),
      args: args.map(portable),
      exitCode: code,
      log,
      ...(termination
        ? { termination, cleanup: cancellationError ? ('unsafe' as const) : ('complete' as const) }
        : {}),
    })
  }
  if (cancellationError)
    throw new Error(`Unsafe command termination: ${sanitize(String(cancellationError))}`)
  if ((code !== 0 || termination) && !options.allowFailure)
    throw new Error(
      `${path.basename(commandName)} failed (${termination ?? code}): ${sanitize(stderr).slice(-1200)}`,
    )
  return { code, stdout, stderr }
}
export async function freePort() {
  const server = net.createServer()
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const port = (server.address() as net.AddressInfo).port
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  )
  return port
}
async function terminateOwned(child: ChildProcess) {
  if (!child.pid) return
  if (child.exitCode !== null || child.signalCode !== null)
    throw new Error(
      'Owned wrapper already exited; descendant cleanup cannot be confirmed without signaling a potentially reused PID',
    )
  // Never signal a persisted PID, or schedule escalation after the leader exits.
  // The deadline/cleanup is final: signal the still-owned group synchronously.
  if (process.platform === 'win32') {
    const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
      windowsHide: true,
      stdio: 'ignore',
      shell: false,
    })
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        killer.kill('SIGKILL')
        reject(new Error('taskkill timed out; descendant cleanup is unsafe'))
      }, 5000)
      killer.once('error', (error) => {
        clearTimeout(timer)
        reject(error)
      })
      killer.once('close', (code) => {
        clearTimeout(timer)
        if (code !== 0) reject(new Error(`taskkill failed (${code}); descendant cleanup is unsafe`))
        else resolve()
      })
    })
  } else {
    for (const signal of ['SIGTERM', 'SIGKILL'] as const) {
      try {
        process.kill(-child.pid, signal)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error
      }
    }
  }
  if (child.exitCode !== null || child.signalCode !== null) return
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Owned process group did not close; cleanup is unsafe')),
      5000,
    )
    child.once('close', () => {
      clearTimeout(timer)
      resolve()
    })
  })
}
export async function stop(child: ChildProcess) {
  await terminateOwned(child)
}
export async function waitUntil(
  name: string,
  check: () => Promise<boolean>,
  milliseconds = 180_000,
) {
  const deadline = Date.now() + milliseconds
  let last: unknown
  while (Date.now() < deadline) {
    try {
      if (await check()) return
    } catch (error) {
      last = error
    }
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  throw new Error(
    `${name} was not ready: ${last instanceof Error ? sanitize(last.message) : 'deadline exceeded'}`,
  )
}
