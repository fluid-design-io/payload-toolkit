import { Vector3 } from 'three'

import type { Site, Wrapped } from '../../../core/contract'
import { smoothstep } from '../../../core/three'
import { Track, cumulative, rounded } from '../track'

/**
 * The AGV's errand, in the transport's frame. A robot leaves the load dock
 * beside the table, weaves a cone slalom, climbs a ramp onto a viaduct at
 * the Conveyor's height (so it clears the integrator's landing pad), sprints
 * the front over two expansion joints, corkscrews up a helix past the
 * board's far end, races along a mezzanine through a charging arch, drops
 * down a paternoster lift, crawls up to a traffic light on the back lane,
 * sprints again over two speed bumps and swings into the arm's dock. Empties scoot home through a snaking depot inside the
 * footprint, where idle robots queue nose to tail.
 *
 * Path heights are a part's bottom centre, so the floor under a robot is
 * `y - DECK`.
 */
export const DECK = 0.46
export const LOAD = new Vector3(-7.6, DECK, -0.5)
export const PICK = new Vector3(-1.25, DECK, -2.1)
/** Metres per second: `min` is the sim's speed and the crawl, `top` the sprint; lateral, accel and brake in m/s². */
export const DRIVE = { min: 1.7, top: 9, lat: 8, acc: 6.5, brake: 16 }
export const GAP = 1.35
const LANE = { side: 1.25, back: 1.55, r: 0.9 }
export const HELIX = { r: 1.6, turns: 1.25, rise: 2.4, w: 1.3 }
/** The viaduct's deck height along the front. */
export const VIADUCT = 1.0
const SLALOM = { z: 1.9, amp: 0.8, waves: 1.5 }
export const BUMP = { h: 0.1, len: 0.9 }
const DS = 0.1

export type Plan = {
  pts: Vector3[]
  len: number
  /** Speed in m/s every DS metres along the route. */
  v: Float32Array
  helix: { cx: number; cz: number }
  /** Floor-surface points (a robot's wheels) along the ramp and viaduct, and along the helix. */
  via: Vector3[]
  coil: Vector3[]
  /** The mezzanine's floor height and its run along z at `x`. */
  deck: { x: number; z0: number; z1: number; y: number }
  /** Distances along `pts` (`s`) where the lift, the charger, the light and each bump are. */
  lift: { x: number; z: number; top: number; bottom: number; s0: number; s1: number }
  charger: { x: number; z: number; y: number; s0: number; s1: number }
  light: { x: number; z: number; s: number }
  /** Where each bump crosses its lane, on a deck `y` high. */
  bumps: { x: number; y: number; z: number; s: number }[]
  cones: { x: number; z: number }[]
}

/** The depot: from the arm's dock round three rows back to the load dock, on the floor. */
export const depot = new Track(rounded([
  [PICK.x, 0, PICK.z], [PICK.x, 0, -1.0], [-6.3, 0, -1.0], [-6.3, 0, -2.2], [-2.4, 0, -2.2], [-2.4, 0, -3.4], [LOAD.x, 0, -3.4], [LOAD.x, 0, LOAD.z],
], 0.5, false, 10))

type Ctrl = { p: Vector3; r: number }
const v3 = (x: number, y: number, z: number) => new Vector3(x, y, z)

/** A polyline through `ctrl`, rounding each corner whose `r` is above 0 by a quadratic of about that radius. */
function bend(ctrl: Ctrl[]) {
  const out: Vector3[] = []
  for (let i = 0; i < ctrl.length; i++) {
    const { p: B, r } = ctrl[i]
    if (!r || i === 0 || i === ctrl.length - 1) {
      out.push(B.clone())
      continue
    }
    const A = ctrl[i - 1].p, C = ctrl[i + 1].p
    const d1 = new Vector3().subVectors(A, B), d2 = new Vector3().subVectors(C, B)
    const l1 = d1.length(), l2 = d2.length()
    d1.normalize()
    d2.normalize()
    const half = Math.acos(Math.min(1, Math.max(-1, d1.dot(d2)))) / 2
    const t = Math.min(r / Math.tan(half || 1e-3), l1 / 2, l2 / 2)
    const P1 = B.clone().addScaledVector(d1, t), P2 = B.clone().addScaledVector(d2, t)
    const steps = Math.max(4, Math.ceil((Math.PI - 2 * half) / 0.12))
    for (let k = 0; k <= steps; k++) {
      const u = k / steps
      out.push(new Vector3().addScaledVector(P1, (1 - u) * (1 - u)).addScaledVector(B, 2 * u * (1 - u)).addScaledVector(P2, u * u))
    }
  }
  return out.filter((p, i, all) => !i || p.distanceToSquared(all[i - 1]) > 1e-8)
}

