import { useEffect, useMemo, useRef } from 'react'
import {
  BoxGeometry, BufferAttribute, BufferGeometry, CanvasTexture, CylinderGeometry, EdgesGeometry, Euler, LineBasicMaterial, LineDashedMaterial,
  LineSegments, Matrix4, MeshBasicMaterial, Quaternion, SRGBColorSpace, SphereGeometry, TorusGeometry, Vector3,
} from 'three'
import type { Material } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import type { Lab } from '../../../lab.types'

/*
 * The industrial design system every machine shares.
 *   Stroke: one WebGL hairline (1px) for every edge. `edge` for structure,
 *   `dim` for secondary marks (slot outlines, idle traces, pad rings),
 *   `accent` for the one active thing, a brand color only on a machine's
 *   nameplate dot, its single trim line and its work effect.
 *   Fill: flat `surface`, unlit. Depth comes from edges, not shading.
 *   Radii: structures are square; machines are round (cylinders, tori, spheres).
 *   Nameplates: dot · brand · model · role, one generator, one size.
 */

export type Look = {
  theme: Lab['theme']
  bg: string
  surface: string
  fg: string
  muted: string
  edge: string
  dim: string
  accent: string
  board: string
  chip: string
  chipFg: string
  grid: string
  section: string
  glass: string
  l: number
  s: number
}
export function lookOf(theme: Lab['theme']): Look {
  return theme === 'dark'
    ? { theme, bg: '#090E11', surface: '#12171A', fg: '#FCFCFC', muted: '#8A9094', edge: '#6B777D', dim: '#2C363C', accent: '#7CB8D6', board: '#0F1518', chip: '#0B0F12', chipFg: '#FCFCFC', grid: '#141B20', section: '#1C262C', glass: '#1B2A30', l: 42, s: 34 }
    : { theme, bg: '#EDF1F3', surface: '#FFFFFF', fg: '#1D2225', muted: '#727C81', edge: '#8E989D', dim: '#CBD2D6', accent: '#5A91AD', board: '#F7FAFB', chip: '#FFFFFF', chipFg: '#1D2225', grid: '#DEE4E7', section: '#CDD5D9', glass: '#F3F8FA', l: 64, s: 46 }
}
export const tint = (hue: number, c: Look, l = c.l) => `hsl(${hue}, ${c.s}%, ${l}%)`
export const FONT = '"Timeless Grotesk", ui-sans-serif, system-ui, sans-serif'
export const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace'

const fills = new Map<string, MeshBasicMaterial>()
const lines = new Map<string, LineBasicMaterial>()
/** Shared, flat fill material per color. */
export function fillMat(color: string, opacity = 1) {
  const key = `${color}|${opacity}`
  let m = fills.get(key)
  if (!m) fills.set(key, (m = new MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: opacity >= 0.5 })))
  return m
}
/** Shared hairline material per color. */
export function lineMat(color: string, opacity = 1) {
  const key = `${color}|${opacity}`
  let m = lines.get(key)
  if (!m) lines.set(key, (m = new LineBasicMaterial({ color, transparent: opacity < 1, opacity, toneMapped: false })))
  return m
}

const M = new Matrix4()
const Q = new Quaternion()
const E = new Euler()
const S = new Vector3(1, 1, 1)
const P = new Vector3()

/** Accumulates primitives into one fill geometry and one edge geometry. */
export class Hairline {
  private fills: BufferGeometry[] = []
  private edges: number[] = []

