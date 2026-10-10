import { useFrame, useThree } from '@react-three/fiber'
import { CameraControls, ContactShadows, Edges, Line } from '@react-three/drei'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  BoxGeometry, BufferGeometry, Color, Float32BufferAttribute, Group, InstancedMesh, LineSegments as ThreeLineSegments,
  Matrix4, Mesh, MeshBasicMaterial, Points, Quaternion, Vector3,
} from 'three'
import type { BufferAttribute, Texture } from 'three'
import { Line2 } from 'three/examples/jsm/lines/Line2.js'
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import type { Agent, CatalogItem, Database, PackageManager, Setup } from '../../../../workspace/-workspace/workspace.types'
import type { Lab } from '../../lab.types'
import { MONO, canvasTexture, chipMarking, cpuArt, dieArt, dimmArt, leafArt, probeArt, silkArt } from './art'
import {
  ACCENT, BANDS, BAND_DEPTH, BELT, BOARD, BY, CPU, HEADER, PAGE, RAIL, TRAY,
  bandZ, cpuHalf, debug, inFlight, makeRoute, pocket, sampleRoute, specOf, staticRoutes, travelling, trayScale,
} from './model'
import type { Part, Route, RouteStyle, Sim, Spec } from './model'

export type Finish = 'hairline' | 'fr4' | 'black' | 'ceramic'
export type CameraMode = 'board' | 'macro' | 'die'
export type Director = { finish: Finish; routing: RouteStyle; camera: CameraMode; follow: boolean }

export function palette(theme: Lab['theme'], finish: Finish) {
  const dark = theme === 'dark'
  const base = dark
    ? { bg: '#090E11', surface: '#141B1F', fg: '#FCFCFC', muted: '#8A9094', edge: '#5C676C', dim: '#2A353B', l: 46, s: 36 }
    : { bg: '#EDF1F3', surface: '#FFFFFF', fg: '#1D2225', muted: '#727C81', edge: '#9AA4A9', dim: '#C9D1D5', l: 62, s: 44 }
  const power = '#E8A33D'
  if (finish === 'fr4')
    return { ...base, board: dark ? '#173A28' : '#2C6646', silk: '#EEF2EC', trace: dark ? '#22513A' : '#3B7D58', lit: '#F0C36A', body: '#1A1D1F', bodyEdge: '#3D4448', ink: '#A5ADB2', pin: '#C9CED1', sub: '#2E4A36', power, ghost: dark ? '#24493A' : '#4B8566', boardEdge: dark ? '#2E6B4C' : '#1E4B33' }
  if (finish === 'black')
    return { ...base, board: dark ? '#0F1214' : '#1A1E21', silk: '#D9DEE1', trace: '#2B3236', lit: '#7FB6D2', body: '#0B0D0E', bodyEdge: '#3A4044', ink: '#8A9399', pin: '#B7BEC2', sub: '#202629', power, ghost: '#262D31', boardEdge: '#3A4247' }
  if (finish === 'ceramic')
    return { ...base, board: dark ? '#DCD6C8' : '#F4F1EA', silk: '#9A917E', trace: '#DCCB9C', lit: '#B8892B', body: '#FBFAF6', bodyEdge: '#B5AE9F', ink: '#5E5646', pin: '#C9A54C', sub: '#E9E3D4', power: '#C9772B', ghost: '#E6E0D2', boardEdge: '#B9B09C' }
  return {
    ...base,
    board: dark ? '#0F161A' : '#F8FBFC', silk: dark ? '#6B777D' : '#8E989D', trace: dark ? '#26323A' : '#D3DADE', lit: ACCENT,
    body: dark ? '#182126' : '#FFFFFF', bodyEdge: dark ? '#6B767B' : '#8E989D', ink: dark ? '#C9D1D5' : '#1D2225',
    pin: dark ? '#56636A' : '#B3BCC1', sub: dark ? '#1E282D' : '#EEF3F5', power, ghost: dark ? '#141C20' : '#EEF2F4', boardEdge: dark ? '#4A555B' : '#9AA4A9',
  }
}
export type Colors = ReturnType<typeof palette>
const tint = (hue: number, c: Colors, l = c.l) => `hsl(${hue}, ${c.s}%, ${l}%)`

export type Tip = { show: (e: PointerEvent, title: string, sub: string, image?: string) => void; move: (e: PointerEvent) => void; hide: () => void }
export type Cam = {
  focusRef: string | null
  decap: boolean
  decapRef: string | null
  area: { box: [number, number, number, number]; until: number } | null
  hold: boolean
  holdUntil: number
  seenAdd: number
  hovered: string | null
}

function Box({ size, color, edge, position, children, onClick, opacity = 1 }: {
  size: [number, number, number]; color: string; edge: string; position?: [number, number, number]; children?: ReactNode; onClick?: () => void; opacity?: number
}) {
  return (
    <mesh position={position} onClick={onClick ? (e) => { e.stopPropagation(); onClick() } : undefined}>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} roughness={0.9} transparent={opacity < 1} opacity={opacity} />
      <Edges color={edge} />
      {children}
    </mesh>
  )
}

function useLine2(points: Vector3[], color: string, width: number, opacity = 1) {
  const { size } = useThree()
  const line = useMemo(() => {
    const geo = new LineGeometry()
    geo.setPositions(points.flatMap((p) => [p.x, p.y, p.z]))
    const mat = new LineMaterial({ color: new Color(color).getHex(), linewidth: width, transparent: opacity < 1, opacity })
    return new Line2(geo, mat)
  }, [points])
  useEffect(() => () => { line.geometry.dispose(); line.material.dispose() }, [line])
  useLayoutEffect(() => {
    line.material.color.set(color)
    line.material.linewidth = width
    line.material.opacity = opacity
    line.material.transparent = opacity < 1
  }, [line, color, width, opacity])
  useLayoutEffect(() => { line.material.resolution.set(size.width, size.height) }, [line, size.width, size.height])
  return line
}

function TraceLine({ route, color, width, progress, opacity }: { route: Route; color: string; width: number; progress?: () => number; opacity?: number }) {
  const line = useLine2(route.pts, color, width, opacity)
  const segs = route.pts.length - 1
  useFrame(() => {
    if (!progress) return
    const k = Math.floor(progress() * segs)
    line.visible = k > 0
    line.geometry.instanceCount = Math.max(1, k)
  })
  return <primitive object={line} />
}

const pinCache = new Map<string, BufferGeometry>()
const standoff = (spec: Spec) => (spec.pkg === 'qfp' || spec.pkg === 'soic' ? 0.03 : spec.pkg === 'dip' ? 0.06 : 0)
export const chipTop = (spec: Spec) => standoff(spec) + spec.h

function pinGeometry(spec: Spec) {
  const key = `${spec.pkg}-${spec.w}-${spec.d}`
  const hit = pinCache.get(key)
  if (hit) return hit
  const boxes: BufferGeometry[] = []
  const add = (sx: number, sy: number, sz: number, x: number, y: number, z: number) => {
    const b = new BoxGeometry(sx, sy, sz)
    b.translate(x, y, z)
    boxes.push(b)
  }
  const so = standoff(spec)
  const side = (len: number, axis: 'x' | 'z', sign: number, edge: number) => {
    const n = Math.max(3, Math.floor(len / 0.1))
    const pitch = len / n
    const t = 0.028
    for (let i = 0; i < n; i++) {
      const u = -len / 2 + (i + 0.5) * pitch
      const place = (along: number, out: number, sx: number, sy: number, y: number) =>
        axis === 'z' ? add(sx, sy, along, u, y, sign * (edge + out)) : add(along, sy, sx, sign * (edge + out), y, u)
      if (spec.pkg === 'qfn') place(0.07, 0, t * 1.4, 0.02, 0.01)
      else if (spec.pkg === 'dip') {
        place(0.1, 0.05, t * 1.6, 0.03, so + spec.h * 0.35)
        place(0.03, 0.1, t * 1.6, so + spec.h * 0.35 + 0.05, (so + spec.h * 0.35 - 0.05) / 2)
      } else {
        const l = spec.lead
        place(l * 0.55, l * 0.27, t, 0.025, so + spec.h * 0.45)
        place(0.025, l * 0.55, t, so + spec.h * 0.45, (so + spec.h * 0.45) / 2)
        place(l * 0.45, l * 0.78, t, 0.022, 0.011)
      }
    }
  }
  if (spec.pkg === 'qfp' || spec.pkg === 'qfn') {
    for (const sign of [-1, 1]) {
      side(spec.w * 0.84, 'z', sign, spec.d / 2)
      side(spec.d * 0.84, 'x', sign, spec.w / 2)
    }
  } else if (spec.pkg === 'soic' || spec.pkg === 'dip') for (const sign of [-1, 1]) side(spec.w * 0.86, 'z', sign, spec.d / 2)
  else if (spec.pkg === 'passive') {
    add(0.12, spec.h + 0.01, spec.d + 0.01, -spec.w / 2 + 0.06, spec.h / 2, 0)
    add(0.12, spec.h + 0.01, spec.d + 0.01, spec.w / 2 - 0.06, spec.h / 2, 0)
  } else {
    for (let i = 0; i < 10; i++) for (const r of [-1, 1]) add(0.05, 0.42, 0.05, -1.0 + i * 0.1, 0.21, r * 0.05 + 0.4)
    add(1.1, 0.12, 0.22, -0.55, 0.06, 0.4)
  }
  const merged = mergeGeometries(boxes)!
  boxes.forEach((b) => b.dispose())
  pinCache.set(key, merged)
  return merged
}

