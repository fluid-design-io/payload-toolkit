/**
 * The two worlds and their looks. Night shift is a dark warehouse with sodium
 * pools and a wet floor (dusk in the light theme); Cleanroom fab is a yellow
 * lit glass room. Both read the shared Energy so lights bank on row by row.
 */
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import type { Vector3 } from 'three'

import { Cleanroom } from './cleanroom'
import { APPLY, BASE, FONT, textTexture } from './contract'
import type { Energy, Look, WorldId } from './contract'
import { Hairlines } from './factory'
import type { Sim } from './sim'
import { FloorGrid, ReflectiveFloor } from './floor'
import { Beacons, Dust, Lamps } from './lamps'

export const WORLDS: readonly { id: WorldId; label: string; scene: string }[] = [
  { id: 'night', label: 'Night shift', scene: 'INT. WAREHOUSE · NIGHT' },
  { id: 'cleanroom', label: 'Cleanroom fab', scene: 'INT. FAB 2 · DAY' },
]

export function lookOf(world: WorldId, theme: 'light' | 'dark'): Look {
  const dark = theme === 'dark'
  if (world === 'night')
    return dark
      ? { world, dark, bg: 'radial-gradient(120% 90% at 50% 30%, #0E151A 0%, #04070A 70%)', surface: '#1A2126', fg: '#FCFCFC', muted: '#8A9094', edge: '#5E6B73', dim: '#2B353C', board: '#111820', chip: '#0D1215', chipFg: '#FCFCFC', accent: '#7FD0F7', lamp: '#FFA347', floor: '#0A0F13', floorEdge: '#1E272E', l: 42, s: 34 }
      : { world, dark, bg: 'linear-gradient(180deg, #3D5577 0%, #6B82A0 55%, #A5A99C 100%)', surface: '#D9DEE2', fg: '#1D2225', muted: '#55606A', edge: '#5E6C78', dim: '#9AA6B0', board: '#CDD4DA', chip: '#1D2225', chipFg: '#FCFCFC', accent: '#1F6FA8', lamp: '#FFB35C', floor: '#5B6A78', floorEdge: '#44525E', l: 60, s: 42 }
  return dark
    ? { world, dark, bg: 'radial-gradient(120% 90% at 50% 20%, #2A2412 0%, #12100A 75%)', surface: '#2A2617', fg: '#FFF4CF', muted: '#B3A374', edge: '#9C8A4C', dim: '#4A4128', board: '#2A2516', chip: '#14120A', chipFg: '#FFF4CF', accent: '#7FD0F5', lamp: '#FFD86B', floor: '#1E1B10', floorEdge: '#3C3520', l: 46, s: 30 }
    : { world, dark, bg: 'linear-gradient(180deg, #FFF8DC 0%, #FBF1C9 100%)', surface: '#FFFCEF', fg: '#3B3418', muted: '#8C8150', edge: '#B4A66E', dim: '#E3D9AE', board: '#FBF7E6', chip: '#2E2A17', chipFg: '#FFF8DC', accent: '#2C7DB3', lamp: '#F2D45C', floor: '#FBF4D8', floorEdge: '#E0D5A6', l: 70, s: 45 }
}

export function WorldStage({ world, look, energy, sim, anchors, ready }: { world: WorldId; look: Look; energy: Energy; sim: Sim; anchors: { current: Vector3[] }; ready: boolean }) {
  return (
    <>
      <Lights look={look} energy={energy} />
      {world === 'night' ? <NightShift look={look} energy={energy} anchors={anchors} sim={sim} ready={ready} /> : <Cleanroom look={look} energy={energy} sim={sim} />}
    </>
  )
}

