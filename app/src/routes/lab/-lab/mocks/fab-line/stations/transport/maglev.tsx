import { useFrame } from '@react-three/fiber'
import { useLayoutEffect } from 'react'
import { AdditiveBlending, Color, Matrix4, NormalBlending, Vector3 } from 'three'
import type { MeshBasicMaterial } from 'three'

import { keepAnimating } from '../../../../kit/busy'
import { play } from '../../../../kit/sound'
import type { Path, Sim, TransportProps } from '../../core/contract'
import { kick } from '../../core/jolt'
import { Body } from '../../core/scene'
import { clamp, damp, fillMat, lerp, lineMat, reducedMotion, smoothstep, useDisposable } from '../../core/three'
import { contrastOn, heatColor, isDark, ramp } from '../../fx/heat'
import type { Ramp } from '../../fx/heat'
import { hidden } from './fleet'
import { pose, yawOf } from './kit'
import { BEAM, GAP, GATE, SLED, V0, cruiseAt, frameAt, pointAt, zoneAt } from './maglev/course'
import type { Course } from './maglev/course'
import { guidewayPieces, makeRig, shockMatrix } from './maglev/rig'
import type { Rig, Sled } from './maglev/rig'
import { GAP_U } from './maglev.data'

type Tones = { hot: Color; warm: Color; cold: Color; fade: Color; dark: boolean; gate: Ramp; brake: Ramp }

const w = { p: new Vector3(), t: new Vector3(), u: new Vector3(), s: new Vector3(), k: new Vector3(), m: new Matrix4(), col: new Color() }
const ground = () => 0
const eye = new Vector3()
const approach = (k: number, target: number, dt: number, rate: number) => lerp(k, target, damp(dt, reducedMotion ? rate * 2.5 : rate))

/** Hands every carried part a sled and lets sleds whose part has left power down. */
function bind(rig: Rig, sim: Sim) {
  for (const sl of rig.sleds) if (sl.state === 'ride' && (!sl.part || !sim.carried.includes(sl.part))) {
    sl.state = 'fade'
    sl.part = null
  }
  for (const p of sim.carried) {
    let mine = false
    for (const sl of rig.sleds) if (sl.part === p) mine = true
    if (mine) continue
    let pick: Sled | null = null
    for (const sl of rig.sleds) {
      if (sl.state === 'free') { pick = sl; break }
      if (sl.state === 'fade' && (!pick || sl.k < pick.k)) pick = sl
    }
    if (!pick) continue
    pick.state = 'ride'
    pick.part = p
    pick.s = pick.prev = 0
    pick.v = 0
    pick.k = 0
    pick.lifted = pick.arrived = false
    pick.t0 = sim.time
    pointAt(rig.course, 0, pick.pos)
  }
}

/** The boom where the launch tops out: a kick to the whole scene, a shock collar round the sled and a pressure wave across the floor. */
function boom(rig: Rig, sl: Sled, sim: Sim) {
  play('toss')
  const strong = sim.time - rig.kickAt > 1.6
  kick(strong ? 0.8 : 0.3, 7)
  rig.kickAt = sim.time
  rig.kicks++
  if (reducedMotion) return
  const c = rig.course
  let shock = rig.shockList[0]
  for (const s of rig.shockList) if (s.t < 0 || s.t > shock.t) shock = s
  shock.t = 0
  pointAt(c, sl.s, shock.at)
  frameAt(c, 'up', sl.s, shock.x)
  frameAt(c, 'side', sl.s, shock.y)
  frameAt(c, 'tan', sl.s, shock.z)
  shock.at.addScaledVector(shock.x, 0.25)
  let wave = rig.waves[0]
  for (const v of rig.waves) if (v.t < 0 || v.t > wave.t) wave = v
  wave.t = 0
  wave.x = shock.at.x
  wave.z = shock.at.z
}

