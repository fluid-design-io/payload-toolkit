import { z } from 'zod'

export const frameworkSchema = z.enum(['next', 'tanstack'])
export const databaseSchema = z.enum(['postgres', 'mongodb'])
export const packageManagerSchema = z.enum(['npm', 'pnpm', 'bun'])
export const agentSchema = z.enum(['none', 'codex', 'claude'])
const common = {
  directory: z.string().min(1),
  features: z.array(z.string().min(1)).readonly().default([]),
  allowDirty: z.boolean().default(false),
  agent: agentSchema.default('none'),
  requireAgentSuccess: z.boolean().default(false),
}
const agentPolicy = (request: { agent: string; requireAgentSuccess: boolean }) =>
  !request.requireAgentSuccess || request.agent !== 'none'
export const initRequestSchema = z
  .object({
    ...common,
    framework: frameworkSchema,
    database: databaseSchema,
    packageManager: packageManagerSchema,
    databaseUrl: z.string().min(1).optional(),
  })
  .strict()
  .refine(agentPolicy, 'requireAgentSuccess requires an agent')
  .refine(
    (request) => request.agent === 'none' || request.features.length > 0,
    'Agent integration requires at least one feature',
  )
export const addRequestSchema = z
  .object({
    ...common,
    features: z.array(z.string().min(1)).min(1).readonly(),
    framework: frameworkSchema.optional(),
    database: databaseSchema.optional(),
  })
  .strict()
  .refine(agentPolicy, 'requireAgentSuccess requires an agent')
export const fileIdentitySchema = z.object({ path: z.string(), sha256: z.string() })
export const hostSchema = z.object({
  framework: frameworkSchema,
  database: databaseSchema,
  packageManager: packageManagerSchema,
  payloadVersion: z.string(),
})
export const projectManifestSchema = z
  .object({
    name: z.string().optional(),
    dependencies: z.record(z.string(), z.string()).default({}),
    devDependencies: z.record(z.string(), z.string()).default({}),
    scripts: z.record(z.string(), z.string()).default({}),
    packageManager: z.string().optional(),
  })
  .loose()
export const installedPackageSchema = z.object({ version: z.string().min(1) }).loose()
export const installationOutcomeSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('complete'),
    disposition: z.enum(['installed', 'already-present']),
    project: z.string(),
    files: z.array(fileIdentitySchema),
  }),
  z.object({
    status: z.enum(['blocked', 'failed', 'interrupted']),
    reason: z.string(),
    partial: z.boolean(),
    retainedPaths: z.array(z.string()),
  }),
])
export const agentOutcomeSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('not-requested'), prompt: z.string().nullable() }),
  z.object({ status: z.literal('not-started'), reason: z.string(), prompt: z.string().nullable() }),
  z.object({
    status: z.literal('completed'),
    agent: z.enum(['codex', 'claude']),
    before: z.string(),
    after: z.string(),
  }),
  z.object({
    status: z.enum(['failed', 'interrupted']),
    agent: z.enum(['codex', 'claude']),
    reason: z.string(),
    prompt: z.string(),
  }),
])
export const resultSchema = z.object({
  schemaVersion: z.literal(1),
  attempt: z.string(),
  receipt: z.string(),
  installation: installationOutcomeSchema,
  agent: agentOutcomeSchema,
  advisories: z.array(z.object({ reference: z.string(), message: z.string() })).default([]),
  verification: z.object({ status: z.literal('not-run') }),
  exitCode: z.union([z.literal(0), z.literal(1), z.literal(2)]),
})
export type Framework = z.infer<typeof frameworkSchema>
export type Database = z.infer<typeof databaseSchema>
export type PackageManager = z.infer<typeof packageManagerSchema>
export type Agent = z.infer<typeof agentSchema>
export type InitRequest = z.infer<typeof initRequestSchema>
export type AddRequest = z.infer<typeof addRequestSchema>
export type FileIdentity = z.infer<typeof fileIdentitySchema>
export type Host = z.infer<typeof hostSchema>
export type ProjectManifest = z.infer<typeof projectManifestSchema>
export type AgentOutcome = z.infer<typeof agentOutcomeSchema>
export type InstallationOutcome = z.infer<typeof installationOutcomeSchema>
export type Result = z.infer<typeof resultSchema>
export type Event = {
  attempt: string
  sequence: number
  stage: string
  status: 'started' | 'complete' | 'failed'
  message: string
}
export type RunOptions = { signal?: AbortSignal; onEvent?: (event: Event) => void }
export type ExpectedFile = FileIdentity & {
  sourceSha256: string
  role: 'source' | 'guide'
}
export type BundledFeature = {
  name: string
  version: string
  itemPath: string
  itemSha256: string
  files: readonly ExpectedFile[]
  dependencies: Readonly<Record<string, string>>
  guide: string
}

export type ExternalFeature = {
  kind: 'external'
  name: string
  version: string
  itemPath: string
  itemSha256: string
  files: readonly (Omit<ExpectedFile, 'role'> & {
    role: 'source' | 'guide' | 'host-config'
    beforeSha256: string | null
    content: string
  })[]
  dependencies: Readonly<Record<string, string>>
  devDependencies: Readonly<Record<string, string>>
  guide?: string
  provenance: {
    references: readonly string[]
    items: readonly { reference: string; name: string; sha256: string }[]
    host: Host
    advisories: readonly string[]
    stylesheet?: string
  }
}
export type Feature = BundledFeature | ExternalFeature
export function isExternal(feature: Feature): feature is ExternalFeature {
  return 'kind' in feature && feature.kind === 'external'
}

export class ToolkitError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'ToolkitError'
  }
}
