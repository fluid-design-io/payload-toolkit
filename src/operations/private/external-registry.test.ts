import assert from 'node:assert/strict'
import { chmod, mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, test } from 'bun:test'
import { add } from '../index.js'
import type { Result } from '../model.js'
const payloadVersion = '4.0.0-canary.38'
const owned: string[] = []
afterEach(async () => {
  for (const directory of owned.splice(0)) await rm(directory, { recursive: true, force: true })
})
async function fixture() {
  const directory = await mkdtemp(path.join(tmpdir(), 'toolkit-external-test-'))
  owned.push(directory)
  const project = path.join(directory, 'project')
  await mkdir(project)
  await writeFile(
    path.join(project, 'package.json'),
    JSON.stringify({
      name: 'fixture',
      type: 'module',
      private: true,
      packageManager: 'npm@11.0.0',
      dependencies: {
        payload: payloadVersion,
        '@payloadcms/db-postgres': payloadVersion,
        next: '16.2.4',
        react: '19.2.4',
        'react-dom': '19.2.4',
      },
    }),
  )
  await writeFile(
    path.join(project, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: { baseUrl: '.', paths: { '@/*': ['./src/*'] }, jsx: 'preserve' },
    }),
  )
  await mkdir(path.join(project, 'src'))
  return { project, directory }
}
function registry(items: Record<string, unknown>) {
  const hits: string[] = []
  const server = Bun.serve({
    port: 0,
    fetch(request) {
      const endpoint = new URL(request.url).pathname
      hits.push(endpoint)
      const item = items[endpoint]
      return item ? Response.json(item) : new Response('missing', { status: 404 })
    },
  })
  return { server, hits, url: (endpoint: string) => `http://localhost:${server.port}${endpoint}` }
}
const install = async (directory: string, features: string[]) => {
  const result = await add({
    directory,
    features,
    allowDirty: true,
    agent: 'none',
    requireAgentSuccess: false,
  })
  owned.push(path.dirname(result.receipt))
  return result
}
function installed(result: Result) {
  assert.equal(
    result.installation.status,
    'complete',
    result.installation.status !== 'complete' ? result.installation.reason : '',
  )
  return result.installation
}
function blocked(result: Result, message: RegExp) {
  assert.equal(result.installation.status, 'blocked')
  assert.match(result.installation.reason, message)
}
const source = (name: string, target: string, content = 'export const block = true\n') => ({
  name,
  type: 'registry:item',
  files: [{ path: target, target: `~/${target}`, type: 'registry:file', content }],
})
test('external URL without metadata or guide installs frozen source and returns generic handoff and retained provenance', async () => {
  const ctx = await fixture()
  const endpoint = registry({ '/one.json': source('one', 'src/one.ts') })
  try {
    const result = await install(ctx.project, [endpoint.url('/one.json')])
    installed(result)
    assert.equal(
      await readFile(path.join(ctx.project, 'src/one.ts'), 'utf8'),
      'export const block = true\n',
    )
    assert.equal(endpoint.hits.filter((hit) => hit === '/one.json').length, 1)
    assert.equal(result.agent.status, 'not-requested')
    if ('prompt' in result.agent) {
      assert.match(result.agent.prompt!, /missing prerequisites/)
      assert.match(result.agent.prompt!, /4.0.0-canary.38/)
    }
    assert.ok(result.advisories.length)
    assert.equal(
      installed(await install(ctx.project, [endpoint.url('/one.json')])).disposition,
      'already-present',
    )
    const evidence = JSON.parse(
      await readFile(path.join(path.dirname(result.receipt), 'preparation/plan.json'), 'utf8'),
    )
    assert.equal(evidence.provenance.items.length, 1)
    endpoint.server.reload({
      fetch: () => Response.json(source('one', 'src/one.ts', 'export const drift = true\n')),
    })
    blocked(await install(ctx.project, [endpoint.url('/one.json')]), /Existing file differs/)
  } finally {
    endpoint.server.stop(true)
  }
}, 30000)
test('configured namespace, shared source, block/UI transforms and stylesheet merges repeat without overwrite', async () => {
  const ctx = await fixture()
  const endpoint = registry({})
  const badge = {
    name: 'badge',
    type: 'registry:ui',
    files: [
      {
        path: 'ui/badge.tsx',
        type: 'registry:ui',
        content: 'export function Badge() { return <span>Badge</span> }\n',
      },
    ],
  }
  const root = {
    name: 'hero',
    type: 'registry:block',
    registryDependencies: [endpoint.url('/badge.json')],
    cssVars: { light: { 'community-accent': 'red' } },
    files: [
      {
        path: 'blocks/Hero/component.tsx',
        type: 'registry:block',
        target: '~/src/blocks/Hero/component.tsx',
        content:
          'import { Badge } from "@/components/ui/badge"\nexport const Hero = () => <Badge />\n',
      },
    ],
  }
  endpoint.server.reload({
    fetch(request) {
      const name = new URL(request.url).pathname
      return Response.json(name === '/badge.json' ? badge : root)
    },
  })
  await writeFile(
    path.join(ctx.project, 'components.json'),
    JSON.stringify({
      style: 'new-york',
      rsc: true,
      tsx: true,
      tailwind: {
        config: '',
        css: 'src/styles/custom.css',
        baseColor: 'neutral',
        cssVariables: true,
      },
      aliases: {
        components: '@/components',
        utils: '@/lib/utils',
        ui: '@/components/ui',
        lib: '@/lib',
        hooks: '@/hooks',
      },
      registries: { '@fixture': endpoint.url('/{name}.json') },
    }),
  )
  await mkdir(path.join(ctx.project, 'src/styles'))
  await writeFile(
    path.join(ctx.project, 'src/styles/custom.css'),
    '@import "tailwindcss";\n/* developer CSS */\n',
  )
  try {
    installed(await install(ctx.project, ['@fixture/hero']))
    assert.match(
      await readFile(path.join(ctx.project, 'src/styles/custom.css'), 'utf8'),
      /developer CSS/,
    )
    assert.match(
      await readFile(path.join(ctx.project, 'src/styles/custom.css'), 'utf8'),
      /community-accent/,
    )
    assert.equal(
      installed(await install(ctx.project, ['@fixture/hero'])).disposition,
      'already-present',
    )
    installed(await install(ctx.project, [endpoint.url('/badge.json')]))
    await writeFile(path.join(ctx.project, 'src/components/ui/badge.tsx'), 'developer edit')
    blocked(await install(ctx.project, ['@fixture/hero']), /Existing file differs/)
  } finally {
    endpoint.server.stop(true)
  }
}, 60000)
test('raw traversal, filesystem dependency, symlink and divergent sibling block before target writes', async () => {
  const ctx = await fixture()
  const endpoint = registry({})
  try {
    for (const item of [
      source('bad', '../outside.ts'),
      { ...source('bad', 'src/good.ts'), registryDependencies: ['/etc/passwd'] },
    ]) {
      endpoint.server.reload({ fetch: () => Response.json(item) })
      blocked(
        await install(ctx.project, [endpoint.url('/bad.json')]),
        /Unsafe registry path|Unsupported registry dependency/,
      )
    }
    await symlink(ctx.directory, path.join(ctx.project, 'src/outside'))
    endpoint.server.reload({ fetch: () => Response.json(source('bad', 'src/outside/file.ts')) })
    blocked(await install(ctx.project, [endpoint.url('/bad.json')]), /Unsafe registry destination/)
    endpoint.server.reload({
      fetch: () =>
        Response.json({
          ...source('one', 'src/edited.ts'),
          files: [...source('one', 'src/edited.ts').files, ...source('one', 'src/new.ts').files],
        }),
    })
    await writeFile(path.join(ctx.project, 'src/edited.ts'), 'developer source')
    blocked(await install(ctx.project, [endpoint.url('/bad.json')]), /Existing file differs/)
    assert.equal(await Bun.file(path.join(ctx.project, 'src/new.ts')).exists(), false)
  } finally {
    endpoint.server.stop(true)
  }
}, 60000)
test('v3 claims preserve host runtime declarations and executable dependency specs and inherited escaping config are rejected', async () => {
  const ctx = await fixture()
  const item = {
    ...source('v3', 'src/v3.ts'),
    meta: { payloadComponent: { payload: '^3.0.0' } },
    dependencies: ['payload@^3.0.0', 'react@^18.0.0'],
  }
  const endpoint = registry({ '/v3.json': item })
  try {
    const original = await readFile(path.join(ctx.project, 'package.json'), 'utf8')
    const result = await install(ctx.project, [endpoint.url('/v3.json')])
    installed(result)
    assert.equal(await readFile(path.join(ctx.project, 'package.json'), 'utf8'), original)
    assert.ok(result.advisories.some((value) => value.message.includes('Preserved host payload')))
    endpoint.server.reload({
      fetch: () => Response.json({ ...item, dependencies: ['evil@file:../outside'] }),
    })
    blocked(await install(ctx.project, [endpoint.url('/v3.json')]), /semver range/)
    await writeFile(
      path.join(ctx.project, 'tsconfig.json'),
      JSON.stringify({
        extends: '../outside.json',
        compilerOptions: { paths: { '@/*': ['./src/*'] } },
      }),
    )
    endpoint.server.reload({
      fetch: () =>
        Response.json({
          ...item,
          dependencies: [],
          type: 'registry:block',
          files: item.files.map((file) => ({ ...file, type: 'registry:block' })),
        }),
    })
    blocked(await install(ctx.project, [endpoint.url('/v3.json')]), /Inherited tsconfig/)
  } finally {
    endpoint.server.stop(true)
  }
}, 30000)

