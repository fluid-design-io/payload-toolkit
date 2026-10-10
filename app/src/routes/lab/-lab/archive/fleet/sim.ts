import { CatmullRomCurve3, Vector3 } from 'three'

import type { CatalogItem, Database, Framework, Setup } from '../../../../workspace/-workspace/workspace.types'
import type { Bin } from '../../warehouse'
import type { Lab } from '../../lab.types'

export type IntegratorId = 'arm' | 'drone' | 'walker'
export type TransportId = 'belt' | 'depot' | 'tube'
export type Rig = { integrator: IntegratorId; transport: TransportId; cell: Framework; storage: Database }
export type SlotKey = keyof Rig
export type Machine = { id: string; tag: string; setup: string; brand: string; model: string; note: string }

export const MACHINES: Record<SlotKey, readonly Machine[]> = {
  integrator: [
    { id: 'arm', tag: 'arm', setup: 'none', brand: 'No agent', model: 'Articulated arm', note: 'Manual. Slower, overshoots, seats parts a little crooked.' },
    { id: 'drone', tag: 'drone', setup: 'claude', brand: 'Claude Code', model: 'Quad drone', note: 'Hums, welds with orange sparks, leaves tidy solder beads.' },
    { id: 'walker', tag: 'walker', setup: 'codex', brand: 'Codex', model: 'Hexapod walker', note: 'Tripod gait, stops dead on target, laser-etches each part.' },
  ],
  transport: [
    { id: 'belt', tag: 'belt', setup: 'npm', brand: 'npm', model: 'Belt conveyor', note: 'Every part rides the long belt as its own copy.' },
    { id: 'depot', tag: 'depot', setup: 'pnpm', brand: 'pnpm', model: 'Content-addressable depot', note: 'Stored once in the silo. Slots get hard-link beams, not copies.' },
    { id: 'tube', tag: 'tube', setup: 'bun', brand: 'Bun', model: 'Pneumatic tube', note: 'Fires parts across the floor at absurd speed.' },
  ],
  cell: [
    { id: 'next', tag: 'square', setup: 'next', brand: 'Next.js', model: 'Square PCB cell', note: 'Grid slots, Manhattan traces, one black chip.' },
    { id: 'tanstack', tag: 'round', setup: 'tanstack', brand: 'TanStack Start', model: 'Round island cell', note: 'Ring slots, radial traces, parts face the core.' },
  ],
  storage: [
    { id: 'postgres', tag: 'tape rack', setup: 'postgres', brand: 'PostgreSQL', model: 'Tape library rack', note: 'Elephant-grey cabinet. Reels spin on every write.' },
    { id: 'mongodb', tag: 'stacker', setup: 'mongodb', brand: 'MongoDB', model: 'Document stacker', note: 'Leafy green. Every write adds a sheet to the stack.' },
  ],
}
export const SETUP_KEY = { integrator: 'agent', transport: 'packageManager', cell: 'framework', storage: 'database' } as const

export const machine = (slot: SlotKey, id: string) => MACHINES[slot].find((m) => m.id === id)!
export function fromSetup(setup: Setup): Rig {
  const pick = (slot: SlotKey) => MACHINES[slot].find((m) => m.setup === setup[SETUP_KEY[slot]])!.id
  return {
    integrator: pick('integrator') as IntegratorId,
    transport: pick('transport') as TransportId,
    cell: pick('cell') as Framework,
    storage: pick('storage') as Database,
  }
}

