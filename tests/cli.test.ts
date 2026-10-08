import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import test from 'node:test'
import { z } from 'zod'

const exec = promisify(execFile)
const bin = resolve('dist/cli.js')
async function invoke(args: string[], cwd?: string) {
  try {
    const result = await exec(process.execPath, [bin, ...args], { cwd, timeout: 20000 })
    return { ...result, code: 0 }
  } catch (error) {
    if (error instanceof Error && 'stdout' in error && 'stderr' in error && 'code' in error) {
      return { stdout: String(error.stdout), stderr: String(error.stderr), code: error.code }
    }
    throw error
  }
}
const report = z.object({
  installation: z.object({ status: z.string(), reason: z.string() }),
  agent: z.object({ status: z.string() }),
  verification: z.object({ status: z.string() }),
  exitCode: z.number(),
})

test('delivered CLI exposes init/add and rejects missing unattended choices without mutation', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'payload-cli-'))
  try {
    const help = await invoke(['--help'])
    assert.equal(help.code, 0)
    assert.match(help.stdout, /init .*\[directory\]/)
    assert.match(help.stdout, /add .*<features/)
    const missing = await invoke(['init', 'demo', '--json'], directory)
    assert.equal(missing.code, 2)
    const result = report.parse(JSON.parse(missing.stdout))
    assert.equal(result.installation.status, 'blocked')
    assert.match(result.installation.reason, /Unattended init requires/)
    assert.equal(result.verification.status, 'not-run')
    assert.deepEqual(await readdir(directory), [])
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('conflicting agent flags and strict mode without an agent refuse before installation', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'payload-flags-'))
  try {
    await writeFile(join(directory, 'marker'), 'developer work')
    for (const flags of [['--codex', '--claude'], ['--require-agent-success']]) {
      const result = await invoke(['add', 'forms', '--cwd', directory, '--json', ...flags])
      assert.equal(result.code, 2)
      const parsed = report.parse(JSON.parse(result.stdout))
      assert.equal(parsed.installation.status, 'blocked')
      assert.match(
        parsed.installation.reason,
        flags.length === 2 ? /either --codex or --claude/ : /requires --codex or --claude/,
      )
    }
    assert.equal(await readFile(join(directory, 'marker'), 'utf8'), 'developer work')
    assert.deepEqual(await readdir(directory), ['marker'])
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('minimal explains upstream ownership and refuses a feature/agent mismatch', async () => {
  const help = await invoke(['init', '--help'])
  assert.equal(help.code, 0)
  assert.match(help.stdout, /official Payload starter/)
  const failure = await invoke([
    'init',
    'demo',
    '--framework',
    'next',
    '--database',
    'postgres',
    '--template',
    'minimal',
    '--package-manager',
    'pnpm',
    '--features',
    'forms',
    '--json',
  ])
  assert.equal(failure.code, 2)
  assert.match(
    report.parse(JSON.parse(failure.stdout)).installation.reason,
    /requires --template custom/,
  )
})
