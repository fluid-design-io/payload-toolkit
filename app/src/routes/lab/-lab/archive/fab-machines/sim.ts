import { CatmullRomCurve3, Vector3 } from 'three'

import type { CatalogItem, Database, Framework, Setup } from '../../../../workspace/-workspace/workspace.types'
import type { Lab } from '../../lab.types'

/*
 * The fab's domain model. Every setup choice is a machine: the agent is the
 * integrator that seats chips, the package manager is the transport between
 * dock and intake, the framework is the board (cell), the database is the
 * storage unit wired to the board's memory socket. Idle machines park on
 * numbered hangar pads at the back of the floor; a swap docks the old machine
 * and launches the new one. Renderers read this state every frame and never
 * own any of it, so `isBusy` alone decides whether a frame would change.
 */

export type IntegratorId = 'arm' | 'drone' | 'walker'
export type TransportId = 'belt' | 'silo' | 'tube'
export type Rig = { integrator: IntegratorId; transport: TransportId; cell: Framework; storage: Database }
export type SlotKey = keyof Rig
export type Machine = { id: string; setup: string; brand: string; model: string; role: string; note: string; color: string; bay: number }

export const BRAND = {
  none: '#8E989D',
  claude: '#D97757',
  codex: '#2EC4E6',
  npm: '#CB3837',
  pnpm: '#F2A900',
  bun: '#E0A458',
  next: '#1D2225',
  tanstack: '#1FA39B',
  postgres: '#336791',
  mongodb: '#00A35C',
  spark: '#FFB347',
  bead: '#E8A15A',
}

export const MACHINES: Record<SlotKey, readonly Machine[]> = {
  integrator: [
    { id: 'arm', setup: 'none', brand: 'No agent', model: 'Articulated arm', role: 'Integrator', note: 'Manual. Overshoots, seats parts a little crooked.', color: BRAND.none, bay: 1 },
    { id: 'drone', setup: 'claude', brand: 'Claude Code', model: 'Quad drone', role: 'Integrator', note: 'Hums in, welds four solder beads per part.', color: BRAND.claude, bay: 2 },
    { id: 'walker', setup: 'codex', brand: 'Codex', model: 'Hexapod etcher', role: 'Integrator', note: 'Tripod gait, stops dead, laser-etches the outline.', color: BRAND.codex, bay: 3 },
  ],
  transport: [
    { id: 'belt', setup: 'npm', brand: 'npm', model: 'Belt conveyor', role: 'Transport', note: 'Every part rides the belt as its own copy.', color: BRAND.npm, bay: 4 },
    { id: 'silo', setup: 'pnpm', brand: 'pnpm', model: 'Content-addressed silo', role: 'Transport', note: 'Stored once. Slots get hard-link beams, not copies.', color: BRAND.pnpm, bay: 5 },
    { id: 'tube', setup: 'bun', brand: 'Bun', model: 'Pneumatic tube', role: 'Transport', note: 'Fires parts over the floor in a third of a second.', color: BRAND.bun, bay: 6 },
  ],
  cell: [
    { id: 'next', setup: 'next', brand: 'Next.js', model: 'Square cell', role: 'Board', note: 'Grid slots, Manhattan traces, BGA CPU.', color: BRAND.next, bay: 0 },
    { id: 'tanstack', setup: 'tanstack', brand: 'TanStack Start', model: 'Round cell', role: 'Board', note: 'Ring slots, radial traces, LGA CPU.', color: BRAND.tanstack, bay: 0 },
  ],
  storage: [
    { id: 'postgres', setup: 'postgres', brand: 'PostgreSQL', model: 'Tape library', role: 'Storage', note: 'Reels spin on every write.', color: BRAND.postgres, bay: 7 },
    { id: 'mongodb', setup: 'mongodb', brand: 'MongoDB', model: 'Document stacker', role: 'Storage', note: 'Every write adds a sheet to the stack.', color: BRAND.mongodb, bay: 8 },
  ],
}
export const SETUP_KEY = { integrator: 'agent', transport: 'packageManager', cell: 'framework', storage: 'database' } as const
export const machine = (slot: SlotKey, id: string) => MACHINES[slot].find((m) => m.id === id)!
export function fromSetup(setup: Setup): Rig {
  const pick = (slot: SlotKey) => MACHINES[slot].find((m) => m.setup === setup[SETUP_KEY[slot]])!.id
  return { integrator: pick('integrator') as IntegratorId, transport: pick('transport') as TransportId, cell: pick('cell') as Framework, storage: pick('storage') as Database }
}

export const INTEGRATORS = ['arm', 'drone', 'walker'] as const
export const TRANSPORTS = ['belt', 'silo', 'tube'] as const
export const STORAGES = ['postgres', 'mongodb'] as const
export const CELLS = ['next', 'tanstack'] as const

