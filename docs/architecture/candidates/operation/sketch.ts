/**
 * Candidate A. Design documentation only. No body is implemented.
 * Caller usage is the specification. These are package-boundary sketches,
 * not a standalone executable or a replacement for the source modules.
 *
 * CLI usage:
 *
 * payload-toolkit init acme --framework next --database postgres --template minimal --package-manager pnpm
 * payload-toolkit init acme --framework tanstack --database mongodb --template custom --features forms --codex
 * payload-toolkit add forms --cwd ./existing-app --claude
 * payload-toolkit add forms --cwd ./existing-app --allow-dirty --json
 *
 * Call site 1, packages/cli/src/bin.ts:
 *
 * import { init, add } from '@payload-toolkit/operations'
 * const intent = await resolveCliIntent(process.argv.slice(2), terminal)
 * const outcome = intent.kind === 'init'
 *   ? await init(intent.request, { signal, onEvent: renderer.accept })
 *   : await add(intent.request, { signal, onEvent: renderer.accept })
 * renderer.finish(outcome, intent.exitPolicy)
 * process.exitCode = exitStatus(outcome, intent.exitPolicy)
 *
 * Call site 2, an existing-project invocation after CLI boundary validation:
 *
 * const outcome = await add({
 *   project: './existing-app',
 *   features: ['forms'],
 *   git: { kind: 'allow-dirty' },
 *   integration: { kind: 'manual' },
 * }, { signal, onEvent: emitJson })
 * if (outcome.kind === 'installed') {
 *   print(outcome.installation.receipt.guides)
 *   print(outcome.integration)
 *   // outcome.verification is still not-run.
 * }
 *
 * Call site 3, tooling/verify.ts; cleanup remains a finally operation:
 *
 * const fixture = await fixtures.create({ framework: 'next', database: 'postgres',
 *   packageManager: 'pnpm', services: { kind: 'docker' } })
 * try {
 *   const outcome = await init({
 *     destination: fixture.projectPath,
 *     framework: 'next', database: 'postgres', packageManager: 'pnpm',
 *     template: { kind: 'custom', features: ['forms'] },
 *     connection: fixture.connection, git: { kind: 'require-clean' },
 *     integration: { kind: 'manual' },
 *   }, { signal, onEvent: fixture.events })
 *   const proof = await verifyFixture({ fixture, installation: outcome.installation })
 *   await writeEvidence(proof)
 * } finally {
 *   await cleanupFixture(fixture)
 * }
 */

// ---------------------------------------------------------------------------
// Public @payload-toolkit/operations entry. CLI flags and wire objects stay out.
// ---------------------------------------------------------------------------

type Framework = 'next' | 'tanstack'
type Database = 'mongodb' | 'postgres'
type PackageManager = 'npm' | 'pnpm' | 'bun'
type NonEmpty<T> = readonly [T, ...T[]]

// Caller strings are validated once against the bundled catalog. No public
// registry URL or framework object is required to select the first-party item.
type FeatureName = string
type GitPolicy = { readonly kind: 'require-clean' } | { readonly kind: 'allow-dirty' }
type IntegrationChoice =
  | { readonly kind: 'manual' }
  | { readonly kind: 'agent'; readonly agent: 'codex' | 'claude' }

/** Opaque credential holder. String conversion and event serialization are forbidden. */
declare class SecretInput {
  private readonly secretBrand: never
  static fromEnvironment(name: string): SecretInput
}

type ConnectionChoice =
  | { readonly kind: 'configure-later' }
  | { readonly kind: 'provided'; readonly uri: SecretInput }

type InitRequest = {
  readonly destination: string
  readonly framework: Framework
  readonly database: Database
  readonly packageManager: PackageManager
  readonly connection: ConnectionChoice
  readonly template:
    | { readonly kind: 'minimal' }
    | { readonly kind: 'custom'; readonly features: NonEmpty<FeatureName> }
  readonly git: GitPolicy
  readonly integration: IntegrationChoice
}

type AddRequest = {
  readonly project: string
  readonly features: NonEmpty<FeatureName>
  readonly git: GitPolicy
  readonly integration: IntegrationChoice
}

