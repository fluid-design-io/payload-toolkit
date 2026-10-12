import { describe, expect, test } from 'bun:test'

import type { Part } from '../../../core/contract'
import type { Spec } from '../../../core/spec'
import { backlog, etchStrokes, pinRows, scriptOf, toolAt, workTime } from '../script'
import type { Tool } from '../script'

const qfp: Spec = { pkg: 'qfp', w: 1.2, d: 1.2, h: 0.13, lead: 0.17, fw: 1.54, fd: 1.54, c: 0.5 }
const soic: Spec = { pkg: 'soic', w: 1.4, d: 0.52, h: 0.15, lead: 0.17, fw: 1.4, fd: 0.86, c: 0.5 }
const passive: Spec = { pkg: 'passive', w: 0.62, d: 0.32, h: 0.2, lead: 0, fw: 0.62, fd: 0.32, c: 0.5 }
const part = (spec: Spec) => ({ spec }) as Part
const tool = (): Tool => ({ phase: null as never, u: 0, x: 0, z: 0, on: false })

describe('weld script', () => {
  test('a QFP gets one joint per lead, ten a side, seamed once around the body', () => {
    expect(pinRows(qfp).map((r) => r.pins.length)).toEqual([10, 10, 10, 10])
    const s = scriptOf('drone', qfp)
    expect(s.phases.map((p) => p.kind)).toEqual([
      'approach', 'scan', 'move', 'tack', 'move', 'tack', 'move', 'tack', 'move', 'tack',
      'move', 'seam', 'move', 'seam', 'move', 'seam', 'move', 'seam', 'lift',
    ])
    expect(s.beads).toHaveLength(40)
    expect(s.total).toBeCloseTo(7.44, 2)
  })

  test('every joint is laid while the arc burns, never after the job ends', () => {
    const s = scriptOf('drone', soic)
    for (const b of s.beads) {
      expect(b.at).toBeGreaterThan(0)
      expect(b.at).toBeLessThan(s.total)
      expect(toolAt(s, b.at, tool()).on).toBe(true)
    }
  })

  test('tacks fire under the 3 Hz flash limit', () => {
    const tacks = scriptOf('drone', qfp).phases.filter((p) => p.kind === 'tack').map((p) => p.t0)
    for (let i = 1; i < tacks.length; i++) expect(tacks[i] - tacks[i - 1]).toBeGreaterThan(1 / 3)
  })

  test('a passive is two end-cap fillets', () => {
    expect(pinRows(passive).map((r) => r.pins.map((p) => [p.x, p.z]))).toEqual([[[-0.25, 0]], [[0.25, 0]]])
  })
})

describe('etch script', () => {
  test('a QFP lid gets a border, the prompt and three lines of code', () => {
    expect(etchStrokes(qfp).map((s) => s.pts.length)).toEqual([5, 3, 2, 2, 2, 2])
  })

  test('a passive is too small for the prompt and keeps the border and one line', () => {
    expect(etchStrokes(passive).map((s) => s.pts.length)).toEqual([5, 2])
  })

  test('the beam burns only along strokes', () => {
    const s = scriptOf('hexapod', qfp)
    const at = s.strokes[0]
    expect(toolAt(s, at.t0 + at.dur / 2, tool()).on).toBe(true)
    expect(toolAt(s, at.t0 - 0.01, tool()).on).toBe(false)
  })
})

describe('work time', () => {
  test('no agent skips the queue; a backlog welds faster', () => {
    expect(workTime('none', part(qfp))).toBe(0)
    backlog.waiting = 0
    const alone = workTime('claude', part(qfp))
    backlog.waiting = 5
    expect(workTime('claude', part(qfp))).toBeCloseTo(alone * 0.42, 5)
    backlog.waiting = 0
  })
})
