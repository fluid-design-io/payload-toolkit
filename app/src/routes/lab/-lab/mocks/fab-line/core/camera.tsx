import { useFrame, useThree } from '@react-three/fiber'
import { Plane, Raycaster, Vector2, Vector3 } from 'three'
import type { PerspectiveCamera } from 'three'

import { keepAnimating } from '../../../kit/busy'
import type { Lens, LineLayout, Part, Sim, Stop, ViewTool } from './contract'
import { NO_INSETS } from './insets'
import type { Insets } from './insets'
import { joltOffset, stepJolt } from './jolt'
import { inFlight, inJourney, slotWorld } from './sim'
import { chipTop } from './spec'
import { clamp, damp, reducedMotion } from './three'

export type Follow = 'off' | 'chase' | 'ride'
/**
 * Where the camera rests when nothing is being followed: the whole line, one
 * station's stop, or a free orbit the user took: a look point on the campus,
 * azimuth and elevation in radians, and a distance.
 */
export type FreeView = { kind: 'free'; look: Vector3; az: number; el: number; dist: number }
/** A mod's view tool with its picked variant, selected at `since` (performance.now() milliseconds). */
export type ModView = { kind: 'mod'; tool: ViewTool; variant: string | null; since: number }
export type View = { kind: 'overview' } | { kind: 'stop'; id: string } | FreeView | ModView

type Pose = { pos: Vector3; look: Vector3; fov: number }

export type Cam = {
  follow: Follow
  lens: Lens
  view: View
  /** The user took the camera: follow, the aisle focus and the close-up wait for the next add. */
  manual: boolean
  seenAdd: number
  dir: Vector3
  last: Vector3
  pose: Pose
  ready: boolean
  /** Sim time the aisle focus holds until: opening an aisle shows the pick frame while its parts come out. */
  aisleUntil: number
  /** Sim time of the user's last press or wheel. Follow shots wait a beat after it, so picking parts keeps the table in view. */
  touched: number
  /** The shot the camera is taking: the id of the provider that claimed this frame. */
  mode: string
  focusRef: string | null
  decap: boolean
  hovered: string | null
  /** Pixels a framed shot keeps clear at each edge: the measured chrome, plus the header's fade at the top. */
  insets: Insets
  /** Pixels at the bottom the open World settings sheet covers. The picture lifts by `LIFT` of it, without moving the camera. */
  sheet: number
  /** The most the picture may lift for the shot, eased with the shot so a cut between shots never jumps the picture. */
  cap: number
  /** The picture's lift in pixels, applied as a view offset; the stats report it. */
  lift: number
  closeUp: boolean
  /** The part under the last press, for long-press details on touch. */
  pressed: string | null
  /** World x range the viewport shows along the floor's centre line, for the station strip. */
  visible: { x0: number; x1: number }
  /** World +x on screen at the look point: a unit direction in pixels (y down) and pixels per world unit. */
  axis: { x: number; y: number; px: number }
  /** The rendered camera, its canvas and size, for gestures that work in screen pixels. */
  eye: PerspectiveCamera | null
  canvas: HTMLCanvasElement | null
  screen: { w: number; h: number }
  /** Seconds since the stats were last written to the scene root, and the largest jolt in pixels since. */
  statsAge: number
  shook: number
}

export function createCam(): Cam {
  return {
    follow: 'chase', lens: { fov: 12, el: 36, frame: 1 }, view: { kind: 'overview' }, manual: false, seenAdd: 0,
    dir: new Vector3(1, 0, 0), last: new Vector3(), pose: { pos: new Vector3(30, 20, 30), look: new Vector3(), fov: 20 },
    ready: false, aisleUntil: 0, touched: -99, mode: 'overview', focusRef: null, decap: false, hovered: null, insets: NO_INSETS, sheet: 0, cap: 0, lift: 0, closeUp: false,
    pressed: null, visible: { x0: 0, x1: 0 }, axis: { x: 1, y: 0, px: 30 }, eye: null, canvas: null, screen: { w: 1, h: 1 }, statsAge: 0, shook: 0,
  }
}

