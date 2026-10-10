import { Vector3 } from 'three'

import type { CatalogItem } from '../../../../workspace/-workspace/workspace.types'
import type { Lab } from '../../lab.types'
import type { Aisle, Bin, Warehouse, ZoneId } from '../../warehouse'

export const ACCENT = '#5A91AD'
export const PAINT = '#D9A441'

export const RD = 1.1
export const CW = 2.3
export const PITCH = RD + CW
export const BW = 2.4
export const SW = BW / 4
export const LV = 0.6
export const Y0 = 0.22
export const TOP = Y0 + 5 * LV + 0.06
export const TOTE = new Vector3(0.9, 0.34, 0.48)
export const CARD = new Vector3(0.96, 0.1, 0.72)
export const Z0 = -1.2
export const MIN_BAYS = 4
export const ZONE_GAP = 1.8
export const ALT = 5.6
export const DECK = 0.34
export const FRONT = 17.2

export const OZ = 11
export const BELT = { start: -3.7, end: 1.7, z: 1.6 + OZ, y: 0.9, speed: 3.4, gap: 1.2 }
export const BASE = { x: 4.2, z: -1.4 + OZ }
export const H0 = 1.9
export const L1 = 5.6
export const L2 = 5.4
export const BOARD = { x0: 5.2, x1: 13.95, z0: -3.75 + OZ, z1: 3.15 + OZ, y: 0.45 }
export const CHIPS = { framework: new Vector3(8.35, 0, -0.3 + OZ), database: new Vector3(10.85, 0, -0.3 + OZ) }
export const CHIP = 1.7
export const TOSS = new Vector3(2.4, 4.4, 0.2 + OZ)
export const REST = new Vector3(2.6, 3.6, 0.6 + OZ)
export const INTAKE = new Vector3(BELT.start - 1.45, 0, BELT.z)
export const OUTBOX = new Vector3(-1.6, 0.62, OZ - 2.4)
export const DOCK = { x: 19.5, z: 16.9, pallet: new Vector3(19.5, 0, 14.6) }
export const CELL_CX = 4.6

export const SLOTS = (() => {
  const out: { x: number; z: number; i: number; j: number }[] = []
  for (let i = 0; i < 7; i++)
    for (let j = 0; j < 7; j++) {
      if (i >= 1 && i <= 5 && j >= 2 && j <= 4) continue
      out.push({ x: 5.85 + i * 1.25, z: -3.15 + j * 0.95 + OZ, i, j })
    }
  return out.sort((a, b) => Math.hypot(a.x - 9.6, (a.z - OZ + 0.3) * 1.3) - Math.hypot(b.x - 9.6, (b.z - OZ + 0.3) * 1.3))
})()

export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
export const smooth = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}

export type AisleLayout = { aisle: Aisle; x0: number; face: number; cx: number; bays: number; z1: number; len: number }
export type Layout = {
  aisles: AisleLayout[]
  byNo: Map<number, AisleLayout>
  byId: Map<string, AisleLayout>
  zones: { id: ZoneId; label: string; x0: number; x1: number; z1: number }[]
  x0: number
  x1: number
  zBack: number
}

/** One single-sided rack run per aisle, facing +x into its corridor; zones sit side by side with a wider walkway. */
export function toLayout(warehouse: Warehouse): Layout {
  let x = 0
  let previous: ZoneId | null = null
  const raw = warehouse.aisles.map((aisle) => {
    if (previous && previous !== aisle.zone) x += ZONE_GAP
    previous = aisle.zone
    const x0 = x
    x += PITCH
    return { aisle, x0, bays: Math.max(MIN_BAYS, aisle.bays) }
  })
  const shift = CELL_CX - x / 2
  const aisles = raw.map(({ aisle, x0, bays }) => {
    const left = x0 + shift
    return { aisle, x0: left, face: left + RD, cx: left + RD + CW / 2, bays, z1: Z0 - bays * BW, len: bays * BW }
  })
  const zones = warehouse.zones
    .filter((zone) => zone.aisles.length)
    .map((zone) => {
      const own = aisles.filter((a) => a.aisle.zone === zone.id)
      return { id: zone.id, label: zone.label, x0: own[0].x0 - 0.45, x1: own[own.length - 1].x0 + PITCH + 0.2, z1: Math.min(...own.map((a) => a.z1)) - 0.5 }
    })
  return {
    aisles,
    byNo: new Map(aisles.map((a) => [a.aisle.no, a])),
    byId: new Map(aisles.map((a) => [a.aisle.id, a])),
    zones,
    x0: Math.min(shift - 3.5, -16),
    x1: Math.max(shift + x + 1.2, 24),
    zBack: Math.min(...aisles.map((a) => a.z1)) - 3,
  }
}

