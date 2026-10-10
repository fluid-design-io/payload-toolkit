import { useFrame, useThree } from '@react-three/fiber'
import { Edges, Line } from '@react-three/drei'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  AdditiveBlending, BoxGeometry, BufferGeometry, CanvasTexture, Color, DoubleSide, Float32BufferAttribute, Group,
  InstancedMesh, LineBasicMaterial, LineSegments, Matrix4, Mesh, MeshBasicMaterial, Object3D, PerspectiveCamera, Plane, Points, Quaternion,
  SRGBColorSpace, Texture, TextureLoader, Vector3,
} from 'three'
import type { BufferAttribute, Material } from 'three'

import { agents, databases, frameworks } from '../../../../workspace/-workspace/workspace.constants'
import type { Lab } from '../../lab.types'
import {
  ACCENT, BASE, BELT, BOARD, BW, CHIP, CHIPS, CW, DECK, DOCK, FRONT, H0, L1, L2, LV, OUTBOX, PAINT, PITCH, RD, SLOTS, SW, TOP, TOTE, Y0, Z0,
  clamp, followPose, inRack, padOf, smooth, step, turn,
} from './sim'
import type { AisleLayout, Layout, Part, PickerKind, Pose, Sim } from './sim'

export type Fx = {
  near: number
  close: number
  query: Set<string> | null
  queryVersion: number
  hover: Part | null
  clip: Plane
  cut: number
  label: number
}

export type Colors = ReturnType<typeof palette>
export function palette(theme: Lab['theme'], night: boolean) {
  if (night)
    return { dark: true, bg: '#05080A', floor: '#080D10', surface: '#0E151A', fg: '#E6EDF0', muted: '#71808A', edge: '#3D4C55', dim: '#1F2B33', board: '#0C1418', paper: '#121A1F', l: 36, s: 40, tote: 20, toteS: 34, night: true }
  return theme === 'dark'
    ? { dark: true, bg: '#090E11', floor: '#0D1317', surface: '#1B2327', fg: '#FCFCFC', muted: '#8A9094', edge: '#56636A', dim: '#2C383F', board: '#141D22', paper: '#171D20', l: 42, s: 34, tote: 26, toteS: 30, night: false }
    : { dark: false, bg: '#EDF1F3', floor: '#E7ECEF', surface: '#FFFFFF', fg: '#1D2225', muted: '#727C81', edge: '#9AA4A9', dim: '#C9D1D5', board: '#F5F9FB', paper: '#FFFFFF', l: 64, s: 46, tote: 79, toteS: 50, night: false }
}
export const tint = (hue: number, c: Colors, l = c.l) => `hsl(${hue}, ${c.s}%, ${l}%)`
const FONT = '"Timeless Grotesk", ui-sans-serif, system-ui, sans-serif'
const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace'

function textTexture(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  draw(canvas.getContext('2d')!)
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 8
  return texture
}

const loader = new TextureLoader()
const textures = new Map<string, Texture | null>()
function screenshot(url: string | undefined): Texture | null {
  if (!url) return null
  if (textures.has(url)) return textures.get(url)!
  textures.set(url, null)
  loader.load(url, (t) => {
    t.colorSpace = SRGBColorSpace
    t.anisotropy = 8
    const image = t.image as HTMLImageElement
    const aspect = image.height / image.width
    const want = TOTE.y / TOTE.z
    if (aspect > want) {
      t.repeat.set(1, want / aspect)
      t.offset.set(0, 1 - want / aspect)
    }
    textures.set(url, t)
  })
  return null
}
const imageOf = (p: Part, theme: Lab['theme']) => (theme === 'dark' ? (p.item.imageDark ?? p.item.image) : p.item.image)

export type Tip = { show: (e: PointerEvent, title: string, sub: string, code?: string, image?: string) => void; move: (e: PointerEvent) => void; hide: () => void }

function Box({ size, color, edge, position, children, opacity }: {
  size: [number, number, number]; color: string; edge: string; position?: [number, number, number]; children?: ReactNode; opacity?: number
}) {
  return (
    <mesh position={position}>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} roughness={1} transparent={opacity !== undefined} opacity={opacity ?? 1} />
      <Edges color={edge} />
      {children}
    </mesh>
  )
}

function segments(points: number[], color: string, opacity = 1, clip?: Plane) {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(points, 3))
  return new LineSegments(geometry, new LineBasicMaterial({ color, transparent: true, opacity, clippingPlanes: clip ? [clip] : null }))
}

const DEFAULT_AZ = 0.62
const DEFAULT_EL = 0.6

export function fitPose(L: Layout, width: number, height: number, inset: number, plan: boolean): Pose {
  const aspect = (width - inset) / height
  const az = plan ? 0 : DEFAULT_AZ
  const el = plan ? 1.53 : DEFAULT_EL
  const dir = new Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el))
  const right = new Vector3(Math.cos(az), 0, -Math.sin(az))
  const up = new Vector3().crossVectors(dir, right).negate()
  const pts = [
    ...L.aisles.flatMap((a) => [[a.x0, 0, Z0 + 1], [a.x0 + PITCH, 0, a.z1], [a.x0, TOP + 1.6, a.z1], [a.x0 + PITCH, TOP + 1.6, Z0 + 1]]),
    [-11, 0, 8], [-11, 0, FRONT], [DOCK.x + 3, 0, FRONT + 1.5], [DOCK.x + 3, 4.4, FRONT + 1], [16, 0, 6],
  ].map(([x, y, z]) => new Vector3(x, y, z))
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
  for (const p of pts) {
    x0 = Math.min(x0, p.dot(right)); x1 = Math.max(x1, p.dot(right))
    y0 = Math.min(y0, p.dot(up)); y1 = Math.max(y1, p.dot(up))
  }
  const size = Math.max(((y1 - y0) / 2) * 1.04, ((x1 - x0) / 2 / aspect) * 1.02)
  const shift = (inset / 2) * ((2 * size) / height)
  const target = right.clone().multiplyScalar((x0 + x1) / 2 - shift).addScaledVector(up, (y0 + y1) / 2)
  return { target, size, az, el, fov: 24 }
}

export function aislePose(a: AisleLayout): Pose {
  const len = Math.min(Math.max(a.aisle.bays, 1) * BW, 20)
  return { target: new Vector3(a.face + 0.3, 1.6, Z0 - len / 2), size: clamp(len * 0.26, 2.6, 6), az: 1.22, el: 0.34, fov: 32 }
}

function cutFor(sim: Sim): number {
  const open = sim.L.x1 + 12
  const following = sim.follow.on && sim.follow.ref && sim.time - sim.follow.since >= 1.3 ? sim.parts.get(sim.follow.ref) : undefined
  const k = following?.picker
  if (k && sim.kind !== 'drone') {
    if (k.pos.z > -0.2) return open
    const a = sim.L.aisles.find((a) => Math.abs(a.cx - k.pos.x) < PITCH / 2)
    return a ? a.x0 + PITCH + 0.02 : open
  }
  if (following) return open
  if (sim.baseKind === 'aisle') {
    const t = sim.base.target
    const a = sim.L.aisles.find((a) => Math.abs(a.face - t.x) < PITCH / 2)
    return a ? a.x0 + PITCH + 0.02 : open
  }
  return open
}

export function CameraRig({ sim, fx }: { sim: Sim; fx: Fx }) {
  const { camera, size } = useThree()
  const dir = useMemo(() => new Vector3(), [])
  useFrame((_, dt) => {
    const cam = sim.cam
    const want = followPose(sim) ?? sim.base
    const k = 1 - Math.exp(-dt * 2.4)
    cam.target.lerp(want.target, k)
    cam.size = Math.exp(Math.log(cam.size) + (Math.log(want.size) - Math.log(cam.size)) * k)
    cam.az += turn(cam.az, want.az) * (1 - Math.exp(-dt * 2))
    cam.el += (want.el - cam.el) * k
    cam.fov += (want.fov - cam.fov) * k
    const dist = cam.size / Math.tan((cam.fov * Math.PI) / 360)
    dir.set(Math.sin(cam.az) * Math.cos(cam.el), Math.sin(cam.el), Math.cos(cam.az) * Math.cos(cam.el))
    const pc = camera as PerspectiveCamera
    pc.position.copy(cam.target).addScaledVector(dir, dist)
    pc.fov = cam.fov
    pc.near = Math.max(0.05, dist * 0.02)
    pc.far = dist * 4 + 400
    pc.up.set(0, 1, 0)
    pc.lookAt(cam.target)
    pc.updateProjectionMatrix()
    const binPx = (TOTE.z / (2 * cam.size)) * size.height
    const cut = cutFor(sim)
    fx.cut += (cut - fx.cut) * (1 - Math.exp(-dt * (cut > fx.cut ? 1.6 : 3)))
    fx.clip.constant = fx.cut
    fx.near = smooth(3.6, 5, binPx)
    fx.label = 1 - smooth(8, 11, binPx)
    fx.close = smooth(15, 22, binPx)
  })
  return null
}

export function LabelProjector({ L, fx, els }: { L: Layout; fx: Fx; els: { current: (HTMLDivElement | null)[] } }) {
  const { camera, size } = useThree()
  const v = useMemo(() => new Vector3(), [])
  useFrame(() => {
    const show = fx.label
    const xs = L.aisles.map((a) => {
      v.set(a.x0 + PITCH / 2, TOP + 0.4, Z0 + 0.2).project(camera)
      return [((v.x + 1) / 2) * size.width, ((1 - v.y) / 2) * size.height] as const
    })
    let gap = Infinity
    for (let i = 1; i < xs.length; i++) gap = Math.min(gap, Math.hypot(xs[i][0] - xs[i - 1][0], (xs[i][1] - xs[i - 1][1]) * 0.4))
    const rows = clamp(Math.ceil(118 / Math.max(gap, 1)), 2, 5)
    L.aisles.forEach((_, i) => {
      const el = els.current[i]
      if (!el) return
      if (show < 0.02) {
        el.style.opacity = '0'
        el.style.pointerEvents = 'none'
        return
      }
      const [x, y] = xs[i]
      el.style.transform = `translate(${x}px, ${y - 20 - (i % rows) * 26}px) translate(-50%, -100%)`
      el.style.opacity = String(show)
      el.style.pointerEvents = show > 0.5 ? 'auto' : 'none'
      ;(el.lastElementChild as HTMLElement).style.height = `${12 + (i % rows) * 26}px`
    })
  })
  return null
}

