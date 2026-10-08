/**
 * Candidate B. Design documentation only. Every body is intentionally a stub.
 *
 * Usage is the specification and appears before the types.
 *
 * 1. CLI after parsing terminal arguments and resolving missing interactive choices:
 *
 * import { run } from '@payload-toolkit/workspace'
 * const result = await run({
 *   command: 'init', directory: './acme', framework: 'next', database: 'postgres',
 *   template: 'minimal', packageManager: 'pnpm',
 *   databaseUri: { environment: 'DATABASE_URI' }, git: 'require-clean',
 *   integration: { agent: 'none' },
 * }, renderHumanEvent)
 * process.exitCode = result.exitCode
 *
 * 2. Existing project, explicit dirty override, JSON output and strict invocation:
 *
 * const result = await run({
 *   command: 'add', directory: './existing-app', features: ['forms'],
 *   git: 'record-dirty', integration: { agent: 'claude', strictInvocation: true },
 * }, writeJsonEvent)
 * // result.installation may be complete while result.agent is failed.
 * // strictInvocation changes that command's exit code, never verification status.
 *
 * 3. Contributor fixture command through the packed distribution:
 *
 * pnpm setup -- --run forms-next-postgres
 * pnpm doctor -- --run forms-next-postgres
 * pnpm verify -- --run forms-next-postgres
 * pnpm evidence -- --run forms-next-postgres
 * pnpm cleanup -- --run forms-next-postgres
 *
 * The contributor runner invokes the packed CLI, applies committed integration
 * code, then runs independent checks. It does not import the private plan type.
 */

// Public domain contract of the private workspace package. No shadcn wire types.

type Framework = 'next' | 'tanstack'
type Database = 'postgres' | 'mongodb'
type PackageManager = 'npm' | 'pnpm' | 'bun'
type FeatureId = 'forms' // Generated from the single registry item list.
type NonEmpty<T> = readonly [T, ...T[]]
type GitPolicy = 'require-clean' | 'record-dirty'
type AgentChoice =
  | { readonly agent: 'none' }
  | { readonly agent: 'codex' | 'claude'; readonly strictInvocation: boolean }

type RequestContext = {
  readonly directory: string
  readonly git: GitPolicy
  readonly integration: AgentChoice
}

export type InstallRequest = RequestContext & (
  | {
      readonly command: 'init'
      readonly framework: Framework
      readonly database: Database
      readonly packageManager: PackageManager
      /** CLI prompt values use a private secret store, never JSON request fields. */
      readonly databaseUri: SecretInput
    } & (
      | { readonly template: 'minimal' }
      | { readonly template: 'custom'; readonly features: NonEmpty<FeatureId> }
    )
  | { readonly command: 'add'; readonly features: NonEmpty<FeatureId> }
)

type SecretInput =
  | { readonly environment: 'DATABASE_URI' }
  | { readonly promptedSecret: SecretHandle }

type Failure = {
  readonly code: string
  readonly message: string
  readonly affectedPaths: readonly string[]
}

export type InstallationOutcome =
  | { readonly status: 'complete'; readonly disposition: 'installed' | 'already-present'; readonly receipt: ReceiptRef }
  | { readonly status: 'blocked'; readonly reasons: NonEmpty<Failure>; readonly mutated: false; readonly receipt: ReceiptRef }
  | { readonly status: 'failed' | 'interrupted'; readonly partial: boolean; readonly receipt: ReceiptRef; readonly reason: Failure }

export type AgentOutcome =
  | { readonly status: 'not-requested'; readonly handoff: Handoff | null }
  | { readonly status: 'not-started'; readonly reason: 'installation-incomplete' | 'no-feature-guide' }
  | { readonly status: 'completed'; readonly agent: 'codex' | 'claude'; readonly receipt: ReceiptRef }
  | { readonly status: 'failed' | 'interrupted'; readonly agent: 'codex' | 'claude'; readonly receipt: ReceiptRef; readonly reason: Failure; readonly handoff: Handoff }

export type VerificationOutcome =
  | { readonly status: 'not-run'; readonly reason: 'installation-only' | 'integration-not-verified' }
  | { readonly status: 'passed'; readonly checkedSource: Sha256; readonly receipt: ReceiptRef }
  | { readonly status: 'failed' | 'interrupted'; readonly checkedSource: Sha256; readonly receipt: ReceiptRef; readonly failures: NonEmpty<Failure> }

