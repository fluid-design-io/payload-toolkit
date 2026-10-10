import { PerspectiveCamera, Vector3 } from 'three'

import { seatPos } from './kit/board'
import { BOARD, DRAWER, DROP, RUNWAY, WALL, cabinetHeight, drawerY } from './layout'
import { inJourney } from './sim'
import type { Sim } from './sim'

export type Follow = 'off' | 'chase'
/** Pixels on each side that DOM chrome covers; framing keeps subjects inside the rest. */
export type Inset = { top: number; bottom: number; left: number; right: number }
type Pose = { pos: Vector3; look: Vector3; fov: number }

export type Cam = {
  follow: Follow
  orbit: { az: number; el: number; zoom: number }
  manual: boolean
  seenAdd: number
  dir: Vector3
  last: Vector3
  pose: Pose
  ready: boolean
  lastPick: number
  mode: string
  inset: Inset
  /** True once the pose has reached its target, so the frame loop can rest. */
  settled: boolean
  /** Pixels one block card covers at the look target; the wall's LOD reads it. */
  px: number
}

export function createCam(): Cam {
  return {
    follow: 'chase', orbit: { az: 0, el: 0, zoom: 1 }, manual: false,
    seenAdd: 0, dir: new Vector3(1, 0, 0), last: new Vector3(),
    pose: { pos: new Vector3(40, 30, 40), look: new Vector3(), fov: 14 }, ready: false, lastPick: -99, mode: 'OVERVIEW',
    inset: { top: 0, bottom: 0, left: 0, right: 0 }, settled: false, px: 0,
  }
}

const rad = (d: number) => (d * Math.PI) / 180
/**
 * Shot angles per level. Landscape looks along the wall from its front-left;
 * portrait swings round to stand at the board end so the line runs from the
 * board at the bottom of a tall frame up to the wall.
 */
const VIEW = {
  landscape: { overview: { az: rad(-34), el: rad(26) }, cabinet: { az: rad(-26), el: rad(18) }, drawer: { az: rad(-12), el: rad(52) } },
  portrait: { overview: { az: rad(58), el: rad(34) }, cabinet: { az: rad(-14), el: rad(20) }, drawer: { az: rad(-6), el: rad(56) } },
  /** A phone held upright: look straight down the wall from above the board so the line fills the height. */
  tall: { overview: { az: rad(76), el: rad(46) }, cabinet: { az: rad(-10), el: rad(22) }, drawer: { az: rad(-12), el: rad(52) } },
}
const isPortrait = (size: { width: number; height: number }) => size.height > size.width * 1.1
const viewOf = (size: { width: number; height: number }) => (size.height > size.width * 1.6 ? VIEW.tall : isPortrait(size) ? VIEW.portrait : VIEW.landscape)

const want: Pose = { pos: new Vector3(), look: new Vector3(), fov: 14 }
const tmp = new Vector3()
const side = new Vector3()
const right = new Vector3()
const up = new Vector3()
const dir = new Vector3()
const proj = new Vector3()
const center = new Vector3()
const probe = new PerspectiveCamera()

/** Eight corners written into `out`, reused frame to frame. */
function box(out: Vector3[], x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) {
  for (let i = 0; i < 8; i++) out[i].set(i & 1 ? x1 : x0, i & 2 ? y1 : y0, i & 4 ? z1 : z0)
  return out
}
const corners = () => Array.from({ length: 8 }, () => new Vector3())
const LINE = [...box(corners(), DROP.x - 2.4, BOARD.x1 + 0.4, 0, 4.5, DROP.z - 0.6, BOARD.z1 + 0.4), new Vector3(DROP.x, RUNWAY.y, DROP.z)]
const MID = corners()
const OVERVIEW = [...LINE, ...MID]
const focus = corners()

const dirOf = (az: number, el: number, out: Vector3) => out.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el))

/**
 * Frames `pts` from (az, el) at `fov` inside the viewport minus `inset`
 * pixels on each side, then corrects twice against the true projection so
 * perspective cannot push a corner under a panel.
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

/**
 * One camera update, after the sim step. `motion` below 1 means reduced
 * motion: no follow, and every move lands in one frame.
 */