export function Simulator({ sim, labRef }: { sim: Sim; labRef: { current: Lab } }) {
  useFrame((_, dt) => step(sim, labRef.current, Math.min(dt, 0.1)))
  return null
}

function useLayers(c: Colors, L: Layout, clip: Plane) {
  return useMemo(() => {
    const rack: number[] = []
    const far: number[] = []
    const outline: number[] = []
    const paint: number[] = []
    const dash: number[] = []
    const walls: number[] = []
    const seg = (out: number[], a: number[], b: number[]) => out.push(a[0], a[1], a[2], b[0], b[1], b[2])
    const dashed = (a: number[], b: number[], on = 0.5, off = 0.35) => {
      const len = Math.hypot(b[0] - a[0], b[2] - a[2])
      for (let t = 0; t < len; t += on + off) {
        const t1 = Math.min(len, t + on)
        const p = (s: number) => [a[0] + ((b[0] - a[0]) * s) / len, a[1], a[2] + ((b[2] - a[2]) * s) / len]
        seg(dash, p(t), p(t1))
      }
    }
    for (const a of L.aisles) {
      const xs = [a.x0, a.face]
      for (let k = 0; k <= a.bays; k++) {
        const z = Z0 - k * BW
        for (const x of xs) seg(rack, [x, 0, z], [x, TOP, z])
        seg(rack, [a.x0, 0.12, z], [a.face, 0.12, z])
        for (let j = 0; j < 4; j++) {
          const y0 = 0.12 + j * ((TOP - 0.2) / 4)
          const y1 = y0 + (TOP - 0.2) / 4
          seg(rack, j % 2 ? [a.x0, y0, z] : [a.face, y0, z], j % 2 ? [a.face, y1, z] : [a.x0, y1, z])
        }
        if (k === a.bays) continue
        for (let j = 0; j <= 5; j++) {
          const y = Y0 + j * LV
          for (const x of xs) seg(rack, [x, y, z], [x, y, z - BW])
        }
      }
      for (let k = 0; k <= a.bays; k++) seg(far, [a.face, 0, Z0 - k * BW], [a.face, TOP, Z0 - k * BW])
      for (const y of [0, TOP]) {
        seg(far, [a.face, y, Z0], [a.face, y, a.z1])
        seg(far, [a.x0, y, Z0], [a.x0, y, a.z1])
        seg(far, [a.x0, y, Z0], [a.face, y, Z0])
        seg(far, [a.x0, y, a.z1], [a.face, y, a.z1])
      }
      seg(far, [a.x0, 0, Z0], [a.x0, TOP, Z0]); seg(far, [a.x0, 0, a.z1], [a.x0, TOP, a.z1])
      let bay = 0
      for (const r of a.aisle.racks) {
        const z = Z0 - bay * BW
        seg(rack, [a.face + 0.03, 0, z - 0.03], [a.face + 0.03, TOP, z - 0.03])
        bay += r.bays
      }
      for (const r of a.aisle.racks)
        for (const b of r.bins) {
          const x = a.face + 0.004
          const y0 = Y0 + (b.level - 1) * LV + 0.02
          const y1 = y0 + TOTE.y
          const z0 = Z0 - (b.bay - 1) * BW - b.slot * SW - (SW - TOTE.z) / 2
          const z1 = z0 - TOTE.z
          seg(outline, [x, y0, z0], [x, y1, z0]); seg(outline, [x, y1, z0], [x, y1, z1])
          seg(outline, [x, y1, z1], [x, y0, z1]); seg(outline, [x, y0, z1], [x, y0, z0])
        }
      seg(paint, [a.face + 0.18, 0.005, Z0 + 0.2], [a.face + 0.18, 0.005, a.z1])
      seg(paint, [a.x0 + PITCH - 0.14, 0.005, Z0 + 0.2], [a.x0 + PITCH - 0.14, 0.005, a.z1])
    }
    seg(paint, [L.x0 + 0.5, 0.005, -0.35], [L.x1 - 0.5, 0.005, -0.35])
    seg(paint, [L.x0 + 0.5, 0.005, 5.5], [L.x1 - 0.5, 0.005, 5.5])
    dashed([L.x0 + 0.5, 0.005, 2.6], [L.x1 - 0.5, 0.005, 2.6], 1.2, 0.8)
    for (const z of L.zones) {
      dashed([z.x0, 0.006, -0.1], [z.x0, 0.006, z.z1])
      dashed([z.x1, 0.006, -0.1], [z.x1, 0.006, z.z1])
      dashed([z.x0, 0.006, z.z1], [z.x1, 0.006, z.z1])
    }
    const cell = [[-6.8, 6.1], [16.2, 6.1], [16.2, 16.6], [-6.8, 16.6]]
    cell.forEach((p, i) => dashed([p[0], 0.006, p[1]], [cell[(i + 1) % 4][0], 0.006, cell[(i + 1) % 4][1]], 0.7, 0.4))
    for (let i = 0; i < 8; i++) {
      const p = padOf(i)
      const r = [[p.x - 0.7, p.z - 0.8], [p.x + 0.7, p.z - 0.8], [p.x + 0.7, p.z + 0.8], [p.x - 0.7, p.z + 0.8]]
      r.forEach((q, j) => seg(paint, [q[0], 0.006, q[1]], [r[(j + 1) % 4][0], 0.006, r[(j + 1) % 4][1]]))
    }
    const H = 7.5
    for (let x = L.x0; x <= L.x1 + 0.01; x += (L.x1 - L.x0) / Math.round((L.x1 - L.x0) / 7)) seg(walls, [x, 0, L.zBack], [x, H, L.zBack])
    for (let z = L.zBack; z <= FRONT + 0.01; z += (FRONT - L.zBack) / Math.round((FRONT - L.zBack) / 7)) seg(walls, [L.x0, 0, z], [L.x0, H, z])
    seg(walls, [L.x0, H, L.zBack], [L.x1, H, L.zBack]); seg(walls, [L.x0, H, L.zBack], [L.x0, H, FRONT])
    seg(walls, [L.x0, 5.2, L.zBack], [L.x1, 5.2, L.zBack]); seg(walls, [L.x0, 5.2, L.zBack], [L.x0, 5.2, FRONT])
    seg(walls, [L.x0, 0, FRONT], [L.x1, 0, FRONT]); seg(walls, [L.x1, 0, L.zBack], [L.x1, 0, FRONT])
    return {
      rack: segments(rack, c.edge, 1, clip),
      far: segments(far, c.edge, 1, clip),
      outline: segments(outline, c.edge, 0.55, clip),
      paint: segments(paint, PAINT, c.night ? 0.7 : 0.85),
      dash: segments(dash, PAINT, c.night ? 0.55 : 0.7),
      walls: segments(walls, c.edge, 0.6),
    }
  }, [c, L, clip])
}

