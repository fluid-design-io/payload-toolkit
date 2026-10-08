import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { z } from 'zod'
import {
  addRequestSchema,
  initRequestSchema,
  resultSchema,
  isExternal,
  ToolkitError,
} from './model.js'
import type {
  AddRequest,
  Feature,
  FileIdentity,
  InitRequest,
  InstallationOutcome,
  Result,
  RunOptions,
} from './model.js'
import { Attempt, digest, redact } from './private/attempts.js'
import {
  canonicalTarget,
  acquireLease,
  exists,
  inspectHost,
  manifest,
  requireClean,
  requireExpectedChanges,
  requireUnchanged,
  snapshot,
} from './private/project.js'
import {
  bootstrap,
  completeOfficialProject,
  createOfficialSource,
  projectName,
  publishOfficialSource,
  requireNode,
} from './private/official.js'
import { integrationPrompt, invokeAgent } from './private/agents.js'
import {
  describeFeatures as registryDescriptions,
  describeRegistries as registryDirectory,
  externalReference,
  installFeatures,
  inspectFeatures,
  prepareFeatures,
} from './private/registry.js'

export type {
  AddRequest,
  InitRequest,
  Result,
  RunOptions,
  Event,
  Host,
  Feature,
  FileIdentity,
} from './model.js'
export { addRequestSchema, initRequestSchema, resultSchema } from './model.js'
export async function describeFeatures(): Promise<
  readonly { name: string; description: string }[]
> {
  return registryDescriptions()
}

export async function describeRegistries() {
  return registryDirectory()
}

const blockedCodes = new Set([
  'invalid-target',
  'target-exists',
  'target-busy',
  'dirty-project',
  'external-drift',
  'incompatible',
  'invalid-item',
  'collision',
  'package-manager',
  'node-version',
  'git-unavailable',
])

