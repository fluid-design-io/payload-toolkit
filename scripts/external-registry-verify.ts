import assert from 'node:assert/strict'
import type { ChildProcess } from 'node:child_process'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { chromium } from '@playwright/test'
import {
  heroSplitIdentities,
  heroSplitNamespace,
  heroSplitURL,
  integrateHeroSplit,
  verifyHeroSplit,
} from './fixtures/external-registry.js'
import { cleanupServices, service } from './fixtures/services.js'
import {
  Blocked,
  command,
  type Evidence,
  exists,
  files,
  freePort,
  hash,
  launch,
  readJson,
  runId,
  sanitize,
  selectedSourceHash,
  stop,
  treeHash,
  waitUntil,
} from './fixtures/support.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const { values } = parseArgs({
  args: process.argv.slice(2).filter((arg) => arg !== '--'),
  options: { runtime: { type: 'boolean', default: false } },
})
const id = runId()
const storage = path.join(root, '.scratch/verification')
const directory = path.join(storage, id)
await fs.mkdir(directory, { recursive: true })
await Bun.write(path.join(storage, 'latest'), id, { createPath: false })
const evidence: Evidence = {
  schemaVersion: 1,
  runId: id,
  source: { revision: 'pending', dirty: true, sha256: 'pending' },
  framework: 'next',
  database: 'postgres',
  packageManager: 'pnpm',
  mode: values.runtime ? 'runtime' : 'installation-only',
  node: 'pending',
  bun: Bun.version,
  startedAt: new Date().toISOString(),
  status: 'running',
  checks: [],
  commands: [],
  identities: { externalReference: heroSplitURL },
  cleanup: { status: 'pending', resources: [] },
}
const workspace = await fs.mkdtemp(path.join(tmpdir(), `payload-toolkit-${id}-`))
await Bun.write(path.join(workspace, '.payload-toolkit-owner'), id, { createPath: false })
await Bun.write(
  path.join(directory, 'resources.json'),
  JSON.stringify({ runId: id, workspace, services: [] }, null, 2),
  { createPath: false },
)
const project = path.join(workspace, 'project')
let server: ChildProcess | undefined
let serverLog = ''
const save = () =>
  Bun.write(path.join(directory, 'evidence.json'), JSON.stringify(evidence, null, 2), {
    createPath: false,
  })
const run = (name: string, args: string[], cwd = root, env?: NodeJS.ProcessEnv) =>
  command(name, args, { cwd, env, evidence, directory })
