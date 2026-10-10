import { useFrame } from '@react-three/fiber'
import { ContactShadows, Edges, Grid, Line, MeshReflectorMaterial } from '@react-three/drei'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AdditiveBlending, BufferGeometry, Color, ConeGeometry, DoubleSide, Float32BufferAttribute, Group, InstancedMesh, Mesh, Object3D,
  Points, RepeatWrapping, Shape, ShaderMaterial,
} from 'three'
import type { BufferAttribute, Material } from 'three'

import type { Lab } from '../../lab.types'
import { BASE, BELT, BOARD, Box, FONT, Surf, textTexture } from './factory'
import type { Look, Sim, WorldId } from './factory'

export const WORLDS: readonly { id: WorldId; label: string; scene: string; blurb: string }[] = [
  { id: 'blueprint', label: 'Blueprint', scene: 'INT. DRAFTING TABLE', blurb: 'Grid, dimensions and callouts' },
  { id: 'night', label: 'Night shift', scene: 'INT. WAREHOUSE', blurb: 'Sodium lamps, light cones, wet floor' },
  { id: 'island', label: 'Floating island', scene: 'EXT. SKY', blurb: 'Tilt-shift diorama on a chunk of terrain' },
  { id: 'cleanroom', label: 'Cleanroom fab', scene: 'INT. FAB 2', blurb: 'Yellow light, glass walls, air shower' },
  { id: 'desk', label: 'Desk toy', scene: 'INT. YOUR DESK', blurb: 'A toy factory beside your keyboard' },
]

/** Per-world lens: iso field of view, elevation and framing. */
export const LENS: Record<WorldId, { fov: number; el: number; frame: number }> = {
  blueprint: { fov: 12, el: 34, frame: 1.12 },
  night: { fov: 24, el: 26, frame: 0.98 },
  cleanroom: { fov: 18, el: 30, frame: 1.02 },
  island: { fov: 10, el: 30, frame: 0.92 },
  desk: { fov: 30, el: 38, frame: 1.18 },
}

export function lookOf(world: WorldId, theme: Lab['theme']): Look {
  const dark = theme === 'dark'
  const base = { world, flat: false, rough: 1, shadow: 0.25, s: dark ? 34 : 46, l: dark ? 42 : 64 }
  switch (world) {
    case 'blueprint':
      return dark
        ? { ...base, flat: true, bg: '#0C2440', surface: '#0C2440', fg: '#EAF2FA', muted: '#8FB0D0', edge: '#CFE0F2', dim: '#3B5D84', board: '#0E2A4A', chip: '#0C2440', chipFg: '#EAF2FA', accent: '#FF8A5B', floor: '#0C2440', floorEdge: '#3B5D84', l: 40, s: 40, shadow: 0 }
        : { ...base, flat: true, bg: '#F2F6F9', surface: '#F2F6F9', fg: '#18375A', muted: '#5C7A99', edge: '#2F65A0', dim: '#A9C2DC', board: '#F2F6F9', chip: '#F2F6F9', chipFg: '#18375A', accent: '#E0482B', floor: '#F2F6F9', floorEdge: '#A9C2DC', l: 80, s: 50, shadow: 0 }
    case 'night':
      return dark
        ? { ...base, bg: 'radial-gradient(120% 90% at 50% 30%, #10171C 0%, #05080A 70%)', surface: '#1A2126', fg: '#FCFCFC', muted: '#8A9094', edge: '#56636A', dim: '#2B353C', board: '#141B20', chip: '#0D1215', chipFg: '#FCFCFC', accent: '#6FC3EE', floor: '#0A0F12', floorEdge: '#1F282E', rough: 0.85, shadow: 0 }
        : { ...base, bg: 'radial-gradient(120% 90% at 50% 30%, #D9DCDD 0%, #B9BEC1 75%)', surface: '#E8EAEB', fg: '#1D2225', muted: '#5F686D', edge: '#7E888D', dim: '#AEB6BA', board: '#EEF1F2', chip: '#1D2225', chipFg: '#FCFCFC', accent: '#2F7FB0', floor: '#C5CACD', floorEdge: '#A3AAAE', rough: 0.85, shadow: 0 }
    case 'cleanroom':
      return dark
        ? { ...base, bg: 'radial-gradient(120% 90% at 50% 20%, #2A2412 0%, #12100A 75%)', surface: '#2A2617', fg: '#FFF4CF', muted: '#B3A374', edge: '#9C8A4C', dim: '#4A4128', board: '#2E2919', chip: '#14120A', chipFg: '#FFF4CF', accent: '#7FD0F5', floor: '#1E1B10', floorEdge: '#3C3520', l: 46, s: 30, shadow: 0.5 }
        : { ...base, bg: 'linear-gradient(180deg, #FFF8DC 0%, #FBF1C9 100%)', surface: '#FFFCEF', fg: '#3B3418', muted: '#8C8150', edge: '#B4A66E', dim: '#E3D9AE', board: '#FFFBEA', chip: '#2E2A17', chipFg: '#FFF8DC', accent: '#2C7DB3', floor: '#FBF4D8', floorEdge: '#E0D5A6', l: 70, s: 45, shadow: 0.18 }
    case 'island':
      return dark
        ? { ...base, bg: 'linear-gradient(180deg, #050A16 0%, #0F1A33 55%, #26304F 100%)', surface: '#243041', fg: '#F2F5FA', muted: '#8C97A8', edge: '#6D7D91', dim: '#34414F', board: '#1C2633', chip: '#0D1218', chipFg: '#F2F5FA', accent: '#7CC6F0', floor: '#2A3D36', floorEdge: '#4A6558', shadow: 0.5 }
        : { ...base, bg: 'linear-gradient(180deg, #A9D3F0 0%, #D3E8F4 50%, #F6EADB 100%)', surface: '#FFFFFF', fg: '#1D2225', muted: '#6C777D', edge: '#8F9DA5', dim: '#CDD6DA', board: '#F7FAFB', chip: '#1D2225', chipFg: '#FCFCFC', accent: '#3E86B4', floor: '#E4EEDB', floorEdge: '#B9CBAA', shadow: 0.3 }
    case 'desk':
      return dark
        ? { ...base, bg: 'radial-gradient(90% 80% at 45% 40%, #2A2119 0%, #0B0907 75%)', surface: '#262A2C', fg: '#F5F1EA', muted: '#9C958B', edge: '#6C6F70', dim: '#3A3D3E', board: '#1F2426', chip: '#101315', chipFg: '#F5F1EA', accent: '#8FD0F2', floor: '#2B3A31', floorEdge: '#466152', shadow: 0.55 }
        : { ...base, bg: 'radial-gradient(90% 80% at 45% 40%, #F2E8DA 0%, #E0D0B9 80%)', surface: '#FFFFFF', fg: '#1D2225', muted: '#727C81', edge: '#949CA0', dim: '#C9D3CC', board: '#F8FAF8', chip: '#1D2225', chipFg: '#FCFCFC', accent: '#3E86B4', floor: '#CFE0D2', floorEdge: '#9DBBA4', shadow: 0.3 }
  }
}

