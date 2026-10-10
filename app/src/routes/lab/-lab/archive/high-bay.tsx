import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Edges, Grid, Line } from '@react-three/drei'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  Color,
  DoubleSide,
  FogExp2,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  NormalBlending,
  PerspectiveCamera,
  Points,
  Quaternion,
  SRGBColorSpace,
  Sprite,
  Texture,
  TextureLoader,
  Vector3,
} from 'three'

import { agents, databases, frameworks, packageManagers } from '../../../workspace/-workspace/workspace.constants'
import type { CatalogItem } from '../../../workspace/-workspace/workspace.types'
import type { Lab, MockProps } from '../lab.types'
import type { Aisle } from '../warehouse'

const ACCENT = '#5A91AD'
const BELT = { start: -3.7, end: 1.7, z: 1.6, y: 0.9, speed: 3.4, gap: 1.2 }
const BASE = { x: 4.2, z: -1.4 }
const H0 = 1.9
const L1 = 5.6
const L2 = 5.4
const BOARD = { x0: 5.2, x1: 13.95, z0: -3.75, z1: 3.15, y: 0.45 }
const CHIPS = { framework: new Vector3(8.35, 0, -0.3), database: new Vector3(10.85, 0, -0.3) }
const CHIP = 1.7
const REST = new Vector3(2.6, 3.6, 0.6)

const PITCH = 1.05
const ROW_H = 0.66
const GAP = 1.2
const FLOOR0 = 3.8
const CAR_R = 0.62
const MAST_BOTTOM = 2.3
const G_Y = 1.4
const DEPTH = 0.42
const FUNNEL = new Vector3(BELT.start + 0.5, 2.1, BELT.z - 1.7)

type Shape = 'cylinder' | 'square' | 'helix'
type Rig = 'orbit' | 'ride' | 'base'
type World = 'cathedral' | 'void'
type Config = { rig: Rig; shape: Shape; world: World; follow: boolean }

type Colors = ReturnType<typeof palette>
function palette(theme: Lab['theme']) {
  return theme === 'dark'
    ? { bg: '#090E11', surface: '#1B2327', fg: '#FCFCFC', muted: '#8A9094', edge: '#5C676C', dim: '#33404A', line: '#26323A', board: '#141D22', l: 42, s: 34 }
    : { bg: '#EDF1F3', surface: '#FFFFFF', fg: '#1D2225', muted: '#727C81', edge: '#9AA4A9', dim: '#C3CBCF', line: '#C9D1D5', board: '#F5F9FB', l: 64, s: 46 }
}
const tint = (hue: number, c: Colors, l = c.l) => `hsl(${hue}, ${c.s}%, ${l}%)`
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))
const pad2 = (n: number) => String(n).padStart(2, '0')
const smooth = (t: number) => t * t * (3 - 2 * t)
const damp = (k: number, dt: number) => 1 - Math.exp(-k * dt)
const FONT = '"Timeless Grotesk", ui-sans-serif, system-ui, sans-serif'

const SLOTS = (() => {
  const out: { x: number; z: number; i: number; j: number }[] = []
  for (let i = 0; i < 7; i++)
    for (let j = 0; j < 7; j++) {
      if (i >= 1 && i <= 5 && j >= 2 && j <= 4) continue
      out.push({ x: 5.85 + i * 1.25, z: -3.15 + j * 0.95, i, j })
    }
  return out.sort((a, b) => Math.hypot(a.x - 9.6, (a.z + 0.3) * 1.3) - Math.hypot(b.x - 9.6, (b.z + 0.3) * 1.3))
})()

const TRACES = SLOTS.map((s) => {
  const y = BOARD.y + 0.012
  const df = Math.abs(s.x - CHIPS.framework.x), dd = Math.abs(s.x - CHIPS.database.x)
  const chip = df < dd || (df === dd && s.j < 3) ? CHIPS.framework : CHIPS.database
  const half = CHIP / 2
  if (Math.abs(s.x - chip.x) <= 1.3) {
    const side = Math.sign(s.z - chip.z)
    const cx = clamp(s.x, chip.x - half + 0.25, chip.x + half - 0.25)
    const ez = chip.z + side * (half + 0.35 + 0.12 * Math.abs(s.j - 3))
    return [new Vector3(s.x, y, s.z), new Vector3(s.x, y, ez), new Vector3(cx, y, ez), new Vector3(cx, y, chip.z + side * half)]
  }
  const side = Math.sign(s.x - chip.x)
  const pinZ = chip.z - 0.6 + (s.j / 6) * 1.2
  const vx = s.x - side * (0.3 + 0.07 * s.j)
  return [new Vector3(s.x, y, s.z), new Vector3(vx, y, s.z), new Vector3(vx, y, pinZ), new Vector3(chip.x + side * half, y, pinZ)]
})

function slotPos(slot: number, h: number, out = new Vector3()) {
  const s = SLOTS[slot % SLOTS.length]
  return out.set(s.x, BOARD.y + h / 2 + Math.floor(slot / SLOTS.length) * 0.16, s.z)
}

const travelSize = (item: CatalogItem): [number, number, number] => (item.kind === 'block' ? [0.96, 0.1, 0.72] : [0.56, 0.42, 0.56])
const STOCK = 0.82

/** A floor is one category's band of the tower; bins fill it column by column so each registry source owns a contiguous arc. */
type Floor = {
  aisle: Aisle
  index: number
  y0: number
  y1: number
  mid: number
  rows: number
  start: number
  park: number
  racks: { name: string; count: number; c0: number; c1: number }[]
}
type Layout = {
  shape: Shape
  C: number
  R: number
  cx: number
  cz: number
  top: number
  floors: Floor[]
  stops: number[]
  items: CatalogItem[]
  index: Map<string, number>
  floorOf: Int16Array
  x: Float32Array
  y: Float32Array
  z: Float32Array
  yaw: Float32Array
  theta: Float32Array
  dist: Float32Array
  send: Vector3[]
  back: Vector3[]
}

function place(shape: Shape, C: number, R: number, col: number) {
  if (shape === 'square') {
    const H = (Math.PI * R) / 4
    const u = ((((col + 0.5) / C) * 4) % 4 + 4) % 4
    const side = Math.min(3, Math.floor(u))
    const f = u - side
    const a = (side * Math.PI) / 2
    const t = f * 2 * H - H
    return { x: Math.sin(a) * H + Math.cos(a) * t, z: Math.cos(a) * H - Math.sin(a) * t, yaw: a }
  }
  const a = (col / C) * Math.PI * 2
  return { x: Math.sin(a) * R, z: Math.cos(a) * R, yaw: a }
}
const lift = (shape: Shape, C: number, colF: number) => (shape === 'helix' ? ((colF + 0.5) / C) * ROW_H : 0)

function buildLayout(lab: Lab, shape: Shape): Layout {
  const viral = lab.scale === 'viral'
  const C = viral ? 40 : 16
  const R = (C * PITCH) / (2 * Math.PI)
  const cx = BELT.start - 2.4 - R
  const cz = BELT.z
  const n = lab.warehouse.bins.size
  const L: Layout = {
    shape, C, R, cx, cz, top: 0, floors: [], stops: [], items: [], index: new Map(), floorOf: new Int16Array(n),
    x: new Float32Array(n), y: new Float32Array(n), z: new Float32Array(n), yaw: new Float32Array(n), theta: new Float32Array(n), dist: new Float32Array(n),
    send: [], back: [],
  }
  let y = FLOOR0
  L.floors = lab.warehouse.aisles.map((aisle, index) => {
    const rows = Math.max(1, Math.ceil(aisle.count / C))
    const start = (index * 7) % C
    const used = Math.ceil(aisle.count / rows)
    const pk = place(shape, C, R, start + used / 2 - 0.5)
    const floor: Floor = { aisle, index, y0: y, y1: y + rows * ROW_H, mid: y + (rows * ROW_H) / 2, rows, start, park: Math.atan2(pk.x, pk.z), racks: [] }
    let k = 0
    for (const rack of aisle.racks) {
      const c0 = start + Math.floor(k / rows)
      for (const bin of rack.bins) {
        const i = L.items.length
        L.items.push(bin.item)
        L.index.set(bin.item.ref, i)
        L.floorOf[i] = index
        const col = (start + Math.floor(k / rows)) % C
        const row = k % rows
        const p = place(shape, C, R, col)
        const h = travelSize(bin.item)[1] * STOCK
        L.x[i] = cx + p.x
        L.z[i] = cz + p.z
        L.y[i] = y + row * ROW_H + lift(shape, C, col) + h / 2 + 0.03
        L.yaw[i] = p.yaw
        L.theta[i] = Math.atan2(p.x, p.z)
        L.dist[i] = Math.hypot(p.x, p.z)
        k++
      }
      floor.racks.push({ name: rack.name, count: rack.bins.length, c0, c1: start + Math.ceil(k / rows) - 1 })
    }
    y = floor.y1 + GAP
    return floor
  })
  L.top = y - GAP + ROW_H + 0.6
  L.stops = [G_Y, ...L.floors.map((f) => f.mid)]
  const sample = (pts: Vector3[]) => new CatmullRomCurve3(pts).getSpacedPoints(36)
  L.send = sample([
    new Vector3(cx, MAST_BOTTOM, cz), new Vector3(cx, 1.05, cz), new Vector3(cx + 1.3, 0.7, cz), new Vector3(BELT.start - 1.5, 0.78, cz),
    new Vector3(BELT.start - 0.45, BELT.y + 0.3, BELT.z), new Vector3(BELT.start, BELT.y + 0.06, BELT.z),
  ])
  L.back = sample([
    FUNNEL.clone(), new Vector3(FUNNEL.x - 0.5, 1.1, FUNNEL.z), new Vector3(BELT.start - 2.2, 0.55, cz - 0.9), new Vector3(cx + 1.3, 0.55, cz - 0.55),
    new Vector3(cx, 1.05, cz), new Vector3(cx, MAST_BOTTOM, cz),
  ])
  return L
}

type Mode = 'bin' | 'pickQ' | 'crane' | 'tubeDown' | 'belt' | 'held' | 'board' | 'tubeUp' | 'stowWait'
type Tube = { pts: Vector3[]; cum: number[]; s: number; v: number; vertical: number; up: boolean }
type Part = {
  item: CatalogItem
  i: number
  size: [number, number, number]
  pos: Vector3
  yaw: number
  scale: number
  spin: number
  mode: Mode
  slot: number
  beltX: number
  tube: Tube | null
  needsTexture: boolean
}
type Job = { p: Part; kind: 'pick' | 'stow'; phase: 'go' | 'extend' | 'retract' | 'drop' | 'load' | 'place'; t: number }
type Step = { to: Vector3; arrive?: () => boolean | void }
type Sim = {
  layout: Layout
  parts: Map<string, Part>
  list: Part[]
  queue: Part[]
  stow: Part[]
  belt: Part[]
  removals: Part[]
  slots: (Part | null)[]
  crane: { y: number; theta: number; vy: number; fork: number; job: Job | null; carry: Part | null }
  arm: { pos: Vector3; steps: Step[]; holding: Part | null; grip: number; job: Part | null }
  drone: { pos: Vector3; welds: Vector3[]; weldT: number; show: number }
  pulses: { slot: number; t: number }[]
  time: number
  elev: { y: number; target: number; touched: number; snapped: boolean }
  view: { az: number; touched: number }
  follow: { ref: string | null; paused: boolean; seatedAt: number; adds: number[] }
  stockChanged: Set<number>
  activeVersion: number
}

const inBin = (m: Mode) => m === 'bin' || m === 'pickQ'
function setMode(sim: Sim, p: Part, m: Mode) {
  if (inBin(p.mode) !== inBin(m)) {
    sim.stockChanged.add(p.i)
    sim.activeVersion++
  }
  p.mode = m
}