type Handoff = {
  readonly prompt: string
  readonly installedGuides: NonEmpty<{ readonly path: string; readonly sha256: Sha256 }>
  readonly installationReceipt: ReceiptRef
}

export type CommandResult = {
  readonly attempt: AttemptId
  readonly installation: InstallationOutcome
  readonly agent: AgentOutcome
  readonly verification: VerificationOutcome
  readonly exitCode: 0 | 1 | 2
}

type Stage = 'target-check' | 'bootstrap' | 'registry' | 'handoff' | 'agent' | 'final-observation'
export type StageEvent =
  | { readonly kind: 'stage-started'; readonly attempt: AttemptId; readonly stage: Stage }
  | { readonly kind: 'stage-finished'; readonly attempt: AttemptId; readonly stage: Stage; readonly status: 'completed' | 'skipped' }
  | { readonly kind: 'stage-failed'; readonly attempt: AttemptId; readonly stage: Stage; readonly failure: Failure }
  | { readonly kind: 'plan-summary'; readonly attempt: AttemptId; readonly plan: PlanId; readonly target: string; readonly features: readonly FeatureId[] }
  | { readonly kind: 'completed'; readonly result: CommandResult }

export type EventObserver = (event: StageEvent) => void

/** Sole exported operation. The CLI renders events and uses the returned status. */
export async function run(request: InstallRequest, observe?: EventObserver): Promise<CommandResult> {
  // TODO Validate the domain request, including paths and any runtime JS caller.
  // TODO Resolve secret inputs without persisting values in plans/events/receipts.
  // TODO Acquire the target lease and record the Git/filesystem starting snapshot.
  // TODO Resolve bundled qualified catalog data and make one frozen plan.
  // TODO Execute the two closed cases using the private workspace owner below.
  // TODO Persist outcome before notifying the observer; observer failure is not a retry.
  throw new Error('not implemented')
}

// Private domain. Workspace owns construction, freezing and execution of every plan.

declare const opaque: unique symbol
type Opaque<T, Name extends string> = T & { readonly [opaque]: Name }
type Sha256 = Opaque<string, 'Sha256'>
type AttemptId = Opaque<string, 'AttemptId'>
type PlanId = Opaque<string, 'PlanId'>
type SecretHandle = Opaque<string, 'SecretHandle'>
type ReceiptRef = Opaque<string, 'ReceiptRef'>
type TargetLease = Opaque<{ readonly target: string; readonly attempt: AttemptId }, 'TargetLease'>

type Snapshot = {
  readonly head: string | null
  readonly git: 'clean' | 'dirty-accepted' | 'not-a-repository'
  readonly indexDigest: Sha256 | null
  readonly status: readonly { readonly path: string; readonly status: string }[]
  readonly sourceDigest: Sha256
  readonly files: Readonly<Record<string, Sha256 | 'absent'>>
  readonly scope: 'tracked-and-unignored-source-plus-install-targets'
  // Dependency/build directories and secret values are excluded explicitly.
}

type BootstrapTuple = {
  readonly generator: 'create-payload-app@4.0.0-canary.38'
  readonly templateCommit: 'a3e91f11d020907600ba27f199368869f1bb6daa'
  readonly payload: '4.0.0-canary.38'
  readonly template: 'blank' | 'blank-tanstack'
  readonly framework: Framework
  readonly database: Database
  readonly qualification: ReceiptRef
}

type ArtifactExpectation = {
  readonly target: string
  readonly role: 'source' | 'guide'
  readonly itemDigest: Sha256
  readonly sourceDigest: Sha256
  readonly installedDigest: Sha256 // Qualified shadcn output, never our own transform.
}

type FeaturePackage = {
  readonly feature: FeatureId
  readonly itemJson: string // Verified local bundled JSON, accepted by public shadcn APIs.
  readonly itemDigest: Sha256
  readonly shadcn: '4.21.4'
  readonly profile: 'universal-first-party-v1'
  readonly artifacts: NonEmpty<ArtifactExpectation>
  readonly guide: ArtifactExpectation & { readonly role: 'guide' }
  readonly requiredPackages: readonly { readonly name: string; readonly version: string }[]
}

type Host = {
  readonly framework: Framework
  readonly database: Database
  readonly payloadVersion: string
  readonly nativeAdmin: 'present'
  readonly packageManager: PackageManager
  readonly lockfileDigest: Sha256
}

