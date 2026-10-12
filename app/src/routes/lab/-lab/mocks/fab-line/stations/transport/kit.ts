import { useFrame } from '@react-three/fiber'
import { useEffect, useState } from 'react'
import { BufferGeometry, CatmullRomCurve3, Euler, Float32BufferAttribute, Matrix4, Quaternion, TubeGeometry, Vector3 } from 'three'

import type { Sim } from '../../core/contract'
import { Fleet } from './fleet'
import type { Batch, Carrier, FleetEvents, FleetSpec } from './fleet'
import { Track } from './track'

const e = new Euler(0, 0, 0, 'YZX')
const q = new Quaternion()
const one = new Vector3(1, 1, 1)

/** A rigid pose: travel direction `yaw` about y, then `pitch` about the body's z, at `pos`. */
export function pose(m: Matrix4, pos: Vector3, yaw = 0, pitch = 0, scale?: Vector3) {
  return m.compose(pos, q.setFromEuler(e.set(0, yaw, pitch, 'YZX')), scale ?? one)
}
export const yawOf = (t: Vector3) => Math.atan2(-t.z, t.x)
export const pitchOf = (t: Vector3) => Math.asin(Math.max(-1, Math.min(1, t.y)))

/** A tube mesh along `pts`, for glass ducts. */
export function tubeAlong(pts: Vector3[], radius: number, closed = false, radial = 20) {
  const curve = new CatmullRomCurve3(pts, closed, 'catmullrom', 0)
  return new TubeGeometry(curve, Math.max(16, Math.round(new Track(pts, closed).len * 10)), radius, radial, closed)
}

/** Two hairlines along a duct where its outline falls for the line's usual three-quarter camera. */
export function outline(track: Track, radius: number, step = 0.12, view = new Vector3(0.5, 0.62, 1).normalize()) {
  const out: number[] = []
  const p = new Vector3()
  const t = new Vector3()
  const side = new Vector3()
  const prev = [new Vector3(), new Vector3()]
  const n = Math.max(2, Math.ceil(track.len / step))
  for (let i = 0; i <= n; i++) {
    const s = (track.len * i) / n
    track.point(s, p)
    track.tangent(s, t)
    side.crossVectors(t, view)
    if (side.lengthSq() < 1e-4) side.set(0, 0, 1)
    side.normalize().multiplyScalar(radius)
    const a = p.clone().add(side)
    const b = p.clone().sub(side)
    if (i) out.push(...prev[0].toArray(), ...a.toArray(), ...prev[1].toArray(), ...b.toArray())
    prev[0].copy(a)
    prev[1].copy(b)
  }
  return out
}

/**
 * Where a swept box section sits at one sample: its centreline point, the side it spans (longer than unit to keep
 * the width across a mitered bend) and the up its heights run along.
 */
export type Frame = { p: Vector3; side: Vector3; up: Vector3 }
/** The section's corners round the run as (side, height) picks: top left, top right, bottom right, bottom left. */
const CORNERS = [[-1, 1], [1, 1], [1, 0], [-1, 0]] as const
/** The long faces, top, bottom, right and left: a flat section's quad as (corner, next sample) picks wound outward. */
const QUADS = [
  [[0, 0], [1, 0], [1, 1], [0, 1]],
  [[3, 0], [3, 1], [2, 1], [2, 0]],
  [[2, 0], [2, 1], [1, 1], [1, 0]],
  [[3, 0], [0, 0], [0, 1], [3, 1]],
] as const
/** The same faces for a smooth section: the corner pair each strip runs along, and whether that pair runs against the winding. */
const STRIPS = [[0, 1, false], [3, 2, true], [1, 2, false], [0, 3, true]] as const

/**
 * A box section swept through `n` frames, `frame(i, f)` filling sample `i`:
 * `w` wide, centred `off` along the side, from `y0` to `y1` along the up,
 * capped at both ends unless `caps` is false. The faces never share
 * vertices, so the hairline pass draws only the four long edges and the
 * caps. A flat section gives each stretch its own vertices and normal, so
 * bends shade faceted; a `smooth` one shares them along the run with the
 * frame's up and side as normals, so it shades round.
 */
export function sweepBox(n: number, frame: (i: number, f: Frame) => void, { w, off = 0, y0, y1 }: { w: number; off?: number; y0: number; y1: number }, { caps = true, smooth = false } = {}) {
  const f: Frame = { p: new Vector3(), side: new Vector3(), up: new Vector3() }
  const ring: Vector3[][] = []
  const normals: Vector3[][] = []
  for (let i = 0; i < n; i++) {
    frame(i, f)
    ring.push(CORNERS.map(([a, top]) => f.p.clone().addScaledVector(f.side, off + (a * w) / 2).addScaledVector(f.up, top ? y1 : y0)))
    if (!smooth) continue
    const up = f.up.clone().normalize(), side = f.side.clone().normalize()
    normals.push([up, up.clone().negate(), side, side.clone().negate()])
  }
  const pos: number[] = [], nor: number[] = [], idx: number[] = []
  const put = (v: Vector3, nv: Vector3) => {
    pos.push(v.x, v.y, v.z)
    nor.push(nv.x, nv.y, nv.z)
  }
  const e1 = new Vector3(), e2 = new Vector3(), nrm = new Vector3()
  /** A flat quad, normal from its first triangle. */
  const quad = (q: readonly Vector3[]) => {
    nrm.crossVectors(e1.subVectors(q[1], q[0]), e2.subVectors(q[2], q[0])).normalize()
    const b = pos.length / 3
    for (const v of q) put(v, nrm)
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3)
  }
  if (smooth)
    STRIPS.forEach(([c0, c1, against], k) => {
      const b = pos.length / 3
      for (let i = 0; i < n; i++) {
        put(ring[i][c0], normals[i][k])
        put(ring[i][c1], normals[i][k])
      }
      for (let i = 0; i < n - 1; i++) {
        const a = b + i * 2
        if (against) idx.push(a, a + 3, a + 1, a, a + 2, a + 3)
        else idx.push(a, a + 1, a + 3, a, a + 3, a + 2)
      }
    })
  else for (let i = 0; i < n - 1; i++) for (const q of QUADS) quad(q.map(([c, j]) => ring[i + j][c]))
  if (caps) {
    quad([...ring[0]].reverse())
    quad(ring[n - 1])
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new Float32BufferAttribute(nor, 3))
  g.setAttribute('uv', new Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2))
  g.setIndex(idx)
  return g
}

/**
 * Runs a fleet against the sim's carried parts every frame and places each
 * carrier through `place`, then commits the batches. `events` fire sounds.
 */
export function useFleet(sim: Sim, spec: FleetSpec, layers: Record<string, Batch>, place: (c: Carrier, i: number, dt: number) => void, events: FleetEvents) {
  const [fleet] = useState(() => new Fleet(spec))
  useEffect(() => () => Object.values(layers).forEach((l) => l.dispose()), [layers])
  const batches = Object.values(layers)
  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1)
    fleet.step(sim.carried, dt, events)
    fleet.carriers.forEach((c, i) => place(c, i, dt))
    for (const l of batches) l.commit()
  })
  return fleet
}
