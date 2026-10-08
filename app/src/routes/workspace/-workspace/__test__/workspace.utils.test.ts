import { describe, expect, test } from 'bun:test'
import type { RegistryItem, Setup } from '../workspace.types'
import { directoryError, toCommand, toPrompt, visibleItems } from '../workspace.utils'

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
  test('minimal setup matches the README invocation', () => {
    expect(toCommand(acme, catalog)).toBe(
      'bunx --bun payload-toolkit@alpha init acme --framework next --database postgres --template minimal --package-manager pnpm',
    )
  })

  test('one bundled feature selects the custom template', () => {
    expect(
      toCommand({ ...acme, framework: 'tanstack', database: 'mongodb', items: ['forms'] }, catalog),
    ).toBe(
      'bunx --bun payload-toolkit@alpha init acme --framework tanstack --database mongodb --template custom --features forms --package-manager pnpm',
    )
  })

  test('the agent flag needs at least one item', () => {
    expect(toCommand({ ...acme, agent: 'codex', items: ['forms'] }, catalog)).toBe(
      'bunx --bun payload-toolkit@alpha init acme --framework next --database postgres --template custom --features forms --package-manager pnpm --codex',
    )
    expect(toCommand({ ...acme, agent: 'claude' }, catalog)).toBe(
      'bunx --bun payload-toolkit@alpha init acme --framework next --database postgres --template minimal --package-manager pnpm',
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
      'bunx --bun payload-toolkit@alpha init acme --framework next --database postgres --template custom --features forms,@payload-components/hero-basic,@payload-components/media --package-manager bun',
    )
  })

  test('a directory with a space is single-quoted', () => {
    expect(toCommand({ ...acme, name: "my app's" }, catalog)).toBe(
      "bunx --bun payload-toolkit@alpha init 'my app'\\''s' --framework next --database postgres --template minimal --package-manager pnpm",
    )
    expect(toCommand({ ...acme, name: 'my app' }, catalog)).toBe(
      "bunx --bun payload-toolkit@alpha init 'my app' --framework next --database postgres --template minimal --package-manager pnpm",
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

bunx --bun payload-toolkit@alpha init acme --framework next --database postgres --template custom --features forms,@payload-components/hero-basic --package-manager pnpm

Then inspect the project's existing rules, Payload config, routes, native admin authentication and rendering ownership.

Follow these installed feature guides:
- docs/payload-toolkit/forms/GUIDE.md

For @payload-components/hero-basic, inspect the installed source, missing prerequisites and imports, block registration, renderer ownership and generated Payload types. Their compatibility claims are advisory.

Integrate their ordinary exports into this actual host. Preserve existing authorization and unrelated developer changes. Preserve the existing Git HEAD, branch, staged index and unrelated developer work. Do not stash, reset, stage, commit, checkout, switch or otherwise mutate Git state. Do not provision infrastructure. Run applicable code generation, static and runtime checks and report their observed results. Agent completion alone does not verify runtime behavior.`)
  })

  test('a minimal setup asks the agent to finish the official starter', () => {
    expect(toPrompt(acme, catalog))
      .toBe(`Create a Payload v4 project with Payload Toolkit. Run this from the parent directory:

bunx --bun payload-toolkit@alpha init acme --framework next --database postgres --template minimal --package-manager pnpm

Then inspect the project's rules and the installed official README. Finish configuring the generated Payload application. Preserve native admin authentication. Preserve the existing Git HEAD, branch, staged index and unrelated developer work. Do not stash, reset, stage, commit, checkout, switch or otherwise mutate Git state. Infrastructure configuration remains the developer's responsibility. Run and report applicable checks; installation is not runtime verification.`)
  })
})

describe('visibleItems', () => {
  test('matches the query against title, ref and description', () => {
    expect(visibleItems(catalog, 'HERO', 'all', []).map((item) => item.ref)).toEqual([
      '@payload-components/hero-basic',
    ])
    expect(visibleItems(catalog, 'image', 'all', []).map((item) => item.ref)).toEqual([
      '@payload-components/media',
    ])
  })

  test('filters by kind or by selection', () => {
    expect(visibleItems(catalog, '', 'block', []).map((item) => item.ref)).toEqual([
      '@payload-components/hero-basic',
    ])
    expect(
      visibleItems(catalog, '', 'selected', ['@payload-components/media', 'forms']).map(
        (item) => item.ref,
      ),
    ).toEqual(['forms', '@payload-components/media'])
  })
})