export const INTEGRATORS = ['arm', 'drone', 'walker'] as const
export const BY = 0.18
export const CELL = new Vector3(6, 0, 0)
export const DOCK = new Vector3(-8.0, 0.9, 2.2)
export const INTAKE = new Vector3(-0.5, 0.9, 2.2)
export const SILO = new Vector3(-4.3, 0, -1.9)
export const SILO_TOP = new Vector3(-4.3, 4.0, -1.9)
export const SILO_EMIT = new Vector3(-4.3, 2.6, -1.9)
export const PORT = new Vector3(10.5, BY, 0.8)
export const STORE_HOME = new Vector3(12.9, 0, 0.8)
export const LANE_Z = -7.4
export const HOME: Record<IntegratorId, Vector3> = {
  arm: new Vector3(6, 0, -5.2),
  drone: new Vector3(3.2, 3.6, -2.6),
  walker: new Vector3(1.2, 0, -3.0),
}
export const PAD: Record<IntegratorId, Vector3> = {
  arm: new Vector3(18.0, 0, -3.9),
  drone: new Vector3(21.8, 0, -3.9),
  walker: new Vector3(25.6, 0, -3.9),
}
export const STORE_PAD: Record<Database, Vector3> = { postgres: new Vector3(19.0, 0, 1.0), mongodb: new Vector3(23.4, 0, 1.0) }
export const KIT_PAD: Record<TransportId, Vector3> = {
  belt: new Vector3(18.0, 0, 4.9),
  depot: new Vector3(21.8, 0, 4.9),
  tube: new Vector3(25.6, 0, 4.9),
}
export const HANGAR = { x0: 15.6, x1: 28.0, z0: -6.6, z1: 7.0, h: 2.4 }
export const FOLD = new Vector3(1.4, 6.0, 0.2)
export const TUBE = new CatmullRomCurve3([
  DOCK.clone().setY(1.25),
  new Vector3(-7.2, 3.4, 2.4),
  new Vector3(-4.3, 5.2, 3.2),
  new Vector3(-1.6, 3.6, 2.6),
  INTAKE.clone().setY(1.7),
])
export const WH = { x1: -9.8, row: 0.95, bay: 0.88, slot: 0.22, level: 0.21, base: 0.14, depth: 0.3 }

export type Pose = { x: number; z: number; yaw: number }
export const SLOT_COUNT = 36
export const SLOTS: Record<Framework, Pose[]> = {
  next: (() => {
    const out: Pose[] = []
    for (let i = 0; i < 7; i++)
      for (let j = 0; j < 6; j++) {
        if (i >= 2 && i <= 4 && j >= 2 && j <= 3) continue
        out.push({ x: CELL.x - 3.3 + i * 1.1, z: CELL.z - 2.5 + j * 1.0, yaw: 0 })
      }
    return out.sort((p, q) => Math.hypot(p.x - CELL.x, (p.z - CELL.z) * 1.3) - Math.hypot(q.x - CELL.x, (q.z - CELL.z) * 1.3))
  })(),
  tanstack: ([[1.85, 8], [2.75, 12], [3.6, 16]] as const).flatMap(([r, n], ring) =>
    Array.from({ length: n }, (_, k) => {
      const a = (k / n) * Math.PI * 2 + ring * 0.2 + 0.4
      return { x: CELL.x + Math.cos(a) * r, z: CELL.z + Math.sin(a) * r, yaw: -a - Math.PI / 2 }
    }),
  ),
}
export function slotAt(cell: Framework, slot: number, out = new Vector3()) {
  const s = SLOTS[cell][slot % SLOT_COUNT]
  return out.set(s.x, BY + Math.floor(slot / SLOT_COUNT) * 0.14, s.z)
}
export function onBoard(cell: Framework, x: number, z: number) {
  return cell === 'next' ? Math.abs(x - CELL.x) < 4.3 && Math.abs(z - CELL.z) < 3.3 : Math.hypot(x - CELL.x, z - CELL.z) < 4.3
}
export function binPos(bin: Bin, aisles: number, out = new Vector3()) {
  return out.set(
    WH.x1 - (bin.bay - 1) * WH.bay - (bin.slot + 0.5) * WH.slot,
    WH.base + (bin.level - 0.5) * WH.level,
    (bin.aisle - 1 - (aisles - 1) / 2) * WH.row,
  )
}

