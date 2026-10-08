import { fork } from 'node:child_process'
import { createHash } from 'node:crypto'
import { lstat, realpath } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join, resolve, toNamespacedPath } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  addRegistryItems,
  getRegistriesConfig,
  getRegistryItems,
  resolveRegistryItems,
} from 'shadcn/registry'
import { registryItemSchema } from 'shadcn/schema'
import { z } from 'zod'
import {
  isExternal,
  ToolkitError,
  type Feature,
  type BundledFeature,
  type FileIdentity,
  type Host,
} from '../model.js'
import { Attempt, terminateWindowsTree } from './attempts.js'
import {
  externalReference,
  prepareExternal,
  inspectExternal,
  publishExternalConfig,
} from './external-registry.js'

export { externalReference } from './external-registry.js'

const assetDirectory = fileURLToPath(new URL('../../../assets/registry/', import.meta.url))
const digest = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex')
const hash = z.string().regex(/^[a-f0-9]{64}$/)
const featureName = z.string().regex(/^[a-z][a-z0-9-]*$/)
const expectedFile = z
  .object({ path: z.string(), sha256: hash, sourceSha256: hash, role: z.enum(['source', 'guide']) })
  .strict()
const catalogSchema = z
  .object({
    schemaVersion: z.literal(1),
    shadcn: z.literal('4.21.4'),
    items: z.array(
      z
        .object({
          name: featureName,
          description: z.string(),
          itemSha256: hash,
          files: z.array(expectedFile).min(1),
        })
        .strict(),
    ),
  })
  .strict()
const metadataSchema = z
  .object({
    schemaVersion: z.literal(1),
    version: z.string().regex(/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/),
    payloadVersions: z.array(z.string().regex(/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/)).min(1),
    frameworks: z.array(z.enum(['next', 'tanstack'])).min(1),
    databases: z.array(z.enum(['postgres', 'mongodb'])).min(1),
    auth: z.literal('native-payload'),
    guide: z.string(),
  })
  .strict()

function invalid(message: string): never {
  throw new ToolkitError('invalid-item', message)
}

function projectPath(value: string): string {
  if (
    !value ||
    value.includes('\\') ||
    value.includes('\0') ||
    value
      .split('/')
      .some(
        (part) =>
          !part || part === '.' || part === '..' || part.includes(':') || part.startsWith('~'),
      )
  )
    invalid(`Unsafe registry target: ${value}`)
  return value
}

async function catalog() {
  try {
    const parsed = catalogSchema.parse(
      JSON.parse(await Bun.file(join(assetDirectory, 'catalog.json')).text()),
    )
    if (new Set(parsed.items.map((item) => item.name)).size !== parsed.items.length)
      invalid('Duplicate registry item names')
    return parsed
  } catch (error) {
    if (error instanceof ToolkitError) throw error
    return invalid('Bundled registry catalog is missing or invalid. Rebuild the toolkit registry.')
  }
}

export async function describeRegistries() {
  const entry = z.object({
    namespace: z.string(),
    name: z.string(),
    description: z.string(),
    homepage: z.string().url(),
    repository: z.string().url(),
    url: z.string(),
    compatibility: z
      .object({ upstream: z.string(), documentation: z.string().url().optional() })
      .optional(),
  })
  return z
    .object({ schemaVersion: z.literal(1), registries: z.array(entry) })
    .parse(JSON.parse(await Bun.file(join(assetDirectory, 'community-registries.json')).text()))
    .registries
}

export async function describeFeatures(): Promise<
  readonly { name: string; description: string }[]
> {
  return (await catalog()).items.map(({ name, description }) => ({ name, description }))
}