/* Floor plan. Cabinet and pick table left, transport lane in the middle, cell right, hangar strip at the back. */
export const TABLE_Y = 0.9
export const DRAWER = { w: 2.0, h: 0.5, d: 2.0, gapX: 2.1, gapY: 0.6, x0: -9.4, base: 0.75, front: -1.0 }
export const TABLE = { x0: -10.55, x1: -4.05, z0: -0.1, z1: 4.6 }
export const PAGE = 20
export const TRAY_COLS = 5
export const DOCK = new Vector3(-3.2, TABLE_Y, 1.7)
export const INTAKE = new Vector3(2.3, TABLE_Y, 1.7)
export const SILO = new Vector3(-0.45, 0, -1.6)
export const SILO_TOP = SILO.clone().setY(4.0)
export const SILO_EMIT = SILO.clone().setY(2.6)
export const TUBE = new CatmullRomCurve3([
  DOCK.clone().setY(DOCK.y + 0.35),
  new Vector3(-2.2, 3.3, 2.4),
  new Vector3(-0.45, 4.7, 3.0),
  new Vector3(1.3, 3.5, 2.4),
  INTAKE.clone().setY(INTAKE.y + 1.6),
])
export const BY = 0.45
export const CELL = new Vector3(9.6, 0, -0.3)
export const BOARD = { w: 8.75, d: 6.9, r: 4.3 }
export const CPU: Record<Framework, Vector3> = { next: new Vector3(8.5, BY, -0.3), tanstack: CELL.clone().setY(BY) }
export const CPU_HALF: Record<Framework, { w: number; d: number }> = { next: { w: 1.2, d: 1.0 }, tanstack: { w: 1.15, d: 1.15 } }
export const MEM: Record<Framework, Vector3> = { next: new Vector3(11.35, BY, -0.3), tanstack: new Vector3(CELL.x + 2.75, BY, CELL.z) }
export const MEM_HALF = { w: 0.85, d: 0.5 }
export const PORT = new Vector3(13.7, BY, -2.1)
export const STORE_HOME = new Vector3(15.6, 0, -2.3)
export const ARM = { agv: 0.42, h0: 1.9, l1: 5.6, l2: 5.4 }
export const WALK_H = 1.55
export const HOME: Record<IntegratorId, Vector3> = {
  arm: new Vector3(4.2, 0, -1.7),
  drone: new Vector3(6.4, 3.3, 1.5),
  walker: new Vector3(4.6, 0, 1.1),
}
export const LANE_Z = -5.0
export const HANGAR = { x0: -7.0, x1: 15.3, z0: -9.1, z1: -5.6, pad: -7.4 }
export const PAD: Record<IntegratorId, Vector3> = { arm: new Vector3(-5.3, 0, HANGAR.pad), drone: new Vector3(-2.3, 0, HANGAR.pad), walker: new Vector3(0.7, 0, HANGAR.pad) }
export const KIT_PAD: Record<TransportId, Vector3> = { belt: new Vector3(3.6, 0, HANGAR.pad), silo: new Vector3(6.0, 0, HANGAR.pad), tube: new Vector3(8.4, 0, HANGAR.pad) }
export const STORE_PAD: Record<Database, Vector3> = { postgres: new Vector3(11.0, 0, HANGAR.pad), mongodb: new Vector3(13.7, 0, HANGAR.pad) }
export const padOf = (slot: SlotKey, id: string) =>
  slot === 'integrator' ? PAD[id as IntegratorId] : slot === 'transport' ? KIT_PAD[id as TransportId] : slot === 'storage' ? STORE_PAD[id as Database] : CELL

export type Pose = { x: number; z: number; yaw: number }
export const SLOTS: Record<Framework, Pose[]> = {
  next: (() => {
    const out: Pose[] = []
    for (let i = 0; i < 7; i++)
      for (let j = 0; j < 7; j++) {
        if (i >= 1 && i <= 5 && j >= 2 && j <= 4) continue
        out.push({ x: 5.85 + i * 1.25, z: -3.15 + j * 0.95, yaw: 0 })
      }
    return out.sort((a, b) => Math.hypot(a.x - CELL.x, (a.z - CELL.z) * 1.3) - Math.hypot(b.x - CELL.x, (b.z - CELL.z) * 1.3))
  })(),
  tanstack: ([[1.9, 8, 0.4], [2.8, 11, 0.6], [3.65, 15, 0.8]] as const).flatMap(([r, n, off]) =>
    Array.from({ length: n }, (_, k) => {
      const a = (k / n) * Math.PI * 2 + off
      return { a: Math.atan2(Math.sin(a), Math.cos(a)), r }
    })
      .filter(({ a }) => Math.abs(a) > 0.3)
      .map(({ a, r }) => ({ x: CELL.x + Math.cos(a) * r, z: CELL.z + Math.sin(a) * r, yaw: -a - Math.PI / 2 })),
  ),
}
export function slotAt(cell: Framework, slot: number, out = new Vector3()) {
  const list = SLOTS[cell]
  const s = list[slot % list.length]
  return out.set(s.x, BY + Math.floor(slot / list.length) * 0.14, s.z)
}
export const slotPose = (cell: Framework, slot: number) => SLOTS[cell][slot % SLOTS[cell].length]
export function onBoard(cell: Framework, x: number, z: number) {
  return cell === 'next' ? Math.abs(x - CELL.x) < BOARD.w / 2 && Math.abs(z - CELL.z) < BOARD.d / 2 : Math.hypot(x - CELL.x, z - CELL.z) < BOARD.r
}

/** Hairline trace from a slot to the chip it talks to: a Manhattan run on the square cell, a radial one on the round cell. */
export function tracePath(cell: Framework, slot: number) {
  const s = slotPose(cell, slot)
  const y = BY + 0.012
  if (cell === 'tanstack') {
    const a = Math.atan2(s.z - CELL.z, s.x - CELL.x)
    const r = Math.hypot(s.x - CELL.x, s.z - CELL.z)
    const at = (rr: number, aa: number) => new Vector3(CELL.x + Math.cos(aa) * rr, y, CELL.z + Math.sin(aa) * rr)
    return [at(r, a), at(r - 0.46, a), at((r - 0.46 + 1.25) / 2, a + 0.08), at(1.25, a + 0.14)]
  }
  const chip = s.x > 10.2 ? MEM.next : CPU.next
  const half = s.x > 10.2 ? MEM_HALF : CPU_HALF.next
  if (Math.abs(s.x - chip.x) <= half.w) {
    const zEdge = chip.z + Math.sign(s.z - chip.z) * (half.d + 0.05)
    return [new Vector3(s.x, y, s.z), new Vector3(s.x, y, zEdge)]
  }
  const side = Math.sign(s.x - chip.x)
  const zc = Math.max(-half.d + 0.15, Math.min(half.d - 0.15, s.z - chip.z)) + chip.z
  const xm = s.x - side * 0.55
  return [new Vector3(s.x, y, s.z), new Vector3(xm, y, s.z), new Vector3(xm, y, zc), new Vector3(chip.x + side * (half.w + 0.05), y, zc)]
}