export type Phase = 'pick' | 'transit' | 'intake' | 'carried' | 'seated' | 'home'
export type Stage = 'fly' | 'belt' | 'wait' | 'tube' | 'beam' | null
type Fly = { from: Vector3; to: Vector3; t: number; dur: number; h: number; s0: number; s1: number; spin: boolean; done: () => void }
export type Part = {
  item: CatalogItem
  ref: string
  home: Vector3
  size: [number, number, number]
  pos: Vector3
  scale: number
  spin: number
  rot: number
  yaw: number
  wob: number
  phase: Phase
  stage: Stage
  fly: Fly | null
  run: number
  ghost: boolean
  slot: number
  mark: IntegratorId | null
  finish: number
  seq: number
}
export type Step = { to: Vector3; arrive?: () => boolean | void; work?: number; part?: Part }
export type Unit = {
  id: IntegratorId
  state: 'parked' | 'launch' | 'active' | 'dock'
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
}
export type Store = { id: Database; pos: Vector3; from: Vector3; to: Vector3; t: number; side: number; kick: number; writes: number }
export type Sim = {
  items: Map<string, CatalogItem>
  bins: Lab['warehouse']['bins']
  aisles: number
  parts: Map<string, Part>
  live: Part[]
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
  follow: Part | null
  followDone: number
  time: number
  version: number
  rig: Rig
  onLive: () => void
}

const GRIP: Record<IntegratorId, number> = { arm: 0.6, drone: 1.2, walker: 0.34 }
const LIFT: Record<IntegratorId, number> = { arm: 1.5, drone: 1.9, walker: 0.6 }
const WORK: Record<IntegratorId, number> = { arm: 0.55, drone: 1.15, walker: 0.95 }
const WORK_UP: Record<IntegratorId, number> = { arm: 0.3, drone: 0.5, walker: 0 }
const TOSS: Record<IntegratorId, Vector3> = { arm: new Vector3(3.0, 4.6, -1.0), drone: new Vector3(1.6, 4.6, 0.6), walker: new Vector3(0.8, 1.9, 0.2) }
const TRAVEL: Record<IntegratorId, number> = { arm: 5.5, drone: 0, walker: 4.8 }
const BELT_SPEED = 2.5
const BELT_GAP = 1.1
export const WALK_H = 1.55

const up = (v: Vector3, y: number) => v.clone().setY(v.y + y)
const smooth = (t: number) => t * t * (3 - 2 * t)
const tmp = new Vector3()

function makeUnit(id: IntegratorId, active: boolean): Unit {
  const base = (active ? HOME[id] : PAD[id]).clone()
  const pos = id === 'arm' ? base.clone().add(FOLD) : id === 'drone' ? (active ? base.clone() : base.clone().setY(0.5)) : base.clone().setY(active ? WALK_H : 1.0)
  if (id === 'drone') base.setY(0)
  return { id, state: active ? 'active' : 'parked', path: [], tt: 0, total: 0, pos, vel: new Vector3(), base, speed: 0, steps: [], holding: null, job: null, work: null, wait: 0 }
}

function makePart(sim: Sim, ref: string): Part | undefined {
  const existing = sim.parts.get(ref)
  if (existing) return existing
  const item = sim.items.get(ref)
  const bin = sim.bins.get(ref)
  if (!item || !bin) return
  const home = binPos(bin, sim.aisles)
  const p: Part = {
    item, ref, home,
    size: item.kind === 'block' ? [0.82, 0.08, 0.6] : [0.5, 0.36, 0.5],
    pos: home.clone(), scale: 0.25, spin: 0, rot: 0, yaw: 0, wob: 0,
    phase: 'home', stage: null, fly: null, run: 0, ghost: false, slot: -1, mark: null, finish: 0, seq: 0,
  }
  sim.parts.set(ref, p)
  return p
}

