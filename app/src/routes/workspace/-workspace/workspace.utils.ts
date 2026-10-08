import type { Filter, RegistryItem, Setup } from './workspace.types'

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

function selectedItems(setup: Setup, catalog: readonly RegistryItem[]): RegistryItem[] {
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
    `--template ${items.length ? 'custom' : 'minimal'}`,
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

export function visibleItems(
  catalog: readonly RegistryItem[],
  query: string,
  filter: Filter,
  selected: readonly string[],
): RegistryItem[] {
  const needle = query.trim().toLowerCase()
  const refs = new Set(selected)
  return catalog.filter((item) => {
    if (filter === 'selected' ? !refs.has(item.ref) : filter !== 'all' && item.kind !== filter)
      return false
    if (!needle) return true
    return [item.title, item.ref, item.description].some((field) =>
      field.toLowerCase().includes(needle),
    )
  })
}
