import { Vector3 } from 'three'

import type { CatalogItem } from '../../../../workspace/-workspace/workspace.types'
import type { Lab } from '../../lab.types'
import { bandOf, seatAt, seatPos } from './kit/board'
import type { BoardState, Seat } from './kit/board'
import { partSize } from './kit/parts'
import { ARM, BELT, BELT_LENGTH, DRAWER, DROP, RETURN, SAFE_Y, beltAt } from './layout'
import type { Card, Store } from './model'

/**
 * Where a part is. `home` and `wait` are drawn by the instanced card field;
 * every other mode is a live part. The journey is home → wait (crane
 * requested) → tote → belt → held → board, and back board → returned (on
 * the return tray) → tote → home.
 */
export type Mode = 'home' | 'wait' | 'tote' | 'belt' | 'held' | 'board' | 'returned' | 'fly'
type Fly = { from: Vector3; to: Vector3; t: number; dur: number; h: number; then: Mode; lean1: number }
export type Part = {
  item: CatalogItem
  size: [number, number, number]
  pos: Vector3
  /** 1 standing in a drawer, 0 lying flat. */
  lean: number
  scale: number
  spin: number
  mode: Mode
  fly: Fly | null
  s: number
  seat: Seat | null
  tote: number
  pad: number
  live: boolean
  /** Set by a regroup so the next step flies the card to its new drawer. */
  regroup: boolean
}
type Step = { to: Vector3; wait?: () => boolean; arrive?: () => boolean | void }

export type Level = 'overview' | 'cabinet' | 'drawer'
export type Focus = { level: Level; cabinet: number; drawer: number }

/** What the sim just did, for sound and announcements. The frame loop drains it. */
export type Event = { kind: 'pick' | 'seat' | 'return' | 'probe'; part: Part } | { kind: 'drawer' | 'route' }
/** The crane pulled a closed drawer out, and a seat's trace pulse reached its chip. */
const DRAWER_OUT: Event = { kind: 'drawer' }
const ROUTED: Event = { kind: 'route' }

/** Every animated value lives here, so `isBusy` alone says whether the next frame would differ. */
export type Sim = {
  store: Store
  parts: Map<string, Part>
  list: Part[]
  live: Set<Part>
  liveVersion: number
  waiting: Part[]
  belt: Part[]
  removals: Part[]
  returned: (Part | null)[]
  arm: { pos: Vector3; steps: Step[]; holding: Part | null; grip: number; job: Part | null; kind: 'pick' | 'remove' | null }
  crane: { pos: Vector3; steps: Step[]; tote: Part[]; openDrawer: number; trip: 'pick' | 'return' | null; busy: number }
  board: BoardState
  bandUse: Map<number, Set<number>>
  /** Per drawer, 0 closed to 1 open, eased toward the focus. */
  drawerOpen: Float32Array
  focus: Focus
  time: number
  latest: Part | null
  addSeq: number
  seat: { part: Part; t: number } | null
  regroupT: number
  target: Lab['setup']['target']
  agent: Lab['setup']['agent']
  /** The selection as of this step. Crane and arm steps read it on arrival, so a part cleared mid-flight never seats. */
  wanted: ReadonlySet<string>
  events: Event[]
  /** Sim time of the last pick, seat or return; idle loops run for `IDLE_AFTER` past it. */
  lastActivity: number
  /** Belt travel so far; the slats read it, so a still belt draws nothing new. */
  beltPhase: number
  /** Parts mid-flight this step, and whether any drawer is still sliding. */
  flights: number
  sliding: boolean
}

const TOTE = 4
const RETURN_PADS = [new Vector3(-0.45, 0, -0.3), new Vector3(0.45, 0, -0.3), new Vector3(-0.45, 0, 0.4), new Vector3(0.45, 0, 0.4)]
/** Seconds of sim time the belt keeps turning after the last pick, seat or return. */
const IDLE_AFTER = 4
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
const tmp = new Vector3()
const tmp2 = new Vector3()
const goal = new Vector3()

/** A card's world position inside its drawer, given how far that drawer is open. */
function cardWorld(sim: Sim, card: Card, open: number, out = new Vector3()) {
  const cabinet = sim.store.cabinets[card.cabinet]
  return out.set(cabinet.x + card.local.x, card.local.y, card.local.z + open * DRAWER.travel)
}
const cardOf = (sim: Sim, p: Part) => sim.store.byRef.get(p.item.ref)!
const cardX = (sim: Sim, p: Part) => {
  const card = cardOf(sim, p)
  return card.local.x + sim.store.cabinets[card.cabinet].x
}

