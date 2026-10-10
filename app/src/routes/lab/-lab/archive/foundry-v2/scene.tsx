import { useFrame, useThree } from '@react-three/fiber'
import { CameraControls, ContactShadows, Line } from '@react-three/drei'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  BoxGeometry, BufferGeometry, Color, EdgesGeometry, Float32BufferAttribute, Group, InstancedMesh, LineSegments as ThreeLineSegments,
  Matrix4, Mesh, MeshBasicMaterial, Points, Vector3,
} from 'three'
import type { BufferAttribute, Texture } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import { play } from '../../kit/sound'
import type { Guard } from '../../kit/touch'

import type { Agent, Database, PackageManager, Setup } from '../../../../workspace/-workspace/workspace.types'
import type { Lab } from '../../lab.types'
import { chipMarking, cpuArt, dieArt, dimmArt, dropDies, leafArt, legacyMarking, probeArt, silkArt } from './art'
import { Assembly, TraceBundle, TraceLine } from './hairline'
import type { Prim } from './hairline'
import {
  ACCENT, BANDS, BAND_DEPTH, BELT, BOARD, BY, CLAUDE, CPU, HEADER, LED, NOZZLES, PAGE, POWER, RAIL,
  bandZ, cpuHalf, formNet, inFlight, makeRoute, nozzleX, sampleRoute, staticRoutes, travelling,
} from './model'
import type { Part, Route, RouteStyle, Sim, Spec } from './model'
import { Tray } from './tray'
import type { TrayOverlay } from './tray'

export type Finish = 'hairline' | 'fr4'
export type CameraMode = 'board' | 'macro' | 'die'
export type Director = { finish: Finish; routing: RouteStyle; camera: CameraMode; follow: boolean; debug: boolean }

export function palette(theme: Lab['theme'], finish: Finish) {
  const dark = theme === 'dark'
  const base = dark
    ? { bg: '#090E11', surface: '#141B1F', fg: '#FCFCFC', muted: '#8A9094', edge: '#5C676C', dim: '#2A353B', l: 46, s: 36, dark }
    : { bg: '#EDF1F3', surface: '#FFFFFF', fg: '#1D2225', muted: '#727C81', edge: '#9AA4A9', dim: '#C9D1D5', l: 62, s: 44, dark }
  if (finish === 'fr4')
    return { ...base, board: dark ? '#173A28' : '#2C6646', silk: '#EEF2EC', trace: dark ? '#22513A' : '#3B7D58', lit: '#F0C36A', body: '#1A1D1F', bodyEdge: '#3D4448', ink: '#A5ADB2', pin: '#C9CED1', sub: '#2E4A36', power: POWER, ghost: '#3A3D3F', boardEdge: dark ? '#2E6B4C' : '#1E4B33', ceramic: '#C8A87E' }
  return {
    ...base,
    board: dark ? '#0F161A' : '#F8FBFC', silk: dark ? '#6B777D' : '#8E989D', trace: dark ? '#26323A' : '#D3DADE', lit: ACCENT,
    body: dark ? '#182126' : '#FFFFFF', bodyEdge: dark ? '#6B767B' : '#8E989D', ink: dark ? '#C9D1D5' : '#1D2225',
    pin: dark ? '#56636A' : '#B3BCC1', sub: dark ? '#1E282D' : '#EEF3F5', power: POWER, ghost: '#3A3D3F', boardEdge: dark ? '#4A555B' : '#9AA4A9', ceramic: dark ? '#8C7A5E' : '#C8A87E',
  }
}
export type Colors = ReturnType<typeof palette>

export type Tip = { show: (e: PointerEvent, title: string, sub: string, image?: string) => void; move: (e: PointerEvent) => void; hide: () => void }
export type Cam = {
  focusRef: string | null
  decap: boolean
  decapRef: string | null
  area: { box: [number, number, number, number]; until: number } | null
  holdUntil: number
  seenAdd: number
  hovered: string | null
  /** The part or pocket under the last press, for long-press details on touch. */
  pressed: string | null
  /** The shot the rig is holding, for the harness and the debug line. */
  mode: string
  /** True while the controls are still easing toward their target; the frame governor reads it. */
  moving: boolean
  /** Pixels the host chrome covers: the left panels, the right panel, the bottom sheet or Install bar. */
  inset: { left: number; right: number; bottom: number }
  /** Gesture hooks the rig installs on the controls. `x`, `y` are client pixels. */
  orbit: (dx: number, dy: number) => void
  pan: (dx: number, dy: number) => void
  zoomAt: (factor: number, x: number, y: number) => void
  reset: () => void
}

export function createCam(): Cam {
  const none = () => {}
  return {
    focusRef: null, decap: false, decapRef: null, area: null, holdUntil: 0, seenAdd: -99, hovered: null, pressed: null,
    mode: 'OVERVIEW', moving: true, inset: { left: 0, right: 0, bottom: 0 }, orbit: none, pan: none, zoomAt: none, reset: none,
  }
}

const rect = (x0: number, z0: number, x1: number, z1: number, y: number) => [
  [x0, y, z0], [x1, y, z0], [x1, y, z0], [x1, y, z1], [x1, y, z1], [x0, y, z1], [x0, y, z1], [x0, y, z0],
]
function segs(list: number[][]) {
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(list.flat(), 3))
  return g
}

const standoff = (spec: Spec) => (spec.pkg === 'qfp' || spec.pkg === 'soic' ? 0.03 : spec.pkg === 'dip' ? 0.06 : 0)
export const chipTop = (spec: Spec) => standoff(spec) + spec.h

const bodyCache = new Map<string, { geometry: BufferGeometry; edges: BufferGeometry }>()
/** Body and leads merged into one vertex-coloured mesh per package size; edges only on the body. */
function chipGeometry(spec: Spec, body: string, pin: string, ceramic: string) {
  const key = `${spec.pkg}-${spec.w}-${spec.d}-${body}-${pin}`
  const hit = bodyCache.get(key)
  if (hit) return hit
  const parts: BufferGeometry[] = []
  const colored = (g: BufferGeometry, color: string) => {
    const c = new Color(color)
    const n = g.getAttribute('position').count
    const arr = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b }
    g.setAttribute('color', new Float32BufferAttribute(arr, 3))
    parts.push(g)
    return g
  }
  const add = (sx: number, sy: number, sz: number, x: number, y: number, z: number, color = pin) => {
    const b = new BoxGeometry(sx, sy, sz)
    b.translate(x, y, z)
    colored(b, color)
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
  const main = new BoxGeometry(spec.w, spec.h, spec.d)
  main.translate(0, so + spec.h / 2, 0)
  const edges = new EdgesGeometry(main)
  colored(main, spec.pkg === 'passive' ? ceramic : body)
  if (spec.pkg === 'qfp' || spec.pkg === 'qfn') {
    for (const sign of [-1, 1]) {
      side(spec.w * 0.84, 'z', sign, spec.d / 2)
      side(spec.d * 0.84, 'x', sign, spec.w / 2)
    }
  } else if (spec.pkg === 'soic' || spec.pkg === 'dip') for (const sign of [-1, 1]) side(spec.w * 0.86, 'z', sign, spec.d / 2)
  else if (spec.pkg === 'passive') {
    add(0.18, spec.h + 0.012, spec.d + 0.012, -spec.w / 2 + 0.09, spec.h / 2, 0)
    add(0.18, spec.h + 0.012, spec.d + 0.012, spec.w / 2 - 0.09, spec.h / 2, 0)
  } else {
    for (let i = 0; i < 10; i++) for (const r of [-1, 1]) add(0.05, 0.42, 0.05, -1.0 + i * 0.1, 0.21, r * 0.05 + 0.4)
    add(1.1, 0.12, 0.22, -0.55, 0.06, 0.4)
    add(spec.w, 0.06, spec.d, 0, 0.45, 0, body)
    add(spec.w * 0.56, 0.2, spec.d * 0.72, spec.w * 0.12, 0.58, 0)
    for (const x of [-0.95, -0.7, -0.45]) add(0.16, 0.08, 0.3, x, 0.52, -0.3, body)
  }
  const geometry = mergeGeometries(parts)!
  parts.forEach((g) => g.dispose())
  const out = { geometry, edges }
  bodyCache.set(key, out)
  return out
}