export function binPos(bin: Bin, L: Layout, out = new Vector3()) {
  const a = L.byNo.get(bin.aisle)!
  return out.set(a.face - TOTE.x / 2 - 0.06, Y0 + (bin.level - 1) * LV + 0.02 + TOTE.y / 2, Z0 - (bin.bay - 1) * BW - (bin.slot + 0.5) * SW)
}

export function slotPos(slot: number, out = new Vector3()) {
  const s = SLOTS[slot % SLOTS.length]
  return out.set(s.x, BOARD.y + CARD.y / 2 + Math.floor(slot / SLOTS.length) * 0.16, s.z)
}
const outboxPos = (index: number, out = new Vector3()) => out.set(OUTBOX.x, OUTBOX.y + TOTE.y / 2 + index * (TOTE.y + 0.02), OUTBOX.z)

export type Mode = 'rack' | 'queued' | 'assigned' | 'carry' | 'belt' | 'held' | 'board' | 'outbox' | 'fetch' | 'back'
type Fly = { from: Vector3; to: Vector3; t: number; dur: number; h: number; s0: Vector3; s1: Vector3; spin: boolean; done?: () => void }
export type Part = {
  item: CatalogItem
  bin: Bin
  home: Vector3
  pos: Vector3
  size: Vector3
  mode: Mode
  fly: Fly | null
  beltX: number
  slot: number
  picker: Picker | null
  spin: number
  seatedAt: number
}
export type PickerKind = 'agv' | 'drone' | 'forklift'
type Way = { to: Vector3; lift?: number; face?: number; arrive?: () => boolean | void }
export type Picker = {
  id: number
  pos: Vector3
  heading: number
  lift: number
  route: Way[]
  wait: number
  part: Part | null
  carrying: boolean
  job: 'pick' | 'put' | null
  tag: string
  moving: number
  speed: number
}
type Step = { to: Vector3; arrive?: () => boolean | void }
export type Pose = { target: Vector3; size: number; az: number; el: number; fov: number }

export type Sim = {
  L: Layout
  parts: Map<string, Part>
  list: Part[]
  active: Set<Part>
  want: ReadonlySet<string>
  pickQ: Part[]
  putQ: Part[]
  belt: Part[]
  removals: Part[]
  slots: (Part | null)[]
  outbox: Part[]
  arm: { pos: Vector3; steps: Step[]; holding: Part | null; grip: number; job: Part | null }
  welder: { pos: Vector3; welds: Vector3[]; weldT: number; show: number }
  pickers: Picker[]
  kind: PickerKind
  fleet: number
  agent: boolean
  pulses: { slot: number; t: number }[]
  time: number
  binVersion: number
  follow: { on: boolean; ref: string | null; since: number }
  ship: { t: number; count: number }
  cam: Pose
  base: Pose
  baseKind: 'iso' | 'plan' | 'aisle' | 'manual'
}

export const inRack = (p: Part) => p.mode === 'rack' || p.mode === 'queued' || p.mode === 'assigned'
export const padOf = (id: number) => new Vector3(-8.6 - (id % 4) * 1.7, 0, 6.6 + Math.floor(id / 4) * 1.9)
const laneZ = (id: number) => 0.7 + (id % 4) * 0.95