function startFly(p: Part, to: Vector3, dur: number, h: number, then: Mode, delay = 0, lean1 = 0) {
  p.fly = { from: p.pos.clone(), to: to.clone(), t: -delay, dur, h, then, lean1 }
}

export const wake = (sim: Sim) => {
  sim.lastActivity = sim.time
}
const emit = (sim: Sim, kind: Event['kind'], part: Part) => {
  sim.events.push({ kind, part })
  wake(sim)
}

export function createSim(lab: Lab, store: Store): Sim {
  const list: Part[] = lab.catalog.items.map((item) => ({
    item, size: partSize(item), pos: new Vector3(), lean: 1, scale: 1, spin: 0, mode: 'home', fly: null, s: 0, seat: null, tote: -1, pad: -1, live: false, regroup: false,
  }))
  const sim: Sim = {
    store,
    parts: new Map(list.map((p) => [p.item.ref, p])),
    list,
    live: new Set(),
    liveVersion: 0,
    waiting: [],
    belt: [],
    removals: [],
    returned: [null, null, null, null],
    arm: { pos: ARM.rest.clone(), steps: [], holding: null, grip: 0, job: null, kind: null },
    crane: { pos: new Vector3(DROP.x, SAFE_Y, DROP.z), steps: [], tote: [], openDrawer: -1, trip: null, busy: 0 },
    board: { seated: new Map(), version: 0, pulses: [], time: 0, bumps: { cpu: 0, mem: 0, pwr: 0, j1: 0 } },
    bandUse: new Map(),
    drawerOpen: new Float32Array(store.drawers.length),
    focus: { level: 'overview', cabinet: -1, drawer: -1 },
    time: 0,
    latest: null,
    addSeq: 0,
    seat: null,
    regroupT: -99,
    target: lab.setup.target,
    agent: lab.setup.agent,
    wanted: lab.selected,
    events: [],
    lastActivity: -99,
    beltPhase: 0,
    flights: 0,
    sliding: false,
  }
  for (const p of list) cardWorld(sim, cardOf(sim, p), 0, p.pos)
  for (const ref of lab.setup.items) {
    const p = sim.parts.get(ref)
    if (!p) continue
    seatPart(sim, p)
    p.mode = 'board'
    p.lean = 0
    p.live = true
    sim.live.add(p)
    seatPos(p.seat!, p.size[1], p.pos)
  }
  return sim
}

export function setStore(sim: Sim, store: Store) {
  sim.store = store
  sim.drawerOpen = new Float32Array(store.drawers.length)
  sim.crane.openDrawer = -1
  sim.regroupT = sim.time
  for (const p of sim.list) if (p.mode === 'home' || p.mode === 'wait') p.regroup = true
}

function seatPart(sim: Sim, p: Part) {
  const band = bandOf(p.item.category)
  let used = sim.bandUse.get(band)
  if (!used) sim.bandUse.set(band, (used = new Set<number>()))
  let n = 0
  while (used.has(n)) n++
  used.add(n)
  p.seat = seatAt(p.item, n, sim.target)
  sim.board.seated.set(p.item.ref, { item: p.item, seat: p.seat, since: sim.time })
  sim.board.version++
}

function unseat(sim: Sim, p: Part) {
  if (p.seat) sim.bandUse.get(p.seat.band)?.delete(p.seat.n)
  sim.board.seated.delete(p.item.ref)
  sim.board.version++
  p.seat = null
}

export const inJourney = (p: Part | null) => !!p && (p.mode === 'wait' || p.mode === 'tote' || p.mode === 'belt' || p.mode === 'held' || (!!p.fly && p.fly.then === 'belt'))

function freePad(sim: Sim) {
  const at = sim.returned.indexOf(null)
  return at >= 0 ? at : 0
}

/** Sends `p` arcing onto a free pad of the return tray, where the crane collects it. */
function toReturn(sim: Sim, p: Part, dur: number, h: number) {
  p.mode = 'fly'
  p.pad = freePad(sim)
  sim.returned[p.pad] = p
  startFly(p, tmp.copy(RETURN).add(RETURN_PADS[p.pad]).setY(RETURN.y + p.size[1] / 2), dur, h, 'returned')
  emit(sim, 'return', p)
}