export type Power = { current: number }

export function WorldStage({ world, c, theme, sim, power }: { world: WorldId; c: Look; theme: Lab['theme']; sim: Sim; power: Power }) {
  const dark = theme === 'dark'
  return (
    <>
      <Lights world={world} dark={dark} power={power} />
      {world === 'blueprint' && <Blueprint c={c} dark={dark} />}
      {world === 'night' && <NightShift c={c} dark={dark} power={power} />}
      {world === 'cleanroom' && <Cleanroom c={c} dark={dark} sim={sim} />}
      {world === 'island' && <Island c={c} dark={dark} />}
      {world === 'desk' && <Desk c={c} dark={dark} />}
      {c.shadow > 0 && (
        <ContactShadows position={[1.6, 0.003, 0.3]} scale={[32, 14]} resolution={512} blur={2.6} far={5} opacity={c.shadow} color="#000" />
      )}
    </>
  )
}

function Lights({ world, dark, power }: { world: WorldId; dark: boolean; power: Power }) {
  const amb = useRef<{ intensity: number }>(null)
  const sun = useRef<{ intensity: number }>(null)
  const hemi = useRef<{ intensity: number }>(null)
  const preset = {
    blueprint: { amb: 2, sun: 0, hemi: 0, color: '#FFFFFF', sunColor: '#FFFFFF' },
    night: { amb: dark ? 0.12 : 0.9, sun: dark ? 0.05 : 0.6, hemi: dark ? 0.2 : 0.5, color: dark ? '#6B7C8F' : '#FFFFFF', sunColor: '#C8D4E0' },
    cleanroom: { amb: dark ? 0.7 : 1.5, sun: dark ? 0.5 : 1.1, hemi: 0.5, color: '#FFE9A6', sunColor: '#FFF1C4' },
    island: { amb: dark ? 1.1 : 1.3, sun: dark ? 1.2 : 1.6, hemi: dark ? 0.8 : 0.7, color: dark ? '#9BB0D6' : '#FFFFFF', sunColor: dark ? '#A8BCE8' : '#FFF0D8' },
    desk: { amb: dark ? 0.35 : 1.3, sun: dark ? 0.2 : 1.4, hemi: 0.5, color: dark ? '#C9B79C' : '#FFFFFF', sunColor: '#FFF4E2' },
  }[world]
  useFrame(() => {
    const p = power.current
    if (amb.current) amb.current.intensity = preset.amb * p
    if (sun.current) sun.current.intensity = preset.sun * p
    if (hemi.current) hemi.current.intensity = preset.hemi * p
  })
  return (
    <>
      <ambientLight ref={amb as never} color={preset.color} />
      <directionalLight ref={sun as never} position={[8, 16, 10]} color={preset.sunColor} />
      <hemisphereLight ref={hemi as never} args={[preset.color, '#3A3328']} />
      {world === 'desk' && dark && <DeskLamp power={power} />}
    </>
  )
}

function DeskLamp({ power }: { power: Power }) {
  const ref = useRef<{ intensity: number }>(null)
  useFrame(() => {
    if (ref.current) ref.current.intensity = 900 * power.current
  })
  return <spotLight ref={ref as never} position={[-16, 26, 12]} angle={0.62} penumbra={0.9} decay={1.6} distance={90} color="#FFD9A0" target-position={[2, 0, 0]} />
}

function label(text: string, opts: { fg: string; bg?: string; stroke?: string; w?: number; h?: number; size?: number; weight?: number; align?: CanvasTextAlign }) {
  const w = opts.w ?? 512, h = opts.h ?? 96
  return textTexture(w, h, (ctx) => {
    if (opts.bg) {
      ctx.fillStyle = opts.bg
      ctx.fillRect(0, 0, w, h)
    }
    if (opts.stroke) {
      ctx.strokeStyle = opts.stroke
      ctx.lineWidth = 3
      ctx.strokeRect(2, 2, w - 4, h - 4)
    }
    ctx.fillStyle = opts.fg
    ctx.font = `${opts.weight ?? 500} ${opts.size ?? 40}px ${FONT}`
    ctx.textAlign = opts.align ?? 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, opts.align === 'left' ? 16 : w / 2, h / 2 + 2)
  })
}

function Tag({ text, position, c, scale = 1, flat = false, color }: { text: string; position: [number, number, number]; c: Look; scale?: number; flat?: boolean; color?: string }) {
  const map = useMemo(() => label(text, { fg: color ?? c.fg, size: 40, w: 640, h: 96 }), [text, c, color])
  const w = 4.2 * scale, h = w * (96 / 640)
  if (flat)
    return (
      <mesh position={position} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial map={map} transparent toneMapped={false} depthWrite={false} />
      </mesh>
    )
  return (
    <sprite position={position} scale={[w, h, 1]}>
      <spriteMaterial map={map} transparent toneMapped={false} depthWrite={false} />
    </sprite>
  )
}

type V3 = [number, number, number]

function Dim({ a, b, off, text, c }: { a: V3; b: V3; off: V3; text: string; c: Look }) {
  const A: V3 = [a[0] + off[0], a[1] + off[1], a[2] + off[2]]
  const B: V3 = [b[0] + off[0], b[1] + off[1], b[2] + off[2]]
  const dir = [B[0] - A[0], B[1] - A[1], B[2] - A[2]]
  const len = Math.hypot(dir[0], dir[1], dir[2])
  const u = dir.map((d) => d / len)
  const tick = (p: V3): V3[] => [
    [p[0] - u[0] * 0.18 - (u[2] || u[1] ? 0.18 : 0), p[1] - u[1] * 0.18 + (u[1] ? 0 : 0), p[2] - u[2] * 0.18 + (u[0] ? 0.18 : 0)],
    [p[0] + u[0] * 0.18 + (u[2] || u[1] ? 0.18 : 0), p[1] + u[1] * 0.18, p[2] + u[2] * 0.18 - (u[0] ? 0.18 : 0)],
  ]
  const mid: V3 = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2 + 0.35, (A[2] + B[2]) / 2]
  return (
    <group>
      <Line points={[A, B]} color={c.edge} lineWidth={1} />
      <Line points={[a, [A[0] + Math.sign(off[0]) * 0.25, A[1] + Math.sign(off[1]) * 0.25, A[2] + Math.sign(off[2]) * 0.25]]} color={c.dim} lineWidth={1} />
      <Line points={[b, [B[0] + Math.sign(off[0]) * 0.25, B[1] + Math.sign(off[1]) * 0.25, B[2] + Math.sign(off[2]) * 0.25]]} color={c.dim} lineWidth={1} />
      <Line points={tick(A)} color={c.edge} lineWidth={1.6} />
      <Line points={tick(B)} color={c.edge} lineWidth={1.6} />
      <Tag text={text} position={mid} c={c} scale={0.55} color={c.edge} />
    </group>
  )
}

