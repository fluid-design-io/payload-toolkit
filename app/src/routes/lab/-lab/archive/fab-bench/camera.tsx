import { useFrame, useThree } from '@react-three/fiber'
import { useMemo } from 'react'
import { PerspectiveCamera, Vector3 } from 'three'

import { clamp, damp, reducedMotion } from './kit'
import type { Finish, Mat } from './kit'
import { BELT, BENCH, BOARD, BY, CAB, LAMP, cabWorld, drawerFront, drawerLocal, inFlight, returning, travelling } from './model'
import type { Part, Sim } from './model'
import { chipTop } from './parts'
import type { Cam } from './parts'

export type Zoom = 'board' | 'chip' | 'die'
export type Follow = 'off' | 'macro'
export type Director = { zoom: Zoom; follow: Follow; mat: Mat; finish: Finish }
export type Insets = { top: number; bottom: number; left: number; right: number }

type Pose = { pos: Vector3; look: Vector3; fov: number }
const pose = (): Pose => ({ pos: new Vector3(), look: new Vector3(), fov: 24 })
const rad = (d: number) => (d * Math.PI) / 180

const want = pose()
const tmpPose = pose()
const f = new Vector3(), r = new Vector3(), u = new Vector3(), tmp = new Vector3(), dir = new Vector3(), side = new Vector3(), home = new Vector3()
const Y = new Vector3(0, 1, 0)

function basis(az: number, el: number) {
  dir.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el))
  f.copy(dir).negate()
  r.crossVectors(f, Y).normalize()
  u.crossVectors(r, f).normalize()
}

/** Places the camera `D` from `center` along (az, el) so the center lands at the middle of the inset viewport. */
function poseAt(center: Vector3, az: number, el: number, fov: number, D: number, size: { width: number; height: number }, ins: Insets, out: Pose) {
  basis(az, el)
  const halfH = D * Math.tan(rad(fov) / 2)
  const halfW = halfH * (size.width / size.height)
  const sx = (ins.left - ins.right) / 2 / (size.width / 2)
  const sy = (ins.bottom - ins.top) / 2 / (size.height / 2)
  out.look.copy(center).addScaledVector(r, -sx * halfW).addScaledVector(u, -sy * halfH)
  out.pos.copy(out.look).addScaledVector(dir, D)
  out.fov = fov
  return out
}

function fit(points: readonly Vector3[], az: number, el: number, fov: number, size: { width: number; height: number }, ins: Insets, margin: number, out: Pose) {
  basis(az, el)
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, d0 = Infinity, d1 = -Infinity
  for (const p of points) {
    const px = p.dot(r), py = p.dot(u), pd = p.dot(f)
    x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py); d0 = Math.min(d0, pd); d1 = Math.max(d1, pd)
  }
  const t = Math.tan(rad(fov) / 2)
  const usableH = Math.max(1, size.height - ins.top - ins.bottom), usableW = Math.max(1, size.width - ins.left - ins.right)
  const th = t * (usableH / size.height), tw = t * (size.width / size.height) * (usableW / size.width)
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, cd = (d0 + d1) / 2
  let D = 0
  for (const p of points) {
    const e = cd - p.dot(f)
    D = Math.max(D, (Math.abs(p.dot(u) - cy) * margin) / th + e, (Math.abs(p.dot(r) - cx) * margin) / tw + e)
  }
  tmp.set(0, 0, 0).addScaledVector(r, cx).addScaledVector(u, cy).addScaledVector(f, cd)
  return poseAt(tmp, az, el, fov, D, size, ins, out)
}

const box = (x0: number, z0: number, x1: number, z1: number, y0: number, y1: number) =>
  [[x0, y0, z0], [x1, y0, z0], [x0, y0, z1], [x1, y0, z1], [x0, y1, z0], [x1, y1, z0], [x0, y1, z1], [x1, y1, z1]].map(([x, y, z]) => new Vector3(x, y, z))
