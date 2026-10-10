/**
 * The line's state: parts, belt, two-link arm, drone, board feed, drawers,
 * chip bumps, power and every idle loop the scene animates. Scene objects
 * only copy from here, so `isBusy` alone says whether a frame would draw
 * anything new and the frameloop can stop when it would not.
 */
import { Vector3 } from 'three'

import type { CatalogItem, Setup } from '../../../../../workspace/-workspace/workspace.types'
import type { Lab } from '../../../lab.types'
import {
  BAND_DEPTH, BANDS, BELT, BOARD, CHIP_KEYS, CUBE, DRAWER, MEZZANINE, MOTION, PAGE_RECT, PASSIVES, REDUCED_MOTION, TABLE_Y, TILE,
  bandOf, bandZ, clamp, damp,
} from './contract'
import type { BoardFeed, Chip, ChipKey, Energy, Slot } from './contract'
import type { Dimmer, PowerUp } from './power'

export type Mode = 'home' | 'queued' | 'belt' | 'held' | 'board' | 'toss'
type Fly = { from: Vector3; to: Vector3; t: number; dur: number; h: number; then: Mode; s0: number; s1: number }
export type Part = {
  item: CatalogItem
  cat: number
  code: string
  order: number
  size: [number, number, number]
  pos: Vector3
  scale: number
  spin: number
  mode: Mode
  fly: Fly | null
  beltX: number
  slot: Slot | null
  visible: boolean
  onPage: boolean
  pad: number
  live: boolean
  lit: number
  seatedAt: number
}
type Step = { to: Vector3; arrive?: () => boolean | void }

/** What the sim just did, for sound and announcements. The frame loop drains it every frame. `job` is the arm or drone setting off; `probe` is the weld flash starting. */
export type SimEvent = { kind: 'pick' | 'seat' | 'return' | 'probe' | 'job'; part: Part }

export type Sim = {
  parts: Map<string, Part>
  list: Part[]
  feed: Part[]
  belt: Part[]
  removals: Part[]
  arm: { pos: Vector3; steps: Step[]; holding: Part | null; grip: number; job: Part | null }
  /** `blend` runs 0 at the weld hover point to 1 on the idle hover path, so the drone rests the moment idle loops stop. */
  drone: { pos: Vector3; path: Vector3; weldAt: Vector3; blend: number; welds: { at: Vector3; part: Part }[]; weldT: number; show: number; sparkUntil: number }
  board: BoardFeed
  /** The selection as of the current step. Arm steps read it, never a captured `lab`, so a part cleared mid-flight never seats. */
  wanted: ReadonlySet<string>
  agent: Setup['agent']
  seen: ReadonlySet<string> | null
  seenLab: Lab | null
  time: number
  /** Clock for idle loops (belt slats, drone hover, beacons, dust, breathing CPU); it only runs inside the idle window. */
  idleTime: number
  /** When something last happened; idle loops stop IDLE_AFTER seconds later and wake on the next event. */
  lastActivity: number
  live: Set<Part>
  liveVersion: number
  latest: Part | null
  addSeq: number
  seat: { part: Part; t: number } | null
  air: number
  /** The cleanroom technician's glance toward the air shower, 0..1. */
  airLook: number
  beltOffset: number
  /** The rail's aisle, whose drawer slides out. */
  active: number
  drawers: number[]
  /** Setup chip lift after a swap, 0..1, or -1 at rest. */
  bumps: Record<ChipKey, number>
  energy: Energy
  power: PowerUp
  dimmer: Dimmer
  events: SimEvent[]
}

export const IDLE_AFTER = 4
const TOSS = new Vector3(2.4, 4.4, 0.2)
export const REST = new Vector3(2.6, 3.6, 0.6)
const DRAWER_OPEN = 0.75