async function operate(
  kind: 'init' | 'add',
  raw: InitRequest | AddRequest,
  options: RunOptions,
): Promise<Result> {
  const secrets = 'databaseUrl' in raw && raw.databaseUrl ? [raw.databaseUrl] : []
  const attempt = new Attempt(options, secrets)
  let target = path.resolve(typeof raw.directory === 'string' ? raw.directory : '.')
  await attempt.start(kind, target)
  let release: ((recoveryReason?: string) => Promise<void>) | undefined
  let staging: string | undefined
  let partial = false
  let installed: InstallationOutcome | undefined
  let request: InitRequest | AddRequest | undefined
  let advisories: { reference: string; message: string }[] = []
  try {
    const input =
      kind === 'init'
        ? { kind: 'init' as const, request: initRequestSchema.parse(raw) }
        : { kind: 'add' as const, request: addRequestSchema.parse(raw) }
    request = input.request
    if (kind === 'init') requireNode()
    options.signal?.throwIfAborted()
    target = await canonicalTarget(request.directory)
    release = await acquireLease(target, attempt.id)
    await attempt.event('preflight', 'started', `Inspecting ${target}`)
    if (kind === 'init' && (await exists(target)))
      throw new ToolkitError(
        'target-exists',
        'Initialization requires an absent destination; existing files were preserved',
      )
    if (kind === 'add' && !(await exists(target)))
      throw new ToolkitError('invalid-target', 'Existing project directory does not exist')
    let baseline = await snapshot(target)
    await attempt.fact('baseline', baseline)
    requireClean(baseline, request.allowDirty)
    await attempt.event('preflight', 'complete', 'Git and target policy accepted')
    let features: readonly Feature[]
    let files: readonly FileIdentity[] = []
    let disposition: 'installed' | 'already-present' = 'installed'
    if (input.kind === 'init') {
      const initRequest = input.request
      const name = projectName(target)
      features = await prepareFeatures(
        initRequest.features.filter((value) => !externalReference(value)),
        {
          framework: initRequest.framework,
          database: initRequest.database,
          packageManager: initRequest.packageManager,
          payloadVersion: bootstrap.payload,
        },
      )
      staging = await mkdtemp(path.join(tmpdir(), 'payload-toolkit-'))
      await attempt.fact('staging', { path: staging })
      await attempt.event('bootstrap', 'started', 'Generating official source in clean staging')
      const source = await createOfficialSource(staging, name, initRequest, attempt, options.signal)
      options.signal?.throwIfAborted()
      await requireUnchanged(target, baseline)
      await attempt.event(
        'publish',
        'started',
        'Publishing source into an exclusively reserved destination',
      )
      // Set partial before reserving/copying: publication may fail between writes.
      partial = true
      await publishOfficialSource(source, target)
      await attempt.event(
        'publish',
        'complete',
        'Official source published; dependencies install at the final path',
      )
      await attempt.event(
        'dependencies',
        'started',
        'Installing dependencies and generating official artifacts',
      )
      await completeOfficialProject(target, initRequest, attempt, options.signal)
      await attempt.event(
        'dependencies',
        'complete',
        'Installed packages and generated artifacts match the official tuple',
      )
      const afterBootstrap = await snapshot(target)
      requireExpectedChanges(target, baseline, afterBootstrap, 'project')
      baseline = afterBootstrap
      if (initRequest.features.some(externalReference)) {
        features = await prepareFeatures(
          initRequest.features,
          {
            framework: initRequest.framework,
            database: initRequest.database,
            packageManager: initRequest.packageManager,
            payloadVersion: bootstrap.payload,
          },
          {
            project: target,
            workspace: path.join(attempt.directory, 'preparation'),
            attempt,
            signal: options.signal,
          },
        )
      }
    } else {
      const host = await inspectHost(target, input.request)
      await attempt.fact('host', host)
      features = await prepareFeatures(request.features, host, {
        project: target,
        workspace: path.join(attempt.directory, 'preparation'),
        attempt,
        signal: options.signal,
      })
      const inspection = await inspectFeatures(target, features)
      if (inspection.complete) {
        files = inspection.files
        disposition = 'already-present'
      }
    }
    advisories = features.flatMap((feature) =>
      isExternal(feature)
        ? feature.provenance.advisories.map((message) => ({
            reference: feature.provenance.references.join(', '),
            message,
          }))
        : [],
    )
    await attempt.fact('advisories', advisories)
    for (const advisory of advisories) await attempt.event('advisory', 'complete', advisory.message)
    if (features.length && disposition !== 'already-present') {
      await requireUnchanged(target, baseline)
      options.signal?.throwIfAborted()
      await attempt.event(
        'registry',
        'started',
        'Installing qualified registry source and dependencies',
      )
      partial = true
      files = await installFeatures(target, features, options.signal)
      await attempt.event(
        'registry',
        'complete',
        'Installed artifacts and dependencies match the qualified item',
      )
    }
    if (!features.length) {
      const pkg = await manifest(target)
      await attempt.fact('base-manifest', { sha256: digest(JSON.stringify(pkg)) })
      files = [
        {
          path: 'package.json',
          sha256: digest(await Bun.file(path.join(target, 'package.json')).bytes()),
        },
      ]
    }
    const postInstall = await snapshot(target)
    requireExpectedChanges(target, baseline, postInstall, [
      ...features.flatMap((feature) => feature.files.map((file) => file.path)),
      'package.json',
      'pnpm-lock.yaml',
      'package-lock.json',
      'npm-shrinkwrap.json',
      'bun.lock',
      'bun.lockb',
    ])
    await attempt.fact('installation-after', postInstall)
    await attempt.fact(
      'features',
      features.map((feature) => ({
        name: feature.name,
        version: feature.version,
        itemSha256: feature.itemSha256,
        files: feature.files,
        ...(isExternal(feature)
          ? { provenance: feature.provenance, preparation: feature.itemPath }
          : {}),
      })),
    )
    installed = { status: 'complete', disposition, project: target, files: [...files] }
    await attempt.fact('installation', installed)
    await attempt.event(
      'installation',
      'complete',
      'Installation complete; runtime verification was not run',
    )
    await requireUnchanged(target, postInstall)
    const prompt = await integrationPrompt(target, features)
    const agent = await invokeAgent(target, request.agent, prompt, attempt, options.signal)
    const exitCode =
      attempt.terminationFailure || (request.requireAgentSuccess && agent.status !== 'completed')
        ? 1
        : 0
    return await attempt.finish(
      resultSchema.parse({
        schemaVersion: 1,
        attempt: attempt.id,
        receipt: attempt.receipt,
        installation: installed,
        agent,
        advisories,
        verification: { status: 'not-run' },
        exitCode,
      }),
    )
  } catch (error) {
    const interrupted =
      (options.signal?.aborted ||
        (error instanceof ToolkitError && error.code === 'interrupted') ||
        (error instanceof Error && error.name === 'AbortError')) &&
      !(error instanceof ToolkitError && error.code === 'termination-unconfirmed')
    const invalid = error instanceof z.ZodError
    const blocked = invalid || (error instanceof ToolkitError && blockedCodes.has(error.code))
    const reason = redact(error instanceof Error ? error.message : String(error), secrets)
    if (error instanceof ToolkitError && error.code === 'termination-unconfirmed')
      attempt.terminationFailure = reason
    await attempt.fact(
      'failure-after',
      await snapshot(target).catch(() => ({ observation: 'unavailable' })),
    )
    await attempt.event(installed ? 'agent' : 'installation', 'failed', reason)
    // A handoff failure must not erase an already confirmed installation.
    const installation = installed || {
      status: interrupted ? 'interrupted' : blocked && !partial ? 'blocked' : 'failed',
      reason,
      partial,
      retainedPaths: [target, attempt.directory, ...(staging ? [staging] : [])].filter(Boolean),
    }
    const result = resultSchema.parse({
      schemaVersion: 1,
      attempt: attempt.id,
      receipt: attempt.receipt,
      installation,
      agent: { status: 'not-started', reason, prompt: null },
      advisories,
      verification: { status: 'not-run' },
      exitCode: installed
        ? attempt.terminationFailure || request?.requireAgentSuccess
          ? 1
          : 0
        : invalid || (blocked && !partial)
          ? 2
          : 1,
    })
    return await attempt.finish(result)
  } finally {
    await release?.(attempt.terminationFailure)
    if (staging && installed) await rm(staging, { recursive: true, force: true })
  }
}

export async function init(request: InitRequest, options: RunOptions = {}): Promise<Result> {
  return operate('init', request, options)
}
export async function add(request: AddRequest, options: RunOptions = {}): Promise<Result> {
  return operate('add', request, options)
}
