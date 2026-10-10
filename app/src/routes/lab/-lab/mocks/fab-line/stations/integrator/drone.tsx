import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { BufferAttribute, BufferGeometry, CircleGeometry, Color, CylinderGeometry, MeshBasicMaterial, Quaternion, SphereGeometry, TorusGeometry, Vector3 } from 'three'
import type { Group, Mesh } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import { play } from '../../../../kit/sound'
import type { IntegratorProps, Sim } from '../../core/contract'
import { pickable } from '../../core/scene'
import { box, clamp, cyl, fillMat, lineMat, reducedMotion } from '../../core/three'
import type { Glows } from '../../fx/glow'
import { heatColor, isDark } from '../../fx/heat'
import { Particles, SPARK } from '../../fx/particles'
import { beadRamp } from './marks'
import type { Smoke } from '../../fx/smoke'
import { Pad, padAt } from './pad'
import { DynLines, Rigid, ring, useRigid } from './rigid'
import { scriptOf, toolAt } from './script'
import type { Report } from './report'
import type { Surface, Tool } from './script'

const R = 0.5
const ROTORS = [[-0.82, -0.82], [0.82, -0.82], [0.82, 0.82], [-0.82, 0.82]] as const
const GUARD = 0.4
const BLADE = 0.36
const ROTOR_Y = 0.13
/** Gimbal under the hull the torch hangs from, and the feet height when landed. */
const GIMBAL = -0.2
const SKID = 0.38
/** Hover heights above the worked surface while scanning and while welding. */
const SCAN_H = 1.55
const WELD_H = 1.08
/** The drone sits up and behind the arc so the camera, which looks from +x +z, sees the joint. */
const OFF = { x: -0.42, z: -0.42 }
const UP = new Vector3(0, 1, 0)
/** The torch tucked under the gimbal while flying, relative to it. */
const STOWED = new Vector3(0.04, -0.16, 0.04)
const ease = (dt: number, k: number) => 1 - Math.exp(-dt * k)
const smooth = (u: number) => u * u * (3 - 2 * u)
/** Critically damped follow that stays stable at any frame time (Game Programming Gems 4, 1.10). */
function smoothDamp(pos: Vector3, vel: Vector3, goal: Vector3, time: number, dt: number, tmp: Vector3) {
  const w = 2 / time, x = w * dt
  const k = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x)
  tmp.copy(pos).sub(goal)
  const tx = (vel.x + w * tmp.x) * dt, ty = (vel.y + w * tmp.y) * dt, tz = (vel.z + w * tmp.z) * dt
  vel.set((vel.x - w * tx) * k, (vel.y - w * ty) * k, (vel.z - w * tz) * k)
  pos.set(goal.x + (tmp.x + tx) * k, goal.y + (tmp.y + ty) * k, goal.z + (tmp.z + tz) * k)
}
/** 2.5 Hz breathing, under the 3 Hz flash limit. */
const breathe = (t: number) => 0.88 + Math.sin(t * Math.PI * 5) * 0.12