const OVERVIEW = box(BENCH.x0 + 0.4, BENCH.z0 + 0.3, BENCH.x1 - 0.3, BENCH.z1 - 0.3, 0, 1.6)
const LINE = box(BENCH.x0 + 1, BELT.z1 - 2.2, BOARD.x0 + 6, BELT.z0 + 1.5, 0, 2.5)
/** Portrait: cabinet at the top, board below, the arm rail down the right edge. The lamp and meter sit one pinch away. */
const PORTRAIT = box(CAB.pivot.x - CAB.W / 2 - 0.3, BENCH.z0 + 0.6, BOARD.x1 + 0.4, BOARD.z1 + 0.4, 0, 1.2)
const AZ = rad(0), EL = rad(61), FOV = 22
const AZ_P = rad(90), EL_P = rad(66)
const DRAWER_PTS = Array.from({ length: 5 }, () => new Vector3())
const RETURN_PTS = [new Vector3(), new Vector3()]

function chipPose(q: Part, die: boolean, frac: number, size: { width: number; height: number }, ins: Insets, az: number) {
  const s = q.slot?.s ?? q.scale
  const half = (Math.max(q.spec.fw, q.spec.fd) * s) / 2 + 0.25
  tmp.copy(q.pos).setY(q.pos.y + chipTop(q.spec) * s)
  const fov = die ? 18 : 26
  const dist = half / (frac / 2) / Math.tan(rad(fov) / 2)
  poseAt(tmp, die ? az : az + rad(16), die ? rad(89) : rad(54), fov, dist, size, ins, want)
}

/** Hangs the magnifier ring off to the side of the shot nearest its clamp, clear of the chip it lights. */
function placeLamp(chip: Part, aspect: number, up: number, die: boolean, head: Vector3, light: Vector3) {
  const s = chip.slot?.s ?? chip.scale
  light.copy(chip.pos).setY(chip.pos.y + chipTop(chip.spec) * s)
  f.subVectors(want.look, want.pos).normalize()
  r.crossVectors(f, Y).normalize()
  u.crossVectors(r, f).normalize()
  const H = want.pos.distanceTo(light) * Math.tan(rad(want.fov) / 2)
  head.copy(light).addScaledVector(r, H * Math.min(aspect, 1.6) * (die ? 1.3 : 0.62)).addScaledVector(u, die ? 0 : H * 0.18 * up)
  head.y = Math.max(head.y, light.y + 0.9) + 1.0
  head.x -= LAMP.ring + 0.25
}

