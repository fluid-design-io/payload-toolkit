import { Vector3 } from 'three'

import type { Agent, CatalogItem } from '../../../../workspace/-workspace/workspace.types'
import { prefersReducedMotion } from '../../kit/a11y'
import type { Lab } from '../../lab.types'

export const TABLE_Y = 0.9
export const BELT = { start: -3.7, end: 1.7, z: 1.6, y: 0.9, speed: 3.4, gap: 1.2 }
export const BASE = { x: 4.2, z: -1.4 }
export const ARM = { h0: 1.9, l1: 5.6, l2: 5.4 }
export const BOARD = { x0: 5.2, x1: 13.95, z0: -3.75, z1: 3.15, y: 0.45 }
export const CHIPS = { framework: new Vector3(8.35, 0, -0.3), database: new Vector3(10.85, 0, -0.3) }
export const CHIP = 1.7
export const DRAWER = { w: 2.0, h: 0.5, d: 2.0, gapX: 2.1, gapY: 0.6, x0: -9.4, base: 0.75, front: -1.0 }
export const TABLE = { x0: -10.55, x1: -4.05, z0: -0.1, z1: 4.6 }
/** Pick-table pads per bay and per row. */
export const PAGE = 20
export const PAD_COLS = 5
const TOSS = new Vector3(2.4, 4.4, 0.2)
const REST = new Vector3(2.6, 3.6, 0.6)
/** Reduced motion: flights at half length and no idle bobbing. */
export const REDUCED = prefersReducedMotion()
const PACE = REDUCED ? 0.5 : 1

export type Mode = 'home' | 'queued' | 'belt' | 'held' | 'board' | 'toss'
/** How an agent fixed the part to the board: Claude leaves solder beads, Codex a laser etch. */
export type Bond = 'none' | 'bead' | 'etch'
type Fly = { from: Vector3; to: Vector3; t: number; dur: number; h: number; then: Mode; s0: number; s1: number }
export type Part = {
  item: CatalogItem
  cat: number
  code: string
  size: [number, number, number]
  pos: Vector3
  scale: number
  spin: number
  mode: Mode
  fly: Fly | null
  beltX: number
  slot: number
  visible: boolean
  onPage: boolean
  pad: number
  live: boolean
  bond: Bond
}
/** `arrive` reads the lab of the frame it fires in, never the one the step was planned in. */
type Step = { to: Vector3; arrive?: (lab: Lab) => boolean | void }
export type Job = { part: Part }
/** What the line did this frame, for sound and the live region. The entry drains it. */
export type SimEvent = { kind: 'queue' | 'servo' | 'seat' | 'toss' | 'chirp' | 'zap'; part: Part }
export type Sim = {
  parts: Map<string, Part>
  list: Part[]
  feed: Part[]
  belt: Part[]
  removals: Part[]
  slots: (Part | null)[]
  arm: { pos: Vector3; steps: Step[]; holding: Part | null; grip: number; job: Part | null; busy: number }
  agent: { kind: Agent; show: number; pos: Vector3; jobs: Job[]; job: Job | null; t: number; work: number; near: boolean }
  pulses: { slot: number; t: number; part: Part }[]
  time: number
  live: Set<Part>
  liveVersion: number
  latest: Part | null
  addSeq: number
  seat: { part: Part; t: number } | null
  air: number
  /** Seat events since mount; the harness reads it to prove a removed part never seats. */
  seats: number
  /** True while anything on the line is still moving toward where it belongs. */
  moving: boolean
  events: SimEvent[]
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))

export const SLOTS = (() => {
  const out: { x: number; z: number; i: number; j: number }[] = []
  for (let i = 0; i < 7; i++)
    for (let j = 0; j < 7; j++) {
      if (i >= 1 && i <= 5 && j >= 2 && j <= 4) continue
      out.push({ x: 5.85 + i * 1.25, z: -3.15 + j * 0.95, i, j })
    }
  return out.sort((a, b) => Math.hypot(a.x - 9.6, (a.z + 0.3) * 1.3) - Math.hypot(b.x - 9.6, (b.z + 0.3) * 1.3))
})()

