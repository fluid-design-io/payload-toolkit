import { Canvas, useFrame, useThree } from '@react-three/fiber'
import type { ThreeEvent } from '@react-three/fiber'
import { Edges, Line } from '@react-three/drei'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DoubleSide,
  EdgesGeometry,
  Euler,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshLambertMaterial,
  Quaternion,
  SRGBColorSpace,
  TextureLoader,
  Vector3,
} from 'three'
import type { LineSegments, Texture } from 'three'

import { agents, databases, frameworks, packageManagers } from '../../../workspace/-workspace/workspace.constants'
import type { CatalogItem, CategoryId } from '../../../workspace/-workspace/workspace.types'
import type { Lab, MockProps } from '../lab.types'

const ACCENT = '#5A91AD'
const HOT = '#FF7A2F'
const FONT = '"Timeless Grotesk", ui-sans-serif, system-ui, sans-serif'
const TAU = Math.PI * 2

const DECK = 1
const LANE_TOP = DECK + 0.06
const PICK_Z = 4.45
const ROW_Z = 6.9
const PITCH = 1.95
const TIP_REST = 1.85
const HEAD_Y = 2.55
const BEAM_Y = 3.2
const REEL = { r: 0.2, t: 0.05, pitch: 0.1 }
const TIER0 = 1.5
const TIER_H = 0.46
const PER_TIER = 36
const BOARD_W = 6.3
const BOARD_T = 0.06
const OVEN = { x0: 10.8, x1: 16.8, mid: 13.8 }
const EXIT_X = 17.6

type Kind = 'block' | 'component' | 'feature'
const SIZES: Record<Kind, [number, number, number]> = {
  block: [0.4, 0.09, 0.62],
  component: [0.32, 0.12, 0.32],
  feature: [0.56, 0.14, 0.56],
}

type CamMode = 'overview' | 'nozzle' | 'aoi'
type Machine = 'single' | 'dual' | 'turret'
type Env = 'cleanroom' | 'lab'
type Director = { cam: CamMode; follow: boolean; machine: Machine; env: Env; open: boolean }

type Mode = 'home' | 'queued' | 'index' | 'eject' | 'feed' | 'ready' | 'held' | 'board' | 'return'
type Cell = { region: number; x: number; z: number; layer: number; part: Part | null }
type Part = {
  item: CatalogItem
  kind: Kind
  size: [number, number, number]
  bank: Bank
  reel: number
  code: string
  mode: Mode
  pos: Vector3
  scale: number
  t: number
  cell: Cell | null
  claimed: boolean
  glow: number
  pocket: Vector3 | null
}
type Phase = 'idle' | 'index' | 'eject' | 'feed' | 'ready' | 'stow'
type Bank = {
  index: number
  id: CategoryId
  label: string
  hue: number
  tray: boolean
  side: 1 | -1
  no: number
  x: number
  z: number
  radius: number
  perTier: number
  tiers: number
  top: number
  parts: Part[]
  rot: number
  rotTarget: number
  lift: number
  queue: Part[]
  cur: Part | null
  phase: Phase
  t: number
  pick: Vector3
  mount: Vector3
  reelPos: Vector3
  hidden: Set<number>
  dirty: boolean
  cols: number
  rows: number
}
type Nozzle = { ext: number; target: number; part: Part | null }
type Step = { to?: () => [number, number]; k?: number; down?: () => number; act?: () => void; wait?: () => boolean; phase: number }
type Gantry = {
  side: -1 | 0 | 1
  rotary: boolean
  nozzles: Nozzle[]
  x: number
  z: number
  park: number
  ring: number
  ringTarget: number
  steps: Step[]
  flash: number
  flashAt: Vector3
}
type Region = { id: string; label: string; cats: string[]; x0: number; x1: number; cells: Cell[]; cw: number; cd: number }
type Reflow = { phase: 'in' | 'heat' | 'out' | 'stamp' | 'back'; t: number }
type Sim = {
  parts: Map<string, Part>
  list: Part[]
  banks: Bank[]
  regions: Region[]
  boardL: number
  chips: [number, number][]
  gantries: Gantry[]
  cams: { rear: Vector3; front: Vector3 }
  lock: Gantry | 'reflow' | null
  boardX: number
  reflow: Reflow | null
  reflowRequest: boolean
  stamp: number
  follow: Part | null
  followHold: number
  live: Set<Part>
  version: number
  time: number
  placed: number[]
  speed: number
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
const pad = (n: number) => String(n).padStart(2, '0')
const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2)
const kindOf = (item: CatalogItem): Kind => (item.kind === 'feature' ? 'feature' : item.kind === 'component' ? 'component' : 'block')

type Colors = ReturnType<typeof palette>
function palette(theme: Lab['theme'], env: Env) {
  if (env === 'cleanroom')
    return theme === 'dark'
      ? { bg: '#0E0C05', surface: '#1A170B', fg: '#FBF3D6', muted: '#9C9271', edge: '#6E6342', dim: '#2E2914', floor: '#211D0D', board: '#15130A', silk: '#4E4527', light: '#FFC629', l: 46, s: 42, amb: 0.8, sun: '#FFE08A' }
      : { bg: '#F8F1D6', surface: '#FFFCEE', fg: '#2B2717', muted: '#857C5C', edge: '#A9A07C', dim: '#E3D8AE', floor: '#ECE0B4', board: '#FFFBEA', silk: '#CBBD8B', light: '#F2BE00', l: 66, s: 52, amb: 0.82, sun: '#FFF1C2' }
  return theme === 'dark'
    ? { bg: '#090E11', surface: '#131A1E', fg: '#FCFCFC', muted: '#8A9094', edge: '#56626A', dim: '#232D34', floor: '#141B20', board: '#0F161A', silk: '#3A4650', light: ACCENT, l: 44, s: 34, amb: 0.8, sun: '#FFFFFF' }
    : { bg: '#EDF1F3', surface: '#FFFFFF', fg: '#1D2225', muted: '#727C81', edge: '#9AA4A9', dim: '#D0D7DB', floor: '#DDE3E6', board: '#F7FAFB', silk: '#B6C0C5', light: ACCENT, l: 66, s: 46, amb: 0.82, sun: '#FFFFFF' }
}
const tint = (hue: number, c: Colors, l = c.l) => `hsl(${hue}, ${c.s}%, ${l}%)`

const BLOCK = { cols: 7, cw: 0.84, cd: 0.52, skip: 0 }
const REGION_DEFS = [
  { id: 'shell', label: 'APP SHELL · FRAMEWORK · DATABASE · FEATURES', cats: ['feature', 'component'], rows: 1, cols: 7, cw: 0.84, cd: 0.84, skip: 2 },
  { id: 'hero', label: 'HERO', cats: ['block:hero', 'block:logo'], rows: 2, ...BLOCK },
  { id: 'body', label: 'FEATURES · CONTENT · INTEGRATIONS', cats: ['block:feature', 'block:content', 'block:integration', 'block:embed', 'block:collection', 'block:other'], rows: 3, ...BLOCK },
  { id: 'proof', label: 'SOCIAL PROOF', cats: ['block:stats', 'block:testimonials', 'block:team'], rows: 2, ...BLOCK },
  { id: 'pricing', label: 'PRICING', cats: ['block:pricing', 'block:comparator'], rows: 1, ...BLOCK },
  { id: 'convert', label: 'FAQ · CTA · CONTACT', cats: ['block:faq', 'block:call', 'block:contact'], rows: 2, ...BLOCK },
  { id: 'footer', label: 'FOOTER', cats: ['block:footer'], rows: 1, ...BLOCK },
]
const LABEL_H = 0.26
const LABEL_ROT = new Euler(-Math.PI / 2, Math.PI / 2, 0, 'YXZ')

const colZ = (cw: number, col: number) => BOARD_W / 2 - 0.12 - cw / 2 - col * cw
function buildRegions() {
  const heights = REGION_DEFS.map((r) => LABEL_H + r.rows * r.cd + 0.06)
  const length = heights.reduce((a, b) => a + b, 0) + 0.2
  let x = -length / 2 + 0.1
  const regions: Region[] = REGION_DEFS.map((def, index) => {
    const x0 = x
    const x1 = x + heights[index]
    x = x1
    const cells: Cell[] = []
    for (let row = 0; row < def.rows; row++)
      for (let col = def.skip; col < def.cols; col++)
        cells.push({ region: index, x: x0 + LABEL_H + def.cd / 2 + row * def.cd, z: colZ(def.cw, col), layer: 0, part: null })
    return { id: def.id, label: def.label, cats: def.cats, x0, x1, cells, cw: def.cw, cd: def.cd }
  })
  const shellX = regions[0].x0 + LABEL_H + REGION_DEFS[0].cd / 2
  return { regions, length, chips: [0, 1].map((col) => [shellX, colZ(REGION_DEFS[0].cw, col)] as [number, number]) }
}
const regionOf = (sim: Sim, id: CategoryId) => Math.max(1, sim.regions.findIndex((r) => r.cats.includes(id)))

function takeCell(sim: Sim, p: Part) {
  const region = sim.regions[p.kind === 'block' ? regionOf(sim, p.item.category) : 0]
  let cell = region.cells.find((c) => !c.part)
  if (!cell) {
    const ground = region.cells.filter((c) => c.layer === 0)
    const n = region.cells.length
    cell = { ...ground[n % ground.length], layer: Math.floor(n / ground.length), part: null }
    region.cells.push(cell)
  }
  cell.part = p
  p.cell = cell
  return cell
}
function freeCell(p: Part) {
  if (p.cell) p.cell.part = null
  p.cell = null
}
const cellPos = (sim: Sim, p: Part, out: Vector3) =>
  out.set(sim.boardX + p.cell!.x, DECK + BOARD_T + p.cell!.layer * 0.16 + p.size[1] / 2, p.cell!.z)

function reelWorld(b: Bank, i: number, out: Vector3) {
  const tier = Math.floor(i / b.perTier)
  const a = ((i % b.perTier) / b.perTier) * TAU - b.rot
  return out.set(b.x + b.radius * Math.cos(a), TIER0 + tier * TIER_H, b.z + b.radius * Math.sin(a))
}

function setMode(sim: Sim, p: Part, mode: Mode) {
  p.mode = mode
  const live = mode === 'feed' || mode === 'ready' || mode === 'held' || mode === 'board' || mode === 'return' || p.bank.tray
  if (live !== sim.live.has(p)) {
    if (live) sim.live.add(p)
    else sim.live.delete(p)
  }
  sim.version++
}

