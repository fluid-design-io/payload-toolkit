import { useEffect, useMemo } from 'react'
import { CatmullRomCurve3, CylinderGeometry, Matrix4, Vector3 } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import { play } from '../../../../kit/sound'
import type { TransportProps, TransportVariant } from '../../core/contract'
import { Body } from '../../core/scene'
import { box, fillMat, lineMat, mergeEdges, mergeFills, reducedMotion, segs } from '../../core/three'
import type { Piece } from '../../core/three'
import { Batch, glassMat } from './fleet'
import type { Carrier, FleetSpec } from './fleet'
import { ease, outline, pitchOf, pose, tubeAlong, useFleet, useSkin } from './kit'
import { Pace, Track, rounded, smooth01 } from './track'

/**
 * A pneumatic tube. Each part drops into an open capsule in the send
 * cradle; the lid shuts and the capsule is blown up and over an arched glass
 * tube, slowing into the receiver where the lid opens for the arm. Empties
 * drop through the receiver, run back along the floor duct, ride up the riser
 * and fall into the hopper above the cradle, stacked and waiting.
 */
const Z = -1.2
const ZB = -2.5
const CAP = { r: 0.56, len: 1.25, off: 0.32 }
const SEND = new Vector3(-6.8, 1.2, Z)
const RECV = new Vector3(-1.0, 1.2, Z)
const HOP = -8.0
const TOP = 4.3
const FLOOR = 0.68

const forward = new Track(new CatmullRomCurve3([
  SEND, new Vector3(-6.0, 1.2, Z), new Vector3(-5.1, 2.1, Z), new Vector3(-3.9, 2.95, Z), new Vector3(-2.7, 2.1, Z), new Vector3(-1.8, 1.2, Z), RECV,
], false, 'centripetal').getSpacedPoints(240))
const ramp = 1.0
const pace = new Pace(forward.len, (s) => 1 + 2.8 * smooth01((s - 0.6) / ramp) * smooth01((forward.len - 0.6 - s) / ramp))
const back = new Track(rounded([
  RECV.toArray(), [0.15, 1.2, Z], [0.15, FLOOR, Z], [0.15, FLOOR, ZB], [HOP, FLOOR, ZB], [HOP, TOP, ZB], [HOP, TOP, Z], [HOP, 1.2, Z], SEND.toArray(),
], 0.4))
const duct = new Track([[-0.3, FLOOR, ZB], [HOP + 0.7, FLOOR, ZB]])
/** The magazine: a riser shaft up the back and a hopper shaft down the front, capsules lying level in both. */
const SHAFT = { w: 1.4, hopperFloor: 1.85, top: TOP + 0.7 }

const SPEED = 2.3
const GAP = CAP.len + 0.2
const SPEC: FleetSpec = { n: 8, length: pace.length, speed: SPEED, gap: GAP, back: back.len, spacing: 2 * CAP.r + 0.1, vmax: 11, accel: 16, dwell: 0.7 }

const at = new Vector3()
const tan = new Vector3()
const ride = new Vector3()
const m = new Matrix4()
const hinge = new Matrix4()
const lid = new Matrix4()
const shift = new Matrix4()
const unshift = new Matrix4()
shift.makeTranslation(0, 0, -CAP.r)
unshift.makeTranslation(0, 0, CAP.r)

/** A capsule's pose: on the forward arch while riding, else on the return route. Returns the lid's open target. */
function place(c: Carrier) {
  if (c.state === 'ride' || c.state === 'coast' || c.state === 'hold') {
    const s = pace.s(c.u)
    forward.point(s, at)
    forward.tangent(s, tan)
    if (c.state === 'ride' && c.b < SPEC.back) {
      back.point(c.b, ride)
      at.lerp(ride, Math.min(1, (SPEC.back - c.b) / SPEC.spacing))
    }
    pose(m, at, 0, pitchOf(tan))
    if (c.state === 'hold') return c.t < SPEC.dwell * 0.55 ? 1 : 0
    return c.u < 0.3 || (c.state === 'ride' && c.u > SPEC.length - 0.45) ? 1 : 0
  }
  back.point(c.b, at)
  pose(m, at)
  return c.b > SPEC.back - 0.02 ? 1 : 0
}

function capsulePieces() {
  const half = (start: number, r = CAP.r, len = CAP.len, open = false) => {
    const g = new CylinderGeometry(r, r, len, 18, 1, open, start, Math.PI)
    return g.rotateZ(-Math.PI / 2)
  }
  const trough: Piece[] = [{ geo: half(0), threshold: 25 }]
  const cover: Piece[] = [{ geo: half(Math.PI), threshold: 25 }]
  const bands: Piece[] = [-1, 1].map((k) => ({ geo: half(0, CAP.r + 0.02, 0.12, true), at: [k * (CAP.len / 2 - 0.1), 0, 0] as [number, number, number] }))
  return { trough, cover, bands }
}