test('different raw paths that transform to one UI destination fail; package-import aliases cannot escape qualification', async () => {
  const ctx = await fixture()
  const item = {
    name: 'collision',
    type: 'registry:block',
    files: [
      { path: 'first/a.tsx', type: 'registry:ui', content: 'export const first = 1' },
      { path: 'second/a.tsx', type: 'registry:ui', content: 'export const second = 2' },
    ],
  }
  const endpoint = registry({ '/collision.json': item })
  try {
    const original = await readFile(path.join(ctx.project, 'package.json'), 'utf8')
    blocked(
      await install(ctx.project, [endpoint.url('/collision.json')]),
      /Conflicting registry sources resolve/,
    )
    assert.equal(await Bun.file(path.join(ctx.project, 'src/components/ui/a.tsx')).exists(), false)
    assert.equal(await readFile(path.join(ctx.project, 'package.json'), 'utf8'), original)
    await writeFile(
      path.join(ctx.project, 'package.json'),
      JSON.stringify({ ...JSON.parse(original), imports: { '#/*': './../../outside/*' } }),
    )
    await writeFile(
      path.join(ctx.project, 'tsconfig.json'),
      JSON.stringify({ compilerOptions: { paths: { '#/*': ['src/*'] } } }),
    )
    await writeFile(
      path.join(ctx.project, 'components.json'),
      JSON.stringify({
        style: 'new-york',
        rsc: true,
        tsx: true,
        tailwind: {
          config: '',
          css: 'src/styles/custom.css',
          baseColor: 'neutral',
          cssVariables: true,
        },
        aliases: {
          components: '#/components',
          utils: '#/lib/utils',
          ui: '#/components/ui',
          lib: '#/lib',
          hooks: '#/hooks',
        },
      }),
    )
    blocked(
      await install(ctx.project, [endpoint.url('/collision.json')]),
      /package imports\/workspace aliases/,
    )
    assert.equal(
      await Bun.file(path.join(ctx.directory, 'outside/components/ui/a.tsx')).exists(),
      false,
    )
  } finally {
    endpoint.server.stop(true)
  }
}, 30000)
test('external no-guide handoff reaches a controlled agent and installation remains separate from agent failure', async () => {
  const ctx = await fixture()
  const endpoint = registry({ '/one.json': source('one', 'src/one.ts') })
  const previousPath = process.env.PATH
  const bin = path.join(ctx.directory, 'bin')
  await mkdir(bin)
  const received = path.join(ctx.directory, 'prompt.txt')
  try {
    await writeFile(
      path.join(bin, 'codex'),
      `#!${process.execPath}\nconst prompt = await Bun.stdin.text(); await Bun.write(${JSON.stringify(received)},prompt); console.log(JSON.stringify({type:'turn.completed'}));\n`,
    )
    await chmod(path.join(bin, 'codex'), 0o700)
    process.env.PATH = bin + path.delimiter + previousPath
    const request = {
      directory: ctx.project,
      features: [endpoint.url('/one.json')],
      allowDirty: true,
      agent: 'codex' as const,
      requireAgentSuccess: true,
    }
    const success = await add(request)
    owned.push(path.dirname(success.receipt))
    installed(success)
    assert.equal(success.agent.status, 'completed')
    assert.match(await readFile(received, 'utf8'), /missing prerequisites/)
    await writeFile(
      path.join(bin, 'codex'),
      `#!${process.execPath}\nconsole.log(JSON.stringify({type:'turn.failed'}));process.exit(1);\n`,
    )
    const failed = await add(request)
    owned.push(path.dirname(failed.receipt))
    installed(failed)
    assert.equal(failed.agent.status, 'failed')
    assert.equal(failed.verification.status, 'not-run')
    assert.equal(failed.exitCode, 1)
  } finally {
    process.env.PATH = previousPath
    endpoint.server.stop(true)
  }
}, 30000)