function createSim(lab: Lab, layout: Layout): Sim {
  const list: Part[] = layout.items.map((item, i) => ({
    item, i, size: travelSize(item), pos: new Vector3(layout.x[i], layout.y[i], layout.z[i]), yaw: layout.yaw[i], scale: STOCK, spin: 0,
    mode: 'bin', slot: -1, beltX: 0, tube: null, needsTexture: false,
  }))
  const sim: Sim = {
    layout, parts: new Map(list.map((p) => [p.item.ref, p])), list, queue: [], stow: [], belt: [], removals: [], slots: [],
    crane: { y: layout.floors[0]?.mid ?? FLOOR0, theta: layout.floors[0]?.park ?? 0, vy: 0, fork: 0, job: null, carry: null },
    arm: { pos: REST.clone(), steps: [], holding: null, grip: 0, job: null },
    drone: { pos: new Vector3(9.6, 3.4, 0), welds: [], weldT: 0, show: lab.setup.agent === 'none' ? 0 : 1 },
    pulses: [], time: 0,
    elev: { y: layout.stops[layout.stops.length - 1], target: G_Y, touched: -9, snapped: true },
    view: { az: 0.62, touched: -9 },
    follow: { ref: null, paused: false, seatedAt: 0, adds: [] },
    stockChanged: new Set(), activeVersion: 0,
  }
  for (const ref of lab.setup.items) {
    const p = sim.parts.get(ref)
    if (!p) continue
    p.slot = sim.slots.length
    sim.slots.push(p)
    setMode(sim, p, 'board')
    p.scale = 1
    p.yaw = 0
    slotPos(p.slot, p.size[1], p.pos)
  }
  return sim
}

function startTube(sim: Sim, p: Part, up: boolean, y: number) {
  const L = sim.layout
  const axisAt = (h: number) => new Vector3(L.cx, h, L.cz)
  const pts = up ? [...L.back, axisAt(y)] : [axisAt(y), ...L.send]
  const cum = [0]
  for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + pts[k].distanceTo(pts[k - 1]))
  p.tube = { pts, cum, s: 0, v: up ? 4 : 2, vertical: Math.abs(y - MAST_BOTTOM), up }
  setMode(sim, p, up ? 'tubeUp' : 'tubeDown')
}
function tubePoint(t: Tube, out: Vector3) {
  let k = 1
  while (k < t.cum.length - 1 && t.cum[k] < t.s) k++
  const seg = t.cum[k] - t.cum[k - 1] || 1
  return out.lerpVectors(t.pts[k - 1], t.pts[k], clamp((t.s - t.cum[k - 1]) / seg, 0, 1))
}

const tmp = new Vector3()
const tmp2 = new Vector3()
const FUNNEL_ABOVE = FUNNEL.clone().setY(FUNNEL.y + 1.6)

function forkPos(sim: Sim, dist: number, out: Vector3) {
  const { crane, layout: L } = sim
  const r = CAR_R + crane.fork * (dist - CAR_R)
  return out.set(L.cx + Math.sin(crane.theta) * r, crane.y, L.cz + Math.cos(crane.theta) * r)
}

function step(sim: Sim, lab: Lab, dt: number) {
  sim.time += dt
  const L = sim.layout
  const wanted = lab.selected
  const freeSlot = () => {
    const at = sim.slots.findIndex((s) => !s)
    if (at >= 0) return at
    sim.slots.push(null)
    return sim.slots.length - 1
  }
  const grip = (p: Part) => tmp2.set(0, 0.62 + p.size[1] / 2, 0)

  for (const p of sim.list) {
    const want = wanted.has(p.item.ref)
    if (want && p.mode === 'bin') {
      setMode(sim, p, 'pickQ')
      sim.queue.push(p)
      sim.follow.ref = p.item.ref
      sim.follow.paused = false
      sim.follow.seatedAt = 0
      sim.follow.adds.push(sim.time)
    } else if (!want && p.mode === 'pickQ') {
      const at = sim.queue.indexOf(p)
      if (at >= 0) {
        sim.queue.splice(at, 1)
        setMode(sim, p, 'bin')
      }
    } else if (!want && p.mode === 'board' && sim.arm.job !== p && !sim.removals.includes(p)) sim.removals.push(p)
    else if (want && p.mode === 'board' && sim.removals.includes(p)) sim.removals.splice(sim.removals.indexOf(p), 1)
    else if (want && p.mode === 'stowWait' && sim.stow.includes(p)) {
      sim.stow.splice(sim.stow.indexOf(p), 1)
      startTube(sim, p, false, p.pos.y)
    }
  }
  sim.follow.adds = sim.follow.adds.filter((t) => sim.time - t < 2.5)

  const crane = sim.crane
  if (!crane.job) {
    const next = sim.stow.shift()
    if (next) crane.job = { p: next, kind: 'stow', phase: 'go', t: 0 }
    else {
      const pick = sim.queue.shift()
      if (pick) crane.job = { p: pick, kind: 'pick', phase: 'go', t: 0 }
    }
  }
  const job = crane.job
  let ty: number, tt: number
  if (job) {
    ty = job.kind === 'stow' && job.phase === 'go' ? job.p.pos.y : L.y[job.p.i]
    tt = L.theta[job.p.i]
  } else {
    const floor = L.floors[clamp(nearestStop(L, sim.elev.y) - 1, 0, L.floors.length - 1)]
    ty = clamp(sim.elev.y, L.floors[0].mid, L.floors[L.floors.length - 1].mid)
    tt = floor.park
  }
  const vmax = lab.scale === 'viral' ? 34 : 20
  const want = clamp((ty - crane.y) * 5, -vmax, vmax)
  crane.vy += (want - crane.vy) * damp(9, dt)
  crane.y += crane.vy * dt
  const dTheta = wrap(tt - crane.theta)
  crane.theta += Math.sign(dTheta) * Math.min(Math.abs(dTheta), Math.max(Math.abs(dTheta) * damp(6, dt), 0), 4.5 * dt)
  const arrived = Math.abs(ty - crane.y) < 0.03 && Math.abs(wrap(tt - crane.theta)) < 0.012

  if (job) {
    const p = job.p
    const want = wanted.has(p.item.ref)
    const dist = L.dist[p.i]
    if (job.kind === 'pick') {
      if (job.phase === 'go') {
        if (!want) {
          setMode(sim, p, 'bin')
          crane.job = null
        } else if (arrived) job.phase = 'extend'
      } else if (job.phase === 'extend') {
        crane.fork = Math.min(1, crane.fork + dt * 3.4)
        if (crane.fork >= 1) {
          if (want) {
            setMode(sim, p, 'crane')
            crane.carry = p
          } else setMode(sim, p, 'bin')
          job.phase = 'retract'
        }
      } else if (job.phase === 'retract') {
        crane.fork = Math.max(0, crane.fork - dt * 3.4)
        if (crane.fork <= 0) {
          if (crane.carry) {
            job.phase = 'drop'
            job.t = 0
          } else crane.job = null
        }
      } else if (job.phase === 'drop') {
        job.t += dt / 0.28
        forkPos(sim, dist, tmp)
        p.pos.lerpVectors(tmp, tmp2.set(L.cx, crane.y, L.cz), clamp(job.t, 0, 1))
        if (job.t >= 1) {
          if (want) {
            crane.carry = null
            crane.job = null
            startTube(sim, p, false, crane.y)
          } else {
            job.kind = 'stow'
            job.phase = 'place'
          }
        }
      }
    } else {
      if (job.phase === 'go') {
        if (want) {
          crane.job = null
          startTube(sim, p, false, p.pos.y)
        } else if (arrived) {
          job.phase = 'load'
          job.t = 0
        }
      } else if (job.phase === 'load') {
        job.t += dt / 0.28
        forkPos(sim, dist, tmp)
        p.pos.lerpVectors(tmp2.set(L.cx, crane.y, L.cz), tmp, clamp(job.t, 0, 1))
        if (job.t >= 1) {
          setMode(sim, p, 'crane')
          crane.carry = p
          job.phase = 'place'
        }
      } else if (job.phase === 'place') {
        crane.fork = Math.min(1, crane.fork + dt * 3.4)
        if (crane.fork >= 1) {
          crane.carry = null
          p.tube = null
          setMode(sim, p, 'bin')
          p.scale = STOCK
          job.phase = 'retract'
        }
      } else if (job.phase === 'retract') {
        crane.fork = Math.max(0, crane.fork - dt * 3.4)
        if (crane.fork <= 0) crane.job = null
      }
    }
  }
  if (crane.carry && (job?.phase === 'retract' || job?.phase === 'place' || job?.phase === 'extend')) {
    forkPos(sim, L.dist[crane.carry.i], crane.carry.pos)
    crane.carry.yaw = L.yaw[crane.carry.i]
  }

  for (const p of sim.list) {
    if (!p.tube) continue
    const t = p.tube
    const total = t.cum[t.cum.length - 1]
    const vertical = t.up ? t.s > total - t.vertical : t.s < t.vertical
    const limit = vertical ? (lab.scale === 'viral' ? 46 : 30) : 9
    if (t.v > limit) t.v += (limit - t.v) * damp(10, dt)
    else t.v = Math.min(limit, t.v + 70 * dt)
    t.s = Math.min(total, t.s + t.v * dt)
    tubePoint(t, p.pos)
    p.scale += (1 - p.scale) * damp(4, dt)
    p.spin = t.up ? 0 : Math.sin(t.s * 0.8) * 0.3
    if (t.s >= total) {
      if (t.up) {
        p.tube = null
        p.mode = 'stowWait'
        sim.stow.push(p)
      } else {
        const last = sim.belt[sim.belt.length - 1]
        if (!last || last.beltX > BELT.start + BELT.gap) {
          p.tube = null
          p.spin = 0
          p.mode = 'belt'
          p.beltX = BELT.start
          sim.belt.push(p)
        }
      }
    }
  }

  sim.belt.forEach((p, i) => {
    const limit = i === 0 ? BELT.end : sim.belt[i - 1].beltX - BELT.gap
    p.beltX = Math.max(p.beltX, Math.min(p.beltX + BELT.speed * dt, limit))
    p.pos.set(p.beltX, BELT.y + p.size[1] / 2, BELT.z)
    p.yaw += wrap(0 - p.yaw) * damp(6, dt)
  })

  const arm = sim.arm
  const toFunnel = (p: Part): Step[] => [
    { to: FUNNEL_ABOVE.clone().add(grip(p)) },
    {
      to: FUNNEL.clone().add(grip(p)).setY(FUNNEL.y + 0.3 + grip(p).y),
      arrive: () => {
        arm.holding = null
        startTube(sim, p, true, L.y[p.i])
      },
    },
  ]
  if (!arm.steps.length) {
    const removal = sim.removals[0]
    const head = sim.belt[0]
    if (removal && removal.mode !== 'board') sim.removals.shift()
    else if (removal) {
      sim.removals.shift()
      arm.job = removal
      const at = slotPos(removal.slot, removal.size[1]).add(grip(removal))
      arm.steps = [
        { to: at.clone().setY(at.y + 1.4) },
        {
          to: at,
          arrive: () => {
            if (wanted.has(removal.item.ref) || removal.mode !== 'board') return false
            sim.slots[removal.slot] = null
            removal.slot = -1
            removal.mode = 'held'
            arm.holding = removal
            arm.steps.push({ to: at.clone().setY(at.y + 1.8) }, ...toFunnel(removal))
          },
        },
      ]
    } else if (head && head.beltX >= BELT.end - 0.01) {
      const pick = new Vector3(BELT.end, BELT.y + head.size[1] / 2, BELT.z).add(grip(head))
      arm.steps = [
        { to: pick.clone().setY(pick.y + 1.2) },
        {
          to: pick,
          arrive: () => {
            if (sim.belt[0] !== head) return false
            sim.belt.shift()
            head.mode = 'held'
            arm.holding = head
            if (!wanted.has(head.item.ref)) {
              arm.steps.push({ to: pick.clone().setY(pick.y + 2) }, ...toFunnel(head))
              return
            }
            const slot = freeSlot()
            head.slot = slot
            sim.slots[slot] = head
            const at = slotPos(slot, head.size[1]).add(grip(head))
            arm.steps.push({ to: pick.clone().setY(pick.y + 2) }, { to: at.clone().setY(at.y + 1.5) }, {
              to: at,
              arrive: () => {
                if (!wanted.has(head.item.ref)) {
                  sim.slots[slot] = null
                  head.slot = -1
                  arm.steps.push(...toFunnel(head))
                  return
                }
                arm.holding = null
                head.mode = 'board'
                sim.pulses.push({ slot, t: 0 })
                if (lab.setup.agent !== 'none') sim.drone.welds.push(slotPos(slot, head.size[1]))
              },
            }, { to: at.clone().setY(at.y + 1.3) })
          },
        },
      ]
    }
  }
  const target = arm.steps[0]?.to ?? REST
  const rush = 1 + Math.min(1.2, (sim.belt.length + sim.removals.length) * 0.2)
  tmp.copy(target).sub(arm.pos)
  const dist = tmp.length()
  const move = Math.min(dist * damp(11 * rush, dt), 18 * rush * dt)
  if (dist > 1e-5) arm.pos.addScaledVector(tmp, move / dist)
  if (arm.steps.length && arm.pos.distanceTo(target) < 0.05) {
    const s = arm.steps.shift()!
    if (s.arrive?.() === false) arm.steps = []
    if (!arm.steps.length) arm.job = null
  }
  arm.grip += ((arm.holding ? 1 : 0) - arm.grip) * damp(14, dt)
  if (arm.holding) {
    arm.holding.pos.copy(arm.pos).sub(grip(arm.holding))
    arm.holding.yaw += wrap(0 - arm.holding.yaw) * damp(6, dt)
  }

  for (const p of sim.list) {
    if (p.mode === 'board') {
      slotPos(p.slot, p.size[1], tmp)
      p.pos.lerp(tmp, damp(16, dt))
      p.yaw += wrap(0 - p.yaw) * damp(8, dt)
      p.scale = 1
    }
    if (!inBin(p.mode)) p.needsTexture = true
  }

  for (const pulse of sim.pulses) pulse.t += dt / 0.7
  sim.pulses = sim.pulses.filter((pulse) => pulse.t < 1)

  const drone = sim.drone
  drone.show += ((lab.setup.agent === 'none' ? 0 : 1) - drone.show) * damp(6, dt)
  if (lab.setup.agent === 'none') drone.welds = []
  const weld = drone.welds[0]
  if (weld) tmp.copy(weld).setY(weld.y + 1.25)
  else tmp.set(9.6 + Math.sin(sim.time * 0.6) * 2.6, 3.5 + Math.sin(sim.time * 2.1) * 0.15, -0.3 + Math.cos(sim.time * 0.45) * 2.2)
  drone.pos.lerp(tmp, damp(weld ? 5 : 1.6, dt))
  if (weld && drone.pos.distanceTo(tmp) < 0.25) {
    drone.weldT += dt
    if (drone.weldT > 0.9) {
      drone.welds.shift()
      drone.weldT = 0
    }
  }

  const e = sim.elev
  const top = L.stops[L.stops.length - 1]
  e.target = clamp(e.target, G_Y, top)
  if (!e.snapped && sim.time - e.touched > 0.35) {
    e.target = L.stops[nearestStop(L, e.target)]
    e.snapped = true
  }
  const ev = clamp((e.target - e.y) * 4.5, -40, 40)
  e.y += ev * dt
}

