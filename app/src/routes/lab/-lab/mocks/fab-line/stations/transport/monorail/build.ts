import { Euler, Matrix4, Vector3 } from 'three'

import { box, cyl } from '../../../core/three'
import type { Piece } from '../../../core/three'
import { sweepBox } from '../kit'
import { RIDE } from './course'
import type { Course } from './course'

/** The rail's box sections below its centreline, in the car's frame (y up, z to the right). */
const SPINE = { w: 0.22, y0: -0.38, y1: -0.13 }
const RAILS = { gauge: 0.3, w: 0.07, y0: -0.11, y1: -0.02 }
const TIE = 0.6
const PYLON = 2.4

/** The closed circuit the rail draws: the ride, then the station straight from the pick point back to the load point. */
type Loop = { rail: Vector3[]; tan: Vector3[]; up: Vector3[]; ride: number }

function loopOf(course: Course): Loop {
  const rail = [...course.rail], tan = [...course.tan], up = [...course.up]
  const a = course.rail[course.rail.length - 1], b = course.rail[0]
  const n = Math.ceil(a.distanceTo(b) / RIDE.step)
  const dir = new Vector3().subVectors(b, a).normalize()
  for (let i = 1; i <= n; i++) {
    rail.push(new Vector3().lerpVectors(a, b, i / n))
    tan.push(dir)
    up.push(new Vector3(0, 1, 0))
  }
  return { rail, tan, up, ride: course.rail.length }
}

const side = (t: Vector3, u: Vector3, out: Vector3) => out.crossVectors(t, u).normalize()

/** A box section swept through the loop's banked frames from point `from` to `to`, its offset and heights in the car's frame. */
function sweep(loop: Loop, from: number, to: number, section: { w: number; off?: number; y0: number; y1: number }, caps = false) {
  return sweepBox(to - from + 1, (i, f) => {
    f.p.copy(loop.rail[from + i])
    f.up.copy(loop.up[from + i])
    side(loop.tan[from + i], loop.up[from + i], f.side)
  }, section, { caps })
}

const basis = new Matrix4()
const euler = new Euler()
const sideV = new Vector3()
/** Euler angles that turn a box's x along `t`, y along `u` and z to the right. */
function frameRot(t: Vector3, u: Vector3): [number, number, number] {
  side(t, u, sideV)
  euler.setFromRotationMatrix(basis.makeBasis(t, u, sideV))
  return [euler.x, euler.y, euler.z]
}

/** Runs of consecutive points whose kind matches. */
function runs(course: Course, kind: Course['kind'][number]) {
  const out: [number, number][] = []
  course.kind.forEach((k, i) => {
    if (k !== kind) return
    const last = out[out.length - 1]
    if (last && last[1] === i - 1) last[1] = i
    else out.push([i, i])
  })
  return out
}

/**
 * The static monorail in three bodies: the structure (spine, ties, pylons,
 * the helix's mast and spokes, the station), the running rails, and the
 * accent parts (brake fins and the load gate).
 */
