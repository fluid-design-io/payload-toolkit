import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { ContactShadows, Edges } from '@react-three/drei'
import * as THREE from 'three'
import { memo, useEffect, useMemo, useRef, useState } from 'react'
import type { CatalogItem, Setup } from '../../../workspace/-workspace/workspace.types'
import type { Lab, MockProps } from '../lab.types'

const W = 1.5
const H = 1.15
const T = 0.075
const PITCH = 2.7
const CRATE_W = 1.8
const FRONT = 1.2
const FLIP = 0.84
const BACK = -0.14
const ELEV = 0.56
const FOV = 32
const BUILD_DEPTH = 2.9
const CART = 0.62
const CART_Z = FRONT + 3.3

type Crate = { id: string; label: string; hue: number; items: CatalogItem[]; x: number; depth: number }
type Slot = { crate: string; index: number; count: number }
type Focus = { target: number; current: number; shown: number }
type Palette = { surface: string; border: string; fg: string; muted: string; table: string; accent: string; dark: boolean }

type World = {
  focus: Record<string, Focus>
  slots: Map<string, Slot>
  crates: Crate[]
  pulled: string | null
  pan: number
  panTarget: number
  panVel: number
  hoverCrate: string | null
  dragged: boolean
  look: THREE.Vector3
  cam: THREE.Vector3
  viewW: number
  viewH: number
  dist: number
  narrow: boolean
  pxW: number
  buildX: number
}

const depthFor = (n: number) => Math.max(2.1, 0.35 + n * 0.14 + 0.25 + 0.8)
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
const smooth = (t: number) => t * t * (3 - 2 * t)

function palette(theme: Lab['theme']): Palette {
  return theme === 'dark'
    ? { surface: '#12171A', border: '#3a4246', fg: '#FCFCFC', muted: '#8A9094', table: '#0d1215', accent: '#5A91AD', dark: true }
    : { surface: '#FFFFFF', border: '#b9c1c5', fg: '#1D2225', muted: '#727C81', table: '#e3e8eb', accent: '#5A91AD', dark: false }
}

let audio: AudioContext | null = null
let noise: AudioBuffer | null = null
function ensureAudio() {
  try {
    audio ??= new AudioContext()
    if (audio.state === 'suspended') void audio.resume()
    if (!noise) {
      noise = audio.createBuffer(1, audio.sampleRate * 0.05, audio.sampleRate)
      const data = noise.getChannelData(0)
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 3
    }
  } catch {}
}
function tick(freq = 2200, gain = 0.12) {
  if (!audio || !noise || audio.state !== 'running') return
  const src = audio.createBufferSource()
  src.buffer = noise
  src.playbackRate.value = 0.8 + Math.random() * 0.4
  const filter = audio.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.value = freq
  filter.Q.value = 1.4
  const amp = audio.createGain()
  amp.gain.value = gain
  src.connect(filter).connect(amp).connect(audio.destination)
  src.start()
}

const fontFamily = () => getComputedStyle(document.body).fontFamily || 'sans-serif'
const textures = new Map<string, THREE.CanvasTexture>()

function canvasTexture(key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D, tex: THREE.CanvasTexture) => void) {
  const cached = textures.get(key)
  if (cached) return cached
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  draw(canvas.getContext('2d')!, tex)
  textures.set(key, tex)
  return tex
}

function faceTexture(item: CatalogItem, p: Palette) {
  const cw = 512
  const ch = Math.round((cw * H) / W)
  const band = 70
  return canvasTexture(`face:${item.ref}:${p.dark}`, cw, ch, (ctx, tex) => {
    const font = fontFamily()
    const drawBand = () => {
      ctx.fillStyle = p.surface
      ctx.fillRect(0, ch - band, cw, band)
      ctx.fillStyle = `hsl(${item.hue} 50% ${p.dark ? 55 : 52}%)`
      ctx.fillRect(0, ch - band, 10, band)
      ctx.fillStyle = p.fg
      ctx.font = `600 26px ${font}`
      ctx.fillText(item.title, 26, ch - band + 32, cw - 40)
      ctx.fillStyle = p.muted
      ctx.font = `400 18px ${font}`
      ctx.fillText(`${item.label.toUpperCase()}  ·  ${item.kind}`, 26, ch - band + 56, cw - 40)
    }
    const art = ctx.createLinearGradient(0, 0, cw, ch)
    art.addColorStop(0, `hsl(${item.hue} 55% ${p.dark ? 30 : 78}%)`)
    art.addColorStop(1, `hsl(${(item.hue + 40) % 360} 50% ${p.dark ? 18 : 62}%)`)
    ctx.fillStyle = art
    ctx.fillRect(0, 0, cw, ch)
    ctx.strokeStyle = `hsl(${item.hue} 40% ${p.dark ? 60 : 40}% / 0.5)`
    ctx.lineWidth = 2
    for (let r = 40; r < 260; r += 22) {
      ctx.beginPath()
      ctx.arc(cw / 2, (ch - band) / 2, r, 0, Math.PI * 2)
      ctx.stroke()
    }
    ctx.fillStyle = p.dark ? '#fff' : '#1D2225'
    ctx.font = `700 44px ${font}`
    ctx.textAlign = 'center'
    ctx.fillText(item.title, cw / 2, (ch - band) / 2 + 14, cw - 60)
    ctx.textAlign = 'left'
    drawBand()
    const src = p.dark && item.imageDark ? item.imageDark : item.image
    if (!src) return
    const img = new Image()
    img.onload = () => {
      const area = ch - band
      ctx.fillStyle = p.surface
      ctx.fillRect(0, 0, cw, area)
      let s = cw / img.width
      if (img.height * s < area) s = area / img.height
      const dw = img.width * s
      ctx.drawImage(img, (cw - dw) / 2, 0, dw, img.height * s)
      drawBand()
      tex.needsUpdate = true
    }
    img.src = src
  })
}