  private place(g: BufferGeometry, x: number, y: number, z: number, rot?: [number, number, number], threshold = 1, fill = true) {
    M.compose(P.set(x, y, z), rot ? Q.setFromEuler(E.set(rot[0], rot[1], rot[2])) : Q.identity(), S)
    const e = new EdgesGeometry(g, threshold)
    e.applyMatrix4(M)
    this.edges.push(...(e.getAttribute('position').array as Float32Array))
    e.dispose()
    if (fill) {
      g.applyMatrix4(M)
      this.fills.push(g)
    } else g.dispose()
    return this
  }
  box(w: number, h: number, d: number, x: number, y: number, z: number, rot?: [number, number, number], fill = true) {
    return this.place(new BoxGeometry(w, h, d), x, y, z, rot, 1, fill)
  }
  cyl(rt: number, rb: number, h: number, x: number, y: number, z: number, seg = 24, rot?: [number, number, number], open = false) {
    return this.place(new CylinderGeometry(rt, rb, h, seg, 1, open), x, y, z, rot, 20)
  }
  sphere(r: number, x: number, y: number, z: number, w = 16, h = 10, threshold = 30) {
    return this.place(new SphereGeometry(r, w, h), x, y, z, undefined, threshold)
  }
  torus(r: number, tube: number, x: number, y: number, z: number, rot?: [number, number, number], radial = 6, tubular = 32, arc = Math.PI * 2) {
    return this.place(new TorusGeometry(r, tube, radial, tubular, arc), x, y, z, rot, 40)
  }
  geo(g: BufferGeometry, x = 0, y = 0, z = 0, rot?: [number, number, number], threshold = 20, fill = true) {
    return this.place(g, x, y, z, rot, threshold, fill)
  }
  seg(ax: number, ay: number, az: number, bx: number, by: number, bz: number) {
    this.edges.push(ax, ay, az, bx, by, bz)
    return this
  }
  poly(points: readonly (readonly [number, number, number])[], closed = false) {
    for (let i = 1; i < points.length; i++) this.seg(...points[i - 1], ...points[i])
    if (closed && points.length > 2) this.seg(...points[points.length - 1], ...points[0])
    return this
  }
  rect(x0: number, z0: number, x1: number, z1: number, y: number) {
    return this.poly([[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]], true)
  }
  circle(x: number, y: number, z: number, r: number, n = 48, dash = false, axis: 'y' | 'z' = 'y') {
    for (let i = 0; i < n; i++) {
      if (dash && i % 2) continue
      const a = (i / n) * Math.PI * 2, b = ((i + 1) / n) * Math.PI * 2
      if (axis === 'y') this.seg(x + Math.cos(a) * r, y, z + Math.sin(a) * r, x + Math.cos(b) * r, y, z + Math.sin(b) * r)
      else this.seg(x + Math.cos(a) * r, y + Math.sin(a) * r, z, x + Math.cos(b) * r, y + Math.sin(b) * r, z)
    }
    return this
  }
  build() {
    const edge = new BufferGeometry()
    edge.setAttribute('position', new BufferAttribute(new Float32Array(this.edges), 3))
    const fill = this.fills.length ? mergeGeometries(this.fills) : null
    for (const g of this.fills) g.dispose()
    return { fill, edge }
  }
}

/** Renders one built assembly: a flat fill mesh and a hairline edge mesh. */
export function Solid({ build, fill, edge, opacity = 1, dashed, position, rotation, visible = true, renderOrder }: {
  build: () => ReturnType<Hairline['build']>
  fill: string
  edge: string
  opacity?: number
  dashed?: [number, number]
  position?: [number, number, number]
  rotation?: [number, number, number]
  visible?: boolean
  renderOrder?: number
}) {
  const geo = useMemo(build, [build])
  useEffect(() => () => { geo.fill?.dispose(); geo.edge.dispose() }, [geo])
  const edgeMat = useMemo<Material>(() => {
    if (!dashed) return lineMat(edge, opacity)
    return new LineDashedMaterial({ color: edge, dashSize: dashed[0], gapSize: dashed[1], transparent: opacity < 1, opacity, toneMapped: false })
  }, [edge, opacity, dashed])
  useEffect(() => () => { if (dashed) edgeMat.dispose() }, [edgeMat, dashed])
  const line = useMemo(() => {
    const l = new LineSegments(geo.edge, edgeMat)
    if (dashed) l.computeLineDistances()
    l.frustumCulled = false
    return l
  }, [geo, edgeMat, dashed])
  return (
    <group position={position} rotation={rotation} visible={visible} renderOrder={renderOrder}>
      {geo.fill && <mesh geometry={geo.fill} material={fillMat(fill, opacity)} frustumCulled={false} />}
      <primitive object={line} />
    </group>
  )
}

/** A pool of hairline segments rewritten every frame. */
export function useSegments(max: number, color: string, opacity = 1) {
  const line = useMemo(() => {
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(max * 6), 3))
    geometry.setDrawRange(0, 0)
    const segments = new LineSegments(geometry, new LineBasicMaterial({ color, transparent: true, opacity, toneMapped: false, depthWrite: false }))
    segments.frustumCulled = false
    return segments
  }, [max])
  useEffect(() => {
    const m = line.material as LineBasicMaterial
    m.color.set(color)
    m.opacity = opacity
  }, [line, color, opacity])
  useEffect(() => () => { line.geometry.dispose(); (line.material as Material).dispose() }, [line])
  return line
}
const SX = [-1, 1, 1, -1, -1, 1, 1, -1]
const SY = [-1, -1, -1, -1, 1, 1, 1, 1]
const SZ = [-1, -1, 1, 1, -1, -1, 1, 1]
const BOX = [0, 1, 1, 2, 2, 3, 3, 0, 4, 5, 5, 6, 6, 7, 7, 4, 0, 4, 1, 5, 2, 6, 3, 7]
const CORNER = new Float32Array(24)