export function structure(course: Course) {
  const loop = loopOf(course)
  const last = loop.rail.length - 1
  const frame: Piece[] = [{ geo: sweep(loop, 0, last, SPINE), threshold: 25 }]
  const rails: Piece[] = [-1, 1].map((k) => ({ geo: sweep(loop, 0, last, { ...RAILS, off: k * RAILS.gauge }), threshold: 25 }))
  const accent: Piece[] = []

  const q = new Vector3(), hs = new Vector3()
  let tie = 0, pylon = PYLON * 0.5
  const { helix } = course
  let mastTop = 0
  for (let i = 1; i <= last; i++) {
    const d = loop.rail[i].distanceTo(loop.rail[i - 1])
    tie += d
    pylon += d
    const t = loop.tan[i], u = loop.up[i], p = loop.rail[i]
    if (tie >= TIE) {
      tie -= TIE
      q.copy(p).addScaledVector(u, (SPINE.y1 + RAILS.y0) / 2)
      frame.push({ geo: box(0.07, 0.05, 2 * RAILS.gauge + 0.16), at: q.toArray(), rot: frameRot(t, u) })
    }
    q.copy(p).addScaledVector(u, SPINE.y0)
    const onHelix = i >= helix.from && i <= helix.to
    if (onHelix) {
      mastTop = Math.max(mastTop, q.y)
      if (i % 4 === 0) {
        const dx = q.x - helix.x, dz = q.z - helix.z, r = Math.hypot(dx, dz)
        frame.push({ geo: box(r, 0.1, 0.1), at: [helix.x + dx / 2, q.y - 0.05, helix.z + dz / 2], rot: [0, Math.atan2(-dz, dx), 0] })
      }
      continue
    }
    const spacing = i >= loop.ride ? PYLON * 0.8 : PYLON
    if (pylon < spacing || q.y < 0.22) continue
    pylon = 0
    const h = q.y
    if (h < 2.8) {
      frame.push({ geo: box(0.15, h, 0.15), at: [q.x, h / 2, q.z] }, { geo: box(0.42, 0.04, 0.42), at: [q.x, 0.02, q.z] })
      continue
    }
    // Tall bents: two legs, a cap under the spine and a mid brace, square to the track.
    hs.set(-t.z, 0, t.x).normalize()
    const yaw = Math.atan2(hs.x, hs.z)
    for (const k of [-1, 1]) frame.push({ geo: box(0.13, h, 0.13), at: [q.x + hs.x * 0.34 * k, h / 2, q.z + hs.z * 0.34 * k] }, { geo: box(0.36, 0.04, 0.36), at: [q.x + hs.x * 0.34 * k, 0.02, q.z + hs.z * 0.34 * k] })
    frame.push({ geo: box(0.12, 0.12, 0.84), at: [q.x, h - 0.06, q.z], rot: [0, yaw, 0] }, { geo: box(0.08, 0.08, 0.72), at: [q.x, h * 0.48, q.z], rot: [0, yaw, 0] })
  }
  frame.push({ geo: cyl(0.2, 0.28, mastTop + 0.1, 16), at: [helix.x, (mastTop + 0.1) / 2, helix.z] }, { geo: box(0.9, 0.06, 0.9), at: [helix.x, 0.03, helix.z] })

  // The station: a low deck under the straight and a gate over the load point.
  const len = RIDE.end - RIDE.start
  frame.push({ geo: box(len + 1.6, 0.18, 1.5), at: [(RIDE.start + RIDE.end) / 2, 0.09, RIDE.z] })
  const gate = 2.35
  for (const k of [-1, 1]) accent.push({ geo: box(0.12, gate, 0.12), at: [RIDE.start, gate / 2, RIDE.z + 0.72 * k] })
  accent.push({ geo: box(0.16, 0.16, 1.6), at: [RIDE.start, gate, RIDE.z] })

  // Brake fins: a blade along the spine through the brake run.
  for (const [a, b] of runs(course, 'brake')) accent.push({ geo: sweep(loop, a, b, { w: 0.04, y0: SPINE.y1 - 0.02, y1: RAILS.y1 + 0.02 }, true), threshold: 25 })

  const [a, b] = runs(course, 'lift')[0]
  return { frame, rails, accent, lift: loop.rail.slice(a, b + 1) }
}

/** One coaster car in its own frame: x forward, y up the banked track, z to the right; the rail's centreline at the origin. */
export function carPieces() {
  const chassis: Piece[] = [
    { geo: box(0.62, 0.08, 0.52), at: [0, 0.03, 0] },
    { geo: box(0.74, 0.2, 0.5), at: [0, 0.17, 0] },
    { geo: box(0.2, 0.12, 0.46), at: [0.42, 0.15, 0], rot: [0, 0, -0.55] },
    { geo: box(0.08, 0.3, 0.46), at: [-0.36, 0.38, 0] },
    { geo: box(0.07, RIDE.cup - 0.3, 0.07), at: [0, (RIDE.cup + 0.27) / 2, 0] },
  ]
  for (const x of [-0.22, 0.22]) for (const z of [-1, 1]) chassis.push({ geo: box(0.14, 0.1, 0.07), at: [x, -0.005, z * (RAILS.gauge + 0.07)] })
  const cup: Piece[] = [{ geo: box(0.46, 0.04, 0.46), at: [0, -0.02, 0] }]
  return { chassis, cup }
}