function Lights({ look, energy }: { look: Look; energy: Energy }) {
  const amb = useRef<{ intensity: number }>(null)
  const sun = useRef<{ intensity: number }>(null)
  const hemi = useRef<{ intensity: number }>(null)
  const preset =
    look.world === 'night'
      ? { amb: look.dark ? 0.16 : 1.0, sun: look.dark ? 0.08 : 0.7, hemi: look.dark ? 0.22 : 0.5, color: look.dark ? '#6B7C8F' : '#DCE6F2', sunColor: look.dark ? '#C8D4E0' : '#FFD9B0' }
      : { amb: look.dark ? 0.7 : 1.5, sun: look.dark ? 0.5 : 1.1, hemi: 0.5, color: '#FFE9A6', sunColor: '#FFF1C4' }
  useFrame(() => {
    const rows = energy.rows
    let lit = 0
    for (let i = 0; i < rows.length; i++) lit += rows[i]
    const p = energy.all * (0.25 + 0.75 * (lit / rows.length))
    if (amb.current) amb.current.intensity = preset.amb * p
    if (sun.current) sun.current.intensity = preset.sun * p
    if (hemi.current) hemi.current.intensity = preset.hemi * p
  }, APPLY)
  return (
    <>
      <ambientLight ref={amb as never} color={preset.color} />
      <directionalLight ref={sun as never} position={[8, 16, 10]} color={preset.sunColor} />
      <hemisphereLight ref={hemi as never} args={[preset.color, '#3A3328']} />
    </>
  )
}

function NightShift({ look, energy, anchors, sim, ready }: { look: Look; energy: Energy; anchors: { current: Vector3[] }; sim: Sim; ready: boolean }) {
  const racks = useMemo(() => {
    const segs: number[] = []
    const seg = (a: number[], b: number[]) => segs.push(...a, ...b)
    const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) => {
      for (const y of [y0, y1]) for (const z of [z0, z1]) seg([x0, y, z], [x1, y, z])
      for (const x of [x0, x1]) for (const z of [z0, z1]) seg([x, y0, z], [x, y1, z])
      for (const x of [x0, x1]) for (const y of [y0, y1]) seg([x, y, z0], [x, y, z1])
    }
    const z = -12, depth = 2.2
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
    for (let x = -24; x <= 30; x += 6) seg([x, 16, -20], [x, 16, 12])
    for (const zz of [-20, -6, 12]) seg([-24, 16, zz], [30, 16, zz])
    seg([20, 0, -6], [20, 7, -6]); seg([20, 7, -6], [20, 7, 2]); seg([20, 7, 2], [20, 0, 2])
    for (let k = 0; k < 12; k++) seg([20, 0.5 + k * 0.55, -5.8], [20, 0.5 + k * 0.55, 1.8])
    return segs
  }, [])
  const hatch = useMemo(() => {
    const segs: number[] = []
    for (let k = -8; k <= 8; k++) {
      const x = BASE.x + k * 0.45
      segs.push(x - 1.2, 0.012, BASE.z + 3.2, x + 1.2, 0.012, BASE.z + 0.8)
    }
    return segs
  }, [])
  const exit = useMemo(() => (ready ? sign('EXIT', '#0E1A12', '#3BE07A', 256, 112, 60, 700) : null), [ready])
  const dock = useMemo(() => (ready ? sign('DOCK 03 · OUTBOUND', look.dark ? '#FFC24A' : '#5A4310', 'transparent', 768, 96, 46, 500) : null), [look.dark, ready])
  useEffect(() => () => exit?.dispose(), [exit])
  useEffect(() => () => dock?.dispose(), [dock])
  return (
    <group>
      <ReflectiveFloor look={look} energy={energy} />
      <FloorGrid look={look} />
      <Hairlines segs={hatch} color={look.lamp} opacity={0.35} />
      <Hairlines segs={racks} color={look.dark ? '#283137' : '#3F4C57'} opacity={0.8} />
      <Lamps look={look} energy={energy} />
      <Beacons look={look} energy={energy} anchors={anchors} sim={sim} />
      <Dust look={look} energy={energy} sim={sim} />
      {exit && (
        <mesh position={[-13.8, 6.4, -8.6]}>
          <planeGeometry args={[1.6, 0.7]} />
          <meshBasicMaterial map={exit} toneMapped={false} />
        </mesh>
      )}
      {dock && (
        <mesh position={[19.95, 7.6, -2]} rotation={[0, -Math.PI / 2, 0]}>
          <planeGeometry args={[6, 0.75]} />
          <meshBasicMaterial map={dock} transparent toneMapped={false} />
        </mesh>
      )}
    </group>
  )
}

function sign(text: string, fg: string, bg: string, w: number, h: number, size: number, weight: number) {
  return textTexture(w, h, (ctx) => {
    if (bg !== 'transparent') {
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, w, h)
    }
    ctx.fillStyle = fg
    ctx.font = `${weight} ${size}px ${FONT}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, w / 2, h / 2 + 2)
  })
}
