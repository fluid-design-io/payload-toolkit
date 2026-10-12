import { Vector3 } from 'three'

import { box, cyl, mergeFills, rect, segs } from '../../../core/three'
import type { Piece } from '../../../core/three'
import { sweepBox } from '../kit'
import { Track } from '../track'
import { BUMP, DECK, HELIX, LOAD, PICK, depot } from './route'
import type { Plan } from './route'

const RAMP = 0.12

/**
 * A deck `w` wide and `t` thick under a 3D centreline (its top face), its
 * section square to the slope so the top shades with the ramp.
 */
function slab(pts: readonly Vector3[], w: number, t: number) {
  const n = pts.length, tan = new Vector3()
  return sweepBox(n, (i, f) => {
    tan.subVectors(pts[Math.min(n - 1, i + 1)], pts[Math.max(0, i - 1)])
    f.p.copy(pts[i])
    f.side.set(-tan.z, 0, tan.x).normalize()
    f.up.crossVectors(f.side, tan).normalize()
  }, { w, y0: -t, y1: 0 }, { smooth: true })
}

const post = (x: number, z: number, y0: number, y1: number, s = 0.09): Piece => ({ geo: box(s, y1 - y0, s), at: [x, (y0 + y1) / 2, z] })

/** Where the traffic light's three lamps and the charger's lamp sit, in order red, amber, green, charger. */
export function lamps(plan: Plan): Vector3[] {
  const { light: l, charger: c } = plan
  const x = l.x + 0.12, z = l.z + 0.95
  return [new Vector3(x, 1.74, z), new Vector3(x, 1.53, z), new Vector3(x, 1.32, z), new Vector3(c.x, c.y + 1.52, c.z)]
}

/** The helix and its column, the mezzanine, the lift shaft, the charging arch, the traffic light and the docks. */
export function structure(plan: Plan): Piece[] {
  const { helix: h, deck: d, lift: l, charger: c, light } = plan
  const out: Piece[] = []
  const { coil, via } = plan
  out.push({ geo: slab(coil, HELIX.w, RAMP), threshold: 25 }, { geo: slab(via, 1.4, RAMP + 0.04), threshold: 25 })
  const span = new Track(via), p = new Vector3(), t = new Vector3()
  for (let d = 0.5; d < span.len - 0.5; d += 3.4) {
    span.point(d, p)
    span.tangent(d, t)
    if (p.y < 0.45) continue
    for (const k of [-0.55, 0.55]) out.push(post(p.x - t.z * k, p.z + t.x * k, 0, p.y - RAMP - 0.04, 0.1))
  }
  out.push({ geo: cyl(0.28, 0.34, d.y + 0.5, 20), at: [h.cx, (d.y + 0.5) / 2, h.cz], threshold: 20 })
  const inner = HELIX.r - HELIX.w / 2
  for (let i = 0; i < coil.length; i += 6) {
    const p = coil[i], th = Math.atan2(p.z - h.cz, p.x - h.cx), mid = (0.3 + inner + 0.15) / 2
    out.push({ geo: box(inner + 0.15 - 0.3, 0.07, 0.09), at: [h.cx + Math.cos(th) * mid, p.y - RAMP / 2, h.cz + Math.sin(th) * mid], rot: [0, -th, 0] })
  }
  const z0 = l.z + 0.7, z1 = d.z1
  out.push({ geo: box(1.5, 0.16, z1 - z0), at: [d.x, d.y - 0.08, (z0 + z1) / 2] })
  for (let z = z0 + 0.3; z < z1; z += 2.6) for (const s of [-0.62, 0.62]) out.push(post(d.x + s, z, 0, d.y - 0.16, 0.12))
  out.push({ geo: box(0.05, 0.05, z1 - z0), at: [d.x + 0.74, d.y + 0.55, (z0 + z1) / 2] })
  for (let z = z0 + 0.1; z < z1; z += 1.3) out.push(post(d.x + 0.74, z, d.y, d.y + 0.55, 0.04))
  for (const sx of [-0.72, 0.72]) for (const sz of [-0.72, 0.72]) out.push(post(l.x + sx, l.z + sz, 0, l.top + 1.6, 0.1))
  for (const sx of [-0.72, 0.72]) out.push({ geo: box(0.1, 0.1, 1.54), at: [l.x + sx, l.top + 1.6, l.z] })
  out.push({ geo: box(1.54, 0.3, 0.6), at: [l.x, l.top + 1.8, l.z] })
  for (const s of [-0.78, 0.78]) out.push(post(c.x + s, c.z, c.y, c.y + 1.38, 0.1))
  out.push({ geo: box(1.66, 0.12, 0.22), at: [c.x, c.y + 1.38, c.z] })
  const lx = light.x, lz = light.z + 0.95
  out.push(post(lx, lz, 0, 1.2, 0.08), { geo: box(0.2, 0.66, 0.22), at: [lx, 1.53, lz] })
  for (const dk of [[LOAD.x - 0.68, LOAD.z - 0.68], [PICK.x + 0.68, PICK.z - 0.68]] as const) out.push(post(dk[0], dk[1], 0, 1.15, 0.1), { geo: box(0.22, 0.14, 0.22), at: [dk[0], 1.2, dk[1]] })
  return out
}

