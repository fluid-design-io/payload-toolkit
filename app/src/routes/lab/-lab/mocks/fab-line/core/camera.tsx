import { useFrame, useThree } from '@react-three/fiber'
import { Plane, Raycaster, Vector2, Vector3 } from 'three'
import type { PerspectiveCamera } from 'three'

import type { Lab } from '@/routes/lab/-lab/lab.types'
import type { Lens, Part, Sim, StopId } from './contract'
import { ARM } from './line'
import { inFlight, inJourney, slotWorld } from './sim'
import { chipTop } from './spec'
import { placeWindow } from './strip'
import { clamp, reducedMotion } from './three'

export type Rig = 'iso' | 'crane'
export type Follow = 'off' | 'chase' | 'ride'
/**
 * Where the camera rests when nothing is being followed: the whole line, one
 * station's stop, or a free point along the line the user panned to.
 */
export type View = { kind: 'overview' } | { kind: 'stop'; id: StopId } | { kind: 'free'; look: Vector3; dist: number }

type Pose = { pos: Vector3; look: Vector3; fov: number }

export type Cam = {
  rig: Rig
  follow: Follow
  lens: Lens
  view: View
  orbit: { az: number; el: number; zoom: number }
  /** The user took the camera: follow waits for the next add. */
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
  focusRef: string | null
  decap: boolean
  hovered: string | null
  /** Pixels at the bottom the Install bar or call sheet covers. */
  reserve: number
  inset: number
  closeUp: boolean
  /** True while the pose is still easing toward its target; the frame governor reads it. */
  moving: boolean
  /** The part under the last press, for long-press details on touch. */
  pressed: string | null
  /** Portrait viewport: frame the line top to bottom instead of left to right. */
  portrait: boolean
  /** World x range the viewport shows along the floor's centre line, for the station strip. */
  visible: { x0: number; x1: number }
  /** World +x on screen at the look point: a unit direction in pixels (y down) and pixels per world unit. */
  axis: { x: number; y: number; px: number }
}

export function createCam(): Cam {
  return {
    rig: 'iso', follow: 'chase', lens: { fov: 12, el: 36, frame: 1 }, view: { kind: 'overview' }, orbit: { az: 0, el: 0, zoom: 1 }, manual: false, seenAdd: 0,
    dir: new Vector3(1, 0, 0), last: new Vector3(), pose: { pos: new Vector3(30, 20, 30), look: new Vector3(), fov: 20 },
    ready: false, craneT: 99, focusUntil: 0, lastPick: -99, mode: 'OVERVIEW', focusRef: null, decap: false, hovered: null, reserve: 0, inset: 0, closeUp: false,
    moving: true, pressed: null, portrait: false, visible: { x0: 0, x1: 0 }, axis: { x: 1, y: 0, px: 30 },
  }
}

const rad = (d: number) => (d * Math.PI) / 180
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const AZ = rad(38)
/** A stop frames at least this much of the line, so a narrow station keeps its neighbours in view. */
const MIN_STOP = 13
const F = { dir: new Vector3(), right: new Vector3(), up: new Vector3(), center: new Vector3() }
const dirOf = (az: number, el: number, out: Vector3) => out.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el))

/** Frames `pts` inside the viewport minus a left inset and a bottom reserve, both in pixels. */
function fit(pts: readonly Vector3[], az: number, el: number, fov: number, size: { width: number; height: number }, margin: number, out: Pose, inset: number, reserve: number, right = 64) {
  const W = Math.max(1, size.width), H = Math.max(1, size.height)
  const aspect = W / H
  const dir = dirOf(az, el, F.dir)
  const rightV = F.right.set(Math.cos(az), 0, -Math.sin(az))
  const up = F.up.crossVectors(dir, rightV).negate()
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
  for (const p of pts) {
    x0 = Math.min(x0, p.dot(rightV)); x1 = Math.max(x1, p.dot(rightV))
    y0 = Math.min(y0, p.dot(up)); y1 = Math.max(y1, p.dot(up))
  }
  const center = F.center.copy(rightV).multiplyScalar((x0 + x1) / 2).addScaledVector(up, (y0 + y1) / 2)
  const t = Math.tan(rad(fov) / 2)
  const hfrac = Math.max(0.5, 1 - reserve / H), wfrac = Math.max(0.5, 1 - (inset + right) / W)
  const dist = Math.max((((y1 - y0) / 2) * 1.08 * margin) / (t * hfrac), (((x1 - x0) / 2) * 1.04 * margin) / (t * aspect * wfrac)) + 4
  center.addScaledVector(rightV, -((inset - right) / W) * (dist - 4) * t * aspect)
  center.addScaledVector(up, -(reserve / H) * (dist - 4) * t)
  out.look.copy(center)
  out.pos.copy(center).addScaledVector(dir, dist)
  out.fov = fov
  return out
}

