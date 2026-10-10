import { useFrame } from '@react-three/fiber'
import { Grid } from '@react-three/drei'
import { useEffect, useMemo, useRef, useState } from 'react'
import { DoubleSide, Matrix4, Vector3 } from 'three'
import type { InstancedMesh } from 'three'

import type { StageProps, ThemeVariant, Tokens } from '../core/contract'
import { pathWorld } from '../core/line'
import { FONT, fillMat, lineMat, segs, textTexture } from '../core/three'
import { LineShadow, Lights, label } from './shared'

type V3 = [number, number, number]

const shared = { gold: '#D8B865', die: '#0C1014', led: '#3DDC84', ledBusy: '#7CFF9B', ledOff: '#1E3324', claude: '#D97757', claudeEdge: '#8C3F25', claudeInk: '#FFF4EC', claudeCable: '#BDB6AC', codex: '#0E0F10', codexInk: '#F2F2F2', codexCable: '#2A2E31', spark: '#FFFFFF' }
const epoxy = { body: '#1A1D1F', bodyEdge: '#3D4448', ink: '#A5ADB2', pin: '#C9CED1', silk: '#EEF2EC', lit: '#F0C36A', sub: '#2E4A36' }

const light: Tokens = {
  ...shared, ...epoxy, flat: false, rough: 1, shadow: 0.18, s: 45, l: 70,
  bg: 'linear-gradient(180deg, #FFF8DC 0%, #FBF1C9 100%)', surface: '#FFFCEF', fg: '#3B3418', muted: '#8C8150', edge: '#B4A66E', dim: '#E3D9AE', accent: '#2C7DB3', floor: '#FBF4D8', floorEdge: '#E0D5A6',
  board: '#2C6646', boardEdge: '#1E4B33', trace: '#3B7D58', ghost: '#4B8566',
}
const dark: Tokens = {
  ...shared, ...epoxy, flat: false, rough: 1, shadow: 0.5, s: 30, l: 46,
  bg: 'radial-gradient(120% 90% at 50% 20%, #2A2412 0%, #12100A 75%)', surface: '#2A2617', fg: '#FFF4CF', muted: '#B3A374', edge: '#9C8A4C', dim: '#4A4128', accent: '#7FD0F5', floor: '#1E1B10', floorEdge: '#3C3520',
  board: '#173A28', boardEdge: '#2E6B4C', trace: '#22513A', ghost: '#24493A',
}
/** The room itself: amber glass, lamps, the particle counter and the gowning mat. */
const ROOM = {
  light: { glass: '#F2D45C', lamp: '#FFE38A', sign: '#FFF6CF', mat: '#DCEAF2', counter: '#0B0E0C', digits: '#69F0A0' },
  dark: { glass: '#FFD86B', lamp: '#FFD86B', sign: '#2E2817', mat: '#24405A', counter: '#0B0E0C', digits: '#69F0A0' },
}
const LIGHTS = {
  light: { amb: 1.5, sun: 1.1, hemi: 0.5, color: '#FFE9A6', sunColor: '#FFF1C4', ground: '#3A3328' },
  dark: { amb: 0.7, sun: 0.5, hemi: 0.5, color: '#FFE9A6', sunColor: '#FFF1C4', ground: '#3A3328' },
}