export type Mode = 'home' | 'queued' | 'dock' | 'transit' | 'intake' | 'held' | 'board' | 'toss'
export type Stage = 'belt' | 'wait' | 'tube' | 'silo' | 'beam' | null
type Fly = { from: Vector3; to: Vector3; t: number; dur: number; h: number; s0: number; s1: number; spin: boolean; then: () => void }
export type Part = {
  item: CatalogItem
  cat: number
  code: string
  size: [number, number, number]
  pos: Vector3
  scale: number
  spin: number
  rot: number
  yaw: number
  wob: number
  mode: Mode
  stage: Stage
  fly: Fly | null
  run: number
  slot: number
  onPage: boolean
  pad: number
  visible: boolean
  needsTexture: boolean
  live: boolean
  /** A pnpm hard link: drawn as edges only, beamed from the silo. */
  ghost: boolean
  mark: IntegratorId | null
  finish: number
  seq: number
}
export type Step = { to: Vector3; arrive?: () => boolean | void; work?: number; part?: Part }
export type UnitState = 'parked' | 'launch' | 'active' | 'dock'
export type Unit = {
  id: IntegratorId
  state: UnitState
  path: Vector3[]
  tt: number
  total: number
  pos: Vector3
  vel: Vector3
  base: Vector3
  speed: number
  steps: Step[]
  holding: Part | null
  job: Part | null
  work: { t: number; dur: number; part: Part } | null
  wait: number
  /** At rest on its pad or at its idle pose, with nothing left to move. */
  settled: boolean
}
export type Store = { id: Database; pos: Vector3; from: Vector3; to: Vector3; t: number; side: number; kick: number; writes: number }
/** A hangar swap in progress: the old machine docks while the new one launches. */
export type Swap = { slot: SlotKey; from: string; to: string; t: number }
/**
 * What the sim just did, for sound and announcements. Drained by the frame
 * loop. `job`: an integrator starts carrying or removing a part; `route`: a
 * seated part's trace routes to storage; `swap`: a setup slot changes machine;
 * `drawer`: the active aisle's drawer starts to open.
 */
export type Event =
  | { kind: 'pick' | 'seat' | 'return' | 'probe' | 'job' | 'route'; part: Part }
  | { kind: 'swap'; slot: SlotKey }
  | { kind: 'drawer'; aisle: number }
export type Sim = {
  list: Part[]
  parts: Map<string, Part>
  live: Set<Part>
  liveVersion: number
  feed: Part[]
  queue: Part[]
  intake: Part[]
  removals: Part[]
  slots: (Part | null)[]
  store: string[]
  units: Record<IntegratorId, Unit>
  stores: Record<Database, Store>
  show: Record<TransportId | Framework, number>
  pulses: { path: Vector3[]; t: number }[]
  puffs: number[]
  tubeNext: number
  seq: number
  time: number
  /** The idle-loop clock (bobbing, sway, rotors): it only advances while `idle`. */
  clock: number
  idle: boolean
  lastActivity: number
  /** 1 at full motion, 0.5 under reduced motion: tween durations scale by it. */
  motion: number
  rig: Rig
  setup: Setup | null
  swap: Swap | null
  /** The selection as of the current step; job steps read it so a part cleared mid-flight never seats. */
  wanted: ReadonlySet<string>
  events: Event[]
  latest: Part | null
  addSeq: number
  seat: { part: Part; t: number } | null
  beltPhase: number
  /** The rail's aisle, whose drawer slides open, and each drawer's travel. */
  active: number
  drawers: number[]
}

const GRIP: Record<IntegratorId, number> = { arm: 0.62, drone: 1.2, walker: 0.34 }
const LIFT: Record<IntegratorId, number> = { arm: 1.5, drone: 1.9, walker: 0.6 }
const WORK: Record<IntegratorId, number> = { arm: 0.55, drone: 1.15, walker: 0.95 }
const WORK_UP: Record<IntegratorId, number> = { arm: 0.3, drone: 0.5, walker: 0 }
const TOSS: Record<IntegratorId, Vector3> = { arm: new Vector3(3.0, 4.6, -0.6), drone: new Vector3(3.4, 4.6, 0.8), walker: new Vector3(3.2, 1.9, 0.6) }
const TRAVEL: Record<IntegratorId, number> = { arm: 5.5, drone: 0, walker: 4.8 }
const FOLD = new Vector3(0.8, 4.4, 0.2)
const BELT_SPEED = 2.6
const BELT_GAP = 1.15
const DRAWER_OPEN = 0.75
/** Seconds after the last activity that idle loops (bobbing, rotors, reels, the belt) keep running. */
export const IDLE_AFTER = 4
/** The arm's stowed pose when parked or travelling: boom laid flat along -x, forearm folded back over it. */
const STOW = new Vector3(-0.2, ARM.agv + ARM.h0 - 0.22, 0)
const STOWED = new Vector3()

/** Marks activity, so idle loops run again and the frame loop wakes. */
export const wake = (sim: Sim) => {
  sim.lastActivity = sim.time
}

const up = (v: Vector3, y: number) => v.clone().setY(v.y + y)
const smooth = (t: number) => t * t * (3 - 2 * t)
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
const tmp = new Vector3()
const target = new Vector3()
const drop = <T,>(list: T[], v: T) => {
  const i = list.indexOf(v)
  if (i >= 0) list.splice(i, 1)
}

export function drawerPos(cat: number, out = new Vector3()) {
  const col = cat % 3, row = Math.floor(cat / 3)
  return out.set(DRAWER.x0 + col * DRAWER.gapX, DRAWER.base + (5 - row) * DRAWER.gapY + DRAWER.h / 2, DRAWER.front)
}
export function padPos(index: number, out = new Vector3()) {
  return out.set(-9.7 + (index % TRAY_COLS) * 1.2, TABLE_Y, 0.55 + Math.floor(index / TRAY_COLS) * 0.95)
}
function homeOf(p: Part, out: Vector3) {
  if (p.onPage) return padPos(p.pad, out).setY(TABLE_Y + p.size[1] / 2)
  return drawerPos(p.cat, out).setZ(DRAWER.front + 0.1)
}

function makeUnit(id: IntegratorId, active: boolean): Unit {
  const base = (active ? HOME[id] : PAD[id]).clone()
  const pos = id === 'arm' ? base.clone().add(active ? FOLD : STOW) : id === 'drone' ? (active ? base.clone() : base.clone().setY(0.5)) : base.clone().setY(active ? WALK_H : 1.0)
  if (id === 'drone') base.setY(0)
  return { id, state: active ? 'active' : 'parked', path: [], tt: 0, total: 0, pos, vel: new Vector3(), base, speed: 0, steps: [], holding: null, job: null, work: null, wait: 0, settled: false }
}
function makeStore(id: Database, active: boolean): Store {
  const at = (active ? STORE_HOME : STORE_PAD[id]).clone()
  return { id, pos: at.clone(), from: at.clone(), to: at.clone(), t: 1, side: 1, kick: 0, writes: 0 }
}

