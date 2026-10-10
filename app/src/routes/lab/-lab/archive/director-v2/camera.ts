import { Fog, PerspectiveCamera, Vector3 } from 'three'

import type { Lab } from '../../lab.types'
import { LENS } from './look'
import type { WorldId } from './look'
import { BASE, BELT, REDUCED, inJourney, slotPos } from './sim'
import type { Part, Sim } from './sim'

export type Mode = 'director' | 'locked'
export type Pose = { pos: Vector3; look: Vector3; fov: number }
export type Shot = 'OVERVIEW' | 'AISLE' | 'PICK' | 'TRAVEL' | 'LIFT' | 'SEAT' | 'WIDE' | 'MANUAL'

/**
 * The shot list. Each stage of a part's journey has one authored framing, a
 * move duration into it and a settle rate once there. A move whose view
 * direction swings more than `CUT_ANGLE` becomes a cut instead.
 */
const SHOTS: Record<Shot, { dur: number; rate: number; lens: string }> = {
  OVERVIEW: { dur: 1.4, rate: 4, lens: 'establishing' },
  AISLE: { dur: 1.2, rate: 4, lens: 'push-in' },
  PICK: { dur: 1.1, rate: 5, lens: '3/4 high' },
  TRAVEL: { dur: 0.8, rate: 7, lens: 'dolly' },
  LIFT: { dur: 0.9, rate: 5, lens: 'low angle' },
  SEAT: { dur: 0.9, rate: 5, lens: 'high 3/4' },
  WIDE: { dur: 0.9, rate: 4, lens: 'queue' },
  MANUAL: { dur: 0, rate: 8, lens: 'orbit' },
}
const CUT_ANGLE = (100 * Math.PI) / 180
/** Rapid picking: no follow starts until this long after the last click. */
export const PICK_DELAY = 1.4
const FOLLOWING: readonly Shot[] = ['PICK', 'TRAVEL', 'LIFT', 'SEAT', 'WIDE']
/** Pixels the lab's switcher pill keeps at the top. */
const PILL = 64

export type Cam = {
  mode: Mode
  manual: boolean
  reduced: boolean
  embedded: boolean
  /** Portrait viewports run the line top to bottom instead of left to right. */
  portrait: boolean
  /** Landscape phones frame the machines only, leaving the drafting margins and title block out. */
  compact: boolean
  /** Pixels at the bottom a sheet or bar covers. */
  reserve: number
  world: WorldId
  orbit: { az: number; el: number; zoom: number }
  pose: Pose
  from: Pose
  t: number
  dur: number
  shot: Shot
  subject: string
  ready: boolean
  seenAdd: number
  lastPick: number
  focusUntil: number
  /** True while the pose is still easing toward its shot; the frame governor reads it. */
  moving: boolean
  inflight: number
  hud: string
  hudOf: { label: string; mm: number; moving: boolean; inflight: number }
}

const pose = (): Pose => ({ pos: new Vector3(30, 20, 30), look: new Vector3(), fov: 20 })
export function createCam(embedded: boolean): Cam {
  return {
    mode: 'director', manual: false, reduced: REDUCED, embedded, portrait: false, compact: false, reserve: 0, world: 'blueprint',
    orbit: { az: 0, el: 0, zoom: 1 }, pose: pose(), from: pose(), t: 1, dur: 0, shot: 'OVERVIEW', subject: '', ready: false,
    seenAdd: 0, lastPick: -99, focusUntil: 0, moving: true, inflight: 0, hud: '', hudOf: { label: '', mm: 0, moving: false, inflight: 0 },
  }
}

const rad = (d: number) => (d * Math.PI) / 180
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const want = pose()
const tmp = new Vector3()
const tmp2 = new Vector3()
const dirA = new Vector3()
const dirB = new Vector3()
const fitPts: Vector3[] = []
const pickPts = [new Vector3(), new Vector3(BELT.start, 0.9, BELT.z), new Vector3()]
const BELT_START = new Vector3(BELT.start, 0.9, BELT.z)
const ARM_TOP = new Vector3(BASE.x, 3.2, BASE.z)
/** The lift frames the held part, the slot it is bound for, the belt's end and the arm's shoulder, so the swing fills the shot. */
const liftPts = [new Vector3(), new Vector3(), new Vector3(BELT.end, BELT.y, BELT.z), new Vector3(BASE.x, 2.4, BASE.z)]