export function prepareFeatures(
  names: readonly string[],
  host: Host,
): Promise<readonly BundledFeature[]>
export function prepareFeatures(
  names: readonly string[],
  host: Host,
  context: { project: string; workspace: string; attempt: Attempt; signal?: AbortSignal },
): Promise<readonly Feature[]>
export async function prepareFeatures(
  names: readonly string[],
  host: Host,
  context?: { project: string; workspace: string; attempt: Attempt; signal?: AbortSignal },
): Promise<readonly Feature[]> {
  const entries = (await catalog()).items
  const features: Feature[] = []
  for (const name of new Set(names.filter((value) => !externalReference(value)))) {
    const entry = entries.find((item) => item.name === name)
    if (!entry) invalid(`Unknown feature: ${name}`)
    const itemPath = join(assetDirectory, `${entry.name}.json`)
    if (digest(await Bun.file(itemPath).bytes()) !== entry.itemSha256)
      invalid(`Bundled item identity mismatch: ${name}`)
    // Keep fetched metadata. The aggregate returned by resolveRegistryItems omits it.
    // Namespaced Windows paths prevent shadcn from fetching a drive-letter URL.
    const itemReference = toNamespacedPath(itemPath)
    const [raw] = await getRegistryItems([itemReference], { useCache: false })
    const parsed = registryItemSchema.safeParse(raw)
    if (!parsed.success) invalid(`Invalid shadcn item: ${name}`)
    const item = parsed.data
    const metadata = metadataSchema.safeParse(item.meta?.payloadToolkit)
    if (!metadata.success) invalid(`Invalid Payload metadata: ${name}`)
    const meta = metadata.data
    if (
      !meta.payloadVersions.includes(host.payloadVersion) ||
      !meta.frameworks.includes(host.framework) ||
      !meta.databases.includes(host.database)
    ) {
      throw new ToolkitError(
        'incompatible',
        `${name} does not support ${host.framework}/${host.database} with Payload ${host.payloadVersion}`,
      )
    }
    if (
      item.name !== name ||
      item.type !== 'registry:item' ||
      item.registryDependencies?.length ||
      item.devDependencies?.length ||
      item.css ||
      item.cssVars ||
      item.envVars ||
      item.tailwind
    )
      invalid(`Unsupported registry behavior: ${name}`)
    const guide = projectPath(meta.guide)
    const targets = new Set<string>()
    for (const file of item.files ?? []) {
      if (
        file.type !== 'registry:file' ||
        !file.target?.startsWith('~/') ||
        typeof file.content !== 'string'
      )
        invalid(`Unanchored or missing registry source: ${name}`)
      const target = projectPath(file.target.slice(2))
      if (targets.has(target)) invalid(`Duplicate registry target: ${target}`)
      targets.add(target)
      const expected = entry.files.find((value) => value.path === target)
      if (
        !expected ||
        digest(file.content) !== expected.sourceSha256 ||
        expected.role !== (target === guide ? 'guide' : 'source')
      )
        invalid(`Registry source identity mismatch: ${target}`)
      if (expected.role === 'guide' && expected.sha256 !== expected.sourceSha256)
        invalid(`Guide bytes must be unchanged: ${target}`)
    }
    if (targets.size !== entry.files.length || !targets.has(guide))
      invalid(`Registry files do not match catalog: ${name}`)
    const dependencies: Record<string, string> = {}
    for (const dependency of item.dependencies ?? []) {
      const split = dependency.lastIndexOf('@')
      const packageName = dependency.slice(0, split)
      const version = dependency.slice(split + 1)
      if (
        split < 1 ||
        !/^(@[a-z0-9-]+\/)?[a-z0-9][a-z0-9._-]*$/.test(packageName) ||
        !/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(version)
      )
        invalid(`Dependency must be pinned: ${dependency}`)
      if (packageName.startsWith('@payloadcms/') && !meta.payloadVersions.includes(version))
        invalid(`Payload dependency tuple mismatch: ${dependency}`)
      dependencies[packageName] = version
    }
    await resolveRegistryItems([itemReference], { useCache: false })
    features.push(
      Object.freeze({
        name,
        version: meta.version,
        itemPath,
        itemSha256: entry.itemSha256,
        files: Object.freeze(entry.files.map((file) => Object.freeze(file))),
        dependencies: Object.freeze(dependencies),
        guide,
      }),
    )
  }
  const external = names.filter(externalReference)
  if (external.length) {
    if (!context)
      invalid(
        'External registry preparation requires an inspected host and owned preparation directory',
      )
    features.push(
      await prepareExternal(
        context.project,
        external,
        host,
        context.workspace,
        context.attempt,
        context.signal,
      ),
    )
  }
  const allPaths = features.flatMap((feature) => feature.files.map((file) => file.path))
  if (new Set(allPaths).size !== allPaths.length)
    invalid('Features declare overlapping file targets')
  return Object.freeze(features)
}