export function slotPos(slot: Slot, h: number, out = new Vector3()) {
  return out.set(slot.x, BOARD.y + (h * slot.s) / 2, slot.z)
}
export function drawerPos(cat: number, out = new Vector3()) {
  const col = cat % 3, row = Math.floor(cat / 3)
  return out.set(DRAWER.x0 + col * DRAWER.gapX, DRAWER.base + (5 - row) * DRAWER.gapY + DRAWER.h / 2, DRAWER.front)
}
/** The pick table lays a page out in rows of this many pads; keyboard arrows walk the same grid. */
export const PAD_COLS = 5
export function padPos(index: number, out = new Vector3()) {
  return out.set(-9.7 + (index % PAD_COLS) * 1.2, TABLE_Y, 0.55 + Math.floor(index / PAD_COLS) * 0.95)
}
function homeOf(p: Part, out: Vector3) {
  if (p.onPage) return padPos(p.pad, out).setY(TABLE_Y + p.size[1] / 2)
  return drawerPos(p.cat, out).setZ(DRAWER.front + 0.1)
}
function startFly(p: Part, to: Vector3, dur: number, h: number, then: Mode, delay = 0, s1 = 1) {
  p.fly = { from: p.pos.clone(), to: to.clone(), t: -delay, dur: dur * MOTION, h, then, s0: p.scale, s1 }
}
function hover(t: number, out: Vector3) {
  if (REDUCED_MOTION) return out.set(10.6, 3.5, -0.3)
  return out.set(10.6 + Math.sin(t * 0.6) * 2.6, 3.5 + Math.sin(t * 2.1) * 0.15, -0.3 + Math.cos(t * 0.45) * 2.2)
}

/** Blocks pack into their page band, shrinking to fit; components become passives, features a mezzanine. */
export function layoutBoard(parts: readonly Part[]): Map<string, Slot> {
  const out = new Map<string, Slot>()
  const bands: Part[][] = BANDS.map(() => [])
  const passives: Part[] = []
  const mezz: Part[] = []
  for (const p of [...parts].sort((a, b) => a.order - b.order)) {
    if (p.item.kind === 'component') passives.push(p)
    else if (p.item.kind === 'feature') mezz.push(p)
    else bands[bandOf(p.item.category)].push(p)
  }
  const W = PAGE_RECT.x1 - PAGE_RECT.x0 - 0.3
  const unit = TILE[0] + 0.36
  bands.forEach((list, b) => {
    if (!list.length) return
    const one = Math.min(1, W / (list.length * unit))
    const rows = one < 0.6 ? 2 : 1
    const perRow = Math.ceil(list.length / rows)
    const s = rows === 1 ? one : Math.min(W / (perRow * unit), (BAND_DEPTH - 0.12) / (2 * TILE[2] + 0.08))
    const depth = TILE[2] * s + 0.08
    list.forEach((p, i) => {
      const r = Math.floor(i / perRow), k = i % perRow
      const z = rows === 1 ? bandZ(b) + BAND_DEPTH / 2 : bandZ(b) + 0.06 + (r + 0.5) * depth
      out.set(p.item.ref, { x: PAGE_RECT.x0 + 0.22 + (k + 0.5) * unit * s, z, s, band: b })
    })
  })
  const ps = 0.42
  passives.forEach((p, i) => out.set(p.item.ref, { x: PASSIVES.x0 + 0.35 + (i % 4) * 0.6, z: PASSIVES.z0 + 0.4 + Math.floor(i / 4) * 0.5, s: ps, band: -1 }))
  mezz.forEach((p, i) => out.set(p.item.ref, { x: MEZZANINE.x - 0.8 + (i % 3) * 0.8, z: MEZZANINE.z, s: 0.8, band: -2 }))
  return out
}