function Stage({ c, mode, sim, power, line }: StageProps) {
  const room = ROOM[mode]
  const dk = mode === 'dark'
  const W = useMemo(() => ({ x0: line.extent.x0 - 1.3, x1: line.extent.x1 + 1.2, z0: -8.6, z1: 8.2, back: 7.5, front: 1.1 }), [line])
  const sign = useMemo(() => label('ISO 5 · CLASS 100 · GOWN UP', { fg: c.fg, bg: room.sign, stroke: c.edge, size: 34, w: 768, h: 96 }), [c, room.sign])
  const shower = useMemo(() => label('AIR SHOWER', { fg: c.fg, size: 36, w: 512, h: 80 }), [c])
  useEffect(() => () => { sign.dispose(); shower.dispose() }, [sign, shower])
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 700)
    return () => clearInterval(id)
  }, [])
  const counterTex = useMemo(
    () =>
      textTexture(512, 160, (ctx) => {
        ctx.fillStyle = room.counter
        ctx.fillRect(0, 0, 512, 160)
        ctx.fillStyle = room.digits
        ctx.font = `500 30px ${FONT}`
        ctx.fillText('PARTICLES ≥0.5µm / ft³', 24, 52)
        ctx.font = `600 64px ${FONT}`
        ctx.fillText(String(Math.floor(3 + Math.abs(Math.sin(tick * 1.7)) * 9 + sim.intake * 40)).padStart(3, '0'), 24, 130)
      }),
    [tick, sim, room],
  )
  useEffect(() => () => counterTex.dispose(), [counterTex])
  const entry = useMemo(() => (sim.rig.transport.kind === 'path' ? pathWorld({ ...sim, at: line.at }, 0, new Vector3()) : null), [sim, line])
  const streaks = useRef<InstancedMesh>(null)
  const dummy = useMemo(() => new Matrix4(), [])
  const v = useMemo(() => new Vector3(), [])
  useFrame(({ clock }) => {
    const m = streaks.current
    if (!m) return
    m.visible = !!entry && sim.intake > 0
    if (!m.visible || !entry) return
    for (let i = 0; i < 24; i++) {
      const t = (clock.elapsedTime * 3 + i * 0.137) % 1
      const side = i % 2 ? 1 : -1
      v.set(entry.x + 0.6 + ((i * 0.37) % 0.7), 0.95 + ((i * 0.53) % 1.4), entry.z + side * (0.95 - t * 0.8))
      m.setMatrixAt(i, dummy.makeScale(1 - t, 1 - t, 1 - t).setPosition(v))
    }
    m.instanceMatrix.needsUpdate = true
  })
  const walls = useMemo(() => {
    const list: number[] = []
    const panels = (from: V3, to: V3, h: number, step: number) => {
      const len = Math.hypot(to[0] - from[0], to[2] - from[2])
      const n = Math.ceil(len / step)
      for (let k = 0; k <= n; k++) {
        const t = k / n
        const x = from[0] + (to[0] - from[0]) * t, z = from[2] + (to[2] - from[2]) * t
        list.push(x, 0, z, x, h, z)
      }
      list.push(from[0], h, from[2], to[0], h, to[2], from[0], 0.3, from[2], to[0], 0.3, to[2])
      return { len, mid: [(from[0] + to[0]) / 2, h / 2, (from[2] + to[2]) / 2] as V3, rot: Math.atan2(-(to[2] - from[2]), to[0] - from[0]), h }
    }
    const planes = [
      panels([W.x0, 0, W.z0], [W.x1, 0, W.z0], W.back, 2.5),
      panels([W.x0, 0, W.z0], [W.x0, 0, W.z1], W.back, 2.5),
      panels([W.x1, 0, W.z0], [W.x1, 0, W.z1], W.front, 2.5),
      panels([W.x0, 0, W.z1], [W.x1, 0, W.z1], W.front, 2.5),
    ]
    const beams = Math.floor((W.x1 - W.x0) / 2.6)
    for (let k = 0; k < beams; k++) list.push(W.x0 + k * 2.6, W.back, W.z0, W.x0 + k * 2.6, W.back, W.z0 + 2.4)
    return { geo: segs(list), planes, lamps: Math.max(1, Math.floor((W.x1 - W.x0 - 2.6) / 4.8)) }
  }, [W])
  useEffect(() => () => walls.geo.dispose(), [walls])
  const lamps = useRef<InstancedMesh>(null)
  useEffect(() => {
    const m = new Matrix4()
    for (let k = 0; k < walls.lamps; k++) lamps.current?.setMatrixAt(k, m.makeTranslation(W.x0 + 2.6 + k * 4.8, W.back - 0.4, W.z0 + 0.05))
    if (lamps.current) lamps.current.instanceMatrix.needsUpdate = true
  }, [W, walls.lamps])
  const cx = (W.x0 + W.x1) / 2, cz = (W.z0 + W.z1) / 2
  const pickX = (line.stops[0].span.x0 + line.stops[0].span.x1) / 2
  const boardStop = line.stops[line.stops.length - 1]
  return (
    <>
      <Lights preset={LIGHTS[mode]} power={power} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, -0.005, cz]} material={fillMat(c.floor, c.flat, c.rough)}>
        <planeGeometry args={[W.x1 - W.x0, W.z1 - W.z0]} />
      </mesh>
      <Grid position={[cx, 0.002, cz]} args={[W.x1 - W.x0, W.z1 - W.z0]} cellSize={0.3} cellThickness={0.5} cellColor={c.floorEdge} sectionSize={1.2} sectionThickness={0.8} sectionColor={dk ? c.dim : c.edge} fadeDistance={260} />
      {walls.planes.map((w, i) => (
        <mesh key={i} position={w.mid} rotation={[0, w.rot, 0]}>
          <planeGeometry args={[w.len, w.h]} />
          <meshBasicMaterial color={room.glass} transparent opacity={dk ? 0.06 : 0.12} side={DoubleSide} depthWrite={false} />
        </mesh>
      ))}
      <lineSegments geometry={walls.geo} material={lineMat(c.edge)} />
      <instancedMesh key={walls.lamps} ref={lamps} args={[undefined, undefined, walls.lamps]}>
        <boxGeometry args={[3.6, 0.18, 0.1]} />
        <meshBasicMaterial color={room.lamp} toneMapped={false} />
      </instancedMesh>
      <mesh position={[pickX + 5.4, 4.4, W.z0 + 0.06]}>
        <planeGeometry args={[6.4, 0.8]} />
        <meshBasicMaterial map={sign} toneMapped={false} />
      </mesh>
      <mesh position={[(boardStop.box.x0 + boardStop.box.x1) / 2, 4.6, W.z0 + 0.06]}>
        <planeGeometry args={[3.2, 1.0]} />
        <meshBasicMaterial map={counterTex} toneMapped={false} />
      </mesh>
      {entry && (
        <group position={[entry.x + 0.9, 0, entry.z]}>
          {[-1.05, 1.05].map((z) => (
            <mesh key={z} position={[0, 1.5, z]} material={fillMat(c.surface, c.flat, c.rough)}>
              <boxGeometry args={[0.9, 3.0, 0.32]} />
            </mesh>
          ))}
          <mesh position={[0, 3.18, 0]} material={fillMat(c.surface, c.flat, c.rough)}>
            <boxGeometry args={[0.9, 0.36, 2.42]} />
          </mesh>
          <sprite position={[0, 3.75, 0]} scale={[2.4, 0.38, 1]}>
            <spriteMaterial map={shower} transparent toneMapped={false} depthWrite={false} />
          </sprite>
        </group>
      )}
      <instancedMesh ref={streaks} args={[undefined, undefined, 24]} visible={false} frustumCulled={false}>
        <boxGeometry args={[0.02, 0.02, 0.35]} />
        <meshBasicMaterial color={c.accent} toneMapped={false} />
      </instancedMesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[W.x0 + 0.8, 0.01, 2]}>
        <planeGeometry args={[1.4, 4]} />
        <meshBasicMaterial color={room.mat} />
      </mesh>
      <LineShadow c={c} line={line} />
    </>
  )
}

export const cleanroom: ThemeVariant = {
  id: 'cleanroom',
  label: 'Cleanroom fab',
  scene: 'INT. FAB 2',
  lens: { fov: 17, el: 32, frame: 0.98 },
  tokens: { light, dark },
  Stage,
}
