import { Vector3 } from 'three'

import type { CatalogItem } from '../../../../workspace/-workspace/workspace.types'
import type { Lab } from '../../lab.types'
import { route, routeLength, stopOf, tour } from './layout'
import type { Layout, Loc, Way } from './layout'

export const BELT = { start: -3.7, end: 1.7, z: 1.6, y: 0.9, speed: 3.4, gap: 1.2 }
export const ARM_BASE = { x: 4.2, z: -1.4 }
export const H0 = 1.9
export const L1 = 5.6
export const L2 = 5.4
export const BOARD = { x0: 5.2, x1: 13.95, z0: -3.75, z1: 3.15, y: 0.45 }
export const CHIPS = { framework: new Vector3(8.35, 0, -0.3), database: new Vector3(10.85, 0, -0.3) }
export const CHIP = 1.7
const TOSS = new Vector3(2.4, 4.4, -1.6)
const REST = new Vector3(2.6, 3.6, 0.6)
const CAP = 16
const VMAX = 17

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

export function slotPos(slot: number, h: number, out = new Vector3()) {
  const s = SLOTS[slot % SLOTS.length]
  return out.set(s.x, BOARD.y + h / 2 + Math.floor(slot / SLOTS.length) * 0.16, s.z)
}

/**
 * wait: still on its shelf, queued for the picker. pick: lifting into the
 * tote. tote: riding the picker. drop: tote to belt. belt, held, board: the
 * v1 assembly cell. return: flying home to its shelf.
 */
export type Mode = 'wait' | 'pick' | 'tote' | 'drop' | 'belt' | 'held' | 'board' | 'return'
type Fly = { from: Vector3; to: Vector3; t: number; dur: number; h: number; then: Mode | 'shelf'; s0: number; s1: number }
export type Part = {
  ref: string
  i: number
  item: CatalogItem
  size: [number, number, number]
  pos: Vector3
  scale: number
  spin: number
  mode: Mode
  fly: Fly | null
  beltX: number
  slot: number
}
type Step = { to: Vector3; arrive?: () => boolean | void }
export type Picker = {
  pos: Vector3
  heading: number
  loc: Loc
  path: Way[]
  v: number
  state: 'idle' | 'go' | 'pick' | 'unload'
  target: Part | null
  dwell: number
  cool: number
  reach: number
  tote: Part[]
}
export type Sim = {
  index: Map<string, number>
  parts: Map<string, Part>
  version: number
  picker: Picker
  belt: Part[]
  removals: Part[]
  slots: (Part | null)[]
  arm: { pos: Vector3; steps: Step[]; holding: Part | null; grip: number; job: Part | null }
  drone: { pos: Vector3; welds: Vector3[]; weldT: number; show: number }
  pulses: { slot: number; t: number }[]
  time: number
  cell: Vector3
  plan: [number, number][]
  planVersion: number
  waits: number
  seated: number
}

const tmp = new Vector3()

function startFly(p: Part, to: Vector3, dur: number, h: number, then: Fly['then'], s1 = p.scale) {
  p.fly = { from: p.pos.clone(), to: to.clone(), t: 0, dur, h, then, s0: p.scale, s1 }
}

export const shelfPos = (L: Layout, i: number, out = new Vector3()) => out.set(L.pos[i * 3], L.pos[i * 3 + 1], L.pos[i * 3 + 2])

function makePart(lab: Lab, i: number, L: Layout): Part {
  const item = lab.catalog.items[i]
  const block = item.kind === 'block'
  return {
    ref: item.ref, i, item,
    size: block ? [0.96, 0.1, 0.72] : [0.56, 0.42, 0.56],
    pos: shelfPos(L, i), scale: 0.8, spin: 0, mode: 'wait', fly: null, beltX: 0, slot: -1,
  }
}