function spineTexture(item: CatalogItem, p: Palette) {
  return canvasTexture(`spine:${item.ref}:${p.dark}`, 512, 26, (ctx) => {
    ctx.fillStyle = `hsl(${item.hue} 45% ${p.dark ? 42 : 66}%)`
    ctx.fillRect(0, 0, 512, 26)
    ctx.fillStyle = p.dark ? '#fff' : '#1D2225'
    ctx.font = `600 17px ${fontFamily()}`
    ctx.fillText(item.title.toUpperCase(), 10, 19, 400)
    ctx.textAlign = 'right'
    ctx.font = `400 13px ${fontFamily()}`
    ctx.fillText(item.label, 502, 19, 100)
  })
}

function crateLabel(label: string, sub: string, hue: number, p: Palette, accent = false) {
  return canvasTexture(`crate:${label}:${sub}:${p.dark}:${accent}`, 512, 86, (ctx) => {
    ctx.fillStyle = accent ? p.accent : `hsl(${hue} 22% ${p.dark ? 17 : 90}%)`
    ctx.fillRect(0, 0, 512, 86)
    ctx.fillStyle = `hsl(${hue} 50% ${p.dark ? 55 : 50}%)`
    if (!accent) ctx.fillRect(18, 22, 42, 42)
    ctx.fillStyle = accent ? '#fff' : p.fg
    ctx.font = `700 34px ${fontFamily()}`
    ctx.fillText(label.toUpperCase(), accent ? 22 : 76, 56, 330)
    ctx.textAlign = 'right'
    ctx.font = `500 28px ${fontFamily()}`
    ctx.fillStyle = accent ? '#fff' : p.muted
    ctx.fillText(sub, 494, 56)
  })
}

function buildCrates(lab: Lab): Crate[] {
  const groups = new Map<string, { label: string; items: CatalogItem[] }>()
  groups.set('toolkit', { label: 'Features & components', items: [] })
  for (const block of lab.catalog.blocks) groups.set(block.id, { label: block.label, items: [] })
  for (const item of lab.catalog.items) {
    const key = item.category === 'feature' || item.category === 'component' ? 'toolkit' : item.category
    groups.get(key)?.items.push(item)
  }
  return [...groups.entries()]
    .filter(([, group]) => group.items.length)
    .map(([id, group], i) => ({
      id,
      label: group.label,
      hue: group.items[group.items.length - 1].hue,
      items: group.items,
      x: i * PITCH,
      depth: depthFor(group.items.length),
    }))
}

function frameOf(world: World, crate: string) {
  if (crate === 'build') return { x: world.buildX, y: 0.32 * CART, front: CART_Z, depth: BUILD_DEPTH, s: CART }
  const c = world.crates.find((entry) => entry.id === crate)!
  return { x: c.x, y: 0, front: FRONT, depth: c.depth, s: 1 }
}

