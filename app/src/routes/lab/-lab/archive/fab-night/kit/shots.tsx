/**
 * The camera as a shot list. Every journey stage of the newest part maps to
 * one named shot; Iso blends between them, Trailer cuts. The power-up has its
 * own slow push-in, the aisle focus its own frame, and a drag, pinch or wheel
 * hands the camera to the user until double-click or the next add. Wide
 * frames fit the line inside the viewport minus pixel insets, so panels and
 * the embedded Install bar never cover it; a tall viewport turns the line to
 * run down the frame.
 */
import { PerspectiveCamera, Vector3 } from 'three'

import type { Lab } from '../../../lab.types'
import { BASE, BELT, BOARD, CPU, DRAWER, REDUCED_MOTION, clamp, damp } from './contract'
import type { WorldId } from './contract'
import { POWER_TOTAL } from './power'
import { idleLoops, slotPos } from './sim'
import type { Part, Sim } from './sim'

export type Rig = 'iso' | 'trailer'
export type Follow = 'off' | 'shots'
export type Stage = 'PICKUP' | 'TRACKING DOLLY' | 'LOW ANGLE HERO' | 'OVERHEAD PUSH-IN' | 'PULL-OUT REVEAL'
type Idle = 'WIDE ESTABLISHING' | 'CABINET PUSH-IN' | 'BOARD ORBIT' | 'DOWN THE LINE' | 'DRONE POV'
export const LENS: Record<Stage | Idle | 'POWER-UP', string> = {
  'WIDE ESTABLISHING': '35mm', 'CABINET PUSH-IN': '50mm', 'BOARD ORBIT': '40mm', 'DOWN THE LINE': '28mm', 'DRONE POV': '18mm',
  PICKUP: '85mm', 'TRACKING DOLLY': '50mm', 'LOW ANGLE HERO': '24mm', 'OVERHEAD PUSH-IN': '100mm', 'PULL-OUT REVEAL': '40mm', 'POWER-UP': '32mm',
}
const IDLES: readonly Idle[] = ['WIDE ESTABLISHING', 'CABINET PUSH-IN', 'BOARD ORBIT', 'DOWN THE LINE', 'DRONE POV']

/** Pixels the host chrome covers on each side of the viewport. */
export type Inset = { top: number; bottom: number; left: number; right: number }
type Pose = { pos: Vector3; look: Vector3; fov: number; roll: number }
export type Cam = {
  rig: Rig
  follow: Follow
  world: WorldId
  inset: Inset
  orbit: { az: number; el: number; zoom: number }
  manual: boolean
  seenAdd: number
  pose: Pose
  ready: boolean
  /** True once the pose has reached its target, so the frameloop can rest. */
  settled: boolean
  focusUntil: number
  shotKey: string
  shotT: number
  idleShot: number
  lastPick: number
  revealUntil: number
  mode: string
}

export function createCam(): Cam {
  return {
    rig: 'iso', follow: 'shots', world: 'night', inset: { top: 0, bottom: 0, left: 0, right: 0 }, orbit: { az: 0, el: 0, zoom: 1 }, manual: false, seenAdd: 0,
    pose: { pos: new Vector3(30, 20, 30), look: new Vector3(), fov: 22, roll: 0 },
    ready: false, settled: false, focusUntil: 0, shotKey: '', shotT: 0, idleShot: 0, lastPick: -99, revealUntil: -99, mode: 'OVERVIEW',
  }
}

const rad = (d: number) => (d * Math.PI) / 180
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const LENS_BY_WORLD: Record<WorldId, { fov: number; el: number; frame: number }> = {
  night: { fov: 22, el: 26, frame: 1.0 },
  cleanroom: { fov: 18, el: 30, frame: 1.04 },
}
/** Landscape looks along the line from its front-right; portrait swings round to look down the line so it fills a tall frame. */
const AZ = { landscape: rad(32), portrait: rad(68) }
const PORTRAIT_LIFT = rad(12)
export const isPortrait = (size: { width: number; height: number }) => size.height > size.width * 1.1

const FACTORY = [
  [-10.7, 0, -3.4], [-10.7, 4.6, -3.4], [-4.1, 4.6, -3.4], [-10.7, 0, 4.6], [-10.6, 0.9, -0.1], [-4, 0.9, 4.6], [-4, 0, 4.6],
  [BOARD.x0, BOARD.y, BOARD.z1], [BOARD.x1, 0, BOARD.z0], [BOARD.x1, 0, BOARD.z1], [BOARD.x1, BOARD.y, BOARD.z0], [BASE.x, 7.6, BASE.z], [10.6, 4.4, -0.3], [1.8, 0, 2.4],
].map(([x, y, z]) => new Vector3(x, y, z))
const PICK = [[-10.7, 0, -3.4], [-10.7, 4.8, -3.4], [-3.8, 4.8, -3.4], [-10.7, 0, 4.7], [-3.8, 0, 4.7], [-1.5, 0.9, 1.6]].map(([x, y, z]) => new Vector3(x, y, z))
const BOARD_C = new Vector3((BOARD.x0 + BOARD.x1) / 2, BOARD.y, (BOARD.z0 + BOARD.z1) / 2)
const CPU_C = new Vector3(CPU.x, BOARD.y, CPU.z)
const CABINET_C = new Vector3(DRAWER.x0 + DRAWER.gapX, 2.4, DRAWER.front - 1)