/** A bump's hump across a lane running along x in direction `dir`, on a deck `base` high. */
function hump(x: number, dir: number, z: number, base: number): Ctrl[] {
  const out: Ctrl[] = []
  for (let k = 0; k <= 8; k++) {
    const t = k / 8
    out.push({ p: v3(x + dir * (t - 0.5) * BUMP.len, base + DECK + BUMP.h * Math.sin(Math.PI * t) ** 2, z), r: 0 })
  }
  return out
}

export const speedAt = (plan: Pick<Plan, 'v' | 'len'>, s: number) => {
  const f = Math.min(plan.v.length - 1, Math.max(0, s / DS))
  const i = Math.min(plan.v.length - 2, Math.floor(f))
  return plan.v[i] + (plan.v[i + 1] - plan.v[i]) * (f - i)
}

/** Speed limits: corners by lateral grip, then zones that crawl, then accel and brake passes so robots sprint and stand on the brakes. */
function profile(track: Track, len: number, crawl: [number, number][]) {
  const n = Math.ceil(len / DS) + 1
  const v = new Float32Array(n).fill(DRIVE.top)
  const a = new Vector3(), b = new Vector3(), c = new Vector3()
  const H = 0.3
  for (let i = 0; i < n; i++) {
    const s = Math.min(len, i * DS)
    track.point(Math.max(0, s - H), a)
    track.point(s, b)
    track.point(Math.min(len, s + H), c)
    const ax = b.x - a.x, az = b.z - a.z, bx = c.x - b.x, bz = c.z - b.z
    const la = Math.hypot(ax, az), lb = Math.hypot(bx, bz)
    if (la < 0.05 || lb < 0.05) continue
    const turn = Math.acos(Math.min(1, Math.max(-1, (ax * bx + az * bz) / (la * lb))))
    const k = turn / ((la + lb) / 2)
    if (k > 1e-3) v[i] = Math.min(v[i], Math.sqrt(DRIVE.lat / k))
  }
  for (const [s0, s1] of crawl) for (let i = Math.max(0, Math.floor(s0 / DS)); i <= Math.min(n - 1, Math.ceil(s1 / DS)); i++) v[i] = DRIVE.min
  v[0] = v[n - 1] = DRIVE.min
  for (let i = 1; i < n; i++) v[i] = Math.min(v[i], Math.sqrt(v[i - 1] ** 2 + 2 * DRIVE.acc * DS))
  for (let i = n - 2; i >= 0; i--) v[i] = Math.min(v[i], Math.sqrt(v[i + 1] ** 2 + 2 * DRIVE.brake * DS))
  for (let i = 0; i < n; i++) v[i] = Math.max(DRIVE.min, v[i])
  return v
}

