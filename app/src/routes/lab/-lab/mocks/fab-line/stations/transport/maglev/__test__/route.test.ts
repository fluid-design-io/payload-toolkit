import { describe, expect, test } from 'bun:test'
import { Vector3 } from 'three'

import { lineOf, line as straight } from '../../../../core/line'
import { BOARDS } from '../../../board'
import { CABINETS } from '../../../cabinet'
import { INTEGRATORS } from '../../../integrator'
import { TABLES } from '../../../table'
import { maglev } from '../../maglev.data'

const speed = maglev.kind === 'path' ? maglev.speed : 0
const rigFor = (board: (typeof BOARDS)[number]) => ({ layout: straight, cabinet: CABINETS[0], table: TABLES[0], transport: maglev, board, integrator: INTEGRATORS[0] })

describe('maglev route', () => {
  for (const board of BOARDS)
    test(`on the ${board.id} board it rides from the dock to the arm's bay in about 13 s, faster than its slowest speed`, () => {
      const line = lineOf(rigFor(board))
      const path = line.path!
      const pts = path.pts!
      expect(pts[0].toArray()).toEqual([-7.25, 1.23, -1.2])
      expect(pts[pts.length - 1].toArray()).toEqual([-1.2, 1.35, -1.2])
      expect(path.at(path.length, new Vector3()).toArray().map((n) => +n.toFixed(3))).toEqual([-1.2, 1.35, -1.2])
      const along = pts.reduce((s, p, i) => (i ? s + p.distanceTo(pts[i - 1]) : 0), 0)
      expect(along).toBeGreaterThan(80)
      expect(path.length / speed).toBeGreaterThan(12)
      expect(path.length / speed).toBeLessThan(14)
    })

  test('it climbs above the arm\'s shoulder and returns to dock height', () => {
    const pts = lineOf(rigFor(BOARDS[0])).path!.pts!
    expect(Math.max(...pts.map((p) => p.y))).toBeCloseTo(7.4, 1)
    expect(Math.min(...pts.map((p) => p.y))).toBeCloseTo(1.23, 2)
  })

  for (const board of BOARDS)
    test(`on the ${board.id} board it stays on the floor, off the board and clear of the arm's rail`, () => {
      const line = lineOf(rigFor(board))
      const dx = line.at.board.x - line.at.transport.x
      const b = board.footprint
      const rail = line.rail
      for (const p of line.path!.pts!) {
        const x = p.x + line.at.transport.x
        expect(Math.abs(p.z)).toBeLessThan(7.6)
        const overBoard = p.x > b.x0 + dx - 0.5 && p.x < b.x1 + dx + 0.5 && p.z > b.z0 - 0.5 && p.z < b.z1 + 0.5
        expect(overBoard).toBe(false)
        if (x > rail.x0 - 0.8 && x < rail.x1 + 0.8) expect(Math.abs(p.z - rail.z)).toBeGreaterThan(1.2)
      }
    })
})
