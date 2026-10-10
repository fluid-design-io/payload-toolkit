import { PerspectiveCamera, Vector3 } from 'three'

import { CELL, DOCK, HANGAR, HOME, INTAKE, KIT_PAD, PAD, PORT, SILO_TOP, STORE_HOME, STORE_PAD, inFlight, slotAt, subject } from './sim'
import type { Part, Sim, Swap, Unit } from './sim'

export type Rig = 'iso' | 'crane' | 'hangar'
export type Follow = 'off' | 'part' | 'machine' | 'both'
/** Pixels on each side of the viewport that overlays cover, so framing keeps them empty. */
export type Inset = { top: number; bottom: number; left: number; right: number }

type Pose = { pos: Vector3; look: Vector3; fov: number }

export type Cam = {
  rig: Rig
  follow: Follow
  orbit: { az: number; el: number; zoom: number }
  manual: boolean
  seenAdd: number
  dir: Vector3
  last: Vector3
  pose: Pose
  ready: boolean
  craneT: number
  focusUntil: number
  lastPick: number
  mode: string
  inset: Inset
  /** True once the pose has reached its target, so the frame loop can rest. */
  settled: boolean
  swap: { of: Swap; pts: Vector3[] } | null
}

export function createCam(): Cam {
  return {
    rig: 'iso', follow: 'both', orbit: { az: 0, el: 0, zoom: 1 }, manual: false, seenAdd: 0,
    dir: new Vector3(1, 0, 0), last: new Vector3(), pose: { pos: new Vector3(30, 20, 30), look: new Vector3(), fov: 20 },
    ready: false, craneT: 99, focusUntil: 0, lastPick: -99, mode: 'OVERVIEW', inset: { top: 0, bottom: 0, left: 0, right: 0 }, settled: false, swap: null,
  }
}

const rad = (d: number) => (d * Math.PI) / 180
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const v = (x: number, y: number, z: number) => new Vector3(x, y, z)
export const isPortrait = (size: { width: number; height: number }) => size.height > size.width * 1.1
/** Landscape looks along the line from its front-right; portrait turns to look down the line so it fills a tall frame. */
const VIEW = { landscape: { az: rad(32), el: rad(33) }, portrait: { az: rad(78), el: rad(50) } }
const ISO_FOV = 13

const FLOOR = [
  v(-10.8, 0, -3.4), v(-10.8, 4.6, -3.4), v(-10.8, 0, 4.7), v(-4, 0, 4.7), v(CELL.x + 4.5, 0, CELL.z - 3.6), v(CELL.x + 4.5, 0, CELL.z + 3.6),
  v(STORE_HOME.x + 1, 3.4, STORE_HOME.z), v(STORE_HOME.x + 1.2, 0, STORE_HOME.z + 0.6), v(HANGAR.x0, 0, HANGAR.z0), v(HANGAR.x1 + 0.3, 3.0, HANGAR.z0), v(HOME.drone.x, 5.4, HOME.drone.z),
]
/** The deployed arm's raised elbow; the title block on the floor, which portrait drops so the machines get a phone's width. */
const ELBOW = v(HOME.arm.x, 8, HOME.arm.z)
const TITLE = v(-2.4, 0, 8.6)
const FACTORY = { wide: [...FLOOR, TITLE], wideArm: [...FLOOR, TITLE, ELBOW], tall: FLOOR, tallArm: [...FLOOR, ELBOW] }
const factory = (sim: Sim, portrait: boolean) => FACTORY[`${portrait ? 'tall' : 'wide'}${sim.rig.integrator === 'arm' ? 'Arm' : ''}` as keyof typeof FACTORY]
const LINE = [v(DOCK.x - 1, 0, DOCK.z - 1.4), v(INTAKE.x + 1, 0, INTAKE.z + 1.4), SILO_TOP.clone(), v(CELL.x - 2, 0, CELL.z - 3), v(CELL.x + 4.5, 0, CELL.z + 3.5), v(CELL.x + 4.5, 0, CELL.z - 3.5)]
const PICK = [v(-10.8, 0, -3.4), v(-10.8, 4.8, -3.4), v(-3.8, 4.8, -3.4), v(-10.8, 0, 4.7), v(-3.8, 0, 4.7), v(-1.5, 0.9, 1.7)]
const HANGAR_PTS = [v(HANGAR.x0, 0, HANGAR.z0), v(HANGAR.x1, 0, HANGAR.z0), v(HANGAR.x0, 3.2, HANGAR.z0), v(HANGAR.x1, 3.2, HANGAR.z0), v(HANGAR.x0, 0, HANGAR.z1 + 1.6), v(HANGAR.x1, 0, HANGAR.z1 + 1.6)]
const BOARD_PTS = [v(CELL.x - 4.6, 0, CELL.z - 3.7), v(CELL.x + 4.6, 0, CELL.z - 3.7), v(CELL.x - 4.6, 0, CELL.z + 3.7), v(CELL.x + 4.6, 0, CELL.z + 3.7), v(CELL.x, 2.2, CELL.z)]

