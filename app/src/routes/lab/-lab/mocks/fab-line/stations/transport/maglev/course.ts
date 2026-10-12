import { Vector3 } from 'three'

import type { Site, Wrapped } from '../../../core/contract'
import { Track, cumulative, locate } from '../track'

/**
 * The maglev's ride, designed the way a coaster is: a plan view round the
 * campus, an elevation profile over it, and an energy budget that sets the
 * speed. A part lifts off the dock and taxis toward the camera, a linear
 * motor launches it along the front through a tunnel of coils, it climbs into
 * a banked half ring round the board's far end, dives over camelback hills
 * along the back and glides on eddy brakes into the arm's bay.
 */
export type Zone = 'dock' | 'taxi' | 'launch' | 'tunnel' | 'climb' | 'crest' | 'dive' | 'brake' | 'bay'
export const ZONES: readonly Zone[] = ['dock', 'taxi', 'launch', 'tunnel', 'climb', 'crest', 'dive', 'brake', 'bay']

/** Where parts load and where the arm picks, in the transport's frame; the layout and the arm read these through `at`. */
export const DOCK = { x: -7.25, z: -1.2, y: 1.23 }
export const BAY = { x: -1.2, z: -1.2, y: 1.35 }
/** Part bottom while floating at dock level; the part rests this much lower on the dock and in the bay. */
const CRUISE = 1.5
/** The slowest a part goes, in world units per second. */
export const V0 = 1.5
/** Visual gravity: how much a climb costs and a dive pays back, in units per second squared. */
const G = 16
const V_TAXI = 4.6
const V_TOP = 16.5
const LAUNCH = 8
/** The sled under a part and the hover gap between it and the guideway. */
export const SLED = { len: 1.05, w: 0.8, h: 0.12 }
export const GAP = 0.3
export const BEAM = { w: 0.56, h: 0.34 }
/** Coil rings round the launch and the tunnel. */
export const GATE = { r: 1.05, every: 1.2, lift: -0.05 }
const STEP = 0.2
let built = 0
const MAX_BANK = (52 * Math.PI) / 180

export type Course = {
  /** Unique per build, for keying merged geometry. */
  id: string
  /** Part bottom centres from the dock to the bay: what `wrap` returns and the sim rides. */
  pts: Vector3[]
  len: number
  /** Distance along `pts` at each point. */
  cum: Float64Array
  /** Part bottom while floating, per point: the dock and bay settle below it. */
  cruise: Float32Array
  /** Unit tangent, banked up and side per point, xyz interleaved; side = tangent × up. */
  tan: Float32Array
  up: Float32Array
  side: Float32Array
  /** Where each zone begins, along `pts`. */
  at: Record<Zone, number>
  /** Coil ring positions along `pts`. */
  gates: Float32Array
  /** The pace the layout folds into the live path: speed over `V0`, at least 1. */
  rate: (s: number) => number
}

type Corner = readonly [x: number, z: number, r: number]

/** A plan polyline through `corners`, every interior corner filleted by its own radius. */
function fillet(corners: readonly Corner[], steps = 14): Vector3[] {
  const v = corners.map(([x, z]) => new Vector3(x, 0, z))
  const out: Vector3[] = [v[0].clone()]
  for (let i = 1; i < v.length - 1; i++) {
    const [A, B, C] = [v[i - 1], v[i], v[i + 1]]
    const d1 = new Vector3().subVectors(A, B)
    const d2 = new Vector3().subVectors(C, B)
    const l1 = d1.length(), l2 = d2.length()
    d1.normalize()
    d2.normalize()
    const half = Math.acos(Math.min(1, Math.max(-1, d1.dot(d2)))) / 2
    const t = Math.min(corners[i][2] / Math.tan(half || 1e-3), l1 / 2, l2 / 2)
    const P1 = B.clone().addScaledVector(d1, t), P2 = B.clone().addScaledVector(d2, t)
    for (let k = 0; k <= steps; k++) {
      const u = k / steps
      out.push(new Vector3().addScaledVector(P1, (1 - u) * (1 - u)).addScaledVector(B, 2 * u * (1 - u)).addScaledVector(P2, u * u))
    }
  }
  out.push(v[v.length - 1].clone())
  return out
}

const ease = (t: number) => {
  const x = Math.min(1, Math.max(0, t))
  return 0.5 - 0.5 * Math.cos(Math.PI * x)
}
const lengthOf = (pts: readonly Vector3[]) => pts.reduce((sum, p, i) => (i ? sum + p.distanceTo(pts[i - 1]) : 0), 0)