function pullDrawer(sim: Sim, drawer: number) {
  sim.crane.openDrawer = drawer
  if (sim.drawerOpen[drawer] < 0.85) sim.events.push(DRAWER_OUT)
}

function planPick(sim: Sim) {
  const crane = sim.crane
  const pool = [...sim.waiting]
  const trip: Part[] = []
  let x = crane.pos.x
  while (trip.length < TOTE && pool.length) {
    let best = 0
    for (let i = 1; i < pool.length; i++) if (Math.abs(cardX(sim, pool[i]) - x) < Math.abs(cardX(sim, pool[best]) - x)) best = i
    const p = pool.splice(best, 1)[0]
    trip.push(p)
    x = cardX(sim, p)
  }
  crane.trip = 'pick'
  for (const p of trip) {
    const card = cardOf(sim, p)
    const at = cardWorld(sim, card, 1)
    crane.steps.push(
      { to: new Vector3(at.x, SAFE_Y, at.z), arrive: () => pullDrawer(sim, card.drawer) },
      {
        to: new Vector3(at.x, at.y + 0.9, at.z),
        wait: () => sim.drawerOpen[card.drawer] > 0.85,
        arrive: () => {
          if (p.mode !== 'wait') return
          sim.waiting.splice(sim.waiting.indexOf(p), 1)
          p.mode = 'tote'
          p.tote = crane.tote.length
          crane.tote.push(p)
        },
      },
      { to: new Vector3(at.x, SAFE_Y, at.z), arrive: () => { crane.openDrawer = -1 } },
    )
  }
  crane.steps.push(
    { to: new Vector3(DROP.x, SAFE_Y, DROP.z) },
    {
      to: new Vector3(DROP.x, DROP.y + 1.5, DROP.z),
      arrive: () => {
        for (let k = 0; k < crane.tote.length; k++) {
          const p = crane.tote[k]
          p.mode = 'belt'
          p.s = 0
          sim.belt.push(p)
          startFly(p, beltAt(0, tmp).setY(BELT.y + p.size[1] / 2), 0.4, 0.3, 'belt', k * 0.32)
        }
        crane.tote = []
      },
    },
    { to: new Vector3(DROP.x, SAFE_Y, DROP.z), arrive: () => { crane.trip = null } },
  )
}

function planReturn(sim: Sim) {
  const crane = sim.crane
  const parts = sim.returned.filter((p): p is Part => !!p && p.mode === 'returned' && !p.fly)
  crane.trip = 'return'
  crane.steps.push(
    { to: new Vector3(RETURN.x, SAFE_Y, RETURN.z) },
    {
      to: new Vector3(RETURN.x, RETURN.y + 1.2, RETURN.z),
      arrive: () => {
        for (const p of parts) {
          if (p.mode !== 'returned') continue
          sim.returned[p.pad] = null
          p.pad = -1
          p.mode = 'tote'
          p.tote = crane.tote.length
          crane.tote.push(p)
        }
      },
    },
    { to: new Vector3(RETURN.x, SAFE_Y, RETURN.z) },
  )
  for (const p of parts) {
    const card = cardOf(sim, p)
    const at = cardWorld(sim, card, 1)
    crane.steps.push(
      { to: new Vector3(at.x, SAFE_Y, at.z), arrive: () => pullDrawer(sim, card.drawer) },
      {
        to: new Vector3(at.x, at.y + 0.9, at.z),
        wait: () => sim.drawerOpen[card.drawer] > 0.85,
        arrive: () => {
          if (p.mode !== 'tote') return
          crane.tote.splice(crane.tote.indexOf(p), 1)
          for (let k = 0; k < crane.tote.length; k++) crane.tote[k].tote = k
          p.mode = 'fly'
          startFly(p, at, 0.35, 0.1, 'home', 0, 1)
        },
      },
      { to: new Vector3(at.x, SAFE_Y, at.z), arrive: () => { crane.openDrawer = -1 } },
    )
  }
  crane.steps.push({ to: new Vector3(DROP.x, SAFE_Y, DROP.z), arrive: () => { crane.trip = null } })
}