export function createSim(lab: Lab): Sim {
  const rig = fromSetup(lab.setup)
  const aisleIndex = new Map(lab.warehouse.aisles.map((a, i) => [a.id, i]))
  const list: Part[] = lab.catalog.items.map((item) => ({
    item, cat: aisleIndex.get(item.category) ?? 0, code: lab.warehouse.bins.get(item.ref)?.code ?? '',
    size: item.kind === 'block' ? [0.96, 0.1, 0.72] : [0.56, 0.42, 0.56],
    pos: drawerPos(aisleIndex.get(item.category) ?? 0), scale: 0.2, spin: 0, rot: 0, yaw: 0, wob: 0, mode: 'home', stage: null, fly: null, run: 0, slot: -1,
    onPage: false, pad: 0, visible: false, needsTexture: false, live: false, ghost: false, mark: null, finish: 0, seq: 0,
  }))
  const sim: Sim = {
    list, parts: new Map(list.map((p) => [p.item.ref, p])), live: new Set(), liveVersion: 0,
    feed: [], queue: [], intake: [], removals: [], slots: [], store: [],
    units: { arm: makeUnit('arm', rig.integrator === 'arm'), drone: makeUnit('drone', rig.integrator === 'drone'), walker: makeUnit('walker', rig.integrator === 'walker') },
    stores: { postgres: makeStore('postgres', rig.storage === 'postgres'), mongodb: makeStore('mongodb', rig.storage === 'mongodb') },
    show: { belt: +(rig.transport === 'belt'), silo: +(rig.transport === 'silo'), tube: +(rig.transport === 'tube'), next: +(rig.cell === 'next'), tanstack: +(rig.cell === 'tanstack') },
    pulses: [], puffs: [], tubeNext: 0, seq: 0, time: 0, clock: 0, idle: false, lastActivity: 0, motion: 1, rig, setup: lab.setup, swap: null,
    wanted: lab.selected, events: [], latest: null, addSeq: 0, seat: null, beltPhase: 0, active: -1, drawers: lab.warehouse.aisles.map(() => 0),
  }
  for (const ref of lab.setup.items) {
    const p = sim.parts.get(ref)
    if (!p) continue
    p.slot = freeSlot(sim)
    sim.slots[p.slot] = p
    p.mode = 'board'
    p.mark = rig.integrator
    p.finish = 1
    p.scale = 1
    p.visible = true
    p.ghost = rig.transport === 'silo'
    if (p.ghost) sim.store.push(ref)
    slotAt(rig.cell, p.slot, p.pos).y += p.size[1] / 2
    p.rot = slotPose(rig.cell, p.slot).yaw
    p.yaw = rig.integrator === 'arm' ? (((p.slot * 37) % 11) / 11 - 0.5) * 0.24 : 0
  }
  sim.stores[rig.storage].writes = lab.setup.items.length
  return sim
}

export function applyPage(sim: Sim, parts: readonly Part[]) {
  for (const p of sim.list) if (p.onPage) p.onPage = false
  parts.forEach((p, i) => {
    p.onPage = true
    p.pad = i
  })
}

/** True while the part is somewhere between its home and the integrator's grip. */
export function inJourney(p: Part | null) {
  return !!p && (p.mode === 'queued' || p.mode === 'dock' || p.mode === 'transit' || p.mode === 'intake')
}
export const activeUnit = (sim: Sim) => sim.units[sim.rig.integrator]

function freeSlot(sim: Sim) {
  const at = sim.slots.findIndex((s) => !s)
  if (at >= 0) return at
  sim.slots.push(null)
  return sim.slots.length - 1
}
function release(sim: Sim, p: Part) {
  if (p.slot >= 0 && sim.slots[p.slot] === p) sim.slots[p.slot] = null
  p.slot = -1
}
function fly(p: Part, to: Vector3, dur: number, h: number, s1: number, spin: boolean, then: () => void) {
  p.fly = { from: p.pos.clone(), to: to.clone(), t: 0, dur, h, s0: p.scale, s1, spin, then }
}

function enterTransit(sim: Sim, p: Part) {
  p.mode = 'transit'
  const via = sim.rig.transport
  if (via === 'silo') {
    if (sim.store.includes(p.item.ref)) return beam(sim, p)
    p.stage = 'silo'
    fly(p, SILO_TOP, 0.7, 1.4, 0.5, false, () => {
      if (!sim.store.includes(p.item.ref)) sim.store.push(p.item.ref)
      beam(sim, p)
    })
    return
  }
  p.stage = via === 'belt' ? 'belt' : 'wait'
  p.run = DOCK.x
  sim.queue.push(p)
}
function beam(sim: Sim, p: Part) {
  p.stage = 'beam'
  p.run = 0
  p.ghost = true
  p.scale = 0
  p.fly = null
  intakeTop(sim, p, p.pos)
}
function toIntake(sim: Sim, p: Part) {
  p.mode = 'intake'
  p.stage = null
  p.scale = 1
  drop(sim.queue, p)
  sim.intake.push(p)
}
function shortcut(sim: Sim, p: Part) {
  drop(sim.queue, p)
  p.stage = null
  fly(p, intakeTop(sim, p), 0.6, 1.4, 1, false, () => toIntake(sim, p))
}
function intakeTop(sim: Sim, p: Part, out = new Vector3()) {
  let y = INTAKE.y
  for (const q of sim.intake) y += q.size[1] + 0.02
  return out.set(INTAKE.x, y + p.size[1] / 2, INTAKE.z)
}

function sendHome(sim: Sim, p: Part) {
  drop(sim.feed, p)
  drop(sim.queue, p)
  drop(sim.intake, p)
  drop(sim.removals, p)
  release(sim, p)
  sim.events.push({ kind: 'return', part: p })
  p.mode = 'toss'
  p.stage = null
  p.mark = null
  p.finish = 0
  p.wob = 0
  const settle = () => {
    p.mode = 'home'
    p.spin = 0
    p.rot = 0
    p.yaw = 0
    if (p.ghost) {
      p.ghost = false
      homeOf(p, p.pos)
      p.scale = p.onPage ? 1 : 0.2
    }
  }
  if (p.ghost) fly(p, SILO_EMIT, 0.5, 0.4, 0, false, settle)
  else fly(p, homeOf(p, tmp), 0.95 + p.pos.distanceTo(tmp) * 0.02, 3.2, p.onPage ? 1 : 0.2, true, settle)
}

