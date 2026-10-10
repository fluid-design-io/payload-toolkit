import { useEffect, useMemo } from 'react'
import { Color, CylinderGeometry, Matrix4, Vector3 } from 'three'

import { play } from '../../../../kit/sound'
import type { TransportProps, TransportVariant } from '../../core/contract'
import { Body } from '../../core/scene'
import { box, fillMat, lineMat, rect, segs } from '../../core/three'
import type { Piece } from '../../core/three'
import { Batch, tintMat } from './fleet'
import type { FleetSpec } from './fleet'
import { pose, useFleet, useSkin, yawOf } from './kit'
import { Pace, Track, rounded, smooth01 } from './track'

/**
 * AGV shuttles. Round floor robots follow a painted lane loop with fiducial
 * marks: each waits at the load dock under the table's edge, takes a part on
 * its turntable deck (which stays square while the chassis turns), darts down
 * the lane, brakes into each corner and docks at the arm's pickup. Empties
 * run the outer lane home and queue nose to tail at the dock.
 */
const DECK = 0.46
const LOAD: [number, number, number] = [-7.6, 0, -0.5]
const PICK: [number, number, number] = [-1.25, 0, -2.1]
const CORNERS: [number, number, number][] = [[-5.0, 0, -0.5], [-5.0, 0, -2.1], [-0.4, 0, -2.1], [-0.4, 0, -3.5], [-8.25, 0, -3.5], [-8.25, 0, -0.5]]

const loop = new Track(rounded(CORNERS, 0.55, true, 14), true)
const sLoad = loop.locate(LOAD)
const sPick = loop.locate(PICK)
const fwdEnd = sPick > sLoad ? sPick : sPick + loop.len
const forward = loop.slice(sLoad, fwdEnd)
const back = loop.slice(fwdEnd, sLoad + loop.len)

/** Where the forward lane turns: the middle of each run of samples whose heading swings. */
const turns = (() => {
  const out: number[] = []
  const a = new Vector3()
  const b = new Vector3()
  let run: number[] = []
  for (let s = 0.1; s < forward.len - 0.1; s += 0.05) {
    forward.tangent(s - 0.08, a)
    forward.tangent(s + 0.08, b)
    if (a.angleTo(b) > 0.12) run.push(s)
    else if (run.length) {
      out.push(run[run.length >> 1])
      run = []
    }
  }
  return out
})()
const slow = (s: number) => {
  let d = Math.min(s, forward.len - s)
  for (const t of turns) d = Math.min(d, Math.abs(s - t))
  return d
}
const pace = new Pace(forward.len, (s) => 1 + 1.25 * smooth01((slow(s) - 0.15) / 0.9))

const SPEC: FleetSpec = { n: 7, length: pace.length, speed: 1.9, gap: 1.25, back: back.len, spacing: 1.1, vmax: 3.8, accel: 5, dwell: 0.35 }

const partAt = (u: number, out: Vector3) => {
  forward.point(pace.s(u), out)
  out.y = DECK
  return out
}

const at = new Vector3()
const tan = new Vector3()
const other = new Vector3()
const m = new Matrix4()

function floorPaint() {
  const lane: number[] = []
  const marks: number[] = []
  const p = new Vector3()
  const t = new Vector3()
  const side = new Vector3()
  const prev: Vector3[] = []
  const n = Math.ceil(loop.len / 0.12)
  for (let i = 0; i <= n; i++) {
    const s = (loop.len * i) / n
    loop.point(s, p)
    loop.tangent(s, t)
    side.set(-t.z, 0, t.x).multiplyScalar(0.6)
    const pts = [p.clone().add(side).setY(0.012), p.clone().sub(side).setY(0.012)]
    if (i) pts.forEach((q, k) => lane.push(...prev[k].toArray(), ...q.toArray()))
    prev[0] = pts[0]
    prev[1] = pts[1]
  }
  for (let s = 0.35; s < loop.len; s += 0.7) {
    loop.point(s, p)
    marks.push(...rect(p.x - 0.07, p.z - 0.07, p.x + 0.07, p.z + 0.07, 0.012))
  }
  for (const d of [LOAD, PICK]) marks.push(...rect(d[0] - 0.68, d[2] - 0.68, d[0] + 0.68, d[2] + 0.68, 0.014), ...rect(d[0] - 0.6, d[2] - 0.6, d[0] + 0.6, d[2] + 0.6, 0.014))
  return { lane: segs(lane), marks: segs(marks) }
}

function dockPieces(): Piece[] {
  const out: Piece[] = []
  for (const d of [LOAD, PICK]) {
    out.push({ geo: box(0.1, 1.15, 0.1), at: [d[0] - 0.62, 0.575, d[2] - 0.62] }, { geo: box(0.22, 0.14, 0.22), at: [d[0] - 0.62, 1.2, d[2] - 0.62] })
  }
  return out
}