function Callout({ at, to, letter, text, c }: { at: V3; to: V3; letter: string; text: string; c: Look }) {
  const map = useMemo(
    () =>
      textTexture(720, 120, (ctx) => {
        ctx.strokeStyle = c.edge
        ctx.lineWidth = 4
        ctx.beginPath()
        ctx.arc(60, 60, 44, 0, Math.PI * 2)
        ctx.stroke()
        ctx.fillStyle = c.edge
        ctx.font = `600 50px ${FONT}`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(letter, 60, 63)
        ctx.textAlign = 'left'
        ctx.fillStyle = c.fg
        ctx.font = `500 40px ${FONT}`
        ctx.fillText(text, 126, 64)
      }),
    [c, letter, text],
  )
  return (
    <group>
      <Line points={[at, [to[0], to[1] - 0.2, to[2]]]} color={c.edge} lineWidth={1} />
      <mesh position={at}>
        <sphereGeometry args={[0.07, 10, 10]} />
        <meshBasicMaterial color={c.edge} />
      </mesh>
      <sprite position={[to[0] + 1.3, to[1], to[2]]} scale={[3.3, 0.55, 1]}>
        <spriteMaterial map={map} transparent toneMapped={false} depthWrite={false} />
      </sprite>
    </group>
  )
}

function Blueprint({ c, dark }: { c: Look; dark: boolean }) {
  const block = useMemo(
    () =>
      textTexture(1024, 512, (ctx) => {
        ctx.strokeStyle = c.edge
        ctx.fillStyle = c.edge
        ctx.lineWidth = 4
        ctx.strokeRect(6, 6, 1012, 500)
        ctx.lineWidth = 2
        ctx.beginPath()
        for (const y of [150, 260, 370]) {
          ctx.moveTo(6, y)
          ctx.lineTo(1018, y)
        }
        ctx.moveTo(520, 150)
        ctx.lineTo(520, 506)
        ctx.stroke()
        ctx.font = `600 64px ${FONT}`
        ctx.fillText('PAYLOAD TOOLKIT', 36, 100)
        ctx.font = `500 36px ${FONT}`
        const rows = [['TITLE', 'ASSEMBLY CELL A'], ['DWG NO.', 'PT-004 · REV C'], ['SCALE', '1 : 50'], ['DRAWN', 'DIRECTOR'], ['DATE', '2026-10-09'], ['SHEET', '1 OF 1']]
        rows.forEach(([k, v], i) => {
          const x = i % 2 ? 546 : 30, y = 215 + Math.floor(i / 2) * 110
          ctx.globalAlpha = 0.6
          ctx.font = `500 26px ${FONT}`
          ctx.fillText(k, x, y - 26)
          ctx.globalAlpha = 1
          ctx.font = `500 38px ${FONT}`
          ctx.fillText(v, x, y + 22)
        })
      }),
    [c],
  )
  const north = useMemo(() => label('N', { fg: c.edge, size: 64, w: 128, h: 128, weight: 600 }), [c])
  const sheet: V3[] = [[-14.5, 0.01, -7.5], [18.5, 0.01, -7.5], [18.5, 0.01, 9], [-14.5, 0.01, 9], [-14.5, 0.01, -7.5]]
  const inner: V3[] = sheet.map(([x, y, z]) => [x + Math.sign(2 - x) * 0.4, y, z + Math.sign(0.75 - z) * 0.4])
  const reach = useMemo(() => {
    const pts: V3[] = []
    for (let k = 0; k <= 48; k++) {
      const a = -0.95 + (k / 48) * 2.1
      pts.push([BASE.x + Math.cos(a) * 7.6, 0.02, BASE.z + Math.sin(a) * 7.6])
    }
    return pts
  }, [])
  return (
    <group>
      <Grid
        position={[0, 0, 0]}
        args={[120, 120]}
        cellSize={0.5}
        cellThickness={0.6}
        cellColor={dark ? '#1B3A5E' : '#D3E0EC'}
        sectionSize={2.5}
        sectionThickness={1}
        sectionColor={dark ? '#2C527D' : '#B4C9DE'}
        fadeDistance={90}
        fadeStrength={1.5}
        infiniteGrid
      />
      <Line points={sheet} color={c.dim} lineWidth={1.4} />
      <Line points={inner} color={c.dim} lineWidth={1} />
      <mesh position={[-1.5, 0.02, 6.9]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[7.6, 3.8]} />
        <meshBasicMaterial map={block} transparent toneMapped={false} depthWrite={false} />
      </mesh>
      <group position={[-12.6, 0.02, -5.6]}>
        <Line points={[[0, 0, 0.9], [0, 0, -0.9], [-0.35, 0, -0.4], [0, 0, -0.9], [0.35, 0, -0.4]]} color={c.edge} lineWidth={1.4} />
        <Line points={Array.from({ length: 41 }, (_, k): V3 => [Math.cos((k / 40) * Math.PI * 2) * 1.1, 0, Math.sin((k / 40) * Math.PI * 2) * 1.1])} color={c.dim} lineWidth={1} />
        <mesh position={[0, 0, -1.6]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.7, 0.7]} />
          <meshBasicMaterial map={north} transparent toneMapped={false} depthWrite={false} />
        </mesh>
      </group>
      <Line points={reach} color={c.accent} lineWidth={1} dashed dashSize={0.25} gapSize={0.18} />
      <Tag text="R 7.60 REACH" position={[BASE.x + 6.2, 0.05, BASE.z + 5.6]} c={c} scale={0.6} flat color={c.accent} />
      <Dim a={[BELT.start - 0.5, 0, 2.3]} b={[BELT.end + 0.5, 0, 2.3]} off={[0, 0, 1.6]} text="6.40 m CONVEYOR" c={c} />
      <Dim a={[BOARD.x0, 0, BOARD.z1]} b={[BOARD.x1, 0, BOARD.z1]} off={[0, 0, 1.4]} text="8.75 m" c={c} />
      <Dim a={[BOARD.x1, 0, BOARD.z0]} b={[BOARD.x1, 0, BOARD.z1]} off={[1.4, 0, 0]} text="6.90 m" c={c} />
      <Dim a={[-10.7, 0, -3.1]} b={[-10.7, 4.5, -3.1]} off={[-1.2, 0, 0]} text="4.50 m" c={c} />
      <Callout at={[-5.2, 4.6, -2]} to={[-4.2, 6.4, -2.6]} letter="A" text="PICK CABINET" c={c} />
      <Callout at={[-0.6, 0.9, 1.6]} to={[-0.2, 3.4, 2.6]} letter="B" text="CONVEYOR" c={c} />
      <Callout at={[BASE.x, 1.9, BASE.z]} to={[1.4, 7.4, -3.4]} letter="C" text="2-LINK ARM" c={c} />
      <Callout at={[13.2, 0.5, -3.2]} to={[13.4, 3.6, -3.6]} letter="D" text="APP BOARD" c={c} />
      <group position={[-15.5, 0.06, 1]} rotation={[0, 0.0, 0]}>
        <Box c={c} size={[0.9, 0.08, 17]} position={[0, 0, 0]} color={c.surface} edge={c.edge} />
        <Box c={c} size={[3.4, 0.12, 1.4]} position={[1.1, 0, -9.0]} color={c.surface} edge={c.edge} />
        {Array.from({ length: 33 }, (_, k) => (
          <Line key={k} points={[[0.45, 0.05, -8 + k * 0.5], [0.45 - (k % 2 ? 0.18 : 0.34), 0.05, -8 + k * 0.5]]} color={c.edge} lineWidth={1} />
        ))}
      </group>
    </group>
  )
}

