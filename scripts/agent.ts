import assert from 'node:assert/strict'
import { type ChildProcess } from 'node:child_process'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { chromium } from '@playwright/test'
import { integrateForms } from './fixtures/forms.js'
import { featureMap } from './fixtures/feature-map.js'
import { sourceSnapshot, verifyRuntimeSource } from './fixtures/runtime-source.js'
import { cleanupServices, service } from './fixtures/services.js'
import {
  Blocked,
  command,
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
  type Evidence,
  waitUntil,
} from './fixtures/support.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const storage = path.join(root, '.scratch/verification')
const args = process.argv.slice(2).filter((value) => value !== '--')
const verb = args.shift() ?? 'doctor'
const { values } = parseArgs({
  args,
  options: {
    'cli-only': { type: 'boolean' },
    'installation-only': { type: 'boolean' },
    framework: { type: 'string', default: 'next' },
    database: { type: 'string', default: 'postgres' },
    'package-manager': { type: 'string', default: 'pnpm' },
    feature: { type: 'string', default: 'forms' },
    run: { type: 'string' },
    runtime: { type: 'boolean' },
  },
})
const options = {
  framework: values.framework!,
  database: values.database!,
  packageManager: values['package-manager']!,
  feature: values.feature!,
}
const json = (data: unknown) => console.log(JSON.stringify(data, null, 2))
const valid = (value: string, allowed: string[], label: string) => {
  if (!allowed.includes(value)) throw new Error(`Unsupported ${label}: ${value}`)
}
async function doctor() {
  const bun = await command('bun', ['--version'], { cwd: root, allowFailure: true }).catch(
    () => null,
  )
  const docker = await command('docker', ['info', '--format', '{{.ServerVersion}}'], {
    cwd: root,
    allowFailure: true,
    timeout: 15_000,
  }).catch(() => null)
  const browser = await exists(chromium.executablePath())
  const node = await command('node', ['-p', 'process.versions.node'], {
    cwd: root,
    allowFailure: true,
  }).catch(() => null)
  const nodeVersion = node?.code === 0 ? node.stdout.trim() : null
  const runtime =
    !!nodeVersion &&
    Number(nodeVersion.split('.')[0]) === 24 &&
    Number(nodeVersion.split('.')[1]) >= 15
  return {
    node: nodeVersion,
    nodeSupported: runtime,
    bun: bun?.stdout.trim() ?? null,
    bunPinned: bun?.stdout.trim() === '1.4.2',
    builtCLI: await exists(path.join(root, 'dist/cli.js')),
    browser,
    docker: docker?.code === 0,
    suppliedServices: !!(
      process.env.TOOLKIT_TEST_POSTGRES_URL || process.env.TOOLKIT_TEST_MONGODB_URL
    ),
    ready: runtime && bun?.stdout.trim() === '1.4.2',
  }
}
async function selectedRun() {
  if (values.run) {
    if (!/^\d+-[a-f0-9]{8}$/.test(values.run)) throw new Error('Invalid run identity')
    return path.join(storage, values.run)
  }
  const latest = await Bun.file(path.join(storage, 'latest')).text()
  if (!/^\d+-[a-f0-9]{8}$/.test(latest.trim())) throw new Error('Invalid latest run identity')
  return path.join(storage, latest.trim())
}
async function cleanupWorkspace(directory: string, id: string) {
  const record = await readJson(path.join(directory, 'resources.json')).catch(() => null)
  if (!record?.workspace) return
  const owner = await Bun.file(path.join(record.workspace, '.payload-toolkit-owner'))
    .text()
    .catch(() => null)
  if (owner !== id || !path.basename(record.workspace).startsWith(`payload-toolkit-${id}-`))
    throw new Error('Workspace ownership is uncertain; retained for manual inspection')
  const project = path.join(record.workspace, 'project')
  if (await exists(project)) {
    for (const name of await files(project)) {
      const target = path.join(directory, 'fixture-source', name)
      await fs.mkdir(path.dirname(target), { recursive: true })
      await fs.copyFile(path.join(project, name), target)
    }
  }
  await fs.rm(record.workspace, { recursive: true })
  record.workspaceRemoved = true
  await Bun.write(path.join(directory, 'resources.json'), JSON.stringify(record, null, 2), {
    createPath: false,
  })
}
async function sourceDigest() {
  const sourceFiles = await command('git', ['ls-files', '-c', '-o', '--exclude-standard', '-z'], {
    cwd: root,
  })
  return selectedSourceHash(root, sourceFiles.stdout.split('\0').filter(Boolean))
}
async function verify() {
  if (values['cli-only'] && values['installation-only'])
    throw new Error('Choose only one verification mode')
  valid(options.framework, ['next', 'tanstack'], 'framework')
  valid(options.database, ['postgres', 'mongodb'], 'database')
  valid(options.packageManager, ['pnpm', 'npm', 'bun'], 'package manager')
  const catalog = await readJson(path.join(root, 'registry/registry.json'))
  assert.deepEqual(
    catalog.items.map((item: { name: string }) => item.name).toSorted(),
    Object.keys(featureMap).toSorted(),
    'Every catalog feature needs executable acceptance',
  )
  if (!Object.hasOwn(featureMap, options.feature))
    throw new Error('Feature has no acceptance recipe')
  const id = runId()
  const directory = path.join(storage, id)
  await fs.mkdir(directory, { recursive: true })
  await Bun.write(path.join(storage, 'latest'), id, { createPath: false })
  const git = await command('git', ['rev-parse', 'HEAD'], { cwd: root })
  const status = await command('git', ['status', '--porcelain'], { cwd: root })
  const evidence: Evidence = {
    schemaVersion: 1,
    runId: id,
    source: {
      revision: git.stdout.trim(),
      dirty: !!status.stdout.trim(),
      sha256: 'pending',
    },
    ...options,
    mode: values['cli-only']
      ? 'cli-only'
      : values['installation-only']
        ? 'installation-only'
        : 'runtime',
    node: (await doctor()).node ?? 'unavailable',
    bun: Bun.version,
    startedAt: new Date().toISOString(),
    status: 'running',
    checks: [],
    commands: [],
    identities: {},
    cleanup: { status: 'pending', resources: [] },
  }
  const workspace = await fs.mkdtemp(path.join(tmpdir(), `payload-toolkit-${id}-`))
  await Bun.write(path.join(workspace, '.payload-toolkit-owner'), id, { createPath: false })
  await Bun.write(
    path.join(directory, 'resources.json'),
    JSON.stringify({ runId: id, workspace, services: [] }, null, 2),
    { createPath: false },
  )
  let server: ChildProcess | undefined
  let serverLog = ''
  let serviceURL: string | undefined
  const save = () =>
    Bun.write(path.join(directory, 'evidence.json'), JSON.stringify(evidence, null, 2), {
      createPath: false,
    })
  const run = (
    name: string,
    argv: string[],
    cwd = root,
    env?: NodeJS.ProcessEnv,
    timeout?: number,
  ) => command(name, argv, { cwd, env, timeout, evidence, directory })
  await save()
  try {
    evidence.source.sha256 = await sourceDigest()
    await save()
    const health = await doctor()
    if (!health.ready)
      throw new Blocked('Use Node >=24.15 within major 24 and Bun 1.4.2; run agent:doctor')
    await run('bun', ['run', 'build'])
    const pack = await run('npm', [
      'pack',
      '--ignore-scripts',
      '--json',
      '--pack-destination',
      directory,
    ])
    const packed = JSON.parse(pack.stdout)[0]
    const tarball = path.join(directory, packed.filename)
    evidence.identities.packedPackage = hash(await Bun.file(tarball).bytes())
    evidence.identities.sourceAtPack = await sourceDigest()
    assert.equal(
      evidence.identities.sourceAtPack,
      evidence.source.sha256,
      'Source changed while building/packing; this attempt is unstable and must not be reported green',
    )
    evidence.identities.bootstrap = hash(
      await Bun.file(path.join(root, 'catalog/bootstrap.json')).bytes(),
    )
    evidence.identities.catalog = hash(
      await Bun.file(path.join(root, 'registry/registry.json')).bytes(),
    )
    const item = await readJson(path.join(root, `assets/registry/${options.feature}.json`))
    evidence.identities.registryItem = hash(
      await Bun.file(path.join(root, `assets/registry/${options.feature}.json`)).bytes(),
    )
    for (const file of item.files)
      evidence.identities[`registrySource:${file.target}`] = hash(file.content)
    const inherited = await command('git', ['rev-parse', '--show-toplevel'], {
      cwd: workspace,
      allowFailure: true,
    })
    if (inherited.code === 0) throw new Error('Fixture workspace inherited a Git repository')
    // Query the output installer outside the repository's Bun package-manager policy.
    const managerVersion = await run(options.packageManager, ['--version'], workspace)
    evidence.identities.packageManagerVersion = managerVersion.stdout.trim()
    const consumer = path.join(workspace, 'consumer')
    await fs.mkdir(consumer)
    await Bun.write(
      path.join(consumer, 'package.json'),
      JSON.stringify({ name: 'toolkit-artifact-consumer', private: true, type: 'module' }),
      { createPath: false },
    )
    await run('npm', ['install', '--no-audit', '--no-fund', '--ignore-scripts', tarball], consumer)
    const cli = path.join(consumer, 'node_modules/payload-toolkit/dist/cli.js')
    assert.equal(await exists(cli), true, 'Packed CLI exists in an installed consumer')
    const help = await run(process.execPath, [cli, '--help'], consumer)
    assert.match(help.stdout, /init/)
    assert.match(help.stdout, /add/)
    const invalid = await command(process.execPath, [cli, 'unknown-command', '--json'], {
      cwd: consumer,
      allowFailure: true,
      evidence,
      directory,
    })
    assert.notEqual(invalid.code, 0, 'Unknown command must fail')
    evidence.checks.push({ name: 'packed-cli-help-and-error', status: 'passed' })
    if (values['cli-only']) {
      evidence.status = 'passed'
      return
    }
    if (!values['installation-only'] && !health.browser)
      throw new Blocked(
        'Chromium is missing. Run bun x playwright install chromium; Linux may need --with-deps.',
      )
    if (values['installation-only']) {
      // Code generation needs a config URL, but this mode never connects or drives runtime.
      serviceURL =
        options.database === 'mongodb'
          ? 'mongodb://127.0.0.1:1/toolkit_installation'
          : 'postgres://fixture:fixture@127.0.0.1:1/toolkit_installation'
    } else serviceURL = (await service(options.database, id, directory, evidence)).url
    const project = path.join(workspace, 'project')
    const env = {
      DATABASE_URI: serviceURL,
      DATABASE_URL: serviceURL,
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
        options.framework,
        '--database',
        options.database,
        '--package-manager',
        options.packageManager,
        '--database-url',
        serviceURL,
        '--json',
      ],
      workspace,
      env,
    )
    const init = JSON.parse(initialized.stdout)
    assert.equal(init.installation.status, 'complete')
    evidence.checks.push({ name: 'packed-cli-official-init', status: 'passed' })
    const added = await run(
      process.execPath,
      [cli, 'add', options.feature, '--cwd', project, '--allow-dirty', '--json'],
      workspace,
      env,
    )
    const add = JSON.parse(added.stdout)
    assert.equal(add.installation.status, 'complete')
    await Bun.write(
      path.join(directory, 'installation-results.json'),
      sanitize(JSON.stringify({ init, add }, null, 2)),
      { createPath: false },
    )
    evidence.checks.push({ name: 'packed-cli-forms-installation', status: 'passed' })
    const installationLock =
      options.packageManager === 'pnpm'
        ? 'pnpm-lock.yaml'
        : options.packageManager === 'bun'
          ? 'bun.lock'
          : 'package-lock.json'
    evidence.identities.fixtureLockfile = hash(
      await Bun.file(path.join(project, installationLock)).bytes(),
    )
    const installedVersions: Record<string, string> = {}
    for (const name of ['payload', '@payloadcms/plugin-form-builder']) {
      const dependency = await readJson(path.join(project, 'node_modules', name, 'package.json'))
      assert.equal(typeof dependency.version, 'string', `${name} must be installed`)
      installedVersions[name] = dependency.version
    }
    await Bun.write(
      path.join(directory, 'installed-dependencies.json'),
      JSON.stringify(installedVersions, null, 2),
      { createPath: false },
    )
    evidence.identities.installedDependencies = hash(JSON.stringify(installedVersions))
    evidence.checks.push({
      name: 'packed-cli-lockfile-and-installed-dependencies',
      status: 'passed',
    })
    if (values['installation-only']) {
      evidence.identities.fixtureSource = await treeHash(project)
      evidence.status = 'passed'
      return
    }
    await integrateForms(project, options.framework, evidence)
    await run(options.packageManager, ['run', 'generate:types'], project, env)
    await run(options.packageManager, ['run', 'generate:importmap'], project, env)
    await run(options.packageManager, ['run', 'build'], project, env)
    await run(options.packageManager, ['exec', 'tsc', '--noEmit'], project, env)
    evidence.checks.push({ name: 'fixture-codegen-build-typecheck', status: 'passed' })
    const lock =
      options.packageManager === 'pnpm'
        ? 'pnpm-lock.yaml'
        : options.packageManager === 'bun'
          ? 'bun.lock'
          : 'package-lock.json'
    evidence.identities.fixtureLockfile = hash(await Bun.file(path.join(project, lock)).bytes())
    evidence.identities.fixtureSource = await treeHash(project)
    const preRuntimeSource = await sourceSnapshot(project)
    const previousGenerated = {
      agents: await Bun.file(path.join(project, 'AGENTS.md'))
        .text()
        .catch(() => null),
      nextEnv: await Bun.file(path.join(project, 'next-env.d.ts'))
        .text()
        .catch(() => null),
    }
    const port = await freePort()
    const base = `http://${options.framework === 'next' ? 'localhost' : '127.0.0.1'}:${port}`
    const serverArgs = [
      'run',
      'dev',
      ...(options.packageManager === 'npm' ? ['--'] : []),
      ...(options.framework === 'next'
        ? ['-p', String(port)]
        : ['--port', String(port), '--host', '127.0.0.1']),
    ]
    server = await launch(options.packageManager, serverArgs, {
      cwd: project,
      env: { ...process.env, ...env, PORT: String(port) },
      detached: process.platform !== 'win32',
      shell: false,
    })
    const log = (data: Buffer) => {
      serverLog += data.toString()
      if (serverLog.length > 20_000_000) serverLog = serverLog.slice(-20_000_000)
    }
    server.stdout?.on('data', log)
    server.stderr?.on('data', log)
    await Bun.write(
      path.join(directory, 'server.json'),
      JSON.stringify({ pid: server.pid, runId: id, project: 'project', port }),
      { createPath: false },
    )
    await waitUntil('Payload database-backed REST', async () => {
      if (server?.exitCode !== null) throw new Error('Server exited before readiness')
      const response = await fetch(base + '/api/users/init', { signal: AbortSignal.timeout(5000) })
      return response.status === 200 && typeof (await response.json()).initialized === 'boolean'
    })
    await featureMap[options.feature as keyof typeof featureMap].verify(
      base,
      evidence,
      directory,
      () => serverLog,
    )
    for (const required of featureMap[options.feature as keyof typeof featureMap].requirements) {
      assert.equal(
        evidence.checks.find((check) => check.name === required)?.status,
        'passed',
        `Required feature check did not pass: ${required}`,
      )
    }
    const finalSource = await treeHash(project)
    evidence.identities.fixtureSourceAfterRuntime = finalSource
    await verifyRuntimeSource(
      project,
      options.framework,
      preRuntimeSource,
      previousGenerated,
      directory,
      evidence,
    )
    evidence.status = 'passed'
  } catch (error) {
    evidence.status = error instanceof Blocked ? 'blocked' : 'failed'
    evidence.checks.push({
      name: 'verification',
      status: evidence.status,
      detail: sanitize(error instanceof Error ? error.message : String(error)),
    })
    process.exitCode = evidence.status === 'blocked' ? 2 : 1
  } finally {
    const cleanupErrors: string[] = evidence.commands.some((entry) => entry.cleanup === 'unsafe')
      ? ['Command descendant cleanup is unconfirmed']
      : []
    if (cleanupErrors.length) {
      const record = await readJson(path.join(directory, 'resources.json'))
      record.unsafeProcess = true
      await Bun.write(path.join(directory, 'resources.json'), JSON.stringify(record, null, 2), {
        createPath: false,
      })
    }
    let resources: string[] = []
    if (server) {
      try {
        await stop(server)
      } catch (error) {
        cleanupErrors.push(sanitize(String(error)))
        const record = await readJson(path.join(directory, 'resources.json'))
        record.unsafeProcess = true
        await Bun.write(path.join(directory, 'resources.json'), JSON.stringify(record, null, 2), {
          createPath: false,
        })
      }
    }
    if (serverLog)
      await Bun.write(path.join(directory, 'server.log'), sanitize(serverLog), {
        createPath: false,
      })
    try {
      resources = await cleanupServices(directory, id, evidence)
    } catch (error) {
      cleanupErrors.push(sanitize(String(error)))
    }
    if (cleanupErrors.length === 0) {
      try {
        await cleanupWorkspace(directory, id)
      } catch (error) {
        cleanupErrors.push(sanitize(String(error)))
      }
    }
    evidence.cleanup = {
      status: cleanupErrors.length ? cleanupErrors.join('; ') : 'complete',
      resources,
    }
    if (cleanupErrors.length) {
      evidence.status = 'failed'
      process.exitCode = 1
    }
    evidence.finishedAt = new Date().toISOString()
    await save()
    json({
      runId: id,
      status: evidence.status,
      checks: evidence.checks,
      evidence: path.relative(root, path.join(directory, 'evidence.json')),
    })
  }
}

