import {
  BoxGeometry, BufferGeometry, CanvasTexture, CylinderGeometry, EdgesGeometry, Euler, Float32BufferAttribute, LineBasicMaterial, Matrix4,
  MeshBasicMaterial, MeshStandardMaterial, Quaternion, SRGBColorSpace, Vector3, getConsoleFunction, setConsoleFunction,
} from 'three'
import type { Material } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { useEffect, useMemo } from 'react'

export const FONT = '"Timeless Grotesk", ui-sans-serif, system-ui, sans-serif'
export const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace'

/**
 * R3F 9.8 (the latest stable) still builds a THREE.Clock for its frame loop,
 * and three r183 deprecated Clock with a warning on construction. Drop that
 * one line until R3F moves to THREE.Timer; everything else passes through.
 */
if (!getConsoleFunction())
  setConsoleFunction((type, message, ...params) => {
    if (type === 'warn' && message.startsWith('THREE.Clock:')) return
    console[type](message, ...params)
  })

export { reducedMotion } from '../../../kit/env'
export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
/** Hermite ease of `t` clamped to 0..1. */
export const smoothstep = (t: number) => {
  const x = clamp(t, 0, 1)
  return x * x * (3 - 2 * x)
}
/** The fraction of the way to close in `dt` seconds when approaching a target at `rate` per second, frame-rate independent. */
export const damp = (dt: number, rate: number) => 1 - Math.exp(-dt * rate)

type Disposable = { dispose(): void }
const disposeAll = (v: unknown) => {
  if (!v || typeof v !== 'object') return
  if (typeof (v as Disposable).dispose === 'function') return (v as Disposable).dispose()
  for (const x of Array.isArray(v) ? v : Object.values(v)) if (x && typeof (x as Disposable).dispose === 'function') (x as Disposable).dispose()
}
/**
 * GPU resources built from `deps`: `make` returns one geometry, material or texture, or an array or object of them,
 * and every one is disposed when `deps` change or the component unmounts. Build related resources in one call.
 */
export function useDisposable<T>(make: () => T, deps: readonly unknown[]): T {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const made = useMemo(make, deps)
  useEffect(() => () => disposeAll(made), [made])
  return made
}
/** Writes fields on an object no render reads, such as camera state or a material, from an effect, a handler or the frame loop. */
export function patch<T extends object>(target: T, fields: Partial<T>) {
  Object.assign(target, fields)
}

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
/** One hairline geometry for a rigid body: edges per piece, then `lines` (segment pairs such as rings), merged. */
export function mergeEdges(pieces: Piece[], lines?: number[]) {
  const edges = pieces.map((p) => placed(p, new EdgesGeometry(p.geo, p.threshold ?? 1)))
  return mergeGeometries(lines?.length ? [...edges, segs(lines)] : edges)!
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
/**
 * Textured quads as one indexed geometry: quad i samples `uvs[i]` (`[u0, v0, u1, v1]`) and has corners
 * `corners[i * 12 ..]`, bottom-left, bottom-right, top-right, top-left as the texture reads. Without `corners`
 * the positions start at zero, for a caller that writes them each frame.
 */
export function quadGeometry(uvs: readonly (readonly [number, number, number, number])[], corners?: ArrayLike<number>) {
  const n = uvs.length
  const uv = new Float32Array(n * 8), idx: number[] = []
  uvs.forEach(([u0, v0, u1, v1], i) => {
    uv.set([u0, v0, u1, v0, u1, v1, u0, v1], i * 8)
    idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3)
  })
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(corners ? Float32Array.from(corners) : new Float32Array(n * 12), 3))
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  return g
}
/** A flat rectangle outline at height `y` as line-segment pairs. */
export const rect = (x0: number, z0: number, x1: number, z1: number, y: number) => [
  x0, y, z0, x1, y, z0, x1, y, z0, x1, y, z1, x1, y, z1, x0, y, z1, x0, y, z1, x0, y, z0,
]
/** A circle of `n` segments in the XZ plane at height `y`, as line-segment pairs for `segs`, appended to `out`. */
export function ring(cx: number, y: number, cz: number, r: number, n = 32, out: number[] = []) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, b = ((i + 1) / n) * Math.PI * 2
    out.push(cx + Math.cos(a) * r, y, cz + Math.sin(a) * r, cx + Math.cos(b) * r, y, cz + Math.sin(b) * r)
  }
  return out
}
export const tint = (hue: number, s: number, l: number) => `hsl(${hue}, ${s}%, ${l}%)`
/** A Park-Miller generator: the same `seed` always yields the same sequence in (0, 1). */
export function seeded(seed: number) {
  let s = seed
  return () => (s = (s * 16807) % 2147483647) / 2147483647
}