const beamVertex = /* glsl */ `
varying float vY;
varying vec3 vN;
varying vec3 vV;
void main() {
  vY = uv.y;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`
const beamFragment = /* glsl */ `
uniform vec3 color;
uniform float strength;
varying float vY;
varying vec3 vN;
varying vec3 vV;
void main() {
  float rim = pow(abs(dot(vN, vV)), 1.6);
  float a = pow(vY, 1.7) * rim * strength;
  gl_FragColor = vec4(color * a, a);
}`

function NightShift({ c, dark, power }: { c: Look; dark: boolean; power: Power }) {
  const lamps: V3[] = [[-7.2, 13, 1.4], [-1, 13, 1.6], [4.5, 14, -0.4], [9.8, 13, -0.3], [13.2, 13, 2.4]]
  const beam = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: beamVertex,
        fragmentShader: beamFragment,
        uniforms: { color: { value: new Color('#FFA347') }, strength: { value: dark ? 0.42 : 0.22 } },
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        side: DoubleSide,
      }),
    [dark],
  )
  const pool = useMemo(
    () =>
      textTexture(256, 256, (ctx) => {
        const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128)
        g.addColorStop(0, 'rgba(255,170,80,0.85)')
        g.addColorStop(0.45, 'rgba(255,150,60,0.28)')
        g.addColorStop(1, 'rgba(255,140,50,0)')
        ctx.fillStyle = g
        ctx.fillRect(0, 0, 256, 256)
      }),
    [],
  )
  const lights = useRef<({ intensity: number } | null)[]>([])
  const pools = useRef<(Mesh | null)[]>([])
  const dust = useRef<Points>(null)
  const motes = useMemo(() => {
    const n = 360
    const pos = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      const lamp = lamps[i % lamps.length]
      const y = Math.random() * 9
      const r = (1 - y / 10) * 3 * Math.sqrt(Math.random())
      const a = Math.random() * Math.PI * 2
      pos.set([lamp[0] + Math.cos(a) * r, y, lamp[2] + Math.sin(a) * r], i * 3)
    }
    return pos
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useFrame(({ clock }) => {
    const p = power.current
    beam.uniforms.strength.value = (dark ? 0.42 : 0.22) * p
    lights.current.forEach((l, i) => {
      if (l) l.intensity = (dark ? 70 : 30) * p * (0.97 + 0.03 * Math.sin(clock.elapsedTime * 50 + i))
    })
    pools.current.forEach((m) => m && ((m.material as Material).opacity = p * (dark ? 0.9 : 0.5)))
    const pts = dust.current
    if (pts) {
      const attr = pts.geometry.getAttribute('position') as BufferAttribute
      const arr = attr.array as Float32Array
      for (let i = 0; i < arr.length; i += 3) {
        arr[i + 1] += 0.004 * Math.sin(clock.elapsedTime + i)
        arr[i] += 0.003 * Math.cos(clock.elapsedTime * 0.7 + i)
      }
      attr.needsUpdate = true
      ;(pts.material as Material).opacity = p * 0.7
    }
  })
  const racks = useMemo(() => {
    const pts: number[] = []
    const seg = (a: V3, b: V3) => pts.push(...a, ...b)
    const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) => {
      const xs = [x0, x1], ys = [y0, y1], zs = [z0, z1]
      for (const y of ys) for (const z of zs) seg([x0, y, z], [x1, y, z])
      for (const x of xs) for (const z of zs) seg([x, y0, z], [x, y1, z])
      for (const x of xs) for (const y of ys) seg([x, y, z0], [x, y, z1])
    }
    for (const [z, depth] of [[-12, 2.2]] as const) {
      for (let x = -26; x <= 30; x += 3.2) {
        seg([x, 0, z], [x, 9, z]); seg([x, 0, z - depth], [x, 9, z - depth])
        for (let k = 0; k < 6; k++) seg([x, (k * 9) / 6, z], [x, ((k + 1) * 9) / 6, z - depth])
        if (x + 3.2 > 30) continue
        for (const y of [0.2, 3, 6]) {
          seg([x, y, z], [x + 3.2, y, z]); seg([x, y, z - depth], [x + 3.2, y, z - depth])
          const h = ((x * 7 + y * 13) % 5) / 5
          if (h > 0.25) box(x + 0.3, y + 0.15, z - 0.2, x + 2.9, y + 0.15 + 1.2 + h, z - depth + 0.2)
        }
      }
    }
    for (let x = -24; x <= 30; x += 6) seg([x, 16, -20], [x, 16, 12])
    for (const z of [-20, -6, 12]) seg([-24, 16, z], [30, 16, z])
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(pts, 3))
    return g
  }, [])
  const lanes = useMemo(() => {
    const out: V3[][] = []
    const rect = (x0: number, z0: number, x1: number, z1: number) => [[x0, 0.01, z0], [x1, 0.01, z0], [x1, 0.01, z1], [x0, 0.01, z1], [x0, 0.01, z0]] as V3[]
    out.push(rect(-12, -4.6, 15.6, 5.2))
    out.push(rect(-12.6, -5.2, 16.2, 5.8))
    return out
  }, [])
  const hatch = useMemo(() => {
    const pts: V3[] = []
    for (let k = -8; k <= 8; k++) {
      const x = BASE.x + k * 0.45
      pts.push([x - 1.2, 0.012, BASE.z + 2.4], [x + 1.2, 0.012, BASE.z + 0])
    }
    return pts
  }, [])
  const exit = useMemo(() => label('EXIT', { fg: '#0E1A12', bg: '#3BE07A', size: 60, w: 256, h: 112, weight: 700 }), [])
  const dock = useMemo(() => label('DOCK 03 · OUTBOUND', { fg: dark ? '#FFC24A' : '#5A4310', size: 46, w: 768, h: 96 }), [dark])
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[160, 160]} />
        <MeshReflectorMaterial
          resolution={512}
          blur={[300, 80]}
          mixBlur={1}
          mixStrength={dark ? 3.2 : 1.2}
          roughness={0.9}
          depthScale={0.8}
          minDepthThreshold={0.3}
          maxDepthThreshold={1.4}
          color={c.floor}
          metalness={dark ? 0.6 : 0.2}
          mirror={0.7}
        />
      </mesh>
      {lanes.map((pts, i) => (
        <Line key={i} points={pts} color={dark ? '#C9A227' : '#B08A12'} lineWidth={1.4} dashed={i === 1} dashSize={0.6} gapSize={0.4} />
      ))}
      <Line points={hatch} segments color={dark ? '#7A6418' : '#C2A43A'} lineWidth={1} />
      <lineSegments geometry={racks}>
        <lineBasicMaterial color={dark ? '#283137' : '#A3ABAF'} transparent opacity={0.8} />
      </lineSegments>
      {lamps.map((at, i) => (
        <group key={i} position={at}>
          <Line points={[[0, 0, 0], [0, 6, 0]]} color={c.edge} lineWidth={1} />
          <mesh position={[0, -0.2, 0]}>
            <cylinderGeometry args={[0.18, 0.75, 0.5, 20, 1, true]} />
            <Surf c={c} color={c.surface} />
            <Edges color={c.edge} threshold={20} />
          </mesh>
          <mesh position={[0, -0.46, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.66, 20]} />
            <meshBasicMaterial color="#FFC37A" toneMapped={false} />
          </mesh>
          <mesh position={[0, -at[1] / 2 - 0.2, 0]} material={beam}>
            <cylinderGeometry args={[0.7, 3.6, at[1] - 0.5, 32, 1, true]} />
          </mesh>
          <pointLight ref={(l) => { lights.current[i] = l }} position={[0, -1, 0]} color="#FFA54A" distance={18} decay={1.4} />
          <mesh ref={(m) => { pools.current[i] = m }} position={[0, -at[1] + 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[9, 9]} />
            <meshBasicMaterial map={pool} transparent blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
          </mesh>
        </group>
      ))}
      <points ref={dust}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[motes, 3]} />
        </bufferGeometry>
        <pointsMaterial color="#FFD39A" size={2} sizeAttenuation={false} transparent blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
      </points>
      <mesh position={[-13.8, 6.4, -8.6]}>
        <planeGeometry args={[1.6, 0.7]} />
        <meshBasicMaterial map={exit} toneMapped={false} />
      </mesh>
      <group position={[20, 0, -2]}>
        <Line points={[[0, 0, -4], [0, 7, -4], [0, 7, 4], [0, 0, 4]]} color={c.edge} lineWidth={1.4} />
        {Array.from({ length: 12 }, (_, k) => (
          <Line key={k} points={[[0, 0.5 + k * 0.55, -3.8], [0, 0.5 + k * 0.55, 3.8]]} color={c.dim} lineWidth={1} />
        ))}
        <mesh position={[-0.05, 7.6, 0]} rotation={[0, -Math.PI / 2, 0]}>
          <planeGeometry args={[6, 0.75]} />
          <meshBasicMaterial map={dock} transparent toneMapped={false} />
        </mesh>
      </group>
    </group>
  )
}

