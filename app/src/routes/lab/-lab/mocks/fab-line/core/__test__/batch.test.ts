import { describe, expect, test } from 'bun:test'

import { pack, templateOf } from '../batch'
import type { ChipBox } from '../contract'

const body: ChipBox = { size: [2, 0.2, 1], at: [0, 0.1, 0], paint: 'body', edge: true }
const lead: ChipBox = { size: [0.1, 0.05, 0.1], at: [1, 0.025, 0], paint: 'pin', edge: false }

const bounds = (p: Float32Array) => {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < p.length; i++) {
    lo[i % 3] = Math.min(lo[i % 3], p[i])
    hi[i % 3] = Math.max(hi[i % 3], p[i])
  }
  return [lo, hi].map((v) => v.map((x) => Math.round(x * 1000) / 1000))
}

describe('package templates', () => {
  test('each box is a sized, placed cube of 24 vertices and 12 triangles; only edged boxes get 12 hairlines', () => {
    const t = templateOf([body, lead])
    expect(t.paint.length).toBe(48)
    expect(t.index.length).toBe(72)
    expect(bounds(t.position.subarray(0, 72))).toEqual([[-1, 0, -0.5], [1, 0.2, 0.5]])
    expect(bounds(t.position.subarray(72))).toEqual([[0.95, 0, -0.05], [1.05, 0.05, 0.05]])
    expect([...new Set(t.paint.subarray(0, 24))]).toEqual([0])
    expect([...new Set(t.paint.subarray(24))]).toEqual([1])
    expect(Math.min(...t.index.subarray(36))).toBe(24)
    expect(t.edges.length).toBe(24 * 3)
    expect(bounds(t.edges)).toEqual([[-1, 0, -0.5], [1, 0.2, 0.5]])
  })

  test('packing tags every vertex with its entry and offsets each entry indices past the ones before', () => {
    const a = templateOf([body]), b = templateOf([body, lead])
    const p = pack([a, b])
    expect(p.entry.length).toBe(24 + 48)
    expect([...new Set(p.entry.subarray(0, 24))]).toEqual([0])
    expect([...new Set(p.entry.subarray(24))]).toEqual([1])
    expect(Math.min(...p.index.subarray(36))).toBe(24)
    expect(Math.max(...p.index)).toBe(71)
    expect([...p.edgeEntry]).toEqual([...Array(24).fill(0), ...Array(24).fill(1)])
  })

  test('nothing packs to nothing', () => {
    expect(pack([]).index.length).toBe(0)
  })
})