function drive(pos: Vector3, target: Vector3, dt: number, rate: number, max: number) {
  tmp.copy(target).sub(pos)
  const dist = tmp.length()
  if (dist < 1e-4) {
    pos.copy(target)
    return 0
  }
  const move = Math.min(dist * (1 - Math.exp(-dt * rate)), max * dt)
  pos.addScaledVector(tmp, move / dist)
  return dist
}

const grip = (p: Part) => tmp2.set(0, 0.62 + p.size[1] / 2, 0)
const returnsWaiting = (sim: Sim) => {
  let n = 0
  for (const p of sim.returned) if (p && p.mode === 'returned' && !p.fly) n++
  return n
}

/** Whether idle loops (the belt) should run now. Reduced motion never runs them. */
const idleLoops = (sim: Sim, motion: number) => motion === 1 && sim.time - sim.lastActivity < IDLE_AFTER

/**
 * True while the next frame would differ from the last: queues, the crane
 * or arm on a job or easing home, parts flying or settling, drawers
 * sliding, board pulses and bumps, or the belt inside its idle window.
 */
export function isBusy(sim: Sim, motion: number): boolean {
  const { crane, arm, board } = sim
  if (sim.waiting.length || sim.belt.length || sim.removals.length || crane.steps.length || crane.tote.length) return true
  if (arm.steps.length || arm.holding || arm.grip > 0 || arm.pos.distanceToSquared(ARM.rest) > 0) return true
  if (sim.flights || sim.sliding || board.pulses.length) return true
  for (const key in board.bumps) if (board.bumps[key as keyof typeof board.bumps] > 0) return true
  for (const p of sim.live) {
    if (p.mode !== 'board') return true
    if (p.seat && p.pos.distanceToSquared(seatPos(p.seat, p.size[1], tmp)) > 0) return true
  }
  return idleLoops(sim, motion)
}

/**
 * One tick. `motion` is 1 normally and 0.5 under reduced motion, where every
 * tween runs in half the time and nothing idles.
 */
