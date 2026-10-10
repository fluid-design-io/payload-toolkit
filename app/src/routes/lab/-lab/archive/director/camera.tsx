import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import { PerspectiveCamera, Vector3 } from 'three'

import type { Lab } from '../../lab.types'
import { BASE, BELT, BOARD, inJourney, slotPos } from './factory'
import type { Part, Sim, WorldId } from './factory'
import { LENS } from './worlds'

export type Rig = 'iso' | 'crane' | 'cctv' | 'trailer'
export type Follow = 'off' | 'chase' | 'ride'

type Pose = { pos: Vector3; look: Vector3; fov: number; roll: number }

export type Cam = {
  rig: Rig
  follow: Follow
  world: WorldId
  orbit: { az: number; el: number; zoom: number }
  manual: boolean
  seenAdd: number
  dir: Vector3
  last: Vector3
  pose: Pose
  ready: boolean
  craneT: number
  focusUntil: number
  shotKey: string
  shotT: number
  idleShot: number
  rideBlend: number
  lastPick: number
  mode: string
  cctv: PerspectiveCamera[]
}

export function createCam(): Cam {
  return {
    rig: 'iso', follow: 'chase', world: 'island', orbit: { az: 0, el: 0, zoom: 1 }, manual: false, seenAdd: 0,
    dir: new Vector3(1, 0, 0), last: new Vector3(), pose: { pos: new Vector3(30, 20, 30), look: new Vector3(), fov: 20, roll: 0 },
    ready: false, craneT: 99, focusUntil: 0, shotKey: '', shotT: 0, idleShot: 0, rideBlend: 0, lastPick: -99, mode: 'OVERVIEW',
    cctv: [0, 1, 2, 3].map(() => new PerspectiveCamera(52, 1, 0.1, 400)),
  }
}

const rad = (d: number) => (d * Math.PI) / 180
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

const FACTORY = [
  [-10.7, 0, -3.4], [-10.7, 4.6, -3.4], [-10.7, 0, 4.6], [-4, 0, 4.6], [14.1, 0, -3.9], [14.1, 0, 3.3], [BASE.x, 7.4, BASE.z], [9.6, 4.4, -0.3], [1.8, 0, 2.4],
].map(([x, y, z]) => new Vector3(x, y, z))
const ISLAND = [...FACTORY, ...[[-15.9, 0, -9.6], [19.3, 0, -9.6], [-15.9, 0, 11], [19.3, 0, 11], [1.7, -13, 0.4]].map(([x, y, z]) => new Vector3(x, y, z))]
const PICK = [[-10.7, 0, -3.4], [-10.7, 4.8, -3.4], [-3.8, 4.8, -3.4], [-10.7, 0, 4.7], [-3.8, 0, 4.7], [-1.5, 0.9, 1.6]].map(([x, y, z]) => new Vector3(x, y, z))
const BOARD_C = new Vector3((BOARD.x0 + BOARD.x1) / 2, BOARD.y, (BOARD.z0 + BOARD.z1) / 2)

function fit(pts: Vector3[], az: number, el: number, fov: number, aspect: number, margin: number, out: Pose, shift = 0.09) {
  const dir = new Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el))
  const right = new Vector3(Math.cos(az), 0, -Math.sin(az))
  const up = new Vector3().crossVectors(dir, right).negate()
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
  for (const p of pts) {
    x0 = Math.min(x0, p.dot(right)); x1 = Math.max(x1, p.dot(right))
    y0 = Math.min(y0, p.dot(up)); y1 = Math.max(y1, p.dot(up))
  }
  const center = right.clone().multiplyScalar((x0 + x1) / 2).addScaledVector(up, (y0 + y1) / 2)
  const t = Math.tan(rad(fov) / 2)
  const dist = Math.max(((y1 - y0) / 2) * 1.14 * margin / t, ((x1 - x0) / 2) * 1.05 * margin / (t * aspect)) + 4
  center.addScaledVector(right, -shift * (dist - 4) * t * aspect)
  out.look.copy(center)
  out.pos.copy(center).addScaledVector(dir, dist)
  out.fov = fov
  out.roll = 0
  return out
}

