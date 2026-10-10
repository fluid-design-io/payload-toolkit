import { Vector3 } from 'three'

import type { CatalogItem } from '../../../../workspace/-workspace/workspace.types'
import type { Lab } from '../../lab.types'
import { FACTORY, PAD, PAD_LOCAL, PAD_ROAD, flight, reverseFrom, route, sample, toWorld, track } from './town'
import type { Bin, Town, Track } from './town'

export const BASE = { x: 4.2, z: -1.4 }
export const H0 = 1.9
export const L1 = 5.6
export const L2 = 5.4
export const BOARD = { x0: 5.2, x1: 13.95, z0: -3.75, z1: 3.15, y: 0.45 }
export const CHIPS = { framework: new Vector3(8.35, 0, -0.3), database: new Vector3(10.85, 0, -0.3) }
export const CHIP = 1.7
const REST = new Vector3(2.6, 3.6, 0.6)
export const SPOTS = [0.2, 1.7].flatMap((x) => [0.4, 1.6, 2.8].map((z) => new Vector3(x, 0.9, z)))
export const CRATE = 0.42
export const TILE: [number, number, number] = [0.96 * FACTORY.s, 0.1 * FACTORY.s, 0.72 * FACTORY.s]

export const SLOTS = (() => {
  const out: { x: number; z: number; i: number; j: number }[] = []
  for (let i = 0; i < 7; i++)
    for (let j = 0; j < 7; j++) {
      if (i >= 1 && i <= 5 && j >= 2 && j <= 4) continue
      out.push({ x: 5.85 + i * 1.25, z: -3.15 + j * 0.95, i, j })
    }
  return out.sort((a, b) => Math.hypot(a.x - 9.6, (a.z + 0.3) * 1.3) - Math.hypot(b.x - 9.6, (b.z + 0.3) * 1.3))
})()
export function slotLocal(slot: number, out = new Vector3()) {
  const s = SLOTS[slot % SLOTS.length]
  return out.set(s.x, BOARD.y + 0.05 + Math.floor(slot / SLOTS.length) * 0.16, s.z)
}
export const toLocal = (world: Vector3, out = new Vector3()) =>
  out.set((world.x - FACTORY.x) / FACTORY.s, world.y / FACTORY.s, (world.z - FACTORY.z) / FACTORY.s)

export type Carrier = 'truck' | 'drone'
export type Where = 'truck' | 'staged' | 'arm' | 'board'
export type Part = {
  ref: string
  item: CatalogItem
  bin: Bin
  where: Where
  vehicle: Vehicle | null
  spot: number
  slot: number
  pos: Vector3
  form: number
  formTo: number
  fly: { from: Vector3; to: Vector3; t: number } | null
  seatedAt: number
}
export type Vehicle = {
  id: number
  kind: Carrier
  role: 'deliver' | 'return' | 'empty'
  building: number
  track: Track
  s: number
  v: number
  cargo: Part | null
  pos: Vector3
  dir: Vector3
  yaw: number
  depart: number
  wait: number
  done: boolean
}
export type Ambient = { track: Track; s: number; speed: number; toCommunity: boolean; pos: Vector3; dir: Vector3; yaw: number; drone: boolean }
export type Event = { id: number; t: number; text: string; tone: 'out' | 'in' | 'seat' | 'back' }

export type Sim = ReturnType<typeof createSim>

export function createSim(town: Town, lab: Lab) {
  const sim = {
    town,
    parts: new Map<string, Part>(),
    vehicles: [] as Vehicle[],
    ambient: [] as Ambient[],
    spots: SPOTS.map(() => null as Part | null),
    slots: [] as (Part | null)[],
    removals: [] as Part[],
    arm: { pos: REST.clone(), steps: [] as { to: Vector3; arrive?: () => boolean | void }[], holding: null as Part | null, grip: 0, job: null as Part | null },
    drone: { pos: new Vector3(9.6, 3.4, 0), welds: [] as Vector3[], weldT: 0, show: lab.setup.agent === 'none' ? 0 : 1 },
    pulses: [] as { slot: number; t: number }[],
    time: 0,
    version: 0,
    binsDirty: new Set<number>(),
    follow: null as Part | null,
    followSeq: 0,
    padOwner: null as Vehicle | null,
    lastDepart: new Map<number, number>(),
    log: [] as Event[],
    nextId: 1,
    carrier: 'truck' as Carrier,
    crane: new Vector3(9.6, 0, -0.3),
  }
  for (const ref of lab.setup.items) {
    const bin = town.byRef.get(ref)
    if (!bin) continue
    const part = newPart(bin)
    part.where = 'board'
    part.slot = sim.slots.length
    sim.slots.push(part)
    part.form = part.formTo = 1
    toWorld(slotLocal(part.slot), part.pos)
    sim.parts.set(ref, part)
    sim.binsDirty.add(bin.index)
  }
  return sim
}

