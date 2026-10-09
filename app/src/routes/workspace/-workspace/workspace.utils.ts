import { blockLabels, minBlockGroup } from './workspace.constants'
import type {
  Catalog,
  CatalogItem,
  Category,
  CategoryId,
  Output,
  RegistryItem,
  Setup,
} from './workspace.types'

export function directoryError(name: string): string | null {
  const directory = name.trim()
  if (!directory) return 'Enter a directory'
  if (directory.startsWith('-')) return 'Directory cannot start with -'
  return null
}

function quote(value: string): string {
  if (/^[A-Za-z0-9._/@~+-]+$/.test(value)) return value
  return `'${value.replaceAll("'", "'\\''")}'`
}

export function selectedItems<T extends RegistryItem>(
  setup: Pick<Setup, 'items'>,
  catalog: readonly T[],
): T[] {
  const refs = new Set(setup.items)
  return catalog.filter((item) => refs.has(item.ref))
}

function command(setup: Setup, catalog: readonly RegistryItem[], withAgent: boolean): string {
  const items = selectedItems(setup, catalog)
  const parts = [
    'bunx --bun payload-toolkit@alpha init',
    quote(setup.name.trim()),
    `--framework ${setup.framework}`,
    `--database ${setup.database}`,
  ]
  if (items.length) parts.push(`--features ${items.map((item) => item.ref).join(',')}`)
  parts.push(`--package-manager ${setup.packageManager}`)
  if (withAgent && items.length && setup.agent !== 'none') parts.push(`--${setup.agent}`)
  return parts.join(' ')
}

export function toCommand(setup: Setup, catalog: readonly RegistryItem[]): string {
  return command(setup, catalog, true)
}

// Mirrors gitInstruction in the CLI's src/operations/private/agents.ts.
const gitInstruction =
  'Preserve the existing Git HEAD, branch, staged index and unrelated developer work. Do not stash, reset, stage, commit, checkout, switch or otherwise mutate Git state.'

export function toPrompt(setup: Setup, catalog: readonly RegistryItem[]): string {
  const items = selectedItems(setup, catalog)
  const intro = `Create a Payload v4 project with Payload Toolkit. Run this from the parent directory:\n\n${command(setup, catalog, false)}`
  if (!items.length)
    return `${intro}\n\nThen inspect the project's rules and the installed official README. Finish configuring the generated Payload application. Preserve native admin authentication. ${gitInstruction} Infrastructure configuration remains the developer's responsibility. Run and report applicable checks; installation is not runtime verification.`

  const paragraphs = [
    intro,
    "Then inspect the project's existing rules, Payload config, routes, native admin authentication and rendering ownership.",
  ]
  const guides = items.flatMap((item) => (item.guide ? [item.guide] : []))
  if (guides.length)
    paragraphs.push(
      `Follow these installed feature guides:\n${guides.map((guide) => `- ${guide}`).join('\n')}`,
    )
  const external = items.filter((item) => !item.guide).map((item) => item.ref)
  if (external.length)
    paragraphs.push(
      `For ${external.join(', ')}, inspect the installed source, missing prerequisites and imports, block registration, renderer ownership and generated Payload types. Their compatibility claims are advisory.`,
    )
  paragraphs.push(
    `Integrate their ordinary exports into this actual host. Preserve existing authorization and unrelated developer changes. ${gitInstruction} Do not provision infrastructure. Run applicable code generation, static and runtime checks and report their observed results. Agent completion alone does not verify runtime behavior.`,
  )
  return paragraphs.join('\n\n')
}

/** What Copy writes: the name error while the name is invalid, otherwise the chosen output. */
export function outputText(setup: Setup, output: Output, catalog: readonly RegistryItem[]): string {
  return (
    directoryError(setup.name) ??
    (output === 'command' ? toCommand(setup, catalog) : toPrompt(setup, catalog))
  )
}

export function visibleItems(
  catalog: readonly CatalogItem[],
  query: string,
  category: CategoryId,
): CatalogItem[] {
  const needle = query.trim().toLowerCase()
  return catalog.filter((item) => {
    if (category !== 'all' && item.category !== category) return false
    if (!needle) return true
    return [item.title, item.ref, item.description].some((field) =>
      field.toLowerCase().includes(needle),
    )
  })
}

/** `call-to-action-split` belongs to `call`. */
export function blockGroup(name: string): string {
  return name.split('-')[0]
}

/**
 * Tags every item with its category and counts them. Blocks group by name
 * prefix, largest group first, with small groups folded into a final Other.
 */
export function toCatalog(items: readonly RegistryItem[]): Catalog {
  const sizes = new Map<string, number>()
  for (const item of items)
    if (item.kind === 'block') {
      const group = blockGroup(item.name)
      sizes.set(group, (sizes.get(group) ?? 0) + 1)
    }

  const categoryOf = (item: RegistryItem): CategoryId => {
    if (item.kind !== 'block') return item.kind
    const group = blockGroup(item.name)
    return (sizes.get(group) ?? 0) < minBlockGroup ? 'block:other' : `block:${group}`
  }
  const tagged = items.map((item) => ({ ...item, category: categoryOf(item) }))
  const count = (id: CategoryId) =>
    id === 'all' ? tagged.length : tagged.filter((item) => item.category === id).length

  const groups: Category[] = [...sizes]
    .filter(([, size]) => size >= minBlockGroup)
    .map(([group, size]) => ({
      id: `block:${group}` as const,
      label: blockLabels[group] ?? group[0].toUpperCase() + group.slice(1),
      count: size,
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
  const other = count('block:other')

  return {
    items: tagged,
    kinds: [
      { id: 'all', label: 'All', count: count('all') },
      { id: 'feature', label: 'Features', count: count('feature') },
      { id: 'component', label: 'Components', count: count('component') },
    ],
    blocks: other ? [...groups, { id: 'block:other', label: 'Other', count: other }] : groups,
  }
}
