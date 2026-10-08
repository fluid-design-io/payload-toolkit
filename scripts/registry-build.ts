import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve, toNamespacedPath } from 'node:path'
import { fileURLToPath } from 'node:url'
import { addRegistryItems, getRegistriesConfig, getRegistryItems } from 'shadcn/registry'
import { registryItemSchema, registrySchema } from 'shadcn/schema'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const output = join(root, 'assets/registry')
const sha256 = (bytes: string | Uint8Array) => createHash('sha256').update(bytes).digest('hex')
const authored = registrySchema.parse(
  JSON.parse(await Bun.file(join(root, 'registry/registry.json')).text()),
)
const executable = createRequire(import.meta.url).resolve('shadcn')
const installedShadcn = JSON.parse(
  await Bun.file(join(dirname(executable), '../package.json')).text(),
)
if (installedShadcn.version !== '4.21.4')
  throw new Error('Registry qualification requires shadcn 4.21.4')
await rm(output, { recursive: true, force: true })
const build = spawnSync(
  process.execPath,
  [executable, 'build', 'registry/registry.json', '--output', output],
  { cwd: root, stdio: 'inherit' },
)
if (build.error) throw build.error
if (build.status !== 0)
  throw new Error(`Public shadcn registry build failed with status ${build.status}`)

const temporary = await mkdtemp(join(tmpdir(), 'payload-toolkit-registry-qualification-'))
let qualified = false
try {
  const entries = []
  for (const declared of authored.items) {
    if (!/^[a-z][a-z0-9-]*$/.test(declared.name))
      throw new Error('Registry names must be safe filenames')
    const itemPath = join(output, `${declared.name}.json`)
    // shadcn treats drive letters as URL schemes. Windows namespaced paths stay local,
    // including when the registry and the qualification project live on different drives.
    const [raw] = await getRegistryItems([toNamespacedPath(itemPath)], { useCache: false })
    const item = registryItemSchema.parse(raw)
    const meta: unknown = item.meta?.payloadToolkit
    if (
      typeof meta !== 'object' ||
      meta === null ||
      !('guide' in meta) ||
      typeof meta.guide !== 'string'
    )
      throw new Error(`Missing guide metadata: ${item.name}`)
    if (
      item.registryDependencies?.length ||
      item.devDependencies?.length ||
      item.type !== 'registry:item' ||
      item.css ||
      item.cssVars ||
      item.envVars ||
      item.tailwind
    ) {
      throw new Error(`Unsupported first-party registry item: ${item.name}`)
    }
    // Exercise the exact file bytes through shadcn. Dependency installation has its own fixtures.
    const sourceOnly = join(temporary, `${item.name}.json`)
    await Bun.write(sourceOnly, JSON.stringify({ ...item, dependencies: [] }), {
      createPath: false,
    })
    const files = []
    for (const source of item.files ?? []) {
      if (
        source.type !== 'registry:file' ||
        !source.target?.startsWith('~/') ||
        typeof source.content !== 'string'
      )
        throw new Error(`Unsupported file in ${item.name}`)
      const path = source.target.slice(2)
      if (
        !path ||
        path.includes('\\') ||
        path.split('/').some((part) => !part || part === '.' || part === '..' || part.includes(':'))
      )
        throw new Error(`Unsafe target: ${source.target}`)
      files.push({
        path,
        sourceSha256: sha256(source.content),
        sha256: '',
        role: path === meta.guide ? 'guide' : 'source',
      })
    }
    if (files.filter((file) => file.role === 'guide').length !== 1)
      throw new Error(`Expected exactly one guide: ${item.name}`)
    const guide = item.files?.find((file) => file.target === `~/${meta.guide}`)
    if (
      !('payloadVersions' in meta) ||
      !Array.isArray(meta.payloadVersions) ||
      meta.payloadVersions.length !== 1 ||
      typeof meta.payloadVersions[0] !== 'string' ||
      !guide?.content?.includes(`This item targets Payload ${meta.payloadVersions[0]},`)
    )
      throw new Error(`Guide target and exact Payload compatibility pin must agree: ${item.name}`)
    for (const withSrc of [false, true]) {
      const project = join(temporary, `${item.name}-${withSrc ? 'src' : 'root'}`)
      await mkdir(withSrc ? join(project, 'src') : project, { recursive: true })
      await Bun.write(
        join(project, 'package.json'),
        JSON.stringify({ name: 'registry-file-qualification', private: true, type: 'module' }),
        { createPath: false },
      )
      const config = await getRegistriesConfig(project)
      await addRegistryItems([toNamespacedPath(sourceOnly)], {
        cwd: project,
        config,
        overwrite: false,
        silent: true,
      })
      for (const file of files) {
        const bytes = await Bun.file(join(project, file.path)).bytes()
        const installed = sha256(bytes)
        if (file.sha256 && installed !== file.sha256)
          throw new Error(`Layout-dependent output: ${file.path}`)
        if (file.role === 'guide' && installed !== file.sourceSha256)
          throw new Error(`shadcn altered guide: ${file.path}`)
        if (
          file.path.endsWith('.tsx') &&
          !/^["']use client["']/.test(new TextDecoder().decode(bytes))
        )
          throw new Error(`Client directive was removed: ${file.path}`)
        file.sha256 = installed
      }
    }
    entries.push({
      name: item.name,
      description: item.description ?? item.name,
      itemSha256: sha256(await Bun.file(itemPath).bytes()),
      files,
    })
  }
  await Bun.write(
    join(output, 'catalog.json'),
    `${JSON.stringify({ schemaVersion: 1, shadcn: '4.21.4', items: entries }, null, 2)}\n`,
    { createPath: false },
  )
  console.log(
    `Built and qualified ${entries.length} registry item(s). File transforms only; dependency/runtime checks are separate.`,
  )
  qualified = true
} finally {
  if (qualified) await rm(temporary, { recursive: true, force: true })
  else console.error(`Failed registry qualification files retained at ${temporary}`)
}
