import { describe, expect, test } from 'bun:test'
import type { RegistryItem, Setup } from '../workspace.types'
import {
  directoryError,
  installError,
  toCatalog,
  toCommand,
  toPrompt,
  visibleItems,
} from '../workspace.utils'

const catalog: readonly RegistryItem[] = [
  {
    ref: 'forms',
    name: 'forms',
    title: 'Payload forms',
    description: 'Native Payload forms and persisted submissions.',
    kind: 'feature',
    source: 'payload-toolkit',
    guide: 'docs/payload-toolkit/forms/GUIDE.md',
  },
  {
    ref: '@payload-components/hero-basic',
    name: 'hero-basic',
    title: 'Hero Basic',
    description: 'Proof-of-concept hero block.',
    kind: 'block',
    source: '@payload-components',
  },
  {
    ref: '@payload-components/media',
    name: 'media',
    title: 'Media',
    description: 'Responsive image component.',
    kind: 'component',
    source: '@payload-components',
  },
]

const acme: Setup = {
  target: 'new',
  name: 'acme',
  framework: 'next',
  database: 'postgres',
  packageManager: 'pnpm',
  agent: 'none',
  items: [],
}

describe('toCommand', () => {
  test('no items is a plain Payload app, matching the README invocation', () => {
    expect(toCommand(acme, catalog)).toBe(
      'bunx --bun payload-toolkit@alpha init acme --framework next --database postgres --package-manager pnpm',
    )
  })

  test('one bundled feature adds --features', () => {
    expect(
      toCommand({ ...acme, framework: 'tanstack', database: 'mongodb', items: ['forms'] }, catalog),
    ).toBe(
      'bunx --bun payload-toolkit@alpha init acme --framework tanstack --database mongodb --features forms --package-manager pnpm',
    )
  })

  test('the agent flag needs at least one item', () => {
    expect(toCommand({ ...acme, agent: 'codex', items: ['forms'] }, catalog)).toBe(
      'bunx --bun payload-toolkit@alpha init acme --framework next --database postgres --features forms --package-manager pnpm --codex',
    )
    expect(toCommand({ ...acme, agent: 'claude' }, catalog)).toBe(
      'bunx --bun payload-toolkit@alpha init acme --framework next --database postgres --package-manager pnpm',
    )
  })

  test('features follow catalog order regardless of selection order', () => {
    expect(
      toCommand(
        {
          ...acme,
          packageManager: 'bun',
          items: ['@payload-components/media', 'forms', '@payload-components/hero-basic'],
        },
        catalog,
      ),
    ).toBe(
      'bunx --bun payload-toolkit@alpha init acme --framework next --database postgres --features forms,@payload-components/hero-basic,@payload-components/media --package-manager bun',
    )
  })

  test('a directory with a space is single-quoted', () => {
    expect(toCommand({ ...acme, name: "my app's" }, catalog)).toBe(
      "bunx --bun payload-toolkit@alpha init 'my app'\\''s' --framework next --database postgres --package-manager pnpm",
    )
    expect(toCommand({ ...acme, name: 'my app' }, catalog)).toBe(
      "bunx --bun payload-toolkit@alpha init 'my app' --framework next --database postgres --package-manager pnpm",
    )
  })
})

describe('toCommand for an existing project', () => {
  const existing: Setup = { ...acme, target: 'existing', agent: 'claude' }

  test('add takes the refs as arguments and ignores the new-project fields', () => {
    expect(toCommand({ ...existing, items: ['@payload-components/media', 'forms'] }, catalog)).toBe(
      'bunx --bun payload-toolkit@alpha add forms @payload-components/media --claude',
    )
    expect(toCommand({ ...existing, agent: 'none', items: ['forms'] }, catalog)).toBe(
      'bunx --bun payload-toolkit@alpha add forms',
    )
  })

  test('a registry URL is quoted as one argument', () => {
    const url: RegistryItem = { ...catalog[2], ref: 'https://example.com/r/a b.json' }
    expect(toCommand({ ...existing, agent: 'codex', items: [url.ref] }, [url])).toBe(
      "bunx --bun payload-toolkit@alpha add 'https://example.com/r/a b.json' --codex",
    )
  })
})

describe('installError', () => {
  test('a new project needs a directory; an existing one needs an item', () => {
    expect(installError({ ...acme, name: ' ' })).toBe('Enter a directory')
    expect(installError(acme)).toBe(null)
    expect(installError({ ...acme, target: 'existing', name: ' ' })).toBe('Select an item to add')
    expect(installError({ ...acme, target: 'existing', items: ['forms'] })).toBe(null)
  })
})

describe('directoryError', () => {
  test('rejects empty and option-like directories', () => {
    expect(directoryError('   ')).toBe('Enter a directory')
    expect(directoryError('-x')).toBe('Directory cannot start with -')
    expect(directoryError('acme')).toBe(null)
  })
})