export function createSim(lab: Lab, L: Layout): Sim {
  const index = new Map(lab.catalog.items.map((item, i) => [item.ref, i]))
  const cell = new Vector3(L.cell.x, 0, L.cell.z)
  const sim: Sim = {
    index, parts: new Map(), version: 0,
    picker: { pos: new Vector3(L.dock.x, 0, L.dock.z), heading: Math.PI, loc: { k: 'dock' }, path: [], v: 0, state: 'idle', target: null, dwell: 0, cool: 0, reach: 0, tote: [] },
    belt: [], removals: [], slots: [],
    arm: { pos: REST.clone(), steps: [], holding: null, grip: 0, job: null },
    drone: { pos: new Vector3(9.6, 3.4, 0), welds: [], weldT: 0, show: lab.setup.agent === 'none' ? 0 : 1 },
    pulses: [], time: 0, cell, plan: [], planVersion: 0, waits: 0, seated: 0,
  }
  for (const ref of lab.setup.items) {
    const i = index.get(ref)
    if (i === undefined) continue
    const p = makePart(lab, i, L)
    p.slot = sim.slots.length
    sim.slots.push(p)
    p.mode = 'board'
    p.scale = 1
    slotPos(p.slot, p.size[1], p.pos).add(cell)
    sim.parts.set(ref, p)
  }
  return sim
}

export const busy = (sim: Sim) =>
  sim.picker.state !== 'idle' || sim.belt.length > 0 || !!sim.arm.job || sim.arm.steps.length > 0 || [...sim.parts.values()].some((p) => p.mode === 'drop')

function sendHome(sim: Sim, p: Part, L: Layout) {
  const to = shelfPos(L, p.i)
  const dist = to.distanceTo(p.pos)
  p.mode = 'return'
  startFly(p, to, 0.9 + dist * 0.018, 2.5 + dist * 0.12, 'shelf', 0.8)
  sim.version++
}

function totePos(pk: Picker, k: number, out: Vector3) {
  const col = k % 4, row = Math.floor(k / 4) % 4, layer = Math.floor(k / 16)
  const lx = (col - 1.5) * 0.28, lz = (row - 1.5) * 0.22
  const c = Math.cos(pk.heading), s = Math.sin(pk.heading)
  return out.set(pk.pos.x + lx * c + lz * s, 1.02 + layer * 0.1, pk.pos.z - lx * s + lz * c)
}

function replan(sim: Sim, L: Layout) {
  const pk = sim.picker
  const pts: [number, number][] = [[pk.pos.x, pk.pos.z], ...pk.path.map((w): [number, number] => [w.x, w.z])]
  const end = pk.path.length ? pk.path[pk.path.length - 1].loc : pk.loc
  const waits = [...sim.parts.values()].filter((p) => p.mode === 'wait' && p !== pk.target).map((p) => p.i)
  if (pk.state !== 'idle' || waits.length) {
    const room = Math.max(0, CAP - pk.tote.length - (pk.target ? 1 : 0))
    const rest = tour(L, end, room ? waits : [], room)
    for (const w of rest.path) pts.push([w.x, w.z])
  }
  sim.plan = pts
  sim.planVersion++
}

function decide(sim: Sim, lab: Lab, L: Layout) {
  const pk = sim.picker
  const waits = [...sim.parts.values()].filter((p) => p.mode === 'wait' && p !== pk.target)
  pk.target = null
  if (waits.length && pk.tote.length < CAP) {
    let best = waits[0], bestLen = Infinity, bestPath: Way[] = []
    for (const p of waits) {
      const path = route(L, pk.loc, stopOf(L, p.i))
      const len = routeLength(L, pk.loc, path)
      if (len < bestLen) [best, bestLen, bestPath] = [p, len, path]
    }
    pk.target = best
    pk.path = bestPath
    pk.state = 'go'
  } else if (pk.loc.k !== 'dock') {
    pk.path = route(L, pk.loc, { k: 'dock' })
    pk.state = 'go'
  } else pk.state = pk.tote.length ? 'unload' : 'idle'
  void lab
  replan(sim, L)
}

export function relayout(sim: Sim, L: Layout) {
  sim.cell.set(L.cell.x, 0, L.cell.z)
  const pk = sim.picker
  pk.loc = { k: 'dock' }
  pk.path = [{ x: L.dock.x, z: L.dock.z, loc: pk.loc }]
  pk.state = 'go'
  pk.target = null
  sim.waits = -1
  for (const p of sim.parts.values()) if (p.mode === 'wait') shelfPos(L, p.i, p.pos)
  sim.planVersion++
  sim.plan = []
}

