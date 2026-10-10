import { useFrame } from '@react-three/fiber'
import { Edges, Line } from '@react-three/drei'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { CanvasTexture, Color, Group, Mesh, Points, SRGBColorSpace, Texture, TextureLoader, Vector3 } from 'three'
import type { BufferAttribute } from 'three'

import { agents, databases, frameworks } from '../../../../workspace/-workspace/workspace.constants'
import type { CatalogItem } from '../../../../workspace/-workspace/workspace.types'
import type { Lab } from '../../lab.types'
import type { Aisle } from '../../warehouse'

export type WorldId = 'blueprint' | 'night' | 'cleanroom' | 'island' | 'desk'

export type Look = {
  world: WorldId
  bg: string
  surface: string
  fg: string
  muted: string
  edge: string
  dim: string
  board: string
  chip: string
  chipFg: string
  accent: string
  floor: string
  floorEdge: string
  l: number
  s: number
  flat: boolean
  rough: number
  shadow: number
}

export const TABLE_Y = 0.9
export const BELT = { start: -3.7, end: 1.7, z: 1.6, y: 0.9, speed: 3.4, gap: 1.2 }
export const BASE = { x: 4.2, z: -1.4 }
const H0 = 1.9
const L1 = 5.6
const L2 = 5.4
export const BOARD = { x0: 5.2, x1: 13.95, z0: -3.75, z1: 3.15, y: 0.45 }
export const CHIPS = { framework: new Vector3(8.35, 0, -0.3), database: new Vector3(10.85, 0, -0.3) }
const CHIP = 1.7
const TOSS = new Vector3(2.4, 4.4, 0.2)
const REST = new Vector3(2.6, 3.6, 0.6)
const DRAWER = { w: 2.0, h: 0.5, d: 2.0, gapX: 2.1, gapY: 0.6, x0: -9.4, base: 0.75, front: -1.0 }
export const TABLE = { x0: -10.55, x1: -4.05, z0: -0.1, z1: 4.6 }
export const PAGE = 20