function travelPath(u: Unit, dest: Vector3) {
  const from = u.id === 'drone' ? u.pos.clone() : u.base.clone().setY(0)
  if (u.id === 'drone') return [from, dest.clone()]
  return [from, new Vector3(from.x, 0, LANE_Z), new Vector3(dest.x, 0, LANE_Z), dest.clone().setY(0)]
}
function setTravel(u: Unit, state: 'launch' | 'dock') {
  u.state = state
  u.path = travelPath(u, state === 'launch' ? HOME[u.id] : u.id === 'drone' ? PAD.drone.clone().setY(0.5) : PAD[u.id])
  u.total = u.path.slice(1).reduce((sum, p, i) => sum + p.distanceTo(u.path[i]), 0)
  u.tt = 0
}
function along(path: Vector3[], d: number, out: Vector3) {
  for (let i = 1; i < path.length; i++) {
    const seg = path[i].distanceTo(path[i - 1])
    if (d <= seg || i === path.length - 1) return out.lerpVectors(path[i - 1], path[i], seg ? Math.min(1, d / seg) : 1)
    d -= seg
  }
  return out.copy(path[path.length - 1])
}

function dismiss(sim: Sim, u: Unit) {
  const p = u.holding
  if (u.job?.mode === 'board') u.job.finish = 1
  if (p) {
    if (sim.wanted.has(p.item.ref)) {
      release(sim, p)
      p.mode = 'intake'
      sim.intake.push(p)
    } else sendHome(sim, p)
  }
  if (u.work) u.work.part.finish = 1
  u.holding = null
  u.job = null
  u.work = null
  u.steps = []
}

function seatJob(sim: Sim, u: Unit, p: Part) {
  const g = GRIP[u.id] + p.size[1] / 2
  const pick = p.pos.clone().setY(p.pos.y + g)
  u.job = p
  sim.events.push({ kind: 'job', part: p })
  u.steps = [
    { to: up(pick, LIFT[u.id]) },
    {
      to: pick,
      arrive: () => {
        if (p.mode !== 'intake' || !sim.wanted.has(p.item.ref)) return false
        drop(sim.intake, p)
        p.mode = 'held'
        u.holding = p
        p.slot = freeSlot(sim)
        sim.slots[p.slot] = p
        const at = slotAt(sim.rig.cell, p.slot).setY(BY + Math.floor(p.slot / SLOTS[sim.rig.cell].length) * 0.14 + p.size[1] / 2 + g)
        u.steps.push(
          { to: up(pick, LIFT[u.id] + 0.3) },
          { to: up(at, LIFT[u.id]) },
          {
            to: at,
            arrive: () => {
              u.holding = null
              if (!sim.wanted.has(p.item.ref)) {
                sendHome(sim, p)
                return false
              }
              p.mode = 'board'
              p.mark = u.id
              p.finish = 0
              p.yaw = u.id === 'arm' ? (Math.random() - 0.5) * 0.26 : 0
              p.wob = u.id === 'arm' && sim.motion === 1 ? 1 : 0
              sim.seat = { part: p, t: sim.time }
              sim.events.push({ kind: 'seat', part: p })
            },
          },
          { to: up(at, WORK_UP[u.id]), work: WORK[u.id], part: p },
          { to: up(at, LIFT[u.id] * 0.7) },
        )
      },
    },
  ]
}

function removeJob(sim: Sim, u: Unit, p: Part) {
  const g = GRIP[u.id] + p.size[1] / 2
  const at = p.pos.clone().setY(p.pos.y + g)
  u.job = p
  sim.events.push({ kind: 'job', part: p })
  u.steps = [
    { to: up(at, LIFT[u.id]) },
    {
      to: at,
      arrive: () => {
        if (sim.wanted.has(p.item.ref) || p.mode !== 'board') return false
        release(sim, p)
        p.mode = 'held'
        u.holding = p
      },
    },
    { to: up(at, LIFT[u.id]) },
    {
      to: TOSS[u.id],
      arrive: () => {
        u.holding = null
        sendHome(sim, p)
      },
    },
  ]
}

function idleTarget(u: Unit, t: number, out: Vector3) {
  if (u.id === 'arm') return out.copy(u.base).add(tmp.set(2.4 + Math.sin(t * 0.37) * 0.3, 3.6 + Math.sin(t * 0.71) * 0.3, 2.4 + Math.sin(t * 0.29) * 0.4))
  if (u.id === 'drone') return out.copy(HOME.drone).add(tmp.set(Math.sin(t * 0.5) * 1.6, Math.sin(t * 1.6) * 0.16, Math.sin(t * 1.0) * 0.9))
  return out.copy(HOME.walker).add(tmp.set(Math.sin(t * 0.45) * 0.18, WALK_H + Math.sin(t * 1.3) * 0.03, Math.cos(t * 0.3) * 0.12))
}
function parkTarget(u: Unit, t: number, out: Vector3) {
  if (u.id === 'arm') return out.copy(u.base).add(STOW).setY(u.base.y + STOW.y + Math.sin(t * 0.8) * 0.03)
  return out.set(u.pos.x, (u.id === 'walker' ? 1.0 : 0.5) + Math.sin(t * (u.id === 'walker' ? 0.9 : 1.1)) * 0.02, u.pos.z)
}