async function sourceDigest() {
  const tracked = await command('git', ['ls-files', '-c', '-o', '--exclude-standard', '-z'], {
    cwd: root,
  })
  return selectedSourceHash(root, tracked.stdout.split('\0').filter(Boolean))
}
async function retainAndRemoveWorkspace() {
  assert.equal(await Bun.file(path.join(workspace, '.payload-toolkit-owner')).text(), id)
  assert.ok(path.basename(workspace).startsWith(`payload-toolkit-${id}-`))
  if (await exists(project)) {
    for (const file of await files(project)) {
      const target = path.join(directory, 'fixture-source', file)
      await fs.mkdir(path.dirname(target), { recursive: true })
      if (/(?:^|[/.])env(?:[.]|$)|[.]env$/.test(file)) {
        await Bun.write(target, sanitize(await Bun.file(path.join(project, file)).text()), {
          createPath: false,
        })
        evidence.identities.retainedEnvironment = 'sanitized'
      } else await fs.copyFile(path.join(project, file), target)
    }
  }
  await fs.rm(workspace, { recursive: true })
  const resources = await readJson(path.join(directory, 'resources.json'))
  resources.workspaceRemoved = true
  await Bun.write(path.join(directory, 'resources.json'), JSON.stringify(resources, null, 2), {
    createPath: false,
  })
}
await save()
try {
  evidence.source.revision = (await run('git', ['rev-parse', 'HEAD'])).stdout.trim()
  evidence.source.dirty = !!(await run('git', ['status', '--porcelain'])).stdout.trim()
  evidence.source.sha256 = await sourceDigest()
  evidence.node = (await run('node', ['-p', 'process.versions.node'])).stdout.trim()
  if (evidence.node !== '24.21.0' || Bun.version !== '1.4.2')
    throw new Blocked('Select Node 24.21.0 and Bun 1.4.2 before external acceptance')
  evidence.identities.packageManagerVersion = (
    await run('pnpm', ['--version'], workspace)
  ).stdout.trim()
  if (evidence.identities.packageManagerVersion !== '10.34.6')
    throw new Blocked('External acceptance requires pnpm 10.34.6')
  if (values.runtime && !(await exists(chromium.executablePath())))
    throw new Blocked('Install Chromium with bun x playwright install chromium')
  const inherited = await command('git', ['rev-parse', '--show-toplevel'], {
    cwd: workspace,
    allowFailure: true,
  })
  assert.notEqual(inherited.code, 0, 'Acceptance workspace does not inherit a repository')
  await run('bun', ['run', 'build'])
  const packed = JSON.parse(
    (await run('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', directory]))
      .stdout,
  )[0]
  const tarball = path.join(directory, packed.filename)
  evidence.identities.packedPackage = hash(await Bun.file(tarball).bytes())
  evidence.identities.sourceAtPack = await sourceDigest()
  assert.equal(
    evidence.identities.sourceAtPack,
    evidence.source.sha256,
    'Source changed during packing. Retain this failed attempt and rerun after edits settle.',
  )
  evidence.identities.bootstrap = hash(
    await Bun.file(path.join(root, 'catalog/bootstrap.json')).bytes(),
  )
  evidence.identities.catalog = hash(
    await Bun.file(path.join(root, 'assets/registry/catalog.json')).bytes(),
  )
  const consumer = path.join(workspace, 'consumer')
  await fs.mkdir(consumer)
  await Bun.write(
    path.join(consumer, 'package.json'),
    JSON.stringify({ name: 'external-registry-consumer', private: true, type: 'module' }),
    { createPath: false },
  )
  await run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', tarball], consumer)
  const cli = path.join(consumer, 'node_modules/payload-toolkit/dist/cli.js')
  assert.equal(await exists(cli), true)
  const databaseURL = values.runtime
    ? (await service('postgres', id, directory, evidence)).url
    : 'postgres://fixture:fixture@127.0.0.1:1/toolkit_installation'
  const env = {
    DATABASE_URI: databaseURL,
    DATABASE_URL: databaseURL,
    PAYLOAD_SECRET: `fixture-${id}-${hash(id)}`,
    PAYLOAD_TELEMETRY_DISABLED: '1',
  }
  const initialized = await run(
    process.execPath,
    [
      cli,
      'init',
      project,
      '--framework',
      'next',
      '--database',
      'postgres',
      '--template',
      'minimal',
      '--package-manager',
      'pnpm',
      '--database-url',
      databaseURL,
      '--json',
    ],
    workspace,
    env,
  )
  const init = JSON.parse(initialized.stdout)
  assert.equal(init.installation.status, 'complete')
  evidence.checks.push({ name: 'external-packed-official-init', status: 'passed' })
  const payloadBefore = (await readJson(path.join(project, 'node_modules/payload/package.json')))
    .version
  const added = JSON.parse(
    (
      await run(
        process.execPath,
        [cli, 'add', heroSplitURL, '--cwd', project, '--allow-dirty', '--json'],
        workspace,
        env,
      )
    ).stdout,
  )
  assert.equal(added.installation.status, 'complete')
  await Bun.write(
    path.join(directory, 'installation-results.json'),
    sanitize(JSON.stringify({ init, added }, null, 2)),
    { createPath: false },
  )
  const preparation = path.join(path.dirname(added.receipt), 'preparation')
  for (const file of await fs.readdir(preparation)) {
    if (!/^(?:\d+-(?:item|frozen)|plan)\.json$/.test(file)) continue
    const target = path.join(directory, 'external-graph', file)
    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.copyFile(path.join(preparation, file), target)
    evidence.identities[`frozenGraph:${file}`] = hash(await Bun.file(target).bytes())
  }
  const identities = await heroSplitIdentities(project)
  for (const [file, digest] of Object.entries(identities))
    evidence.identities[`installedExternalSource:${file}`] = digest
  assert.equal(
    await exists(path.join(project, 'src/components/ui/badge.tsx')),
    true,
    'shadcn installs the badge dependency',
  )
  assert.equal(
    (await readJson(path.join(project, 'node_modules/payload/package.json'))).version,
    payloadBefore,
    'External installation preserves the Payload version',
  )
  assert.equal(added.agent.status, 'not-requested', 'Installation does not launch a model')
  assert.equal(
    typeof added.agent.prompt,
    'string',
    'No-guide external installation returns a copyable integration handoff',
  )
  assert.match(added.agent.prompt, /hero-split|HeroSplit/)
  evidence.checks.push({
    name: 'external-live-source-dependency-and-handoff',
    status: 'passed',
    detail:
      'Live Hero Split without Payload Toolkit metadata or GUIDE. Badge is installed and Payload version preserved. No model runs.',
  })
  const repeated = JSON.parse(
    (
      await run(
        process.execPath,
        [cli, 'add', heroSplitNamespace, '--cwd', project, '--allow-dirty', '--json'],
        workspace,
        env,
      )
    ).stdout,
  )
  assert.equal(repeated.installation.status, 'complete')
  assert.deepEqual(
    await heroSplitIdentities(project),
    identities,
    'Namespace repeat leaves installed upstream files unchanged',
  )
  evidence.checks.push({ name: 'external-live-namespace-repeat', status: 'passed' })
  const mockBin = path.join(workspace, 'mock-agent-bin')
  await fs.mkdir(mockBin)
  const mockSource = path.join(mockBin, 'mock-codex.ts')
  const mockPrompt = path.join(directory, 'mock-agent-prompt.txt')
  await Bun.write(
    mockSource,
    `const prompt = await Bun.stdin.text(); await Bun.write(process.env.TOOLKIT_MOCK_PROMPT!, prompt); console.log(JSON.stringify({ type: 'turn.completed' })); process.exit(Number(process.env.TOOLKIT_MOCK_EXIT || '0'));`,
    { createPath: false },
  )
  await run(
    'bun',
    [
      'build',
      '--compile',
      mockSource,
      '--outfile',
      path.join(mockBin, process.platform === 'win32' ? 'codex.exe' : 'codex'),
    ],
    workspace,
  )
  evidence.identities.mockAgentBinary = hash(
    await Bun.file(
      path.join(mockBin, process.platform === 'win32' ? 'codex.exe' : 'codex'),
    ).bytes(),
  )
  const mockEnv = {
    ...env,
    PATH: mockBin + path.delimiter + (process.env.PATH || process.env.Path || ''),
    TOOLKIT_MOCK_PROMPT: mockPrompt,
  }
  const mocked = JSON.parse(
    (
      await run(
        process.execPath,
        [cli, 'add', heroSplitURL, '--cwd', project, '--allow-dirty', '--codex', '--json'],
        workspace,
        mockEnv,
      )
    ).stdout,
  )
  assert.equal(mocked.installation.status, 'complete')
  assert.equal(mocked.agent.status, 'completed', 'Owned mock process completed')
  assert.equal(
    mocked.verification.status,
    'not-run',
    'Mock process completion is not runtime proof',
  )
  const captured = await Bun.file(mockPrompt).text()
  assert.match(captured, /HeroSplit/)
  assert.match(captured, new RegExp(payloadBefore.replaceAll('.', '\\.')))
  assert.match(captured, /do not downgrade/i)
  const failedAgent = await command(
    process.execPath,
    [
      cli,
      'add',
      heroSplitURL,
      '--cwd',
      project,
      '--allow-dirty',
      '--codex',
      '--require-agent-success',
      '--json',
    ],
    {
      cwd: workspace,
      env: { ...mockEnv, TOOLKIT_MOCK_EXIT: '1' },
      evidence,
      directory,
      allowFailure: true,
    },
  )
  const mockFailure = JSON.parse(failedAgent.stdout)
  assert.equal(failedAgent.code, 1)
  assert.equal(
    mockFailure.installation.status,
    'complete',
    'Mock failure preserves source installation outcome',
  )
  assert.equal(mockFailure.agent.status, 'failed')
  assert.equal(mockFailure.verification.status, 'not-run')
  evidence.checks.push({
    name: 'external-packed-mock-agent-outcomes',
    status: 'passed',
    detail:
      'Owned compiled mock receives contextual prompt. Process success and failure remain separate from source installation and runtime verification. No model account is used.',
  })
  const editedFile = path.join(project, 'src/blocks/HeroSplit/config.ts')
  const original = await Bun.file(editedFile).text()
  const edited = original + '\n// Owned acceptance edit.\n'
  let collision
  try {
    await Bun.write(editedFile, edited, { createPath: false })
    const blocked = await command(
      process.execPath,
      [cli, 'add', heroSplitURL, '--cwd', project, '--allow-dirty', '--json'],
      { cwd: workspace, env, evidence, directory, allowFailure: true },
    )
    collision = JSON.parse(blocked.stdout)
    assert.equal(blocked.code, 2)
    assert.equal(collision.installation.status, 'blocked')
    assert.match(collision.installation.reason, /collision|differ|modified|overwrite/i)
    assert.equal(
      await Bun.file(editedFile).text(),
      edited,
      'Packed installer preserves developer-edited upstream source',
    )
  } finally {
    await Bun.write(editedFile, original, { createPath: false })
  }
  evidence.checks.push({ name: 'external-packed-edited-file-collision', status: 'passed' })
  await Bun.write(
    path.join(directory, 'installation-results.json'),
    sanitize(JSON.stringify({ init, added, repeated, mocked, mockFailure, collision }, null, 2)),
    { createPath: false },
  )
  evidence.identities.fixtureLockfile = hash(
    await Bun.file(path.join(project, 'pnpm-lock.yaml')).bytes(),
  )
  evidence.identities.installedPayload = payloadBefore
  if (values.runtime) {
    await integrateHeroSplit(project, evidence)
    await run('pnpm', ['add', 'class-variance-authority@0.7.1'], project, env)
    await run('pnpm', ['run', 'generate:types'], project, env)
    await run('pnpm', ['run', 'generate:importmap'], project, env)
    assert.match(
      await Bun.file(path.join(project, 'src/payload-types.ts')).text(),
      /export interface HeroSplitBlock/,
    )
    await run('pnpm', ['run', 'build'], project, env)
    await run('pnpm', ['exec', 'tsc', '--noEmit'], project, env)
    evidence.checks.push({ name: 'external-fixture-codegen-build-typecheck', status: 'passed' })
    const port = await freePort()
    const base = `http://localhost:${port}`
    server = await launch('pnpm', ['run', 'dev', '-p', String(port)], {
      cwd: project,
      env: { ...process.env, ...env, PORT: String(port) },
      detached: process.platform !== 'win32',
      shell: false,
    })
    const collect = (data: Buffer) => {
      serverLog = (serverLog + data.toString()).slice(-20_000_000)
    }
    server.stdout?.on('data', collect)
    server.stderr?.on('data', collect)
    await Bun.write(
      path.join(directory, 'server.json'),
      JSON.stringify({ pid: server.pid, runId: id, project: 'project', port }),
      { createPath: false },
    )
    await waitUntil('database-backed native Payload REST', async () => {
      if (server?.exitCode !== null) throw new Error('Owned server exited before readiness')
      const response = await fetch(base + '/api/users/init', { signal: AbortSignal.timeout(5000) })
      return response.status === 200 && typeof (await response.json()).initialized === 'boolean'
    })
    await verifyHeroSplit(base, evidence, directory)
    assert.deepEqual(
      await heroSplitIdentities(project),
      identities,
      'Runtime leaves installed upstream block source unchanged',
    )
  }
  evidence.identities.fixtureLockfile = hash(
    await Bun.file(path.join(project, 'pnpm-lock.yaml')).bytes(),
  )
  evidence.identities.fixtureSource = await treeHash(project)
  evidence.status = 'passed'
} catch (error) {
  evidence.status = error instanceof Blocked ? 'blocked' : 'failed'
  evidence.checks.push({
    name: 'external-verification',
    status: evidence.status,
    detail: sanitize(error instanceof Error ? error.message : String(error)),
  })
  process.exitCode = evidence.status === 'blocked' ? 2 : 1
} finally {
  const errors: string[] = evidence.commands.some((entry) => entry.cleanup === 'unsafe')
    ? ['Command descendants have unconfirmed cleanup']
    : []
  if (server) {
    try {
      await stop(server)
    } catch (error) {
      errors.push(sanitize(String(error)))
    }
  }
  if (serverLog)
    await Bun.write(path.join(directory, 'server.log'), sanitize(serverLog), { createPath: false })
  let removed: string[] = []
  try {
    removed = await cleanupServices(directory, id, evidence)
  } catch (error) {
    errors.push(sanitize(String(error)))
  }
  if (!errors.length) {
    try {
      await retainAndRemoveWorkspace()
    } catch (error) {
      errors.push(sanitize(String(error)))
    }
  }
  if (errors.length) {
    const resources = await readJson(path.join(directory, 'resources.json'))
    resources.unsafeProcess = true
    await Bun.write(path.join(directory, 'resources.json'), JSON.stringify(resources, null, 2), {
      createPath: false,
    })
    evidence.status = 'failed'
    process.exitCode = 1
  }
  evidence.cleanup = { status: errors.length ? errors.join('; ') : 'complete', resources: removed }
  evidence.finishedAt = new Date().toISOString()
  await save()
  console.log(
    JSON.stringify(
      {
        runId: id,
        status: evidence.status,
        checks: evidence.checks,
        evidence: path.relative(root, path.join(directory, 'evidence.json')),
      },
      null,
      2,
    ),
  )
}