const rad = (d: number) => (d * Math.PI) / 180
/** How much of the open sheet's height the picture lifts by. */
const LIFT = 0.4
/** Pixels a shot's labels and leader lines rise above its frame points, kept clear of the header too. */
const HEADROOM = 40
/** Seconds a follow shot waits after the user's last press. */
const SETTLE = 1.4
const AZ = rad(38)
/** A portrait canvas looks down the line from its end, framing it top to bottom. */
const PORTRAIT = { az: rad(93), el: 42, fov: 18 }
const F = { dir: new Vector3(), right: new Vector3(), up: new Vector3(), center: new Vector3() }
const dirOf = (az: number, el: number, out: Vector3) => out.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el))
const portraitOf = (cam: Cam) => cam.screen.h > cam.screen.w

/**
 * Frames `pts` inside the viewport minus `insets` (pixels at each edge). The distance counts each point's depth toward
 * the eye, so near corners that perspective spreads still fit.
 */
function fit(pts: readonly Vector3[], az: number, el: number, fov: number, size: { width: number; height: number }, margin: number, out: Pose, insets: Insets) {
  const W = Math.max(1, size.width), H = Math.max(1, size.height)
  const aspect = W / H
  const dir = dirOf(az, el, F.dir)
  const rightV = F.right.set(Math.cos(az), 0, -Math.sin(az))
  const up = F.up.crossVectors(dir, rightV)
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
  for (const p of pts) {
    x0 = Math.min(x0, p.dot(rightV)); x1 = Math.max(x1, p.dot(rightV))
    y0 = Math.min(y0, p.dot(up)); y1 = Math.max(y1, p.dot(up))
  }
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2
  const t = Math.tan(rad(fov) / 2)
  const hfrac = Math.max(0.5, 1 - (insets.top + insets.bottom) / H), wfrac = Math.max(0.5, 1 - (insets.left + insets.right) / W)
  const kx = (1.04 * margin) / (t * aspect * wfrac), ky = (1.08 * margin) / (t * hfrac)
  let dist = 1
  for (const p of pts) dist = Math.max(dist, p.dot(dir) + Math.max(Math.abs(p.dot(rightV) - cx) * kx, Math.abs(p.dot(up) - cy) * ky))
  const center = F.center.copy(rightV).multiplyScalar(cx).addScaledVector(up, cy)
  center.addScaledVector(rightV, -((insets.left - insets.right) / W) * dist * t * aspect)
  center.addScaledVector(up, -((insets.bottom - insets.top) / H) * dist * t)
  out.look.copy(center)
  out.pos.copy(center).addScaledVector(dir, dist)
  out.fov = fov
  return out
}

const tmp = new Vector3()
const side = new Vector3()
const ray = new Raycaster()
const floor = new Plane(new Vector3(0, 1, 0), 0)
const level = new Plane(new Vector3(0, 1, 0), 0)
const ndc = new Vector2()
const hit = new Vector3()
const shake = { x: 0, y: 0 }
/** The two ends of the floor's centre line on screen, for `cam.visible`. */
const ENDS = [[0, -1], [1, 1]] as const

const UP = new Vector3(0, 1, 0)
const aim = { fwd: new Vector3(), right: new Vector3(), up: new Vector3() }
/** Points `aim` along `shot`, for `shotY`. */
function aimAt(shot: Pose) {
  aim.fwd.copy(shot.look).sub(shot.pos).normalize()
  aim.right.crossVectors(aim.fwd, UP).normalize()
  aim.up.crossVectors(aim.right, aim.fwd)
}
/** Screen y in pixels of world point `p` in the shot `aimAt` last aimed at, with no view offset; `t` is tan(fov / 2). */
function shotY(p: Vector3, shot: Pose, h: number, t: number) {
  tmp.copy(p).sub(shot.pos)
  return (h / 2) * (1 - tmp.dot(aim.up) / (Math.max(1e-3, tmp.dot(aim.fwd)) * t))
}