type RunOptions = {
  readonly signal?: AbortSignal
  readonly onEvent?: (event: StageEvent) => void
}

type AttemptId = string & { readonly attemptBrand: unique symbol }
type ProjectId = string & { readonly projectBrand: unique symbol }
type Digest = string & { readonly sha256Brand: unique symbol }
type AbsolutePath = string & { readonly absolutePathBrand: unique symbol }
type RelativeTarget = string & { readonly relativeTargetBrand: unique symbol }
type ExactVersion = string & { readonly exactVersionBrand: unique symbol }
type CommitSha = string & { readonly fullCommitBrand: unique symbol }

type TupleIdentity = {
  readonly id: string
  readonly generator: { readonly package: 'create-payload-app'; readonly version: ExactVersion }
  readonly templateCommit: CommitSha
  readonly payloadVersion: ExactVersion
  readonly nodeVersion: ExactVersion
  readonly framework: Framework
  readonly database: Database
}

type ItemIdentity = {
  readonly feature: FeatureName
  readonly version: ExactVersion
  readonly item: Digest
  readonly closure: Digest
  readonly guide: Digest
}

type InstalledFile = {
  readonly target: RelativeTarget
  readonly content: Digest
  readonly disposition: 'written' | 'identical-existing'
}

type InstalledGuide = {
  readonly path: AbsolutePath
  readonly content: Digest
  readonly kind: 'official-readme' | 'feature-guide'
  readonly feature?: FeatureName
}

type GitBaseline =
  | { readonly kind: 'outside-git' }
  | {
      readonly kind: 'git'
      readonly root: AbsolutePath
      readonly head: CommitSha | 'unborn'
      readonly branch: string | 'detached'
      readonly index: Digest
      readonly status: readonly { readonly path: string; readonly index: string; readonly worktree: string }[]
      readonly relevantFiles: readonly { readonly path: RelativeTarget; readonly content: Digest }[]
      readonly dirtyPermission: GitPolicy['kind']
    }

type InstallationPostconditions = {
  readonly files: readonly InstalledFile[]
  readonly dependencies: readonly { readonly package: string; readonly requested: ExactVersion; readonly installed: ExactVersion }[]
  readonly packageManager: PackageManager
  readonly packageManagerVersion: ExactVersion
  readonly codegen: readonly CommandFact[]
  // These are installation facts. No runtime/database/browser check is inferred.
}

/** Only operations can mint this capability after postconditions and receipt flush. */
declare class InstalledReceipt {
  private readonly installedBrand: never
  readonly attempt: AttemptId
  readonly project: ProjectId
  readonly projectPath: AbsolutePath
  readonly tuple: TupleIdentity
  readonly items: readonly ItemIdentity[]
  readonly guides: NonEmpty<InstalledGuide>
  readonly gitBefore: GitBaseline
  readonly postconditions: InstallationPostconditions
  readonly journal: AbsolutePath
}

type PartialInstallation = {
  readonly attempt: AttemptId
  readonly journal: AbsolutePath
  readonly observedProject?: AbsolutePath
  readonly retainedStaging?: AbsolutePath
  readonly filesObserved: readonly { readonly target: RelativeTarget; readonly content: Digest | 'absent' }[]
  readonly lastMutation?: 'bootstrap' | 'registry-install' | 'publish'
  readonly interrupted: boolean
}

type InstallationIssue =
  | { readonly code: 'invalid-request'; readonly message: string }
  | { readonly code: 'incompatible'; readonly message: string; readonly actualPayload?: string }
  | { readonly code: 'dirty-project'; readonly baseline: GitBaseline }
  | { readonly code: 'target-exists'; readonly projectPath: AbsolutePath; readonly previousAttempts: readonly AbsolutePath[] }
  | { readonly code: 'target-busy'; readonly ownerAttempt: AttemptId; readonly journal: AbsolutePath }
  | { readonly code: 'ambiguous-package-manager'; readonly markers: NonEmpty<string> }
  | { readonly code: 'collision'; readonly targets: NonEmpty<RelativeTarget> }
  | { readonly code: 'external-drift'; readonly targets: NonEmpty<string> }
  | { readonly code: 'upstream-failed'; readonly command?: CommandFact; readonly diagnostic: string }
  | { readonly code: 'postcondition-failed'; readonly expected: string; readonly observed: string }
  | { readonly code: 'interrupted' }
  | { readonly code: 'receipt-unavailable'; readonly diagnostic: string }

