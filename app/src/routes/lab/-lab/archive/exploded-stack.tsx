import { ContactShadows, useTexture } from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import type { ThreeEvent } from '@react-three/fiber'
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'

import type { CatalogItem, Setup } from '../../../workspace/-workspace/workspace.types'
import type { Lab, MockProps } from '../lab.types'

type LayerId = 'framework' | 'database' | 'packageManager' | 'feature' | 'component' | 'block'
type LayerSpec = { id: LayerId; title: string; w: number; d: number; h: number; r: number }

const layers: readonly LayerSpec[] = [
  { id: 'framework', title: 'Framework', w: 4.8, d: 4.8, h: 0.34, r: 0.5 },
  { id: 'database', title: 'Database', w: 4.2, d: 4.2, h: 0.24, r: 0.42 },
  { id: 'packageManager', title: 'Package manager', w: 4.2, d: 1.5, h: 0.18, r: 0.3 },
  { id: 'feature', title: 'Features', w: 2.6, d: 2.6, h: 0.18, r: 0.34 },
  { id: 'component', title: 'Components', w: 3.4, d: 3.4, h: 0.18, r: 0.38 },
  { id: 'block', title: 'Blocks', w: 4.8, d: 4.8, h: 0.2, r: 0.5 },
]
const itemLayers: Partial<Record<CatalogItem['kind'], number>> = { feature: 3, component: 4, block: 5 }
const setupLayers: Partial<Record<LayerId, readonly [keyof Setup, readonly { value: string; label: string; glyph: Glyph }[]]>> = {
  framework: ['framework', [
    { value: 'next', label: 'Next.js', glyph: 'next' },
    { value: 'tanstack', label: 'TanStack Start', glyph: 'tanstack' },
  ]],
  database: ['database', [
    { value: 'postgres', label: 'PostgreSQL', glyph: 'postgres' },
    { value: 'mongodb', label: 'MongoDB', glyph: 'mongo' },
  ]],
  packageManager: ['packageManager', [
    { value: 'pnpm', label: 'pnpm', glyph: 'pnpm' },
    { value: 'npm', label: 'npm', glyph: 'npm' },
    { value: 'bun', label: 'Bun', glyph: 'bun' },
  ]],
}
const agents = [
  { value: 'none', label: 'No agent', color: '' },
  { value: 'claude', label: 'Claude Code', color: '#E07A55' },
  { value: 'codex', label: 'Codex', color: '#6FA8FF' },
] as const

const TILE_H = 0.14
const GAP_CLOSED = 0.3
const GAP_OPEN = [0, 1.0, 0.95, 1.2, 1.4, 1.9]
const PEEL = 1.7
const AGENT_CLOSED = 0.75
const AGENT_OPEN = 1.3
const RING = 2.05
const RIGHT = new THREE.Vector3(1, 0, -1).normalize()
const VIEW = new THREE.Vector3(1, 0.86, 1).normalize()

type Palette = { line: string; fillTop: string; fillSide: string; fg: string; muted: string; accent: string; engrave: string }
const palettes: Record<Lab['theme'], Palette> = {
  light: { line: '#9EA8AE', fillTop: '#FFFFFF', fillSide: '#E3E8EB', fg: '#1D2225', muted: '#727C81', accent: '#5A91AD', engrave: '#8E989D' },
  dark: { line: '#465055', fillTop: '#151B1E', fillSide: '#0C1013', fg: '#FCFCFC', muted: '#8A9094', accent: '#6FA9C6', engrave: '#5C666B' },
}

type Spring = { x: number; v: number }
type Runtime = {
  hover: boolean
  wheel: number
  pinned: boolean
  breatheUntil: number
  breatheLayer: number | null
  gaps: Spring[]
  dips: Spring[]
  spins: (Spring & { target: number })[]
  agentGap: Spring
  top: number
  labels: (HTMLDivElement | null)[]
  lines: (HTMLSpanElement | null)[]
  texts: (HTMLButtonElement | null)[]
  tip: HTMLDivElement | null
  tipAnchor: THREE.Object3D | null
}

function step(s: Spring, target: number, k: number, c: number, dt: number) {
  s.v += (k * (target - s.x) - c * s.v) * dt
  s.x += s.v * dt
}

function roundedShape(w: number, d: number, r: number) {
  const s = new THREE.Shape()
  const x = -w / 2
  const y = -d / 2
  s.moveTo(x + r, y)
  s.lineTo(x + w - r, y)
  s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false)
  s.lineTo(x + w, y + d - r)
  s.absarc(x + w - r, y + d - r, r, 0, Math.PI / 2, false)
  s.lineTo(x + r, y + d)
  s.absarc(x + r, y + d - r, r, Math.PI / 2, Math.PI, false)
  s.lineTo(x, y + r)
  s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false)
  return s
}

function slabGeometry(w: number, d: number, h: number, r: number) {
  const geometry = new THREE.ExtrudeGeometry(roundedShape(w, d, r), { depth: h, bevelEnabled: false, curveSegments: 10 })
  geometry.rotateX(-Math.PI / 2)
  const edges = new THREE.EdgesGeometry(geometry, 25)
  const points = Array.from(edges.attributes.position.array as Float32Array)
  const s = Math.SQRT1_2
  for (const [cx, cz, dx, dz] of [
    [-w / 2 + r, d / 2 - r, -s, s],
    [w / 2 - r, -d / 2 + r, s, -s],
    [w / 2 - r, d / 2 - r, s, s],
  ])
    points.push(cx + dx * r, 0, cz + dz * r, cx + dx * r, h, cz + dz * r)
  const outline = new THREE.BufferGeometry()
  outline.setAttribute('position', new THREE.Float32BufferAttribute(points, 3))
  return { geometry, outline }
}

const tile = slabGeometry(1, 1, TILE_H, 0.14)

type Glyph = 'next' | 'tanstack' | 'postgres' | 'mongo' | 'pnpm' | 'npm' | 'bun' | 'slots'