function createSim(lab: Lab, machine: Machine): Sim {
  const { regions, length, chips } = buildRegions()
  const categories = [...lab.catalog.kinds.filter((k) => k.id !== 'all'), ...lab.catalog.blocks].filter((c) => c.count > 0)
  const turrets = categories.filter((c) => c.id !== 'feature')
  const big = new Set([...turrets].sort((a, b) => b.count - a.count).slice(0, Math.ceil(turrets.length / 2)).map((c) => c.id))
  const rows: [typeof categories, 1 | -1][] = [
    [turrets.filter((c) => big.has(c.id)), -1],
    [categories.filter((c) => !big.has(c.id)), 1],
  ]
  const sim: Sim = {
    parts: new Map(), list: [], banks: [], regions, boardL: length, chips, gantries: [],
    cams: { rear: new Vector3(), front: new Vector3() }, lock: null, boardX: 0, reflow: null, reflowRequest: false, stamp: 0,
    follow: null, followHold: 0, live: new Set(), version: 0, time: 0, placed: [], speed: 1,
  }
  for (const [cats, side] of rows) {
    cats.forEach((cat, i) => {
      const tray = cat.id === 'feature'
      const items = lab.catalog.items
        .filter((item) => item.category === cat.id)
        .sort((a, b) => a.source.localeCompare(b.source) || a.title.localeCompare(b.title))
      const perTier = Math.max(8, Math.min(items.length, PER_TIER))
      const radius = Math.max(0.42, (perTier * REEL.pitch) / TAU)
      const tiers = Math.ceil(items.length / perTier)
      const x = (i - (cats.length - 1) / 2) * PITCH
      const z = side * ROW_Z
      const cols = Math.max(2, Math.min(4, items.length))
      const trayRows = Math.max(2, Math.ceil(items.length / cols))
      const b: Bank = {
        index: sim.banks.length, id: cat.id, label: cat.label,
        hue: items[0]?.hue ?? 200, tray, side, no: i + 1, x, z, radius, perTier, tiers,
        top: tray ? 2.3 : TIER0 + (tiers - 0.5) * TIER_H + 0.18,
        parts: [], rot: 0, rotTarget: 0, lift: DECK + 0.3, queue: [], cur: null, phase: 'idle', t: 0,
        pick: new Vector3(x, LANE_TOP, side * PICK_Z),
        mount: new Vector3(x, LANE_TOP + REEL.r + 0.03, side * (ROW_Z - radius - REEL.r - 0.42)),
        reelPos: new Vector3(), hidden: new Set(), dirty: true, cols, rows: trayRows,
      }
      items.forEach((item, reel) => {
        const kind = kindOf(item)
        const tier = Math.floor(reel / perTier)
        const col = reel % cols, row = Math.floor(reel / cols)
        const pocket = tray ? new Vector3(x + (col - (cols - 1) / 2) * 0.66, LANE_TOP, side * (PICK_Z + 0.1 + row * 0.66)) : null
        const p: Part = {
          item, kind, size: SIZES[kind], bank: b, reel,
          code: tray ? `TRAY-${row + 1}${'ABCD'[col]}` : `${side < 0 ? 'R' : 'F'}${pad(i + 1)}-${tier + 1}-${pad((reel % perTier) + 1)}`,
          mode: 'home', pos: new Vector3(), scale: 1, t: 0, cell: null, claimed: false, glow: 0, pocket,
        }
        if (pocket) p.pos.copy(pocket).setY(LANE_TOP + p.size[1] / 2)
        b.parts.push(p)
        sim.parts.set(item.ref, p)
        sim.list.push(p)
      })
      sim.banks.push(b)
    })
  }
  const camX = (side: 1 | -1) => {
    const xs = sim.banks.filter((b) => b.side === side).map((b) => b.x).sort((a, b) => a - b)
    let best = xs.length ? xs[0] - PITCH / 2 : 0
    for (let k = 0; k + 1 < xs.length; k++) if (Math.abs((xs[k] + xs[k + 1]) / 2) < Math.abs(best)) best = (xs[k] + xs[k + 1]) / 2
    return best
  }
  sim.cams.rear.set(camX(-1), DECK + 0.05, -PICK_Z)
  sim.cams.front.set(camX(1), DECK + 0.05, PICK_Z)
  for (const p of sim.list) {
    if (p.bank.tray) sim.live.add(p)
    if (!lab.selected.has(p.item.ref)) continue
    takeCell(sim, p)
    setMode(sim, p, 'board')
    cellPos(sim, p, p.pos)
  }
  sim.gantries = makeGantries(sim, machine)
  return sim
}

function makeGantries(sim: Sim, machine: Machine): Gantry[] {
  const make = (side: -1 | 0 | 1, n: number, rotary: boolean, park: number): Gantry => ({
    side, rotary, nozzles: Array.from({ length: n }, () => ({ ext: 0, target: 0, part: null })),
    x: side === 1 ? 3 : -3, z: park, park, ring: 0, ringTarget: 0, steps: [], flash: 0,
    flashAt: side === 1 ? sim.cams.front : sim.cams.rear,
  })
  if (machine === 'dual') return [make(-1, 4, false, -3.95), make(1, 4, false, 3.95)]
  if (machine === 'turret') return [make(0, 12, true, -3.95)]
  return [make(0, 4, false, -3.95)]
}

function swapMachine(sim: Sim, lab: Lab, machine: Machine) {
  for (const g of sim.gantries)
    for (const n of g.nozzles) {
      const p = n.part
      if (!p) continue
      p.claimed = false
      if (lab.selected.has(p.item.ref)) {
        takeCell(sim, p)
        setMode(sim, p, 'board')
      } else {
        p.t = 0
        setMode(sim, p, 'return')
      }
    }
  for (const p of sim.list) p.claimed = false
  if (sim.lock !== 'reflow') sim.lock = null
  sim.gantries = makeGantries(sim, machine)
}

const serves = (g: Gantry, b: Bank) => g.side === 0 || g.side === b.side
const RING_R = 0.42
function offsetAt(g: Gantry, k: number, ring: number): [number, number] {
  if (k < 0) return [0, 0]
  const n = g.nozzles.length
  if (g.rotary) {
    const a = ring + (TAU * k) / n
    return [RING_R * Math.cos(a), RING_R * Math.sin(a)]
  }
  return [(k - (n - 1) / 2) * 0.3, 0]
}
function ringFor(g: Gantry, k: number) {
  const base = (-TAU * k) / g.nozzles.length
  let d = (base - g.ringTarget) % TAU
  if (d < 0) d += TAU
  if (d > TAU - 1e-4) d = 0
  return g.ringTarget + d
}
function tipPos(g: Gantry, k: number, out: Vector3) {
  const [ox, oz] = offsetAt(g, k, g.ring)
  return out.set(g.x + ox, TIP_REST - g.nozzles[k].ext, g.z + oz)
}

function plan(sim: Sim, g: Gantry, lab: Lab) {
  const n = g.nozzles.length
  const removals = sim.lock === 'reflow' ? [] : [...sim.live].filter((p) => p.mode === 'board' && !p.claimed && !lab.selected.has(p.item.ref) && serves(g, p.bank))
  const ready = sim.banks
    .filter((b) => serves(g, b) && b.phase === 'ready' && b.cur && b.cur.mode === 'ready' && !b.cur.claimed && lab.selected.has(b.cur.item.ref))
    .map((b) => b.cur!)
  const picks = [...removals, ...ready].slice(0, n).sort((a, b) => a.pos.x - b.pos.x)
  if (!picks.length) {
    if (Math.abs(g.z - g.park) > 0.05) g.steps.push({ to: () => [g.x, g.park], phase: 0 })
    return
  }
  const lockStep: Step = { wait: () => !sim.lock || sim.lock === g, act: () => { sim.lock = g }, phase: 0 }
  if (removals.some((p) => picks.includes(p))) g.steps.push(lockStep)
  picks.forEach((p, k) => {
    p.claimed = true
    g.steps.push({
      to: () => [p.pos.x, p.pos.z],
      k,
      down: () => p.pos.y + p.size[1] / 2,
      act: () => {
        const want = lab.selected.has(p.item.ref)
        if ((p.mode === 'ready' && want) || (p.mode === 'board' && !want)) {
          freeCell(p)
          setMode(sim, p, 'held')
          g.nozzles[k].part = p
        } else p.claimed = false
      },
      phase: 0,
    })
  })
  g.steps.push({ act: () => planDrops(sim, g, lab), phase: 0 })
}

function planDrops(sim: Sim, g: Gantry, lab: Lab) {
  const held = g.nozzles.map((nz, k) => [nz.part, k] as const).filter((h): h is readonly [Part, number] => !!h[0])
  const adds = held.filter(([p]) => lab.selected.has(p.item.ref))
  const back = held.filter(([p]) => !lab.selected.has(p.item.ref))
  const steps: Step[] = []
  const unlock: Step = { act: () => { if (sim.lock === g) sim.lock = null }, phase: 0 }
  if (adds.length) {
    const cam = g.side === 1 ? sim.cams.front : g.side === -1 ? sim.cams.rear : Math.abs(g.z - sim.cams.rear.z) < Math.abs(g.z - sim.cams.front.z) ? sim.cams.rear : sim.cams.front
    steps.push({ to: () => [cam.x, cam.z], k: -1, act: () => { g.flash = 1; g.flashAt = cam }, phase: 0 })
    steps.push({ wait: () => !sim.lock || sim.lock === g, act: () => { sim.lock = g }, phase: 0 })
    for (const [p, k] of adds) {
      const tmp = new Vector3()
      steps.push({
        to: () => {
          if (!p.cell) takeCell(sim, p)
          cellPos(sim, p, tmp)
          return [tmp.x, tmp.z]
        },
        k,
        down: () => cellPos(sim, p, tmp).y + p.size[1] / 2,
        act: () => {
          g.nozzles[k].part = null
          p.claimed = false
          if (!lab.selected.has(p.item.ref)) {
            freeCell(p)
            g.nozzles[k].part = p
            g.steps.splice(1, 0, returnStep(sim, g, p, k))
            return
          }
          setMode(sim, p, 'board')
          sim.placed.push(sim.time)
        },
        phase: 0,
      })
    }
  }
  steps.push(unlock)
  for (const [p, k] of back) steps.push(returnStep(sim, g, p, k))
  g.steps.push(...steps)
}

function returnStep(sim: Sim, g: Gantry, p: Part, k: number): Step {
  const at = p.pocket ?? p.bank.pick
  return {
    to: () => [at.x, at.z],
    k,
    down: () => LANE_TOP + p.size[1],
    act: () => {
      g.nozzles[k].part = null
      p.claimed = false
      p.t = 0
      setMode(sim, p, 'return')
    },
    phase: 0,
  }
}

function runGantry(sim: Sim, g: Gantry, lab: Lab, dt: number, rush: number) {
  if (!g.steps.length) plan(sim, g, lab)
  const s = g.steps[0]
  let tx = g.x, tz = g.z
  if (s && !(s.wait && !s.wait())) {
    if (s.phase === 0) {
      let arrived = true
      if (s.to) {
        const [px, pz] = s.to()
        const k = s.k ?? -1
        if (g.rotary && k >= 0) g.ringTarget = ringFor(g, k)
        const [ox, oz] = offsetAt(g, k, g.rotary ? g.ringTarget : g.ring)
        tx = px - ox
        tz = pz - oz
        arrived = Math.hypot(g.x - tx, g.z - tz) < 0.015 && Math.abs(g.ring - g.ringTarget) < 0.02
      }
      if (arrived) {
        if (s.down && s.k !== undefined && s.k >= 0) s.phase = 1
        else {
          s.act?.()
          g.steps.shift()
        }
      }
    } else if (s.phase === 1) {
      const nz = g.nozzles[s.k!]
      nz.target = clamp(TIP_REST - s.down!(), 0, 1.3)
      if (Math.abs(nz.ext - nz.target) < 0.012) {
        s.act?.()
        nz.target = 0
        s.phase = 2
      }
    } else if (g.nozzles[s.k!].ext < 0.03) g.steps.shift()
  }
  const dx = tx - g.x, dz = tz - g.z
  const dist = Math.hypot(dx, dz)
  if (dist > 1e-5) {
    const move = Math.min(dist * (1 - Math.exp(-dt * 9 * rush)), 15 * rush * dt)
    g.x += (dx / dist) * move
    g.z += (dz / dist) * move
  }
  g.ring += (g.ringTarget - g.ring) * (1 - Math.exp(-dt * 16 * rush))
  for (const nz of g.nozzles) nz.ext += (nz.target - nz.ext) * (1 - Math.exp(-dt * 20 * rush))
  g.flash = Math.max(0, g.flash - dt * 2.2)
}

const v1 = new Vector3()
const v2 = new Vector3()

