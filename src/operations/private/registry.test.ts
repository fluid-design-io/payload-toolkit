import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { chmod, lstat, mkdir, mkdtemp, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { test } from 'bun:test'
import { type BundledFeature, type Host, ToolkitError } from '../model.js'
import { describeFeatures, inspectFeatures, installFeatures, prepareFeatures } from './registry.js'

const host: Host = {
  framework: 'next',
  database: 'postgres',
  packageManager: 'npm',
  payloadVersion: '4.0.0-canary.38',
}
const hash = (bytes: string) => createHash('sha256').update(bytes).digest('hex')
const errorCode = (code: string) => (error: unknown) =>
  error instanceof ToolkitError && error.code === code

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'payload-toolkit-registry-test-'))
  await Bun.write(
    join(directory, 'package.json'),
    JSON.stringify({
      name: 'registry-test',
      private: true,
      type: 'module',
      packageManager: 'npm@11.0.0',
    }),
    { createPath: false },
  )
  return directory
}

/** Keeps actual feature source but excludes dependency installation, which has runtime fixtures. */
async function sourceOnly(directory: string): Promise<BundledFeature> {
  const [feature] = await prepareFeatures(['forms'], host)
  assert.ok(feature)
  const item = JSON.parse(await Bun.file(feature.itemPath).text())
  item.dependencies = []
  const bytes = JSON.stringify(item)
  const itemPath = join(directory, 'source-only-item.json')
  await Bun.write(itemPath, bytes, { createPath: false })
  return { ...feature, itemPath, itemSha256: hash(bytes), dependencies: {} }
}

test('catalog choices derive from the authored list and reject incompatible Payload versions', async () => {
  const authored = JSON.parse(
    await Bun.file(new URL('../../../registry/registry.json', import.meta.url)).text(),
  )
  assert.deepEqual(
    (await describeFeatures()).map((item) => item.name),
    authored.items.map((item: { name: string }) => item.name),
  )
  await assert.rejects(prepareFeatures(['missing'], host), errorCode('invalid-item'))
  await assert.rejects(
    prepareFeatures(['forms'], { ...host, payloadVersion: '3.90.2' }),
    errorCode('incompatible'),
  )
  const [feature] = await prepareFeatures(['forms', 'forms'], host)
  assert.equal(feature?.guide, 'docs/payload-toolkit/forms/GUIDE.md')
  assert.equal(feature?.dependencies['@payloadcms/plugin-form-builder'], host.payloadVersion)
})