function stationPieces(): Piece[] {
  const out: Piece[] = [
    { geo: box(SEND.x - HOP + 1.45, 0.62, 1.5), at: [(HOP - 0.7 + SEND.x + 0.75) / 2, 0.31, Z] },
    { geo: box(1.4, 0.62, 1.4), at: [RECV.x - 0.1, 0.31, Z] },
    { geo: box(0.9, 2.0, Z - ZB + 1.5), at: [0.15, 1.0, (Z + ZB) / 2] },
    { geo: box(SHAFT.w + 0.2, 0.12, SHAFT.w + 0.2), at: [HOP, 0.06, ZB] },
  ]
  for (const k of [1.0, 2.6, 4.4, 5.8]) {
    const s = (forward.len * k) / 6.8
    const p = forward.point(s, new Vector3())
    const t = forward.tangent(s, new Vector3())
    out.push({ geo: new CylinderGeometry(0.72, 0.72, 0.14, 24, 1, true), at: p.toArray() as [number, number, number], rot: [0, 0, Math.atan2(-t.x, t.y)], threshold: 20 })
    const foot = p.y - 0.72
    if (foot > 0.7) out.push({ geo: box(0.1, foot, 0.1), at: [p.x, foot / 2, Z - 0.5] }, { geo: box(0.1, foot, 0.1), at: [p.x, foot / 2, Z + 0.5] }, { geo: box(0.1, 0.1, 1.1), at: [p.x, foot, Z] })
  }
  for (const x of [-2.2, -4.2, -6.2]) out.push({ geo: box(0.5, 0.1, 1.0), at: [x, 0.05, ZB] }, { geo: new CylinderGeometry(0.74, 0.74, 0.14, 24, 1, true), at: [x, FLOOR, ZB], rot: [0, 0, Math.PI / 2], threshold: 20 })
  out.push({ geo: box(SHAFT.w + 0.2, 0.16, SHAFT.w + 0.2), at: [HOP, SHAFT.top + 0.08, ZB] }, { geo: box(SHAFT.w + 0.2, 0.16, SHAFT.w + 0.2), at: [HOP, SHAFT.top + 0.08, Z] })
  return out
}

function Tube({ sim, c }: TransportProps) {
  const pieces = useMemo(stationPieces, [])
  const glass = useMemo(() => {
    const arch = forward.slice(CAP.len / 2 + 0.25, forward.len - CAP.len / 2 - 0.25)
    const shafts: Piece[] = [
      { geo: box(SHAFT.w, SHAFT.top, SHAFT.w), at: [HOP, SHAFT.top / 2, ZB] },
      { geo: box(SHAFT.w, SHAFT.top - SHAFT.hopperFloor, SHAFT.w), at: [HOP, (SHAFT.top + SHAFT.hopperFloor) / 2, Z] },
    ]
    const parts = [tubeAlong(arch.samples(0.1), 0.66), tubeAlong(duct.samples(0.1), 0.7), mergeFills(shafts)]
    const geo = mergeGeometries(parts)!
    parts.forEach((g) => g.dispose())
    const edges = mergeEdges(shafts)
    const lines = segs([...outline(arch, 0.66), ...outline(duct, 0.7), ...edges.getAttribute('position').array])
    edges.dispose()
    return { geo, lines }
  }, [])
  useEffect(() => () => { glass.geo.dispose(); glass.lines.dispose() }, [glass])
  const layers = useMemo(() => {
    const p = capsulePieces()
    const n = SPEC.n
    return { trough: new Batch(p.trough, n, glassMat(c.edge, c.flat, 0.16), lineMat(c.edge)), cover: new Batch(p.cover, n, glassMat(c.edge, c.flat, 0.1), lineMat(c.edge)), bands: new Batch(p.bands, n, fillMat(c.accent, c.flat, c.rough), null) }
  }, [])
  useSkin(c, () => {
    layers.trough.mesh.material = glassMat(c.edge, c.flat, 0.16)
    layers.cover.mesh.material = glassMat(c.edge, c.flat, 0.1)
    layers.trough.lines!.material = lineMat(c.edge)
    layers.cover.lines!.material = lineMat(c.edge)
    layers.bands.mesh.material = fillMat(c.accent, c.flat, c.rough)
  })
  useFleet(sim, SPEC, layers, (cap, i, dt) => {
    const open = place(cap)
    ease(cap, open, dt, 7, reducedMotion)
    layers.trough.set(i, m)
    layers.bands.set(i, m)
    hinge.makeRotationX(-cap.k * 1.95)
    lid.copy(m).multiply(shift).multiply(hinge).multiply(unshift)
    layers.cover.set(i, lid)
  }, {
    depart: () => play('toss'),
    arrive: () => play('drawer'),
    dock: (cap) => cap.b < SPEC.back - 0.05 && play('tick'),
  })
  return (
    <group>
      <Body id="tube" c={c} fill={c.surface} edge={c.edge} pieces={pieces} />
      <mesh geometry={glass.geo} material={glassMat(c.edge, c.flat, 0.07)} renderOrder={1} />
      <lineSegments geometry={glass.lines} material={lineMat(c.edge, 0.6)} />
      <primitive object={layers.trough.mesh} />
      <primitive object={layers.trough.lines!} />
      <primitive object={layers.cover.mesh} />
      <primitive object={layers.cover.lines!} />
      <primitive object={layers.bands.mesh} />
    </group>
  )
}

const partAt = (u: number, out: Vector3) => {
  forward.point(pace.s(u), out)
  out.y -= CAP.off
  return out
}

export const tube: TransportVariant = {
  id: 'tube',
  kind: 'path',
  label: 'Pneumatic',
  footprint: { x0: HOP - 0.8, x1: 0.62, z0: ZB - 0.85, z1: Z + 0.75, h: TOP + 0.86 },
  frame: [[HOP - 1.0, 0, Z + 1.6], [0.9, 0, Z + 1.6], [0.9, 2.2, ZB - 1.0], [HOP - 1.0, TOP + 0.9, ZB - 1.0], [(HOP + 0.6) / 2, 3.3, Z]],
  length: pace.length,
  speed: SPEED,
  gap: GAP,
  at: partAt,
  load: { dur: 0.6, h: 1.4 },
  Component: Tube,
}