const dirOf = (az: number, el: number, out: Vector3) => out.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el))
const right = new Vector3()
const up = new Vector3()
const dir = new Vector3()
const proj = new Vector3()
const probe = new PerspectiveCamera()

/**
 * Frames `pts` from (az, el) at `fov` inside the viewport minus `inset`
 * pixels, then corrects twice from the projected bounds so perspective
 * does not push the far end of the line under a panel.
 */
function fit(pts: Vector3[], az: number, el: number, fov: number, size: { width: number; height: number }, inset: Inset, margin: number, out: Pose) {
  const w = Math.max(80, size.width - inset.left - inset.right), h = Math.max(80, size.height - inset.top - inset.bottom)
  dirOf(az, el, dir)
  right.set(Math.cos(az), 0, -Math.sin(az))
  up.crossVectors(dir, right)
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
  for (const p of pts) {
    x0 = Math.min(x0, p.dot(right)); x1 = Math.max(x1, p.dot(right))
    y0 = Math.min(y0, p.dot(up)); y1 = Math.max(y1, p.dot(up))
  }
  const t = Math.tan(rad(fov) / 2)
  const dist = Math.max((((y1 - y0) / 2) * margin * size.height) / (t * h), (((x1 - x0) / 2) * margin * size.height) / (t * w)) + 3
  out.look.copy(right).multiplyScalar((x0 + x1) / 2).addScaledVector(up, (y0 + y1) / 2)
  out.pos.copy(out.look).addScaledVector(dir, dist)
  out.fov = fov
  out.roll = 0
  probe.fov = fov
  probe.aspect = size.width / size.height
  probe.updateProjectionMatrix()
  for (let pass = 0; pass < 2; pass++) {
    probe.position.copy(out.pos)
    probe.up.set(0, 1, 0)
    probe.lookAt(out.look)
    probe.updateMatrixWorld()
    let px0 = Infinity, px1 = -Infinity, py0 = Infinity, py1 = -Infinity
    for (const p of pts) {
      proj.copy(p).project(probe)
      const x = ((proj.x + 1) / 2) * size.width, y = ((1 - proj.y) / 2) * size.height
      px0 = Math.min(px0, x); px1 = Math.max(px1, x); py0 = Math.min(py0, y); py1 = Math.max(py1, y)
    }
    const here = out.pos.distanceTo(out.look)
    const next = here * Math.max(((px1 - px0) * margin) / w, ((py1 - py0) * margin) / h)
    const perPx = (2 * here * t) / size.height
    const cx = (px0 + px1) / 2 - (inset.left + w / 2), cy = (py0 + py1) / 2 - (inset.top + h / 2)
    out.look.addScaledVector(right, cx * perPx).addScaledVector(up, -cy * perPx)
    out.pos.copy(out.look).addScaledVector(dir, next)
  }
  return out
}

const want: Pose = { pos: new Vector3(), look: new Vector3(), fov: 22, roll: 0 }
const tmp = new Vector3()
const side = new Vector3()

export function stageOf(sim: Sim, p: Part | null, lab: Lab, cam: Cam): Stage | null {
  if (!p || !lab.selected.has(p.item.ref)) return null
  if (p.mode === 'queued' || (p.fly && p.fly.then === 'belt')) return 'PICKUP'
  if (p.mode === 'belt') return 'TRACKING DOLLY'
  if (p.mode === 'held') return 'LOW ANGLE HERO'
  if (p.mode === 'board' && sim.seat?.part === p) {
    const since = sim.time - sim.seat.t
    if (since < 1.5) return 'OVERHEAD PUSH-IN'
    if (since < 4.2 && (sim.time < cam.revealUntil || since < 1.6)) return 'PULL-OUT REVEAL'
  }
  return null
}

/** Time windows the camera is waiting out; frames keep coming until they close, even when nothing else moves. */
export const camPending = (cam: Cam, sim: Sim) =>
  sim.time < cam.focusUntil || sim.time - cam.lastPick < 1.4 || (!!sim.seat && sim.time - sim.seat.t < 4.2 && (sim.time < cam.revealUntil || sim.time - sim.seat.t < 1.6))