/** Derived point sets, kept per layout or stop object, so a shot never allocates per frame. */
function cached<K extends object, V>(make: (key: K) => V) {
  const memo = new WeakMap<K, V>()
  return (key: K) => {
    let v = memo.get(key)
    if (v === undefined) memo.set(key, (v = make(key)))
    return v
  }
}
/** A stop's points widened to its least width along x. */
const stopPts = cached(({ pts, min }: Stop) => {
  const { x0, x1 } = pts.reduce((s, p) => ({ x0: Math.min(s.x0, p.x), x1: Math.max(s.x1, p.x) }), { x0: Infinity, x1: -Infinity })
  const grow = (min - (x1 - x0)) / 2
  return grow > 0 && pts.length ? [...pts, new Vector3(x0 - grow, 0, pts[0].z), new Vector3(x1 + grow, 0, pts[0].z)] : pts
})
/** The aisle focus frames every stop in the pick frame. */
const aislePts = cached((line: LineLayout) => line.stops.filter((s) => s.frame === 'pick').flatMap((s) => s.pts))
/** A portrait overview frames the line's last two stops, where parts arrive. */
const tailPts = cached((line: LineLayout) => line.stops.slice(-2).flatMap((s) => s.pts))

/** What every provider reads in a frame, refreshed in place. */
export type ShotCtx = {
  sim: Sim
  cam: Cam
  dt: number
  size: { width: number; height: number }
  portrait: boolean
  /** The follow pick, `off` under reduced motion. */
  follow: Follow
  /** The part last added. */
  p: Part | null
  /** It is on its way to the board and still wanted. */
  journey: boolean
  /** It is seated and settling: its trace still drawing, the integrator working it, or its finish still flashing. */
  seated: boolean
  working: boolean
  /** The user has not pressed for a beat and has not taken the camera, so a follow shot may take it. */
  free: boolean
}
/** A shot written by a provider: the pose, and the points it frames (for the lift's cap; null frames the look point). */
export type Want = Pose & { framed: readonly Vector3[] | null }
/**
 * One way to point the camera. The director asks the providers in order and the first whose `claims` holds takes the
 * frame: `shot` writes the pose it wants, and returning true cuts there instead of easing at `rate`. `closeUp` hides
 * the themes' labels; `hold` keeps the lift's cap the shot was taken with, so a free view never slides under a gesture.
 */
export type ShotProvider = { id: string; claims: (c: ShotCtx) => boolean; shot: (c: ShotCtx, out: Want) => boolean | void; closeUp?: boolean; hold?: boolean; rate?: number }

const lens = { az: AZ, el: 36, fov: 12 }
/** The lens a framed or free shot uses: the theme's, or the portrait one. */
function lensOf(c: ShotCtx) {
  const from = c.portrait ? PORTRAIT : c.cam.lens
  lens.az = c.portrait ? PORTRAIT.az : AZ
  lens.el = from.el
  lens.fov = from.fov
  return lens
}
const focused = (c: ShotCtx) => (c.cam.focusRef ? c.sim.parts.get(c.cam.focusRef) : undefined)
const viewStop = (c: ShotCtx) => (c.cam.view.kind === 'stop' ? c.sim.line.stops.find((s) => s.id === (c.cam.view as { id: string }).id) : undefined)