export function Building({ L, c, fx, lab, tip }: { L: Layout; c: Colors; fx: Fx; lab: Lab; tip: Tip }) {
  const layers = useLayers(c, L, fx.clip)
  const labelMats = useRef<(MeshBasicMaterial | null)[]>([])
  labelMats.current = []
  useFrame(() => {
    for (const m of labelMats.current) if (m) m.opacity = 1 - fx.close * 0.75
    const near = fx.near
    ;(layers.rack.material as Material).opacity = near * 0.95
    layers.rack.visible = near > 0.01
    ;(layers.far.material as Material).opacity = (1 - near) * (fx.query ? 0.45 : 0.9)
    layers.far.visible = near < 0.99
    ;(layers.outline.material as Material).opacity = near * 0.5
    layers.outline.visible = near > 0.01
  })
  const floorLabels = useMemo(
    () =>
      L.aisles.map((a) => {
        const len = Math.min(a.len - 0.6, 9)
        const w = Math.round(len * 64)
        const h = Math.round(CW * 0.5 * 64)
        return {
          a,
          len,
          texture: textTexture(w, h, (ctx) => {
            ctx.fillStyle = tint(a.aisle.hue, c, c.night ? 56 : c.l - 6)
            ctx.font = `600 ${h * 0.78}px ${FONT}`
            ctx.textBaseline = 'middle'
            ctx.fillText(String(a.aisle.no).padStart(2, '0'), 8, h * 0.54)
            const nw = ctx.measureText('00').width + 30
            ctx.fillStyle = c.night ? '#8A9AA3' : c.muted
            ctx.font = `500 ${h * 0.4}px ${FONT}`
            ctx.fillText(a.aisle.label.toUpperCase(), nw, h * 0.36)
            ctx.font = `400 ${h * 0.26}px ${MONO}`
            ctx.fillText(`${a.aisle.count} SKU · ${a.aisle.racks.length} RACK${a.aisle.racks.length > 1 ? 'S' : ''}`, nw, h * 0.76)
          }),
        }
      }),
    [L, c],
  )
  const zoneLetters = useMemo(
    () =>
      L.zones.map((z) => {
        const width = Math.min(z.x1 - z.x0 - 0.3, 18)
        const height = 4.4
        const px = 72
        const w = Math.round(width * px), h = Math.round(height * px)
        const zone = L.aisles.filter((a) => a.aisle.zone === z.id)
        const count = zone.reduce((s, a) => s + a.aisle.count, 0)
        return {
          z,
          width,
          height,
          texture: textTexture(w, h, (ctx) => {
            ctx.strokeStyle = PAINT
            ctx.globalAlpha = c.night ? 0.75 : 0.9
            ctx.lineWidth = 5
            const size = Math.min(h * 0.92, w * 1.15)
            ctx.font = `700 ${size}px ${FONT}`
            ctx.textBaseline = 'alphabetic'
            const lw = ctx.measureText(z.id).width
            const x = width > 7 ? 10 : (w - lw) / 2
            ctx.strokeText(z.id, x, h * 0.86)
            ctx.fillStyle = c.floor
            for (let k = 1; k < 3; k++) ctx.fillRect(x + (lw * k) / 3 - 4, 0, 8, h)
            ctx.fillStyle = PAINT
            ctx.globalAlpha = c.night ? 0.7 : 0.85
            if (width > 7) {
              ctx.font = `600 ${h * 0.16}px ${FONT}`
              ctx.fillText(`ZONE ${z.id}`, x + lw + 30, h * 0.42)
              ctx.font = `500 ${h * 0.11}px ${FONT}`
              ctx.fillText(`${z.label.toUpperCase()} · ${count.toLocaleString()} SKU · ${zone.length} AISLES`, x + lw + 30, h * 0.62)
            }
          }),
        }
      }),
    [L, c],
  )
  const floorW = L.x1 - L.x0
  const floorD = FRONT - L.zBack
  return (
    <group>
      <mesh position={[(L.x0 + L.x1) / 2, -0.01, (L.zBack + FRONT) / 2]} rotation={[-Math.PI / 2, 0, 0]} onPointerMove={() => tip.hide()}>
        <planeGeometry args={[floorW, floorD]} />
        <meshStandardMaterial color={c.floor} roughness={1} />
      </mesh>
      <mesh position={[(L.x0 + L.x1) / 2, 3.75, L.zBack]}>
        <planeGeometry args={[floorW, 7.5]} />
        <meshBasicMaterial color={c.floor} transparent opacity={0.5} />
      </mesh>
      <mesh position={[L.x0, 3.75, (L.zBack + FRONT) / 2]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[floorD, 7.5]} />
        <meshBasicMaterial color={c.floor} transparent opacity={0.5} />
      </mesh>
      <primitive object={layers.rack} />
      <primitive object={layers.far} />
      <primitive object={layers.outline} />
      <primitive object={layers.paint} />
      <primitive object={layers.dash} />
      <primitive object={layers.walls} />
      {floorLabels.map(({ a, len, texture }) => (
        <group key={a.aisle.id} position={[a.cx, 0.008, Z0 - 0.3 - len / 2]} rotation={[0, Math.PI / 2, 0]}>
          <mesh
            rotation={[-Math.PI / 2, 0, 0]}
            onClick={(e) => { if (e.delta > 6) return; e.stopPropagation(); lab.setFocus({ category: a.aisle.id }) }}
            onPointerOver={(e) => { e.stopPropagation(); tip.show(e.nativeEvent, `Aisle ${String(a.aisle.no).padStart(2, '0')} · ${a.aisle.label}`, `${a.aisle.count} SKU · click to walk the aisle`) }}
            onPointerMove={(e) => tip.move(e.nativeEvent)}
            onPointerOut={() => tip.hide()}
          >
            <planeGeometry args={[len, CW * 0.5]} />
            <meshBasicMaterial ref={(m) => { labelMats.current.push(m) }} map={texture} transparent depthWrite={false} toneMapped={false} />
          </mesh>
        </group>
      ))}
      {zoneLetters.map(({ z, width, height, texture }) => (
        <mesh key={z.id} position={[z.x0 + 0.15 + width / 2, 0.007, 2.6]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[width, height]} />
          <meshBasicMaterial map={texture} transparent depthWrite={false} toneMapped={false} />
        </mesh>
      ))}
      <Silhouettes L={L} c={c} fx={fx} lab={lab} tip={tip} />
    </group>
  )
}

function Silhouettes({ L, c, fx, lab, tip }: { L: Layout; c: Colors; fx: Fx; lab: Lab; tip: Tip }) {
  const group = useRef<Group>(null)
  const items = useMemo(
    () =>
      L.aisles.map((a) => {
        const geometry = new BoxGeometry(RD, TOP, a.len)
        const fill = new MeshBasicMaterial({ color: `hsl(${a.aisle.hue}, ${c.dark ? 30 : 52}%, ${c.night ? 20 : c.dark ? 24 : 80}%)`, transparent: true, depthWrite: false, clippingPlanes: [fx.clip] })
        return { a, geometry, fill }
      }),
    [L, c, fx.clip],
  )
  useFrame(() => {
    const far = 1 - fx.near
    if (group.current) group.current.visible = far > 0.01
    const dim = fx.query ? 0.35 : 1
    for (const it of items) it.fill.opacity = far * (c.dark ? 0.55 : 0.8) * dim
  })
  return (
    <group ref={group}>
      {items.map(({ a, geometry, fill }) => (
        <group key={a.aisle.id} position={[a.x0 + RD / 2, TOP / 2, Z0 - a.len / 2]}>
          <mesh
            geometry={geometry}
            material={fill}
            onClick={(e) => { if (e.delta > 6 || fx.near > 0.5) return; e.stopPropagation(); lab.setFocus({ category: a.aisle.id }) }}
            onPointerOver={(e) => {
              if (fx.near > 0.5) return
              e.stopPropagation()
              const hits = fx.query ? a.aisle.racks.reduce((s, r) => s + r.bins.filter((b) => fx.query!.has(b.item.ref)).length, 0) : null
              tip.show(e.nativeEvent, `Aisle ${String(a.aisle.no).padStart(2, '0')} · ${a.aisle.label}`, `${hits !== null ? `${hits} of ` : ''}${a.aisle.count} SKU in ${a.aisle.racks.length} rack${a.aisle.racks.length > 1 ? 's' : ''} · click to fly in`)
            }}
            onPointerMove={(e) => tip.move(e.nativeEvent)}
            onPointerOut={() => tip.hide()}
          />
        </group>
      ))}
    </group>
  )
}