function Rig({ world }: { world: World }) {
  const { camera, size, pointer } = useThree()
  const ray = useMemo(() => new THREE.Raycaster(), [])
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), [])
  const hit = useMemo(() => new THREE.Vector3(), [])
  useFrame((_, delta) => {
    const dt = Math.min(delta, 1 / 30)
    const aspect = size.width / size.height
    world.narrow = aspect < 0.9
    world.dist = world.narrow ? 19 : 12.5
    world.viewH = 2 * world.dist * Math.tan(((FOV / 2) * Math.PI) / 180)
    world.viewW = world.viewH * aspect
    world.pxW = size.width
    const last = world.crates[world.crates.length - 1].x
    world.panTarget = clamp(world.panTarget, 0, last)
    const prev = world.pan
    world.pan += (world.panTarget - world.pan) * (1 - Math.exp(-dt * 7))
    world.panVel += ((world.pan - prev) / dt - world.panVel) * 0.2
    const shift = world.viewW * (world.narrow ? 0.2 : 0.1)
    world.look.set(world.pan + shift, 0.15, FRONT - 0.4)
    world.cam.set(world.look.x, world.look.y + world.dist * Math.sin(ELEV), world.look.z + world.dist * Math.cos(ELEV))
    camera.position.copy(world.cam)
    camera.lookAt(world.look)
    camera.rotateZ(clamp(-world.panVel * 0.004, -0.05, 0.05))
    world.buildX = world.look.x + world.viewW / 2 - (world.narrow ? 1.3 : 2.5)

    ray.setFromCamera(pointer, camera)
    plane.constant = -(FRONT - 1.0)
    world.hoverCrate = null
    if (ray.ray.intersectPlane(plane, hit) && hit.y > -0.4 && hit.y < 2.4) {
      if (Math.abs(hit.x - world.buildX) < CRATE_W / 2 + 0.3) world.hoverCrate = 'build'
      else for (const c of world.crates) if (Math.abs(hit.x - c.x) < CRATE_W / 2 + 0.35) world.hoverCrate = c.id
    }

    for (const [id, f] of Object.entries(world.focus)) {
      f.current += (f.target - f.current) * (1 - Math.exp(-dt * 11))
      const shown = Math.round(f.current)
      if (shown !== f.shown) {
        f.shown = shown
        tick(id === 'build' ? 1600 : 2000 + Math.random() * 600)
      }
    }
  })
  return null
}

type SlabState = {
  init: boolean
  pivot: THREE.Vector3
  vel: THREE.Vector3
  angle: number
  av: number
  scale: number
  home: string
  flight: { t: number; from: THREE.Vector3; arc: number; spin: number } | null
}

const tmpTarget = new THREE.Vector3()
const tmpUp = new THREE.Vector3()