/** The camera's shots, highest priority first. The last always claims. */
export const SHOTS: readonly ShotProvider[] = [
  {
    id: 'chip',
    closeUp: true,
    rate: 2.2,
    claims: (c) => !c.cam.manual && focused(c)?.mode === 'seated',
    shot: (c, out) => {
      const p = focused(c)!
      const r = Math.max(p.spec.fw, p.spec.fd) * p.scale
      out.look.copy(p.pos).setY(p.pos.y + chipTop(p.spec) * p.scale)
      if (c.cam.decap) {
        out.fov = 20
        out.pos.copy(out.look).add(tmp.set(0.0001, (r * 0.62) / Math.tan(rad(10)), 0.0001))
      } else {
        out.fov = 24
        out.pos.copy(out.look).addScaledVector(dirOf(AZ + 0.25, rad(50), tmp), (r * 1.45) / Math.tan(rad(12)))
      }
    },
  },
  {
    // A mod's view owns the camera: follow and the aisle focus wait until the user leaves it.
    id: 'view',
    closeUp: true,
    rate: 4,
    claims: (c) => c.cam.view.kind === 'mod',
    shot: (c, out) => {
      const v = c.cam.view as ModView
      return v.tool.shot({ sim: c.sim, t: (performance.now() - v.since) / 1000, dt: c.dt, aspect: c.size.width / Math.max(1, c.size.height), variant: v.variant }, out) === true
    },
  },
  {
    id: 'chase',
    closeUp: true,
    rate: 3.2,
    claims: (c) => c.follow === 'chase' && c.free && c.journey,
    shot: (c, out) => {
      const p = c.p!, dir = c.cam.dir
      const wide = 1 + Math.min(inFlight(c.sim), 4) * 0.22
      side.set(-dir.z, 0, dir.x).normalize()
      out.pos.copy(p.pos).addScaledVector(dir, -3.6 * wide).addScaledVector(side, 1.5 * wide)
      out.pos.y = p.pos.y + 2.2 * wide
      out.look.copy(p.pos).addScaledVector(dir, 1.4)
      out.fov = 40
    },
  },
  {
    id: 'ride',
    closeUp: true,
    rate: 6,
    claims: (c) => c.follow === 'ride' && c.free && c.journey,
    shot: (c, out) => {
      const p = c.p!, dir = c.cam.dir
      out.pos.copy(p.pos).addScaledVector(dir, -0.25)
      out.pos.y += chipTop(p.spec) * p.scale + 0.32
      out.look.copy(out.pos).addScaledVector(dir, 5)
      out.look.y -= 0.9
      out.fov = 72
    },
  },
  {
    // Holds on the chip while its trace draws and the integrator works it, and through its finish flash.
    id: 'seated',
    closeUp: true,
    rate: 2.6,
    claims: (c) => c.follow !== 'off' && c.free && c.seated,
    shot: (c, out) => {
      slotWorld(c.sim, c.p!, tmp)
      out.look.copy(tmp)
      out.pos.copy(tmp).add(side.set(2.4, 3.4, 4.2).multiplyScalar(c.working ? 1.3 : 1))
      out.fov = 32
    },
  },
  {
    id: 'aisle',
    claims: (c) => !c.cam.manual && c.sim.time < c.cam.aisleUntil,
    shot: (c, out) => {
      const l = lensOf(c)
      out.framed = aislePts(c.sim.line)
      fit(out.framed, l.az, rad(l.el + 4), Math.max(l.fov, 16), c.size, 1.02, out, c.cam.insets)
    },
  },
  {
    id: 'free',
    hold: true,
    rate: 12,
    claims: (c) => c.cam.view.kind === 'free',
    shot: (c, out) => {
      const v = c.cam.view as FreeView
      out.look.copy(v.look)
      out.pos.copy(v.look).addScaledVector(dirOf(v.az, v.el, tmp), v.dist)
      out.fov = lensOf(c).fov
    },
  },
  {
    id: 'stop',
    rate: 3,
    claims: (c) => viewStop(c) !== undefined,
    shot: (c, out) => {
      const stop = viewStop(c)!, l = lensOf(c)
      out.framed = stopPts(stop)
      fit(out.framed, l.az, rad(c.portrait ? l.el : (stop.el ?? l.el)), l.fov, c.size, stop.margin, out, c.cam.insets)
    },
  },
  {
    id: 'portrait',
    claims: (c) => c.portrait,
    shot: (c, out) => {
      out.framed = tailPts(c.sim.line)
      fit(out.framed, PORTRAIT.az, rad(PORTRAIT.el), PORTRAIT.fov, c.size, 1.08, out, c.cam.insets)
    },
  },
  {
    id: 'overview',
    claims: () => true,
    shot: (c, out) => {
      const { lens, insets } = c.cam
      out.framed = c.sim.line.all
      fit(out.framed, AZ, rad(lens.el), lens.fov, c.size, lens.frame, out, insets)
    },
  },
]