function step(sim: Sim, lab: Lab, dt: number) {
  sim.time += dt
  const wanted = lab.selected
  for (const p of sim.list) {
    const want = wanted.has(p.item.ref)
    const b = p.bank
    if (want && p.mode === 'home') {
      setMode(sim, p, 'queued')
      b.queue.push(p)
      sim.follow = p
      sim.followHold = 0
    } else if (!want && p.mode === 'queued') {
      b.queue.splice(b.queue.indexOf(p), 1)
      setMode(sim, p, 'home')
    } else if (!want && b.cur === p && (p.mode === 'index' || p.mode === 'eject' || p.mode === 'feed' || p.mode === 'ready') && !p.claimed) {
      const ejected = p.mode !== 'index'
      setMode(sim, p, 'home')
      b.phase = ejected && !b.tray ? 'stow' : 'idle'
      b.t = 0
      if (b.phase === 'idle') b.cur = null
    }
  }

  for (const b of sim.banks) {
    if (!b.cur && b.queue.length) {
      b.cur = b.queue.shift()!
      setMode(sim, b.cur, 'index')
      b.phase = 'index'
      b.t = 0
      if (!b.tray) {
        const a = ((b.cur.reel % b.perTier) / b.perTier) * TAU
        const win = -b.side * (Math.PI / 2)
        let target = a - win
        target += Math.round((b.rot - target) / TAU) * TAU
        b.rotTarget = target
      }
    }
    const p = b.cur
    b.rot += (b.rotTarget - b.rot) * (1 - Math.exp(-dt * 5))
    if (b.tray) {
      if (p && b.phase === 'index') {
        b.t += dt / 0.45
        p.pos.copy(p.pocket!).setY(LANE_TOP + p.size[1] / 2 + Math.sin(Math.min(1, b.t) * Math.PI) * 0.25)
        if (b.t >= 1) {
          b.phase = 'ready'
          setMode(sim, p, 'ready')
        }
      } else if (b.phase === 'ready' && (!p || p.mode !== 'ready')) {
        b.phase = 'idle'
        b.cur = null
      }
      continue
    }
    const tierY = p ? TIER0 + Math.floor(p.reel / b.perTier) * TIER_H : DECK + 0.3
    if (b.phase === 'index' && p) {
      b.lift += (tierY - b.lift) * (1 - Math.exp(-dt * 7))
      reelWorld(b, p.reel, p.pos)
      b.reelPos.copy(p.pos)
      if (Math.abs(b.rot - b.rotTarget) < 0.01 && Math.abs(b.lift - tierY) < 0.02) {
        b.phase = 'eject'
        b.t = 0
        b.hidden.add(p.reel)
        b.dirty = true
        setMode(sim, p, 'eject')
      }
    } else if (b.phase === 'eject' && p) {
      b.t += dt / 0.85
      ejectPath(b, p, Math.min(1, b.t), b.reelPos)
      p.pos.copy(b.reelPos)
      if (b.t >= 1) {
        b.phase = 'feed'
        b.t = 0
        setMode(sim, p, 'feed')
      }
    } else if (b.phase === 'feed' && p) {
      b.t += dt / 0.55
      const t = ease(Math.min(1, b.t))
      v1.set(b.mount.x, LANE_TOP + p.size[1] / 2, b.mount.z)
      v2.copy(b.pick).setY(LANE_TOP + p.size[1] / 2)
      p.pos.lerpVectors(v1, v2, t)
      if (b.t >= 1) {
        b.phase = 'ready'
        setMode(sim, p, 'ready')
      }
    } else if (b.phase === 'ready') {
      if (!p || p.mode !== 'ready') {
        b.phase = 'stow'
        b.t = 0
      } else p.pos.copy(b.pick).setY(LANE_TOP + p.size[1] / 2)
    } else if (b.phase === 'stow') {
      b.t += dt / 0.7
      const reel = p ?? b.parts[0]
      ejectPath(b, reel, 1 - Math.min(1, b.t), b.reelPos)
      if (b.t >= 1) {
        if (p) b.hidden.delete(p.reel)
        b.dirty = true
        b.phase = 'idle'
        b.cur = null
      }
    } else b.lift += (DECK + 0.3 - b.lift) * (1 - Math.exp(-dt * 3))
    if (b.phase === 'eject' || b.phase === 'stow') b.lift = b.reelPos.y
    for (const q of b.queue) reelWorld(b, q.reel, q.pos)
  }

  const pending = sim.banks.reduce((n, b) => n + b.queue.length + (b.cur ? 1 : 0), 0)
  const rush = 1 + Math.min(1.4, pending * 0.12)
  for (const g of sim.gantries) runGantry(sim, g, lab, dt, rush)
  if (sim.gantries.length === 2) {
    const [rear, front] = sim.gantries
    if (rear.z > front.z - 0.8) {
      if (sim.lock === rear) front.z = rear.z + 0.8
      else rear.z = front.z - 0.8
    }
  }

  if (sim.reflowRequest && !sim.reflow && !sim.lock) {
    sim.reflowRequest = false
    sim.lock = 'reflow'
    sim.reflow = { phase: 'in', t: 0 }
  }
  const r = sim.reflow
  if (r) {
    const durations = { in: 2.2, heat: 1.8, out: 1.1, stamp: 1.3, back: 2.4 }
    r.t += dt / durations[r.phase]
    const t = ease(Math.min(1, r.t))
    if (r.phase === 'in') sim.boardX = t * OVEN.mid
    else if (r.phase === 'out') sim.boardX = OVEN.mid + t * (EXIT_X - OVEN.mid)
    else if (r.phase === 'back') sim.boardX = EXIT_X * (1 - t)
    if (r.phase === 'stamp') sim.stamp = Math.min(1, r.t * 3)
    else sim.stamp = Math.max(0, sim.stamp - dt * 2)
    if (r.t >= 1) {
      r.t = 0
      const next = { in: 'heat', heat: 'out', out: 'stamp', stamp: 'back', back: null } as const
      const phase = next[r.phase]
      if (phase) r.phase = phase
      else {
        sim.reflow = null
        sim.boardX = 0
        if (sim.lock === 'reflow') sim.lock = null
      }
    }
  }
  const heat = clamp(1 - Math.abs(sim.boardX - OVEN.mid) / ((OVEN.x1 - OVEN.x0) / 2), 0, 1)

  for (const p of sim.live) {
    if (p.mode === 'held') {
      const g = sim.gantries.find((x) => x.nozzles.some((n) => n.part === p))
      if (g) {
        const k = g.nozzles.findIndex((n) => n.part === p)
        tipPos(g, k, p.pos).y -= p.size[1] / 2
      }
    } else if (p.mode === 'board' && p.cell) {
      cellPos(sim, p, v1)
      p.pos.lerp(v1, 1 - Math.exp(-dt * 18))
      p.glow = Math.max(p.glow - dt * 0.7, heat)
    } else if (p.mode === 'return') {
      p.t += dt / 0.6
      const t = Math.min(1, p.t)
      if (p.pocket) {
        p.pos.lerp(v1.copy(p.pocket).setY(LANE_TOP + p.size[1] / 2), 1 - Math.exp(-dt * 10))
      } else {
        v1.copy(p.bank.pick).setY(LANE_TOP + p.size[1] / 2)
        v2.set(p.bank.mount.x, LANE_TOP + p.size[1] / 2, p.bank.mount.z)
        p.pos.lerpVectors(v1, v2, ease(t))
        p.scale = 1 - t * 0.7
      }
      if (t >= 1) {
        p.scale = 1
        setMode(sim, p, 'home')
      }
    } else if (p.mode === 'home' && p.pocket) p.pos.copy(p.pocket).setY(LANE_TOP + p.size[1] / 2)
    if (p.mode !== 'board') p.glow = Math.max(0, p.glow - dt)
  }

  const f = sim.follow
  if (f) {
    if (f.mode === 'board') {
      sim.followHold += dt
      if (sim.followHold > 1.1) sim.follow = null
    } else if (f.mode === 'home' || f.mode === 'return') sim.follow = null
  }
  while (sim.placed.length && sim.time - sim.placed[0] > 30) sim.placed.shift()
}

function ejectPath(b: Bank, p: Part, t: number, out: Vector3) {
  const tier = Math.floor(p.reel / b.perTier)
  const y0 = TIER0 + tier * TIER_H
  const zIn = b.z - b.side * b.radius
  const zOut = b.mount.z
  if (t < 0.4) {
    const k = ease(t / 0.4)
    return out.set(b.x, y0, zIn + (zOut - zIn) * k)
  }
  const k = ease((t - 0.4) / 0.6)
  return out.set(b.x, y0 + (b.mount.y - y0) * k, zOut)
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

function Box({ size, color, edge, position, rotation, children, lineWidth = 1, opacity = 1 }: {
  size: [number, number, number]; color: string; edge: string; position?: [number, number, number]; rotation?: [number, number, number]; children?: ReactNode; lineWidth?: number; opacity?: number
}) {
  return (
    <mesh position={position} rotation={rotation}>
      <boxGeometry args={size} />
      <meshLambertMaterial color={color} transparent={opacity < 1} opacity={opacity} depthWrite={opacity === 1} />
      <Edges color={edge} lineWidth={lineWidth} />
      {children}
    </mesh>
  )
}
function Cyl({ r, h, color, edge, position, rotation, segments = 32 }: {
  r: number; h: number; color: string; edge: string; position?: [number, number, number]; rotation?: [number, number, number]; segments?: number
}) {
  return (
    <mesh position={position} rotation={rotation}>
      <cylinderGeometry args={[r, r, h, segments]} />
      <meshLambertMaterial color={color} />
      <Edges color={edge} threshold={25} />
    </mesh>
  )
}

function segmentsGeometry(points: number[]) {
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(points), 3))
  return g
}
function circle(out: number[], cx: number, y: number, cz: number, r: number, n = 40) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU, b = ((i + 1) / n) * TAU
    out.push(cx + r * Math.cos(a), y, cz + r * Math.sin(a), cx + r * Math.cos(b), y, cz + r * Math.sin(b))
  }
}
function rect(out: number[], x0: number, z0: number, x1: number, z1: number, y: number) {
  out.push(x0, y, z0, x1, y, z0, x1, y, z0, x1, y, z1, x1, y, z1, x0, y, z1, x0, y, z1, x0, y, z0)
}

const REEL_TEMPLATE = (() => {
  const outer = new EdgesGeometry(new CylinderGeometry(REEL.r, REEL.r, REEL.t, 14), 30).attributes.position.array as Float32Array
  const hub = new EdgesGeometry(new CylinderGeometry(0.05, 0.05, REEL.t * 1.4, 6), 30).attributes.position.array as Float32Array
  const all = new Float32Array(outer.length + hub.length)
  all.set(outer)
  all.set(hub, outer.length)
  return all
})()
const REEL_GEOMETRY = new CylinderGeometry(REEL.r, REEL.r, REEL.t, 12)

function reelMatrix(b: Bank, i: number, out: Matrix4) {
  const tier = Math.floor(i / b.perTier)
  const a = ((i % b.perTier) / b.perTier) * TAU
  const q = new Quaternion().setFromEuler(new Euler(0, Math.PI / 2 - a, Math.PI / 2))
  return out.compose(new Vector3(b.radius * Math.cos(a), TIER0 + tier * TIER_H, b.radius * Math.sin(a)), q, new Vector3(1, 1, 1))
}

type Ui = {
  match: Set<string> | null
  focus: CategoryId
  tip: Tip
  lab: Lab
  c: Colors
  lod: { current: number }
}