export function plan(site: Site): Plan {
  const y = DECK
  const vy = y + VIADUCT
  const front = Math.max(site.pick.z1, site.board.z1) + LANE.side
  const back = Math.min(site.board.z0, site.rail.z) - LANE.back
  const turnX = site.board.x0 - 1.5
  const cx = site.board.x1 + 1.25 + HELIX.r
  const cz = front - HELIX.r
  const mx = cx + HELIX.r
  const top = vy + HELIX.rise
  const liftZ = back + 2.4
  const chargeZ = cz - 3.2
  const lightX = site.board.x0 + (site.board.x1 - site.board.x0) * 0.42
  const frontBumps = [0.32, 0.64].map((f) => turnX + (cx - turnX) * f)
  const backBumps = [(lightX + mx) / 2 + 1.5, (lightX + PICK.x) / 2 - 1]

  const xs = LOAD.x + LANE.r + 0.15, xe = turnX - LANE.r - 0.1
  const slalom: Ctrl[] = []
  const cones: Plan['cones'] = []
  const steps = Math.ceil((xe - xs) / 0.1)
  for (let k = 0; k <= steps; k++) {
    const t = k / steps
    const env = smoothstep(t / 0.15) * smoothstep((1 - t) / 0.15)
    slalom.push({ p: v3(xs + (xe - xs) * t, y, SLALOM.z + SLALOM.amp * env * Math.sin(2 * Math.PI * SLALOM.waves * t)), r: 0 })
  }
  for (let j = 0; j < SLALOM.waves * 2; j++) cones.push({ x: xs + ((xe - xs) * (j + 0.5)) / (SLALOM.waves * 2), z: SLALOM.z })

  const helix: Ctrl[] = []
  const sweep = HELIX.turns * 2 * Math.PI
  const hn = Math.ceil(sweep / 0.09)
  for (let k = 1; k <= hn; k++) {
    const t = k / hn
    const th = Math.PI / 2 - sweep * t
    helix.push({ p: v3(cx + HELIX.r * Math.cos(th), vy + HELIX.rise * (t - Math.sin(2 * Math.PI * t) / (2 * Math.PI)), cz + HELIX.r * Math.sin(th)), r: 0 })
  }

  const pts = bend([
    { p: LOAD.clone(), r: 0 },
    { p: v3(LOAD.x, y, SLALOM.z), r: LANE.r },
    ...slalom,
    { p: v3(turnX, y, SLALOM.z), r: LANE.r },
    { p: v3(turnX, y, SLALOM.z + LANE.r + 0.2), r: 1.6 },
    { p: v3(turnX, vy, front - LANE.r - 0.3), r: 1.6 },
    { p: v3(turnX, vy, front), r: LANE.r },
    ...frontBumps.flatMap((x) => hump(x, 1, front, VIADUCT)),
    { p: v3(cx, vy, front), r: 0 },
    ...helix,
    { p: v3(mx, top, liftZ), r: 0 },
    { p: v3(mx, y, liftZ), r: 0 },
    { p: v3(mx, y, back), r: LANE.r },
    ...backBumps.flatMap((x) => hump(x, -1, back, 0)),
    { p: v3(PICK.x, y, back), r: LANE.r },
    { p: PICK.clone(), r: 0 },
  ])
  const cum = cumulative(pts)
  const len = cum[cum.length - 1]
  const track = new Track(pts)
  const at = (p: Vector3) => track.locate(p.toArray())
  const sLift = [at(v3(mx, top, liftZ)), at(v3(mx, y, liftZ))]
  const surface = (s0: number, s1: number) => pts.filter((_, i) => cum[i] >= s0 - 1e-6 && cum[i] <= s1 + 1e-6).map((p) => p.clone().setY(p.y - DECK))
  const sHelix = at(v3(cx, vy, front))
  const sCharge = at(v3(mx, top, chargeZ))
  const sLight = at(v3(lightX, y, back))
  const v = profile(track, len, [[sLift[0] - 0.5, sLift[1] + 0.4], [sCharge - 0.9, sCharge + 0.9], [sLight - 1.8, sLight + 0.15]])
  const bumps = [...frontBumps.map((x) => ({ x, y: VIADUCT, z: front })), ...backBumps.map((x) => ({ x, y: 0, z: back }))].map((b) => ({ ...b, s: at(v3(b.x, b.y + y + BUMP.h, b.z)) }))
  return {
    pts, len, v,
    helix: { cx, cz },
    via: surface(at(v3(turnX, y, SLALOM.z + LANE.r + 0.2)) - 0.25, sHelix),
    coil: surface(sHelix, at(v3(mx, top, cz))),
    deck: { x: mx, z0: liftZ, z1: cz, y: top - DECK },
    lift: { x: mx, z: liftZ, top: top - DECK, bottom: 0, s0: sLift[0], s1: sLift[1] },
    charger: { x: mx, z: chargeZ, y: top - DECK, s0: sCharge - 0.9, s1: sCharge + 0.9 },
    light: { x: lightX, z: back, s: sLight },
    bumps,
    cones,
  }
}

/** The route for the layout: its points, its pace (speed over the slowest speed) and the plan the station draws. */
export function wrap(site: Site): Wrapped<Plan> {
  const p = plan(site)
  return { pts: p.pts, pace: (s) => speedAt(p, s) / DRIVE.min, data: p }
}