const ctx: ShotCtx = { sim: null!, cam: null!, dt: 0, size: { width: 1, height: 1 }, portrait: false, follow: 'off', p: null, journey: false, seated: false, working: false, free: false }
const want: Want = { pos: new Vector3(), look: new Vector3(), fov: 20, framed: null }
const taken: { shot: ShotProvider; cut: boolean; want: Readonly<Want> } = { shot: SHOTS[SHOTS.length - 1], cut: false, want }

/**
 * Takes one frame's shot: notes a new add, refreshes the context and lets the first provider that claims the frame
 * write `want`. Returns the provider, whether it cuts and the pose it wants (one object, rewritten each frame);
 * `cam.mode` reports the provider's id.
 */
export function takeShot(cam: Cam, sim: Sim, size: { width: number; height: number }, dt: number): Readonly<typeof taken> {
  const p = sim.latest
  if (sim.addSeq !== cam.seenAdd) {
    cam.seenAdd = sim.addSeq
    cam.manual = false
    if (p) cam.last.copy(p.pos)
  }
  if (p) {
    tmp.copy(p.pos).sub(cam.last)
    tmp.y *= 0.25
    if (tmp.length() > dt * 0.5) cam.dir.lerp(tmp.normalize(), damp(dt, 3.5)).normalize()
    cam.last.copy(p.pos)
  }
  const working = !!p && p.mode === 'seated' && (sim.work.job?.part === p || sim.work.queue.includes(p))
  ctx.sim = sim
  ctx.cam = cam
  ctx.dt = dt
  ctx.size = size
  ctx.portrait = size.height > size.width
  ctx.follow = reducedMotion ? 'off' : cam.follow
  ctx.p = p
  ctx.journey = !!p && inJourney(p) && sim.wanted.has(p.item.ref)
  ctx.seated = !!p && p.mode === 'seated' && (p.drawn < 1 || working || p.flash > 0.25)
  ctx.working = working
  ctx.free = !cam.manual && sim.time - cam.touched > SETTLE
  taken.shot = SHOTS.find((s) => s.claims(ctx))!
  want.framed = null
  taken.cut = taken.shot.shot(ctx, want) === true
  cam.mode = taken.shot.id
  cam.closeUp = !!taken.shot.closeUp
  return taken
}

/** The theme's overview lens, which a free view keeps. */
const lensFov = (cam: Cam) => (portraitOf(cam) ? PORTRAIT.fov : cam.lens.fov)

/**
 * Hands the camera to the user at the pose the eye is in, so a gesture
 * starts where the eye is. The distance is rescaled so the picture keeps its
 * size while the lens eases back from a follow shot's wide angle.
 */
function freeView(cam: Cam): FreeView {
  if (cam.view.kind === 'free') return cam.view
  const look = cam.pose.look.clone()
  const d = tmp.copy(cam.pose.pos).sub(look).length() || 1
  tmp.divideScalar(d)
  const dist = (d * Math.tan(rad(cam.pose.fov) / 2)) / Math.tan(rad(lensFov(cam)) / 2)
  cam.view = { kind: 'free', look, az: Math.atan2(tmp.x, tmp.z), el: clamp(Math.asin(clamp(tmp.y, -1, 1)), EL[0], EL[1]), dist: clamp(dist, DIST[0], DIST[1]) }
  return cam.view
}

const EL = [rad(8), rad(84)] as const
const DIST = [3, 260] as const
/** Keeps the look point over the campus: the line's extent along x, its stations' depth along z. */
function keepIn(v: FreeView, sim: Sim) {
  let z0 = Infinity, z1 = -Infinity
  for (const p of sim.line.all) { z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z) }
  v.look.x = clamp(v.look.x, sim.line.extent.x0, sim.line.extent.x1)
  v.look.z = clamp(v.look.z, z0 - 1, z1 + 1)
}