type InstallationOutcome =
  | { readonly kind: 'installed'; readonly disposition: 'new' | 'completed-partial' | 'verified-existing'; readonly receipt: InstalledReceipt }
  | { readonly kind: 'blocked'; readonly issues: NonEmpty<InstallationIssue>; readonly journal: AbsolutePath }
  | { readonly kind: 'failed'; readonly issues: NonEmpty<InstallationIssue>; readonly partial: PartialInstallation }

type Handoff = {
  readonly projectPath: AbsolutePath
  readonly guides: NonEmpty<InstalledGuide>
  readonly prompt: string
  readonly installationAttempt: AttemptId
  readonly requestedWork: 'inspect-and-integrate-installed-guidance'
}

type IntegrationOutcome =
  | { readonly kind: 'manual'; readonly handoff: Handoff }
  | { readonly kind: 'invocation-succeeded'; readonly agent: 'codex' | 'claude'; readonly handoff: Handoff; readonly command: CommandFact }
  | { readonly kind: 'invocation-failed'; readonly agent: 'codex' | 'claude'; readonly handoff: Handoff; readonly command?: CommandFact; readonly reason: 'unavailable' | 'nonzero-exit' | 'permission-denied' | 'interrupted' | 'spawn-error' }

type VerificationOutcome =
  | { readonly kind: 'not-run' }
  | { readonly kind: 'passed'; readonly evidence: EvidenceIdentity; readonly checks: NonEmpty<CheckResult> }
  | { readonly kind: 'failed'; readonly evidence: EvidenceIdentity; readonly checks: NonEmpty<CheckResult> }
  | { readonly kind: 'blocked'; readonly evidence: EvidenceIdentity; readonly reason: string }

type OperationOutcome =
  | {
      readonly kind: 'installed'
      readonly installation: Extract<InstallationOutcome, { kind: 'installed' }>
      readonly integration: IntegrationOutcome
      readonly verification: { readonly kind: 'not-run' }
    }
  | {
      readonly kind: 'installation-incomplete'
      readonly installation: Exclude<InstallationOutcome, { kind: 'installed' }>
      readonly integration: { readonly kind: 'not-attempted' }
      readonly verification: { readonly kind: 'not-run' }
    }

/** Fixed operation. Agent choice never bypasses compatibility or Git policy. */
export async function init(request: InitRequest, options?: RunOptions): Promise<OperationOutcome> {
  // TODO Validate intent; open durable attempt; admit exact release tuple.
  // TODO withProjectAccess owns target/Git checks and lease until callback ends.
  // TODO Generate in clean owned staging, inspect base, install custom features.
  // TODO Check postconditions; reserve/publish no-clobber; recheck installed bytes.
  // TODO Flush installed receipt, then handoff while retaining the target lease.
  // TODO Return distinct installation/invocation facts and verification not-run.
  throw new Error('not implemented')
}

/** Same target, journal, compatibility and collision owner as init. */
export async function add(request: AddRequest, options?: RunOptions): Promise<OperationOutcome> {
  // TODO Validate intent; open durable attempt; acquire existing-project access.
  // TODO Inspect host tuple/manager; resolve/parse packaged items with upstream API.
  // TODO Refuse divergent targets; install absent files with overwrite false.
  // TODO Inspect actual files/dependencies; mint receipt only on all postconditions.
  // TODO Same-byte repeat may skip installer; no implicit agent retry/resume.
  // TODO Handoff only after drift check and successful installed-receipt flush.
  throw new Error('not implemented')
}

// ---------------------------------------------------------------------------
// CLI ownership. Resolves input, then calls exactly one operation.
// ---------------------------------------------------------------------------

type ExitPolicy = 'installation' | 'installation-and-selected-agent-invocation'
type CliIntent =
  | { readonly kind: 'init'; readonly request: InitRequest; readonly exitPolicy: ExitPolicy; readonly format: 'text' | 'json' }
  | { readonly kind: 'add'; readonly request: AddRequest; readonly exitPolicy: ExitPolicy; readonly format: 'text' | 'json' }
