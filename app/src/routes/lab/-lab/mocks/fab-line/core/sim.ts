import { Vector3 } from 'three'

import type { CatalogItem } from '@/routes/workspace/-workspace/workspace.types'
import type { Lab } from '@/routes/lab/-lab/lab.types'
import type { Part, PartMode, Rig, RouteStyle, Sim, SimEventKind, TableVariant } from './contract'
import { ARM, boardWorld, drawerWorld, layoutLine, pathWorld, pocketWorld, railNow } from './line'
import { chipTop, specCache } from './spec'
import type { Spec } from './spec'
import { clamp, reducedMotion } from './three'

const tmp = new Vector3()
const tmp2 = new Vector3()
const tmp3 = new Vector3()
const goal = new Vector3()
const park = new Vector3()
const toss = new Vector3()
/** Flights run at half length under reduced motion. */
const PACE = reducedMotion ? 0.5 : 1
const EVENT_KEEP = 64

/** The scale a part rests at in a pocket. */
export const pocketScale = (table: TableVariant, spec: Spec) => Math.min(table.fit.max, table.fit.size / Math.max(spec.fw, spec.fd))
export const seatedScale = (sim: Sim, p: Part) => (p.slot?.s ?? 1) * sim.rig.board.origin.s

function emit(sim: Sim, kind: SimEventKind, part: Part) {
  sim.events.push({ kind, part, seq: ++sim.eventSeq })
  if (sim.events.length > EVENT_KEEP) sim.events.splice(0, sim.events.length - EVENT_KEEP)
}

function homeOf(sim: Sim, p: Part, out: Vector3) {
  return p.onPage ? pocketWorld(sim, p.pad, out) : drawerWorld(sim, p.cat, out)
}
/** The wrist above a chip whose bottom is at `at`. */
const wristOver = (at: Vector3, p: Part, scale: number, out: Vector3) => out.copy(at).setY(at.y + chipTop(p.spec) * scale + 0.56)
export function slotWorld(sim: Sim, p: Part, out = new Vector3()) {
  return boardWorld(sim, p.slot ?? { x: 0, y: 0, z: 0 }, out)
}
function parkAt(sim: Sim) {
  return park.set(railNow(sim).x0 + ARM.park, 3.1, railNow(sim).z + 2.6)
}
function tossAt(sim: Sim) {
  return toss.set(railNow(sim).x0 + 0.1, 3.9, -1.9)
}

function startFly(p: Part, to: Vector3, dur: number, h: number, then: PartMode, delay = 0, s1 = p.scale) {
  p.fly = { from: p.pos.clone(), to: to.clone(), t: -delay, dur: dur * PACE, h, then, s0: p.scale, s1 }
}
function sendHome(sim: Sim, p: Part, dur: number, h: number) {
  emit(sim, 'toss', p)
  p.mode = 'toss'
  p.route = null
  p.drawn = 0
  p.finish = 0
  startFly(p, homeOf(sim, p, tmp), dur, h, 'home', 0, p.onPage ? pocketScale(sim.rig.table, p.spec) : 0.2)
}

export function createSim(lab: Lab, rig: Rig, style: RouteStyle): Sim {
  const aisleIndex = new Map(lab.warehouse.aisles.map((a, i) => [a.id, i]))
  const list: Part[] = lab.catalog.items.map((item: CatalogItem) => {
    const cat = aisleIndex.get(item.category) ?? 0
    return {
      item, cat, code: lab.warehouse.bins.get(item.ref)?.code ?? '', spec: specCache(item),
      pos: rig.cabinet.drawer(cat, new Vector3()), scale: 0.2, spin: 0, mode: 'home', fly: null, u: 0, slot: null, order: 0, seatedAt: -10,
      route: null, drawn: 0, finish: 0, flash: 0, visible: false, onPage: false, pad: 0, live: false,
    }
  })
  const line = layoutLine(rig)
  const sim: Sim = {
    parts: new Map(list.map((p) => [p.item.ref, p])), list, feed: [], carried: [], removals: [],
    arm: { pos: new Vector3(), baseX: 0, steps: [], holding: null, grip: 0, job: null },
    work: { queue: [], job: null },
    time: 0, order: 0, live: new Set(), liveVersion: 0, latest: null, addSeq: 0, seat: null, lastSeat: null, lastSeatAt: -99,
    plan: { slots: new Map(), ghosts: [], hatches: [] }, version: 0, intake: 0, events: [], eventSeq: 0,
    rig, line, at: { ...line.at }, wanted: lab.selected, agent: lab.setup.agent,
    planned: { selected: null, target: null, style: null, framework: null, board: null },
  }
  sim.arm.pos.copy(parkAt(sim))
  sim.arm.baseX = sim.arm.pos.x
  for (const ref of lab.setup.items) {
    const p = sim.parts.get(ref)
    if (!p) continue
    p.mode = 'seated'
    p.order = sim.order++
    p.drawn = 1
    p.finish = 1
    p.visible = true
  }
  replan(sim, lab, style)
  for (const p of sim.list) {
    if (p.mode !== 'seated') continue
    slotWorld(sim, p, p.pos)
    p.scale = seatedScale(sim, p)
  }
  return sim
}

