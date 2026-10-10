import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { BoxGeometry, Color, Matrix4, Quaternion, Sphere, Vector3 } from 'three'
import type { Group, InstancedMesh } from 'three'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js'
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js'

import type { IntegratorProps, Sim } from '../../core/contract'
import { pickable } from '../../core/scene'
import { chipTop } from '../../core/spec'
import { box, clamp, cyl, fillMat, reducedMotion } from '../../core/three'
import type { Glows } from '../../fx/glow'
import { heatColor, isDark } from '../../fx/heat'
import { DUST, Particles } from '../../fx/particles'
import type { Smoke } from '../../fx/smoke'
import { etchRamp } from './marks'
import { Pad, padAt } from './pad'
import { DynLines, Rigid, useRigid } from './rigid'
import { scriptOf, toolAt } from './script'
import type { Report } from './report'
import type { Surface, Tool } from './script'

/** The archive walker at 0.62 scale: femur, tibia, the feet's reach from the centre, the hips' ring and the emitter's reach. */
const S = 0.62
const F1 = 1.05 * S
const F2 = 1.75 * S
const REACH = 1.65 * S
const HIP = 0.58 * S
const EMIT = 0.66 * S
const TOP = 0.3 * S
const STAND = 0.5
const CROUCH = 0.26
const SPEED = 5
const X = new Vector3(1, 0, 0)
const ONE = new Vector3(1, 1, 1)
const M = new Matrix4()
const Q = new Quaternion()
const C = Array.from({ length: 8 }, () => new Vector3())
const BAR = [0, 1, 2, 3, 4, 5, 6, 7, 0, 2, 1, 3, 4, 6, 5, 7, 0, 4, 1, 5, 2, 6, 3, 7]
const SCENE = new Sphere(new Vector3(0, 0, 0), 60)
const ease = (dt: number, k: number) => 1 - Math.exp(-dt * k)
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))
const breathe = (t: number) => 0.88 + Math.sin(t * Math.PI * 5) * 0.12
const HEX = (r: number, y: number) => Array.from({ length: 6 }, (_, k) => [r * Math.sin((k * Math.PI) / 3), y, r * Math.cos((k * Math.PI) / 3)] as const)

function shell() {
  const lines: number[] = []
  const hex = HEX(0.625 * S, 0.004)
  for (let k = 0; k < 6; k++) lines.push(...hex[k], ...hex[(k + 1) % 6])
  return {
    pieces: [
      { geo: cyl(0.66 * S, 0.56 * S, 0.24 * S, 6), at: [0, 0, 0] as [number, number, number] },
      { geo: cyl(0.4 * S, 0.5 * S, 0.1 * S, 6), at: [0, 0.17 * S, 0] as [number, number, number] },
    ],
    lines,
  }
}
function head() {
  return {
    pieces: [
      { geo: box(0.42 * S, 0.16 * S, 0.3 * S), at: [0, 0, 0] as [number, number, number] },
      { geo: cyl(0.045 * S, 0.06 * S, 0.44 * S, 10).rotateZ(Math.PI / 2), at: [EMIT - 0.22 * S, 0, 0] as [number, number, number] },
      { geo: box(0.08 * S, 0.22 * S, 0.34 * S), at: [-0.2 * S, 0.02, 0] as [number, number, number] },
    ],
  }
}

/** Twelve hairline edges of a bar of length `len` and half thickness `h` along local +x of `m`. */
function bar(w: DynLines, m: Matrix4, len: number, h: number) {
  for (let i = 0; i < 8; i++) C[i].set(i & 1 ? len : 0, i & 2 ? h : -h, i & 4 ? h : -h).applyMatrix4(m)
  for (let e = 0; e < 24; e += 2) {
    const a = C[BAR[e]], b = C[BAR[e + 1]]
    w.add(a.x, a.y, a.z, b.x, b.y, b.z)
  }
}

type Leg = { a: number; foot: Vector3; from: Vector3; to: Vector3; t: number; init: boolean }
type HexState = { pos: Vector3; vel: Vector3; heading: number; aim: number; next: number; job: Sim['work']['job']; side: Vector3; lastWork: number; puff: number; emit: number; y: number }