describe('toPrompt', () => {
  test('lists the guide and an external item, without the agent flag', () => {
    expect(
      toPrompt(
        { ...acme, agent: 'codex', items: ['@payload-components/hero-basic', 'forms'] },
        catalog,
      ),
    ).toBe(`Create a Payload v4 project with Payload Toolkit. Run this from the parent directory:

bunx --bun payload-toolkit@alpha init acme --framework next --database postgres --features forms,@payload-components/hero-basic --package-manager pnpm

Then inspect the project's existing rules, Payload config, routes, native admin authentication and rendering ownership.

Follow these installed feature guides:
- docs/payload-toolkit/forms/GUIDE.md

For @payload-components/hero-basic, inspect the installed source, missing prerequisites and imports, block registration, renderer ownership and generated Payload types. Their compatibility claims are advisory.

Integrate their ordinary exports into this actual host. Preserve existing authorization and unrelated developer changes. Preserve the existing Git HEAD, branch, staged index and unrelated developer work. Do not stash, reset, stage, commit, checkout, switch or otherwise mutate Git state. Do not provision infrastructure. Run applicable code generation, static and runtime checks and report their observed results. Agent completion alone does not verify runtime behavior.`)
  })

  test('an existing project runs add from its root', () => {
    expect(
      toPrompt({ ...acme, target: 'existing', agent: 'claude', items: ['forms'] }, catalog).split(
        '\n\n',
      )[0],
    ).toBe(
      'Add these items to this Payload v4 project with Payload Toolkit. Run this from the project root:',
    )
    expect(
      toPrompt({ ...acme, target: 'existing', agent: 'claude', items: ['forms'] }, catalog).split(
        '\n\n',
      )[1],
    ).toBe('bunx --bun payload-toolkit@alpha add forms')
  })

  test('a setup without items asks the agent to finish the official starter', () => {
    expect(toPrompt(acme, catalog))
      .toBe(`Create a Payload v4 project with Payload Toolkit. Run this from the parent directory:

bunx --bun payload-toolkit@alpha init acme --framework next --database postgres --package-manager pnpm

Then inspect the project's rules and the installed official README. Finish configuring the generated Payload application. Preserve native admin authentication. Preserve the existing Git HEAD, branch, staged index and unrelated developer work. Do not stash, reset, stage, commit, checkout, switch or otherwise mutate Git state. Infrastructure configuration remains the developer's responsibility. Run and report applicable checks; installation is not runtime verification.`)
  })
})

describe('toCatalog', () => {
  const block = (name: string): RegistryItem => ({
    ref: `@acme/${name}`,
    name,
    title: name,
    description: name,
    kind: 'block',
    source: '@acme',
  })
  const fixture = toCatalog([
    catalog[0],
    ...['hero-a', 'hero-b', 'hero-c', 'faq-a', 'faq-b', 'faq-c', 'faq-d'].map(block),
    ...['call-to-action-a', 'call-to-action-b', 'call-to-action-c', 'embed-map', 'team-a'].map(
      block,
    ),
    catalog[2],
  ])

  test('counts kinds and orders block groups by size, then label, with Other last', () => {
    expect(fixture.kinds).toEqual([
      { id: 'all', label: 'All', count: 14 },
      { id: 'feature', label: 'Features', count: 1 },
      { id: 'component', label: 'Components', count: 1 },
    ])
    expect(fixture.blocks).toEqual([
      { id: 'block:faq', label: 'FAQ', count: 4 },
      { id: 'block:call', label: 'Call to action', count: 3 },
      { id: 'block:hero', label: 'Hero', count: 3 },
      { id: 'block:other', label: 'Other', count: 2 },
    ])
  })

  test('labels each item by its own group and tints each category apart from its neighbours', () => {
    const byName = new Map(fixture.items.map((item) => [item.name, item]))
    expect(byName.get('forms')?.label).toBe('Feature')
    expect(byName.get('call-to-action-a')?.label).toBe('Call to action')
    expect(byName.get('embed-map')?.label).toBe('Embed')
    expect(byName.get('hero-a')?.hue).toBe(byName.get('hero-c')?.hue)
    const hues = new Set(fixture.items.map((item) => item.hue))
    expect(hues.size).toBe(6)
  })

  test('tags each item with its category', () => {
    expect(fixture.items.map((item) => `${item.name}:${item.category}`)).toEqual([
      'forms:feature',
      'hero-a:block:hero',
      'hero-b:block:hero',
      'hero-c:block:hero',
      'faq-a:block:faq',
      'faq-b:block:faq',
      'faq-c:block:faq',
      'faq-d:block:faq',
      'call-to-action-a:block:call',
      'call-to-action-b:block:call',
      'call-to-action-c:block:call',
      'embed-map:block:other',
      'team-a:block:other',
      'media:component',
    ])
  })
})

describe('visibleItems', () => {
  const { items } = toCatalog(catalog)

  test('matches the query against title, ref and description', () => {
    expect(visibleItems(items, 'HERO', 'all').map((item) => item.ref)).toEqual([
      '@payload-components/hero-basic',
    ])
    expect(visibleItems(items, 'image', 'all').map((item) => item.ref)).toEqual([
      '@payload-components/media',
    ])
  })

  test('filters by category', () => {
    expect(visibleItems(items, '', 'component').map((item) => item.ref)).toEqual([
      '@payload-components/media',
    ])
    expect(visibleItems(items, '', 'block:other').map((item) => item.ref)).toEqual([
      '@payload-components/hero-basic',
    ])
    expect(visibleItems(items, 'forms', 'component')).toEqual([])
  })
})