export function createSim(lab: Lab, L: Layout): Sim {
  const parts = new Map<string, Part>()
  for (const [ref, bin] of lab.warehouse.bins) {
    const home = binPos(bin, L)
    parts.set(ref, { item: bin.item, bin, home, pos: home.clone(), size: TOTE.clone(), mode: 'rack', fly: null, beltX: 0, slot: -1, picker: null, spin: 0, seatedAt: 0 })
  }
  const pose: Pose = { target: new Vector3(), size: 30, az: 0.6, el: 0.6, fov: 24 }
  const sim: Sim = {
    L,
    parts,
    list: [...parts.values()],
    active: new Set(),
    want: lab.selected,
    pickQ: [],
    putQ: [],
    belt: [],
    removals: [],
    slots: [],
    outbox: [],
    arm: { pos: REST.clone(), steps: [], holding: null, grip: 0, job: null },
    welder: { pos: new Vector3(9.6, 3.4, OZ), welds: [], weldT: 0, show: lab.setup.agent === 'none' ? 0 : 1 },
    pickers: Array.from({ length: 8 }, (_, id) => ({
      id, pos: padOf(id), heading: Math.PI, lift: 0, route: [], wait: 0, part: null, carrying: false, job: null, tag: '', moving: 0, speed: 0,
    })),
    kind: 'agv',
    fleet: 4,
    agent: lab.setup.agent !== 'none',
    pulses: [],
    time: 0,
    binVersion: 1,
    follow: { on: true, ref: null, since: 0 },
    ship: { t: -1, count: 1 },
    cam: { ...pose, target: pose.target.clone() },
    base: pose,
    baseKind: 'iso',
  }
  for (const ref of lab.setup.items) {
    const p = parts.get(ref)
    if (!p) continue
    p.slot = sim.slots.length
    sim.slots.push(p)
    p.mode = 'board'
    p.size.copy(CARD)
    slotPos(p.slot, p.pos)
    sim.active.add(p)
  }
  return sim
}

function startFly(p: Part, to: Vector3, dur: number, h: number, size: Vector3, done?: () => void, spin = false) {
  p.fly = { from: p.pos.clone(), to: to.clone(), t: 0, dur, h, s0: p.size.clone(), s1: size.clone(), spin, done }
}

export function deckPos(sim: Sim, k: Picker, out = new Vector3()) {
  if (sim.kind === 'drone') return out.set(k.pos.x, k.pos.y - 0.44, k.pos.z)
  out.set(k.pos.x, k.lift + DECK + TOTE.y / 2, k.pos.z)
  if (sim.kind === 'forklift') out.add({ x: Math.sin(k.heading) * 0.95, y: 0, z: Math.cos(k.heading) * 0.95 } as Vector3)
  return out
}

function ways(sim: Sim, k: Picker, from: Vector3, to: Vector3): Way[] {
  if (sim.kind === 'drone') {
    const out: Way[] = []
    if (from.y < ALT - 0.1) out.push({ to: new Vector3(from.x, ALT, from.z) })
    out.push({ to: new Vector3(to.x, ALT, to.z) }, { to: to.clone() })
    return out
  }
  const lane = laneZ(k.id)
  const out: Way[] = []
  if (Math.abs(from.x - to.x) > 0.05) {
    if (Math.abs(from.z - lane) > 0.05) out.push({ to: new Vector3(from.x, 0, lane) })
    out.push({ to: new Vector3(to.x, 0, lane) })
  }
  out.push({ to: new Vector3(to.x, 0, to.z) })
  return out
}

function binStop(sim: Sim, p: Part) {
  const a = sim.L.byNo.get(p.bin.aisle)!
  return sim.kind === 'drone' ? new Vector3(a.cx - 0.2, p.home.y + 0.62, p.home.z) : new Vector3(a.cx + (sim.kind === 'forklift' ? 0.35 : -0.25), 0, p.home.z)
}
const binLift = (p: Part) => Math.max(0, p.home.y - TOTE.y / 2 - DECK)

function route(sim: Sim, k: Picker, to: Vector3, last: Omit<Way, 'to'>, prefix: Way[] = []) {
  const from = prefix.length ? prefix[prefix.length - 1].to : k.pos
  const path = ways(sim, k, from.clone(), to)
  Object.assign(path[path.length - 1], last)
  k.route = [...prefix, ...path]
}

function release(k: Picker) {
  k.part = null
  k.carrying = false
  k.job = null
  k.tag = ''
  k.route = []
}

function startPick(sim: Sim, k: Picker, p: Part) {
  p.mode = 'assigned'
  p.picker = k
  k.part = p
  k.job = 'pick'
  k.tag = p.bin.code
  route(sim, k, binStop(sim, p), { face: -Math.PI / 2, lift: binLift(p), arrive: () => extract(sim, k, p) })
}