function dropChipGeometry() {
  for (const g of bodyCache.values()) { g.geometry.dispose(); g.edges.dispose() }
  bodyCache.clear()
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
  const geo = useMemo(() => chipGeometry(spec, ghost ? c.ghost : c.body, ghost ? '#8A8F93' : c.pin, c.ceramic), [spec, ghost, c.body, c.pin, c.ghost, c.ceramic])
  const lid = useRef<Mesh>(null)
  const dieMesh = useRef<Mesh>(null)
  const wires = useRef<Group>(null)
  const so = standoff(spec)
  const dieSize = Math.min(spec.w, spec.d) * 0.78
  const wirePts = useMemo(() => (decapRef ? bondWires(spec, dieSize) : []), [spec, dieSize, decapRef])
  useFrame(() => {
    const d = decapRef?.current ?? 0
    if (lid.current && decapRef) {
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
  const lidAt: [number, number, number] = spec.pkg === 'module' ? [spec.w * 0.12, 0.682, 0] : [0, so + spec.h + 0.003, 0]
  const lidSize: [number, number] = spec.pkg === 'module' ? [spec.w * 0.54, spec.d * 0.7] : [spec.w * 0.97, spec.d * 0.97]
  return (
    <group>
      <mesh geometry={geo.geometry}>
        <meshStandardMaterial vertexColors roughness={0.8} metalness={0.15} transparent={ghost} opacity={ghost ? 0.85 : 1} />
      </mesh>
      <lineSegments geometry={geo.edges}>
        <lineBasicMaterial color={ghost ? '#8A8F93' : c.bodyEdge} />
      </lineSegments>
      {top && (
        <mesh ref={lid} position={lidAt} rotation-x={-Math.PI / 2}>
          <planeGeometry args={lidSize} />
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

export function PartView({ p, lab, c, tip, cam, onFocus, codeOf, focused, sim, guard }: {
  p: Part; lab: Lab; c: Colors; tip: Tip; cam: Cam; onFocus: (ref: string) => void; codeOf: (ref: string) => string; focused: boolean; sim: Sim; guard: Guard
}) {
  const group = useRef<Group>(null)
  const ring = useRef<ThreeLineSegments>(null)
  const top = useMemo(() => chipMarking(p.item, codeOf(p.item.ref), p.spec, p.spec.pkg === 'passive' ? c.ceramic : c.body, p.spec.pkg === 'passive' ? '#2A2420' : c.ink), [p, c.body, c.ink, c.ceramic, codeOf])
  useEffect(() => () => top.dispose(), [top])
  const decap = useRef({ current: 0, die: null as Texture | null })
  const requested = useRef(false)
  const image = lab.theme === 'dark' ? (p.item.imageDark ?? p.item.image) : p.item.image
  const lit = useMemo(() => new Color(), [])
  const query = lab.focus.query.trim().toLowerCase()
  const match = !!query && `${p.item.title} ${p.item.label}`.toLowerCase().includes(query)
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
      lit.set(p.flash > 0 ? (lab.setup.agent === 'codex' ? c.fg : CLAUDE) : hot || match ? ACCENT : c.lit)
      m.color.copy(lit)
      m.opacity = hot || match || p.flash > 0 ? 1 : p.lit
      ring.current.visible = hot || p.flash > 0 || match || p.lit > 0.02
    }
  })
  const fw = p.spec.fw + 0.12, fd = p.spec.fd + 0.12
  const bar = useRef<Mesh>(null)
  useFrame(() => {
    const b = bar.current
    if (!b) return
    const f = sim.agentFlash
    const on = !!f && f.part === p
    b.visible = on
    if (on) {
      b.scale.x = Math.max(0.001, f.t)
      b.position.x = -fw / 2 + (fw * f.t) / 2
    }
  })
  return (
    <group
      ref={group}
      onPointerDown={() => { cam.pressed = p.item.ref }}
      onClick={(e) => {
        e.stopPropagation()
        if (guard.moved) return
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
      <ChipBody spec={p.spec} top={top} c={c} decapRef={focused ? decap.current : undefined} />
      <lineSegments ref={ring} visible={false} position={[0, 0.012, 0]}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[new Float32Array([-fw / 2, 0, -fd / 2, fw / 2, 0, -fd / 2, fw / 2, 0, -fd / 2, fw / 2, 0, fd / 2, fw / 2, 0, fd / 2, -fw / 2, 0, fd / 2, -fw / 2, 0, fd / 2, -fw / 2, 0, -fd / 2]), 3]} />
        </bufferGeometry>
        <lineBasicMaterial color={ACCENT} transparent />
      </lineSegments>
      <mesh ref={bar} visible={false} position={[0, 0.014, fd / 2 + 0.09]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[fw, 0.07]} />
        <meshBasicMaterial color={lab.setup.agent === 'codex' ? c.fg : CLAUDE} toneMapped={false} />
      </mesh>
    </group>
  )
}

const CORNERS = [-1, -1, 1, 1, 1, -1, -1, 1, 1, 1, -1, -1, -1, 1, 1, -1] as const
const FOOTPRINTS = 64
/** Corner brackets on every footprint still waiting for its part; they breathe unless motion is reduced. */
function Footprints({ sim, reduced }: { sim: Sim; reduced: boolean }) {
  const ref = useRef<ThreeLineSegments>(null)
  const pos = useMemo(() => new Float32Array(FOOTPRINTS * 16 * 3), [])
  useFrame(({ clock }) => {
    const seg = ref.current
    if (!seg) return
    let k = 0
    for (const p of sim.parts.values()) {
      if (p.mode === 'seated' || p.mode === 'return' || p.mode === 'lift' || !p.slot || k >= pos.length) continue
      const s = p.slot
      const w = (p.spec.fw * s.s) / 2 + 0.08, d = (p.spec.fd * s.s) / 2 + 0.08
      const y = s.y + 0.01
      const arm = 0.18 * s.s + 0.06
      for (let c = 0; c < 16; c += 4) {
        const x = s.x + CORNERS[c] * w, z = s.z + CORNERS[c + 1] * d
        pos[k++] = x; pos[k++] = y; pos[k++] = z
        pos[k++] = x + CORNERS[c + 2] * arm; pos[k++] = y; pos[k++] = z
        pos[k++] = x; pos[k++] = y; pos[k++] = z
        pos[k++] = x; pos[k++] = y; pos[k++] = z + CORNERS[c + 3] * arm
      }
    }
    seg.visible = k > 0
    if (!k) return
    const attr = seg.geometry.getAttribute('position') as BufferAttribute
    attr.needsUpdate = true
    seg.geometry.setDrawRange(0, k / 3)
    ;(seg.material as MeshBasicMaterial).opacity = reduced ? 0.8 : 0.55 + Math.sin(clock.elapsedTime * 8) * 0.45
  })
  return (
    <lineSegments ref={ref} frustumCulled={false} visible={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[pos, 3]} />
      </bufferGeometry>
      <lineBasicMaterial color={ACCENT} transparent />
    </lineSegments>
  )
}

function Board({ lab, sim, c, director, activeBand, version }: { lab: Lab; sim: Sim; c: Colors; director: Director; activeBand: number; version: number }) {
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
    l.push(...rect(-7.7, 1.3, -4.3, 5.2, y))
    l.push(...rect(-3.75, 1.3, -1.15, 5.2, y))
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
  useEffect(() => () => outline.dispose(), [outline])
  const debugLines = useMemo(() => {
    if (!director.debug) return null
    const l: number[][] = []
    for (const ch of sim.layout.channels) l.push([ch.x0, y + 0.004, ch.z], [ch.x1, y + 0.004, ch.z])
    for (const [, lane] of sim.lanes) {
      const x = -1.05 + (lane.index % 18) * 0.07
      l.push([x, y + 0.004, CPU.z - 2.4], [x, y + 0.004, CPU.z + 2.4])
    }
    return segs(l)
  }, [director.debug, version, sim, y])
  useEffect(() => () => debugLines?.dispose(), [debugLines])
  const edges = useMemo(() => new EdgesGeometry(new BoxGeometry(BOARD.x1 - BOARD.x0, 0.16, BOARD.z1 - BOARD.z0)), [])
  useEffect(() => () => edges.dispose(), [edges])
  const statics = useMemo(() => staticRoutes(director.routing, lab.setup.framework), [director.routing, lab.setup.framework])
  const band = activeBand >= 0 ? activeBand : -1
  const furniture = useMemo<Prim[]>(() => {
    const out: Prim[] = []
    for (const [x, z] of [[BOARD.x0 + 0.35, BOARD.z0 + 0.35], [BOARD.x1 - 0.35, BOARD.z0 + 0.35], [BOARD.x0 + 0.35, BOARD.z1 - 0.35], [BOARD.x1 - 0.35, BOARD.z1 - 0.35], [-0.4, BOARD.z0 + 0.35], [-0.4, BOARD.z1 - 0.35]]) {
      out.push({ cyl: [0.1, 0.1, BY - 0.16, 12], at: [x, (BY - 0.16) / 2, z], color: c.surface })
      out.push({ cyl: [0.2, 0.2, 0.01, 24], at: [x, BY + 0.004, z], color: c.pin, edge: false })
    }
    const h = cpuHalf(lab.setup.framework)
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2
      const x = CPU.x + Math.cos(a) * (h.w + 0.35), z = CPU.z + Math.sin(a) * (h.d + 0.35)
      if (x > CPU.x + h.w - 0.2 && Math.abs(z - CPU.z) < h.d) continue
      out.push({ box: [0.18, 0.08, 0.1], at: [x, BY + 0.04, z], color: i % 3 ? c.ceramic : c.body })
    }
    return out
  }, [c.surface, c.pin, c.ceramic, c.body, lab.setup.framework])
  const pwr = useRef<Mesh>(null)
  const act = useRef<Mesh>(null)
  const led = useMemo(() => ({ green: new Color('#3DDC84'), amber: new Color('#F0C36A'), dim: new Color(c.dim) }), [c.dim])
  useFrame(() => {
    if (pwr.current) (pwr.current.material as MeshBasicMaterial).color.copy(led.green).lerp(led.dim, 1 - sim.power)
    if (act.current) {
      const blink = sim.time - sim.renderAt < 0.18 || sim.time - sim.submitAt < 0.12
      ;(act.current.material as MeshBasicMaterial).color.copy(blink ? led.amber : led.dim)
    }
  })
  const powerOpacity = () => 0.25 + sim.power * 0.75
  return (
    <group>
      <mesh position={[(BOARD.x0 + BOARD.x1) / 2, BY - 0.08, (BOARD.z0 + BOARD.z1) / 2]}>
        <boxGeometry args={[BOARD.x1 - BOARD.x0, 0.16, BOARD.z1 - BOARD.z0]} />
        <meshStandardMaterial color={c.board} roughness={0.95} />
      </mesh>
      <lineSegments geometry={edges} position={[(BOARD.x0 + BOARD.x1) / 2, BY - 0.08, (BOARD.z0 + BOARD.z1) / 2]}>
        <lineBasicMaterial color={c.boardEdge} />
      </lineSegments>
      <Assembly prims={furniture} edge={c.edge} />
      <lineSegments geometry={outline}>
        <lineBasicMaterial color={c.silk} transparent opacity={0.85} />
      </lineSegments>
      {debugLines && (
        <lineSegments geometry={debugLines}>
          <lineBasicMaterial color="#E0457B" transparent opacity={0.8} />
        </lineSegments>
      )}
      {band >= 0 && (
        <Line points={rect(PAGE.x0 + 0.02, bandZ(band) + 0.02, PAGE.x1 - 0.02, bandZ(band) + BAND_DEPTH - 0.02, y + 0.002) as [number, number, number][]} segments color={ACCENT} lineWidth={2} />
      )}
      <mesh position={[(BOARD.x0 + BOARD.x1) / 2, BY + 0.004, (BOARD.z0 + BOARD.z1) / 2]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[BOARD.x1 - BOARD.x0, BOARD.z1 - BOARD.z0]} />
        <meshBasicMaterial map={silk} transparent toneMapped={false} depthWrite={false} />
      </mesh>
      <TraceBundle routes={statics.power} color={c.trace} width={4.5} />
      <TraceBundle routes={statics.memory} color={c.trace} width={1.6} />
      {statics.power.map((r) => <TraceLine key={r.key} route={r} color={c.power} width={4.5} progress={() => sim.power} opacity={powerOpacity} />)}
      <mesh ref={pwr} position={[LED.pwr.x, BY + 0.05, LED.pwr.z]}>
        <boxGeometry args={[0.12, 0.08, 0.1]} />
        <meshBasicMaterial color={c.dim} toneMapped={false} />
      </mesh>
      <mesh ref={act} position={[LED.act.x, BY + 0.05, LED.act.z]}>
        <boxGeometry args={[0.12, 0.08, 0.1]} />
        <meshBasicMaterial color={c.dim} toneMapped={false} />
      </mesh>
    </group>
  )
}

function useDrop(start: number, reduced: boolean, k = 7) {
  const g = useRef<Group>(null)
  const drop = useRef(reduced ? 0 : start)
  useFrame((_, dt) => {
    drop.current += (0 - drop.current) * (1 - Math.exp(-dt * k))
    if (g.current) g.current.position.y = drop.current
  })
  return [g, drop] as const
}

type Hover = { title: string; sub: string }
function useHandlers(tip: Tip, hover: Hover, onClick: () => void, drop: { current: number }, kick: number, guard: Guard, reduced: boolean) {
  return {
    onClick: (e: { stopPropagation: () => void }) => { e.stopPropagation(); if (guard.moved) return; if (!reduced) drop.current = kick; onClick() },
    onPointerOver: (e: { stopPropagation: () => void; nativeEvent: PointerEvent }) => { e.stopPropagation(); tip.show(e.nativeEvent, hover.title, hover.sub) },
    onPointerMove: (e: { nativeEvent: PointerEvent }) => tip.move(e.nativeEvent),
    onPointerOut: () => tip.hide(),
  }
}

type Socket = { c: Colors; onClick: () => void; tip: Tip; sim: Sim; guard: Guard; reduced: boolean }

function Cpu({ framework, c, onClick, tip, sim, guard, reduced }: Socket & { framework: Setup['framework'] }) {
  const [g, drop] = useDrop(3, reduced)
  const art = useMemo(() => cpuArt(framework), [framework])
  useEffect(() => () => art.dispose(), [art])
  const half = cpuHalf(framework)
  const handlers = useHandlers(tip, { title: framework === 'next' ? 'Next.js · CPU0' : 'TanStack Start · CPU0', sub: 'Framework socket · click to swap the CPU' }, onClick, drop, 2.4, guard, reduced)
  const lid = framework === 'next' ? { w: 2.5, d: 2.5, h: 0.2 } : { w: 2.3, d: 1.5, h: 0.08 }
  const prims = useMemo<Prim[]>(() => {
    const out: Prim[] = []
    const step = 0.16
    for (let x = -half.w + 0.1; x <= half.w - 0.1; x += step)
      for (let z = -half.d + 0.1; z <= half.d - 0.1; z += step)
        if (Math.abs(x) > half.w - 0.42 || Math.abs(z) > half.d - 0.42) out.push({ box: [0.07, 0.07, 0.07], at: [x, 0.035, z], color: '#C9CED1', edge: false })
    out.push({ box: [half.w * 2, 0.08, half.d * 2], at: [0, 0.11, 0], color: framework === 'next' ? c.sub : '#1C2A24' })
    if (framework === 'tanstack') {
      for (const x of [-1.55, 1.55]) out.push({ box: [0.5, 0.06, 2.2], at: [x, 0.18, 0], color: c.pin })
      out.push({ box: [0.08, 0.3, 0.08], at: [half.w + 0.12, 0.2, half.d - 0.2], color: c.pin })
      out.push({ box: [0.6, 0.06, 0.06], at: [half.w + 0.4, 0.33, half.d - 0.2], color: c.pin })
    } else {
      out.push({ box: [lid.w, lid.h, lid.d], at: [0, 0.15 + lid.h / 2, 0], color: '#0A0B0C' })
      out.push({ box: [0.3, 0.02, 0.3], at: [-lid.w / 2 + 0.25, 0.15 + lid.h + 0.005, -lid.d / 2 + 0.25], color: '#1A1C1E', edge: false })
    }
    if (framework === 'tanstack') out.push({ box: [lid.w, lid.h, lid.d], at: [0, 0.15 + lid.h / 2, 0], color: '#202A44' })
    return out
  }, [framework, half.w, half.d, c.sub, c.pin, lid.w, lid.d, lid.h])
  const glow = useRef<Mesh>(null)
  useFrame(() => {
    if (!glow.current) return
    const k = Math.max(0, 1 - (sim.time - sim.renderAt) / 0.35) * sim.power
    ;(glow.current.material as MeshBasicMaterial).opacity = k * 0.5
  })
  return (
    <group position={[CPU.x, BY, CPU.z]}>
      {framework === 'tanstack' && (
        <Line points={rect(-half.w - 0.25, -half.d - 0.25, half.w + 0.25, half.d + 0.25, 0.01) as [number, number, number][]} segments color={c.pin} lineWidth={1.4} />
      )}
      <group ref={g} {...handlers}>
        <Assembly prims={prims} edge={framework === 'next' ? '#3A4044' : '#7C8BD0'} metal={0.3} />
        <mesh position={[0, 0.15 + lid.h + 0.002, 0]} rotation-x={-Math.PI / 2}>
          <planeGeometry args={[lid.w * 0.98, lid.d * 0.98]} />
          <meshBasicMaterial map={art} toneMapped={false} />
        </mesh>
        <mesh ref={glow} position={[0, 0.15 + lid.h + 0.004, 0]} rotation-x={-Math.PI / 2}>
          <planeGeometry args={[lid.w * 0.98, lid.d * 0.98]} />
          <meshBasicMaterial color={ACCENT} transparent opacity={0} toneMapped={false} depthWrite={false} />
        </mesh>
      </group>
    </group>
  )
}

function Memory({ database, c, onClick, tip, sim, guard, reduced }: Socket & { database: Database }) {
  const [g, drop] = useDrop(2.5, reduced)
  const art = useMemo(() => (database === 'postgres' ? dimmArt() : leafArt()), [database])
  useEffect(() => () => art.dispose(), [art])
  const handlers = useHandlers(tip, { title: database === 'postgres' ? 'PostgreSQL · 2× DDR5 DIMM' : 'MongoDB · document NAND stack', sub: 'Memory · click to swap the database' }, onClick, drop, 2.2, guard, reduced)
  const prims = useMemo<Prim[]>(() => {
    const out: Prim[] = []
    if (database === 'postgres') {
      for (const x of [-7.45, -6.95]) {
        out.push({ box: [0.26, 0.22, 4.2], at: [x, 0.11, -0.4], color: c.body })
        out.push({ box: [0.05, 1.05, 3.9], at: [x, 0.72, -0.4], color: '#2B4F6E' })
        out.push({ box: [0.09, 0.9, 3.5], at: [x + 0.07, 0.78, -0.4], color: '#C9CED1' })
        for (let k = 0; k < 8; k++) out.push({ box: [0.03, 0.34, 0.38], at: [x - 0.04, 0.8, -2.02 + k * 0.46], color: c.body })
        out.push({ box: [0.07, 0.07, 0.3], at: [x, 1.28, -0.4], color: '#336791', edge: false })
      }
    } else {
      for (const z of [-1.3, 0, 1.3]) {
        for (let k = 0; k < 5; k++) out.push({ box: [0.95 - k * 0.05, 0.1, 0.95 - k * 0.05], at: [0, 0.07 + k * 0.14, z], color: k % 2 ? '#14261B' : c.body })
        out.push({ box: [0.3, 0.06, 0.06], at: [0, 0.07 + 5 * 0.14, z - 0.35], color: '#00ED64', edge: false })
      }
    }
    return out
  }, [database, c.body])
  const led = useRef<Mesh>(null)
  const tone = useMemo(() => ({ dim: new Color(c.dim), green: new Color('#3DDC84') }), [c.dim])
  useFrame(() => {
    if (!led.current) return
    const w = Math.max(0, 1 - (sim.time - sim.submitAt) / 0.5)
    ;(led.current.material as MeshBasicMaterial).color.copy(tone.dim).lerp(tone.green, Math.max(w, sim.power * 0.35))
  })
  const at: [number, number, number] = database === 'postgres' ? [0, 0, CPU.z] : [-7.15, 0, CPU.z]
  return (
    <group position={[0, BY, 0]} {...handlers}>
      <group ref={g}>
        <Assembly prims={prims} edge={database === 'postgres' ? c.bodyEdge : '#2E7A4E'} position={at} metal={0.2} />
        {database === 'postgres' ? (
          <group position={[-6.82, 0.62, CPU.z - 0.4]} rotation-y={Math.PI / 2}>
            <mesh>
              <planeGeometry args={[3.2, 0.82]} />
              <meshBasicMaterial map={art} toneMapped={false} />
            </mesh>
          </group>
        ) : (
          [-1.3, 0, 1.3].map((z) => (
            <mesh key={z} position={[-7.15, 0.07 + 4 * 0.14 + 0.052, CPU.z + z]} rotation-x={-Math.PI / 2}>
              <planeGeometry args={[0.72, 0.72]} />
              <meshBasicMaterial map={art} toneMapped={false} />
            </mesh>
          ))
        )}
        <mesh ref={led} position={[-7.2, 0.14, CPU.z + 1.95]}>
          <boxGeometry args={[0.12, 0.08, 0.1]} />
          <meshBasicMaterial color={c.dim} toneMapped={false} />
        </mesh>
      </group>
    </group>
  )
}

function Power({ pm, c, onClick, tip, sim, guard, reduced }: Socket & { pm: PackageManager }) {
  const [g, drop] = useDrop(2.5, reduced)
  const spin = useRef<Group>(null)
  useFrame(({ clock }) => { if (spin.current && pm === 'bun' && !reduced) spin.current.rotation.y = clock.elapsedTime * 0.6 * sim.power })
  const label = { pnpm: 'pnpm · 6-phase VRM', npm: 'npm · linear LDO', bun: 'Bun · compact buck' }[pm]
  const handlers = useHandlers(tip, { title: label, sub: 'Package manager · click to swap the regulator' }, onClick, drop, 2.2, guard, reduced)
  const prims = useMemo<Prim[]>(() => {
    const out: Prim[] = []
    if (pm === 'pnpm') {
      for (let i = 0; i < 6; i++) {
        out.push({ box: [0.62, 0.48, 0.62], at: [-7.15 + i * 0.85, 0.24, -5.15], color: '#2A2E31' })
        out.push({ box: [0.42, 0.1, 0.4], at: [-7.15 + i * 0.85, 0.05, -4.45], color: c.body })
      }
      for (let i = 0; i < 5; i++) out.push({ cyl: [0.2, 0.2, 0.6, 20], at: [-6.75 + i * 0.85, 0.3, -5.95], color: '#B9C0C4' })
    } else if (pm === 'npm') {
      out.push({ box: [2.6, 0.12, 1.3], at: [-5.4, 0.06, -5.1], color: '#9AA3A8' })
      for (let i = 0; i < 11; i++) out.push({ box: [0.05, 0.95, 1.3], at: [-6.6 + i * 0.24, 0.6, -5.1], color: '#B7BEC2' })
      out.push({ box: [0.95, 1.1, 0.16], at: [-5.4, 0.66, -4.35], color: '#111111' })
      for (const x of [-3.6, -2.85]) out.push({ cyl: [0.36, 0.36, 1.3, 28], at: [x, 0.65, -5.1], color: '#CB3837' })
    } else {
      out.push({ box: [0.6, 0.12, 0.6], at: [-3.6, 0.06, -5.1], color: c.body })
      for (const x of [-3.0, -2.75]) out.push({ box: [0.18, 0.12, 0.34], at: [x, 0.06, -5.1], color: c.ceramic })
    }
    return out
  }, [pm, c.body, c.ceramic])
  const edge = pm === 'pnpm' ? '#F9AD00' : pm === 'npm' ? '#7E1F1E' : '#F472B6'
  return (
    <group position={[0, BY, 0]} {...handlers}>
      <group ref={g}>
        <Assembly prims={prims} edge={edge} metal={0.3} />
        {pm === 'bun' && (
          <group ref={spin}>
            {[-6.4, -4.9].map((x) => (
              <group key={x} position={[x, 0.2, -5.1]}>
                <Assembly prims={[{ torus: [0.5, 0.2], at: [0, 0, 0], color: '#F6DEC0', rot: [Math.PI / 2, 0, 0] }]} edge="#C9772B" />
              </group>
            ))}
          </group>
        )}
      </group>
    </group>
  )
}

const PROBE_LED = { on: new Color('#7CFF9B'), off: new Color('#1E3324'), idle: new Color('#3DDC84') }

function Probe({ agent, sim, c, onClick, tip, guard, reduced }: Socket & { agent: Agent }) {
  const led = useRef<Mesh>(null)
  const bar = useRef<Mesh>(null)
  const art = useMemo(() => (agent === 'none' ? null : probeArt(agent)), [agent])
  useEffect(() => () => art?.dispose(), [art])
  const [pod, drop] = useDrop(2, reduced, 6)
  useFrame(() => {
    const busy = !!sim.agentFlash
    const t = sim.agentFlash?.t ?? 0
    const blink = !reduced && Math.floor(t * 1.4 / 0.34) % 2 === 0
    if (led.current) (led.current.material as MeshBasicMaterial).color.copy(busy ? (blink ? PROBE_LED.on : PROBE_LED.off) : PROBE_LED.idle)
    if (bar.current) {
      bar.current.visible = busy
      bar.current.scale.x = Math.max(0.001, t)
      bar.current.position.x = -0.78 + (1.56 * t) / 2
    }
  })
  const handlers = useHandlers(tip, { title: agent === 'none' ? 'J1 debug header' : `${agent === 'claude' ? 'Claude Code' : 'Codex'} probe`, sub: 'Agent · click to clip on a different probe' }, onClick, drop, 1.6, guard, reduced)
  const pins: [number, number, number][] = []
  for (let i = 0; i < 5; i++) for (const r of [-0.12, 0.12]) pins.push([HEADER.x - 0.3 + i * 0.15, BY, HEADER.z + r], [HEADER.x - 0.3 + i * 0.15, BY + 0.3, HEADER.z + r])
  const podPos: [number, number, number] = [HEADER.x + 0.4, 0.5, BOARD.z1 + 1.9]
  const clip: [number, number, number] = [HEADER.x, BY + 0.42, HEADER.z]
  const prims = useMemo<Prim[]>(() => {
    if (agent === 'claude') return [{ box: [0.95, 0.24, 0.5], at: clip, color: CLAUDE }, { box: [1.9, 0.45, 1.1], at: podPos, color: CLAUDE }]
    if (agent === 'codex') return [
      { box: [1.0, 0.16, 0.9], at: [HEADER.x, BY + 0.5, HEADER.z + 0.2], color: '#0E0F10' },
      { box: [1.0, 0.75, 0.12], at: [HEADER.x, BY + 0.1, BOARD.z1 + 0.08], color: '#0E0F10' },
      { box: [1.0, 0.12, 0.9], at: [HEADER.x, BY - 0.24, HEADER.z + 0.2], color: '#0E0F10' },
      { box: [1.6, 0.35, 1.0], at: podPos, color: '#0E0F10' },
    ]
    return []
  }, [agent])
  const podTop = podPos[1] + (agent === 'claude' ? 0.226 : 0.176)
  return (
    <group {...handlers}>
      <Assembly prims={[{ box: [0.85, 0.12, 0.42], at: [HEADER.x, BY + 0.06, HEADER.z], color: c.body }]} edge={c.bodyEdge} />
      <Line points={pins} segments color="#D8B865" lineWidth={1.5} />
      {agent !== 'none' && (
        <group ref={pod}>
          <Assembly prims={prims} edge={agent === 'claude' ? '#8C3F25' : '#F2F2F2'} />
          {agent === 'claude' ? (
            <Line points={[clip, [clip[0], clip[1] + 0.6, clip[2] + 0.4], [podPos[0], podPos[1] + 0.9, podPos[2] - 0.8], [podPos[0], podPos[1] + 0.2, podPos[2] - 0.55]]} color="#BDB6AC" lineWidth={7} />
          ) : (
            <Line points={[[HEADER.x, BY + 0.58, HEADER.z + 0.6], [HEADER.x, BY + 1.3, BOARD.z1 + 0.8], [podPos[0], podPos[1] + 0.5, podPos[2] - 0.6]]} color="#2A2E31" lineWidth={4} />
          )}
          <mesh position={[podPos[0], podTop, podPos[2]]} rotation-x={-Math.PI / 2}>
            <planeGeometry args={agent === 'claude' ? [1.85, 1.06] : [1.55, 0.96]} />
            <meshBasicMaterial map={art} toneMapped={false} />
          </mesh>
          <group position={[podPos[0], podTop + 0.004, podPos[2] + (agent === 'claude' ? 0.33 : 0.3)]}>
            <mesh ref={bar} rotation-x={-Math.PI / 2} visible={false}>
              <planeGeometry args={[1.56, 0.1]} />
              <meshBasicMaterial color={agent === 'claude' ? '#FFF4EC' : '#FFFFFF'} toneMapped={false} />
            </mesh>
          </group>
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

/** The slats run only while the belt carries something, and never under reduced motion. */
function Belt({ c, sim, reduced }: { c: Colors; sim: Sim; reduced: boolean }) {
  const slats = useRef<InstancedMesh>(null)
  const len = BELT.x1 - BELT.x0 + 1.0
  const n = 26
  const m = useMemo(() => new Matrix4(), [])
  const run = useRef({ offset: 0, placed: false })
  useFrame((_, dt) => {
    const inst = slats.current
    if (!inst) return
    const r = run.current
    const moving = !reduced && (sim.belt.length > 0 || sim.pops > 0)
    if (!moving && r.placed) return
    if (moving) r.offset = (r.offset + Math.min(dt, 0.1) * BELT.speed) % (len / n)
    for (let i = 0; i < n; i++) inst.setMatrixAt(i, m.makeTranslation(BELT.x0 - 0.5 + (((i * len) / n + r.offset) % len), BELT.y - 0.01, BELT.z))
    inst.instanceMatrix.needsUpdate = true
    r.placed = true
  })
  const mid = (BELT.x0 + BELT.x1) / 2
  const prims = useMemo<Prim[]>(() => [
    { box: [len, 0.3, 1.2], at: [mid, BELT.y - 0.17, BELT.z], color: c.surface },
    { box: [len + 0.1, 0.14, 0.07], at: [mid, BELT.y + 0.02, BELT.z - 0.64], color: c.surface },
    { box: [len + 0.1, 0.14, 0.07], at: [mid, BELT.y + 0.02, BELT.z + 0.64], color: c.surface },
    { box: [0.12, BELT.y - 0.32, 0.12], at: [BELT.x0 + 0.2, (BELT.y - 0.32) / 2, BELT.z], color: c.surface },
    { box: [0.12, BELT.y - 0.32, 0.12], at: [BELT.x1 - 0.2, (BELT.y - 0.32) / 2, BELT.z], color: c.surface },
  ], [c.surface, len, mid])
  return (
    <group>
      <Assembly prims={prims} edge={c.edge} />
      <instancedMesh ref={slats} args={[undefined, undefined, n]} frustumCulled={false}>
        <boxGeometry args={[0.02, 0.01, 1.1]} />
        <meshBasicMaterial color={c.edge} />
      </instancedMesh>
    </group>
  )
}

/** A hairline cartesian gantry with a row of nozzles: nothing but strokes, so the bridge never hides a chip. */
function Gantry({ sim, c }: { sim: Sim; c: Colors }) {
  const lines = useRef<ThreeLineSegments>(null)
  const nozzles = useRef<InstancedMesh>(null)
  const reach = useRef(0)
  const pos = useMemo(() => new Float32Array(3 * 2 * 72), [])
  const m = useMemo(() => new Matrix4(), [])
  const tone = useMemo(() => ({ idle: new Color(c.surface), held: new Color(ACCENT) }), [c.surface])
  useFrame((_, dt) => {
    const p = sim.gantry.pos
    reach.current += (Math.max(p.z + 0.5, RAIL.back + 1.2) - reach.current) * (1 - Math.exp(-dt * 12))
    let k = 0
    const seg = (ax: number, ay: number, az: number, bx: number, by: number, bz: number) => {
      pos[k++] = ax; pos[k++] = ay; pos[k++] = az; pos[k++] = bx; pos[k++] = by; pos[k++] = bz
    }
    const cube = (x: number, y: number, z: number, w: number, h: number, d: number) => {
      const x0 = x - w / 2, x1 = x + w / 2, z0 = z - d / 2, z1 = z + d / 2
      for (let j = 0; j < 2; j++) {
        const yy = y + (j ? h : -h) / 2
        seg(x0, yy, z0, x1, yy, z0); seg(x1, yy, z0, x1, yy, z1); seg(x1, yy, z1, x0, yy, z1); seg(x0, yy, z1, x0, yy, z0)
      }
      seg(x0, y - h / 2, z0, x0, y + h / 2, z0); seg(x1, y - h / 2, z0, x1, y + h / 2, z0)
      seg(x0, y - h / 2, z1, x0, y + h / 2, z1); seg(x1, y - h / 2, z1, x1, y + h / 2, z1)
    }
    const top = RAIL.top
    seg(RAIL.x0, top, RAIL.back - 0.15, RAIL.x1, top, RAIL.back - 0.15)
    seg(RAIL.x0, top, RAIL.back + 0.15, RAIL.x1, top, RAIL.back + 0.15)
    seg(RAIL.x0, top - 0.2, RAIL.back, RAIL.x1, top - 0.2, RAIL.back)
    for (let i = 0; i < 3; i++) {
      const x = i === 0 ? RAIL.x0 + 0.3 : i === 1 ? RAIL.x1 - 0.3 : (RAIL.x0 + RAIL.x1) / 2
      seg(x, 0, RAIL.back, x, top, RAIL.back)
      seg(x - 0.3, 0, RAIL.back, x + 0.3, 0, RAIL.back)
    }
    cube(p.x, top + 0.1, RAIL.back, 0.8, 0.5, 0.7)
    const z1 = reach.current
    seg(p.x - 0.22, top + 0.35, RAIL.back, p.x - 0.22, top + 0.35, z1)
    seg(p.x + 0.22, top + 0.35, RAIL.back, p.x + 0.22, top + 0.35, z1)
    seg(p.x - 0.22, top + 0.35, z1, p.x + 0.22, top + 0.35, z1)
    cube(p.x, top + 0.05, p.z, 0.55, 0.55, 0.55)
    seg(p.x, top - 0.22, p.z, p.x, p.y + 0.5, p.z)
    const span = -nozzleX(0) + 0.12
    seg(p.x - span, p.y + 0.5, p.z, p.x + span, p.y + 0.5, p.z)
    for (let i = 0; i < NOZZLES; i++) seg(p.x + nozzleX(i), p.y + 0.5, p.z, p.x + nozzleX(i), p.y + 0.3, p.z)
    pos.fill(0, k)
    const geo = lines.current?.geometry
    if (geo) {
      ;(geo.getAttribute('position') as BufferAttribute).needsUpdate = true
      geo.setDrawRange(0, k / 3)
    }
    const inst = nozzles.current
    if (inst) {
      for (let i = 0; i < NOZZLES; i++) {
        inst.setMatrixAt(i, m.makeTranslation(p.x + nozzleX(i), p.y + 0.16, p.z))
        inst.setColorAt(i, sim.gantry.held[i] ? tone.held : tone.idle)
      }
      inst.instanceMatrix.needsUpdate = true
      if (inst.instanceColor) inst.instanceColor.needsUpdate = true
    }
  })
  return (
    <group>
      <lineSegments ref={lines} frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[pos, 3]} />
        </bufferGeometry>
        <lineBasicMaterial color={c.edge} />
      </lineSegments>
      <instancedMesh ref={nozzles} args={[undefined, undefined, NOZZLES]} frustumCulled={false}>
        <cylinderGeometry args={[0.1, 0.035, 0.28, 12]} />
        <meshStandardMaterial roughness={0.6} />
      </instancedMesh>
    </group>
  )
}

function Ghosts({ sim, c, version, reduced }: { sim: Sim; c: Colors; version: number; reduced: boolean }) {
  const groups = useRef<(Group | null)[]>([])
  const born = useRef(new Map<string, number>())
  const marks = useMemo(() => sim.layout.ghosts.map((g) => legacyMarking(g.title, g.year, g.spec)), [version])
  useEffect(() => () => marks.forEach((m) => m.dispose()), [marks])
  useFrame(({ clock }) => {
    sim.layout.ghosts.forEach((g, i) => {
      const grp = groups.current[i]
      if (!grp) return
      if (!born.current.has(g.title)) born.current.set(g.title, clock.elapsedTime + i * 0.12)
      const t = reduced ? 1 : Math.min(1, Math.max(0, (clock.elapsedTime - born.current.get(g.title)!) / 0.6))
      grp.position.set(g.slot.x, g.slot.y + (1 - t * t) * 2.5, g.slot.z)
      grp.scale.setScalar(g.slot.s)
      grp.rotation.y = i % 2 ? 0.012 : -0.015
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

/** Where along its route each via sits, as a fraction of the drawn length; routes are immutable, so this is cached per route. */
const viaAt = new WeakMap<Route, number[]>()
function viaFractions(route: Route) {
  let at = viaAt.get(route)
  if (!at) {
    at = route.vias.map((via) => {
      const k = route.pts.findIndex((q) => q.distanceToSquared(via) < 0.004)
      return k < 0 ? 1 : k / route.pts.length
    })
    viaAt.set(route, at)
  }
  return at
}

function Routes({ sim, c, version, style, reduced }: { sim: Sim; c: Colors; version: number; style: RouteStyle; reduced: boolean }) {
  const [, force] = useState(0)
  const drawing = useRef(new Set<string>())
  const done = useMemo(() => [...sim.parts.values()].filter((p) => p.route && p.mode === 'seated' && p.drawn >= 1).map((p) => p.route!), [version, sim])
  const form = useMemo(() => {
    const f = [...sim.parts.values()].find((p) => p.item.kind === 'feature' && p.slot && p.mode === 'seated')
    return f?.slot ? formNet(f.slot, style) : null
  }, [version, style, sim])
  const heads = useRef<(Mesh | null)[]>([])
  const vias = useRef<InstancedMesh>(null)
  const tmp = useMemo(() => new Vector3(), [])
  const m = useMemo(() => new Matrix4(), [])
  useFrame(() => {
    let h = 0
    let v = 0
    let changed = false
    for (const p of sim.parts.values()) {
      if (!p.route || p.mode !== 'seated') continue
      const was = drawing.current.has(p.item.ref)
      if (p.drawn < 1 && !was) { drawing.current.add(p.item.ref); changed = true }
      if (p.drawn >= 1 && was) { drawing.current.delete(p.item.ref); changed = true }
      if (p.drawn < 1 && h < heads.current.length) {
        const head = heads.current[h++]
        if (head) {
          head.visible = true
          sampleRoute(p.route, p.drawn, head.position)
          head.scale.setScalar(reduced ? 1.3 : 1 + (Math.abs(Math.sin(Math.floor(sim.time / 0.34) * 12.9898 + p.order * 78.233)) * 43758.5453 % 1) * 0.6)
        }
      }
      const at = viaFractions(p.route)
      for (let i = 0; i < p.route.vias.length; i++) {
        if (!vias.current || v >= 400) break
        const via = p.route.vias[i]
        vias.current.setMatrixAt(v++, m.makeTranslation(via.x, via.y + 0.003, via.z).scale(tmp.setScalar(p.drawn >= at[i] ? 1 : 0)))
      }
    }
    if (form && vias.current) for (const via of form.vias) vias.current.setMatrixAt(v++, m.makeTranslation(via.x, via.y + 0.003, via.z))
    for (; h < heads.current.length; h++) if (heads.current[h]) heads.current[h]!.visible = false
    if (vias.current) {
      vias.current.count = v
      vias.current.instanceMatrix.needsUpdate = true
    }
    if (changed) force((n) => n + 1)
  })
  const live = [...sim.parts.values()].filter((p) => p.route && p.mode === 'seated' && p.drawn < 1)
  return (
    <>
      <TraceBundle routes={form ? [...done, form] : done} color={c.lit} width={1.7} />
      {live.map((p) => (
        <TraceLine key={p.route!.key} route={p.route!} color={c.lit} width={1.7} progress={() => (p.mode === 'seated' ? p.drawn : 0)} />
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

type Pulse = { route: Route; t: number; speed: number; part: Part | null }
/** Render ticks ripple from the CPU down the page in band order; queries shuttle on the memory bus; submissions ride from the form to memory. Reduced motion stills them all. */
function Pulses({ sim, c, director, framework, version, reduced }: { sim: Sim; c: Colors; director: Director; framework: Setup['framework']; version: number; reduced: boolean }) {
  const N = 600, P = 160, S = 24
  const data = useRef<Points>(null)
  const power = useRef<Points>(null)
  const submit = useRef<Points>(null)
  const state = useMemo(() => {
    const free: Pulse[] = []
    const spawn = (list: Pulse[], cap: number, route: Route, t: number, speed: number, part: Part | null = null) => {
      if (list.length >= cap) return
      const pulse = free.pop() ?? { route, t, speed, part }
      pulse.route = route
      pulse.t = t
      pulse.speed = speed
      pulse.part = part
      list.push(pulse)
    }
    const run = (list: Pulse[], arr: Float32Array, pts: Points | null, dt: number) => {
      let w = 0, keep = 0
      for (let i = 0; i < list.length; i++) {
        const pulse = list[i]
        const before = pulse.t
        pulse.t += pulse.speed * dt
        const t = pulse.speed < 0 ? 1 + pulse.t : pulse.t
        if (pulse.part && before < 1 && pulse.t >= 1) pulse.part.lit = 1
        const alive = pulse.speed < 0 ? 1 + pulse.t >= 0 : pulse.t <= 1
        if (alive) list[keep++] = pulse
        else free.push(pulse)
        if (!alive || t < 0) continue
        sampleRoute(pulse.route, t, tmp)
        arr[w * 3] = tmp.x; arr[w * 3 + 1] = tmp.y + 0.02; arr[w * 3 + 2] = tmp.z
        w++
      }
      list.length = keep
      if (pts) {
        ;(pts.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true
        pts.geometry.setDrawRange(0, w)
      }
    }
    const tmp = new Vector3()
    return { data: [] as Pulse[], power: [] as Pulse[], submit: [] as Pulse[], dataPos: new Float32Array(N * 3), powerPos: new Float32Array(P * 3), submitPos: new Float32Array(S * 3), spawn, run }
  }, [])
  const statics = useMemo(() => staticRoutes(director.routing, framework), [director.routing, framework])
  const form = useMemo(() => {
    const f = [...sim.parts.values()].find((p) => p.item.kind === 'feature' && p.slot && p.mode === 'seated')
    return f?.slot ? formNet(f.slot, director.routing) : null
  }, [version, director.routing, sim])
  const seen = useRef({ render: -1, submit: -1 })
  useFrame((_, dt) => {
    const { spawn } = state
    if (sim.renders !== seen.current.render) {
      seen.current.render = sim.renders
      if (!reduced)
        for (const p of sim.parts.values()) {
          if (p.mode !== 'seated' || !p.route || p.drawn < 1) continue
          const band = p.item.kind === 'block' ? bandZ(0) : 0
          const delay = p.item.kind === 'block' ? ((p.slot?.z ?? band) - PAGE.z0) / (PAGE.z1 - PAGE.z0) * 0.9 : p.item.kind === 'feature' ? 0.2 : 0.95
          const speed = 7 / p.route.len
          for (let k = 0; k < 3; k++) spawn(state.data, N, p.route, -delay * speed - k * 0.08, speed, k === 0 ? p : null)
        }
    }
    if (sim.submits !== seen.current.submit && form) {
      seen.current.submit = sim.submits
      if (!reduced) for (let k = 0; k < 4; k++) spawn(state.submit, S, form, -k * 0.1, 4.5 / form.len)
    }
    if (sim.power >= 1 && !reduced) {
      for (const r of statics.memory) if (Math.random() < dt * 1.2) spawn(state.data, N, r, 0, Math.random() < 0.5 ? 1.6 : -1.6)
      for (const r of statics.power) if (Math.random() < dt * 2) spawn(state.power, P, r, 0, 0.9)
    }
    state.run(state.data, state.dataPos, data.current, dt)
    state.run(state.power, state.powerPos, power.current, dt)
    state.run(state.submit, state.submitPos, submit.current, dt)
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
      <points ref={submit} frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[state.submitPos, 3]} />
        </bufferGeometry>
        <pointsMaterial color={c.fg} size={8} sizeAttenuation={false} toneMapped={false} />
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
    return makeRoute([new Vector3(HEADER.x, y, HEADER.z), new Vector3(HEADER.x, y, s.z), new Vector3(s.x, y, s.z)], 'manhattan', [], 'flash')
  }, [part])
  if (!route) return null
  return <TraceLine route={route} color={agent === 'codex' ? '#F2F2F2' : CLAUDE} width={2.4} progress={() => sim.agentFlash?.t ?? 0} />
}

type Shot = { target: Vector3; zoom: number; polar: number; az: number }
const newShot = (): Shot => ({ target: new Vector3(), zoom: 1, polar: 0, az: 0 })
const F = { dir: new Vector3(), right: new Vector3(), up: new Vector3() }

/** Frames `points` in the viewport minus the pixel insets the chrome covers, from azimuth `az` and polar angle `polar`. */
function fit(points: readonly Vector3[], az: number, polar: number, size: { width: number; height: number }, inset: { left: number; right: number; top: number; bottom: number }, margin: number, out: Shot) {
  const dir = F.dir.set(Math.sin(polar) * Math.sin(az), Math.cos(polar), Math.sin(polar) * Math.cos(az))
  const right = F.right.set(Math.cos(az), 0, -Math.sin(az))
  const up = F.up.crossVectors(dir, right).negate()
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, depth = 0
  for (const p of points) {
    const x = p.dot(right), y = p.dot(up)
    x0 = Math.min(x0, x); x1 = Math.max(x1, x)
    y0 = Math.min(y0, y); y1 = Math.max(y1, y)
    depth += p.dot(dir)
  }
  const zoom = Math.min(Math.max(80, size.width - inset.left - inset.right) / ((x1 - x0) * margin), Math.max(80, size.height - inset.top - inset.bottom) / ((y1 - y0) * margin))
  out.target.copy(right).multiplyScalar((x0 + x1) / 2 + (inset.right - inset.left) / 2 / zoom)
  out.target.addScaledVector(up, (y0 + y1) / 2 + (inset.bottom - inset.top) / 2 / zoom)
  out.target.addScaledVector(dir, depth / points.length)
  out.zoom = zoom
  out.az = az
  out.polar = polar
  return out
}
const v = (x: number, y: number, z: number) => new Vector3(x, y, z)
const box = (x0: number, z0: number, x1: number, z1: number) => [v(x0, 0, z0), v(x1, 0, z0), v(x0, 0, z1), v(x1, 0, z1)]

const AZ = (22 * Math.PI) / 180
const POLAR = (40 * Math.PI) / 180
/** Portrait screens run the line top to bottom: tray, belt, gantry, board. Flatter, so tray pockets stay square enough to tap. */
const PORTRAIT = { az: Math.PI / 2, polar: (26 * Math.PI) / 180 }
const TOP = 60
const deg = (d: number) => (d * Math.PI) / 180

function take(shot: Shot, target: Vector3, zoom: number, polar: number, az: number) {
  shot.target.copy(target)
  shot.zoom = zoom
  shot.polar = polar
  shot.az = az
}
/** A push-in on one seated chip, or straight down onto its die. */
function chipShot(shot: Shot, p: Part, die: boolean, size: { width: number; height: number }, base: { az: number; polar: number }) {
  const r = Math.max(p.spec.fw, p.spec.fd) * (p.slot?.s ?? 1)
  take(shot, p.pos, Math.min(size.width, size.height) / (r * (die ? 1.25 : 3.6)), die ? 0.001 : Math.min(deg(52), base.polar + deg(8)), die ? 0 : base.az + 0.25)
  shot.target.y += chipTop(p.spec) * p.scale
}
function latestSeated(sim: Sim) {
  if (sim.lastSeat?.mode === 'seated' && sim.lastSeat.item.kind === 'block') return sim.lastSeat
  let last: Part | null = null
  for (const p of sim.parts.values()) if (p.mode === 'seated' && p.item.kind === 'block') last = p
  return last
}

function CameraRig({ sim, cam, director, reduced }: { sim: Sim; cam: Cam; director: Director; reduced: boolean }) {
  const controls = useRef<CameraControls>(null)
  const { size, gl } = useThree()
  const detached = useMemo(() => document.createElement('div'), [])
  const portrait = size.height > size.width * 1.15
  const base = portrait ? PORTRAIT : { az: AZ, polar: POLAR }
  const tray = sim.tray.box
  const inset = useMemo(() => ({ ...cam.inset, top: TOP }), [cam.inset.left, cam.inset.right, cam.inset.bottom])
  const overview = useMemo(() => {
    const pts = [...box(tray.x0 - 0.3, tray.z0 - 0.3, tray.x1 + 0.2, tray.z1 + 0.3), ...box(BELT.x0, BELT.z - 0.7, BELT.x1, BELT.z + 0.7), ...box(BOARD.x0, BOARD.z0, BOARD.x1, BOARD.z1)]
    if (!portrait) pts.push(v(HEADER.x + 0.4, 0.5, BOARD.z1 + 2.5), v(RAIL.x0 + 1, RAIL.top + 0.6, RAIL.back))
    return fit(pts, base.az, base.polar, size, inset, portrait ? 1.04 : 1.03, newShot())
  }, [size, inset, tray, portrait, base.az, base.polar])
  const state = useMemo(() => ({ shot: newShot(), applied: newShot(), zoomEnd: 0, dirty: true, area: newShot(), areaOf: null as Cam['area'] }), [])
  const pt = useMemo(() => new Vector3(), [])

  useEffect(() => {
    const c = controls.current
    if (!c) return
    const hold = () => {
      cam.holdUntil = performance.now() + 6000
      state.dirty = true
      if (!state.zoomEnd) state.zoomEnd = c.camera.zoom
    }
    cam.orbit = (dx, dy) => {
      hold()
      void c.rotate(-dx * 0.006, -dy * 0.005, true)
    }
    cam.pan = (dx, dy) => {
      hold()
      void c.truck(-dx / c.camera.zoom, -dy / c.camera.zoom, false)
    }
    cam.zoomAt = (factor, x, y) => {
      hold()
      const rect = gl.domElement.getBoundingClientRect()
      const z0 = state.zoomEnd || c.camera.zoom
      const z1 = Math.min(4000, Math.max(8, z0 * factor))
      const k = 1 / z0 - 1 / z1
      state.zoomEnd = z1
      void c.zoomTo(z1, !reduced)
      void c.truck((x - rect.left - rect.width / 2) * k, (y - rect.top - rect.height / 2) * k, !reduced)
    }
    cam.reset = () => {
      cam.holdUntil = 0
      cam.focusRef = null
      cam.area = null
      state.dirty = true
    }
    const o = overview
    pt.copy(o.target).add(F.dir.set(Math.sin(o.polar) * Math.sin(o.az), Math.cos(o.polar), Math.sin(o.polar) * Math.cos(o.az)).multiplyScalar(80))
    void c.setLookAt(pt.x, pt.y, pt.z, o.target.x, o.target.y, o.target.z, false)
    void c.zoomTo(o.zoom, false)
    state.zoomEnd = o.zoom
  }, [controls, gl, cam, state, reduced])

  const follow = director.follow && !reduced
  useFrame(({ clock }) => {
    const c = controls.current
    if (!c) return
    cam.moving = c.active
    if (sim.lastAddedAt !== cam.seenAdd) {
      cam.seenAdd = sim.lastAddedAt
      if (follow) { cam.holdUntil = 0; cam.focusRef = null; state.dirty = true }
    }
    const shot = state.shot
    let decap: string | null = null
    let mode = portrait ? 'OVERVIEW · PORTRAIT' : 'OVERVIEW'
    const trav = follow ? travelling(sim) : null
    const focus = cam.focusRef ? sim.parts.get(cam.focusRef) : undefined
    if (trav) {
      take(shot, trav.pos, overview.zoom * (inFlight(sim) > 2 ? 1.7 : 2.8), Math.min(deg(50), base.polar + deg(6)), base.az + 0.2)
      mode = 'FOLLOW'
    } else if (follow && sim.lastSeat && sim.time - sim.lastSeatAt < 1.4 && sim.lastSeat.mode === 'seated' && !focus && inFlight(sim) === 0) {
      chipShot(shot, sim.lastSeat, false, size, base)
      shot.zoom = overview.zoom * 2.6
      mode = 'SEATED'
    } else if (focus && focus.mode === 'seated') {
      chipShot(shot, focus, cam.decap, size, base)
      if (cam.decap) decap = focus.item.ref
      mode = cam.decap ? 'DIE' : 'CHIP'
    } else if (cam.area && performance.now() < cam.area.until) {
      if (state.areaOf !== cam.area) {
        state.areaOf = cam.area
        const [x0, z0, x1, z1] = cam.area.box
        fit(box(x0, z0, x1, z1), base.az, base.polar, size, inset, 1.08, state.area)
      }
      take(shot, state.area.target, state.area.zoom, base.polar, base.az)
      mode = 'AREA'
    } else if (director.camera === 'macro') {
      const p = sim.lastSeat?.mode === 'seated' ? sim.lastSeat : latestSeated(sim)
      const wobble = reduced ? 0 : 1
      take(shot, p ? p.pos : CPU, overview.zoom * 3.4, base.polar + deg(12 + Math.sin(clock.elapsedTime * 0.2) * 8 * wobble), base.az + Math.sin(clock.elapsedTime * 0.13) * 0.7 * wobble)
      mode = 'MACRO'
    } else if (director.camera === 'die') {
      const p = latestSeated(sim)
      if (p) {
        chipShot(shot, p, true, size, base)
        decap = p.item.ref
      } else take(shot, pt.copy(CPU).setY(BY + 0.4), Math.min(size.width, size.height) / 4.2, 0.001, 0)
      mode = 'DIE CAM'
    } else take(shot, overview.target, overview.zoom, overview.polar, overview.az)
    cam.decapRef = decap
    if (performance.now() < cam.holdUntil) {
      cam.mode = 'MANUAL'
      return
    }
    cam.mode = mode
    const a = state.applied
    const same = a.target.distanceToSquared(shot.target) < 1e-6 && Math.abs(a.zoom - shot.zoom) < a.zoom * 1e-4 && Math.abs(a.polar - shot.polar) < 1e-5 && Math.abs(a.az - shot.az) < 1e-5
    if (same && !state.dirty) return
    state.dirty = false
    a.target.copy(shot.target)
    a.zoom = shot.zoom
    a.polar = shot.polar
    a.az = shot.az
    state.zoomEnd = shot.zoom
    pt.copy(shot.target).add(F.dir.set(Math.sin(shot.polar) * Math.sin(shot.az), Math.cos(shot.polar), Math.sin(shot.polar) * Math.cos(shot.az)).multiplyScalar(80))
    void c.setLookAt(pt.x, pt.y, pt.z, shot.target.x, shot.target.y, shot.target.z, !reduced)
    void c.zoomTo(shot.zoom, !reduced)
  })
  return <CameraControls ref={controls} makeDefault domElement={detached} smoothTime={reduced ? 0.12 : 0.55} draggingSmoothTime={0.12} minZoom={8} maxZoom={4000} maxPolarAngle={1.3} />
}

export function Scene({ lab, sim, cam, director, tip, codeOf, onFocus, overlay, reduced, focusRef, guard, touch }: {
  lab: Lab; sim: Sim; cam: Cam; director: Director; tip: Tip; codeOf: (ref: string) => string; onFocus: (ref: string) => void; overlay: TrayOverlay; reduced: boolean; focusRef: string | null; guard: Guard; touch: boolean
}) {
  const c = palette(lab.theme, director.finish)
  const [version, setVersion] = useState(sim.version)
  useFrame(() => { if (sim.version !== version) setVersion(sim.version) })
  const [warm, setWarm] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => setWarm(true))
    return () => cancelAnimationFrame(id)
  }, [])
  useEffect(() => () => { dropChipGeometry(); dropDies() }, [])
  const parts = useMemo(() => [...sim.parts.values()], [version, sim])
  const activeBand = lab.focus.category.startsWith('block:') ? BANDS.findIndex((b) => b.groups.includes(lab.focus.category.slice(6))) : -1
  const cycle = {
    framework: () => lab.set('framework', lab.setup.framework === 'next' ? 'tanstack' : 'next'),
    database: () => lab.set('database', lab.setup.database === 'postgres' ? 'mongodb' : 'postgres'),
    pm: () => lab.set('packageManager', lab.setup.packageManager === 'pnpm' ? 'npm' : lab.setup.packageManager === 'npm' ? 'bun' : 'pnpm'),
    agent: () => lab.set('agent', lab.setup.agent === 'none' ? 'claude' : lab.setup.agent === 'claude' ? 'codex' : 'none'),
  }
  const socket = { c, tip, sim, guard, reduced }
  return (
    <>
      <color attach="background" args={[c.bg]} />
      <CameraRig sim={sim} cam={cam} director={director} reduced={reduced} />
      <ambientLight intensity={lab.theme === 'dark' ? 0.9 : 1.5} />
      <directionalLight position={[6, 14, 8]} intensity={lab.theme === 'dark' ? 1.0 : 1.4} />
      <hemisphereLight args={[c.surface, c.bg, 0.5]} />
      <Board lab={lab} sim={sim} c={c} director={director} activeBand={activeBand === -1 && lab.focus.category.startsWith('block:') ? BANDS.length - 1 : activeBand} version={version} />
      <Cpu key={lab.setup.framework} framework={lab.setup.framework} onClick={() => { play('swap'); cycle.framework() }} {...socket} />
      <Memory key={lab.setup.database} database={lab.setup.database} onClick={() => { play('swap'); cycle.database() }} {...socket} />
      <Power key={lab.setup.packageManager} pm={lab.setup.packageManager} onClick={() => { play('swap'); cycle.pm() }} {...socket} />
      <Probe key={lab.setup.agent} agent={lab.setup.agent} onClick={() => { play('swap'); cycle.agent() }} {...socket} />
      {warm && <Ghosts key={lab.setup.target} sim={sim} c={c} version={version} reduced={reduced} />}
      <Routes sim={sim} c={c} version={version} style={director.routing} reduced={reduced} />
      <Pulses sim={sim} c={c} director={director} framework={lab.setup.framework} version={version} reduced={reduced} />
      <AgentFlash sim={sim} agent={lab.setup.agent} />
      <Footprints sim={sim} reduced={reduced} />
      <Tray sim={sim} lab={lab} c={c} tip={tip} cam={cam} codeOf={codeOf} overlay={overlay} guard={guard} touch={touch} />
      <Belt c={c} sim={sim} reduced={reduced} />
      <Gantry sim={sim} c={c} />
      {warm && parts.map((p) => <PartView key={p.item.ref} p={p} lab={lab} c={c} tip={tip} cam={cam} onFocus={onFocus} codeOf={codeOf} focused={focusRef === p.item.ref} sim={sim} guard={guard} />)}
      <ContactShadows frames={1} position={[-3, 0.001, 0]} scale={[40, 26]} resolution={512} blur={2.6} far={4} opacity={lab.theme === 'dark' ? 0.55 : 0.25} color="#000" />
    </>
  )
}