/** Shot poses keyed by stage. `t` is seconds since the cut, the slow moves live here. */
const SHOTS: Record<Stage, (p: Part, sim: Sim, t: number, out: Pose) => void> = {
  PICKUP: (p, _sim, t, out) => {
    out.look.copy(p.pos)
    out.pos.copy(p.pos).add(tmp.set(2.2 - t * 0.3, 1.0 + t * 0.15, 2.6))
    out.fov = 30
  },
  'TRACKING DOLLY': (p, _sim, _t, out) => {
    out.pos.set(p.pos.x - 3.4, 1.9, BELT.z + 5.2)
    out.look.copy(p.pos).add(tmp.set(1.6, 0.1, 0))
    out.fov = 34
  },
  'LOW ANGLE HERO': (_p, sim, _t, out) => {
    out.pos.set(BASE.x + 3.4, 0.5, BASE.z + 5.8)
    out.look.copy(sim.arm.pos).lerp(tmp.set(BASE.x, 3, BASE.z), 0.3)
    out.fov = 60
    out.roll = 0.06
  },
  'OVERHEAD PUSH-IN': (p, _sim, t, out) => {
    slotPos(p.slot ?? { x: p.pos.x, z: p.pos.z, s: 1, band: 0 }, p.size[1], tmp)
    out.look.copy(tmp)
    out.pos.copy(tmp).add(side.set(0.4, 6.4 - t * 1.2, 1.4))
    out.fov = 24
  },
  'PULL-OUT REVEAL': (p, _sim, t, out) => {
    const e = ease(clamp(t / 2.6, 0, 1))
    slotPos(p.slot ?? { x: p.pos.x, z: p.pos.z, s: 1, band: 0 }, p.size[1], tmp)
    out.look.lerpVectors(tmp, BOARD_C, e)
    const a = 0.9 + e * 0.5
    out.pos.copy(out.look).add(side.set(Math.cos(a) * (2.6 + e * 9.5), 1.6 + e * 7.5, Math.sin(a) * (2.6 + e * 9.5)))
    out.fov = 30 + e * 6
  },
}

type Size = { width: number; height: number }
const IDLE_POSES: Record<Idle, (sim: Sim, t: number, size: Size, cam: Cam, out: Pose) => void> = {
  'WIDE ESTABLISHING': (_sim, t, size, cam, out) => fit(FACTORY, rad(70) - t * 0.05, rad(16) + t * 0.02, 24, size, cam.inset, 1, out),
  'CABINET PUSH-IN': (_sim, t, _size, _cam, out) => {
    const e = ease(Math.min(1, t / 4.6))
    out.pos.set(-1 - e * 2.4, 3.4 - e * 0.6, 7.2 - e * 2.4)
    out.look.copy(CABINET_C)
    out.fov = 34
  },
  'BOARD ORBIT': (_sim, t, _size, _cam, out) => {
    const a = 0.4 + t * 0.12
    out.pos.copy(BOARD_C).add(tmp.set(Math.cos(a) * 9, 5.2, Math.sin(a) * 9))
    out.look.copy(BOARD_C)
    out.fov = 32
  },
  'DOWN THE LINE': (_sim, t, _size, _cam, out) => {
    out.pos.set(3.2 + t * 0.15, 1.25, 4.2)
    out.look.set(-6, 1.7, 0.4)
    out.fov = 40
    out.roll = 0.12
  },
  'DRONE POV': (sim, _t, _size, _cam, out) => {
    out.pos.copy(sim.drone.pos).add(tmp.set(0, 0.35, 0))
    out.look.copy(CPU_C).lerp(sim.drone.pos, 0.2)
    out.look.y = 0
    out.fov = 66
  },
}

/** Close-ups were composed for a wide frame; a tall one backs the camera off so the subject keeps its width. */
function widen(out: Pose, aspect: number) {
  const k = clamp(Math.pow(1.4 / aspect, 0.8), 1, 2.4)
  if (k > 1) out.pos.sub(out.look).multiplyScalar(k).add(out.look)
}