function swapPoints(e: Swap) {
  if (e.slot === 'integrator') return [...HANGAR_PTS, HOME[e.to as keyof typeof HOME].clone().setY(0), PAD[e.from as keyof typeof PAD]]
  if (e.slot === 'transport') return [...LINE.slice(0, 3), KIT_PAD[e.to as keyof typeof KIT_PAD], v(DOCK.x, 5, DOCK.z)]
  if (e.slot === 'storage') return [STORE_HOME.clone().setY(3.6), STORE_PAD[e.to as keyof typeof STORE_PAD], STORE_PAD[e.from as keyof typeof STORE_PAD], PORT.clone(), v(STORE_HOME.x, 0, STORE_HOME.z + 2)]
  return BOARD_PTS
}

const dirOf = (az: number, el: number, out: Vector3) => out.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el))
const right = new Vector3()
const up = new Vector3()
const dir = new Vector3()
const proj = new Vector3()
const center = new Vector3()
const probe = new PerspectiveCamera()

/**
 * Frames `pts` from (az, el) at `fov` inside the viewport minus `inset`
 * pixels on each side, then corrects twice against the real projection so a
 * reserved band (the Install bar, a chip row, the Director) stays clear.
 */
function fit(pts: readonly Vector3[], az: number, el: number, fov: number, size: { width: number; height: number }, inset: Inset, margin: number, out: Pose) {
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
  center.copy(right).multiplyScalar((x0 + x1) / 2).addScaledVector(up, (y0 + y1) / 2)
  out.look.copy(center)
  out.pos.copy(center).addScaledVector(dir, dist)
  out.fov = fov
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

const want: Pose = { pos: new Vector3(), look: new Vector3(), fov: 20 }
const tmp = new Vector3()
const side = new Vector3()

/**
 * One camera update, run by the frame loop right after the sim step. Under
 * reduced motion (`sim.motion` < 1) nothing follows and every cut is instant.
 */
export function runCamera(cam: Cam, sim: Sim, size: { width: number; height: number }, camera: PerspectiveCamera, rawDt: number) {
  const dt = Math.min(rawDt, 0.1)
  const still = sim.motion < 1
  const portrait = isPortrait(size)
  const view = portrait ? VIEW.portrait : VIEW.landscape
  const turn = view.az - VIEW.landscape.az
  const tilt = view.el - VIEW.landscape.el
  const p = sim.latest
  if (sim.addSeq !== cam.seenAdd) {
    cam.seenAdd = sim.addSeq
    if (cam.follow !== 'off') cam.manual = false
    cam.craneT = 0
    if (p) cam.last.copy(p.pos)
  }
  if (sim.idle || cam.craneT < 7) cam.craneT += dt
  if (cam.craneT > 45) cam.craneT = 7
  if (p) {
    tmp.copy(p.pos).sub(cam.last)
    tmp.y *= 0.25
    if (tmp.length() > dt * 0.5) cam.dir.lerp(tmp.normalize(), 1 - Math.exp(-dt * 3.5)).normalize()
    cam.last.copy(p.pos)
  }
  const picking = sim.time - cam.lastPick < 1.4
  const follow = still ? 'off' : cam.follow
  const subj = follow === 'off' || cam.manual || picking ? null : subject(sim)
  const flying = inFlight(sim)
  const swap = !still && !cam.manual && sim.swap && sim.swap.t < 3.2 && cam.rig !== 'hangar' ? sim.swap : null

  let rate = 2.4
  if (swap) {
    if (cam.swap?.of !== swap) cam.swap = { of: swap, pts: swapPoints(swap) }
    const hangar = swap.slot === 'integrator'
    fit(cam.swap.pts, rad(hangar ? 8 : 28) + turn + cam.orbit.az, rad(hangar ? 18 : 30) + tilt, 24, size, cam.inset, 1.06, want)
    rate = swap.t < 0.2 ? 6 : 2.6
    const to = swap.to.toUpperCase()
    cam.mode = hangar ? `HANGAR · ${to} LAUNCHING` : swap.slot === 'transport' ? `LINE · ${to} INSTALLING` : swap.slot === 'storage' ? `STORAGE · ${to} ROLLING IN` : `CELL · ${to} BOARD`
  } else if (subj?.kind === 'part' && follow !== 'machine') {
    if (flying > 2) {
      fit(LINE, rad(32) + turn + cam.orbit.az, rad(30) + tilt, 22, size, cam.inset, 1.02, want)
      rate = 2.2
      cam.mode = `FOLLOW · WIDE (${flying} IN FLIGHT)`
    } else {
      const q = subj.part
      side.set(-cam.dir.z, 0, cam.dir.x).normalize()
      want.pos.copy(q.pos).addScaledVector(cam.dir, -3.8).addScaledVector(side, 1.6)
      want.pos.y = q.pos.y + 2.3
      want.look.copy(q.pos).addScaledVector(cam.dir, 1.4)
      want.fov = 40
      rate = 3.2
      cam.mode = `FOLLOW · PART · ${q.stage === 'tube' ? 'TUBE' : q.stage === 'belt' ? 'BELT' : q.stage === 'beam' || q.stage === 'silo' ? 'SILO LINK' : q.mode.toUpperCase()}`
    }
  } else if (subj?.kind === 'unit' && follow !== 'part') {
    machineShot(subj.unit, subj.part, want)
    rate = 2.8
    cam.mode = `FOLLOW · ${subj.unit.id.toUpperCase()} · ${subj.unit.work ? 'FINISHING' : 'CARRYING'}`
  } else if (subj?.kind === 'unit') {
    const q = subj.part
    side.set(-cam.dir.z, 0, cam.dir.x).normalize()
    want.pos.copy(q.pos).addScaledVector(cam.dir, -3.4).addScaledVector(side, 1.8)
    want.pos.y = q.pos.y + 2.4
    want.look.copy(q.pos)
    want.fov = 40
    rate = 3
    cam.mode = 'FOLLOW · PART · HELD'
  } else if (subj?.kind === 'seat') {
    slotAt(sim.rig.cell, subj.part.slot, tmp)
    want.look.copy(tmp)
    want.pos.copy(tmp).add(side.set(3.4, 7.0, 7.0))
    want.fov = 34
    rate = 2.6
    cam.mode = 'FOLLOW · SEATED'
  } else if (sim.time < cam.focusUntil && !cam.manual) {
    fit(PICK, rad(32) + turn + cam.orbit.az, rad(38) + tilt + cam.orbit.el, 16, size, cam.inset, 1.02, want)
    cam.mode = 'AISLE FOCUS'
  } else if (cam.rig === 'hangar' && !cam.manual) {
    fit(HANGAR_PTS, rad(6) + turn + cam.orbit.az + Math.sin(sim.clock * 0.08) * 0.05, rad(16) + tilt + cam.orbit.el, 22, size, cam.inset, 1.0, want)
    want.pos.sub(want.look).multiplyScalar(cam.orbit.zoom).add(want.look)
    cam.mode = 'HANGAR · 8 BAYS'
  } else if (cam.rig === 'crane' && !cam.manual && !still) {
    const s = cam.craneT
    const e = ease(Math.min(s / 7, 1))
    const az = rad(80) - e * rad(48) + turn + Math.max(0, s - 7) * 0.02
    const el = rad(5) + e * rad(33) + tilt
    fit(factory(sim, portrait), az, el, 26, size, cam.inset, 1, want)
    tmp.set(HOME.arm.x, 2.2, HOME.arm.z + 1)
    const d = want.pos.distanceTo(want.look)
    want.look.lerpVectors(tmp, want.look, e)
    want.pos.copy(want.look).add(dirOf(az, el, side).multiplyScalar(d * (0.42 + 0.58 * e)))
    rate = 3
    cam.mode = s < 7 ? 'CRANE · RISING' : 'CRANE · ORBIT'
  } else {
    fit(factory(sim, portrait), view.az + cam.orbit.az, view.el + cam.orbit.el, ISO_FOV, size, cam.inset, 1.0, want)
    want.pos.sub(want.look).multiplyScalar(cam.orbit.zoom).add(want.look)
    cam.mode = cam.manual ? 'MANUAL · ORBIT' : 'OVERVIEW'
  }

  const k = !cam.ready || still ? 1 : 1 - Math.exp(-dt * rate)
  cam.ready = true
  cam.pose.pos.lerp(want.pos, k)
  cam.pose.look.lerp(want.look, k)
  cam.pose.fov += (want.fov - cam.pose.fov) * k
  const far = cam.pose.pos.distanceToSquared(want.pos) > 1e-5 || cam.pose.look.distanceToSquared(want.look) > 1e-5 || Math.abs(want.fov - cam.pose.fov) > 1e-3
  if (!far) {
    cam.pose.pos.copy(want.pos)
    cam.pose.look.copy(want.look)
    cam.pose.fov = want.fov
  }
  cam.settled = !far
  camera.position.copy(cam.pose.pos)
  camera.up.set(0, 1, 0)
  camera.lookAt(cam.pose.look)
  camera.fov = cam.pose.fov
  camera.near = 0.2
  camera.far = 600
  camera.updateProjectionMatrix()
}

/** The HUD line: the shot name and a stills-photographer focal length for the current fov. */
export const hudText = (cam: Cam) => `${cam.mode} · ${Math.round(12 / Math.tan(rad(cam.pose.fov) / 2))}mm`

/**
 * Above and beside the integrator, looking down at what it carries or works
 * on: high enough that the board reads as a plan, not a grazing silkscreen.
 */
function machineShot(u: Unit, p: Part, out: Pose) {
  const anchor = u.id === 'arm' ? p.pos : u.pos
  out.look.copy(anchor).lerp(p.pos, 0.6)
  if (u.id === 'arm') out.pos.copy(out.look).add(tmp.set(5.6, 6.4, 7.4))
  else out.pos.copy(out.look).add(tmp.set(4.6, u.id === 'walker' ? 6.2 : 6.6, 6.4))
  out.fov = 34
  return out
}