function nearestStop(L: Layout, y: number) {
  let best = 0
  for (let k = 1; k < L.stops.length; k++) if (Math.abs(L.stops[k] - y) < Math.abs(L.stops[best] - y)) best = k
  return best
}

function textTexture(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  draw(canvas.getContext('2d')!)
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 8
  return texture
}

function Box({ size, color, edge, position, children }: {
  size: [number, number, number]; color: string; edge: string; position?: [number, number, number]; children?: ReactNode
}) {
  return (
    <mesh position={position}>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} roughness={1} />
      <Edges color={edge} />
      {children}
    </mesh>
  )
}

const EDGE_PAIRS: [number, number][] = []
for (let a = 0; a < 8; a++) for (const bit of [1, 2, 4]) if (!(a & bit)) EDGE_PAIRS.push([a, a | bit])

function Stock({ sim, L, c, lab, matches, tip, at }: { sim: Sim; L: Layout; c: Colors; lab: Lab; matches: Set<number> | null; tip: Tip; at: number }) {
  const mesh = useRef<InstancedMesh>(null)
  const n = L.items.length
  const hovered = useRef(-1)
  const edges = useMemo(() => {
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(new Float32Array(n * 72), 3))
    g.setAttribute('color', new BufferAttribute(new Float32Array(n * 72), 3))
    return g
  }, [n])
  const tools = useMemo(() => {
    const m = new Matrix4(), q = new Quaternion(), up = new Vector3(0, 1, 0), s = new Vector3(), p = new Vector3()
    const bg = new Color(c.bg), edge = new Color(c.edge).lerp(bg, L.items.length > 500 ? 0.3 : 0), accent = new Color(ACCENT), col = new Color()
    return { m, q, up, s, p, bg, edge, accent, col }
  }, [c, L])
  const write = (i: number) => {
    const t = tools
    const part = sim.list[i]
    const show = inBin(part.mode)
    const [w, h, d] = part.size
    t.p.set(L.x[i], L.y[i], L.z[i])
    t.q.setFromAxisAngle(t.up, L.yaw[i])
    t.s.set(w * STOCK, h * STOCK, d * STOCK).multiplyScalar(show ? 1 : 0)
    t.m.compose(t.p, t.q, t.s)
    mesh.current!.setMatrixAt(i, t.m)
    const pos = edges.getAttribute('position') as BufferAttribute
    const cs = Math.cos(L.yaw[i]), sn = Math.sin(L.yaw[i])
    const hw = (w * STOCK) / 2, hh = (h * STOCK) / 2, hd = (d * STOCK) / 2
    EDGE_PAIRS.forEach(([a, b], k) => {
      for (const [v, corner] of [[0, a], [1, b]] as const) {
        const lx = corner & 1 ? hw : -hw, ly = corner & 2 ? hh : -hh, lz = corner & 4 ? hd : -hd
        const o = (i * 24 + k * 2 + v) * 3
        if (!show) pos.array.set([L.x[i], L.y[i], L.z[i]], o)
        else pos.array.set([L.x[i] + lx * cs + lz * sn, L.y[i] + ly, L.z[i] - lx * sn + lz * cs], o)
      }
    })
  }
  const paint = (i: number) => {
    const t = tools
    const item = L.items[i]
    const dimmed = matches && !matches.has(i)
    const hot = hovered.current === i || (matches?.has(i) ?? false) || sim.list[i].mode === 'pickQ'
    t.col.set(tint(item.hue, c)).lerp(t.bg, c.bg === '#090E11' ? 0.4 : 0.1)
    if (dimmed) t.col.lerp(t.bg, 0.8)
    mesh.current!.setColorAt(i, t.col)
    const ec = hot ? t.accent : dimmed ? t.col.copy(t.edge).lerp(t.bg, 0.75) : t.edge
    const col = edges.getAttribute('color') as BufferAttribute
    for (let k = 0; k < 24; k++) col.array.set([ec.r, ec.g, ec.b], (i * 24 + k) * 3)
  }
  const flush = () => {
    mesh.current!.instanceMatrix.needsUpdate = true
    if (mesh.current!.instanceColor) mesh.current!.instanceColor.needsUpdate = true
    edges.getAttribute('position').needsUpdate = true
    edges.getAttribute('color').needsUpdate = true
    mesh.current!.boundingSphere = null
  }
  useLayoutEffect(() => {
    for (let i = 0; i < n; i++) {
      write(i)
      paint(i)
    }
    flush()
    edges.computeBoundingSphere()
  })
  useEffect(() => {
    const near = (k: number) => Math.abs(L.floorOf[k] + 1 - at) <= 3
    let a = 0
    while (a < n && !near(a)) a++
    let b = a
    while (b < n && near(b)) b++
    edges.setDrawRange(a * 24, (b - a) * 24)
  }, [at, L, n, edges])
  useFrame(() => {
    if (!sim.stockChanged.size) return
    for (const i of sim.stockChanged) {
      write(i)
      paint(i)
    }
    sim.stockChanged.clear()
    flush()
  })
  const setHover = (i: number) => {
    const old = hovered.current
    hovered.current = i
    if (old >= 0) paint(old)
    if (i >= 0) paint(i)
    flush()
  }
  return (
    <group>
      <instancedMesh
        key={n}
        ref={mesh}
        args={[undefined, undefined, n]}
        frustumCulled={false}
        onPointerMove={(e) => {
          e.stopPropagation()
          const i = e.instanceId ?? -1
          if (i !== hovered.current) {
            setHover(i)
            const item = L.items[i]
            if (item) {
              const bin = lab.warehouse.bins.get(item.ref)
              tip.show(e.nativeEvent, item.title, `${bin?.code ?? ''} · ${item.label} · ${item.sourceName ?? item.source}`, lab.selected.has(item.ref) ? 'click to send back' : 'click to pick', lab.theme === 'dark' ? (item.imageDark ?? item.image) : item.image)
            }
          }
          tip.move(e.nativeEvent)
        }}
        onPointerOut={() => {
          setHover(-1)
          tip.hide()
        }}
        onClick={(e) => {
          if (e.delta > 6 || e.instanceId === undefined) return
          e.stopPropagation()
          lab.toggle(L.items[e.instanceId].ref)
        }}
        onContextMenu={(e) => {
          if (e.instanceId === undefined || !lab.inspect) return
          e.nativeEvent.preventDefault()
          lab.inspect(L.items[e.instanceId].ref)
        }}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshLambertMaterial />
      </instancedMesh>
      <lineSegments geometry={edges} frustumCulled={false} raycast={() => null}>
        <lineBasicMaterial vertexColors />
      </lineSegments>
    </group>
  )
}

function latticeGeometry(L: Layout, c: Colors) {
  const pos: number[] = []
  const col: number[] = []
  const base = new Color(c.line)
  const push = (a: number[], b: number[], k: Color) => {
    pos.push(...a, ...b)
    col.push(k.r, k.g, k.b, k.r, k.g, k.b)
  }
  const pt = (colF: number, r: number, y: number) => {
    const p = place(L.shape, L.C, r, colF)
    return [L.cx + p.x, y, L.cz + p.z]
  }
  const SUB = 3
  for (const f of L.floors) {
    const hue = new Color(tint(f.aisle.hue, c, c.l - 4))
    for (const r of [L.R - DEPTH, L.R + DEPTH])
      for (let row = 0; row <= f.rows; row++)
        for (let k = 0; k < L.C * SUB; k++) {
          const a = -0.5 + k / SUB, b = a + 1 / SUB
          const y = f.y0 + row * ROW_H
          push(pt(a, r, y + lift(L.shape, L.C, a)), pt(b, r, y + lift(L.shape, L.C, b)), row === 0 ? hue : base)
        }
    const slab = f.y0 - 0.16
    for (const r of [L.R - DEPTH - 0.25, L.R + DEPTH + 0.35])
      for (let k = 0; k < L.C * SUB; k++) {
        const a = -0.5 + k / SUB, b = a + 1 / SUB
        push(pt(a, r, slab), pt(b, r, slab), hue)
      }
    for (const rack of f.racks) {
      const a = rack.c0 - 0.5
      push(pt(a, L.R - DEPTH - 0.25, slab), pt(a, L.R + DEPTH + 0.35, slab), hue)
      push(pt(a, L.R + DEPTH + 0.35, slab), pt(a, L.R + DEPTH + 0.35, f.y1), hue)
    }
  }
  for (let k = 0; k < L.C; k++)
    for (const r of [L.R - DEPTH, L.R + DEPTH]) push(pt(k + 0.5, r, 0), pt(k + 0.5, r, L.top), base)
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
  g.setAttribute('color', new BufferAttribute(new Float32Array(col), 3))
  return g
}

