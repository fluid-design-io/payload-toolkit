import { Vector3 } from 'three'

export type P3 = readonly [number, number, number]

const a = new Vector3()
const b = new Vector3()

/** A polyline sampled by arc length: `point(s)` and `tangent(s)` for 0 <= s <= len, allocation free. */
export class Track {
  readonly len: number
  readonly closed: boolean
  private readonly pts: Float32Array
  private readonly cum: Float32Array
  private readonly n: number

  constructor(points: readonly (Vector3 | P3)[], closed = false) {
    const list = points.map((p) => (p instanceof Vector3 ? p.clone() : new Vector3(...p)))
    if (closed) list.push(list[0].clone())
    this.closed = closed
    this.n = list.length
    this.pts = new Float32Array(this.n * 3)
    this.cum = new Float32Array(this.n)
    list.forEach((p, i) => {
      p.toArray(this.pts, i * 3)
      if (i) this.cum[i] = this.cum[i - 1] + p.distanceTo(list[i - 1])
    })
    this.len = this.cum[this.n - 1]
  }

  private seg(s: number) {
    let lo = 0
    let hi = this.n - 1
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1
      if (this.cum[mid] <= s) lo = mid
      else hi = mid
    }
    return lo
  }

  private wrap(s: number) {
    if (this.closed) return ((s % this.len) + this.len) % this.len
    return Math.min(this.len, Math.max(0, s))
  }

  point(s: number, out: Vector3) {
    const t = this.wrap(s)
    const i = this.seg(t)
    const span = this.cum[i + 1] - this.cum[i] || 1
    a.fromArray(this.pts, i * 3)
    b.fromArray(this.pts, i * 3 + 3)
    return out.lerpVectors(a, b, (t - this.cum[i]) / span)
  }

  /** Unit direction of travel at `s`. */
  tangent(s: number, out: Vector3) {
    const i = this.seg(this.wrap(s))
    a.fromArray(this.pts, i * 3)
    b.fromArray(this.pts, i * 3 + 3)
    return out.subVectors(b, a).normalize()
  }

  /** The stretch from `s0` to `s1` (wrapping on a closed track) as its own open track. */
  slice(s0: number, s1: number, step = 0.05) {
    const out: Vector3[] = []
    const n = Math.max(2, Math.ceil((s1 - s0) / step))
    for (let i = 0; i <= n; i++) out.push(this.point(s0 + ((s1 - s0) * i) / n, new Vector3()))
    return new Track(out)
  }

  /** The distance along the track closest to `p`. */
  locate(p: P3, step = 0.02) {
    const q = new Vector3(...p)
    const t = new Vector3()
    let best = 0
    let d = Infinity
    for (let s = 0; s <= this.len; s += step) {
      const e = this.point(s, t).distanceToSquared(q)
      if (e < d) {
        d = e
        best = s
      }
    }
    return best
  }

  /** Points every `step` along the track, for building tubes and floor paint. */
  samples(step = 0.1) {
    const out: Vector3[] = []
    const n = Math.max(2, Math.ceil(this.len / step))
    for (let i = 0; i <= n; i++) out.push(this.point((this.len * i) / n, new Vector3()))
    return out
  }
}

/**
 * A polyline through `corners` with every interior corner (every corner, when
 * `closed`) rounded by a quadratic curve of radius about `r`, clamped to half
 * of each neighbouring leg.
 */
export function rounded(corners: readonly P3[], r: number, closed = false, steps = 10): Vector3[] {
  const v = corners.map((c) => new Vector3(...c))
  const out: Vector3[] = []
  const n = v.length
  for (let i = 0; i < n; i++) {
    const B = v[i]
    const interior = closed || (i > 0 && i < n - 1)
    if (!interior) {
      out.push(B.clone())
      continue
    }
    const A = v[(i - 1 + n) % n]
    const C = v[(i + 1) % n]
    const d1 = new Vector3().subVectors(A, B)
    const d2 = new Vector3().subVectors(C, B)
    const l1 = d1.length()
    const l2 = d2.length()
    d1.normalize()
    d2.normalize()
    const half = Math.acos(Math.min(1, Math.max(-1, d1.dot(d2)))) / 2
    const t = Math.min(r / Math.tan(half || 1e-3), l1 / 2, l2 / 2)
    const P1 = B.clone().addScaledVector(d1, t)
    const P2 = B.clone().addScaledVector(d2, t)
    for (let k = 0; k <= steps; k++) {
      const u = k / steps
      out.push(new Vector3().addScaledVector(P1, (1 - u) * (1 - u)).addScaledVector(B, 2 * u * (1 - u)).addScaledVector(P2, u * u))
    }
  }
  return out
}

/**
 * Maps the sim's path distance `u` to a distance `s` along the track, so a
 * transport can surge and settle while the sim advances `u` at a steady
 * speed. `rate(s)` is ds/du; keeping it at least 1 keeps the sim's `gap` in
 * `u` at least as wide along the track.
 */
export class Pace {
  readonly length: number
  private readonly us: Float32Array
  private readonly ss: Float32Array

  constructor(len: number, rate: (s: number) => number, n = 512) {
    this.us = new Float32Array(n + 1)
    this.ss = new Float32Array(n + 1)
    for (let i = 1; i <= n; i++) {
      const s0 = (len * (i - 1)) / n
      const s1 = (len * i) / n
      this.ss[i] = s1
      this.us[i] = this.us[i - 1] + (s1 - s0) / Math.max(1e-3, rate((s0 + s1) / 2))
    }
    this.length = this.us[n]
  }

  s(u: number) {
    const us = this.us
    if (u <= 0) return 0
    if (u >= this.length) return this.ss[this.ss.length - 1]
    let lo = 0
    let hi = us.length - 1
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1
      if (us[mid] <= u) lo = mid
      else hi = mid
    }
    return this.ss[lo] + ((u - us[lo]) / (us[hi] - us[lo])) * (this.ss[hi] - this.ss[lo])
  }
}

export const smooth01 = (t: number) => {
  const x = Math.min(1, Math.max(0, t))
  return x * x * (3 - 2 * x)
}