function Turret({ b, ui }: { b: Bank; ui: Ui }) {
  const { c, match, focus, tip, lab } = ui
  const group = useRef<Group>(null)
  const inst = useRef<InstancedMesh>(null)
  const linesRef = useRef<LineSegments>(null)
  const hover = useRef(-1)
  const built = useMemo(() => {
    const hull: number[] = []
    const outer = b.radius + REEL.r + 0.06
    for (let t = 0; t <= b.tiers; t++) circle(hull, 0, TIER0 - TIER_H / 2 + t * TIER_H, 0, outer, 48)
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * TAU
      hull.push(outer * Math.cos(a), TIER0 - TIER_H / 2, outer * Math.sin(a), outer * Math.cos(a), TIER0 - TIER_H / 2 + b.tiers * TIER_H, outer * Math.sin(a))
    }
    const hullCount = hull.length / 3
    const per = REEL_TEMPLATE.length / 3
    const positions = new Float32Array(hull.length + b.parts.length * REEL_TEMPLATE.length)
    positions.set(hull)
    const m = new Matrix4()
    const v = new Vector3()
    b.parts.forEach((_, i) => {
      reelMatrix(b, i, m)
      for (let k = 0; k < per; k++) {
        v.fromArray(REEL_TEMPLATE, k * 3).applyMatrix4(m)
        v.toArray(positions, hull.length + (i * per + k) * 3)
      }
    })
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(positions, 3))
    geometry.setAttribute('color', new BufferAttribute(new Float32Array(positions.length), 3))
    return { geometry, base: positions.slice(), hullCount, per }
  }, [b])

  const paint = useMemo(() => {
    const edge = new Color(c.edge), dim = new Color(c.dim), acc = new Color(ACCENT), fill = new Color(), grey = new Color(c.dim)
    return (i: number) => {
      const p = b.parts[i]
      const hit = !match || match.has(p.item.ref)
      const col = i === hover.current || (match && hit) ? acc : hit ? edge : dim
      const arr = built.geometry.attributes.color.array as Float32Array
      const start = built.hullCount + i * built.per
      for (let k = 0; k < built.per; k++) col.toArray(arr, (start + k) * 3)
      if (inst.current) {
        fill.set(tint(p.item.hue, c))
        inst.current.setColorAt(i, hit ? fill : grey)
      }
    }
  }, [b, built, c, match])

  useLayoutEffect(() => {
    const m = new Matrix4()
    const mesh = inst.current!
    b.parts.forEach((_, i) => {
      mesh.setMatrixAt(i, reelMatrix(b, i, m))
      paint(i)
    })
    const arr = built.geometry.attributes.color.array as Float32Array
    const hullCol = new Color(focus === b.id ? ACCENT : c.edge)
    for (let k = 0; k < built.hullCount; k++) hullCol.toArray(arr, k * 3)
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    built.geometry.attributes.color.needsUpdate = true
    mesh.computeBoundingSphere()
    b.dirty = true
  }, [b, built, paint, focus, c])

  const shown = useRef(new Set<number>())
  useFrame(() => {
    group.current!.rotation.y = b.rot
    const far = ui.lod.current < 1.6 && b.tiers > 2
    if (linesRef.current) linesRef.current.visible = !far
    if (!b.dirty) return
    b.dirty = false
    const mesh = inst.current!
    const pos = built.geometry.attributes.position.array as Float32Array
    const m = new Matrix4()
    const zero = new Matrix4().makeScale(0, 0, 0)
    const changed = new Set([...b.hidden, ...shown.current])
    for (const i of changed) {
      const hidden = b.hidden.has(i)
      mesh.setMatrixAt(i, hidden ? zero : reelMatrix(b, i, m))
      const start = (built.hullCount + i * built.per) * 3
      for (let k = 0; k < built.per * 3; k++) pos[start + k] = hidden ? built.base[start + (k % 3)] : built.base[start + k]
    }
    shown.current = new Set(b.hidden)
    mesh.instanceMatrix.needsUpdate = true
    built.geometry.attributes.position.needsUpdate = true
  })

  const over = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    const i = e.instanceId ?? -1
    if (i < 0 || i === hover.current) return
    const prev = hover.current
    hover.current = i
    if (prev >= 0) paint(prev)
    paint(i)
    built.geometry.attributes.color.needsUpdate = true
    if (inst.current?.instanceColor) inst.current.instanceColor.needsUpdate = true
    const p = b.parts[i]
    tip.show(e.nativeEvent, p.item.title, `${p.item.label} · reel ${p.code} · ${lab.selected.has(p.item.ref) ? 'click to pull' : 'click to place'}`, p.item.hue)
  }
  const out = () => {
    const prev = hover.current
    hover.current = -1
    if (prev >= 0) {
      paint(prev)
      built.geometry.attributes.color.needsUpdate = true
      if (inst.current?.instanceColor) inst.current.instanceColor.needsUpdate = true
    }
    tip.hide()
  }
  const height = b.tiers * TIER_H
  const outerR = b.radius + REEL.r + 0.06
  const core = Math.max(0.12, b.radius - REEL.r - 0.04)
  return (
    <group position={[b.x, 0, b.z]}>
      <Cyl r={outerR * 0.85} h={0.08} position={[0, 0.04, 0]} color={c.surface} edge={focus === b.id ? ACCENT : c.edge} segments={40} />
      <Cyl r={core} h={TIER0 - TIER_H / 2 + height + 0.1} position={[0, (TIER0 - TIER_H / 2 + height + 0.1) / 2, 0]} color={c.surface} edge={c.edge} segments={24} />
      <group ref={group}>
        <instancedMesh
          ref={inst}
          args={[REEL_GEOMETRY, undefined, b.parts.length]}
          onPointerMove={over}
          onPointerOut={out}
          onClick={(e) => {
            e.stopPropagation()
            if (e.delta > 4 || e.instanceId === undefined) return
            const ref = b.parts[e.instanceId].item.ref
            tip.hide()
            if (e.nativeEvent.shiftKey && lab.inspect) lab.inspect(ref)
            else lab.toggle(ref)
          }}
        >
          <meshLambertMaterial />
        </instancedMesh>
        <lineSegments ref={linesRef} geometry={built.geometry} raycast={() => null}>
          <lineBasicMaterial vertexColors />
        </lineSegments>
      </group>
      <Cyl r={core + 0.12} h={0.06} position={[0, TIER0 - TIER_H / 2 + height + 0.13, 0]} color={c.surface} edge={focus === b.id ? ACCENT : c.edge} segments={32} />
    </group>
  )
}

function Tray({ b, ui }: { b: Bank; ui: Ui }) {
  const { c, focus } = ui
  const w = b.cols * 0.66 + 0.2
  const d = b.rows * 0.66 + 0.2
  const z0 = b.side * (PICK_Z + 0.1 - 0.33 - 0.1)
  const zc = z0 + (b.side * d) / 2
  const pockets = useMemo(() => {
    const pts: number[] = []
    for (let row = 0; row < b.rows; row++)
      for (let col = 0; col < b.cols; col++) {
        const x = b.x + (col - (b.cols - 1) / 2) * 0.66, z = b.side * (PICK_Z + 0.1 + row * 0.66)
        rect(pts, x - 0.3, z - 0.3, x + 0.3, z + 0.3, LANE_TOP + 0.002)
      }
    return segmentsGeometry(pts)
  }, [b])
  const edge = focus === b.id ? ACCENT : c.edge
  const backZ = b.side * (ROW_Z + 0.2)
  return (
    <group>
      <Box size={[w, 0.06, d]} position={[b.x, DECK + 0.03, zc]} color={c.surface} edge={edge} />
      <lineSegments geometry={pockets} raycast={() => null}>
        <lineBasicMaterial color={c.edge} />
      </lineSegments>
      <Box size={[w + 0.2, 2.2, 1.5]} position={[b.x, 1.1, backZ]} color={c.surface} edge={edge} />
      {Array.from({ length: 7 }, (_, k) => (
        <Line key={k} points={[[b.x - w / 2 - 0.1, 0.5 + k * 0.24, backZ - b.side * 0.76], [b.x + w / 2 + 0.1, 0.5 + k * 0.24, backZ - b.side * 0.76]]} color={c.edge} lineWidth={1} />
      ))}
      <Box size={[w * 0.9, 0.04, 0.6]} position={[b.x, DECK - 0.02, b.side * (ROW_Z - 0.9)]} color={c.surface} edge={c.edge} />
    </group>
  )
}

function Feeder({ b, ui }: { b: Bank; ui: Ui }) {
  const { c } = ui
  const reel = useRef<Group>(null)
  const carriage = useRef<Mesh>(null)
  const tape = useRef<{ material: { dashOffset: number } } | null>(null)
  const windowRef = useRef<Group>(null)
  const zIn = b.z - b.side * (b.radius + REEL.r + 0.12)
  useFrame((_, dt) => {
    const show = b.phase === 'eject' || b.phase === 'feed' || b.phase === 'ready' || b.phase === 'stow'
    const r = reel.current!
    r.visible = show
    if (show) {
      r.position.copy(b.phase === 'feed' || b.phase === 'ready' ? b.mount : b.reelPos)
      if (b.phase === 'feed') r.rotation.x -= dt * 9 * b.side
    }
    carriage.current!.position.y = b.lift
    if (tape.current && b.phase === 'feed') tape.current.material.dashOffset -= dt * 1.4 * b.side
    const tierY = b.cur ? TIER0 + Math.floor(b.cur.reel / b.perTier) * TIER_H : -10
    windowRef.current!.visible = b.phase === 'index' || b.phase === 'eject'
    windowRef.current!.position.y = tierY
  })
  const laneLen = Math.abs(b.mount.z - b.pick.z) + 0.5
  const laneZ = (b.mount.z + b.pick.z) / 2
  const mastZ = zIn - b.side * 0.06
  const label = useMemo(() => textTexture(256, 64, (ctx) => {
    ctx.fillStyle = c.surface
    ctx.fillRect(0, 0, 256, 64)
    ctx.fillStyle = tint(b.hue, c, c.l - 8)
    ctx.fillRect(10, 14, 8, 36)
    ctx.fillStyle = c.fg
    ctx.font = `500 30px ${FONT}`
    ctx.fillText(`${b.side < 0 ? 'R' : 'F'}${pad(b.no)}`, 30, 44)
  }), [b, c])
  return (
    <group>
      <Box size={[0.64, 0.06, laneLen]} position={[b.x, DECK + 0.03, laneZ]} color={c.surface} edge={c.edge} />
      <Line
        ref={tape as never}
        points={[[b.x, LANE_TOP + 0.004, b.mount.z], [b.x, LANE_TOP + 0.004, b.pick.z]]}
        color={tint(b.hue, c, c.l - 10)}
        lineWidth={1.2}
        dashed
        dashSize={0.08}
        gapSize={0.06}
      />
      <Line points={[[b.x - 0.25, LANE_TOP + 0.004, b.mount.z], [b.x - 0.25, LANE_TOP + 0.004, b.pick.z], [b.x + 0.25, LANE_TOP + 0.004, b.pick.z], [b.x + 0.25, LANE_TOP + 0.004, b.mount.z]]} color={c.edge} lineWidth={1} />
      <Box size={[0.08, b.top + 0.1, 0.08]} position={[b.x + 0.36, (b.top + 0.1) / 2, mastZ]} color={c.surface} edge={c.edge} />
      <mesh ref={carriage} position={[b.x + 0.36, b.lift, mastZ]}>
        <boxGeometry args={[0.18, 0.14, 0.2]} />
        <meshLambertMaterial color={c.surface} />
        <Edges color={ACCENT} />
      </mesh>
      <group ref={windowRef} position={[b.x, 0, zIn]} visible={false}>
        <Line points={[[-0.28, -0.22, 0], [0.28, -0.22, 0], [0.28, 0.22, 0], [-0.28, 0.22, 0], [-0.28, -0.22, 0]]} color={ACCENT} lineWidth={1.6} />
      </group>
      <group ref={reel} visible={false}>
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[REEL.r, REEL.r, REEL.t, 20]} />
          <meshLambertMaterial color={tint(b.hue, c)} />
          <Edges color={ACCENT} threshold={25} />
        </mesh>
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.05, 0.05, REEL.t * 1.6, 8]} />
          <meshLambertMaterial color={c.surface} />
          <Edges color={ACCENT} threshold={25} />
        </mesh>
      </group>
      <mesh position={[b.x, LANE_TOP + 0.003, b.pick.z + b.side * 0.24]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.46, 0.115]} />
        <meshBasicMaterial map={label} toneMapped={false} />
      </mesh>
    </group>
  )
}

function GantryView({ g, c }: { g: Gantry; c: Colors }) {
  const beam = useRef<Group>(null)
  const head = useRef<Group>(null)
  const quills = useRef<(Mesh | null)[]>([])
  const tips = useRef<(Mesh | null)[]>([])
  const flash = useRef<Mesh>(null)
  const headEdge = useRef<{ material: { color: Color } } | null>(null)
  const acc = useMemo(() => new Color(ACCENT), [])
  const plain = useMemo(() => new Color(c.edge), [c.edge])
  useFrame(() => {
    beam.current!.position.z = g.z
    head.current!.position.set(g.x, 0, g.z)
    g.nozzles.forEach((nz, k) => {
      const q = quills.current[k], tip = tips.current[k]
      if (!q || !tip) return
      const [ox, oz] = offsetAt(g, k, 0)
      const y1 = HEAD_Y - 0.05, y0 = TIP_REST - nz.ext + 0.06
      q.position.set(ox, (y0 + y1) / 2, oz)
      q.scale.y = Math.max(0.01, y1 - y0)
      tip.position.set(ox, TIP_REST - nz.ext + 0.03, oz)
      ;(tip.material as MeshLambertMaterial).color.set(nz.part ? ACCENT : c.surface)
    })
    if (headEdge.current) headEdge.current.material.color.copy(g.nozzles.some((nz) => nz.part) ? acc : plain)
    const f = flash.current!
    f.visible = g.flash > 0.01
    f.position.copy(g.flashAt).setY(DECK + 0.08)
    f.scale.setScalar(0.4 + (1 - g.flash) * 1.4)
    ;(f.material as MeshLambertMaterial).opacity = g.flash
  })
  return (
    <group>
      <group ref={beam}>
        <Box size={[20.4, 0.24, 0.3]} position={[0, BEAM_Y, 0]} color={c.surface} edge={c.edge} />
        {[-10.2, 10.2].map((x) => (
          <Box key={x} size={[0.4, 0.3, 0.5]} position={[x, BEAM_Y + 0.02, 0]} color={c.surface} edge={c.edge} />
        ))}
      </group>
      <group ref={head}>
        <mesh position={[0, (BEAM_Y + HEAD_Y) / 2 - 0.02, 0.0]}>
          <boxGeometry args={[1.4, BEAM_Y - HEAD_Y + 0.25, 0.62]} />
          <meshLambertMaterial color={c.surface} />
          <Edges ref={headEdge as never} color={c.edge} />
        </mesh>
        <group>
          {g.nozzles.map((_, k) => (
            <group key={k}>
              <mesh ref={(m) => { quills.current[k] = m }}>
                <cylinderGeometry args={[0.028, 0.028, 1, 8]} />
                <meshBasicMaterial color={c.edge} />
              </mesh>
              <mesh ref={(m) => { tips.current[k] = m }}>
                <cylinderGeometry args={[0.05, 0.03, 0.06, 10]} />
                <meshLambertMaterial color={c.surface} />
              </mesh>
            </group>
          ))}
        </group>
      </group>
      <mesh ref={flash} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <ringGeometry args={[0.18, 0.24, 32]} />
        <meshBasicMaterial color={ACCENT} transparent side={DoubleSide} toneMapped={false} />
      </mesh>
    </group>
  )
}