/** Codex's integrator: a hexapod that walks to each seated chip, raster-scans the lid and burns a mark into it with a visible laser. */
export function Hexapod({ sim, c, tip: card, guard, onCycle, surface, glows, smoke, report }: IntegratorProps & { surface: Surface; glows: Glows; smoke: Smoke; report: Report }) {
  const { invalidate, size } = useThree()
  const body = useRef<Group>(null)
  const headRef = useRef<Group>(null)
  const femurs = useRef<InstancedMesh>(null)
  const tibias = useRef<InstancedMesh>(null)
  const shellGeo = useRigid(shell)
  const headGeo = useRigid(head)
  const parts = useMemo(() => {
    const geo = new LineSegmentsGeometry()
    geo.setPositions([0, 0, 0, 0, 0, 0])
    const beam = new LineSegments2(geo, new LineMaterial({ color: new Color(c.spark).getHex(), linewidth: 2.2, transparent: true, opacity: 1, depthWrite: false }))
    beam.frustumCulled = false
    beam.raycast = () => {}
    const dust = new Particles(220, DUST)
    dust.setGlow(isDark(c))
    return {
      dust,
      femur: new BoxGeometry(F1, 0.08 * S, 0.08 * S).translate(F1 / 2, 0, 0),
      tibia: new BoxGeometry(F2, 0.05 * S, 0.05 * S).translate(F2 / 2, 0, 0),
      edges: new DynLines(6 * 2 * 12, c.edge),
      beam,
      look: etchRamp(c),
      col: new Color(),
    }
  }, [c])
  useEffect(() => () => {
    parts.femur.dispose(); parts.tibia.dispose(); parts.edges.dispose(); parts.dust.dispose()
    parts.beam.geometry.dispose(); parts.beam.material.dispose()
  }, [parts])
  useLayoutEffect(() => { parts.beam.material.resolution.set(size.width, size.height) }, [parts, size.width, size.height])
  const pad = useMemo(() => padAt(sim, surface), [sim, surface])
  const legs = useMemo<Leg[]>(() => Array.from({ length: 6 }, (_, k) => ({ a: (k / 6) * Math.PI * 2 + Math.PI / 6, foot: new Vector3(), from: new Vector3(), to: new Vector3(), t: 1, init: false })), [])
  const st = useMemo<HexState>(() => ({ pos: new Vector3(pad.x, 0, pad.z), vel: new Vector3(), heading: Math.PI / 2, aim: 0, next: 0, job: null, side: new Vector3(), lastWork: -99, puff: 0, emit: 0, y: CROUCH }), [pad])
  const v = useMemo(() => ({ hip: new Vector3(), ideal: new Vector3(), knee: new Vector3(), d: new Vector3(), goal: new Vector3(), hit: new Vector3(), muzzle: new Vector3(), tool: { x: 0, z: 0, u: 0, on: false } as Tool }), [])

  /** Ground under a foot: the top of a seated chip, else the board, else the floor. */
  const ground = (x: number, z: number) => {
    for (const p of sim.live) {
      if (p.mode !== 'seated' || !p.slot) continue
      const s = p.slot.s
      if (Math.abs(x - p.slot.x) < (p.spec.fw * s) / 2 && Math.abs(z - p.slot.z) < (p.spec.fd * s) / 2) return p.slot.y + chipTop(p.spec) * s
    }
    return x > surface.x0 && x < surface.x1 && z > surface.z0 && z < surface.z1 ? surface.y : 0
  }
  const floor = (x: number, z: number) => (x > surface.x0 && x < surface.x1 && z > surface.z0 && z < surface.z1 ? surface.y : 0)
  const around = (p: Vector3, a: number, heading: number, r: number, out: Vector3) => out.set(p.x + Math.cos(a - heading) * r, 0, p.z + Math.sin(a - heading) * r)

  useFrame((_, frameDt) => {
    const dt = Math.min(frameDt, 0.1)
    const b = body.current, hd = headRef.current, fm = femurs.current, tb = tibias.current
    if (!b || !hd || !fm || !tb) return
    const { hip, ideal, knee, d, goal, hit, muzzle, tool } = v
    const job = sim.work.job
    const part = job && job.part.slot && !reducedMotion ? job.part : null
    if (job !== st.job) {
      st.job = job
      if (part) {
        const slot = part.slot!
        st.side.set(st.pos.x - slot.x - 0.7, 0, st.pos.z - slot.z - 0.9)
        if (st.side.lengthSq() < 1e-4) st.side.set(-1, 0, -1)
        st.side.normalize()
      }
    }
    if (job) st.lastWork = sim.time
    const script = part ? scriptOf('hexapod', part.spec) : null
    let working = false
    if (part && script && job) {
      const slot = part.slot!, s = slot.s
      toolAt(script, job.t * script.total, tool)
      hit.set(slot.x + tool.x * s, slot.y + script.y * s, slot.z + tool.z * s)
      if (tool.phase.kind === 'scan') {
        const a = script.area, rows = 4
        const f = tool.u * rows, row = Math.floor(Math.min(rows - 0.001, f)), w = f - row
        const x = row % 2 ? 1 - w : w
        hit.set(slot.x + (a.x0 + (a.x1 - a.x0) * x) * s, hit.y, slot.z + (a.z0 + ((a.z1 - a.z0) * (row + 0.5)) / rows) * s)
      }
      const reach = (Math.max(part.spec.fw, part.spec.fd) * s) / 2 + 0.95
      goal.set(slot.x + st.side.x * reach, 0, slot.z + st.side.z * reach)
      goal.x = clamp(goal.x, surface.x0 + 0.5, surface.x1 - 0.5)
      goal.z = clamp(goal.z, surface.z0 + 0.6, surface.z1 - 0.5)
      working = tool.phase.kind !== 'approach'
    } else {
      const home = reducedMotion || sim.time - st.lastWork > 6
      goal.set(home ? pad.x : st.pos.x, 0, home ? pad.z : st.pos.z)
    }
    d.copy(goal).sub(st.pos).setY(0)
    const dist = d.length()
    const want = Math.min(SPEED, dist * 2.6)
    if (dist > 1e-4) d.multiplyScalar(want / dist)
    st.vel.lerp(d, ease(dt, 5))
    if (reducedMotion) st.pos.copy(goal).setY(0)
    else st.pos.addScaledVector(st.vel, dt)
    const speed = Math.hypot(st.vel.x, st.vel.z)
    if (speed > 0.25) st.heading += wrap(Math.atan2(-st.vel.z, st.vel.x) - st.heading) * ease(dt, 6)
    else if (part) st.heading += wrap(Math.atan2(-(part.slot!.z - st.pos.z), part.slot!.x - st.pos.x) - st.heading) * ease(dt, 2.5)

    let stepping = false
    for (const l of legs) if (l.t < 1) stepping = true
    for (let pass = 0; pass < 2 && !stepping; pass++) {
      const g = pass ? 1 - st.next : st.next
      let far = false
      for (let k = g; k < 6; k += 2) {
        const l = legs[k]
        around(st.pos, l.a, st.heading, REACH, ideal)
        if (Math.hypot(ideal.x + st.vel.x * 0.16 - l.foot.x, ideal.z + st.vel.z * 0.16 - l.foot.z) > 0.26 + speed * 0.06) far = true
      }
      if (!far) continue
      for (let k = g; k < 6; k += 2) {
        const l = legs[k]
        around(st.pos, l.a, st.heading, REACH, l.to)
        l.to.x += st.vel.x * 0.2
        l.to.z += st.vel.z * 0.2
        l.to.y = ground(l.to.x, l.to.z)
        l.from.copy(l.foot)
        l.t = 0
      }
      st.next = 1 - g
      stepping = true
    }
    let feet = 0
    for (const l of legs) {
      if (!l.init) {
        around(st.pos, l.a, st.heading, REACH, l.foot)
        l.foot.y = ground(l.foot.x, l.foot.z)
        l.init = true
      }
      if (l.t < 1) {
        l.t = Math.min(1, l.t + dt / 0.13)
        l.foot.lerpVectors(l.from, l.to, l.t * l.t * (3 - 2 * l.t))
        l.foot.y += Math.sin(l.t * Math.PI) * 0.22
      }
      feet += l.foot.y
    }
    const atPad = !part && Math.hypot(st.pos.x - pad.x, st.pos.z - pad.z) < 0.08
    st.y += ((atPad ? CROUCH : STAND) - st.y) * ease(dt, 4)
    st.pos.y = feet / 6 + st.y
    b.position.copy(st.pos)
    b.rotation.y = st.heading

    const target = part ? wrap(Math.atan2(-(hit.z - st.pos.z), hit.x - st.pos.x) - st.heading) : 0
    st.aim += wrap(target - st.aim) * ease(dt, working ? 16 : 5)
    hd.rotation.y = st.aim

    const ew = parts.edges
    ew.begin()
    for (let k = 0; k < 6; k++) {
      const l = legs[k]
      around(st.pos, l.a, st.heading, HIP, hip).setY(st.pos.y - 0.03)
      d.copy(l.foot).sub(hip)
      const r = Math.max(Math.hypot(d.x, d.z), 1e-3)
      const D = clamp(d.length(), 0.2, F1 + F2 - 0.01)
      const t1 = Math.atan2(d.y, r) + Math.acos(clamp((F1 * F1 + D * D - F2 * F2) / (2 * F1 * D), -1, 1))
      knee.set(hip.x + (d.x / r) * F1 * Math.cos(t1), hip.y + F1 * Math.sin(t1), hip.z + (d.z / r) * F1 * Math.cos(t1))
      M.compose(hip, Q.setFromUnitVectors(X, d.copy(knee).sub(hip).normalize()), ONE)
      fm.setMatrixAt(k, M)
      bar(ew, M, F1, 0.04 * S)
      M.compose(knee, Q.setFromUnitVectors(X, d.copy(l.foot).sub(knee).normalize()), ONE)
      tb.setMatrixAt(k, M)
      bar(ew, M, F2, 0.025 * S)
    }
    fm.instanceMatrix.needsUpdate = true
    tb.instanceMatrix.needsUpdate = true
    ew.end()

    const yaw = st.heading + st.aim
    muzzle.set(st.pos.x + Math.cos(yaw) * EMIT, st.pos.y + TOP, st.pos.z - Math.sin(yaw) * EMIT)
    const kind = part ? tool.phase.kind : null
    const burning = kind === 'etch' || kind === 'scan'
    parts.beam.visible = burning
    if (burning) {
      const arr = (parts.beam.geometry.getAttribute('instanceStart') as unknown as { data: { array: Float32Array; needsUpdate: boolean } }).data
      arr.array[0] = muzzle.x; arr.array[1] = muzzle.y; arr.array[2] = muzzle.z
      arr.array[3] = hit.x; arr.array[4] = hit.y; arr.array[5] = hit.z
      arr.needsUpdate = true
      const etching = kind === 'etch'
      parts.beam.material.opacity = etching ? 1 : 0.45
      parts.beam.material.linewidth = etching ? 2.4 : 1.4
      const s = part!.slot!.s
      const k = breathe(sim.time)
      glows.add(hit.x, hit.y + 0.01, hit.z, (etching ? 0.12 : 0.06) * s * k, heatColor(1, parts.look, parts.col), etching ? 0.95 : 0.5)
      glows.add(muzzle.x, muzzle.y, muzzle.z, 0.08, heatColor(1, parts.look, parts.col), 0.7)
      if (etching) {
        glows.add(hit.x, hit.y + 0.01, hit.z, 0.32 * s * k, heatColor(0.6, parts.look, parts.col), 0.28)
        st.emit += dt * 70
        while (st.emit >= 1) {
          st.emit -= 1
          parts.dust.burst(1, hit.x, hit.y + 0.005, hit.z, 0, 1, 0, [0.25, 0.75], 1.4, [0.6, 1.5])
        }
        st.puff += dt
        if (st.puff > 0.16) {
          st.puff = 0
          smoke.emit(hit.x, hit.y + 0.03, hit.z, 0.05, 1.6)
        }
      }
    }
    parts.dust.step(dt, floor, parts.look)

    report.phase = part ? tool.phase.kind : atPad ? 'parked' : speed > 0.05 ? 'walking' : 'idle'
    if (part) report.at.copy(hit)
    else report.at.copy(st.pos)
    const settled = atPad && speed < 0.01 && !stepping && Math.abs(st.y - CROUCH) < 0.002
    if (!settled || parts.dust.busy) invalidate()
  })

  const h = pickable(card, guard, 'Codex · laser hexapod', 'Etches a mark into each seated chip · click for the next agent', onCycle)
  return (
    <>
      <Pad pad={pad} c={c} kind="hexapod" handlers={h} />
      <group ref={body} {...h}>
        <Rigid geo={shellGeo} fill={c.codex} edge={c.codexInk} c={c} />
        <group ref={headRef} position={[0, TOP, 0]}>
          <Rigid geo={headGeo} fill={c.surface} edge={c.edge} c={c} />
        </group>
        <mesh visible={false}>
          <boxGeometry args={[1.4, 0.7, 1.4]} />
        </mesh>
      </group>
      <instancedMesh ref={femurs} args={[parts.femur, fillMat(c.surface, c.flat, c.rough), 6]} frustumCulled={false} boundingSphere={SCENE} raycast={() => null} />
      <instancedMesh ref={tibias} args={[parts.tibia, fillMat(c.surface, c.flat, c.rough), 6]} frustumCulled={false} boundingSphere={SCENE} raycast={() => null} />
      <primitive object={parts.edges.object} />
      <primitive object={parts.beam} />
      <primitive object={parts.dust.object} />
    </>
  )
}