export function step(sim: Sim, lab: Lab, L: Layout, dt: number) {
  sim.time += dt
  const wanted = lab.selected
  const cell = sim.cell
  const pk = sim.picker

  for (const ref of wanted) {
    if (sim.parts.has(ref)) continue
    const i = sim.index.get(ref)
    if (i === undefined) continue
    sim.parts.set(ref, makePart(lab, i, L))
    sim.version++
  }
  let waits = 0
  for (const p of sim.parts.values()) {
    const want = wanted.has(p.ref)
    if (p.mode === 'wait') {
      if (!want && pk.target !== p) {
        sim.parts.delete(p.ref)
        sim.version++
      } else waits++
    } else if (!want && p.mode === 'belt') {
      sim.belt.splice(sim.belt.indexOf(p), 1)
      sendHome(sim, p, L)
    } else if (!want && p.mode === 'board' && sim.arm.job !== p && !sim.removals.includes(p)) sim.removals.push(p)
    else if (want && p.mode === 'board' && sim.removals.includes(p)) sim.removals.splice(sim.removals.indexOf(p), 1)
  }
  if (waits !== sim.waits) {
    sim.waits = waits
    if (pk.state === 'idle') decide(sim, lab, L)
    else replan(sim, L)
  }

  if (pk.state === 'go') {
    const w = pk.path[0]
    if (!w) decide(sim, lab, L)
    else {
      const dx = w.x - pk.pos.x, dz = w.z - pk.pos.z
      const d = Math.hypot(dx, dz)
      const last = pk.path.length === 1
      pk.v = Math.min(VMAX, pk.v + 26 * dt)
      if (last) pk.v = Math.min(pk.v, Math.sqrt(2 * 30 * d) + 1.5)
      if (d > 0.01) {
        const want = Math.atan2(dx, dz)
        let delta = want - pk.heading
        delta = Math.atan2(Math.sin(delta), Math.cos(delta))
        pk.heading += delta * (1 - Math.exp(-dt * 14))
      }
      const move = pk.v * dt
      if (move >= d) {
        pk.pos.set(w.x, 0, w.z)
        pk.loc = w.loc
        pk.path.shift()
        const t = pk.target
        if (t && (t.mode !== 'wait' || !wanted.has(t.ref))) decide(sim, lab, L)
        else if (!t && waits > 0 && pk.tote.length < CAP) decide(sim, lab, L)
        else if (!pk.path.length) {
          pk.v = 0
          if (t) {
            pk.state = 'pick'
            pk.dwell = 0.5
            t.mode = 'pick'
            pk.tote.push(t)
            startFly(t, totePos(pk, pk.tote.length - 1, tmp), 0.42, 0.9, 'tote', 0.3)
            pk.target = null
            sim.version++
          } else pk.state = pk.loc.k === 'dock' ? 'unload' : 'idle'
          replan(sim, L)
        }
      } else pk.pos.set(pk.pos.x + (dx / d) * move, 0, pk.pos.z + (dz / d) * move)
    }
  } else if (pk.state === 'pick') {
    pk.dwell -= dt
    if (pk.dwell <= 0) decide(sim, lab, L)
  } else if (pk.state === 'unload') {
    pk.cool -= dt
    const lastBelt = sim.belt[sim.belt.length - 1]
    const dropping = [...sim.parts.values()].some((p) => p.mode === 'drop')
    if (!pk.tote.length) decide(sim, lab, L)
    else if (pk.cool <= 0 && !dropping && (!lastBelt || lastBelt.beltX > BELT.start + BELT.gap) && pk.tote[0].mode === 'tote') {
      const p = pk.tote.shift()!
      pk.cool = 0.15
      if (wanted.has(p.ref)) {
        p.mode = 'drop'
        startFly(p, tmp.set(BELT.start, BELT.y + p.size[1] / 2, BELT.z).add(cell), 0.45, 1.4, 'belt', 1)
        sim.version++
      } else sendHome(sim, p, L)
      if (!pk.tote.length) decide(sim, lab, L)
    }
  }
  pk.reach += ((pk.state === 'pick' ? 1 : 0) - pk.reach) * (1 - Math.exp(-dt * 12))
  if (pk.state === 'go' || pk.state === 'pick') sim.plan[0] = [pk.pos.x, pk.pos.z]

  sim.belt.forEach((p, k) => {
    if (p.fly) return
    const limit = k === 0 ? BELT.end : sim.belt[k - 1].beltX - BELT.gap
    p.beltX = Math.max(p.beltX, Math.min(p.beltX + BELT.speed * dt, limit))
    p.pos.set(p.beltX + cell.x, BELT.y + p.size[1] / 2, BELT.z + cell.z)
  })

  const arm = sim.arm
  const grip = (p: Part) => new Vector3(0, 0.62 + p.size[1] / 2, 0)
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
      const at = slotPos(removal.slot, removal.size[1]).add(grip(removal))
      arm.steps = [
        { to: at.clone().setY(at.y + 1.4) },
        {
          to: at,
          arrive: () => {
            if (wanted.has(removal.ref) || removal.mode !== 'board') return false
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
            sendHome(sim, removal, L)
          },
        },
      ]
    } else if (head && !head.fly && head.beltX >= BELT.end - 0.01) {
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
            arm.job = head
            const slot = freeSlot()
            head.slot = slot
            sim.slots[slot] = head
            const at = slotPos(slot, head.size[1]).add(grip(head))
            arm.steps.push({ to: pick.clone().setY(pick.y + 2) }, { to: at.clone().setY(at.y + 1.5) }, {
              to: at,
              arrive: () => {
                arm.holding = null
                if (!wanted.has(head.ref)) {
                  sim.slots[slot] = null
                  head.slot = -1
                  sendHome(sim, head, L)
                  return
                }
                head.mode = 'board'
                sim.seated++
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
  const rush = 1 + Math.min(1.4, (sim.belt.length + sim.removals.length + pk.tote.length * 0.3) * 0.2)
  tmp.copy(target).sub(arm.pos)
  const dist = tmp.length()
  const mv = Math.min(dist * (1 - Math.exp(-dt * 11 * rush)), 18 * rush * dt)
  if (dist > 1e-5) arm.pos.addScaledVector(tmp, mv / dist)
  if (arm.steps.length && arm.pos.distanceTo(target) < 0.05) {
    const s = arm.steps.shift()!
    if (s.arrive?.() === false) arm.steps = []
    if (!arm.steps.length) arm.job = null
  }
  arm.grip += ((arm.holding ? 1 : 0) - arm.grip) * (1 - Math.exp(-dt * 14))
  if (arm.holding) arm.holding.pos.copy(arm.pos).sub(grip(arm.holding)).add(cell)

  for (const p of sim.parts.values()) {
    if (p.fly) {
      const f = p.fly
      f.t += dt / f.dur
      const t = clamp(f.t, 0, 1)
      p.pos.lerpVectors(f.from, f.to, t)
      p.pos.y += f.h * 4 * t * (1 - t)
      p.scale = f.s0 + (f.s1 - f.s0) * t
      if (p.mode === 'return') p.spin = t * Math.PI * 4
      if (f.t >= 1) {
        p.fly = null
        p.spin = 0
        if (f.then === 'shelf') {
          if (wanted.has(p.ref)) {
            p.mode = 'wait'
          } else sim.parts.delete(p.ref)
          sim.version++
        } else if (f.then === 'belt') {
          p.mode = 'belt'
          p.beltX = BELT.start
          sim.belt.push(p)
        } else if (f.then === 'tote') p.mode = 'tote'
      }
      continue
    }
    if (p.mode === 'tote') totePos(pk, pk.tote.indexOf(p), p.pos)
    else if (p.mode === 'board') {
      slotPos(p.slot, p.size[1], tmp).add(cell)
      p.pos.lerp(tmp, 1 - Math.exp(-dt * 16))
      p.scale = 1
    } else if (p.mode === 'wait') shelfPos(L, p.i, p.pos)
  }

  for (const pulse of sim.pulses) pulse.t += dt / 0.7
  sim.pulses = sim.pulses.filter((pulse) => pulse.t < 1)

  const drone = sim.drone
  drone.show += ((lab.setup.agent === 'none' ? 0 : 1) - drone.show) * (1 - Math.exp(-dt * 6))
  if (lab.setup.agent === 'none') drone.welds = []
  const weld = drone.welds[0]
  if (weld) tmp.copy(weld).setY(weld.y + 1.25)
  else tmp.set(9.6 + Math.sin(sim.time * 0.6) * 2.6, 3.5 + Math.sin(sim.time * 2.1) * 0.15, -0.3 + Math.cos(sim.time * 0.45) * 2.2)
  drone.pos.lerp(tmp, 1 - Math.exp(-dt * (weld ? 5 : 1.6)))
  if (weld && drone.pos.distanceTo(tmp) < 0.25) {
    drone.weldT += dt
    if (drone.weldT > 0.9) {
      drone.welds.shift()
      drone.weldT = 0
    }
  }
}