const pose = (): Pose => ({ pos: new Vector3(), look: new Vector3(), fov: 20, roll: 0 })
const want = pose()
const tmp = new Vector3()
const side = new Vector3()

const IDLE = ['ESTABLISHING', 'CABINET PUSH-IN', 'BOARD ORBIT', 'DUTCH ANGLE', 'DRONE POV'] as const
const LENSES: Record<string, string> = {
  ESTABLISHING: '35mm', 'CABINET PUSH-IN': '50mm', 'BOARD ORBIT': '40mm', 'DUTCH ANGLE': '28mm', 'DRONE POV': '18mm',
  PICKUP: '85mm', 'TRACKING DOLLY': '50mm', 'LOW ANGLE HERO': '24mm', 'TOP DOWN': '100mm',
}

function stageOf(sim: Sim, p: Part | null, lab: Lab) {
  if (!p || !lab.selected.has(p.item.ref)) return null
  if (p.mode === 'queued' || (p.fly && p.fly.then === 'belt')) return 'PICKUP'
  if (p.mode === 'belt') return 'TRACKING DOLLY'
  if (p.mode === 'held') return 'LOW ANGLE HERO'
  if (p.mode === 'board' && sim.seat?.part === p && sim.time - sim.seat.t < 1.8) return 'TOP DOWN'
  return null
}