type InstallPlan = {
  readonly id: PlanId
  readonly target: string
  readonly baseline: Snapshot
  readonly catalogDigest: Sha256
  readonly features: readonly FeaturePackage[]
  readonly integration: AgentChoice
} & (
  | { readonly kind: 'init'; readonly base: BootstrapTuple; readonly targetMustBe: 'absent'; readonly manager: PackageManager; readonly secret: SecretHandle }
  | { readonly kind: 'add'; readonly host: Host }
)

type Catalog = Opaque<{
  readonly digest: Sha256
  readonly bootstraps: readonly BootstrapTuple[]
  readonly features: readonly FeaturePackage[]
}, 'QualifiedCatalog'>

/** Pure policy, closed data union. No stage array, command strings or serialized execution. */
function planInstallation(request: InstallRequest, before: Snapshot, host: Host | null, catalog: Catalog): InstallPlan {
  // TODO Require qualified tuple, native auth, valid target and consistent manager markers.
  // TODO Select exact item/profile and reject dirty policy violations or existing conflicts.
  // TODO Freeze records; derive plan identity without including secret values.
  throw new Error('not implemented')
}

class Workspace {
  async execute(plan: InstallPlan, lease: TargetLease, observe: EventObserver): Promise<CommandResult> {
    // TODO Persist starting journal before mutation. Recheck baseline at writer boundaries.
    // TODO INIT: official generation in a clean staging parent, inspect output, publish to absent target.
    // TODO ADD: compare expected files; matching files need no rewrite; conflicts stop before mutation.
    // TODO Delegate missing artifacts/dependencies to shadcn, then read every expected output.
    // TODO Record partial state on any failure; never rollback, stash, reset, stage or commit.
    // TODO Only a complete receipt permits handoff. Rehash guide before optional agent execution.
    // TODO Capture post-agent source, persist result, release lease. Agent exit is not verification.
    throw new Error('not implemented')
  }
}

// Registry adapter alone knows upstream wire types. Metadata survives fetch, not tree aggregation.

type PayloadMetadata = {
  readonly schema: 1
  readonly feature: FeatureId
  readonly version: string
  readonly payloadVersions: NonEmpty<string>
  readonly frameworks: NonEmpty<Framework>
  readonly auth: 'native-payload'
  readonly guideTarget: string
}

function parseRegistryItem(raw: unknown, expected: FeaturePackage): PayloadMetadata {
  // TODO First registryItemSchema.safeParse; then parse strict meta.payloadToolkit.
  // TODO Fetch with public getRegistryItems before resolution, which discards item metadata.
  // TODO V1 universal files use ~/payload-toolkit/forms/plugin.ts and example-form.tsx,
  //      plus ~/docs/payload-toolkit/forms/guide.md, to retain root targets with or without src/.
  // TODO Require contained canonical paths, no symlink escapes, no registryDependencies/CSS/env.
  // TODO Compare raw content identity to catalog. Keep source and transformed output hashes separate.
  throw new Error('not implemented')
}

async function installRegistryFiles(items: readonly FeaturePackage[], lease: TargetLease): Promise<void> {
  // TODO Rehash bundled items, load getRegistriesConfig, pass the qualified universal config.
  // TODO addRegistryItems(localJsonPaths, { cwd, config, overwrite: false, silent: true }).
  // TODO No custom resolution, transform, package-manager override, dryRun or skipInstall.
  // TODO This return proves only a successful call; the workspace inspects actual files afterward.
  throw new Error('not implemented')
}

async function createOfficialBase(base: BootstrapTuple, staging: string, secret: SecretHandle, manager: PackageManager): Promise<Snapshot> {
  // TODO Invoke pinned binary with argument array, exact branch/template/Payload/db/manager.
  // TODO Pass URI, --no-git and --no-agent, retaining upstream dependency install and codegen.
  // TODO Verify actual manifests, adapter, dependencies and generated files despite zero exit.
  // TODO Preserve failed staging; redact secret arguments. Never import generator internals.
  throw new Error('not implemented')
}

// A receipt is an observation at a boundary. It cannot authorize replay of a prior plan.

