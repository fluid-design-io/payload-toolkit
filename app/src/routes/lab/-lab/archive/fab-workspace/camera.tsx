import { PerspectiveCamera, Vector3 } from 'three'

import type { Lab } from '../../lab.types'
import { ARM, BELT, BOARD, CAB, POD, TABLE, cabinetRows } from './layout'
import { inJourney, slotPos } from './sim'
import type { Sim } from './sim'

export type Follow = 'off' | 'soft' | 'chase'
export type Framing = 'frame' | 'stay'
export type Inset = { top: number; bottom: number; left: number; right: number }

type Pose = { pos: Vector3; look: Vector3; fov: number }

export type Cam = {
  follow: Follow
  framing: Framing
  orbit: { az: number; el: number; zoom: number }
  manual: boolean
  seenAdd: number
  dir: Vector3
  last: Vector3
  pose: Pose
  ready: boolean
  focusUntil: number
  lastPick: number
  mode: string
  inset: Inset
  /** True once the pose has reached its target, so the frameloop can rest. */
  settled: boolean
}

export function createCam(): Cam {
  return {
    follow: 'soft', framing: 'frame', orbit: { az: 0, el: 0, zoom: 1 }, manual: false, seenAdd: 0,
    dir: new Vector3(1, 0, 0), last: new Vector3(), pose: { pos: new Vector3(40, 30, 40), look: new Vector3(), fov: 14 },
    ready: false, focusUntil: 0, lastPick: -99, mode: 'OVERVIEW', inset: { top: 0, bottom: 0, left: 0, right: 0 }, settled: false,
  }
}

const rad = (d: number) => (d * Math.PI) / 180
const FOV = 14
/** Landscape looks along the line from its front-right; portrait turns to look down the line so it fills a tall frame. */
const VIEW = { landscape: { az: rad(32), el: rad(34) }, portrait: { az: rad(72), el: rad(44) } }
export const isPortrait = (size: { width: number; height: number }) => size.height > size.width * 1.1

const cells = new Map<number, Vector3[]>()
const picks = new Map<number, Vector3[]>()
const CELL = (rows: number) => cells.get(rows) ?? cells.set(rows, cellPts(rows)).get(rows)!
const PICK = (rows: number) => picks.get(rows) ?? picks.set(rows, pickPts(rows)).get(rows)!
const CX0 = CAB.x0 - CAB.w / 2 - 0.15
const CX1 = CAB.x0 + CAB.gapX * (CAB.cols - 1) + CAB.w / 2 + 0.15
const CZ0 = CAB.front - CAB.d - 0.2
const cellPts = (rows: number) =>
  [
    [CX0, 0, CZ0], [CX0, CAB.base + CAB.gapY * rows + 0.2, CZ0], [CX1, CAB.base + CAB.gapY * rows + 0.2, CZ0], [TABLE.x0 - 0.2, 0, TABLE.z1 + 0.3], [TABLE.x1, 0, TABLE.z1 + 0.3],
    [BOARD.x1 + 0.3, 0, BOARD.z0 - 0.3], [BOARD.x1 + 0.3, 0, POD.z + 0.5], [ARM.x, ARM.h0 + 4.2, ARM.z], [BELT.end, 1, BELT.z],
  ].map(([x, y, z]) => new Vector3(x, y, z))
const pickPts = (rows: number) =>
  [[CX0, 0, CZ0], [CX0, CAB.base + CAB.gapY * rows + 0.2, CZ0], [CX1, CAB.base + CAB.gapY * rows + 0.2, CZ0], [TABLE.x0 - 0.2, 0, TABLE.z1 + 0.3], [CX1, 0, TABLE.z1 + 0.3], [-2.4, 1, BELT.z]].map(
    ([x, y, z]) => new Vector3(x, y, z),
  )
const LINE = [[-4.2, 0, -0.4], [-4.2, 2, -0.4], [BELT.end + 1, 0, BELT.z + 1.2], [BOARD.x1, 0, BOARD.z0], [BOARD.x1, 0, BOARD.z1 + 0.5], [ARM.x, ARM.h0 + 3.6, ARM.z]].map(([x, y, z]) => new Vector3(x, y, z))

const dirOf = (az: number, el: number, out = new Vector3()) => out.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el))
const right = new Vector3()
const up = new Vector3()
const dir = new Vector3()
const proj = new Vector3()
const center = new Vector3()
const probe = new PerspectiveCamera()