function newPart(bin: Bin): Part {
  return { ref: bin.item.ref, item: bin.item, bin, where: 'truck', vehicle: null, spot: -1, slot: -1, pos: new Vector3(), form: 0, formTo: 0, fly: null, seatedAt: 0 }
}

const say = (sim: Sim, text: string, tone: Event['tone']) => {
  sim.log.push({ id: sim.nextId++, t: sim.time, text, tone })
  if (sim.log.length > 40) sim.log.shift()
}

function launch(sim: Sim, kind: Carrier, role: Vehicle['role'], building: number, t: Track, cargo: Part | null, depart = sim.time): Vehicle {
  const v: Vehicle = { id: sim.nextId++, kind, role, building, track: t, s: 0, v: 0, cargo, pos: new Vector3(), dir: new Vector3(1, 0, 0), yaw: 0, depart, wait: 0, done: false }
  sample(t, 0, v.pos, v.dir)
  v.yaw = Math.atan2(-v.dir.z, v.dir.x)
  if (cargo) {
    cargo.vehicle = v
    cargo.where = 'truck'
    cargo.formTo = 0
  }
  sim.vehicles.push(v)
  sim.version++
  return v
}

const roofOf = (sim: Sim, b: number) => sim.town.buildings[b].roof.clone().add(new Vector3(0, 0.8, 0))
const bedWorld = (lift = 0) => toWorld(PAD_LOCAL).setY(0.62 + lift)

function outbound(sim: Sim, b: number, kind: Carrier) {
  const bld = sim.town.buildings[b]
  return kind === 'truck' ? track(route(PAD, PAD_ROAD, bld.door, bld.road)) : track(flight(bedWorld(1), roofOf(sim, b)))
}

function dispatch(sim: Sim, bin: Bin) {
  const part = newPart(bin)
  const bld = sim.town.buildings[bin.building]
  const kind = sim.carrier
  const t = kind === 'truck' ? track(route(bld.door, bld.road, PAD, PAD_ROAD)) : track(flight(roofOf(sim, bin.building), bedWorld(1)))
  const depart = Math.max(sim.time, (sim.lastDepart.get(bin.building) ?? -9) + (kind === 'truck' ? 0.5 : 0.35))
  sim.lastDepart.set(bin.building, depart)
  sim.parts.set(part.ref, part)
  launch(sim, kind, 'deliver', bin.building, t, part, depart)
  sim.binsDirty.add(bin.index)
  sim.follow = part
  sim.followSeq++
  say(sim, `${kind === 'truck' ? 'Truck' : 'Drone'} leaves ${bld.name} with ${bin.item.title}`, 'out')
}

function uTurn(sim: Sim, v: Vehicle, role: Vehicle['role']) {
  v.track = reverseFrom(v.track, v.s)
  v.s = 0
  v.v *= 0.3
  v.role = role
  v.wait = 0
  if (sim.padOwner === v) sim.padOwner = null
}

const tmp = new Vector3()
const tmp2 = new Vector3()
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
const wanted = (lab: Lab, p: Part) => lab.selected.has(p.ref)
const gripOf = (p: Part, out = tmp2) => out.set(0, 0.62 + (CRATE / FACTORY.s / 2) * (1 - p.formTo) + 0.05 * p.formTo, 0)