const Slab = memo(function Slab({
  item,
  world,
  p,
  hot,
  inBuild,
  onHover,
  onPick,
}: {
  item: CatalogItem
  world: World
  p: Palette
  hot: boolean
  inBuild: boolean
  onHover: (item: CatalogItem | null) => void
  onPick: (item: CatalogItem) => void
}) {
  const group = useRef<THREE.Group>(null)
  const face = useMemo(() => faceTexture(item, p), [item, p])
  const spine = useMemo(() => spineTexture(item, p), [item, p])
  const side = `hsl(${item.hue}, 40%, ${p.dark ? 34 : 66}%)`
  const back = `hsl(${item.hue}, 25%, ${p.dark ? 20 : 88}%)`
  const st = useRef<SlabState>({
    init: false,
    pivot: new THREE.Vector3(),
    vel: new THREE.Vector3(),
    angle: 0,
    av: 0,
    scale: 1,
    home: '',
    flight: null,
  })

  useFrame((state, delta) => {
    const g = group.current
    const slot = world.slots.get(item.ref)
    if (!g || !slot) return
    const dt = Math.min(delta, 1 / 30)
    const s = st.current
    const pulled = world.pulled === item.ref
    const home = pulled ? 'pulled' : slot.crate
    let angle: number
    let scale = 1
    if (pulled) {
      angle = -ELEV
      const toCam = tmpUp.copy(world.cam).sub(world.look).normalize()
      const d = world.dist * 0.5
      const vh = world.viewH * 0.5
      const vw = world.viewW * 0.5
      scale = Math.min(1.45, (0.5 * vw) / W, (0.55 * vh) / H)
      tmpTarget.copy(world.look).addScaledVector(toCam, d)
      tmpTarget.x += world.narrow ? 0 : -vw * 0.2
      if (world.narrow) tmpTarget.y += vh * 0.24
      tmpTarget.y -= Math.cos(angle) * (H / 2) * scale
      tmpTarget.z -= Math.sin(angle) * (H / 2) * scale
      angle += Math.sin(state.clock.elapsedTime * 1.6) * 0.03
    } else {
      const fr = frameOf(world, slot.crate)
      const f = world.focus[slot.crate]?.current ?? 0
      const d = slot.index - f
      const n = slot.count
      const k = slot.crate === 'build' ? Math.min(1, (fr.depth - 1.3) / Math.max(1, n * 0.14)) : 1
      const zF = -0.35 - slot.index * 0.14 * k
      const zB = -fr.depth + 0.28 + (n - 1 - slot.index) * 0.11 * k
      const u = smooth(clamp(-d, 0, 1))
      angle = d < 0 ? FLIP * u : BACK * Math.min(1, d)
      const lift = 0.24 * Math.max(0, 1 - Math.abs(d)) + (hot ? 0.07 : 0)
      tmpTarget.set(fr.x, fr.y + (0.06 + lift) * fr.s, fr.front + (zB + (zF - zB) * u) * fr.s)
      scale = fr.s
    }

    if (!s.init) {
      s.init = true
      s.pivot.copy(tmpTarget)
      s.angle = angle
      s.scale = scale
      s.home = home
    }
    if (home !== s.home) {
      const far = s.pivot.distanceTo(tmpTarget)
      s.flight = { t: 0, from: s.pivot.clone(), arc: Math.min(s.home === 'pulled' ? 1.6 : 2.6, 0.9 + far * 0.22), spin: home === 'build' || s.home === 'build' ? Math.PI * 2 : 0 }
      if (home === 'build') tick(500, 0.25)
      s.home = home
    }

    s.av += ((angle - s.angle) * 260 - s.av * 15) * dt
    s.angle += s.av * dt
    s.scale += (scale - s.scale) * (1 - Math.exp(-dt * 9))
    let yaw = 0
    if (s.flight) {
      const fl = s.flight
      fl.t = Math.min(1, fl.t + dt / 0.75)
      const e = fl.t < 0.5 ? 4 * fl.t ** 3 : 1 - (-2 * fl.t + 2) ** 3 / 2
      s.pivot.lerpVectors(fl.from, tmpTarget, e)
      s.pivot.y += Math.sin(Math.PI * fl.t) * fl.arc
      yaw = fl.spin * e
      s.vel.set(0, 0, 0)
      if (fl.t >= 1) s.flight = null
    } else {
      s.vel.addScaledVector(tmpTarget.sub(s.pivot), 210 * dt).multiplyScalar(Math.exp(-19 * dt))
      s.pivot.addScaledVector(s.vel, dt)
    }
    g.position.copy(s.pivot)
    g.rotation.set(s.angle, yaw, 0)
    g.scale.setScalar(s.scale)
  })

  const edge = hot || inBuild ? p.accent : p.border
  return (
    <group ref={group}>
      <mesh
        position={[0, H / 2, 0]}
        castShadow
        onPointerOver={(event) => {
          event.stopPropagation()
          onHover(item)
          document.body.style.cursor = 'pointer'
        }}
        onPointerOut={() => {
          onHover(null)
          document.body.style.cursor = ''
        }}
        onClick={(event) => {
          event.stopPropagation()
          if (!world.dragged) onPick(item)
        }}
      >
        <boxGeometry args={[W, H, T]} />
        <meshStandardMaterial attach="material-0" color={side} roughness={0.9} />
        <meshStandardMaterial attach="material-1" color={side} roughness={0.9} />
        <meshStandardMaterial attach="material-2" map={spine} roughness={0.9} />
        <meshStandardMaterial attach="material-3" color={side} roughness={0.9} />
        <meshStandardMaterial attach="material-4" map={face} roughness={0.75} />
        <meshStandardMaterial attach="material-5" color={back} roughness={0.9} />
        <Edges color={edge} threshold={20} />
      </mesh>
    </group>
  )
})

function Wall({ size, position, color, edge }: { size: [number, number, number]; position: [number, number, number]; color: string; edge: string }) {
  return (
    <mesh position={position} receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} roughness={1} />
      <Edges color={edge} threshold={20} />
    </mesh>
  )
}

function CrateBox({ crate, p, hot }: { crate: Crate; p: Palette; hot: boolean }) {
  const wood = `hsl(${crate.hue}, 20%, ${p.dark ? 15 : 90}%)`
  const edge = hot ? p.accent : p.border
  const D = crate.depth
  const zc = FRONT - D / 2
  const label = useMemo(() => crateLabel(crate.label, String(crate.items.length), crate.hue, p), [crate, p])
  return (
    <group position={[crate.x, 0, 0]}>
      <Wall size={[CRATE_W, 0.06, D]} position={[0, 0.03, zc]} color={wood} edge={edge} />
      <Wall size={[0.06, 0.55, D]} position={[-CRATE_W / 2, 0.275, zc]} color={wood} edge={edge} />
      <Wall size={[0.06, 0.55, D]} position={[CRATE_W / 2, 0.275, zc]} color={wood} edge={edge} />
      <Wall size={[CRATE_W, 0.95, 0.06]} position={[0, 0.475, FRONT - D]} color={wood} edge={edge} />
      <Wall size={[CRATE_W, 0.32, 0.06]} position={[0, 0.16, FRONT]} color={wood} edge={edge} />
      <mesh position={[0, 0.16, FRONT + 0.032]}>
        <planeGeometry args={[CRATE_W - 0.06, 0.3]} />
        <meshBasicMaterial map={label} toneMapped={false} />
      </mesh>
    </group>
  )
}