function Gantries({ sim, c, machine }: { sim: Sim; c: Colors; machine: Machine }) {
  return (
    <group key={machine}>
      {sim.gantries.map((g, i) => (g.rotary ? <RotaryGantry key={i} g={g} c={c} /> : <GantryView key={i} g={g} c={c} />))}
    </group>
  )
}
function RotaryGantry({ g, c }: { g: Gantry; c: Colors }) {
  const beam = useRef<Group>(null)
  const head = useRef<Group>(null)
  const ring = useRef<Group>(null)
  const quills = useRef<(Mesh | null)[]>([])
  const tips = useRef<(Mesh | null)[]>([])
  const flash = useRef<Mesh>(null)
  const n = g.nozzles.length
  useFrame(() => {
    beam.current!.position.z = g.z
    head.current!.position.set(g.x, 0, g.z)
    ring.current!.rotation.y = -g.ring
    g.nozzles.forEach((nz, k) => {
      const q = quills.current[k], tip = tips.current[k]
      if (!q || !tip) return
      const a = (TAU * k) / n
      const ox = RING_R * Math.cos(a), oz = RING_R * Math.sin(a)
      const y1 = HEAD_Y - 0.05, y0 = TIP_REST - nz.ext + 0.06
      q.position.set(ox, (y0 + y1) / 2, oz)
      q.scale.y = Math.max(0.01, y1 - y0)
      tip.position.set(ox, TIP_REST - nz.ext + 0.03, oz)
      ;(tip.material as MeshLambertMaterial).color.set(nz.part ? ACCENT : c.surface)
    })
    const f = flash.current!
    f.visible = g.flash > 0.01
    f.position.copy(g.flashAt).setY(DECK + 0.08)
    f.scale.setScalar(0.4 + (1 - g.flash) * 1.4)
    ;(f.material as MeshLambertMaterial).opacity = g.flash
  })
  return (
    <group>
      <group ref={beam}>
        <Box size={[20.4, 0.24, 0.3]} position={[0, BEAM_Y, 0]} color={c.surface} edge={c.edge} />
        {[-10.2, 10.2].map((x) => (
          <Box key={x} size={[0.4, 0.3, 0.5]} position={[x, BEAM_Y + 0.02, 0]} color={c.surface} edge={c.edge} />
        ))}
      </group>
      <group ref={head}>
        <Box size={[0.7, BEAM_Y - HEAD_Y - 0.1, 0.62]} position={[0, (BEAM_Y + HEAD_Y) / 2 + 0.1, 0]} color={c.surface} edge={c.edge} />
        <group ref={ring}>
          <Cyl r={RING_R + 0.1} h={0.16} position={[0, HEAD_Y + 0.05, 0]} color={c.surface} edge={ACCENT} segments={36} />
          {g.nozzles.map((_, k) => (
            <group key={k}>
              <mesh ref={(m) => { quills.current[k] = m }}>
                <cylinderGeometry args={[0.026, 0.026, 1, 8]} />
                <meshBasicMaterial color={c.edge} />
              </mesh>
              <mesh ref={(m) => { tips.current[k] = m }}>
                <cylinderGeometry args={[0.05, 0.03, 0.06, 10]} />
                <meshLambertMaterial color={c.surface} />
              </mesh>
            </group>
          ))}
        </group>
      </group>
      <mesh ref={flash} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <ringGeometry args={[0.18, 0.24, 32]} />
        <meshBasicMaterial color={ACCENT} transparent side={DoubleSide} toneMapped={false} />
      </mesh>
    </group>
  )
}

function MachineFrame({ sim, c, machine }: { sim: Sim; c: Colors; machine: Machine }) {
  const posts: [number, number][] = [[-10.2, -4.9], [10.2, -4.9], [-10.2, 4.9], [10.2, 4.9]]
  const sign = useMemo(() => textTexture(1024, 64, (ctx) => {
    ctx.fillStyle = c.fg
    ctx.font = `500 40px ${FONT}`
    ctx.fillText('PICK & PLACE · SMT-01', 8, 46)
    ctx.fillStyle = c.muted
    ctx.font = `400 30px ${FONT}`
    ctx.textAlign = 'right'
    const head = machine === 'dual' ? '2 gantries · 8 nozzles' : machine === 'turret' ? 'rotary head · 12 nozzles' : '1 gantry · 4 nozzles'
    ctx.fillText(`${sim.banks.length} feeder banks · ${head}`, 1016, 46)
  }), [c, machine, sim])
  return (
    <group>
      <mesh position={[-1, 0.01, 8.25]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[12, 0.75]} />
        <meshBasicMaterial map={sign} transparent toneMapped={false} />
      </mesh>
      <Box size={[20.4, DECK - 0.08, 9.4]} position={[0, (DECK - 0.08) / 2, 0]} color={c.surface} edge={c.edge} />
      {posts.map(([x, z]) => (
        <Box key={`${x}${z}`} size={[0.22, BEAM_Y + 0.2 - DECK, 0.22]} position={[x, DECK + (BEAM_Y + 0.2 - DECK) / 2 - 0.08, z]} color={c.surface} edge={c.edge} />
      ))}
      {[-10.2, 10.2].map((x) => (
        <Box key={x} size={[0.26, 0.2, 10]} position={[x, BEAM_Y + 0.12, 0]} color={c.surface} edge={c.edge} />
      ))}
      {[sim.cams.rear, sim.cams.front].map((v, i) => (
        <group key={i} position={[v.x, DECK, v.z]}>
          <Cyl r={0.16} h={0.1} position={[0, 0.0, 0]} color={c.surface} edge={c.edge} segments={20} />
          <Cyl r={0.08} h={0.04} position={[0, 0.07, 0]} color="#1D2225" edge={c.edge} segments={16} />
        </group>
      ))}
    </group>
  )
}

function Conveyor({ c }: { c: Colors }) {
  const half = BOARD_W / 2 + 0.12
  const x0 = -15.2, x1 = EXIT_X + 1.6
  const ticks = useMemo(() => {
    const pts: number[] = []
    for (let x = x0; x <= x1; x += 0.5) for (const z of [-half, half]) pts.push(x, DECK + 0.04, z - 0.06, x, DECK + 0.04, z + 0.06)
    return segmentsGeometry(pts)
  }, [half, x1])
  return (
    <group>
      {[-half, half].map((z) => (
        <Box key={z} size={[x1 - x0, 0.08, 0.14]} position={[(x0 + x1) / 2, DECK, z]} color={c.surface} edge={c.edge} />
      ))}
      <lineSegments geometry={ticks} raycast={() => null}>
        <lineBasicMaterial color={c.edge} />
      </lineSegments>
      {[[-12.6, -half], [-12.6, half], [EXIT_X, -half], [EXIT_X, half], [-10.8, -half], [-10.8, half]].map(([x, z]) => (
        <Box key={`${x}${z}`} size={[0.12, DECK - 0.04, 0.12]} position={[x, (DECK - 0.04) / 2, z]} color={c.surface} edge={c.edge} />
      ))}
      <Box size={[1.8, 2.4, BOARD_W + 0.8]} position={[-14.3, 1.2, 0]} color={c.surface} edge={c.edge} />
      {Array.from({ length: 8 }, (_, k) => (
        <Line key={k} points={[[-13.39, 0.35 + k * 0.26, -BOARD_W / 2], [-13.39, 0.35 + k * 0.26, BOARD_W / 2]]} color={c.edge} lineWidth={1} />
      ))}
    </group>
  )
}

function Oven({ sim, c, onRun }: { sim: Sim; c: Colors; onRun: () => void }) {
  const zones = useRef<(MeshLambertMaterial | null)[]>([])
  const stamp = useRef<Mesh>(null)
  const cold = useMemo(() => new Color(c.surface), [c.surface])
  const hot = useMemo(() => new Color(HOT), [])
  const d = BOARD_W + 1.6
  useFrame(({ clock }) => {
    zones.current.forEach((m, k) => {
      if (!m) return
      const zx = OVEN.x0 + 0.8 + k * 1.28
      const near = sim.reflow ? clamp(1 - Math.abs(sim.boardX - zx) / 3.2, 0, 1) * 0.6 + 0.4 : 0.025 + 0.015 * Math.sin(clock.elapsedTime * 2 + k)
      m.color.copy(cold).lerp(hot, near * (0.5 + k * 0.08))
    })
    const s = stamp.current!
    s.visible = sim.stamp > 0.01
    s.scale.setScalar(0.6 + sim.stamp * 0.4)
    ;(s.material as MeshLambertMaterial).opacity = sim.stamp
  })
  const label = useMemo(() => textTexture(512, 96, (ctx) => {
    ctx.fillStyle = c.fg
    ctx.font = `500 44px ${FONT}`
    ctx.fillText('REFLOW · install', 16, 62)
    ctx.fillStyle = c.muted
    ctx.font = `400 28px ${FONT}`
    ctx.textAlign = 'right'
    ctx.fillText('click to run', 500, 62)
  }), [c])
  const stampTex = useMemo(() => textTexture(512, 160, (ctx) => {
    ctx.strokeStyle = ACCENT
    ctx.lineWidth = 8
    ctx.strokeRect(8, 8, 496, 144)
    ctx.fillStyle = ACCENT
    ctx.font = `600 70px ${FONT}`
    ctx.textAlign = 'center'
    ctx.fillText('INSTALLED', 256, 104)
  }), [])
  return (
    <group
      onClick={(e) => { e.stopPropagation(); if (e.delta <= 4) onRun() }}
      onPointerOver={() => { document.body.style.cursor = 'pointer' }}
      onPointerOut={() => { document.body.style.cursor = '' }}
    >
      <Box size={[OVEN.x1 - OVEN.x0, 2.3, d]} position={[OVEN.mid, 1.15, 0]} color={c.surface} edge={c.edge} opacity={0.42} />
      <Box size={[0.08, 0.5, d - 0.6]} position={[OVEN.x0 - 0.02, DECK + 0.18, 0]} color={c.bg} edge={c.edge} />
      <Box size={[0.08, 0.5, d - 0.6]} position={[OVEN.x1 + 0.02, DECK + 0.18, 0]} color={c.bg} edge={c.edge} />
      {Array.from({ length: 6 }, (_, k) => (
        <mesh key={k} position={[OVEN.x0 + 0.8 + k * 1.28, 2.32, 0]}>
          <boxGeometry args={[1.0, 0.06, d - 1.2]} />
          <meshLambertMaterial ref={(m) => { zones.current[k] = m }} color={c.surface} />
          <Edges color={c.edge} />
        </mesh>
      ))}
      <mesh position={[OVEN.mid, 1.5, d / 2 + 0.01]}>
        <planeGeometry args={[5.2, 0.98]} />
        <meshBasicMaterial map={label} transparent toneMapped={false} />
      </mesh>
      <mesh ref={stamp} position={[EXIT_X, 2.4, 0]} rotation={[-Math.PI / 4, 0, 0]} visible={false}>
        <planeGeometry args={[3.2, 1.0]} />
        <meshBasicMaterial map={stampTex} transparent toneMapped={false} depthTest={false} />
      </mesh>
      <Box size={[3, 0.06, d - 0.8]} position={[EXIT_X, DECK - 0.1, 0]} color={c.surface} edge={c.edge} />
    </group>
  )
}

