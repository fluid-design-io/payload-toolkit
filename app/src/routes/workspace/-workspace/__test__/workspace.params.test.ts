import { describe, expect, test } from 'bun:test'
import {
  parseWorkspaceSearch,
  searchFromSetup,
  searchFromState,
  setupFromSearch,
  viewFromSearch,
} from '../workspace.params'
import type { WorkspaceSearch } from '../workspace.params'
import type { RegistryItem } from '../workspace.types'

const items: readonly RegistryItem[] = [
  {
    ref: 'forms',
    name: 'forms',
    title: 'Payload forms',
    description: 'Native Payload forms.',
    kind: 'feature',
    source: 'payload-toolkit',
    guide: 'docs/payload-toolkit/forms/GUIDE.md',
  },
  {
    ref: '@payload-components/hero-basic',
    name: 'hero-basic',
    title: 'Hero Basic',
    description: 'Hero block.',
    kind: 'block',
    source: '@payload-components',
  },
]

describe('workspace search params', () => {
  test('a full setup round-trips through the URL', () => {
    const search = searchFromSetup({
      target: 'new',
      name: 'acme',
      framework: 'tanstack',
      database: 'mongodb',
      packageManager: 'bun',
      agent: 'codex',
      items: ['forms', '@payload-components/hero-basic'],
    })
    expect(search).toEqual({
      target: 'new',
      name: 'acme',
      framework: 'tanstack',
      database: 'mongodb',
      packageManager: 'bun',
      agent: 'codex',
      items: 'forms,@payload-components/hero-basic',
    })
    expect(setupFromSearch(parseWorkspaceSearch(search, items))).toEqual({
      target: 'new',
      name: 'acme',
      framework: 'tanstack',
      database: 'mongodb',
      packageManager: 'bun',
      agent: 'codex',
      items: ['forms', '@payload-components/hero-basic'],
    })
  })

  test('defaults are omitted, so the default setup has no query string', () => {
    expect(
      searchFromSetup({
        target: 'existing',
        name: 'my-payload-app',
        framework: 'next',
        database: 'postgres',
        packageManager: 'pnpm',
        agent: 'claude',
        items: [],
      }),
    ).toEqual({})
    expect(searchFromSetup({ ...setupFromSearch({}), database: 'mongodb' })).toEqual({
      database: 'mongodb',
    })
  })

  test('an empty search restores the default setup', () => {
    expect(setupFromSearch(parseWorkspaceSearch({}, items))).toEqual({
      target: 'existing',
      name: 'my-payload-app',
      framework: 'next',
      database: 'postgres',
      packageManager: 'pnpm',
      agent: 'claude',
      items: [],
    })
  })

  test('invalid choices and unknown params are dropped', () => {
    expect(
      parseWorkspaceSearch(
        {
          target: 'old',
          framework: 'remix',
          database: 42,
          agent: 'codex',
          packageManager: ['bun'],
          theme: 'x',
        },
        items,
      ),
    ).toEqual({ agent: 'codex' })
  })

  test('unknown item refs are dropped and duplicates collapse into catalog order', () => {
    expect(
      parseWorkspaceSearch(
        { items: '@payload-components/hero-basic,nope,forms,@payload-components/hero-basic' },
        items,
      ),
    ).toEqual({ items: 'forms,@payload-components/hero-basic' })
    expect(parseWorkspaceSearch({ items: 'nope' }, items)).toEqual({})
  })

  test('a numeric name from the router JSON parsing stays a name; an empty one is dropped', () => {
    expect(parseWorkspaceSearch({ name: 2026 }, items)).toEqual({ name: '2026' })
    expect(parseWorkspaceSearch({ name: '' }, items)).toEqual({})
  })

  test('invalid raw values still fall back after the router merges the result over them', () => {
    const raw: Record<string, unknown> = {
      framework: 'remix',
      database: 'mongodb',
      items: 'nope,forms',
      theme: 'x',
    }
    const merged = { ...raw, ...parseWorkspaceSearch(raw, items) } as WorkspaceSearch
    expect(setupFromSearch(merged)).toEqual({
      target: 'existing',
      name: 'my-payload-app',
      framework: 'next',
      database: 'mongodb',
      packageManager: 'pnpm',
      agent: 'claude',
      items: ['forms'],
    })
  })

  test('the factory view rides beside the setup and round-trips', () => {
    const search = searchFromState({
      setup: { ...setupFromSearch({}), items: ['forms'] },
      view: 'factory',
    })
    expect(search).toEqual({ items: 'forms', view: 'factory' })
    const parsed = parseWorkspaceSearch(search, items)
    expect(viewFromSearch(parsed)).toBe('factory')
    expect(setupFromSearch(parsed).items).toEqual(['forms'])
  })

  test('the grid view is the default, so it never reaches the URL', () => {
    expect(searchFromState({ setup: setupFromSearch({}), view: 'grid' })).toEqual({})
    expect(viewFromSearch(parseWorkspaceSearch({}, items))).toBe('grid')
  })

  test('an unknown view falls back to the grid after the router merges the result', () => {
    const raw: Record<string, unknown> = { view: '3d' }
    const merged = { ...raw, ...parseWorkspaceSearch(raw, items) } as WorkspaceSearch
    expect(viewFromSearch(merged)).toBe('grid')
    expect(viewFromSearch(parseWorkspaceSearch({ view: 'grid' }, items))).toBe('grid')
  })
})