type InstallationReceipt = {
  readonly attempt: AttemptId
  readonly predecessor: AttemptId | null
  readonly plan: PlanId
  readonly toolkitRevision: string
  readonly packedCliDigest: Sha256
  readonly catalogDigest: Sha256
  readonly base: BootstrapTuple | null
  readonly before: Snapshot
  readonly after: Snapshot
  readonly files: readonly (ArtifactExpectation & { readonly observed: Sha256 | 'missing'; readonly previous: Sha256 | 'missing' })[]
  readonly dependencies: { readonly manager: PackageManager; readonly version: string; readonly lockfile: Sha256; readonly satisfied: boolean }
  readonly nodeVersion: string
  readonly writerResults: readonly { readonly stage: 'bootstrap' | 'registry'; readonly result: 'returned' | 'failed' | 'interrupted'; readonly log: ReceiptRef }[]
  readonly failedStaging: string | null
}

type CompleteInstallation = Opaque<InstallationReceipt, 'CompleteInstallation'>
function acceptInstallation(plan: InstallPlan, receipt: InstallationReceipt): CompleteInstallation {
  // TODO Require matching identities, all observed installed hashes and required dependencies.
  // TODO Guide source/installed/observed hashes must all match. No normalization shortcuts.
  throw new Error('not implemented')
}

async function handoffOrInvoke(choice: AgentChoice, installation: CompleteInstallation, lease: TargetLease): Promise<AgentOutcome> {
  // TODO None: return copyable prompt referencing exact observed guide and receipt.
  // TODO Otherwise record executable/version; invoke Codex exec or Claude print in target cwd.
  // TODO Retain user account, permissions/rules; no bypass flags, settings or model overrides.
  // TODO Persist before/after source, transcripts and distinct missing/failed/interrupted outcomes.
  throw new Error('not implemented')
}

function installationExitCode(install: InstallationOutcome, agent: AgentOutcome, choice: AgentChoice): 0 | 1 | 2 {
  // TODO 1 for incomplete installation; 2 for strict invocation failure; otherwise 0.
  // TODO Verification outcome and agent claims never enter this decision.
  throw new Error('not implemented')
}

// Contributor package operates packed CLI fixtures with isolated resource ownership.

type Fixture = {
  readonly id: string
  readonly attempt: AttemptId
  readonly project: string
  readonly evidenceDirectory: string
  readonly framework: Framework
  readonly database: Database
  readonly manager: PackageManager
  readonly ownedResources: readonly { readonly id: string; readonly createdBy: AttemptId; readonly kind: 'container' | 'database' | 'process' | 'directory' }[]
}

type VerificationReceipt = {
  readonly fixture: string
  readonly attempt: AttemptId
  readonly predecessor: AttemptId | null
  readonly installation: ReceiptRef
  readonly testedRevision: string
  readonly packedCliDigest: Sha256
  readonly checkRevision: string
  readonly sourceBefore: Snapshot
  readonly sourceAfter: Snapshot
  readonly itemAndGuideDigests: readonly Sha256[]
  readonly nodeAndManagerVersions: readonly string[]
  readonly lockfileDigest: Sha256
  readonly command: readonly string[]
  readonly checks: readonly { readonly id: string; readonly status: 'passed' | 'failed' | 'interrupted'; readonly artifactDigests: readonly Sha256[] }[]
  readonly resourceIds: readonly string[]
  readonly cleanup: 'pending' | 'completed' | 'failed'
}

async function verifyFixture(fixture: Fixture, mappedChecks: NonEmpty<string>): Promise<VerificationOutcome> {
  // TODO Install packed CLI output, apply committed guide recipe, then snapshot/check readiness.
  // TODO Run mapped codegen/static/build, native admin, browser submission, persistence/access,
  //      example validation and correlated console-log predicates. Preserve failed attempts.
  // TODO Reject source drift during checks. Default agents are mocks; real models require opt-in.
  throw new Error('not implemented')
}

async function cleanupFixture(fixture: Fixture): Promise<'completed' | 'failed'> {
  // TODO Remove only recorded owned resources; preserve external services and all evidence.
  throw new Error('not implemented')
}

function parseProofForReporter(raw: unknown, trustedRun: { readonly repository: string; readonly pullRequest: number; readonly head: string; readonly run: string; readonly attempt: number }): VerificationReceipt {
  // TODO Protected reporter validates bounded JSON plus platform repository/PR/head/run identity.
  // TODO Never execute contributed artifacts. Emit links/digests, preserve maintainer authority.
  throw new Error('not implemented')
}