function Tower({ L, c, at }: { L: Layout; c: Colors; at: number }) {
  const lattice = useMemo(() => latticeGeometry(L, c), [L, c])
  const labels = useMemo(
    () =>
      L.floors.map((f) =>
        textTexture(768, 256, (ctx) => {
          ctx.fillStyle = c.fg
          ctx.font = `300 190px ${FONT}`
          ctx.textBaseline = 'alphabetic'
          ctx.fillText(pad2(f.index + 1), 8, 200)
          const x = 300
          ctx.fillStyle = tint(f.aisle.hue, c, c.l - 6)
          ctx.fillRect(x, 70, 8, 70)
          ctx.fillStyle = c.fg
          ctx.font = `500 52px ${FONT}`
          const label = f.aisle.label.length > 16 ? `${f.aisle.label.slice(0, 15)}…` : f.aisle.label
          ctx.fillText(label.toUpperCase(), x + 26, 124)
          ctx.fillStyle = c.muted
          ctx.font = `400 34px ${FONT}`
          ctx.fillText(`${f.aisle.count.toLocaleString()} parts · ${f.aisle.racks.length} source${f.aisle.racks.length === 1 ? '' : 's'}`, x + 26, 182)
        }),
      ),
    [L, c],
  )
  const sprites = useRef<(Sprite | null)[]>([])
  const { camera } = useThree()
  useFrame(() => {
    const az = Math.atan2(camera.position.x - L.cx, camera.position.z - L.cz)
    const lx = -Math.cos(az), lz = Math.sin(az)
    const inside = Math.hypot(camera.position.x - L.cx, camera.position.z - L.cz) < L.R + 1
    L.floors.forEach((f, k) => {
      const s = sprites.current[k]
      if (!s) return
      const h = clamp((f.y1 - f.y0) * 0.8, 1.3, 2.6)
      const r = L.R + DEPTH + 0.8 + h * 1.5
      s.position.set(L.cx + lx * r, f.mid, L.cz + lz * r)
      s.scale.set(h * 3, h, 1)
      s.visible = !inside || Math.abs(k + 1 - at) <= 2
    })
  })
  return (
    <group>
      <lineSegments geometry={lattice} raycast={() => null}>
        <lineBasicMaterial vertexColors />
      </lineSegments>
      {L.floors.map((f, k) => (
        <group key={f.aisle.id}>
          <mesh position={[L.cx, f.y0 - 0.2, L.cz]} rotation={[0, L.shape === 'square' ? Math.PI / 4 : 0, 0]} raycast={() => null}>
            <cylinderGeometry args={[(L.shape === 'square' ? Math.SQRT2 * Math.PI / 4 : 1) * (L.R + DEPTH + 0.35), (L.shape === 'square' ? Math.SQRT2 * Math.PI / 4 : 1) * (L.R + DEPTH + 0.35), 0.08, L.shape === 'square' ? 4 : 64, 1, true]} />
            <meshBasicMaterial color={tint(f.aisle.hue, c)} transparent opacity={k + 1 === at ? 0.5 : 0.18} side={DoubleSide} depthWrite={false} />
          </mesh>
          <sprite ref={(s) => { sprites.current[k] = s }}>
            <spriteMaterial map={labels[k]} transparent opacity={k + 1 === at ? 1 : 0.55} depthWrite={false} />
          </sprite>
        </group>
      ))}
      <RackLabels L={L} c={c} at={at} />
    </group>
  )
}

const rackCache = new Map<string, Texture>()
function RackLabels({ L, c, at }: { L: Layout; c: Colors; at: number }) {
  const near = L.floors.filter((f) => Math.abs(f.index + 1 - at) <= 1)
  const group = useRef<Group>(null)
  const { camera } = useThree()
  useFrame(() => {
    for (const s of group.current?.children ?? []) s.visible = s.position.distanceTo(camera.position) > 7
  })
  return (
    <group ref={group}>
      {near.flatMap((f) =>
        f.racks.map((rack, k) => {
          const key = `${c.bg}-${f.aisle.id}-${k}-${rack.count}`
          let map = rackCache.get(key)
          if (!map) {
            map = textTexture(512, 80, (ctx) => {
              ctx.fillStyle = tint(f.aisle.hue, c, c.l - 8)
              ctx.fillRect(0, 22, 6, 36)
              ctx.fillStyle = c.fg
              ctx.font = `500 34px ${FONT}`
              ctx.fillText(rack.name.length > 20 ? `${rack.name.slice(0, 19)}…` : rack.name, 18, 52)
              ctx.fillStyle = c.muted
              ctx.font = `400 28px ${FONT}`
              ctx.textAlign = 'right'
              ctx.fillText(String(rack.count), 504, 52)
            })
            rackCache.set(key, map)
          }
          const p = place(L.shape, L.C, L.R + DEPTH + 0.9, (rack.c0 + rack.c1) / 2)
          return (
            <sprite key={key} position={[L.cx + p.x, f.y0 - 0.45, L.cz + p.z]} scale={[2.4, 0.375, 1]}>
              <spriteMaterial map={map} transparent depthWrite={false} />
            </sprite>
          )
        }),
      )}
    </group>
  )
}

function Mast({ sim, c }: { sim: Sim; c: Colors }) {
  const L = sim.layout
  const car = useRef<Group>(null)
  const fork = useRef<Group>(null)
  const beacon = useRef<Mesh>(null)
  const [busy, setBusy] = useState(false)
  useFrame(() => {
    const cr = sim.crane
    car.current!.position.set(L.cx, cr.y, L.cz)
    car.current!.rotation.y = cr.theta
    const dist = cr.job ? L.dist[cr.job.p.i] : L.R
    const len = cr.fork * (dist - CAR_R)
    fork.current!.scale.z = Math.max(0.001, len)
    fork.current!.visible = len > 0.01
    beacon.current!.scale.setScalar(0.8 + Math.sin(sim.time * 6) * 0.25)
    const b = !!cr.job
    if (b !== busy) setBusy(b)
  })
  const rings = useMemo(() => {
    const out: [number, number, number][] = []
    for (let y = 0.8; y < L.top + 1.2; y += 1.6)
      for (let k = 0; k < 24; k++) {
        const a = (k / 24) * Math.PI * 2, b = ((k + 1) / 24) * Math.PI * 2
        out.push([L.cx + Math.sin(a) * 0.3, y, L.cz + Math.cos(a) * 0.3], [L.cx + Math.sin(b) * 0.3, y, L.cz + Math.cos(b) * 0.3])
      }
    for (const [x, z] of [[0.3, 0], [-0.3, 0], [0, 0.3], [0, -0.3]]) out.push([L.cx + x, 0.6, L.cz + z], [L.cx + x, L.top + 1.2, L.cz + z])
    for (const [x, z] of [[0.48, 0.48], [-0.48, -0.48]]) out.push([L.cx + x, 0, L.cz + z], [L.cx + x, L.top + 1.2, L.cz + z])
    return out
  }, [L])
  const hi = busy ? ACCENT : c.edge
  return (
    <group>
      <Line points={rings} segments color={c.edge} lineWidth={1} />
      <mesh position={[L.cx, (L.top + 1.8) / 2, L.cz]} raycast={() => null}>
        <cylinderGeometry args={[0.3, 0.3, L.top + 0.6, 20, 1, true]} />
        <meshBasicMaterial color={ACCENT} transparent opacity={0.07} depthWrite={false} side={DoubleSide} />
      </mesh>
      <mesh ref={beacon} position={[L.cx, L.top + 1.35, L.cz]}>
        <sphereGeometry args={[0.16, 12, 12]} />
        <meshBasicMaterial color={ACCENT} toneMapped={false} />
      </mesh>
      <group ref={car}>
        <Box size={[1.25, 0.34, 1.25]} position={[0, -0.36, 0]} color={c.surface} edge={hi} />
        <Box size={[0.5, 0.2, 0.3]} position={[0, -0.12, CAR_R - 0.1]} color={c.surface} edge={hi} />
        <group ref={fork} position={[0, -0.13, CAR_R]}>
          {[-0.2, 0.2].map((x) => (
            <mesh key={x} position={[x, 0, 0.5]}>
              <boxGeometry args={[0.06, 0.03, 1]} />
              <meshBasicMaterial color={ACCENT} toneMapped={false} />
            </mesh>
          ))}
        </group>
      </group>
    </group>
  )
}

function Tubes({ L, c }: { L: Layout; c: Colors }) {
  const lines = (pts: Vector3[]) => [0.26, -0.26].map((o) => pts.map((p) => [p.x, p.y + o, p.z] as [number, number, number]))
  return (
    <group>
      {[L.send, L.back].map((pts, k) => (
        <group key={k}>
          {lines(pts).map((pp, j) => (
            <Line key={j} points={pp} color={k ? c.edge : ACCENT} lineWidth={1} transparent opacity={k ? 1 : 0.8} />
          ))}
          <mesh raycast={() => null}>
            <tubeGeometry args={[new CatmullRomCurve3(pts), 48, 0.26, 10, false]} />
            <meshBasicMaterial color={k ? c.edge : ACCENT} transparent opacity={0.07} depthWrite={false} />
          </mesh>
        </group>
      ))}
      <mesh position={[FUNNEL.x, FUNNEL.y + 0.2, FUNNEL.z]} raycast={() => null}>
        <cylinderGeometry args={[0.55, 0.28, 0.5, 24, 1, true]} />
        <meshStandardMaterial color={c.surface} roughness={1} side={DoubleSide} />
        <Edges color={c.edge} threshold={20} />
      </mesh>
    </group>
  )
}

function Belt({ c }: { c: Colors }) {
  const slats = useRef<(Mesh | null)[]>([])
  const len = BELT.end - BELT.start + 1.0
  const n = 22
  useFrame(({ clock }) => {
    const offset = (clock.elapsedTime * BELT.speed) % (len / n)
    slats.current.forEach((m, i) => {
      if (m) m.position.x = BELT.start - 0.5 + ((i * len) / n + offset) % len
    })
  })
  const mid = (BELT.start + BELT.end) / 2
  return (
    <group>
      <Box size={[len, 0.42, 1.3]} position={[mid, BELT.y - 0.29, BELT.z]} color={c.surface} edge={c.edge} />
      <Box size={[len + 0.1, 0.16, 0.08]} position={[mid, BELT.y + 0.0, BELT.z - 0.7]} color={c.surface} edge={c.edge} />
      <Box size={[len + 0.1, 0.16, 0.08]} position={[mid, BELT.y + 0.0, BELT.z + 0.7]} color={c.surface} edge={c.edge} />
      {[BELT.start - 0.5, BELT.end + 0.5].map((x) => (
        <mesh key={x} position={[x, BELT.y - 0.25, BELT.z]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.25, 0.25, 1.34, 24]} />
          <meshStandardMaterial color={c.surface} roughness={1} />
          <Edges color={c.edge} threshold={20} />
        </mesh>
      ))}
      {[[BELT.start + 0.4, 0.95], [BELT.end - 0.4, 0.95], [BELT.start + 0.4, 2.25], [BELT.end - 0.4, 2.25]].map(([x, z]) => (
        <Box key={`${x}${z}`} size={[0.12, BELT.y - 0.5, 0.12]} position={[x, (BELT.y - 0.5) / 2, z]} color={c.surface} edge={c.edge} />
      ))}
      {Array.from({ length: n }, (_, i) => (
        <mesh key={i} ref={(m) => { slats.current[i] = m }} position={[0, BELT.y - 0.07, BELT.z]}>
          <boxGeometry args={[0.02, 0.01, 1.2]} />
          <meshBasicMaterial color={c.edge} />
        </mesh>
      ))}
    </group>
  )
}