/** Sparks off both brake fin rows as a sled hits the eddy brakes at speed. */
function brake(rig: Rig, sl: Sled) {
  play('drawer')
  if (reducedMotion) return
  const c = rig.course
  frameAt(c, 'tan', sl.s, w.t)
  frameAt(c, 'side', sl.s, w.s)
  for (const sign of [-1, 1]) {
    w.p.copy(sl.pos).addScaledVector(w.s, sign * (BEAM.w / 2 + 0.08))
    w.p.y -= SLED.h + GAP * 0.6
    w.u.copy(w.t).multiplyScalar(-0.7).addScaledVector(w.s, sign * 0.5)
    w.u.y = 0.6
    rig.sparks.burst(18, w.p.x, w.p.y, w.p.z, w.u.x, w.u.y, w.u.z, [3, 8], 0.5, [0.25, 0.6])
  }
}

const crossed = (sl: Sled, mark: number) => sl.prev < mark && sl.s >= mark
const riding = (sl: Sled) => sl.state === 'ride' && !!sl.part && !sl.part.fly

function events(rig: Rig, sl: Sled, sim: Sim) {
  const at = rig.course.at
  if (!sl.lifted && sl.s > 0.15) {
    sl.lifted = true
    sl.t0 = sim.time
    play('chirp')
  }
  if (crossed(sl, at.launch)) {
    play('zap')
    kick(0.18, 19)
  }
  if (crossed(sl, at.tunnel)) boom(rig, sl, sim)
  if (crossed(sl, at.brake)) brake(rig, sl)
  if (!sl.arrived && sl.s >= rig.course.len - 0.01) {
    sl.arrived = true
    play('tick')
    rig.rides.push(+(sim.time - sl.t0).toFixed(2))
    if (rig.rides.length > 8) rig.rides.shift()
  }
}

