import { cp, lstat, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { toNamespacedPath } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  getRegistriesConfig,
  getRegistriesIndex,
  getRegistryItems,
  resolveRegistryItems,
} from 'shadcn/registry'
import { rawConfigSchema, registryItemSchema } from 'shadcn/schema'
import { intersects, satisfies, validRange } from 'semver'
import validateName from 'validate-npm-package-name'
import type { ExternalFeature, FileIdentity, Host } from '../model.js'
import { ToolkitError } from '../model.js'
import { Attempt, digest, runProcess } from './attempts.js'

type Item = ReturnType<typeof registryItemSchema.parse>
type Config = ReturnType<typeof rawConfigSchema.parse>
const require = createRequire(import.meta.url)
const cli = require.resolve('shadcn')
const stem = (target: string) => path.basename(target).replace(/\.[^.]+$/, '')
const missing = (error: unknown) => (error as NodeJS.ErrnoException).code === 'ENOENT'
function invalid(message: string): never {
  throw new ToolkitError('invalid-item', message)
}
export const externalReference = (value: string) =>
  /^https?:\/\//i.test(value) || /^@[^/]+\/.+/.test(value)

export function relativePath(value: string): string {
  if (
    !value ||
    value.includes('\\') ||
    [...value].some((character) => character.charCodeAt(0) < 32) ||
    value
      .split('/')
      .some(
        (part) =>
          !part || part === '.' || part === '..' || part.includes(':') || part.startsWith('~'),
      )
  )
    invalid(`Unsafe registry path: ${value}`)
  return value
}
export async function safeDestination(
  project: string,
  target: string,
  directory = false,
): Promise<string> {
  relativePath(target)
  let current = project
  for (const [index, part] of ['', ...target.split('/')].entries()) {
    current = path.join(current, part)
    try {
      const info = await lstat(current)
      if (
        info.isSymbolicLink() ||
        (index < target.split('/').length
          ? !info.isDirectory()
          : !(info.isFile() || (directory && info.isDirectory())))
      )
        throw new ToolkitError('collision', `Unsafe registry destination: ${target}`)
    } catch (error) {
      if (!missing(error)) throw error
    }
  }
  return current
}
async function bytes(filename: string): Promise<string | undefined> {
  try {
    return await readFile(filename, 'utf8')
  } catch (error) {
    if (!missing(error)) throw error
    return undefined
  }
}
function parseJsonConfig(text: string): Record<string, any> {
  const clean = text
    .replace(/"(?:\\.|[^"\\])*"|\/\*[\s\S]*?\*\/|\/\/[^\n\r]*/g, (value) =>
      value.startsWith('"') ? value : '',
    )
    .replace(/,(\s*[}\]])/g, '$1')
  return JSON.parse(clean)
}
async function aliasResolver(project: string) {
  const tsconfig =
    (await bytes(path.join(project, 'tsconfig.json'))) ||
    (await bytes(path.join(project, 'jsconfig.json')))
  const parsed = tsconfig ? parseJsonConfig(tsconfig) : {}
  if (parsed.extends)
    invalid(
      'Inherited tsconfig configuration is not supported for external qualification; flatten the host paths and baseUrl into its local tsconfig first',
    )
  const compiler = parsed.compilerOptions || {}
  const base = compiler.baseUrl || '.'
  if (base !== '.') relativePath(base.replace(/^\.\//, ''))
  const paths: Record<string, string[]> = compiler.paths || {}
  return (alias: string): string => {
    if (alias.startsWith('./')) return relativePath(alias.slice(2))
    for (const [key, values] of Object.entries(paths).toSorted(
      ([a], [b]) => b.replace(/\*$/, '').length - a.replace(/\*$/, '').length,
    )) {
      const prefix = key.endsWith('*') ? key.slice(0, -1) : key
      if ((key.endsWith('*') && alias.startsWith(prefix)) || alias === key) {
        if (values.length !== 1) invalid(`Ambiguous shadcn alias: ${alias}`)
        const target = values[0]!.replace(/\*$/, alias.slice(prefix.length)).replace(/^\.\//, '')
        return relativePath(path.posix.join(base, relativePath(target)))
      }
    }
    invalid(`Cannot resolve shadcn alias safely from the host tsconfig: ${alias}`)
  }
}
async function validateConfig(project: string, config: Config) {
  const resolveAlias = await aliasResolver(project)
  for (const alias of Object.values(config.aliases))
    if (alias) {
      if (!alias.startsWith('@/') && !alias.startsWith('./'))
        invalid(
          `External qualification supports local @/ or ./ aliases; package imports/workspace aliases require manual setup: ${alias}`,
        )
      await safeDestination(project, resolveAlias(alias), true)
    }
  if (config.tailwind.css)
    await safeDestination(project, relativePath(config.tailwind.css.replace(/^\.\//, '')))
  if (config.tailwind.config)
    await safeDestination(project, relativePath(config.tailwind.config.replace(/^\.\//, '')))
  return resolveAlias
}
function validateItem(item: Item, reference: string) {
  if (
    item.type === 'registry:base' ||
    item.type === 'registry:font' ||
    item.extends ||
    item.envVars ||
    item.tailwind
  )
    invalid(
      `Unsupported external registry behavior (base/font/extends/environment/tailwind config): ${reference}`,
    )
  for (const file of item.files || []) {
    relativePath(file.path)
    if (
      ['package.json', 'components.json', 'tsconfig.json', 'jsconfig.json'].includes(
        path.basename(file.target || file.path),
      ) ||
      /(?:^|\/)\.git(?:\/|$)/.test(file.target || file.path)
    )
      invalid(`Registry source cannot replace project control files: ${file.target || file.path}`)
    if (file.target) relativePath(file.target.startsWith('~/') ? file.target.slice(2) : file.target)
    if (typeof file.content !== 'string')
      invalid(`Registry file has no inline source: ${file.path}`)
  }
  for (const dependency of item.registryDependencies || [])
    if (!(externalReference(dependency) || /^[a-z0-9][a-z0-9-]*$/.test(dependency)))
      invalid(`Unsupported registry dependency: ${dependency}`)
}
async function fileMap(directory: string, prefix = ''): Promise<Map<string, string>> {
  const output = new Map<string, string>()
  for (const entry of await readdir(path.join(directory, prefix), { withFileTypes: true })) {
    if (
      ['node_modules', '.git', '.next', '.output', '.tanstack', 'dist', 'build', '.cache'].includes(
        entry.name,
      ) ||
      entry.name.startsWith('.env')
    )
      continue
    const target = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isSymbolicLink()) continue
    if (entry.isDirectory())
      for (const pair of await fileMap(directory, target)) output.set(...pair)
    else if (entry.isFile())
      output.set(target, await readFile(path.join(directory, target), 'utf8'))
  }
  return output
}
function protectedPackage(name: string) {
  return (
    name === 'payload' ||
    name.startsWith('@payloadcms/') ||
    ['next', 'react', 'react-dom', '@tanstack/react-start', '@tanstack/react-router'].includes(name)
  )
}
function parseDependency(spec: string): [string, string] {
  const split = spec.lastIndexOf('@')
  const name = split > 0 ? spec.slice(0, split) : spec
  const version = split > 0 ? spec.slice(split + 1) : '*'
  if (!validateName(name).validForNewPackages || !validRange(version) || /[\r\n]/.test(spec))
    invalid(`External dependency must be an npm package with a semver range: ${spec}`)
  return [name, version]
}
async function packagePolicy(project: string, items: Item[], host: Host, advisories: string[]) {
  const manifest = JSON.parse(await readFile(path.join(project, 'package.json'), 'utf8'))
  const dependencies: Record<string, string> = {}
  const devDependencies: Record<string, string> = {}
  for (const item of items)
    for (const [kind, specs] of [
      ['dependencies', item.dependencies],
      ['devDependencies', item.devDependencies],
    ] as const)
      for (const spec of specs || []) {
        const [name, requested] = parseDependency(spec)
        const existing = manifest.dependencies?.[name] || manifest.devDependencies?.[name]
        if (protectedPackage(name) && existing) {
          advisories.push(`Preserved host ${name}@${existing}; upstream requested ${requested}.`)
          continue
        }
        const version = name.startsWith('@payloadcms/') ? host.payloadVersion : requested
        if (name.startsWith('@payloadcms/') && version !== requested)
          advisories.push(
            `Aligned ${name} to host Payload ${host.payloadVersion}; upstream requested ${requested}.`,
          )
        if (protectedPackage(name) && !name.startsWith('@payloadcms/')) {
          advisories.push(
            `Host runtime dependency ${name}@${requested} requires manual review; source installation continues without adding it.`,
          )
          continue
        }
        if (existing) {
          if (
            !validRange(existing) ||
            !intersects(existing, version, { includePrerelease: true })
          ) {
            advisories.push(
              `Preserved existing ${name}@${existing}; upstream requested ${version}. Inspect compatibility during integration.`,
            )
            continue
          }
          ;(manifest.dependencies?.[name] ? dependencies : devDependencies)[name] = existing
          continue
        }
        const previous = dependencies[name] || devDependencies[name]
        if (previous && previous !== version)
          invalid(`Conflicting external dependency ranges for ${name}: ${previous} and ${version}`)
        ;(kind === 'dependencies' ? dependencies : devDependencies)[name] = version
      }
  return { dependencies, devDependencies }
}
export async function externalDependenciesPresent(
  project: string,
  feature: ExternalFeature,
): Promise<boolean> {
  const manifest = JSON.parse(await readFile(path.join(project, 'package.json'), 'utf8'))
  const projectRequire = createRequire(pathToFileURL(path.join(project, 'package.json')))
  for (const [kind, values] of [
    ['dependencies', feature.dependencies],
    ['devDependencies', feature.devDependencies],
  ] as const)
    for (const [name, range] of Object.entries(values)) {
      if (
        !manifest[kind]?.[name] ||
        !validRange(manifest[kind][name]) ||
        !intersects(manifest[kind][name], range, { includePrerelease: true })
      )
        return false
      try {
        let directory: string
        try {
          directory = path.dirname(projectRequire.resolve(`${name}/package.json`))
        } catch {
          directory = path.dirname(projectRequire.resolve(name))
        }
        let found = false
        while (directory !== path.dirname(directory)) {
          const content = await bytes(path.join(directory, 'package.json'))
          const pkg = content ? JSON.parse(content) : {}
          if (pkg.name === name) {
            found = satisfies(pkg.version, range, { includePrerelease: true })
            break
          }
          directory = path.dirname(directory)
        }
        if (!found) return false
      } catch {
        return false
      }
    }
  return true
}

export async function prepareExternal(
  project: string,
  references: readonly string[],
  host: Host,
  workspace: string,
  attempt: Attempt,
  signal?: AbortSignal,
): Promise<ExternalFeature> {
  await mkdir(workspace, { recursive: true, mode: 0o700 })
  for (const control of ['package.json', 'tsconfig.json', 'jsconfig.json'])
    await safeDestination(project, control)
  await safeDestination(project, 'components.json')
  const originalConfig = await bytes(path.join(project, 'components.json'))
  let config = originalConfig ? rawConfigSchema.parse(parseJsonConfig(originalConfig)) : undefined
  if (config) await validateConfig(project, config)
  const registryConfig = await getRegistriesConfig(project, { useCache: false })
  const configForFetch = {
    ...registryConfig,
    style:
      config?.style === 'new-york' && !config.tailwind.config
        ? 'new-york-v4'
        : config?.style || 'new-york-v4',
  }
  const namespaced = references.some(
    (value) => value.startsWith('@') && !registryConfig.registries[value.split('/')[0]!],
  )
  if (namespaced)
    configForFetch.registries = {
      ...(await getRegistriesIndex({ useCache: false })),
      ...registryConfig.registries,
    }
  const items: Item[] = []
  const identities: { reference: string; name: string; sha256: string }[] = []
  const visited = new Set<string>()
  async function visit(reference: string) {
    if (visited.has(reference)) return
    if (visited.size >= 128) invalid('External registry graph exceeds 128 items')
    visited.add(reference)
    signal?.throwIfAborted()
    if (reference.startsWith('@') && !configForFetch.registries[reference.split('/')[0]!])
      configForFetch.registries = {
        ...(await getRegistriesIndex({ useCache: false })),
        ...configForFetch.registries,
      }
    const [raw] = await getRegistryItems([reference], { config: configForFetch, useCache: false })
    const parsed = registryItemSchema.safeParse(raw)
    if (!parsed.success) invalid(`Invalid shadcn registry item: ${reference}`)
    const item = parsed.data
    validateItem(item, reference)
    const identity = digest(JSON.stringify(item))
    await writeFile(
      path.join(workspace, `${identities.length}-item.json`),
      JSON.stringify(item, null, 2),
      { mode: 0o600 },
    )
    identities.push({ reference, name: item.name, sha256: identity })
    for (const dependency of item.registryDependencies || []) await visit(dependency)
    items.push({ ...item, registryDependencies: [] })
  }
  for (const reference of new Set(references)) await visit(reference)
  const needsConfig = items.some(
    (item) =>
      item.css ||
      item.cssVars ||
      item.files?.some((file) => file.type !== 'registry:file' || !file.target?.startsWith('~/')),
  )
  const advisories = items.map(
    (item) =>
      `${item.name}: upstream compatibility is advisory (${JSON.stringify(item.meta?.payloadToolkit || item.meta?.payloadComponent || 'unknown')}); actual host is Payload ${host.payloadVersion}/${host.framework}/${host.database}.`,
  )
  const packages = await packagePolicy(project, items, host, advisories)
  if (needsConfig && !config) {
    const resolveAlias = await aliasResolver(project)
    const root = resolveAlias('@/components').replace(/\/components$/, '')
    config = rawConfigSchema.parse({
      style: 'new-york',
      rsc: host.framework === 'next',
      tsx: true,
      tailwind: {
        config: '',
        css: `${root}/styles/payload-toolkit.css`,
        baseColor: 'neutral',
        cssVariables: true,
      },
      aliases: {
        components: '@/components',
        ui: '@/components/ui',
        utils: '@/lib/utils',
        lib: '@/lib',
        hooks: '@/hooks',
      },
    })
    await validateConfig(project, config)
    advisories.push(
      `Created default shadcn configuration. Import ${config.tailwind.css} from the frontend entry; inspect missing cn/utils and other host prerequisites.`,
    )
  }
  const aggregateFiles = new Map<string, NonNullable<Item['files']>[number]>()
  for (const item of items)
    for (const file of item.files || []) {
      const key = file.target || `${file.type}:${file.path}`
      const existing = aggregateFiles.get(key)
      if (existing && (existing.content !== file.content || existing.type !== file.type))
        invalid(`Conflicting registry source: ${file.target || file.path}`)
      aggregateFiles.set(key, file)
    }
  const localItems: string[] = []
  for (const [index, item] of items.entries()) {
    const filename = path.join(workspace, `${index}-frozen.json`)
    await writeFile(
      filename,
      JSON.stringify({
        ...item,
        dependencies: [],
        devDependencies: [],
        registryDependencies: [],
        files: item.files?.filter(
          (file) => aggregateFiles.get(file.target || `${file.type}:${file.path}`) === file,
        ),
      }),
    )
    localItems.push(filename)
  }
  const resolved = await resolveRegistryItems(localItems, {
    config: configForFetch,
    useCache: false,
  })
  if (!resolved) invalid('External registry graph resolved no content')
  const qualificationItem = path.join(workspace, 'qualified-input.json')
  await writeFile(
    qualificationItem,
    JSON.stringify({
      name: 'payload-toolkit-external',
      type: 'registry:item',
      ...resolved,
      dependencies: [],
      devDependencies: [],
      registryDependencies: [],
    }),
  )
  const clone = path.join(workspace, 'host')
  const before = await fileMap(project)
  await mkdir(clone, { recursive: true })
  for (const [target, content] of before) {
    await mkdir(path.dirname(path.join(clone, target)), { recursive: true })
    await writeFile(path.join(clone, target), content)
  }
  const configTargets = new Set<string>()
  if (config) {
    configTargets.add('components.json')
    configTargets.add(relativePath(config.tailwind.css.replace(/^\.\//, '')))
    if (!originalConfig)
      await writeFile(path.join(clone, 'components.json'), JSON.stringify(config, null, 2) + '\n')
    const cssPath = path.join(clone, config.tailwind.css)
    if ((await bytes(cssPath)) === undefined) {
      await mkdir(path.dirname(cssPath), { recursive: true })
      await writeFile(cssPath, ':root {}\n')
    }
  }
  const qualifierContext = new Map<string, string>()
  const qualifierManifest = JSON.parse(before.get('package.json') || '{}')
  delete qualifierManifest.imports
  delete qualifierManifest.exports
  delete qualifierManifest.workspaces
  qualifierContext.set('package.json', JSON.stringify(qualifierManifest, null, 2) + '\n')
  const resolveQualifiedAlias = config ? await aliasResolver(project) : undefined
  const aliasPaths: Record<string, string[]> = {}
  for (const alias of Object.values(config?.aliases || {}))
    if (alias && !alias.startsWith('./')) aliasPaths[alias] = [resolveQualifiedAlias!(alias)]
  const qualifierTsconfig =
    before.has('tsconfig.json') || !before.has('jsconfig.json') ? 'tsconfig.json' : 'jsconfig.json'
  qualifierContext.set(
    qualifierTsconfig,
    JSON.stringify(
      { compilerOptions: { baseUrl: '.', paths: aliasPaths, jsx: 'preserve' } },
      null,
      2,
    ) + '\n',
  )
  if (before.has('tsconfig.json') && before.has('jsconfig.json'))
    qualifierContext.set('jsconfig.json', qualifierContext.get(qualifierTsconfig)!)
  for (const [filename, content] of qualifierContext)
    await writeFile(path.join(clone, filename), content)
  await writeFile(
    path.join(workspace, 'context.json'),
    JSON.stringify(
      {
        host,
        references,
        items: identities,
        config,
        manifest: JSON.parse(before.get('package.json') || '{}'),
      },
      null,
      2,
    ),
  )
  const qualificationEnvironment = { ...process.env }
  for (const key of Object.keys(qualificationEnvironment))
    if (/^(?:TS_NODE_|NODE_OPTIONS$|BUN_OPTIONS$)/i.test(key)) delete qualificationEnvironment[key]
  await mkdir(path.join(clone, '.git'), { recursive: true })
  const sourceOrigins = new Map<
    string,
    { content: string; transformedContent: string; sha256: string }
  >()
  const inputFiles = [...aggregateFiles.values()]
  if (inputFiles.length > 512) invalid('External registry graph exceeds 512 source files')
  for (const [index, file] of inputFiles.entries()) {
    const probe = path.join(workspace, `projection-${index}`)
    await cp(clone, probe, { recursive: true })
    for (const target of before.keys())
      if (
        target !== 'components.json' &&
        !qualifierContext.has(target) &&
        stem(target) === stem(file.target || file.path)
      )
        await rm(path.join(probe, target), { force: true })
    const probeBefore = await fileMap(probe)
    const input = path.join(workspace, `projection-${index}.json`)
    await writeFile(
      input,
      JSON.stringify({
        name: 'payload-toolkit-projection',
        type: 'registry:item',
        files: [file],
        dependencies: [],
        devDependencies: [],
        registryDependencies: [],
      }),
    )
    await runProcess(
      process.execPath,
      [cli, 'add', toNamespacedPath(input), '--cwd', probe, '--yes', '--overwrite', '--silent'],
      { cwd: probe, attempt, signal, env: qualificationEnvironment },
    )
    const probeAfter = await fileMap(probe)
    const outputs = [...probeAfter.keys()].filter(
      (target) => probeBefore.get(target) !== probeAfter.get(target),
    )
    if (outputs.length !== 1)
      invalid(`Registry file did not resolve exactly one owned destination: ${file.path}`)
    const target = relativePath(outputs[0]!)
    if (qualifierContext.has(target) || target === 'components.json')
      invalid(`Registry source cannot replace isolated resolver context: ${target}`)
    await safeDestination(project, target)
    const previous = sourceOrigins.get(target)
    if (previous && previous.transformedContent !== probeAfter.get(target))
      invalid(`Conflicting registry sources resolve to ${target}`)
    sourceOrigins.set(target, {
      content: file.content!,
      transformedContent: probeAfter.get(target)!,
      sha256: digest(file.content!),
    })
  }
  await runProcess(
    process.execPath,
    [
      cli,
      'add',
      toNamespacedPath(qualificationItem),
      '--cwd',
      clone,
      '--yes',
      '--overwrite',
      '--silent',
    ],
    { cwd: clone, attempt, signal, env: qualificationEnvironment },
  )
  for (const [filename, content] of qualifierContext) {
    if ((await bytes(path.join(clone, filename))) !== content)
      invalid(`Qualification changed its isolated resolver context: ${filename}`)
    const original = before.get(filename)
    if (original === undefined) await rm(path.join(clone, filename), { force: true })
    else await writeFile(path.join(clone, filename), original)
  }
  const after = await fileMap(clone)
  const outputs = new Set(
    [...after.keys()].filter((target) => before.get(target) !== after.get(target)),
  )
  for (const target of sourceOrigins.keys()) outputs.add(target)
  const files: ExternalFeature['files'][number][] = []
  for (const target of outputs) {
    relativePath(target)
    const content = after.get(target)
    if (content === undefined) invalid(`Registry removed host source: ${target}`)
    if (
      target === 'package.json' ||
      /(^|\/)(?:bun\.lockb?|pnpm-lock\.yaml|package-lock\.json)$/.test(target)
    )
      invalid(`Qualification unexpectedly changed package state: ${target}`)
    const old = before.get(target)
    const role =
      configTargets.has(target) && !sourceOrigins.has(target)
        ? 'host-config'
        : /(?:^|\/)GUIDE\.md$/i.test(target)
          ? 'guide'
          : 'source'
    if (old !== undefined && old !== content && role !== 'host-config')
      throw new ToolkitError(
        'collision',
        `Existing file differs from external registry: ${target}. Source installation does not overwrite developer files.`,
      )
    await safeDestination(project, target)
    files.push({
      path: target,
      sha256: digest(content),
      sourceSha256: sourceOrigins.get(target)?.sha256 || digest(before.get(target) || content),
      role,
      beforeSha256: old === undefined ? null : digest(old),
      content,
    })
  }
  const replayPath = path.join(workspace, 'replay.json')
  const replay = {
    name: 'payload-toolkit-external',
    type: 'registry:item',
    registryDependencies: [],
    dependencies: Object.entries(packages.dependencies).map(([name, range]) => `${name}@${range}`),
    devDependencies: Object.entries(packages.devDependencies).map(
      ([name, range]) => `${name}@${range}`,
    ),
    files: files
      .filter((file) => file.role !== 'host-config' || file.beforeSha256 === null)
      .map((file) => ({
        path: file.path,
        target: `~/${file.path}`,
        type: 'registry:file',
        content: file.content,
      })),
  }
  const replayBytes = JSON.stringify(replay)
  await writeFile(replayPath, replayBytes)
  const feature: ExternalFeature = {
    kind: 'external',
    name: items.at(-1)?.name || 'external',
    version: 'external',
    itemPath: replayPath,
    itemSha256: digest(replayBytes),
    files,
    ...packages,
    guide: files.find((file) => file.role === 'guide')?.path,
    provenance: {
      references: [...references],
      items: identities,
      host,
      advisories,
      stylesheet: config?.tailwind.css,
    },
  }
  await writeFile(path.join(workspace, 'plan.json'), JSON.stringify(feature, null, 2), {
    mode: 0o600,
  })
  return feature
}
export async function inspectExternal(
  project: string,
  feature: ExternalFeature,
): Promise<{ complete: boolean; files: FileIdentity[] }> {
  let complete = true
  const files: FileIdentity[] = []
  for (const file of feature.files) {
    const full = await safeDestination(project, file.path)
    const content = await bytes(full)
    const hash = content === undefined ? null : digest(content)
    if (hash === file.sha256) {
      files.push({ path: file.path, sha256: file.sha256 })
      continue
    }
    if (file.role === 'host-config' && hash === file.beforeSha256) {
      complete = false
      continue
    }
    if (hash === null && file.beforeSha256 === null) {
      complete = false
      continue
    }
    throw new ToolkitError(
      'collision',
      `Registry destination changed or contains edited source: ${file.path}`,
    )
  }
  if (!(await externalDependenciesPresent(project, feature))) complete = false
  return { complete, files }
}
export async function publishExternalConfig(project: string, feature: ExternalFeature) {
  await inspectExternal(project, feature)
  for (const file of feature.files)
    if (file.role === 'host-config' && file.beforeSha256 !== null) {
      const full = await safeDestination(project, file.path)
      const existing = await bytes(full)
      if (existing !== undefined && digest(existing) === file.sha256) continue
      if (existing === undefined || digest(existing) !== file.beforeSha256)
        throw new ToolkitError(
          'collision',
          `Host configuration changed before publish: ${file.path}`,
        )
      await writeFile(full, file.content)
    }
}