const want: Pose = { pos: new Vector3(), look: new Vector3(), fov: 20 }
const tmp = new Vector3()
const side = new Vector3()
const padded: Vector3[] = []
const ray = new Raycaster()
const floor = new Plane(new Vector3(0, 1, 0), 0)
const ndc = new Vector2()
const hit = new Vector3()

function chipShot(p: Part, die: boolean, out: Pose) {
  const r = Math.max(p.spec.fw, p.spec.fd) * p.scale
  out.look.copy(p.pos).setY(p.pos.y + chipTop(p.spec) * p.scale)
  if (die) {
    out.fov = 20
    out.pos.copy(out.look).add(tmp.set(0.0001, (r * 0.62) / Math.tan(rad(10)), 0.0001))
    return out
  }
  out.fov = 24
  const az = AZ + 0.25, el = rad(50)
  out.pos.copy(out.look).addScaledVector(dirOf(az, el, tmp), (r * 1.45) / Math.tan(rad(12)))
  return out
}

/** A stop's points widened to at least `MIN_STOP` along x. */
function stopPts(pts: readonly Vector3[]) {
  let x0 = Infinity, x1 = -Infinity
  for (const p of pts) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x) }
  padded.length = 0
  padded.push(...pts)
  const grow = (MIN_STOP - (x1 - x0)) / 2
  if (grow > 0 && pts.length) {
    const p = pts[0]
    padded.push(tmp.set(x0 - grow, 0, p.z).clone(), tmp.set(x1 + grow, 0, p.z).clone())
  }
  return padded
}

/** Takes the camera from wherever it rests to a free view at its current look point, so panning starts where the eye is. */
function freeView(cam: Cam): Extract<View, { kind: 'free' }> {
  if (cam.view.kind === 'free') return cam.view
  const look = cam.pose.look.clone()
  cam.view = { kind: 'free', look, dist: cam.pose.pos.distanceTo(look) }
  cam.orbit.zoom = 1
  return cam.view
}

/**
 * How far the look point may travel: the line's ends stay on screen, so at
 * overview zoom there is almost nothing to pan and zoomed in it walks the line.
 */
function bounds(cam: Cam, sim: Sim) {
  const { x0, x1 } = sim.line.extent
  const half = Math.min((x1 - x0) / 2, Math.max(0, (cam.visible.x1 - cam.visible.x0) / 2 - 2))
  return [x0 + half, Math.max(x0 + half, x1 - half)] as const
}
/** Drags the line by a screen-pixel vector: the part along the line's on-screen axis pans, the part across it tilts. */
export function dragBy(cam: Cam, sim: Sim, dx: number, dy: number, tilt = true) {
  const v = freeView(cam)
  const { x: ax, y: ay, px } = cam.axis
  const along = dx * ax + dy * ay
  const [a, b] = bounds(cam, sim)
  v.look.x = clamp(v.look.x - along / Math.max(1, px), Math.min(a, v.look.x), Math.max(b, v.look.x))
  if (tilt) cam.orbit.el = clamp(cam.orbit.el + (dy * ax - dx * ay) * 0.004, -0.4, 0.9)
  cam.manual = true
}
/** Centres the free view on world `x`. */
export function panTo(cam: Cam, sim: Sim, x: number) {
  freeView(cam).look.x = clamp(x, sim.line.extent.x0, sim.line.extent.x1)
}
export function zoomBy(cam: Cam, factor: number) {
  if (cam.view.kind === 'free') cam.view.dist = clamp(cam.view.dist / factor, 6, 260)
  else cam.orbit.zoom = clamp(cam.orbit.zoom / factor, 0.35, 2.2)
  cam.manual = true
}
export function goTo(cam: Cam, view: View) {
  cam.view = view
  cam.orbit = { az: 0, el: 0, zoom: 1 }
  cam.manual = false
  cam.focusUntil = 0
}

