import { Vector3 } from 'three'

import type { Callout, Dim, Footprint, FrameKey, Framing, LayoutVariant, LineLayout, Path, Place, Placement, Rig, Sim, Span, Stop, V3 } from './contract'
import { sampleRoute } from './route'

/** Clearance between the pick table and the transport. */
const FEED_GAP = 0.05
/** The arm's bay between the feed's end and the board: where it parks and turns. */
const ARM_BAY = 2.244
/** The rail starts this far before the board and runs this far past it. */
const RAIL_LEAD = 1.544
const RAIL_TAIL = 0.12
const RAIL_Z = -6.0
export const ARM = { h0: 1.9, l1: 6.4, l2: 6.4, safe: 3.6, base: 0.62, park: 0.6, w: 0.5 }
/** What a stop frames when its station leaves `min` and `margin` unset. */
const MIN_STOP = 13
const MARGIN = 1.22

const union = (a: Span, b: Span): Span => ({ x0: Math.min(a.x0, b.x0), x1: Math.max(a.x1, b.x1) })
const moved = (f: Footprint, dx: number, dz: number): Footprint => ({ ...f, x0: f.x0 + dx, x1: f.x1 + dx, z0: f.z0 + dz, z1: f.z1 + dz })
const boxOf = (a: Footprint, b: Footprint): Footprint => ({ ...union(a, b), z0: Math.min(a.z0, b.z0), z1: Math.max(a.z1, b.z1), h: Math.max(a.h, b.h) })
const spanOf = (pts: readonly Vector3[]): Span => pts.reduce((s, p) => ({ x0: Math.min(s.x0, p.x), x1: Math.max(s.x1, p.x) }), { x0: Infinity, x1: -Infinity })
const at3 = ([x, y, z]: V3, p: Place): V3 => [x + p.x, y + p.y, z + p.z]
const along = (x: number): Place => ({ x, y: 0, z: 0 })

/** A polyline sampled by distance along it. */
function polyline(pts: Vector3[], data: unknown): Path {
  const cum = [0]
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]))
  const route = { pts, vias: [], len: cum[cum.length - 1], cum }
  return { length: route.len, pts, data, at: (u, out) => sampleRoute(route, u / route.len, out), along: (u) => Math.min(route.len, Math.max(0, u)) }
}

/**
 * Reparameterizes `path` so the sim's steady `u` covers distance `s` at
 * `rate(s)` times its speed. `us[i]` is the sim distance at which a part
 * reaches `ss[i]` along the path.
 */
function paced(path: Path, rate: (s: number) => number, n = 512): Path {
  const len = path.length
  const us = new Float32Array(n + 1), ss = new Float32Array(n + 1)
  for (let i = 1; i <= n; i++) {
    const s0 = (len * (i - 1)) / n, s1 = (len * i) / n
    ss[i] = s1
    us[i] = us[i - 1] + (s1 - s0) / Math.max(1, rate((s0 + s1) / 2))
  }
  const along = (u: number) => {
    if (u <= 0) return 0
    if (u >= us[n]) return len
    let lo = 0, hi = n
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1
      if (us[mid] <= u) lo = mid
      else hi = mid
    }
    return ss[lo] + ((u - us[lo]) / (us[hi] - us[lo])) * (ss[hi] - ss[lo])
  }
  return { ...path, length: us[n], at: (u, out) => path.at(along(u), out), along }
}

/**
 * Butts the station frames together left to right. The pick frame (cabinet
 * and table) anchors the line at x = 0; the transport starts after the table,
 * the arm's bay after the transport (or the table, when there is none), then
 * the board.
 */
export function placeLine({ cabinet, table, transport, board }: Rig): Placement {
  const pick = union(cabinet.footprint, table.footprint)
  const tAt = pick.x1 + FEED_GAP - transport.footprint.x0
  const feedEnd = transport.kind === 'path' ? tAt + transport.footprint.x1 : pick.x1
  return { pick: along(0), transport: along(tAt), board: along(feedEnd + ARM_BAY - board.footprint.x0) }
}

/** The rail under the arm: from the feed's end (or just before the board) to the board's far end, behind the board. */
function railOf({ table, transport, board }: Rig, at: Placement) {
  const feedX = transport.kind === 'path' ? at.transport.x + transport.at(transport.length, new Vector3()).x : at.pick.x + (table.footprint.x0 + table.footprint.x1) / 2
  return { x0: Math.min(at.board.x + board.footprint.x0 - RAIL_LEAD, feedX + 1.2), x1: at.board.x + board.footprint.x1 + RAIL_TAIL, z: at.board.z + RAIL_Z }
}

/** One framing on the line: a station, or what parks beside one and joins its `stop`. Only a `label` gets a callout. */
type Member = { id: string; stop?: string; label?: string; frame: FrameKey; footprint: Footprint; framing: Framing }

/** The rail arm as a station in the board's frame: its rail behind the board and the arm's reach up from its park. */
function armMember(rail: LineLayout['rail'], board: Place): Member {
  const x0 = rail.x0 - board.x, x1 = rail.x1 - board.x, z = rail.z - board.z
  return {
    id: 'arm',
    stop: 'board',
    label: 'Rail arm',
    frame: 'board',
    footprint: { x0, x1, z0: z - 0.4, z1: z + 0.4, h: 7.2 },
    framing: {
      pts: [[x1 + 0.4, 0, z - 0.4], [x1 + 0.4, 2.4, z], [x0 + ARM.park + 2, 7.2, z]],
      callout: { at: [x0 + 2.6, 0.5, z], tag: [x0 + 3.4, 6.8, z + 0.4] },
      dims: [{ from: [x0, 0, z], to: [x1, 0, z], off: [0, 0, -1.4] }],
    },
  }
}

