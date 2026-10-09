import { describe, expect, test } from 'bun:test'
import type { RegistryItem, Setup } from '../workspace.types'
import { directoryError, toCatalog, toCommand, toPrompt, visibleItems } from '../workspace.utils'

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