export function Signs({ L, c, fx, sim, lab }: { L: Layout; c: Colors; fx: Fx; sim: Sim; lab: Lab }) {
  const { camera } = useThree()
  const groups = useRef<(Group | null)[]>([])
  const mats = useRef<(MeshBasicMaterial | null)[]>([])
  const [version, setVersion] = useState(0)
  const seen = useRef(0)
  useFrame(() => {
    if (seen.current !== fx.queryVersion) {
      seen.current = fx.queryVersion
      setVersion(fx.queryVersion)
    }
    const tilt = -clamp((sim.cam.el - 0.62) * 1.6, 0, 1.45)
    groups.current.forEach((g, i) => {
      if (!g) return
      g.rotation.x = tilt
      g.getWorldPosition(v0)
      const near = clamp((v0.distanceTo(camera.position) - 5) / 6, 0, 1)
      const o = (1 - fx.label) * near
      g.visible = o > 0.02
      const m = mats.current[i]
      if (m) m.opacity = o
    })
  })
  const textures = useMemo(
    () =>
      L.aisles.map((a) => {
        const hits = fx.query ? a.aisle.racks.reduce((s, r) => s + r.bins.filter((b) => fx.query!.has(b.item.ref)).length, 0) : null
        return textTexture(640, 200, (ctx) => {
          ctx.fillStyle = c.surface
          ctx.fillRect(0, 0, 640, 200)
          ctx.fillStyle = tint(a.aisle.hue, c, c.night ? 55 : c.l)
          ctx.fillRect(0, 0, 640, 18)
          ctx.strokeStyle = c.edge
          ctx.lineWidth = 4
          ctx.strokeRect(2, 2, 636, 196)
          ctx.fillStyle = c.fg
          ctx.font = `600 116px ${FONT}`
          ctx.textBaseline = 'alphabetic'
          ctx.fillText(String(a.aisle.no).padStart(2, '0'), 22, 158)
          ctx.fillStyle = c.fg
          ctx.font = `500 46px ${FONT}`
          const label = a.aisle.label.length > 13 ? `${a.aisle.label.slice(0, 12)}…` : a.aisle.label
          ctx.fillText(label, 192, 98)
          ctx.fillStyle = hits !== null && hits > 0 ? ACCENT : c.muted
          ctx.font = `400 32px ${FONT}`
          ctx.fillText(hits !== null ? `${hits} of ${a.aisle.count} match` : `${a.aisle.count} SKU · ${a.aisle.bays} bay${a.aisle.bays > 1 ? 's' : ''}`, 192, 150)
          ctx.fillStyle = c.muted
          ctx.font = `600 28px ${MONO}`
          ctx.textAlign = 'right'
          ctx.fillText(`${a.aisle.zone}${String(a.aisle.no).padStart(2, '0')}`, 618, 58)
        })
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [L, c, version],
  )
  return (
    <group>
      {L.aisles.map((a, i) => {
        const w = PITCH - 0.34
        const x = a.x0 + PITCH / 2 - 0.05
        return (
          <group key={a.aisle.id} position={[x, 4.4, Z0 + 0.5]}>
            <group ref={(g) => { groups.current[i] = g }}>
              <mesh
                position={[0, -0.5, 0]}
                onClick={(e) => { if (e.delta > 6) return; e.stopPropagation(); lab.setFocus({ category: a.aisle.id }) }}
              >
                <planeGeometry args={[w, w * (200 / 640)]} />
                <meshBasicMaterial ref={(m) => { mats.current[i] = m }} map={textures[i]} toneMapped={false} side={DoubleSide} transparent clippingPlanes={[fx.clip]} />
              </mesh>
              <Line points={[[-w / 2 + 0.2, -0.5 + (w * 100) / 640, 0], [-w / 2 + 0.2, 3, 0]]} color={c.edge} lineWidth={1} />
              <Line points={[[w / 2 - 0.2, -0.5 + (w * 100) / 640, 0], [w / 2 - 0.2, 3, 0]]} color={c.edge} lineWidth={1} />
            </group>
          </group>
        )
      })}
    </group>
  )
}

const m4 = new Matrix4()
const q0 = new Quaternion()
const v0 = new Vector3()
const v1 = new Vector3()
const col = new Color()

export function Bins({ sim, fx, c, lab, tip }: { sim: Sim; fx: Fx; c: Colors; lab: Lab; tip: Tip }) {
  const mesh = useRef<InstancedMesh>(null)
  const lights = useRef<InstancedMesh>(null)
  const hover = useRef<Mesh>(null)
  const key = useRef('')
  const colorKey = useRef('')
  const list = sim.list
  useFrame(() => {
    const m = mesh.current
    if (!m) return
    const far = fx.near < 0.5
    const k = `${sim.binVersion}|${fx.queryVersion}|${far}`
    if (k !== key.current) {
      key.current = k
      list.forEach((p, i) => {
        const show = inRack(p) && (!far || !fx.query || fx.query.has(p.item.ref))
        v0.copy(TOTE).multiplyScalar(show ? 1 : 0)
        if (show && far) v0.multiplyScalar(1.6)
        m.setMatrixAt(i, m4.compose(p.home, q0, v0))
      })
      m.instanceMatrix.needsUpdate = true
      m.computeBoundingSphere()
    }
    const ck = `${fx.queryVersion}|${c.bg}|${c.night}`
    if (ck !== colorKey.current) {
      colorKey.current = ck
      list.forEach((p, i) => {
        const match = !fx.query || fx.query.has(p.item.ref)
        if (fx.query && match) col.set(`hsl(${p.item.hue}, 72%, ${c.night || c.dark ? 58 : 56}%)`)
        else if (fx.query) col.set(c.dim)
        else col.set(`hsl(${p.item.hue}, ${c.toteS}%, ${c.tote}%)`)
        m.setColorAt(i, col)
      })
      if (m.instanceColor) m.instanceColor.needsUpdate = true
    }
    const material = m.material as Material
    material.opacity = fx.query ? Math.max(fx.near, 1) : fx.near
    m.visible = material.opacity > 0.01

    const l = lights.current!
    let n = 0
    for (const p of sim.active) {
      if (n >= l.count) break
      const flash = p.mode === 'queued' || p.mode === 'assigned'
      const on = flash ? (Math.sin(sim.time * 14) > -0.2 ? 1 : 0.25) : 0.75
      const grow = 1 + (1 - fx.near) * 2.5
      v0.set(p.home.x + TOTE.x / 2 + 0.08, p.home.y - TOTE.y / 2 - 0.06, p.home.z)
      v1.set(0.05 * grow, 0.07 * grow * on, 0.16 * grow)
      l.setMatrixAt(n++, m4.compose(v0, q0, v1))
    }
    for (let i = n; i < l.count; i++) l.setMatrixAt(i, m4.makeScale(0, 0, 0))
    l.instanceMatrix.needsUpdate = true

    const h = hover.current!
    const hp = fx.hover
    h.visible = !!hp && inRack(hp)
    if (hp) {
      h.position.copy(hp.home)
      h.scale.copy(TOTE).multiplyScalar(far ? 1.7 : 1.08)
    }
  })
  return (
    <>
      <instancedMesh
        ref={mesh}
        args={[undefined, undefined, list.length]}
        frustumCulled={false}
        onPointerMove={(e) => {
          e.stopPropagation()
          const p = list[e.instanceId ?? -1]
          if (!p) return
          if (fx.hover !== p) {
            fx.hover = p
            tip.show(e.nativeEvent, p.item.title, `${p.bin.item.sourceName ?? p.bin.item.source} · ${p.item.label} · ${lab.selected.has(p.item.ref) ? 'click to put back' : 'click to pick'}`, p.bin.code, imageOf(p, lab.theme))
          }
          tip.move(e.nativeEvent)
        }}
        onPointerOut={() => { fx.hover = null; tip.hide() }}
        onClick={(e) => {
          if (e.delta > 6) return
          e.stopPropagation()
          const p = list[e.instanceId ?? -1]
          if (p) lab.toggle(p.item.ref)
          tip.hide()
          fx.hover = null
        }}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={1} transparent clippingPlanes={[fx.clip]} />
      </instancedMesh>
      <instancedMesh ref={lights} args={[undefined, undefined, 600]} frustumCulled={false} raycast={() => null}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial color={ACCENT} toneMapped={false} clippingPlanes={[fx.clip]} />
      </instancedMesh>
      <mesh ref={hover} visible={false} raycast={() => null}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        <Edges color={ACCENT} lineWidth={2} />
      </mesh>
    </>
  )
}

export function CloseUps({ sim, fx, c, lab, L }: { sim: Sim; fx: Fx; c: Colors; lab: Lab; L: Layout }) {
  const N = 48
  const group = useRef<Group>(null)
  const faces = useRef<(Mesh | null)[]>([])
  const tags = useRef<(Mesh | null)[]>([])
  const plates = useRef<(Mesh | null)[]>([])
  const last = useRef(-1)
  const pool = useMemo(
    () =>
      Array.from({ length: N }, () => {
        const canvas = document.createElement('canvas')
        canvas.width = 256
        canvas.height = 56
        const texture = new CanvasTexture(canvas)
        texture.colorSpace = SRGBColorSpace
        texture.anisotropy = 8
        return { canvas, texture, code: '', part: null as Part | null }
      }),
    [],
  )
  const racks = useMemo(() => {
    const out: { name: string; no: number; x: number; z: number; bays: number }[] = []
    for (const a of L.aisles) {
      let bay = 0
      a.aisle.racks.forEach((r, i) => {
        out.push({ name: r.name, no: i + 1, x: a.face, z: Z0 - bay * BW, bays: r.bays })
        bay += r.bays
      })
    }
    return out
  }, [L])
  const plateTextures = useMemo(
    () =>
      racks.map((r) => ({
        r,
        get: (() => {
          let t: CanvasTexture | null = null
          return () =>
            (t ??= textTexture(512, 72, (ctx) => {
              ctx.fillStyle = c.fg
              ctx.fillRect(0, 0, 512, 72)
              ctx.fillStyle = c.bg
              ctx.font = `600 34px ${FONT}`
              ctx.textBaseline = 'middle'
              ctx.fillText(`R${r.no}`, 14, 38)
              ctx.font = `500 30px ${FONT}`
              ctx.fillText(r.name.toUpperCase(), 84, 38)
            }))
        })(),
      })),
    [racks, c],
  )
  useEffect(() => {
    last.current = -1
    for (const slot of pool) slot.code = ''
  }, [c, lab.theme, pool])
  useFrame(() => {
    const g = group.current!
    const close = fx.close
    g.visible = close > 0.02
    if (!g.visible) return
    if (sim.time - last.current > 0.3) {
      last.current = sim.time
      const t = sim.cam.target
      const radius = sim.cam.size * 2.2
      const near: [number, Part][] = []
      for (const p of sim.list) {
        const d = Math.hypot(p.home.x - t.x, p.home.z - t.z, (p.home.y - t.y) * 0.5)
        if (d < radius && inRack(p)) near.push([d, p])
      }
      near.sort((a, b) => a[0] - b[0])
      for (let i = 0; i < N; i++) {
        const p = near[i]?.[1] ?? null
        const slot = pool[i]
        slot.part = p
        const face = faces.current[i]!
        const tag = tags.current[i]!
        face.visible = !!p
        tag.visible = !!p
        if (!p) continue
        face.position.set(p.home.x + TOTE.x / 2 + 0.006, p.home.y + 0.02, p.home.z)
        tag.position.set(p.home.x + TOTE.x / 2 + 0.012, p.home.y - TOTE.y / 2 - 0.07, p.home.z)
        if (slot.code !== p.bin.code) {
          slot.code = p.bin.code
          const ctx = slot.canvas.getContext('2d')!
          ctx.fillStyle = c.paper
          ctx.fillRect(0, 0, 256, 56)
          ctx.fillStyle = c.fg
          ctx.font = `600 26px ${MONO}`
          ctx.textBaseline = 'middle'
          ctx.fillText(p.bin.code, 8, 29)
          for (let b = 0; b < 22; b++) {
            const w = (p.bin.code.charCodeAt(b % p.bin.code.length) + b) % 3 === 0 ? 3 : 1.5
            ctx.fillRect(176 + b * 3.4, 10, w, 36)
          }
          slot.texture.needsUpdate = true
        }
      }
      const rs = racks
        .map((r) => [Math.hypot(r.x - t.x, r.z - BW - t.z), r] as const)
        .filter(([d]) => d < radius * 1.5)
        .sort((a, b) => a[0] - b[0])
        .slice(0, plates.current.length)
      plates.current.forEach((m, i) => {
        if (!m) return
        const r = rs[i]?.[1]
        m.visible = !!r
        if (!r) return
        m.position.set(r.x + 0.02, TOP + 0.2, r.z - Math.min(r.bays * BW, 2.4) / 2)
        const mat = m.material as MeshBasicMaterial
        const tex = plateTextures[racks.indexOf(r)].get()
        if (mat.map !== tex) {
          mat.map = tex
          mat.needsUpdate = true
        }
      })
    }
    for (let i = 0; i < N; i++) {
      const p = pool[i].part
      const face = faces.current[i]
      if (!face || !p) continue
      if (!inRack(p)) {
        face.visible = false
        tags.current[i]!.visible = false
        continue
      }
      const tex = screenshot(imageOf(p, lab.theme))
      const mat = face.material as MeshBasicMaterial
      if (mat.map !== tex) {
        mat.map = tex
        mat.needsUpdate = true
      }
      face.visible = !!tex
      mat.opacity = close
      ;(tags.current[i]!.material as MeshBasicMaterial).opacity = close
    }
  })
  return (
    <group ref={group}>
      {pool.map((slot, i) => (
        <group key={i}>
          <mesh ref={(m) => { faces.current[i] = m }} rotation={[0, Math.PI / 2, 0]} raycast={() => null}>
            <planeGeometry args={[TOTE.z - 0.04, TOTE.y - 0.06]} />
            <meshBasicMaterial transparent toneMapped={false} clippingPlanes={[fx.clip]} />
          </mesh>
          <mesh ref={(m) => { tags.current[i] = m }} rotation={[0, Math.PI / 2, 0]} raycast={() => null}>
            <planeGeometry args={[0.46, 0.1]} />
            <meshBasicMaterial map={slot.texture} transparent toneMapped={false} clippingPlanes={[fx.clip]} />
          </mesh>
        </group>
      ))}
      {Array.from({ length: 10 }, (_, i) => (
        <mesh key={`p${i}`} ref={(m) => { plates.current[i] = m }} rotation={[0, Math.PI / 2, 0]} raycast={() => null}>
          <planeGeometry args={[1.5, 0.21]} />
          <meshBasicMaterial toneMapped={false} side={DoubleSide} clippingPlanes={[fx.clip]} />
        </mesh>
      ))}
    </group>
  )
}

export function Movers({ sim, c, lab, tip }: { sim: Sim; c: Colors; lab: Lab; tip: Tip }) {
  const N = 140
  const meshes = useRef<(Mesh | null)[]>([])
  const assigned = useRef<(Part | null)[]>([])
  const edges = useRef<({ material: { color: Color } } | null)[]>([])
  const accent = useMemo(() => new Color(ACCENT), [])
  const plain = useMemo(() => new Color(c.edge), [c.edge])
  useFrame(() => {
    let n = 0
    for (const p of sim.active) {
      if (n >= N) break
      if (inRack(p) && !p.fly) continue
      const m = meshes.current[n]
      if (!m) break
      assigned.current[n] = p
      m.visible = true
      m.position.copy(p.pos)
      m.scale.copy(p.size)
      m.rotation.set(p.spin * 0.3, p.spin, 0)
      const mats = m.material as Material[]
      const side = mats[0] as MeshBasicMaterial
      side.color.set(`hsl(${p.item.hue}, ${c.toteS + 6}%, ${c.tote}%)`)
      const top = mats[2] as MeshBasicMaterial
      const tex = screenshot(imageOf(p, lab.theme))
      if (top.map !== tex) {
        top.map = tex
        top.needsUpdate = true
      }
      if (!tex) top.color.set(`hsl(${p.item.hue}, ${c.toteS}%, ${c.tote + (c.dark || c.night ? 8 : -6)}%)`)
      else top.color.set('#ffffff')
      const e = edges.current[n]
      if (e) e.material.color.copy(p.mode === 'board' ? plain : accent)
      n++
    }
    for (let i = n; i < N; i++) {
      const m = meshes.current[i]
      if (m) m.visible = false
      assigned.current[i] = null
    }
  })
  return (
    <>
      {Array.from({ length: N }, (_, i) => (
        <mesh
          key={i}
          ref={(m) => { meshes.current[i] = m }}
          visible={false}
          onClick={(e) => {
            if (e.delta > 6) return
            e.stopPropagation()
            const p = assigned.current[i]
            if (p) lab.toggle(p.item.ref)
            tip.hide()
          }}
          onPointerOver={(e) => {
            e.stopPropagation()
            const p = assigned.current[i]
            if (p) tip.show(e.nativeEvent, p.item.title, `${p.mode === 'board' ? 'seated on your app board' : `in transit · ${p.mode}`} · ${lab.selected.has(p.item.ref) ? 'click to send back' : 'returning'}`, p.bin.code, imageOf(p, lab.theme))
          }}
          onPointerMove={(e) => tip.move(e.nativeEvent)}
          onPointerOut={() => tip.hide()}
        >
          <boxGeometry args={[1, 1, 1]} />
          {[0, 1, 2, 3, 4, 5].map((f) => (
            <meshBasicMaterial key={f} attach={`material-${f}`} toneMapped={false} />
          ))}
          <Edges ref={(e: unknown) => { edges.current[i] = e as never }} color={c.edge} />
        </mesh>
      ))}
    </>
  )
}

function makeTag(c: Colors) {
  const canvas = document.createElement('canvas')
  canvas.width = 400
  canvas.height = 96
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  const draw = (text: string, color: string) => {
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, 400, 96)
    if (!text) return
    ctx.fillStyle = c.surface
    ctx.strokeStyle = color
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.roundRect(4, 12, 392, 72, 36)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(42, 48, 10, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = c.fg
    ctx.font = `600 36px ${MONO}`
    ctx.textBaseline = 'middle'
    ctx.fillText(text, 66, 50)
    texture.needsUpdate = true
  }
  return { texture, draw }
}

export function Pickers({ sim, c, kind, agent }: { sim: Sim; c: Colors; kind: PickerKind; agent: Lab['setup']['agent'] }) {
  return (
    <>
      {sim.pickers.map((k) => (
        <PickerMesh key={`${k.id}-${kind}`} sim={sim} id={k.id} c={c} kind={kind} agent={agent} />
      ))}
    </>
  )
}

function PickerMesh({ sim, id, c, kind, agent }: { sim: Sim; id: number; c: Colors; kind: PickerKind; agent: Lab['setup']['agent'] }) {
  const group = useRef<Group>(null)
  const body = useRef<Group>(null)
  const deck = useRef<Group>(null)
  const beacon = useRef<Mesh>(null)
  const rotors = useRef<(Group | null)[]>([])
  const scissor = useRef<Group>(null)
  const tagSprite = useRef<Group>(null)
  const tag = useMemo(() => makeTag(c), [c])
  const shown = useRef('')
  const k = sim.pickers[id]
  const brand = kind === 'drone' && agent !== 'none' ? (agent === 'codex' ? c.fg : '#D97757') : null
  useFrame((_, dt) => {
    const g = group.current!
    g.visible = k.id < sim.fleet || !!k.job
    g.position.copy(k.pos)
    body.current!.rotation.y = k.heading
    if (deck.current) deck.current.position.y = k.lift
    if (scissor.current) scissor.current.scale.y = Math.max(0.05, k.lift + 0.12)
    rotors.current.forEach((r) => r && (r.rotation.y += dt * 32))
    if (kind === 'drone') body.current!.rotation.z = Math.sin(sim.time * 1.8 + id) * 0.05
    const busy = !!k.job
    if (beacon.current) {
      const mat = beacon.current.material as MeshBasicMaterial
      mat.color.set(busy ? (Math.sin(sim.time * 10 + id) > 0 ? '#FFB347' : '#7A4A10') : c.night ? '#3E8E5A' : c.edge)
    }
    const text = k.tag ? `${k.carrying ? '▲' : '→'} ${k.tag}` : ''
    if (text !== shown.current) {
      shown.current = text
      tag.draw(text, k.carrying ? ACCENT : '#FFB347')
    }
    if (tagSprite.current) tagSprite.current.visible = !!text
  })
  const hi = c.edge
  return (
    <group ref={group}>
      <group ref={body}>
        {kind === 'agv' && (
          <>
            <Box size={[0.9, 0.24, 1.15]} position={[0, 0.16, 0]} color={c.surface} edge={hi} />
            <Box size={[0.5, 0.06, 0.1]} position={[0, 0.2, 0.6]} color="#1D2225" edge={hi} />
            <group ref={scissor} position={[0, 0.28, 0]}>
              <Line points={[[-0.3, 0, -0.35], [0.3, 1, 0.35]]} color={hi} lineWidth={1} />
              <Line points={[[0.3, 0, -0.35], [-0.3, 1, 0.35]]} color={hi} lineWidth={1} />
            </group>
            <group ref={deck}>
              <Box size={[0.86, 0.05, 1.0]} position={[0, DECK - 0.025, 0]} color={c.surface} edge={ACCENT} />
            </group>
            <mesh ref={beacon} position={[0.32, 0.33, -0.45]}>
              <cylinderGeometry args={[0.06, 0.06, 0.1, 10]} />
              <meshBasicMaterial color={c.edge} toneMapped={false} />
            </mesh>
          </>
        )}
        {kind === 'forklift' && (
          <>
            <Box size={[0.95, 0.5, 1.2]} position={[0, 0.38, -0.25]} color={c.surface} edge={hi} />
            <Box size={[0.9, 0.18, 0.4]} position={[0, 0.72, -0.62]} color={c.surface} edge={hi} />
            <Line points={[[-0.42, 0.63, 0.15], [-0.42, 1.9, 0.15], [0.42, 1.9, 0.15], [0.42, 0.63, 0.15]]} color={hi} lineWidth={1} />
            <Line points={[[-0.42, 1.9, 0.15], [-0.42, 1.9, -0.75], [0.42, 1.9, -0.75], [0.42, 1.9, 0.15]]} color={hi} lineWidth={1} />
            <Line points={[[-0.42, 1.9, -0.75], [-0.42, 0.63, -0.75]]} color={hi} lineWidth={1} />
            <Line points={[[0.42, 1.9, -0.75], [0.42, 0.63, -0.75]]} color={hi} lineWidth={1} />
            <Box size={[0.08, 3.6, 0.08]} position={[-0.3, 1.8, 0.42]} color={c.surface} edge={hi} />
            <Box size={[0.08, 3.6, 0.08]} position={[0.3, 1.8, 0.42]} color={c.surface} edge={hi} />
            <group ref={deck}>
              <Box size={[0.7, 0.3, 0.05]} position={[0, DECK + 0.1, 0.48]} color={c.surface} edge={hi} />
              <Box size={[0.08, 0.04, 0.95]} position={[-0.22, DECK - 0.02, 0.95]} color={c.surface} edge={ACCENT} />
              <Box size={[0.08, 0.04, 0.95]} position={[0.22, DECK - 0.02, 0.95]} color={c.surface} edge={ACCENT} />
            </group>
            {[[-0.48, -0.65], [0.48, -0.65], [-0.48, 0.2], [0.48, 0.2]].map(([x, z]) => (
              <mesh key={`${x}${z}`} position={[x, 0.17, z]} rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.17, 0.17, 0.1, 14]} />
                <meshStandardMaterial color={c.surface} roughness={1} />
                <Edges color={hi} threshold={20} />
              </mesh>
            ))}
            <mesh ref={beacon} position={[0, 1.98, -0.3]}>
              <cylinderGeometry args={[0.07, 0.07, 0.12, 10]} />
              <meshBasicMaterial color={c.edge} toneMapped={false} />
            </mesh>
          </>
        )}
        {kind === 'drone' && (
          <>
            <Box size={[0.8, 0.2, 0.8]} color={c.surface} edge={brand ?? hi} />
            <Box size={[0.28, 0.12, 0.28]} position={[0, 0.16, 0]} color={brand ?? c.surface} edge={brand ?? hi} />
            {[[-0.62, -0.62], [0.62, -0.62], [-0.62, 0.62], [0.62, 0.62]].map(([x, z], i) => (
              <group key={i} position={[x, 0.1, z]}>
                <Line points={[[-x * 0.55, -0.02, -z * 0.55], [0, 0, 0]]} color={hi} lineWidth={1} />
                <group ref={(r) => { rotors.current[i] = r }}>
                  <Line points={[[-0.34, 0.04, 0], [0.34, 0.04, 0]]} color={hi} lineWidth={1.4} />
                  <Line points={[[0, 0.04, -0.34], [0, 0.04, 0.34]]} color={hi} lineWidth={1.4} />
                </group>
              </group>
            ))}
            <Line points={[[-0.25, -0.1, 0], [-0.25, -0.26, 0]]} color={ACCENT} lineWidth={1.4} />
            <Line points={[[0.25, -0.1, 0], [0.25, -0.26, 0]]} color={ACCENT} lineWidth={1.4} />
            <mesh ref={beacon} position={[0, -0.12, 0.38]}>
              <sphereGeometry args={[0.05, 8, 8]} />
              <meshBasicMaterial color={c.edge} toneMapped={false} />
            </mesh>
          </>
        )}
      </group>
      <group ref={tagSprite} position={[0, kind === 'forklift' ? 4.2 : kind === 'drone' ? 1.0 : 2.0, 0]}>
        <sprite scale={[2.0, 0.48, 1]}>
          <spriteMaterial map={tag.texture} transparent toneMapped={false} depthTest={false} />
        </sprite>
      </group>
    </group>
  )
}

