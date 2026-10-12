import { describe, expect, test } from 'bun:test'

import { CellLru, cellRect, rowsFor } from '../atlas'

describe('print cells', () => {
  test('a key keeps its cell and only its first take is fresh', () => {
    const lru = new CellLru(4)
    expect(lru.take('a', new Set())).toEqual({ cell: 0, fresh: true })
    expect(lru.take('b', new Set())).toEqual({ cell: 1, fresh: true })
    expect(lru.take('a', new Set())).toEqual({ cell: 0, fresh: false })
  })

  test('a full atlas reuses the least recently used cell', () => {
    const lru = new CellLru(2)
    lru.take('a', new Set())
    lru.take('b', new Set())
    lru.take('a', new Set())
    expect(lru.take('c', new Set())).toEqual({ cell: 1, fresh: true })
    expect(lru.has('b')).toBe(false)
    expect(lru.take('b', new Set())).toEqual({ cell: 0, fresh: true })
  })

  test('a print on screen is never evicted', () => {
    const lru = new CellLru(2)
    lru.take('a', new Set())
    lru.take('b', new Set())
    expect(lru.take('c', new Set(['a']))).toEqual({ cell: 1, fresh: true })
    expect(lru.take('d', new Set(['a', 'c']))).toBeNull()
    expect(lru.take('a', new Set(['a', 'c']))).toEqual({ cell: 0, fresh: false })
  })

  test('rows grow in powers of two up to the cap', () => {
    expect([0, 1, 8, 9, 33, 80, 2000].map((n) => rowsFor(n, 32))).toEqual([1, 1, 1, 2, 8, 16, 32])
  })

  test('a cell rect is its tile inset by half a texel, top edge first', () => {
    expect(cellRect(9, 2)).toEqual([256.5 / 2048, 128.5 / 256, 511.5 / 2048, 255.5 / 256])
  })
})