/** Slalom cones and speed bumps, in safety colour. */
function hazards(plan: Plan): Piece[] {
  const out: Piece[] = []
  for (const k of plan.cones) out.push({ geo: cyl(0.025, 0.15, 0.46, 16), at: [k.x, 0.27, k.z], threshold: 20 }, { geo: box(0.36, 0.04, 0.36), at: [k.x, 0.02, k.z] })
  for (const b of plan.bumps) out.push({ geo: box(BUMP.len * 0.7, BUMP.h * 0.8, 1.3), at: [b.x, b.y + BUMP.h * 0.4, b.z] })
  return out
}

/** Floor paint, as one line buffer: a dashed centre line and edge lines along the errand and the depot, dock boxes, fiducials, the stop line. */
function paint(plan: Plan) {
  const lane: number[] = [], marks: number[] = []
  const p = new Vector3(), q = new Vector3(), t = new Vector3()
  const dash = (track: Track, lift: (y: number) => number) => {
    for (let s = 0.2; s < track.len - 0.3; s += 0.7) {
      track.point(s, p)
      track.point(s + 0.35, q)
      if (Math.abs(q.y - p.y) > 0.2) continue
      lane.push(p.x, lift(p.y) + 0.012, p.z, q.x, lift(q.y) + 0.012, q.z)
    }
    for (let s = 0.9; s < track.len; s += 1.6) {
      track.point(s, p)
      if (Math.abs(lift(p.y)) > 0.01) continue
      marks.push(...rect(p.x - 0.07, p.z - 0.07, p.x + 0.07, p.z + 0.07, 0.012))
    }
    for (let s = 0; s < track.len - 0.15; s += 0.15) {
      track.point(s, p)
      track.point(s + 0.15, q)
      track.tangent(s, t)
      if (Math.abs(lift(p.y)) > 0.01 || Math.abs(lift(q.y)) > 0.01) continue
      for (const k of [-0.62, 0.62]) lane.push(p.x - t.z * k, 0.012, p.z + t.x * k, q.x - t.z * k, 0.012, q.z + t.x * k)
    }
  }
  dash(depot, (y) => y)
  dash(new Track(plan.pts), (y) => y - DECK)
  const { light: l, charger: c } = plan
  marks.push(l.x - 0.04, 0.014, l.z - 0.62, l.x - 0.04, 0.014, l.z + 0.62, l.x + 0.04, 0.014, l.z - 0.62, l.x + 0.04, 0.014, l.z + 0.62)
  marks.push(...rect(c.x - 0.6, c.z - 0.75, c.x + 0.6, c.z + 0.75, c.y + 0.012))
  for (const d of [LOAD, PICK]) marks.push(...rect(d.x - 0.6, d.z - 0.6, d.x + 0.6, d.z + 0.6, 0.014), ...rect(d.x - 0.52, d.z - 0.52, d.x + 0.52, d.z + 0.52, 0.014))
  return segs([...lane, ...marks])
}

/** The route's disposable buffers: one hairline draw for all the paint and one fill draw for the hazards. */
export function art(plan: Plan) {
  return { paint: paint(plan), hazards: mergeFills(hazards(plan)) }
}

/** One robot in its own frame: origin on the floor under the deck, +x forward. */
export const ROBOT = {
  chassis: (): Piece[] => [
    { geo: cyl(0.44, 0.44, 0.2, 32), at: [0, 0.14, 0], threshold: 20 },
    { geo: cyl(0.33, 0.4, 0.07, 32), at: [0, 0.275, 0], threshold: 20 },
    { geo: cyl(0.09, 0.11, DECK - 0.35, 12), at: [0, (DECK + 0.25) / 2, 0], threshold: 20 },
    { geo: box(0.1, 0.08, 0.66), at: [0.41, 0.08, 0] },
    { geo: box(0.07, 0.05, 0.07), at: [-0.26, 0.33, 0.22] },
  ],
  deck: (): Piece[] => [{ geo: cyl(0.3, 0.3, 0.05, 28), at: [0, DECK - 0.025, 0], threshold: 20 }, { geo: box(0.36, 0.012, 0.03), at: [0, DECK + 0.002, 0] }, { geo: box(0.03, 0.012, 0.36), at: [0, DECK + 0.002, 0] }],
  /** Headlamps and tail lamps, tinted together by state. */
  lamps: (): Piece[] => [-0.15, 0.15].flatMap((z) => [{ geo: box(0.05, 0.06, 0.1), at: [0.43, 0.18, z] as [number, number, number] }, { geo: box(0.05, 0.05, 0.12), at: [-0.43, 0.17, z * 1.2] as [number, number, number] }]),
  /** The whip and pennant, pivoting at the antenna's foot. */
  flag: (): Piece[] => [{ geo: box(0.014, 0.6, 0.014), at: [0, 0.3, 0] }, { geo: box(0.2, 0.12, 0.01), at: [-0.1, 0.53, 0] }],
  flagFoot: new Vector3(-0.26, 0.355, 0.22),
  pad: (): Piece[] => [{ geo: box(1.25, 0.06, 1.25), at: [0, -0.03, 0] }, { geo: box(1.25, 0.12, 0.05), at: [0, 0.02, 0.6] }, { geo: box(1.25, 0.12, 0.05), at: [0, 0.02, -0.6] }],
}