function bondWires(spec: Spec, die: number) {
  const pts: [number, number, number][] = []
  const y0 = chipTop(spec) - 0.01
  const n = 7
  for (let s = 0; s < 4; s++)
    for (let i = 0; i < n; i++) {
      const u = -die / 2 + ((i + 0.5) / n) * die
      const a = s < 2 ? new Vector3(u, y0, (s ? 1 : -1) * die * 0.5) : new Vector3((s === 3 ? 1 : -1) * die * 0.5, y0, u)
      const b = s < 2 ? new Vector3(u * 1.3, y0, (s ? 1 : -1) * spec.d * 0.47) : new Vector3((s === 3 ? 1 : -1) * spec.w * 0.47, y0, u * 1.3)
      if (spec.pkg === 'soic' || spec.pkg === 'dip') if (s >= 2) continue
      const m = a.clone().lerp(b, 0.4).setY(y0 + die * 0.18)
      pts.push([a.x, a.y, a.z], [m.x, m.y, m.z], [m.x, m.y, m.z], [b.x, b.y, b.z])
    }
  return pts
}

export function ChipBody({ spec, top, c, ghost, decapRef }: { spec: Spec; top: Texture | null; c: Colors; ghost?: boolean; decapRef?: { current: number; die: Texture | null } }) {
  const pins = useMemo(() => pinGeometry(spec), [spec])
  const lid = useRef<Mesh>(null)
  const dieMesh = useRef<Mesh>(null)
  const wires = useRef<Group>(null)
  const so = standoff(spec)
  const body = ghost ? c.ghost : spec.pkg === 'passive' ? (spec.c > 0.5 ? c.body : '#C8A87E') : c.body
  const dieSize = Math.min(spec.w, spec.d) * 0.78
  const wirePts = useMemo(() => bondWires(spec, dieSize), [spec, dieSize])
  useFrame(() => {
    const d = decapRef?.current ?? 0
    if (lid.current) {
      lid.current.position.y = so + spec.h + 0.003 + d * 0.9
      lid.current.rotation.z = d * 0.5
      ;(lid.current.material as MeshBasicMaterial).opacity = 1 - d
      lid.current.visible = d < 0.99
    }
    if (dieMesh.current) {
      dieMesh.current.visible = d > 0.02 && !!decapRef?.die
      const m = dieMesh.current.material as MeshBasicMaterial
      if (decapRef?.die && m.map !== decapRef.die) {
        m.map = decapRef.die
        m.needsUpdate = true
      }
    }
    if (wires.current) wires.current.visible = d > 0.3
  })
  if (spec.pkg === 'module')
    return (
      <group>
        <mesh geometry={pins}>
          <meshStandardMaterial color={c.pin} metalness={0.6} roughness={0.4} />
        </mesh>
        <Box size={[spec.w, 0.06, spec.d]} position={[0, 0.45, 0]} color={ghost ? c.ghost : c.sub} edge={c.bodyEdge} />
        <Box size={[spec.w * 0.56, 0.2, spec.d * 0.72]} position={[spec.w * 0.12, 0.58, 0]} color={c.pin} edge={c.bodyEdge} />
        {top && (
          <mesh ref={lid} position={[spec.w * 0.12, 0.682, 0]} rotation-x={-Math.PI / 2}>
            <planeGeometry args={[spec.w * 0.54, spec.d * 0.7]} />
            <meshBasicMaterial map={top} transparent toneMapped={false} />
          </mesh>
        )}
        {[-0.95, -0.7, -0.45].map((x) => (
          <Box key={x} size={[0.16, 0.08, 0.3]} position={[x, 0.52, -0.3]} color={c.body} edge={c.bodyEdge} />
        ))}
      </group>
    )
  return (
    <group>
      <mesh position={[0, so + spec.h / 2, 0]}>
        <boxGeometry args={[spec.w, spec.h, spec.d]} />
        <meshStandardMaterial color={body} roughness={0.85} transparent={ghost} opacity={ghost ? 0.7 : 1} />
        <Edges color={ghost ? c.edge : c.bodyEdge} />
      </mesh>
      <mesh geometry={pins}>
        <meshStandardMaterial color={c.pin} metalness={0.5} roughness={0.45} transparent={ghost} opacity={ghost ? 0.5 : 1} />
      </mesh>
      {top && spec.pkg !== 'passive' && (
        <mesh ref={lid} position={[0, so + spec.h + 0.003, 0]} rotation-x={-Math.PI / 2}>
          <planeGeometry args={[spec.w * 0.97, spec.d * 0.97]} />
          <meshBasicMaterial map={top} transparent toneMapped={false} />
        </mesh>
      )}
      {decapRef && (
        <>
          <mesh ref={dieMesh} position={[0, so + spec.h + 0.002, 0]} rotation-x={-Math.PI / 2} visible={false}>
            <planeGeometry args={[dieSize, dieSize]} />
            <meshBasicMaterial toneMapped={false} />
          </mesh>
          <group ref={wires} visible={false}>
            <Line points={wirePts} segments color="#D8B865" lineWidth={1.2} />
          </group>
        </>
      )}
    </group>
  )
}

export function PartView({ p, lab, c, tip, cam, onFocus, codeOf }: {
  p: Part; lab: Lab; c: Colors; tip: Tip; cam: Cam; onFocus: (ref: string) => void; codeOf: (ref: string) => string
}) {
  const group = useRef<Group>(null)
  const ring = useRef<ThreeLineSegments>(null)
  const top = useMemo(() => chipMarking(p.item, codeOf(p.item.ref), p.spec, c.body, c.ink), [p, c.body, c.ink, codeOf])
  useEffect(() => () => top.dispose(), [top])
  const decap = useRef({ current: 0, die: null as Texture | null })
  const requested = useRef(false)
  const image = lab.theme === 'dark' ? (p.item.imageDark ?? p.item.image) : p.item.image
  const lit = useMemo(() => new Color(), [])
  useFrame((_, dt) => {
    const g = group.current
    if (!g) return
    g.position.copy(p.pos)
    g.scale.setScalar(Math.max(0.001, p.scale))
    g.rotation.y = p.yaw
    const want = cam.decapRef === p.item.ref ? 1 : 0
    if (want && !requested.current) {
      requested.current = true
      void dieArt(image, p.item.hue, p.item.title).then((t) => { decap.current.die = t })
    }
    decap.current.current += (want - decap.current.current) * (1 - Math.exp(-dt * 4))
    if (ring.current) {
      const m = ring.current.material as MeshBasicMaterial
      const hot = cam.hovered === p.item.ref || cam.focusRef === p.item.ref || p.mode === 'carry' || p.mode === 'lift'
      const query = lab.focus.query.trim().toLowerCase()
      const match = query && `${p.item.title} ${p.item.label}`.toLowerCase().includes(query)
      lit.set(p.flash > 0 ? (lab.setup.agent === 'codex' ? c.fg : '#D97757') : hot || match ? ACCENT : c.bodyEdge)
      m.color.copy(lit)
      ring.current.visible = hot || p.flash > 0 || !!match
    }
  })
  const fw = p.spec.fw + 0.12, fd = p.spec.fd + 0.12
  return (
    <group
      ref={group}
      onClick={(e) => {
        e.stopPropagation()
        if (p.mode === 'seated') onFocus(p.item.ref)
        else lab.toggle(p.item.ref)
      }}
      onPointerOver={(e) => {
        e.stopPropagation()
        cam.hovered = p.item.ref
        tip.show(e.nativeEvent, p.item.title, `${p.item.label} · ${codeOf(p.item.ref)} · ${p.mode === 'seated' ? 'click to inspect' : p.mode}`, image)
      }}
      onPointerMove={(e) => tip.move(e.nativeEvent)}
      onPointerOut={() => { cam.hovered = null; tip.hide() }}
    >
      <ChipBody spec={p.spec} top={top} c={c} decapRef={decap.current} />
      <lineSegments ref={ring} visible={false} position={[0, 0.012, 0]}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[new Float32Array([-fw / 2, 0, -fd / 2, fw / 2, 0, -fd / 2, fw / 2, 0, -fd / 2, fw / 2, 0, fd / 2, fw / 2, 0, fd / 2, -fw / 2, 0, fd / 2, -fw / 2, 0, fd / 2, -fw / 2, 0, -fd / 2]), 3]} />
        </bufferGeometry>
        <lineBasicMaterial color={ACCENT} />
      </lineSegments>
    </group>
  )
}

