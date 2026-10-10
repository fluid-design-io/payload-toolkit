import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { Color, CylinderGeometry, DoubleSide, ExtrudeGeometry, Matrix4, Shape } from 'three'
import type { InstancedMesh } from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'

import type { Mode, StageProps, ThemeVariant, Tokens } from '../core/contract'
import { fillMat } from '../core/three'
import { FootShadows, Screen, sheetOf } from './grade'
import type { Grade } from './grade'
import { Lights } from './shared'

/**
 * A matte clay diorama: lit, rough materials in pastel putty, soft hairlines a
 * shade darker than each body, a rounded playmat on a studio sweep, a few toy
 * blocks, a warm coloured contact shadow and a tilt-shift blur at the frame's
 * top and bottom. Dark is the same set at dusk under a warm lamp.
 */
const light: Tokens = {
  bg: 'linear-gradient(180deg, #EFE3F1 0%, #E7D6EA 100%)', surface: '#FFF6EE', fg: '#4B3A33', muted: '#8C6E62', edge: '#9C7262', dim: '#E2C3B2', accent: '#FF6B45', floor: '#F7D9C4', floorEdge: '#E7BFA6',
  flat: false, rough: 0.92, shadow: 0.5, s: 68, l: 72,
  board: '#8FD3BA', boardEdge: '#3F8D72', silk: '#F2FFF9', trace: '#66B497', lit: '#FF6B45', body: '#FFF3E8', bodyEdge: '#A87C68', ink: '#5A4038', pin: '#D9A48C', sub: '#F1D0BE', ghost: '#B5E2D0',
  gold: '#F2C46D', die: '#6D5A8F', led: '#5FCB7B', ledBusy: '#A9F2BB', ledOff: '#D7C9BF', spark: '#FFFFFF',
  claude: '#FF9471', claudeEdge: '#B95839', claudeInk: '#FFF4EC', claudeCable: '#D9B3A1',
  codex: '#6676D6', codexInk: '#F4F5FF', codexCable: '#A9AFE3',
}
const dark: Tokens = {
  bg: 'radial-gradient(120% 90% at 50% 30%, #4A3E63 0%, #231E33 80%)', surface: '#776A99', fg: '#FFF2F8', muted: '#CDBBD8', edge: '#3A2F52', dim: '#5E5280', accent: '#FFA36C', floor: '#5A4D7A', floorEdge: '#6A5D8C',
  flat: false, rough: 0.92, shadow: 0.6, s: 45, l: 62,
  board: '#4F9682', boardEdge: '#25584A', silk: '#E8FFF6', trace: '#73B5A1', lit: '#FFC47A', body: '#8576A8', bodyEdge: '#3A2F52', ink: '#FFF2F8', pin: '#C7B2D9', sub: '#6A5D8C', ghost: '#4D8273',
  gold: '#E8B860', die: '#2A2340', led: '#7CF0A0', ledBusy: '#C0FFD2', ledOff: '#4D4366', spark: '#FFF3DE',
  claude: '#FF8F6B', claudeEdge: '#9A4A32', claudeInk: '#FFF4EC', claudeCable: '#9C8BB8',
  codex: '#8A96FF', codexInk: '#1E1A2B', codexCable: '#6E66A0',
}
/** The set itself: sweep, mat rim, shadow tint and the toy blocks' paint. */
const SET = {
  light: { sweep: '#E9D7EC', rim: '#E5B79C', shadow: '#7A3F2A', blocks: ['#FFB4A2', '#A8D8C4', '#FFD98A', '#B9B5F2', '#FF9E7A', '#9FD3E8'] },
  dark: { sweep: '#3B3254', rim: '#43385F', shadow: '#0B0814', blocks: ['#C46F62', '#4E8C7B', '#C79D45', '#6E66B8', '#C9684A', '#4F84A0'] },
}
const LIGHTS = {
  light: { amb: 0.35, sun: 2.1, hemi: 0.75, color: '#FFF1E6', sunColor: '#FFE3C8', ground: '#B98A9A' },
  dark: { amb: 0.3, sun: 1.7, hemi: 0.6, color: '#B9A6E8', sunColor: '#FFC48E', ground: '#2A2036' },
}
const grades: Partial<Record<Mode, Grade>> = {}
const gradeOf = (mode: Mode): Grade =>
  (grades[mode] ??= {
    layers: [
      { backdropFilter: 'blur(2.4px)', WebkitBackdropFilter: 'blur(2.4px)', maskImage: 'linear-gradient(to bottom, #000 0%, transparent 24%, transparent 80%, #000 100%)', WebkitMaskImage: 'linear-gradient(to bottom, #000 0%, transparent 24%, transparent 80%, #000 100%)' } as never,
      { background: mode === 'light' ? 'radial-gradient(120% 100% at 50% 40%, transparent 60%, rgba(120,60,40,0.10) 100%)' : 'radial-gradient(120% 100% at 50% 40%, transparent 55%, rgba(5,3,12,0.45) 100%)' },
    ],
  })

