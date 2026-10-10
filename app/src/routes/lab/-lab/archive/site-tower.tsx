import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Edges, Html, Line, useTexture } from '@react-three/drei'
import { easing } from 'maath'
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import type { MutableRefObject, RefObject } from 'react'
import {
  CanvasTexture,
  Euler,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  Quaternion,
  SRGBColorSpace,
  Vector3,
} from 'three'
import type { ThreeEvent } from '@react-three/fiber'

import type { CatalogItem } from '../../../workspace/-workspace/workspace.types'
import type { Lab, MockProps } from '../lab.types'

const W = 4
const CHROME = 0.34
const CROP = 0.66
const SH = (W * (800 * CROP)) / 1280
const DEPTH = 0.2
const ACCENT = '#5A91AD'

const RANK: Record<string, number> = {
  'block:hero': 0,
  'block:logo': 1,
  'block:feature': 2,
  'block:content': 3,
  'block:integration': 4,
  'block:stats': 5,
  'block:team': 6,
  'block:testimonials': 7,
  'block:comparator': 8,
  'block:pricing': 9,
  'block:faq': 10,
  'block:other': 11,
  'block:contact': 12,
  'block:call': 13,
  'block:footer': 14,
}
const rank = (item: CatalogItem) => RANK[item.category] ?? 11

type Palette = {
  bg: string
  surface: string
  border: string
  fg: string
  muted: string
  front: string
}
const palettes: Record<Lab['theme'], Palette> = {
  light: {
    bg: '#EDF1F3',
    surface: '#FFFFFF',
    border: '#B9C0C4',
    fg: '#1D2225',
    muted: '#727C81',
    front: '#FFFFFF',
  },
  dark: {
    bg: '#090E11',
    surface: '#12171A',
    border: '#3A4145',
    fg: '#FCFCFC',
    muted: '#8A9094',
    front: '#E2E6E8',
  },
}

type Shared = {
  registry: Map<string, Object3D>
  launches: Map<string, [number, number]>
  portal: RefObject<HTMLDivElement>
}

type Ghost = {
  key: string
  item: CatalogItem
  plugin: boolean
  matrix: Matrix4
}

export default function SiteTower({ lab }: MockProps) {
  const portal = useRef<HTMLDivElement>(null!)
  const shared = useMemo<Shared>(() => ({ registry: new Map(), launches: new Map(), portal }), [])
  const [flat, setFlat] = useState(false)
  const wheel = useRef(0)
  const palette = palettes[lab.theme]

  return (
    <div
      className="relative h-full w-full"
      onWheel={(event) => {
        wheel.current += event.deltaY * 0.004
      }}
    >
      <Canvas
        dpr={[1, 2]}
        camera={{ fov: 30, position: [0, 0.6, 18] }}
        className="!absolute inset-0"
      >
        <ambientLight intensity={1.1} />
        <directionalLight position={[-4, 8, 6]} intensity={1.6} />
        <Suspense fallback={null}>
          <Scene lab={lab} shared={shared} flat={flat} wheel={wheel} palette={palette} />
        </Suspense>
      </Canvas>
      <div ref={portal} className="pointer-events-none absolute inset-0" />
      <Tray lab={lab} shared={shared} />
      <div className="pointer-events-auto absolute z-30 right-4 top-[72px] flex items-center gap-1 rounded-full border border-border bg-surface/85 p-1 text-xs shadow-sm backdrop-blur">
        {(['Tilted', 'Preview'] as const).map((label) => (
          <button
            key={label}
            type="button"
            onClick={() => {
              setFlat(label === 'Preview')
              wheel.current = 0
            }}
            className={`rounded-full px-3 py-1.5 ${(label === 'Preview') === flat ? 'bg-accent text-accent-foreground' : 'text-muted hover:text-foreground'}`}
          >
            {label}
          </button>
        ))}
      </div>
      <CommandCard lab={lab} />
    </div>
  )
}