function BuildCart({ world, p, count, hot }: { world: World; p: Palette; count: number; hot: boolean }) {
  const ref = useRef<THREE.Group>(null)
  const wheels = useRef<THREE.Group>(null)
  const label = useMemo(() => crateLabel('Your build', String(count), 200, p, true), [count, p])
  useFrame(() => {
    if (!ref.current) return
    const prev = ref.current.position.x
    ref.current.position.x = world.buildX
    if (wheels.current) wheels.current.children.forEach((w) => (w.rotation.z -= (world.buildX - prev) / 0.14))
  })
  const D = BUILD_DEPTH
  const front = 0
  const zc = front - D / 2
  const edge = p.accent
  const fill = p.dark ? '#14212a' : '#e4eff5'
  return (
    <group ref={ref} position={[0, 0, CART_Z]} scale={CART}>
      <Wall size={[CRATE_W + 0.3, 0.06, D + 0.3]} position={[0, 0.2, zc]} color={fill} edge={edge} />
      <group position={[0, 0.26, 0]}>
        <Wall size={[CRATE_W, 0.06, D]} position={[0, 0.03, zc]} color={fill} edge={edge} />
        <Wall size={[0.06, 0.7, D]} position={[-CRATE_W / 2, 0.35, zc]} color={fill} edge={edge} />
        <Wall size={[0.06, 0.7, D]} position={[CRATE_W / 2, 0.35, zc]} color={fill} edge={edge} />
        <Wall size={[CRATE_W, 0.95, 0.06]} position={[0, 0.475, front - D]} color={fill} edge={edge} />
        <Wall size={[CRATE_W, 0.32, 0.06]} position={[0, 0.16, front]} color={fill} edge={hot ? p.fg : edge} />
        <mesh position={[0, 0.16, front + 0.032]}>
          <planeGeometry args={[CRATE_W - 0.06, 0.3]} />
          <meshBasicMaterial map={label} toneMapped={false} />
        </mesh>
      </group>
      <group ref={wheels}>
        {[-1, 1].flatMap((sx) =>
          [front - 0.15, front - D + 0.15].map((z) => (
            <mesh key={`${sx}${z}`} position={[sx * (CRATE_W / 2 + 0.16), 0.1, z]}>
              <torusGeometry args={[0.08, 0.025, 8, 20]} />
              <meshStandardMaterial color={p.accent} />
            </mesh>
          )),
        )}
      </group>
    </group>
  )
}

function Backdrop({ world, p }: { world: World; p: Palette }) {
  const ref = useRef<THREE.Mesh>(null)
  const mat = useRef<THREE.MeshBasicMaterial>(null)
  const { camera } = useThree()
  useFrame((_, delta) => {
    if (!ref.current || !mat.current) return
    ref.current.position.copy(world.look).lerp(world.cam, 0.4)
    ref.current.quaternion.copy(camera.quaternion)
    mat.current.opacity += ((world.pulled ? 0.72 : 0) - mat.current.opacity) * (1 - Math.exp(-delta * 8))
    ref.current.visible = mat.current.opacity > 0.01
  })
  return (
    <mesh ref={ref} renderOrder={5}>
      <planeGeometry args={[60, 40]} />
      <meshBasicMaterial ref={mat} color={p.dark ? '#090E11' : '#EDF1F3'} transparent opacity={0} depthWrite={false} toneMapped={false} />
    </mesh>
  )
}

function Shadows({ world }: { world: World }) {
  const ref = useRef<THREE.Group>(null)
  useFrame(() => ref.current?.position.set(world.look.x, 0.005, -0.3))
  return (
    <group ref={ref}>
      <ContactShadows scale={[18, 8]} resolution={512} blur={2.4} opacity={0.38} far={2.5} frames={Infinity} />
    </group>
  )
}