const pts = (list: number[][]) => list.map(([x, y, z]) => new Vector3(x, y, z))
const FACTORY = pts([
  [-10.7, 0, -3.4], [-10.7, 4.6, -3.4], [-10.7, 0, 4.6], [-4, 0, 4.6], [14.1, 0, -3.9], [15.4, 0, 3.3], [BASE.x, 7.4, BASE.z], [9.6, 4.4, -0.3], [1.8, 0, 2.4], [0.5, 0, 8.6], [-6.4, 0, 9.0], [15.2, 3.6, -3.6],
])
const PICKUP = pts([[-10.7, 0, -3.4], [-10.7, 4.8, -3.4], [-3.8, 4.8, -3.4], [-10.7, 0, 4.7], [-3.8, 0, 4.7], [-1.5, 0.9, 1.6]])
/** The cabinet, tray, belt, arm and board without the title block: what a portrait screen runs top to bottom. */
const PORTRAIT = pts([[-10.7, 0, -3.4], [-10.7, 4.6, -3.4], [-10.7, 0, 4.6], [-4, 0, 4.6], [14.1, 0, -3.9], [14.1, 0, 3.3], [5.2, 0, 3.3], [BASE.x, 6.6, BASE.z]])
/** The portrait camera looks from the cabinet end, so the tray of tap targets sits nearest, just above the sheet. */
const PORTRAIT_AZ = rad(-84)
const PORTRAIT_EL = rad(46)

/**
 * Frames `pts` from azimuth/elevation at `fov`. `shift` and `shiftY` move the
 * subject off center in half-screens; `hfrac` is the share of the height left
 * once the top pill and a bottom sheet are taken out.
 */
function fit(pts: readonly Vector3[], az: number, el: number, fov: number, aspect: number, margin: number, out: Pose, shift = 0.09, shiftY = 0, hfrac = 1) {
  const dir = tmp.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el))
  const right = tmp2.set(Math.cos(az), 0, -Math.sin(az))
  const up = dirA.crossVectors(dir, right).negate()
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
  for (const p of pts) {
    x0 = Math.min(x0, p.dot(right)); x1 = Math.max(x1, p.dot(right))
    y0 = Math.min(y0, p.dot(up)); y1 = Math.max(y1, p.dot(up))
  }
  const center = dirB.copy(right).multiplyScalar((x0 + x1) / 2).addScaledVector(up, (y0 + y1) / 2)
  const t = Math.tan(rad(fov) / 2)
  const dist = Math.max(((y1 - y0) / 2) * 1.14 * margin / (t * hfrac), ((x1 - x0) / 2) * 1.05 * margin / (t * aspect)) + 4
  center.addScaledVector(right, -shift * (dist - 4) * t * aspect).addScaledVector(up, -shiftY * (dist - 4) * t)
  out.look.copy(center)
  out.pos.copy(center).addScaledVector(dir, dist)
  out.fov = fov
  return out
}

function stage(p: Part): Shot {
  if (p.mode === 'queued' || (p.fly && p.fly.then === 'belt')) return 'PICK'
  if (p.mode === 'belt') return 'TRAVEL'
  return 'LIFT'
}