test('public API installs the qualified TSX and guide at literal root paths and repeat is unchanged', async () => {
  const project = await fixture()
  try {
    await mkdir(join(project, 'src'))
    const feature = await sourceOnly(project)
    assert.equal((await inspectFeatures(project, [feature])).complete, false)
    const files = await installFeatures(project, [feature])
    assert.deepEqual(
      files,
      feature.files.map(({ path, sha256 }) => ({ path, sha256 })),
    )
    assert.equal((await inspectFeatures(project, [feature])).complete, true)
    const guidePath = join(project, feature.guide)
    const before = await lstat(guidePath)
    assert.deepEqual(await installFeatures(project, [feature]), files)
    assert.equal((await lstat(guidePath)).mtimeMs, before.mtimeMs)
    assert.match(
      await Bun.file(join(project, 'payload-toolkit/forms/example-form.tsx')).text(),
      /^['"]use client['"]/,
    )
    await assert.rejects(lstat(join(project, 'src/docs')), { code: 'ENOENT' })
  } finally {
    await rm(project, { recursive: true, force: true })
  }
})

test.skipIf(process.platform === 'win32')(
  'real npm installation saves and repeats an exact dependency without changing config',
  async () => {
    const project = await fixture()
    const packageDirectory = await fixture()
    const oldEnvironment = new Map(
      [
        'npm_config_registry',
        'npm_config_cache',
        'npm_config_save_exact',
        'NPM_CONFIG_SAVE_EXACT',
      ].map((name) => [name, process.env[name]]),
    )
    const server = createServer()
    try {
      const name = 'toolkit-exact-' + hash(project).slice(0, 12)
      const version = '1.2.3'
      await Bun.write(
        join(packageDirectory, 'package.json'),
        JSON.stringify({ name, version, main: 'index.js' }),
        { createPath: false },
      )
      await Bun.write(join(packageDirectory, 'index.js'), 'module.exports = {}\n', {
        createPath: false,
      })
      const packed = await promisify(execFile)(
        'npm',
        ['pack', '--ignore-scripts', '--json', '--pack-destination', packageDirectory],
        { cwd: packageDirectory, encoding: 'utf8' },
      )
      const archive = await Bun.file(
        join(packageDirectory, JSON.parse(packed.stdout)[0].filename),
      ).bytes()
      const requests: string[] = []
      let base = ''
      server.on('request', (request, response) => {
        requests.push(request.url || '')
        if (request.url === '/archive.tgz') {
          response.writeHead(200, { 'content-type': 'application/octet-stream' })
          response.end(archive)
        } else if (request.url === '/' + name) {
          response.writeHead(200, { 'content-type': 'application/json' })
          response.end(
            JSON.stringify({
              name,
              'dist-tags': { latest: version },
              versions: {
                [version]: {
                  name,
                  version,
                  dist: {
                    tarball: base + '/archive.tgz',
                    shasum: createHash('sha1').update(archive).digest('hex'),
                  },
                },
              },
            }),
          )
        } else {
          response.writeHead(404)
          response.end()
        }
      })
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject)
        server.listen(0, '127.0.0.1', resolve)
      })
      const address = server.address()
      assert.ok(address && typeof address === 'object')
      base = `http://127.0.0.1:${address.port}`
      process.env.npm_config_registry = base
      process.env.npm_config_cache = join(packageDirectory, 'npm-cache')
      process.env.npm_config_save_exact = 'false'
      process.env.NPM_CONFIG_SAVE_EXACT = 'false'
      const config = 'save-exact=false\n'
      await Bun.write(join(project, '.npmrc'), config, { createPath: false })
      const feature = await sourceOnly(project)
      const item = JSON.parse(await Bun.file(feature.itemPath).text())
      item.dependencies = [`${name}@${version}`]
      const bytes = JSON.stringify(item)
      await Bun.write(feature.itemPath, bytes, { createPath: false })
      const qualified = { ...feature, itemSha256: hash(bytes), dependencies: { [name]: version } }
      const installed = await installFeatures(project, [qualified])
      const manifest = JSON.parse(await Bun.file(join(project, 'package.json')).text())
      const dependency = JSON.parse(
        await Bun.file(join(project, 'node_modules', name, 'package.json')).text(),
      )
      assert.equal(manifest.dependencies[name], version)
      assert.equal(dependency.version, version)
      assert.equal(await Bun.file(join(project, '.npmrc')).text(), config)
      assert.equal(process.env.npm_config_save_exact, 'false')
      assert.equal(process.env.NPM_CONFIG_SAVE_EXACT, 'false')
      assert.equal((await inspectFeatures(project, [qualified])).complete, true)
      const firstRequests = requests.length
      assert.deepEqual(await installFeatures(project, [qualified]), installed)
      assert.equal(
        requests.length,
        firstRequests,
        'identical installation does not invoke npm again',
      )
      assert.ok(requests.includes('/archive.tgz'), 'npm fetched the owned fixture package')
    } finally {
      for (const [name, value] of oldEnvironment) {
        if (value === undefined) delete process.env[name]
        else process.env[name] = value
      }
      if (server.listening)
        await new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        )
      await rm(project, { recursive: true, force: true })
      await rm(packageDirectory, { recursive: true, force: true })
    }
  },
)

test('a divergent file blocks the whole installation before any missing sibling is written', async () => {
  const project = await fixture()
  try {
    const feature = await sourceOnly(project)
    const file = feature.files[0]!
    await mkdir(dirname(join(project, file.path)), { recursive: true })
    await Bun.write(join(project, file.path), 'developer changes\n', { createPath: false })
    await assert.rejects(installFeatures(project, [feature]), errorCode('collision'))
    assert.equal(await Bun.file(join(project, file.path)).text(), 'developer changes\n')
    await assert.rejects(lstat(join(project, feature.guide)), { code: 'ENOENT' })
  } finally {
    await rm(project, { recursive: true, force: true })
  }
})

test('registry paths refuse traversal and symlink ancestors', async () => {
  const project = await fixture()
  const outside = await fixture()
  try {
    const feature = await sourceOnly(project)
    const changed = { ...feature, files: [{ ...feature.files[0]!, path: '../outside.ts' }] }
    await assert.rejects(inspectFeatures(project, [changed]), errorCode('invalid-item'))
    await symlink(outside, join(project, 'payload-toolkit'), 'dir')
    await assert.rejects(installFeatures(project, [feature]), errorCode('collision'))
    await assert.rejects(lstat(join(outside, 'forms/plugin.ts')), { code: 'ENOENT' })
  } finally {
    await rm(project, { recursive: true, force: true })
    await rm(outside, { recursive: true, force: true })
  }
})

test('complete source is insufficient when an exact installed dependency is absent or wrong', async () => {
  const project = await fixture()
  try {
    const feature = await sourceOnly(project)
    await installFeatures(project, [feature])
    const dependency = { ...feature, dependencies: { 'fixture-dependency': '1.0.0' } }
    await Bun.write(
      join(project, 'package.json'),
      JSON.stringify({ name: 'registry-test', dependencies: dependency.dependencies }),
      { createPath: false },
    )
    assert.equal((await inspectFeatures(project, [dependency])).complete, false)
    const installed = join(project, 'node_modules/fixture-dependency')
    await mkdir(installed, { recursive: true })
    await Bun.write(join(installed, 'index.js'), 'module.exports = {}\n', { createPath: false })
    await Bun.write(
      join(installed, 'package.json'),
      JSON.stringify({ name: 'fixture-dependency', version: '0.9.0', exports: './index.js' }),
      { createPath: false },
    )
    assert.equal((await inspectFeatures(project, [dependency])).complete, false)
    await Bun.write(
      join(installed, 'package.json'),
      JSON.stringify({ name: 'fixture-dependency', version: '1.0.0', exports: './index.js' }),
      { createPath: false },
    )
    assert.equal((await inspectFeatures(project, [dependency])).complete, true)
  } finally {
    await rm(project, { recursive: true, force: true })
  }
})