function Arm({ sim, c }: { sim: Sim; c: Colors }) {
  const turret = useRef<Group>(null)
  const shoulder = useRef<Group>(null)
  const elbow = useRef<Group>(null)
  const wrist = useRef<Group>(null)
  const fingers = useRef<(Group | null)[]>([])
  const [busy, setBusy] = useState(false)
  useFrame(() => {
    const w = sim.arm.pos
    const dx = w.x - BASE.x, dz = w.z - BASE.z
    const yaw = Math.atan2(-dz, dx)
    const r = Math.max(Math.hypot(dx, dz), 0.001)
    const h = w.y - H0
    const d = clamp(Math.hypot(r, h), Math.abs(L1 - L2) + 0.05, L1 + L2 - 0.01)
    const phi = Math.atan2(h, r)
    const a = Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1))
    const t1 = phi + a
    const t2 = Math.atan2(h - L1 * Math.sin(t1), r - L1 * Math.cos(t1))
    turret.current!.rotation.y = yaw
    shoulder.current!.rotation.z = t1
    elbow.current!.rotation.z = t2 - t1
    wrist.current!.rotation.z = -t2
    const open = 0.36 - sim.arm.grip * 0.1
    fingers.current.forEach((f, i) => f && (f.position.z = (i ? 1 : -1) * open))
    const holding = !!sim.arm.holding
    if (holding !== busy) setBusy(holding)
  })
  const hi = busy ? ACCENT : c.edge
  const joint = (key: string, radius: number, length: number) => (
    <mesh key={key} rotation={[Math.PI / 2, 0, 0]}>
      <cylinderGeometry args={[radius, radius, length, 28]} />
      <meshStandardMaterial color={c.surface} roughness={1} />
      <Edges color={c.edge} threshold={20} />
    </mesh>
  )
  return (
    <group position={[BASE.x, 0, BASE.z]}>
      <mesh position={[0, 0.18, 0]}>
        <cylinderGeometry args={[0.9, 1.0, 0.36, 40]} />
        <meshStandardMaterial color={c.surface} roughness={1} />
        <Edges color={c.edge} threshold={20} />
      </mesh>
      <group ref={turret}>
        <mesh position={[0, (H0 + 0.36) / 2, 0]}>
          <cylinderGeometry args={[0.38, 0.5, H0 - 0.36, 28]} />
          <meshStandardMaterial color={c.surface} roughness={1} />
          <Edges color={c.edge} threshold={20} />
        </mesh>
        <group ref={shoulder} position={[0, H0, 0]}>
          {joint('s', 0.42, 0.9)}
          <Box size={[L1, 0.3, 0.3]} position={[L1 / 2, 0, 0.3]} color={c.surface} edge={c.edge} />
          <Box size={[L1, 0.3, 0.3]} position={[L1 / 2, 0, -0.3]} color={c.surface} edge={c.edge} />
          <group ref={elbow} position={[L1, 0, 0]}>
            {joint('e', 0.36, 0.95)}
            <Box size={[L2, 0.34, 0.34]} position={[L2 / 2, 0, 0]} color={c.surface} edge={c.edge} />
            <group ref={wrist} position={[L2, 0, 0]}>
              {joint('w', 0.24, 0.6)}
              <Box size={[0.5, 0.3, 0.86]} position={[0, -0.32, 0]} color={c.surface} edge={hi} />
              {[0, 1].map((i) => (
                <group key={i} ref={(g) => { fingers.current[i] = g }}>
                  <Box size={[0.36, 0.38, 0.06]} position={[0, -0.62, 0]} color={c.surface} edge={hi} />
                </group>
              ))}
            </group>
          </group>
        </group>
      </group>
    </group>
  )
}

function Board({ lab, sim, c, tip }: { lab: Lab; sim: Sim; c: Colors; tip: Tip }) {
  const traces = useRef<({ material: { color: Color; linewidth: number } } | null)[]>([])
  const pulses = useRef<(Mesh | null)[]>([])
  const chipRefs = useRef<Record<string, Group | null>>({})
  const bump = useRef<Record<string, number>>({ framework: 0, database: 0 })
  const lit = useMemo(() => new Color(ACCENT), [])
  const dim = useMemo(() => new Color(c.dim), [c.dim])
  useFrame((_, dt) => {
    traces.current.forEach((line, s) => {
      if (!line) return
      const on = sim.slots[s]?.mode === 'board'
      line.material.color.copy(on ? lit : dim)
      line.material.linewidth = on ? 2.6 : 1
    })
    pulses.current.forEach((m, i) => {
      const pulse = sim.pulses[i]
      if (!m) return
      m.visible = !!pulse
      if (!pulse) return
      const path = TRACES[pulse.slot % TRACES.length]
      const total = path.slice(1).reduce((sum, p, k) => sum + p.distanceTo(path[k]), 0)
      let left = pulse.t * total
      for (let k = 1; k < path.length; k++) {
        const seg = path[k].distanceTo(path[k - 1])
        if (left <= seg || k === path.length - 1) {
          m.position.lerpVectors(path[k - 1], path[k], clamp(left / seg, 0, 1))
          break
        }
        left -= seg
      }
    })
    for (const key of ['framework', 'database'] as const) {
      bump.current[key] = Math.max(0, bump.current[key] - dt * 3)
      const g = chipRefs.current[key]
      if (g) g.position.y = Math.sin(bump.current[key] * Math.PI) * 0.6
    }
  })
  const chipTexture = useMemo(() => {
    const make = (title: string, value: string) =>
      textTexture(340, 340, (ctx) => {
        ctx.fillStyle = '#1D2225'
        ctx.fillRect(0, 0, 340, 340)
        ctx.strokeStyle = ACCENT
        ctx.lineWidth = 3
        ctx.strokeRect(18, 18, 304, 304)
        ctx.beginPath()
        ctx.arc(46, 46, 9, 0, Math.PI * 2)
        ctx.stroke()
        ctx.fillStyle = '#8A9094'
        ctx.font = `500 26px ${FONT}`
        ctx.fillText(title, 36, 140)
        ctx.fillStyle = '#FCFCFC'
        ctx.font = `500 ${value.length > 9 ? 38 : 50}px ${FONT}`
        ctx.fillText(value, 36, 200)
        ctx.fillStyle = '#8A9094'
        ctx.font = `400 20px ${FONT}`
        ctx.fillText('click to swap ↻', 36, 290)
      })
    return {
      framework: make('FRAMEWORK', frameworks.find((f) => f.value === lab.setup.framework)!.label),
      database: make('DATABASE', databases.find((d) => d.value === lab.setup.database)!.label),
    }
  }, [lab.setup.framework, lab.setup.database])
  const cycle = (key: 'framework' | 'database') => {
    bump.current[key] = 1
    if (key === 'framework') lab.set('framework', lab.setup.framework === 'next' ? 'tanstack' : 'next')
    else lab.set('database', lab.setup.database === 'postgres' ? 'mongodb' : 'postgres')
  }
  const cx = (BOARD.x0 + BOARD.x1) / 2, cz = (BOARD.z0 + BOARD.z1) / 2
  const pin = (chip: Vector3) => {
    const pts: [number, number, number][] = []
    const y = BOARD.y + 0.01
    for (let k = 0; k < 7; k++) {
      const o = -0.66 + k * 0.22
      const e = CHIP / 2
      pts.push([chip.x + o, y, chip.z - e], [chip.x + o, y, chip.z - e - 0.16], [chip.x + o, y, chip.z + e], [chip.x + o, y, chip.z + e + 0.16])
      pts.push([chip.x - e, y, chip.z + o], [chip.x - e - 0.16, y, chip.z + o], [chip.x + e, y, chip.z + o], [chip.x + e + 0.16, y, chip.z + o])
    }
    return pts
  }
  return (
    <group>
      <Box size={[BOARD.x1 - BOARD.x0, 0.12, BOARD.z1 - BOARD.z0]} position={[cx, BOARD.y - 0.06, cz]} color={c.board} edge={c.edge} />
      {[[BOARD.x0 + 0.3, BOARD.z0 + 0.3], [BOARD.x1 - 0.3, BOARD.z0 + 0.3], [BOARD.x0 + 0.3, BOARD.z1 - 0.3], [BOARD.x1 - 0.3, BOARD.z1 - 0.3]].map(([x, z]) => (
        <mesh key={`${x}${z}`} position={[x, (BOARD.y - 0.12) / 2, z]}>
          <cylinderGeometry args={[0.12, 0.12, BOARD.y - 0.12, 16]} />
          <meshStandardMaterial color={c.surface} roughness={1} />
          <Edges color={c.edge} threshold={20} />
        </mesh>
      ))}
      {TRACES.map((points, s) => (
        <Line key={s} ref={(l) => { traces.current[s] = l as never }} points={points} color={c.dim} lineWidth={1} />
      ))}
      {SLOTS.map((s, i) => {
        const y = BOARD.y + 0.014
        return (
          <Line key={i} points={[[s.x - 0.5, y, s.z - 0.38], [s.x + 0.5, y, s.z - 0.38], [s.x + 0.5, y, s.z + 0.38], [s.x - 0.5, y, s.z + 0.38], [s.x - 0.5, y, s.z - 0.38]]} color={c.dim} lineWidth={1} />
        )
      })}
      {(['framework', 'database'] as const).map((key) => (
        <group key={key} ref={(g) => { chipRefs.current[key] = g }}>
          <Line points={pin(CHIPS[key])} segments color={c.edge} lineWidth={1.4} />
          <mesh
            position={[CHIPS[key].x, BOARD.y + 0.14, CHIPS[key].z]}
            onClick={(e) => { e.stopPropagation(); cycle(key) }}
            onPointerOver={(e) => { e.stopPropagation(); tip.show(e.nativeEvent, key === 'framework' ? 'Framework chip' : 'Database chip', 'Click to swap') }}
            onPointerMove={(e) => tip.move(e.nativeEvent)}
            onPointerOut={() => tip.hide()}
          >
            <boxGeometry args={[CHIP, 0.28, CHIP]} />
            <meshStandardMaterial attach="material-0" color="#1D2225" roughness={1} />
            <meshStandardMaterial attach="material-1" color="#1D2225" roughness={1} />
            <meshBasicMaterial attach="material-2" map={chipTexture[key]} toneMapped={false} />
            <meshStandardMaterial attach="material-3" color="#1D2225" roughness={1} />
            <meshStandardMaterial attach="material-4" color="#1D2225" roughness={1} />
            <meshStandardMaterial attach="material-5" color="#1D2225" roughness={1} />
            <Edges color={c.edge} />
          </mesh>
        </group>
      ))}
      {Array.from({ length: 8 }, (_, i) => (
        <mesh key={i} ref={(m) => { pulses.current[i] = m }} visible={false}>
          <sphereGeometry args={[0.09, 12, 12]} />
          <meshBasicMaterial color={ACCENT} toneMapped={false} />
        </mesh>
      ))}
    </group>
  )
}

const loader = new TextureLoader()
function PartMesh({ p, lab, c, tip }: { p: Part; lab: Lab; c: Colors; tip: Tip }) {
  const ref = useRef<Mesh>(null)
  const [texture, setTexture] = useState<Texture | null>(null)
  const [hover, setHover] = useState(false)
  const requested = useRef(false)
  const image = lab.theme === 'dark' ? (p.item.imageDark ?? p.item.image) : p.item.image
  useEffect(() => {
    requested.current = false
    setTexture(null)
  }, [image])
  useFrame(() => {
    const m = ref.current
    if (!m) return
    m.visible = !inBin(p.mode)
    m.position.copy(p.pos)
    if (hover && p.mode === 'board') m.position.y += 0.14
    m.scale.setScalar(p.scale)
    m.rotation.set(p.spin * 0.3, p.yaw + p.spin, 0)
    if (p.needsTexture && image && !requested.current) {
      requested.current = true
      loader.load(image, (t) => {
        t.colorSpace = SRGBColorSpace
        t.anisotropy = 8
        const aspect = (t.image as HTMLImageElement).height / (t.image as HTMLImageElement).width
        const want = p.size[2] / p.size[0]
        if (aspect > want) {
          t.repeat.set(1, want / aspect)
          t.offset.set(0, 1 - want / aspect)
        }
        setTexture(t)
      })
    }
  })
  const side = tint(p.item.hue, c)
  const active = hover || p.mode !== 'board'
  const selected = lab.selected.has(p.item.ref)
  return (
    <mesh
      ref={ref}
      visible={false}
      onClick={(e) => { if (e.delta > 6) return; e.stopPropagation(); setHover(false); tip.hide(); lab.toggle(p.item.ref) }}
      onPointerOver={(e) => {
        e.stopPropagation()
        setHover(true)
        tip.show(e.nativeEvent, p.item.title, `${p.item.label} · ${p.item.sourceName ?? p.item.source}`, selected ? 'click to send back up the tower' : 'click to build')
      }}
      onPointerMove={(e) => tip.move(e.nativeEvent)}
      onPointerOut={() => { setHover(false); tip.hide() }}
    >
      <boxGeometry args={p.size} />
      {[0, 1, 3, 4, 5].map((i) => (
        <meshStandardMaterial key={i} attach={`material-${i}`} color={side} roughness={1} />
      ))}
      {texture ? (
        <meshBasicMaterial attach="material-2" map={texture} toneMapped={false} />
      ) : (
        <meshStandardMaterial attach="material-2" color={tint(p.item.hue, c, c.l + 12)} roughness={1} />
      )}
      <Edges color={active ? ACCENT : c.edge} />
    </mesh>
  )
}