const calloutOf = ({ x0, x1, z0, z1, h }: Footprint): NonNullable<Framing['callout']> => {
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2
  return { at: [cx, h, cz], tag: [cx + 0.6, h + 2.5, cz + 0.9] }
}

/** Groups the members into stops in line order, each placed by its frame's placement. */
function stopsOf(members: readonly Member[], at: Placement): Stop[] {
  const stops = new Map<string, Stop>()
  for (const m of members) {
    const p = at[m.frame], f = m.footprint, fr = m.framing
    const key = m.stop ?? m.id
    let stop = stops.get(key)
    if (!stop) {
      stops.set(key, (stop = {
        id: key,
        label: m.label ?? key,
        frame: m.frame,
        pts: [],
        span: { x0: 0, x1: 0 },
        box: { x0: f.x0 + p.x, x1: f.x1 + p.x, z0: f.z0 + p.z, z1: f.z1 + p.z, h: f.h + p.y },
        el: fr.el,
        min: fr.min ?? MIN_STOP,
        margin: fr.margin ?? MARGIN,
        callouts: [],
        dims: [],
        print: fr.print ? [fr.print[0] + p.x, fr.print[1] + p.z] : [(f.x0 + f.x1) / 2 + p.x, f.z1 + 0.9 + p.z],
      }))
    }
    for (const q of fr.pts) stop.pts.push(new Vector3(q[0] + p.x, q[1] + p.y, q[2] + p.z))
    if (m.label) {
      const c = fr.callout ?? calloutOf(f)
      stop.callouts.push({ id: m.id, text: m.label, at: at3(c.at, p), tag: at3(c.tag, p) } satisfies Callout)
    }
    const dims: readonly Dim[] = fr.dims ?? [{ from: [f.x0, 0, f.z1], to: [f.x1, 0, f.z1], off: [0, 0, 1.5] }]
    for (const d of dims) stop.dims.push({ from: at3(d.from, p), to: at3(d.to, p), off: d.off })
  }
  for (const stop of stops.values()) stop.span = spanOf(stop.pts)
  return [...stops.values()]
}

/**
 * The line in world units from the picked stations and the layout's
 * placement: the rail, the transport's live path, every station's framing as
 * a camera stop, and the overview's points. A layout only moves frames.
 */
export function lineOf(rig: Rig): LineLayout {
  const at = rig.layout.place(rig)
  const { cabinet, table, transport, board, integrator } = rig
  const rail = railOf(rig, at)
  const parked = integrator.footprint?.(board)
  const t = at.transport
  let path: Path | null = null
  if (transport.kind === 'path') {
    const route = transport.wrap({
      pick: moved(boxOf(cabinet.footprint, table.footprint), at.pick.x - t.x, at.pick.z - t.z),
      board: moved(parked ? boxOf(board.footprint, parked) : board.footprint, at.board.x - t.x, at.board.z - t.z),
      rail: { x0: rail.x0 - t.x, x1: rail.x1 - t.x, z: rail.z - t.z },
    })
    path = polyline(route.pts, route.data)
    if (route.pace) path = paced(path, route.pace)
  }
  const members: Member[] = [
    { id: 'cabinet', label: 'Cabinet', frame: 'pick', footprint: cabinet.footprint, framing: cabinet.frame },
    { id: 'table', label: 'Pick table', frame: 'pick', footprint: table.footprint, framing: table.frame },
  ]
  if (transport.kind === 'path') members.push({ id: 'transport', label: transport.label, frame: 'transport', footprint: transport.footprint, framing: transport.frame })
  members.push({ id: 'board', label: 'Board', frame: 'board', footprint: board.footprint, framing: board.frame })
  if (parked) {
    const { x0, x1, z0, z1, h } = parked
    members.push({ id: 'integrator', stop: 'board', frame: 'board', footprint: parked, framing: { pts: [[x0, 0, z0], [x1, 0, z0], [x1, h, z1], [x0, 0, z1]], dims: [] } })
  }
  members.push(armMember(rail, at.board))
  const stops = stopsOf(members, at)
  const all = stops.flatMap((s) => s.pts)
  if (path) all.push(...path.pts.map((p) => new Vector3(p.x + t.x, p.y + t.y, p.z + t.z)))
  return { at, rail, path, extent: spanOf(all), stops, all }
}

/** The built-in layout: every station in one row along +x. */
export const line: LayoutVariant = { id: 'line', label: 'Line', place: placeLine }

/** The rail under the arm, following the board while the line slides. */
export function railNow(sim: Sim) {
  const now = sim.at.board, end = sim.line.at.board
  const d = now.x - end.x
  return { x0: sim.line.rail.x0 + d, x1: sim.line.rail.x1 + d, z: sim.line.rail.z + now.z - end.z }
}
const placed = (out: Vector3, p: Place) => out.set(out.x + p.x, out.y + p.y, out.z + p.z)

export const drawerWorld = (sim: Sim, aisle: number, out: Vector3) => {
  return placed(sim.rig.cabinet.drawer(aisle, out), sim.at.pick)
}
export const pocketWorld = (sim: Sim, index: number, out: Vector3) => {
  return placed(sim.rig.table.pocket(index, out), sim.at.pick)
}
export const pathWorld = (sim: Sim, u: number, out: Vector3) => {
  const path = sim.line.path
  if (!path) return out
  return placed(path.at(u, out), sim.at.transport)
}
/** Board-local to world. */
export const boardWorld = (sim: Sim, local: { x: number; y: number; z: number }, out: Vector3) => {
  const o = sim.rig.board.origin, at = sim.at.board
  return out.set(at.x + o.x + local.x * o.s, at.y + local.y * o.s, at.z + o.z + local.z * o.s)
}