type Terminal = { readonly interactive: boolean }

async function resolveCliIntent(argv: readonly string[], terminal: Terminal): Promise<CliIntent> {
  // TODO Parse flags with Node; prompt missing choices only when interactive.
  // TODO Reject simultaneous codex/claude and strict-agent without an agent.
  // TODO Default omitted connection to configure-later, no infrastructure action.
  throw new Error('not implemented')
}

function exitStatus(outcome: OperationOutcome, policy: ExitPolicy): 0 | 1 {
  // TODO Default succeeds exactly when installation.kind is installed.
  // TODO Strict policy also requires invocation-succeeded. Never inspect proof.
  throw new Error('not implemented')
}

type EventBase = {
  readonly attempt: AttemptId
  readonly sequence: number
  readonly time: string
}
type StageEvent = EventBase & (
  | { readonly kind: 'preflight'; readonly target: string }
  | { readonly kind: 'target-admitted'; readonly project: ProjectId; readonly git: GitBaseline }
  | { readonly kind: 'mutation-started'; readonly writer: 'bootstrap' | 'registry-install' | 'publish' }
  | { readonly kind: 'upstream-finished'; readonly writer: 'bootstrap' | 'registry-install'; readonly observedExit: number | 'signal' }
  | { readonly kind: 'installation-confirmed'; readonly receipt: InstalledReceipt }
  | { readonly kind: 'integration-started'; readonly agent: 'codex' | 'claude' }
  | { readonly kind: 'integration-finished'; readonly outcome: IntegrationOutcome }
  | { readonly kind: 'installation-incomplete'; readonly issues: NonEmpty<InstallationIssue>; readonly retainedOutput: readonly AbsolutePath[] }
)

type CommandFact = {
  readonly executable: string
  readonly argumentsRedacted: readonly string[]
  readonly cwd: AbsolutePath
  readonly exit: { readonly kind: 'code'; readonly code: number } | { readonly kind: 'signal'; readonly signal: string } | { readonly kind: 'not-started'; readonly reason: string }
  readonly startedAt: string
  readonly finishedAt: string
  readonly privateLog?: AbsolutePath
}

// ---------------------------------------------------------------------------
// Private project owner. Not exported or importable by CLI/tooling.
// ---------------------------------------------------------------------------

declare class WritableProject {
  private readonly writableBrand: never
  readonly id: ProjectId
  readonly path: AbsolutePath
  readonly gitBefore: GitBaseline
  readonly packageManager: PackageManager
}
declare class NewProject extends WritableProject {
  private readonly newProjectBrand: never
  readonly stagingParent: AbsolutePath
  readonly stagingPath: AbsolutePath
  readonly destination: AbsolutePath
}

async function withProjectAccess<T>(
  intent: { readonly kind: 'new'; readonly request: InitRequest } | { readonly kind: 'existing'; readonly request: AddRequest },
  attempt: AttemptWriter,
  use: (project: WritableProject | NewProject) => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  // TODO Canonicalize root; validate no symlink escape; resolve lease key.
  // TODO Observe Git and manager markers; refuse dirty state unless permitted.
  // TODO Acquire per-target toolkit lease; uncertain stale owner remains blocked.
  // TODO Keep lease through handoff, release in finally, retain partial output.
  throw new Error('not implemented')
}

// ---------------------------------------------------------------------------
// Private upstream adapters. Transport schemas/configs cannot leave this package.
// ---------------------------------------------------------------------------

type CompatibilityDeclaration = {
  readonly schemaVersion: 1
  readonly feature: FeatureName
  readonly itemVersion: ExactVersion
  readonly tupleId: string
  readonly frameworks: NonEmpty<Framework>
  readonly databases: NonEmpty<Database>
  readonly guideTarget: RelativeTarget
}

type ExpectedArtifact = {
  readonly target: RelativeTarget
  readonly content: Digest
  readonly role: 'source' | 'guide' | 'example'
}