export function step(sim: Sim, lab: Lab, dt: number, motion: number) {
  sim.time += dt
  sim.board.time = sim.time
  const wanted = lab.selected
  sim.wanted = wanted
  sim.agent = lab.setup.agent
  if (lab.setup.target !== sim.target) {
    sim.target = lab.setup.target
    for (const p of sim.list)
      if (p.seat) {
        p.seat = seatAt(p.item, p.seat.n, sim.target)
        const entry = sim.board.seated.get(p.item.ref)
        if (entry) entry.seat = p.seat
      }
    sim.board.version++
  }
  const fast = 1 / motion

  for (const p of sim.list) {
    const want = wanted.has(p.item.ref)
    if (want && p.mode === 'home' && !p.fly) {
      p.mode = 'wait'
      sim.waiting.push(p)
      sim.latest = p
      sim.addSeq++
      emit(sim, 'pick', p)
    } else if (!want && p.mode === 'wait') {
      p.mode = 'home'
      sim.waiting.splice(sim.waiting.indexOf(p), 1)
      wake(sim)
    } else if (!want && p.mode === 'belt' && !p.fly) {
      sim.belt.splice(sim.belt.indexOf(p), 1)
      toReturn(sim, p, 0.7 * motion, 1.6)
    } else if (!want && p.mode === 'board' && sim.arm.job !== p && !sim.removals.includes(p)) {
      sim.removals.push(p)
      wake(sim)
    } else if (want && p.mode === 'board' && sim.removals.includes(p)) sim.removals.splice(sim.removals.indexOf(p), 1)
  }

  const crane = sim.crane
  if (!crane.steps.length) {
    const returns = returnsWaiting(sim)
    if (sim.waiting.length && (crane.busy < 2 || !returns)) {
      planPick(sim)
      crane.busy++
    } else if (returns) {
      planReturn(sim)
      crane.busy = 0
    }
  }
  const target = crane.steps[0]
  if (target) {
    const vertical = Math.abs(target.to.x - crane.pos.x) < 0.02 && Math.abs(target.to.z - crane.pos.z) < 0.02
    goal.copy(target.to)
    if (!vertical && crane.pos.y < SAFE_Y - 0.05) goal.set(crane.pos.x, SAFE_Y, crane.pos.z)
    const rush = (1 + Math.min(1.2, sim.waiting.length * 0.15)) * fast
    const dist = drive(crane.pos, goal, dt, 7 * rush, (vertical ? 13 : 22) * rush)
    if (dist < 0.05 && goal.equals(target.to) && (!target.wait || target.wait())) {
      crane.steps.shift()
      target.arrive?.()
    }
  }
  for (let k = 0; k < crane.tote.length; k++) {
    const p = crane.tote[k]
    p.pos.set(crane.pos.x + ((k % 2) - 0.5) * 0.5, crane.pos.y - 0.42 - Math.floor(k / 2) * 0.06, crane.pos.z + (Math.floor(k / 2) - 0.5) * 0.4)
    p.lean += (0 - p.lean) * (1 - Math.exp(-dt * 8 * fast))
    if (p.lean < 1e-3) p.lean = 0
  }

  const beltRuns = sim.belt.length > 0 || idleLoops(sim, motion)
  if (beltRuns) sim.beltPhase += BELT.speed * fast * dt
  for (let i = 0; i < sim.belt.length; i++) {
    const p = sim.belt[i]
    if (p.fly) continue
    const limit = i === 0 ? BELT_LENGTH : sim.belt[i - 1].s - BELT.gap
    p.s = Math.max(p.s, Math.min(p.s + BELT.speed * fast * dt, limit))
    beltAt(p.s, p.pos).setY(BELT.y + p.size[1] / 2)
  }

  const arm = sim.arm
  const held = arm.holding
  if (held && arm.kind === 'pick' && !wanted.has(held.item.ref)) {
    unseat(sim, held)
    arm.steps = [
      { to: tmp.copy(arm.pos).setY(arm.pos.y + 1.2).clone() },
      {
        to: ARM.toss,
        arrive: () => {
          arm.holding = null
          toReturn(sim, held, 1.0 * motion, 2.6)
        },
      },
    ]
    arm.kind = 'remove'
  }
  if (!arm.steps.length) {
    const removal = sim.removals[0]
    const head = sim.belt[0]
    if (removal && removal.mode !== 'board') sim.removals.shift()
    else if (removal) {
      sim.removals.shift()
      arm.job = removal
      arm.kind = 'remove'
      const at = seatPos(removal.seat!, removal.size[1]).add(grip(removal))
      arm.steps = [
        { to: at.clone().setY(at.y + 1.4) },
        {
          to: at,
          arrive: () => {
            if (sim.wanted.has(removal.item.ref) || removal.mode !== 'board') return false
            unseat(sim, removal)
            removal.mode = 'held'
            arm.holding = removal
          },
        },
        { to: at.clone().setY(at.y + 1.8) },
        {
          to: ARM.toss,
          arrive: () => {
            arm.holding = null
            toReturn(sim, removal, 1.0 * motion, 2.6)
          },
        },
      ]
    } else if (head && !head.fly && head.s >= BELT_LENGTH - 0.01) {
      const pick = beltAt(BELT_LENGTH).setY(BELT.y + head.size[1] / 2).add(grip(head))
      arm.job = head
      arm.kind = 'pick'
      arm.steps = [
        { to: pick.clone().setY(pick.y + 1.2) },
        {
          to: pick,
          arrive: () => {
            if (sim.belt[0] !== head || !sim.wanted.has(head.item.ref)) return false
            sim.belt.shift()
            head.mode = 'held'
            arm.holding = head
            seatPart(sim, head)
            const at = seatPos(head.seat!, head.size[1]).add(grip(head))
            arm.steps.push({ to: pick.clone().setY(pick.y + 2) }, { to: at.clone().setY(at.y + 1.5) }, {
              to: at,
              arrive: () => {
                arm.holding = null
                if (!sim.wanted.has(head.item.ref)) {
                  unseat(sim, head)
                  toReturn(sim, head, 1.0 * motion, 2.6)
                  return
                }
                head.mode = 'board'
                sim.board.seated.get(head.item.ref)!.since = sim.time
                sim.seat = { part: head, t: sim.time }
                sim.board.pulses.push({ seat: head.seat!, t: 0 })
                emit(sim, 'seat', head)
                if (sim.agent !== 'none') emit(sim, 'probe', head)
              },
            }, { to: at.clone().setY(at.y + 1.3) })
          },
        },
      ]
    }
  }
  const armTarget = arm.steps[0]?.to ?? ARM.rest
  const rush = (1 + Math.min(1.2, (sim.belt.length + sim.removals.length) * 0.18)) * fast
  const dist = drive(arm.pos, armTarget, dt, 11 * rush, 18 * rush)
  if (arm.steps.length && dist < 0.05) {
    const s = arm.steps.shift()!
    if (s.arrive?.() === false) arm.steps = []
    if (!arm.steps.length) {
      arm.job = null
      arm.kind = null
    }
  }
  arm.grip += ((arm.holding ? 1 : 0) - arm.grip) * (1 - Math.exp(-dt * 14 * fast))
  if (!arm.holding && arm.grip < 1e-3) arm.grip = 0
  if (arm.holding) arm.holding.pos.copy(arm.pos).sub(grip(arm.holding))

  let flights = 0
  for (const p of sim.list) {
    if (p.fly) {
      flights++
      const f = p.fly
      f.t += dt / f.dur
      const t = clamp(f.t, 0, 1)
      if (f.t >= 0) {
        p.pos.lerpVectors(f.from, f.to, t)
        p.pos.y += f.h * 4 * t * (1 - t)
        p.lean += (f.lean1 - p.lean) * (1 - Math.exp(-dt * 10 * fast))
        if (f.then === 'returned') p.spin = t * Math.PI * 2
      }
      if (f.t >= 1) {
        p.fly = null
        p.spin = 0
        p.lean = f.lean1
        if (p.mode === 'fly') p.mode = f.then
      }
      if (f.t >= 0 && (f.then === 'home' || f.then === 'wait') && p.mode !== 'fly') p.spin = p.fly ? Math.sin(t * Math.PI) * 0.6 : 0
    } else if (p.mode === 'home' || p.mode === 'wait') {
      const card = cardOf(sim, p)
      cardWorld(sim, card, sim.drawerOpen[card.drawer], tmp)
      if (p.regroup) {
        p.regroup = false
        const shown = sim.focus.level !== 'overview' && card.cabinet === sim.focus.cabinet
        if (shown && p.pos.distanceTo(tmp) > 0.2) {
          startFly(p, tmp, (0.6 + Math.random() * 0.4) * motion, 0.5 + Math.random() * 0.4, p.mode, Math.random() * 0.4 * motion, 1)
          flights++
        } else p.pos.copy(tmp)
      } else p.pos.copy(tmp)
      p.lean = 1
    } else if (p.mode === 'board') {
      seatPos(p.seat!, p.size[1], tmp)
      p.pos.lerp(tmp, 1 - Math.exp(-dt * 16 * fast))
      if (p.pos.distanceToSquared(tmp) < 1e-6) p.pos.copy(tmp)
      p.lean = 0
    }
    const live = p.mode !== 'home' && p.mode !== 'wait'
    if (live !== p.live) {
      p.live = live
      if (live) sim.live.add(p)
      else sim.live.delete(p)
      sim.liveVersion++
    }
  }
  sim.flights = flights

  const pulses = sim.board.pulses
  let kept = 0
  for (const pulse of pulses) {
    pulse.t += dt / (0.8 * motion)
    if (pulse.t < 1) pulses[kept++] = pulse
    else sim.events.push(ROUTED)
  }
  pulses.length = kept
  const bumps = sim.board.bumps
  for (const key in bumps) {
    const k = key as keyof typeof bumps
    if (bumps[k] > 0) bumps[k] = Math.max(0, bumps[k] - dt * 2.6 * fast)
  }

  const f = sim.focus
  const open = sim.drawerOpen
  const refiling = sim.time - sim.regroupT < 1.8
  let sliding = false
  for (let i = 0; i < open.length; i++) {
    const d = sim.store.drawers[i]
    let want = 0
    if (f.level === 'drawer' && i === f.drawer) want = 1
    else if (f.level !== 'overview' && d.cabinet === f.cabinet) want = refiling ? 0.75 : 0.14
    if (i === crane.openDrawer) want = 1
    if (open[i] === want) continue
    open[i] += (want - open[i]) * (1 - Math.exp(-dt * (want > open[i] ? 8 : 9) * fast))
    if (Math.abs(want - open[i]) < 1e-3) open[i] = want
    else sliding = true
  }
  sim.sliding = sliding || refiling
}