function Footprints({ sim }: { sim: Sim }) {
  const ref = useRef<ThreeLineSegments>(null)
  useFrame(({ clock }) => {
    const seg = ref.current
    if (!seg) return
    const pts: number[] = []
    for (const p of sim.parts.values()) {
      if (p.mode === 'seated' || p.mode === 'return' || p.mode === 'lift' || !p.slot) continue
      const s = p.slot
      const w = (p.spec.fw * s.s) / 2 + 0.08, d = (p.spec.fd * s.s) / 2 + 0.08
      const y = s.y + 0.01
      const k = 0.18 * s.s + 0.06
      for (const [x, z, dx, dz] of [[-w, -d, 1, 1], [w, -d, -1, 1], [w, d, -1, -1], [-w, d, 1, -1]] as const) {
        pts.push(s.x + x, y, s.z + z, s.x + x + dx * k, y, s.z + z, s.x + x, y, s.z + z, s.x + x, y, s.z + z + dz * k)
      }
    }
    seg.geometry.setAttribute('position', new Float32BufferAttribute(pts, 3))
    seg.visible = pts.length > 0
    ;(seg.material as MeshBasicMaterial).opacity = 0.55 + Math.sin(clock.elapsedTime * 8) * 0.45
  })
  return (
    <lineSegments ref={ref} frustumCulled={false}>
      <bufferGeometry />
      <lineBasicMaterial color={ACCENT} transparent />
    </lineSegments>
  )
}

function segs(list: number[][]) {
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(list.flat(), 3))
  return g
}
const rect = (x0: number, z0: number, x1: number, z1: number, y: number) => [
  [x0, y, z0], [x1, y, z0], [x1, y, z0], [x1, y, z1], [x1, y, z1], [x0, y, z1], [x0, y, z1], [x0, y, z0],
]

function Board({ lab, sim, c, director, activeBand }: { lab: Lab; sim: Sim; c: Colors; director: Director; activeBand: number }) {
  const silk = useMemo(() => silkArt(lab.setup, c.silk, ACCENT, activeBand), [lab.setup.target, lab.setup.name, lab.setup.framework, lab.setup.database, lab.setup.packageManager, lab.setup.agent, c.silk, activeBand])
  useEffect(() => () => silk.dispose(), [silk])
  const y = BY + 0.003
  const outline = useMemo(() => {
    const l: number[][] = []
    l.push(...rect(PAGE.x0, PAGE.z0, PAGE.x1, PAGE.z1, y))
    for (let b = 1; b < BANDS.length; b++) l.push([PAGE.x0, y, bandZ(b)], [PAGE.x1, y, bandZ(b)])
    for (let b = 0; b < BANDS.length; b++) l.push([PAGE.chipX0 - 0.15, y, bandZ(b) + 0.3], [PAGE.chipX0 - 0.15, y, bandZ(b + 1) - 0.08])
    l.push(...rect(-7.7, -6.3, -2.5, -4.05, y))
    l.push(...rect(-7.8, -3.6, -6.55, 0.8, y))
    l.push(...rect(-7.7, 1.3, -4.3, 6.2, y))
    l.push(...rect(-3.85, 1.3, -1.25, 5.05, y))
    l.push(...rect(HEADER.x - 0.45, HEADER.z - 0.4, HEADER.x + 0.45, HEADER.z + 0.4, y))
    l.push(...rect(-1.15, -4.1, 0.35, 1.2, y))
    for (const hatch of sim.layout.hatches) {
      l.push(...rect(hatch.x0, hatch.z0, hatch.x1, hatch.z1, y))
      for (let x = hatch.x0 - (hatch.z1 - hatch.z0); x < hatch.x1; x += 0.22) {
        const a = Math.max(x, hatch.x0), za = hatch.z1 - (a - x)
        const b = Math.min(x + (hatch.z1 - hatch.z0), hatch.x1), zb = hatch.z1 - (b - x)
        if (b > a) l.push([a, y, za], [b, y, zb])
      }
    }
    return segs(l)
  }, [sim.layout.hatches, y])
  const statics = useMemo(() => staticRoutes(director.routing, lab.setup.framework), [director.routing, lab.setup.framework])
  const band = activeBand >= 0 ? activeBand : -1
  return (
    <group>
      <mesh position={[(BOARD.x0 + BOARD.x1) / 2, BY - 0.08, (BOARD.z0 + BOARD.z1) / 2]}>
        <boxGeometry args={[BOARD.x1 - BOARD.x0, 0.16, BOARD.z1 - BOARD.z0]} />
        <meshStandardMaterial color={c.board} roughness={director.finish === 'ceramic' ? 0.5 : 0.95} />
        <Edges color={c.boardEdge} />
      </mesh>
      {[[BOARD.x0 + 0.35, BOARD.z0 + 0.35], [BOARD.x1 - 0.35, BOARD.z0 + 0.35], [BOARD.x0 + 0.35, BOARD.z1 - 0.35], [BOARD.x1 - 0.35, BOARD.z1 - 0.35], [-0.4, BOARD.z0 + 0.35], [-0.4, BOARD.z1 - 0.35]].map(([x, z]) => (
        <group key={`${x}${z}`}>
          <mesh position={[x, BY + 0.002, z]} rotation-x={-Math.PI / 2}>
            <ringGeometry args={[0.12, 0.2, 32]} />
            <meshBasicMaterial color={c.pin} />
          </mesh>
          <mesh position={[x, (BY - 0.16) / 2, z]}>
            <cylinderGeometry args={[0.1, 0.1, BY - 0.16, 12]} />
            <meshStandardMaterial color={c.surface} />
            <Edges color={c.edge} threshold={30} />
          </mesh>
        </group>
      ))}
      <lineSegments geometry={outline}>
        <lineBasicMaterial color={c.silk} transparent opacity={0.85} />
      </lineSegments>
      {band >= 0 && (
        <Line points={rect(PAGE.x0 + 0.02, bandZ(band) + 0.02, PAGE.x1 - 0.02, bandZ(band) + BAND_DEPTH - 0.02, y + 0.002) as [number, number, number][]} segments color={ACCENT} lineWidth={2} />
      )}
      <mesh position={[(BOARD.x0 + BOARD.x1) / 2, BY + 0.004, (BOARD.z0 + BOARD.z1) / 2]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[BOARD.x1 - BOARD.x0, BOARD.z1 - BOARD.z0]} />
        <meshBasicMaterial map={silk} transparent toneMapped={false} depthWrite={false} />
      </mesh>
      {statics.power.map((r, i) => <TraceLine key={`p${i}${director.routing}`} route={r} color={c.trace} width={4.5} />)}
      {statics.memory.map((r, i) => <TraceLine key={`m${i}${director.routing}`} route={r} color={c.trace} width={1.6} />)}
      {Array.from({ length: 22 }, (_, i) => {
        const a = (i / 22) * Math.PI * 2
        const h = cpuHalf(lab.setup.framework)
        const x = CPU.x + Math.cos(a) * (h.w + 0.35), z = CPU.z + Math.sin(a) * (h.d + 0.35)
        if (x > CPU.x + h.w - 0.2 && Math.abs(z - CPU.z) < h.d) return null
        return <Box key={i} size={[0.18, 0.08, 0.1]} position={[x, BY + 0.04, z]} color={i % 3 ? '#C8A87E' : c.body} edge={c.bodyEdge} />
      })}
    </group>
  )
}

function Cpu({ framework, c, onClick, tip }: { framework: Setup['framework']; c: Colors; onClick: () => void; tip: Tip }) {
  const g = useRef<Group>(null)
  const drop = useRef(3)
  const art = useMemo(() => cpuArt(framework), [framework])
  useEffect(() => () => art.dispose(), [art])
  useFrame((_, dt) => {
    drop.current += (0 - drop.current) * (1 - Math.exp(-dt * 7))
    if (g.current) {
      g.current.position.y = drop.current
      g.current.rotation.y = drop.current * 0.4
    }
  })
  const balls = useRef<InstancedMesh>(null)
  const half = cpuHalf(framework)
  const ballPts = useMemo(() => {
    const out: [number, number][] = []
    const step = 0.16
    for (let x = -half.w + 0.1; x <= half.w - 0.1; x += step)
      for (let z = -half.d + 0.1; z <= half.d - 0.1; z += step)
        if (Math.abs(x) > half.w - 0.42 || Math.abs(z) > half.d - 0.42) out.push([x, z])
    return out
  }, [half.w, half.d])
  useLayoutEffect(() => {
    const m = new Matrix4()
    ballPts.forEach(([x, z], i) => balls.current?.setMatrixAt(i, m.makeTranslation(x, 0.035, z)))
    if (balls.current) balls.current.instanceMatrix.needsUpdate = true
  }, [ballPts])
  const handlers = {
    onClick: (e: { stopPropagation: () => void }) => { e.stopPropagation(); drop.current = 2.4; onClick() },
    onPointerOver: (e: { stopPropagation: () => void; nativeEvent: PointerEvent }) => { e.stopPropagation(); tip.show(e.nativeEvent, framework === 'next' ? 'Next.js · CPU0' : 'TanStack Start · CPU0', 'Framework socket · click to swap the CPU') },
    onPointerMove: (e: { nativeEvent: PointerEvent }) => tip.move(e.nativeEvent),
    onPointerOut: () => tip.hide(),
  }
  const lid = framework === 'next' ? { w: 2.5, d: 2.5, h: 0.2 } : { w: 2.3, d: 1.5, h: 0.08 }
  return (
    <group position={[CPU.x, BY, CPU.z]}>
      {framework === 'tanstack' && (
        <Line points={rect(-half.w - 0.25, -half.d - 0.25, half.w + 0.25, half.d + 0.25, 0.01) as [number, number, number][]} segments color={c.pin} lineWidth={1.4} />
      )}
      <group ref={g} {...handlers}>
        <instancedMesh ref={balls} args={[undefined, undefined, ballPts.length]}>
          <sphereGeometry args={[0.04, 8, 6]} />
          <meshStandardMaterial color="#C9CED1" metalness={0.7} roughness={0.3} />
        </instancedMesh>
        <Box size={[half.w * 2, 0.08, half.d * 2]} position={[0, 0.11, 0]} color={framework === 'next' ? c.sub : '#1C2A24'} edge={c.bodyEdge} />
        {framework === 'tanstack' && [-1.55, 1.55].map((x) => <Box key={x} size={[0.5, 0.06, 2.2]} position={[x, 0.18, 0]} color={c.pin} edge={c.bodyEdge} />)}
        <mesh position={[0, 0.15 + lid.h / 2, 0]}>
          <boxGeometry args={[lid.w, lid.h, lid.d]} />
          <meshStandardMaterial color={framework === 'next' ? '#0A0B0C' : '#202A44'} roughness={0.35} metalness={0.3} />
          <Edges color={framework === 'next' ? '#3A4044' : '#7C8BD0'} />
        </mesh>
        <mesh position={[0, 0.15 + lid.h + 0.002, 0]} rotation-x={-Math.PI / 2}>
          <planeGeometry args={[lid.w * 0.98, lid.d * 0.98]} />
          <meshBasicMaterial map={art} toneMapped={false} />
        </mesh>
      </group>
    </group>
  )
}

