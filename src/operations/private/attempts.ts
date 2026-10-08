import { appendFile, mkdir, open, stat, writeFile } from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import { homedir } from 'node:os'
import path from 'node:path'
import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import type { Event, Result, RunOptions } from '../model.js'
import { ToolkitError } from '../model.js'

export function digest(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex')
}
export function stateDirectory(): string {
  return path.resolve(
    process.env.PAYLOAD_TOOLKIT_STATE_DIR ||
      path.join(
        process.env.XDG_STATE_HOME || path.join(homedir(), '.local', 'state'),
        'payload-toolkit',
      ),
  )
}
export function redact(input: string, secrets: readonly string[] = []): string {
  let output = input
  const sensitiveEnvironment = Object.entries(process.env)
    .filter(([name, value]) => value && /TOKEN|SECRET|PASSWORD|KEY|DATABASE.*URL/i.test(name))
    .map(([, value]) => value!)
  for (const secret of [...secrets, ...sensitiveEnvironment]
    .filter((value) => value.length >= 4)
    .toSorted((a, b) => b.length - a.length))
    output = output.split(secret).join('[redacted]')
  return output
    .replace(/\b(?:postgres(?:ql)?|mongodb(?:\+srv)?):\/\/[^\s"']+/gi, '[redacted-database-url]')
    .replace(/(https?:\/\/)[^\s/:]+:[^\s/@]+@/gi, '$1[redacted]@')
    .replace(/((?:TOKEN|SECRET|PASSWORD|API_KEY)\s*[=:]\s*)[^\s,;]+/gi, '$1[redacted]')
}

export class Attempt {
  readonly id = randomUUID()
  readonly directory = path.join(stateDirectory(), 'attempts', this.id)
  readonly receipt = path.join(this.directory, 'result.json')
  private sequence = 0
  terminationFailure: string | undefined
  constructor(
    private readonly options: RunOptions = {},
    readonly secrets: readonly string[] = [],
  ) {}
  async start(operation: 'init' | 'add', target: string): Promise<void> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 })
    await this.fact('attempt', {
      schemaVersion: 1,
      operation,
      target,
      pid: process.pid,
      startedAt: new Date().toISOString(),
    })
  }
  async fact(kind: string, data: unknown): Promise<void> {
    const filename = path.join(this.directory, 'journal.jsonl')
    await appendFile(
      filename,
      redact(JSON.stringify({ kind, time: new Date().toISOString(), data }), this.secrets) + '\n',
      { mode: 0o600 },
    )
    const file = await open(filename, 'r+')
    try {
      await file.sync()
    } finally {
      await file.close()
    }
  }
  async event(stage: string, status: Event['status'], message: string): Promise<void> {
    const event: Event = {
      attempt: this.id,
      sequence: ++this.sequence,
      stage,
      status,
      message: redact(message, this.secrets),
    }
    await this.fact('event', event)
    try {
      this.options.onEvent?.(event)
    } catch {
      /* Rendering does not own operation status. */
    }
  }
  async finish(result: Result): Promise<Result> {
    await writeFile(this.receipt, redact(JSON.stringify(result, null, 2), this.secrets) + '\n', {
      mode: 0o600,
    })
    const file = await open(this.receipt, 'r+')
    try {
      await file.sync()
    } finally {
      await file.close()
    }
    return result
  }
}

const executeFile = promisify(execFile)
export async function terminateWindowsTree(
  pid: number,
  executable = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'taskkill.exe'),
): Promise<void> {
  try {
    await executeFile(executable, ['/PID', String(pid), '/T', '/F'], {
      timeout: 10_000,
      windowsHide: true,
      maxBuffer: 1024 * 1024,
      encoding: 'utf8',
    })
  } catch (error) {
    const failure = error as Error & { stderr?: string; stdout?: string }
    throw new ToolkitError(
      'termination-unconfirmed',
      `Could not confirm termination of owned process tree ${pid}: ${(failure.stderr || failure.stdout || failure.message).trim().slice(-2000)}`,
    )
  }
}