function Scene({
  lab,
  world,
  crates,
  p,
  hover,
  hoverCrate,
  onHover,
  onPick,
}: {
  lab: Lab
  world: World
  crates: Crate[]
  p: Palette
  hover: string | null
  hoverCrate: string | null
  onHover: (item: CatalogItem | null) => void
  onPick: (item: CatalogItem) => void
}) {
  const end = crates[crates.length - 1].x
  return (
    <>
      <Rig world={world} />
      <ambientLight intensity={p.dark ? 1.25 : 1.9} />
      <directionalLight position={[-4, 8, 6]} intensity={p.dark ? 1.0 : 0.9} />
      <mesh position={[end / 2, -0.06, 1.2]}>
        <boxGeometry args={[end + 30, 0.12, 10]} />
        <meshBasicMaterial color={p.table} />
        <Edges color={p.border} threshold={20} />
      </mesh>
      <Shadows world={world} />
      <Backdrop world={world} p={p} />
      {crates.map((crate) => (
        <CrateBox key={crate.id} crate={crate} p={p} hot={hoverCrate === crate.id} />
      ))}
      <BuildCart world={world} p={p} count={lab.selected.size} hot={hoverCrate === 'build'} />
      {lab.catalog.items.map((item) => (
        <Slab
          key={item.ref}
          item={item}
          world={world}
          p={p}
          hot={hover === item.ref}
          inBuild={lab.selected.has(item.ref)}
          onHover={onHover}
          onPick={onPick}
        />
      ))}
    </>
  )
}

const cycles = {
  target: ['existing', 'new'],
  framework: ['next', 'tanstack'],
  database: ['postgres', 'mongodb'],
  packageManager: ['pnpm', 'npm', 'bun'],
  agent: ['none', 'claude', 'codex'],
} as const

function Receipt({ lab }: { lab: Lab }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(lab.command)
      setCopied(true)
      setTimeout(() => setCopied(false), 1400)
    } catch {}
  }
  const titles = lab.catalog.items.filter((item) => lab.selected.has(item.ref))
  const tear = {
    background: 'radial-gradient(circle at 7px 0, transparent 5px, var(--surface) 5.5px) 0 0 / 14px 8px repeat-x',
  }
  return (
    <div className="pointer-events-auto absolute bottom-3 left-3 right-[76px] z-20 drop-shadow-xl md:left-1/2 md:right-auto md:w-[min(720px,calc(100%-200px))] md:-translate-x-1/2">
      <div className="bg-surface px-4 pb-3 pt-3 font-mono text-[11px] text-foreground">
        <div className="flex items-center justify-between gap-2 text-muted">
          <span className="tracking-[0.2em]">PAYLOAD RECORDS · CRATE DIGGER</span>
          <span data-testid="crate-count" className="rounded-sm bg-accent px-1.5 py-0.5 font-semibold text-accent-foreground">
            {lab.selected.size} {lab.selected.size === 1 ? 'ITEM' : 'ITEMS'}
          </span>
        </div>
        <div className="my-2 border-t border-dashed border-border" />
        <div className="hidden max-h-10 flex-wrap gap-x-3 gap-y-0.5 overflow-hidden text-muted md:flex">
          {titles.length ? (
            titles.map((item) => (
              <button key={item.ref} type="button" className="hover:text-foreground hover:line-through" onClick={() => lab.toggle(item.ref)}>
                1× {item.title}
              </button>
            ))
          ) : (
            <span>Bag is empty. Dig a crate, pull a record, add it.</span>
          )}
        </div>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {(Object.keys(cycles) as (keyof typeof cycles)[]).map((key) => {
            const options = cycles[key] as readonly string[]
            const value = lab.setup[key] as string
            return (
              <button
                key={key}
                type="button"
                className="rounded-sm border border-dashed border-border px-1.5 py-0.5 uppercase text-muted hover:border-accent hover:text-foreground"
                onClick={() => lab.set(key, options[(options.indexOf(value) + 1) % options.length] as Setup[typeof key])}
              >
                {key === 'packageManager' ? 'pm' : key}: <span className="text-foreground">{value}</span>
              </button>
            )
          })}
        </div>
        <div className="my-2 border-t border-dashed border-border" />
        <div className="flex items-center gap-3">
          <code className="min-w-0 flex-1 truncate text-[12px]">$ {lab.command}</code>
          <button
            type="button"
            onClick={copy}
            className="relative shrink-0 -rotate-2 rounded-sm bg-accent py-1 pl-4 pr-2.5 text-[11px] font-bold tracking-wider text-accent-foreground shadow transition-transform hover:rotate-0 active:scale-95"
          >
            <span className="absolute left-1.5 top-1/2 size-1.5 -translate-y-1/2 rounded-full bg-surface" />
            {copied ? 'COPIED' : 'COPY'}
          </button>
        </div>
      </div>
      <div className="h-2" style={tear} />
    </div>
  )
}