function Drone({ sim, lab, c }: { sim: Sim; lab: Lab; c: Colors }) {
  const group = useRef<Group>(null)
  const rotors = useRef<(Group | null)[]>([])
  const glow = useRef<Mesh>(null)
  const points = useRef<Points>(null)
  const N = 90
  const state = useMemo(() => ({ pos: new Float32Array(N * 3).fill(-99), vel: new Float32Array(N * 3), life: new Float32Array(N), next: 0 }), [])
  useFrame((_, dt) => {
    const g = group.current!
    const d = sim.drone
    g.position.copy(d.pos)
    g.scale.setScalar(Math.max(0.001, d.show))
    g.rotation.z = Math.sin(sim.time * 1.7) * 0.06
    rotors.current.forEach((r) => r && (r.rotation.y += dt * 30))
    const weld = d.welds[0]
    const welding = !!weld && d.weldT > 0
    glow.current!.visible = welding
    if (welding) {
      glow.current!.position.copy(weld).setY(weld.y + 0.06)
      glow.current!.scale.setScalar(0.6 + Math.random() * 0.8)
      for (let k = 0; k < 4; k++) {
        const i = state.next++ % N
        state.pos.set([weld.x + (Math.random() - 0.5) * 0.4, weld.y + 0.06, weld.z + (Math.random() - 0.5) * 0.3], i * 3)
        const a = Math.random() * Math.PI * 2, s = 1 + Math.random() * 2.4
        state.vel.set([Math.cos(a) * s, 1.5 + Math.random() * 3, Math.sin(a) * s], i * 3)
        state.life[i] = 0.35 + Math.random() * 0.35
      }
    }
    for (let i = 0; i < N; i++) {
      if (state.life[i] <= 0) {
        state.pos[i * 3 + 1] = -99
        continue
      }
      state.life[i] -= dt
      state.vel[i * 3 + 1] -= 14 * dt
      state.pos[i * 3] += state.vel[i * 3] * dt
      state.pos[i * 3 + 1] = Math.max(BOARD.y + 0.02, state.pos[i * 3 + 1] + state.vel[i * 3 + 1] * dt)
      state.pos[i * 3 + 2] += state.vel[i * 3 + 2] * dt
    }
    const attr = points.current!.geometry.getAttribute('position') as BufferAttribute
    attr.needsUpdate = true
  })
  const body = lab.setup.agent === 'codex' ? c.fg : '#D97757'
  const name = agents.find((a) => a.value === lab.setup.agent)?.label ?? ''
  const tag = useMemo(
    () =>
      textTexture(500, 100, (ctx) => {
        ctx.fillStyle = c.surface
        ctx.strokeStyle = c.edge
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.roundRect(4, 14, 492, 72, 36)
        ctx.fill()
        ctx.stroke()
        ctx.fillStyle = body
        ctx.beginPath()
        ctx.arc(46, 50, 10, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = c.fg
        ctx.font = `500 34px ${FONT}`
        ctx.fillText(`${name} is welding`, 70, 62)
      }),
    [c, body, name],
  )
  return (
    <>
      <group ref={group}>
        <Box size={[0.8, 0.22, 0.8]} color={c.surface} edge={body} />
        <Box size={[0.3, 0.14, 0.3]} position={[0, 0.18, 0]} color={body} edge={body} />
        {[[-0.62, -0.62], [0.62, -0.62], [-0.62, 0.62], [0.62, 0.62]].map(([x, z], i) => (
          <group key={i} position={[x, 0.12, z]}>
            <Line points={[[-x * 0.55, -0.02, -z * 0.55], [0, 0, 0]]} color={c.edge} lineWidth={1} />
            <group ref={(r) => { rotors.current[i] = r }}>
              <Line points={[[-0.34, 0.04, 0], [0.34, 0.04, 0]]} color={c.edge} lineWidth={1.4} />
              <Line points={[[0, 0.04, -0.34], [0, 0.04, 0.34]]} color={c.edge} lineWidth={1.4} />
            </group>
          </group>
        ))}
        <Line points={[[0, -0.11, 0], [0, -0.55, 0.1]]} color={body} lineWidth={1.6} />
        <sprite position={[0, 0.85, 0]} scale={[3.0, 0.6, 1]}>
          <spriteMaterial map={tag} transparent toneMapped={false} depthTest={false} />
        </sprite>
      </group>
      <mesh ref={glow} visible={false}>
        <sphereGeometry args={[0.12, 12, 12]} />
        <meshBasicMaterial color="#FFE2A8" toneMapped={false} />
      </mesh>
      <points ref={points} frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[state.pos, 3]} />
        </bufferGeometry>
        <pointsMaterial color="#FFB347" size={3.5} sizeAttenuation={false} toneMapped={false} />
      </points>
    </>
  )
}

function Cathedral({ L, c, dark }: { L: Layout; c: Colors; dark: boolean }) {
  const { scene } = useThree()
  useEffect(() => {
    scene.fog = new FogExp2(c.bg, L.items.length > 500 ? 0.0105 : 0.017)
    return () => {
      scene.fog = null
    }
  }, [scene, c.bg, L.items.length])
  const Rw = 30 + L.R * 2
  const windows = useMemo(() => {
    const pos: number[] = []
    const seg = (a: Vector3, b: Vector3) => pos.push(a.x, a.y, a.z, b.x, b.y, b.z)
    const N = 12
    const h = L.top * 0.9 + 6
    for (let k = 0; k < N; k++) {
      const a = (k / N) * Math.PI * 2 + 0.2
      const o = new Vector3(L.cx + Math.sin(a) * Rw, 0, L.cz + Math.cos(a) * Rw)
      const t = new Vector3(Math.cos(a), 0, -Math.sin(a))
      const w = 2.6 + L.R * 0.25
      const at = (u: number, v: number) => o.clone().addScaledVector(t, u).setY(v)
      for (const u of [-w, w, -w * 0.06, w * 0.06]) seg(at(u, 2), at(u, h))
      seg(at(-w, 2), at(w, 2))
      const arch = (from: number) => {
        let prev = at(from * w, h)
        for (let s = 1; s <= 10; s++) {
          const th = (s / 10) * (Math.PI / 3)
          const u = from * (w - 2 * w * (1 - Math.cos(th)))
          const v = h + 2 * w * Math.sin(th)
          const next = at(u, v)
          seg(prev, next)
          prev = next
        }
      }
      arch(-1)
      arch(1)
      const ro = h + w * 0.9
      let prev = at(w * 0.45, ro)
      for (let s = 1; s <= 20; s++) {
        const th = (s / 20) * Math.PI * 2
        const next = at(Math.cos(th) * w * 0.45, ro + Math.sin(th) * w * 0.45)
        seg(prev, next)
        prev = next
      }
      for (let v = 2 + h / 6; v < h; v += h / 6) seg(at(-w, v), at(w, v))
    }
    for (const r of [L.R + 2, L.R + 6, Rw]) {
      for (let s = 0; s < 96; s++) {
        const a = (s / 96) * Math.PI * 2, b = ((s + 1) / 96) * Math.PI * 2
        seg(new Vector3(L.cx + Math.sin(a) * r, 0.01, L.cz + Math.cos(a) * r), new Vector3(L.cx + Math.sin(b) * r, 0.01, L.cz + Math.cos(b) * r))
      }
    }
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
    return g
  }, [L, Rw])
  const shaftTex = useMemo(
    () =>
      textTexture(8, 256, (ctx) => {
        const g = ctx.createLinearGradient(0, 0, 0, 256)
        g.addColorStop(0, 'rgba(255,255,255,0)')
        g.addColorStop(0.15, 'rgba(255,255,255,1)')
        g.addColorStop(0.7, 'rgba(255,255,255,0.5)')
        g.addColorStop(1, 'rgba(255,255,255,0)')
        ctx.fillStyle = g
        ctx.fillRect(0, 0, 8, 256)
      }),
    [],
  )
  const shafts = useMemo(() => {
    const h = L.top * 0.9 + 6
    return [-0.9, -0.35, 0.25, 2.6].map((a, k) => {
      const from = new Vector3(L.cx + Math.sin(a) * Rw, h * (0.55 + 0.1 * k), L.cz + Math.cos(a) * Rw)
      const to = new Vector3(L.cx + Math.sin(a + 0.4) * (L.R * 0.5), 0, L.cz + Math.cos(a + 0.4) * (L.R * 0.5))
      const t = new Vector3(Math.cos(a), 0, -Math.sin(a))
      const w0 = 2.4, w1 = 5 + L.R * 0.6
      const g = new BufferGeometry()
      const v = [from.clone().addScaledVector(t, -w0), from.clone().addScaledVector(t, w0), to.clone().addScaledVector(t, -w1), to.clone().addScaledVector(t, w1)]
      g.setAttribute('position', new BufferAttribute(new Float32Array(v.flatMap((p) => [p.x, p.y, p.z])), 3))
      g.setAttribute('uv', new BufferAttribute(new Float32Array([0, 1, 1, 1, 0, 0, 1, 0]), 2))
      g.setIndex([0, 2, 1, 1, 2, 3])
      return g
    })
  }, [L, Rw])
  const dust = useRef<Points>(null)
  const motes = useMemo(() => {
    const n = 420
    const a = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      const r = Math.sqrt(Math.random()) * (L.R + 14), th = Math.random() * Math.PI * 2
      a.set([L.cx + Math.sin(th) * r, Math.random() * L.top, L.cz + Math.cos(th) * r], i * 3)
    }
    return a
  }, [L])
  useFrame((_, dt) => {
    const attr = dust.current!.geometry.getAttribute('position') as BufferAttribute
    for (let i = 0; i < motes.length / 3; i++) {
      motes[i * 3 + 1] += dt * (0.12 + (i % 7) * 0.03)
      if (motes[i * 3 + 1] > L.top) motes[i * 3 + 1] = 0
    }
    attr.needsUpdate = true
  })
  return (
    <group>
      <lineSegments geometry={windows} raycast={() => null}>
        <lineBasicMaterial color={c.edge} transparent opacity={0.7} />
      </lineSegments>
      {shafts.map((g, k) => (
        <mesh key={k} geometry={g} raycast={() => null}>
          <meshBasicMaterial
            map={shaftTex}
            color={dark ? '#7FB0C8' : '#FFFFFF'}
            transparent
            opacity={dark ? 0.13 : 0.75}
            blending={dark ? AdditiveBlending : NormalBlending}
            depthWrite={false}
            side={DoubleSide}
            fog={false}
          />
        </mesh>
      ))}
      <points ref={dust} frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[motes, 3]} />
        </bufferGeometry>
        <pointsMaterial color={dark ? '#9CC3D6' : '#8A9094'} size={2} sizeAttenuation={false} transparent opacity={0.55} />
      </points>
    </group>
  )
}

function Blueprint({ L, c }: { L: Layout; c: Colors }) {
  const x = L.cx - L.R - 3.2
  const ticks = useMemo(() => {
    const out: [number, number, number][] = [[x, 0, L.cz], [x, L.top, L.cz]]
    for (const f of L.floors) out.push([x - 0.3, f.y0, L.cz], [x + 0.3, f.y0, L.cz])
    out.push([x - 0.6, 0, L.cz], [x + 0.6, 0, L.cz], [x - 0.6, L.top, L.cz], [x + 0.6, L.top, L.cz])
    return out
  }, [L, x])
  const label = useMemo(
    () =>
      textTexture(512, 160, (ctx) => {
        ctx.fillStyle = ACCENT
        ctx.font = `500 56px ${FONT}`
        ctx.fillText(`H ${L.top.toFixed(1)} m`, 10, 64)
        ctx.fillStyle = c.muted
        ctx.font = `400 34px ${FONT}`
        ctx.fillText(`${L.floors.length} floors · ${L.items.length.toLocaleString()} bins`, 10, 120)
      }),
    [L, c],
  )
  return (
    <group>
      <Grid position={[L.cx, 0, L.cz]} args={[10, 10]} cellSize={PITCH} cellThickness={0.6} sectionSize={PITCH * 4} sectionThickness={1} cellColor={c.line} sectionColor={c.dim} fadeDistance={110} fadeStrength={1.4} infiniteGrid />
      <Line points={ticks} segments color={ACCENT} lineWidth={1} />
      <sprite position={[x - 0.2, L.top + 1.6, L.cz]} scale={[4.8, 1.5, 1]}>
        <spriteMaterial map={label} transparent depthWrite={false} />
      </sprite>
    </group>
  )
}