export function Lamps({ L, c }: { L: Layout; c: Colors }) {
  const pools = useRef<InstancedMesh>(null)
  const fixtures = useRef<InstancedMesh>(null)
  const spots = useMemo(() => {
    const out: [number, number, number][] = []
    for (const a of L.aisles) for (let z = Z0 - 2; z > a.z1 + 1; z -= 7.5) out.push([a.cx, z, 3.2])
    for (let x = L.x0 + 4; x < L.x1 - 2; x += 7) out.push([x, 2.6, 3.6])
    for (const [x, z] of [[-3, 12.5], [4.2, 10], [9.6, 10.5], [12.5, 13], [DOCK.x, 14.5], [-10.5, 7.5]]) out.push([x, z, 4.4])
    return out
  }, [L])
  const glow = useMemo(
    () =>
      textTexture(128, 128, (ctx) => {
        const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
        g.addColorStop(0, 'rgba(255,214,150,0.55)')
        g.addColorStop(0.5, 'rgba(255,190,120,0.16)')
        g.addColorStop(1, 'rgba(255,190,120,0)')
        ctx.fillStyle = g
        ctx.fillRect(0, 0, 128, 128)
      }),
    [],
  )
  useLayoutEffect(() => {
    const o = new Object3D()
    spots.forEach(([x, z, r], i) => {
      o.position.set(x, 0.012, z)
      o.rotation.set(-Math.PI / 2, 0, 0)
      o.scale.set(r * 2, r * 2, 1)
      o.updateMatrix()
      pools.current!.setMatrixAt(i, o.matrix)
      o.position.set(x, 7.1, z)
      o.rotation.set(0, 0, 0)
      o.scale.set(0.9, 0.08, 0.35)
      o.updateMatrix()
      fixtures.current!.setMatrixAt(i, o.matrix)
    })
    pools.current!.instanceMatrix.needsUpdate = true
    fixtures.current!.instanceMatrix.needsUpdate = true
  }, [spots])
  return (
    <group visible={c.night}>
      <instancedMesh ref={pools} args={[undefined, undefined, spots.length]} frustumCulled={false} raycast={() => null}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial map={glow} transparent blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={fixtures} args={[undefined, undefined, spots.length]} frustumCulled={false} raycast={() => null}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial color="#FFE6B8" toneMapped={false} />
      </instancedMesh>
    </group>
  )
}

