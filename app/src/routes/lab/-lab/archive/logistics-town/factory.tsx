import { useFrame } from '@react-three/fiber'
import { Edges, Line } from '@react-three/drei'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { CanvasTexture, Color, Group, Mesh, Points, SRGBColorSpace, Texture, TextureLoader, Vector3 } from 'three'
import type { BufferAttribute } from 'three'

import { agents, databases, frameworks } from '../../../../workspace/-workspace/workspace.constants'
import type { Lab } from '../../lab.types'
import { BASE, BOARD, CHIP, CHIPS, CRATE, H0, L1, L2, SLOTS, SPOTS, TILE, clamp } from './sim'
import type { Part, Sim } from './sim'
import { PAD_LOCAL } from './town'

export const ACCENT = '#5A91AD'
export const FONT = '"Timeless Grotesk", ui-sans-serif, system-ui, sans-serif'

export type Colors = ReturnType<typeof palette>
export function palette(theme: Lab['theme']) {
  return theme === 'dark'
    ? { dark: true, bg: '#090E11', base: '#0A0F12', lot: '#151D21', surface: '#1B2327', fg: '#FCFCFC', muted: '#8A9094', edge: '#56636A', faint: '#2A343A', dim: '#33404A', board: '#141D22', l: 46, s: 36 }
    : { dark: false, bg: '#EDF1F3', base: '#D8E0E4', lot: '#F7FAFB', surface: '#FFFFFF', fg: '#1D2225', muted: '#727C81', edge: '#97A2A8', faint: '#CBD3D7', dim: '#C3CBCF', board: '#F5F9FB', l: 66, s: 44 }
}
export const tint = (hue: number, c: Colors, l = c.l) => `hsl(${hue}, ${c.s}%, ${l}%)`

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

export type Tip = { show: (e: PointerEvent, title: string, sub: string, image?: string) => void; move: (e: PointerEvent) => void; hide: () => void }

export function Box({ size, color, edge, position, children, onClick, opacity }: {
  size: [number, number, number]; color: string; edge: string; position?: [number, number, number]; children?: ReactNode; onClick?: () => void; opacity?: number
}) {
  return (
    <mesh position={position} onClick={onClick ? (e) => { e.stopPropagation(); onClick() } : undefined}>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} roughness={1} transparent={opacity !== undefined} opacity={opacity ?? 1} />
      <Edges color={edge} />
      {children}
    </mesh>
  )
}