function extract(sim: Sim, k: Picker, p: Part) {
  if (!sim.want.has(p.item.ref)) {
    p.mode = 'rack'
    p.picker = null
    sim.active.delete(p)
    release(k)
    return
  }
  p.mode = 'carry'
  k.carrying = true
  sim.binVersion++
  startFly(p, deckPos(sim, k), 0.4, 0.12, TOTE)
  k.wait = 0.45
  const here = k.pos.clone()
  const intake = sim.kind === 'drone' ? new Vector3(INTAKE.x + 0.4, 1.95, INTAKE.z) : INTAKE.clone()
  route(sim, k, intake, { face: Math.PI / 2, lift: BELT.y - DECK + 0.03, arrive: () => deposit(sim, k, p) }, [{ to: here, lift: 0.3 }])
}

function deposit(sim: Sim, k: Picker, p: Part) {
  if (!sim.want.has(p.item.ref)) {
    carryBack(sim, k, p)
    return
  }
  const last = sim.belt[sim.belt.length - 1]
  if (last && (last.fly || last.beltX < BELT.start + BELT.gap)) return false
  k.carrying = false
  k.part = null
  k.job = null
  k.tag = ''
  k.wait = 0.35
  p.picker = null
  p.mode = 'belt'
  p.beltX = BELT.start
  sim.belt.push(p)
  startFly(p, new Vector3(BELT.start, BELT.y + CARD.y / 2, BELT.z), 0.45, 0.5, CARD)
}

function carryBack(sim: Sim, k: Picker, p: Part) {
  p.mode = 'back'
  k.job = 'put'
  k.tag = p.bin.code
  const here = k.pos.clone()
  route(sim, k, binStop(sim, p), { face: -Math.PI / 2, lift: binLift(p), arrive: () => insert(sim, k, p) }, [{ to: here, lift: 0.3 }])
}

function insert(sim: Sim, k: Picker, p: Part) {
  release(k)
  k.wait = 0.45
  p.picker = null
  startFly(p, p.home, 0.4, 0.1, TOTE, () => {
    p.mode = 'rack'
    sim.active.delete(p)
    sim.binVersion++
  })
}

function startFetch(sim: Sim, k: Picker, p: Part) {
  p.mode = 'fetch'
  p.picker = k
  k.part = p
  k.job = 'put'
  k.tag = p.bin.code
  const stop = sim.kind === 'drone' ? new Vector3(OUTBOX.x, OUTBOX.y + 1.4, OUTBOX.z) : new Vector3(OUTBOX.x, 0, OUTBOX.z - 1.3)
  route(sim, k, stop, {
    face: 0,
    lift: Math.max(0, OUTBOX.y - DECK),
    arrive: () => {
      const at = sim.outbox.indexOf(p)
      if (at >= 0) sim.outbox.splice(at, 1)
      p.mode = 'back'
      k.carrying = true
      startFly(p, deckPos(sim, k), 0.4, 0.3, TOTE)
      k.wait = 0.45
      const here = k.pos.clone()
      route(sim, k, binStop(sim, p), { face: -Math.PI / 2, lift: binLift(p), arrive: () => insert(sim, k, p) }, [{ to: here, lift: 0.3 }])
    },
  })
}

function toOutbox(sim: Sim, p: Part) {
  p.mode = 'outbox'
  sim.outbox.push(p)
  startFly(p, outboxPos(sim.outbox.length - 1), 1.0, 3.2, TOTE, () => sim.putQ.push(p), true)
}

const tmp = new Vector3()
const tmp2 = new Vector3()