function Scene({
  lab,
  shared,
  flat,
  wheel,
  palette,
}: {
  lab: Lab
  shared: Shared
  flat: boolean
  wheel: MutableRefObject<number>
  palette: Palette
}) {
  const { viewport, size } = useThree()
  const outer = useRef<Group>(null!)
  const inner = useRef<Group>(null!)
  const wobble = useRef<Group>(null!)
  const thunk = useRef(10)
  const count = useRef(0)
  const [exploded, setExploded] = useState(false)
  const leave = useRef<ReturnType<typeof setTimeout>>(undefined)
  const [ghosts, setGhosts] = useState<Ghost[]>([])
  const previous = useRef<readonly string[]>(lab.setup.items)

  const byRef = useMemo(
    () => new Map(lab.catalog.items.map((item) => [item.ref, item])),
    [lab.catalog],
  )
  const order = useMemo(
    () => new Map(lab.catalog.items.map((item, index) => [item.ref, index])),
    [lab.catalog],
  )
  const chosen = lab.setup.items
    .map((ref) => byRef.get(ref))
    .filter((item): item is CatalogItem => !!item)
  const sections = chosen
    .filter((item) => item.kind === 'block')
    .sort((a, b) => rank(a) - rank(b) || (order.get(a.ref) ?? 0) - (order.get(b.ref) ?? 0))
  const plugins = chosen.filter((item) => item.kind !== 'block')
  const open = exploded && !flat
  const gap = open ? 0.26 : 0
  const height = sections.length
    ? CHROME + sections.length * SH + (sections.length - 1) * gap
    : CHROME + 5.2

  useEffect(() => {
    const now = new Set(lab.setup.items)
    const gone = previous.current.filter((ref) => !now.has(ref))
    previous.current = lab.setup.items
    if (!gone.length) return
    const born = gone.flatMap((ref) => {
      const object = shared.registry.get(ref)
      const item = byRef.get(ref)
      if (!object || !item) return []
      object.updateWorldMatrix(true, false)
      return [
        {
          key: `${ref}:${performance.now()}`,
          item,
          plugin: item.kind !== 'block',
          matrix: object.matrixWorld.clone(),
        },
      ]
    })
    setGhosts((list) => [...list, ...born])
  }, [lab.setup.items, shared, byRef])

  const mobile = size.width < 768
  const px = viewport.width / size.width
  const trayWorld = mobile ? 0 : 316 * px
  const cardWorld = mobile ? 0 : 400 * px
  const bottomWorld = mobile ? 300 * px : 24 * px
  const topWorld = 84 * px
  const availHeight = (viewport.height - topWorld - bottomWorld) * (flat ? 1 : 0.86)
  const pluginWorld = plugins.length && !flat ? 1.5 : 0
  const availWidth = viewport.width - trayWorld - cardWorld - (mobile ? 0.6 : 1.2)
  const fitScale = Math.min(availWidth / (W + pluginWorld), flat ? 1.4 : 1.1)
  const scale = flat ? fitScale : Math.max(Math.min(availHeight / height, fitScale), 0.6)
  const centerX =
    (trayWorld - cardWorld * 0.6) / 2 - (pluginWorld / 2) * scale + (mobile ? 0 : 0.35)
  const centerY = (bottomWorld - topWorld) / 2
  const floor = -viewport.height / 2 + bottomWorld + 0.1

  useEffect(() => {
    if (sections.length + plugins.length > count.current) thunk.current = -0.35
    count.current = sections.length + plugins.length
  }, [sections.length, plugins.length])

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime
    thunk.current += dt
    const age = Math.max(thunk.current, 0)
    wobble.current.rotation.z =
      thunk.current > 0 ? Math.sin(age * 24) * 0.045 * Math.exp(-age * 5) : 0
    wobble.current.position.y =
      thunk.current > 0 ? -Math.abs(Math.sin(age * 24)) * 0.08 * Math.exp(-age * 6) : 0
    const overflow = Math.max(0, height * scale - availHeight)
    wheel.current = Math.min(Math.max(wheel.current, 0), overflow)
    const y = centerY + (overflow ? availHeight / 2 - (height * scale) / 2 + wheel.current : 0)
    easing.damp3(outer.current.position, [centerX, y, 0], 0.25, dt)
    easing.damp3(outer.current.scale, [scale, scale, scale], 0.3, dt)
    const target: [number, number, number] = flat
      ? [0, 0, 0]
      : [
          -0.22 + Math.sin(t * 0.37) * 0.04,
          0.6 + Math.sin(t * 0.29) * 0.1,
          0.08 + Math.sin(t * 0.23) * 0.025,
        ]
    easing.dampE(outer.current.rotation, target, 0.45, dt)
    easing.damp(inner.current.position, 'y', height / 2, 0.2, dt)
  })

  const hover = (on: boolean) => {
    clearTimeout(leave.current)
    if (on) setExploded(true)
    else leave.current = setTimeout(() => setExploded(false), 140)
  }

  let cursor = -CHROME
  const slots = sections.map((item, index) => {
    const y = cursor - SH / 2
    cursor -= SH + gap
    return { item, y, z: open ? 0.25 + index * 0.16 : 0 }
  })

  return (
    <>
      <group ref={outer}>
        <group ref={wobble}>
          <group ref={inner}>
            <Frame
              height={height}
              palette={palette}
              url={`${lab.setup.target === 'new' ? lab.setup.name || 'my-payload-app' : 'my-payload-app'}.localhost`}
            />
            <mesh
              position={[0.4, -height / 2, -0.35]}
              onPointerOver={() => hover(true)}
              onPointerOut={() => hover(false)}
            >
              <planeGeometry args={[W + 3.4, height + 1]} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>
            {sections.length === 0 && <Skeleton lab={lab} palette={palette} shared={shared} />}
            {slots.map(({ item, y, z }, index) => (
              <Slab
                key={item.ref}
                item={item}
                y={y}
                z={z}
                index={index}
                open={open}
                palette={palette}
                shared={shared}
                onHover={hover}
                onRemove={() => lab.toggle(item.ref)}
              />
            ))}
            {plugins.map((item, index) => (
              <Plugin
                key={item.ref}
                item={item}
                y={-CHROME - 0.55 - index * 0.78}
                palette={palette}
                shared={shared}
                onRemove={() => lab.toggle(item.ref)}
              />
            ))}
          </group>
        </group>
      </group>
      {ghosts.map((ghost) => (
        <Falling
          key={ghost.key}
          ghost={ghost}
          palette={palette}
          shared={shared}
          onDone={() => setGhosts((list) => list.filter((entry) => entry.key !== ghost.key))}
        />
      ))}
      <Blob
        x={centerX}
        y={floor}
        width={(W + 1) * scale}
        dark={lab.theme === 'dark'}
        hidden={flat}
      />
    </>
  )
}