function puckPieces() {
  const chassis: Piece[] = [
    { geo: new CylinderGeometry(0.48, 0.48, 0.2, 32), at: [0, 0.13, 0], threshold: 20 },
    { geo: new CylinderGeometry(0.12, 0.14, DECK - 0.27, 16), at: [0, (DECK + 0.23) / 2 - 0.02, 0], threshold: 20 },
  ]
  const deck: Piece[] = [{ geo: new CylinderGeometry(0.3, 0.3, 0.05, 28), at: [0, DECK - 0.025, 0], threshold: 20 }, { geo: box(0.36, 0.012, 0.03), at: [0, DECK + 0.002, 0] }]
  const eye: Piece[] = [{ geo: box(0.07, 0.07, 0.34), at: [0.45, 0.15, 0] }]
  return { chassis, deck, eye }
}

function Agv({ sim, c }: TransportProps) {
  const docks = useMemo(dockPieces, [])
  const paint = useMemo(floorPaint, [])
  useEffect(() => () => { paint.lane.dispose(); paint.marks.dispose() }, [paint])
  const eyeMat = useMemo(() => tintMat(c.flat), [c.flat])
  useEffect(() => () => eyeMat.dispose(), [eyeMat])
  const layers = useMemo(() => {
    const p = puckPieces()
    const fill = fillMat(c.surface, c.flat, c.rough)
    return { chassis: new Batch(p.chassis, SPEC.n, fill, lineMat(c.edge)), deck: new Batch(p.deck, SPEC.n, fill, lineMat(c.edge)), eye: new Batch(p.eye, SPEC.n, eyeMat, null) }
  }, [])
  useSkin(c, () => {
    const fill = fillMat(c.surface, c.flat, c.rough)
    layers.chassis.mesh.material = fill
    layers.deck.mesh.material = fill
    layers.chassis.lines!.material = lineMat(c.edge)
    layers.deck.lines!.material = lineMat(c.edge)
    layers.eye.mesh.material = eyeMat
  })
  const lastTurn = useMemo(() => new Int32Array(SPEC.n).fill(-1), [])
  const leds = useMemo(() => ({ busy: new Color(c.ledBusy), on: new Color(c.led), off: new Color(c.ledOff) }), [c.ledBusy, c.led, c.ledOff])
  useFleet(sim, SPEC, layers, (car, i) => {
    let yaw: number
    if (car.state === 'back') {
      back.point(car.b, at)
      back.tangent(car.b, tan)
      yaw = yawOf(tan)
    } else {
      const s = pace.s(car.state === 'hold' ? SPEC.length : car.u)
      forward.point(s, at)
      forward.tangent(Math.min(s, forward.len - 0.05), tan)
      yaw = yawOf(tan)
      if (car.state === 'ride' && car.b < SPEC.back) {
        back.point(car.b, other)
        at.lerp(other, Math.min(1, (SPEC.back - car.b) / SPEC.spacing))
      }
      for (let k = 0; k < turns.length; k++) {
        if (car.state !== 'ride' || k === lastTurn[i] || Math.abs(turns[k] - s) > 0.4) continue
        lastTurn[i] = k
        play('servo')
      }
    }
    at.y = 0
    pose(m, at, yaw)
    layers.chassis.set(i, m)
    layers.eye.set(i, m)
    pose(m, at)
    layers.deck.set(i, m)
    layers.eye.color(i, car.state === 'ride' ? leds.busy : car.state === 'back' && car.docked ? leds.off : leds.on)
  }, {
    depart: () => play('servo'),
    arrive: () => play('page'),
  })
  return (
    <group>
      <Body id="agv" c={c} fill={c.surface} edge={c.edge} pieces={docks} />
      <lineSegments geometry={paint.lane} material={lineMat(c.edge, 0.45)} />
      <lineSegments geometry={paint.marks} material={lineMat(c.edge, 0.8)} />
      <primitive object={layers.chassis.mesh} />
      <primitive object={layers.chassis.lines!} />
      <primitive object={layers.deck.mesh} />
      <primitive object={layers.deck.lines!} />
      <primitive object={layers.eye.mesh} />
    </group>
  )
}

export const agv: TransportVariant = {
  id: 'agv',
  kind: 'path',
  label: 'AGV shuttle',
  footprint: { x0: -8.95, x1: 0.3, z0: -4.2, z1: 0.2, h: 1.3 },
  frame: [[-9.1, 0, 0.6], [0.5, 0, 0.6], [0.5, 0, -4.4], [-9.1, 0, -4.4], [-7.6, 1.6, -0.5]],
  el: 48,
  length: pace.length,
  speed: SPEC.speed,
  gap: SPEC.gap,
  at: partAt,
  load: { dur: 0.6, h: 1.0 },
  Component: Agv,
}