export function createSim(lab: Lab, energy: Energy, power: PowerUp): Sim {
  const aisleIndex = new Map(lab.warehouse.aisles.map((a, i) => [a.id, i]))
  const list: Part[] = lab.catalog.items.map((item, order) => {
    const cat = aisleIndex.get(item.category) ?? 0
    return {
      item, cat, code: lab.warehouse.bins.get(item.ref)?.code ?? '', order,
      size: item.kind === 'block' ? TILE : CUBE,
      pos: drawerPos(cat), scale: 0.2, spin: 0, mode: 'home', fly: null, beltX: 0, slot: null, visible: false,
      onPage: false, pad: 0, live: false, lit: 0, seatedAt: -99,
    }
  })
  const start = hover(0, new Vector3())
  const sim: Sim = {
    parts: new Map(list.map((p) => [p.item.ref, p])), list, feed: [], belt: [], removals: [],
    arm: { pos: REST.clone(), steps: [], holding: null, grip: 0, job: null },
    drone: { pos: start.clone(), path: start, weldAt: start.clone(), blend: 1, welds: [], weldT: 0, show: lab.setup.agent === 'none' ? 0 : 1, sparkUntil: 0 },
    board: { version: 0, chips: [], pulses: [], activeBand: -1 },
    wanted: lab.selected, agent: lab.setup.agent, seen: null, seenLab: null,
    time: 0, idleTime: 0, lastActivity: 0, live: new Set(), liveVersion: 0, latest: null, addSeq: 0, seat: null, air: 0, airLook: 0, beltOffset: 0,
    active: -1, drawers: lab.warehouse.aisles.map(() => 0),
    bumps: { framework: -1, database: -1, packageManager: -1, agent: -1 },
    energy, power, dimmer: { t: 0, active: false, swapped: false }, events: [],
  }
  for (const ref of lab.setup.items) {
    const p = sim.parts.get(ref)
    if (!p) continue
    p.mode = 'board'
    p.scale = 1
    p.visible = true
    p.lit = 1
  }
  relayout(sim)
  for (const p of list) {
    if (p.mode !== 'board' || !p.slot) continue
    slotPos(p.slot, p.size[1], p.pos)
    p.scale = p.slot.s
  }
  return sim
}

function relayout(sim: Sim) {
  const wanted = sim.list.filter((p) => sim.wanted.has(p.item.ref))
  const slots = layoutBoard(wanted)
  for (const p of sim.list) {
    const next = slots.get(p.item.ref)
    if (next) {
      if (p.slot) Object.assign(p.slot, next)
      else p.slot = next
    } else if (p.mode !== 'held' && p.mode !== 'board') p.slot = null
  }
  const chips: Chip[] = []
  for (const p of wanted) if (p.slot) chips.push({ ref: p.item.ref, item: p.item, slot: p.slot, size: p.size, lit: p.lit, seatedAt: p.seatedAt })
  sim.board.chips = chips
  sim.board.version++
  sim.seen = sim.wanted
}

export function applyPage(sim: Sim, parts: readonly Part[]) {
  for (const p of sim.list) if (p.onPage) p.onPage = false
  parts.forEach((p, i) => {
    p.onPage = true
    p.pad = i
  })
}

/** Marks activity so idle loops run again and the frameloop wakes. */
export const wake = (sim: Sim) => {
  sim.lastActivity = sim.time
}

/** Whether idle loops (belt slats, drone hover, beacons, dust, CPU breathing) run now. */
export const idleLoops = (sim: Sim) => !REDUCED_MOTION && sim.time - sim.lastActivity < IDLE_AFTER

export function inJourney(p: Part | null) {
  if (!p) return false
  return p.mode === 'queued' || p.mode === 'belt' || p.mode === 'held' || (!!p.fly && p.fly.then === 'belt')
}

export function bump(sim: Sim, key: ChipKey) {
  sim.bumps[key] = 0
  wake(sim)
}

const tmp = new Vector3()
const tmp2 = new Vector3()
const SNAP = 1e-6

/**
 * True while any frame would differ from the last: parts in flight or
 * settling, the arm or drone away from rest, welds and sparks, pulses,
 * power and dimmer, drawers and chip bumps, or an idle loop in its window.
 */
export function isBusy(sim: Sim): boolean {
  if (sim.feed.length || sim.belt.length || sim.removals.length || sim.arm.steps.length || sim.arm.holding || sim.board.pulses.length) return true
  if (sim.power.active || sim.dimmer.active || sim.energy.all < 1) return true
  if (sim.arm.pos.distanceToSquared(REST) > SNAP || sim.arm.grip > 0) return true
  const d = sim.drone
  if (d.welds.length || sim.time < d.sparkUntil || d.blend !== 1 || d.show !== (sim.agent === 'none' ? 0 : 1)) return true
  if (sim.air > 0 || sim.airLook > 0) return true
  for (const p of sim.live) {
    if (p.fly || (p.mode !== 'home' && p.mode !== 'board')) return true
    if (p.mode === 'board') {
      if (p.lit < 1 || !p.slot || p.scale !== p.slot.s || p.pos.distanceToSquared(slotPos(p.slot, p.size[1], tmp)) > SNAP) return true
    } else if (p.pos.distanceToSquared(homeOf(p, tmp)) > SNAP) return true
  }
  for (let k = 0; k < sim.drawers.length; k++) if (sim.drawers[k] !== (k === sim.active ? DRAWER_OPEN : 0)) return true
  for (const key of CHIP_KEYS) if (sim.bumps[key] >= 0) return true
  return idleLoops(sim)
}

