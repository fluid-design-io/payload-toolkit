import { describe, expect, test } from 'bun:test'

import type { Spec } from '../../core/spec'
import { lidOf, packageBoxes } from '../package'

const spec = (pkg: Spec['pkg'], c: number): Spec => ({ pkg, w: 1, d: 0.5, h: 0.15, lead: 0.17, fw: 1, fd: 0.84, c })

describe('package boxes', () => {
  test('a simple passive is plated metal all over, a complex one keeps its body', () => {
    expect(new Set(packageBoxes(spec('passive', 0.4)).map((b) => b.paint))).toEqual(new Set(['pin']))
    expect(new Set(packageBoxes(spec('passive', 0.8)).map((b) => b.paint))).toEqual(new Set(['body', 'pin']))
  })

  test('a SOIC is its mold with hairlines and 2 × 8 three-part leads', () => {
    const boxes = packageBoxes(spec('soic', 1))
    expect(boxes.filter((b) => b.edge).map((b) => b.paint)).toEqual(['body'])
    expect(boxes.filter((b) => b.paint === 'pin').length).toBe(2 * 8 * 3)
  })

  test('only passives go unprinted', () => {
    expect(lidOf(spec('passive', 1))).toBeNull()
    expect(lidOf(spec('soic', 1))).toEqual({ x: 0, y: 0.03 + 0.15 + 0.003, w: 0.97, d: 0.485 })
  })
})