type Mode = 'home' | 'queued' | 'belt' | 'held' | 'board' | 'toss'
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
  needsTexture: boolean
  onPage: boolean
  pad: number
  live: boolean
}
type Step = { to: Vector3; arrive?: () => boolean | void }
export type Sim = {
  parts: Map<string, Part>
  list: Part[]
  feed: Part[]
  belt: Part[]
  removals: Part[]
  slots: (Part | null)[]
  arm: { pos: Vector3; steps: Step[]; holding: Part | null; grip: number; job: Part | null }
  drone: { pos: Vector3; welds: Vector3[]; weldT: number; show: number }
  pulses: { slot: number; t: number }[]
  time: number
  live: Set<Part>
  liveVersion: number
  latest: Part | null
  addSeq: number
  seat: { part: Part; t: number } | null
  air: number
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
export const tint = (hue: number, c: Look, l = c.l) => `hsl(${hue}, ${c.s}%, ${l}%)`

const SLOTS = (() => {
  const out: { x: number; z: number; i: number; j: number }[] = []
  for (let i = 0; i < 7; i++)
    for (let j = 0; j < 7; j++) {
      if (i >= 1 && i <= 5 && j >= 2 && j <= 4) continue
      out.push({ x: 5.85 + i * 1.25, z: -3.15 + j * 0.95, i, j })
    }
  return out.sort((a, b) => Math.hypot(a.x - 9.6, (a.z + 0.3) * 1.3) - Math.hypot(b.x - 9.6, (b.z + 0.3) * 1.3))
})()

const TRACES = SLOTS.map((s) => {
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
function drawerPos(cat: number) {
  const col = cat % 3, row = Math.floor(cat / 3)
  return new Vector3(DRAWER.x0 + col * DRAWER.gapX, DRAWER.base + (5 - row) * DRAWER.gapY + DRAWER.h / 2, DRAWER.front)
}
function padPos(index: number) {
  return new Vector3(-9.7 + (index % 5) * 1.2, TABLE_Y, 0.55 + Math.floor(index / 5) * 0.95)
}
function homeOf(p: Part, out: Vector3) {
  if (p.onPage) return out.copy(padPos(p.pad)).setY(TABLE_Y + p.size[1] / 2)
  return out.copy(drawerPos(p.cat)).setZ(DRAWER.front + 0.1)
}

function startFly(p: Part, to: Vector3, dur: number, h: number, then: Mode, delay = 0, s1 = 1) {
  p.fly = { from: p.pos.clone(), to: to.clone(), t: -delay, dur, h, then, s0: p.scale, s1 }
}

export function createSim(lab: Lab): Sim {
  const aisleIndex = new Map(lab.warehouse.aisles.map((a, i) => [a.id, i]))
  const list: Part[] = lab.catalog.items.map((item) => {
    const cat = aisleIndex.get(item.category) ?? 0
    const block = item.kind === 'block'
    return {
      item, cat, code: lab.warehouse.bins.get(item.ref)?.code ?? '',
      size: block ? [0.96, 0.1, 0.72] : [0.56, 0.42, 0.56],
      pos: drawerPos(cat), scale: 0.2, spin: 0, mode: 'home', fly: null, beltX: 0, slot: -1, visible: false, needsTexture: false,
      onPage: false, pad: 0, live: false,
    }
  })
  const sim: Sim = {
    parts: new Map(list.map((p) => [p.item.ref, p])), list, feed: [], belt: [], removals: [], slots: [],
    arm: { pos: REST.clone(), steps: [], holding: null, grip: 0, job: null },
    drone: { pos: new Vector3(9.6, 3.4, 0), welds: [], weldT: 0, show: lab.setup.agent === 'none' ? 0 : 1 },
    pulses: [], time: 0, live: new Set(), liveVersion: 0, latest: null, addSeq: 0, seat: null, air: 0,
  }
  for (const ref of lab.setup.items) {
    const p = sim.parts.get(ref)
    if (!p) continue
    p.slot = sim.slots.length
    sim.slots.push(p)
    p.mode = 'board'
    p.scale = 1
    p.visible = true
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

const tmp = new Vector3()
const tmp2 = new Vector3()

export function step(sim: Sim, lab: Lab, dt: number) {
  sim.time += dt
  const wanted = lab.selected
  const freeSlot = () => {
    const at = sim.slots.findIndex((s) => !s)
    if (at >= 0) return at
    sim.slots.push(null)
    return sim.slots.length - 1
  }
  const grip = (p: Part) => tmp2.set(0, 0.62 + p.size[1] / 2, 0)

  for (const p of sim.list) {
    const want = wanted.has(p.item.ref)
    if (want && p.mode === 'home' && !p.fly) {
      p.mode = 'queued'
      sim.feed.push(p)
      sim.latest = p
      sim.addSeq++
    } else if (!want && p.mode === 'queued') {
      p.mode = 'home'
      sim.feed.splice(sim.feed.indexOf(p), 1)
    } else if (!want && p.mode === 'belt') {
      sim.belt.splice(sim.belt.indexOf(p), 1)
      p.mode = 'toss'
      startFly(p, homeOf(p, tmp), 0.8, 2.6, 'home', 0, p.onPage ? 1 : 0.2)
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
  sim.belt.forEach((p, i) => {
    if (p.fly) return
    const limit = i === 0 ? BELT.end : sim.belt[i - 1].beltX - BELT.gap
    p.beltX = Math.max(p.beltX, Math.min(p.beltX + BELT.speed * dt, limit))
    p.pos.set(p.beltX, BELT.y + p.size[1] / 2, BELT.z)
    if (p.beltX > -3.6 && p.beltX < -2.6) sim.air = 0.4
  })

  const arm = sim.arm
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
            if (wanted.has(removal.item.ref) || removal.mode !== 'board') return false
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
            removal.mode = 'toss'
            startFly(removal, homeOf(removal, tmp), 1.05, 3.6, 'home', 0, removal.onPage ? 1 : 0.2)
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
            const slot = freeSlot()
            head.slot = slot
            sim.slots[slot] = head
            const at = slotPos(slot, head.size[1]).add(grip(head))
            arm.steps.push({ to: pick.clone().setY(pick.y + 2) }, { to: at.clone().setY(at.y + 1.5) }, {
              to: at,
              arrive: () => {
                arm.holding = null
                if (!lab.selected.has(head.item.ref)) {
                  sim.slots[slot] = null
                  head.slot = -1
                  head.mode = 'toss'
                  startFly(head, homeOf(head, tmp), 1.05, 3.6, 'home', 0, head.onPage ? 1 : 0.2)
                  return
                }
                head.mode = 'board'
                sim.seat = { part: head, t: sim.time }
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
  const rush = 1 + Math.min(1.2, (sim.belt.length + sim.removals.length + sim.feed.length) * 0.18)
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
  if (arm.holding) arm.holding.pos.copy(arm.pos).sub(grip(arm.holding))

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
        startFly(p, tmp, 0.5, into ? 0.6 : 1.3, p.mode, into ? 0 : 0.08 + p.pad * 0.035, into ? 0.2 : 1)
        if (!into) p.scale = Math.max(p.scale, 0.2)
      } else {
        p.pos.lerp(tmp, 1 - Math.exp(-dt * 12))
        if (p.mode === 'queued') p.pos.y += Math.abs(Math.sin(sim.time * 9 + p.pad)) * 0.18
        p.visible = p.onPage || p.mode === 'queued'
        p.scale = p.visible ? 1 : 0.2
      }
    } else if (p.mode === 'board') {
      slotPos(p.slot, p.size[1], tmp)
      p.pos.lerp(tmp, 1 - Math.exp(-dt * 16))
      p.visible = true
      p.scale = 1
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

export function textTexture(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  draw(canvas.getContext('2d')!)
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 8
  return texture
}
export const FONT = '"Timeless Grotesk", ui-sans-serif, system-ui, sans-serif'

export function Surf({ c, color, attach }: { c: Look; color: string; attach?: string }) {
  return c.flat ? (
    <meshBasicMaterial attach={attach} color={color} />
  ) : (
    <meshStandardMaterial attach={attach} color={color} roughness={c.rough} />
  )
}

export function Box({ size, color, edge, position, c, children }: {
  size: [number, number, number]; color: string; edge: string; position?: [number, number, number]; c: Look; children?: ReactNode
}) {
  return (
    <mesh position={position}>
      <boxGeometry args={size} />
      <Surf c={c} color={color} />
      <Edges color={edge} />
      {children}
    </mesh>
  )
}

export type Tip = { show: (e: PointerEvent, title: string, sub: string) => void; move: (e: PointerEvent) => void; hide: () => void }
export type Guard = { moved: boolean }

export function Cabinet({ aisles, active, matches, onOpen, c, tip, guard }: {
  aisles: readonly Aisle[]; active: number; matches: number[] | null; onOpen: (i: number) => void; c: Look; tip: Tip; guard: Guard
}) {
  const groups = useRef<(Group | null)[]>([])
  const labels = useMemo(
    () =>
      aisles.map((aisle, i) =>
        textTexture(400, 100, (ctx) => {
          const none = matches && !matches[i]
          ctx.fillStyle = c.surface
          ctx.fillRect(0, 0, 400, 100)
          ctx.globalAlpha = none ? 0.3 : 1
          ctx.fillStyle = tint(aisle.hue, c)
          ctx.fillRect(20, 30, 10, 40)
          ctx.fillStyle = c.fg
          ctx.font = `500 36px ${FONT}`
          ctx.fillText(aisle.label.length > 13 ? `${aisle.label.slice(0, 12)}…` : aisle.label, 46, 62)
          ctx.fillStyle = matches && matches[i] ? c.accent : c.muted
          ctx.font = `400 28px ${FONT}`
          ctx.textAlign = 'right'
          ctx.fillText(matches ? `${matches[i]}/${aisle.count}` : String(aisle.count), 380, 62)
        }),
      ),
    [aisles, c, matches],
  )
  useFrame((_, dt) => {
    groups.current.forEach((g, i) => {
      if (!g) return
      const z = DRAWER.front - DRAWER.d / 2 + (i === active ? 0.75 : 0)
      g.position.z += (z - g.position.z) * (1 - Math.exp(-dt * 10))
    })
  })
  const width = DRAWER.gapX * 3 + 0.1
  const height = DRAWER.gapY * 6 + 0.1
  return (
    <group>
      <Box c={c} size={[width, 0.12, DRAWER.d + 0.2]} position={[DRAWER.x0 + DRAWER.gapX, DRAWER.base + height + 0.02, DRAWER.front - DRAWER.d / 2 - 0.05]} color={c.surface} edge={c.edge} />
      <Box c={c} size={[width, DRAWER.base, DRAWER.d + 0.2]} position={[DRAWER.x0 + DRAWER.gapX, DRAWER.base / 2, DRAWER.front - DRAWER.d / 2 - 0.05]} color={c.surface} edge={c.edge} />
      <Box c={c} size={[width, height, 0.1]} position={[DRAWER.x0 + DRAWER.gapX, DRAWER.base + height / 2, DRAWER.front - DRAWER.d - 0.1]} color={c.surface} edge={c.edge} />
      {aisles.map((aisle, i) => {
        const at = drawerPos(i)
        return (
          <group key={aisle.id} ref={(g) => { groups.current[i] = g }} position={[at.x, at.y, DRAWER.front - DRAWER.d / 2]}>
            <mesh
              onClick={(e) => { e.stopPropagation(); if (!guard.moved) onOpen(i) }}
              onPointerOver={(e) => { e.stopPropagation(); tip.show(e.nativeEvent, aisle.label, `Aisle ${String(aisle.no).padStart(2, '0')} · ${aisle.count} parts · ${aisle.racks.length} registries`) }}
              onPointerMove={(e) => tip.move(e.nativeEvent)}
              onPointerOut={() => tip.hide()}
            >
              <boxGeometry args={[DRAWER.w, DRAWER.h, DRAWER.d]} />
              {[0, 1, 2, 3, 5].map((k) => <Surf key={k} c={c} attach={`material-${k}`} color={c.surface} />)}
              <meshBasicMaterial attach="material-4" map={labels[i]} toneMapped={false} />
              <Edges color={i === active ? c.accent : c.edge} />
            </mesh>
          </group>
        )
      })}
    </group>
  )
}

export function Table({ c, count, label, pages, page, setPage, tip, guard }: {
  c: Look; count: number; label: string; pages: number; page: number; setPage: (n: number) => void; tip: Tip; guard: Guard
}) {
  const legs: [number, number][] = [[TABLE.x0 + 0.15, TABLE.z0 + 0.15], [TABLE.x1 - 0.15, TABLE.z0 + 0.15], [TABLE.x0 + 0.15, TABLE.z1 - 0.15], [TABLE.x1 - 0.15, TABLE.z1 - 0.15]]
  const strip = useMemo(
    () =>
      textTexture(1024, 96, (ctx) => {
        ctx.fillStyle = c.surface
        ctx.fillRect(0, 0, 1024, 96)
        ctx.fillStyle = c.muted
        ctx.font = `500 34px ${FONT}`
        ctx.fillText(label, 110, 60)
        ctx.textAlign = 'right'
        ctx.fillStyle = c.fg
        ctx.fillText(`${page + 1} / ${pages}`, 910, 60)
        ctx.strokeStyle = pages > 1 ? c.fg : c.dim
        ctx.lineWidth = 4
        ctx.beginPath()
        ctx.moveTo(60, 28); ctx.lineTo(36, 48); ctx.lineTo(60, 68)
        ctx.moveTo(964, 28); ctx.lineTo(988, 48); ctx.lineTo(964, 68)
        ctx.stroke()
      }),
    [c, label, page, pages],
  )
  const cx = (TABLE.x0 + TABLE.x1) / 2, w = TABLE.x1 - TABLE.x0
  return (
    <group>
      <Box c={c} size={[w, 0.12, TABLE.z1 - TABLE.z0]} position={[cx, TABLE_Y - 0.06, (TABLE.z0 + TABLE.z1) / 2]} color={c.surface} edge={c.edge} />
      {legs.map(([x, z]) => (
        <Box c={c} key={`${x}${z}`} size={[0.12, TABLE_Y - 0.12, 0.12]} position={[x, (TABLE_Y - 0.12) / 2, z]} color={c.surface} edge={c.edge} />
      ))}
      {Array.from({ length: count }, (_, i) => {
        const p = padPos(i)
        const y = TABLE_Y + 0.004
        return (
          <Line
            key={`${label}-${i}`}
            points={[[p.x - 0.52, y, p.z - 0.4], [p.x + 0.52, y, p.z - 0.4], [p.x + 0.52, y, p.z + 0.4], [p.x - 0.52, y, p.z + 0.4], [p.x - 0.52, y, p.z - 0.4]]}
            color={c.edge}
            lineWidth={1}
            dashed
            dashSize={0.08}
            gapSize={0.06}
          />
        )
      })}
      <mesh
        position={[cx, TABLE_Y + 0.005, TABLE.z1 - 0.38]}
        rotation={[-Math.PI / 2, 0, 0]}
        onClick={(e) => {
          e.stopPropagation()
          if (guard.moved || pages < 2) return
          const local = e.point.x - cx
          setPage((page + (local < 0 ? pages - 1 : 1)) % pages)
        }}
        onPointerOver={(e) => { e.stopPropagation(); tip.show(e.nativeEvent, 'Pick tray', pages > 1 ? 'Click left or right half to change bay' : 'One bay') }}
        onPointerMove={(e) => tip.move(e.nativeEvent)}
        onPointerOut={() => tip.hide()}
      >
        <planeGeometry args={[w - 0.3, (w - 0.3) * (96 / 1024)]} />
        <meshBasicMaterial map={strip} toneMapped={false} />
      </mesh>
    </group>
  )
}

export function Belt({ c }: { c: Look }) {
  const slats = useRef<(Mesh | null)[]>([])
  const len = BELT.end - BELT.start + 1.0
  const n = 22
  useFrame(({ clock }) => {
    const offset = (clock.elapsedTime * BELT.speed) % (len / n)
    slats.current.forEach((m, i) => {
      if (m) m.position.x = BELT.start - 0.5 + ((i * len) / n + offset) % len
    })
  })
  const mid = (BELT.start + BELT.end) / 2
  return (
    <group>
      <Box c={c} size={[len, 0.42, 1.3]} position={[mid, BELT.y - 0.29, BELT.z]} color={c.surface} edge={c.edge} />
      <Box c={c} size={[len + 0.1, 0.16, 0.08]} position={[mid, BELT.y + 0.0, BELT.z - 0.7]} color={c.surface} edge={c.edge} />
      <Box c={c} size={[len + 0.1, 0.16, 0.08]} position={[mid, BELT.y + 0.0, BELT.z + 0.7]} color={c.surface} edge={c.edge} />
      {[BELT.start - 0.5, BELT.end + 0.5].map((x) => (
        <mesh key={x} position={[x, BELT.y - 0.25, BELT.z]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.25, 0.25, 1.34, 24]} />
          <Surf c={c} color={c.surface} />
          <Edges color={c.edge} threshold={20} />
        </mesh>
      ))}
      {[[BELT.start + 0.4, 0.95], [BELT.end - 0.4, 0.95], [BELT.start + 0.4, 2.25], [BELT.end - 0.4, 2.25]].map(([x, z]) => (
        <Box c={c} key={`${x}${z}`} size={[0.12, BELT.y - 0.5, 0.12]} position={[x, (BELT.y - 0.5) / 2, z]} color={c.surface} edge={c.edge} />
      ))}
      {Array.from({ length: n }, (_, i) => (
        <mesh key={i} ref={(m) => { slats.current[i] = m }} position={[0, BELT.y - 0.07, BELT.z]}>
          <boxGeometry args={[0.02, 0.01, 1.2]} />
          <meshBasicMaterial color={c.edge} />
        </mesh>
      ))}
    </group>
  )
}

export function Arm({ sim, c }: { sim: Sim; c: Look }) {
  const turret = useRef<Group>(null)
  const shoulder = useRef<Group>(null)
  const elbow = useRef<Group>(null)
  const wrist = useRef<Group>(null)
  const fingers = useRef<(Group | null)[]>([])
  const [busy, setBusy] = useState(false)
  useFrame(() => {
    const w = sim.arm.pos
    const dx = w.x - BASE.x, dz = w.z - BASE.z
    const yaw = Math.atan2(-dz, dx)
    const r = Math.max(Math.hypot(dx, dz), 0.001)
    const h = w.y - H0
    const d = clamp(Math.hypot(r, h), Math.abs(L1 - L2) + 0.05, L1 + L2 - 0.01)
    const phi = Math.atan2(h, r)
    const a = Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1))
    const t1 = phi + a
    const t2 = Math.atan2(h - L1 * Math.sin(t1), r - L1 * Math.cos(t1))
    turret.current!.rotation.y = yaw
    shoulder.current!.rotation.z = t1
    elbow.current!.rotation.z = t2 - t1
    wrist.current!.rotation.z = -t2
    const open = 0.36 - sim.arm.grip * 0.1
    fingers.current.forEach((f, i) => f && (f.position.z = (i ? 1 : -1) * open))
    const holding = !!sim.arm.holding
    if (holding !== busy) setBusy(holding)
  })
  const hi = busy ? c.accent : c.edge
  const joint = (key: string, radius: number, length: number) => (
    <mesh key={key} rotation={[Math.PI / 2, 0, 0]}>
      <cylinderGeometry args={[radius, radius, length, 28]} />
      <Surf c={c} color={c.surface} />
      <Edges color={c.edge} threshold={20} />
    </mesh>
  )
  return (
    <group position={[BASE.x, 0, BASE.z]}>
      <mesh position={[0, 0.18, 0]}>
        <cylinderGeometry args={[0.9, 1.0, 0.36, 40]} />
        <Surf c={c} color={c.surface} />
        <Edges color={c.edge} threshold={20} />
      </mesh>
      <group ref={turret}>
        <mesh position={[0, (H0 + 0.36) / 2, 0]}>
          <cylinderGeometry args={[0.38, 0.5, H0 - 0.36, 28]} />
          <Surf c={c} color={c.surface} />
          <Edges color={c.edge} threshold={20} />
        </mesh>
        <group ref={shoulder} position={[0, H0, 0]}>
          {joint('s', 0.42, 0.9)}
          <Box c={c} size={[L1, 0.3, 0.3]} position={[L1 / 2, 0, 0.3]} color={c.surface} edge={c.edge} />
          <Box c={c} size={[L1, 0.3, 0.3]} position={[L1 / 2, 0, -0.3]} color={c.surface} edge={c.edge} />
          <group ref={elbow} position={[L1, 0, 0]}>
            {joint('e', 0.36, 0.95)}
            <Box c={c} size={[L2, 0.34, 0.34]} position={[L2 / 2, 0, 0]} color={c.surface} edge={c.edge} />
            <group ref={wrist} position={[L2, 0, 0]}>
              {joint('w', 0.24, 0.6)}
              <Box c={c} size={[0.5, 0.3, 0.86]} position={[0, -0.32, 0]} color={c.surface} edge={hi} />
              {[0, 1].map((i) => (
                <group key={i} ref={(g) => { fingers.current[i] = g }}>
                  <Box c={c} size={[0.36, 0.38, 0.06]} position={[0, -0.62, 0]} color={c.surface} edge={hi} />
                </group>
              ))}
            </group>
          </group>
        </group>
      </group>
    </group>
  )
}

export function Board({ lab, sim, c, tip, guard }: { lab: Lab; sim: Sim; c: Look; tip: Tip; guard: Guard }) {
  const traces = useRef<({ material: { color: Color; linewidth: number } } | null)[]>([])
  const pulses = useRef<(Mesh | null)[]>([])
  const chipRefs = useRef<Record<string, Group | null>>({})
  const bump = useRef<Record<string, number>>({ framework: 0, database: 0 })
  const lit = useMemo(() => new Color(c.accent), [c.accent])
  const dim = useMemo(() => new Color(c.dim), [c.dim])
  useFrame((_, dt) => {
    traces.current.forEach((line, s) => {
      if (!line) return
      const on = sim.slots[s]?.mode === 'board'
      line.material.color.copy(on ? lit : dim)
      line.material.linewidth = on ? 2.6 : 1
    })
    pulses.current.forEach((m, i) => {
      const pulse = sim.pulses[i]
      if (!m) return
      m.visible = !!pulse
      if (!pulse) return
      const path = TRACES[pulse.slot % TRACES.length]
      const total = path.slice(1).reduce((sum, p, k) => sum + p.distanceTo(path[k]), 0)
      let left = pulse.t * total
      for (let k = 1; k < path.length; k++) {
        const seg = path[k].distanceTo(path[k - 1])
        if (left <= seg || k === path.length - 1) {
          m.position.lerpVectors(path[k - 1], path[k], clamp(left / seg, 0, 1))
          break
        }
        left -= seg
      }
    })
    for (const key of ['framework', 'database'] as const) {
      bump.current[key] = Math.max(0, bump.current[key] - dt * 3)
      const g = chipRefs.current[key]
      if (g) g.position.y = Math.sin(bump.current[key] * Math.PI) * 0.6
    }
  })
  const chipTexture = useMemo(() => {
    const make = (title: string, value: string) =>
      textTexture(340, 340, (ctx) => {
        ctx.fillStyle = c.chip
        ctx.fillRect(0, 0, 340, 340)
        ctx.strokeStyle = c.accent
        ctx.lineWidth = 3
        ctx.strokeRect(18, 18, 304, 304)
        ctx.beginPath()
        ctx.arc(46, 46, 9, 0, Math.PI * 2)
        ctx.stroke()
        ctx.fillStyle = c.muted
        ctx.font = `500 26px ${FONT}`
        ctx.fillText(title, 36, 140)
        ctx.fillStyle = c.chipFg
        ctx.font = `500 ${value.length > 9 ? 38 : 50}px ${FONT}`
        ctx.fillText(value, 36, 200)
        ctx.fillStyle = c.muted
        ctx.font = `400 20px ${FONT}`
        ctx.fillText('click to swap ↻', 36, 290)
      })
    return {
      framework: make('FRAMEWORK', frameworks.find((f) => f.value === lab.setup.framework)!.label),
      database: make('DATABASE', databases.find((d) => d.value === lab.setup.database)!.label),
    }
  }, [lab.setup.framework, lab.setup.database, c])
  const cycle = (key: 'framework' | 'database') => {
    bump.current[key] = 1
    if (key === 'framework') lab.set('framework', lab.setup.framework === 'next' ? 'tanstack' : 'next')
    else lab.set('database', lab.setup.database === 'postgres' ? 'mongodb' : 'postgres')
  }
  const cx = (BOARD.x0 + BOARD.x1) / 2, cz = (BOARD.z0 + BOARD.z1) / 2
  const pin = (chip: Vector3) => {
    const pts: [number, number, number][] = []
    const y = BOARD.y + 0.01
    for (let k = 0; k < 7; k++) {
      const o = -0.66 + k * 0.22
      const e = CHIP / 2
      pts.push([chip.x + o, y, chip.z - e], [chip.x + o, y, chip.z - e - 0.16], [chip.x + o, y, chip.z + e], [chip.x + o, y, chip.z + e + 0.16])
      pts.push([chip.x - e, y, chip.z + o], [chip.x - e - 0.16, y, chip.z + o], [chip.x + e, y, chip.z + o], [chip.x + e + 0.16, y, chip.z + o])
    }
    return pts
  }
  return (
    <group>
      <Box c={c} size={[BOARD.x1 - BOARD.x0, 0.12, BOARD.z1 - BOARD.z0]} position={[cx, BOARD.y - 0.06, cz]} color={c.board} edge={c.edge} />
      {[[BOARD.x0 + 0.3, BOARD.z0 + 0.3], [BOARD.x1 - 0.3, BOARD.z0 + 0.3], [BOARD.x0 + 0.3, BOARD.z1 - 0.3], [BOARD.x1 - 0.3, BOARD.z1 - 0.3]].map(([x, z]) => (
        <mesh key={`${x}${z}`} position={[x, (BOARD.y - 0.12) / 2, z]}>
          <cylinderGeometry args={[0.12, 0.12, BOARD.y - 0.12, 16]} />
          <Surf c={c} color={c.surface} />
          <Edges color={c.edge} threshold={20} />
        </mesh>
      ))}
      {TRACES.map((points, s) => (
        <Line key={s} ref={(l) => { traces.current[s] = l as never }} points={points} color={c.dim} lineWidth={1} />
      ))}
      {SLOTS.map((s, i) => {
        const y = BOARD.y + 0.014
        return (
          <Line key={i} points={[[s.x - 0.5, y, s.z - 0.38], [s.x + 0.5, y, s.z - 0.38], [s.x + 0.5, y, s.z + 0.38], [s.x - 0.5, y, s.z + 0.38], [s.x - 0.5, y, s.z - 0.38]]} color={c.dim} lineWidth={1} />
        )
      })}
      {(['framework', 'database'] as const).map((key) => (
        <group key={key} ref={(g) => { chipRefs.current[key] = g }}>
          <Line points={pin(CHIPS[key])} segments color={c.edge} lineWidth={1.4} />
          <mesh
            position={[CHIPS[key].x, BOARD.y + 0.14, CHIPS[key].z]}
            onClick={(e) => { e.stopPropagation(); if (!guard.moved) cycle(key) }}
            onPointerOver={(e) => { e.stopPropagation(); tip.show(e.nativeEvent, key === 'framework' ? 'Framework chip' : 'Database chip', 'Click to swap') }}
            onPointerMove={(e) => tip.move(e.nativeEvent)}
            onPointerOut={() => tip.hide()}
          >
            <boxGeometry args={[CHIP, 0.28, CHIP]} />
            {[0, 1, 3, 4, 5].map((k) => <Surf key={k} c={c} attach={`material-${k}`} color={c.chip} />)}
            <meshBasicMaterial attach="material-2" map={chipTexture[key]} toneMapped={false} />
            <Edges color={c.edge} />
          </mesh>
        </group>
      ))}
      {Array.from({ length: 8 }, (_, i) => (
        <mesh key={i} ref={(m) => { pulses.current[i] = m }} visible={false}>
          <sphereGeometry args={[0.09, 12, 12]} />
          <meshBasicMaterial color={c.accent} toneMapped={false} />
        </mesh>
      ))}
    </group>
  )
}

const loader = new TextureLoader()
function PartMesh({ p, lab, c, tip, guard, query }: { p: Part; lab: Lab; c: Look; tip: Tip; guard: Guard; query: string }) {
  const ref = useRef<Mesh>(null)
  const [texture, setTexture] = useState<Texture | null>(null)
  const [hover, setHover] = useState(false)
  const requested = useRef(false)
  const image = lab.theme === 'dark' ? (p.item.imageDark ?? p.item.image) : p.item.image
  useEffect(() => {
    requested.current = false
    setTexture(null)
  }, [image])
  useFrame(() => {
    const m = ref.current
    if (!m) return
    m.visible = p.visible
    m.position.copy(p.pos)
    if (hover && (p.mode === 'home' || p.mode === 'board')) m.position.y += 0.14
    m.scale.setScalar(p.scale)
    m.rotation.set(p.spin * 0.3, p.spin, 0)
    if (p.needsTexture && image && !requested.current) {
      requested.current = true
      loader.load(image, (t) => {
        t.colorSpace = SRGBColorSpace
        t.anisotropy = 8
        const aspect = (t.image as HTMLImageElement).height / (t.image as HTMLImageElement).width
        const want = p.size[2] / p.size[0]
        if (aspect > want) {
          t.repeat.set(1, want / aspect)
          t.offset.set(0, 1 - want / aspect)
        }
        setTexture(t)
      })
    }
  })
  const side = tint(p.item.hue, c)
  const selected = lab.selected.has(p.item.ref)
  const match = !!query && p.mode === 'board' && matchItem(p.item, query)
  const active = hover || p.mode === 'held' || p.mode === 'queued' || match
  return (
    <mesh
      ref={ref}
      visible={false}
      onClick={(e) => {
        e.stopPropagation()
        if (guard.moved) return
        setHover(false)
        tip.hide()
        lab.toggle(p.item.ref)
      }}
      onPointerOver={(e) => {
        e.stopPropagation()
        setHover(true)
        tip.show(e.nativeEvent, p.item.title, `${p.item.label} · ${p.code} · ${selected ? 'click to send back' : 'click to build'}`)
      }}
      onPointerMove={(e) => tip.move(e.nativeEvent)}
      onPointerOut={() => { setHover(false); tip.hide() }}
    >
      <boxGeometry args={p.size} />
      {[0, 1, 3, 4, 5].map((i) => (
        <Surf key={i} c={c} attach={`material-${i}`} color={side} />
      ))}
      {texture ? (
        <meshBasicMaterial attach="material-2" map={texture} toneMapped={false} />
      ) : (
        <Surf c={c} attach="material-2" color={tint(p.item.hue, c, c.l + 12)} />
      )}
      <Edges color={active ? c.accent : c.edge} />
    </mesh>
  )
}

export const matchItem = (item: CatalogItem, query: string) => {
  const q = query.trim().toLowerCase()
  return !q || item.title.toLowerCase().includes(q) || item.label.toLowerCase().includes(q) || item.ref.toLowerCase().includes(q)
}

export function Parts({ sim, lab, c, tip, guard }: { sim: Sim; lab: Lab; c: Look; tip: Tip; guard: Guard }) {
  const [, force] = useState(0)
  const seen = useRef(-1)
  useFrame(() => {
    if (sim.liveVersion !== seen.current) {
      seen.current = sim.liveVersion
      force((v) => v + 1)
    }
  })
  return (
    <>
      {[...sim.live].map((p) => (
        <PartMesh key={p.item.ref} p={p} lab={lab} c={c} tip={tip} guard={guard} query={lab.focus.query} />
      ))}
    </>
  )
}

export function Drone({ sim, lab, c }: { sim: Sim; lab: Lab; c: Look }) {
  const group = useRef<Group>(null)
  const rotors = useRef<(Group | null)[]>([])
  const glow = useRef<Mesh>(null)
  const points = useRef<Points>(null)
  const label = useRef<{ material: { opacity: number } }>(null)
  const N = 90
  const state = useMemo(() => ({ pos: new Float32Array(N * 3).fill(-1e4), vel: new Float32Array(N * 3), life: new Float32Array(N), next: 0 }), [])
  useFrame(({ camera }, dt) => {
    const g = group.current!
    const d = sim.drone
    if (label.current) label.current.material.opacity = Math.min(1, Math.max(0, (camera.position.distanceTo(d.pos) - 9) / 6))
    g.position.copy(d.pos)
    g.scale.setScalar(Math.max(0.001, d.show))
    g.rotation.z = Math.sin(sim.time * 1.7) * 0.06
    rotors.current.forEach((r) => r && (r.rotation.y += dt * 30))
    const weld = d.welds[0]
    const welding = !!weld && d.weldT > 0
    glow.current!.visible = welding
    if (welding) {
      glow.current!.position.copy(weld).setY(weld.y + 0.06)
      glow.current!.scale.setScalar(0.6 + Math.random() * 0.8)
      for (let k = 0; k < 4; k++) {
        const i = state.next++ % N
        state.pos.set([weld.x + (Math.random() - 0.5) * 0.4, weld.y + 0.06, weld.z + (Math.random() - 0.5) * 0.3], i * 3)
        const a = Math.random() * Math.PI * 2, s = 1 + Math.random() * 2.4
        state.vel.set([Math.cos(a) * s, 1.5 + Math.random() * 3, Math.sin(a) * s], i * 3)
        state.life[i] = 0.35 + Math.random() * 0.35
      }
    }
    for (let i = 0; i < N; i++) {
      if (state.life[i] <= 0) {
        state.pos[i * 3 + 1] = -1e4
        continue
      }
      state.life[i] -= dt
      state.vel[i * 3 + 1] -= 14 * dt
      state.pos[i * 3] += state.vel[i * 3] * dt
      state.pos[i * 3 + 1] = Math.max(BOARD.y + 0.02, state.pos[i * 3 + 1] + state.vel[i * 3 + 1] * dt)
      state.pos[i * 3 + 2] += state.vel[i * 3 + 2] * dt
    }
    const attr = points.current!.geometry.getAttribute('position') as BufferAttribute
    attr.needsUpdate = true
  })
  const body = lab.setup.agent === 'codex' ? c.fg : '#D97757'
  const name = agents.find((a) => a.value === lab.setup.agent)?.label ?? ''
  const tag = useMemo(
    () =>
      textTexture(500, 100, (ctx) => {
        ctx.fillStyle = c.surface
        ctx.strokeStyle = c.edge
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.roundRect(4, 14, 492, 72, 36)
        ctx.fill()
        ctx.stroke()
        ctx.fillStyle = body
        ctx.beginPath()
        ctx.arc(46, 50, 10, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = c.fg
        ctx.font = `500 34px ${FONT}`
        ctx.fillText(`${name} is welding`, 70, 62)
      }),
    [c, body, name],
  )
  return (
    <>
      <group ref={group}>
        <Box c={c} size={[0.8, 0.22, 0.8]} color={c.surface} edge={body} />
        <Box c={c} size={[0.3, 0.14, 0.3]} position={[0, 0.18, 0]} color={body} edge={body} />
        {[[-0.62, -0.62], [0.62, -0.62], [-0.62, 0.62], [0.62, 0.62]].map(([x, z], i) => (
          <group key={i} position={[x, 0.12, z]}>
            <Line points={[[-x * 0.55, -0.02, -z * 0.55], [0, 0, 0]]} color={c.edge} lineWidth={1} />
            <group ref={(r) => { rotors.current[i] = r }}>
              <Line points={[[-0.34, 0.04, 0], [0.34, 0.04, 0]]} color={c.edge} lineWidth={1.4} />
              <Line points={[[0, 0.04, -0.34], [0, 0.04, 0.34]]} color={c.edge} lineWidth={1.4} />
            </group>
          </group>
        ))}
        <Line points={[[0, -0.11, 0], [0, -0.55, 0.1]]} color={body} lineWidth={1.6} />
        <sprite ref={label as never} position={[0, 0.85, 0]} scale={[3.0, 0.6, 1]}>
          <spriteMaterial map={tag} transparent toneMapped={false} depthTest={false} />
        </sprite>
      </group>
      <mesh ref={glow} visible={false}>
        <sphereGeometry args={[0.12, 12, 12]} />
        <meshBasicMaterial color="#FFE2A8" toneMapped={false} />
      </mesh>
      <points ref={points} frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[state.pos, 3]} />
        </bufferGeometry>
        <pointsMaterial color="#FFB347" size={3.5} sizeAttenuation={false} toneMapped={false} />
      </points>
    </>
  )
}