const TRACES = SLOTS.map((s) => {
  const y = BOARD.y + 0.012
  const df = Math.abs(s.x - CHIPS.framework.x), dd = Math.abs(s.x - CHIPS.database.x)
  const chip = df < dd || (df === dd && s.j < 3) ? CHIPS.framework : CHIPS.database
  const half = CHIP / 2
  if (Math.abs(s.x - chip.x) <= 1.3) {
    const side = Math.sign(s.z - chip.z)
    const cx = clamp(s.x, chip.x - half + 0.25, chip.x + half - 0.25)
    const ez = chip.z + side * (half + 0.35 + 0.12 * Math.abs(s.j - 3))
    return [new Vector3(s.x, y, s.z), new Vector3(s.x, y, ez), new Vector3(cx, y, ez), new Vector3(cx, y, chip.z + side * half)]
  }
  const side = Math.sign(s.x - chip.x)
  const pinZ = chip.z - 0.6 + (s.j / 6) * 1.2
  const vx = s.x - side * (0.3 + 0.07 * s.j)
  return [new Vector3(s.x, y, s.z), new Vector3(vx, y, s.z), new Vector3(vx, y, pinZ), new Vector3(chip.x + side * half, y, pinZ)]
})

export function Belt({ c }: { c: Colors }) {
  const slats = useRef<(Mesh | null)[]>([])
  const len = BELT.end - BELT.start + 1.0
  const n = 22
  useFrame(({ clock }) => {
    const offset = (clock.elapsedTime * BELT.speed) % (len / n)
    slats.current.forEach((m, i) => {
      if (m) m.position.x = BELT.start - 0.5 + (((i * len) / n + offset) % len)
    })
  })
  const mid = (BELT.start + BELT.end) / 2
  return (
    <group>
      <Box size={[len, 0.42, 1.3]} position={[mid, BELT.y - 0.29, BELT.z]} color={c.surface} edge={c.edge} />
      <Box size={[len + 0.1, 0.16, 0.08]} position={[mid, BELT.y, BELT.z - 0.7]} color={c.surface} edge={c.edge} />
      <Box size={[len + 0.1, 0.16, 0.08]} position={[mid, BELT.y, BELT.z + 0.7]} color={c.surface} edge={c.edge} />
      {[BELT.start - 0.5, BELT.end + 0.5].map((x) => (
        <mesh key={x} position={[x, BELT.y - 0.25, BELT.z]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.25, 0.25, 1.34, 24]} />
          <meshStandardMaterial color={c.surface} roughness={1} />
          <Edges color={c.edge} threshold={20} />
        </mesh>
      ))}
      {[[BELT.start + 0.4, BELT.z - 0.65], [BELT.end - 0.4, BELT.z - 0.65], [BELT.start + 0.4, BELT.z + 0.65], [BELT.end - 0.4, BELT.z + 0.65]].map(([x, z]) => (
        <Box key={`${x}${z}`} size={[0.12, BELT.y - 0.5, 0.12]} position={[x, (BELT.y - 0.5) / 2, z]} color={c.surface} edge={c.edge} />
      ))}
      {Array.from({ length: n }, (_, i) => (
        <mesh key={i} ref={(m) => { slats.current[i] = m }} position={[0, BELT.y - 0.07, BELT.z]}>
          <boxGeometry args={[0.02, 0.01, 1.2]} />
          <meshBasicMaterial color={c.edge} />
        </mesh>
      ))}
      <Box size={[0.9, OUTBOX.y, 0.7]} position={[OUTBOX.x, OUTBOX.y / 2, OUTBOX.z]} color={c.surface} edge={PAINT} />
      <Box size={[1.6, 0.34, 1.4]} position={[BELT.start - 1.5, 0.17, BELT.z]} color={c.surface} edge={c.edge} opacity={0.4} />
    </group>
  )
}

export function Arm({ sim, c }: { sim: Sim; c: Colors }) {
  const turret = useRef<Group>(null)
  const shoulder = useRef<Group>(null)
  const elbow = useRef<Group>(null)
  const wrist = useRef<Group>(null)
  const fingers = useRef<(Group | null)[]>([])
  const [busy, setBusy] = useState(false)
  useFrame(() => {
    const w = sim.arm.pos
    const dx = w.x - BASE.x, dz = w.z - BASE.z
    const yaw = Math.atan2(-dz, dx)
    const r = Math.max(Math.hypot(dx, dz), 0.001)
    const h = w.y - H0
    const d = clamp(Math.hypot(r, h), Math.abs(L1 - L2) + 0.05, L1 + L2 - 0.01)
    const phi = Math.atan2(h, r)
    const a = Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1))
    const t1 = phi + a
    const t2 = Math.atan2(h - L1 * Math.sin(t1), r - L1 * Math.cos(t1))
    turret.current!.rotation.y = yaw
    shoulder.current!.rotation.z = t1
    elbow.current!.rotation.z = t2 - t1
    wrist.current!.rotation.z = -t2
    const open = 0.36 - sim.arm.grip * 0.1
    fingers.current.forEach((f, i) => f && (f.position.z = (i ? 1 : -1) * open))
    const holding = !!sim.arm.holding
    if (holding !== busy) setBusy(holding)
  })
  const hi = busy ? ACCENT : c.edge
  const joint = (key: string, radius: number, length: number) => (
    <mesh key={key} rotation={[Math.PI / 2, 0, 0]}>
      <cylinderGeometry args={[radius, radius, length, 28]} />
      <meshStandardMaterial color={c.surface} roughness={1} />
      <Edges color={c.edge} threshold={20} />
    </mesh>
  )
  return (
    <group position={[BASE.x, 0, BASE.z]}>
      <mesh position={[0, 0.18, 0]}>
        <cylinderGeometry args={[0.9, 1.0, 0.36, 40]} />
        <meshStandardMaterial color={c.surface} roughness={1} />
        <Edges color={c.edge} threshold={20} />
      </mesh>
      <group ref={turret}>
        <mesh position={[0, (H0 + 0.36) / 2, 0]}>
          <cylinderGeometry args={[0.38, 0.5, H0 - 0.36, 28]} />
          <meshStandardMaterial color={c.surface} roughness={1} />
          <Edges color={c.edge} threshold={20} />
        </mesh>
        <group ref={shoulder} position={[0, H0, 0]}>
          {joint('s', 0.42, 0.9)}
          <Box size={[L1, 0.3, 0.3]} position={[L1 / 2, 0, 0.3]} color={c.surface} edge={c.edge} />
          <Box size={[L1, 0.3, 0.3]} position={[L1 / 2, 0, -0.3]} color={c.surface} edge={c.edge} />
          <group ref={elbow} position={[L1, 0, 0]}>
            {joint('e', 0.36, 0.95)}
            <Box size={[L2, 0.34, 0.34]} position={[L2 / 2, 0, 0]} color={c.surface} edge={c.edge} />
            <group ref={wrist} position={[L2, 0, 0]}>
              {joint('w', 0.24, 0.6)}
              <Box size={[0.5, 0.3, 0.86]} position={[0, -0.32, 0]} color={c.surface} edge={hi} />
              {[0, 1].map((i) => (
                <group key={i} ref={(g) => { fingers.current[i] = g }}>
                  <Box size={[0.36, 0.38, 0.06]} position={[0, -0.62, 0]} color={c.surface} edge={hi} />
                </group>
              ))}
            </group>
          </group>
        </group>
      </group>
    </group>
  )
}