export function createSim(lab: Lab, rig: Rig): Sim {
  const sim: Sim = {
    items: new Map(lab.catalog.items.map((item) => [item.ref, item])),
    bins: lab.warehouse.bins,
    aisles: lab.warehouse.aisles.length,
    parts: new Map(), live: [], queue: [], intake: [], removals: [], slots: [], store: [],
    units: { arm: makeUnit('arm', rig.integrator === 'arm'), drone: makeUnit('drone', rig.integrator === 'drone'), walker: makeUnit('walker', rig.integrator === 'walker') },
    stores: {
      postgres: makeStore('postgres', rig.storage === 'postgres'),
      mongodb: makeStore('mongodb', rig.storage === 'mongodb'),
    },
    show: { belt: +(rig.transport === 'belt'), depot: +(rig.transport === 'depot'), tube: +(rig.transport === 'tube'), next: +(rig.cell === 'next'), tanstack: +(rig.cell === 'tanstack') },
    pulses: [], puffs: [], tubeNext: 0, seq: 0, follow: null, followDone: 0, time: 0, version: 0, rig, onLive: () => {},
  }
  for (const ref of lab.setup.items) {
    const p = makePart(sim, ref)
    if (!p) continue
    p.phase = 'seated'
    p.slot = freeSlot(sim)
    sim.slots[p.slot] = p
    p.mark = rig.integrator
    p.finish = 1
    p.scale = 1
    p.ghost = rig.transport === 'depot'
    if (p.ghost) sim.store.push(ref)
    slotAt(rig.cell, p.slot, p.pos).y += p.size[1] / 2
    p.rot = SLOTS[rig.cell][p.slot % SLOT_COUNT].yaw
    p.yaw = rig.integrator === 'arm' ? (((p.slot * 37) % 11) / 11 - 0.5) * 0.24 : 0
    sim.live.push(p)
  }
  sim.stores[rig.storage].writes = sim.live.length
  return sim
}

function makeStore(id: Database, active: boolean): Store {
  const at = (active ? STORE_HOME : STORE_PAD[id]).clone()
  return { id, pos: at.clone(), from: at.clone(), to: at.clone(), t: 1, side: 1, kick: 0, writes: 0 }
}

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
const drop = <T>(list: T[], v: T) => {
  const i = list.indexOf(v)
  if (i >= 0) list.splice(i, 1)
}

function fly(p: Part, to: Vector3, dur: number, h: number, s1: number, spin: boolean, done: () => void) {
  p.fly = { from: p.pos.clone(), to: to.clone(), t: 0, dur, h, s0: p.scale, s1, spin, done }
}

function setLive(sim: Sim) {
  sim.version++
  sim.onLive()
}

function start(sim: Sim, p: Part) {
  const fresh = !sim.live.includes(p)
  if (fresh) sim.live.push(p)
  p.seq = ++sim.seq
  sim.follow = p
  p.ghost = false
  p.finish = 0
  p.mark = null
  p.slot = -1
  p.spin = 0
  if (sim.rig.transport === 'depot') {
    p.phase = 'transit'
    if (sim.store.includes(p.ref)) beam(p)
    else {
      p.stage = 'fly'
      fly(p, SILO_TOP, 0.9 + p.pos.distanceTo(SILO_TOP) * 0.025, 2.6, 0.55, false, () => {
        sim.store.push(p.ref)
        beam(p)
      })
    }
  } else {
    p.phase = 'pick'
    p.stage = 'fly'
    fly(p, up(DOCK, p.size[1] / 2), 0.8 + p.pos.distanceTo(DOCK) * 0.025, 2.4, 1, false, () => enterTransit(sim, p))
  }
  if (fresh) setLive(sim)
}
function beam(p: Part) {
  p.stage = 'beam'
  p.run = 0
  p.ghost = true
  p.scale = 0
  p.pos.copy(SILO_EMIT)
  p.fly = null
}
function enterTransit(sim: Sim, p: Part) {
  p.phase = 'transit'
  const via = sim.rig.transport
  if (via === 'depot') {
    p.stage = 'fly'
    fly(p, SILO_TOP, 0.7, 1.8, 0.55, false, () => {
      if (!sim.store.includes(p.ref)) sim.store.push(p.ref)
      beam(p)
    })
    return
  }
  p.stage = via === 'belt' ? 'belt' : 'wait'
  p.run = DOCK.x
  sim.queue.push(p)
}
function toIntake(sim: Sim, p: Part) {
  p.phase = 'intake'
  p.stage = null
  p.scale = 1
  drop(sim.queue, p)
  sim.intake.push(p)
}
function shortcut(sim: Sim, p: Part) {
  drop(sim.queue, p)
  p.stage = 'fly'
  fly(p, intakeTop(sim, p), 0.6, 1.4, 1, false, () => toIntake(sim, p))
}
function intakeTop(sim: Sim, p: Part, out = new Vector3()) {
  let y = INTAKE.y
  for (const q of sim.intake) y += q.size[1] + 0.02
  return out.set(INTAKE.x, y + p.size[1] / 2, INTAKE.z)
}