/** Rewrites one pooled LineSegments each frame without allocating: `segmentWriter(line)` rewinds and returns the line's writer. */
class SegmentWriter {
  private n = 0
  private readonly arr: Float32Array
  private readonly max: number
  constructor(private readonly line: LineSegments) {
    this.arr = (line.geometry.getAttribute('position') as BufferAttribute).array as Float32Array
    this.max = this.arr.length / 6
  }
  rewind() {
    this.n = 0
    return this
  }
  add(ax: number, ay: number, az: number, bx: number, by: number, bz: number) {
    if (this.n >= this.max) return
    const a = this.arr, o = this.n++ * 6
    a[o] = ax; a[o + 1] = ay; a[o + 2] = az
    a[o + 3] = bx; a[o + 4] = by; a[o + 5] = bz
  }
  /** The twelve edges of a box of half extents (hx, hy, hz) at (x, y, z), yawed by `rot` about y and rolled by `roll` about x. */
  box(x: number, y: number, z: number, hx: number, hy: number, hz: number, rot = 0, roll = 0) {
    const cs = Math.cos(rot), sn = Math.sin(rot), cr = Math.cos(roll), sr = Math.sin(roll)
    for (let k = 0; k < 8; k++) {
      const ax = SX[k] * hx, ay = SY[k] * hy, az = SZ[k] * hz
      const ry = ay * cr - az * sr, rz = ay * sr + az * cr
      CORNER[k * 3] = x + ax * cs + rz * sn
      CORNER[k * 3 + 1] = y + ry
      CORNER[k * 3 + 2] = z - ax * sn + rz * cs
    }
    for (let e = 0; e < 24; e += 2) {
      const a = BOX[e] * 3, b = BOX[e + 1] * 3
      this.add(CORNER[a], CORNER[a + 1], CORNER[a + 2], CORNER[b], CORNER[b + 1], CORNER[b + 2])
    }
  }
  done() {
    this.line.geometry.setDrawRange(0, this.n * 2)
    this.line.geometry.getAttribute('position').needsUpdate = true
  }
}
const writers = new WeakMap<LineSegments, SegmentWriter>()
export function segmentWriter(line: LineSegments) {
  let w = writers.get(line)
  if (!w) writers.set(line, (w = new SegmentWriter(line)))
  return w.rewind()
}
export type Writer = SegmentWriter

/**
 * Labels stay on plain trilinear filtering: anisotropic sampling dropped
 * strokes from small type on the floor at grazing angles, where trilinear only
 * softens it.
 */
export function textTexture(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  draw(canvas.getContext('2d')!)
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  return texture
}
export type UV = readonly [number, number, number, number]
/**
 * Shelf-packs labels into one canvas so many labels share one texture and
 * one draw. Returns each label's uv rect as [u0, v0, u1, v1].
 */
export function atlasTexture(width: number, cells: readonly { w: number; h: number; draw: (ctx: CanvasRenderingContext2D) => void }[]) {
  let x = 0, y = 0, row = 0
  const rects = cells.map(({ w, h }) => {
    if (x + w > width) {
      x = 0
      y += row
      row = 0
    }
    const r = { x, y, w, h }
    x += w
    row = Math.max(row, h)
    return r
  })
  const height = Math.max(1, y + row)
  const texture = textTexture(width, height, (ctx) =>
    cells.forEach((cell, i) => {
      const r = rects[i]
      ctx.save()
      ctx.translate(r.x, r.y)
      ctx.beginPath()
      ctx.rect(0, 0, r.w, r.h)
      ctx.clip()
      cell.draw(ctx)
      ctx.restore()
    }),
  )
  const uv = rects.map((r): UV => [r.x / width, 1 - (r.y + r.h) / height, (r.x + r.w) / width, 1 - r.y / height])
  return { texture, uv }
}

