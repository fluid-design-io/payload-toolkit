import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { ContactShadows, Edges, Line } from '@react-three/drei'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { CanvasTexture, Color, Group, Mesh, Points, SRGBColorSpace, Texture, TextureLoader, Vector3 } from 'three'
import type { BufferAttribute } from 'three'

import { agents, databases, frameworks, packageManagers } from '../../../workspace/-workspace/workspace.constants'
import type { CatalogItem, Category } from '../../../workspace/-workspace/workspace.types'
import type { Lab, MockProps } from '../lab.types'

const ACCENT = '#5A91AD'
const TABLE_Y = 0.9
const BELT = { start: -3.7, end: 1.7, z: 1.6, y: 0.9, speed: 3.4, gap: 1.2 }
const BASE = { x: 4.2, z: -1.4 }
const H0 = 1.9
const L1 = 5.6
const L2 = 5.4
const BOARD = { x0: 5.2, x1: 13.95, z0: -3.75, z1: 3.15, y: 0.45 }
const CHIPS = { framework: new Vector3(8.35, 0, -0.3), database: new Vector3(10.85, 0, -0.3) }
const CHIP = 1.7
const TOSS = new Vector3(2.4, 4.4, 0.2)
const REST = new Vector3(2.6, 3.6, 0.6)
const DRAWER = { w: 2.0, h: 0.5, d: 2.0, gapX: 2.1, gapY: 0.6, x0: -9.4, base: 0.75, front: -1.0 }

type Mode = 'home' | 'queued' | 'belt' | 'held' | 'board' | 'toss'
type Fly = { from: Vector3; to: Vector3; t: number; dur: number; h: number; then: Mode; s0: number; s1: number }
type Part = {
  item: CatalogItem
  cat: number
  index: number
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
}
type Step = { to: Vector3; arrive?: () => boolean | void }
type Sim = {
  parts: Map<string, Part>
  list: Part[]
  feed: Part[]
  belt: Part[]
  removals: Part[]
  slots: (Part | null)[]
  active: number
  arm: { pos: Vector3; steps: Step[]; holding: Part | null; grip: number; job: Part | null }
  drone: { pos: Vector3; welds: Vector3[]; weldT: number; show: number }
  pulses: { slot: number; t: number }[]
  time: number
  meshes: Map<string, Mesh>
}

type Colors = ReturnType<typeof palette>
function palette(theme: Lab['theme']) {
  return theme === 'dark'
    ? { bg: '#090E11', surface: '#1B2327', fg: '#FCFCFC', muted: '#8A9094', edge: '#5C676C', dim: '#33404A', board: '#141D22', paper: '#171D20', l: 42, s: 34 }
    : { bg: '#EDF1F3', surface: '#FFFFFF', fg: '#1D2225', muted: '#727C81', edge: '#9AA4A9', dim: '#C3CBCF', board: '#F5F9FB', paper: '#FFFFFF', l: 64, s: 46 }
}
const tint = (hue: number, c: Colors, l = c.l) => `hsl(${hue}, ${c.s}%, ${l}%)`
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))

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