/**
 * Swaps in new station variants. The line reflows and slides; parts riding
 * a transport that changed go back to the feed and re-enter the new one.
 */
export function setRig(sim: Sim, rig: Rig) {
  const prev = sim.rig
  if (prev === rig) return
  sim.rig = rig
  sim.line = layoutLine(rig)
  if (prev.transport !== rig.transport) {
    const back = sim.carried.splice(0)
    for (const p of back) {
      p.mode = 'queued'
      p.fly = null
    }
    sim.feed.unshift(...back)
  }
}

/** Puts `parts` on the table's pockets; `null` leaves a pocket empty. */
export function applyPage(sim: Sim, parts: readonly (Part | null)[]) {
  for (const p of sim.list) if (p.onPage) p.onPage = false
  parts.forEach((p, i) => {
    if (!p) return
    p.onPage = true
    p.pad = i
  })
}

export function inJourney(p: Part | null) {
  if (!p) return false
  return p.mode === 'queued' || p.mode === 'carried' || p.mode === 'held' || (!!p.fly && p.fly.then === 'carried')
}
export const inFlight = (sim: Sim) => sim.feed.length + sim.carried.length + (sim.arm.holding && sim.arm.holding.mode === 'held' && !sim.removals.includes(sim.arm.holding) ? 1 : 0)

function replan(sim: Sim, lab: Lab, style: RouteStyle) {
  const board = sim.rig.board
  const wanted = sim.list.filter((p) => lab.selected.has(p.item.ref)).sort((a, b) => a.order - b.order)
  sim.plan = board.plan(wanted, lab.setup.target)
  for (const p of sim.list) p.slot = sim.plan.slots.get(p.item.ref) ?? p.slot
  const routed = wanted.filter((p) => p.mode !== 'toss')
  for (const p of routed) p.route = null
  board.route(routed, style, lab.setup.framework)
  sim.planned = { selected: lab.selected, target: lab.setup.target, style, framework: lab.setup.framework, board }
  sim.version++
}

/** The part the arm should fetch next and where its bottom sits, or null. */
function pickable(sim: Sim) {
  if (sim.rig.transport.kind === 'path') {
    const head = sim.carried[0]
    if (!head || head.fly || head.u < sim.rig.transport.length - 0.01) return null
    return head
  }
  const head = sim.feed[0]
  if (!head || head.fly) return null
  return head
}

