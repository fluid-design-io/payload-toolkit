import { blockLabels, minBlockGroup } from './workspace.constants'
import type {
  Catalog,
  CatalogItem,
  Category,
  CategoryId,
  ItemKind,
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

/** Why the setup cannot install yet: a new project needs a directory, an existing one needs an item. */
export function installError(setup: Setup): string | null {
  if (setup.target === 'new') return directoryError(setup.name)
  return setup.items.length ? null : 'Select an item to add'
}

function command(setup: Setup, catalog: readonly RegistryItem[], withAgent: boolean): string {
  const refs = selectedItems(setup, catalog).map((item) => item.ref)
  const agent = withAgent && refs.length && setup.agent !== 'none' ? [`--${setup.agent}`] : []
  if (setup.target === 'existing')
    return ['bunx --bun payload-toolkit@alpha add', ...refs.map(quote), ...agent].join(' ')

  const parts = [
    'bunx --bun payload-toolkit@alpha init',
    quote(setup.name.trim()),
    `--framework ${setup.framework}`,
    `--database ${setup.database}`,
  ]
  if (refs.length) parts.push(`--features ${refs.join(',')}`)
  parts.push(`--package-manager ${setup.packageManager}`, ...agent)
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
  const intro =
    setup.target === 'existing'
      ? `Add these items to this Payload v4 project with Payload Toolkit. Run this from the project root:\n\n${command(setup, catalog, false)}`
      : `Create a Payload v4 project with Payload Toolkit. Run this from the parent directory:\n\n${command(setup, catalog, false)}`
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

/** What Install shows and copies: the setup's error while it has one, otherwise the chosen output. */
export function outputText(setup: Setup, output: Output, catalog: readonly RegistryItem[]): string {
  return (
    installError(setup) ??
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

function groupLabel(group: string): string {
  return blockLabels[group] ?? group[0].toUpperCase() + group.slice(1)
}

const kindLabels: Record<Exclude<ItemKind, 'block'>, string> = {
  feature: 'Feature',
  component: 'Component',
}

/**
 * Tags every item with its category, group label and hue, and counts the
 * categories. Blocks group by name prefix, largest group first, with small
 * groups folded into a final Other. Hues step by the golden angle in rail
 * order, so neighbouring categories never share a tint.
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
  const count = (id: CategoryId) =>
    id === 'all' ? items.length : items.filter((item) => categoryOf(item) === id).length

  const groups: Category[] = [...sizes]
    .filter(([, size]) => size >= minBlockGroup)
    .map(([group, size]) => ({ id: `block:${group}` as const, label: groupLabel(group), count: size }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
  const other = count('block:other')
  const kinds: Category[] = [
    { id: 'all', label: 'All', count: count('all') },
    { id: 'feature', label: 'Features', count: count('feature') },
    { id: 'component', label: 'Components', count: count('component') },
  ]
  const blocks = other ? [...groups, { id: 'block:other' as const, label: 'Other', count: other }] : groups

  const hues = new Map(
    [...kinds.slice(1), ...blocks].map((category, index) => [
      category.id,
      Math.round((20 + index * 137.508) % 360),
    ]),
  )
  const tagged = items.map((item) => {
    const category = categoryOf(item)
    const label = item.kind === 'block' ? groupLabel(blockGroup(item.name)) : kindLabels[item.kind]
    return { ...item, category, label, hue: hues.get(category) ?? 0 }
  })

  return { items: tagged, kinds, blocks }
}