/** One camera update, run after the sim step each frame. */
export function runCamera(
  cam: Cam,
  sim: Sim,
  L: Lab,
  size: Size,
  camera: PerspectiveCamera,
  rawDt: number,
  onCut: (name: string, lens: string) => void,
  onAdd: (p: Part) => void,
) {
  const dt = Math.min(rawDt, 0.1)
  const aspect = size.width / Math.max(1, size.height)
  const portrait = isPortrait(size)
  const lens = LENS_BY_WORLD[cam.world]
  const az = portrait ? AZ.portrait : AZ.landscape
  const el = rad(lens.el) + (portrait ? PORTRAIT_LIFT : 0)
  const p = sim.latest
  if (sim.addSeq !== cam.seenAdd) {
    cam.seenAdd = sim.addSeq
    cam.manual = false
    if (p) onAdd(p)
  }
  const picking = sim.time - cam.lastPick < 1.4
  const stage = REDUCED_MOTION || picking || cam.follow === 'off' ? null : stageOf(sim, p, L, cam)
  if (stage === 'OVERHEAD PUSH-IN') cam.revealUntil = sim.time + 4
  let rate = 2.4
  let snap = false

  if (sim.power.active && !cam.manual) {
    const e = clamp(sim.power.t / POWER_TOTAL, 0, 1)
    fit(FACTORY, az + (1 - e) * rad(26), el - (1 - e) * rad(14), lens.fov + (1 - e) * 8, size, cam.inset, 1.06, want)
    cam.mode = 'POWER-UP'
    rate = 1.6
  } else if (cam.rig === 'trailer' && !cam.manual) {
    if (stage || idleLoops(sim)) cam.shotT += dt
    let key = stage ? `${stage}:${sim.addSeq}` : `idle:${cam.idleShot}`
    if (!stage && cam.shotT > 4.6 && cam.shotKey.startsWith('idle') && !REDUCED_MOTION) {
      cam.idleShot = (cam.idleShot + 1) % (L.setup.agent === 'none' ? 4 : 5)
      key = `idle:${cam.idleShot}`
    }
    if (key !== cam.shotKey) {
      cam.shotKey = key
      cam.shotT = 0
      snap = true
      const name = stage ?? IDLES[cam.idleShot]
      onCut(name, LENS[name])
    }
    want.roll = 0
    if (stage && p) SHOTS[stage](p, sim, cam.shotT, want)
    else IDLE_POSES[IDLES[cam.idleShot]](sim, cam.shotT, size, cam, want)
    if (portrait) widen(want, aspect)
    rate = 5
    cam.mode = `TRAILER · ${stage ?? IDLES[cam.idleShot]}`
  } else if (stage && p && !cam.manual) {
    const key = `${stage}:${sim.addSeq}`
    if (key !== cam.shotKey) {
      cam.shotKey = key
      cam.shotT = 0
    }
    cam.shotT += dt
    want.roll = 0
    SHOTS[stage](p, sim, cam.shotT, want)
    const queue = sim.feed.length + sim.belt.length
    if (queue > 2 && stage !== 'PULL-OUT REVEAL') {
      want.pos.sub(want.look).multiplyScalar(1 + Math.min(queue, 6) * 0.14).add(want.look)
      want.fov += 6
    }
    if (portrait) widen(want, aspect)
    rate = stage === 'PULL-OUT REVEAL' ? 1.8 : 3.0
    cam.mode = queue > 2 ? `${stage} · WIDE (${queue} QUEUED)` : stage
  } else if (sim.time < cam.focusUntil && !cam.manual) {
    fit(PICK, az + cam.orbit.az, el + rad(4) + cam.orbit.el, Math.max(lens.fov, 16), size, cam.inset, 1.02, want)
    cam.mode = 'AISLE FOCUS'
  } else {
    fit(FACTORY, az + cam.orbit.az, el + cam.orbit.el, lens.fov, size, cam.inset, lens.frame, want)
    want.pos.sub(want.look).multiplyScalar(cam.orbit.zoom).add(want.look)
    cam.mode = cam.manual ? 'MANUAL · ORBIT' : 'OVERVIEW'
    cam.shotKey = ''
  }

  const k = snap || !cam.ready || REDUCED_MOTION ? 1 : damp(dt, rate)
  cam.ready = true
  cam.pose.pos.lerp(want.pos, k)
  cam.pose.look.lerp(want.look, k)
  cam.pose.fov += (want.fov - cam.pose.fov) * k
  cam.pose.roll += (want.roll - cam.pose.roll) * k
  const far =
    cam.pose.pos.distanceToSquared(want.pos) > 1e-6 || cam.pose.look.distanceToSquared(want.look) > 1e-6 || Math.abs(want.fov - cam.pose.fov) > 1e-3 || Math.abs(want.roll - cam.pose.roll) > 1e-4
  if (!far) {
    cam.pose.pos.copy(want.pos)
    cam.pose.look.copy(want.look)
    cam.pose.fov = want.fov
    cam.pose.roll = want.roll
  }
  cam.settled = !far
  camera.position.copy(cam.pose.pos)
  camera.up.set(0, 1, 0)
  camera.lookAt(cam.pose.look)
  if (cam.pose.roll) camera.rotateZ(cam.pose.roll)
  camera.fov = cam.pose.fov
  camera.near = cam.pose.fov > 60 ? 0.05 : 0.2
  camera.updateProjectionMatrix()
}

/** The HUD line: the shot name and a stills-photographer focal length for the current fov. */
export const hudText = (cam: Cam) => `${cam.mode} · ${Math.round(12 / Math.tan(rad(cam.pose.fov) / 2))}mm`