/** Eases `v` toward `want` and lands exactly on it once close, so settled values compare equal. */
const settle = (v: number, want: number, k: number, eps = 1e-3) => (Math.abs(want - v) < eps ? want : v + (want - v) * k)

export function step(sim: Sim, lab: Lab, dt: number) {
  sim.time += dt
  if (lab !== sim.seenLab) {
    sim.seenLab = lab
    wake(sim)
  }
  sim.wanted = lab.selected
  sim.agent = lab.setup.agent
  if (sim.wanted !== sim.seen) relayout(sim)
  if (idleLoops(sim)) sim.idleTime += dt
  const wanted = sim.wanted
  const grip = (p: Part) => tmp2.set(0, 0.62 + (p.size[1] * (p.slot?.s ?? 1)) / 2, 0)

  for (const p of sim.list) {
    const want = wanted.has(p.item.ref)
    if (want && p.mode === 'home' && !p.fly) {
      p.mode = 'queued'
      sim.feed.push(p)
      sim.latest = p
      sim.addSeq++
      sim.events.push({ kind: 'pick', part: p })
      wake(sim)
    } else if (!want && p.mode === 'queued') {
      p.mode = 'home'
      sim.feed.splice(sim.feed.indexOf(p), 1)
      wake(sim)
    } else if (!want && p.mode === 'belt') {
      sim.belt.splice(sim.belt.indexOf(p), 1)
      p.mode = 'toss'
      startFly(p, homeOf(p, tmp), 0.8, 2.6, 'home', 0, p.onPage ? 1 : 0.2)
      sim.events.push({ kind: 'return', part: p })
      wake(sim)
    } else if (!want && p.mode === 'board' && sim.arm.job !== p && !sim.removals.includes(p)) {
      sim.removals.push(p)
      wake(sim)
    } else if (want && p.mode === 'board' && sim.removals.includes(p)) sim.removals.splice(sim.removals.indexOf(p), 1)
  }

  const moving = sim.energy.belt > 0.5
  const last = sim.belt[sim.belt.length - 1]
  if (moving && sim.feed.length && (!last || last.beltX > BELT.start + BELT.gap)) {
    const p = sim.feed.shift()!
    p.mode = 'belt'
    p.beltX = BELT.start
    p.visible = true
    sim.belt.push(p)
    startFly(p, tmp.set(BELT.start, BELT.y + p.size[1] / 2, BELT.z), 0.5, 1.6, 'belt', 0, 1)
  }

  sim.air = Math.max(0, sim.air - dt)
  sim.belt.forEach((p, i) => {
    if (p.fly) return
    const limit = i === 0 ? BELT.end : sim.belt[i - 1].beltX - BELT.gap
    if (moving) p.beltX = Math.max(p.beltX, Math.min(p.beltX + (BELT.speed / MOTION) * dt, limit))
    p.pos.set(p.beltX, BELT.y + p.size[1] / 2, BELT.z)
    if (p.beltX > -3.6 && p.beltX < -2.6) sim.air = 0.4
  })
  sim.airLook = settle(sim.airLook, sim.air > 0 ? 1 : 0, damp(dt, sim.air > 0 ? 6 : 1.5))
  if (moving && !REDUCED_MOTION && (sim.belt.length || sim.feed.length || idleLoops(sim))) sim.beltOffset = (sim.beltOffset + dt * BELT.speed * sim.energy.belt) % 1000

  const arm = sim.arm
  if (!arm.steps.length && sim.energy.machines > 0.5) {
    const removal = sim.removals[0]
    const head = sim.belt[0]
    if (removal && removal.mode !== 'board') sim.removals.shift()
    else if (removal) {
      sim.removals.shift()
      arm.job = removal
      sim.events.push({ kind: 'job', part: removal })
      const at = slotPos(removal.slot!, removal.size[1]).add(grip(removal))
      arm.steps = [
        { to: at.clone().setY(at.y + 1.4) },
        {
          to: at,
          arrive: () => {
            if (sim.wanted.has(removal.item.ref) || removal.mode !== 'board') return false
            removal.mode = 'held'
            removal.lit = 0
            arm.holding = removal
          },
        },
        { to: at.clone().setY(at.y + 1.8) },
        {
          to: TOSS,
          arrive: () => {
            arm.holding = null
            removal.slot = null
            removal.mode = 'toss'
            startFly(removal, homeOf(removal, tmp), 1.05, 3.6, 'home', 0, removal.onPage ? 1 : 0.2)
            sim.events.push({ kind: 'return', part: removal })
          },
        },
      ]
    } else if (head && !head.fly && head.beltX >= BELT.end - 0.01 && head.slot) {
      const pick = new Vector3(BELT.end, BELT.y + head.size[1] / 2, BELT.z).add(grip(head))
      const at = slotPos(head.slot, head.size[1]).add(grip(head))
      arm.job = head
      sim.events.push({ kind: 'job', part: head })
      arm.steps = [
        { to: pick.clone().setY(pick.y + 1.2) },
        {
          to: pick,
          arrive: () => {
            if (sim.belt[0] !== head) return false
            sim.belt.shift()
            head.mode = 'held'
            arm.holding = head
          },
        },
        { to: pick.clone().setY(pick.y + 2) },
        { to: at.clone().setY(at.y + 1.5) },
        {
          to: at,
          arrive: () => {
            arm.holding = null
            if (!sim.wanted.has(head.item.ref) || !head.slot) {
              head.slot = null
              head.mode = 'toss'
              startFly(head, homeOf(head, tmp), 1.05, 3.6, 'home', 0, head.onPage ? 1 : 0.2)
              sim.events.push({ kind: 'return', part: head })
              return
            }
            head.mode = 'board'
            head.seatedAt = sim.time
            sim.seat = { part: head, t: sim.time }
            sim.board.pulses.push({ ref: head.item.ref, t: 0 })
            sim.events.push({ kind: 'seat', part: head })
            if (sim.agent !== 'none') {
              if (!sim.drone.welds.length) sim.events.push({ kind: 'job', part: head })
              sim.drone.welds.push({ at: slotPos(head.slot, head.size[1]), part: head })
            }
            wake(sim)
          },
        },
        { to: at.clone().setY(at.y + 1.3) },
      ]
    }
  }
  const target = arm.steps[0]?.to ?? REST
  const rush = (1 + Math.min(1.2, (sim.belt.length + sim.removals.length + sim.feed.length) * 0.18)) / MOTION
  tmp.copy(target).sub(arm.pos)
  const dist = tmp.length()
  const move = Math.min(dist * damp(dt, 11 * rush), 18 * rush * dt)
  if (dist > 1e-5) arm.pos.addScaledVector(tmp, move / dist)
  if (dist < 0.005 && !arm.steps.length) arm.pos.copy(REST)
  if (arm.steps.length && arm.pos.distanceTo(target) < 0.05) {
    const s = arm.steps.shift()!
    if (s.arrive?.() === false) arm.steps = []
    if (!arm.steps.length) arm.job = null
  }
  arm.grip = settle(arm.grip, arm.holding ? 1 : 0, damp(dt, 14), 0.005)
  if (arm.holding) {
    arm.holding.pos.copy(arm.pos).sub(grip(arm.holding))
    const s1 = arm.holding.slot && sim.wanted.has(arm.holding.item.ref) ? arm.holding.slot.s : 1
    arm.holding.scale += (s1 - arm.holding.scale) * damp(dt, 6)
  }

  let litChanged = false
  for (const p of sim.list) {
    if (p.fly) {
      const f = p.fly
      f.t += dt / f.dur
      const t = clamp(f.t, 0, 1)
      if (f.t >= 0) {
        p.visible = true
        p.pos.lerpVectors(f.from, f.to, t)
        p.pos.y += f.h * 4 * t * (1 - t)
        p.scale = f.s0 + (f.s1 - f.s0) * t
        if (p.mode === 'toss') p.spin = t * Math.PI * 4
      }
      if (f.t >= 1) {
        p.fly = null
        p.spin = 0
        if (f.then === 'home' && p.mode === 'toss') p.mode = 'home'
      }
    } else if (p.mode === 'home' || p.mode === 'queued') {
      homeOf(p, tmp)
      if (p.pos.distanceTo(tmp) > 0.4) {
        const into = !p.onPage
        startFly(p, tmp, 0.5, into ? 0.6 : 1.3, p.mode, into ? 0 : (0.08 + p.pad * 0.035) * MOTION, into ? 0.2 : 1)
        if (!into) p.scale = Math.max(p.scale, 0.2)
      } else {
        p.pos.lerp(tmp, damp(dt, 12))
        if (p.pos.distanceToSquared(tmp) < SNAP) p.pos.copy(tmp)
        if (p.mode === 'queued' && !REDUCED_MOTION) p.pos.y += Math.abs(Math.sin(sim.time * 9 + p.pad)) * 0.18
        p.visible = p.onPage || p.mode === 'queued'
        p.scale = p.visible ? 1 : 0.2
      }
    } else if (p.mode === 'board' && p.slot) {
      slotPos(p.slot, p.size[1], tmp)
      p.pos.lerp(tmp, damp(dt, 16))
      if (p.pos.distanceToSquared(tmp) < SNAP) p.pos.copy(tmp)
      p.scale = settle(p.scale, p.slot.s, damp(dt, 10))
      p.visible = true
      if (p.lit < 1) {
        p.lit = Math.min(1, p.lit + dt / (0.9 * MOTION))
        litChanged = true
      }
    }
    const live = p.onPage || p.mode !== 'home' || !!p.fly
    if (live !== p.live) {
      p.live = live
      if (live) sim.live.add(p)
      else sim.live.delete(p)
      sim.liveVersion++
    }
  }
  if (litChanged) for (const chip of sim.board.chips) chip.lit = sim.parts.get(chip.ref)?.lit ?? 0

  const pulses = sim.board.pulses
  for (const pulse of pulses) pulse.t += dt / (0.7 * MOTION)
  if (pulses.length && pulses[0].t >= 1) sim.board.pulses = pulses.filter((pulse) => pulse.t < 1)

  const ease = damp(dt, 10 / MOTION)
  for (let k = 0; k < sim.drawers.length; k++) sim.drawers[k] = settle(sim.drawers[k], k === sim.active ? DRAWER_OPEN : 0, ease)
  for (const key of CHIP_KEYS) {
    const b = sim.bumps[key]
    if (b >= 0) sim.bumps[key] = b + dt / (0.5 * MOTION) >= 1 ? -1 : b + dt / (0.5 * MOTION)
  }

  const drone = sim.drone
  drone.show = settle(drone.show, sim.agent === 'none' ? 0 : 1, damp(dt, 6))
  if (sim.agent === 'none') drone.welds.length = 0
  const weld = drone.welds[0]
  if (weld) drone.weldAt.copy(weld.at).setY(weld.at.y + 1.25)
  hover(sim.idleTime, drone.path)
  drone.blend = weld ? settle(drone.blend, 0, damp(dt, 5 / MOTION), 0.002) : settle(drone.blend, 1, damp(dt, 1.6 / MOTION), 0.002)
  drone.pos.lerpVectors(drone.weldAt, drone.path, drone.blend)
  if (weld && drone.blend < 0.08) {
    if (drone.weldT === 0) sim.events.push({ kind: 'probe', part: weld.part })
    drone.weldT += dt
    drone.sparkUntil = sim.time + 0.75
    if (drone.weldT > 0.9 * MOTION) {
      drone.welds.shift()
      drone.weldT = 0
    }
  }
}

export const matchItem = (item: CatalogItem, query: string) => {
  const q = query.trim().toLowerCase()
  return !q || item.title.toLowerCase().includes(q) || item.label.toLowerCase().includes(q) || item.ref.toLowerCase().includes(q)
}