export function step(sim: Sim, lab: Lab, dt: number) {
  sim.time += dt
  for (const ref of lab.selected) {
    if (sim.parts.has(ref)) continue
    const bin = sim.town.byRef.get(ref)
    if (bin) dispatch(sim, bin)
  }
  for (const p of sim.parts.values()) {
    const want = wanted(lab, p)
    const v = p.vehicle
    if (!want && p.where === 'truck' && v && v.role === 'deliver') {
      if (sim.time < v.depart) {
        v.done = true
        sim.parts.delete(p.ref)
        sim.binsDirty.add(p.bin.index)
        sim.version++
      } else uTurn(sim, v, 'return')
      say(sim, `${p.item.title} recalled, ${v.kind} turns around`, 'back')
    } else if (want && p.where === 'truck' && v && v.role === 'return') {
      uTurn(sim, v, 'deliver')
      sim.follow = p
      sim.followSeq++
      say(sim, `${p.item.title} wanted again, ${v.kind} turns back`, 'out')
    } else if (!want && p.where === 'staged') {
      sim.spots[p.spot] = null
      p.spot = -1
      launch(sim, sim.carrier, 'return', p.bin.building, outbound(sim, p.bin.building, sim.carrier), p)
      say(sim, `${p.item.title} sent back from the dock`, 'back')
    } else if (!want && p.where === 'board' && sim.arm.job !== p && !sim.removals.includes(p)) {
      sim.removals.push(p)
      sim.follow = p
      sim.followSeq++
    }
    else if (want && p.where === 'board' && sim.removals.includes(p)) sim.removals.splice(sim.removals.indexOf(p), 1)
  }

  const driveway = PAD_ROAD.distanceTo(PAD)
  if (sim.padOwner && (sim.padOwner.done || (sim.padOwner.role !== 'deliver' && sim.padOwner.s > driveway + 0.6))) sim.padOwner = null
  const waiting = sim.vehicles
    .filter((v) => v.kind === 'truck' && v.role === 'deliver' && !v.done && v !== sim.padOwner && sim.time >= v.depart)
    .sort((a, b) => a.track.total - a.s - (b.track.total - b.s))
  for (const v of sim.vehicles) {
    if (v.done || sim.time < v.depart) continue
    const top = v.kind === 'truck' ? 8 : 11
    let limit = v.track.total
    if (v.kind === 'truck' && v.role === 'deliver' && sim.padOwner !== v) {
      if (!sim.padOwner && v.track.total - v.s < driveway + 1.2) sim.padOwner = v
      else limit = v.track.total - driveway - 1 - 1.8 * waiting.indexOf(v)
    }
    const left = limit - v.s
    const cap = Math.sqrt(Math.max(0, 2 * 9 * left)) + (left > 0.05 ? 0.4 : 0)
    v.v = Math.min(top, cap, v.v + 9 * dt)
    v.s = Math.min(limit, v.s + v.v * dt)
    if (v.s < 0) v.s = 0
    sample(v.track, v.s, v.pos, v.dir)
    if (v.dir.x || v.dir.z) {
      let target = Math.atan2(-v.dir.z, v.dir.x)
      while (target - v.yaw > Math.PI) target -= Math.PI * 2
      while (target - v.yaw < -Math.PI) target += Math.PI * 2
      v.yaw += (target - v.yaw) * (1 - Math.exp(-dt * 9))
    }
    if (v.kind === 'truck') lane(v.pos, v.yaw)
    if (v.cargo && v.cargo.where === 'truck') {
      v.cargo.pos.copy(v.pos)
      v.cargo.pos.y += v.kind === 'truck' ? 0.62 : -0.35
    }
    if (v.s < v.track.total - 0.01) continue
    if (v.role === 'deliver' && v.cargo) {
      v.wait += dt
      const spot = sim.spots.findIndex((s) => !s)
      if (v.wait > 0.35 && spot >= 0) {
        const p = v.cargo
        sim.spots[spot] = p
        p.spot = spot
        p.where = 'staged'
        p.vehicle = null
        p.fly = { from: p.pos.clone(), to: toWorld(SPOTS[spot]).setY(CRATE / 2 + 0.63), t: 0 }
        v.cargo = null
        uTurn(sim, v, 'empty')
        say(sim, `${p.item.title} unloaded at the factory dock`, 'in')
      }
    } else if (v.role === 'return' && v.cargo) {
      const p = v.cargo
      sim.parts.delete(p.ref)
      sim.binsDirty.add(p.bin.index)
      v.done = true
      sim.version++
      say(sim, `${p.item.title} back on its shelf at ${sim.town.buildings[p.bin.building].name}`, 'back')
    } else {
      v.done = true
      sim.version++
    }
  }
  if (sim.vehicles.some((v) => v.done)) {
    sim.vehicles = sim.vehicles.filter((v) => !v.done)
    sim.version++
  }

  const arm = sim.arm
  const freeSlot = () => {
    const at = sim.slots.findIndex((s) => !s)
    if (at >= 0) return at
    sim.slots.push(null)
    return sim.slots.length - 1
  }
  if (!arm.steps.length) {
    const removal = sim.removals[0]
    const staged = sim.spots.filter((s): s is Part => !!s).sort((a, b) => a.seatedAt - b.seatedAt)[0]
    if (removal && removal.where !== 'board') sim.removals.shift()
    else if (removal) {
      sim.removals.shift()
      arm.job = removal
      const at = slotLocal(removal.slot).add(gripOf(removal))
      const bed = PAD_LOCAL.clone().setY(PAD_LOCAL.y)
      arm.steps = [
        { to: at.clone().setY(at.y + 1.4) },
        {
          to: at,
          arrive: () => {
            if (wanted(lab, removal) || removal.where !== 'board') return false
            sim.slots[removal.slot] = null
            removal.slot = -1
            removal.where = 'arm'
            removal.formTo = 0
            arm.holding = removal
          },
        },
        { to: at.clone().setY(at.y + 2) },
        { to: bed.clone().add(new Vector3(0, 2.4, 0)) },
        {
          to: bed.clone().add(gripOf(removal, new Vector3())),
          arrive: () => {
            arm.holding = null
            launch(sim, sim.carrier, 'return', removal.bin.building, outbound(sim, removal.bin.building, sim.carrier), removal)
            say(sim, `${removal.item.title} pulled off the board, returning`, 'back')
          },
        },
        { to: bed.clone().add(new Vector3(0, 2.2, 0)) },
      ]
    } else if (staged) {
      const p = staged
      arm.job = p
      const pick = SPOTS[p.spot].clone().setY(0.9 + CRATE / FACTORY.s / 2).add(new Vector3(0, 0.62, 0))
      arm.steps = [
        { to: pick.clone().setY(pick.y + 1.2) },
        {
          to: pick,
          arrive: () => {
            if (p.where !== 'staged') return false
            sim.spots[p.spot] = null
            p.spot = -1
            p.where = 'arm'
            p.formTo = 1
            arm.holding = p
            const slot = freeSlot()
            p.slot = slot
            sim.slots[slot] = p
            const at = slotLocal(slot).add(new Vector3(0, 0.67, 0))
            arm.steps.push({ to: pick.clone().setY(pick.y + 2) }, { to: at.clone().setY(at.y + 1.5) }, {
              to: at,
              arrive: () => {
                arm.holding = null
                p.where = 'board'
                p.seatedAt = sim.time
                sim.pulses.push({ slot, t: 0 })
                sim.crane.copy(slotLocal(slot))
                if (lab.setup.agent !== 'none') sim.drone.welds.push(slotLocal(slot))
                say(sim, `${p.item.title} seated on your app board`, 'seat')
              },
            }, { to: at.clone().setY(at.y + 1.3) })
          },
        },
      ]
    }
  }
  const target = arm.steps[0]?.to ?? REST
  const rush = 1 + Math.min(1.4, (sim.removals.length + sim.spots.filter(Boolean).length) * 0.25)
  tmp.copy(target).sub(arm.pos)
  const dist = tmp.length()
  const move = Math.min(dist * (1 - Math.exp(-dt * 11 * rush)), 18 * rush * dt)
  if (dist > 1e-5) arm.pos.addScaledVector(tmp, move / dist)
  if (arm.steps.length && arm.pos.distanceTo(target) < 0.05) {
    const s = arm.steps.shift()!
    if (s.arrive?.() === false) arm.steps = []
    if (!arm.steps.length) arm.job = null
  }
  arm.grip += ((arm.holding ? 1 : 0) - arm.grip) * (1 - Math.exp(-dt * 14))
  if (arm.holding) toWorld(tmp.copy(arm.pos).sub(gripOf(arm.holding)), arm.holding.pos)

  for (const p of sim.parts.values()) {
    p.form += (p.formTo - p.form) * (1 - Math.exp(-dt * 8))
    if (p.fly) {
      p.fly.t = Math.min(1, p.fly.t + dt / 0.5)
      const t = p.fly.t
      p.pos.lerpVectors(p.fly.from, p.fly.to, t)
      p.pos.y += 1.2 * 4 * t * (1 - t)
      if (t >= 1) p.fly = null
      if (p.where !== 'staged') p.fly = null
    } else if (p.where === 'board') {
      toWorld(slotLocal(p.slot, tmp), tmp)
      tmp.y += TILE[1] / 2
      p.pos.lerp(tmp, 1 - Math.exp(-dt * 16))
    }
    if (p.where === 'staged' && !p.seatedAt) p.seatedAt = sim.time
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

  for (const a of sim.ambient) {
    a.s += a.speed * dt * clamp((a.track.total - a.s) / 2 + 0.3, 0.3, 1)
    if (a.s >= a.track.total - 0.02) {
      const next = ambientTrack(sim, a.toCommunity, a.track.pts[a.track.pts.length - 1], a.drone)
      a.track = next.t
      a.toCommunity = !a.toCommunity
      a.s = 0
    }
    sample(a.track, a.s, a.pos, a.dir)
    let target = Math.atan2(-a.dir.z, a.dir.x)
    while (target - a.yaw > Math.PI) target -= Math.PI * 2
    while (target - a.yaw < -Math.PI) target += Math.PI * 2
    a.yaw += (target - a.yaw) * (1 - Math.exp(-dt * 8))
    if (!a.drone) lane(a.pos, a.yaw)
  }
}

/** Keep right: offset from the centerline by the smoothed heading, so corners and U-turns swing wide. */
function lane(pos: Vector3, yaw: number) {
  pos.x += Math.sin(yaw) * 0.55
  pos.z += Math.cos(yaw) * 0.55
}

let seed = 7
const rand = () => {
  seed = (seed * 16807) % 2147483647
  return seed / 2147483647
}

function ambientTrack(sim: Sim, fromCommunity: boolean, from: Vector3, drone: boolean) {
  const { buildings, communities } = sim.town
  const b = buildings[Math.floor(rand() * buildings.length)]
  const c = communities[Math.floor(rand() * communities.length)]
  const start = fromCommunity ? c : b
  const end = fromCommunity ? b : c
  const startDoor = from.lengthSq() ? from : start.door
  const startRoad = fromCommunity
    ? communities.reduce((best, x) => (x.door.distanceTo(startDoor) < best.door.distanceTo(startDoor) ? x : best)).road
    : buildings.reduce((best, x) => (x.door.distanceTo(startDoor) < best.door.distanceTo(startDoor) ? x : best)).road
  if (drone) {
    const hi = (p: Vector3) => p.clone().setY(2.5)
    return { t: track(flight(hi(startDoor), hi(end.door))) }
  }
  return { t: track(route(startDoor, startRoad, end.door, end.road)) }
}

export function setTraffic(sim: Sim, count: number) {
  if (!sim.town.communities.length) count = 0
  while (sim.ambient.length > count) sim.ambient.pop()
  while (sim.ambient.length < count) {
    const drone = sim.ambient.length % 5 === 4
    const toCommunity = rand() > 0.5
    const { t } = ambientTrack(sim, !toCommunity, new Vector3(), drone)
    const a: Ambient = { track: t, s: rand() * t.total * 0.9, speed: drone ? 7 : 4.5 + rand() * 2.5, toCommunity, pos: new Vector3(), dir: new Vector3(1, 0, 0), yaw: 0, drone }
    sample(t, a.s, a.pos, a.dir)
    a.yaw = Math.atan2(-a.dir.z, a.dir.x)
    sim.ambient.push(a)
  }
}

export const inFlight = (sim: Sim) => sim.vehicles.filter((v) => v.cargo && sim.time >= v.depart)
export { clamp }
