import { Vector3 } from 'three'

import type { Footprint, LineLayout, Rig, Sim, Span, Stop, V3 } from './contract'

/** Clearance between the pick table and the transport. */
const FEED_GAP = 0.05
/** The arm's bay between the feed's end and the board: where it parks and turns. */
const ARM_BAY = 2.244
/** The rail starts this far before the board and runs this far past it. */
const RAIL_LEAD = 1.544
const RAIL_TAIL = 0.12
const RAIL_Z = -6.0
export const ARM = { h0: 1.9, l1: 6.4, l2: 6.4, safe: 3.6, base: 0.62, park: 0.6, w: 0.5 }

const union = (a: Span, b: Span): Span => ({ x0: Math.min(a.x0, b.x0), x1: Math.max(a.x1, b.x1) })
const shift = (pts: readonly V3[], dx: number) => pts.map(([x, y, z]) => new Vector3(x + dx, y, z))
const moved = (f: Footprint, dx: number): Footprint => ({ ...f, x0: f.x0 + dx, x1: f.x1 + dx })
const spanOf = (pts: Vector3[]): Span => pts.reduce((s, p) => ({ x0: Math.min(s.x0, p.x), x1: Math.max(s.x1, p.x) }), { x0: Infinity, x1: -Infinity })

/**
 * Butts the stations together left to right. The pick frame (cabinet and
 * table) anchors the line at x = 0; the transport starts after the table, the
 * arm's bay after the transport (or the table, when there is none), then the
 * board. The rail runs under the arm from the bay to the board's far end.
 */
export function layoutLine(rig: Rig): LineLayout {
  const { cabinet, table, transport, board, integrator } = rig
  const pick = union(cabinet.footprint, table.footprint)
  const tAt = pick.x1 + FEED_GAP - transport.footprint.x0
  const path = transport.kind === 'path'
  const feedEnd = path ? tAt + transport.footprint.x1 : pick.x1
  const bAt = feedEnd + ARM_BAY - board.footprint.x0
  const boardX0 = bAt + board.footprint.x0
  const boardX1 = bAt + board.footprint.x1
  const feedX = path ? tAt + transport.at(transport.length, new Vector3()).x : (table.footprint.x0 + table.footprint.x1) / 2
  const rail = { x0: Math.min(boardX0 - RAIL_LEAD, feedX + 1.2), x1: boardX1 + RAIL_TAIL, z: RAIL_Z }
  const park = rail.x0 + ARM.park
  const stops: Stop[] = [
    { id: 'cabinet', label: 'Cabinet', pts: shift(cabinet.frame, 0), span: cabinet.footprint, box: cabinet.footprint, el: cabinet.el },
    { id: 'table', label: 'Pick table', pts: shift(table.frame, 0), span: table.footprint, box: table.footprint, el: table.el },
  ]
  if (path) stops.push({ id: 'transport', label: transport.label, pts: shift(transport.frame, tAt), span: moved(transport.footprint, tAt), box: moved(transport.footprint, tAt), el: transport.el })
  const boardPts = [
    ...shift(board.frame, bAt),
    ...shift(integrator.frame ?? [], bAt),
    new Vector3(rail.x1 + 0.4, 0, rail.z - 0.4),
    new Vector3(rail.x1 + 0.4, 2.4, rail.z),
    new Vector3(park + 2, 7.2, rail.z),
  ]
  stops.push({ id: 'board', label: 'Board', pts: boardPts, span: spanOf(boardPts), box: moved(board.footprint, bAt), el: board.el })
  const all = stops.flatMap((s) => s.pts)
  let extent = spanOf(all)
  if (integrator.footprint) extent = union(extent, { x0: bAt + integrator.footprint.x0, x1: bAt + integrator.footprint.x1 })
  return { at: { pick: 0, transport: tAt, board: bAt }, rail, extent, stops, all }
}

/** The rail under the arm, following the board while the line slides. */
export function railNow(sim: Sim) {
  const d = sim.at.board - sim.line.at.board
  return { x0: sim.line.rail.x0 + d, x1: sim.line.rail.x1 + d, z: sim.line.rail.z }
}

export const drawerWorld = (sim: Sim, aisle: number, out: Vector3) => {
  sim.rig.cabinet.drawer(aisle, out)
  out.x += sim.at.pick
  return out
}
export const pocketWorld = (sim: Sim, index: number, out: Vector3) => {
  sim.rig.table.pocket(index, out)
  out.x += sim.at.pick
  return out
}
export const pathWorld = (sim: Sim, u: number, out: Vector3) => {
  const t = sim.rig.transport
  if (t.kind === 'none') return out
  t.at(u, out)
  out.x += sim.at.transport
  return out
}
/** Board-local to world. */
export const boardWorld = (sim: Sim, local: { x: number; y: number; z: number }, out: Vector3) => {
  const o = sim.rig.board.origin
  return out.set(sim.at.board + o.x + local.x * o.s, local.y * o.s, o.z + local.z * o.s)
}
