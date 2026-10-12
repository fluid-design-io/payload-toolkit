import { Vector3 } from 'three'

import type { Site } from '../../../core/contract'
import { cumulative, locate } from '../track'

/**
 * The monorail's ride as data. A turtle lays the rail's centreline stretch by
 * stretch, each tagged with what it does to a car (`Kind`); the speed comes
 * from the heights, the banking from the speed and the bends, and the part's
 * path rides the banked car's level cup, so every consumer (the layout's
 * pace, the cars, the pylons, the jolts) reads one model.
 */
export type Kind = 'station' | 'lift' | 'free' | 'brake'
/** A moment a passing car announces: chain engaged, over the top, the bottom of a drop, a hop landing, the brakes. */
export type Cue = 'chain' | 'crest' | 'bottom' | 'land' | 'brake'
export type Beat = { s: number; cue: Cue; v: number }

export const RIDE = {
  /** The part's bottom at the load point and the pick point, and where both sit. */
  y: 1.15, start: -7, end: -1.35, z: -1.2,
  /** Rail centreline to the cup's top, where the part rides. */
  cup: 0.46,
  /** Chain speed: the slowest a car goes, and the sim's `speed`. */
  lift: 2.8,
  g: 12,
  /** Over the crest the car keeps at least this many times chain speed until the brakes. */
  floor: 1.25,
  step: 0.25,
}
const RAIL_Y = RIDE.y - RIDE.cup
/** Steepest tilt into a bend, radians. */
const BANK = 1.15

export type Course = {
  /** The part's path (bottom centre), what the layout samples. */
  pts: Vector3[]
  cum: Float64Array
  len: number
  rail: Vector3[]
  /** Unit direction of travel and the banked up of the car, per point. */
  tan: Vector3[]
  up: Vector3[]
  kind: Kind[]
  /** Speed in m/s per point. */
  v: Float32Array
  beats: Beat[]
  /** Points that belong to the helix, which stands on a mast instead of pylons. */
  helix: { from: number; to: number; x: number; z: number; r: number }
}

type Hop = { s: number; w: number; h: number }

/** Lays track by heading and arc length; heights follow cubic Hermite curves so slopes join smoothly. */
class Turtle {
  x: number
  z: number
  y: number
  m = 0
  th: number
  s = 0
  rail: Vector3[] = []
  kind: Kind[] = []
  arc: number[] = []
  beats: { s: number; cue: Cue }[] = []
  hops: Hop[] = []

  constructor(x: number, z: number, y: number, th: number) {
    this.x = x
    this.z = z
    this.y = y
    this.th = th
    this.push('station')
  }

  private push(kind: Kind) {
    const p = new Vector3(this.x, this.y, this.z)
    const prev = this.rail[this.rail.length - 1]
    if (prev) this.s += p.distanceTo(prev)
    this.rail.push(p)
    this.kind.push(kind)
    this.arc.push(this.s)
  }

  private lay(len: number, y1: number, m1: number, kind: Kind, plan: (d: number) => void) {
    const n = Math.max(2, Math.ceil(len / RIDE.step))
    const { y: y0, m: m0 } = this
    for (let i = 1; i <= n; i++) {
      const t = i / n
      const t2 = t * t, t3 = t2 * t
      plan((len * i) / n)
      this.y = (2 * t3 - 3 * t2 + 1) * y0 + (t3 - 2 * t2 + t) * len * m0 + (-2 * t3 + 3 * t2) * y1 + (t3 - t2) * len * m1
      this.push(kind)
    }
    this.m = m1
  }

  straight(len: number, y1: number, m1: number, kind: Kind) {
    const x0 = this.x, z0 = this.z, dx = Math.cos(this.th), dz = Math.sin(this.th)
    this.lay(len, y1, m1, kind, (d) => {
      this.x = x0 + dx * d
      this.z = z0 + dz * d
    })
  }

  /** Turns by `dth` (positive swings +x toward +z) on radius `r`. */
  turn(dth: number, r: number, y1: number, m1: number, kind: Kind) {
    const sign = Math.sign(dth)
    const th0 = this.th
    const cx = this.x - sign * r * Math.sin(th0), cz = this.z + sign * r * Math.cos(th0)
    this.lay(Math.abs(dth) * r, y1, m1, kind, (d) => {
      const th = th0 + (sign * d) / r
      this.x = cx + sign * r * Math.sin(th)
      this.z = cz - sign * r * Math.cos(th)
      this.th = th
    })
    this.th = th0 + dth
    return { x: cx, z: cz }
  }

