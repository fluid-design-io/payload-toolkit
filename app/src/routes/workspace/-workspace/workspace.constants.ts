import type {
  Agent,
  Database,
  Filter,
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

export const filters: readonly Option<Filter>[] = [
  { value: 'all', label: 'All' },
  { value: 'feature', label: 'Features' },
  { value: 'block', label: 'Blocks' },
  { value: 'component', label: 'Components' },
  { value: 'selected', label: 'Selected' },
]

export const outputs: readonly Option<Output>[] = [
  { value: 'command', label: 'Command' },
  { value: 'prompt', label: 'Prompt' },
]