/** The factory shell, in v1 units: low walls with the roof cut away, a south door for trucks, the staging pallets. */
export function Shell({ c, lab }: { c: Colors; lab: Lab }) {
  const x0 = -4.2, x1 = 14.6, z0 = -4.6, z1 = 4.2, h = 2.2, t = 0.18
  const door: [number, number] = [PAD_LOCAL.x - 1.2, PAD_LOCAL.x + 1.2]
  const sign = useMemo(
    () =>
      textTexture(900, 140, (ctx) => {
        ctx.fillStyle = c.surface
        ctx.fillRect(0, 0, 900, 140)
        ctx.strokeStyle = ACCENT
        ctx.lineWidth = 4
        ctx.strokeRect(6, 6, 888, 128)
        ctx.fillStyle = ACCENT
        ctx.font = `600 30px ${FONT}`
        ctx.fillText('YOUR APP · ASSEMBLY', 34, 52)
        ctx.fillStyle = c.fg
        ctx.font = `500 54px ${FONT}`
        ctx.fillText(lab.setup.target === 'new' ? lab.setup.name : 'existing project', 34, 112)
      }),
    [c, lab.setup.target, lab.setup.name],
  )
  return (
    <group>
      <Box size={[x1 - x0 + 0.6, 0.12, z1 - z0 + 0.6]} position={[(x0 + x1) / 2, 0.06, (z0 + z1) / 2]} color={c.lot} edge={c.edge} />
      <Box size={[x1 - x0, h, t]} position={[(x0 + x1) / 2, h / 2, z0]} color={c.surface} edge={c.edge} />
      <Box size={[t, h, z1 - z0]} position={[x0, h / 2, (z0 + z1) / 2]} color={c.surface} edge={c.edge} />
      <Box size={[t, h, z1 - z0]} position={[x1, h / 2, (z0 + z1) / 2]} color={c.surface} edge={c.edge} />
      <Box size={[door[0] - x0, h, t]} position={[(x0 + door[0]) / 2, h / 2, z1]} color={c.surface} edge={c.edge} />
      <Box size={[x1 - door[1], h * 0.45, t]} position={[(door[1] + x1) / 2, h * 0.225, z1]} color={c.surface} edge={c.edge} />
      <Box size={[door[1] - door[0] + 0.2, 0.3, t * 1.4]} position={[(door[0] + door[1]) / 2, h + 0.4, z1]} color={c.surface} edge={ACCENT} />
      {[door[0], door[1]].map((x) => (
        <Box key={x} size={[0.14, h + 0.55, 0.14]} position={[x, (h + 0.55) / 2, z1]} color={c.surface} edge={c.edge} />
      ))}
      {[[x0, z0], [x1, z0], [x0, z1], [x1, z1]].map(([x, z]) => (
        <Box key={`${x}${z}`} size={[0.3, h + 0.5, 0.3]} position={[x, (h + 0.5) / 2, z]} color={c.surface} edge={c.edge} />
      ))}
      <mesh position={[(x0 + x1) / 2 + 3, h * 0.45 + 0.75, z1 + 0.12]}>
        <planeGeometry args={[7.2, 1.12]} />
        <meshBasicMaterial map={sign} toneMapped={false} />
      </mesh>
      <Box size={[3.3, 0.9, 3.9]} position={[0.95, 0.45, 1.6]} color={c.surface} edge={c.edge} />
      {SPOTS.map((s, i) => (
        <Line key={i} points={[[s.x - 0.5, 0.91, s.z - 0.5], [s.x + 0.5, 0.91, s.z - 0.5], [s.x + 0.5, 0.91, s.z + 0.5], [s.x - 0.5, 0.91, s.z + 0.5], [s.x - 0.5, 0.91, s.z - 0.5]]} color={c.edge} lineWidth={1} dashed dashSize={0.1} gapSize={0.07} />
      ))}
      <Line points={[[PAD_LOCAL.x - 0.9, 0.13, PAD_LOCAL.z - 1.2], [PAD_LOCAL.x + 0.9, 0.13, PAD_LOCAL.z - 1.2], [PAD_LOCAL.x + 0.9, 0.13, z1], [PAD_LOCAL.x - 0.9, 0.13, z1], [PAD_LOCAL.x - 0.9, 0.13, PAD_LOCAL.z - 1.2]]} color={ACCENT} lineWidth={1} dashed dashSize={0.2} gapSize={0.12} />
    </group>
  )
}