  beat(cue: Cue) {
    this.beats.push({ s: this.s, cue })
  }

  /** The part lifts `h` off its cup around the current point, over `w` of track. */
  hop(w: number, h: number) {
    this.hops.push({ s: this.s, w, h })
  }
}

/**
 * The ride from the load point to the pick point: out of the station and
 * behind the arm's rail, up the chain lift, over the crest and down the
 * first drop, a banked turn round the board's far end and a camelback, back
 * along the front over two bunny hops, up a helix in front of the table,
 * off its top and into the brakes, which deliver the car to the arm.
 */
function lay(site: Site) {
  const back = Math.min(site.board.z0, site.rail.z) - 1.6
  const front = Math.max(site.pick.z1, site.board.z1) + 1.3
  const far = site.board.x1 + 1.8
  const Y = RAIL_Y
  const top = 6.9
  const t = new Turtle(RIDE.start, RIDE.z, Y, Math.PI)
  t.straight(0.3, Y, 0, 'station')
  t.turn(Math.PI / 2, 0.75, Y, 0, 'station')
  const r1 = 1.2
  t.straight(t.z - (back + r1), Y, 0, 'station')
  t.turn(Math.PI / 2, r1, Y, 0, 'station')
  t.beat('chain')
  const liftEnd = 1.6
  const k = 0.82
  t.straight(1.6, Y + 0.65, k, 'lift')
  t.straight(liftEnd - t.x, top, k, 'lift')
  t.straight(2.4, top, -k, 'free')
  t.beat('crest')
  const low = 0.42
  t.straight(6.6, low, 0, 'free')
  t.beat('bottom')
  const r2 = 2.6
  t.straight(far - r2 - t.x, 2.9, 0, 'free')
  t.turn(Math.PI / 2, r2, 3.2, 0, 'free')
  const side = front - back - 2 * r2
  t.straight(side * 0.45, 4.4, 0, 'free')
  t.hop(2.4, 0.26)
  t.straight(side * 0.55, 1.3, 0, 'free')
  t.beat('land')
  t.turn(Math.PI / 2, r2, 1.0, 0, 'free')
  const rh = 2.1
  const cx = -4.3
  const run = t.x - cx
  for (const [f, y] of [[0.2, 1.0], [0.15, 1.75], [0.15, 1.0], [0.15, 1.6], [0.35, 1.0]] as const) {
    t.straight(run * f, y, 0, 'free')
    if (y > 1.2) t.hop(1.6, 0.14)
  }
  const helixFrom = t.rail.length - 1
  const turns = 1.5
  const rise = 2.5
  const c = t.turn(Math.PI * 2 * turns, rh, 1.0 + rise, rise / (Math.PI * 2 * turns * rh), 'free')
  const helixTo = t.rail.length - 1
  const xe = 0.55
  const rb = 0.85
  t.straight(xe - t.x, Y + 0.05, 0, 'free')
  t.beat('brake')
  t.turn(-Math.PI / 2, rb, Y, 0, 'brake')
  t.straight(t.z - (RIDE.z + rb), Y, 0, 'brake')
  t.turn(-Math.PI / 2, rb, Y, 0, 'brake')
  t.straight(t.x - RIDE.end, Y, 0, 'brake')
  return { t, helix: { from: helixFrom, to: helixTo, x: c.x, z: c.z, r: rh } }
}

const avg = (a: Float32Array, i: number, w: number) => {
  let sum = 0, n = 0
  for (let j = Math.max(0, i - w); j <= Math.min(a.length - 1, i + w); j++) {
    sum += a[j]
    n++
  }
  return sum / n
}