function Simulator({ sim, labRef }: { sim: Sim; labRef: { current: Lab } }) {
  useFrame((_, dt) => step(sim, labRef.current, Math.min(dt, 1 / 20)))
  return null
}

type Pose = { pos: Vector3; look: Vector3; fov: number; k: number }
function CameraRig({ sim, cfgRef }: { sim: Sim; cfgRef: { current: Config } }) {
  const { camera, size } = useThree()
  const st = useMemo(() => ({ pos: new Vector3(), look: new Vector3(), fov: 40, init: false, k: 3 }), [])
  const want = useMemo<Pose>(() => ({ pos: new Vector3(), look: new Vector3(), fov: 40, k: 3 }), [])
  useFrame((_, raw) => {
    const dt = Math.min(raw, 1 / 20)
    const L = sim.layout
    const cfg = cfgRef.current
    const aspect = size.width / size.height
    const narrow = aspect < 1.2 ? 1.5 : 1
    if (cfg.rig === 'orbit' && sim.time - sim.view.touched > 3) sim.view.az += dt * 0.025
    const az = sim.view.az
    const ey = sim.elev.y
    const firstMid = L.floors[0].mid
    const t = smooth(clamp((ey - G_Y) / (firstMid - G_Y), 0, 1))
    const cellX = (L.cx - L.R + 14) / 2
    const ground = new Vector3(cellX - 1.5, 3.2, 0.2)
    const span = (14 - (L.cx - L.R)) * 1.08
    const dG = span / (2 * Math.tan((20 * Math.PI) / 180)) / Math.min(aspect, 1.9) * 1.05 * narrow
    const dF = (L.R * 2.9 + 12) * narrow
    const axisY = new Vector3(L.cx - Math.cos(az) * L.R * 0.35, ey, L.cz + Math.sin(az) * L.R * 0.35)
    const orbit = (pose: Pose, el: number) => {
      pose.look.lerpVectors(ground, axisY, t)
      const d = dG * 1.5 + (dF - dG * 1.5) * t
      const e = el + (0.3 - el) * (1 - t)
      pose.pos.set(Math.sin(az) * Math.cos(e), Math.sin(e), Math.cos(az) * Math.cos(e)).multiplyScalar(d).add(pose.look)
      pose.fov = 40
      pose.k = 3
    }
    const ride = (pose: Pose, y: number, th: number) => {
      const r = L.R + 2.2 + L.R * 0.25
      pose.pos.set(L.cx + Math.sin(th + 0.42) * r, y + 1.5, L.cz + Math.cos(th + 0.42) * r)
      pose.look.set(L.cx + Math.sin(th) * L.R * 0.55, y - 0.1, L.cz + Math.cos(th) * L.R * 0.55)
      pose.fov = 62
      pose.k = 7
    }
    const cell = (pose: Pose) => {
      pose.look.set(0.5, 1.0, 0.4)
      pose.pos.set(4.5, 9.5, 14.5)
      pose.fov = 44 * Math.min(1.5, narrow)
      pose.k = 3
    }
    if (cfg.rig === 'orbit') orbit(want, 0.16)
    else if (cfg.rig === 'ride') {
      if (t < 0.5) orbit(want, 0.16)
      else ride(want, sim.crane.y, sim.crane.theta)
    } else {
      want.pos.set(ground.x + Math.sin(az) * dG * 0.8, 0.8, ground.z + Math.cos(az) * dG * 0.8)
      want.look.set(L.cx, Math.max(ey, FLOOR0 + 3) + 2, L.cz)
      want.look.lerpVectors(ground, want.look, t)
      want.fov = 66
      want.k = 3
    }

    const f = sim.follow
    const p = cfg.follow && f.ref && !f.paused ? sim.parts.get(f.ref) : undefined
    if (p) {
      const calm = f.adds.length >= 3
      const th = sim.crane.theta
      if (p.mode === 'pickQ' || p.mode === 'crane') {
        if (calm) {
          want.look.set(L.cx, sim.crane.y, L.cz)
          want.pos.set(Math.sin(az), 0.18, Math.cos(az)).multiplyScalar(dF).add(want.look)
          want.fov = 40
          want.k = 3
        } else ride(want, sim.crane.y, th)
      } else if (p.mode === 'tubeDown' && p.pos.y > MAST_BOTTOM + 0.6 && !calm) {
        want.pos.set(p.pos.x + Math.sin(th) * 1.3, p.pos.y + 3.4, p.pos.z + Math.cos(th) * 1.3)
        want.look.set(p.pos.x + Math.sin(th) * 0.2, p.pos.y - 4, p.pos.z + Math.cos(th) * 0.2)
        want.fov = 82
        want.k = 11
      } else if (p.mode === 'tubeDown' || p.mode === 'belt' || p.mode === 'held') cell(want)
      else if (p.mode === 'board') {
        if (!f.seatedAt) f.seatedAt = sim.time
        if (sim.time - f.seatedAt < 1.4) {
          want.look.copy(p.pos)
          want.pos.copy(p.pos).add(tmp.set(2.5, 7, 8.5))
          want.fov = 40
          want.k = 3
        } else f.ref = null
      } else f.ref = null
    }
    if (!st.init) {
      st.pos.copy(want.pos)
      st.look.copy(want.look)
      st.fov = want.fov
      st.init = true
    }
    st.k += (want.k - st.k) * damp(3, dt)
    st.pos.lerp(want.pos, damp(st.k, dt))
    st.look.lerp(want.look, damp(st.k * 1.3, dt))
    st.fov += (want.fov - st.fov) * damp(3, dt)
    const cam = camera as PerspectiveCamera
    Object.assign(window, { __hbCam: cam })
    cam.position.copy(st.pos)
    cam.lookAt(st.look)
    cam.fov = st.fov
    cam.updateProjectionMatrix()
  })
  return null
}

type Hud = { at: number; dir: number }
function HudProbe({ sim, onHud, alt }: { sim: Sim; onHud: (h: Hud) => void; alt: { current: HTMLSpanElement | null } }) {
  const last = useRef<Hud>({ at: -1, dir: 0 })
  const tick = useRef(0)
  useFrame((_, dt) => {
    const L = sim.layout
    const followed = sim.follow.ref && !sim.follow.paused ? sim.parts.get(sim.follow.ref) : undefined
    const riding = followed && (followed.mode === 'pickQ' || followed.mode === 'crane')
    const diving = followed?.mode === 'tubeDown'
    const y = diving ? followed.pos.y : riding ? sim.crane.y : sim.elev.y
    const at = nearestStop(L, y)
    const v = diving ? -(followed.tube?.v ?? 0) : riding ? sim.crane.vy : (sim.elev.target - sim.elev.y) * 4.5
    const dir = Math.abs(v) > 0.6 ? Math.sign(v) : 0
    if (at !== last.current.at || dir !== last.current.dir) {
      last.current = { at, dir }
      onHud(last.current)
    }
    tick.current += dt
    if (tick.current > 0.1 && alt.current) {
      tick.current = 0
      alt.current.textContent = `ALT ${y.toFixed(1)} m · CAR ${sim.crane.y.toFixed(1)} m`
    }
  })
  return null
}

function Scene({ lab, sim, labRef, tip, cfgRef, cfg, matches, onHud, alt, at }: {
  lab: Lab; sim: Sim; labRef: { current: Lab }; tip: Tip; cfgRef: { current: Config }; cfg: Config; matches: Set<number> | null
  onHud: (h: Hud) => void; alt: { current: HTMLSpanElement | null }; at: number
}) {
  const c = palette(lab.theme)
  const L = sim.layout
  const [active, setActive] = useState<Part[]>(() => sim.list.filter((p) => !inBin(p.mode)))
  const seen = useRef(sim.activeVersion)
  useFrame(() => {
    if (seen.current === sim.activeVersion) return
    seen.current = sim.activeVersion
    setActive(sim.list.filter((p) => !inBin(p.mode)))
  })
  const { gl } = useThree()
  useEffect(() => {
    gl.setClearColor(c.bg)
  }, [gl, c.bg])
  return (
    <>
      <CameraRig sim={sim} cfgRef={cfgRef} />
      <Simulator sim={sim} labRef={labRef} />
      <HudProbe sim={sim} onHud={onHud} alt={alt} />
      <ambientLight intensity={lab.theme === 'dark' ? 0.9 : 1.6} />
      <directionalLight position={[6, 12, 8]} intensity={lab.theme === 'dark' ? 0.9 : 1.4} />
      <hemisphereLight args={[c.surface, c.bg, 0.5]} />
      {cfg.world === 'cathedral' ? <Cathedral L={L} c={c} dark={lab.theme === 'dark'} /> : <Blueprint L={L} c={c} />}
      <Tower L={L} c={c} at={at} />
      <Stock sim={sim} L={L} c={c} lab={lab} matches={matches} tip={tip} at={at} />
      <Mast sim={sim} c={c} />
      <Tubes L={L} c={c} />
      <Belt c={c} />
      <Arm sim={sim} c={c} />
      <Board lab={lab} sim={sim} c={c} tip={tip} />
      {active.map((p) => (
        <PartMesh key={p.item.ref} p={p} lab={lab} c={c} tip={tip} />
      ))}
      <Drone sim={sim} lab={lab} c={c} />
    </>
  )
}

