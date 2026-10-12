import { useFrame } from '@react-three/fiber'
import { Grid } from '@react-three/drei'
import { useEffect, useRef } from 'react'
import { DoubleSide, Matrix4, Vector3 } from 'three'
import type { CanvasTexture, InstancedMesh } from 'three'

import type { StageProps } from '../core/contract'
import { FONT, fillMat, lineMat, patch, segs, textTexture, useDisposable } from '../core/three'
import { LineShadow, Lights, label } from './shared'

type V3 = [number, number, number]

/** The room itself: amber glass, lamps, the particle counter and the gowning mat. */
const ROOM = {
  light: { glass: '#F2D45C', lamp: '#FFE38A', sign: '#FFF6CF', mat: '#DCEAF2', counter: '#0B0E0C', digits: '#69F0A0' },
  dark: { glass: '#FFD86B', lamp: '#FFD86B', sign: '#2E2817', mat: '#24405A', counter: '#0B0E0C', digits: '#69F0A0' },
}
const LIGHTS = {
  light: { amb: 1.5, sun: 1.1, hemi: 0.5, color: '#FFE9A6', sunColor: '#FFF1C4', ground: '#3A3328' },
  dark: { amb: 0.7, sun: 0.5, hemi: 0.5, color: '#FFE9A6', sunColor: '#FFF1C4', ground: '#3A3328' },
}

const dummy = new Matrix4()
const v = new Vector3()
/** The particle counter steps to a new reading this often, in seconds. */
const COUNT_EVERY = 0.7

function paintCounter(ctx: CanvasRenderingContext2D, room: (typeof ROOM)['light'], reading: number) {
  ctx.fillStyle = room.counter
  ctx.fillRect(0, 0, 512, 160)
  ctx.fillStyle = room.digits
  ctx.font = `500 30px ${FONT}`
  ctx.fillText('PARTICLES ≥0.5µm / ft³', 24, 52)
  ctx.font = `600 64px ${FONT}`
  ctx.fillText(String(reading).padStart(3, '0'), 24, 130)
}

export function Stage({ c, mode, sim, power, line }: StageProps) {
  const room = ROOM[mode]
  const dk = mode === 'dark'
  const W = { x0: line.extent.x0 - 1.3, x1: line.extent.x1 + 1.2, z0: -8.6, z1: 8.2, back: 7.5, front: 1.1 }
  const sign = useDisposable(() => label('ISO 5 · CLASS 100 · GOWN UP', { fg: c.fg, bg: room.sign, stroke: c.edge, size: 34, w: 768, h: 96 }), [c, room.sign])
  const shower = useDisposable(() => label('AIR SHOWER', { fg: c.fg, size: 36, w: 512, h: 80 }), [c])
  const counter = useDisposable(() => textTexture(512, 160, () => {}), [room])
  const shown = useRef<{ tex: CanvasTexture | null; tick: number; age: number }>({ tex: null, tick: -1, age: 0 })
  const entry = line.path ? line.path.at(0, new Vector3()).add(line.at.transport) : null
  const streaks = useRef<InstancedMesh>(null)
  useFrame(({ clock }, dt) => {
    const k = shown.current
    k.age += dt
    const tick = Math.floor(k.age / COUNT_EVERY)
    if (k.tex !== counter || k.tick !== tick) {
      k.tex = counter
      k.tick = tick
      paintCounter((counter.image as HTMLCanvasElement).getContext('2d')!, room, Math.floor(3 + Math.abs(Math.sin(tick * 1.7)) * 9 + sim.intake * 40))
      patch(counter, { needsUpdate: true })
    }
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
  const walls = useDisposable(() => {
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
        <meshBasicMaterial map={counter} toneMapped={false} />
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