export function CameraDirector({ sim, cam, lab, hud, onCut, onAdd }: {
  sim: Sim
  cam: Cam
  lab: { current: Lab }
  hud: { current: HTMLDivElement | null }
  onCut: (name: string, lens: string) => void
  onAdd: (p: Part) => void
}) {
  const { camera, size } = useThree()
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1)
    const L = lab.current
    const aspect = size.width / Math.max(1, size.height)
    const lens = LENS[cam.world]
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
    const journey = !!p && inJourney(p) && L.selected.has(p.item.ref)
    const seated = !!p && p.mode === 'board' && sim.seat?.part === p && sim.time - sim.seat.t < 1.2
    const queue = sim.feed.length + sim.belt.length
    const picking = sim.time - cam.lastPick < 1.4

    let rate = 2.4
    let snap = false
    if (cam.rig === 'trailer' && !cam.manual) {
      const stage = picking ? null : stageOf(sim, p, L)
      cam.shotT += dt
      let key = stage ? `${stage}:${sim.addSeq}` : `idle:${cam.idleShot}`
      if (!stage && cam.shotT > 4.6 && cam.shotKey.startsWith('idle')) {
        cam.idleShot = (cam.idleShot + 1) % (L.setup.agent === 'none' ? 4 : 5)
        key = `idle:${cam.idleShot}`
      }
      if (key !== cam.shotKey) {
        cam.shotKey = key
        cam.shotT = 0
        snap = true
        const name = stage ?? IDLE[cam.idleShot]
        onCut(name, LENSES[name])
      }
      trailerPose(stage, cam, sim, p, aspect, want)
      rate = 5
      cam.mode = `TRAILER · ${stage ?? IDLE[cam.idleShot]}`
    } else if (cam.follow !== 'off' && !cam.manual && !picking && cam.rig !== 'cctv' && (journey || seated) && p) {
      if (journey && cam.follow === 'chase') {
        const wide = 1 + Math.min(queue, 4) * 0.22
        side.set(-cam.dir.z, 0, cam.dir.x).normalize()
        want.pos.copy(p.pos).addScaledVector(cam.dir, -3.8 * wide).addScaledVector(side, 1.6 * wide)
        want.pos.y = p.pos.y + 2.3 * wide
        want.look.copy(p.pos).addScaledVector(cam.dir, 1.4)
        want.fov = 40
        want.roll = 0
        rate = 3.2
        cam.mode = queue > 2 ? `FOLLOW · CHASE · WIDE (${queue} QUEUED)` : 'FOLLOW · CHASE'
      } else if (journey) {
        cam.rideBlend = Math.min(1, cam.rideBlend + dt * 1.2)
        want.pos.copy(p.pos).addScaledVector(cam.dir, -0.25)
        want.pos.y += p.size[1] / 2 + 0.32
        want.look.copy(want.pos).addScaledVector(cam.dir, 5)
        want.look.y -= 0.9
        want.fov = 72
        want.roll = 0
        rate = 2.5 + cam.rideBlend * 10
        cam.mode = 'FOLLOW · FIRST PERSON'
      } else {
        slotPos(p.slot, p.size[1], tmp)
        want.look.copy(tmp)
        want.pos.copy(tmp).add(side.set(3.6, 6.2, 6.8))
        want.fov = 36
        want.roll = 0
        rate = 2.6
        cam.mode = 'FOLLOW · SEATED'
      }
    } else if (sim.time < cam.focusUntil && cam.rig !== 'cctv') {
      fit(PICK, rad(32) + cam.orbit.az, rad(lens.el + 4) + cam.orbit.el, Math.max(lens.fov, 16), aspect, 1.02, want)
      cam.mode = 'AISLE FOCUS'
    } else if (cam.rig === 'crane' && !cam.manual) {
      const s = cam.craneT
      const e = ease(Math.min(s / 7, 1))
      const az = rad(80) - e * rad(48) + Math.max(0, s - 7) * 0.02
      const el = rad(5) + e * rad(33)
      fit(FACTORY, az, el, 26, aspect, 1, want)
      tmp.set(BASE.x, 2.2, BASE.z + 1)
      const d = want.pos.distanceTo(want.look)
      want.look.lerpVectors(tmp, want.look, e)
      want.pos.copy(want.look).add(side.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).multiplyScalar(d * (0.42 + 0.58 * e)))
      rate = 3
      cam.mode = s < 7 ? 'CRANE · RISING' : 'CRANE · ORBIT'
    } else {
      fit(cam.world === 'island' ? ISLAND : FACTORY, rad(32) + cam.orbit.az, rad(lens.el) + cam.orbit.el, lens.fov, aspect, lens.frame, want)
      want.pos.sub(want.look).multiplyScalar(cam.orbit.zoom).add(want.look)
      cam.mode = cam.manual ? 'MANUAL · ORBIT' : 'OVERVIEW'
    }
    if (!(journey && cam.follow === 'ride')) cam.rideBlend = 0

    const k = snap || !cam.ready ? 1 : 1 - Math.exp(-dt * rate)
    cam.ready = true
    cam.pose.pos.lerp(want.pos, k)
    cam.pose.look.lerp(want.look, k)
    cam.pose.fov += (want.fov - cam.pose.fov) * k
    cam.pose.roll += (want.roll - cam.pose.roll) * k
    const pc = camera as PerspectiveCamera
    pc.position.copy(cam.pose.pos)
    pc.up.set(0, 1, 0)
    pc.lookAt(cam.pose.look)
    if (cam.pose.roll) pc.rotateZ(cam.pose.roll)
    pc.fov = cam.pose.fov
    pc.near = cam.pose.fov > 60 ? 0.05 : 0.2
    pc.updateProjectionMatrix()
    if (hud.current) {
      const mm = Math.round(12 / Math.tan(rad(cam.pose.fov) / 2))
      const text = `${cam.rig === 'cctv' ? 'CCTV · 4 FEEDS' : cam.mode} · ${mm}mm`
      if (hud.current.textContent !== text) hud.current.textContent = text
    }
  })
  return null
}

