import { describe, expect, test } from 'bun:test'

import type { Aisle, Bin } from '../../../../warehouse'
import type { Part } from '../contract'
import { activeAisle, pagesOf } from '../pages'

const bin = (ref: string, title: string, rack: number, bay: number) =>
  ({ item: { ref, title, label: 'Hero' }, rack, bay }) as unknown as Bin
const aisle = {
  id: 'block:hero',
  label: 'Heroes',
  racks: [
    { name: 'Alpha', bins: [bin('a1', 'Split', 0, 1), bin('a2', 'Gamma One', 0, 1), bin('a3', 'Video', 0, 2)] },
    { name: 'Beta', bins: [bin('b1', 'Gamma Two', 1, 3)] },
  ],
} as unknown as Aisle
const sim = { parts: new Map(['a1', 'a2', 'a3', 'b1'].map((ref) => [ref, { ref } as unknown as Part])) }
const refs = (parts: (Part | null)[]) => Object.entries(parts).map(([i, p]) => `${i}:${(p as unknown as { ref: string }).ref}`)

describe('table pages', () => {
  test('whole bays fill the table, a bay to every 20 pockets', () => {
    const pages = pagesOf(aisle, { bays: 2 }, '', sim)
    expect(pages.map((p) => ({ refs: refs(p.parts), slots: p.slots, label: p.label }))).toEqual([
      { refs: ['0:a1', '1:a2', '20:a3'], slots: 21, label: 'BAYS 01–02 · ALPHA' },
      { refs: ['0:b1'], slots: 1, label: 'BAY 03 · BETA' },
    ])
  })

  test('a search lists every match in the aisle, packed', () => {
    const [only, ...rest] = pagesOf(aisle, { bays: 2 }, 'gamma', sim)
    expect(rest).toEqual([])
    expect({ refs: refs(only.parts), slots: only.slots, label: only.label }).toEqual({ refs: ['0:a2', '1:b1'], slots: 2, label: '“GAMMA” · 2 IN HEROES' })
    expect(pagesOf(aisle, { bays: 2 }, 'zzz', sim)).toEqual([{ parts: [], slots: 0, label: 'NO MATCHES FOR “ZZZ”' }])
  })

  test('the table shows the rail category, else the aisle with most matches, else the hero block', () => {
    const aisles = [{ id: 'feature' }, { id: 'block:hero' }, { id: 'component' }] as unknown as Aisle[]
    expect(activeAisle(aisles, 'component', null)).toBe(2)
    expect(activeAisle(aisles, 'all', [0, 1, 5])).toBe(2)
    expect(activeAisle(aisles, 'all', null)).toBe(1)
  })
})