function Cleanroom({ c, dark, sim }: { c: Look; dark: boolean; sim: Sim }) {
  const W = { x0: -13, x1: 17.4, z0: -6.4, z1: 7.2, back: 7.5, front: 1.1 }
  const glass = dark ? '#FFD86B' : '#F2D45C'
  const sign = useMemo(() => label('ISO 5 · CLASS 100 · GOWN UP', { fg: c.fg, bg: dark ? '#2E2817' : '#FFF6CF', stroke: c.edge, size: 34, w: 768, h: 96 }), [c, dark])
  const shower = useMemo(() => label('AIR SHOWER', { fg: c.fg, size: 36, w: 512, h: 80 }), [c])
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 700)
    return () => clearInterval(id)
  }, [])
  const counterTex = useMemo(
    () =>
      textTexture(512, 160, (ctx) => {
        ctx.fillStyle = '#0B0E0C'
        ctx.fillRect(0, 0, 512, 160)
        ctx.fillStyle = '#69F0A0'
        ctx.font = `500 30px ${FONT}`
        ctx.fillText('PARTICLES ≥0.5µm / ft³', 24, 52)
        ctx.font = `600 64px ${FONT}`
        ctx.fillText(String(Math.floor(3 + Math.abs(Math.sin(tick * 1.7)) * 9 + sim.air * 40)).padStart(3, '0'), 24, 130)
      }),
    [tick, sim],
  )
  useEffect(() => () => counterTex.dispose(), [counterTex])
  const streaks = useRef<Group>(null)
  useFrame(({ clock }) => {
    const g = streaks.current
    if (g) {
      const on = sim.air > 0
      g.visible = on
      g.children.forEach((child, i) => {
        const t = (clock.elapsedTime * 3 + i * 0.137) % 1
        const side = i % 2 ? 1 : -1
        child.position.set(-3.2 + ((i * 0.37) % 0.7), 0.95 + ((i * 0.53) % 1.4), BELT.z + side * (0.95 - t * 0.8))
        child.scale.setScalar(1 - t)
      })
    }
  })
  const panels = (from: V3, to: V3, h: number, step: number) => {
    const len = Math.hypot(to[0] - from[0], to[2] - from[2])
    const n = Math.ceil(len / step)
    const lines: V3[][] = []
    for (let k = 0; k <= n; k++) {
      const t = k / n
      const x = from[0] + (to[0] - from[0]) * t, z = from[2] + (to[2] - from[2]) * t
      lines.push([[x, 0, z], [x, h, z]])
    }
    lines.push([[from[0], h, from[2]], [to[0], h, to[2]]], [[from[0], 0.3, from[2]], [to[0], 0.3, to[2]]])
    return { lines, len, mid: [(from[0] + to[0]) / 2, h / 2, (from[2] + to[2]) / 2] as V3, rot: Math.atan2(-(to[2] - from[2]), to[0] - from[0]) }
  }
  const walls = [
    { ...panels([W.x0, 0, W.z0], [W.x1, 0, W.z0], W.back, 2.5), h: W.back },
    { ...panels([W.x0, 0, W.z0], [W.x0, 0, W.z1], W.back, 2.5), h: W.back },
    { ...panels([W.x1, 0, W.z0], [W.x1, 0, W.z1], W.front, 2.5), h: W.front },
    { ...panels([W.x0, 0, W.z1], [W.x1, 0, W.z1], W.front, 2.5), h: W.front },
  ]
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[2.2, -0.005, 0.4]}>
        <planeGeometry args={[W.x1 - W.x0, W.z1 - W.z0]} />
        <Surf c={c} color={c.floor} />
      </mesh>
      <Grid position={[2.2, 0.002, 0.4]} args={[W.x1 - W.x0, W.z1 - W.z0]} cellSize={0.3} cellThickness={0.5} cellColor={c.floorEdge} sectionSize={1.2} sectionThickness={1} sectionColor={c.edge} fadeDistance={200} />
      {walls.map((w, i) => (
        <group key={i}>
          <mesh position={w.mid} rotation={[0, w.rot, 0]}>
            <planeGeometry args={[w.len, w.h]} />
            <meshBasicMaterial color={glass} transparent opacity={dark ? 0.06 : 0.12} side={DoubleSide} depthWrite={false} />
          </mesh>
          {w.lines.map((pts, k) => (
            <Line key={k} points={pts} color={c.edge} lineWidth={k >= w.lines.length - 2 ? 1.4 : 1} />
          ))}
        </group>
      ))}
      {[W.z0 + 0.05].map((z) => (
        <group key={z}>
          {Array.from({ length: 6 }, (_, k) => (
            <mesh key={k} position={[W.x0 + 2.5 + k * 5, W.back - 0.4, z]}>
              <boxGeometry args={[3.6, 0.18, 0.1]} />
              <meshBasicMaterial color={dark ? '#FFD86B' : '#FFE38A'} toneMapped={false} />
            </mesh>
          ))}
        </group>
      ))}
      <Line
        points={Array.from({ length: 13 }, (_, k): V3[] => [[W.x0 + k * 2.53, W.back, W.z0], [W.x0 + k * 2.53, W.back, W.z0 + 2.4]]).flat()}
        segments
        color={c.dim}
        lineWidth={1}
      />
      <mesh position={[-4, 4.2, W.z0 + 0.06]}>
        <planeGeometry args={[6.4, 0.8]} />
        <meshBasicMaterial map={sign} toneMapped={false} />
      </mesh>
      <mesh position={[8, 4.4, W.z0 + 0.06]}>
        <planeGeometry args={[3.2, 1.0]} />
        <meshBasicMaterial map={counterTex} toneMapped={false} />
      </mesh>
      <group position={[-3.15, 0, BELT.z]}>
        {[-1.05, 1.05].map((z) => (
          <Box key={z} c={c} size={[0.9, 3.0, 0.32]} position={[0, 1.5, z]} color={c.surface} edge={c.edge}>
            {Array.from({ length: 6 }, (_, k) => (
              <mesh key={k} position={[0, -0.9 + k * 0.38, -Math.sign(z) * 0.17]} rotation={[0, z > 0 ? Math.PI : 0, 0]}>
                <circleGeometry args={[0.07, 12]} />
                <meshBasicMaterial color={c.edge} side={DoubleSide} />
              </mesh>
            ))}
          </Box>
        ))}
        <Box c={c} size={[0.9, 0.36, 2.42]} position={[0, 3.18, 0]} color={c.surface} edge={c.edge} />
        <sprite position={[0, 3.75, 0]} scale={[2.4, 0.38, 1]}>
          <spriteMaterial map={shower} transparent toneMapped={false} depthWrite={false} />
        </sprite>
      </group>
      <group ref={streaks} visible={false}>
        {Array.from({ length: 24 }, (_, k) => (
          <mesh key={k}>
            <boxGeometry args={[0.02, 0.02, 0.35]} />
            <meshBasicMaterial color={c.accent} toneMapped={false} />
          </mesh>
        ))}
      </group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-12.2, 0.01, 2]}>
        <planeGeometry args={[1.4, 4]} />
        <meshBasicMaterial color={dark ? '#24405A' : '#DCEAF2'} />
      </mesh>
    </group>
  )
}