function trailerPose(stage: string | null, cam: Cam, sim: Sim, p: Part | null, aspect: number, out: Pose) {
  const t = cam.shotT
  out.roll = 0
  if (stage && p) {
    if (stage === 'PICKUP') {
      out.look.copy(p.pos)
      out.pos.copy(p.pos).add(tmp.set(2.2 - t * 0.3, 1.0 + t * 0.15, 2.6))
      out.fov = 30
    } else if (stage === 'TRACKING DOLLY') {
      out.pos.set(p.pos.x - 2.4, 1.35, BELT.z + 3.4)
      out.look.copy(p.pos).add(tmp.set(1.6, 0.1, 0))
      out.fov = 34
    } else if (stage === 'LOW ANGLE HERO') {
      out.pos.set(BASE.x + 3.6, 0.55, BASE.z + 5.6)
      out.look.copy(sim.arm.pos).lerp(tmp.set(BASE.x, 3, BASE.z), 0.3)
      out.fov = 60
      out.roll = 0.07
    } else {
      slotPos(p.slot, p.size[1], tmp)
      out.look.copy(tmp)
      out.pos.copy(tmp).add(side.set(0.5, 7.8 - t * 0.8, 2.0))
      out.fov = 26
    }
    return out
  }
  switch (cam.idleShot) {
    case 0: {
      fit(FACTORY, rad(70) - t * 0.06, rad(16) + t * 0.025, 24, aspect, 1, out)
      return out
    }
    case 1: {
      const e = ease(Math.min(1, t / 4.6))
      out.pos.set(-1 - e * 2.4, 3.4 - e * 0.6, 7.2 - e * 2.4)
      out.look.set(-7.3, 2.2, -1)
      out.fov = 34
      return out
    }
    case 2: {
      const a = 0.4 + t * 0.14
      out.pos.copy(BOARD_C).add(tmp.set(Math.cos(a) * 9, 5.2, Math.sin(a) * 9))
      out.look.copy(BOARD_C)
      out.fov = 32
      return out
    }
    case 3: {
      out.pos.set(2.6 + t * 0.15, 1.25, 3.8)
      out.look.set(-6, 1.7, 0.4)
      out.fov = 40
      out.roll = 0.13
      return out
    }
    default: {
      out.pos.copy(sim.drone.pos).add(tmp.set(0, 0.35, 0))
      out.look.copy(BOARD_C).lerp(sim.drone.pos, 0.2)
      out.look.y = 0
      out.fov = 66
      return out
    }
  }
}

export const FEEDS = [
  { name: 'CAM 01 · PICK CABINET', pos: new Vector3(-15, 7.5, 8), look: new Vector3(-7, 1.4, 0.4), fov: 50 },
  { name: 'CAM 02 · CONVEYOR', pos: new Vector3(-3.8, 6.2, 8.4), look: new Vector3(0.2, 0.9, 1.4), fov: 48 },
  { name: 'CAM 03 · ASSEMBLY CELL', pos: new Vector3(19, 8, 7), look: new Vector3(9.2, 0.6, -0.6), fov: 50 },
  { name: 'CAM 04 · PTZ', pos: new Vector3(4, 10.5, -8.5), look: new Vector3(4, 1, 1), fov: 46 },
]

export function CCTVRender({ cam, sim, lab }: { cam: Cam; sim: Sim; lab: { current: Lab } }) {
  const { gl, scene, size } = useThree()
  const look = useMemo(() => new Vector3(4, 1, 1), [])
  useEffect(() => () => {
    gl.setScissorTest(false)
    gl.setViewport(0, 0, gl.domElement.clientWidth, gl.domElement.clientHeight)
  }, [gl])
  useFrame(({ clock }) => {
    const w = size.width / 2, h = size.height / 2
    const p = sim.latest
    const tracking = cam.follow !== 'off' && !!p && (inJourney(p) || (p.mode === 'board' && !!sim.seat && sim.time - sim.seat.t < 1.5)) && lab.current.selected.has(p.item.ref)
    FEEDS.forEach((feed, i) => {
      const c = cam.cctv[i]
      c.aspect = w / h
      c.fov = feed.fov
      c.position.copy(feed.pos)
      if (i === 3) {
        if (tracking && p) look.lerp(p.pos, 0.12)
        else look.lerp(tmp.set(4 + Math.sin(clock.elapsedTime * 0.3) * 6, 1, 0.5), 0.03)
        c.fov = tracking ? 32 : 46
        c.lookAt(look)
      } else {
        const sweep = Math.sin(clock.elapsedTime * 0.25 + i * 2) * 0.6
        c.lookAt(tmp.copy(feed.look).add(side.set(sweep, 0, -sweep * 0.5)))
      }
      c.updateProjectionMatrix()
    })
    gl.setScissorTest(true)
    const quads = [[0, h], [w, h], [0, 0], [w, 0]]
    quads.forEach(([x, y], i) => {
      gl.setViewport(x, y, w, h)
      gl.setScissor(x, y, w, h)
      gl.render(scene, cam.cctv[i])
    })
    gl.setScissorTest(false)
    gl.setViewport(0, 0, size.width, size.height)
  }, 1)
  return null
}