export type ProcessOptions = {
  cwd: string
  signal?: AbortSignal
  input?: string
  attempt?: Attempt
  secrets?: readonly string[]
  env?: NodeJS.ProcessEnv
  agentOutput?: boolean
  onStdout?: (chunk: string) => void
  onStderr?: (chunk: string) => void
}
export async function resolveWindowsCommand(
  command: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
  nodeExecutable = Bun.which('node', { PATH: env.PATH || env.Path }) ?? 'node',
): Promise<{ executable: string; args: readonly string[] }> {
  if (command !== 'npm' && command !== 'pnpm') return { executable: command, args }
  const directories = [
    ...(env.PATH || env.Path || '').split(path.delimiter).filter(Boolean),
    path.dirname(nodeExecutable),
  ]
  const matches = (filename: string) =>
    command === 'npm'
      ? /(?:^|[/\\])npm-cli\.js$/i.test(filename)
      : /(?:^|[/\\])pnpm\.(?:cjs|js)$/i.test(filename)
  if (
    env.npm_execpath &&
    matches(env.npm_execpath) &&
    (await stat(env.npm_execpath)
      .then((entry) => entry.isFile())
      .catch(() => false))
  )
    return { executable: nodeExecutable, args: [env.npm_execpath, ...args] }
  for (const directory of new Set(directories)) {
    const candidates: string[] = []
    candidates.push(
      path.join(
        directory,
        command === 'npm' ? 'node_modules/npm/bin/npm-cli.js' : 'node_modules/pnpm/bin/pnpm.cjs',
      ),
      path.join(directory, `node_modules/corepack/dist/${command}.js`),
    )
    const wrapper = await Bun.file(path.join(directory, `${command}.cmd`))
      .text()
      .catch(() => '')
    for (const match of wrapper.matchAll(
      /(?:%~dp0|%dp0%)[\\/]?([^"\r\n]*?(?:npm-cli\.js|pnpm\.(?:cjs|js)))"/gi,
    )) {
      const relative = match[1]!.replaceAll('\\', path.sep)
      if (!relative.includes('%')) candidates.push(path.resolve(directory, relative))
    }
    for (const candidate of new Set(candidates)) {
      if (
        await stat(candidate)
          .then((entry) => entry.isFile())
          .catch(() => false)
      )
        return { executable: nodeExecutable, args: [candidate, ...args] }
    }
    const candidate = path.join(directory, `${command}.exe`)
    if (
      await stat(candidate)
        .then((entry) => entry.isFile())
        .catch(() => false)
    )
      return { executable: candidate, args }
  }
  throw new ToolkitError(
    'process-unavailable',
    `Cannot locate the ${command} JavaScript launcher or executable on Windows`,
  )
}
export async function runProcess(
  executable: string,
  args: readonly string[],
  options: ProcessOptions,
): Promise<void> {
  options.signal?.throwIfAborted()
  const secrets = [...(options.secrets || [])]
  for (const name of ['.env', '.env.local']) {
    const environment = await Bun.file(path.join(options.cwd, name))
      .text()
      .catch(() => '')
    for (const line of environment.split('\n')) {
      const match = /^\s*(?:export\s+)?([A-Za-z_][\w]*)\s*=\s*(.*)$/.exec(line)
      if (match && /TOKEN|SECRET|PASSWORD|KEY|DATABASE.*URL/i.test(match[1]!))
        secrets.push(match[2]!.trim().replace(/^['"]|['"]$/g, ''))
    }
  }
  await options.attempt?.fact('process-start', {
    executable,
    arguments: args.map((arg) => redact(arg, secrets)),
    cwd: options.cwd,
  })
  const launch =
    process.platform === 'win32'
      ? await resolveWindowsCommand(executable, args, options.env || process.env)
      : { executable, args }
  await new Promise<void>((resolve, reject) => {
    const child = spawn(launch.executable, [...launch.args], {
      cwd: options.cwd,
      env: options.env || process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
    })
    const output = createHash('sha256')
    let bytes = 0
    let tail = ''
    let aborted = false
    let killTimer: ReturnType<typeof setTimeout> | undefined
    let windowsTermination: Promise<void> | undefined
    let terminationFailure: string | undefined
    const kill = (signal: NodeJS.Signals) => {
      try {
        if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, signal)
        else child.kill(signal)
      } catch {
        /* Child may already have exited. */
      }
    }
    const abort = () => {
      if (aborted) return
      aborted = true
      if (process.platform === 'win32' && child.pid) {
        // taskkill must inspect the owned tree while its parent is still alive.
        windowsTermination = terminateWindowsTree(child.pid).catch((error) => {
          terminationFailure = error instanceof Error ? error.message : String(error)
          // Stop the known parent, but retain ownership because descendants are uncertain.
          child.kill('SIGKILL')
          child.stdin?.destroy()
          child.stdout?.destroy()
          child.stderr?.destroy()
        })
      } else {
        kill('SIGTERM')
        killTimer = setTimeout(() => kill('SIGKILL'), 2000)
        killTimer.unref()
      }
    }
    options.signal?.addEventListener('abort', abort, { once: true })
    if (options.signal?.aborted) abort()
    const observe = (chunk: Buffer) => {
      output.update(chunk)
      bytes += chunk.length
      if (!options.agentOutput) tail = (tail + chunk.toString('utf8')).slice(-8000)
    }
    child.stdout?.on('data', (chunk: Buffer) => {
      observe(chunk)
      options.onStdout?.(chunk.toString('utf8'))
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      observe(chunk)
      options.onStderr?.(chunk.toString('utf8'))
    })
    child.stdin?.on('error', () => {})
    child.stdin?.end(options.input || '')
    let spawnError: Error | undefined
    child.on('error', (error) => {
      spawnError = error
    })
    child.on('close', async (code, signal) => {
      options.signal?.removeEventListener('abort', abort)
      // A parent can exit while a descendant ignores SIGTERM and holds no pipes.
      if (aborted) {
        if (windowsTermination) await windowsTermination
        else kill('SIGKILL')
      }
      if (killTimer) clearTimeout(killTimer)
      try {
        if (terminationFailure) {
          if (options.attempt) options.attempt.terminationFailure = terminationFailure
          await options.attempt?.fact('process-termination-unconfirmed', {
            executable,
            pid: child.pid,
            reason: terminationFailure,
          })
        }
        const diagnostic = options.agentOutput ? undefined : redact(tail, secrets)
        await options.attempt?.fact('process-finish', {
          executable,
          code,
          signal,
          outputSha256: output.digest('hex'),
          outputBytes: bytes,
          aborted,
          diagnostic,
        })
        if (terminationFailure)
          reject(
            new ToolkitError(
              'termination-unconfirmed',
              `${terminationFailure}. The target lease requires manual recovery.`,
            ),
          )
        else if (aborted) reject(new ToolkitError('interrupted', `${executable} was interrupted`))
        else if (spawnError)
          reject(
            new ToolkitError(
              'process-unavailable',
              `Could not start ${executable}: ${redact(spawnError.message, options.secrets)}`,
            ),
          )
        else if (code !== 0)
          reject(
            new ToolkitError(
              'process-failed',
              `${executable} exited ${code ?? signal}${diagnostic ? '\n' + diagnostic : ''}`,
            ),
          )
        else resolve()
      } catch (error) {
        reject(error)
      }
    })
  })
}