export function Board({ lab, sim, c, tip }: { lab: Lab; sim: Sim; c: Colors; tip: Tip }) {
  const traces = useRef<({ material: { color: Color; linewidth: number } } | null)[]>([])
  const pulses = useRef<(Mesh | null)[]>([])
  const chipRefs = useRef<Record<string, Group | null>>({})
  const bump = useRef<Record<string, number>>({ framework: 0, database: 0 })
  const lit = useMemo(() => new Color(ACCENT), [])
  const dim = useMemo(() => new Color(c.dim), [c.dim])
  useFrame((_, dt) => {
    traces.current.forEach((line, s) => {
      if (!line) return
      const on = sim.slots[s]?.mode === 'board'
      line.material.color.copy(on ? lit : dim)
      line.material.linewidth = on ? 2.6 : 1
    })
    pulses.current.forEach((m, i) => {
      const pulse = sim.pulses[i]
      if (!m) return
      m.visible = !!pulse
      if (!pulse) return
      const path = TRACES[pulse.slot % TRACES.length]
      const total = path.slice(1).reduce((sum, p, k) => sum + p.distanceTo(path[k]), 0)
      let left = pulse.t * total
      for (let k = 1; k < path.length; k++) {
        const seg = path[k].distanceTo(path[k - 1])
        if (left <= seg || k === path.length - 1) {
          m.position.lerpVectors(path[k - 1], path[k], clamp(left / seg, 0, 1))
          break
        }
        left -= seg
      }
    })
    for (const key of ['framework', 'database'] as const) {
      bump.current[key] = Math.max(0, bump.current[key] - dt * 3)
      const g = chipRefs.current[key]
      if (g) g.position.y = Math.sin(bump.current[key] * Math.PI) * 0.6
    }
  })
  const chipTexture = useMemo(() => {
    const make = (title: string, value: string) =>
      textTexture(340, 340, (ctx) => {
        ctx.fillStyle = '#1D2225'
        ctx.fillRect(0, 0, 340, 340)
        ctx.strokeStyle = ACCENT
        ctx.lineWidth = 3
        ctx.strokeRect(18, 18, 304, 304)
        ctx.beginPath()
        ctx.arc(46, 46, 9, 0, Math.PI * 2)
        ctx.stroke()
        ctx.fillStyle = '#8A9094'
        ctx.font = `500 26px ${FONT}`
        ctx.fillText(title, 36, 140)
        ctx.fillStyle = '#FCFCFC'
        ctx.font = `500 ${value.length > 9 ? 38 : 50}px ${FONT}`
        ctx.fillText(value, 36, 200)
        ctx.fillStyle = '#8A9094'
        ctx.font = `400 20px ${FONT}`
        ctx.fillText('click to swap ↻', 36, 290)
      })
    return {
      framework: make('FRAMEWORK', frameworks.find((f) => f.value === lab.setup.framework)!.label),
      database: make('DATABASE', databases.find((d) => d.value === lab.setup.database)!.label),
    }
  }, [lab.setup.framework, lab.setup.database])
  const cycle = (key: 'framework' | 'database') => {
    bump.current[key] = 1
    if (key === 'framework') lab.set('framework', lab.setup.framework === 'next' ? 'tanstack' : 'next')
    else lab.set('database', lab.setup.database === 'postgres' ? 'mongodb' : 'postgres')
  }
  const cx = (BOARD.x0 + BOARD.x1) / 2, cz = (BOARD.z0 + BOARD.z1) / 2
  const pin = (chip: Vector3) => {
    const pts: [number, number, number][] = []
    const y = BOARD.y + 0.01
    for (let k = 0; k < 7; k++) {
      const o = -0.66 + k * 0.22
      const e = CHIP / 2
      pts.push([chip.x + o, y, chip.z - e], [chip.x + o, y, chip.z - e - 0.16], [chip.x + o, y, chip.z + e], [chip.x + o, y, chip.z + e + 0.16])
      pts.push([chip.x - e, y, chip.z + o], [chip.x - e - 0.16, y, chip.z + o], [chip.x + e, y, chip.z + o], [chip.x + e + 0.16, y, chip.z + o])
    }
    return pts
  }
  return (
    <group>
      <Box size={[BOARD.x1 - BOARD.x0, 0.12, BOARD.z1 - BOARD.z0]} position={[cx, BOARD.y - 0.06, cz]} color={c.board} edge={c.edge} />
      {[[BOARD.x0 + 0.3, BOARD.z0 + 0.3], [BOARD.x1 - 0.3, BOARD.z0 + 0.3], [BOARD.x0 + 0.3, BOARD.z1 - 0.3], [BOARD.x1 - 0.3, BOARD.z1 - 0.3]].map(([x, z]) => (
        <mesh key={`${x}${z}`} position={[x, (BOARD.y - 0.12) / 2, z]}>
          <cylinderGeometry args={[0.12, 0.12, BOARD.y - 0.12, 16]} />
          <meshStandardMaterial color={c.surface} roughness={1} />
          <Edges color={c.edge} threshold={20} />
        </mesh>
      ))}
      {TRACES.map((points, s) => (
        <Line key={s} ref={(l) => { traces.current[s] = l as never }} points={points} color={c.dim} lineWidth={1} />
      ))}
      {SLOTS.map((s, i) => {
        const y = BOARD.y + 0.014
        return <Line key={i} points={[[s.x - 0.5, y, s.z - 0.38], [s.x + 0.5, y, s.z - 0.38], [s.x + 0.5, y, s.z + 0.38], [s.x - 0.5, y, s.z + 0.38], [s.x - 0.5, y, s.z - 0.38]]} color={c.dim} lineWidth={1} />
      })}
      {(['framework', 'database'] as const).map((key) => (
        <group key={key} ref={(g) => { chipRefs.current[key] = g }}>
          <Line points={pin(CHIPS[key])} segments color={c.edge} lineWidth={1.4} />
          <mesh
            position={[CHIPS[key].x, BOARD.y + 0.14, CHIPS[key].z]}
            onClick={(e) => { if (e.delta > 6) return; e.stopPropagation(); cycle(key) }}
            onPointerOver={(e) => { e.stopPropagation(); tip.show(e.nativeEvent, key === 'framework' ? 'Framework chip' : 'Database chip', 'Click to swap') }}
            onPointerMove={(e) => tip.move(e.nativeEvent)}
            onPointerOut={() => tip.hide()}
          >
            <boxGeometry args={[CHIP, 0.28, CHIP]} />
            <meshStandardMaterial attach="material-0" color="#1D2225" roughness={1} />
            <meshStandardMaterial attach="material-1" color="#1D2225" roughness={1} />
            <meshBasicMaterial attach="material-2" map={chipTexture[key]} toneMapped={false} />
            <meshStandardMaterial attach="material-3" color="#1D2225" roughness={1} />
            <meshStandardMaterial attach="material-4" color="#1D2225" roughness={1} />
            <meshStandardMaterial attach="material-5" color="#1D2225" roughness={1} />
            <Edges color={c.edge} />
          </mesh>
        </group>
      ))}
      {Array.from({ length: 8 }, (_, i) => (
        <mesh key={i} ref={(m) => { pulses.current[i] = m }} visible={false}>
          <sphereGeometry args={[0.09, 12, 12]} />
          <meshBasicMaterial color={ACCENT} toneMapped={false} />
        </mesh>
      ))}
    </group>
  )
}

