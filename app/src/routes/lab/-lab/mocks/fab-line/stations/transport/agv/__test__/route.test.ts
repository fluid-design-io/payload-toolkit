import { describe, expect, test } from 'bun:test'
import { Vector3 } from 'three'

import type { Site } from '../../../../core/contract'
import { lineOf, line as straight } from '../../../../core/line'
import { BOARDS } from '../../../board'
import { CABINETS } from '../../../cabinet'
import { INTEGRATORS } from '../../../integrator'
import { TABLES } from '../../../table'
import { agv } from '../../agv.data'
import { DECK, DRIVE, wrap } from '../route'

/** The riser line's site in the AGV's frame: drawers and Riser 40, the PCB board with the machines integrator. */
const site: Site = {
  pick: { x0: -19.08, x1: -9, z0: -4.65, z1: 4.05, h: 4.57 },
  board: { x0: 2.544, x1: 21.99, z0: -5.328, z1: 5.928, h: 0.672 },
  rail: { x0: -0.0546, x1: 19.8, z: -6 },
}
const lenOf = (pts: readonly Vector3[]) => pts.reduce((s, p, i) => (i ? s + p.distanceTo(pts[i - 1]) : 0), 0)

describe('AGV errand', () => {
  test('starts at the load dock and ends where the arm picks, so the layout and arm stay put', () => {
    if (agv.kind !== 'path') throw new Error('agv is a path transport')
    const { pts } = wrap(site)
    expect(pts[0].distanceTo(agv.at(0, new Vector3()))).toBeLessThan(1e-9)
    expect(pts[pts.length - 1].distanceTo(agv.at(agv.length, new Vector3()))).toBeLessThan(1e-9)
    expect(agv.footprint).toEqual({ x0: -8.95, x1: 0.3, z0: -4.2, z1: 0.2, h: 1.3 })
  })

  test('takes the long way: about 104 m, round the board and the parked machine and up to a 3.4 m mezzanine, inside the room', () => {
    const { pts } = wrap(site)
    expect(lenOf(pts)).toBeCloseTo(103.5, 0)
    expect(Math.max(...pts.map((p) => p.y)) - DECK).toBeCloseTo(3.4, 5)
    expect(Math.max(...pts.map((p) => p.x))).toBeGreaterThan(site.board.x1 + 3)
    for (const p of pts) {
      expect(Math.abs(p.z)).toBeLessThan(8.1)
      const onBoard = p.x > site.board.x0 && p.x < site.board.x1 && p.z > site.board.z0 && p.z < site.board.z1
      expect(onBoard).toBe(false)
    }
  })

  test('crawls at the lift, the charger and the light, and sprints at nine metres a second on the straights', () => {
    const { pts, pace, data: plan } = wrap(site)
    const len = lenOf(pts)
    const samples = Array.from({ length: 2000 }, (_, i) => pace!((len * i) / 1999))
    expect(Math.min(...samples)).toBeCloseTo(1, 5)
    expect(Math.max(...samples)).toBeCloseTo(DRIVE.top / DRIVE.min, 5)
    for (const s of [(plan!.lift.s0 + plan!.lift.s1) / 2, (plan!.charger.s0 + plan!.charger.s1) / 2, plan!.light.s - 0.3]) expect(pace!(s)).toBeCloseTo(1, 1)
  })

  test('a part rides for about 25 seconds on the default line, against the Conveyor\'s 13', () => {
    const line = lineOf({ layout: straight, cabinet: CABINETS[0], table: TABLES[0], transport: agv, board: BOARDS[0], integrator: INTEGRATORS[0] })
    expect(line.path!.length / DRIVE.min).toBeCloseTo(25.1, 0)
  })
})