function Board({ sim, lab, c, focus, tip }: { sim: Sim; lab: Lab; c: Colors; focus: CategoryId; tip: Tip }) {
  const group = useRef<Group>(null)
  const bump = useRef<Record<string, number>>({ framework: 0, database: 0 })
  const chips = useRef<Record<string, Group | null>>({})
  useFrame((_, dt) => {
    group.current!.position.x = sim.boardX
    for (const key of ['framework', 'database']) {
      bump.current[key] = Math.max(0, bump.current[key] - dt * 3)
      const g = chips.current[key]
      if (g) g.position.y = Math.sin(bump.current[key] * Math.PI) * 0.4
    }
  })
  const silk = useMemo(() => {
    const pts: number[] = []
    const y = DECK + BOARD_T + 0.002
    for (const r of sim.regions)
      for (const cell of r.cells) {
        if (cell.layer) continue
        const w = r.cw * 0.4, d = r.cd * 0.42
        rect(pts, cell.x - d, cell.z - w, cell.x + d, cell.z + w, y)
      }
    return segmentsGeometry(pts)
  }, [sim])
  const labels = useMemo(
    () =>
      sim.regions.map((r) =>
        textTexture(2048, 64, (ctx) => {
          ctx.fillStyle = c.muted
          ctx.font = `500 40px ${FONT}`
          ctx.fillText(r.label, 6, 46)
        }),
      ),
    [sim, c],
  )
  const chipTex = useMemo(() => {
    const make = (title: string, value: string) =>
      textTexture(256, 256, (ctx) => {
        ctx.fillStyle = '#1D2225'
        ctx.fillRect(0, 0, 256, 256)
        ctx.strokeStyle = ACCENT
        ctx.lineWidth = 3
        ctx.strokeRect(14, 14, 228, 228)
        ctx.fillStyle = '#8A9094'
        ctx.font = `500 22px ${FONT}`
        ctx.fillText(title, 28, 104)
        ctx.fillStyle = '#FCFCFC'
        ctx.font = `500 ${value.length > 9 ? 28 : 38}px ${FONT}`
        ctx.fillText(value, 28, 150)
        ctx.fillStyle = '#8A9094'
        ctx.font = `400 18px ${FONT}`
        ctx.fillText('click to swap ↻', 28, 216)
      })
    return {
      framework: make('FRAMEWORK', frameworks.find((f) => f.value === lab.setup.framework)!.label),
      database: make('DATABASE', databases.find((d) => d.value === lab.setup.database)!.label),
    }
  }, [lab.setup.framework, lab.setup.database])
  const focusRegion = focus === 'all' ? -1 : focus === 'feature' || focus === 'component' ? 0 : regionOf(sim, focus)
  const top = DECK + BOARD_T
  const pins = (x: number, z: number) => {
    const pts: [number, number, number][] = []
    for (let k = 0; k < 7; k++) {
      const o = -0.3 + k * 0.1, e = 0.39
      pts.push([x + o, top + 0.002, z - e], [x + o, top + 0.002, z - e - 0.08], [x + o, top + 0.002, z + e], [x + o, top + 0.002, z + e + 0.08])
      pts.push([x - e, top + 0.002, z + o], [x - e - 0.08, top + 0.002, z + o], [x + e, top + 0.002, z + o], [x + e + 0.08, top + 0.002, z + o])
    }
    return pts
  }
  const swap = (key: 'framework' | 'database') => {
    bump.current[key] = 1
    if (key === 'framework') lab.set('framework', lab.setup.framework === 'next' ? 'tanstack' : 'next')
    else lab.set('database', lab.setup.database === 'postgres' ? 'mongodb' : 'postgres')
  }
  return (
    <group ref={group}>
      <Box size={[sim.boardL, BOARD_T, BOARD_W]} position={[0, DECK + BOARD_T / 2, 0]} color={c.board} edge={c.fg} lineWidth={1.4} />
      <lineSegments geometry={silk} raycast={() => null}>
        <lineBasicMaterial color={c.silk} />
      </lineSegments>
      {sim.regions.map((r, i) => (
        <group key={r.id}>
          <Line
            points={[[r.x0 + 0.04, top + 0.003, -BOARD_W / 2 + 0.08], [r.x0 + 0.04, top + 0.003, BOARD_W / 2 - 0.08], [r.x1 - 0.02, top + 0.003, BOARD_W / 2 - 0.08], [r.x1 - 0.02, top + 0.003, -BOARD_W / 2 + 0.08], [r.x0 + 0.04, top + 0.003, -BOARD_W / 2 + 0.08]]}
            color={i === focusRegion ? ACCENT : c.silk}
            lineWidth={i === focusRegion ? 2 : 1}
            dashed={i !== focusRegion}
            dashSize={0.06}
            gapSize={0.05}
          />
          <mesh position={[r.x0 + 0.13, top + 0.003, 0]} rotation={LABEL_ROT}>
            <planeGeometry args={[5.76, 0.18]} />
            <meshBasicMaterial map={labels[i]} transparent toneMapped={false} />
          </mesh>
        </group>
      ))}
      {(['framework', 'database'] as const).map((key, i) => {
        const [x, z] = sim.chips[i]
        return (
          <group key={key} ref={(g) => { chips.current[key] = g }}>
            <Line points={pins(x, z)} segments color={c.edge} lineWidth={1} />
            <mesh
              position={[x, top + 0.06, z]}
              rotation={[0, Math.PI / 2, 0]}
              onClick={(e) => { e.stopPropagation(); if (e.delta <= 4) swap(key) }}
              onPointerOver={(e) => { e.stopPropagation(); tip.show(e.nativeEvent, key === 'framework' ? 'Framework chip' : 'Database chip', 'Click to swap') }}
              onPointerMove={(e) => tip.move(e.nativeEvent)}
              onPointerOut={() => tip.hide()}
            >
              <boxGeometry args={[0.76, 0.12, 0.76]} />
              <meshLambertMaterial attach="material-0" color="#1D2225" />
              <meshLambertMaterial attach="material-1" color="#1D2225" />
              <meshBasicMaterial attach="material-2" map={chipTex[key]} toneMapped={false} />
              <meshLambertMaterial attach="material-3" color="#1D2225" />
              <meshLambertMaterial attach="material-4" color="#1D2225" />
              <meshLambertMaterial attach="material-5" color="#1D2225" />
              <Edges color={c.edge} />
            </mesh>
          </group>
        )
      })}
    </group>
  )
}

const loader = new TextureLoader()
const textureCache = new Map<string, Promise<Texture>>()
function loadTexture(url: string) {
  let hit = textureCache.get(url)
  if (!hit) {
    hit = loader.loadAsync(url).then((t) => {
      t.colorSpace = SRGBColorSpace
      t.anisotropy = 8
      const img = t.image as HTMLImageElement
      const want = SIZES.block[0] / SIZES.block[2]
      const aspect = img.height / img.width
      if (aspect > want) {
        t.repeat.set(1, want / aspect)
        t.offset.set(0, 1 - want / aspect)
      }
      return t
    })
    textureCache.set(url, hit)
  }
  return hit
}

function PartMesh({ p, lab, c, tip }: { p: Part; lab: Lab; c: Colors; tip: Tip }) {
  const ref = useRef<Mesh>(null)
  const edge = useRef<{ material: { color: Color } } | null>(null)
  const [texture, setTexture] = useState<Texture | null>(null)
  const [hover, setHover] = useState(false)
  const image = p.kind === 'block' ? (lab.theme === 'dark' ? (p.item.imageDark ?? p.item.image) : p.item.image) : undefined
  useEffect(() => {
    if (!image) return
    let live = true
    loadTexture(image).then((t) => live && setTexture(t), () => {})
    return () => { live = false }
  }, [image])
  const base = useMemo(() => new Color(c.edge), [c.edge])
  const acc = useMemo(() => new Color(ACCENT), [])
  const hot = useMemo(() => new Color(HOT), [])
  useFrame(() => {
    const m = ref.current
    if (!m) return
    m.position.copy(p.pos)
    m.scale.setScalar(p.scale)
    m.rotation.y = Math.PI / 2
    if (edge.current) {
      const col = edge.current.material.color
      col.copy(hover || p.mode === 'held' || p.mode === 'ready' || p.mode === 'feed' ? acc : base)
      if (p.glow > 0) col.lerp(hot, p.glow)
    }
  })
  const side = tint(p.item.hue, c)
  return (
    <mesh
      ref={ref}
      onClick={(e) => {
        e.stopPropagation()
        if (e.delta > 4) return
        setHover(false)
        tip.hide()
        if (e.nativeEvent.shiftKey && lab.inspect) lab.inspect(p.item.ref)
        else lab.toggle(p.item.ref)
      }}
      onPointerOver={(e) => {
        e.stopPropagation()
        setHover(true)
        tip.show(e.nativeEvent, p.item.title, `${p.item.label} · ${p.code} · ${lab.selected.has(p.item.ref) ? 'click to pull' : 'click to place'}`, p.item.hue)
      }}
      onPointerMove={(e) => tip.move(e.nativeEvent)}
      onPointerOut={() => { setHover(false); tip.hide() }}
    >
      <boxGeometry args={[p.size[2], p.size[1], p.size[0]]} />
      {[0, 1, 3, 4, 5].map((i) => (
        <meshLambertMaterial key={i} attach={`material-${i}`} color={side} />
      ))}
      {texture ? (
        <meshBasicMaterial attach="material-2" map={texture} toneMapped={false} />
      ) : (
        <meshLambertMaterial attach="material-2" color={tint(p.item.hue, c, c.l + 12)} />
      )}
      <Edges ref={edge as never} color={c.edge} />
    </mesh>
  )
}

function Floor({ c, env }: { c: Colors; env: Env }) {
  const grid = useMemo(() => {
    const pts: number[] = []
    for (let x = -18; x <= 23; x += 1.2) pts.push(x, 0, -10.2, x, 0, 10.2)
    for (let z = -10.2; z <= 10.3; z += 1.2) pts.push(-18, 0, z, 23, 0, z)
    return segmentsGeometry(pts)
  }, [])
  const walk = useMemo(() => {
    const pts: number[] = []
    rect(pts, -16.2, -8.9, 21.4, 8.9, 0.005)
    rect(pts, -16.4, -9.1, 21.6, 9.1, 0.005)
    return segmentsGeometry(pts)
  }, [])
  return (
    <group>
      <lineSegments geometry={grid} raycast={() => null}>
        <lineBasicMaterial color={c.floor} />
      </lineSegments>
      <lineSegments geometry={walk} raycast={() => null}>
        <lineBasicMaterial color={env === 'cleanroom' ? c.light : c.edge} />
      </lineSegments>
    </group>
  )
}

