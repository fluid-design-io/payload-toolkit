import type {
  Agent,
  Database,
  Framework,
  Option,
  Output,
  PackageManager,
  Setup,
} from './workspace.types'

export const defaultSetup: Setup = {
  name: 'my-payload-app',
  framework: 'next',
  database: 'postgres',
  packageManager: 'pnpm',
  agent: 'none',
  items: [],
}

export const frameworks: readonly Option<Framework>[] = [
  { value: 'next', label: 'Next.js' },
  { value: 'tanstack', label: 'TanStack Start' },
]

export const databases: readonly Option<Database>[] = [
  { value: 'postgres', label: 'PostgreSQL' },
  { value: 'mongodb', label: 'MongoDB' },
]

export const packageManagers: readonly Option<PackageManager>[] = [
  { value: 'pnpm', label: 'pnpm' },
  { value: 'npm', label: 'npm' },
  { value: 'bun', label: 'Bun' },
]

export const agents: readonly Option<Agent>[] = [
  { value: 'none', label: 'None' },
  { value: 'codex', label: 'Codex' },
  { value: 'claude', label: 'Claude' },
]

/** The descriptions say what Copy writes, since the bar shows no preview. */
export const outputs: readonly (Option<Output> & { description: string })[] = [
  { value: 'command', label: 'Command', description: 'Run payload-toolkit init in a terminal' },
  { value: 'prompt', label: 'Prompt', description: 'Hand the setup to a coding agent' },
]

/** Block group labels where Title Case of the name prefix misleads, including `feature`, which would read like the bundled Features. */
export const blockLabels: Readonly<Record<string, string>> = {
  call: 'Call to action',
  faq: 'FAQ',
  feature: 'Feature sections',
}

/** Smaller block groups fold into one "Other" category. */
export const minBlockGroup = 3