declare class ResolvedFeature {
  private readonly resolvedFeatureBrand: never
  readonly identity: ItemIdentity
  readonly compatibility: CompatibilityDeclaration
  readonly artifacts: NonEmpty<ExpectedArtifact>
  readonly exactPackages: readonly { readonly name: string; readonly version: ExactVersion }[]
  // Private representation also retains upstream resolved installation object and
  // packaged immutable JSON reference. They are never public return types.
}

function parseRegistryMetadata(wire: unknown): CompatibilityDeclaration {
  // TODO registryItemSchema from shadcn/schema parses the entire item first.
  // TODO getRegistryItems preserves meta; resolveRegistryItems aggregate does not.
  // TODO Decode meta.payloadToolkit before asking upstream to merge the closure.
  // TODO Require ~/ root targets; normalize to project-relative ExpectedArtifact
  //      paths after qualifying identical behavior with and without host src/.
  // TODO Validate tuple id, guide membership, path targets and exact dependency
  //      correspondence. Unknown optional upstream fields stay upstream-owned.
  throw new Error('not implemented')
}

async function resolveFeatures(features: NonEmpty<FeatureName>, project: WritableProject): Promise<NonEmpty<ResolvedFeature>> {
  // TODO Resolve catalog names to packaged item JSON, no external URL in public API.
  // TODO getRegistriesConfig(project.path), getRegistryItems/resolveRegistryItems
  //      from shadcn/registry. The upstream API owns registry graph traversal.
  // TODO Validate schema + toolkit meta; hash complete resolved closure.
  // TODO Universal explicit targets only for first catalog; no UI init.
  throw new Error('not implemented')
}

type CollisionAdmission =
  | { readonly kind: 'all-identical'; readonly facts: InstallationPostconditions }
  | { readonly kind: 'install-missing'; readonly absent: NonEmpty<ExpectedArtifact>; readonly presentIdentical: readonly ExpectedArtifact[] }
  | { readonly kind: 'blocked'; readonly divergent: NonEmpty<RelativeTarget> }

async function inspectCollisionAdmission(project: WritableProject, features: NonEmpty<ResolvedFeature>): Promise<CollisionAdmission> {
  // TODO Present bytes are compared to resolved expected bytes, not stale receipts.
  // TODO Divergent source or guide blocks whole request before shadcn writes.
  // TODO All-identical only skips install if dependency/manager facts also match.
  throw new Error('not implemented')
}

async function installRegistryFeatures(project: WritableProject, features: NonEmpty<ResolvedFeature>): Promise<InstallationPostconditions> {
  // TODO addRegistryItems([absolutePackagedJson], { cwd, config,
  //      overwrite: false, silent: true }). No invented manager/dryRun/skipInstall.
  // TODO This public API returns void; independently inspect files and packages.
  // TODO Different skipped files fail, even if upstream returned normally.
  throw new Error('not implemented')
}

type VerifiedBootstrapTuple = TupleIdentity & {
  readonly template: 'blank' | 'blank-tanstack'
  readonly admissionEvidence: Digest
}
type BaseInstallationFacts = {
  readonly tuple: TupleIdentity
  readonly postconditions: InstallationPostconditions
  readonly readme: InstalledGuide
  readonly actualNativeAuth: { readonly usersCollection: string; readonly auth: true }
}

async function admitBootstrap(framework: Framework, database: Database): Promise<VerifiedBootstrapTuple> {
  // TODO Exact packaged catalog entry plus matching qualification/release records.
  // TODO Source-supported candidate is not a public runtime-verified admission.
  // TODO No latest/canary/main resolution and no public allow-unverified escape.
  throw new Error('not implemented')
}

async function bootstrapOfficial(
  project: NewProject,
  tuple: VerifiedBootstrapTuple,
  connection: ConnectionChoice,
  attempt: AttemptWriter,
): Promise<BaseInstallationFacts> {
  // TODO Invoke pinned create-payload-app binary with argument array from clean
  //      staging parent: name/template/db/URI/branch/fullPayloadVersion/manager,
  //      --no-git --no-agent. Do not import the generator's broken source exports.
  // TODO Explicit URI placeholder for configure-later, never recommended URI flag.
  // TODO Inspect exact packages, adapter config, native auth and generated files.
  // TODO Record generator process exit as one observation, not success proof.
  // TODO Complete and check verified codegen commands; no DB readiness inference.
  throw new Error('not implemented')
}

