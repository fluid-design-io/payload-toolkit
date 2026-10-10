import { useFrame } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo } from 'react'
import { CatmullRomCurve3, Euler, Matrix4, Quaternion, TubeGeometry, Vector3 } from 'three'

import type { Sim, Tokens } from '../../core/contract'
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
 * Runs a fleet against the sim's carried parts every frame and places each
 * carrier through `place`, then commits the batches. `events` fire sounds.
 */
export function useFleet(sim: Sim, spec: FleetSpec, layers: Record<string, Batch>, place: (c: Carrier, i: number, dt: number) => void, events: FleetEvents) {
  const fleet = useMemo(() => new Fleet(spec), [spec])
  useEffect(() => () => Object.values(layers).forEach((l) => l.dispose()), [layers])
  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1)
    fleet.step(sim.carried, dt, events)
    fleet.carriers.forEach((c, i) => place(c, i, dt))
    for (const l of Object.values(layers)) l.commit()
  })
  return fleet
}

/** Re-skins batches when the theme's tokens change, without rebuilding geometry. */
export function useSkin(c: Tokens, apply: () => void) {
  useLayoutEffect(apply, [c])
}

/** Eases `c.k` toward `target`; snaps under reduced motion. */
export function ease(c: Carrier, target: number, dt: number, rate: number, snap: boolean) {
  c.k = snap ? target : c.k + (target - c.k) * (1 - Math.exp(-dt * rate))
}