export function CameraRig({ sim, cam, director, insets, vignette, hud }: {
  sim: Sim
  cam: Cam
  director: { current: Director }
  insets: { current: Insets }
  vignette: { current: HTMLDivElement | null }
  hud: { current: HTMLDivElement | null }
}) {
  const { camera, size } = useThree()
  const st = useMemo(() => ({ pose: pose(), ready: false, dir: new Vector3(1, 0, 0), last: new Vector3(), vignette: 0, catAt: -99, lamp: { head: new Vector3(), chip: new Vector3() }, zoom: '' as Zoom, focus: null as string | null, cat: -2, hudMode: '', hudMm: 0 }), [])

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1)
    const D = director.current, ins = insets.current
    const still = reducedMotion
    const az = cam.portrait ? AZ_P : AZ, el = cam.portrait ? EL_P : EL
    if (sim.lastAddedAt !== cam.seenAdd) {
      cam.seenAdd = sim.lastAddedAt
      if (D.follow === 'macro') { cam.manual = false; cam.orbit.az = 0; cam.orbit.el = 0; cam.orbit.zoom = 1 }
      if (sim.lastAdded) st.last.copy(sim.lastAdded.pos)
    }
    if (st.zoom !== D.zoom || st.focus !== cam.focus) {
      st.zoom = D.zoom
      st.focus = cam.focus
      if (D.zoom !== 'board' || cam.focus) cam.manual = false
    }
    if (st.cat !== sim.drawer.aisle) {
      st.cat = sim.drawer.aisle
      st.catAt = sim.drawer.aisle >= 0 ? sim.time : -99
      if (sim.drawer.aisle >= 0) cam.trayAt = sim.time
    }

    const p = travelling(sim)
    const back = p ? null : returning(sim)
    const mover = p ?? back
    if (mover) {
      tmp.copy(mover.pos).sub(st.last)
      tmp.y *= 0.3
      if (tmp.length() > dt * 0.4) st.dir.lerp(tmp.normalize(), damp(dt, 4)).normalize()
      st.last.copy(mover.pos)
    }
    const picking = sim.time - sim.lastClickAt < 1.4
    const follow = D.follow === 'macro' && !still && !cam.manual && !picking
    const queue = inFlight(sim)
    const focus = cam.focus ? sim.parts.get(cam.focus) : undefined
    let zoomTarget = focus?.mode === 'seated' ? focus : sim.lastSeat?.mode === 'seated' ? sim.lastSeat : undefined
    if (!zoomTarget) for (const q of sim.parts.values()) if (q.mode === 'seated' && q.item.kind !== 'component') zoomTarget = q
    const holdTray = cam.holdTray ? 9 : 1.8
    let mode = 'BOARD'
    let rate = 2.6
    let vig = 0.14
    let lamp: Part | null = null
    let lampDie = false
    cam.decapTarget = 0
    if (cam.manual) {
      fit(cam.portrait ? PORTRAIT : OVERVIEW, az + cam.orbit.az, el + cam.orbit.el, FOV, size, ins, 1.0, want)
      want.pos.sub(want.look).multiplyScalar(cam.orbit.zoom).add(want.look)
      mode = 'MANUAL · ORBIT'
      rate = 7
    } else if (follow && p && queue > 2) {
      fit(LINE, az + 0.2, rad(48), 30, size, ins, 1.0, want)
      mode = `FOLLOW · WIDE (${queue} IN FLIGHT)`
      rate = 2.6
      vig = 0.26
    } else if (follow && p) {
      side.set(-st.dir.z, 0, st.dir.x).normalize()
      const carry = p.mode === 'carry'
      want.pos.copy(p.pos).addScaledVector(st.dir, carry ? -4.2 : -3.4).addScaledVector(side, carry ? 2.2 : 1.1)
      want.pos.y = carry ? p.pos.y + 0.5 : Math.max(p.pos.y + 1.5, BY + 1.3)
      want.look.copy(p.pos).addScaledVector(st.dir, 1.2)
      want.look.y = p.pos.y - (carry ? 0.3 : -0.1)
      want.fov = cam.portrait ? 54 : 42
      mode = p.mode === 'belt' ? 'FOLLOW · BELT' : p.mode === 'carry' ? 'FOLLOW · ARM' : 'FOLLOW · PICK'
      rate = 3.6
      vig = 0.55
    } else if (follow && back) {
      RETURN_PTS[0].copy(back.pos)
      RETURN_PTS[1].copy(back.fly ? back.fly.to : drawerFront(back.aisle, home))
      fit(RETURN_PTS, az + 0.15, rad(52), 28, size, ins, 1.6, want)
      tmp.subVectors(want.pos, want.look)
      if (tmp.length() < 14) want.pos.copy(want.look).addScaledVector(tmp.normalize(), 14)
      mode = back.mode === 'return' ? 'FOLLOW · BACK TO THE DRAWER' : 'FOLLOW · DESOLDER'
      rate = 2.4
      vig = 0.3
    } else if (follow && sim.lastSeat && sim.lastSeat.mode === 'seated' && sim.time - sim.lastSeatAt < 1.4 && queue === 0 && !focus) {
      chipPose(sim.lastSeat, false, 0.38, size, ins, az)
      mode = 'FOLLOW · SEATED'
      rate = 3.2
      vig = 0.34
      lamp = sim.lastSeat
    } else if ((D.zoom !== 'board' || focus) && zoomTarget) {
      const die = D.zoom === 'die'
      chipPose(zoomTarget, die, die ? 0.7 : 0.42, size, ins, az)
      mode = die ? `DIE · ${zoomTarget.item.title.toUpperCase()}` : `CHIP · ${zoomTarget.item.title.toUpperCase()}`
      rate = 2.8
      vig = die ? 0.3 : 0.36
      lamp = zoomTarget
      lampDie = die
      if (die) cam.decapTarget = 1
      if (focus !== zoomTarget) cam.focus = zoomTarget.item.ref
    } else if (sim.drawer.aisle >= 0 && Math.max(st.catAt, cam.trayAt) > sim.time - holdTray && (!still || cam.holdTray)) {
      const dl = drawerLocal(sim.drawer.aisle)
      if (cam.holdTray) {
        cabWorld(DRAWER_PTS[0].set(-CAB.W / 2 - 0.2, 0, 0), DRAWER_PTS[0])
        cabWorld(DRAWER_PTS[1].set(CAB.W / 2 + 0.2, CAB.H, 0), DRAWER_PTS[1])
        DRAWER_PTS[4].set(CAB.pivot.x, 0, CAB.tray.z + 0.7)
      } else {
        cabWorld(DRAWER_PTS[0].set(-CAB.W / 2 - 0.6, 0, -CAB.D), DRAWER_PTS[0])
        cabWorld(DRAWER_PTS[1].set(CAB.W / 2 + 0.6, CAB.H, -CAB.D), DRAWER_PTS[1])
        DRAWER_PTS[4].set(BELT.x + 0.8, 0, BELT.z0 + 0.6)
      }
      DRAWER_PTS[2].set(CAB.pivot.x + dl.x - 1.3, 0, CAB.tray.z + 0.9)
      DRAWER_PTS[3].set(CAB.pivot.x + dl.x + 1.3, 0, CAB.tray.z + 0.9)
      if (cam.holdTray) fit(DRAWER_PTS, AZ, EL, FOV, size, ins, 1.12, want)
      else {
        fit(DRAWER_PTS, az + (cam.portrait ? 0 : 0.1), el, FOV, size, ins, 1.08, want)
        fit(cam.portrait ? PORTRAIT : OVERVIEW, az, el, FOV, size, ins, 1.0, tmpPose)
        const far = tmpPose.pos.distanceTo(tmpPose.look) / 2.1
        if (want.pos.distanceTo(want.look) < far) want.pos.sub(want.look).setLength(far).add(want.look)
      }
      mode = 'CABINET · DRAWER OUT'
      rate = 2.4
      vig = 0.2
    } else {
      fit(cam.portrait ? PORTRAIT : OVERVIEW, az, el, FOV, size, ins, 1.0, want)
      mode = cam.portrait ? 'BOARD · PORTRAIT' : 'BOARD · OVERVIEW'
    }
    if (lamp) {
      placeLamp(lamp, size.width / size.height, cam.portrait ? -1 : 1, lampDie, st.lamp.head, st.lamp.chip)
      cam.lamp = st.lamp
    } else cam.lamp = null
    cam.mode = mode

    const k = !st.ready || still ? 1 : damp(dt, rate)
    st.ready = true
    cam.moving = st.pose.pos.distanceToSquared(want.pos) > 1e-4 || st.pose.look.distanceToSquared(want.look) > 1e-4 || Math.abs(want.fov - st.pose.fov) > 0.02
    st.pose.pos.lerp(want.pos, k)
    st.pose.look.lerp(want.look, k)
    st.pose.fov += (want.fov - st.pose.fov) * k
    const pc = camera as PerspectiveCamera
    pc.position.copy(st.pose.pos)
    pc.up.set(0, 1, 0)
    pc.lookAt(st.pose.look)
    pc.fov = st.pose.fov
    pc.near = 0.2
    pc.far = 400
    pc.updateProjectionMatrix()
    st.vignette += (vig - st.vignette) * (still ? 1 : damp(dt, 3))
    if (vignette.current) vignette.current.style.opacity = String(st.vignette)
    const mm = Math.round(12 / Math.tan(rad(st.pose.fov) / 2))
    if (hud.current && (st.hudMode !== mode || st.hudMm !== mm || !hud.current.textContent)) {
      st.hudMode = mode
      st.hudMm = mm
      hud.current.textContent = `${mode} · ${mm}mm`
    }
  })
  return null
}

/** Orbit limits shared by the gesture handlers: the bench never tips past the horizon or flips over. */
export const orbitEl = (el: number, portrait: boolean) => clamp(el, rad(18) - (portrait ? EL_P : EL), rad(88) - (portrait ? EL_P : EL))