test('all external guides are qualified in the no-agent handoff', async () => {
  const ctx = await fixture()
  const item = {
    name: 'two-guides',
    type: 'registry:item',
    files: [
      ...source('one', 'src/one/GUIDE.md', 'First integration guide').files,
      ...source('two', 'src/two/GUIDE.md', 'Second integration guide').files,
    ],
  }
  const endpoint = registry({ '/guides.json': item })
  try {
    const result = await install(ctx.project, [endpoint.url('/guides.json')])
    installed(result)
    assert.equal(result.agent.status, 'not-requested')
    if ('prompt' in result.agent) {
      assert.match(result.agent.prompt!, /src\/one\/GUIDE.md \(SHA-256/)
      assert.match(result.agent.prompt!, /src\/two\/GUIDE.md \(SHA-256/)
    }
  } finally {
    endpoint.server.stop(true)
  }
}, 30000)

test('longest matching alias cannot redirect qualification outside its owned host', async () => {
  const ctx = await fixture()
  const endpoint = registry({
    '/ui.json': {
      name: 'ui',
      type: 'registry:ui',
      files: [
        {
          path: 'ui/canary.tsx',
          type: 'registry:ui',
          content: 'export const Canary = () => <div />',
        },
      ],
    },
  })
  await writeFile(
    path.join(ctx.project, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: { paths: { '@/*': ['src/*'], '@/components/*': ['../../outside/*'] } },
    }),
  )
  await writeFile(
    path.join(ctx.project, 'components.json'),
    JSON.stringify({
      style: 'new-york',
      rsc: true,
      tsx: true,
      tailwind: {
        config: '',
        css: 'src/styles/custom.css',
        baseColor: 'neutral',
        cssVariables: true,
      },
      aliases: {
        components: '@/components',
        utils: '@/lib/utils',
        ui: '@/components/ui',
        lib: '@/lib',
        hooks: '@/hooks',
      },
    }),
  )
  try {
    blocked(await install(ctx.project, [endpoint.url('/ui.json')]), /Unsafe registry path/)
    assert.equal(await Bun.file(path.join(ctx.directory, 'outside/ui/canary.tsx')).exists(), false)
  } finally {
    endpoint.server.stop(true)
  }
}, 30000)

test('unconfigured UI installation publishes the generated frontend stylesheet and repeats', async () => {
  const ctx = await fixture()
  const endpoint = registry({
    '/badge.json': {
      name: 'badge',
      type: 'registry:ui',
      files: [
        {
          path: 'ui/badge.tsx',
          type: 'registry:ui',
          content: 'export const Badge = () => <span />',
        },
      ],
    },
  })
  try {
    const first = await install(ctx.project, [endpoint.url('/badge.json')])
    installed(first)
    assert.equal(
      await Bun.file(path.join(ctx.project, 'src/styles/payload-toolkit.css')).exists(),
      true,
    )
    assert.match(
      await readFile(path.join(ctx.project, 'src/styles/payload-toolkit.css'), 'utf8'),
      /:root/,
    )
    assert.equal(
      installed(await install(ctx.project, [endpoint.url('/badge.json')])).disposition,
      'already-present',
    )
  } finally {
    endpoint.server.stop(true)
  }
}, 30000)

test('source helper named tsconfig preserves isolated resolver context during projection', async () => {
  const ctx = await fixture()
  const endpoint = registry({
    '/helper.json': source('helper', 'src/tsconfig.ts', 'export const helper = true\n'),
  })
  try {
    installed(await install(ctx.project, [endpoint.url('/helper.json')]))
    assert.equal(
      await readFile(path.join(ctx.project, 'src/tsconfig.ts'), 'utf8'),
      'export const helper = true\n',
    )
  } finally {
    endpoint.server.stop(true)
  }
}, 30000)

test('root-anchored universal source does not require resolving unused inherited aliases', async () => {
  const ctx = await fixture()
  const endpoint = registry({ '/one.json': source('one', 'src/one.ts') })
  await writeFile(
    path.join(ctx.project, 'tsconfig.json'),
    JSON.stringify({ extends: '../unused.json' }),
  )
  try {
    installed(await install(ctx.project, [endpoint.url('/one.json')]))
  } finally {
    endpoint.server.stop(true)
  }
}, 30000)