/** Moves the sleds and repaints every coil, ring, trail and glow for one frame. Runs in the frame loop only. */
function stepRig(rig: Rig, sim: Sim, path: Path, dt: number, tone: Tones, eye: Vector3) {
  const c = rig.course
  bind(rig, sim)
  for (let i = 0; i < rig.sleds.length; i++) {
    const sl = rig.sleds[i]
    if (sl.state === 'ride' && sl.part) {
      const p = sl.part
      sl.prev = sl.s
      sl.s = p.fly ? 0 : path.along(p.u)
      sl.v = p.fly ? 0 : c.rate(sl.s) * V0
      rig.vmax = Math.max(rig.vmax, sl.v)
      if (!p.fly) events(rig, sl, sim)
      sl.k = approach(sl.k, 1, dt, p.fly ? 3 : 6)
      pointAt(c, sl.s, sl.pos)
      sl.yaw = yawOf(frameAt(c, 'tan', sl.s, w.t))
    } else if (sl.state === 'fade') {
      sl.k = approach(sl.k, 0, dt, 4)
      sl.pos.y -= dt * 0.25
      if (sl.k < 0.03) sl.state = 'free'
    }
    if (sl.state === 'free') {
      rig.sled.set(i, hidden)
      continue
    }
    w.p.copy(sl.pos)
    w.p.y -= SLED.h + (1 - sl.k) * 0.3
    pose(w.m, w.p, sl.yaw, 0, w.k.setScalar(Math.max(0.001, sl.k)))
    rig.sled.set(i, w.m)
  }
  rig.sled.commit()

  const gateDecay = Math.exp(-dt * (reducedMotion ? 10 : 4.5))
  for (let i = 0; i < rig.charge.length; i++) rig.charge[i] *= gateDecay
  const padDecay = Math.exp(-dt * 6), finDecay = Math.exp(-dt * (reducedMotion ? 3 : 1.1))
  for (let i = 0; i < rig.heat.length; i++) rig.heat[i] *= i < rig.pads ? padDecay : finDecay
  for (const sl of rig.sleds) {
    if (!riding(sl)) continue
    const lead = clamp(0.8 + sl.v * 0.12, 0.8, 2.8)
    for (let i = 0; i < c.gates.length; i++) {
      const d = c.gates[i] - sl.s
      if (d > -0.6 && d < lead) rig.charge[i] = 1
    }
    const i0 = Math.max(0, Math.ceil((sl.s - 1.1) / 0.5)), i1 = Math.min(rig.pads - 1, Math.floor((sl.s + 0.1) / 0.5))
    for (let i = i0; i <= i1; i++) rig.heat[i] = 1
    const fins = (rig.heat.length - rig.pads) / 2
    const j0 = Math.max(0, Math.ceil((sl.s - 0.8 - c.at.brake) / 0.42)), j1 = Math.min(fins - 1, Math.floor((sl.s + 0.3 - c.at.brake) / 0.42))
    const bite = clamp((sl.v - V0) / 8, 0, 1)
    for (let j = j0; j <= j1; j++) {
      const hot = Math.max(rig.heat[rig.pads + j * 2], bite)
      rig.heat[rig.pads + j * 2] = rig.heat[rig.pads + j * 2 + 1] = hot
    }
  }
  let dirty = false
  for (let i = 0; i < rig.charge.length; i++) {
    if (rig.charge[i] < 0.01) rig.charge[i] = 0
    if (Math.abs(rig.charge[i] - rig.lit[i]) < 0.01) continue
    rig.lit[i] = rig.charge[i]
    rig.gates.setColorAt(i, heatColor(rig.charge[i], tone.gate, w.col))
    dirty = true
  }
  if (dirty && rig.gates.instanceColor) rig.gates.instanceColor.needsUpdate = true
  dirty = false
  for (let i = 0; i < rig.heat.length; i++) {
    if (rig.heat[i] < 0.01) rig.heat[i] = 0
    if (Math.abs(rig.heat[i] - rig.shown[i]) < 0.012) continue
    rig.shown[i] = rig.heat[i]
    if (i < rig.pads) w.col.copy(tone.cold).lerp(tone.warm, rig.heat[i])
    else heatColor(rig.heat[i], tone.brake, w.col)
    rig.coils.setColorAt(i, w.col)
    dirty = true
  }
  if (dirty && rig.coils.instanceColor) rig.coils.instanceColor.needsUpdate = true

  rig.trails.setGlow(tone.dark)
  rig.trails.begin()
  for (const sl of rig.sleds) {
    if (!riding(sl) || sl.v < 5) continue
    rig.trails.add(c, sl.s, Math.min(13, sl.v * 0.55), 0.24, smoothstep((sl.v - 5) / 7) * 0.85, tone.hot, tone.warm, eye)
  }
  rig.trails.end()

  const glows = rig.glows
  glows.setGlow(tone.dark)
  glows.begin()
  for (const sl of rig.sleds) {
    if (sl.state === 'free') continue
    glows.add(sl.pos.x, sl.pos.y - SLED.h - GAP * 0.5, sl.pos.z, 0.55 + sl.v * 0.03, sl.v > 6 ? tone.hot : tone.warm, 0.4 * sl.k)
  }
  for (let i = 0; i < c.gates.length; i++) {
    if (rig.charge[i] < 0.08) continue
    pointAt(c, c.gates[i], w.p).setY(cruiseAt(c, c.gates[i]))
    w.p.addScaledVector(frameAt(c, 'up', c.gates[i], w.u), GATE.lift)
    glows.add(w.p.x, w.p.y, w.p.z, GATE.r * 1.1, tone.hot, 0.2 * rig.charge[i])
  }
  for (const v of rig.waves) {
    if (v.t < 0) continue
    v.t += dt
    if (v.t > 0.9) { v.t = -1; continue }
    glows.add(v.x, 0.03, v.z, 0.6 + v.t * 18, tone.hot, 0.45 * (1 - v.t / 0.9) ** 2, true)
  }
  glows.end()

  const mat = rig.shocks.material as MeshBasicMaterial
  const blend = tone.dark ? AdditiveBlending : NormalBlending
  if (mat.blending !== blend) { mat.blending = blend; mat.needsUpdate = true }
  let n = 0
  for (const s of rig.shockList) {
    if (s.t < 0) continue
    s.t += dt
    if (s.t > 0.6) { s.t = -1; continue }
    rig.shocks.setMatrixAt(n, shockMatrix(w.m, s, 1.1 + s.t * 7))
    rig.shocks.setColorAt(n, w.col.copy(tone.hot).lerp(tone.fade, s.t / 0.6))
    n++
  }
  rig.shocks.count = n
  rig.shocks.visible = n > 0
  if (n) {
    rig.shocks.instanceMatrix.needsUpdate = true
    if (rig.shocks.instanceColor) rig.shocks.instanceColor.needsUpdate = true
  }

  rig.sparks.setGlow(tone.dark)
  if (rig.sparks.busy) rig.sparks.step(dt, ground, tone.brake)
  rig.sparks.object.visible = rig.sparks.busy
}