function hull() {
  const lat = (y: number) => R * Math.sqrt(1 - (y / (R * 0.5)) ** 2)
  const lines: number[] = []
  ring(0, 0, 0, R + 0.004, 40, lines)
  for (const y of [0.13, -0.13]) ring(0, y, 0, lat(y) + 0.004, 36, lines)
  ring(0, 0.21, 0, lat(0.21) + 0.003, 24, lines)
  return { pieces: [{ geo: new SphereGeometry(R, 28, 14).scale(1, 0.5, 1), threshold: 80 }], lines }
}
function frame() {
  const pieces = []
  const lines: number[] = []
  for (const [x, z] of ROTORS) {
    pieces.push({ geo: box(Math.hypot(x, z), 0.05, 0.08), at: [x / 2, 0.02, z / 2] as [number, number, number], rot: [0, Math.atan2(-z, x), 0] as [number, number, number] })
    pieces.push({ geo: cyl(0.075, 0.085, 0.12, 12), at: [x, 0.06, z] as [number, number, number] })
    pieces.push({ geo: new TorusGeometry(GUARD, 0.024, 6, 40).rotateX(Math.PI / 2), at: [x, ROTOR_Y - 0.02, z] as [number, number, number], threshold: 80 })
    ring(x, ROTOR_Y - 0.02, z, GUARD + 0.026, 40, lines)
    ring(x, ROTOR_Y - 0.02, z, GUARD - 0.026, 40, lines)
  }
  for (const z of [-0.26, 0.26]) {
    pieces.push({ geo: box(0.92, 0.035, 0.05), at: [0, -SKID + 0.018, z] as [number, number, number] })
    for (const x of [-0.22, 0.22]) pieces.push({ geo: box(0.035, 0.2, 0.035), at: [x, -SKID + 0.12, z] as [number, number, number] })
  }
  pieces.push({ geo: new SphereGeometry(0.085, 12, 8), at: [0, GIMBAL, 0] as [number, number, number], threshold: 80 })
  pieces.push({ geo: cyl(0.09, 0.09, 0.12, 14).rotateZ(Math.PI / 2), at: [0.3, -0.14, 0.2] as [number, number, number] })
  ring(0, GIMBAL, 0, 0.088, 16, lines)
  return { pieces, lines }
}
/** The Claude spark on the canopy: eight rays, long and short. */
function asterisk() {
  const l: number[] = []
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8
    const r1 = i % 2 ? 0.12 : 0.17
    l.push(Math.cos(a) * 0.035, 0.252, Math.sin(a) * 0.035, Math.cos(a) * r1, 0.252 - r1 * 0.03, Math.sin(a) * r1)
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(l), 3))
  return g
}

type DroneState = {
  pos: Vector3; vel: Vector3; prev: Vector3; from: Vector3; tip: Vector3; reach: Vector3
  job: Sim['work']['job']; lastWork: number; spin: number; angle: number[]; emit: number; puff: number; tack: number
}