function drawGlyph(ctx: CanvasRenderingContext2D, glyph: Glyph, cx: number, cy: number, s: number) {
  ctx.beginPath()
  if (glyph === 'next') {
    ctx.arc(cx, cy, s, 0, Math.PI * 2)
    ctx.moveTo(cx - s * 0.4, cy + s * 0.45)
    ctx.lineTo(cx - s * 0.4, cy - s * 0.45)
    ctx.lineTo(cx + s * 0.55, cy + s * 0.75)
    ctx.moveTo(cx + s * 0.38, cy - s * 0.45)
    ctx.lineTo(cx + s * 0.38, cy + s * 0.1)
  } else if (glyph === 'tanstack') {
    ctx.arc(cx, cy, s, 0, Math.PI * 2)
    ctx.moveTo(cx, cy + s * 0.75)
    ctx.quadraticCurveTo(cx + s * 0.1, cy, cx - s * 0.05, cy - s * 0.3)
    for (const a of [-2.6, -1.9, -1.2, -0.5]) {
      ctx.moveTo(cx - s * 0.05, cy - s * 0.3)
      ctx.quadraticCurveTo(cx + Math.cos(a) * s * 0.4, cy + Math.sin(a) * s * 0.55 - s * 0.2, cx + Math.cos(a) * s * 0.7, cy + Math.sin(a) * s * 0.35 - s * 0.05)
    }
  } else if (glyph === 'postgres') {
    ctx.ellipse(cx, cy - s * 0.6, s * 0.75, s * 0.25, 0, 0, Math.PI * 2)
    ctx.moveTo(cx - s * 0.75, cy - s * 0.6)
    ctx.lineTo(cx - s * 0.75, cy + s * 0.6)
    ctx.ellipse(cx, cy + s * 0.6, s * 0.75, s * 0.25, 0, Math.PI, 0, true)
    ctx.lineTo(cx + s * 0.75, cy - s * 0.6)
    ctx.moveTo(cx + s * 0.75, cy)
    ctx.ellipse(cx, cy, s * 0.75, s * 0.25, 0, 0, Math.PI, false)
  } else if (glyph === 'mongo') {
    ctx.moveTo(cx, cy - s)
    ctx.bezierCurveTo(cx + s * 0.9, cy - s * 0.2, cx + s * 0.4, cy + s * 0.6, cx, cy + s * 0.75)
    ctx.bezierCurveTo(cx - s * 0.4, cy + s * 0.6, cx - s * 0.9, cy - s * 0.2, cx, cy - s)
    ctx.moveTo(cx, cy - s * 0.6)
    ctx.lineTo(cx, cy + s)
  } else if (glyph === 'pnpm') {
    const g = s * 0.55
    for (const [i, j] of [[0, 0], [1, 0], [2, 0], [2, 1], [0, 2], [1, 2], [2, 2], [1, 1]])
      ctx.rect(cx - s + i * g * 1.25, cy - s + j * g * 1.25, g, g)
  } else if (glyph === 'npm') {
    ctx.rect(cx - s * 1.2, cy - s * 0.4, s * 2.4, s * 0.8)
    ctx.moveTo(cx - s * 0.4, cy - s * 0.4)
    ctx.lineTo(cx - s * 0.4, cy + s * 0.4)
    ctx.moveTo(cx + s * 0.4, cy - s * 0.4)
    ctx.lineTo(cx + s * 0.4, cy + s * 0.4)
  } else if (glyph === 'bun') {
    ctx.ellipse(cx, cy + s * 0.1, s, s * 0.75, 0, 0, Math.PI * 2)
    ctx.moveTo(cx - s * 0.3, cy + s * 0.1)
    ctx.arc(cx - s * 0.35, cy + s * 0.1, s * 0.06, 0, Math.PI * 2)
    ctx.moveTo(cx + s * 0.41, cy + s * 0.1)
    ctx.arc(cx + s * 0.35, cy + s * 0.1, s * 0.06, 0, Math.PI * 2)
    ctx.moveTo(cx - s * 0.12, cy + s * 0.3)
    ctx.quadraticCurveTo(cx, cy + s * 0.45, cx + s * 0.12, cy + s * 0.3)
  }
  ctx.stroke()
}