test('changed item bytes fail before invoking shadcn', async () => {
  const project = await fixture()
  try {
    const feature = await sourceOnly(project)
    await Bun.write(feature.itemPath, '{}', { createPath: false })
    await assert.rejects(installFeatures(project, [feature]), errorCode('invalid-item'))
    await assert.rejects(lstat(join(project, feature.guide)), { code: 'ENOENT' })
  } finally {
    await rm(project, { recursive: true, force: true })
  }
})

test('invalid compatibility metadata is rejected from a fetched item before mutation', async () => {
  const project = await fixture()
  try {
    const root = fileURLToPath(new URL('../../../', import.meta.url))
    const copiedModule = join(project, 'src/operations/private/registry.ts')
    await mkdir(dirname(copiedModule), { recursive: true })
    await Bun.write(copiedModule, Bun.file(new URL('./registry.ts', import.meta.url)), {
      createPath: false,
    })
    await Bun.write(
      join(dirname(copiedModule), 'attempts.ts'),
      Bun.file(new URL('./attempts.ts', import.meta.url)),
      { createPath: false },
    )
    await Bun.write(
      join(project, 'src/operations/model.ts'),
      Bun.file(new URL('../model.ts', import.meta.url)),
      { createPath: false },
    )
    await Bun.write(
      join(dirname(copiedModule), 'external-registry.ts'),
      Bun.file(new URL('./external-registry.ts', import.meta.url)),
      { createPath: false },
    )
    await symlink(join(root, 'node_modules'), join(project, 'node_modules'), 'dir')
    const assets = join(project, 'assets/registry')
    await mkdir(assets, { recursive: true })
    const catalog = JSON.parse(await Bun.file(join(root, 'assets/registry/catalog.json')).text())
    const item = JSON.parse(await Bun.file(join(root, 'assets/registry/forms.json')).text())
    item.meta.payloadToolkit.hostWiring = { modify: 'payload.config.ts' }
    const bytes = JSON.stringify(item)
    catalog.items[0].itemSha256 = hash(bytes)
    await Bun.write(join(assets, 'catalog.json'), JSON.stringify(catalog), { createPath: false })
    await Bun.write(join(assets, 'forms.json'), bytes, { createPath: false })
    const copied = await import(copiedModule)
    await assert.rejects(
      copied.prepareFeatures(['forms'], host),
      (error: unknown) =>
        error instanceof Error && error.message.includes('Invalid Payload metadata'),
    )
  } finally {
    await rm(project, { recursive: true, force: true })
  }
})

test.skipIf(process.platform === 'win32')(
  'aborting installation stops the worker and its package-process descendants',
  async () => {
    const project = await fixture()
    const previousPath = process.env.PATH
    try {
      const feature = await sourceOnly(project)
      const item = JSON.parse(await Bun.file(feature.itemPath).text())
      item.dependencies = ['fixture-wait@1.0.0']
      const bytes = JSON.stringify(item)
      await Bun.write(feature.itemPath, bytes, { createPath: false })
      const dependency = {
        ...feature,
        itemSha256: hash(bytes),
        dependencies: { 'fixture-wait': '1.0.0' },
      }
      const bin = join(project, 'bin')
      await mkdir(bin)
      const heartbeat = join(project, 'heartbeat.txt')
      const fakeNpm = `#!/usr/bin/env bun\nimport {spawn} from 'node:child_process';\nimport fs from 'node:fs';\nfs.writeFileSync(${JSON.stringify(join(project, 'started'))},'yes');\nspawn(process.execPath,['-e',${JSON.stringify(`const fs=require('node:fs');process.on('SIGTERM',()=>{});setInterval(()=>fs.appendFileSync(${JSON.stringify(heartbeat)},'x'),25)`)}],{stdio:'ignore'});\nsetInterval(()=>{},1000);\n`
      await Bun.write(join(bin, 'npm'), fakeNpm, { createPath: false })
      await chmod(join(bin, 'npm'), 0o755)
      process.env.PATH = `${bin}:${previousPath}`
      const controller = new AbortController()
      const installed = installFeatures(project, [dependency], controller.signal).then(
        () => null,
        (error) => error,
      )
      let started = false
      for (let index = 0; index < 150; index++) {
        try {
          await lstat(heartbeat)
          started = true
          break
        } catch {
          await delay(50)
        }
      }
      controller.abort()
      const outcome = await installed
      assert.ok(errorCode('interrupted')(outcome), String(outcome))
      assert.equal(started, true, 'Controlled package process should start before cancellation')
      const stopped = await Bun.file(heartbeat).text()
      await delay(150)
      assert.equal(await Bun.file(heartbeat).text(), stopped)
    } finally {
      process.env.PATH = previousPath
      await rm(project, { recursive: true, force: true })
    }
  },
)