async function safeFile(project: string, target: string): Promise<string> {
  projectPath(target)
  if ((await lstat(project)).isSymbolicLink())
    throw new ToolkitError('collision', `Project path is a symlink: ${project}`)
  let current = await realpath(project)
  const parts = target.split('/')
  for (let index = 0; index < parts.length; index++) {
    current = join(current, parts[index]!)
    try {
      const stat = await lstat(current)
      if (
        stat.isSymbolicLink() ||
        (index < parts.length - 1 ? !stat.isDirectory() : !stat.isFile())
      )
        throw new ToolkitError('collision', `Unsafe registry destination: ${target}`)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }
  return current
}

async function dependenciesPresent(
  project: string,
  dependencies: Readonly<Record<string, string>>,
): Promise<boolean> {
  const manifest: { dependencies?: Record<string, string> } = JSON.parse(
    await Bun.file(join(project, 'package.json')).text(),
  )
  const require = createRequire(pathToFileURL(join(project, 'package.json')))
  for (const [name, version] of Object.entries(dependencies)) {
    if (manifest.dependencies?.[name] !== version) return false
    try {
      let directory = dirname(require.resolve(name))
      let found = false
      while (directory !== dirname(directory)) {
        try {
          const installed: { name?: string; version?: string } = JSON.parse(
            await Bun.file(join(directory, 'package.json')).text(),
          )
          if (installed.name === name) {
            found = installed.version === version
            break
          }
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') return false
        }
        directory = dirname(directory)
      }
      if (!found) return false
    } catch {
      return false
    }
  }
  return true
}

export async function inspectFeatures(
  project: string,
  features: readonly Feature[],
): Promise<{ complete: boolean; files: readonly FileIdentity[] }> {
  const files: FileIdentity[] = []
  let complete = true
  for (const feature of features) {
    if (isExternal(feature)) {
      const inspected = await inspectExternal(project, feature)
      files.push(...inspected.files)
      if (!inspected.complete) complete = false
      continue
    }
    for (const file of feature.files) {
      const target = await safeFile(project, file.path)
      try {
        const sha256 = digest(await Bun.file(target).bytes())
        if (sha256 !== file.sha256)
          throw new ToolkitError(
            'collision',
            `Existing file differs from ${feature.name}: ${file.path}. Review it before installing; dirty permission does not permit overwriting.`,
          )
        files.push({ path: file.path, sha256 })
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
        complete = false
      }
    }
  }
  for (const feature of features)
    if (!isExternal(feature) && !(await dependenciesPresent(project, feature.dependencies)))
      complete = false
  return { complete, files }
}

const workerFlag = '--payload-toolkit-registry-worker'

async function installInWorker(
  project: string,
  features: readonly Feature[],
  signal?: AbortSignal,
): Promise<void> {
  signal?.throwIfAborted()
  await new Promise<void>((resolvePromise, reject) => {
    const modulePath = fileURLToPath(import.meta.url)
    const execArgv: string[] = []
    const environment = { ...process.env }
    for (const key of Object.keys(environment))
      if (key.toLowerCase() === 'npm_config_save_exact') delete environment[key]
    environment.npm_config_save_exact = 'true'
    const worker = fork(modulePath, [workerFlag], {
      cwd: project,
      execArgv,
      env: environment,
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    })
    let errorMessage = ''
    let succeeded = false
    let termination: Promise<void> | undefined
    let terminationFailure: ToolkitError | undefined
    worker.stdout?.resume()
    worker.stderr?.on('data', (chunk: Buffer) => {
      errorMessage = (errorMessage + chunk.toString()).slice(-4000)
    })
    worker.on('message', (message: unknown) => {
      if (typeof message === 'object' && message !== null && 'ok' in message)
        succeeded = message.ok === true
    })
    const forceClose = () => {
      if (worker.exitCode === null && worker.signalCode === null) worker.kill('SIGKILL')
      worker.stdout?.destroy()
      worker.stderr?.destroy()
      if (worker.connected) worker.disconnect()
    }
    const failedTermination = (error: unknown) => {
      terminationFailure = new ToolkitError(
        'termination-unconfirmed',
        `Registry process-tree termination could not be confirmed: ${error instanceof Error ? error.message : String(error)}. The target lease requires manual recovery.`,
      )
      forceClose()
    }
    const abort = () => {
      if (!worker.pid || termination) return
      if (worker.exitCode !== null || worker.signalCode !== null) {
        termination = Promise.resolve()
        failedTermination(new Error('Owned worker already exited; descendants are uncertain'))
      } else if (process.platform === 'win32') {
        termination = terminateWindowsTree(worker.pid).catch(failedTermination)
      } else {
        const kill = (value: NodeJS.Signals) => {
          try {
            process.kill(-worker.pid!, value)
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error
          }
        }
        // Final cancellation signals the still-owned group before its leader can exit.
        termination = Promise.resolve()
        try {
          kill('SIGTERM')
          kill('SIGKILL')
        } catch (error) {
          failedTermination(error)
        }
      }
    }
    signal?.addEventListener('abort', abort, { once: true })
    worker.on('error', reject)
    worker.on('close', async (code) => {
      signal?.removeEventListener('abort', abort)
      try {
        await termination
      } catch (error) {
        reject(error)
        return
      }
      if (terminationFailure) {
        reject(terminationFailure)
        return
      }
      if (signal?.aborted)
        reject(
          new ToolkitError(
            'interrupted',
            'Registry installation interrupted after stopping its worker. Partial files may remain.',
          ),
        )
      else if (code === 0 && succeeded) resolvePromise()
      else
        reject(
          new ToolkitError(
            'registry-install-failed',
            `Registry installation failed. Partial files may remain.${errorMessage ? ` ${errorMessage.trim()}` : ''}`,
          ),
        )
    })
    worker.send({ project, features })
    if (signal?.aborted) abort()
  })
}

export async function installFeatures(
  project: string,
  features: readonly Feature[],
  signal?: AbortSignal,
): Promise<readonly FileIdentity[]> {
  signal?.throwIfAborted()
  const before = await inspectFeatures(project, features)
  if (before.complete) return before.files
  for (const feature of features)
    if (digest(await Bun.file(feature.itemPath).bytes()) !== feature.itemSha256)
      invalid(`Bundled item changed before install: ${feature.name}`)
  await installInWorker(project, features, signal)
  const after = await inspectFeatures(project, features)
  if (!after.complete)
    throw new ToolkitError(
      'registry-install-failed',
      'Registry returned without all expected files and installed dependencies. Partial files remain for inspection.',
    )
  return after.files
}

if (
  process.argv[2] === workerFlag &&
  process.send &&
  resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)
) {
  process.once('message', async (input: { project: string; features: Feature[] }) => {
    try {
      await inspectFeatures(input.project, input.features)
      for (const feature of input.features)
        if (digest(await Bun.file(feature.itemPath).bytes()) !== feature.itemSha256)
          invalid(`Bundled item changed: ${feature.name}`)
      for (const feature of input.features)
        if (isExternal(feature)) await publishExternalConfig(input.project, feature)
      const config = await getRegistriesConfig(input.project)
      await addRegistryItems(
        input.features.map((feature) => toNamespacedPath(feature.itemPath)),
        { cwd: input.project, config, overwrite: false, silent: true },
      )
      process.send?.({ ok: true })
      process.disconnect()
    } catch (error) {
      console.error(error instanceof Error ? error.message : 'Registry installation failed')
      process.exitCode = 1
      process.disconnect()
    }
  })
}