/** `n` textured quads in one indexed geometry, placed with `setQuad`. */
export function quadGeometry(n: number) {
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(n * 12), 3))
  g.setAttribute('uv', new BufferAttribute(new Float32Array(n * 8), 2))
  const index = new Uint32Array(n * 6)
  for (let i = 0; i < n; i++) index.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6)
  g.setIndex(new BufferAttribute(index, 1))
  g.setDrawRange(0, 0)
  return g
}
/** Quad `i` centred at (cx, cy, cz) with half axes u (along the texture's x) and v (along its y). */
export function setQuad(g: BufferGeometry, i: number, cx: number, cy: number, cz: number, ux: number, uy: number, uz: number, vx: number, vy: number, vz: number, uv: UV) {
  const pos = g.getAttribute('position').array as Float32Array
  const tex = g.getAttribute('uv').array as Float32Array
  const o = i * 12
  pos[o] = cx - ux - vx; pos[o + 1] = cy - uy - vy; pos[o + 2] = cz - uz - vz
  pos[o + 3] = cx + ux - vx; pos[o + 4] = cy + uy - vy; pos[o + 5] = cz + uz - vz
  pos[o + 6] = cx + ux + vx; pos[o + 7] = cy + uy + vy; pos[o + 8] = cz + uz + vz
  pos[o + 9] = cx - ux + vx; pos[o + 10] = cy - uy + vy; pos[o + 11] = cz - uz + vz
  const t = i * 8
  tex[t] = uv[0]; tex[t + 1] = uv[1]
  tex[t + 2] = uv[2]; tex[t + 3] = uv[1]
  tex[t + 4] = uv[2]; tex[t + 5] = uv[3]
  tex[t + 6] = uv[0]; tex[t + 7] = uv[3]
}
export function flushQuads(g: BufferGeometry, n: number) {
  g.setDrawRange(0, n * 6)
  g.getAttribute('position').needsUpdate = true
  g.getAttribute('uv').needsUpdate = true
}

export function useTexture(make: () => CanvasTexture, deps: unknown[]) {
  const texture = useMemo(make, deps)
  useEffect(() => () => texture.dispose(), [texture])
  return texture
}

/** The one nameplate: brand dot, brand, model, role or status, drawn into a 640×160 cell; place at a 4:1 aspect. */
export function drawPlate(ctx: CanvasRenderingContext2D, c: Look, color: string, brand: string, model: string, status: string, live: boolean) {
  ctx.strokeStyle = live ? color : c.edge
  ctx.lineWidth = live ? 4 : 2
  ctx.setLineDash(live ? [] : [10, 8])
  ctx.beginPath()
  ctx.roundRect(4, 4, 632, 152, 14)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(42, 50, 11, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = c.fg
  ctx.font = `500 42px ${FONT}`
  ctx.fillText(brand, 66, 64)
  ctx.fillStyle = c.muted
  ctx.font = `400 30px ${FONT}`
  ctx.fillText(model, 30, 108)
  ctx.fillStyle = live ? color : c.muted
  ctx.font = `500 24px ${MONO}`
  ctx.fillText(status.toUpperCase(), 30, 144)
}

/** Labels draw after the transparent floor grid, which otherwise sorts over them from some angles and blanks rows of type. */
export const LABEL_ORDER = 1

/** A texture on a plane, flat on the floor by default. */
export function Flat({ texture, size, position, rotation = [-Math.PI / 2, 0, 0], opacity = 1, depthTest = true }: {
  texture: CanvasTexture
  size: [number, number]
  position: [number, number, number]
  rotation?: [number, number, number]
  opacity?: number
  depthTest?: boolean
}) {
  return (
    <mesh position={position} rotation={rotation} renderOrder={LABEL_ORDER}>
      <planeGeometry args={size} />
      <meshBasicMaterial map={texture} transparent opacity={opacity} toneMapped={false} depthWrite={false} depthTest={depthTest} />
    </mesh>
  )
}

/** Hover tooltips. Touch pointers never hover, so `show` ignores them unless `pinned` (a long press). */
export type Tip = { show: (e: PointerEvent, title: string, sub: string, pinned?: boolean) => void; move: (e: PointerEvent) => void; hide: () => void }
export type Guard = { moved: boolean }
export function useTip() {
  const ref = useRef<HTMLDivElement>(null)
  const api = useMemo<Tip>(() => {
    const move = (e: PointerEvent) => {
      const el = ref.current
      if (!el) return
      const x = Math.max(8, Math.min(e.clientX + 14, innerWidth - el.offsetWidth - 8))
      const y = Math.min(e.clientY + 14, innerHeight - el.offsetHeight - 8)
      el.style.transform = `translate(${x}px, ${y}px)`
    }
    return {
      show: (e, title, sub, pinned) => {
        const el = ref.current
        if (!el || (e.pointerType === 'touch' && !pinned)) return
        el.children[0].textContent = title
        el.children[1].textContent = sub
        el.style.opacity = '1'
        document.body.style.cursor = 'pointer'
        move(e)
      },
      move,
      hide: () => {
        if (ref.current) ref.current.style.opacity = '0'
        document.body.style.cursor = ''
      },
    }
  }, [])
  return [ref, api] as const
}
export const hover = (tip: Tip, title: () => string, sub: () => string) => ({
  onPointerOver: (e: { stopPropagation: () => void; nativeEvent: PointerEvent }) => {
    e.stopPropagation()
    tip.show(e.nativeEvent, title(), sub())
  },
  onPointerMove: (e: { nativeEvent: PointerEvent }) => tip.move(e.nativeEvent),
  onPointerOut: () => tip.hide(),
})
