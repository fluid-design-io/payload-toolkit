import type { Store } from '@tanstack/react-store'
import type { RefObject } from 'react'

export type Framework = 'next' | 'tanstack'
export type Database = 'postgres' | 'mongodb'
export type PackageManager = 'pnpm' | 'npm' | 'bun'
export type Agent = 'none' | 'codex' | 'claude'
/** `existing` runs `payload-toolkit add` in a project; `new` runs `init` beside it. */
export type Target = 'existing' | 'new'
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
  sourceName?: string
  sourceHomepage?: string
  itemUrl?: string
  /** Bundled items only: the installed feature guide path. */
  guide?: string
  /** Resolved HTTPS image or local captured thumbnail, and source preview page. */
  image?: string
  imageDark?: string
  previewUrl?: string
  previewEmbed?: boolean
}

/** Everything the command needs. It is mirrored into the URL search params. */
export type Setup = {
  target: Target
  /** The new project's directory; `add` ignores it. */
  name: string
  framework: Framework
  database: Database
  packageManager: PackageManager
  agent: Agent
  /** Selected refs in catalog order, including items hidden by the search or category. */
  items: readonly string[]
}

/** Block groups are `block:<first name segment>`; groups under three items share `block:other`. */
export type CategoryId = 'all' | 'feature' | 'component' | `block:${string}`

export type Category = { id: CategoryId; label: string; count: number }

/** `label` names the item's own group, even when its category folds into Other; `hue` tints its category. */
export type CatalogItem = RegistryItem & { category: CategoryId; label: string; hue: number }

export type Catalog = {
  items: readonly CatalogItem[]
  kinds: readonly Category[]
  blocks: readonly Category[]
}

export type Output = 'command' | 'prompt'
export type Panel = 'install' | 'build' | null

export type Option<T extends string> = { value: T; label: string }

export type WorkspaceState = {
  setup: Setup
  query: string
  category: CategoryId
  output: Output
  panel: Panel
  /** The ref whose detail card is open. */
  detail: string | null
}

export type WorkspaceActions = {
  setTarget: (target: Target) => void
  setName: (name: string) => void
  setFramework: (framework: Framework) => void
  setDatabase: (database: Database) => void
  setPackageManager: (packageManager: PackageManager) => void
  setAgent: (agent: Agent) => void
  toggleItem: (ref: string, isSelected: boolean) => void
  clearItems: () => void
  setQuery: (query: string) => void
  setCategory: (category: CategoryId) => void
  setOutput: (output: Output) => void
  openPanel: (panel: Exclude<Panel, null>) => void
  /** Closes `panel` only while it is the open one, so a late close cannot shut its successor. */
  closePanel: (panel: Exclude<Panel, null>) => void
  openDetail: (ref: string) => void
  closeDetail: () => void
}

/** Stable for the provider's lifetime; leaves subscribe to slices of `store`. */
export type WorkspaceContextValue = {
  store: Store<WorkspaceState, WorkspaceActions>
  actions: WorkspaceActions
  meta: {
    catalog: Catalog
    /** The bar's count pill, where a selected item's preview lands. */
    buildCount: RefObject<HTMLSpanElement | null>
  }
}
