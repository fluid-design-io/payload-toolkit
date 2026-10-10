import { catalog } from './workspace.catalog'
import {
  agents,
  databases,
  defaultSetup,
  defaultView,
  frameworks,
  packageManagers,
  targets,
  views,
} from './workspace.constants'
import type { Option, RegistryItem, Setup, View, WorkspaceState } from './workspace.types'

/** `/workspace` search params. Each one is optional and omitted while it equals the default. */
export type WorkspaceSearch = Partial<Omit<Setup, 'items'>> & {
  /** Comma-separated refs in catalog order. */
  items?: string
  view?: View
}

/** The router parses `name=123` as a number, so scalars come back as strings. */
function scalar(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return undefined
}

function choice<T extends string>(value: unknown, options: readonly Option<T>[]): T | undefined {
  return options.find((option) => option.value === scalar(value))?.value
}

/**
 * The route's `validateSearch`. Invalid values become `undefined` rather than
 * being left out, because the router merges this result over the raw params
 * and an omitted key would keep the raw value. Unknown or repeated item refs
 * are dropped, and the rest are put in catalog order.
 */
export function parseWorkspaceSearch(
  raw: Record<string, unknown>,
  items: readonly RegistryItem[] = catalog,
): WorkspaceSearch {
  const name = scalar(raw.name)
  const refs = new Set(scalar(raw.items)?.split(','))
  const selected = items.filter((item) => refs.has(item.ref)).map((item) => item.ref)
  return {
    target: choice(raw.target, targets),
    name: name?.length ? name : undefined,
    framework: choice(raw.framework, frameworks),
    database: choice(raw.database, databases),
    packageManager: choice(raw.packageManager, packageManagers),
    agent: choice(raw.agent, agents),
    items: selected.length ? selected.join(',') : undefined,
    view: choice(raw.view, views),
  }
}

export function setupFromSearch(search: WorkspaceSearch): Setup {
  return {
    target: search.target ?? defaultSetup.target,
    name: search.name ?? defaultSetup.name,
    framework: search.framework ?? defaultSetup.framework,
    database: search.database ?? defaultSetup.database,
    packageManager: search.packageManager ?? defaultSetup.packageManager,
    agent: search.agent ?? defaultSetup.agent,
    items: search.items ? search.items.split(',') : [],
  }
}

export function viewFromSearch(search: WorkspaceSearch): View {
  return search.view ?? defaultView
}

/**
 * The inverse of `setupFromSearch`. The new-project fields and the agent are
 * kept even when the command ignores them, so switching back restores them.
 */
export function searchFromSetup(setup: Setup): WorkspaceSearch {
  const search: WorkspaceSearch = {}
  if (setup.target !== defaultSetup.target) search.target = setup.target
  if (setup.name !== defaultSetup.name) search.name = setup.name
  if (setup.framework !== defaultSetup.framework) search.framework = setup.framework
  if (setup.database !== defaultSetup.database) search.database = setup.database
  if (setup.packageManager !== defaultSetup.packageManager)
    search.packageManager = setup.packageManager
  if (setup.agent !== defaultSetup.agent) search.agent = setup.agent
  if (setup.items.length) search.items = setup.items.join(',')
  return search
}

/** Everything the URL mirrors: the setup, then the view unless it is the grid. */
export function searchFromState({ setup, view }: Pick<WorkspaceState, 'setup' | 'view'>): WorkspaceSearch {
  const search = searchFromSetup(setup)
  if (view !== defaultView) search.view = view
  return search
}