try {
  if (verb === 'doctor') {
    const result = await doctor()
    json(result)
    if (
      !result.ready ||
      (values.runtime && (!result.browser || (!result.docker && !result.suppliedServices)))
    )
      process.exitCode = 2
  } else if (verb === 'setup') {
    const result = await doctor()
    if (!result.nodeSupported || !result.bunPinned)
      throw new Blocked('Select Node 24.21.0 and Bun 1.4.2 first')
    await command('bun', ['install', '--frozen-lockfile'], { cwd: root })
    await command('bun', ['run', 'build'], { cwd: root })
    json(await doctor())
  } else if (verb === 'verify') await verify()
  else if (verb === 'evidence')
    json(await readJson(path.join(await selectedRun(), 'evidence.json')))
  else if (verb === 'cleanup') {
    const directory = await selectedRun()
    const evidence = await readJson(path.join(directory, 'evidence.json'))
    const resources = await cleanupServices(directory, evidence.runId, evidence)
    const record = await readJson(path.join(directory, 'resources.json'))
    if (record.unsafeProcess)
      throw new Error(
        'Process cleanup remains unconfirmed; inspect actual ownership before manual cleanup',
      )
    if (!record.workspaceRemoved) await cleanupWorkspace(directory, evidence.runId)
    evidence.cleanup = { status: 'complete', resources }
    await Bun.write(path.join(directory, 'evidence.json'), JSON.stringify(evidence, null, 2), {
      createPath: false,
    })
    json(evidence.cleanup)
  } else throw new Error(`Unknown contributor command: ${verb}`)
} catch (error) {
  console.error(sanitize(error instanceof Error ? error.message : String(error)))
  process.exitCode = error instanceof Blocked ? 2 : 1
}