type Tip = { show: (e: PointerEvent, title: string, sub: string, hue?: number) => void; move: (e: PointerEvent) => void; hide: () => void }
function useTip() {
  const ref = useRef<HTMLDivElement>(null)
  const api = useMemo<Tip>(() => {
    const move = (e: PointerEvent) => {
      const el = ref.current
      if (el) el.style.transform = `translate(${e.clientX + 14}px, ${e.clientY + 14}px)`
    }
    return {
      show: (e, title, sub, hue) => {
        const el = ref.current
        if (!el) return
        el.querySelector<HTMLElement>('[data-dot]')!.style.background = hue === undefined ? ACCENT : `hsl(${hue} 50% 58%)`
        el.querySelector('[data-title]')!.textContent = title
        el.querySelector('[data-sub]')!.textContent = sub
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

type Overlay = { banks: (HTMLDivElement | null)[]; tags: (HTMLDivElement | null)[]; aoi: Map<string, HTMLDivElement> }

type Insets = { l: number; r: number; t: number; b: number }
function CameraRig({ sim, dirRef, focusRef, lod, insets }: { sim: Sim; dirRef: { current: Director }; focusRef: { current: CategoryId }; lod: { current: number }; insets: Insets }) {
  const { camera, size, gl } = useThree()
  const st = useRef({
    target: new Vector3(0, 1.5, 0), zoom: 20, az: 0.6, el: 0.6,
    goal: new Vector3(), goalZoom: 20, pan: new Vector3(), userZoom: 1, userAt: -99, ready: false,
  })
  useEffect(() => {
    const el = gl.domElement
    let drag: { x: number; y: number; moved: boolean } | null = null
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const s = st.current
      s.userZoom = clamp(s.userZoom * Math.exp(-e.deltaY * 0.0015), 0.35, 8)
      s.userAt = performance.now() / 1000
    }
    const onDown = (e: PointerEvent) => { drag = { x: e.clientX, y: e.clientY, moved: false } }
    const onMove = (e: PointerEvent) => {
      if (!drag || !(e.buttons & 1)) return
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y
      if (!drag.moved && Math.hypot(dx, dy) < 5) return
      drag.moved = true
      drag.x = e.clientX
      drag.y = e.clientY
      const s = st.current
      const z = (camera as unknown as { zoom: number }).zoom
      const right = new Vector3().setFromMatrixColumn(camera.matrixWorld, 0)
      const up = new Vector3().setFromMatrixColumn(camera.matrixWorld, 1)
      s.pan.addScaledVector(right, -dx / z).addScaledVector(up, dy / z)
      s.userAt = performance.now() / 1000
    }
    const onUp = () => { drag = null }
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
  }, [gl, camera])

  const fit = (az: number, el: number, pts: number[][], padX: number, padY: number) => {
    const dir = new Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el))
    const right = new Vector3(Math.cos(az), 0, -Math.sin(az))
    const up = new Vector3().crossVectors(dir, right).negate()
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
    const v = new Vector3()
    for (const [x, y, z] of pts) {
      v.set(x, y, z)
      x0 = Math.min(x0, v.dot(right)); x1 = Math.max(x1, v.dot(right))
      y0 = Math.min(y0, v.dot(up)); y1 = Math.max(y1, v.dot(up))
    }
    const center = right.multiplyScalar((x0 + x1) / 2).addScaledVector(up, (y0 + y1) / 2)
    return { center, zoom: Math.min((size.width - insets.l - insets.r - padX) / (x1 - x0), (size.height - insets.t - insets.b - padY) / (y1 - y0)) }
  }

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 8)
    const s = st.current
    const d = dirRef.current
    const now = performance.now() / 1000
    const tallest = Math.max(...sim.banks.map((b) => b.top))
    let az = 0.3, el = 0.8
    const over = fit(az, el, [[-15.4, 0, -7.7], [EXIT_X + 1.6, 0, 7.7], [-15.4, 0, 7.7], [EXIT_X + 1.6, 0, -7.7], [0, tallest + 0.6, -ROW_Z], [-9, tallest, -ROW_Z], [9, tallest, -ROW_Z]], 24, 40)
    const goal = s.goal.copy(over.center)
    let zoom = over.zoom
    const f = sim.follow
    const followOn = d.follow && (f || sim.reflow)
    const bank = focusRef.current !== 'all' ? sim.banks.find((b) => b.id === focusRef.current) : undefined
    const pending = sim.banks.reduce((n, b) => n + b.queue.length + (b.cur ? 1 : 0), 0)
    if (d.cam === 'aoi') {
      az = Math.PI / 2
      el = Math.PI / 2 - 0.0005
      const aoi = fit(az, el, [[sim.boardX - sim.boardL / 2, DECK, -BOARD_W / 2], [sim.boardX + sim.boardL / 2, DECK, BOARD_W / 2]], 80, 60)
      goal.set(sim.boardX, DECK, 0)
      zoom = aoi.zoom
    } else if (d.cam === 'nozzle') {
      az = 0.42
      el = 0.42
      const g = sim.gantries.reduce((best, x) => (x.nozzles.filter((n) => n.part).length > best.nozzles.filter((n) => n.part).length ? x : best), sim.gantries[0])
      if (followOn && f) goal.copy(f.pos)
      else if (followOn) goal.set(sim.boardX, DECK, 0)
      else goal.set(g.x, 1.8, g.z)
      zoom = over.zoom * 4.6
    } else if (followOn) {
      if (f) goal.copy(f.pos)
      else goal.set(sim.boardX, DECK + 0.6, 0)
      zoom = over.zoom * (pending > 3 ? 1.7 : f ? 2.7 : 1.9)
      el = 0.52
    } else if (bank) {
      goal.set(bank.x, (bank.top + DECK) / 2, bank.z * 0.7)
      zoom = over.zoom * 2.3
    }
    const manual = now - s.userAt < 5
    if (!s.ready) {
      s.target.copy(goal)
      s.zoom = zoom
      s.az = az
      s.el = el
      s.ready = true
    }
    if (!manual) {
      s.pan.multiplyScalar(Math.exp(-dt * 1.5))
      s.userZoom = Math.exp(Math.log(s.userZoom) * Math.exp(-dt * 1.5))
    }
    const k = 1 - Math.exp(-dt * (manual ? 6 : 2.6))
    if (!manual) {
      s.target.lerp(goal, k)
      s.zoom = Math.exp(Math.log(s.zoom) + (Math.log(zoom) - Math.log(s.zoom)) * k)
    }
    const ka = 1 - Math.exp(-dt * 2.4)
    s.az += (az - s.az) * ka
    s.el += (el - s.el) * ka
    const dir = new Vector3(Math.sin(s.az) * Math.cos(s.el), Math.sin(s.el), Math.cos(s.az) * Math.cos(s.el))
    const look = s.target.clone().add(s.pan)
    camera.position.copy(look).addScaledVector(dir, 80)
    const top = clamp((s.el - 1.2) / 0.35, 0, 1)
    camera.up.set(-Math.sin(s.az) * top, 1 - top, -Math.cos(s.az) * top).normalize()
    camera.lookAt(look)
    const cam = camera as unknown as { zoom: number; updateProjectionMatrix: () => void }
    cam.zoom = s.zoom * s.userZoom
    camera.updateMatrixWorld()
    const right = new Vector3().setFromMatrixColumn(camera.matrixWorld, 0)
    const up = new Vector3().setFromMatrixColumn(camera.matrixWorld, 1)
    camera.position.addScaledVector(right, -(insets.l - insets.r) / (2 * cam.zoom)).addScaledVector(up, -(insets.b - insets.t) / (2 * cam.zoom))
    camera.updateMatrixWorld()
    cam.updateProjectionMatrix()
    lod.current = cam.zoom / over.zoom
  })
  return null
}

function Projector({ sim, overlay, dirRef, lod }: { sim: Sim; overlay: Overlay; dirRef: { current: Director }; lod: { current: number } }) {
  const { camera, size } = useThree()
  const v = useMemo(() => new Vector3(), [])
  useFrame(() => {
    const aoi = dirRef.current.cam === 'aoi'
    sim.banks.forEach((b, i) => {
      const el = overlay.tags[i]
      if (!el) return
      const p = b.cur
      const show = !aoi && lod.current > 1.8 && !!p && (b.phase === 'eject' || b.phase === 'feed' || b.phase === 'ready')
      el.style.opacity = show ? '1' : '0'
      if (!show || !p) return
      if (el.dataset.ref !== p.item.ref) {
        el.dataset.ref = p.item.ref
        el.lastElementChild!.textContent = `${p.item.title} · ${p.code}`
      }
      v.copy(b.phase === 'eject' ? b.reelPos : b.mount).project(camera)
      el.style.transform = `translate(${((v.x + 1) / 2) * size.width + 10}px, ${((1 - v.y) / 2) * size.height - 8}px)`
    })
    const items = sim.banks.flatMap((b, i) => {
      const el = overlay.banks[i]
      if (!el) return []
      v.set(b.x, b.top + 0.2, b.z).project(camera)
      const button = el.firstElementChild as HTMLElement
      return [{ el, x: ((v.x + 1) / 2) * size.width, y: ((1 - v.y) / 2) * size.height, w: button.offsetWidth, h: button.offsetHeight }]
    })
    items.sort((a, b) => a.x - b.x)
    const placed: number[][] = []
    for (const it of items) {
      let top = it.y - 4 - it.h
      for (let level = 0; level < 7; level++) {
        top = it.y - 4 - level * (it.h + 3) - it.h
        const r = [it.x - it.w / 2 - 3, top - 2, it.x + it.w / 2 + 3, top + it.h + 2]
        if (!placed.some((q) => r[0] < q[2] && r[2] > q[0] && r[1] < q[3] && r[3] > q[1])) {
          placed.push(r)
          break
        }
      }
      it.el.style.transform = `translate(${it.x - it.w / 2}px, ${top}px)`
      ;(it.el.lastElementChild as HTMLElement).style.height = `${Math.max(0, it.y - top - it.h)}px`
      it.el.style.opacity = aoi ? '0' : '1'
    }
    overlay.aoi.forEach((el, ref) => {
      const p = sim.parts.get(ref)
      if (!p || !aoi) {
        el.style.opacity = '0'
        return
      }
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
      for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        v.set(p.pos.x + (sx * p.size[0]) / 2, p.pos.y + p.size[1] / 2, p.pos.z + (sz * p.size[2]) / 2).project(camera)
        const x = ((v.x + 1) / 2) * size.width, y = ((1 - v.y) / 2) * size.height
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y)
      }
      el.style.opacity = '1'
      el.style.transform = `translate(${x0 - 3}px, ${y0 - 3}px)`
      el.style.width = `${x1 - x0 + 6}px`
      el.style.height = `${y1 - y0 + 6}px`
    })
  })
  return null
}

function Watcher({ sim, onChange }: { sim: Sim; onChange: (v: number) => void }) {
  const last = useRef(-1)
  useFrame(() => {
    if (sim.version !== last.current) {
      last.current = sim.version
      onChange(sim.version)
    }
  })
  return null
}

function Simulator({ sim, labRef }: { sim: Sim; labRef: { current: Lab } }) {
  useFrame((_, dt) => {
    for (let i = 0; i < sim.speed; i++) step(sim, labRef.current, Math.min(dt, 1 / 8))
  })
  return null
}