const ARM_STEP = 1 / 60
/** Moves a unit toward `to` in its own manner; true once it has arrived. */
function move(u: Unit, to: Vector3, dt: number, rush: number) {
  tmp.copy(to).sub(u.pos)
  const d = tmp.length()
  if (u.id === 'arm') {
    const k = 26 * rush, c = 5.6 * Math.sqrt(rush), max = 8 * rush
    for (let left = dt; left > 1e-6; left -= ARM_STEP) {
      const h = Math.min(ARM_STEP, left)
      tmp.copy(to).sub(u.pos)
      u.vel.addScaledVector(tmp, k * h).addScaledVector(u.vel, -c * h)
      if (u.vel.length() > max) u.vel.setLength(max)
      u.pos.addScaledVector(u.vel, h)
    }
    return d < 0.09 && u.vel.length() < 0.7
  }
  if (u.id === 'drone') {
    const step = Math.min(d * (1 - Math.exp(-dt * 4.2 * rush)), 11 * rush * dt)
    if (d > 1e-6) u.pos.addScaledVector(tmp, step / d)
    return d < 0.07
  }
  const vmax = 4.4 * rush, acc = 22
  u.speed = Math.min(vmax, Math.sqrt(2 * acc * d), u.speed + acc * dt)
  if (d > 1e-6) u.pos.addScaledVector(tmp, Math.min(d, u.speed * dt) / d)
  if (d < 0.004) {
    u.speed = 0
    u.wait += dt
    return u.wait > 0.09
  }
  return false
}
/** Whether a unit sitting at `to` would draw the same frame again. */
const still = (u: Unit, to: Vector3) => u.pos.distanceToSquared(to) < 2e-5 && u.vel.lengthSq() < 1e-4 && u.speed === 0

function stepUnit(sim: Sim, u: Unit, dt: number, rush: number, instant: boolean) {
  const want = sim.rig.integrator === u.id
  if (want && (u.state === 'parked' || u.state === 'dock')) setTravel(u, 'launch')
  if (!want && (u.state === 'active' || u.state === 'launch')) {
    dismiss(sim, u)
    setTravel(u, 'dock')
  }
  u.settled = false
  if (u.state === 'launch' || u.state === 'dock') {
    if (instant) u.tt = u.total
    else if (u.id === 'drone') {
      u.tt = Math.min(u.total, u.tt + (u.total / 2.6) * dt)
      const k = smooth(u.tt / Math.max(u.total, 1e-6))
      u.pos.lerpVectors(u.path[0], u.path[1], k)
      u.pos.y += Math.sin(k * Math.PI) * 4.2
    } else {
      u.tt = Math.min(u.total, u.tt + TRAVEL[u.id] * dt)
      along(u.path, u.tt, u.base)
      if (u.id === 'arm') move(u, STOWED.copy(u.base).add(STOW), dt, 1)
      else {
        target.set(u.base.x, u.state === 'dock' && u.tt > u.total - 0.5 ? 1.0 : WALK_H, u.base.z)
        u.pos.lerp(target, 1 - Math.exp(-dt * 8))
      }
    }
    if (u.tt >= u.total) {
      u.state = u.state === 'launch' ? 'active' : 'parked'
      u.vel.set(0, 0, 0)
      if (instant) {
        along(u.path, u.total, u.base)
        if (u.id === 'drone') u.pos.copy(u.path[1])
        else if (u.id === 'arm') u.pos.copy(u.base).add(u.state === 'active' ? FOLD : STOW)
        else u.pos.set(u.base.x, u.state === 'active' ? WALK_H : 1.0, u.base.z)
      }
    }
    return
  }
  if (u.state === 'parked') {
    parkTarget(u, sim.clock, target)
    if (u.id === 'arm') move(u, target, dt, 0.6)
    else u.pos.y += (target.y - u.pos.y) * (1 - Math.exp(-dt * 4))
    if (Math.abs(target.y - u.pos.y) < 1e-4 && u.id !== 'arm') u.pos.y = target.y
    u.settled = still(u, target)
    return
  }
  if (!u.steps.length && !u.work) {
    const r = sim.removals.find((p) => p.mode === 'board')
    if (r) {
      drop(sim.removals, r)
      removeJob(sim, u, r)
    } else if (sim.intake.length) {
      const p = sim.intake[sim.intake.length - 1]
      if (!p.fly && p.stage !== 'beam') seatJob(sim, u, p)
    }
  }
  const goal = u.steps[0]?.to ?? idleTarget(u, sim.clock, target)
  if (u.work) {
    const w = u.work
    w.t += dt
    w.part.finish = Math.min(1, w.t / w.dur)
    move(u, goal, dt, rush)
    if (w.t >= w.dur) {
      w.part.finish = 1
      u.work = null
      u.steps.shift()
      if (w.part.mode === 'board') pulse(sim, w.part)
    }
  } else if (move(u, goal, dt, rush) && u.steps.length) {
    u.wait = 0
    const s = u.steps[0]
    if (s.arrive?.() === false) u.steps = []
    else if (s.work && s.part) {
      u.work = { t: 0, dur: s.work * sim.motion, part: s.part }
      if (u.id !== 'arm' && s.part.mode === 'board') sim.events.push({ kind: 'probe', part: s.part })
    } else u.steps.shift()
  }
  if (!u.steps.length && !u.work) u.job = null
  if (u.holding) u.holding.pos.copy(u.pos).setY(u.pos.y - GRIP[u.id] - u.holding.size[1] / 2)
  u.settled = !u.steps.length && !u.work && !u.holding && still(u, goal)
}

function pulse(sim: Sim, p: Part) {
  const cell = sim.rig.cell
  const store = sim.stores[sim.rig.storage]
  const trace = tracePath(cell, p.slot)
  const via = trace[trace.length - 1].x > 10.2 && cell === 'next' ? [] : [MEM[cell].clone().setY(BY + 0.02)]
  sim.pulses.push({ path: [...trace, ...via, PORT.clone(), store.pos.clone().setY(1.6)], t: 0 })
  sim.events.push({ kind: 'route', part: p })
}

const SLOT_KEYS = ['integrator', 'transport', 'cell', 'storage'] as const
const SHOW_KEYS = ['belt', 'silo', 'tube', 'next', 'tanstack'] as const
const showTarget = (sim: Sim, key: (typeof SHOW_KEYS)[number]) => (key === sim.rig.transport || key === sim.rig.cell ? 1 : 0)
/** Idle loops run at full motion only, and only for a while after the last activity. */
const idleLoops = (sim: Sim) => sim.motion === 1 && sim.time - sim.lastActivity < IDLE_AFTER