export function step(sim: Sim, lab: Lab, style: RouteStyle, dt: number) {
  sim.time += dt
  sim.wanted = lab.selected
  sim.agent = lab.setup.agent
  const wanted = lab.selected
  const k = 1 - Math.exp(-dt * 6)
  for (const key of ['pick', 'transport', 'board'] as const) {
    const d = sim.line.at[key] - sim.at[key]
    sim.at[key] = Math.abs(d) < 1e-3 ? sim.line.at[key] : sim.at[key] + d * k
  }
  const transport = sim.rig.transport
  const path = transport.kind === 'path' ? transport : null

  for (const p of sim.list) {
    const want = wanted.has(p.item.ref)
    if (want && p.mode === 'home' && !p.fly) {
      p.mode = 'queued'
      p.order = sim.order++
      sim.feed.push(p)
      sim.latest = p
      sim.addSeq++
      emit(sim, 'queue', p)
    } else if (!want && p.mode === 'queued') {
      p.mode = 'home'
      sim.feed.splice(sim.feed.indexOf(p), 1)
    } else if (!want && p.mode === 'carried') {
      sim.carried.splice(sim.carried.indexOf(p), 1)
      sendHome(sim, p, 0.8, 2.4)
    } else if (!want && p.mode === 'seated' && sim.arm.job !== p && !sim.removals.includes(p)) sim.removals.push(p)
    else if (want && p.mode === 'seated' && sim.removals.includes(p)) sim.removals.splice(sim.removals.indexOf(p), 1)
  }
  const planned = sim.planned
  if (wanted !== planned.selected || planned.target !== lab.setup.target || planned.style !== style || planned.framework !== lab.setup.framework || planned.board !== sim.rig.board) replan(sim, lab, style)

  if (path) {
    const last = sim.carried[sim.carried.length - 1]
    if (sim.feed.length && (!last || last.u > path.gap)) {
      const p = sim.feed.shift()!
      p.mode = 'carried'
      p.u = 0
      p.visible = true
      sim.carried.push(p)
      emit(sim, 'load', p)
      startFly(p, pathWorld(sim, 0, tmp), path.load.dur, path.load.h, 'carried', 0, pocketScale(sim.rig.table, p.spec))
    }
  }

  sim.intake = Math.max(0, sim.intake - dt)
  if (path)
    sim.carried.forEach((p, i) => {
      if (p.fly) return
      const limit = i === 0 ? path.length : sim.carried[i - 1].u - path.gap
      p.u = Math.max(p.u, Math.min(p.u + path.speed * dt, limit))
      pathWorld(sim, p.u, p.pos)
      if (p.u > 0.2 && p.u < 1.4) sim.intake = 0.4
    })

  const arm = sim.arm
  if (!arm.steps.length) {
    const removal = sim.removals[0]
    const head = pickable(sim)
    if (removal && removal.mode !== 'seated') sim.removals.shift()
    else if (removal) {
      sim.removals.shift()
      arm.job = removal
      emit(sim, 'servo', removal)
      const at = () => wristOver(removal.pos, removal, removal.scale, tmp)
      arm.steps = [
        { to: () => tmp3.copy(at()).setY(ARM.safe + 0.9), slow: true },
        {
          to: () => at(),
          arrive: () => {
            if (sim.wanted.has(removal.item.ref) || removal.mode !== 'seated') return false
            removal.mode = 'held'
            removal.route = null
            arm.holding = removal
          },
        },
        { to: () => tmp3.copy(at()).setY(ARM.safe + 1.4) },
        {
          to: () => tossAt(sim),
          slow: true,
          arrive: () => {
            arm.holding = null
            sendHome(sim, removal, 1.05, 3.4)
          },
        },
      ]
    } else if (head) {
      const from = path ? () => pathWorld(sim, path.length, tmp2) : () => homeOf(sim, head, tmp2)
      const pick = () => wristOver(from(), head, head.scale, tmp)
      const seatAt = () => wristOver(slotWorld(sim, head, tmp2), head, seatedScale(sim, head), tmp)
      const queue = path ? sim.carried : sim.feed
      arm.job = head
      emit(sim, 'servo', head)
      arm.steps = [
        { to: () => tmp3.copy(pick()).setY(tmp3.y + 1.1) },
        {
          to: () => pick(),
          arrive: () => {
            if (queue[0] !== head || !sim.wanted.has(head.item.ref)) return false
            queue.shift()
            head.mode = 'held'
            arm.holding = head
          },
        },
        { to: () => tmp3.copy(pick()).setY(ARM.safe + 0.9) },
        { to: () => tmp3.copy(seatAt()).setY(ARM.safe + 0.9), slow: true },
        {
          to: () => seatAt(),
          arrive: () => {
            arm.holding = null
            if (!sim.wanted.has(head.item.ref)) {
              sendHome(sim, head, 1.05, 3.4)
              return
            }
            head.mode = 'seated'
            head.seatedAt = sim.time
            head.drawn = 0
            if (!head.route) sim.rig.board.route(sim.list.filter((p) => p.mode === 'seated' || p.mode === 'held'), style, lab.setup.framework)
            sim.seat = { part: head, t: sim.time }
            sim.lastSeat = head
            sim.lastSeatAt = sim.time
            emit(sim, 'seat', head)
            const dur = sim.rig.integrator.workTime(sim.agent, head)
            head.finish = dur > 0 ? 0 : 1
            if (dur > 0) sim.work.queue.push(head)
          },
        },
        { to: () => tmp3.copy(seatAt()).setY(ARM.safe) },
      ]
    }
  }
  const stepNow = arm.steps[0]
  const target = goal.copy(stepNow?.to() ?? parkAt(sim))
  const rush = 1 + Math.min(1.2, (sim.carried.length + sim.removals.length + sim.feed.length) * 0.18)
  tmp.copy(target).sub(arm.pos)
  const dist = tmp.length()
  const move = Math.min(dist * (1 - Math.exp(-dt * 11 * rush)), (stepNow?.slow ? 10 : 18) * rush * dt)
  if (dist > 1e-5) arm.pos.addScaledVector(tmp, move / dist)
  const rail = railNow(sim)
  arm.baseX += (clamp(arm.pos.x, rail.x0 + 0.7, rail.x1 - 0.7) - arm.baseX) * (1 - Math.exp(-dt * 7))
  if (arm.steps.length && arm.pos.distanceTo(target) < 0.05) {
    const s = arm.steps.shift()!
    if (s.arrive?.() === false) arm.steps = []
    if (!arm.steps.length) arm.job = null
  }
  arm.grip += ((arm.holding ? 1 : 0) - arm.grip) * (1 - Math.exp(-dt * 14))
  const held = arm.holding
  if (held) {
    const s1 = held.slot && wanted.has(held.item.ref) ? seatedScale(sim, held) : held.scale
    held.scale += (s1 - held.scale) * (1 - Math.exp(-dt * 5))
    held.pos.copy(arm.pos).setY(arm.pos.y - chipTop(held.spec) * held.scale - 0.56)
  }

  for (const p of sim.list) {
    if (p.fly) {
      const f = p.fly
      f.t += dt / f.dur
      const t = clamp(f.t, 0, 1)
      if (f.t >= 0) {
        const e = t * t * (3 - 2 * t)
        p.visible = true
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
      homeOf(sim, p, tmp)
      if (p.pos.distanceTo(tmp) > 0.4) {
        const into = !p.onPage
        startFly(p, tmp, 0.5, into ? 0.6 : 1.3, p.mode, into ? 0 : 0.08 + p.pad * 0.035, into ? 0.2 : pocketScale(sim.rig.table, p.spec))
        if (!into) p.scale = Math.max(p.scale, 0.2)
      } else {
        p.pos.lerp(tmp, 1 - Math.exp(-dt * 12))
        if (p.mode === 'queued') p.pos.y += Math.abs(Math.sin(sim.time * 9 + p.pad)) * 0.18
        p.visible = p.onPage || p.mode === 'queued'
        p.scale = p.visible ? pocketScale(sim.rig.table, p.spec) : 0.2
      }
    } else if (p.mode === 'seated') {
      slotWorld(sim, p, tmp)
      p.pos.lerp(tmp, 1 - Math.exp(-dt * 12))
      p.scale += (seatedScale(sim, p) - p.scale) * (1 - Math.exp(-dt * 10))
      p.visible = true
      if (p.drawn < 1) {
        p.drawn = Math.min(1, p.drawn + dt / Math.max(0.5, (p.route?.len ?? 8) / 16))
        if (p.drawn >= 1) emit(sim, 'chirp', p)
      }
    }
    p.flash = Math.max(0, p.flash - dt * 1.6)
    const live = p.onPage || p.mode !== 'home' || !!p.fly
    if (live !== p.live) {
      p.live = live
      if (live) sim.live.add(p)
      else sim.live.delete(p)
      sim.liveVersion++
    }
  }

  const work = sim.work
  if (work.job && (work.job.part.mode !== 'seated' || !wanted.has(work.job.part.item.ref))) work.job = null
  while (!work.job && work.queue.length) {
    const p = work.queue.shift()!
    if (p.mode !== 'seated' || !wanted.has(p.item.ref)) continue
    const dur = sim.rig.integrator.workTime(sim.agent, p)
    if (dur <= 0) {
      p.finish = 1
      continue
    }
    work.job = { part: p, t: 0, dur }
    emit(sim, 'work', p)
  }
  if (work.job) {
    const job = work.job
    job.t += dt / job.dur
    job.part.finish = Math.min(1, job.t)
    if (job.t >= 1) {
      job.part.flash = 1
      emit(sim, 'done', job.part)
      work.job = null
    }
  }
}

/** True while anything on the line is still moving or working. */
export function simBusy(sim: Sim) {
  if (sim.work.job || sim.work.queue.length || sim.feed.length || sim.carried.length || sim.removals.length || sim.arm.steps.length || sim.intake > 0) return true
  for (const key of ['pick', 'transport', 'board'] as const) if (sim.at[key] !== sim.line.at[key]) return true
  for (const p of sim.live) if (p.fly || p.mode === 'queued' || p.mode === 'held' || p.mode === 'toss' || (p.mode === 'seated' && p.drawn < 1) || p.flash > 0) return true
  return false
}

export const matchItem = (item: CatalogItem, query: string) => {
  const q = query.trim().toLowerCase()
  return !q || item.title.toLowerCase().includes(q) || item.label.toLowerCase().includes(q) || item.ref.toLowerCase().includes(q)
}