/** True while anything moves without the sim: a sled sinking away, sparks, a shock collar, a floor wave, a coil or fin cooling. */
function settling(rig: Rig) {
  if (rig.sparks.busy || rig.shocks.count > 0) return true
  for (const sl of rig.sleds) if (sl.state !== 'free') return true
  for (const v of rig.waves) if (v.t >= 0) return true
  for (const k of rig.charge) if (k > 0) return true
  for (const k of rig.heat) if (k > 0) return true
  return false
}

/** Writes riders, the lead sled's zone, recent ride times, top speed and kicks onto the canvas as `data-maglev`, four times a second. */
function report(rig: Rig, sim: Sim, canvas: HTMLCanvasElement) {
  if (sim.time < rig.reportAt) return
  rig.reportAt = sim.time + 0.25
  let riding = 0, lead: Sled | null = null
  for (const sl of rig.sleds) if (sl.state === 'ride') {
    riding++
    if (!lead || sl.s > lead.s) lead = sl
  }
  const c = rig.course
  canvas.dataset.maglev = JSON.stringify({ riding, lead: lead ? zoneAt(c, lead.s) : null, rides: rig.rides, vmax: +rig.vmax.toFixed(1), kicks: rig.kicks, len: +c.len.toFixed(1) })
}

export function Maglev({ sim, line, c }: TransportProps<Course>) {
  const course = line.path.data
  const pieces = guidewayPieces(course)
  const sleds = Math.ceil(line.path.length / GAP_U) + 4
  const rig = useDisposable(() => makeRig(course, sleds), [course, sleds])
  useLayoutEffect(() => {
    rig.sled.skin(fillMat(c.surface, c.flat, c.rough), lineMat(c.edge))
    rig.lit.fill(-1)
    rig.shown.fill(-1)
  }, [rig, c])
  const hot = contrastOn(c.floor, c.spark, c.lit, c.accent)
  const dark = isDark(c)
  const tone: Tones = {
    hot: new Color(hot), warm: new Color(c.accent), cold: new Color(c.dim), fade: dark ? new Color(0, 0, 0) : new Color(c.floor), dark,
    gate: ramp(hot, c.accent, c.dim), brake: ramp(hot, c.lit, c.dim),
  }
  useFrame(({ gl, camera }, delta) => {
    const path = line.path
    if (!path) return
    const at = sim.at.transport
    stepRig(rig, sim, path, Math.min(delta, 0.05), tone, eye.copy(camera.position).sub(w.p.set(at.x, at.y, at.z)))
    report(rig, sim, gl.domElement)
    if (settling(rig)) keepAnimating()
  })
  return (
    <group>
      <Body id={course.id} c={c} fill={c.surface} edge={c.edge} pieces={pieces} />
      <primitive object={rig.coils} />
      <primitive object={rig.gates} />
      <primitive object={rig.sled.mesh} />
      <primitive object={rig.sled.lines!} />
      <primitive object={rig.trails.mesh} />
      <primitive object={rig.glows.object} />
      <primitive object={rig.shocks} />
      <primitive object={rig.sparks.object} />
    </group>
  )
}

