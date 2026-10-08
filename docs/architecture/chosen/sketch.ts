/** Design contract. Bodies are stubs; implementation belongs under src/. */
// Usage comes first. CLI fills terminal choices, then makes one complete call.
// const result = await init({ directory: './acme', framework: 'next',
//   database: 'postgres', template: 'minimal', packageManager: 'pnpm',
//   features: [], allowDirty: false, agent: 'none', requireAgentSuccess: false })
// const result = await add({ directory: './existing', features: ['forms'],
//   allowDirty: true, agent: 'codex', requireAgentSuccess: false })
// process.exitCode = result.exitCode

export type Framework = 'next' | 'tanstack'
export type Database = 'postgres' | 'mongodb'
export type PackageManager = 'npm' | 'pnpm' | 'bun'
export type Agent = 'none' | 'codex' | 'claude'
export type CommonRequest = {
  directory: string
  features: readonly string[]
  allowDirty: boolean
  agent: Agent
  requireAgentSuccess: boolean
}
export type InitRequest = CommonRequest & {
  framework: Framework
  database: Database
  template: 'minimal' | 'custom'
  packageManager: PackageManager
  /** Private secret input. Never journal the complete request. */
  databaseUrl?: string
}
export type AddRequest = CommonRequest & {
  framework?: Framework
  database?: Database
}
export type FileIdentity = { path: string; sha256: string }
export type Host = {
  framework: Framework
  database: Database
  packageManager: PackageManager
  payloadVersion: string
}
export type AgentOutcome =
  | { status: 'not-requested'; prompt: string | null }
  | { status: 'not-started'; reason: string; prompt: string | null }
  | { status: 'completed'; agent: 'codex' | 'claude'; before: string; after: string }
  | { status: 'failed' | 'interrupted'; agent: 'codex' | 'claude'; reason: string; prompt: string }
export type InstallationOutcome =
  | { status: 'complete'; disposition: 'installed' | 'already-present'; project: string; files: readonly FileIdentity[] }
  | { status: 'blocked' | 'failed' | 'interrupted'; reason: string; partial: boolean; retainedPaths: readonly string[] }
export type Result = {
  schemaVersion: 1
  attempt: string
  receipt: string
  installation: InstallationOutcome
  agent: AgentOutcome
  verification: { status: 'not-run' }
  exitCode: 0 | 1 | 2
}
export type Event = { attempt: string; sequence: number; stage: string; status: 'started' | 'complete' | 'failed'; message: string }
export type RunOptions = { signal?: AbortSignal; onEvent?: (event: Event) => void }
export async function init(request: InitRequest, options?: RunOptions): Promise<Result> {
  // TODO Parse request; acquire target lease; snapshot nearest repository.
  // TODO Clean staging source generator; reserve/publish; final-path deps/codegen.
  // TODO Install requested features, verify artifacts; persist installation result.
  // TODO Recheck guide identity; manual prompt or explicit installed-agent invocation.
  // TODO Independent stage outcomes; strict flag only changes invocation exit rule.
  throw new Error('not implemented')
}
export async function add(request: AddRequest, options?: RunOptions): Promise<Result> {
  // TODO Same lease/Git/journal owner; inspect installed host and manager.
  // TODO Prepare bounded catalog, collision gate, public shadcn install, postconditions.
  // TODO Preserve partial writes and distinct handoff/verification facts.
  throw new Error('not implemented')
}
export async function describeFeatures(): Promise<readonly { name: string; description: string }[]> {
  // TODO Read-only choices derived from the canonical bundled catalog.
  throw new Error('not implemented')
}

// Private registry owner contracts. No shadcn wire type escapes this boundary.
export type ExpectedFile = FileIdentity & { sourceSha256: string; role: 'source' | 'guide' }
export type Feature = {
  name: string
  version: string
  itemPath: string
  itemSha256: string
  files: readonly ExpectedFile[]
  dependencies: Readonly<Record<string, string>>
  guide: string
}
export async function prepareFeatures(names: readonly string[], host: Host): Promise<readonly Feature[]> {
  // TODO Public fetch schema/meta before public resolve; anchored literal paths.
  throw new Error('not implemented')
}
export async function inspectFeatures(project: string, features: readonly Feature[]): Promise<{ complete: boolean; files: readonly FileIdentity[] }> {
  // TODO Refuse symlink/traversal and divergent bytes; check actual installed deps.
  throw new Error('not implemented')
}
export async function installFeatures(project: string, features: readonly Feature[], signal?: AbortSignal): Promise<readonly FileIdentity[]> {
  // TODO Supported addRegistryItems options only, then independent postconditions.
  throw new Error('not implemented')
}

// Private official owner. Exact tuple is authored once in catalog/bootstrap.json.
export type Bootstrap = { generator: string; payload: string; templateCommit: string; nodeMinimum: string; templates: Readonly<Record<Framework, string>> }
export async function createOfficialSource(stagingParent: string, name: string, request: InitRequest): Promise<string> {
  // TODO Exact executable with --no-deps --no-git --no-agent; validate source shape.
  throw new Error('not implemented')
}
export async function completeOfficialProject(project: string, request: InitRequest): Promise<void> {
  // TODO Requested manager at final path; inspect exact packages; official codegen.
  throw new Error('not implemented')
}

// Private project/attempt/agent owners may split signatures without exposing them.
// Baselines bind HEAD, index tree, status, tracked/untracked file hashes.
// Attempts flush before writers; failures persist; no stash/reset/commit or rollback.
// Leases stop concurrent toolkit writers, not editors. Recheck before each writer.
// Existing feature collisions block even with allowDirty. Agent invocation uses
// inherited account/model/project rules/permissions with no automatic retry.
// Contributor fixtures use packed CLI, known wiring, real databases and browser/HTTP
// assertions. Proof binds source/item/guide/package/locks/commands and cleanup.