/** The plan round the campus as (x, 0, z), with the distances where its sections meet. */
function planOf(site: Site) {
  const front = Math.max(site.pick.z1, site.board.z1) + 1.45
  const back = Math.min(site.board.z0, site.rail.z) - 1.55
  const out = DOCK.x + 1.4
  const bay = BAY.x - 2.1
  const cx = site.board.x1 + 0.1
  const a = 4.8
  const cz = (front + back) / 2, b = (front - back) / 2
  const r2 = 2.4
  const lead = fillet([[DOCK.x, DOCK.z, 0], [out, DOCK.z, 1.0], [out, front, r2], [cx, front, 0]])
  const ring: Vector3[] = []
  for (let i = 1; i < 72; i++) {
    const t = (Math.PI * i) / 72
    ring.push(new Vector3(cx + a * Math.sin(t), 0, cz + b * Math.cos(t)))
  }
  const home = fillet([[cx, back, 0], [bay, back, 1.8], [bay, BAY.z, 1.0], [BAY.x, BAY.z, 0]])
  const raw = [...lead, ...ring, ...home].filter((p, i, all) => !i || p.distanceToSquared(all[i - 1]) > 1e-6)
  const dLead = lengthOf(lead)
  const dRing = lengthOf([lead[lead.length - 1], ...ring, home[0]])
  const plan = new Track(raw)
  return {
    plan,
    /** Plan distances: the front straight starts after the second fillet, the ring spans the far end. */
    d: { launch: dLead - (cx - out - r2), ring0: dLead, ring1: dLead + dRing, end: plan.len, home: cx - bay },
  }
}

/**
 * Part bottom while floating, over plan distance `d`: level along the dock
 * and the front, a climb to the crest at the ring's tip, a descent onto the
 * back lane, two shrinking camelbacks down to dock level, then level home.
 */
function elevation(d: number, k: ReturnType<typeof planOf>['d']) {
  const crest = { y: 7.4, d: (k.ring0 + k.ring1) / 2 }
  const climb = k.ring0 - 5
  const flat = k.ring1 + 0.58 * k.home
  const yBack = 5.0
  if (d < climb) return CRUISE
  if (d < crest.d) return CRUISE + (crest.y - CRUISE) * ease((d - climb) / (crest.d - climb))
  if (d < k.ring1) return crest.y + (yBack - crest.y) * ease((d - crest.d) / (k.ring1 - crest.d))
  if (d < flat) {
    const t = (d - k.ring1) / (flat - k.ring1)
    return yBack + (CRUISE - yBack) * ease(t) + 1.4 * (1 - t) * Math.sin(2 * Math.PI * t) ** 2
  }
  return CRUISE
}

/** How far below cruise a part rides at plan distance `d`: resting on the dock, settling into the bay. */
const settle = (d: number, end: number) => {
  const lift = ease(d / 1.6) * ease((end - d) / 1.3)
  return (1 - lift) * (d < end / 2 ? CRUISE - DOCK.y : CRUISE - BAY.y)
}

/** Builds the whole course for one arrangement of the campus. */
export function courseFor(site: Site): Course {
  const { plan, d } = planOf(site)
  const n = Math.max(2, Math.ceil(plan.len / STEP))
  const pts: Vector3[] = []
  const cruise = new Float32Array(n + 1)
  const ds = new Float32Array(n + 1)
  const p = new Vector3()
  for (let i = 0; i <= n; i++) {
    const di = (plan.len * i) / n
    ds[i] = di
    plan.point(di, p)
    cruise[i] = elevation(di, d)
    pts.push(new Vector3(p.x, cruise[i] - settle(di, plan.len), p.z))
  }
  pts[0].set(DOCK.x, DOCK.y, DOCK.z)
  pts[n].set(BAY.x, BAY.y, BAY.z)
  const cum = cumulative(pts)
  const len = cum[n]
  const sOf = (di: number) => {
    const [i, f] = locate(ds, di)
    return cum[i] + (cum[i + 1] - cum[i]) * f
  }
  const at: Record<Zone, number> = {
    dock: 0,
    taxi: sOf(1.6),
    launch: sOf(d.launch),
    tunnel: sOf(d.launch + LAUNCH),
    climb: sOf(d.ring0 - 5),
    crest: sOf((d.ring0 + d.ring1) / 2),
    dive: sOf(d.ring1),
    brake: sOf(d.ring1 + 0.58 * d.home),
    bay: len - 2.6,
  }
  const cruiseAt = (s: number) => {
    const [i, f] = locate(cum, s)
    return cruise[i] + (cruise[i + 1] - cruise[i]) * f
  }
  /**
   * Kinetic energy per unit mass, doubled (v² at dock height): none on the
   * dock, a hover drift while taxiing, a constant-thrust launch, conserved
   * through the climb and the hills, then eddy brakes that take it away in
   * proportion to speed so the glide decays smoothly.
   */
  const energy = (s: number) => {
    if (s < at.taxi) return 0
    if (s < at.launch) return V_TAXI * V_TAXI * ease((s - at.taxi) / 3.2)
    if (s < at.tunnel) return V_TAXI * V_TAXI + (V_TOP * V_TOP - V_TAXI * V_TAXI) * ((s - at.launch) / (at.tunnel - at.launch))
    if (s < at.brake) return V_TOP * V_TOP
    if (s < at.bay) return V_TOP * V_TOP * (1 - (s - at.brake) / (at.bay - at.brake)) ** 2
    return 0
  }
  const speed = (s: number) => Math.max(V0, Math.sqrt(Math.max(0, energy(s) - 2 * G * (cruiseAt(s) - CRUISE))))
  const rate = (s: number) => speed(s) / V0

  const frames = framesOf(pts, cum, speed)
  const gates: number[] = []
  for (let s = at.launch - GATE.every; s < at.climb - 1; s += GATE.every) gates.push(s)

  return { id: `maglev-${++built}`, pts, len, cum, cruise, ...frames, at, gates: Float32Array.from(gates), rate }
}