export default function CrateDigger({ lab }: MockProps) {
  const p = useMemo(() => palette(lab.theme), [lab.theme])
  const crates = useMemo(() => buildCrates(lab), [lab.catalog])
  const [hover, setHover] = useState<CatalogItem | null>(null)
  const [hoverCrate, setHoverCrate] = useState<string | null>(null)
  const [pulled, setPulled] = useState<CatalogItem | null>(null)
  const [active, setActive] = useState(0)
  const tip = useRef<HTMLDivElement>(null)
  const world = useRef<World>(null as unknown as World)
  if (!world.current) {
    const focus: Record<string, Focus> = { build: { target: 0, current: 0, shown: 0 } }
    for (const c of crates) focus[c.id] = { target: 0, current: 0, shown: 0 }
    world.current = {
      focus,
      slots: new Map(),
      crates,
      pulled: null,
      pan: 0,
      panTarget: 0,
      panVel: 0,
      hoverCrate: null,
      dragged: false,
      look: new THREE.Vector3(),
      cam: new THREE.Vector3(),
      viewW: 10,
      viewH: 6,
      dist: 10,
      narrow: false,
      pxW: 1000,
      buildX: 0,
    }
  }
  const w = world.current
  w.pulled = pulled?.ref ?? null

  const counts: Record<string, number> = {}
  w.slots.clear()
  for (const c of crates) {
    const list = c.items.filter((item) => !lab.selected.has(item.ref))
    list.forEach((item, index) => w.slots.set(item.ref, { crate: c.id, index, count: list.length }))
    counts[c.id] = list.length
    w.focus[c.id].target = clamp(w.focus[c.id].target, 0, Math.max(0, list.length - 1))
  }
  lab.setup.items.forEach((ref, index) => w.slots.set(ref, { crate: 'build', index, count: lab.setup.items.length }))
  counts.build = lab.setup.items.length
  w.focus.build.target = clamp(w.focus.build.target, 0, Math.max(0, counts.build - 1))

  const add = (item: CatalogItem) => {
    const next = [...lab.setup.items, item.ref]
    const order = lab.catalog.items.map((entry) => entry.ref)
    next.sort((a, b) => order.indexOf(a) - order.indexOf(b))
    w.focus.build.target = next.indexOf(item.ref)
    lab.toggle(item.ref)
    setPulled(null)
  }

  const onPick = (item: CatalogItem) => {
    ensureAudio()
    setHover(null)
    const slot = w.slots.get(item.ref)
    if (!slot) return
    if (slot.crate === 'build') {
      lab.toggle(item.ref)
      return
    }
    if (w.pulled) {
      setPulled(null)
      return
    }
    const f = w.focus[slot.crate]
    if (Math.round(f.target) === slot.index) setPulled(item)
    else f.target = slot.index
  }

  const nearest = () => {
    let best = 0
    crates.forEach((c, i) => {
      if (Math.abs(c.x - w.panTarget) < Math.abs(crates[best].x - w.panTarget)) best = i
    })
    return best
  }

  useEffect(() => {
    const id = setInterval(() => {
      setActive(nearest())
      setHoverCrate(w.hoverCrate)
    }, 120)
    return () => clearInterval(id)
  }, [])

  const snap = useRef(0)
  const nudge = (crate: string, by: number) => {
    const f = w.focus[crate]
    f.target = clamp(f.target + by, 0, Math.max(0, counts[crate] - 1))
    clearTimeout(snap.current)
    snap.current = window.setTimeout(() => (f.target = Math.round(f.target)), 160)
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.shiftKey || event.target instanceof HTMLInputElement) return
      const crate = crates[nearest()]
      if (w.pulled) {
        if (event.key === 'Escape') setPulled(null)
        if (event.key === 'Enter') {
          const item = lab.catalog.items.find((entry) => entry.ref === w.pulled)
          if (item) add(item)
        }
        return
      }
      if (event.key === 'ArrowDown') nudge(crate.id, 1)
      if (event.key === 'ArrowUp') nudge(crate.id, -1)
      if (event.key === 'ArrowRight') w.panTarget = crates[Math.min(crates.length - 1, nearest() + 1)].x
      if (event.key === 'ArrowLeft') w.panTarget = crates[Math.max(0, nearest() - 1)].x
      if (event.key === 'Enter') {
        const index = Math.round(w.focus[crate.id].target)
        const item = crate.items.find((entry) => w.slots.get(entry.ref)?.crate === crate.id && w.slots.get(entry.ref)?.index === index)
        if (item) setPulled(item)
      }
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  })

  const drag = useRef<{ x: number; y: number; crate: string | null; focus: number; pan: number } | null>(null)

  return (
    <div
      className="relative h-full w-full select-none overflow-hidden overscroll-none"
      onWheel={(event) => {
        if (w.pulled) return
        const crate = w.hoverCrate
        if (crate && Math.abs(event.deltaY) >= Math.abs(event.deltaX)) nudge(crate, event.deltaY / 55)
        else w.panTarget += (event.deltaX || event.deltaY) * 0.012
      }}
      onPointerDown={(event) => {
        ensureAudio()
        w.dragged = false
        const crate = w.pulled ? null : w.hoverCrate
        drag.current = { x: event.clientX, y: event.clientY, crate, focus: crate ? w.focus[crate].target : 0, pan: w.panTarget }
      }}
      onPointerMove={(event) => {
        if (tip.current) tip.current.style.transform = `translate(${event.clientX + 14}px, ${event.clientY + 16}px)`
        const d = drag.current
        if (!d) return
        const dx = event.clientX - d.x
        const dy = event.clientY - d.y
        if (Math.hypot(dx, dy) > 6) w.dragged = true
        if (!w.dragged) return
        if (d.crate) w.focus[d.crate].target = clamp(d.focus + dy / 38, 0, Math.max(0, counts[d.crate] - 1))
        else w.panTarget = d.pan - dx * (w.viewW / w.pxW)
      }}
      onPointerUp={() => {
        const d = drag.current
        if (d?.crate) w.focus[d.crate].target = Math.round(w.focus[d.crate].target)
        drag.current = null
      }}
    >
      <Canvas
        dpr={[1, 2]}
        camera={{ fov: FOV, position: [0, 5, 10] }}
        gl={{ antialias: true, toneMapping: THREE.NoToneMapping }}
        onPointerMissed={() => {
          if (!w.dragged && w.pulled) setPulled(null)
        }}
      >
        <Scene lab={lab} world={w} crates={crates} p={p} hover={hover?.ref ?? null} hoverCrate={hoverCrate} onHover={setHover} onPick={onPick} />
      </Canvas>

      <div className="pointer-events-auto absolute left-3 right-3 top-[68px] z-10 flex items-center gap-1 overflow-x-auto pb-1 text-[11px] md:right-auto md:max-w-[calc(100%-24px)]">
        <span className="mr-1 shrink-0 font-mono tracking-[0.2em] text-muted">AISLE</span>
        {crates.map((crate, i) => (
          <button
            key={crate.id}
            type="button"
            onClick={() => (w.panTarget = crate.x)}
            className={`flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 transition-colors ${
              i === active ? 'border-accent bg-surface text-foreground' : 'border-border/70 text-muted hover:text-foreground'
            }`}
          >
            <span className="size-1.5 rounded-full" style={{ background: `hsl(${crate.hue} 50% 55%)` }} />
            {crate.label}
            <span className="opacity-60">{counts[crate.id]}</span>
          </button>
        ))}
      </div>
      <div className="pointer-events-none absolute left-4 top-[106px] z-10 hidden font-mono text-[10px] leading-relaxed text-muted md:block">
        scroll / drag over a crate to dig · click the lifted record to pull it
        <br />
        ←→ walk the aisle · ↑↓ riffle · enter pull · click a record in the cart to put it back
      </div>

      <div ref={tip} className="pointer-events-none fixed left-0 top-0 z-30">
        {hover && !pulled && (
          <div className="rounded-md border border-border bg-surface px-2 py-1 text-xs shadow-lg">
            <div className="font-medium text-foreground">{hover.title}</div>
            <div className="text-[10px] text-muted">
              {lab.selected.has(hover.ref) ? 'In your build · click to put back' : `${hover.label} · click to dig / pull`}
            </div>
          </div>
        )}
      </div>

      {pulled && (
        <div className="pointer-events-auto absolute bottom-[250px] left-3 right-3 z-20 rounded-lg border border-border bg-surface/95 p-4 shadow-2xl backdrop-blur md:bottom-auto md:left-auto md:right-[7%] md:top-1/2 md:w-[320px] md:-translate-y-1/2">
          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-muted">
            <span className="size-2 rounded-full" style={{ background: `hsl(${pulled.hue} 50% 55%)` }} />
            {pulled.label} · {pulled.kind}
          </div>
          <div className="mt-2 text-lg font-semibold leading-tight">{pulled.title}</div>
          <p className="mt-1.5 text-sm text-muted">{pulled.description}</p>
          <div className="mt-2 truncate font-mono text-[10px] text-muted">{pulled.ref}</div>
          <div className="mt-4 flex gap-2">
            <button type="button" className="flex-1 rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-foreground active:scale-95" onClick={() => add(pulled)}>
              Add to build
            </button>
            <button type="button" className="rounded-md border border-border px-3 py-2 text-sm text-muted hover:text-foreground" onClick={() => setPulled(null)}>
              Put back
            </button>
          </div>
        </div>
      )}

      <Receipt lab={lab} />
    </div>
  )
}
