import {
  BoxGeometry, BufferGeometry, CanvasTexture, CylinderGeometry, EdgesGeometry, Euler, Float32BufferAttribute, LineBasicMaterial, Matrix4,
  MeshBasicMaterial, MeshStandardMaterial, Quaternion, SRGBColorSpace, Vector3,
} from 'three'
import type { Material } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

export const FONT = '"Timeless Grotesk", ui-sans-serif, system-ui, sans-serif'
export const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace'

export const reducedMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))

export type Piece = { geo: BufferGeometry; at?: [number, number, number]; rot?: [number, number, number]; threshold?: number }
const placed = (p: Piece, geo: BufferGeometry) => {
  const m = new Matrix4().compose(
    new Vector3(...(p.at ?? [0, 0, 0])),
    new Quaternion().setFromEuler(new Euler(...(p.rot ?? [0, 0, 0]))),
    new Vector3(1, 1, 1),
  )
  return geo.applyMatrix4(m)
}
/** One fill geometry for a rigid body. */
export function mergeFills(pieces: Piece[]) {
  return mergeGeometries(pieces.map((p) => placed(p, p.geo.clone())))!
}
/** One hairline geometry for a rigid body: edges per piece, then merged. */
export function mergeEdges(pieces: Piece[]) {
  return mergeGeometries(pieces.map((p) => placed(p, new EdgesGeometry(p.geo, p.threshold ?? 1))))!
}
export const box = (w: number, h: number, d: number) => new BoxGeometry(w, h, d)
export const cyl = (rt: number, rb: number, h: number, n = 24) => new CylinderGeometry(rt, rb, h, n)

const fills = new Map<string, Material>()
/** Shared fill material: unlit when `flat`, else standard. Cached by its inputs, never disposed. */
export function fillMat(color: string, flat: boolean, rough = 1, opts?: { transparent?: boolean; opacity?: number; metal?: number }) {
  const key = `${color}|${flat}|${rough}|${opts?.opacity ?? 1}|${opts?.metal ?? 0}`
  let m = fills.get(key)
  if (!m) {
    m = flat
      ? new MeshBasicMaterial({ color, transparent: !!opts?.transparent, opacity: opts?.opacity ?? 1 })
      : new MeshStandardMaterial({ color, roughness: rough, metalness: opts?.metal ?? 0, transparent: !!opts?.transparent, opacity: opts?.opacity ?? 1 })
    fills.set(key, m)
  }
  return m
}
const lines = new Map<string, LineBasicMaterial>()
/** Shared hairline material. */
export function lineMat(color: string, opacity = 1) {
  const key = `${color}|${opacity}`
  let m = lines.get(key)
  if (!m) {
    m = new LineBasicMaterial({ color, transparent: opacity < 1, opacity })
    lines.set(key, m)
  }
  return m
}

export function textTexture(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  draw(canvas.getContext('2d')!)
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 8
  return texture
}

export function segs(list: number[]) {
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(list, 3))
  return g
}
/** A flat rectangle outline at height `y` as line-segment pairs. */
export const rect = (x0: number, z0: number, x1: number, z1: number, y: number) => [
  x0, y, z0, x1, y, z0, x1, y, z0, x1, y, z1, x1, y, z1, x0, y, z1, x0, y, z1, x0, y, z0,
]
export const tint = (hue: number, s: number, l: number) => `hsl(${hue}, ${s}%, ${l}%)`