/** Claude's integrator: a rounded quad drone that flies to each seated chip, scans it, tacks the corners and seams every pin row with a moving arc. */
export function Drone({ sim, c, tip: card, guard, onCycle, surface, glows, smoke, report }: IntegratorProps & { surface: Surface; glows: Glows; smoke: Smoke; report: Report }) {
  const { invalidate } = useThree()
  const root = useRef<Group>(null)
  const tilt = useRef<Group>(null)
  const torch = useRef<Mesh>(null)
  const nozzle = useRef<Mesh>(null)
  const discs = useRef<Mesh>(null)
  const hullGeo = useRigid(hull)
  const frameGeo = useRigid(frame)
  const parts = useMemo(() => {
    const star = asterisk()
    const disc = mergeGeometries(ROTORS.map(([x, z]) => new CircleGeometry(BLADE + 0.01, 28).rotateX(-Math.PI / 2).translate(x, ROTOR_Y + 0.004, z)))!
    const torchGeo = new CylinderGeometry(0.013, 0.02, 1, 8).translate(0, 0.5, 0)
    const nozzleGeo = new CylinderGeometry(0.036, 0.012, 0.1, 10).translate(0, -0.05, 0)
    const discMat = new MeshBasicMaterial({ color: c.dim, transparent: true, opacity: 0, depthWrite: false })
    const sparks = new Particles(260, SPARK)
    sparks.setGlow(isDark(c))
    return {
      star, disc, torchGeo, nozzleGeo, discMat, sparks,
      blades: new DynLines(16, c.edge),
      wire: new DynLines(3, c.claudeCable),
      scan: new DynLines(10, c.claude, 0.85),
      ripple: new DynLines(40, c.edge, 0.4),
    }
  }, [c])
  useEffect(() => () => {
    parts.star.dispose(); parts.disc.dispose(); parts.torchGeo.dispose(); parts.nozzleGeo.dispose(); parts.discMat.dispose()
    for (const l of [parts.blades, parts.wire, parts.scan, parts.ripple]) l.dispose()
    parts.sparks.dispose()
  }, [parts])
  const pad = useMemo(() => padAt(sim, surface), [sim, surface])
  const st = useMemo<DroneState>(() => {
    const p = new Vector3(pad.x, SKID + pad.y, pad.z)
    return { pos: p.clone(), vel: new Vector3(), prev: p.clone(), from: p.clone(), tip: p.clone(), reach: new Vector3(0, -0.14, 0), job: null, lastWork: -99, spin: 0, angle: [0, 0.7, 1.4, 2.1], emit: 0, puff: 0, tack: -1 }
  }, [pad])
  const v = useMemo(() => ({ want: new Vector3(), tipWant: new Vector3(), gimbal: new Vector3(), dir: new Vector3(), q: new Quaternion(), tool: { x: 0, z: 0, u: 0, on: false } as Tool, hot: beadRamp(c), col: new Color() }), [c])
  const floor = useMemo(() => (x: number, z: number) => (x > surface.x0 && x < surface.x1 && z > surface.z0 && z < surface.z1 ? surface.y : 0), [surface])

  useFrame((_, frameDt) => {
    const dt = Math.min(frameDt, 0.25)
    const g = root.current, tl = tilt.current
    if (!g || !tl) return
    const { want, tipWant, gimbal, dir, tool } = v
    const job = sim.work.job
    const part = job && job.part.slot && !reducedMotion ? job.part : null
    if (job !== st.job) {
      st.job = job
      st.from.copy(st.pos)
    }
    if (job) st.lastWork = sim.time
    const script = part ? scriptOf('drone', part.spec) : null
    let wx = 0, wy = 0, wz = 0, arc = false, kinematic = false, reach = false
    if (part && script && job) {
      const slot = part.slot!, s = slot.s
      toolAt(script, job.t * script.total, tool)
      wx = slot.x + tool.x * s
      wz = slot.z + tool.z * s
      wy = slot.y + script.y * s
      const kind = tool.phase.kind
      const h = kind === 'scan' || kind === 'approach' || kind === 'lift' ? SCAN_H : WELD_H
      want.set(wx + OFF.x, wy + h, wz + OFF.z)
      if (kind === 'approach') {
        const u = smooth(tool.u)
        st.pos.lerpVectors(st.from, want, u)
        st.pos.y += Math.sin(Math.PI * Math.min(1, tool.u * 1.15)) * 0.9
        kinematic = true
      }
      arc = tool.on
      const welding = kind === 'tack' || kind === 'seam' || kind === 'move'
      reach = welding
      if (welding) tipWant.set(wx, wy + (arc ? 0.008 : kind === 'move' ? 0.16 : 0.06), wz)
      if (kind === 'tack' && arc && st.tack !== tool.phase.t0) {
        st.tack = tool.phase.t0
        parts.sparks.burst(26, wx, wy + 0.01, wz, (wx - slot.x) * 0.6, 1.2, (wz - slot.z) * 0.6, [1.6, 3.6], 1.1, [0.35, 0.9])
        play('tick')
      }
    } else {
      const idle = sim.time - st.lastWork
      const home = reducedMotion || idle > 1.1
      if (home) {
        const flat = Math.hypot(st.pos.x - pad.x, st.pos.z - pad.z)
        want.set(pad.x, flat < 0.12 ? pad.y + SKID : Math.max(st.pos.y, pad.y + 1.3), pad.z)
        if (reducedMotion) st.pos.copy(want)
      } else want.copy(st.pos)
    }
    if (!kinematic) {
      smoothDamp(st.pos, st.vel, want, 0.22, dt, dir)
    } else st.vel.copy(st.pos).sub(st.prev).divideScalar(Math.max(dt, 1e-3))
    st.prev.copy(st.pos)

    const landed = !part && Math.hypot(st.pos.x - pad.x, st.pos.z - pad.z) < 0.15 && st.pos.y < pad.y + SKID + 0.03
    st.spin += ((landed ? 0 : 38) - st.spin) * ease(dt, landed ? 1.6 : 4)
    const flying = st.spin > 4
    g.position.copy(st.pos)
    if (flying && !reducedMotion) g.position.y += Math.sin(sim.time * 6.3) * 0.022
    tl.rotation.set(clamp(st.vel.z * 0.07, -0.3, 0.3), 0, clamp(-st.vel.x * 0.07, -0.3, 0.3))

    const b = parts.blades
    b.begin()
    for (let i = 0; i < 4; i++) {
      const [x, z] = ROTORS[i]
      st.angle[i] += dt * st.spin * (i % 2 ? 1 : -1)
      const cs = Math.cos(st.angle[i]), sn = Math.sin(st.angle[i])
      b.add(x - cs * BLADE, ROTOR_Y, z - sn * BLADE, x + cs * BLADE, ROTOR_Y, z + sn * BLADE)
      b.add(x + sn * BLADE * 0.25, ROTOR_Y, z - cs * BLADE * 0.25, x - sn * BLADE * 0.25, ROTOR_Y, z + cs * BLADE * 0.25)
    }
    b.end()
    parts.discMat.opacity = clamp((st.spin - 6) / 32, 0, 1) * 0.22
    if (discs.current) discs.current.visible = parts.discMat.opacity > 0.01

    gimbal.set(st.pos.x, g.position.y + GIMBAL - 0.06, st.pos.z)
    if (reach) tipWant.sub(gimbal)
    else tipWant.copy(STOWED)
    if (arc && tool.phase.kind === 'seam') st.reach.copy(tipWant)
    else st.reach.lerp(tipWant, ease(dt, 14))
    st.tip.copy(gimbal).add(st.reach)
    dir.copy(st.tip).sub(gimbal)
    const len = Math.max(0.05, dir.length())
    v.q.setFromUnitVectors(UP, dir.multiplyScalar(-1 / len))
    if (torch.current && nozzle.current) {
      torch.current.position.copy(st.tip)
      torch.current.quaternion.copy(v.q)
      torch.current.scale.set(1, Math.max(0.01, len - 0.09), 1)
      torch.current.position.addScaledVector(dir, 0.09)
      nozzle.current.position.copy(st.tip)
      nozzle.current.quaternion.copy(v.q)
      nozzle.current.position.addScaledVector(dir, 0.1)
    }
    const wr = parts.wire
    wr.begin()
    const sx = st.pos.x + 0.3, sy = g.position.y - 0.14, sz = st.pos.z + 0.26
    const mx = (sx + st.tip.x) / 2, my = (sy + st.tip.y) / 2 - 0.08, mz = (sz + st.tip.z) / 2 + 0.06
    wr.add(sx, sy, sz, mx, my, mz)
    wr.add(mx, my, mz, st.tip.x, st.tip.y + 0.06, st.tip.z)
    wr.end()

    const sc = parts.scan
    sc.begin()
    if (part && script && tool.phase.kind === 'scan') {
      const slot = part.slot!, s = slot.s, a = script.area
      const u = tool.u < 0.5 ? smooth(tool.u * 2) : smooth(2 - tool.u * 2)
      const z = slot.z + (a.z0 - 0.08 + (a.z1 - a.z0 + 0.16) * u) * s
      const x0 = slot.x + (a.x0 - 0.08) * s, x1 = slot.x + (a.x1 + 0.08) * s
      const y = wy + 0.01
      sc.add(x0, y, z, x1, y, z)
      sc.add(gimbal.x, gimbal.y, gimbal.z, x0, y, z)
      sc.add(gimbal.x, gimbal.y, gimbal.z, x1, y, z)
      const za = slot.z + (a.z0 - 0.08) * s, zb = slot.z + (a.z1 + 0.08) * s
      sc.add(x0, y, za, x1, y, za); sc.add(x1, y, za, x1, y, zb); sc.add(x1, y, zb, x0, y, zb); sc.add(x0, y, zb, x0, y, za)
    }
    sc.end()

    const rp = parts.ripple
    rp.begin()
    const ground = floor(st.pos.x, st.pos.z)
    if (flying && !reducedMotion && st.pos.y - ground < 2.4 && !landed) {
      const k = (sim.time % 1.25) / 1.25
      const r = 0.5 + k * 1.5
      for (let i = 0; i < 40; i++) {
        const a0 = (i / 40) * Math.PI * 2, a1 = ((i + 1) / 40) * Math.PI * 2
        rp.add(st.pos.x + Math.cos(a0) * r, ground + 0.01, st.pos.z + Math.sin(a0) * r, st.pos.x + Math.cos(a1) * r, ground + 0.01, st.pos.z + Math.sin(a1) * r)
      }
      rp.material.opacity = (1 - k) * 0.35 * clamp((st.spin - 6) / 30, 0, 1)
    }
    rp.end()

    if (arc && part) {
      const slot = part.slot!
      st.emit += dt * (tool.phase.kind === 'seam' ? 95 : 50)
      const nx = st.tip.x - slot.x, nz = st.tip.z - slot.z, nl = Math.hypot(nx, nz) || 1
      while (st.emit >= 1) {
        st.emit -= 1
        parts.sparks.burst(1, st.tip.x, st.tip.y + 0.01, st.tip.z, (nx / nl) * 0.7, 1.1, (nz / nl) * 0.7, [1.2, 3.4], 1.0, [0.3, 0.95])
      }
      st.puff += dt
      if (st.puff > 0.09) {
        st.puff = 0
        smoke.emit(st.tip.x, st.tip.y + 0.04, st.tip.z, 0.08)
      }
      const s = slot.s
      const k = breathe(sim.time)
      glows.add(st.tip.x, st.tip.y + 0.02, st.tip.z, 0.15 * s * k, heatColor(1, v.hot, v.col), 0.95)
      glows.add(st.tip.x, st.tip.y + 0.02, st.tip.z, 0.42 * s * k, heatColor(0.55, v.hot, v.col), 0.3)
      glows.add(st.tip.x, wy + 0.004, st.tip.z, 0.34 * s, heatColor(0.6, v.hot, v.col), 0.32, true)
    }
    parts.sparks.step(Math.min(dt, 0.05), floor, v.hot)

    report.phase = part ? tool.phase.kind : landed ? 'parked' : 'flying'
    if (part) report.at.set(wx, wy, wz)
    else report.at.copy(st.pos)
    const settled = landed && st.spin < 0.3 && st.vel.lengthSq() < 1e-5
    if (!settled || parts.sparks.busy) invalidate()
  })

  const h = pickable(card, guard, 'Claude Code · solder drone', 'Tacks and seams each seated chip · click for the next agent', onCycle)
  return (
    <>
      <Pad pad={pad} c={c} kind="drone" handlers={h} />
      <group ref={root} {...h}>
        <group ref={tilt}>
          <Rigid geo={hullGeo} fill={c.claude} edge={c.claudeEdge} c={c} />
          <Rigid geo={frameGeo} fill={c.surface} edge={c.edge} c={c} />
          <lineSegments geometry={parts.star} material={lineMat(c.claudeInk)} />
          <primitive object={parts.blades.object} />
          <mesh ref={discs} geometry={parts.disc} material={parts.discMat} />
        </group>
        <mesh position={[0, 0, 0]} visible={false}>
          <boxGeometry args={[2.4, 0.8, 2.4]} />
        </mesh>
      </group>
      <mesh ref={torch} geometry={parts.torchGeo} material={fillMat(c.claudeEdge, c.flat, c.rough)} raycast={() => null} />
      <mesh ref={nozzle} geometry={parts.nozzleGeo} material={fillMat(c.gold, c.flat, c.rough, { metal: 0.4 })} raycast={() => null} />
      <primitive object={parts.wire.object} />
      <primitive object={parts.scan.object} />
      <primitive object={parts.ripple.object} />
      <primitive object={parts.sparks.object} />
    </>
  )
}