function engraving(spec: LayerSpec, palette: Palette, title: string, caption: string, glyph: Glyph) {
  const px = 1024
  const canvas = document.createElement('canvas')
  canvas.width = px
  canvas.height = Math.round((px * spec.d) / spec.w)
  const ctx = canvas.getContext('2d')!
  const u = px / spec.w
  ctx.strokeStyle = palette.engrave
  ctx.fillStyle = palette.engrave
  ctx.lineWidth = 3
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  const inset = 0.16 * u
  ctx.setLineDash([10, 12])
  ctx.beginPath()
  ctx.roundRect(inset, inset, canvas.width - inset * 2, canvas.height - inset * 2, (spec.r - 0.16) * u)
  ctx.stroke()
  ctx.setLineDash([])
  const mono = 'ui-monospace, SFMono-Regular, Menlo, monospace'
  const sans = '"Timeless Grotesk", ui-sans-serif, system-ui, sans-serif'
  if (glyph === 'slots') {
    ctx.font = `600 ${0.36 * u}px ${sans}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(title, canvas.width / 2, canvas.height / 2 - 0.1 * u)
    ctx.font = `400 ${0.14 * u}px ${mono}`
    ctx.fillText(caption.toUpperCase(), canvas.width / 2, canvas.height / 2 + 0.3 * u)
  } else if (spec.id === 'framework') {
    ctx.lineWidth = 5
    drawGlyph(ctx, glyph, canvas.width - 0.75 * u, canvas.height - 0.62 * u, 0.3 * u)
    ctx.textBaseline = 'middle'
    ctx.font = `600 ${0.4 * u}px ${sans}`
    ctx.fillText(title, 0.55 * u, canvas.height - 0.6 * u)
    ctx.font = `400 ${0.12 * u}px ${mono}`
    ctx.fillText(caption.toUpperCase(), 0.58 * u, canvas.height - 1.0 * u)
  } else if (spec.d < 2) {
    ctx.lineWidth = 5
    drawGlyph(ctx, glyph, 0.75 * u, canvas.height / 2, 0.3 * u)
    ctx.textBaseline = 'middle'
    ctx.font = `600 ${0.44 * u}px ${sans}`
    ctx.fillText(title, 1.4 * u, canvas.height / 2 + 0.02 * u)
    ctx.font = `400 ${0.12 * u}px ${mono}`
    ctx.textAlign = 'right'
    ctx.fillText(caption.toUpperCase(), canvas.width - 0.4 * u, canvas.height / 2)
  } else {
    ctx.lineWidth = 6
    drawGlyph(ctx, glyph, canvas.width / 2, canvas.height / 2 - 0.35 * u, 0.62 * u)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = `600 ${0.42 * u}px ${sans}`
    ctx.fillText(title, canvas.width / 2, canvas.height / 2 + 0.72 * u)
    ctx.font = `400 ${0.13 * u}px ${mono}`
    ctx.fillText(caption.toUpperCase(), canvas.width / 2, canvas.height / 2 + 1.2 * u)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 8
  return texture
}

function layout(spec: LayerSpec, count: number) {
  const pad = 0.42
  const cols = Math.max(1, Math.ceil(Math.sqrt(count)))
  const rows = Math.max(1, Math.ceil(count / cols))
  const cell = Math.min(1.15, (spec.w - pad * 2) / cols, (spec.d - pad * 2) / rows)
  return (index: number) => ({
    x: ((index % cols) - (cols - 1) / 2) * cell,
    z: (Math.floor(index / cols) - (rows - 1) / 2) * cell,
    size: cell * 0.82,
  })
}

function tint(hue: number, theme: Lab['theme']) {
  return theme === 'dark'
    ? [new THREE.Color(`hsl(${hue}, 38%, 46%)`), new THREE.Color(`hsl(${hue}, 34%, 30%)`)]
    : [new THREE.Color(`hsl(${hue}, 48%, 66%)`), new THREE.Color(`hsl(${hue}, 40%, 52%)`)]
}

type TileProps = {
  item: CatalogItem
  x: number
  z: number
  size: number
  leaving: boolean
  hot: boolean
  palette: Palette
  theme: Lab['theme']
  rt: React.RefObject<Runtime>
  onLand: () => void
  onClick: () => void
  onHover: (item: CatalogItem | null) => void
}

function Tile({ item, x, z, size, leaving, hot, palette, theme, rt, onLand, onClick, onHover }: TileProps) {
  const group = useRef<THREE.Group>(null)
  const body = useRef<THREE.Group>(null)
  const ripple = useRef<THREE.Mesh>(null)
  const ripple2 = useRef<THREE.Mesh>(null)
  const dust = useRef<THREE.Points>(null)
  const state = useRef({
    y: { x: 3.4 + Math.random() * 1.8, v: -3 },
    px: { x, v: 0 },
    pz: { x: z, v: 0 },
    s: { x: size * 0.6, v: 0 },
    tilt: { x: (Math.random() - 0.5) * 1.6, v: 0 },
    landed: -1,
  })
  const [hovered, setHovered] = useState(false)
  const colors = useMemo(() => tint(item.hue, theme), [item.hue, theme])
  const image = theme === 'dark' ? (item.imageDark ?? item.image) : item.image
  const dustGeometry = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(12 * 3), 3))
    return g
  }, [])
  const dustDirs = useMemo(() => Array.from({ length: 12 }, (_, i) => (i / 12) * Math.PI * 2 + Math.random() * 0.4), [])

  useFrame((frame, delta) => {
    const dt = Math.min(delta, 1 / 30)
    const s = state.current
    if (leaving) s.y.v += dt * 9
    step(s.y, leaving ? 4 : 0, leaving ? 30 : 210, leaving ? 4 : 15, dt)
    step(s.px, x, 120, 18, dt)
    step(s.pz, z, 120, 18, dt)
    step(s.s, leaving ? 0 : hovered ? size * 1.1 : size, leaving ? 60 : 260, leaving ? 10 : 16, dt)
    step(s.tilt, leaving ? 2.4 : 0, 90, 9, dt)
    if (!leaving && s.landed < 0 && s.y.x <= 0.01 && s.y.v < 0) {
      s.landed = frame.clock.elapsedTime
      s.s.v -= size * 7
      onLand()
    }
    const g = group.current!
    g.position.set(s.px.x, Math.max(0, s.y.x), s.pz.x)
    const sx = Math.max(0.001, s.s.x)
    body.current!.scale.set(sx, Math.max(0.001, s.s.x / size), sx)
    body.current!.rotation.set(s.tilt.x * 0.4, s.tilt.x, 0)
    const t = s.landed < 0 ? -1 : frame.clock.elapsedTime - s.landed
    for (const [mesh, lag] of [[ripple.current, 0], [ripple2.current, 0.14]] as const) {
      const p = t < lag ? -1 : (t - lag) / 0.65
      mesh!.visible = p >= 0 && p < 1
      if (mesh!.visible) {
        const e = 1 - (1 - p) ** 3
        mesh!.scale.setScalar(size * (0.75 + e * 1.3))
        ;(mesh!.material as THREE.MeshBasicMaterial).opacity = (1 - p) * 0.9
      }
    }
    const p = t < 0 ? -1 : t / 0.75
    dust.current!.visible = p >= 0 && p < 1
    if (dust.current!.visible) {
      const e = 1 - (1 - p) ** 2
      const pos = dustGeometry.attributes.position as THREE.BufferAttribute
      dustDirs.forEach((a, i) => {
        const r = size * (0.6 + e * (0.7 + (i % 3) * 0.3))
        pos.setXYZ(i, Math.cos(a) * r, 0.04 + Math.sin(p * Math.PI) * (0.16 + (i % 2) * 0.14), Math.sin(a) * r)
      })
      pos.needsUpdate = true
      ;(dust.current!.material as THREE.PointsMaterial).opacity = 1 - p
    }
  })

  const stroke = hot || hovered ? palette.accent : palette.line
  return (
    <group ref={group}>
      <group
        ref={body}
        onPointerOver={(e) => {
          e.stopPropagation()
          setHovered(true)
          rt.current.tipAnchor = group.current
          onHover(item)
          document.body.style.cursor = 'pointer'
        }}
        onPointerOut={() => {
          setHovered(false)
          if (rt.current.tipAnchor === group.current) onHover(null)
          document.body.style.cursor = ''
        }}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation()
          if (leaving) return
          if (rt.current.tipAnchor === group.current) onHover(null)
          document.body.style.cursor = ''
          onClick()
        }}
      >
        <mesh geometry={tile.geometry}>
          <meshBasicMaterial attach="material-0" color={colors[0]} toneMapped={false} />
          <meshBasicMaterial attach="material-1" color={colors[1]} toneMapped={false} />
        </mesh>
        <lineSegments geometry={tile.outline}>
          <lineBasicMaterial color={stroke} />
        </lineSegments>
        {image ? (
          <Suspense fallback={null}>
            <TileFace url={image} />
          </Suspense>
        ) : null}
      </group>
      <mesh ref={ripple} rotation-x={-Math.PI / 2} position-y={0.01} visible={false}>
        <ringGeometry args={[0.52, 0.56, 48]} />
        <meshBasicMaterial color={colors[1]} transparent depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh ref={ripple2} rotation-x={-Math.PI / 2} position-y={0.01} visible={false}>
        <ringGeometry args={[0.535, 0.55, 48]} />
        <meshBasicMaterial color={palette.line} transparent depthWrite={false} toneMapped={false} />
      </mesh>
      <points ref={dust} geometry={dustGeometry} visible={false}>
        <pointsMaterial color={palette.muted} size={3} sizeAttenuation={false} transparent depthWrite={false} />
      </points>
    </group>
  )
}

function TileFace({ url }: { url: string }) {
  const texture = useTexture(url)
  const cropped = useMemo(() => {
    const t = texture.clone()
    const image = t.image as { width: number; height: number }
    t.colorSpace = THREE.SRGBColorSpace
    t.repeat.set(1, Math.min(1, image.width / image.height))
    t.offset.set(0, 1 - t.repeat.y)
    t.needsUpdate = true
    return t
  }, [texture])
  return (
    <mesh rotation-x={-Math.PI / 2} position-y={TILE_H + 0.002} scale={0.84}>
      <planeGeometry />
      <meshBasicMaterial map={cropped} toneMapped={false} />
    </mesh>
  )
}

function LayerTiles({ spec, items, index, rt, palette, theme, focus, onToggle, onHover }: {
  spec: LayerSpec
  items: CatalogItem[]
  index: number
  rt: React.RefObject<Runtime>
  palette: Palette
  theme: Lab['theme']
  focus: string | null
  onToggle: (ref: string) => void
  onHover: (item: CatalogItem | null) => void
}) {
  type Placed = { item: CatalogItem; x: number; z: number; size: number }
  const place = layout(spec, items.length)
  const last = useRef(new Map<string, Placed>())
  const [ghosts, setGhosts] = useState<Placed[]>([])
  const refs = items.map((item) => item.ref).join('|')
  useEffect(() => {
    const live = new Set(items.map((item) => item.ref))
    const gone = [...last.current.values()].filter((entry) => !live.has(entry.item.ref))
    const next = new Map<string, Placed>()
    items.forEach((item, i) => next.set(item.ref, { item, ...place(i) }))
    last.current = next
    if (!gone.length) return
    setGhosts((current) => [...current, ...gone])
    setTimeout(() => setGhosts((current) => current.filter((ghost) => !gone.includes(ghost))), 900)
  }, [refs])
  const land = () => {
    rt.current.dips[index].v -= 1.4
  }
  return (
    <group position-y={spec.h}>
      {items.map((item, i) => (
        <Tile
          key={item.ref}
          item={item}
          {...place(i)}
          leaving={false}
          hot={focus === item.ref}
          palette={palette}
          theme={theme}
          rt={rt}
          onLand={land}
          onClick={() => onToggle(item.ref)}
          onHover={onHover}
        />
      ))}
      {ghosts
        .filter((ghost) => !items.includes(ghost.item))
        .map((ghost) => (
          <Tile
            key={`ghost:${ghost.item.ref}`}
            item={ghost.item}
            x={ghost.x}
            z={ghost.z}
            size={ghost.size}
            leaving
            hot={false}
            palette={palette}
            theme={theme}
            rt={rt}
            onLand={land}
            onClick={() => {}}
            onHover={() => {}}
          />
        ))}
    </group>
  )
}

function fitZoom(width: number, height: number, top: number, phone: boolean) {
  const extent = top * 0.854 + 3.6 + 0.7
  if (phone) {
    const avail = height * 0.6 - 150
    return Math.min(avail / extent, (width - 32) / 7, avail / 6)
  }
  const avail = height - 64 - 110
  return Math.min(avail / extent, (width - 316 - 240) / 7, avail / 7.6)
}

function Scene({ lab, rt, byLayer, focus, hoverLayer, setHoverLayer, palette, fontsReady, phone, onCycle, onTip }: {
  lab: Lab
  rt: React.RefObject<Runtime>
  byLayer: CatalogItem[][]
  focus: string | null
  hoverLayer: number | null
  setHoverLayer: (index: number | null) => void
  palette: Palette
  fontsReady: boolean
  phone: boolean
  onCycle: (index: number) => void
  onTip: (item: CatalogItem | null) => void
}) {
  const groups = useRef<(THREE.Group | null)[]>([])
  const spins = useRef<(THREE.Group | null)[]>([])
  const anchors = useRef<(THREE.Object3D | null)[]>([])
  const agentGroup = useRef<THREE.Group>(null)
  const agentRing = useRef<THREE.Group>(null)
  const look = useRef(new THREE.Vector3(0, 1.5, 0))
  const zoom = useRef(0)
  const focusItem = focus ? lab.catalog.items.find((item) => item.ref === focus) : undefined
  const focusLayer = focusItem ? itemLayers[focusItem.kind] : undefined
  const slabs = useMemo(() => layers.map((spec) => slabGeometry(spec.w, spec.d, spec.h, spec.r)), [])
  const agent = agents[Math.max(0, agents.findIndex((option) => option.value === lab.setup.agent))]

  useFrame(({ camera, size }, delta) => {
    const dt = Math.min(delta, 1 / 30)
    const r = rt.current
    const breathing = performance.now() < r.breatheUntil
    const e = Math.max(r.hover || r.pinned ? 1 : 0, r.wheel, breathing ? 0.35 : 0)
    const peel = focusLayer ?? (hoverLayer !== null && hoverLayer >= 3 ? hoverLayer : null) ?? (breathing ? r.breatheLayer : null) ?? -1
    const gapTarget = (i: number) => GAP_CLOSED + (GAP_OPEN[i] - GAP_CLOSED) * e + (i === peel + 1 ? PEEL : 0)
    const agentTarget = AGENT_CLOSED + (AGENT_OPEN - AGENT_CLOSED) * e + (peel === 5 ? PEEL * 0.6 : 0)
    let y = 0
    let settled = 0
    layers.forEach((_, i) => {
      const k = 150 - i * 17
      if (i > 0) {
        step(r.gaps[i], gapTarget(i), k, 2 * Math.sqrt(k) * 0.36, dt)
        r.gaps[i].x = Math.max(0.04, r.gaps[i].x)
        y += layers[i - 1].h + r.gaps[i].x
        settled += layers[i - 1].h + gapTarget(i)
      }
      step(r.dips[i], 0, 320, 13, dt)
      step(r.spins[i], r.spins[i].target, 70, 11, dt)
      const g = groups.current[i]
      if (g) g.position.y = y + r.dips[i].x
      const s = spins.current[i]
      if (s) s.rotation.y = r.spins[i].x
    })
    step(r.agentGap, agentTarget, 60, 6, dt)
    const top = y + layers[5].h + r.agentGap.x
    r.top = top
    settled += layers[5].h + agentTarget
    if (agentGroup.current) agentGroup.current.position.y = top + Math.sin(performance.now() / 600) * 0.05
    if (agentRing.current) agentRing.current.rotation.y += dt * 0.7

    const cam = camera as THREE.OrthographicCamera
    const target = fitZoom(size.width, size.height, Math.max(settled, 7.2), phone)
    zoom.current = zoom.current ? THREE.MathUtils.damp(zoom.current, target, 7, dt) : target
    cam.zoom = zoom.current
    const shiftX = phone ? 0 : 316 + (size.width - 316 - 240) / 2 - size.width / 2
    const shiftY = phone ? (150 + size.height * 0.6) / 2 - size.height / 2 : (64 + size.height - 110) / 2 - size.height / 2
    const center = new THREE.Vector3(0, top / 2, 0)
      .addScaledVector(RIGHT, -shiftX / zoom.current)
      .add(new THREE.Vector3(0, shiftY / zoom.current / 0.854, 0))
    look.current.lerp(center, 1 - Math.exp(-8 * dt))
    cam.position.copy(look.current).addScaledVector(VIEW, 40)
    cam.lookAt(look.current)
    cam.updateProjectionMatrix()

    const v = new THREE.Vector3()
    const points = anchors.current.map((anchor) => {
      if (!anchor) return null
      anchor.getWorldPosition(v)
      v.project(cam)
      return [((v.x + 1) / 2) * size.width, ((1 - v.y) / 2) * size.height] as const
    })
    const column = Math.max(...points.map((p) => (p ? p[0] : 0))) + 40
    let floor = Infinity
    points.forEach((p, i) => {
      const el = r.labels[i]
      const line = r.lines[i]
      const text = r.texts[i]
      if (!p || !el || !line || !text) return
      const y = Math.min(p[1], floor - 34)
      floor = y
      el.style.transform = `translate(${p[0]}px, ${p[1]}px)`
      line.style.width = `${column - p[0]}px`
      text.style.transform = `translateY(${y - p[1]}px)`
    })
    if (r.tip && r.tipAnchor) {
      r.tipAnchor.getWorldPosition(v)
      v.y += 0.5
      v.project(cam)
      r.tip.style.transform = `translate(${((v.x + 1) / 2) * size.width}px, ${((1 - v.y) / 2) * size.height}px)`
    }
  })

  return (
    <>
      {layers.map((spec, i) => {
        const value = setupValue(lab, spec.id)
        const items = byLayer[i]
        const hot = focusLayer === i || hoverLayer === i
        return (
          <group key={spec.id} ref={(g) => void (groups.current[i] = g)}>
            <group ref={(g) => void (spins.current[i] = g)}>
              <mesh
                geometry={slabs[i].geometry}
                onPointerOver={(e) => {
                  e.stopPropagation()
                  setHoverLayer(i)
                  if (value) document.body.style.cursor = 'pointer'
                }}
                onPointerOut={() => {
                  setHoverLayer(null)
                  document.body.style.cursor = ''
                }}
                onClick={(e) => {
                  e.stopPropagation()
                  onCycle(i)
                }}
              >
                <meshBasicMaterial attach="material-0" color={palette.fillTop} toneMapped={false} />
                <meshBasicMaterial attach="material-1" color={palette.fillSide} toneMapped={false} />
              </mesh>
              <lineSegments geometry={slabs[i].outline}>
                <lineBasicMaterial color={hot ? palette.accent : palette.line} />
              </lineSegments>
              <Engraving
                spec={spec}
                palette={palette}
                fontsReady={fontsReady}
                title={value ? value.option.label : spec.title}
                caption={value ? spec.title : `drop ${spec.title.toLowerCase()} here`}
                glyph={value ? value.option.glyph : 'slots'}
                hidden={!value && items.length > 0}
              />
            </group>
            <object3D ref={(o) => void (anchors.current[i] = o)} position={cornerOf(spec)} />
            <LayerTiles
              spec={spec}
              items={items}
              index={i}
              rt={rt}
              palette={palette}
              theme={lab.theme}
              focus={focus}
              onToggle={lab.toggle}
              onHover={onTip}
            />
          </group>
        )
      })}
      <group ref={agentGroup}>
        <group
          ref={agentRing}
          onClick={(e) => {
            e.stopPropagation()
            onCycle(6)
          }}
          onPointerOver={() => void (document.body.style.cursor = 'pointer')}
          onPointerOut={() => void (document.body.style.cursor = '')}
        >
          <mesh rotation-x={Math.PI / 2}>
            <torusGeometry args={[RING, agent.color ? 0.04 : 0.016, 12, 128]} />
            <meshBasicMaterial color={agent.color || palette.line} toneMapped={false} />
          </mesh>
          {agent.color ? (
            <>
              <mesh rotation-x={Math.PI / 2}>
                <torusGeometry args={[RING, 0.12, 12, 128]} />
                <meshBasicMaterial color={agent.color} transparent opacity={0.18} depthWrite={false} toneMapped={false} />
              </mesh>
              <mesh rotation-x={Math.PI / 2}>
                <torusGeometry args={[RING, 0.28, 12, 128]} />
                <meshBasicMaterial color={agent.color} transparent opacity={0.07} depthWrite={false} toneMapped={false} />
              </mesh>
              {[0, 1, 2].map((n) => (
                <mesh key={n} position={[Math.cos((n * Math.PI * 2) / 3) * RING, 0, Math.sin((n * Math.PI * 2) / 3) * RING]}>
                  <sphereGeometry args={[0.075, 12, 12]} />
                  <meshBasicMaterial color={agent.color} toneMapped={false} />
                </mesh>
              ))}
            </>
          ) : (
            <mesh rotation-x={Math.PI / 2}>
              <torusGeometry args={[RING - 0.2, 0.01, 8, 128]} />
              <meshBasicMaterial color={palette.line} toneMapped={false} />
            </mesh>
          )}
          <mesh rotation-x={-Math.PI / 2}>
            <ringGeometry args={[RING - 0.35, RING + 0.35, 64]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>
        </group>
        <object3D ref={(o) => void (anchors.current[6] = o)} position={[RING * RIGHT.x, 0, RING * RIGHT.z]} />
      </group>
      <ContactShadows position={[0, -0.01, 0]} scale={14} opacity={lab.theme === 'dark' ? 0.55 : 0.3} blur={2.6} far={4} resolution={512} frames={Infinity} />
    </>
  )
}

function setupValue(lab: Lab, id: LayerId) {
  const entry = setupLayers[id]
  if (!entry) return undefined
  const [key, options] = entry
  const index = options.findIndex((option) => option.value === lab.setup[key])
  return { key, options, index, option: options[Math.max(0, index)] }
}

function cornerOf(spec: LayerSpec): [number, number, number] {
  const s = Math.SQRT1_2
  return [spec.w / 2 - spec.r + s * spec.r, spec.h / 2, -(spec.d / 2 - spec.r) - s * spec.r]
}

function Engraving({ spec, palette, fontsReady, title, caption, glyph, hidden }: {
  spec: LayerSpec
  palette: Palette
  fontsReady: boolean
  title: string
  caption: string
  glyph: Glyph
  hidden: boolean
}) {
  const texture = useMemo(
    () => engraving(spec, palette, title, caption, glyph),
    [spec, palette, title, caption, glyph, fontsReady],
  )
  useEffect(() => () => texture.dispose(), [texture])
  return (
    <mesh rotation-x={-Math.PI / 2} position-y={spec.h + 0.003} visible={!hidden}>
      <planeGeometry args={[spec.w, spec.d]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} toneMapped={false} />
    </mesh>
  )
}

type LabelSpec = { title: string; value: string; swappable: boolean; hot: boolean }

function Labels({ specs, open, rt, onCycle, onHover }: {
  specs: LabelSpec[]
  open: boolean
  rt: React.RefObject<Runtime>
  onCycle: (index: number) => void
  onHover: (index: number | null) => void
}) {
  return (
    <div className="pointer-events-none absolute inset-0 z-[5] overflow-hidden max-md:hidden">
      {specs.map((spec, i) => (
        <div
          key={spec.title}
          ref={(el) => void (rt.current.labels[i] = el)}
          className="absolute left-0 top-0 will-change-transform"
        >
          <div
            className="flex -translate-y-1/2 items-center transition-[opacity,translate] duration-500 ease-out"
            style={{
              opacity: open || spec.hot ? 1 : 0,
              translate: open || spec.hot ? '0 0' : '-14px 0',
              transitionDelay: open ? `${i * 45}ms` : '0ms',
            }}
          >
            <span
              ref={(el) => void (rt.current.lines[i] = el)}
              className={`relative block h-px ${spec.hot ? 'bg-accent' : 'bg-muted/60'}`}
            >
              <span className="absolute -left-[3px] -top-[3px] block size-[7px] rounded-full border border-muted bg-background" />
            </span>
            <button
              ref={(el) => void (rt.current.texts[i] = el)}
              type="button"
              tabIndex={-1}
              onClick={() => onCycle(i)}
              onPointerEnter={() => onHover(i)}
              onPointerLeave={() => onHover(null)}
              className={`ml-2.5 whitespace-nowrap text-left font-mono leading-tight ${open || spec.hot ? 'pointer-events-auto' : ''} ${spec.swappable ? 'cursor-pointer' : 'cursor-default'}`}
            >
              <div className="text-[10px] uppercase tracking-[0.14em] text-muted">
                {String(i + 1).padStart(2, '0')} · {spec.title}
              </div>
              <div className={`text-[12px] ${spec.hot ? 'text-accent' : 'text-foreground'}`}>
                {spec.value}
                {spec.swappable ? <span className="ml-1.5 text-muted">⇄</span> : null}
              </div>
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

function Tray({ lab, focus, setFocus, onAdd }: { lab: Lab; focus: string | null; setFocus: (ref: string | null) => void; onAdd: (item: CatalogItem) => void }) {
  const [query, setQuery] = useState('')
  const sections = useMemo(() => {
    const q = query.trim().toLowerCase()
    const match = (item: CatalogItem) =>
      !q || item.title.toLowerCase().includes(q) || item.label.toLowerCase().includes(q) || item.name.toLowerCase().includes(q)
    return [...lab.catalog.kinds.slice(1), ...lab.catalog.blocks]
      .map((category) => ({
        category,
        items: lab.catalog.items.filter((item) => item.category === category.id && match(item)),
      }))
      .filter((section) => section.items.length)
  }, [lab.catalog, query])

  return (
    <aside className="pointer-events-auto absolute z-20 flex flex-col overflow-hidden rounded-2xl border border-border bg-surface/90 shadow-xl backdrop-blur max-md:inset-x-2 max-md:bottom-2 max-md:h-[38%] md:bottom-4 md:left-4 md:top-20 md:w-[280px]">
      <div className="border-b border-border p-3">
        <div className="mb-2 flex items-baseline justify-between">
          <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">Parts tray</div>
          <div className="font-mono text-[10px] text-muted">{lab.catalog.items.length} parts</div>
        </div>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search parts"
          className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm text-foreground outline-none placeholder:text-muted focus:border-accent"
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2" onPointerLeave={() => setFocus(null)}>
        {sections.map(({ category, items }) => {
          const hue = items[0].hue
          const picked = items.filter((item) => lab.selected.has(item.ref)).length
          return (
            <section key={category.id} className="pt-2">
              <div className="sticky top-0 z-10 flex items-center gap-2 bg-surface px-1.5 py-1">
                <span className="size-2.5 rounded-[3px]" style={{ background: `hsl(${hue} 48% 62%)` }} />
                <span className="text-xs font-medium text-foreground">{category.label}</span>
                <span className="ml-auto font-mono text-[10px] text-muted">
                  {picked ? `${picked}/` : ''}
                  {items.length}
                </span>
              </div>
              {items.map((item) => {
                const on = lab.selected.has(item.ref)
                return (
                  <button
                    key={item.ref}
                    type="button"
                    data-ref={item.ref}
                    title={item.description}
                    onPointerEnter={() => setFocus(item.ref)}
                    onFocus={() => setFocus(item.ref)}
                    onClick={() => {
                      if (!on) onAdd(item)
                      lab.toggle(item.ref)
                    }}
                    className={`flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left text-[13px] transition-colors ${
                      on ? 'text-foreground' : 'text-muted hover:text-foreground'
                    } ${focus === item.ref ? 'bg-background' : ''}`}
                  >
                    <span
                      className="grid size-4 shrink-0 place-items-center rounded-[4px] border text-[10px] leading-none transition-all"
                      style={{
                        borderColor: `hsl(${item.hue} 45% 58%)`,
                        background: on ? `hsl(${item.hue} 48% 60%)` : 'transparent',
                        color: on ? '#fff' : `hsl(${item.hue} 45% 58%)`,
                      }}
                    >
                      {on ? '✓' : '+'}
                    </span>
                    <span className="truncate">{item.title}</span>
                  </button>
                )
              })}
            </section>
          )
        })}
      </div>
    </aside>
  )
}

function CommandCard({ lab }: { lab: Lab }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="pointer-events-auto absolute z-20 rounded-2xl border border-border bg-surface/90 p-3 shadow-xl backdrop-blur max-md:inset-x-2 max-md:top-16 md:bottom-4 md:right-[84px] md:w-[380px]">
      <div className="mb-2 flex items-center gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">Reads off the stack</span>
        <span data-count className="ml-auto rounded-full bg-accent px-2 py-0.5 font-mono text-[10px] text-accent-foreground">
          {lab.selected.size} {lab.selected.size === 1 ? 'part' : 'parts'}
        </span>
        <div className="flex rounded-full border border-border p-0.5 text-[10px]">
          {(['existing', 'new'] as const).map((target) => (
            <button
              key={target}
              type="button"
              onClick={() => lab.set('target', target)}
              className={`rounded-full px-2 py-0.5 font-mono ${lab.setup.target === target ? 'bg-background text-foreground' : 'text-muted'}`}
            >
              {target === 'existing' ? 'add' : 'init'}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-start gap-2">
        <code data-command className="max-h-20 min-w-0 flex-1 overflow-y-auto break-all font-mono text-[11px] leading-relaxed text-foreground max-md:max-h-10">
          <span className="text-muted">$ </span>
          {lab.command}
        </code>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(lab.command)
            setCopied(true)
            setTimeout(() => setCopied(false), 1200)
          }}
          className="shrink-0 rounded-lg bg-accent px-2.5 py-1 text-xs text-accent-foreground"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      {lab.selected.size ? (
        <button type="button" onClick={lab.clear} className="mt-1.5 font-mono text-[10px] text-muted hover:text-foreground">
          clear the stack
        </button>
      ) : null}
    </div>
  )
}

export default function ExplodedStack({ lab }: MockProps) {
  const palette = palettes[lab.theme]
  const [open, setOpen] = useState(false)
  const [pinned, setPinned] = useState(false)
  const [focus, setFocus] = useState<string | null>(null)
  const [tip, setTip] = useState<CatalogItem | null>(null)
  const [hoverLayer, setHoverLayer] = useState<number | null>(null)
  const [fontsReady, setFontsReady] = useState(false)
  const [phone, setPhone] = useState(() => innerWidth < 768)
  const rt = useRef<Runtime>({
    hover: false,
    wheel: 0,
    pinned: false,
    breatheUntil: 0,
    breatheLayer: null,
    gaps: layers.map(() => ({ x: GAP_CLOSED, v: 0 })),
    dips: layers.map(() => ({ x: 0, v: 0 })),
    spins: layers.map(() => ({ x: 0, v: 0, target: 0 })),
    agentGap: { x: AGENT_CLOSED, v: 0 },
    top: 3,
    labels: [],
    lines: [],
    texts: [],
    tip: null,
    tipAnchor: null,
  })

  useEffect(() => {
    void document.fonts?.ready.then(() => setFontsReady(true))
    const onResize = () => setPhone(innerWidth < 768)
    addEventListener('resize', onResize)
    return () => removeEventListener('resize', onResize)
  }, [])

  const byLayer = useMemo(() => {
    const order = new Map(lab.catalog.blocks.map((category, index) => [category.id, index]))
    const lists: CatalogItem[][] = layers.map(() => [])
    for (const item of lab.catalog.items) if (lab.selected.has(item.ref)) lists[itemLayers[item.kind] ?? 5].push(item)
    lists[5].sort((a, b) => (order.get(a.category) ?? 0) - (order.get(b.category) ?? 0))
    return lists
  }, [lab.catalog, lab.selected])
  const totals = useMemo(
    () => layers.map((_, i) => lab.catalog.items.filter((item) => (itemLayers[item.kind] ?? -1) === i).length),
    [lab.catalog],
  )

  const focusItem = focus ? lab.catalog.items.find((item) => item.ref === focus) : undefined
  const focusLayer = focusItem ? itemLayers[focusItem.kind] : undefined
  const agentIndex = Math.max(0, agents.findIndex((option) => option.value === lab.setup.agent))
  const labelSpecs: LabelSpec[] = [
    ...layers.map((spec, i) => {
      const value = setupValue(lab, spec.id)
      return {
        title: spec.title,
        value: value ? value.option.label : `${byLayer[i].length} / ${totals[i]}`,
        swappable: !!value,
        hot: focusLayer === i || hoverLayer === i,
      }
    }),
    { title: 'Agent', value: agents[agentIndex].label, swappable: true, hot: hoverLayer === 6 },
  ]

  const cycle = (i: number) => {
    if (i === 6) {
      lab.set('agent', agents[(agentIndex + 1) % agents.length].value)
      rt.current.agentGap.v += 3
      return
    }
    const value = setupValue(lab, layers[i].id)
    if (!value) return
    const next = value.options[(value.index + 1) % value.options.length]
    lab.set(value.key as 'framework', next.value as 'next')
    rt.current.spins[i].target += Math.PI * 2
    rt.current.dips[i].v += 4
  }

  const sync = () => {
    const r = rt.current
    setOpen(r.hover || r.pinned || r.wheel > 0.4)
  }

  return (
    <div className="relative h-full w-full overflow-hidden bg-background text-muted">
      <div
        className="absolute inset-0 isolate"
        onPointerEnter={() => {
          rt.current.hover = true
          sync()
        }}
        onPointerLeave={() => {
          rt.current.hover = false
          sync()
        }}
        onWheel={(event) => {
          rt.current.wheel = THREE.MathUtils.clamp(rt.current.wheel + event.deltaY * 0.0025, 0, 1)
          sync()
        }}
      >
        <Canvas
          orthographic
          dpr={[1, 2]}
          gl={{ alpha: true, antialias: true }}
          camera={{ position: [30, 26, 30], zoom: 60, near: 0.1, far: 200 }}
          onPointerMissed={() => {
            rt.current.pinned = !rt.current.pinned
            setPinned(rt.current.pinned)
            sync()
          }}
        >
          <Scene
            lab={lab}
            rt={rt}
            byLayer={byLayer}
            focus={focus}
            hoverLayer={hoverLayer}
            setHoverLayer={setHoverLayer}
            palette={palette}
            fontsReady={fontsReady}
            phone={phone}
            onCycle={cycle}
            onTip={setTip}
          />
        </Canvas>
        <Labels specs={labelSpecs} open={open} rt={rt} onCycle={cycle} onHover={setHoverLayer} />
        <div className="pointer-events-none absolute inset-0 z-[6]">
          <div ref={(el) => void (rt.current.tip = el)} className="absolute left-0 top-0 will-change-transform">
            {tip ? (
              <div className="-translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg border border-border bg-surface/95 px-2.5 py-1.5 shadow-lg">
                <div className="flex items-center gap-1.5 text-[12px] font-medium text-foreground">
                  <span className="size-2 rounded-[2px]" style={{ background: `hsl(${tip.hue} 48% 60%)` }} />
                  {tip.title}
                </div>
                <div className="font-mono text-[10px] text-muted">{tip.label} · click to lift off</div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
      <Tray
        lab={lab}
        focus={focus}
        setFocus={setFocus}
        onAdd={(item) => {
          rt.current.breatheUntil = performance.now() + 1500
          rt.current.breatheLayer = itemLayers[item.kind] ?? null
        }}
      />
      <CommandCard lab={lab} />
      <div className="pointer-events-none absolute left-1/2 top-[68px] z-10 -translate-x-1/2 font-mono text-[10px] uppercase tracking-[0.16em] text-muted max-md:hidden">
        {pinned ? 'pinned open · click empty space to collapse' : 'hover or scroll to explode · click empty space to pin'}
      </div>
    </div>
  )
}