function Memory({ database, c, onClick, tip }: { database: Database; c: Colors; onClick: () => void; tip: Tip }) {
  const g = useRef<Group>(null)
  const drop = useRef(2.5)
  const art = useMemo(() => (database === 'postgres' ? dimmArt() : leafArt()), [database])
  useEffect(() => () => art.dispose(), [art])
  useFrame((_, dt) => {
    drop.current += (0 - drop.current) * (1 - Math.exp(-dt * 7))
    if (g.current) g.current.position.y = drop.current
  })
  const handlers = {
    onClick: (e: { stopPropagation: () => void }) => { e.stopPropagation(); drop.current = 2.2; onClick() },
    onPointerOver: (e: { stopPropagation: () => void; nativeEvent: PointerEvent }) => { e.stopPropagation(); tip.show(e.nativeEvent, database === 'postgres' ? 'PostgreSQL · DIMM' : 'MongoDB · NAND stack', 'Memory · click to swap the database') },
    onPointerMove: (e: { nativeEvent: PointerEvent }) => tip.move(e.nativeEvent),
    onPointerOut: () => tip.hide(),
  }
  if (database === 'postgres')
    return (
      <group position={[0, BY, CPU.z]} {...handlers}>
        {[-7.45, -6.95].map((x, i) => (
          <group key={x}>
            <Box size={[0.26, 0.22, 4.2]} position={[x, 0.11, -0.4]} color={c.body} edge={c.bodyEdge} />
            <group ref={i === 0 ? g : undefined}>
              <group position={[x, 0, -0.4]}>
                <Box size={[0.05, 1.25, 3.9]} position={[0, 0.82, 0]} color={c.sub} edge={c.bodyEdge} />
                {Array.from({ length: 8 }, (_, k) => (
                  <Box key={k} size={[0.07, 0.36, 0.38]} position={[0.06, 0.95, -1.62 + k * 0.46]} color={c.body} edge={c.bodyEdge} />
                ))}
                <mesh position={[0.1, 0.62, 0]} rotation-y={Math.PI / 2}>
                  <planeGeometry args={[3.4, 0.36 * (220 / 640) * 3.4 / 0.36 * 0.36]} />
                  <meshBasicMaterial map={art} toneMapped={false} />
                </mesh>
                <Line points={[[0.03, 0.2, -1.95], [0.03, 0.2, 1.95]]} color="#C9A54C" lineWidth={2} />
              </group>
            </group>
          </group>
        ))}
      </group>
    )
  return (
    <group ref={g} position={[-7.15, BY, CPU.z]} {...handlers}>
      {[-1.3, 0, 1.3].map((z) => (
        <group key={z} position={[0, 0, z]}>
          {Array.from({ length: 4 }, (_, k) => (
            <Box key={k} size={[0.95 - k * 0.04, 0.1, 0.95 - k * 0.04]} position={[0, 0.07 + k * 0.15, 0]} color={k % 2 ? '#14261B' : c.body} edge={k % 2 ? '#00ED64' : c.bodyEdge} />
          ))}
          <mesh position={[0, 0.07 + 3 * 0.15 + 0.052, 0]} rotation-x={-Math.PI / 2}>
            <planeGeometry args={[0.8, 0.8]} />
            <meshBasicMaterial map={art} toneMapped={false} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

function Power({ pm, c, onClick, tip }: { pm: PackageManager; c: Colors; onClick: () => void; tip: Tip }) {
  const g = useRef<Group>(null)
  const drop = useRef(2.5)
  useFrame(({ clock }, dt) => {
    drop.current += (0 - drop.current) * (1 - Math.exp(-dt * 7))
    if (g.current) {
      g.current.position.y = drop.current
      if (pm === 'bun') g.current.children.forEach((child, i) => { if (child.userData.spin) child.rotation.y = clock.elapsedTime * (i % 2 ? 0.6 : -0.6) })
    }
  })
  const handlers = {
    onClick: (e: { stopPropagation: () => void }) => { e.stopPropagation(); drop.current = 2.2; onClick() },
    onPointerOver: (e: { stopPropagation: () => void; nativeEvent: PointerEvent }) => { e.stopPropagation(); tip.show(e.nativeEvent, `${pm} · power stage`, 'Package manager · click to swap the regulator') },
    onPointerMove: (e: { nativeEvent: PointerEvent }) => tip.move(e.nativeEvent),
    onPointerOut: () => tip.hide(),
  }
  return (
    <group ref={g} position={[0, BY, 0]} {...handlers}>
      {pm === 'pnpm' && (
        <>
          {Array.from({ length: 6 }, (_, i) => (
            <Box key={`l${i}`} size={[0.62, 0.48, 0.62]} position={[-7.15 + i * 0.85, 0.24, -5.15]} color="#2A2E31" edge="#F9AD00" />
          ))}
          {Array.from({ length: 6 }, (_, i) => (
            <Box key={`q${i}`} size={[0.42, 0.1, 0.4]} position={[-7.15 + i * 0.85, 0.05, -4.45]} color={c.body} edge={c.bodyEdge} />
          ))}
          {Array.from({ length: 5 }, (_, i) => (
            <mesh key={`c${i}`} position={[-6.75 + i * 0.85, 0.3, -5.95]}>
              <cylinderGeometry args={[0.2, 0.2, 0.6, 20]} />
              <meshStandardMaterial color="#B9C0C4" metalness={0.6} roughness={0.35} />
              <Edges color={c.bodyEdge} threshold={30} />
            </mesh>
          ))}
        </>
      )}
      {pm === 'npm' && (
        <>
          <Box size={[2.6, 0.12, 1.3]} position={[-5.4, 0.06, -5.1]} color="#9AA3A8" edge={c.bodyEdge} />
          {Array.from({ length: 11 }, (_, i) => (
            <Box key={i} size={[0.05, 0.95, 1.3]} position={[-6.6 + i * 0.24, 0.6, -5.1]} color="#B7BEC2" edge={c.bodyEdge} />
          ))}
          <Box size={[0.95, 1.1, 0.16]} position={[-5.4, 0.66, -4.35]} color="#111" edge="#CB3837" />
          {[-3.6, -2.85].map((x) => (
            <group key={x} position={[x, 0, -5.1]}>
              <mesh position={[0, 0.65, 0]}>
                <cylinderGeometry args={[0.36, 0.36, 1.3, 28]} />
                <meshStandardMaterial color="#CB3837" roughness={0.6} />
                <Edges color="#7E1F1E" threshold={30} />
              </mesh>
              <Line points={[[-0.25, 1.31, 0], [0.25, 1.31, 0], [0, 1.31, -0.25], [0, 1.31, 0.25]]} segments color="#EDEDED" lineWidth={1.5} />
            </group>
          ))}
        </>
      )}
      {pm === 'bun' && (
        <>
          {[-6.4, -4.9].map((x) => (
            <group key={x} position={[x, 0.2, -5.1]} userData={{ spin: true }}>
              <mesh rotation-x={Math.PI / 2}>
                <torusGeometry args={[0.5, 0.2, 14, 40]} />
                <meshStandardMaterial color="#F6DEC0" roughness={0.6} />
              </mesh>
              {Array.from({ length: 18 }, (_, k) => {
                const a = (k / 18) * Math.PI * 2
                return <Line key={k} points={[[Math.cos(a) * 0.28, 0, Math.sin(a) * 0.28], [Math.cos(a) * 0.3, 0.2, Math.sin(a) * 0.3], [Math.cos(a) * 0.72, 0.2, Math.sin(a) * 0.72], [Math.cos(a) * 0.72, -0.2, Math.sin(a) * 0.72]]} color="#C9772B" lineWidth={1} />
              })}
            </group>
          ))}
          <Box size={[0.6, 0.12, 0.6]} position={[-3.6, 0.06, -5.1]} color={c.body} edge="#F472B6" />
          {[-3.0, -2.75].map((x) => <Box key={x} size={[0.18, 0.12, 0.34]} position={[x, 0.06, -5.1]} color="#C8A87E" edge={c.bodyEdge} />)}
        </>
      )}
    </group>
  )
}

function Probe({ agent, sim, c, onClick, tip }: { agent: Agent; sim: Sim; c: Colors; onClick: () => void; tip: Tip }) {
  const led = useRef<Mesh>(null)
  const art = useMemo(() => (agent === 'none' ? null : probeArt(agent)), [agent])
  useEffect(() => () => art?.dispose(), [art])
  const pod = useRef<Group>(null)
  const drop = useRef(2)
  useFrame(({ clock }, dt) => {
    drop.current += (0 - drop.current) * (1 - Math.exp(-dt * 6))
    if (pod.current) pod.current.position.y = drop.current
    if (led.current) {
      const busy = !!sim.agentFlash
      const m = led.current.material as MeshBasicMaterial
      m.color.set(busy ? (Math.sin(clock.elapsedTime * 30) > 0 ? '#7CFF9B' : '#1E3324') : '#3DDC84')
    }
  })
  const handlers = {
    onClick: (e: { stopPropagation: () => void }) => { e.stopPropagation(); drop.current = 1.6; onClick() },
    onPointerOver: (e: { stopPropagation: () => void; nativeEvent: PointerEvent }) => { e.stopPropagation(); tip.show(e.nativeEvent, agent === 'none' ? 'J1 debug header' : `${agent === 'claude' ? 'Claude Code' : 'Codex'} probe`, 'Agent · click to clip on a different probe') },
    onPointerMove: (e: { nativeEvent: PointerEvent }) => tip.move(e.nativeEvent),
    onPointerOut: () => tip.hide(),
  }
  const pins: [number, number, number][] = []
  for (let i = 0; i < 5; i++) for (const r of [-0.12, 0.12]) pins.push([HEADER.x - 0.3 + i * 0.15, BY, HEADER.z + r], [HEADER.x - 0.3 + i * 0.15, BY + 0.3, HEADER.z + r])
  const podPos: [number, number, number] = [HEADER.x + 0.4, 0.5, BOARD.z1 + 1.9]
  const clip: [number, number, number] = [HEADER.x, BY + 0.42, HEADER.z]
  return (
    <group {...handlers}>
      <Box size={[0.85, 0.12, 0.42]} position={[HEADER.x, BY + 0.06, HEADER.z]} color={c.body} edge={c.bodyEdge} />
      <Line points={pins} segments color="#D8B865" lineWidth={1.5} />
      {agent !== 'none' && (
        <group ref={pod}>
          {agent === 'claude' ? (
            <>
              <Box size={[0.95, 0.24, 0.5]} position={clip} color="#D97757" edge="#8C3F25" />
              <Line points={[clip, [clip[0], clip[1] + 0.6, clip[2] + 0.4], [podPos[0], podPos[1] + 0.9, podPos[2] - 0.8], [podPos[0], podPos[1] + 0.2, podPos[2] - 0.55]]} color="#BDB6AC" lineWidth={7} />
              <Box size={[1.9, 0.45, 1.1]} position={podPos} color="#D97757" edge="#8C3F25">
                <mesh position={[0, 0.226, 0]} rotation-x={-Math.PI / 2}>
                  <planeGeometry args={[1.85, 1.06]} />
                  <meshBasicMaterial map={art} toneMapped={false} />
                </mesh>
              </Box>
            </>
          ) : (
            <>
              <Box size={[1.0, 0.16, 0.9]} position={[HEADER.x, BY + 0.5, HEADER.z + 0.2]} color="#0E0F10" edge="#F2F2F2" />
              <Box size={[1.0, 0.75, 0.12]} position={[HEADER.x, BY + 0.1, BOARD.z1 + 0.08]} color="#0E0F10" edge="#F2F2F2" />
              <Box size={[1.0, 0.12, 0.9]} position={[HEADER.x, BY - 0.24, HEADER.z + 0.2]} color="#0E0F10" edge="#F2F2F2" />
              <Line points={[[HEADER.x, BY + 0.58, HEADER.z + 0.6], [HEADER.x, BY + 1.3, BOARD.z1 + 0.8], [podPos[0], podPos[1] + 0.5, podPos[2] - 0.6]]} color="#2A2E31" lineWidth={4} />
              <Box size={[1.6, 0.35, 1.0]} position={podPos} color="#0E0F10" edge="#F2F2F2">
                <mesh position={[0, 0.176, 0]} rotation-x={-Math.PI / 2}>
                  <planeGeometry args={[1.55, 0.96]} />
                  <meshBasicMaterial map={art} toneMapped={false} />
                </mesh>
              </Box>
            </>
          )}
          <mesh ref={led} position={[podPos[0] + 0.75, podPos[1] + 0.26, podPos[2] + 0.4]}>
            <sphereGeometry args={[0.07, 10, 10]} />
            <meshBasicMaterial color="#3DDC84" toneMapped={false} />
          </mesh>
        </group>
      )}
      <mesh position={[HEADER.x, BY + 0.2, HEADER.z + 0.5]} onClick={handlers.onClick} visible={false}>
        <boxGeometry args={[1.4, 0.8, 2.2]} />
      </mesh>
    </group>
  )
}

function Tray({ sim, lab, c, tip, cam, codeOf, label }: { sim: Sim; lab: Lab; c: Colors; tip: Tip; cam: Cam; codeOf: (ref: string) => string; label: string }) {
  const mesh = useRef<InstancedMesh>(null)
  const tray = sim.tray
  const n = tray.items.length
  const capacity = useMemo(() => Math.max(64, n), [n])
  const [, setTick] = useState(0)
  const shown = useRef({ version: -1, query: '', tray: tray, hover: -1, theme: '', finish: '', mesh: null as InstancedMesh | null })
  const hover = useRef(-1)
  const tops = useMemo(() => new BufferGeometry(), [])
  useFrame(() => {
    const m = mesh.current
    if (!m) return
    m.visible = !debug.hideTray
    const query = lab.focus.query.trim().toLowerCase()
    const s = shown.current
    if (s.version === sim.version && s.query === query && s.tray === tray && s.hover === hover.current && s.theme === c.bg && s.finish === c.board && s.mesh === m) return
    s.mesh = m
    Object.assign(s, { version: sim.version, query, tray, hover: hover.current, theme: c.bg, finish: c.board })
    const mat = new Matrix4(), q = new Quaternion(), pos = new Vector3(), scl = new Vector3()
    const col = new Color()
    const outline: number[] = []
    for (let i = 0; i < n; i++) {
      const item = tray.items[i]
      const spec = specCache(item)
      const k = trayScale(tray, spec)
      pocket(tray, i, pos)
      const out = sim.parts.has(item.ref)
      scl.set(out ? 0 : spec.w * k, Math.max(0.03, spec.h * Math.max(k, 0.5)), out ? 0 : spec.d * k)
      pos.y += scl.y / 2 + (query && !out && `${item.title} ${item.label} ${item.ref}`.toLowerCase().includes(query) ? 0.12 : 0)
      m.setMatrixAt(i, mat.compose(pos, q, scl))
      if (!out && tray.pitch > 0.3) {
        const [x0, x1, z0, z1, y] = [pos.x - scl.x / 2, pos.x + scl.x / 2, pos.z - scl.z / 2, pos.z + scl.z / 2, pos.y + scl.y / 2 + 0.002]
        outline.push(x0, y, z0, x1, y, z0, x1, y, z0, x1, y, z1, x1, y, z1, x0, y, z1, x0, y, z1, x0, y, z0)
      }
      const match = !query || `${item.title} ${item.label} ${item.ref}`.toLowerCase().includes(query)
      if (i === hover.current) col.set(ACCENT)
      else if (query && match) col.set(ACCENT)
      else if (!match) col.set(c.dim)
      else col.set(c.board === '#F8FBFC' || c.board === '#0F161A' ? tint(item.hue, c, c.l + (c.bg === '#090E11' ? -6 : 12)) : tint(item.hue, c))
      m.setColorAt(i, col)
    }
    tops.setAttribute('position', new Float32BufferAttribute(outline, 3))
    m.count = n
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
    m.computeBoundingSphere()
  })
  useEffect(() => setTick((t) => t + 1), [tray])
  const labelTex = useMemo(
    () =>
      canvasTexture(1200, 90, (ctx) => {
        ctx.fillStyle = c.fg
        ctx.font = `600 40px ${MONO}`
        ctx.fillText(`JEDEC TRAY · ${label.toUpperCase()}`, 4, 40)
        ctx.fillStyle = c.muted
        ctx.font = `500 30px ${MONO}`
        ctx.fillText(`${n.toLocaleString()} parts · click one to place it`, 4, 80)
      }),
    [label, n, c.fg, c.muted],
  )
  useEffect(() => () => labelTex.dispose(), [labelTex])
  const TW = TRAY.x1 - TRAY.x0, TD = TRAY.z1 - TRAY.z0
  const headerTex = useMemo(() => {
    if (!tray.headers.length) return null
    const S = 1024 / TW
    return canvasTexture(1024, Math.round(TD * S), (ctx) => {
      for (const h of tray.headers) {
        const size = Math.min(h.h * S * 0.62, 34)
        ctx.font = `600 ${size}px ${MONO}`
        ctx.fillStyle = c.fg
        ctx.globalAlpha = 0.85
        ctx.fillText(h.label.toUpperCase(), (tray.x0 - TRAY.x0) * S, (h.z - TRAY.z0 + h.h * 0.78) * S)
        ctx.textAlign = 'right'
        ctx.fillStyle = c.muted
        ctx.fillText(h.count.toLocaleString(), (tray.x0 - TRAY.x0 + tray.cols * tray.pitch) * S, (h.z - TRAY.z0 + h.h * 0.78) * S)
        ctx.textAlign = 'left'
      }
    })
  }, [tray, c.fg, c.muted, TW, TD])
  useEffect(() => () => headerTex?.dispose(), [headerTex])
  const grid = useMemo(() => {
    const l: number[][] = []
    const y = TRAY.y + 0.002
    const w = tray.cols * tray.pitch
    const blocks = tray.headers.length ? tray.headers.map((h) => ({ z0: h.z + h.h, rows: h.rows })) : [{ z0: tray.z0, rows: Math.ceil(tray.items.length / tray.cols) }]
    for (const b of blocks) {
      const d = b.rows * tray.pitch
      l.push(...rect(tray.x0, b.z0, tray.x0 + w, b.z0 + d, y))
      if (tray.pitch > 0.3) {
        for (let i = 1; i < tray.cols; i++) l.push([tray.x0 + i * tray.pitch, y, b.z0], [tray.x0 + i * tray.pitch, y, b.z0 + d])
        for (let j = 1; j < b.rows; j++) l.push([tray.x0, y, b.z0 + j * tray.pitch], [tray.x0 + w, y, b.z0 + j * tray.pitch])
      }
    }
    return segs(l)
  }, [tray])
  const at = (e: { instanceId?: number }) => (e.instanceId !== undefined && e.instanceId < n ? tray.items[e.instanceId] : null)
  return (
    <group>
      <Box size={[TRAY.x1 - TRAY.x0 + 0.5, 0.14, TRAY.z1 - TRAY.z0 + 0.5]} position={[(TRAY.x0 + TRAY.x1) / 2, TRAY.y - 0.07, (TRAY.z0 + TRAY.z1) / 2]} color={c.surface} edge={c.edge} />
      {[[TRAY.x0, TRAY.z0], [TRAY.x1, TRAY.z0], [TRAY.x0, TRAY.z1], [TRAY.x1, TRAY.z1]].map(([x, z]) => (
        <Box key={`${x}${z}`} size={[0.12, TRAY.y - 0.14, 0.12]} position={[x, (TRAY.y - 0.14) / 2, z]} color={c.surface} edge={c.edge} />
      ))}
      <lineSegments geometry={grid}>
        <lineBasicMaterial color={c.edge} />
      </lineSegments>
      <instancedMesh
        ref={mesh}
        key={`${capacity}-${tray.pitch < 0.35}`}
        args={[undefined, undefined, capacity]}
        frustumCulled={false}
        onPointerMove={(e) => {
          e.stopPropagation()
          const item = at(e)
          if (!item) return
          if (hover.current !== e.instanceId) {
            hover.current = e.instanceId!
            cam.hovered = item.ref
            tip.show(e.nativeEvent, item.title, `${item.label} · ${codeOf(item.ref)} · click to place`, lab.theme === 'dark' ? (item.imageDark ?? item.image) : item.image)
          }
          tip.move(e.nativeEvent)
        }}
        onPointerOut={() => { hover.current = -1; cam.hovered = null; tip.hide() }}
        onClick={(e) => {
          e.stopPropagation()
          const item = at(e)
          if (!item) return
          cam.hold = false
          cam.holdUntil = 0
          lab.toggle(item.ref)
        }}
      >
        {tray.pitch < 0.35 ? <primitive object={flatTile} attach="geometry" /> : <boxGeometry />}
        <meshStandardMaterial roughness={0.8} />
      </instancedMesh>
      {tray.pitch > 0.3 && (
        <lineSegments geometry={tops} frustumCulled={false}>
          <lineBasicMaterial color={c.edge} transparent opacity={0.9} />
        </lineSegments>
      )}
      {headerTex && (
        <mesh position={[(TRAY.x0 + TRAY.x1) / 2, TRAY.y + 0.003, (TRAY.z0 + TRAY.z1) / 2]} rotation-x={-Math.PI / 2}>
          <planeGeometry args={[TW, TD]} />
          <meshBasicMaterial map={headerTex} transparent toneMapped={false} depthWrite={false} />
        </mesh>
      )}
      <mesh position={[(TRAY.x0 + TRAY.x1) / 2, TRAY.y + 0.003, TRAY.z1 + 0.05]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[TRAY.x1 - TRAY.x0, 0.45]} />
        <meshBasicMaterial map={labelTex} transparent toneMapped={false} />
      </mesh>
    </group>
  )
}
const flatTile = (() => {
  const g = new BoxGeometry(1, 1, 1)
  const index = g.getIndex()!
  g.setIndex([...index.array].slice(12, 18))
  return g
})()
const specs = new Map<string, Spec>()
function specCache(item: CatalogItem) {
  let s = specs.get(item.ref)
  if (!s) specs.set(item.ref, (s = specOf(item)))
  return s
}

function Belt({ c }: { c: Colors }) {
  const slats = useRef<(Mesh | null)[]>([])
  const len = BELT.x1 - BELT.x0 + 1.0
  const n = 26
  useFrame(({ clock }) => {
    const offset = (clock.elapsedTime * BELT.speed) % (len / n)
    slats.current.forEach((m, i) => { if (m) m.position.x = BELT.x0 - 0.5 + (((i * len) / n + offset) % len) })
  })
  const mid = (BELT.x0 + BELT.x1) / 2
  return (
    <group>
      <Box size={[len, 0.3, 1.2]} position={[mid, BELT.y - 0.17, BELT.z]} color={c.surface} edge={c.edge} />
      {[-0.64, 0.64].map((dz) => <Box key={dz} size={[len + 0.1, 0.14, 0.07]} position={[mid, BELT.y + 0.02, BELT.z + dz]} color={c.surface} edge={c.edge} />)}
      {[BELT.x0 + 0.2, BELT.x1 - 0.2].map((x) => <Box key={x} size={[0.12, BELT.y - 0.32, 0.12]} position={[x, (BELT.y - 0.32) / 2, BELT.z]} color={c.surface} edge={c.edge} />)}
      {Array.from({ length: n }, (_, i) => (
        <mesh key={i} ref={(m) => { slats.current[i] = m }} position={[0, BELT.y - 0.01, BELT.z]}>
          <boxGeometry args={[0.02, 0.01, 1.1]} />
          <meshBasicMaterial color={c.edge} />
        </mesh>
      ))}
    </group>
  )
}

function Gantry({ sim, c }: { sim: Sim; c: Colors }) {
  const beam = useRef<Group>(null)
  const carriage = useRef<Group>(null)
  const quill = useRef<Mesh>(null)
  const nozzle = useRef<Group>(null)
  const edge = useRef<ThreeLineSegments>(null)
  const arm = useRef<Mesh>(null)
  const reach = useRef(0)
  useFrame((_, dt) => {
    const p = sim.gantry.pos
    beam.current!.position.x = p.x
    reach.current += (Math.max(p.z + 0.6, RAIL.back + 1.2) - reach.current) * (1 - Math.exp(-dt * 12))
    const span = reach.current - RAIL.back + 0.3
    arm.current!.scale.z = span
    arm.current!.position.z = RAIL.back - 0.3 + span / 2
    carriage.current!.position.z = p.z
    const top = RAIL.top - 0.3
    const len = Math.max(0.1, top - (p.y + 0.35))
    quill.current!.scale.y = len
    quill.current!.position.y = top - len / 2
    nozzle.current!.position.y = p.y
    if (edge.current) (edge.current.material as MeshBasicMaterial).color.set(sim.gantry.holding ? ACCENT : c.edge)
  })
  return (
    <group>
      <Box size={[RAIL.x1 - RAIL.x0, 0.32, 0.42]} position={[(RAIL.x0 + RAIL.x1) / 2, RAIL.top, RAIL.back]} color={c.surface} edge={c.edge} />
      {[RAIL.x0 + 0.3, RAIL.x1 - 0.3, (RAIL.x0 + RAIL.x1) / 2].map((x) => (
        <Box key={x} size={[0.3, RAIL.top - 0.16, 0.3]} position={[x, (RAIL.top - 0.16) / 2, RAIL.back]} color={c.surface} edge={c.edge} />
      ))}
      <group ref={beam}>
        <mesh ref={arm} position={[0, RAIL.top + 0.38, 0]}>
          <boxGeometry args={[0.55, 0.42, 1]} />
          <meshStandardMaterial color={c.surface} roughness={0.9} />
          <Edges color={c.edge} />
        </mesh>
        <Box size={[0.8, 0.6, 0.7]} position={[0, RAIL.top + 0.1, RAIL.back]} color={c.surface} edge={c.edge} />
        <group ref={carriage}>
          <Box size={[0.75, 0.75, 0.75]} position={[0, RAIL.top + 0.05, 0]} color={c.surface} edge={c.edge} />
          <mesh ref={quill}>
            <boxGeometry args={[0.2, 1, 0.2]} />
            <meshStandardMaterial color={c.surface} />
            <Edges color={c.edge} />
          </mesh>
          <group ref={nozzle}>
            <mesh position={[0, 0.25, 0]}>
              <cylinderGeometry args={[0.16, 0.05, 0.3, 16]} />
              <meshStandardMaterial color={c.surface} />
              <Edges ref={edge as never} color={c.edge} threshold={30} />
            </mesh>
          </group>
        </group>
      </group>
    </group>
  )
}

function Ghosts({ sim, c, version }: { sim: Sim; c: Colors; version: number }) {
  const groups = useRef<(Group | null)[]>([])
  const born = useRef(new Map<string, number>())
  const marks = useMemo(
    () => sim.layout.ghosts.map((g) => chipMarking({ title: `existing ${g.title}`, hue: 210, source: 'your-app', ref: g.title } as CatalogItem, 'OWNED', g.spec, c.ghost, c.muted)),
    [version, c.ghost, c.muted],
  )
  useEffect(() => () => marks.forEach((m) => m.dispose()), [marks])
  useFrame(({ clock }) => {
    sim.layout.ghosts.forEach((g, i) => {
      const grp = groups.current[i]
      if (!grp) return
      if (!born.current.has(g.title)) born.current.set(g.title, clock.elapsedTime + i * 0.12)
      const t = Math.min(1, Math.max(0, (clock.elapsedTime - born.current.get(g.title)!) / 0.6))
      grp.position.set(g.slot.x, g.slot.y + (1 - t * t) * 2.5, g.slot.z)
      grp.scale.setScalar(g.slot.s)
    })
  })
  return (
    <>
      {sim.layout.ghosts.map((g, i) => (
        <group key={`${g.title}${i}`} ref={(r) => { groups.current[i] = r }}>
          <ChipBody spec={g.spec} top={marks[i] ?? null} c={c} ghost />
        </group>
      ))}
    </>
  )
}

function Routes({ sim, c, version }: { sim: Sim; c: Colors; version: number }) {
  const list = useMemo(() => [...sim.parts.values()].filter((p) => p.route), [version, sim])
  const heads = useRef<(Mesh | null)[]>([])
  const vias = useRef<InstancedMesh>(null)
  const tmp = useMemo(() => new Vector3(), [])
  useFrame(() => {
    let h = 0
    const m = new Matrix4()
    let v = 0
    for (const p of sim.parts.values()) {
      if (!p.route || p.mode !== 'seated') continue
      if (p.drawn < 1 && h < heads.current.length) {
        const head = heads.current[h++]
        if (head) {
          head.visible = true
          sampleRoute(p.route, p.drawn, head.position)
          head.scale.setScalar(1 + Math.random() * 0.6)
        }
      }
      for (const via of p.route.vias) {
        if (!vias.current || v >= 400) break
        const k = p.route.pts.findIndex((q) => q.distanceToSquared(via) < 0.004)
        const on = p.drawn >= (k < 0 ? 1 : k / p.route.pts.length)
        vias.current.setMatrixAt(v++, m.makeTranslation(via.x, via.y + 0.003, via.z).scale(tmp.setScalar(on ? 1 : 0)))
      }
    }
    for (; h < heads.current.length; h++) if (heads.current[h]) heads.current[h]!.visible = false
    if (vias.current) {
      vias.current.count = v
      vias.current.instanceMatrix.needsUpdate = true
    }
  })
  return (
    <>
      {list.map((p) => (
        <TraceLine key={`${p.item.ref}-${p.route!.len.toFixed(3)}-${p.route!.pts.length}`} route={p.route!} color={c.lit} width={1.7} progress={() => (p.mode === 'seated' ? p.drawn : 0)} />
      ))}
      {Array.from({ length: 6 }, (_, i) => (
        <mesh key={i} ref={(m) => { heads.current[i] = m }} visible={false}>
          <sphereGeometry args={[0.07, 10, 10]} />
          <meshBasicMaterial color="#FFFFFF" toneMapped={false} />
        </mesh>
      ))}
      <instancedMesh ref={vias} args={[undefined, undefined, 400]} frustumCulled={false}>
        <cylinderGeometry args={[0.07, 0.07, 0.006, 16]} />
        <meshBasicMaterial color={c.pin} />
      </instancedMesh>
    </>
  )
}

type Pulse = { route: Route; t: number; speed: number }
function Pulses({ sim, c, director, framework }: { sim: Sim; c: Colors; director: Director; framework: Setup['framework'] }) {
  const N = 600, P = 160
  const data = useRef<Points>(null)
  const power = useRef<Points>(null)
  const state = useMemo(() => ({ data: [] as Pulse[], power: [] as Pulse[], dataPos: new Float32Array(N * 3), powerPos: new Float32Array(P * 3) }), [])
  const statics = useMemo(() => staticRoutes(director.routing, framework), [director.routing, framework])
  const seen = useRef(-1)
  const tmp = useMemo(() => new Vector3(), [])
  useFrame((_, dt) => {
    if (sim.lastSeatAt !== seen.current && sim.lastSeat?.route) {
      seen.current = sim.lastSeatAt
      for (let k = 0; k < 4; k++) state.data.push({ route: sim.lastSeat.route, t: -k * 0.12 - 0.6, speed: 1.1 })
    }
    for (const p of sim.parts.values()) {
      if (p.mode !== 'seated' || !p.route || p.drawn < 1) continue
      if (Math.random() < dt * 0.55 && state.data.length < N) state.data.push({ route: p.route, t: 0, speed: 6 / p.route.len })
    }
    for (const r of statics.memory) if (Math.random() < dt * 1.4 && state.data.length < N) state.data.push({ route: r, t: 0, speed: Math.random() < 0.5 ? 1.6 : -1.6 })
    for (const r of statics.power) if (Math.random() < dt * 2 && state.power.length < P) state.power.push({ route: r, t: 0, speed: 0.9 })
    const run = (list: Pulse[], arr: Float32Array, cap: number, pts: Points | null) => {
      let w = 0
      for (const pulse of list) {
        pulse.t += pulse.speed * dt
        const t = pulse.speed < 0 ? 1 + pulse.t : pulse.t
        if (t > 1 || t < -0.0001 && pulse.speed < 0) continue
        if (w < cap && t >= 0) {
          sampleRoute(pulse.route, t, tmp)
          arr[w * 3] = tmp.x; arr[w * 3 + 1] = tmp.y + 0.02; arr[w * 3 + 2] = tmp.z
          w++
        }
      }
      for (let i = w; i < cap; i++) arr[i * 3 + 1] = -99
      if (pts) (pts.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true
      return list.filter((pulse) => (pulse.speed < 0 ? 1 + pulse.t >= 0 : pulse.t <= 1))
    }
    state.data = run(state.data, state.dataPos, N, data.current)
    state.power = run(state.power, state.powerPos, P, power.current)
  })
  return (
    <>
      <points ref={data} frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[state.dataPos, 3]} />
        </bufferGeometry>
        <pointsMaterial color={c.lit} size={5} sizeAttenuation={false} toneMapped={false} />
      </points>
      <points ref={power} frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[state.powerPos, 3]} />
        </bufferGeometry>
        <pointsMaterial color={c.power} size={6} sizeAttenuation={false} toneMapped={false} />
      </points>
    </>
  )
}

function AgentFlash({ sim, agent }: { sim: Sim; agent: Agent }) {
  const [part, setPart] = useState<Part | null>(null)
  useFrame(() => {
    const p = sim.agentFlash?.part ?? null
    if (p !== part) setPart(p)
  })
  const route = useMemo(() => {
    if (!part?.slot) return null
    const y = BY + 0.35
    const s = part.slot
    return makeRoute([new Vector3(HEADER.x, y, HEADER.z), new Vector3(HEADER.x, y, s.z), new Vector3(s.x, y, s.z)], 'manhattan', [])
  }, [part])
  if (!route) return null
  return <TraceLine route={route} color={agent === 'codex' ? '#F2F2F2' : '#D97757'} width={2.4} progress={() => sim.agentFlash?.t ?? 0} />
}

export function fit(points: Vector3[], az: number, polar: number, size: { width: number; height: number }, margin = 1.08, insetR = 0, insetL = 0) {
  const dir = new Vector3(Math.sin(polar) * Math.sin(az), Math.cos(polar), Math.sin(polar) * Math.cos(az))
  const right = new Vector3(Math.cos(az), 0, -Math.sin(az))
  const up = new Vector3().crossVectors(dir, right).negate()
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
  for (const p of points) {
    x0 = Math.min(x0, p.dot(right)); x1 = Math.max(x1, p.dot(right))
    y0 = Math.min(y0, p.dot(up)); y1 = Math.max(y1, p.dot(up))
  }
  const center = right.clone().multiplyScalar((x0 + x1) / 2).addScaledVector(up, (y0 + y1) / 2)
  const depth = points.reduce((s, p) => s + p.dot(dir), 0) / points.length
  center.addScaledVector(dir, depth)
  const zoom = Math.min((size.width - insetR - insetL) / ((x1 - x0) * margin), size.height / ((y1 - y0) * margin))
  center.addScaledVector(right, (insetR - insetL) / 2 / zoom)
  return { target: center, zoom, dir }
}
const box = (x0: number, z0: number, x1: number, z1: number, y0 = 0, y1 = 0) =>
  [[x0, y0, z0], [x1, y0, z0], [x0, y0, z1], [x1, y0, z1], [x0, y1, z0], [x1, y1, z1]].map(([x, y, z]) => new Vector3(x, y, z))

const AZ = (22 * Math.PI) / 180
const POLAR = (44 * Math.PI) / 180

function CameraRig({ sim, cam, director, lab }: { sim: Sim; cam: Cam; director: Director; lab: Lab }) {
  const controls = useRef<CameraControls>(null)
  const { size, gl } = useThree()
  const wide = size.width > 900
  const inset = lab.chrome === 'full' && wide ? 300 : 0
  const insetL = wide ? 150 : 0
  const overview = useMemo(() => fit([...box(TRAY.x0 - 0.4, BELT.z - 0.8, BOARD.x1, BOARD.z1 + 2.6, 0, 0), new Vector3(RAIL.x0, RAIL.top + 0.6, RAIL.back), new Vector3(RAIL.x1, RAIL.top + 0.6, RAIL.back)], AZ, POLAR, size, 1.02, inset, insetL), [size, inset, insetL])
  useEffect(() => {
    const c = controls.current
    if (!c) return
    const start = () => { cam.hold = true }
    const end = () => { cam.hold = false; cam.holdUntil = performance.now() + 5000 }
    c.addEventListener('controlstart', start)
    c.addEventListener('controlend', end)
    const wheel = () => { cam.holdUntil = performance.now() + 5000 }
    gl.domElement.addEventListener('wheel', wheel, { passive: true })
    const p = overview.target.clone().addScaledVector(overview.dir, 80)
    void c.setLookAt(p.x, p.y, p.z, overview.target.x, overview.target.y, overview.target.z, false)
    void c.zoomTo(overview.zoom, false)
    return () => {
      c.removeEventListener('controlstart', start)
      c.removeEventListener('controlend', end)
      gl.domElement.removeEventListener('wheel', wheel)
    }
  }, [controls, gl, cam])
  const pt = useMemo(() => new Vector3(), [])
  useFrame(({ clock }) => {
    const c = controls.current
    if (!c) return
    if (sim.lastAddedAt !== cam.seenAdd) {
      cam.seenAdd = sim.lastAddedAt
      if (director.follow) { cam.hold = false; cam.holdUntil = 0; cam.focusRef = null }
    }
    let decap: string | null = null
    let shot: { target: Vector3; zoom: number; polar: number; az: number } = { target: overview.target, zoom: overview.zoom, polar: POLAR, az: AZ }
    const trav = director.follow ? travelling(sim) : null
    const focus = cam.focusRef ? sim.parts.get(cam.focusRef) : undefined
    const seatedList = [...sim.parts.values()].filter((p) => p.mode === 'seated' && p.item.kind === 'block')
    const chipShot = (p: Part, die: boolean) => {
      const s = p.slot ?? { s: 1 }
      const r = Math.max(p.spec.fw, p.spec.fd) * s.s
      pt.copy(p.pos).setY(p.pos.y + chipTop(p.spec) * p.scale)
      return { target: pt.clone(), zoom: Math.min(size.width, size.height) / (r * (die ? 1.25 : 3.6)), polar: die ? 0.001 : (52 * Math.PI) / 180, az: die ? 0 : AZ + 0.25 }
    }
    if (trav) {
      const q = inFlight(sim)
      pt.copy(trav.pos)
      shot = { target: pt.clone(), zoom: overview.zoom * (q > 2 ? 1.7 : 2.8), polar: (50 * Math.PI) / 180, az: AZ + 0.2 }
    } else if (director.follow && sim.lastSeat && sim.time - sim.lastSeatAt < 1.4 && sim.lastSeat.mode === 'seated' && !focus && inFlight(sim) === 0) {
      shot = { ...chipShot(sim.lastSeat, false), zoom: overview.zoom * 2.6 }
    } else if (focus && focus.mode === 'seated') {
      shot = chipShot(focus, cam.decap)
      if (cam.decap) decap = focus.item.ref
    } else if (cam.area && performance.now() < cam.area.until) {
      const [x0, z0, x1, z1] = cam.area.box
      const f = fit(box(x0, z0, x1, z1), AZ, POLAR, size, 1.1)
      shot = { target: f.target, zoom: f.zoom, polar: POLAR, az: AZ }
    } else if (director.camera === 'macro') {
      const p = sim.lastSeat?.mode === 'seated' ? sim.lastSeat : seatedList[seatedList.length - 1]
      pt.copy(p ? p.pos : CPU)
      shot = { target: pt.clone(), zoom: overview.zoom * 3.4, polar: (56 + Math.sin(clock.elapsedTime * 0.2) * 8) * (Math.PI / 180), az: AZ + Math.sin(clock.elapsedTime * 0.13) * 0.7 }
    } else if (director.camera === 'die') {
      const p = sim.lastSeat?.mode === 'seated' && sim.lastSeat.item.kind === 'block' ? sim.lastSeat : seatedList[seatedList.length - 1]
      if (p) {
        shot = chipShot(p, true)
        decap = p.item.ref
      } else shot = { target: CPU.clone().setY(BY + 0.4), zoom: Math.min(size.width, size.height) / 4.2, polar: 0.001, az: 0 }
    }
    cam.decapRef = decap
    if (cam.hold || performance.now() < cam.holdUntil) return
    const pos = shot.target.clone().add(new Vector3(Math.sin(shot.polar) * Math.sin(shot.az), Math.cos(shot.polar), Math.sin(shot.polar) * Math.cos(shot.az)).multiplyScalar(80))
    void c.setLookAt(pos.x, pos.y, pos.z, shot.target.x, shot.target.y, shot.target.z, true)
    void c.zoomTo(shot.zoom, true)
  })
  return <CameraControls ref={controls} makeDefault smoothTime={0.55} draggingSmoothTime={0.12} minZoom={8} maxZoom={4000} />
}

export function Scene({ lab, sim, cam, director, tip, codeOf, onFocus, trayLabel, activeBand }: {
  lab: Lab; sim: Sim; cam: Cam; director: Director; tip: Tip; codeOf: (ref: string) => string; onFocus: (ref: string) => void; trayLabel: string; activeBand: number
}) {
  const c = palette(lab.theme, director.finish)
  const [version, setVersion] = useState(sim.version)
  useFrame(() => { if (sim.version !== version) setVersion(sim.version) })
  const parts = useMemo(() => [...sim.parts.values()], [version, sim])
  const cycle = {
    framework: () => lab.set('framework', lab.setup.framework === 'next' ? 'tanstack' : 'next'),
    database: () => lab.set('database', lab.setup.database === 'postgres' ? 'mongodb' : 'postgres'),
    pm: () => lab.set('packageManager', lab.setup.packageManager === 'pnpm' ? 'npm' : lab.setup.packageManager === 'npm' ? 'bun' : 'pnpm'),
    agent: () => lab.set('agent', lab.setup.agent === 'none' ? 'claude' : lab.setup.agent === 'claude' ? 'codex' : 'none'),
  }
  return (
    <>
      <color attach="background" args={[c.bg]} />
      <CameraRig sim={sim} cam={cam} director={director} lab={lab} />
      <ambientLight intensity={lab.theme === 'dark' ? 0.9 : 1.5} />
      <directionalLight position={[6, 14, 8]} intensity={lab.theme === 'dark' ? 1.0 : 1.4} />
      <hemisphereLight args={[c.surface, c.bg, 0.5]} />
      <Board lab={lab} sim={sim} c={c} director={director} activeBand={activeBand} />
      <Cpu key={lab.setup.framework} framework={lab.setup.framework} c={c} onClick={cycle.framework} tip={tip} />
      <Memory key={lab.setup.database} database={lab.setup.database} c={c} onClick={cycle.database} tip={tip} />
      <Power key={lab.setup.packageManager} pm={lab.setup.packageManager} c={c} onClick={cycle.pm} tip={tip} />
      <Probe key={lab.setup.agent} agent={lab.setup.agent} sim={sim} c={c} onClick={cycle.agent} tip={tip} />
      <Ghosts key={lab.setup.target} sim={sim} c={c} version={version} />
      <Routes sim={sim} c={c} version={version} />
      <Pulses sim={sim} c={c} director={director} framework={lab.setup.framework} />
      <AgentFlash sim={sim} agent={lab.setup.agent} />
      <Footprints sim={sim} />
      <Tray sim={sim} lab={lab} c={c} tip={tip} cam={cam} codeOf={codeOf} label={trayLabel} />
      <Belt c={c} />
      <Gantry sim={sim} c={c} />
      {parts.map((p) => <PartView key={p.item.ref} p={p} lab={lab} c={c} tip={tip} cam={cam} onFocus={onFocus} codeOf={codeOf} />)}
      <ContactShadows frames={1} position={[-3, 0.001, 0]} scale={[40, 22]} resolution={512} blur={2.6} far={4} opacity={lab.theme === 'dark' ? 0.55 : 0.25} color="#000" />
    </>
  )
}