// ---------------------------------------------------------------------------
// Private guide/agent owner. InstalledReceipt is the admission boundary.
// ---------------------------------------------------------------------------

async function handoffInstalled(
  receipt: InstalledReceipt,
  choice: IntegrationChoice,
  project: WritableProject,
  attempt: AttemptWriter,
  signal?: AbortSignal,
): Promise<IntegrationOutcome> {
  // TODO Recheck guide identity; prompt references actual installed project paths.
  // TODO Manual returns prompt. Agent uses selected installed CLI via argv/stdin.
  // TODO Codex exec --cd/JSON and Claude print structured output stay adapter-owned.
  // TODO Preserve account, model, project rules, permissions and approval settings.
  // TODO No paid retry; permission/nonzero/cancellation preserve manual handoff.
  // TODO Exit zero records invocation-succeeded, never runtime verification.
  throw new Error('not implemented')
}

// ---------------------------------------------------------------------------
// Private receipt storage. No shared mutable project-wide result file.
// ---------------------------------------------------------------------------

declare class AttemptWriter {
  private readonly attemptWriterBrand: never
  readonly id: AttemptId
  readonly journal: AbsolutePath
}

// ---------------------------------------------------------------------------
// Contributor tooling. Separate ownership, no paid-agent default dependency.
// ---------------------------------------------------------------------------

type FixtureLease = {
  readonly run: string
  readonly projectPath: AbsolutePath
  readonly connection: ConnectionChoice
  readonly evidencePath: AbsolutePath
  readonly identity: Digest
  readonly services: 'owned-docker' | 'owned-supplied' | 'borrowed-test-database'
  readonly events: (event: StageEvent) => void
  // Only the fixture owner retains private resource/cleanup capabilities.
}

type CheckResult = {
  readonly predicate: string
  readonly result: 'passed' | 'failed' | 'blocked'
  readonly observations: readonly { readonly kind: 'http' | 'browser' | 'console' | 'process' | 'artifact'; readonly reference: string; readonly digest: Digest }[]
}

type EvidenceIdentity = {
  readonly schemaVersion: 1
  readonly run: string
  readonly attempt: AttemptId
  readonly source: { readonly commit: CommitSha; readonly archive: Digest; readonly dirty: boolean }
  readonly package: Digest
  readonly tuple: TupleIdentity
  readonly items: readonly ItemIdentity[]
  readonly fixture: Digest
  readonly nodeVersion: ExactVersion
  readonly packageManager: { readonly name: PackageManager; readonly version: ExactVersion; readonly lock: Digest }
  readonly acceptanceCommand: readonly string[]
  readonly ci?: { readonly workflow: string; readonly runId: string; readonly head: CommitSha; readonly artifact: Digest }
  readonly evidencePath: AbsolutePath
}

async function verifyFixture(input: {
  readonly fixture: FixtureLease
  readonly installation: InstallationOutcome
}): Promise<Exclude<VerificationOutcome, { kind: 'not-run' }>> {
  // TODO Record blocked verification after an incomplete installation.
  // TODO Integrate known fixture via committed code tied to installed guide hash.
  // TODO Run codegen/static/build, expected-schema and DB readiness, HTTP/browser.
  // TODO Executable feature map decides pass/fail; paid-agent output never does.
  throw new Error('not implemented')
}

async function writeEvidence(proof: Exclude<VerificationOutcome, { kind: 'not-run' }>): Promise<AbsolutePath> {
  // TODO Immutable per-attempt allowlisted facts. Preserve failure before rerun.
  throw new Error('not implemented')
}

async function cleanupFixture(fixture: FixtureLease): Promise<{
  readonly removedOrAbsent: readonly string[]
  readonly retainedBorrowed: readonly string[]
  readonly failures: readonly string[]
}> {
  // TODO Fixture owner uses recorded capabilities, never guessed DB names/suffixes.
  // TODO Idempotent cleanup preserves evidence. Borrowed DB stays by default.
  throw new Error('not implemented')
}