export function flyHome(sim: Sim, p: Part) {
  drop(sim.queue, p)
  drop(sim.intake, p)
  drop(sim.removals, p)
  release(sim, p)
  p.phase = 'home'
  p.stage = null
  const done = () => {
    if (p.phase !== 'home') return
    drop(sim.live, p)
    p.fly = null
    setLive(sim)
  }
  if (p.ghost) fly(p, SILO_EMIT, 0.55, 0.6, 0, false, done)
  else fly(p, p.home, 1.0 + p.pos.distanceTo(p.home) * 0.025, 3.4, 0.25, true, done)
}

function travelPath(u: Unit, dest: Vector3) {
  const from = u.id === 'drone' ? u.pos.clone() : u.base.clone().setY(0)
  if (u.id === 'drone') return [from, dest.clone()]
  return [from, new Vector3(from.x, 0, LANE_Z), new Vector3(dest.x, 0, LANE_Z), dest.clone().setY(0)]
}
function setTravel(u: Unit, state: 'launch' | 'dock') {
  u.state = state
  u.path = travelPath(u, state === 'launch' ? (u.id === 'drone' ? HOME.drone : HOME[u.id]) : u.id === 'drone' ? PAD.drone.clone().setY(0.5) : PAD[u.id])
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

function dismiss(sim: Sim, u: Unit, lab: Lab) {
  const p = u.holding
  if (p) {
    if (lab.selected.has(p.ref)) {
      release(sim, p)
      p.phase = 'intake'
      sim.intake.push(p)
    } else flyHome(sim, p)
  }
  if (u.work) u.work.part.finish = 1
  u.holding = null
  u.job = null
  u.work = null
  u.steps = []
}

function seatJob(sim: Sim, u: Unit, lab: Lab, p: Part) {
  const g = GRIP[u.id] + p.size[1] / 2
  const pick = p.pos.clone().setY(p.pos.y + g)
  u.job = p
  u.steps = [
    { to: up(pick, LIFT[u.id]) },
    {
      to: pick,
      arrive: () => {
        if (p.phase !== 'intake' || !lab.selected.has(p.ref)) return false
        drop(sim.intake, p)
        p.phase = 'carried'
        u.holding = p
        p.slot = freeSlot(sim)
        sim.slots[p.slot] = p
        const at = slotAt(sim.rig.cell, p.slot).setY(BY + Math.floor(p.slot / SLOT_COUNT) * 0.14 + p.size[1] / 2 + g)
        u.steps.push(
          { to: up(pick, LIFT[u.id] + 0.3) },
          { to: up(at, LIFT[u.id]) },
          {
            to: at,
            arrive: () => {
              u.holding = null
              if (!lab.selected.has(p.ref)) {
                flyHome(sim, p)
                return false
              }
              p.phase = 'seated'
              p.mark = u.id
              p.finish = 0
              p.yaw = u.id === 'arm' ? (Math.random() - 0.5) * 0.26 : 0
              p.wob = u.id === 'arm' ? 1 : 0
            },
          },
          { to: up(at, WORK_UP[u.id]), work: WORK[u.id], part: p },
          { to: up(at, LIFT[u.id] * 0.7) },
        )
      },
    },
  ]
}

function removeJob(sim: Sim, u: Unit, lab: Lab, p: Part) {
  const g = GRIP[u.id] + p.size[1] / 2
  const at = slotAt(sim.rig.cell, p.slot).setY(p.pos.y + g)
  u.job = p
  u.steps = [
    { to: up(at, LIFT[u.id]) },
    {
      to: at,
      arrive: () => {
        if (lab.selected.has(p.ref) || p.phase !== 'seated') return false
        release(sim, p)
        p.phase = 'carried'
        u.holding = p
      },
    },
    { to: up(at, LIFT[u.id]) },
    {
      to: TOSS[u.id],
      arrive: () => {
        u.holding = null
        flyHome(sim, p)
      },
    },
  ]
}

function idleTarget(u: Unit, t: number, out: Vector3) {
  if (u.id === 'arm') return out.copy(u.base).add(tmp.set(2.6 + Math.sin(t * 0.37) * 0.3, 3.6 + Math.sin(t * 0.71) * 0.3, 2.6 + Math.sin(t * 0.29) * 0.4))
  if (u.id === 'drone') return out.copy(HOME.drone).add(tmp.set(Math.sin(t * 0.5) * 1.5, Math.sin(t * 1.6) * 0.16, Math.sin(t * 1.0) * 0.8))
  return out.copy(HOME.walker).add(tmp.set(Math.sin(t * 0.45) * 0.18, WALK_H + Math.sin(t * 1.3) * 0.03, Math.cos(t * 0.3) * 0.12))
}

const target = new Vector3()
function move(u: Unit, to: Vector3, dt: number, rush: number) {
  tmp.copy(to).sub(u.pos)
  const d = tmp.length()
  if (u.id === 'arm') {
    const k = 26 * rush, c = 5.6 * Math.sqrt(rush)
    u.vel.addScaledVector(tmp, k * dt).addScaledVector(u.vel, -c * dt)
    const max = 8 * rush
    if (u.vel.length() > max) u.vel.setLength(max)
    u.pos.addScaledVector(u.vel, dt)
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

function stepUnit(sim: Sim, u: Unit, lab: Lab, dt: number, rush: number) {
  const want = sim.rig.integrator === u.id
  if (want && (u.state === 'parked' || u.state === 'dock')) setTravel(u, 'launch')
  if (!want && (u.state === 'active' || u.state === 'launch')) {
    dismiss(sim, u, lab)
    setTravel(u, 'dock')
  }
  if (u.state === 'launch' || u.state === 'dock') {
    if (u.id === 'drone') {
      u.tt = Math.min(u.total, u.tt + (u.total / 2.6) * dt)
      const k = smooth(u.tt / Math.max(u.total, 1e-6))
      u.pos.lerpVectors(u.path[0], u.path[1], k)
      u.pos.y += Math.sin(k * Math.PI) * 4.2
    } else {
      u.tt = Math.min(u.total, u.tt + TRAVEL[u.id] * dt)
      along(u.path, u.tt, u.base)
      if (u.id === 'arm') move(u, target.copy(u.base).add(FOLD), dt, 1)
      else {
        target.set(u.base.x, u.state === 'dock' && u.tt > u.total - 0.5 ? 1.0 : WALK_H, u.base.z)
        u.pos.lerp(target, 1 - Math.exp(-dt * 8))
      }
    }
    if (u.tt >= u.total) {
      u.state = u.state === 'launch' ? 'active' : 'parked'
      u.vel.set(0, 0, 0)
    }
    return
  }
  if (u.state === 'parked') {
    if (u.id === 'arm') move(u, target.copy(u.base).add(FOLD).add(tmp.set(0, Math.sin(sim.time * 0.8) * 0.12, 0)), dt, 0.6)
    if (u.id === 'walker') u.pos.y += (1.0 + Math.sin(sim.time * 0.9) * 0.02 - u.pos.y) * (1 - Math.exp(-dt * 4))
    return
  }
  if (!u.steps.length && !u.work) {
    const r = sim.removals.find((p) => p.phase === 'seated')
    if (r) {
      drop(sim.removals, r)
      removeJob(sim, u, lab, r)
    } else if (sim.intake.length) {
      const p = sim.intake[sim.intake.length - 1]
      if (!p.fly) seatJob(sim, u, lab, p)
    }
  }
  const goal = u.steps[0]?.to ?? idleTarget(u, sim.time, target)
  if (u.work) {
    const w = u.work
    w.t += dt
    w.part.finish = Math.min(1, w.t / w.dur)
    move(u, goal, dt, rush)
    if (w.t >= w.dur) {
      w.part.finish = 1
      u.work = null
      u.steps.shift()
      if (w.part.phase === 'seated') pulse(sim, w.part)
      if (sim.follow === w.part) sim.followDone = sim.time
    }
  } else if (move(u, goal, dt, rush) && u.steps.length) {
    u.wait = 0
    const s = u.steps[0]
    if (s.arrive?.() === false) u.steps = []
    else if (s.work && s.part) u.work = { t: 0, dur: s.work, part: s.part }
    else u.steps.shift()
  }
  if (!u.steps.length && !u.work) u.job = null
  if (u.holding) u.holding.pos.copy(u.pos).setY(u.pos.y - GRIP[u.id] - u.holding.size[1] / 2)
}

export function tracePath(cell: Framework, slot: number) {
  const s = SLOTS[cell][slot % SLOT_COUNT]
  const y = BY + 0.012
  if (cell === 'tanstack') {
    const a = Math.atan2(s.z - CELL.z, s.x - CELL.x)
    const r = Math.hypot(s.x - CELL.x, s.z - CELL.z)
    const at = (rr: number, aa: number) => new Vector3(CELL.x + Math.cos(aa) * rr, y, CELL.z + Math.sin(aa) * rr)
    return [at(r, a), at(r - 0.46, a), at((r - 0.46 + 1.12) / 2, a + 0.1), at(1.12, a + 0.16)]
  }
  if (Math.abs(s.x - CELL.x) <= 1.2) {
    const zEdge = CELL.z + Math.sign(s.z - CELL.z) * 0.78
    return [new Vector3(s.x, y, s.z), new Vector3(s.x, y, zEdge)]
  }
  const side = Math.sign(s.x - CELL.x)
  const zc = Math.max(-0.6, Math.min(0.6, s.z - CELL.z)) + CELL.z
  const xm = s.x - side * 0.55
  return [new Vector3(s.x, y, s.z), new Vector3(xm, y, s.z), new Vector3(xm, y, zc), new Vector3(CELL.x + side * 1.25, y, zc)]
}

function pulse(sim: Sim, p: Part) {
  const store = sim.stores[sim.rig.storage]
  sim.pulses.push({ path: [...tracePath(sim.rig.cell, p.slot), CELL.clone().setY(BY + 0.3), PORT.clone(), store.pos.clone().setY(1.6)], t: 0 })
}

export function step(sim: Sim, lab: Lab, rig: Rig, dt: number) {
  sim.time += dt
  sim.rig = rig

  for (const ref of lab.selected) {
    const p = makePart(sim, ref)
    if (!p) continue
    if (p.phase === 'home') start(sim, p)
    else if (p.phase === 'seated') drop(sim.removals, p)
  }
  for (const p of [...sim.live]) {
    if (lab.selected.has(p.ref) || p.phase === 'home') continue
    if (p.phase === 'seated') {
      if (p.ghost) flyHome(sim, p)
      else if (!sim.removals.includes(p) && !INTEGRATORS.some((id) => sim.units[id].job === p)) sim.removals.push(p)
    } else if (p.phase === 'carried') {
      const u = INTEGRATORS.map((id) => sim.units[id]).find((x) => x.holding === p)
      if (u) {
        u.holding = null
        u.steps = []
        u.job = null
      }
      flyHome(sim, p)
    } else flyHome(sim, p)
  }

  for (const p of sim.live) {
    const f = p.fly
    if (!f) continue
    f.t += dt / f.dur
    const t = Math.min(1, f.t)
    p.pos.lerpVectors(f.from, f.to, t)
    p.pos.y += f.h * 4 * t * (1 - t)
    p.scale = f.s0 + (f.s1 - f.s0) * t
    p.spin = f.spin ? t * Math.PI * 3 : 0
    if (f.t >= 1) {
      p.fly = null
      p.spin = 0
      f.done()
    }
  }

  let limit = INTAKE.x
  let waiting = 0
  for (const p of [...sim.queue]) {
    if (p.stage === 'belt') {
      if (rig.transport !== 'belt') {
        shortcut(sim, p)
        continue
      }
      p.run = Math.max(p.run, Math.min(p.run + BELT_SPEED * dt, limit))
      limit = p.run - BELT_GAP
      p.pos.set(p.run, DOCK.y + p.size[1] / 2, DOCK.z)
      if (p.run >= INTAKE.x - 1e-3) toIntake(sim, p)
    } else if (p.stage === 'wait') {
      if (rig.transport !== 'tube') {
        shortcut(sim, p)
        continue
      }
      if (sim.time >= sim.tubeNext && waiting === 0) {
        p.stage = 'tube'
        p.run = 0
        sim.tubeNext = sim.time + 0.22
      } else p.pos.set(DOCK.x, DOCK.y + 0.06 + waiting++ * 0.16 + p.size[1] / 2, DOCK.z)
    } else if (p.stage === 'tube') {
      p.run += dt / 0.3
      TUBE.getPointAt(Math.min(1, p.run * p.run), p.pos)
      if (p.run >= 1) {
        sim.puffs.push(0)
        toIntake(sim, p)
        p.pos.copy(intakeTop(sim, p)).setY(p.pos.y + 0.5)
      }
    }
  }
  for (const p of sim.live) {
    if (p.stage !== 'beam') continue
    p.run += dt / 0.5
    p.scale = smooth(Math.min(1, p.run))
    intakeTop(sim, p, p.pos)
    if (p.run >= 1) toIntake(sim, p)
  }
  let y = INTAKE.y
  for (const p of sim.intake) {
    if (!p.fly) p.pos.lerp(target.set(INTAKE.x, y + p.size[1] / 2, INTAKE.z), 1 - Math.exp(-dt * 12))
    y += p.size[1] + 0.02
  }

  const rush = 1 + Math.min(1.6, (sim.queue.length + sim.intake.length + sim.removals.length) * 0.22)
  for (const id of INTEGRATORS) stepUnit(sim, sim.units[id], lab, dt, rush)

  for (const p of sim.live) {
    if (p.phase !== 'seated') continue
    const pose = SLOTS[rig.cell][p.slot % SLOT_COUNT]
    slotAt(rig.cell, p.slot, target).y += p.size[1] / 2
    p.pos.lerp(target, 1 - Math.exp(-dt * 10))
    p.rot += (pose.yaw + p.yaw - p.rot) * (1 - Math.exp(-dt * 8))
    p.wob *= Math.exp(-dt * 2.6)
    if (p.ghost && rig.transport !== 'depot') p.ghost = false
  }
  for (const p of sim.live) if (p.phase !== 'seated') p.rot *= Math.exp(-dt * 8)

  for (const id of ['postgres', 'mongodb'] as const) {
    const s = sim.stores[id]
    const want = rig.storage === id
    const dest = want ? STORE_HOME : STORE_PAD[id]
    if (!s.to.equals(dest)) {
      s.from.copy(s.pos).setY(0)
      s.to.copy(dest)
      s.t = 0
      s.side = want ? 1 : -1
    }
    s.t = Math.min(1, s.t + dt / 1.9)
    const k = smooth(s.t)
    s.pos.lerpVectors(s.from, s.to, k)
    s.pos.z += Math.sin(k * Math.PI) * 1.9 * s.side
    s.pos.y = Math.sin(k * Math.PI) * 0.45
    s.kick *= Math.exp(-dt * 1.6)
  }
  for (const key of ['belt', 'depot', 'tube', 'next', 'tanstack'] as const) {
    const on = key === rig.transport || key === rig.cell ? 1 : 0
    sim.show[key] += (on - sim.show[key]) * (1 - Math.exp(-dt * 3.2))
  }
  for (const pl of sim.pulses) pl.t += dt / 1.2
  for (const pl of sim.pulses)
    if (pl.t >= 1) {
      const s = sim.stores[rig.storage]
      s.kick = 1
      s.writes++
    }
  sim.pulses = sim.pulses.filter((pl) => pl.t < 1)
  sim.puffs = sim.puffs.map((t) => t + dt / 0.6).filter((t) => t < 1)
}