export function Welder({ sim, lab, c }: { sim: Sim; lab: Lab; c: Colors }) {
  const group = useRef<Group>(null)
  const rotors = useRef<(Group | null)[]>([])
  const glow = useRef<Mesh>(null)
  const points = useRef<Points>(null)
  const N = 90
  const state = useMemo(() => ({ pos: new Float32Array(N * 3).fill(-99), vel: new Float32Array(N * 3), life: new Float32Array(N), next: 0 }), [])
  useFrame((_, dt) => {
    const g = group.current!
    const d = sim.welder
    g.position.copy(d.pos)
    g.scale.setScalar(Math.max(0.001, d.show))
    g.rotation.z = Math.sin(sim.time * 1.7) * 0.06
    rotors.current.forEach((r) => r && (r.rotation.y += dt * 30))
    const weld = d.welds[0]
    const welding = !!weld && d.weldT > 0
    glow.current!.visible = welding
    if (welding) {
      glow.current!.position.copy(weld).setY(weld.y + 0.06)
      glow.current!.scale.setScalar(0.6 + Math.random() * 0.8)
      for (let k = 0; k < 4; k++) {
        const i = state.next++ % N
        state.pos.set([weld.x + (Math.random() - 0.5) * 0.4, weld.y + 0.06, weld.z + (Math.random() - 0.5) * 0.3], i * 3)
        const a = Math.random() * Math.PI * 2, s = 1 + Math.random() * 2.4
        state.vel.set([Math.cos(a) * s, 1.5 + Math.random() * 3, Math.sin(a) * s], i * 3)
        state.life[i] = 0.35 + Math.random() * 0.35
      }
    }
    for (let i = 0; i < N; i++) {
      if (state.life[i] <= 0) {
        state.pos[i * 3 + 1] = -99
        continue
      }
      state.life[i] -= dt
      state.vel[i * 3 + 1] -= 14 * dt
      state.pos[i * 3] += state.vel[i * 3] * dt
      state.pos[i * 3 + 1] = Math.max(BOARD.y + 0.02, state.pos[i * 3 + 1] + state.vel[i * 3 + 1] * dt)
      state.pos[i * 3 + 2] += state.vel[i * 3 + 2] * dt
    }
    const attr = points.current!.geometry.getAttribute('position') as BufferAttribute
    attr.needsUpdate = true
  })
  const body = lab.setup.agent === 'codex' ? c.fg : '#D97757'
  const name = agents.find((a) => a.value === lab.setup.agent)?.label ?? ''
  const tag = useMemo(
    () =>
      textTexture(500, 100, (ctx) => {
        ctx.fillStyle = c.surface
        ctx.strokeStyle = c.edge
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.roundRect(4, 14, 492, 72, 36)
        ctx.fill()
        ctx.stroke()
        ctx.fillStyle = body
        ctx.beginPath()
        ctx.arc(46, 50, 10, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = c.fg
        ctx.font = `500 34px ${FONT}`
        ctx.fillText(`${name} is welding`, 70, 62)
      }),
    [c, body, name],
  )
  return (
    <>
      <group ref={group}>
        <Box size={[0.8, 0.22, 0.8]} color={c.surface} edge={body} />
        <Box size={[0.3, 0.14, 0.3]} position={[0, 0.18, 0]} color={body} edge={body} />
        {[[-0.62, -0.62], [0.62, -0.62], [-0.62, 0.62], [0.62, 0.62]].map(([x, z], i) => (
          <group key={i} position={[x, 0.12, z]}>
            <Line points={[[-x * 0.55, -0.02, -z * 0.55], [0, 0, 0]]} color={c.edge} lineWidth={1} />
            <group ref={(r) => { rotors.current[i] = r }}>
              <Line points={[[-0.34, 0.04, 0], [0.34, 0.04, 0]]} color={c.edge} lineWidth={1.4} />
              <Line points={[[0, 0.04, -0.34], [0, 0.04, 0.34]]} color={c.edge} lineWidth={1.4} />
            </group>
          </group>
        ))}
        <Line points={[[0, -0.11, 0], [0, -0.55, 0.1]]} color={body} lineWidth={1.6} />
        <sprite position={[0, 0.85, 0]} scale={[3.0, 0.6, 1]}>
          <spriteMaterial map={tag} transparent toneMapped={false} depthTest={false} />
        </sprite>
      </group>
      <mesh ref={glow} visible={false}>
        <sphereGeometry args={[0.12, 12, 12]} />
        <meshBasicMaterial color="#FFE2A8" toneMapped={false} />
      </mesh>
      <points ref={points} frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[state.pos, 3]} />
        </bufferGeometry>
        <pointsMaterial color="#FFB347" size={3.5} sizeAttenuation={false} toneMapped={false} />
      </points>
    </>
  )
}

export function Dock({ sim, lab, c, tip, onShip }: { sim: Sim; lab: Lab; c: Colors; tip: Tip; onShip: () => void }) {
  const door = useRef<Group>(null)
  const trailer = useRef<Group>(null)
  const pallet = useRef<Group>(null)
  const items = lab.catalog.items.filter((item) => lab.selected.has(item.ref))
  const label = useMemo(
    () =>
      textTexture(640, 520, (ctx) => {
        ctx.fillStyle = '#FFFFFF'
        ctx.fillRect(0, 0, 640, 520)
        ctx.strokeStyle = '#1D2225'
        ctx.lineWidth = 6
        ctx.strokeRect(3, 3, 634, 514)
        ctx.fillStyle = '#1D2225'
        ctx.font = `600 34px ${FONT}`
        ctx.fillText('SHIP TO  ./your-app', 24, 52)
        ctx.font = `500 22px ${MONO}`
        ctx.fillText(`SHIPMENT #${String(sim.ship.count).padStart(4, '0')} · ${items.length} PART${items.length === 1 ? '' : 'S'}`, 24, 88)
        ctx.fillRect(24, 104, 592, 3)
        ctx.font = `400 21px ${MONO}`
        const words = lab.command.split(' ')
        let line = '$'
        let y = 140
        for (const w of words) {
          if (ctx.measureText(`${line} ${w}`).width > 588) {
            ctx.fillText(line, 24, y)
            y += 27
            line = w
            if (y > 360) break
          } else line = `${line} ${w}`
        }
        if (y <= 360) ctx.fillText(line, 24, y)
        else ctx.fillText('…', 24, y)
        for (let b = 0; b < 90; b++) {
          const w = (lab.command.charCodeAt(b % Math.max(1, lab.command.length)) + b) % 4 === 0 ? 4 : 2
          ctx.fillRect(24 + b * 6.5, 410, w, 80)
        }
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lab.command, items.length, sim.ship.count],
  )
  const [, force] = useState(0)
  const count = useRef(sim.ship.count)
  useFrame(() => {
    const t = sim.ship.t
    if (count.current !== sim.ship.count) {
      count.current = sim.ship.count
      force((n) => n + 1)
    }
    const closed = t < 0 ? 0 : t < 0.8 ? 0 : t < 1.5 ? (t - 0.8) / 0.7 : t < 3.9 ? 1 : t < 4.6 ? 1 - (t - 3.9) / 0.7 : 0
    door.current!.scale.y = Math.max(0.001, closed)
    const away = t < 1.7 ? 0 : t < 2.9 ? ((t - 1.7) / 1.2) ** 2 * 40 : t < 3.8 ? (1 - (t - 2.9) / 0.9) ** 2 * 30 : 0
    trailer.current!.position.z = FRONT + 0.15 + away
    const slide = t < 0 ? 0 : t < 0.8 ? (t / 0.8) ** 2 * 6 : 6
    const back = t >= 4.3 || t < 0
    pallet.current!.position.z = DOCK.pallet.z + (back ? 0 : slide) + (t > 1.7 && !back ? away : 0)
    pallet.current!.visible = t < 0 || t < 1.5 || t >= 4.3
    pallet.current!.scale.setScalar(t >= 4.3 ? Math.min(1, (t - 4.3) / 0.4) : 1)
  })
  const dw = 4.4, dh = 4.3
  const stack = items.slice(0, 12)
  return (
    <group>
      <group position={[DOCK.x, 0, FRONT]}>
        <Line points={[[-dw / 2, 0, 0], [-dw / 2, dh, 0], [dw / 2, dh, 0], [dw / 2, 0, 0]]} color={c.edge} lineWidth={1.4} />
        <Line points={[[-dw / 2 - 3.2, 0, 0], [-dw / 2 - 3.2, 5.2, 0], [dw / 2 + 3.2, 5.2, 0], [dw / 2 + 3.2, 0, 0]]} color={c.edge} lineWidth={1} />
        <Line points={[[-dw / 2 - 0.2, dh + 0.25, 0], [dw / 2 + 0.2, dh + 0.25, 0]]} color={c.edge} lineWidth={1} />
        <Box size={[dw - 0.2, 0.12, 1.2]} position={[0, 0.06, -0.6]} color={c.surface} edge={PAINT} />
        <group ref={door} position={[0, dh, 0.05]}>
          <mesh position={[0, -dh / 2, 0]}>
            <planeGeometry args={[dw, dh]} />
            <meshBasicMaterial color={c.surface} transparent opacity={0.85} side={DoubleSide} />
          </mesh>
          {Array.from({ length: 12 }, (_, i) => (
            <Line key={i} points={[[-dw / 2, -((i + 1) * dh) / 12, 0.01], [dw / 2, -((i + 1) * dh) / 12, 0.01]]} color={c.edge} lineWidth={1} />
          ))}
        </group>
      </group>
      <group ref={trailer} position={[DOCK.x, 0, FRONT + 0.15]}>
        <Line
          points={[[-2.2, 1.1, 0], [-2.2, 4.4, 0], [2.2, 4.4, 0], [2.2, 1.1, 0], [-2.2, 1.1, 0], [-2.2, 1.1, 10], [-2.2, 4.4, 10], [-2.2, 4.4, 0], [-2.2, 4.4, 10], [2.2, 4.4, 10], [2.2, 4.4, 0], [2.2, 4.4, 10], [2.2, 1.1, 10], [2.2, 1.1, 0], [2.2, 1.1, 10], [-2.2, 1.1, 10]]}
          color={c.edge}
          lineWidth={1}
        />
        {[1.4, 2.4, 8.4].map((z) => (
          <mesh key={z} position={[0, 0.48, z]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.48, 0.48, 4.2, 22]} />
            <meshStandardMaterial color={c.surface} roughness={1} />
            <Edges color={c.edge} threshold={20} />
          </mesh>
        ))}
      </group>
      <group
        ref={pallet}
        position={[DOCK.pallet.x, 0, DOCK.pallet.z]}
        onClick={(e) => { if (e.delta > 6) return; e.stopPropagation(); onShip() }}
        onPointerOver={(e) => { e.stopPropagation(); tip.show(e.nativeEvent, 'Outbound pallet', `${items.length} parts · the label is your command · click to ship (copy)`) }}
        onPointerMove={(e) => tip.move(e.nativeEvent)}
        onPointerOut={() => tip.hide()}
      >
        <Box size={[2.2, 0.16, 1.8]} position={[0, 0.08, 0]} color={c.surface} edge={c.edge} />
        {stack.map((item, i) => {
          const x = (i % 2) - 0.5, z = (Math.floor(i / 2) % 2) - 0.5, y = Math.floor(i / 4)
          return <Box key={item.ref} size={[0.92, 0.6, 0.76]} position={[x * 0.98, 0.46 + y * 0.62, z * 0.82]} color={`hsl(${item.hue}, ${c.toteS}%, ${c.tote}%)`} edge={c.edge} />
        })}
        <mesh position={[0, 0.16 + Math.max(1, Math.ceil(stack.length / 4)) * 0.62 + 0.75, 0.95]}>
          <planeGeometry args={[1.9, 1.55]} />
          <meshBasicMaterial map={label} toneMapped={false} />
        </mesh>
        <Line points={[[-0.95, 0.16, 0.92], [-0.95, 0.16 + Math.max(1, Math.ceil(stack.length / 4)) * 0.62 + 1.5, 0.92]]} color={c.edge} lineWidth={1} />
        <Line points={[[0.95, 0.16, 0.92], [0.95, 0.16 + Math.max(1, Math.ceil(stack.length / 4)) * 0.62 + 1.5, 0.92]]} color={c.edge} lineWidth={1} />
      </group>
    </group>
  )
}
