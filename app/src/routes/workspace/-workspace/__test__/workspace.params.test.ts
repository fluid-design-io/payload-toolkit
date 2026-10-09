import { describe, expect, test } from 'bun:test'
import { parseWorkspaceSearch, searchFromSetup, setupFromSearch } from '../workspace.params'
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
      name: 'acme',
      framework: 'tanstack',
      database: 'mongodb',
      packageManager: 'bun',
      agent: 'codex',
      items: ['forms', '@payload-components/hero-basic'],
    })
    expect(search).toEqual({
      name: 'acme',
      framework: 'tanstack',
      database: 'mongodb',
      packageManager: 'bun',
      agent: 'codex',
      items: 'forms,@payload-components/hero-basic',
    })
    expect(setupFromSearch(parseWorkspaceSearch(search, items))).toEqual({
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
        name: 'my-payload-app',
        framework: 'next',
        database: 'postgres',
        packageManager: 'pnpm',
        agent: 'none',
        items: [],
      }),
    ).toEqual({})
    expect(searchFromSetup({ ...setupFromSearch({}), database: 'mongodb' })).toEqual({
      database: 'mongodb',
    })
  })

  test('an empty search restores the default setup', () => {
    expect(setupFromSearch(parseWorkspaceSearch({}, items))).toEqual({
      name: 'my-payload-app',
      framework: 'next',
      database: 'postgres',
      packageManager: 'pnpm',
      agent: 'none',
      items: [],
    })
  })

  test('invalid choices and unknown params are dropped', () => {
    expect(
      parseWorkspaceSearch(
        { framework: 'remix', database: 42, agent: 'codex', packageManager: ['bun'], theme: 'x' },
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
      name: 'my-payload-app',
      framework: 'next',
      database: 'mongodb',
      packageManager: 'pnpm',
      agent: 'none',
      items: ['forms'],
    })
  })
})
