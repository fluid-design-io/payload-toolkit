export type Framework = 'next' | 'tanstack'
export type Database = 'postgres' | 'mongodb'
export type PackageManager = 'pnpm' | 'npm' | 'bun'
export type Agent = 'none' | 'codex' | 'claude'
export type ItemKind = 'feature' | 'block' | 'component'

export type RegistryItem = {
  /** Exactly what `--features` accepts, such as `forms` or `@payload-components/hero-split`. */
  ref: string
  name: string
  title: string
  description: string
  kind: ItemKind
  /** `payload-toolkit` for bundled items, otherwise the registry namespace. */
  source: string
  /** Bundled items only: the installed feature guide path. */
  guide?: string
}

/** Template is derived from `items` (empty is minimal), so it is never stored. */
export type Setup = {
  name: string
  framework: Framework
  database: Database
  packageManager: PackageManager
  agent: Agent
  items: readonly string[]
}

export type Filter = 'all' | ItemKind | 'selected'
export type Output = 'command' | 'prompt'

export type Option<T extends string> = { value: T; label: string }

export type WorkspaceState = {
  setup: Setup
  query: string
  filter: Filter
  output: Output
}

export type WorkspaceAction =
  | { type: 'setName'; name: string }
  | { type: 'setFramework'; framework: Framework }
  | { type: 'setDatabase'; database: Database }
  | { type: 'setPackageManager'; packageManager: PackageManager }
  | { type: 'setAgent'; agent: Agent }
  | { type: 'setItems'; items: readonly string[] }
  | { type: 'removeItem'; ref: string }
  | { type: 'setQuery'; query: string }
  | { type: 'setFilter'; filter: Filter }
  | { type: 'setOutput'; output: Output }

export type WorkspaceContextValue = {
  state: WorkspaceState & {
    visible: readonly RegistryItem[]
    selected: readonly RegistryItem[]
    command: string
    prompt: string
    directoryError: string | null
    text: string
  }
  actions: {
    setName: (name: string) => void
    setFramework: (framework: Framework) => void
    setDatabase: (database: Database) => void
    setPackageManager: (packageManager: PackageManager) => void
    setAgent: (agent: Agent) => void
    setItems: (items: readonly string[]) => void
    removeItem: (ref: string) => void
    setQuery: (query: string) => void
    setFilter: (filter: Filter) => void
    setOutput: (output: Output) => void
  }
  meta: {
    catalog: readonly RegistryItem[]
    counts: Record<Filter, number>
  }
}