function roundedRect(w: number, d: number, r: number) {
  const s = new Shape()
  const x = -w / 2, y = -d / 2
  s.moveTo(x + r, y)
  s.lineTo(x + w - r, y)
  s.quadraticCurveTo(x + w, y, x + w, y + r)
  s.lineTo(x + w, y + d - r)
  s.quadraticCurveTo(x + w, y + d, x + w - r, y + d)
  s.lineTo(x + r, y + d)
  s.quadraticCurveTo(x, y + d, x, y + d - r)
  s.lineTo(x, y + r)
  s.quadraticCurveTo(x, y, x + r, y)
  return s
}

type Block = { at: [number, number, number]; s: [number, number, number]; rot: number; paint: number }

function Blocks({ list, paints }: { list: Block[]; paints: readonly string[] }) {
  const ref = useRef<InstancedMesh>(null)
  const geo = useMemo(() => new RoundedBoxGeometry(1, 1, 1, 4, 0.16), [])
  useEffect(() => () => geo.dispose(), [geo])
  useLayoutEffect(() => {
    const m = ref.current
    if (!m) return
    const mat = new Matrix4(), rot = new Matrix4(), col = new Color()
    list.forEach((b, i) => {
      mat.makeScale(...b.s).premultiply(rot.makeRotationY(b.rot)).setPosition(...b.at)
      m.setMatrixAt(i, mat)
      m.setColorAt(i, col.set(paints[b.paint % paints.length]))
    })
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
  }, [list, paints])
  return <instancedMesh key={list.length} ref={ref} args={[geo, fillMat('#FFFFFF', false, 0.9), list.length]} />
}

function Stage({ c, mode, power, line }: StageProps) {
  const set = SET[mode]
  const sheet = useMemo(() => sheetOf(line), [line])
  const mat = useMemo(() => {
    const g = new ExtrudeGeometry(roundedRect(sheet.w - 0.6, sheet.d - 0.6, 1.4), { depth: 0.16, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.1, bevelSegments: 4, curveSegments: 10 })
    g.rotateX(-Math.PI / 2)
    g.translate(sheet.cx, -0.27, sheet.cz)
    return g
  }, [sheet])
  useEffect(() => () => mat.dispose(), [mat])
  const sweep = useMemo(() => {
    const R = 6, len = sheet.w + 40
    const g = new CylinderGeometry(R, R, len, 24, 1, true, Math.PI, Math.PI / 2)
    g.rotateZ(Math.PI / 2)
    g.translate(sheet.cx, R - 0.3, sheet.z0 - 3 + R)
    return { curve: g, R, len }
  }, [sheet])
  useEffect(() => () => sweep.curve.dispose(), [sweep])
  const blocks = useMemo<Block[]>(() => {
    const pick = line.stops[1].box, board = line.stops[line.stops.length - 1].box
    const gap = (pick.x1 + board.x0) / 2, front = Math.min(sheet.z1 - 1.4, board.z1 + 0.4)
    return [
      { at: [gap - 0.6, 0.45, front], s: [0.9, 0.9, 0.9], rot: 0.3, paint: 0 },
      { at: [gap + 0.5, 0.35, front + 0.3], s: [0.7, 0.7, 0.7], rot: -0.2, paint: 1 },
      { at: [gap - 0.5, 1.2, front + 0.05], s: [0.6, 0.6, 0.6], rot: 0.75, paint: 2 },
      { at: [gap + 1.6, 0.3, front - 0.2], s: [1.4, 0.6, 0.6], rot: 0.05, paint: 5 },
      { at: [board.x1 + 1.0, 0.5, board.z0 + 1.2], s: [1.0, 1.0, 1.0], rot: 0.15, paint: 3 },
      { at: [board.x1 + 1.05, 1.35, board.z0 + 1.15], s: [0.7, 0.7, 0.7], rot: -0.4, paint: 4 },
      { at: [pick.x0 - 0.9, 0.3, pick.z1 - 0.3], s: [0.6, 0.6, 0.6], rot: 0.5, paint: 2 },
    ]
  }, [sheet, line])
  return (
    <>
      <Screen grade={gradeOf(mode)} />
      <Lights preset={LIGHTS[mode]} power={power} />
      <mesh geometry={mat} material={fillMat(c.floor, false, 0.95)} />
      <mesh position={[sheet.cx, -0.31, sheet.cz]} rotation={[-Math.PI / 2, 0, 0]} material={fillMat(set.sweep, false, 1)}>
        <planeGeometry args={[sweep.len, sheet.d + 24]} />
      </mesh>
      <mesh geometry={sweep.curve}>
        <meshStandardMaterial color={set.sweep} roughness={1} side={DoubleSide} />
      </mesh>
      <mesh position={[sheet.cx, sweep.R - 0.3 + 9, sheet.z0 - 3]} material={fillMat(set.sweep, false, 1)}>
        <planeGeometry args={[sweep.len, 18]} />
      </mesh>
      <mesh position={[sheet.cx, -0.33, sheet.cz]} rotation={[-Math.PI / 2, 0, 0]} material={fillMat(set.rim, false, 1)}>
        <planeGeometry args={[sheet.w + 0.4, sheet.d + 0.4]} />
      </mesh>
      <Blocks list={blocks} paints={set.blocks} />
      <FootShadows line={line} color={set.shadow} strength={c.shadow} />
    </>
  )
}

export const clay: ThemeVariant = {
  id: 'clay',
  label: 'Clay toy',
  scene: 'INT. TOY BOX',
  lens: { fov: 21, el: 34, frame: 1.08 },
  tokens: { light, dark },
  Stage,
}