export function CameraDirector({ sim, cam, lab, hud, root, strip, onAdd }: {
  sim: Sim
  cam: Cam
  lab: { current: Lab }
  hud: { current: HTMLDivElement | null }
  root: { current: HTMLDivElement | null }
  strip: { current: HTMLDivElement | null }
  onAdd: (p: Part) => void
}) {
  const { camera, size, gl } = useThree()
  const stats = { frames: 0, t: 0, fps: 0, calls: 0 }
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1)
    const L = lab.current
    const lens = cam.lens
    const line = sim.line
    const p = sim.latest
    if (sim.addSeq !== cam.seenAdd) {
      cam.seenAdd = sim.addSeq
      cam.manual = false
      cam.craneT = 0
      if (p) {
        cam.last.copy(p.pos)
        onAdd(p)
      }
    }
    cam.craneT += dt
    if (cam.craneT > 45) cam.craneT = 7
    if (p) {
      tmp.copy(p.pos).sub(cam.last)
      tmp.y *= 0.25
      if (tmp.length() > dt * 0.5) cam.dir.lerp(tmp.normalize(), 1 - Math.exp(-dt * 3.5)).normalize()
      cam.last.copy(p.pos)
    }
    const follow = reducedMotion ? 'off' : cam.follow
    const journey = !!p && inJourney(p) && L.selected.has(p.item.ref)
    const seated = !!p && p.mode === 'seated' && sim.seat?.part === p && sim.time - sim.seat.t < 1.4
    const queue = inFlight(sim)
    const picking = sim.time - cam.lastPick < 1.4
    const focus = cam.focusRef ? sim.parts.get(cam.focusRef) : undefined
    const az = (cam.portrait ? rad(93) : AZ) + cam.orbit.az
    const baseEl = cam.portrait ? 42 : lens.el
    const fov = cam.portrait ? 18 : lens.fov
    const view = cam.view
    const stop = view.kind === 'stop' ? line.stops.find((s) => s.id === view.id) : undefined

    let rate = 2.4
    if (focus && focus.mode === 'seated' && !cam.manual) {
      chipShot(focus, cam.decap, want)
      rate = cam.decap ? 2.0 : 2.4
      cam.mode = cam.decap ? 'DIE · TOP DOWN' : 'CHIP · PUSH-IN'
    } else if (follow !== 'off' && !cam.manual && !picking && (journey || seated) && p) {
      if (journey && follow === 'chase') {
        const wide = 1 + Math.min(queue, 4) * 0.22
        side.set(-cam.dir.z, 0, cam.dir.x).normalize()
        want.pos.copy(p.pos).addScaledVector(cam.dir, -3.6 * wide).addScaledVector(side, 1.5 * wide)
        want.pos.y = p.pos.y + 2.2 * wide
        want.look.copy(p.pos).addScaledVector(cam.dir, 1.4)
        want.fov = 40
        rate = 3.2
        cam.mode = queue > 2 ? `FOLLOW · CHASE · WIDE (${queue} QUEUED)` : 'FOLLOW · CHASE'
      } else if (journey) {
        want.pos.copy(p.pos).addScaledVector(cam.dir, -0.25)
        want.pos.y += chipTop(p.spec) * p.scale + 0.32
        want.look.copy(want.pos).addScaledVector(cam.dir, 5)
        want.look.y -= 0.9
        want.fov = 72
        rate = 6
        cam.mode = 'FOLLOW · FIRST PERSON'
      } else {
        slotWorld(sim, p, tmp)
        want.look.copy(tmp)
        want.pos.copy(tmp).add(side.set(2.4, 3.4, 4.2))
        want.fov = 32
        rate = 2.6
        cam.mode = 'FOLLOW · SEATED'
      }
    } else if (sim.time < cam.focusUntil && !cam.manual) {
      const pick = line.stops.filter((s) => s.id === 'cabinet' || s.id === 'table').flatMap((s) => s.pts)
      fit(pick, az, rad(lens.el + 4) + cam.orbit.el, Math.max(lens.fov, 16), size, 1.02, want, cam.inset * 0.5, cam.reserve)
      cam.mode = 'AISLE FOCUS'
    } else if (view.kind === 'free') {
      want.look.copy(view.look)
      want.pos.copy(view.look).addScaledVector(dirOf(az, rad(baseEl) + cam.orbit.el, tmp), view.dist)
      want.fov = fov
      rate = 4
      cam.mode = `PAN · X ${view.look.x.toFixed(1)}`
    } else if (stop) {
      fit(stopPts(stop.pts), az, rad(cam.portrait ? baseEl : (stop.el ?? lens.el)) + cam.orbit.el, fov, size, 1.22, want, cam.portrait ? 0 : cam.inset, cam.reserve, cam.portrait ? 8 : 64)
      want.pos.sub(want.look).multiplyScalar(cam.orbit.zoom).add(want.look)
      rate = 3
      cam.mode = `STOP · ${stop.label.toUpperCase()}`
    } else if (cam.rig === 'crane' && !cam.manual && !reducedMotion) {
      const s = cam.craneT
      const e = ease(Math.min(s / 7, 1))
      const caz = rad(80) - e * rad(48) + Math.max(0, s - 7) * 0.02
      const el = rad(5) + e * rad(33)
      fit(line.all, caz, el, 26, size, 1, want, cam.inset, cam.reserve)
      tmp.set(line.rail.x0 + ARM.park + 1, 2.2, line.rail.z + 2)
      const d = want.pos.distanceTo(want.look)
      want.look.lerpVectors(tmp, want.look, e)
      want.pos.copy(want.look).add(dirOf(caz, el, side).multiplyScalar(d * (0.42 + 0.58 * e)))
      rate = 3
      cam.mode = s < 7 ? 'CRANE · RISING' : 'CRANE · ORBIT'
    } else if (cam.portrait) {
      const near = line.stops.filter((s) => s.id === 'transport' || s.id === 'board')
      const pts = (near.length > 1 ? near : line.stops.filter((s) => s.id === 'table' || s.id === 'board')).flatMap((s) => s.pts)
      fit(pts, rad(93) + cam.orbit.az, rad(42) + cam.orbit.el, 18, size, 1.08, want, 0, cam.reserve, 8)
      want.pos.sub(want.look).multiplyScalar(cam.orbit.zoom).add(want.look)
      cam.mode = cam.manual ? 'MANUAL · ORBIT' : 'OVERVIEW · PORTRAIT'
    } else {
      fit(line.all, az, rad(lens.el) + cam.orbit.el, lens.fov, size, lens.frame, want, cam.inset, cam.reserve)
      want.pos.sub(want.look).multiplyScalar(cam.orbit.zoom).add(want.look)
      cam.mode = cam.manual ? 'MANUAL · ORBIT' : 'OVERVIEW'
    }

    cam.closeUp = cam.mode.startsWith('FOLLOW') || cam.mode.startsWith('CHIP') || cam.mode.startsWith('DIE')
    const k = !cam.ready || reducedMotion ? 1 : 1 - Math.exp(-dt * rate)
    cam.ready = true
    cam.moving = cam.pose.pos.distanceToSquared(want.pos) > 1e-4 || cam.pose.look.distanceToSquared(want.look) > 1e-4 || Math.abs(want.fov - cam.pose.fov) > 0.02
    cam.pose.pos.lerp(want.pos, k)
    cam.pose.look.lerp(want.look, k)
    cam.pose.fov += (want.fov - cam.pose.fov) * k
    const pc = camera as PerspectiveCamera
    pc.position.copy(cam.pose.pos)
    pc.up.set(0, 1, 0)
    pc.lookAt(cam.pose.look)
    pc.fov = cam.pose.fov
    pc.near = cam.pose.fov > 60 ? 0.05 : 0.2
    pc.updateProjectionMatrix()
    pc.updateMatrixWorld()

    const W = Math.max(1, size.width), H = Math.max(1, size.height)
    hit.copy(cam.pose.look).project(pc)
    tmp.copy(cam.pose.look).setX(cam.pose.look.x + 1).project(pc)
    const sx = ((tmp.x - hit.x) * W) / 2, sy = (-(tmp.y - hit.y) * H) / 2
    const px = Math.hypot(sx, sy)
    if (px > 1e-3) cam.axis = { x: sx / px, y: sy / px, px }
    const reach = Math.min(Math.abs(cam.axis.x) > 1e-3 ? W / 2 / Math.abs(cam.axis.x) : Infinity, Math.abs(cam.axis.y) > 1e-3 ? H / 2 / Math.abs(cam.axis.y) : Infinity)
    const cx = (hit.x + 1) * W / 2, cy = (1 - hit.y) * H / 2
    for (const [i, k] of [[0, -1], [1, 1]] as const) {
      const qx = clamp(cx + k * cam.axis.x * reach, 0, W), qy = clamp(cy + k * cam.axis.y * reach, 0, H)
      ndc.set((qx / W) * 2 - 1, 1 - (qy / H) * 2)
      ray.setFromCamera(ndc, pc)
      if (ray.ray.intersectPlane(floor, side)) {
        if (i === 0) cam.visible.x0 = side.x
        else cam.visible.x1 = side.x
      }
    }
    placeWindow(strip.current, line, cam.visible)

    stats.frames++
    stats.t += rawDt
    if (stats.t >= 0.5) {
      stats.fps = Math.round(stats.frames / stats.t)
      stats.calls = gl.info.render.calls
      stats.frames = 0
      stats.t = 0
      if (root.current) {
        let seated = 0, flying = 0
        for (const q of sim.live) {
          if (q.mode === 'seated') seated++
          else if (q.mode !== 'home') flying++
        }
        root.current.dataset.stats = JSON.stringify({ calls: stats.calls, fps: stats.fps, mode: cam.mode, seated, flying, view: cam.view.kind === 'stop' ? cam.view.id : cam.view.kind, held: sim.arm.holding?.item.ref ?? null, seen: [Math.round(cam.visible.x0 * 10) / 10, Math.round(cam.visible.x1 * 10) / 10] })
      }
    }
    if (hud.current) {
      const mm = Math.round(12 / Math.tan(rad(cam.pose.fov) / 2))
      const text = `${cam.mode} · ${mm}mm · ${stats.calls} calls · ${stats.fps} fps`
      if (hud.current.textContent !== text) hud.current.textContent = text
    }
  })
  return null
}