function Blob({
  x,
  y,
  width,
  dark,
  hidden,
}: {
  x: number
  y: number
  width: number
  dark: boolean
  hidden: boolean
}) {
  const mesh = useRef<Mesh>(null!)
  const material = useRef<MeshBasicMaterial>(null!)
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 256
    const ctx = canvas.getContext('2d')!
    const gradient = ctx.createRadialGradient(128, 128, 0, 128, 128, 128)
    gradient.addColorStop(0, 'rgba(0,0,0,1)')
    gradient.addColorStop(0.45, 'rgba(0,0,0,0.45)')
    gradient.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, 256, 256)
    return new CanvasTexture(canvas)
  }, [])
  useFrame((state, dt) => {
    const t = state.clock.elapsedTime
    easing.damp3(mesh.current.position, [x, y, 0], 0.25, dt)
    easing.damp3(
      mesh.current.scale,
      [width * (1 + Math.sin(t * 0.29) * 0.06), width * 0.5, 1],
      0.25,
      dt,
    )
    easing.damp(material.current, 'opacity', hidden ? 0 : dark ? 0.55 : 0.16, 0.3, dt)
  })
  return (
    <mesh ref={mesh} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial
        ref={material}
        map={texture}
        transparent
        depthWrite={false}
        color="#000000"
        opacity={0}
      />
    </mesh>
  )
}