export function step(sim: Sim, lab: Lab, dt: number) {
  sim.time += dt
  sim.want = lab.selected
  sim.agent = lab.setup.agent !== 'none'
  const want = lab.selected

  for (const ref of lab.setup.items) {
    const p = sim.parts.get(ref)
    if (!p || p.mode !== 'rack' || p.fly) continue
    p.mode = 'queued'
    sim.pickQ.push(p)
    sim.active.add(p)
    if (sim.follow.on) {
      sim.follow.ref = ref
      sim.follow.since = sim.time
    }
  }
  for (const p of sim.active) {
    if (want.has(p.item.ref)) {
      if (p.mode === 'board' && sim.removals.includes(p)) sim.removals.splice(sim.removals.indexOf(p), 1)
      continue
    }
    if (p.mode === 'queued') {
      p.mode = 'rack'
      sim.pickQ.splice(sim.pickQ.indexOf(p), 1)
      sim.active.delete(p)
    } else if (p.mode === 'assigned' && p.picker) {
      release(p.picker)
      p.picker = null
      p.mode = 'rack'
      sim.active.delete(p)
    } else if (p.mode === 'carry' && !p.fly && p.picker) carryBack(sim, p.picker, p)
    else if (p.mode === 'board' && sim.arm.job !== p && !sim.removals.includes(p)) sim.removals.push(p)
  }

  const rush = 1 + Math.min(1, (sim.pickQ.length + sim.putQ.length) * 0.15)
  for (const k of sim.pickers) {
    if (k.id < sim.fleet && !k.job && !k.wait) {
      const p = sim.pickQ.shift()
      if (p) startPick(sim, k, p)
      else {
        const q = sim.putQ.shift()
        if (q) startFetch(sim, k, q)
      }
    }
    if (!k.job && !k.route.length && !k.wait) {
      const pad = padOf(k.id)
      if (k.pos.distanceTo(pad) > 0.05) route(sim, k, pad, { face: Math.PI, lift: 0 })
    }
    drive(sim, k, dt, rush)
  }

  sim.belt.forEach((p, i) => {
    if (p.fly) return
    const limit = i === 0 ? BELT.end : sim.belt[i - 1].beltX - BELT.gap
    p.beltX = Math.max(p.beltX, Math.min(p.beltX + BELT.speed * dt, limit))
    p.pos.set(p.beltX, BELT.y + p.size.y / 2, BELT.z)
  })

  armStep(sim, lab, dt)

  for (const p of sim.active) {
    if (p.fly) {
      const f = p.fly
      f.t += dt / f.dur
      const t = clamp(f.t, 0, 1)
      const e = t * t * (3 - 2 * t)
      p.pos.lerpVectors(f.from, f.to, e)
      p.pos.y += f.h * 4 * t * (1 - t)
      p.size.lerpVectors(f.s0, f.s1, e)
      p.spin = f.spin ? t * Math.PI * 4 : 0
      if (f.t >= 1) {
        p.fly = null
        p.spin = 0
        f.done?.()
      }
      continue
    }
    if ((p.mode === 'carry' || p.mode === 'back') && p.picker?.carrying) deckPos(sim, p.picker, p.pos)
    else if (p.mode === 'board') p.pos.lerp(slotPos(p.slot, tmp), 1 - Math.exp(-dt * 16))
    else if (p.mode === 'outbox') p.pos.lerp(outboxPos(Math.max(0, sim.outbox.indexOf(p)), tmp), 1 - Math.exp(-dt * 10))
  }

  for (const pulse of sim.pulses) pulse.t += dt / 0.7
  sim.pulses = sim.pulses.filter((pulse) => pulse.t < 1)

  const w = sim.welder
  w.show += ((sim.agent ? 1 : 0) - w.show) * (1 - Math.exp(-dt * 6))
  if (!sim.agent) w.welds = []
  const weld = w.welds[0]
  if (weld) tmp.copy(weld).setY(weld.y + 1.25)
  else tmp.set(9.6 + Math.sin(sim.time * 0.6) * 2.6, 3.5 + Math.sin(sim.time * 2.1) * 0.15, OZ - 0.3 + Math.cos(sim.time * 0.45) * 2.2)
  w.pos.lerp(tmp, 1 - Math.exp(-dt * (weld ? 5 : 1.6)))
  if (weld && w.pos.distanceTo(tmp) < 0.25) {
    w.weldT += dt
    if (w.weldT > 0.9) {
      w.welds.shift()
      w.weldT = 0
    }
  }

  if (sim.ship.t >= 0) {
    const before = sim.ship.t
    sim.ship.t += dt
    if (before < 1.7 && sim.ship.t >= 1.7) sim.ship.count++
    if (sim.ship.t > 5) sim.ship.t = -1
  }
}

export const turn = (from: number, to: number) => {
  let d = (to - from) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return d
}