/** The whole ride for a site: speeds, banking, the part's path and the beats. */
export function courseOf(site: Site): Course {
  const { t, helix } = lay(site)
  const { rail, kind, arc } = t
  const n = rail.length
  rail[n - 1].set(RIDE.end, RAIL_Y, RIDE.z)
  const { lift, g } = RIDE

  // Speed: chain speed on the lift, energy with friction after the crest, the brakes bleed it to chain speed.
  const v = new Float32Array(n)
  const free = kind.indexOf('free')
  const E = 0.5 * lift * lift + g * rail[free].y
  // Friction is solved per site, so however far the far end is the car still clears the helix's top above `floor`.
  let mu = Infinity
  const want = 0.5 * (RIDE.floor * lift) ** 2
  const bottom = t.beats.find((b) => b.cue === 'bottom')!.s
  for (let i = free + 1; i < n && kind[i] === 'free'; i++) if (arc[i] > bottom) mu = Math.min(mu, (E - g * rail[i].y - want) / (g * (arc[i] - arc[free])))
  mu = Math.max(0, mu)
  let brake = -1
  const chain = t.beats.find((b) => b.cue === 'chain')!.s
  const stop = arc[n - 1]
  for (let i = 0; i < n; i++) {
    if (kind[i] === 'station') v[i] = lift * (1 + 0.6 * Math.min(1, arc[i] / 1.5, (chain - arc[i]) / 1.5))
    else if (kind[i] === 'lift') v[i] = lift
    else if (kind[i] === 'free') v[i] = Math.sqrt(Math.max(lift * lift, 2 * (E - g * rail[i].y - mu * g * (arc[i] - arc[free]))))
    else {
      if (brake < 0) brake = i
      // A hard grab to a brisk roll, then a crawl over the last metres to the arm.
      const k = Math.max(0, 1 - (arc[i] - arc[brake]) / 1.1)
      const roll = lift * (1 + 0.8 * Math.min(1, (stop - arc[i]) / 1.8))
      v[i] = roll + (v[brake - 1] - roll) * k * k
    }
  }

  // Banking: the car's up leans with gravity plus the bend's pull, smoothed over a car length or two.
  const tan = rail.map((_, i) => new Vector3().subVectors(rail[Math.min(n - 1, i + 1)], rail[Math.max(0, i - 1)]).normalize())
  const ax = new Float32Array(n), az = new Float32Array(n)
  const h0 = new Vector3(), h1 = new Vector3()
  for (let i = 1; i < n - 1; i++) {
    h0.copy(tan[i - 1]).setY(0).normalize()
    h1.copy(tan[i + 1]).setY(0).normalize()
    const ds = arc[i + 1] - arc[i - 1] || 1
    const pull = (v[i] * v[i]) / ds
    ax[i] = (h1.x - h0.x) * pull
    az[i] = (h1.z - h0.z) * pull
  }
  const reach = g * Math.tan(BANK)
  const up = rail.map((_, i) => {
    let x = avg(ax, i, 6), z = avg(az, i, 6)
    const a = Math.hypot(x, z)
    if (a > reach) {
      x *= reach / a
      z *= reach / a
    }
    const u = new Vector3(x, g, z).normalize()
    return u.addScaledVector(tan[i], -u.dot(tan[i])).normalize()
  })
  const ends = [0, n - 1]
  for (const i of ends) up[i].set(0, 1, 0)

  const air = (s: number) => {
    let h = 0
    for (const hop of t.hops) {
      const d = (s - hop.s) / hop.w
      if (Math.abs(d) < 0.5) h = Math.max(h, hop.h * Math.cos(Math.PI * d) ** 2)
    }
    return h
  }
  const pts = rail.map((p, i) => p.clone().addScaledVector(up[i], RIDE.cup + air(arc[i])))
  pts[0].set(RIDE.start, RIDE.y, RIDE.z)
  pts[n - 1].set(RIDE.end, RIDE.y, RIDE.z)
  const cum = cumulative(pts)
  const at = (s: number) => {
    let i = 0
    while (i < n - 1 && arc[i + 1] < s) i++
    return i
  }
  const beats = t.beats.map((b) => {
    const i = at(b.s)
    return { s: cum[i], cue: b.cue, v: v[i] }
  })
  return { pts, cum, len: cum[n - 1], rail, tan, up, kind, v, beats, helix }
}

/** How many times chain speed a car goes at `s` along the part's path. */
export function rateAt(course: Course, s: number) {
  const [i, f] = locate(course.cum, s)
  return (course.v[i] + (course.v[i + 1] - course.v[i]) * f) / RIDE.lift
}