function Scene({ sim, lab, labRef, dir, dirRef, focusRef, ui, overlay, setVersion, onReflow }: {
  sim: Sim; lab: Lab; labRef: { current: Lab }; dir: Director; dirRef: { current: Director }; focusRef: { current: CategoryId }
  ui: Ui; overlay: Overlay; setVersion: (v: number) => void; onReflow: () => void
}) {
  const { c } = ui
  const { gl, scene, camera } = useThree()
  useEffect(() => {
    Object.assign((window as unknown as { __smt: object }).__smt ?? {}, { scene, gl, camera })
  }, [scene, gl, camera])
  useEffect(() => {
    scene.background = new Color(c.bg)
    gl.setClearColor(c.bg)
  }, [c.bg, gl, scene])
  const live = [...sim.live]
  return (
    <>
      <CameraRig sim={sim} dirRef={dirRef} focusRef={focusRef} lod={ui.lod} insets={lab.chrome === 'embedded' ? { l: 0, r: 0, t: 56, b: 16 } : innerWidth < 640 ? { l: 0, r: 0, t: 110, b: 240 } : { l: 0, r: 316, t: 64, b: 64 }} />
      <Simulator sim={sim} labRef={labRef} />
      <Projector sim={sim} overlay={overlay} dirRef={dirRef} lod={ui.lod} />
      <Watcher sim={sim} onChange={setVersion} />
      <ambientLight intensity={c.amb * 2.4} />
      <directionalLight position={[4, 14, 7]} intensity={1.1} color={c.sun} />
      <Floor c={c} env={dir.env} />
      <MachineFrame sim={sim} c={c} machine={dir.machine} />
      <Conveyor c={c} />
      <Oven sim={sim} c={c} onRun={onReflow} />
      <Board sim={sim} lab={lab} c={c} focus={ui.focus} tip={ui.tip} />
      {sim.banks.map((b) =>
        b.tray ? (
          <Tray key={b.id} b={b} ui={ui} />
        ) : (
          <group key={b.id}>
            <Turret b={b} ui={ui} />
            <Feeder b={b} ui={ui} />
          </group>
        ),
      )}
      <Gantries sim={sim} c={c} machine={dir.machine} />
      {live.map((p) => (
        <PartMesh key={p.item.ref} p={p} lab={lab} c={c} tip={ui.tip} />
      ))}
    </>
  )
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

function DirectorPanel({ dir, setDir, sim }: { dir: Director; setDir: (d: Partial<Director>) => void; sim: Sim }) {
  const [, tick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 500)
    return () => clearInterval(id)
  }, [])
  const queue = sim.banks.reduce((n, b) => n + b.queue.length + (b.cur ? 1 : 0), 0)
  const cph = sim.placed.length * 120
  return (
    <div className="pointer-events-auto absolute left-3 top-[72px] z-30 w-[236px] rounded-xl border border-border bg-surface/90 text-xs shadow-lg backdrop-blur">
      <button type="button" onClick={() => setDir({ open: !dir.open })} className="flex w-full items-center justify-between px-3 py-2">
        <span className="tracking-wide text-muted">DIRECTOR</span>
        <span className="font-mono tabular-nums text-[11px] text-muted">
          {queue} in line · {cph.toLocaleString()} cph {dir.open ? '▾' : '▸'}
        </span>
      </button>
      {dir.open && (
        <div className="grid grid-cols-[auto_1fr] items-center gap-x-2 gap-y-1.5 border-t border-border px-3 pb-3 pt-2 text-[11px] text-muted">
          <span>Camera</span>
          <Segmented value={dir.cam} options={[{ value: 'overview', label: 'line' }, { value: 'nozzle', label: 'nozzle' }, { value: 'aoi', label: 'AOI' }] as const} onChange={(cam) => setDir({ cam })} />
          <span>Follow</span>
          <Segmented value={dir.follow ? 'on' : 'off'} options={[{ value: 'on', label: 'follow part' }, { value: 'off', label: 'hold' }] as const} onChange={(v) => setDir({ follow: v === 'on' })} />
          <span>Head</span>
          <Segmented value={dir.machine} options={[{ value: 'single', label: 'single' }, { value: 'dual', label: 'dual' }, { value: 'turret', label: 'rotary' }] as const} onChange={(machine) => setDir({ machine })} />
          <span>Room</span>
          <Segmented value={dir.env} options={[{ value: 'cleanroom', label: 'cleanroom' }, { value: 'lab', label: 'dark lab' }] as const} onChange={(env) => setDir({ env })} />
          <span className="col-span-2 pt-1 leading-snug">
            Click a reel to place its part, a part to pull it, the oven to reflow. Drag pans, wheel zooms; the camera returns on its own.
          </span>
        </div>
      )}
    </div>
  )
}

function Ticket({ lab, onReflow, count, inLine }: { lab: Lab; onReflow: () => void; count: number; inLine: number }) {
  const [copied, setCopied] = useState(false)
  const run = async () => {
    try {
      await navigator.clipboard.writeText(lab.command)
    } catch {}
    setCopied(true)
    onReflow()
    setTimeout(() => setCopied(false), 1400)
  }
  return (
    <div className="pointer-events-auto absolute right-3 top-[72px] z-30 w-[300px] rounded-xl border border-border bg-surface/92 p-3 text-xs shadow-lg backdrop-blur max-sm:inset-x-3 max-sm:bottom-[64px] max-sm:top-auto max-sm:w-auto max-sm:p-2">
      <div className="flex items-center justify-between">
        <span className="tracking-wide text-muted">WORK ORDER</span>
        <span className="rounded-md bg-background px-2 py-0.5 font-mono tabular-nums" data-count={count}>
          {pad(count)} placed{inLine ? ` · ${inLine} in line` : ''}
        </span>
      </div>
      <div className="mt-2.5 grid grid-cols-[auto_1fr] items-center gap-x-2 gap-y-1.5 text-[11px] text-muted max-sm:hidden">
        <span>Target</span>
        <Segmented value={lab.setup.target} options={[{ value: 'existing', label: 'add' }, { value: 'new', label: 'init' }] as const} onChange={(v) => lab.set('target', v)} />
        <span>Framework</span>
        <Segmented value={lab.setup.framework} options={frameworks} onChange={(v) => lab.set('framework', v)} />
        <span>Database</span>
        <Segmented value={lab.setup.database} options={databases} onChange={(v) => lab.set('database', v)} />
        <span>Installer</span>
        <Segmented value={lab.setup.packageManager} options={packageManagers} onChange={(v) => lab.set('packageManager', v)} />
        <span>Agent</span>
        <Segmented value={lab.setup.agent} options={agents} onChange={(v) => lab.set('agent', v)} />
        {lab.setup.target === 'new' && (
          <>
            <span>Name</span>
            <input value={lab.setup.name} onChange={(e) => lab.set('name', e.target.value)} className="min-w-0 rounded-md border border-border bg-background px-1.5 py-0.5 font-mono text-[11px] text-foreground outline-none focus:border-accent" />
          </>
        )}
      </div>
      <div className="mt-2.5 max-h-24 overflow-y-auto rounded-md max-sm:max-h-12 bg-background px-2 py-1.5 font-mono text-[11px] leading-[1.45] [overflow-wrap:anywhere]">
        <span className="text-accent">$ </span>
        {lab.command}
      </div>
      <div className="mt-2.5 flex gap-2">
        <button type="button" onClick={run} className="flex-1 rounded-lg bg-accent px-3 py-1.5 text-sm text-accent-foreground active:scale-[0.98]">
          {copied ? 'Copied · reflowing' : 'Copy & reflow'}
        </button>
        <button type="button" onClick={() => lab.clear()} disabled={!count} className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted hover:text-foreground disabled:opacity-40">
          Strip board
        </button>
      </div>
    </div>
  )
}

function Finder({ lab, sim }: { lab: Lab; sim: Sim }) {
  return (
    <div className="pointer-events-auto absolute bottom-3 left-3 z-30 flex w-[min(460px,calc(100%-84px))] gap-2 rounded-xl border border-border bg-surface/92 p-2 shadow-lg backdrop-blur">
      <input
        value={lab.focus.query}
        onChange={(e) => lab.setFocus({ query: e.target.value })}
        placeholder={`Search ${lab.catalog.items.length.toLocaleString()} reels`}
        className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-sm outline-none focus:border-accent"
      />
      <select
        value={lab.focus.category}
        onChange={(e) => lab.setFocus({ category: e.target.value as CategoryId })}
        className="rounded-md border border-border bg-background px-2 py-1 text-sm outline-none"
      >
        <option value="all">All feeders</option>
        {sim.banks.map((b) => (
          <option key={b.id} value={b.id}>
            {b.tray ? 'TRAY' : `${b.side < 0 ? 'R' : 'F'}${pad(b.no)}`} · {b.label}
          </option>
        ))}
      </select>
    </div>
  )
}

export default function SmtLine({ lab }: MockProps) {
  const labRef = useRef(lab)
  labRef.current = lab
  const [dir, setDirState] = useState<Director>({ cam: 'overview', follow: true, machine: 'dual', env: 'cleanroom', open: innerWidth > 640 })
  const dirRef = useRef(dir)
  dirRef.current = dir
  const [sim] = useState(() => createSim(lab, dir.machine))
  useEffect(() => {
    Object.assign(window, { __smt: { sim, labRef } })
  }, [sim])
  const [, setVersion] = useState(0)
  const machineRef = useRef(dir.machine)
  if (machineRef.current !== dir.machine) {
    machineRef.current = dir.machine
    swapMachine(sim, lab, dir.machine)
  }
  const setDir = (d: Partial<Director>) => setDirState((cur) => ({ ...cur, ...d }))
  const focusRef = useRef(lab.focus.category)
  focusRef.current = lab.focus.category
  const [tipRef, tip] = useTip()
  const c = useMemo(() => palette(lab.theme, dir.env), [lab.theme, dir.env])
  const query = lab.focus.query.trim().toLowerCase()
  const match = useMemo(() => {
    if (!query) return null
    return new Set(lab.catalog.items.filter((i) => `${i.title} ${i.name} ${i.label} ${i.sourceName ?? i.source}`.toLowerCase().includes(query)).map((i) => i.ref))
  }, [query, lab.catalog])
  const lod = useRef(1)
  const ui: Ui = useMemo(() => ({ match, focus: lab.focus.category, tip, lab, c, lod }), [match, lab, c, tip])
  const overlay = useMemo<Overlay>(() => ({ banks: [], tags: [], aoi: new Map() }), [])
  const reflow = () => { sim.reflowRequest = true }
  const embedded = lab.chrome === 'embedded'
  const seated = [...sim.live].filter((p) => p.mode === 'board')
  const inLine = sim.banks.reduce((n, b) => n + b.queue.length + (b.cur ? 1 : 0), 0)
  return (
    <div className="relative h-full w-full overflow-hidden" style={{ background: c.bg }}>
      <Canvas flat orthographic dpr={[1, 2]} camera={{ position: [30, 30, 30], zoom: 20, near: 0.1, far: 400 }} onPointerMissed={() => tip.hide()} className="!absolute inset-0">
        <Scene sim={sim} lab={lab} labRef={labRef} dir={dir} dirRef={dirRef} focusRef={focusRef} ui={ui} overlay={overlay} setVersion={setVersion} onReflow={reflow} />
      </Canvas>
      <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
        {sim.banks.map((b, i) => {
          const hits = match ? b.parts.filter((p) => match.has(p.item.ref)).length : null
          const focused = lab.focus.category === b.id
          return (
            <div key={b.id} ref={(el) => { overlay.banks[i] = el }} className="absolute left-0 top-0 flex flex-col items-center transition-opacity">
              <button
                type="button"
                onClick={() => lab.setFocus({ category: focused ? 'all' : b.id })}
                className={`pointer-events-auto flex items-center gap-1 whitespace-nowrap rounded-full border px-1.5 py-0.5 text-[10px] leading-none shadow-sm backdrop-blur ${focused ? 'border-accent bg-accent text-accent-foreground' : 'border-border bg-surface/85 text-foreground'} ${hits === 0 ? 'opacity-35' : ''}`}
              >
                <span className="size-1.5 rounded-full" style={{ background: `hsl(${b.hue} 50% 58%)` }} />
                {b.label}
                <span className={focused ? 'opacity-80' : 'text-muted'}>{hits === null ? b.parts.length : `${hits}/${b.parts.length}`}</span>
              </button>
              <span className="w-px bg-border" />
            </div>
          )
        })}
        {sim.banks.map((b, i) => (
          <div
            key={b.id}
            ref={(el) => { overlay.tags[i] = el }}
            className="absolute left-0 top-0 flex items-center gap-1 whitespace-nowrap rounded-md border border-accent bg-surface/90 px-1.5 py-0.5 text-[10px] leading-none text-foreground opacity-0 shadow-sm"
          >
            <span className="size-1.5 rounded-full" style={{ background: `hsl(${b.hue} 50% 58%)` }} />
            <span />
          </div>
        ))}
        {seated.map((p) => (
          <div
            key={p.item.ref}
            ref={(el) => {
              if (el) overlay.aoi.set(p.item.ref, el)
              else overlay.aoi.delete(p.item.ref)
            }}
            className="absolute left-0 top-0 rounded-[2px] border border-[#3FB58A] opacity-0"
          >
            <span className="absolute -top-3.5 left-0 whitespace-nowrap font-mono text-[9px] leading-none text-[#3FB58A]">
              {p.code} ✓
            </span>
          </div>
        ))}
      </div>
      <DirectorPanel dir={dir} setDir={setDir} sim={sim} />
      {!embedded && <Ticket lab={lab} onReflow={reflow} count={seated.length} inLine={inLine} />}
      {!embedded && <Finder lab={lab} sim={sim} />}
      <div ref={tipRef} className="pointer-events-none fixed left-0 top-0 z-40 flex max-w-72 items-start gap-2 rounded-lg border border-border bg-surface px-2.5 py-1.5 opacity-0 shadow-lg transition-opacity">
        <span data-dot className="mt-1.5 size-2 shrink-0 rounded-full" />
        <div>
          <div data-title className="text-sm text-foreground" />
          <div data-sub className="text-xs text-muted" />
        </div>
      </div>
    </div>
  )
}