/** One frame of the cinematography: decide the shot, author its pose, then move or cut to it. */
export function direct(cam: Cam, sim: Sim, lab: Lab, camera: PerspectiveCamera, fog: Fog | null, size: { width: number; height: number }, dt: number, onAdd: (p: Part) => void) {
  const lens = LENS[cam.world]
  const aspect = size.width / Math.max(1, size.height)
  const p = sim.latest
  if (sim.addSeq !== cam.seenAdd) {
    cam.seenAdd = sim.addSeq
    cam.manual = false
    if (p) onAdd(p)
  }
  let inflight = 0
  fitPts.length = 0
  for (const part of sim.live) {
    if (inJourney(part) && lab.selected.has(part.item.ref)) {
      inflight++
      fitPts.push(part.pos)
    }
  }
  cam.inflight = inflight
  const following = cam.mode === 'director' && !cam.manual && !cam.reduced
  const wasFollowing = FOLLOWING.includes(cam.shot)
  const gate = sim.time - cam.lastPick < PICK_DELAY && !wasFollowing
  const journey = !!p && inJourney(p) && lab.selected.has(p.item.ref)
  const seated = !!p && p.mode === 'board' && sim.seat?.part === p && sim.time - sim.seat.t < 1.5

  let shot: Shot
  let subject = ''
  if (cam.manual) shot = 'MANUAL'
  else if (following && !gate && inflight >= 2) shot = 'WIDE'
  else if (following && !gate && journey && p) {
    shot = stage(p)
    subject = p.item.ref
  } else if (following && !gate && seated && p) {
    shot = 'SEAT'
    subject = p.item.ref
  } else if (sim.time < cam.focusUntil) shot = 'AISLE'
  else shot = 'OVERVIEW'

  const H = Math.max(1, size.height)
  const framed = !cam.embedded && (cam.portrait || cam.reserve > 0)
  const shiftY = cam.embedded ? 0.22 : framed ? (cam.reserve - PILL) / H : 0
  const hfrac = framed ? 1 - (cam.reserve + PILL) / H : 1
  switch (shot) {
    case 'WIDE':
      fitPts.push(BELT_START, ARM_TOP)
      fit(fitPts, rad(24), rad(24), 36, aspect, 1.25, want, 0, shiftY, hfrac)
      break
    case 'PICK':
      pickPts[0].copy(p!.pos)
      pickPts[2].set(p!.pos.x, p!.pos.y + 0.8, p!.pos.z)
      fit(pickPts, rad(18), rad(26), 30, aspect, 1.35, want, 0, shiftY, hfrac)
      break
    case 'TRAVEL':
      want.pos.set(p!.pos.x - 1.8, 2.9, BELT.z + 6.2)
      want.look.set(p!.pos.x + 1.2, 0.9, BELT.z - 0.4)
      want.fov = 34
      break
    case 'LIFT':
      liftPts[0].copy(p!.pos)
      if (p!.slot >= 0) slotPos(p!.slot, p!.size[1], liftPts[1])
      else liftPts[1].copy(ARM_TOP)
      fit(liftPts, rad(14), rad(13), 40, aspect, 1.2, want, 0, shiftY, hfrac)
      break
    case 'SEAT':
      slotPos(p!.slot, p!.size[1], tmp)
      want.look.copy(tmp).add(tmp2.set(0, 0.5, 0))
      want.pos.copy(tmp).add(tmp2.set(3.0, 3.6, 4.2))
      want.fov = 30
      break
    case 'AISLE':
      if (cam.portrait) fit(PICKUP, PORTRAIT_AZ + rad(30) + cam.orbit.az, PORTRAIT_EL + cam.orbit.el, 18, aspect, 1.02, want, 0, shiftY, hfrac)
      else fit(PICKUP, rad(32) + cam.orbit.az, rad(lens.el + 4) + cam.orbit.el, Math.max(lens.fov, 16), aspect, 1.02, want, 0.09, shiftY)
      break
    default:
      if (cam.portrait) fit(PORTRAIT, PORTRAIT_AZ + cam.orbit.az, PORTRAIT_EL + cam.orbit.el, 18, aspect, 0.94, want, 0, shiftY, hfrac)
      else if (cam.compact) fit(PORTRAIT, rad(32) + cam.orbit.az, rad(lens.el) + cam.orbit.el, lens.fov, aspect, 0.92, want, 0, shiftY, hfrac)
      else fit(FACTORY, rad(32) + cam.orbit.az, rad(lens.el) + cam.orbit.el, lens.fov, aspect, lens.frame, want, cam.embedded ? 0 : 0.06, shiftY, hfrac)
      want.pos.sub(want.look).multiplyScalar(cam.orbit.zoom).add(want.look)
  }

  if (shot !== cam.shot || subject !== cam.subject || !cam.ready) {
    const first = !cam.ready
    dirA.copy(cam.pose.pos).sub(cam.pose.look).normalize()
    dirB.copy(want.pos).sub(want.look).normalize()
    const swing = Math.acos(Math.max(-1, Math.min(1, dirA.dot(dirB))))
    const cut = first || cam.reduced || swing > CUT_ANGLE || shot === 'MANUAL'
    cam.from.pos.copy(cam.pose.pos)
    cam.from.look.copy(cam.pose.look)
    cam.from.fov = cam.pose.fov
    cam.dur = cut ? 0 : SHOTS[shot].dur
    cam.t = 0
    cam.subject = subject
    cam.shot = shot
    cam.ready = true
  }
  cam.t += dt
  if (cam.t < cam.dur) {
    const k = ease(cam.t / cam.dur)
    cam.pose.pos.lerpVectors(cam.from.pos, want.pos, k)
    cam.pose.look.lerpVectors(cam.from.look, want.look, k)
    cam.pose.fov = cam.from.fov + (want.fov - cam.from.fov) * k
  } else {
    const k = cam.reduced || (cam.dur === 0 && cam.t < 0.05) ? 1 : 1 - Math.exp(-dt * SHOTS[shot].rate)
    cam.pose.pos.lerp(want.pos, k)
    cam.pose.look.lerp(want.look, k)
    cam.pose.fov += (want.fov - cam.pose.fov) * k
  }
  cam.moving = cam.t < cam.dur || cam.pose.pos.distanceToSquared(want.pos) > 1e-5 || cam.pose.look.distanceToSquared(want.look) > 1e-5 || Math.abs(want.fov - cam.pose.fov) > 0.01
  camera.position.copy(cam.pose.pos)
  camera.up.set(0, 1, 0)
  camera.lookAt(cam.pose.look)
  camera.fov = cam.pose.fov
  camera.near = cam.pose.fov > 44 ? 0.08 : 0.2
  camera.updateProjectionMatrix()
  if (fog) {
    const reach = cam.pose.pos.distanceTo(cam.pose.look)
    fog.near = reach * (cam.world === 'blueprint' ? 1.6 : 0.8)
    fog.far = reach * (cam.world === 'blueprint' ? 4 : 3)
  }
  const mm = Math.round(12 / Math.tan(rad(cam.pose.fov) / 2))
  const label = shot === 'OVERVIEW' && cam.mode === 'locked' ? 'LOCKED' : shot
  const moving = cam.t < cam.dur
  const hud = cam.hudOf
  if (label !== hud.label || mm !== hud.mm || moving !== hud.moving || inflight !== hud.inflight) {
    hud.label = label
    hud.mm = mm
    hud.moving = moving
    hud.inflight = inflight
    cam.hud = `${label}${shot === 'WIDE' ? ` ×${inflight}` : ''} · ${SHOTS[shot].lens} · ${mm}mm${moving ? ' · move' : ''}`
  }
}
