import { useMemo } from 'react'
import { CatmullRomCurve3, Matrix4, TubeGeometry, Vector3 } from 'three'

import { play } from '../../../../kit/sound'
import type { TransportProps, TransportVariant } from '../../core/contract'
import { Body } from '../../core/scene'
import { box, fillMat, lineMat, reducedMotion } from '../../core/three'
import type { Piece } from '../../core/three'
import { Batch } from './fleet'
import type { Carrier, FleetSpec } from './fleet'
import { ease, pose, useFleet, useSkin, yawOf } from './kit'
import { Pace, Track, rounded, smooth01 } from './track'

/**
 * An overhead monorail. Trolleys run a loop of I-beam hung from gallows
 * posts; each carries a hoist and a fork tray. At the load point the tray is
 * lowered for the part, hoisted, and sent along the front rail, swinging back
 * as it pulls away and forward as it brakes; over the drop point it lowers
 * the part to the arm, hoists empty and rides the back leg home. Rail joints
 * clack under every moving trolley.
 */
const Z = -1.2
const ZR = -0.65
const ZB = ZR - 1.8
const RY = 4.0
const PY = 3.6
const LOAD = -7.0
const DROP = -1.35
const LOW = 2.49
const UP = 1.54
const HU = 0.8
const SWAY = reducedMotion ? 0 : 0.14
const TRAY = Z - ZR
const JOINT = 0.9

const loop = new Track(rounded([[-7.9, RY, ZR], [-0.45, RY, ZR], [-0.45, RY, ZB], [-7.9, RY, ZB]], 0.9, true, 16), true)
const sLoad = loop.locate([LOAD, RY, ZR])
const sDrop = loop.locate([DROP, RY, ZR])
const run = DROP - LOAD
const pace = new Pace(run, (s) => 1 + 0.9 * smooth01(s / 1.2) * smooth01((run - s) / 1.2))
const back = loop.slice(sDrop, sLoad + loop.len)
const LENGTH = HU + pace.length + HU

const SPEC: FleetSpec = { n: 6, length: LENGTH, speed: 1.6, gap: 2.0, back: back.len, spacing: 1.15, vmax: 3.4, accel: 3, dwell: 0.9 }

/** Hoist drop and swing angle for a riding tray `u` along the path, and the trolley's x. */
function hang(u: number) {
  if (u < HU) return { x: LOAD, L: LOW + (UP - LOW) * smooth01(u / HU), th: 0, s: 0 }
  if (u > HU + pace.length) return { x: DROP, L: UP + (LOW - UP) * smooth01((u - HU - pace.length) / HU), th: 0, s: run }
  const s = pace.s(u - HU)
  const r = run - s
  const th = SWAY * (-Math.exp(-s / 1.3) * Math.sin((Math.PI * s) / 1.15) + Math.exp(-r / 0.9) * Math.sin((Math.PI * r) / 1.05))
  return { x: LOAD + s, L: UP, th, s }
}

const partAt = (u: number, out: Vector3) => {
  const h = hang(u)
  return out.set(h.x + h.L * Math.sin(h.th), PY - h.L * Math.cos(h.th) + 0.04, Z)
}

const trolley = new Vector3()
const tray = new Vector3()
const tan = new Vector3()
const other = new Vector3()
const m = new Matrix4()
const rot = new Matrix4()
const yawM = new Matrix4()
const stretch = new Matrix4()

function railPieces(): Piece[] {
  const pts = loop.samples(0.1)
  const beam = new TubeGeometry(new CatmullRomCurve3(pts, true, 'catmullrom', 0), pts.length, 0.13, 4, true)
  const out: Piece[] = [{ geo: beam, threshold: 30 }]
  for (const x of [-7.3, -4.2, -1.1]) {
    const zPost = ZB - 0.8
    out.push(
      { geo: box(0.16, RY + 0.55, 0.16), at: [x, (RY + 0.55) / 2, zPost] },
      { geo: box(0.5, 0.06, 0.5), at: [x, 0.03, zPost] },
      { geo: box(0.12, 0.14, ZR - zPost + 0.2), at: [x, RY + 0.48, (ZR + zPost) / 2] },
      { geo: box(0.06, 0.36, 0.06), at: [x, RY + 0.27, ZR] },
      { geo: box(0.06, 0.36, 0.06), at: [x, RY + 0.27, ZB] },
    )
  }
  out.push({ geo: box(1.3, 0.05, 1.2), at: [LOAD, 0.025, Z] }, { geo: box(1.3, 0.05, 1.2), at: [DROP, 0.025, Z] })
  return out
}