export function Arm({ sim, c }: { sim: Sim; c: Colors }) {
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

export function cycleFramework(lab: Lab) {
  lab.set('framework', lab.setup.framework === 'next' ? 'tanstack' : 'next')
}
export function cycleDatabase(lab: Lab) {
  lab.set('database', lab.setup.database === 'postgres' ? 'mongodb' : 'postgres')
}

export function Board({ lab, sim, c, tip }: { lab: Lab; sim: Sim; c: Colors; tip: Tip }) {
  const traces = useRef<({ material: { color: Color; linewidth: number } } | null)[]>([])
  const pulses = useRef<(Mesh | null)[]>([])
  const lit = useMemo(() => new Color(ACCENT), [])
  const dim = useMemo(() => new Color(c.dim), [c.dim])
  useFrame(() => {
    traces.current.forEach((line, s) => {
      if (!line) return
      const on = sim.slots[s]?.where === 'board'
      line.material.color.copy(on ? lit : dim)
      line.material.linewidth = on ? 2.4 : 1
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
  })
  const chipTexture = useMemo(() => {
    const make = (title: string, value: string) =>
      textTexture(340, 340, (ctx) => {
        ctx.fillStyle = '#1D2225'
        ctx.fillRect(0, 0, 340, 340)
        ctx.strokeStyle = ACCENT
        ctx.lineWidth = 3
        ctx.strokeRect(18, 18, 304, 304)
        ctx.fillStyle = '#8A9094'
        ctx.font = `500 26px ${FONT}`
        ctx.fillText(title, 36, 140)
        ctx.fillStyle = '#FCFCFC'
        ctx.font = `500 ${value.length > 9 ? 38 : 50}px ${FONT}`
        ctx.fillText(value, 36, 200)
      })
    return {
      framework: make('FRAMEWORK', frameworks.find((f) => f.value === lab.setup.framework)!.label),
      database: make('DATABASE', databases.find((d) => d.value === lab.setup.database)!.label),
    }
  }, [lab.setup.framework, lab.setup.database])
  const cx = (BOARD.x0 + BOARD.x1) / 2, cz = (BOARD.z0 + BOARD.z1) / 2
  return (
    <group>
      <Box size={[BOARD.x1 - BOARD.x0, 0.12, BOARD.z1 - BOARD.z0]} position={[cx, BOARD.y - 0.06, cz]} color={c.board} edge={c.edge} />
      {TRACES.map((points, s) => (
        <Line key={s} ref={(l) => { traces.current[s] = l as never }} points={points} color={c.dim} lineWidth={1} />
      ))}
      {SLOTS.map((s, i) => {
        const y = BOARD.y + 0.014
        return <Line key={i} points={[[s.x - 0.5, y, s.z - 0.38], [s.x + 0.5, y, s.z - 0.38], [s.x + 0.5, y, s.z + 0.38], [s.x - 0.5, y, s.z + 0.38], [s.x - 0.5, y, s.z - 0.38]]} color={c.dim} lineWidth={1} />
      })}
      {(['framework', 'database'] as const).map((key) => (
        <mesh
          key={key}
          position={[CHIPS[key].x, BOARD.y + 0.14, CHIPS[key].z]}
          onClick={(e) => { e.stopPropagation(); if (key === 'framework') cycleFramework(lab); else cycleDatabase(lab) }}
          onPointerOver={(e) => { e.stopPropagation(); tip.show(e.nativeEvent, key === 'framework' ? 'Framework chip' : 'Database chip', 'Fed by the power plant / water tower. Click to swap') }}
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
const crateSize = new Vector3(CRATE, CRATE, CRATE)
const tileSize = new Vector3(...TILE)

/** A part in world space: a crate on the road, a screenshot tile once the arm takes it. */
export function PartMesh({ p, sim, lab, c, tip, followed }: { p: Part; sim: Sim; lab: Lab; c: Colors; tip: Tip; followed: boolean }) {
  const ref = useRef<Mesh>(null)
  const [texture, setTexture] = useState<Texture | null>(null)
  const requested = useRef(false)
  const image = lab.theme === 'dark' ? (p.item.imageDark ?? p.item.image) : p.item.image
  useEffect(() => {
    requested.current = false
    setTexture(null)
  }, [image])
  useFrame(() => {
    const m = ref.current
    if (!m) return
    const hidden = p.where === 'truck' && !!p.vehicle && sim.time < p.vehicle.depart
    m.visible = !hidden
    m.position.copy(p.pos)
    m.scale.lerpVectors(crateSize, tileSize, p.form)
    if (image && !requested.current && (p.form > 0.2 || followed)) {
      requested.current = true
      loader.load(image, (t) => {
        t.colorSpace = SRGBColorSpace
        const img = t.image as HTMLImageElement
        const aspect = img.height / img.width
        const want = 0.72 / 0.96
        if (aspect > want) {
          t.repeat.set(1, want / aspect)
          t.offset.set(0, 1 - want / aspect)
        }
        setTexture(t)
      })
    }
  })
  const side = tint(p.item.hue, c)
  return (
    <mesh
      ref={ref}
      onClick={(e) => { e.stopPropagation(); tip.hide(); lab.toggle(p.ref) }}
      onPointerOver={(e) => { e.stopPropagation(); tip.show(e.nativeEvent, p.item.title, `${p.item.label} · ${p.item.sourceName ?? p.item.source} · click to send back`, image) }}
      onPointerMove={(e) => tip.move(e.nativeEvent)}
      onPointerOut={() => tip.hide()}
    >
      <boxGeometry args={[1, 1, 1]} />
      {[0, 1, 3, 4, 5].map((i) => (
        <meshStandardMaterial key={i} attach={`material-${i}`} color={side} roughness={1} />
      ))}
      {texture && p.form > 0.5 ? (
        <meshBasicMaterial attach="material-2" map={texture} toneMapped={false} />
      ) : (
        <meshStandardMaterial attach="material-2" color={tint(p.item.hue, c, c.l + 12)} roughness={1} />
      )}
      <Edges color={followed || p.where === 'arm' ? ACCENT : c.edge} />
    </mesh>
  )
}

export function Drone({ sim, lab, c }: { sim: Sim; lab: Lab; c: Colors }) {
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

/** The agent's construction crew: a tower crane that slews over the latest seat. Click it to change crews. */
export function Crane({ sim, lab, c, tip }: { sim: Sim; lab: Lab; c: Colors; tip: Tip }) {
  const root = useRef<Group>(null)
  const jib = useRef<Group>(null)
  const hook = useRef<Group>(null)
  const show = useRef(lab.setup.agent === 'none' ? 0 : 1)
  const at = useMemo(() => new Vector3(14.4, 0, -5.6), [])
  const H = 12, J = 10
  useFrame((_, dt) => {
    show.current += ((lab.setup.agent === 'none' ? 0.001 : 1) - show.current) * (1 - Math.exp(-dt * 4))
    root.current!.scale.set(1, show.current, 1)
    const target = sim.drone.welds[0] ?? sim.crane
    const yaw = Math.atan2(-(target.z - at.z), target.x - at.x)
    let cur = jib.current!.rotation.y
    let d = yaw - cur
    while (d > Math.PI) d -= Math.PI * 2
    while (d < -Math.PI) d += Math.PI * 2
    cur += d * (1 - Math.exp(-dt * 1.6))
    jib.current!.rotation.y = cur
    const reach = clamp(Math.hypot(target.x - at.x, target.z - at.z), 2, J - 0.4)
    hook.current!.position.x += (reach - hook.current!.position.x) * (1 - Math.exp(-dt * 2))
  })
  const body = lab.setup.agent === 'codex' ? c.fg : '#D97757'
  const name = agents.find((a) => a.value === lab.setup.agent)?.label ?? ''
  const tag = useMemo(
    () =>
      textTexture(520, 100, (ctx) => {
        ctx.fillStyle = c.surface
        ctx.strokeStyle = c.edge
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.roundRect(4, 14, 512, 72, 36)
        ctx.fill()
        ctx.stroke()
        ctx.fillStyle = body
        ctx.beginPath()
        ctx.arc(46, 50, 10, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = c.fg
        ctx.font = `500 34px ${FONT}`
        ctx.fillText(`${name} crew`, 70, 62)
      }),
    [c, body, name],
  )
  const mast: [number, number, number][] = []
  const s = 0.5
  for (let y = 0; y < H; y += 1) {
    mast.push([-s, y, -s], [s, y + 1, s], [s, y, -s], [-s, y + 1, s], [-s, y, -s], [-s, y + 1, -s], [s, y, -s], [s, y + 1, -s], [-s, y, s], [-s, y + 1, s], [s, y, s], [s, y + 1, s])
  }
  const boom: [number, number, number][] = []
  for (let x = -3; x < J; x += 1) {
    boom.push([x, 0, -0.35], [x + 1, 0, -0.35], [x, 0, 0.35], [x + 1, 0, 0.35], [x, 0, -0.35], [x + 0.5, 0.7, 0], [x + 0.5, 0.7, 0], [x + 1, 0, 0.35], [x + 0.5, 0.7, 0], [x + 1.5, 0.7, 0])
  }
  return (
    <group position={at.toArray()}>
      <group ref={root}>
        <mesh
          position={[0, H / 2, 0]}
          onClick={(e) => { e.stopPropagation(); lab.set('agent', lab.setup.agent === 'claude' ? 'codex' : 'claude') }}
          onPointerOver={(e) => { e.stopPropagation(); tip.show(e.nativeEvent, `${name} crew`, 'The agent finishes wiring after install. Click to change crews') }}
          onPointerMove={(e) => tip.move(e.nativeEvent)}
          onPointerOut={() => tip.hide()}
        >
          <boxGeometry args={[1.1, H, 1.1]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
        <Line points={mast} segments color={c.edge} lineWidth={1} />
        <group ref={jib} position={[0, H, 0]}>
          <Line points={boom} segments color={body} lineWidth={1.2} />
          <Box size={[1.2, 0.9, 1.0]} position={[-0.2, 0.5, 0]} color={c.surface} edge={body} />
          <Box size={[1.4, 0.9, 0.9]} position={[-2.6, -0.4, 0]} color={c.surface} edge={c.edge} />
          <group ref={hook} position={[6, 0, 0]}>
            <Line points={[[0, 0, 0], [0, -H + 3.2, 0]]} color={c.edge} lineWidth={1} />
            <Box size={[0.4, 0.3, 0.4]} position={[0, -H + 3.1, 0]} color={body} edge={body} />
          </group>
          <sprite position={[0, 2, 0]} scale={[5, 0.96, 1]}>
            <spriteMaterial map={tag} transparent toneMapped={false} depthTest={false} />
          </sprite>
        </group>
      </group>
    </group>
  )
}