function jagged(seed: number, radius: number, height: number, segs: number) {
  const g = new ConeGeometry(radius, height, segs, 4)
  const pos = g.getAttribute('position')
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i)
    if (y >= height / 2 - 1e-3 || y <= -height / 2 + 1e-3) continue
    const n = Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453
    const f = 1 + ((n - Math.floor(n)) - 0.5) * 0.35
    pos.setX(i, pos.getX(i) * f)
    pos.setZ(i, pos.getZ(i) * f)
    pos.setY(i, y + ((n * 3) % 1 - 0.5) * 0.3)
  }
  g.computeVertexNormals()
  return g
}

function Island({ c, dark }: { c: Look; dark: boolean }) {
  const shape = useMemo(() => {
    const s = new Shape()
    const n = 28
    for (let k = 0; k <= n; k++) {
      const a = (k / n) * Math.PI * 2
      const r = 1 + Math.sin(a * 3 + 1) * 0.04 + Math.sin(a * 7) * 0.025
      const x = Math.cos(a) * 17.6 * r, y = Math.sin(a) * 10.4 * r
      if (k === 0) s.moveTo(x, y)
      else s.lineTo(x, y)
    }
    return s
  }, [])
  const rock = useMemo(() => jagged(3, 1, 1, 14), [])
  const smallRock = useMemo(() => jagged(9, 1, 1, 7), [])
  const clouds = useRef<Group>(null)
  const isl = useRef<Group>(null)
  const fall = useRef<{ material: { dashOffset: number } }[]>([])
  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime
    clouds.current?.children.forEach((cl, i) => {
      cl.position.x += dt * (0.25 + (i % 3) * 0.12)
      if (cl.position.x > 46) cl.position.x = -46
    })
    isl.current?.children.forEach((r, i) => {
      r.position.y = r.userData.y + Math.sin(t * 0.6 + i * 2) * 0.35
    })
    fall.current.forEach((l) => l && (l.material.dashOffset -= dt * 3))
  })
  const rockColor = dark ? '#343A4A' : '#E3DCD2'
  const rockEdge = dark ? '#4B5466' : '#B6AC9F'
  const trees: V3[] = [[-15.4, 0, -2], [-14.6, 0, 3.4], [-13.2, 0, -5.8], [-12.4, 0, 6.6], [15.8, 0, -3.6], [16.4, 0, 1.2], [15.1, 0, 5], [9, 0, 8.4], [3.6, 0, -8.6], [-4.4, 0, -8.2], [-2, 0, 8.6], [12.5, 0, -7.3]]
  const cloudPuffs = (k: number) => [0, 1, 2, 3].map((j) => ({ x: (j - 1.5) * 1.6, y: Math.sin(j * 2 + k) * 0.4, z: Math.cos(j + k) * 0.6, r: 1.2 + ((j + k) % 3) * 0.35 }))
  const cloudAt: V3[] = [[-28, 2, -10], [-10, 7, -22], [24, 4, -14], [30, -5, 4], [-24, -7, 12], [8, -11, 13], [-36, -2, 0], [16, 9, -24]]
  const stars = useMemo(() => {
    const pos = new Float32Array(500 * 3)
    for (let i = 0; i < 500; i++) {
      const a = Math.random() * Math.PI * 2, b = Math.random() * 0.9 + 0.05
      pos.set([Math.cos(a) * Math.cos(b) * 160, Math.sin(b) * 160 - 20, Math.sin(a) * Math.cos(b) * 160], i * 3)
    }
    return pos
  }, [])
  return (
    <group>
      <group position={[1.7, 0, 0.4]}>
        <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
          <extrudeGeometry args={[shape, { depth: 0.9, bevelEnabled: false, curveSegments: 4 }]} />
          <meshStandardMaterial attach="material-0" color={c.floor} roughness={1} />
          <meshStandardMaterial attach="material-1" color={rockColor} roughness={1} />
          <Edges color={c.floorEdge} threshold={25} />
        </mesh>
        <mesh geometry={rock} position={[0, -0.9 - 5.5, 0]} rotation={[Math.PI, 0.2, 0]} scale={[17.4, 11, 10.2]}>
          <meshStandardMaterial color={rockColor} roughness={1} flatShading />
          <Edges color={rockEdge} threshold={8} />
        </mesh>
        {Array.from({ length: 3 }, (_, k) => (
          <Line
            key={k}
            ref={(l) => { if (l) fall.current[k] = l as never }}
            points={[[-4.2 + k * 0.22, -0.1, 10.35], [-4.2 + k * 0.22, -0.5, 10.55], [-4.2 + k * 0.22, -12, 10.9]]}
            color={dark ? '#7FB6E0' : '#8FC3E6'}
            lineWidth={1}
            transparent
            opacity={0.6}
            dashed
            dashSize={1.4}
            gapSize={0.5}
          />
        ))}
        {trees.map(([x, , z], i) => (
          <group key={i} position={[x, 0, z]} scale={0.8 + (i % 3) * 0.25}>
            <mesh position={[0, 0.3, 0]}>
              <cylinderGeometry args={[0.1, 0.12, 0.6, 6]} />
              <meshStandardMaterial color={rockEdge} roughness={1} />
            </mesh>
            <mesh position={[0, 1.3, 0]}>
              <coneGeometry args={[0.6, 1.6, 7]} />
              <meshStandardMaterial color={dark ? '#24372E' : '#CFE2C2'} roughness={1} flatShading />
              <Edges color={dark ? '#4C6B5A' : '#93AE85'} threshold={15} />
            </mesh>
          </group>
        ))}
      </group>
      <group ref={isl}>
        {[[-26, -4, 4, 2.4], [27, -2, -8, 1.8], [22, -9, 9, 1.2]].map(([x, y, z, s], i) => (
          <group key={i} position={[x, y, z]} userData={{ y }}>
            <mesh scale={[s * 1.6, 0.3, s * 1.2]}>
              <cylinderGeometry args={[1, 1, 1, 9]} />
              <meshStandardMaterial color={c.floor} roughness={1} />
              <Edges color={c.floorEdge} threshold={20} />
            </mesh>
            <mesh geometry={smallRock} position={[0, -s * 1.3, 0]} rotation={[Math.PI, 0, 0]} scale={[s * 1.6, s * 2.4, s * 1.2]}>
              <meshStandardMaterial color={rockColor} roughness={1} flatShading />
              <Edges color={rockEdge} threshold={8} />
            </mesh>
          </group>
        ))}
      </group>
      <group ref={clouds}>
        {cloudAt.map((at, k) => (
          <group key={k} position={at} scale={1 + (k % 3) * 0.4}>
            {cloudPuffs(k).map((p, j) => (
              <mesh key={j} position={[p.x, p.y, p.z]} scale={[p.r, p.r * 0.7, p.r]}>
                <icosahedronGeometry args={[1, 1]} />
                <meshStandardMaterial color={dark ? '#2B3650' : '#FFFFFF'} roughness={1} flatShading transparent opacity={0.92} />
                <Edges color={dark ? '#46577A' : '#C9D7E2'} threshold={10} />
              </mesh>
            ))}
          </group>
        ))}
      </group>
      {dark && (
        <points>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[stars, 3]} />
          </bufferGeometry>
          <pointsMaterial color="#DDE6FF" size={1.6} sizeAttenuation={false} toneMapped={false} />
        </points>
      )}
    </group>
  )
}