function drive(sim: Sim, k: Picker, dt: number, rush: number) {
  const drone = sim.kind === 'drone'
  if (!drone) k.pos.y += (0 - k.pos.y) * (1 - Math.exp(-dt * 6))
  if (k.wait > 0) {
    k.wait = Math.max(0, k.wait - dt)
    k.moving *= 0.9
    return
  }
  const w = k.route[0]
  if (!w) {
    k.moving *= 0.9
    k.lift += (0 - k.lift) * (1 - Math.exp(-dt * 4))
    return
  }
  const base = (drone ? 17 : sim.kind === 'forklift' ? 11 : 14) * rush
  tmp.copy(w.to)
  if (!drone) tmp.y = k.pos.y
  tmp2.copy(tmp).sub(k.pos)
  const dist = tmp2.length()
  if (dist > 0.02) {
    k.speed = Math.min(base, dist * 3.2 + 1.5, k.speed + 30 * dt)
    const v = k.speed
    const move = Math.min(dist, v * dt)
    k.pos.addScaledVector(tmp2, move / dist)
    k.moving = v / base
    if (Math.hypot(tmp2.x, tmp2.z) > 0.05) {
      k.heading += turn(k.heading, Math.atan2(tmp2.x, tmp2.z)) * (1 - Math.exp(-dt * 9))
    }
    if (w.lift !== undefined && !drone) k.lift += (Math.min(w.lift, 0.3) - k.lift) * (1 - Math.exp(-dt * 5))
    return
  }
  k.moving *= 0.8
  k.speed = 0
  if (w.face !== undefined && !drone) {
    const d = turn(k.heading, w.face)
    k.heading += d * (1 - Math.exp(-dt * 10))
    if (Math.abs(d) > 0.06) return
  }
  if (w.lift !== undefined && !drone) {
    const d = w.lift - k.lift
    k.lift += Math.sign(d) * Math.min(Math.abs(d), 4.5 * dt)
    if (Math.abs(d) > 0.01) return
  }
  const result = w.arrive?.()
  if (result === false) return
  if (k.route[0] === w) k.route.shift()
}

function armStep(sim: Sim, lab: Lab, dt: number) {
  const arm = sim.arm
  const want = lab.selected
  const grip = (p: Part) => tmp2.set(0, 0.62 + p.size.y / 2, 0)
  const freeSlot = () => {
    const at = sim.slots.findIndex((s) => !s)
    if (at >= 0) return at
    sim.slots.push(null)
    return sim.slots.length - 1
  }
  if (!arm.steps.length) {
    const removal = sim.removals[0]
    const head = sim.belt[0]
    if (removal && removal.mode !== 'board') sim.removals.shift()
    else if (removal) {
      sim.removals.shift()
      arm.job = removal
      const at = slotPos(removal.slot).add(grip(removal))
      arm.steps = [
        { to: at.clone().setY(at.y + 1.4) },
        {
          to: at,
          arrive: () => {
            if (want.has(removal.item.ref) || removal.mode !== 'board') return false
            sim.slots[removal.slot] = null
            removal.slot = -1
            removal.mode = 'held'
            arm.holding = removal
          },
        },
        { to: at.clone().setY(at.y + 1.8) },
        {
          to: TOSS,
          arrive: () => {
            arm.holding = null
            toOutbox(sim, removal)
          },
        },
      ]
    } else if (head && !head.fly && head.beltX >= BELT.end - 0.01) {
      const pick = new Vector3(BELT.end, BELT.y + head.size.y / 2, BELT.z).add(grip(head))
      arm.steps = [
        { to: pick.clone().setY(pick.y + 1.2) },
        {
          to: pick,
          arrive: () => {
            if (sim.belt[0] !== head) return false
            sim.belt.shift()
            head.mode = 'held'
            arm.holding = head
            if (!want.has(head.item.ref)) {
              arm.steps.push({ to: pick.clone().setY(pick.y + 2) }, { to: TOSS, arrive: () => { arm.holding = null; toOutbox(sim, head) } })
              return
            }
            const slot = freeSlot()
            head.slot = slot
            sim.slots[slot] = head
            const at = slotPos(slot).add(grip(head))
            arm.steps.push({ to: pick.clone().setY(pick.y + 2) }, { to: at.clone().setY(at.y + 1.5) }, {
              to: at,
              arrive: () => {
                arm.holding = null
                if (!want.has(head.item.ref)) {
                  sim.slots[slot] = null
                  head.slot = -1
                  toOutbox(sim, head)
                  return
                }
                head.mode = 'board'
                head.seatedAt = sim.time
                sim.pulses.push({ slot, t: 0 })
                if (sim.agent) sim.welder.welds.push(slotPos(slot))
              },
            }, { to: at.clone().setY(at.y + 1.3) })
          },
        },
      ]
    }
  }
  const target = arm.steps[0]?.to ?? REST
  const rush = 1 + Math.min(1.2, (sim.belt.length + sim.removals.length) * 0.18)
  tmp.copy(target).sub(arm.pos)
  const dist = tmp.length()
  const move = Math.min(dist * (1 - Math.exp(-dt * 11 * rush)), 18 * rush * dt)
  if (dist > 1e-5) arm.pos.addScaledVector(tmp, move / dist)
  if (arm.steps.length && arm.pos.distanceTo(target) < 0.05) {
    const s = arm.steps[0]
    if (s.arrive?.() === false) arm.steps = []
    else arm.steps.shift()
    if (!arm.steps.length) arm.job = null
  }
  arm.grip += ((arm.holding ? 1 : 0) - arm.grip) * (1 - Math.exp(-dt * 14))
  if (arm.holding) arm.holding.pos.copy(arm.pos).sub(grip(arm.holding))
}