function useChromeTexture(url: string, palette: Palette) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 2048
    canvas.height = Math.round((2048 * CHROME) / W)
    const texture = new CanvasTexture(canvas)
    texture.colorSpace = SRGBColorSpace
    texture.anisotropy = 8
    return texture
  }, [])
  useEffect(() => {
    const canvas = texture.image as HTMLCanvasElement
    const ctx = canvas.getContext('2d')!
    const h = canvas.height
    ctx.fillStyle = palette.surface
    ctx.fillRect(0, 0, canvas.width, h)
    ;['#FF5F57', '#FEBC2E', '#28C840'].forEach((color, index) => {
      ctx.beginPath()
      ctx.arc(70 + index * 58, h / 2, 17, 0, Math.PI * 2)
      ctx.fillStyle = color
      ctx.fill()
    })
    const pillW = 980
    const x = (canvas.width - pillW) / 2
    ctx.beginPath()
    ctx.roundRect(x, h * 0.2, pillW, h * 0.6, h * 0.3)
    ctx.fillStyle = palette.bg
    ctx.fill()
    ctx.strokeStyle = palette.border
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.fillStyle = palette.muted
    ctx.font = `500 ${Math.round(h * 0.3)}px "Timeless Grotesk", ui-sans-serif, system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(`⌂  ${url}`, canvas.width / 2, h / 2 + 2)
    ctx.fillStyle = palette.muted
    ctx.fillRect(canvas.width - 120, h / 2 - 12, 52, 4)
    ctx.fillRect(canvas.width - 120, h / 2 - 2, 52, 4)
    ctx.fillRect(canvas.width - 120, h / 2 + 8, 52, 4)
    texture.needsUpdate = true
  }, [texture, url, palette])
  return texture
}

function Frame({ height, palette, url }: { height: number; palette: Palette; url: string }) {
  const body = useRef<Mesh>(null!)
  const chrome = useChromeTexture(url, palette)
  useFrame((_, dt) => {
    easing.damp(body.current.scale, 'y', height, 0.2, dt)
    easing.damp(body.current.position, 'y', -height / 2, 0.2, dt)
  })
  return (
    <>
      <mesh position={[0, -CHROME / 2, 0]}>
        <boxGeometry args={[W, CHROME, DEPTH]} />
        <meshStandardMaterial attach="material-0" color={palette.surface} />
        <meshStandardMaterial attach="material-1" color={palette.surface} />
        <meshStandardMaterial attach="material-2" color={palette.surface} />
        <meshStandardMaterial attach="material-3" color={palette.surface} />
        <meshBasicMaterial attach="material-4" map={chrome} toneMapped={false} />
        <meshStandardMaterial attach="material-5" color={palette.surface} />
        <Edges color={palette.border} />
      </mesh>
      <mesh ref={body} position={[0, -height / 2, -0.24]} scale={[1, height, 1]}>
        <boxGeometry args={[W + 0.16, 1, 0.08]} />
        <meshBasicMaterial color={palette.surface} transparent opacity={0.7} toneMapped={false} />
        <Edges color={palette.border} />
      </mesh>
    </>
  )
}

function Skeleton({ lab, palette, shared }: { lab: Lab; palette: Palette; shared: Shared }) {
  const hero = lab.catalog.items.find((item) => item.name === 'hero-basic')
  const rect = (x: number, y: number, w: number, h: number): [number, number, number][] => [
    [x, y, 0.02],
    [x + w, y, 0.02],
    [x + w, y - h, 0.02],
    [x, y - h, 0.02],
    [x, y, 0.02],
  ]
  const shapes = [
    rect(-1.85, -CHROME - 0.15, 3.7, 2.1),
    rect(-1.4, -CHROME - 0.55, 2.8, 0.28),
    rect(-1.0, -CHROME - 0.95, 2.0, 0.14),
    rect(-0.45, -CHROME - 1.35, 0.9, 0.26),
    rect(-1.85, -CHROME - 2.45, 1.15, 1.2),
    rect(-0.575, -CHROME - 2.45, 1.15, 1.2),
    rect(0.7, -CHROME - 2.45, 1.15, 1.2),
    rect(-1.85, -CHROME - 3.85, 3.7, 0.9),
    rect(-1.85, -CHROME - 4.9, 3.7, 0.18),
  ]
  return (
    <group>
      {shapes.map((points, index) => (
        <Line
          key={index}
          points={points}
          color={index === 0 ? ACCENT : palette.border}
          lineWidth={1}
          dashed
          dashSize={0.08}
          gapSize={0.06}
        />
      ))}
      {hero && (
        <Html
          portal={shared.portal}
          position={[0, -CHROME - 1.9, 0.05]}
          center
          zIndexRange={[20, 0]}
        >
          <button
            type="button"
            onClick={() => lab.toggle(hero.ref)}
            className="pointer-events-auto whitespace-nowrap rounded-full bg-accent px-4 py-2 text-sm text-accent-foreground shadow-lg transition-transform hover:scale-105"
          >
            + Start with a hero
          </button>
        </Html>
      )}
    </group>
  )
}

function useLaunch(
  ref: string,
  shared: Shared,
  object: MutableRefObject<Object3D>,
  fallback: [number, number, number],
) {
  const { camera } = useThree()
  useEffect(() => {
    const target = object.current
    shared.registry.set(ref, target)
    const ndc = shared.launches.get(ref)
    shared.launches.delete(ref)
    if (!ndc || !target.parent) {
      target.position.set(...fallback)
      return
    }
    const near = new Vector3(ndc[0], ndc[1], 0.2).unproject(camera)
    const far = new Vector3(ndc[0], ndc[1], 0.9).unproject(camera)
    const point = near.lerp(far, 0.25)
    target.parent.updateWorldMatrix(true, false)
    target.parent.worldToLocal(point)
    target.position.copy(point)
    target.rotation.set(0.6, -1.6, 0.5)
  }, [])
}

function spring(
  position: Vector3,
  velocity: Vector3,
  target: Vector3,
  dt: number,
  k = 140,
  c = 13,
) {
  const step = Math.min(dt, 1 / 30)
  velocity.x += ((target.x - position.x) * k - velocity.x * c) * step
  velocity.y += ((target.y - position.y) * k - velocity.y * c) * step
  velocity.z += ((target.z - position.z) * k - velocity.z * c) * step
  position.addScaledVector(velocity, step)
}

function SlabBody({ item, palette, hot }: { item: CatalogItem; palette: Palette; hot: boolean }) {
  const texture = useTexture(item.image ?? '/registry-previews/missing.webp', (loaded) => {
    const list = Array.isArray(loaded) ? loaded : [loaded]
    for (const tex of list) {
      tex.colorSpace = SRGBColorSpace
      tex.repeat.set(1, CROP)
      tex.offset.set(0, 1 - CROP)
      tex.anisotropy = 8
    }
  })
  const side =
    palette === palettes.dark ? `hsl(${item.hue}, 22%, 22%)` : `hsl(${item.hue}, 40%, 88%)`
  return (
    <>
      <boxGeometry args={[W, SH, DEPTH]} />
      <meshStandardMaterial attach="material-0" color={side} />
      <meshStandardMaterial attach="material-1" color={side} />
      <meshStandardMaterial attach="material-2" color={side} />
      <meshStandardMaterial attach="material-3" color={side} />
      <meshBasicMaterial
        attach="material-4"
        map={texture}
        color={palette.front}
        toneMapped={false}
      />
      <meshStandardMaterial attach="material-5" color={side} />
      <Edges color={hot ? ACCENT : palette.border} lineWidth={hot ? 2 : 1} />
    </>
  )
}

function Slab({
  item,
  y,
  z,
  index,
  open,
  palette,
  shared,
  onHover,
  onRemove,
}: {
  item: CatalogItem
  y: number
  z: number
  index: number
  open: boolean
  palette: Palette
  shared: Shared
  onHover: (on: boolean) => void
  onRemove: () => void
}) {
  const mesh = useRef<Mesh>(null!)
  const velocity = useMemo(() => new Vector3(), [])
  const goal = useMemo(() => new Vector3(), [])
  const [hot, setHot] = useState(false)
  useLaunch(item.ref, shared, mesh as MutableRefObject<Object3D>, [0, y, z + 2.5])
  useFrame((_, dt) => {
    goal.set(hot ? -0.06 : 0, y, z + (hot ? 0.22 : 0))
    spring(mesh.current.position, velocity, goal, dt)
    easing.dampE(mesh.current.rotation, [hot ? -0.05 : 0, 0, 0], 0.16, dt)
  })
  return (
    <mesh
      ref={mesh}
      onPointerOver={(event: ThreeEvent<PointerEvent>) => {
        event.stopPropagation()
        onHover(true)
        setHot(true)
        document.body.style.cursor = 'pointer'
      }}
      onPointerOut={() => {
        onHover(false)
        setHot(false)
        document.body.style.cursor = ''
      }}
      onClick={(event: ThreeEvent<MouseEvent>) => {
        event.stopPropagation()
        document.body.style.cursor = ''
        onRemove()
      }}
    >
      <SlabBody item={item} palette={palette} hot={hot} />
      <Html
        portal={shared.portal}
        position={[-W / 2 - 0.12, SH / 2 - 0.1, DEPTH / 2]}
        zIndexRange={[20, 0]}
        style={{ pointerEvents: 'none' }}
      >
        <div
          className="-translate-x-full whitespace-nowrap text-right transition-all duration-300"
          style={{
            opacity: open || hot ? 1 : 0,
            transform: `translateX(calc(-100% - ${open || hot ? 0 : 12}px))`,
          }}
        >
          <div
            className="text-[10px] uppercase tracking-wider"
            style={{ color: `hsl(${item.hue} 45% 55%)` }}
          >
            {String(index + 1).padStart(2, '0')} · {item.label}
          </div>
          <div className="text-xs text-foreground">{item.title}</div>
          {hot && <div className="text-[10px] text-muted">click to drop</div>}
        </div>
      </Html>
    </mesh>
  )
}

function Plugin({
  item,
  y,
  palette,
  shared,
  onRemove,
}: {
  item: CatalogItem
  y: number
  palette: Palette
  shared: Shared
  onRemove: () => void
}) {
  const mesh = useRef<Mesh>(null!)
  const velocity = useMemo(() => new Vector3(), [])
  const goal = useMemo(() => new Vector3(), [])
  const [hot, setHot] = useState(false)
  const x = W / 2 + 0.72
  useLaunch(item.ref, shared, mesh as MutableRefObject<Object3D>, [x + 3, y, 0])
  useFrame((state, dt) => {
    goal.set(x + (hot ? 0.12 : 0), y + Math.sin(state.clock.elapsedTime * 1.4 + y) * 0.03, 0)
    spring(mesh.current.position, velocity, goal, dt, 90, 9)
    easing.dampE(mesh.current.rotation, [0, hot ? -0.4 : 0, 0], 0.2, dt)
  })
  return (
    <>
      <Line
        points={[
          [W / 2 + 0.08, y, 0],
          [x - 0.5, y, 0],
        ]}
        color={palette.border}
        lineWidth={1}
        dashed
        dashSize={0.05}
        gapSize={0.04}
      />
      <mesh
        ref={mesh}
        onPointerOver={(event: ThreeEvent<PointerEvent>) => {
          event.stopPropagation()
          setHot(true)
          document.body.style.cursor = 'pointer'
        }}
        onPointerOut={() => {
          setHot(false)
          document.body.style.cursor = ''
        }}
        onClick={(event: ThreeEvent<MouseEvent>) => {
          event.stopPropagation()
          document.body.style.cursor = ''
          onRemove()
        }}
      >
        <PluginBody item={item} palette={palette} hot={hot} shared={shared} />
      </mesh>
    </>
  )
}

function PluginBody({
  item,
  palette,
  hot,
  shared,
}: {
  item: CatalogItem
  palette: Palette
  hot: boolean
  shared: Shared
}) {
  return (
    <>
      <boxGeometry args={[1, 0.56, 0.34]} />
      <meshStandardMaterial color={palette.surface} />
      <Edges color={hot ? ACCENT : `hsl(${item.hue}, 50%, 55%)`} lineWidth={hot ? 2 : 1.2} />
      <mesh position={[0, 0, 0.175]}>
        <circleGeometry args={[0.09, 24]} />
        <meshBasicMaterial color={`hsl(${item.hue}, 55%, 58%)`} toneMapped={false} />
      </mesh>
      <Html
        portal={shared.portal}
        position={[0.56, 0.12, 0]}
        zIndexRange={[20, 0]}
        style={{ pointerEvents: 'none' }}
      >
        <div className="whitespace-nowrap pl-2 leading-tight">
          <div
            className="text-[10px] uppercase tracking-wider"
            style={{ color: `hsl(${item.hue} 50% 55%)` }}
          >
            {item.kind === 'feature' ? 'plugin' : 'component'}
          </div>
          <div className="text-xs text-foreground">{item.title}</div>
        </div>
      </Html>
    </>
  )
}

function Falling({
  ghost,
  palette,
  shared,
  onDone,
}: {
  ghost: Ghost
  palette: Palette
  shared: Shared
  onDone: () => void
}) {
  const mesh = useRef<Mesh>(null!)
  const state = useMemo(() => {
    const position = new Vector3()
    const quaternion = new Quaternion()
    const scale = new Vector3()
    ghost.matrix.decompose(position, quaternion, scale)
    return {
      position,
      quaternion,
      scale,
      velocity: new Vector3((Math.random() - 0.5) * 3, 2.4, 1.2 + Math.random()),
      spin: new Euler(
        (Math.random() - 0.2) * 4,
        (Math.random() - 0.5) * 3,
        (Math.random() - 0.5) * 5,
      ),
      age: 0,
    }
  }, [ghost])
  const turn = useMemo(() => new Quaternion(), [])
  useFrame((_, raw) => {
    const dt = Math.min(raw, 1 / 30)
    state.age += dt
    state.velocity.y -= 22 * dt
    state.position.addScaledVector(state.velocity, dt)
    turn.setFromEuler(new Euler(state.spin.x * dt, state.spin.y * dt, state.spin.z * dt))
    state.quaternion.multiply(turn)
    mesh.current.position.copy(state.position)
    mesh.current.quaternion.copy(state.quaternion)
    mesh.current.scale.copy(state.scale)
    if (state.age > 1.6) onDone()
  })
  return (
    <mesh ref={mesh}>
      {ghost.plugin ? (
        <PluginBody item={ghost.item} palette={palette} hot={false} shared={shared} />
      ) : (
        <SlabBody item={ghost.item} palette={palette} hot={false} />
      )}
    </mesh>
  )
}

function Tray({ lab, shared }: { lab: Lab; shared: Shared }) {
  const groups = useMemo(() => {
    const map = new Map<string, CatalogItem[]>()
    const sorted = [...lab.catalog.items].sort((a, b) => {
      const ra = a.kind === 'block' ? rank(a) : 99
      const rb = b.kind === 'block' ? rank(b) : 99
      return ra - rb
    })
    for (const item of sorted) {
      const key = item.kind === 'block' ? item.label : 'Plugins & components'
      map.set(key, [...(map.get(key) ?? []), item])
    }
    return [...map.entries()]
  }, [lab.catalog])

  const pick = (item: CatalogItem, x: number, y: number) => {
    if (!lab.selected.has(item.ref))
      shared.launches.set(item.ref, [(x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1])
    lab.toggle(item.ref)
  }

  return (
    <aside className="pointer-events-auto absolute z-30 inset-x-2 bottom-2 h-[136px] overflow-x-auto overflow-y-hidden rounded-2xl border border-border bg-surface/80 shadow-sm backdrop-blur md:inset-x-auto md:bottom-4 md:left-4 md:top-[72px] md:h-auto md:w-[300px] md:overflow-y-auto md:overflow-x-hidden">
      <div className="hidden px-4 pb-1 pt-3 md:block">
        <div className="text-sm text-foreground">Section library</div>
        <div className="text-xs text-muted">Click to slot a section into the page.</div>
      </div>
      <div className="flex gap-4 p-3 md:block md:space-y-4 md:p-3 md:pt-1">
        {groups.map(([label, items]) => {
          const on = items.filter((item) => lab.selected.has(item.ref)).length
          return (
            <section key={label} className="shrink-0">
              <header className="sticky top-0 z-10 mb-1.5 flex items-center gap-2 bg-transparent text-[11px] uppercase tracking-wider text-muted md:-mx-3 md:bg-surface/90 md:px-3 md:py-1 md:backdrop-blur">
                <span
                  className="size-1.5 rounded-full"
                  style={{ background: `hsl(${items[0].hue} 50% 58%)` }}
                />
                {label}
                {on > 0 && <span className="text-accent">{on}</span>}
              </header>
              <div className="flex gap-2 md:grid md:grid-cols-2">
                {items.map((item) => {
                  const active = lab.selected.has(item.ref)
                  return (
                    <button
                      key={item.ref}
                      type="button"
                      title={`${item.title}: ${item.description}`}
                      data-ref={item.ref}
                      data-active={active}
                      onClick={(event) => pick(item, event.clientX, event.clientY)}
                      className={`group relative w-[104px] shrink-0 overflow-hidden rounded-lg border text-left transition-all md:w-auto ${
                        active
                          ? 'border-accent ring-1 ring-accent'
                          : 'border-border hover:-translate-y-0.5 hover:border-muted'
                      }`}
                    >
                      <div className="relative aspect-[16/10] overflow-hidden bg-background">
                        {item.image ? (
                          <img
                            src={item.image}
                            alt=""
                            loading="lazy"
                            className="h-full w-full object-cover object-top"
                          />
                        ) : (
                          <div
                            className="grid h-full place-items-center text-[10px] uppercase tracking-wider"
                            style={{ color: `hsl(${item.hue} 50% 55%)` }}
                          >
                            {item.kind}
                          </div>
                        )}
                        <div className="absolute inset-0 flex items-end bg-gradient-to-t from-black/70 to-transparent p-1.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                          <span className="text-[10px] leading-tight text-white">{item.title}</span>
                        </div>
                        {active && (
                          <span className="absolute right-1 top-1 grid size-4 place-items-center rounded-full bg-accent text-[9px] text-accent-foreground">
                            ✓
                          </span>
                        )}
                      </div>
                      <div className="truncate px-1.5 py-1 text-[10px] text-muted">{item.name}</div>
                    </button>
                  )
                })}
              </div>
            </section>
          )
        })}
      </div>
    </aside>
  )
}

function CommandCard({ lab }: { lab: Lab }) {
  const [copied, setCopied] = useState(false)
  const blocks = lab.catalog.items.filter(
    (item) => lab.selected.has(item.ref) && item.kind === 'block',
  ).length
  const others = lab.selected.size - blocks
  return (
    <div className="pointer-events-auto absolute z-30 inset-x-2 bottom-[152px] rounded-2xl border border-border bg-surface/90 p-3 shadow-lg backdrop-blur md:inset-x-auto md:bottom-[84px] md:right-4 md:w-[380px]">
      <div className="mb-2 flex items-center justify-between gap-2 text-xs">
        <span className="text-foreground">
          <span data-count className="text-accent">
            {lab.selected.size}
          </span>{' '}
          selected
          <span className="text-muted">
            {' '}
            · {blocks} section{blocks === 1 ? '' : 's'}, {others} plugin
            {others === 1 ? '' : 's'}
          </span>
        </span>
        <div className="flex gap-1">
          {(['existing', 'new'] as const).map((target) => (
            <button
              key={target}
              type="button"
              onClick={() => lab.set('target', target)}
              className={`rounded-full px-2 py-0.5 ${lab.setup.target === target ? 'bg-accent text-accent-foreground' : 'text-muted hover:text-foreground'}`}
            >
              {target === 'existing' ? 'add' : 'init'}
            </button>
          ))}
          {lab.selected.size > 0 && (
            <button
              type="button"
              onClick={lab.clear}
              className="rounded-full px-2 py-0.5 text-muted hover:text-foreground"
            >
              clear
            </button>
          )}
        </div>
      </div>
      <div className="flex items-start gap-2">
        <code className="block max-h-24 flex-1 overflow-y-auto break-all rounded-lg bg-background px-2.5 py-2 font-mono text-[11px] leading-relaxed text-foreground">
          {lab.command}
        </code>
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(lab.command).catch(() => {})
            setCopied(true)
            setTimeout(() => setCopied(false), 1200)
          }}
          className="shrink-0 rounded-lg bg-accent px-3 py-2 text-xs text-accent-foreground"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  )
}