export function step(sim: Sim, lab: Lab, dt: number, motion: number) {
  sim.time += dt
  sim.motion = motion
  const instant = motion < 1
  sim.wanted = lab.selected
  if (lab.setup !== sim.setup) {
    sim.setup = lab.setup
    const next = fromSetup(lab.setup)
    for (const slot of SLOT_KEYS)
      if (next[slot] !== sim.rig[slot]) {
        sim.swap = { slot, from: sim.rig[slot], to: next[slot], t: 0 }
        sim.events.push({ kind: 'swap', slot })
        wake(sim)
      }
    sim.rig = next
  }
  const rig = sim.rig
  if (sim.swap) {
    sim.swap.t += dt
    if (sim.swap.t > 3.4 * motion) sim.swap = null
  }
  const wanted = sim.wanted

  for (const p of sim.list) {
    const want = wanted.has(p.item.ref)
    if (want && p.mode === 'home' && !p.fly) {
      p.mode = 'queued'
      p.seq = ++sim.seq
      sim.feed.push(p)
      sim.latest = p
      sim.addSeq++
      sim.events.push({ kind: 'pick', part: p })
    } else if (!want && p.mode === 'queued') {
      p.mode = 'home'
      drop(sim.feed, p)
    } else if (!want && (p.mode === 'dock' || p.mode === 'transit' || p.mode === 'intake')) sendHome(sim, p)
    else if (!want && p.mode === 'board' && !INTEGRATORS.some((id) => sim.units[id].job === p) && !sim.removals.includes(p)) {
      if (p.ghost) sendHome(sim, p)
      else sim.removals.push(p)
    } else if (want && p.mode === 'board' && sim.removals.includes(p)) drop(sim.removals, p)
  }

  let docking = false
  for (const p of sim.live) if (p.mode === 'dock') docking = true
  let lastBelt: Part | null = null
  let waiting = 0
  for (const p of sim.queue) {
    if (p.stage === 'belt') lastBelt = p
    else if (p.stage === 'wait') waiting++
  }
  const dockFree = rig.transport === 'belt' ? !lastBelt || lastBelt.run > DOCK.x + BELT_GAP : rig.transport === 'tube' ? waiting < 4 : true
  if (sim.feed.length && !docking && dockFree) {
    const p = sim.feed.shift()!
    p.mode = 'dock'
    p.visible = true
    const stored = rig.transport === 'silo' && sim.store.includes(p.item.ref)
    if (stored) {
      p.mode = 'transit'
      beam(sim, p)
      p.pos.copy(homeOf(p, tmp))
      p.scale = 0
    } else fly(p, up(DOCK, p.size[1] / 2), 0.55 + p.pos.distanceTo(DOCK) * 0.03, 1.8, 1, false, () => enterTransit(sim, p))
  }

  const beltSpeed = BELT_SPEED / motion
  let limit = INTAKE.x
  let stacked = 0
  for (let i = 0; i < sim.queue.length; ) {
    const p = sim.queue[i]
    if (p.stage === 'belt') {
      if (rig.transport !== 'belt') shortcut(sim, p)
      else {
        p.run = Math.max(p.run, Math.min(p.run + beltSpeed * dt, limit))
        limit = p.run - BELT_GAP
        p.pos.set(p.run, DOCK.y + p.size[1] / 2, DOCK.z)
        if (p.run >= INTAKE.x - 1e-3) toIntake(sim, p)
      }
    } else if (p.stage === 'wait') {
      if (rig.transport !== 'tube') shortcut(sim, p)
      else if (sim.time >= sim.tubeNext && stacked === 0) {
        p.stage = 'tube'
        p.run = 0
        sim.tubeNext = sim.time + 0.24 * motion
      } else p.pos.set(DOCK.x, DOCK.y + 0.06 + stacked++ * 0.16 + p.size[1] / 2, DOCK.z)
    } else if (p.stage === 'tube') {
      p.run += dt / (0.32 * motion)
      TUBE.getPointAt(Math.min(1, p.run * p.run), p.pos)
      if (p.run >= 1) {
        sim.puffs.push(0)
        toIntake(sim, p)
        intakeTop(sim, p, p.pos).y += 0.5
      }
    }
    if (sim.queue[i] === p) i++
  }
  for (const p of sim.live) {
    if (p.stage !== 'beam') continue
    p.run += dt / (0.5 * motion)
    p.scale = smooth(Math.min(1, p.run))
    intakeTop(sim, p, p.pos)
    if (p.run >= 1) toIntake(sim, p)
  }
  let y = INTAKE.y
  for (const p of sim.intake) {
    if (!p.fly) p.pos.lerp(target.set(INTAKE.x, y + p.size[1] / 2, INTAKE.z), 1 - Math.exp(-dt * 12))
    y += p.size[1] + 0.02
  }

  let jobs = sim.feed.length + sim.queue.length + sim.intake.length + sim.removals.length
  for (const id of INTEGRATORS) jobs += sim.units[id].steps.length + (sim.units[id].work ? 1 : 0)
  if (jobs) wake(sim)
  sim.idle = idleLoops(sim)
  if (sim.idle) sim.clock += dt
  if (rig.transport === 'belt' && (sim.idle || lastBelt)) sim.beltPhase += beltSpeed * dt

  const rush = (1 + Math.min(1.6, (sim.queue.length + sim.intake.length + sim.removals.length + sim.feed.length) * 0.2)) / motion
  for (const id of INTEGRATORS) stepUnit(sim, sim.units[id], dt, rush, instant)

  for (const p of sim.list) {
    if (p.fly) {
      const f = p.fly
      f.t += dt / (f.dur * motion)
      const t = clamp(f.t, 0, 1)
      p.visible = true
      p.pos.lerpVectors(f.from, f.to, t)
      p.pos.y += f.h * 4 * t * (1 - t)
      p.scale = f.s0 + (f.s1 - f.s0) * t
      p.spin = f.spin ? t * Math.PI * 3 : 0
      if (f.t >= 1) {
        p.fly = null
        p.spin = 0
        f.then()
      }
    } else if (p.mode === 'home' || p.mode === 'queued') {
      homeOf(p, tmp)
      if (p.pos.distanceTo(tmp) > 0.4) {
        const into = !p.onPage
        const delay = into ? 0 : 0.08 + p.pad * 0.035
        fly(p, tmp, 0.5 + delay, into ? 0.6 : 1.3, into ? 0.2 : 1, false, () => {})
        if (!into) p.scale = Math.max(p.scale, 0.2)
      } else {
        p.pos.lerp(tmp, 1 - Math.exp(-dt * 12))
        if (p.pos.distanceToSquared(tmp) < 1e-6) p.pos.copy(tmp)
        if (p.mode === 'queued' && motion === 1) p.pos.y += Math.abs(Math.sin(sim.time * 9 + p.pad)) * 0.18
        p.visible = p.onPage || p.mode === 'queued'
        p.scale = p.visible ? 1 : 0.2
      }
    } else if (p.mode === 'board') {
      slotAt(rig.cell, p.slot, target).y += p.size[1] / 2
      p.pos.lerp(target, 1 - Math.exp(-dt * 10))
      if (p.pos.distanceToSquared(target) < 1e-6) p.pos.copy(target)
      const rot = slotPose(rig.cell, p.slot).yaw + p.yaw
      p.rot += (rot - p.rot) * (1 - Math.exp(-dt * 8))
      if (Math.abs(rot - p.rot) < 1e-3) p.rot = rot
      p.wob *= Math.exp(-dt * 2.6)
      if (p.wob < 0.01) p.wob = 0
      if (p.ghost && rig.transport !== 'silo') p.ghost = false
      p.visible = true
      p.scale = 1
    }
    if (p.mode !== 'board' && !p.fly) {
      p.rot *= Math.exp(-dt * 8)
      if (Math.abs(p.rot) < 1e-3) p.rot = 0
    }
    if (p.visible) p.needsTexture = true
    const live = p.onPage || p.mode !== 'home' || !!p.fly
    if (live !== p.live) {
      p.live = live
      if (live) sim.live.add(p)
      else sim.live.delete(p)
      sim.liveVersion++
    }
  }

  for (const id of STORAGES) {
    const s = sim.stores[id]
    const dest = rig.storage === id ? STORE_HOME : STORE_PAD[id]
    if (!s.to.equals(dest)) {
      s.from.copy(s.pos).setY(0)
      s.to.copy(dest)
      s.t = 0
      s.side = rig.storage === id ? 1 : -1
    }
    s.t = instant ? 1 : Math.min(1, s.t + dt / 1.9)
    const k = smooth(s.t)
    s.pos.lerpVectors(s.from, s.to, k)
    s.pos.x += Math.sin(k * Math.PI) * 1.4 * s.side
    s.pos.y = Math.sin(k * Math.PI) * 0.4
    s.kick *= Math.exp(-dt * 1.6 / motion)
    if (s.kick < 0.01) s.kick = 0
  }
  for (const key of SHOW_KEYS) {
    const on = showTarget(sim, key)
    sim.show[key] = instant ? on : sim.show[key] + (on - sim.show[key]) * (1 - Math.exp(-dt * 3.2))
    if (Math.abs(on - sim.show[key]) < 0.002) sim.show[key] = on
  }
  for (let k = 0; k < sim.drawers.length; k++) {
    const want = k === sim.active ? DRAWER_OPEN : 0
    if (want && !sim.drawers[k]) sim.events.push({ kind: 'drawer', aisle: k })
    sim.drawers[k] += (want - sim.drawers[k]) * (1 - Math.exp((-dt * 10) / motion))
    if (Math.abs(want - sim.drawers[k]) < 0.002) sim.drawers[k] = want
  }
  let landed = false
  for (const pl of sim.pulses) {
    pl.t += dt / (1.2 * motion)
    if (pl.t >= 1) {
      landed = true
      const s = sim.stores[rig.storage]
      s.kick = 1
      s.writes++
    }
  }
  if (landed) sim.pulses = sim.pulses.filter((pl) => pl.t < 1)
  for (let i = sim.puffs.length - 1; i >= 0; i--) {
    sim.puffs[i] += dt / 0.6
    if (sim.puffs[i] >= 1) sim.puffs.splice(i, 1)
  }
}