/** Drags the campus under the pointer: the floor moves with the finger, at any azimuth and tilt. */
export function panBy(cam: Cam, sim: Sim, dx: number, dy: number) {
  const v = freeView(cam)
  const perPx = (2 * v.dist * Math.tan(rad(lensFov(cam)) / 2)) / Math.max(1, cam.screen.h)
  const sin = Math.sin(v.az), cos = Math.cos(v.az)
  const across = dx * perPx, ahead = (dy * perPx) / Math.max(0.35, Math.sin(v.el))
  v.look.x += -cos * across - sin * ahead
  v.look.z += sin * across - cos * ahead
  keepIn(v, sim)
  cam.manual = true
}
/** Turns around the look point: sideways is azimuth, up and down is tilt. */
export function orbitBy(cam: Cam, dx: number, dy: number) {
  const v = freeView(cam)
  v.az -= dx * 0.006
  v.el = clamp(v.el + dy * 0.005, EL[0], EL[1])
  cam.manual = true
}
/** Dollies by `factor` (> 1 is closer) toward the floor point under client pixel `x`, `y`, which stays under the pointer. */
export function zoomAt(cam: Cam, sim: Sim, factor: number, x?: number, y?: number) {
  const v = freeView(cam)
  const next = clamp(v.dist / factor, DIST[0], DIST[1])
  if (x !== undefined && y !== undefined && cam.eye && cam.canvas) {
    const r = cam.canvas.getBoundingClientRect()
    ndc.set(((x - r.left) / Math.max(1, r.width)) * 2 - 1, 1 - ((y - r.top) / Math.max(1, r.height)) * 2)
    ray.setFromCamera(ndc, cam.eye)
    level.constant = -v.look.y
    if (ray.ray.intersectPlane(level, hit)) v.look.lerp(hit, 1 - next / v.dist)
  }
  v.dist = next
  keepIn(v, sim)
  cam.manual = true
}
/** Centres the free view on world `x`. */
export function panTo(cam: Cam, sim: Sim, x: number) {
  freeView(cam).look.x = clamp(x, sim.line.extent.x0, sim.line.extent.x1)
}
export function goTo(cam: Cam, view: View) {
  cam.view = view
  cam.manual = false
  cam.aisleUntil = 0
}

/**
 * One frame of the director: the claimed shot, eased (or cut) into the camera, then the post-shot offsets. The open
 * sheet lifts the picture with a lens shift (an off-centre view window), so no shot moves or zooms; the lift follows the
 * sheet's own spring, capped where the target shot's framed top (or its look point) would pass under the header, and
 * the cap eases with the camera. The jolt rides the same view offset.
 */