export const TRACES = SLOTS.map((s) => {
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
export const TRACE_LEN = TRACES.map((path) => path.slice(1).reduce((sum, p, k) => sum + p.distanceTo(path[k]), 0))

export function slotPos(slot: number, h: number, out = new Vector3()) {
  const s = SLOTS[slot % SLOTS.length]
  return out.set(s.x, BOARD.y + h / 2 + Math.floor(slot / SLOTS.length) * 0.16, s.z)
}
export function drawerPos(cat: number, out = new Vector3()) {
  const col = cat % 3, row = Math.floor(cat / 3)
  return out.set(DRAWER.x0 + col * DRAWER.gapX, DRAWER.base + (5 - row) * DRAWER.gapY + DRAWER.h / 2, DRAWER.front)
}
export function padPos(index: number, out = new Vector3()) {
  return out.set(-9.7 + (index % PAD_COLS) * 1.2, TABLE_Y, 0.55 + Math.floor(index / PAD_COLS) * 0.95)
}
function homeOf(p: Part, out: Vector3) {
  if (p.onPage) return padPos(p.pad, out).setY(TABLE_Y + p.size[1] / 2)
  return drawerPos(p.cat, out).setZ(DRAWER.front + 0.1)
}
function startFly(p: Part, to: Vector3, dur: number, h: number, then: Mode, delay = 0, s1 = 1) {
  p.fly = { from: p.pos.clone(), to: to.clone(), t: -delay, dur: dur * PACE, h, then, s0: p.scale, s1 }
}

export function createSim(lab: Lab): Sim {
  const aisleIndex = new Map(lab.warehouse.aisles.map((a, i) => [a.id, i]))
  const list: Part[] = lab.catalog.items.map((item) => {
    const cat = aisleIndex.get(item.category) ?? 0
    const block = item.kind === 'block'
    return {
      item, cat, code: lab.warehouse.bins.get(item.ref)?.code ?? '',
      size: block ? [0.96, 0.1, 0.72] : [0.56, 0.42, 0.56],
      pos: drawerPos(cat), scale: 0.2, spin: 0, mode: 'home', fly: null, beltX: 0, slot: -1, visible: false,
      onPage: false, pad: 0, live: false, bond: 'none',
    }
  })
  const sim: Sim = {
    parts: new Map(list.map((p) => [p.item.ref, p])), list, feed: [], belt: [], removals: [], slots: [],
    arm: { pos: REST.clone(), steps: [], holding: null, grip: 0, job: null, busy: 0 },
    agent: { kind: lab.setup.agent, show: lab.setup.agent === 'none' ? 0 : 1, pos: new Vector3(9.6, 3.4, 0), jobs: [], job: null, t: 0, work: 0, near: false },
    pulses: [], time: 0, live: new Set(), liveVersion: 0, latest: null, addSeq: 0, seat: null, air: 0, seats: 0, moving: true, events: [],
  }
  for (const ref of lab.setup.items) {
    const p = sim.parts.get(ref)
    if (!p) continue
    p.slot = sim.slots.length
    sim.slots.push(p)
    p.mode = 'board'
    p.scale = 1
    p.visible = true
    p.bond = lab.setup.agent === 'claude' ? 'bead' : lab.setup.agent === 'codex' ? 'etch' : 'none'
    slotPos(p.slot, p.size[1], p.pos)
  }
  return sim
}

export function applyPage(sim: Sim, parts: readonly Part[]) {
  for (const p of sim.list) if (p.onPage) p.onPage = false
  parts.forEach((p, i) => {
    p.onPage = true
    p.pad = i
  })
}

export function inJourney(p: Part | null) {
  if (!p) return false
  return p.mode === 'queued' || p.mode === 'belt' || p.mode === 'held' || (!!p.fly && p.fly.then === 'belt')
}

export const matchItem = (item: CatalogItem, query: string) => {
  const q = query.trim().toLowerCase()
  return !q || item.title.toLowerCase().includes(q) || item.label.toLowerCase().includes(q) || item.ref.toLowerCase().includes(q)
}

const tmp = new Vector3()
const tmp2 = new Vector3()

/** Where the agent parks when idle: the drone orbits above the board, the hexapod waits at its corner. */
export function parkPos(kind: Agent, time: number, out: Vector3) {
  if (kind === 'codex') return out.set(BOARD.x1 - 0.9, BOARD.y, BOARD.z1 - 0.8)
  const t = REDUCED ? 0 : time
  return out.set(9.6 + Math.sin(t * 0.6) * 2.6, 3.5 + Math.sin(t * 2.1) * 0.15, -0.3 + Math.cos(t * 0.45) * 2.2)
}

function freeSlot(sim: Sim) {
  const at = sim.slots.indexOf(null)
  if (at >= 0) return at
  sim.slots.push(null)
  return sim.slots.length - 1
}
const grip = (p: Part) => tmp2.set(0, 0.62 + p.size[1] / 2, 0)
function sendHome(sim: Sim, p: Part, dur: number, h: number) {
  p.bond = 'none'
  p.mode = 'toss'
  sim.events.push({ kind: 'toss', part: p })
  startFly(p, homeOf(p, tmp), dur, h, 'home', 0, p.onPage ? 1 : 0.2)
}

function removeJob(sim: Sim, removal: Part): Step[] {
  const arm = sim.arm
  const at = slotPos(removal.slot, removal.size[1]).add(grip(removal))
  return [
    { to: at.clone().setY(at.y + 1.4) },
    {
      to: at,
      arrive: (lab) => {
        if (lab.selected.has(removal.item.ref) || removal.mode !== 'board') return false
        sim.slots[removal.slot] = null
        removal.slot = -1
        removal.mode = 'held'
        removal.bond = 'none'
        arm.holding = removal
      },
    },
    { to: at.clone().setY(at.y + 1.8) },
    {
      to: TOSS,
      arrive: () => {
        arm.holding = null
        sendHome(sim, removal, 1.05, 3.6)
      },
    },
  ]
}

function seatJob(sim: Sim, head: Part): Step[] {
  const arm = sim.arm
  const pick = new Vector3(BELT.end, BELT.y + head.size[1] / 2, BELT.z).add(grip(head))
  return [
    { to: pick.clone().setY(pick.y + 1.2) },
    {
      to: pick,
      arrive: () => {
        if (sim.belt[0] !== head) return false
        sim.belt.shift()
        head.mode = 'held'
        arm.holding = head
        const slot = freeSlot(sim)
        head.slot = slot
        sim.slots[slot] = head
        const at = slotPos(slot, head.size[1]).add(grip(head))
        arm.steps.push({ to: pick.clone().setY(pick.y + 2) }, { to: at.clone().setY(at.y + 1.5) }, {
          to: at,
          arrive: (now) => {
            arm.holding = null
            if (!now.selected.has(head.item.ref)) {
              sim.slots[slot] = null
              head.slot = -1
              sendHome(sim, head, 1.05, 3.6)
              return
            }
            head.mode = 'board'
            sim.seat = { part: head, t: sim.time }
            sim.seats++
            sim.events.push({ kind: 'seat', part: head })
            sim.pulses.push({ slot, t: 0, part: head })
            if (now.setup.agent !== 'none') sim.agent.jobs.push({ part: head })
          },
        }, { to: at.clone().setY(at.y + 1.3) })
      },
    },
  ]
}

export function step(sim: Sim, lab: Lab, dt: number) {
  sim.time += dt
  const wanted = lab.selected
  let moving = false

  for (const p of sim.list) {
    const want = wanted.has(p.item.ref)
    if (want && p.mode === 'home' && !p.fly) {
      p.mode = 'queued'
      sim.feed.push(p)
      sim.latest = p
      sim.addSeq++
      sim.events.push({ kind: 'queue', part: p })
    } else if (!want && p.mode === 'queued') {
      p.mode = 'home'
      sim.feed.splice(sim.feed.indexOf(p), 1)
    } else if (!want && p.mode === 'belt') {
      sim.belt.splice(sim.belt.indexOf(p), 1)
      sendHome(sim, p, 0.8, 2.6)
    } else if (!want && p.mode === 'board' && sim.arm.job !== p && !sim.removals.includes(p)) sim.removals.push(p)
    else if (want && p.mode === 'board' && sim.removals.includes(p)) sim.removals.splice(sim.removals.indexOf(p), 1)
  }

  const last = sim.belt[sim.belt.length - 1]
  if (sim.feed.length && (!last || last.beltX > BELT.start + BELT.gap)) {
    const p = sim.feed.shift()!
    p.mode = 'belt'
    p.beltX = BELT.start
    p.visible = true
    sim.belt.push(p)
    startFly(p, tmp.set(BELT.start, BELT.y + p.size[1] / 2, BELT.z), 0.5, 1.6, 'belt', 0, 1)
  }

  sim.air = Math.max(0, sim.air - dt)
  for (let i = 0; i < sim.belt.length; i++) {
    const p = sim.belt[i]
    if (p.fly) continue
    const limit = i === 0 ? BELT.end : sim.belt[i - 1].beltX - BELT.gap
    p.beltX = Math.max(p.beltX, Math.min(p.beltX + BELT.speed * dt, limit))
    p.pos.set(p.beltX, BELT.y + p.size[1] / 2, BELT.z)
    if (p.beltX > -3.6 && p.beltX < -2.6) sim.air = 0.4
  }

  const arm = sim.arm
  if (!arm.steps.length) {
    const removal = sim.removals[0]
    const head = sim.belt[0]
    if (removal && removal.mode !== 'board') sim.removals.shift()
    else if (removal) {
      sim.removals.shift()
      arm.job = removal
      arm.steps = removeJob(sim, removal)
      sim.events.push({ kind: 'servo', part: removal })
    } else if (head && !head.fly && head.beltX >= BELT.end - 0.01) {
      arm.job = head
      arm.steps = seatJob(sim, head)
      sim.events.push({ kind: 'servo', part: head })
    }
  }
  const target = arm.steps[0]?.to ?? REST
  const rush = 1 + Math.min(1.2, (sim.belt.length + sim.removals.length + sim.feed.length) * 0.18)
  tmp.copy(target).sub(arm.pos)
  const dist = tmp.length()
  const move = Math.min(dist * (1 - Math.exp(-dt * 11 * rush)), 18 * rush * dt)
  if (dist > 1e-5) arm.pos.addScaledVector(tmp, move / dist)
  if (dist > 1e-3) moving = true
  if (arm.steps.length && arm.pos.distanceTo(target) < 0.05) {
    const s = arm.steps.shift()!
    if (s.arrive?.(lab) === false) arm.steps = []
    if (!arm.steps.length) arm.job = null
  }
  arm.grip += ((arm.holding ? 1 : 0) - arm.grip) * (1 - Math.exp(-dt * 14))
  arm.busy += ((arm.steps.length ? 1 : 0) - arm.busy) * (1 - Math.exp(-dt * 6))
  if (Math.abs(arm.busy - (arm.steps.length ? 1 : 0)) > 0.01) moving = true
  if (arm.holding) arm.holding.pos.copy(arm.pos).sub(grip(arm.holding))

  for (const p of sim.list) {
    if (p.fly) {
      moving = true
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
      const away = p.pos.distanceTo(tmp)
      if (away > 0.4) {
        const into = !p.onPage
        startFly(p, tmp, 0.5, into ? 0.6 : 1.3, p.mode, into ? 0 : 0.08 + p.pad * 0.035, into ? 0.2 : 1)
        if (!into) p.scale = Math.max(p.scale, 0.2)
      } else {
        if (away > 1e-3) moving = true
        p.pos.lerp(tmp, 1 - Math.exp(-dt * 12))
        if (p.mode === 'queued') {
          moving = true
          if (!REDUCED) p.pos.y += Math.abs(Math.sin(sim.time * 9 + p.pad)) * 0.18
        }
        p.visible = p.onPage || p.mode === 'queued'
        p.scale = p.visible ? 1 : 0.2
      }
    } else if (p.mode === 'board') {
      slotPos(p.slot, p.size[1], tmp)
      if (p.pos.distanceToSquared(tmp) > 1e-6) moving = true
      p.pos.lerp(tmp, 1 - Math.exp(-dt * 16))
      p.visible = true
      p.scale = 1
    }
    const live = p.onPage || p.mode !== 'home' || !!p.fly
    if (live !== p.live) {
      p.live = live
      if (live) sim.live.add(p)
      else sim.live.delete(p)
      sim.liveVersion++
    }
  }

  let kept = 0
  for (const pulse of sim.pulses) {
    pulse.t += dt / (0.7 * PACE)
    if (pulse.t < 1) sim.pulses[kept++] = pulse
    else sim.events.push({ kind: 'chirp', part: pulse.part })
  }
  sim.pulses.length = kept

  const ag = sim.agent
  ag.kind = lab.setup.agent
  ag.show += ((ag.kind === 'none' ? 0 : 1) - ag.show) * (1 - Math.exp(-dt * 6))
  if (ag.kind === 'none') {
    ag.jobs.length = 0
    ag.job = null
  }
  if (!ag.job && ag.jobs.length) {
    ag.job = ag.jobs.shift()!
    ag.t = 0
  }
  if (ag.job && (ag.job.part.mode !== 'board' || !wanted.has(ag.job.part.item.ref))) ag.job = null
  const job = ag.job
  if (job) {
    slotPos(job.part.slot, job.part.size[1], tmp)
    if (ag.kind === 'codex') tmp.set(tmp.x - job.part.size[0] / 2 - 0.75, BOARD.y, tmp.z + 0.1)
    else tmp.y += 1.25
  } else parkPos(ag.kind, sim.time, tmp)
  if (ag.kind === 'codex') {
    tmp2.copy(tmp).sub(ag.pos)
    const d = tmp2.length()
    const walk = Math.min(d, 2.6 * dt)
    if (d > 1e-4) ag.pos.addScaledVector(tmp2, walk / d)
  } else ag.pos.lerp(tmp, 1 - Math.exp(-dt * (job ? 5 : 1.6)))
  ag.near = !!job && ag.pos.distanceTo(tmp) < 0.25
  if (job || ag.jobs.length || Math.abs(ag.show - (ag.kind === 'none' ? 0 : 1)) > 0.01) moving = true
  if (job && ag.near) {
    if (ag.t === 0) sim.events.push({ kind: 'zap', part: job.part })
    ag.t += dt / ((ag.kind === 'codex' ? 1.3 : 0.9) * PACE)
    ag.work = Math.min(1, ag.t)
    if (ag.t >= 1) {
      job.part.bond = ag.kind === 'codex' ? 'etch' : 'bead'
      ag.job = null
      ag.work = 0
    }
  } else ag.work = 0
  sim.moving = moving || sim.feed.length > 0 || sim.belt.length > 0 || sim.removals.length > 0 || arm.steps.length > 0 || sim.pulses.length > 0
}