/**
 * Tangent, banked up and side at every point. The guideway leans its up
 * toward the felt gravity, g plus the turn's centripetal pull at that
 * point's speed, clamped and smoothed so the ring banks hard and the dock
 * stays level.
 */
function framesOf(pts: readonly Vector3[], cum: Float64Array, speed: (s: number) => number) {
  const n = pts.length
  const tan = new Float32Array(n * 3), up = new Float32Array(n * 3), side = new Float32Array(n * 3)
  const t = new Vector3(), a = new Vector3(), b = new Vector3(), u = new Vector3(), s = new Vector3()
  const lean: Vector3[] = []
  const flat = (i: number, out: Vector3) => out.subVectors(pts[Math.min(n - 1, i + 1)], pts[Math.max(0, i - 1)]).setY(0).normalize()
  for (let i = 0; i < n; i++) {
    const i0 = Math.max(0, i - 3), i1 = Math.min(n - 1, i + 3)
    flat(i1, b)
    flat(i0, a)
    const k = b.sub(a).divideScalar(Math.max(1e-3, cum[i1] - cum[i0]))
    const v = speed(cum[i])
    u.set(0, G, 0).addScaledVector(k, v * v).normalize()
    const tilt = Math.acos(Math.min(1, u.y))
    if (tilt > MAX_BANK) u.set(u.x, 0, u.z).normalize().multiplyScalar(Math.sin(MAX_BANK)).setY(Math.cos(MAX_BANK))
    lean.push(u.clone())
  }
  for (let i = 0; i < n; i++) {
    u.set(0, 0, 0)
    for (let j = Math.max(0, i - 6); j <= Math.min(n - 1, i + 6); j++) u.add(lean[j])
    t.subVectors(pts[Math.min(n - 1, i + 1)], pts[Math.max(0, i - 1)]).normalize()
    s.crossVectors(t, u).normalize()
    u.crossVectors(s, t).normalize()
    t.toArray(tan, i * 3)
    u.toArray(up, i * 3)
    s.toArray(side, i * 3)
  }
  return { tan, up, side }
}

const scratch = { a: new Vector3(), b: new Vector3() }

/** Point `s` along the course (a part's bottom centre). */
export function pointAt(c: Course, s: number, out: Vector3) {
  const [i, f] = locate(c.cum, s)
  return out.lerpVectors(c.pts[i], c.pts[i + 1], f)
}

/** Reads the interleaved frame vector `key` at `s`. */
export function frameAt(c: Course, key: 'tan' | 'up' | 'side', s: number, out: Vector3) {
  const [i, f] = locate(c.cum, s)
  const arr = c[key]
  scratch.a.fromArray(arr, i * 3)
  scratch.b.fromArray(arr, i * 3 + 3)
  return out.lerpVectors(scratch.a, scratch.b, f).normalize()
}

/** Cruise height at `s`: where the sled would float without settling onto the dock. */
export function cruiseAt(c: Course, s: number) {
  const [i, f] = locate(c.cum, s)
  return c.cruise[i] + (c.cruise[i + 1] - c.cruise[i]) * f
}

/** The zone a distance `s` falls in. */
export function zoneAt(c: Course, s: number): Zone {
  let z: Zone = 'dock'
  for (const k of ZONES) if (s >= c.at[k]) z = k
  return z
}

/** The route for the layout: the course's points, its pace, and the course itself for the station. */
export function wrapCourse(site: Site): Wrapped<Course> {
  const c = courseFor(site)
  return { pts: c.pts, pace: c.rate, data: c }
}