function direct(cam: Cam, sim: Sim, pc: PerspectiveCamera, canvas: HTMLCanvasElement, size: { width: number; height: number }, rawDt: number, root: HTMLDivElement | null) {
  const dt = Math.min(rawDt, 0.1)
  const { shot, cut } = takeShot(cam, sim, size, dt)
  const k = !cam.ready || reducedMotion || cut ? 1 : damp(dt, shot.rate ?? 2.4)
  cam.ready = true
  let moving = cam.pose.pos.distanceToSquared(want.pos) > 1e-4 || cam.pose.look.distanceToSquared(want.look) > 1e-4 || Math.abs(want.fov - cam.pose.fov) > 0.02
  cam.pose.pos.lerp(want.pos, k)
  cam.pose.look.lerp(want.look, k)
  cam.pose.fov += (want.fov - cam.pose.fov) * k
  pc.position.copy(cam.pose.pos)
  pc.up.set(0, 1, 0)
  pc.lookAt(cam.pose.look)
  pc.fov = cam.pose.fov
  pc.near = cam.pose.fov > 60 ? 0.05 : 0.2
  pc.updateMatrixWorld()
  cam.eye = pc
  cam.canvas = canvas
  cam.screen.w = size.width
  cam.screen.h = size.height

  const W = Math.max(1, size.width), H = Math.max(1, size.height)
  if (!shot.hold) {
    aimAt(want)
    const t = Math.tan(rad(want.fov) / 2)
    let subject = shotY(want.look, want, H, t)
    if (want.framed) for (const q of want.framed) subject = Math.min(subject, shotY(q, want, H, t) - HEADROOM)
    const cap = Math.max(0, subject - cam.insets.top)
    if (Math.abs(cap - cam.cap) > 0.05) moving = true
    cam.cap += (cap - cam.cap) * k
  }
  const lift = Math.min(cam.sheet * LIFT, cam.cap)
  if (Math.abs(lift - cam.lift) > 0.05) moving = true
  if (moving) keepAnimating()
  cam.lift = lift
  stepJolt(dt)
  joltOffset(shake)
  cam.shook = Math.max(cam.shook, Math.hypot(shake.x, shake.y))
  // Both calls update the projection matrix; a positive y offset moves the window down, so the picture moves up.
  if (lift || shake.x || shake.y) pc.setViewOffset(W, H, shake.x, lift + shake.y, W, H)
  else if (pc.view?.enabled) pc.clearViewOffset()
  else pc.updateProjectionMatrix()
  hit.copy(cam.pose.look).project(pc)
  tmp.copy(cam.pose.look).setX(cam.pose.look.x + 1).project(pc)
  const sx = ((tmp.x - hit.x) * W) / 2, sy = (-(tmp.y - hit.y) * H) / 2
  const px = Math.hypot(sx, sy)
  if (px > 1e-3) {
    cam.axis.x = sx / px
    cam.axis.y = sy / px
    cam.axis.px = px
  }
  const reach = Math.min(Math.abs(cam.axis.x) > 1e-3 ? W / 2 / Math.abs(cam.axis.x) : Infinity, Math.abs(cam.axis.y) > 1e-3 ? H / 2 / Math.abs(cam.axis.y) : Infinity)
  const cx = (hit.x + 1) * W / 2, cy = (1 - hit.y) * H / 2
  for (const [i, e] of ENDS) {
    const qx = clamp(cx + e * cam.axis.x * reach, 0, W), qy = clamp(cy + e * cam.axis.y * reach, 0, H)
    ndc.set((qx / W) * 2 - 1, 1 - (qy / H) * 2)
    ray.setFromCamera(ndc, pc)
    if (ray.ray.intersectPlane(floor, side)) {
      if (i === 0) cam.visible.x0 = side.x
      else cam.visible.x1 = side.x
    }
  }

  // Draw calls and fps are on the canvas element, from PerfProbe.
  cam.statsAge += rawDt
  if (cam.statsAge >= 0.5 && root) {
    cam.statsAge = 0
    let seated = 0, flying = 0
    for (const q of sim.live) {
      if (q.mode === 'seated') seated++
      else if (q.mode !== 'home') flying++
    }
    root.dataset.stats = JSON.stringify({ mode: cam.mode, seated, flying, jolt: Math.round(cam.shook * 10) / 10, view: cam.view.kind === 'stop' ? cam.view.id : cam.view.kind === 'mod' ? cam.view.tool.id : cam.view.kind, lift: Math.round(cam.lift), eye: [...cam.pose.pos.toArray(), ...cam.pose.look.toArray(), cam.pose.fov].map((n) => Math.round(n * 1000) / 1000), held: sim.arm.holding?.item.ref ?? null, seen: [Math.round(cam.visible.x0 * 10) / 10, Math.round(cam.visible.x1 * 10) / 10] })
    cam.shook = 0
  }
}

export function CameraDirector({ sim, cam, root, onAdd }: {
  sim: Sim
  cam: Cam
  root: { current: HTMLDivElement | null }
  /** A part was added, which takes the camera back from a close-up. */
  onAdd: () => void
}) {
  const { camera, gl } = useThree()
  useFrame(({ size }, dt) => {
    if (sim.addSeq !== cam.seenAdd && sim.latest) onAdd()
    direct(cam, sim, camera as PerspectiveCamera, gl.domElement, size, dt, root.current)
  })
  return null
}
