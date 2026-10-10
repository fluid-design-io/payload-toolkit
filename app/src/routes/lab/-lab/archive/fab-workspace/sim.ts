import { Vector3 } from 'three'

import type { CatalogItem } from '../../../../workspace/-workspace/workspace.types'
import type { Lab } from '../../lab.types'
import { BELT, BOARD, REST, SOCKET, TOSS, drawerPos, layoutBoard, padPos, routeOf, sizeOf } from './layout'
import type { Size, Slot } from './layout'

/** home: in a drawer or on a tray pad. queued: picked, waiting for the belt. board: seated. toss: flying back. */
export type Mode = 'home' | 'queued' | 'belt' | 'held' | 'board' | 'toss'
type Fly = { from: Vector3; to: Vector3; t: number; dur: number; h: number; then: Mode; s0: number; s1: number }

export type Part = {
  item: CatalogItem
  aisle: number
  code: string
  size: Size
  pos: Vector3
  scale: number
  spin: number
  mode: Mode
  fly: Fly | null
  beltX: number
  slot: Slot | null
  route: Vector3[] | null
  /** Trace draw progress once seated. */
  drawn: number
  /** The probe's flash on this part, decaying. */
  flash: number
  visible: boolean
  onPage: boolean
  pad: number
  live: boolean
}

type Step = { to: () => Vector3; arrive?: () => boolean | void }

export type Pulse = { route: Vector3[]; t: number; speed: number }
export type DropKey = keyof typeof SOCKET | 'pod'

/** What the sim just did, for sound and announcements. Cleared by whoever reads it. */
export type Event =
  | { kind: 'pick'; part: Part }
  | { kind: 'seat'; part: Part }
  | { kind: 'return'; part: Part }
  | { kind: 'probe'; part: Part }