function Desk({ c, dark }: { c: Look; dark: boolean }) {
  const wood = useMemo(() => {
    const t = textTexture(512, 512, (ctx) => {
      ctx.fillStyle = dark ? '#2A2119' : '#E6D6BF'
      ctx.fillRect(0, 0, 512, 512)
      ctx.strokeStyle = dark ? '#3A2E23' : '#D3BE9F'
      ctx.lineWidth = 2
      for (let k = 0; k < 26; k++) {
        ctx.beginPath()
        const y0 = k * 20 + 4
        ctx.moveTo(0, y0)
        for (let x = 0; x <= 512; x += 16) ctx.lineTo(x, y0 + Math.sin(x * 0.012 + k * 1.3) * 5 + Math.sin(x * 0.05 + k) * 1.5)
        ctx.stroke()
      }
    })
    t.wrapS = t.wrapT = RepeatWrapping
    t.repeat.set(10, 10)
    return t
  }, [dark])
  const mat = useMemo(
    () =>
      textTexture(2048, 960, (ctx) => {
        ctx.fillStyle = c.floor
        ctx.fillRect(0, 0, 2048, 960)
        ctx.strokeStyle = c.floorEdge
        for (let x = 0; x <= 2048; x += 2048 / 32) {
          ctx.lineWidth = Math.round(x / (2048 / 32)) % 5 ? 1 : 3
          ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 960); ctx.stroke()
        }
        for (let y = 0; y <= 960; y += 960 / 15) {
          ctx.lineWidth = Math.round(y / (960 / 15)) % 5 ? 1 : 3
          ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(2048, y); ctx.stroke()
        }
        ctx.fillStyle = c.floorEdge
        ctx.font = `500 26px ${FONT}`
        for (let k = 0; k <= 32; k += 2) ctx.fillText(String(k), k * 64 + 6, 28)
        ctx.font = `600 34px ${FONT}`
        ctx.fillText('SELF-HEALING CUTTING MAT · A1', 40, 930)
      }),
    [c],
  )
  const keys = useMemo(() => {
    const rows = ['QWERTYUIOP[]', 'ASDFGHJKL;\'', 'ZXCVBNM,./']
    const out: { ch: string; x: number; z: number; w: number }[] = []
    out.push(...'1234567890-='.split('').map((ch, i) => ({ ch, x: i * 4.4, z: 0, w: 4 })), { ch: '⌫', x: 12 * 4.4 + 2.2, z: 0, w: 8.4 })
    rows.forEach((row, r) => row.split('').forEach((ch, i) => out.push({ ch, x: 2.2 + r * 1.2 + i * 4.4, z: 4.4 * (r + 1), w: 4 })))
    out.push({ ch: '⏎', x: 2.2 + 1.2 + 11 * 4.4 + 2.6, z: 8.8, w: 9 }, { ch: '', x: 22, z: 17.6, w: 26 })
    return out
  }, [])
  const glyphs = useMemo(() => {
    const map = new Map<string, ReturnType<typeof label>>()
    for (const k of keys) if (k.ch && !map.has(k.ch)) map.set(k.ch, label(k.ch, { fg: dark ? '#CFC8BE' : '#4A4F52', size: 70, w: 128, h: 128 }))
    return map
  }, [keys, dark])
  const steam = useRef<(Group | null)[]>([])
  useFrame(({ clock }) => {
    steam.current.forEach((g, i) => {
      if (!g) return
      const t = (clock.elapsedTime * 0.25 + i / 3) % 1
      g.position.y = 10 + t * 8
      g.scale.setScalar(0.7 + t * 0.8)
      g.rotation.y = clock.elapsedTime * 0.3 + i
    })
  })
  const note = useMemo(
    () =>
      textTexture(512, 512, (ctx) => {
        ctx.fillStyle = '#FFE48A'
        ctx.fillRect(0, 0, 512, 512)
        ctx.fillStyle = '#4A3B10'
        ctx.font = `500 64px ${FONT}`
        ctx.fillText('TODO', 50, 120)
        ctx.font = `400 50px ${FONT}`
        ctx.fillText('✓ pick blocks', 50, 220)
        ctx.fillText('✓ build app', 50, 300)
        ctx.fillText('□ ship v4', 50, 380)
      }),
    [],
  )
  const keyColor = dark ? '#2C3033' : '#FBFBFA'
  const keyEdge = dark ? '#596065' : '#A7ADB0'
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
        <planeGeometry args={[300, 300]} />
        <meshStandardMaterial map={wood} roughness={0.9} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[2.2, 0.0, 0.6]}>
        <planeGeometry args={[32, 15]} />
        <meshStandardMaterial map={mat} roughness={1} />
      </mesh>
      <group position={[-20, 0, -28]} rotation={[0, 0.06, 0]}>
        <mesh position={[28, 1.1, 8.4]}>
          <boxGeometry args={[66, 2.2, 25]} />
          <meshStandardMaterial color={dark ? '#1E2124' : '#E3E6E8'} roughness={0.8} />
          <Edges color={keyEdge} />
        </mesh>
        {keys.map((k, i) => (
          <group key={i} position={[k.x + k.w / 2, 3.0, k.z]}>
            <mesh>
              <boxGeometry args={[k.w, 1.6, 4]} />
              <meshStandardMaterial color={keyColor} roughness={0.7} />
              <Edges color={keyEdge} />
            </mesh>
            {k.ch && (
              <mesh position={[-k.w / 2 + 1.4, 0.81, -0.7]} rotation={[-Math.PI / 2, 0, 0]}>
                <planeGeometry args={[2, 2]} />
                <meshBasicMaterial map={glyphs.get(k.ch)} transparent toneMapped={false} />
              </mesh>
            )}
          </group>
        ))}
      </group>
      <group position={[-22, 0, -7]}>
        <mesh position={[0, 5, 0]}>
          <cylinderGeometry args={[4.6, 4.3, 10, 48, 1, true]} />
          <meshStandardMaterial color={dark ? '#C7462E' : '#E2654A'} roughness={0.6} side={DoubleSide} />
          <Edges color={dark ? '#7D2B1C' : '#B44A33'} threshold={20} />
        </mesh>
        <mesh position={[0, 9.2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[4.4, 48]} />
          <meshStandardMaterial color="#3B2416" roughness={0.3} />
        </mesh>
        <mesh position={[5.0, 5, 0]} rotation={[0, 0, -Math.PI / 2]}>
          <torusGeometry args={[2.3, 0.6, 12, 24, Math.PI]} />
          <meshStandardMaterial color={dark ? '#C7462E' : '#E2654A'} roughness={0.6} />
        </mesh>
        {[0, 1, 2].map((i) => (
          <group key={i} ref={(g) => { steam.current[i] = g }} position={[(i - 1) * 1.4, 10, 0]}>
            <Line
              points={Array.from({ length: 16 }, (_, k): V3 => [Math.sin(k * 0.7 + i) * 0.6, k * 0.35, Math.cos(k * 0.5 + i) * 0.3])}
              color={dark ? '#6A6560' : '#C9C1B6'}
              lineWidth={1.2}
              transparent
              opacity={0.7}
            />
          </group>
        ))}
      </group>
      <group position={[2, 0.8, 14]} rotation={[0, 0.08, Math.PI / 2]}>
        <mesh>
          <cylinderGeometry args={[0.8, 0.8, 34, 6]} />
          <meshStandardMaterial color="#F2C230" roughness={0.7} flatShading />
          <Edges color="#B88A12" threshold={20} />
        </mesh>
        <mesh position={[0, -18.4, 0]} rotation={[Math.PI, 0, 0]}>
          <coneGeometry args={[0.8, 2.8, 6]} />
          <meshStandardMaterial color="#EBD3AE" roughness={1} flatShading />
          <Edges color="#B4986C" threshold={20} />
        </mesh>
        <mesh position={[0, 17.6, 0]}>
          <cylinderGeometry args={[0.82, 0.82, 1.4, 12]} />
          <meshStandardMaterial color="#E58FA0" roughness={1} />
        </mesh>
      </group>
      <mesh position={[24, 0.02, 4]} rotation={[-Math.PI / 2, 0, -0.12]}>
        <planeGeometry args={[8, 8]} />
        <meshStandardMaterial map={note} roughness={1} />
      </mesh>
    </group>
  )
}