function slotPos(slot: number, h: number, out = new Vector3()) {
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
function homeOf(p: Part, active: number, out: Vector3) {
  if (p.cat === active) return out.copy(padPos(p.index)).setY(TABLE_Y + p.size[1] / 2)
  return out.copy(drawerPos(p.cat)).setZ(DRAWER.front + 0.1)
}

function startFly(p: Part, to: Vector3, dur: number, h: number, then: Mode, delay = 0, s1 = 1) {
  p.fly = { from: p.pos.clone(), to: to.clone(), t: -delay, dur, h, then, s0: p.scale, s1 }
}

function createSim(lab: Lab, categories: Category[]): Sim {
  const counters = new Map<string, number>()
  const list: Part[] = lab.catalog.items.map((item) => {
    const cat = categories.findIndex((c) => c.id === item.category)
    const index = counters.get(item.category) ?? 0
    counters.set(item.category, index + 1)
    const block = item.kind === 'block'
    return {
      item, cat, index,
      size: block ? [0.96, 0.1, 0.72] : [0.56, 0.42, 0.56],
      pos: drawerPos(cat), scale: 0.2, spin: 0, mode: 'home', fly: null, beltX: 0, slot: -1, visible: false, needsTexture: false,
    }
  })
  const sim: Sim = {
    parts: new Map(list.map((p) => [p.item.ref, p])), list, feed: [], belt: [], removals: [], slots: [], active: 0,
    arm: { pos: REST.clone(), steps: [], holding: null, grip: 0, job: null },
    drone: { pos: new Vector3(9.6, 3.4, 0), welds: [], weldT: 0, show: lab.setup.agent === 'none' ? 0 : 1 },
    pulses: [], time: 0, meshes: new Map(),
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

const tmp = new Vector3()
const tmp2 = new Vector3()

function step(sim: Sim, lab: Lab, dt: number) {
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
    } else if (!want && p.mode === 'queued') {
      p.mode = 'home'
      sim.feed.splice(sim.feed.indexOf(p), 1)
    } else if (!want && p.mode === 'belt') {
      sim.belt.splice(sim.belt.indexOf(p), 1)
      p.mode = 'toss'
      startFly(p, homeOf(p, sim.active, tmp), 0.8, 2.6, 'home', 0, p.cat === sim.active ? 1 : 0.2)
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

  sim.belt.forEach((p, i) => {
    if (p.fly) return
    const limit = i === 0 ? BELT.end : sim.belt[i - 1].beltX - BELT.gap
    p.beltX = Math.max(p.beltX, Math.min(p.beltX + BELT.speed * dt, limit))
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
      const at = slotPos(removal.slot, removal.size[1]).add(grip(removal))
      arm.steps = [
        { to: at.clone().setY(at.y + 1.4) },
        {
          to: at,
          arrive: () => {
            if (wantedRef(lab, removal) || removal.mode !== 'board') return false
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
            startFly(removal, homeOf(removal, sim.active, tmp), 1.05, 3.6, 'home', 0, removal.cat === sim.active ? 1 : 0.2)
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
                if (!wantedRef(lab, head)) {
                  sim.slots[slot] = null
                  head.slot = -1
                  head.mode = 'toss'
                  startFly(head, homeOf(head, sim.active, tmp), 1.05, 3.6, 'home', 0, head.cat === sim.active ? 1 : 0.2)
                  return
                }
                head.mode = 'board'
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
  if (arm.holding) {
    arm.holding.pos.copy(arm.pos).sub(grip(arm.holding))
  }

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
      continue
    }
    if (p.mode === 'home' || p.mode === 'queued') {
      homeOf(p, sim.active, tmp)
      if (p.pos.distanceTo(tmp) > 0.4) {
        const into = p.cat !== sim.active
        startFly(p, tmp, 0.5, into ? 0.6 : 1.3, p.mode, into ? 0 : 0.08 + p.index * 0.035, into ? 0.2 : 1)
        if (!into) p.scale = Math.max(p.scale, 0.2)
        continue
      }
      p.pos.lerp(tmp, 1 - Math.exp(-dt * 12))
      if (p.mode === 'queued') p.pos.y += Math.abs(Math.sin(sim.time * 9 + p.index)) * 0.18
      p.visible = p.cat === sim.active
      p.scale = p.visible ? 1 : 0.2
    } else if (p.mode === 'board') {
      slotPos(p.slot, p.size[1], tmp)
      p.pos.lerp(tmp, 1 - Math.exp(-dt * 16))
      p.visible = true
      p.scale = 1
    }
    if (p.visible) p.needsTexture = true
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
const wantedRef = (lab: Lab, p: Part) => lab.selected.has(p.item.ref)

function textTexture(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  draw(canvas.getContext('2d')!)
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 8
  return texture
}
const FONT = '"Timeless Grotesk", ui-sans-serif, system-ui, sans-serif'

function Rig() {
  const { camera, size } = useThree()
  useLayoutEffect(() => {
    const az = (32 * Math.PI) / 180, el = (31 * Math.PI) / 180
    const dir = new Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el))
    const right = new Vector3(Math.cos(az), 0, -Math.sin(az))
    const up = new Vector3().crossVectors(dir, right).negate()
    const pts = [
      [-10.7, 0, -3.4], [-10.7, 4.6, -3.4], [-10.7, 0, 3.3], [14.1, 0, -3.9], [14.1, 0, 3.3], [BASE.x, 7.4, BASE.z], [9.6, 4.4, -0.3], [1.8, 0, 2.4],
    ].map(([x, y, z]) => new Vector3(x, y, z))
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
    for (const p of pts) {
      x0 = Math.min(x0, p.dot(right)); x1 = Math.max(x1, p.dot(right))
      y0 = Math.min(y0, p.dot(up)); y1 = Math.max(y1, p.dot(up))
    }
    const center = right.clone().multiplyScalar((x0 + x1) / 2).addScaledVector(up, (y0 + y1) / 2)
    camera.position.copy(center).addScaledVector(dir, 60)
    camera.up.set(0, 1, 0)
    camera.lookAt(center)
    camera.zoom = Math.min(size.width / ((x1 - x0) * 1.03), size.height / ((y1 - y0) * 1.12))
    camera.updateProjectionMatrix()
  }, [camera, size.width, size.height])
  return null
}

function Box({ size, color, edge, position, children }: {
  size: [number, number, number]; color: string; edge: string; position?: [number, number, number]; children?: ReactNode
}) {
  return (
    <mesh position={position}>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} roughness={1} />
      <Edges color={edge} />
      {children}
    </mesh>
  )
}

function Cabinet({ categories, active, setActive, c, tip }: { categories: Category[]; active: number; setActive: (i: number) => void; c: Colors; tip: Tip }) {
  const groups = useRef<(Group | null)[]>([])
  const labels = useMemo(
    () =>
      categories.map((cat, i) =>
        textTexture(400, 100, (ctx) => {
          ctx.fillStyle = c.surface
          ctx.fillRect(0, 0, 400, 100)
          ctx.fillStyle = tint(hueOf(cat, i), c)
          ctx.fillRect(20, 30, 10, 40)
          ctx.fillStyle = c.fg
          ctx.font = `500 36px ${FONT}`
          ctx.fillText(cat.label.length > 15 ? `${cat.label.slice(0, 14)}…` : cat.label, 46, 62)
          ctx.fillStyle = c.muted
          ctx.font = `400 28px ${FONT}`
          ctx.textAlign = 'right'
          ctx.fillText(String(cat.count), 380, 62)
        }),
      ),
    [categories, c],
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
      <Box size={[width, 0.12, DRAWER.d + 0.2]} position={[DRAWER.x0 + DRAWER.gapX, DRAWER.base + height + 0.02, DRAWER.front - DRAWER.d / 2 - 0.05]} color={c.surface} edge={c.edge} />
      <Box size={[width, DRAWER.base, DRAWER.d + 0.2]} position={[DRAWER.x0 + DRAWER.gapX, DRAWER.base / 2, DRAWER.front - DRAWER.d / 2 - 0.05]} color={c.surface} edge={c.edge} />
      <Box size={[width, height, 0.1]} position={[DRAWER.x0 + DRAWER.gapX, DRAWER.base + height / 2, DRAWER.front - DRAWER.d - 0.1]} color={c.surface} edge={c.edge} />
      {categories.map((cat, i) => {
        const at = drawerPos(i)
        return (
          <group key={cat.id} ref={(g) => { groups.current[i] = g }} position={[at.x, at.y, DRAWER.front - DRAWER.d / 2]}>
            <mesh
              onClick={(e) => { e.stopPropagation(); setActive(i) }}
              onPointerOver={(e) => { e.stopPropagation(); tip.show(e.nativeEvent, cat.label, `${cat.count} parts · open drawer`) }}
              onPointerMove={(e) => tip.move(e.nativeEvent)}
              onPointerOut={() => tip.hide()}
            >
              <boxGeometry args={[DRAWER.w, DRAWER.h, DRAWER.d]} />
              <meshStandardMaterial attach="material-0" color={c.surface} roughness={1} />
              <meshStandardMaterial attach="material-1" color={c.surface} roughness={1} />
              <meshStandardMaterial attach="material-2" color={c.surface} roughness={1} />
              <meshStandardMaterial attach="material-3" color={c.surface} roughness={1} />
              <meshBasicMaterial attach="material-4" map={labels[i]} toneMapped={false} />
              <meshStandardMaterial attach="material-5" color={c.surface} roughness={1} />
              <Edges color={i === active ? ACCENT : c.edge} />
            </mesh>
          </group>
        )
      })}
    </group>
  )
}
const hueOf = (cat: Category, i: number) => (cat.id === 'feature' ? 20 : cat.id === 'component' ? 158 : (i * 47) % 360)

function Table({ c, active, count }: { c: Colors; active: number; count: number }) {
  const legs: [number, number][] = [[-10.4, 0], [-4.2, 0], [-10.4, 3.0], [-4.2, 3.0]]
  return (
    <group>
      <Box size={[6.5, 0.12, 3.25]} position={[-7.3, TABLE_Y - 0.06, 1.5]} color={c.surface} edge={c.edge} />
      {legs.map(([x, z]) => (
        <Box key={`${x}${z}`} size={[0.12, TABLE_Y - 0.12, 0.12]} position={[x, (TABLE_Y - 0.12) / 2, z]} color={c.surface} edge={c.edge} />
      ))}
      {Array.from({ length: count }, (_, i) => {
        const p = padPos(i)
        const y = TABLE_Y + 0.004
        return (
          <Line
            key={`${active}-${i}`}
            points={[[p.x - 0.52, y, p.z - 0.4], [p.x + 0.52, y, p.z - 0.4], [p.x + 0.52, y, p.z + 0.4], [p.x - 0.52, y, p.z + 0.4], [p.x - 0.52, y, p.z - 0.4]]}
            color={c.edge}
            lineWidth={1}
            dashed
            dashSize={0.08}
            gapSize={0.06}
          />
        )
      })}
    </group>
  )
}

function Belt({ c }: { c: Colors }) {
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
      <Box size={[len, 0.42, 1.3]} position={[mid, BELT.y - 0.29, BELT.z]} color={c.surface} edge={c.edge} />
      <Box size={[len + 0.1, 0.16, 0.08]} position={[mid, BELT.y + 0.0, BELT.z - 0.7]} color={c.surface} edge={c.edge} />
      <Box size={[len + 0.1, 0.16, 0.08]} position={[mid, BELT.y + 0.0, BELT.z + 0.7]} color={c.surface} edge={c.edge} />
      {[BELT.start - 0.5, BELT.end + 0.5].map((x) => (
        <mesh key={x} position={[x, BELT.y - 0.25, BELT.z]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.25, 0.25, 1.34, 24]} />
          <meshStandardMaterial color={c.surface} roughness={1} />
          <Edges color={c.edge} threshold={20} />
        </mesh>
      ))}
      {[[BELT.start + 0.4, 0.95], [BELT.end - 0.4, 0.95], [BELT.start + 0.4, 2.25], [BELT.end - 0.4, 2.25]].map(([x, z]) => (
        <Box key={`${x}${z}`} size={[0.12, BELT.y - 0.5, 0.12]} position={[x, (BELT.y - 0.5) / 2, z]} color={c.surface} edge={c.edge} />
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

function Arm({ sim, c }: { sim: Sim; c: Colors }) {
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
  const hi = busy ? ACCENT : c.edge
  const joint = (key: string, radius: number, length: number) => (
    <mesh key={key} rotation={[Math.PI / 2, 0, 0]}>
      <cylinderGeometry args={[radius, radius, length, 28]} />
      <meshStandardMaterial color={c.surface} roughness={1} />
      <Edges color={c.edge} threshold={20} />
    </mesh>
  )
  return (
    <group position={[BASE.x, 0, BASE.z]}>
      <mesh position={[0, 0.18, 0]}>
        <cylinderGeometry args={[0.9, 1.0, 0.36, 40]} />
        <meshStandardMaterial color={c.surface} roughness={1} />
        <Edges color={c.edge} threshold={20} />
      </mesh>
      <group ref={turret}>
        <mesh position={[0, (H0 + 0.36) / 2, 0]}>
          <cylinderGeometry args={[0.38, 0.5, H0 - 0.36, 28]} />
          <meshStandardMaterial color={c.surface} roughness={1} />
          <Edges color={c.edge} threshold={20} />
        </mesh>
        <group ref={shoulder} position={[0, H0, 0]}>
          {joint('s', 0.42, 0.9)}
          <Box size={[L1, 0.3, 0.3]} position={[L1 / 2, 0, 0.3]} color={c.surface} edge={c.edge} />
          <Box size={[L1, 0.3, 0.3]} position={[L1 / 2, 0, -0.3]} color={c.surface} edge={c.edge} />
          <group ref={elbow} position={[L1, 0, 0]}>
            {joint('e', 0.36, 0.95)}
            <Box size={[L2, 0.34, 0.34]} position={[L2 / 2, 0, 0]} color={c.surface} edge={c.edge} />
            <group ref={wrist} position={[L2, 0, 0]}>
              {joint('w', 0.24, 0.6)}
              <Box size={[0.5, 0.3, 0.86]} position={[0, -0.32, 0]} color={c.surface} edge={hi} />
              {[0, 1].map((i) => (
                <group key={i} ref={(g) => { fingers.current[i] = g }}>
                  <Box size={[0.36, 0.38, 0.06]} position={[0, -0.62, 0]} color={c.surface} edge={hi} />
                </group>
              ))}
            </group>
          </group>
        </group>
      </group>
    </group>
  )
}

function Board({ lab, sim, c, tip }: { lab: Lab; sim: Sim; c: Colors; tip: Tip }) {
  const traces = useRef<({ material: { color: Color; linewidth: number; opacity: number } } | null)[]>([])
  const pulses = useRef<(Mesh | null)[]>([])
  const chipRefs = useRef<Record<string, Group | null>>({})
  const bump = useRef<Record<string, number>>({ framework: 0, database: 0 })
  const lit = useMemo(() => new Color(ACCENT), [])
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
        ctx.fillStyle = '#1D2225'
        ctx.fillRect(0, 0, 340, 340)
        ctx.strokeStyle = ACCENT
        ctx.lineWidth = 3
        ctx.strokeRect(18, 18, 304, 304)
        ctx.beginPath()
        ctx.arc(46, 46, 9, 0, Math.PI * 2)
        ctx.stroke()
        ctx.fillStyle = '#8A9094'
        ctx.font = `500 26px ${FONT}`
        ctx.fillText(title, 36, 140)
        ctx.fillStyle = '#FCFCFC'
        ctx.font = `500 ${value.length > 9 ? 38 : 50}px ${FONT}`
        ctx.fillText(value, 36, 200)
        ctx.fillStyle = '#8A9094'
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
      <Box size={[BOARD.x1 - BOARD.x0, 0.12, BOARD.z1 - BOARD.z0]} position={[cx, BOARD.y - 0.06, cz]} color={c.board} edge={c.edge} />
      {[[BOARD.x0 + 0.3, BOARD.z0 + 0.3], [BOARD.x1 - 0.3, BOARD.z0 + 0.3], [BOARD.x0 + 0.3, BOARD.z1 - 0.3], [BOARD.x1 - 0.3, BOARD.z1 - 0.3]].map(([x, z]) => (
        <mesh key={`${x}${z}`} position={[x, (BOARD.y - 0.12) / 2, z]}>
          <cylinderGeometry args={[0.12, 0.12, BOARD.y - 0.12, 16]} />
          <meshStandardMaterial color={c.surface} roughness={1} />
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
            onClick={(e) => { e.stopPropagation(); cycle(key) }}
            onPointerOver={(e) => { e.stopPropagation(); tip.show(e.nativeEvent, key === 'framework' ? 'Framework chip' : 'Database chip', 'Click to swap') }}
            onPointerMove={(e) => tip.move(e.nativeEvent)}
            onPointerOut={() => tip.hide()}
          >
            <boxGeometry args={[CHIP, 0.28, CHIP]} />
            <meshStandardMaterial attach="material-0" color="#1D2225" roughness={1} />
            <meshStandardMaterial attach="material-1" color="#1D2225" roughness={1} />
            <meshBasicMaterial attach="material-2" map={chipTexture[key]} toneMapped={false} />
            <meshStandardMaterial attach="material-3" color="#1D2225" roughness={1} />
            <meshStandardMaterial attach="material-4" color="#1D2225" roughness={1} />
            <meshStandardMaterial attach="material-5" color="#1D2225" roughness={1} />
            <Edges color={c.edge} />
          </mesh>
        </group>
      ))}
      {Array.from({ length: 8 }, (_, i) => (
        <mesh key={i} ref={(m) => { pulses.current[i] = m }} visible={false}>
          <sphereGeometry args={[0.09, 12, 12]} />
          <meshBasicMaterial color={ACCENT} toneMapped={false} />
        </mesh>
      ))}
    </group>
  )
}

const loader = new TextureLoader()
function PartMesh({ p, lab, c, tip }: { p: Part; lab: Lab; c: Colors; tip: Tip }) {
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
  const active = hover || p.mode === 'held' || p.mode === 'queued'
  const selected = lab.selected.has(p.item.ref)
  return (
    <mesh
      ref={ref}
      visible={false}
      onClick={(e) => { e.stopPropagation(); setHover(false); tip.hide(); lab.toggle(p.item.ref) }}
      onPointerOver={(e) => {
        e.stopPropagation()
        setHover(true)
        tip.show(e.nativeEvent, p.item.title, `${p.item.label} · ${selected ? 'click to send back' : 'click to build'}`)
      }}
      onPointerMove={(e) => tip.move(e.nativeEvent)}
      onPointerOut={() => { setHover(false); tip.hide() }}
    >
      <boxGeometry args={p.size} />
      {[0, 1, 3, 4, 5].map((i) => (
        <meshStandardMaterial key={i} attach={`material-${i}`} color={side} roughness={1} />
      ))}
      {texture ? (
        <meshBasicMaterial attach="material-2" map={texture} toneMapped={false} />
      ) : (
        <meshStandardMaterial attach="material-2" color={tint(p.item.hue, c, c.l + 12)} roughness={1} />
      )}
      <Edges color={active ? ACCENT : c.edge} />
    </mesh>
  )
}

function Drone({ sim, lab, c }: { sim: Sim; lab: Lab; c: Colors }) {
  const group = useRef<Group>(null)
  const rotors = useRef<(Group | null)[]>([])
  const glow = useRef<Mesh>(null)
  const points = useRef<Points>(null)
  const N = 90
  const state = useMemo(() => ({ pos: new Float32Array(N * 3).fill(-99), vel: new Float32Array(N * 3), life: new Float32Array(N), next: 0 }), [])
  useFrame((_, dt) => {
    const g = group.current!
    const d = sim.drone
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
        state.pos[i * 3 + 1] = -99
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
        <Box size={[0.8, 0.22, 0.8]} color={c.surface} edge={body} />
        <Box size={[0.3, 0.14, 0.3]} position={[0, 0.18, 0]} color={body} edge={body} />
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
        <sprite position={[0, 0.85, 0]} scale={[3.0, 0.6, 1]}>
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

function Simulator({ sim, labRef }: { sim: Sim; labRef: { current: Lab } }) {
  useFrame((_, dt) => step(sim, labRef.current, Math.min(dt, 1 / 20)))
  return null
}

type Tip = { show: (e: PointerEvent, title: string, sub: string) => void; move: (e: PointerEvent) => void; hide: () => void }

function useTip() {
  const ref = useRef<HTMLDivElement>(null)
  const api = useMemo<Tip>(() => {
    const move = (e: PointerEvent) => {
      const el = ref.current
      if (!el) return
      el.style.transform = `translate(${e.clientX + 14}px, ${e.clientY + 14}px)`
    }
    return {
      show: (e, title, sub) => {
        const el = ref.current
        if (!el) return
        el.children[0].textContent = title
        el.children[1].textContent = sub
        el.style.opacity = '1'
        document.body.style.cursor = 'pointer'
        move(e)
      },
      move,
      hide: () => {
        if (ref.current) ref.current.style.opacity = '0'
        document.body.style.cursor = ''
      },
    }
  }, [])
  return [ref, api] as const
}

function Scene({ lab, sim, labRef, categories, active, setActive, tip }: {
  lab: Lab; sim: Sim; labRef: { current: Lab }; categories: Category[]; active: number; setActive: (i: number) => void; tip: Tip
}) {
  const c = palette(lab.theme)
  return (
    <>
      <Rig />
      <Simulator sim={sim} labRef={labRef} />
      <ambientLight intensity={lab.theme === 'dark' ? 0.9 : 1.6} />
      <directionalLight position={[6, 12, 8]} intensity={lab.theme === 'dark' ? 0.9 : 1.4} />
      <hemisphereLight args={[c.surface, c.bg, 0.5]} />
      <Cabinet categories={categories} active={active} setActive={setActive} c={c} tip={tip} />
      <Table c={c} active={active} count={categories[active].count} />
      <Belt c={c} />
      <Arm sim={sim} c={c} />
      <Board lab={lab} sim={sim} c={c} tip={tip} />
      {sim.list.map((p) => (
        <PartMesh key={p.item.ref} p={p} lab={lab} c={c} tip={tip} />
      ))}
      <Drone sim={sim} lab={lab} c={c} />
      <ContactShadows position={[0.8, 0.001, 0]} scale={[30, 12]} resolution={512} blur={2.6} far={5} opacity={lab.theme === 'dark' ? 0.6 : 0.28} color="#000" />
    </>
  )
}

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: readonly { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex gap-0.5 rounded-md border border-border p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`rounded px-1.5 py-0.5 text-[11px] transition-colors ${o.value === value ? 'bg-accent text-accent-foreground' : 'text-muted hover:text-foreground'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Printer({ lab }: { lab: Lab }) {
  const [order, setOrder] = useState(1)
  const [copied, setCopied] = useState(false)
  const items = lab.catalog.items.filter((item) => lab.selected.has(item.ref))
  const tear = async () => {
    try {
      await navigator.clipboard.writeText(lab.command)
    } catch {}
    setCopied(true)
    setOrder((n) => n + 1)
    setTimeout(() => setCopied(false), 1400)
  }
  const row = (k: string, v: string) => (
    <div className="flex justify-between gap-3">
      <span className="text-muted">{k}</span>
      <span className="truncate text-right">{v}</span>
    </div>
  )
  return (
    <div className="pointer-events-auto flex h-full min-h-0 flex-col">
      <div className="relative z-10 rounded-2xl border border-border bg-surface p-3 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`size-2 rounded-full ${copied ? 'bg-[#6BCB77]' : 'bg-accent'} shadow-[0_0_8px_currentColor]`} />
            <span className="text-xs tracking-wide text-muted">RECEIPT PRINTER</span>
          </div>
          <div className="rounded-md bg-background px-2 py-0.5 font-mono text-xs tabular-nums" data-count={items.length}>
            {String(items.length).padStart(2, '0')} parts
          </div>
        </div>
        <div className="mt-2.5 grid grid-cols-[auto_1fr] items-center gap-x-2 gap-y-1.5 text-[11px] text-muted">
          <span>Target</span>
          <Segmented value={lab.setup.target} options={[{ value: 'existing', label: 'add' }, { value: 'new', label: 'init' }] as const} onChange={(v) => lab.set('target', v)} />
          <span>Installer</span>
          <Segmented value={lab.setup.packageManager} options={packageManagers} onChange={(v) => lab.set('packageManager', v)} />
          <span>Agent</span>
          <Segmented value={lab.setup.agent} options={[{ value: 'none', label: 'none' }, { value: 'claude', label: 'claude' }, { value: 'codex', label: 'codex' }] as const} onChange={(v) => lab.set('agent', v)} />
          {lab.setup.target === 'new' && (
            <>
              <span>Name</span>
              <input
                value={lab.setup.name}
                onChange={(e) => lab.set('name', e.target.value)}
                className="min-w-0 rounded-md border border-border bg-background px-1.5 py-0.5 font-mono text-[11px] text-foreground outline-none focus:border-accent"
              />
            </>
          )}
        </div>
        <div className="mt-3 flex gap-2">
          <button type="button" onClick={tear} className="flex-1 rounded-lg bg-accent px-3 py-1.5 text-sm text-accent-foreground active:scale-[0.98]">
            {copied ? 'Copied, torn off' : 'Copy & tear off'}
          </button>
          <button type="button" onClick={() => lab.clear()} disabled={!items.length} className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted hover:text-foreground disabled:opacity-40">
            Recall all
          </button>
        </div>
        <div className="absolute inset-x-6 -bottom-1 h-2 rounded-full bg-foreground/80" />
      </div>
      <div className="relative -mt-1 min-h-0 flex-1 overflow-hidden px-4">
        <AnimatePresence initial={false}>
          <motion.div
            key={order}
            initial={{ clipPath: 'inset(0 0 100% 0)' }}
            animate={{ clipPath: 'inset(0 0 0% 0)', transition: { duration: 0.7, ease: 'easeOut' } }}
            exit={{ y: 420, rotate: 9, opacity: 0, transition: { duration: 0.7, ease: [0.5, 0, 0.8, 0.4] } }}
            className="absolute inset-x-4 top-0 max-h-full overflow-y-auto font-mono text-[11px] leading-[1.45] text-foreground"
          >
            <div className="bg-[var(--paper)] px-4 pb-3 pt-5 shadow-md" style={{ ['--paper' as string]: palette(lab.theme).paper }}>
              <div className="text-center text-xs tracking-[0.2em]">PAYLOAD TOOLKIT</div>
              <div className="text-center text-muted">work order #{String(order).padStart(4, '0')}</div>
              <div className="my-2 border-t border-dashed border-border" />
              {row('MODE', lab.setup.target === 'new' ? `init ${lab.setup.name}` : 'add to project')}
              {row('FRAMEWORK', frameworks.find((f) => f.value === lab.setup.framework)!.label)}
              {row('DATABASE', databases.find((d) => d.value === lab.setup.database)!.label)}
              {row('INSTALLER', lab.setup.packageManager)}
              {row('AGENT', agents.find((a) => a.value === lab.setup.agent)!.label)}
              <div className="my-2 border-t border-dashed border-border" />
              {items.length === 0 && <div className="py-1 text-center text-muted">no parts on the board yet</div>}
              <AnimatePresence initial={false}>
                {items.map((item, i) => (
                  <motion.div
                    key={item.ref}
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="flex justify-between gap-2 overflow-hidden"
                  >
                    <span className="truncate">
                      <span className="text-muted">{String(i + 1).padStart(2, '0')} </span>
                      {item.title}
                    </span>
                    <span className="shrink-0 text-muted">{item.label.slice(0, 10).toUpperCase()}</span>
                  </motion.div>
                ))}
              </AnimatePresence>
              <div className="my-2 border-t border-dashed border-border" />
              <div className="flex justify-between text-xs">
                <span>PARTS</span>
                <span>{items.length}</span>
              </div>
              <div className="my-2 border-t border-dashed border-border" />
              <motion.div key={lab.command} initial={{ backgroundColor: 'rgba(90,145,173,0.25)' }} animate={{ backgroundColor: 'rgba(90,145,173,0)' }} transition={{ duration: 1 }} className="rounded-sm [overflow-wrap:anywhere]">
                <span className="text-accent">$ </span>
                {lab.command}
              </motion.div>
              <div
                className="mx-auto mt-3 h-8 w-4/5 opacity-70"
                style={{ background: `repeating-linear-gradient(90deg, currentColor 0 2px, transparent 2px 4px, currentColor 4px 5px, transparent 5px 8px, currentColor 8px 11px, transparent 11px 12px)` }}
              />
              <div className="mt-1 text-center text-[10px] text-muted">thank you for building</div>
            </div>
            <div
              className="h-2"
              style={{
                background: `linear-gradient(135deg, ${palette(lab.theme).paper} 33%, transparent 33%) 0 0 / 10px 10px, linear-gradient(225deg, ${palette(lab.theme).paper} 33%, transparent 33%) 0 0 / 10px 10px`,
              }}
            />
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}

export default function AssemblyLine({ lab }: MockProps) {
  const categories = useMemo(() => [...lab.catalog.kinds.filter((k) => k.id !== 'all'), ...lab.catalog.blocks], [lab.catalog])
  const labRef = useRef(lab)
  labRef.current = lab
  const [active, setActive] = useState(() => Math.max(0, categories.findIndex((c) => c.id === 'block:hero')))
  const [sim] = useState(() => createSim(lab, categories))
  sim.active = active
  const [tipRef, tip] = useTip()
  return (
    <div className="relative h-full w-full">
      <div className="absolute inset-x-0 bottom-[38%] top-14 md:bottom-0 md:right-[340px] md:top-16">
        <Canvas orthographic dpr={[1, 2]} camera={{ position: [20, 20, 20], zoom: 30, near: 0.1, far: 300 }} onPointerMissed={() => tip.hide()}>
          <Scene lab={lab} sim={sim} labRef={labRef} categories={categories} active={active} setActive={setActive} tip={tip} />
        </Canvas>
      </div>
      <div className="pointer-events-none absolute bottom-4 left-4 hidden max-w-sm text-xs leading-relaxed text-muted md:block">
        <span className="text-foreground">Assembly line.</span> Open a drawer, click parts to send them down the belt. The arm seats them on your app board; click a seated part to fling it home. Click the chips to swap framework and database.
      </div>
      <div className="absolute bottom-2 left-2 right-2 top-[62%] md:bottom-4 md:left-auto md:right-4 md:top-20 md:w-[316px]">
        <Printer lab={lab} />
      </div>
      <div ref={tipRef} className="pointer-events-none fixed left-0 top-0 z-40 max-w-64 rounded-lg border border-border bg-surface px-2.5 py-1.5 opacity-0 shadow-lg transition-opacity">
        <div className="text-sm text-foreground" />
        <div className="text-xs text-muted" />
      </div>
    </div>
  )
}
