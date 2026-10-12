import { describe, expect, test } from 'bun:test'

import { BUILTIN } from '../../world/slots'
import type { BoardVariant, CabinetVariant, IntegratorVariant, LayoutVariant, Rig, TableVariant, TransportVariant } from '../contract'
import { lineOf, line, placeLine } from '../line'

/** Small stations with round numbers, so the placed points read off by hand. */
const cabinet = { ...BUILTIN.cabinet[0], footprint: { x0: -1, x1: 1, z0: -3, z1: -2, h: 3 }, frame: { pts: [[0, 1, -2]], min: 0 } } as CabinetVariant
const table = { ...BUILTIN.table[0], footprint: { x0: 0, x1: 2, z0: 0, z1: 1, h: 1 }, frame: { pts: [[0, 0, 0]], margin: 1 } } as TableVariant
const transport = { id: 'none', label: 'None', kind: 'none', footprint: { x0: 0, x1: 0, z0: 0, z1: 0, h: 0 }, frame: { pts: [] } } as TransportVariant
const board = { ...BUILTIN.board[0], footprint: { x0: 0, x1: 4, z0: -1, z1: 1, h: 0.5 }, frame: { pts: [[0, 0, 0], [4, 0, 0]], el: 30 } } as BoardVariant
const integrator = { ...BUILTIN.integrator[0], footprint: undefined } as IntegratorVariant
const tower: LayoutVariant = { id: 'tower', label: 'Tower', place: (rig) => ({ ...placeLine(rig), pick: { x: 0, y: 4.3, z: 0 } }) }
const rig = (layout: LayoutVariant): Rig => ({ layout, cabinet, table, transport, board, integrator })

const r = (n: number) => Math.round(n * 1000) / 1000
const pts = (layout: LayoutVariant) => Object.fromEntries(lineOf(rig(layout)).stops.map((s) => [s.id, s.pts.map((p) => [r(p.x), r(p.y), r(p.z)])]))

describe('station frames in the world', () => {
  test('the line butts the frames along x, and each stop is its station framing moved by its frame', () => {
    // The board sits past the table (x1 = 2) and the arm's 2.244 bay; the rail runs from 1.2 past the table's middle to 0.12 past the board.
    expect(pts(line)).toEqual({
      cabinet: [[0, 1, -2]],
      table: [[0, 0, 0]],
      board: [[4.244, 0, 0], [8.244, 0, 0], [8.764, 0, -6.4], [8.764, 2.4, -6], [4.8, 7.2, -6]],
    })
  })

  test('a layout that lifts the pick frame lifts its stops, and nothing else, with no work of its own', () => {
    const lifted = lineOf(rig(tower))
    expect({ pts: pts(tower), cabinetTop: lifted.stops[0].box.h, rail: [lifted.rail.x0, lifted.rail.x1, lifted.rail.z].map(r) }).toEqual({
      pts: { cabinet: [[0, 5.3, -2]], table: [[0, 4.3, 0]], board: pts(line).board },
      cabinetTop: 7.3,
      rail: [2.2, 8.364, -6],
    })
  })

  test('a stop carries its station framing, with the line defaults where the station leaves them', () => {
    const stops = lineOf(rig(line)).stops.map((s) => ({ id: s.id, frame: s.frame, el: s.el, min: s.min, margin: s.margin }))
    expect(stops).toEqual([
      { id: 'cabinet', frame: 'pick', el: undefined, min: 0, margin: 1.22 },
      { id: 'table', frame: 'pick', el: undefined, min: 13, margin: 1 },
      { id: 'board', frame: 'board', el: 30, min: 13, margin: 1.22 },
    ])
  })

  test('the board stop labels the board and the rail arm, and themes find every anchor in world units', () => {
    const board = lineOf(rig(tower)).stops.find((s) => s.id === 'board')!
    const table = lineOf(rig(tower)).stops.find((s) => s.id === 'table')!
    expect({
      board: board.callouts.map((c) => [c.id, c.text]),
      tableCallout: table.callouts.map((c) => c.at.map(r)),
      tablePrint: table.print,
      railDim: board.dims.at(-1)!.from.map(r),
    }).toEqual({
      board: [['board', 'Board'], ['arm', 'Rail arm']],
      tableCallout: [[1, 5.3, 0.5]],
      tablePrint: [1, 1.9],
      railDim: [2.2, 0, -6],
    })
  })

  test('the overview spans every stop and the transport route', () => {
    const built = lineOf({ ...rig(line), cabinet: BUILTIN.cabinet[0], table: BUILTIN.table[0], transport: BUILTIN.transport[0], board: BUILTIN.board[0] })
    const xs = built.all.map((p) => p.x)
    expect({ x0: r(built.extent.x0), x1: r(built.extent.x1) }).toEqual({ x0: r(Math.min(...xs)), x1: r(Math.max(...xs)) })
    expect(built.stops.map((s) => s.id)).toEqual(['cabinet', 'table', 'transport', 'board'])
  })
})