function carrierPieces() {
  const truck: Piece[] = [{ geo: box(0.62, 0.26, 0.34), at: [0, RY - 0.29 - PY, 0] }, { geo: box(0.36, 0.08, 0.5), at: [0, RY - 0.12 - PY, 0] }, { geo: box(0.18, 0.12, 0.18), at: [0, -0.04, 0] }]
  const rod: Piece[] = [{ geo: box(0.04, 1, 0.04), at: [0, -0.5, 0] }]
  const fork: Piece[] = [
    { geo: box(0.2, 0.14, 0.2), at: [0, 0.03, 0] },
    { geo: box(0.08, 0.05, TRAY + 0.3), at: [0, -0.02, (TRAY + 0.3) / 2 - 0.1] },
    { geo: box(0.7, 0.04, 0.07), at: [0, -0.02, TRAY - 0.2] },
    { geo: box(0.7, 0.04, 0.07), at: [0, -0.02, TRAY + 0.2] },
  ]
  return { truck, rod, fork }
}

function Monorail({ sim, c }: TransportProps) {
  const pieces = useMemo(railPieces, [])
  const layers = useMemo(() => {
    const p = carrierPieces()
    const fill = fillMat(c.surface, c.flat, c.rough)
    return { truck: new Batch(p.truck, SPEC.n, fill, lineMat(c.edge)), rod: new Batch(p.rod, SPEC.n, fillMat(c.pin, c.flat, c.rough), null), fork: new Batch(p.fork, SPEC.n, fill, lineMat(c.edge)) }
  }, [])
  useSkin(c, () => {
    layers.truck.mesh.material = fillMat(c.surface, c.flat, c.rough)
    layers.truck.lines!.material = lineMat(c.edge)
    layers.rod.mesh.material = fillMat(c.pin, c.flat, c.rough)
    layers.fork.mesh.material = fillMat(c.surface, c.flat, c.rough)
    layers.fork.lines!.material = lineMat(c.edge)
  })
  const joints = useMemo(() => new Int32Array(SPEC.n), [])
  useFleet(sim, SPEC, layers, (car: Carrier, i, dt) => {
    let L = UP
    let th = 0
    let yaw = 0
    let s = 0
    if (car.state === 'back') {
      back.point(car.b, trolley)
      back.tangent(car.b, tan)
      yaw = yawOf(tan)
      ease(car, car.b > SPEC.back - 0.02 ? 1 : 0, dt, 4, reducedMotion)
      L = UP + (LOW - UP) * car.k
      s = sDrop + car.b
    } else {
      if (car.state === 'hold') {
        ease(car, car.t > 0.25 ? 0 : 1, dt, 3, reducedMotion)
        car.u = SPEC.length
      } else car.k = 1
      const h = hang(car.u)
      trolley.set(h.x, PY, ZR)
      L = car.state === 'hold' ? UP + (LOW - UP) * car.k : h.L
      th = h.th
      s = sLoad + h.s
      if (car.state === 'ride' && car.b < SPEC.back) {
        back.point(car.b, other)
        trolley.lerp(other, Math.min(1, (SPEC.back - car.b) / SPEC.spacing))
      }
    }
    trolley.y = PY
    const joint = Math.floor(s / JOINT)
    if (joint !== joints[i]) {
      if (car.v > 0.3 || car.state === 'ride') play('tick')
      joints[i] = joint
    }
    pose(m, trolley, yaw)
    layers.truck.set(i, m)
    yawM.makeRotationY(yaw)
    rot.makeRotationZ(th)
    m.makeTranslation(trolley.x, trolley.y, trolley.z).multiply(yawM).multiply(rot).multiply(stretch.makeScale(1, L, 1))
    layers.rod.set(i, m)
    tray.set(L * Math.sin(th), -L * Math.cos(th), 0).applyMatrix4(yawM).add(trolley)
    pose(m, tray, yaw)
    layers.fork.set(i, m)
  }, {
    depart: () => play('servo'),
    arrive: () => play('drawer'),
  })
  return (
    <group>
      <Body id="monorail" c={c} fill={c.surface} edge={c.edge} pieces={pieces} />
      <primitive object={layers.truck.mesh} />
      <primitive object={layers.truck.lines!} />
      <primitive object={layers.rod.mesh} />
      <primitive object={layers.fork.mesh} />
      <primitive object={layers.fork.lines!} />
    </group>
  )
}

export const monorail: TransportVariant = {
  id: 'monorail',
  kind: 'path',
  label: 'Monorail',
  footprint: { x0: -8.5, x1: 0.1, z0: ZB - 1.1, z1: Z + 0.75, h: RY + 0.55 },
  frame: [[-8.7, 0, Z + 1.6], [0.3, 0, Z + 1.6], [0.3, RY + 0.6, ZB - 1.1], [-8.7, RY + 0.6, ZB - 1.1]],
  length: LENGTH,
  speed: SPEC.speed,
  gap: SPEC.gap,
  at: partAt,
  load: { dur: 0.6, h: 1.1 },
  Component: Monorail,
}