/** Where the camera should be while following, or null to rest on the base pose. */
export function followPose(sim: Sim): Pose | null {
  if (!sim.follow.on) return null
  if (sim.ship.t >= 0) return { target: new Vector3(DOCK.x - 0.5, 1.6, DOCK.z - 0.5), size: 6.2, az: 0.42, el: 0.34, fov: 34 }
  const ref = sim.follow.ref
  if (!ref || sim.time - sim.follow.since < 1.3) return null
  const p = sim.parts.get(ref)
  if (!p || (!sim.want.has(ref) && !p.picker)) {
    sim.follow.ref = null
    return null
  }
  if (p.mode === 'board' && !p.fly && sim.time - p.seatedAt > 1.8) {
    sim.follow.ref = null
    return null
  }
  if (p.mode === 'rack' && !p.fly) {
    sim.follow.ref = null
    return null
  }
  const journeys: Vector3[] = []
  for (const q of sim.active) {
    if (q.mode === 'queued' || q.mode === 'assigned' || q.mode === 'carry' || q.mode === 'belt' || q.mode === 'held')
      journeys.push(q.mode === 'assigned' && q.picker ? q.picker.pos : q.pos)
  }
  const picker = p.picker
  const at = p.mode === 'assigned' && picker ? picker.pos : p.pos
  if (journeys.length > 2) {
    const center = new Vector3()
    for (const j of journeys) center.add(j)
    center.divideScalar(journeys.length).lerp(at, 0.35)
    let spread = 0
    for (const j of journeys) spread = Math.max(spread, Math.hypot(j.x - center.x, j.z - center.z))
    return { target: center.setY(1.2), size: clamp(spread * 0.62 + 4, 7, 40), az: 0.62, el: 0.5, fov: 28 }
  }
  if (p.mode === 'queued' || (p.mode === 'assigned' && !picker)) return { target: p.home.clone(), size: 3.2, az: 1.2, el: 0.32, fov: 40 }
  if ((p.mode === 'assigned' || p.mode === 'carry' || p.mode === 'back') && picker) {
    const near = picker.moving < 0.25
    const east = Math.sin(picker.heading)
    const side = picker.pos.z < -0.3 ? 0.78 : picker.pos.z < 5.5 && Math.abs(east) > 0.5 ? (east > 0 ? -0.7 : 0.7) : 0.56
    return {
      target: new Vector3(at.x, sim.kind === 'drone' ? at.y - 1 : 1.2, at.z),
      size: near ? 3.4 : 4.8,
      az: near && p.mode !== 'carry' ? 1.25 : side,
      el: near ? 0.34 : 0.5,
      fov: 50,
    }
  }
  return { target: new Vector3(Math.min(at.x, 9), 1, OZ), size: 5.4, az: 0.56, el: 0.5, fov: 36 }
}