/**
 * Frames `pts` from (az, el) at `fov`, inside the viewport minus `inset`
 * pixels on each side, so a reserved band (the Install bar) stays empty.
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
  center.copy(right).multiplyScalar((x0 + x1) / 2).addScaledVector(up, (y0 + y1) / 2)
  const perPx = (2 * dist * t) / size.height
  center.addScaledVector(right, -((inset.left - inset.right) / 2) * perPx).addScaledVector(up, ((inset.top - inset.bottom) / 2) * perPx)
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

const want: Pose = { pos: new Vector3(), look: new Vector3(), fov: FOV }
const tmp = new Vector3()
const side = new Vector3()

/** One camera update, run after the sim step each frame. */
export function runCamera(
  cam: Cam,
  sim: Sim,
  lab: Lab,
  motion: number,
  picking: boolean,
  size: { width: number; height: number },
  camera: PerspectiveCamera,
  rawDt: number,
) {
  const dt = Math.min(rawDt, 0.1)
  const rows = cabinetRows(lab.warehouse.aisles.length)
  const reduced = motion !== 1
  const view = isPortrait(size) ? VIEW.portrait : VIEW.landscape
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
  const journey = !!p && inJourney(p) && lab.selected.has(p.item.ref)
  const seated = !!p && p.mode === 'board' && sim.seat?.part === p && sim.time - sim.seat.t < 1.1
  const queue = sim.feed.length + sim.belt.length
  const pickingNow = sim.time - cam.lastPick < 1.4 || picking
  if (picking && sim.time < cam.focusUntil) cam.focusUntil = sim.time + 1.6
  let rate = 2.2
  if (cam.follow !== 'off' && !reduced && !cam.manual && !pickingNow && (journey || seated) && p) {
    if (cam.follow === 'soft') {
      if (queue > 2) {
        fit(LINE, view.az, view.el, FOV, size, cam.inset, 1.05, want)
        cam.mode = `FOLLOW · LINE (${queue} QUEUED)`
      } else {
        journey ? want.look.copy(p.pos) : slotPos(p, want.look)
        want.pos.copy(want.look).addScaledVector(dirOf(view.az, view.el, dir), journey ? 38 : 44)
        want.fov = FOV
        cam.mode = journey ? 'FOLLOW · PUSH-IN' : 'FOLLOW · SEATED'
      }
      rate = 1.7
    } else if (journey) {
      const wide = 1 + Math.min(queue, 4) * 0.22
      side.set(-cam.dir.z, 0, cam.dir.x).normalize()
      want.pos.copy(p.pos).addScaledVector(cam.dir, -3.8 * wide).addScaledVector(side, 1.6 * wide)
      want.pos.y = p.pos.y + 2.3 * wide
      want.look.copy(p.pos).addScaledVector(cam.dir, 1.4)
      want.fov = 40
      rate = 3.2
      cam.mode = 'FOLLOW · CHASE'
    } else {
      slotPos(p, tmp)
      want.look.copy(tmp)
      want.pos.copy(tmp).add(side.set(3.6, 6.2, 6.8))
      want.fov = 36
      rate = 2.6
      cam.mode = 'FOLLOW · SEATED'
    }
  } else if (sim.time < cam.focusUntil && cam.framing === 'frame' && !cam.manual) {
    fit(PICK(rows), view.az + cam.orbit.az, view.el + rad(4) + cam.orbit.el, FOV + 2, size, cam.inset, 1.02, want)
    cam.mode = 'AISLE'
    rate = reduced ? 99 : 2.0
  } else {
    fit(CELL(rows), view.az + cam.orbit.az, view.el + cam.orbit.el, FOV, size, cam.inset, 1.0, want)
    want.pos.sub(want.look).multiplyScalar(cam.orbit.zoom).add(want.look)
    cam.mode = cam.manual ? 'MANUAL' : 'OVERVIEW'
    rate = reduced ? 99 : 2.0
  }
  if (!cam.ready) {
    cam.ready = true
    cam.pose.look.copy(want.look)
    cam.pose.fov = want.fov
    cam.pose.pos.copy(want.pos)
    if (!reduced) cam.pose.pos.sub(want.look).multiplyScalar(1.18).add(want.look).y += 2
  }
  const k = 1 - Math.exp(-dt * rate)
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
  camera.near = 0.5
  camera.far = 400
  camera.updateProjectionMatrix()
}

/** The HUD line: the shot name and a stills-photographer focal length for the current fov. */
export const hudText = (cam: Cam) => `${cam.mode} · ${Math.round(12 / Math.tan(rad(cam.pose.fov) / 2))}mm`