/** Every animated value lives here, so `isBusy` can tell when a frame would draw nothing new. */
export type Sim = {
  parts: Map<string, Part>
  list: Part[]
  feed: Part[]
  belt: Part[]
  removals: Part[]
  arm: { pos: Vector3; steps: Step[]; holding: Part | null; grip: number; job: Part | null }
  time: number
  live: Set<Part>
  liveVersion: number
  layoutVersion: number
  latest: Part | null
  addSeq: number
  seat: { part: Part; t: number } | null
  probe: { part: Part; t: number } | null
  seen: ReadonlySet<string> | null
  seenAgent: string
  /** The selection as of the current step; arm steps read it so a part cleared mid-flight never seats. */
  wanted: ReadonlySet<string>
  /** The rail's aisle, whose drawer slides open. */
  active: number
  drawers: number[]
  drops: Record<DropKey, number>
  pulses: Pulse[]
  ambient: number
  /** When something last happened; idle loops (belt, ambient pulses) stop a while after it. */
  lastActivity: number
  events: Event[]
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
const tmp = new Vector3()
const tmp2 = new Vector3()
const DRAWER_OPEN = 0.7
const PULSE_CAP = 48
/** Seconds after the last event that the belt keeps turning and ambient pulses keep spawning. */
export const IDLE_AFTER = 5

export function slotPos(p: Part, out = new Vector3()) {
  const s = p.slot ?? { x: BOARD.x0 + 1, z: BOARD.z1 - 1, s: 1, band: -1 }
  return out.set(s.x, BOARD.y + (p.size[1] * s.s) / 2, s.z)
}
function homeOf(p: Part, out: Vector3) {
  if (p.onPage) return padPos(p.pad, out).setY(out.y + p.size[1] / 2)
  return drawerPos(p.aisle, out).setZ(out.z + 0.1)
}
function startFly(p: Part, to: Vector3, dur: number, h: number, then: Mode, delay = 0, s1 = 1) {
  p.fly = { from: p.pos.clone(), to: to.clone(), t: -delay, dur, h, then, s0: p.scale, s1 }
}

export function createSim(lab: Lab): Sim {
  const aisleIndex = new Map(lab.warehouse.aisles.map((a, i) => [a.id, i]))
  const list: Part[] = lab.catalog.items.map((item) => {
    const aisle = aisleIndex.get(item.category) ?? 0
    return {
      item, aisle, code: lab.warehouse.bins.get(item.ref)?.code ?? '', size: sizeOf(item),
      pos: drawerPos(aisle), scale: 0.2, spin: 0, mode: 'home', fly: null, beltX: 0, slot: null, route: null, drawn: 0, flash: 0,
      visible: false, onPage: false, pad: 0, live: false,
    }
  })
  const sim: Sim = {
    parts: new Map(list.map((p) => [p.item.ref, p])), list, feed: [], belt: [], removals: [],
    arm: { pos: REST.clone(), steps: [], holding: null, grip: 0, job: null },
    time: 0, live: new Set(), liveVersion: 0, layoutVersion: 0, latest: null, addSeq: 0, seat: null, probe: null, seen: null, seenAgent: lab.setup.agent,
    wanted: lab.selected, active: -1, drawers: lab.warehouse.aisles.map(() => 0), drops: { cpu: 0, mem: 0, pwr: 0, j1: 0, pod: 0 },
    pulses: [], ambient: 0, lastActivity: 0, events: [],
  }
  relayout(sim, lab)
  for (const ref of lab.setup.items) {
    const p = sim.parts.get(ref)
    if (!p) continue
    p.mode = 'board'
    p.scale = p.slot?.s ?? 1
    p.visible = true
    p.drawn = 1
    slotPos(p, p.pos)
  }
  return sim
}

/** Placements and routes for the current selection, in catalog order so the grid agrees. */
function relayout(sim: Sim, lab: Lab) {
  const items = lab.setup.items.map((ref) => sim.parts.get(ref)?.item).filter((item): item is CatalogItem => !!item)
  const slots = layoutBoard(items)
  const blocks = items.filter((item) => item.kind === 'block' && slots.has(item.ref)).sort((a, b) => slots.get(a.ref)!.z - slots.get(b.ref)!.z)
  const lane = new Map(blocks.map((item, i) => [item.ref, i]))
  for (const p of sim.list) {
    const slot = slots.get(p.item.ref) ?? null
    if (!slot && !p.slot) continue
    p.slot = slot
    p.route = slot ? routeOf(slot, p.size, lane.get(p.item.ref) ?? 0, blocks.length) : null
  }
  sim.seen = lab.selected
  sim.layoutVersion++
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

export const drop = (sim: Sim, key: DropKey) => {
  sim.drops[key] = 1
  wake(sim)
}

export const inJourney = (p: Part | null) => !!p && (p.mode === 'queued' || p.mode === 'belt' || p.mode === 'held' || (!!p.fly && p.fly.then === 'belt'))

/** Whether idle loops (belt slats, ambient pulses) should run now. */
export const idleLoops = (sim: Sim, motion: number) => motion === 1 && sim.time - sim.lastActivity < IDLE_AFTER

/**
 * True while any frame would differ from the last: parts in flight or
 * settling, the arm away from rest, a probe, flashes, drawer or socket
 * motion, pulses, or an idle loop still in its window.
 */
export function isBusy(sim: Sim, motion: number): boolean {
  if (sim.feed.length || sim.belt.length || sim.removals.length || sim.arm.steps.length || sim.arm.holding || sim.probe || sim.pulses.length) return true
  if (sim.arm.pos.distanceTo(REST) > 0.005 || sim.arm.grip > 0.005) return true
  for (const p of sim.live) {
    if (p.fly || p.mode !== 'home' && p.mode !== 'board') return true
    if (p.flash > 0 || p.spin !== 0) return true
    if (p.mode === 'board') {
      if (p.drawn < 1 && p.route) return true
      if (p.pos.distanceToSquared(slotPos(p, tmp)) > 1e-6 || Math.abs((p.slot?.s ?? 1) - p.scale) > 0.002) return true
    } else if (p.pos.distanceToSquared(homeOf(p, tmp)) > 1e-6) return true
  }
  for (let k = 0; k < sim.drawers.length; k++) if (Math.abs(sim.drawers[k] - (k === sim.active ? DRAWER_OPEN : 0)) > 0.002) return true
  for (const key in sim.drops) if (sim.drops[key as DropKey] > 0) return true
  if (idleLoops(sim, motion)) return true
  return false
}

export function step(sim: Sim, lab: Lab, dt: number, motion: number) {
  sim.time += dt
  const wanted = lab.selected
  sim.wanted = wanted
  if (wanted !== sim.seen) relayout(sim, lab)
  if (lab.setup.agent !== sim.seenAgent) {
    sim.seenAgent = lab.setup.agent
    sim.probe = null
  }
  const grip = (p: Part) => tmp2.set(0, 0.62 + (p.size[1] * p.scale) / 2, 0)

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
      startFly(p, homeOf(p, tmp), 0.7 * motion, 2.2, 'home', 0, p.onPage ? 1 : 0.2)
      sim.events.push({ kind: 'return', part: p })
      wake(sim)
    } else if (!want && p.mode === 'board' && sim.arm.job !== p && !sim.removals.includes(p)) {
      sim.removals.push(p)
      wake(sim)
    } else if (want && p.mode === 'board' && sim.removals.includes(p)) sim.removals.splice(sim.removals.indexOf(p), 1)
  }

  while (sim.removals.length > 3) {
    const p = sim.removals.pop()!
    p.mode = 'toss'
    p.drawn = 0
    startFly(p, homeOf(p, tmp), 0.9 * motion, 3.2, 'home', Math.random() * 0.3 * motion, p.onPage ? 1 : 0.2)
    sim.events.push({ kind: 'return', part: p })
  }
  const last = sim.belt[sim.belt.length - 1]
  if (sim.feed.length && (!last || last.beltX > BELT.start + BELT.gap)) {
    const p = sim.feed.shift()!
    p.mode = 'belt'
    p.beltX = BELT.start
    p.visible = true
    sim.belt.push(p)
    startFly(p, tmp.set(BELT.start, BELT.y + p.size[1] / 2, BELT.z), 0.45 * motion, 1.4, 'belt', 0, 1)
  }
  sim.belt.forEach((p, i) => {
    if (p.fly) return
    const limit = i === 0 ? BELT.end : sim.belt[i - 1].beltX - BELT.gap
    p.beltX = Math.max(p.beltX, Math.min(p.beltX + (BELT.speed / motion) * dt, limit))
    p.pos.set(p.beltX, BELT.y + p.size[1] / 2, BELT.z)
  })

  const arm = sim.arm
  if (!arm.steps.length) {
    const removal = sim.removals[0]
    const head = sim.belt[0]
    if (removal && removal.mode !== 'board') sim.removals.shift()
    else if (removal) {
      sim.removals.shift()
      arm.job = removal
      const at = () => slotPos(removal, tmp).add(grip(removal)).clone()
      arm.steps = [
        { to: () => at().setY(at().y + 1.2) },
        {
          to: at,
          arrive: () => {
            if (sim.wanted.has(removal.item.ref) || removal.mode !== 'board') return false
            removal.mode = 'held'
            removal.drawn = 0
            arm.holding = removal
          },
        },
        { to: () => at().setY(at().y + 1.6) },
        {
          to: () => TOSS,
          arrive: () => {
            arm.holding = null
            removal.mode = 'toss'
            startFly(removal, homeOf(removal, tmp), 0.9 * motion, 3.0, 'home', 0, removal.onPage ? 1 : 0.2)
            sim.events.push({ kind: 'return', part: removal })
          },
        },
      ]
    } else if (head && !head.fly && head.beltX >= BELT.end - 0.01) {
      const pick = () => tmp.set(BELT.end, BELT.y + head.size[1] / 2, BELT.z).add(grip(head)).clone()
      arm.job = head
      arm.steps = [
        { to: () => pick().setY(pick().y + 1.1) },
        {
          to: pick,
          arrive: () => {
            if (sim.belt[0] !== head) return false
            sim.belt.shift()
            head.mode = 'held'
            arm.holding = head
          },
        },
        { to: () => pick().setY(pick().y + 1.8) },
        { to: () => slotPos(head, tmp).add(grip(head)).clone().setY(BOARD.y + 2.2) },
        {
          to: () => slotPos(head, tmp).add(grip(head)).clone(),
          arrive: () => {
            arm.holding = null
            if (!sim.wanted.has(head.item.ref)) {
              head.mode = 'toss'
              startFly(head, homeOf(head, tmp), 0.9 * motion, 3.0, 'home', 0, head.onPage ? 1 : 0.2)
              sim.events.push({ kind: 'return', part: head })
              return
            }
            head.mode = 'board'
            head.drawn = 0
            sim.seat = { part: head, t: sim.time }
            sim.events.push({ kind: 'seat', part: head })
            if (head.route) for (let k = 0; k < 3; k++) sim.pulses.push({ route: head.route, t: -k * 0.14 - 0.5, speed: 1.3 / motion })
            if (lab.setup.agent !== 'none') {
              sim.probe = { part: head, t: -0.35 }
              sim.events.push({ kind: 'probe', part: head })
            }
            wake(sim)
          },
        },
        { to: () => slotPos(head, tmp).add(grip(head)).clone().setY(BOARD.y + 1.6) },
      ]
    }
  }
  const target = arm.steps[0]?.to() ?? REST
  const rush = 1 + Math.min(1.2, (sim.belt.length + sim.removals.length + sim.feed.length) * 0.18)
  tmp.copy(target).sub(arm.pos)
  const dist = tmp.length()
  const move = Math.min(dist * (1 - Math.exp((-dt * 11 * rush) / motion)), (18 * rush * dt) / motion)
  if (dist > 1e-5) arm.pos.addScaledVector(tmp, move / dist)
  if (dist < 0.005 && !arm.steps.length) arm.pos.copy(REST)
  if (arm.steps.length && arm.pos.distanceTo(target) < 0.05) {
    const s = arm.steps.shift()!
    if (s.arrive?.() === false) arm.steps = []
    if (!arm.steps.length) arm.job = null
  }
  arm.grip += ((arm.holding ? 1 : 0) - arm.grip) * (1 - Math.exp(-dt * 14))
  if (!arm.holding && arm.grip < 0.005) arm.grip = 0
  if (arm.holding) {
    const h = arm.holding
    h.scale += ((h.slot?.s ?? 1) - h.scale) * (1 - Math.exp(-dt * 6))
    h.pos.copy(arm.pos).sub(grip(h))
  }

  for (const p of sim.list) {
    if (p.fly) {
      const f = p.fly
      f.t += dt / f.dur
      const t = clamp(f.t, 0, 1)
      if (f.t >= 0) {
        p.visible = true
        const e = t * t * (3 - 2 * t)
        p.pos.lerpVectors(f.from, f.to, e)
        p.pos.y += f.h * 4 * t * (1 - t)
        p.scale = f.s0 + (f.s1 - f.s0) * e
        if (p.mode === 'toss') p.spin = t * Math.PI * 3
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
        startFly(p, tmp, 0.45 * motion, into ? 0.5 : 1.1, p.mode, into ? 0 : (0.06 + p.pad * 0.03) * motion, into ? 0.2 : 1)
        if (!into) p.scale = Math.max(p.scale, 0.2)
      } else {
        p.pos.lerp(tmp, 1 - Math.exp(-dt * 12))
        if (p.pos.distanceToSquared(tmp) < 1e-6) p.pos.copy(tmp)
        if (p.mode === 'queued' && motion === 1) p.pos.y += Math.abs(Math.sin(sim.time * 9 + p.pad)) * 0.16
        p.visible = p.onPage || p.mode === 'queued'
        p.scale = p.visible ? 1 : 0.2
      }
    } else if (p.mode === 'board') {
      slotPos(p, tmp)
      p.pos.lerp(tmp, 1 - Math.exp(-dt * 14))
      if (p.pos.distanceToSquared(tmp) < 1e-6) p.pos.copy(tmp)
      const s = p.slot?.s ?? 1
      p.scale += (s - p.scale) * (1 - Math.exp(-dt * 14))
      if (Math.abs(s - p.scale) < 0.002) p.scale = s
      p.visible = true
      if (p.drawn < 1 && p.route) p.drawn = Math.min(1, p.drawn + dt / (0.55 * motion))
    }
    p.flash = Math.max(0, p.flash - dt * 1.4)
    const live = p.onPage || p.mode !== 'home' || !!p.fly
    if (live !== p.live) {
      p.live = live
      if (live) sim.live.add(p)
      else sim.live.delete(p)
      sim.liveVersion++
    }
  }

  if (sim.probe) {
    sim.probe.t += dt / (0.7 * motion)
    if (sim.probe.t >= 1) {
      sim.probe.part.flash = 1
      sim.probe = null
    }
  }

  const ease = 1 - Math.exp(-dt * 10)
  for (let k = 0; k < sim.drawers.length; k++) {
    const want = k === sim.active ? DRAWER_OPEN : 0
    sim.drawers[k] += (want - sim.drawers[k]) * ease
    if (Math.abs(want - sim.drawers[k]) < 0.002) sim.drawers[k] = want
  }
  for (const key in sim.drops) sim.drops[key as DropKey] = Math.max(0, sim.drops[key as DropKey] - dt * 3)

  sim.ambient -= dt
  if (sim.ambient <= 0 && idleLoops(sim, motion) && sim.pulses.length < PULSE_CAP) {
    sim.ambient = 1.4 + Math.random() * 1.2
    let n = 0
    for (const p of sim.live) if (p.mode === 'board' && p.route && p.drawn >= 1) n++
    if (n) {
      let pick = Math.floor(Math.random() * n)
      for (const p of sim.live) {
        if (!(p.mode === 'board' && p.route && p.drawn >= 1)) continue
        if (pick-- === 0) {
          sim.pulses.push({ route: p.route!, t: 0, speed: 0.9 })
          break
        }
      }
    }
  }
  for (const pulse of sim.pulses) pulse.t += pulse.speed * dt
  if (sim.pulses.some((pulse) => pulse.t > 1)) sim.pulses = sim.pulses.filter((pulse) => pulse.t <= 1)
}