export function directCamera(sim: Sim, cam: Cam, camera: PerspectiveCamera, size: { width: number; height: number }, dt: number, motion: number) {
  const store = sim.store
  const reduced = motion !== 1
  const view = viewOf(size)
  const p = sim.latest
  if (sim.addSeq !== cam.seenAdd) {
    cam.seenAdd = sim.addSeq
    if (cam.follow !== 'off') cam.manual = false
    if (p) cam.last.copy(p.pos)
  }
  if (p) {
    tmp.copy(p.pos).sub(cam.last)
    tmp.y *= 0.25
    if (tmp.length() > dt * 0.5) cam.dir.lerp(tmp.normalize(), 1 - Math.exp(-dt * 3.5)).normalize()
    cam.last.copy(p.pos)
  }
  const journey = !!p && inJourney(p) && sim.wanted.has(p.item.ref) && p.mode !== 'wait'
  const seated = !!p && p.mode === 'board' && sim.seat?.part === p && sim.time - sim.seat.t < 1.4
  const picking = sim.time - cam.lastPick < 1.4
  const queue = sim.waiting.length + sim.belt.length
  const f = sim.focus

  let rate = 2.4
  const following = cam.follow === 'chase' && !reduced && !cam.manual && !picking && (journey || seated) && p
  if (following && journey) {
    const wide = 1 + Math.min(queue, 4) * 0.2
    side.set(-cam.dir.z, 0, cam.dir.x).normalize()
    want.pos.copy(p.pos).addScaledVector(cam.dir, -4.2 * wide).addScaledVector(side, 1.8 * wide)
    want.pos.y = p.pos.y + 2.4 * wide
    want.look.copy(p.pos).addScaledVector(cam.dir, 1.4)
    want.fov = isPortrait(size) ? 52 : 40
    rate = 3
    cam.mode = queue > 2 ? `FOLLOW · ${p.mode === 'tote' ? 'CRANE' : 'CHASE'} · WIDE (${queue} QUEUED)` : `FOLLOW · ${p.mode === 'tote' ? 'CRANE' : 'CHASE'}`
  } else if (following) {
    seatPos(p.seat!, p.size[1], tmp)
    want.look.copy(tmp)
    want.pos.copy(tmp).add(side.set(2.4, 4.4, 4.8))
    want.fov = isPortrait(size) ? 40 : 30
    rate = 2.6
    cam.mode = 'FOLLOW · SEATED'
  } else if (f.level === 'drawer' && f.drawer >= 0) {
    const d = store.drawers[f.drawer]
    const c = store.cabinets[d.cabinet]
    const y = drawerY(d.slot, store.slots)
    box(focus, c.x - WALL.width / 2, c.x + WALL.width / 2, y - 0.2, y + 0.5, WALL.z1 - 0.3, WALL.z1 + DRAWER.travel + 0.2)
    fit(focus, view.drawer.az + cam.orbit.az, view.drawer.el + cam.orbit.el, 22, size, cam.inset, 1.0, want)
    cam.mode = `DRAWER · ${d.label.toUpperCase()}`
  } else if (f.level === 'cabinet' && f.cabinet >= 0) {
    const c = store.cabinets[f.cabinet]
    const h = cabinetHeight(store.slots)
    box(focus, c.x - WALL.width / 2 - 0.3, c.x + WALL.width / 2 + 0.3, 0, h + 0.3, WALL.z1 - 0.2, WALL.z1 + 1.2)
    fit(focus, view.cabinet.az + cam.orbit.az, view.cabinet.el + cam.orbit.el, 20, size, cam.inset, 1.0, want)
    cam.mode = `CABINET ${String(c.index + 1).padStart(2, '0')} · ${c.label.toUpperCase()}`
  } else {
    const reach = view === VIEW.portrait ? 7 : 11
    box(MID, WALL.cx - reach, WALL.cx + reach, 0, RUNWAY.y + 0.6, WALL.z0 - 0.8, WALL.z1 + 0.4)
    fit(OVERVIEW, view.overview.az + cam.orbit.az, view.overview.el + cam.orbit.el, 14, size, cam.inset, 1.06, want)
    cam.mode = cam.manual ? 'MANUAL · ORBIT' : 'OVERVIEW'
  }
  if (!following) want.pos.sub(want.look).multiplyScalar(f.level === 'overview' ? cam.orbit.zoom : Math.min(2, Math.max(0.7, cam.orbit.zoom))).add(want.look)

  const k = !cam.ready || reduced ? 1 : 1 - Math.exp(-dt * rate)
  cam.ready = true
  cam.pose.pos.lerp(want.pos, k)
  cam.pose.look.lerp(want.look, k)
  cam.pose.fov += (want.fov - cam.pose.fov) * k
  const far = cam.pose.pos.distanceToSquared(want.pos) > 1e-6 || cam.pose.look.distanceToSquared(want.look) > 1e-6 || Math.abs(want.fov - cam.pose.fov) > 1e-3
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
  camera.far = 400
  camera.updateProjectionMatrix()
  const dist = cam.pose.pos.distanceTo(cam.pose.look)
  cam.px = (0.44 / (2 * dist * Math.tan(rad(cam.pose.fov) / 2))) * size.height
}
/** The HUD line: the shot name and a stills-photographer focal length for the current fov. */
export const hudText = (cam: Cam) => `${cam.mode} · ${Math.round(12 / Math.tan(rad(cam.pose.fov) / 2))}mm`