type Tip = { show: (e: PointerEvent, title: string, sub: string, hint?: string, image?: string) => void; move: (e: PointerEvent) => void; hide: () => void }
function useTip() {
  const ref = useRef<HTMLDivElement>(null)
  const api = useMemo<Tip>(() => {
    const move = (e: PointerEvent) => {
      const el = ref.current
      if (!el) return
      const x = Math.min(e.clientX + 16, innerWidth - el.offsetWidth - 8)
      const y = Math.min(e.clientY + 16, innerHeight - el.offsetHeight - 8)
      el.style.transform = `translate(${x}px, ${y}px)`
    }
    return {
      show: (e, title, sub, hint = '', image) => {
        const el = ref.current
        if (!el) return
        const img = el.querySelector('img')!
        if (image) {
          if (img.getAttribute('src') !== image) img.src = image
          img.style.display = 'block'
        } else img.style.display = 'none'
        el.querySelector('[data-title]')!.textContent = title
        el.querySelector('[data-sub]')!.textContent = sub
        el.querySelector('[data-hint]')!.textContent = hint
        el.style.opacity = '1'
        document.body.style.cursor = 'pointer'
        move(e)
      },
      move,
      hide: () => {
        if (ref.current) ref.current.style.opacity = '0'
        document.body.style.cursor = ''
      },
    }
  }, [])
  return [ref, api] as const
}

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: readonly { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex gap-0.5 rounded-md border border-border p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`rounded px-1.5 py-0.5 text-[11px] transition-colors ${o.value === value ? 'bg-accent text-accent-foreground' : 'text-muted hover:text-foreground'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Director({ cfg, setCfg, embedded }: { cfg: Config; setCfg: (c: Partial<Config>) => void; embedded: boolean }) {
  const [open, setOpen] = useState(!embedded && innerWidth >= 768)
  return (
    <div data-open={open} className="pointer-events-auto absolute left-2 top-[64px] z-20 w-[120px] rounded-xl md:left-4 md:top-[72px] md:w-[248px] data-[open=true]:w-[248px] border border-border bg-surface/90 p-2 text-[11px] shadow-lg backdrop-blur">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center justify-between px-1 text-muted">
        <span className="tracking-[0.18em]">DIRECTOR</span>
        <span>{open ? '–' : '+'}</span>
      </button>
      {open && (
        <div className="mt-2 grid grid-cols-[52px_1fr] items-center gap-x-2 gap-y-1.5 text-muted">
          <span>Camera</span>
          <Segmented value={cfg.rig} options={[{ value: 'orbit', label: 'orbit' }, { value: 'ride', label: 'ride car' }, { value: 'base', label: 'look up' }] as const} onChange={(rig) => setCfg({ rig })} />
          <span>Tower</span>
          <Segmented value={cfg.shape} options={[{ value: 'cylinder', label: 'cylinder' }, { value: 'square', label: 'square' }, { value: 'helix', label: 'helix' }] as const} onChange={(shape) => setCfg({ shape })} />
          <span>World</span>
          <Segmented value={cfg.world} options={[{ value: 'cathedral', label: 'cathedral' }, { value: 'void', label: 'blueprint' }] as const} onChange={(world) => setCfg({ world })} />
          <span>Follow</span>
          <Segmented value={cfg.follow ? 'on' : 'off'} options={[{ value: 'on', label: 'ride along' }, { value: 'off', label: 'off' }] as const} onChange={(v) => setCfg({ follow: v === 'on' })} />
        </div>
      )}
    </div>
  )
}

function Elevator({ L, hud, go, lab, matchCount, alt, embedded }: {
  L: Layout; hud: Hud; go: (stop: number) => void; lab: Lab; matchCount: Map<number, number> | null; alt: { current: HTMLSpanElement | null }; embedded: boolean
}) {
  const floor = hud.at > 0 ? L.floors[hud.at - 1] : null
  const [query, setQuery] = useState(lab.focus.query)
  return (
    <div className="pointer-events-auto absolute right-2 top-[64px] z-20 flex max-h-[calc(100%-88px)] w-[150px] flex-col gap-2 md:right-4 md:top-[72px] md:w-[232px]">
      {!embedded && (
        <input
          value={query}
          placeholder="Search the tower…"
          onChange={(e) => {
            setQuery(e.target.value)
            lab.setFocus({ query: e.target.value })
          }}
          className="hidden rounded-xl border border-border bg-surface/90 px-3 py-2 text-sm text-foreground shadow-lg outline-none backdrop-blur placeholder:text-muted focus:border-accent md:block"
        />
      )}
      <div className="rounded-xl border border-border bg-[#0B1114] p-3 font-mono text-[#CFE3EC] shadow-lg">
        <div className="flex items-center justify-between text-[10px] tracking-[0.2em] text-[#5E7E8C]">
          <span>FLOOR</span>
          <span className="text-[#5A91AD]" data-dir={hud.dir}>{hud.dir > 0 ? '▲' : hud.dir < 0 ? '▼' : '■'}</span>
        </div>
        <div className="flex items-end gap-3">
          <span className="text-[34px] leading-none md:text-[56px] tabular-nums text-[#8EC5DE] [text-shadow:0_0_14px_rgba(90,145,173,0.7)]" data-floor={hud.at}>
            {hud.at === 0 ? 'G' : pad2(hud.at)}
          </span>
          <div className="min-w-0 pb-1">
            <div className="truncate text-xs uppercase text-[#E6F1F6]">{floor ? floor.aisle.label : 'Assembly cell'}</div>
            <div className="text-[10px] text-[#5E7E8C]">
              {floor ? `${floor.aisle.count.toLocaleString()} bins · ${floor.aisle.racks.length} src` : `${lab.selected.size} seated`}
            </div>
          </div>
        </div>
        <span ref={alt} className="mt-1 block text-[10px] text-[#5E7E8C]" />
      </div>
      {!embedded && (
        <div className="hidden min-h-0 overflow-y-auto rounded-xl border border-border bg-surface/90 p-1 shadow-lg backdrop-blur md:block">
          {[...L.floors].reverse().map((f) => {
            const stop = f.index + 1
            const hits = matchCount?.get(f.index) ?? 0
            return (
              <button
                key={f.aisle.id}
                type="button"
                onClick={() => go(stop)}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-[3px] text-left text-[11px] ${hud.at === stop ? 'bg-accent text-accent-foreground' : 'text-muted hover:bg-background hover:text-foreground'} ${matchCount && !hits ? 'opacity-40' : ''}`}
              >
                <span className="w-5 font-mono tabular-nums">{pad2(stop)}</span>
                <span className="size-1.5 shrink-0 rounded-full" style={{ background: `hsl(${f.aisle.hue} 45% 58%)` }} />
                <span className="flex-1 truncate">{f.aisle.label}</span>
                <span className="font-mono tabular-nums opacity-70">{matchCount ? hits : f.aisle.count}</span>
              </button>
            )
          })}
          <button
            type="button"
            onClick={() => go(0)}
            className={`flex w-full items-center gap-2 rounded-md px-2 py-[3px] text-left text-[11px] ${hud.at === 0 ? 'bg-accent text-accent-foreground' : 'text-muted hover:bg-background hover:text-foreground'}`}
          >
            <span className="w-5 font-mono">G</span>
            <span className="size-1.5 shrink-0 rounded-full bg-accent" />
            <span className="flex-1 truncate">Assembly cell</span>
            <span className="font-mono tabular-nums opacity-70">{lab.selected.size}</span>
          </button>
        </div>
      )}
    </div>
  )
}

function Dispatch({ lab }: { lab: Lab }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(lab.command)
    } catch {}
    setCopied(true)
    setTimeout(() => setCopied(false), 1400)
  }
  return (
    <div className="pointer-events-auto absolute bottom-2 left-2 z-20 w-[min(460px,calc(100%-80px))] md:bottom-4 md:left-4 rounded-2xl border border-border bg-surface/92 p-3 shadow-lg backdrop-blur">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs tracking-wide text-muted">
          <span className="size-2 rounded-full bg-accent shadow-[0_0_8px_currentColor]" />
          DISPATCH
        </div>
        <span className="rounded-md bg-background px-2 py-0.5 font-mono text-xs tabular-nums" data-count={lab.selected.size}>
          {pad2(lab.selected.size)} parts seated
        </span>
      </div>
      <div className="mt-2 hidden flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-muted sm:flex">
        <Segmented value={lab.setup.target} options={[{ value: 'existing', label: 'add' }, { value: 'new', label: 'init' }] as const} onChange={(v) => lab.set('target', v)} />
        <Segmented value={lab.setup.packageManager} options={packageManagers} onChange={(v) => lab.set('packageManager', v)} />
        <Segmented value={lab.setup.agent} options={[{ value: 'none', label: 'no agent' }, { value: 'claude', label: 'claude' }, { value: 'codex', label: 'codex' }] as const} onChange={(v) => lab.set('agent', v)} />
      </div>
      <div className="mt-2 line-clamp-2 rounded-lg bg-background px-2 py-1.5 font-mono text-[11px] leading-snug text-foreground [overflow-wrap:anywhere]">
        <span className="text-accent">$ </span>
        {lab.command}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <button type="button" onClick={copy} className="rounded-lg bg-accent px-3 py-1.5 text-sm text-accent-foreground active:scale-[0.98]">
          {copied ? 'Copied' : 'Copy command'}
        </button>
        <button type="button" onClick={() => lab.clear()} disabled={!lab.selected.size} className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted hover:text-foreground disabled:opacity-40">
          Return all
        </button>
        <span className="ml-auto hidden text-[10px] leading-tight text-muted sm:block">scroll: elevator · drag: orbit<br />click a bin to pick it</span>
      </div>
    </div>
  )
}

export default function HighBay({ lab }: MockProps) {
  const labRef = useRef(lab)
  labRef.current = lab
  const embedded = lab.chrome === 'embedded'
  const [cfg, setCfgState] = useState<Config>({ rig: 'orbit', shape: 'cylinder', world: 'cathedral', follow: true })
  const cfgRef = useRef(cfg)
  cfgRef.current = cfg
  const layout = useMemo(() => buildLayout(lab, cfg.shape), [lab.warehouse, lab.scale, cfg.shape])
  const [sim] = useState(() => createSim(lab, layout))
  if (sim.layout !== layout) {
    sim.layout = layout
    for (const p of sim.list) if (inBin(p.mode)) p.pos.set(layout.x[p.i], layout.y[p.i], layout.z[p.i])
  }
  const setCfg = (next: Partial<Config>) => setCfgState((current) => ({ ...current, ...next }))
  const [tipRef, tip] = useTip()
  const [hud, setHud] = useState<Hud>({ at: 0, dir: 0 })
  const alt = useRef<HTMLSpanElement>(null)

  const query = lab.focus.query.trim().toLowerCase()
  const matches = useMemo(() => {
    if (!query) return null
    const out = new Set<number>()
    layout.items.forEach((item, i) => {
      if (`${item.title} ${item.label} ${item.ref}`.toLowerCase().includes(query)) out.add(i)
    })
    return out
  }, [query, layout])
  const matchCount = useMemo(() => {
    if (!matches) return null
    const out = new Map<number, number>()
    for (const i of matches) out.set(layout.floorOf[i], (out.get(layout.floorOf[i]) ?? 0) + 1)
    return out
  }, [matches, layout])

  const go = (stop: number) => {
    sim.elev.target = layout.stops[stop]
    sim.elev.snapped = true
    sim.follow.paused = true
    lab.setFocus({ category: stop > 0 ? layout.floors[stop - 1].aisle.id : 'all' })
  }
  useEffect(() => {
    const f = layout.floors.find((floor) => floor.aisle.id === lab.focus.category)
    if (!f) return
    sim.elev.target = f.mid
    sim.elev.snapped = true
    sim.follow.paused = true
  }, [lab.focus.category])
  useEffect(() => {
    if (!matchCount || !matchCount.size) return
    const best = [...matchCount].sort((a, b) => b[1] - a[1])[0][0]
    sim.elev.target = layout.floors[best].mid
    sim.elev.snapped = true
    sim.follow.paused = true
  }, [matchCount])

  useEffect(() => {
    Object.assign(window, { __hb: { sim, lab: labRef, go } })
  })
  const wrapRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = wrapRef.current!
    let drag: { x: number; y: number } | null = null
    const touch = () => {
      sim.follow.paused = true
      sim.elev.touched = sim.time
      sim.elev.snapped = false
      sim.view.touched = sim.time
    }
    const span = () => Math.max(6, layout.stops[layout.stops.length - 1] - G_Y)
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      touch()
      sim.elev.target -= e.deltaY * 0.0009 * span()
    }
    const onDown = (e: PointerEvent) => {
      drag = { x: e.clientX, y: e.clientY }
    }
    const onMove = (e: PointerEvent) => {
      if (!drag || !e.buttons) return
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y
      if (Math.abs(dx) + Math.abs(dy) < 2) return
      touch()
      sim.view.az -= dx * 0.006
      sim.elev.target += dy * 0.0015 * span()
      drag = { x: e.clientX, y: e.clientY }
    }
    const onUp = () => {
      drag = null
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('pointerdown', onDown)
    addEventListener('pointermove', onMove)
    addEventListener('pointerup', onUp)
    return () => {
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('pointerdown', onDown)
      removeEventListener('pointermove', onMove)
      removeEventListener('pointerup', onUp)
    }
  }, [layout])

  return (
    <div className="relative h-full w-full">
      <div ref={wrapRef} className="absolute inset-0" data-hb-root>
        <Canvas dpr={[1, 2]} camera={{ position: [10, 10, 30], fov: 40, near: 0.1, far: 600 }} onPointerMissed={() => tip.hide()}>
          <Scene lab={lab} sim={sim} labRef={labRef} tip={tip} cfgRef={cfgRef} cfg={cfg} matches={matches} onHud={setHud} alt={alt} at={hud.at} />
        </Canvas>
      </div>
      <Director cfg={cfg} setCfg={setCfg} embedded={embedded} />
      <Elevator L={layout} hud={hud} go={go} lab={lab} matchCount={matchCount} alt={alt} embedded={embedded} />
      {!embedded && <Dispatch lab={lab} />}
      <div ref={tipRef} className="pointer-events-none fixed left-0 top-0 z-40 w-60 rounded-lg border border-border bg-surface p-1.5 opacity-0 shadow-lg transition-opacity">
        <img alt="" className="mb-1.5 hidden aspect-[16/10] w-full rounded object-cover object-top" />
        <div data-title className="px-1 text-sm text-foreground" />
        <div data-sub className="px-1 font-mono text-[10px] text-muted" />
        <div data-hint className="px-1 text-[10px] text-accent" />
      </div>
    </div>
  )
}