/**
 * True while any frame would differ from the last: parts travelling or
 * settling, a machine moving or working, a swap, pulses, drawers, or an idle
 * loop still inside its window after the last activity.
 */
export function isBusy(sim: Sim): boolean {
  if (sim.feed.length || sim.queue.length || sim.intake.length || sim.removals.length || sim.pulses.length || sim.puffs.length || sim.swap || sim.idle) return true
  for (const id of INTEGRATORS) if (!sim.units[id].settled) return true
  for (const id of STORAGES) if (sim.stores[id].t < 1 || sim.stores[id].kick > 0) return true
  for (const key of SHOW_KEYS) if (sim.show[key] !== showTarget(sim, key)) return true
  for (let k = 0; k < sim.drawers.length; k++) if (sim.drawers[k] !== (k === sim.active ? DRAWER_OPEN : 0)) return true
  for (const p of sim.live) {
    if (p.fly || p.stage || (p.mode !== 'home' && p.mode !== 'board') || p.wob > 0) return true
    if (p.rot !== (p.mode === 'board' ? slotPose(sim.rig.cell, p.slot).yaw + p.yaw : 0)) return true
    if (p.mode === 'board') {
      slotAt(sim.rig.cell, p.slot, target).y += p.size[1] / 2
      if (!p.pos.equals(target)) return true
    } else if (!p.pos.equals(homeOf(p, target))) return true
  }
  return false
}

/** Which subject the camera should ride: the newest part while it travels, then the integrator that carries and finishes it. */
export function subject(sim: Sim): { kind: 'part'; part: Part } | { kind: 'unit'; unit: Unit; part: Part } | { kind: 'seat'; part: Part } | null {
  const u = activeUnit(sim)
  if (u.state === 'active' && (u.holding || u.work)) {
    const part = u.holding ?? u.work!.part
    if (sim.wanted.has(part.item.ref)) return { kind: 'unit', unit: u, part }
  }
  const p = sim.latest
  if (p && inJourney(p) && sim.wanted.has(p.item.ref)) return { kind: 'part', part: p }
  if (sim.seat && sim.seat.part.mode === 'board' && sim.time - sim.seat.t < 1.6 && sim.seat.part.finish >= 1) return { kind: 'seat', part: sim.seat.part }
  return null
}
export function seatedCount(sim: Sim) {
  let n = 0
  for (const p of sim.live) if (p.mode === 'board') n++
  return n
}
export function inFlight(sim: Sim) {
  let n = sim.feed.length + sim.queue.length + sim.intake.length
  for (const p of sim.live) if (p.mode === 'dock') n++
  return n
}