const TILE = { x0: -14, x1: 18, z0: -7, z1: 8, size: 1 }
export type Transition = { t: number; from: Look; to: Look; active: boolean }

export function TileFlip({ tr }: { tr: { current: Transition } }) {
  const nx = (TILE.x1 - TILE.x0) / TILE.size, nz = (TILE.z1 - TILE.z0) / TILE.size
  const count = nx * nz
  const ref = useRef<InstancedMesh>(null)
  const dummy = useMemo(() => new Object3D(), [])
  const faces = useRef<{ key: string; mats: Material[] } | null>(null)
  const tex = (look: Look) =>
    textTexture(64, 64, (ctx) => {
      ctx.fillStyle = look.floor
      ctx.fillRect(0, 0, 64, 64)
      ctx.strokeStyle = look.edge
      ctx.lineWidth = 2
      ctx.strokeRect(1, 1, 62, 62)
    })
  useFrame(() => {
    const m = ref.current
    if (!m) return
    const { t, from, to, active } = tr.current
    m.visible = active && t > 0.12 && t < 0.98
    if (!m.visible) return
    const key = `${from.world}${from.floor}${to.world}${to.floor}`
    if (faces.current?.key !== key) {
      const a = tex(from), b = tex(to)
      const mats = m.material as Material[]
      ;(mats[2] as unknown as { map: unknown; needsUpdate: boolean }).map = a
      ;(mats[3] as unknown as { map: unknown; needsUpdate: boolean }).map = b
      mats[2].needsUpdate = true
      mats[3].needsUpdate = true
      faces.current = { key, mats }
    }
    let i = 0
    const cx = BASE.x, cz = BASE.z
    const maxD = Math.hypot(TILE.x0 - cx, TILE.z1 - cz)
    for (let a = 0; a < nx; a++)
      for (let b = 0; b < nz; b++) {
        const x = TILE.x0 + (a + 0.5) * TILE.size, z = TILE.z0 + (b + 0.5) * TILE.size
        const d = Math.hypot(x - cx, z - cz) / maxD
        const local = Math.min(1, Math.max(0, (t - 0.15 - d * 0.45) / 0.3))
        const e = local < 0.5 ? 2 * local * local : 1 - Math.pow(-2 * local + 2, 2) / 2
        dummy.position.set(x, 0.03 + Math.sin(e * Math.PI) * 0.9, z)
        dummy.rotation.set(e * Math.PI, 0, 0)
        dummy.scale.setScalar(0.96)
        dummy.updateMatrix()
        m.setMatrixAt(i++, dummy.matrix)
      }
    m.instanceMatrix.needsUpdate = true
  })
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, count]} visible={false} frustumCulled={false}>
      <boxGeometry args={[TILE.size, 0.04, TILE.size]} />
      <meshBasicMaterial attach="material-0" color="#777" />
      <meshBasicMaterial attach="material-1" color="#777" />
      <meshBasicMaterial attach="material-2" toneMapped={false} />
      <meshBasicMaterial attach="material-3" toneMapped={false} />
      <meshBasicMaterial attach="material-4" color="#777" />
      <meshBasicMaterial attach="material-5" color="#777" />
    </instancedMesh>
  )
}
