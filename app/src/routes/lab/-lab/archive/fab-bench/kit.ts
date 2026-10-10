import {
  BoxGeometry, BufferAttribute, BufferGeometry, CanvasTexture, Color, CylinderGeometry, DynamicDrawUsage, EdgesGeometry, Euler, Float32BufferAttribute, LineBasicMaterial,
  LineSegments, Matrix4, Mesh, MeshStandardMaterial, SRGBColorSpace, Vector3,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import type { Lab } from '../../lab.types'

export const ACCENT = '#5A91AD'
export const FONT = '"Timeless Grotesk", ui-sans-serif, system-ui, sans-serif'
export const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace'
export const reducedMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

export type Mat = 'cutting' | 'esd' | 'blueprint'
export type Finish = 'hairline' | 'fr4'

export type Colors = {
  dark: boolean
  bg: string
  mat: string
  matLine: string
  matMajor: string
  matInk: string
  surface: string
  fg: string
  muted: string
  edge: string
  dim: string
  board: string
  boardEdge: string
  silk: string
  trace: string
  lit: string
  body: string
  bodyEdge: string
  ink: string
  pin: string
  sub: string
  power: string
  ghost: string
  l: number
  s: number
}

export function palette(theme: Lab['theme'], mat: Mat, finish: Finish): Colors {
  const dark = theme === 'dark'
  const base = dark
    ? { dark, surface: '#161D21', fg: '#FCFCFC', muted: '#8A9094', edge: '#66727A', dim: '#2C3740', l: 50, s: 38 }
    : { dark, surface: '#FFFFFF', fg: '#1D2225', muted: '#727C81', edge: '#8E999F', dim: '#C6CED2', l: 60, s: 46 }
  const mats: Record<Mat, Pick<Colors, 'bg' | 'mat' | 'matLine' | 'matMajor' | 'matInk'>> = {
    cutting: dark
      ? { bg: '#1A2320', mat: '#1B2522', matLine: '#28362F', matMajor: '#374A40', matInk: '#5E7A6C' }
      : { bg: '#C4CEC7', mat: '#C6D0C9', matLine: '#B3BFB7', matMajor: '#9CACA2', matInk: '#768A7D' },
    esd: dark
      ? { bg: '#0E1417', mat: '#10171B', matLine: '#1C262C', matMajor: '#2A3740', matInk: '#55656F' }
      : { bg: '#C3CCD1', mat: '#C5CED3', matLine: '#B3BEC4', matMajor: '#9FACB3', matInk: '#73818A' },
    blueprint: dark
      ? { bg: '#0C2440', mat: '#0C2440', matLine: '#1B3A5E', matMajor: '#2C527D', matInk: '#8FB0D0' }
      : { bg: '#EEF3F8', mat: '#EEF3F8', matLine: '#D3E0EC', matMajor: '#B4C9DE', matInk: '#5C7A99' },
  }
  const power = '#E8A33D'
  const fr4 = {
    board: dark ? '#173A28' : '#2C6646', boardEdge: dark ? '#2E6B4C' : '#1E4B33', silk: '#EEF2EC', trace: dark ? '#22513A' : '#3B7D58', lit: '#F0C36A',
    body: '#1A1D1F', bodyEdge: '#3D4448', ink: '#C9CFD3', pin: '#C9CED1', sub: '#2E4A36', ghost: dark ? '#24493A' : '#4B8566',
  }
  const hairline = {
    board: dark ? '#111A1F' : '#F9FBFC', boardEdge: dark ? '#4F5C63' : '#9AA4A9', silk: dark ? '#71808A' : '#8A959B', trace: dark ? '#2B3A44' : '#CDD6DB', lit: ACCENT,
    body: dark ? '#1C262C' : '#FFFFFF', bodyEdge: dark ? '#76848C' : '#8A959B', ink: dark ? '#D2DADF' : '#1D2225', pin: dark ? '#5E6C74' : '#AEB8BE',
    sub: dark ? '#222D34' : '#EEF3F5', ghost: dark ? '#161F25' : '#EEF2F4',
  }
  return { ...base, ...mats[mat], power, ...(finish === 'fr4' ? fr4 : hairline) }
}

export const tint = (hue: number, c: Colors, l = c.l) => `hsl(${hue}, ${c.s}%, ${l}%)`

export function canvasTexture(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  draw(canvas.getContext('2d')!)
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 8
  return texture
}

export const fit = (ctx: CanvasRenderingContext2D, text: string, max: number) => {
  if (ctx.measureText(text).width <= max) return text
  let t = text
  while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1)
  return `${t}…`
}

export type Tip = { show: (e: PointerEvent, title: string, sub: string, image?: string) => void; move: (e: PointerEvent) => void; hide: () => void }

/**
 * Merges static hairline props into one filled mesh (vertex colours) and one
 * edge LineSegments, so a whole bench of boxes and cylinders costs two draws.
 */
export class Hairline {
  private fills: BufferGeometry[] = []
  private lines: BufferGeometry[] = []
  private color = new Color()

  private add(geo: BufferGeometry, m: Matrix4, color: string, edge: boolean, threshold: number) {
    geo.applyMatrix4(m)
    const n = geo.getAttribute('position').count
    this.color.set(color)
    const colors = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) colors.set([this.color.r, this.color.g, this.color.b], i * 3)
    geo.setAttribute('color', new Float32BufferAttribute(colors, 3))
    this.fills.push(geo)
    if (edge) this.lines.push(new EdgesGeometry(geo, threshold))
  }

  box(size: [number, number, number], at: [number, number, number], color: string, rot: [number, number, number] = [0, 0, 0], edge = true) {
    const m = new Matrix4().makeRotationFromEuler(new Euler(rot[0], rot[1], rot[2])).setPosition(at[0], at[1], at[2])
    this.add(new BoxGeometry(...size), m, color, edge, 1)
    return this
  }

  cyl(rt: number, rb: number, h: number, at: [number, number, number], color: string, rot: [number, number, number] = [0, 0, 0], segs = 24, edge = true, threshold = 30, open = false) {
    const m = new Matrix4().makeRotationFromEuler(new Euler(rot[0], rot[1], rot[2])).setPosition(at[0], at[1], at[2])
    this.add(new CylinderGeometry(rt, rb, h, segs, 1, open), m, color, edge, threshold)
    return this
  }

  segs(points: Vector3[]) {
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(points.flatMap((p) => [p.x, p.y, p.z]), 3))
    this.lines.push(g)
    return this
  }

  build(edge: string, rough = 0.9) {
    const fill = this.fills.length ? mergeGeometries(this.fills) : new BufferGeometry()
    const line = this.lines.length ? mergeGeometries(this.lines) : new BufferGeometry()
    const mesh = new Mesh(fill, new MeshStandardMaterial({ vertexColors: true, roughness: rough }))
    const lines = new LineSegments(line, new LineBasicMaterial({ color: edge }))
    mesh.add(lines)
    return mesh
  }
}

export const rectPts = (x0: number, z0: number, x1: number, z1: number, y: number) =>
  [[x0, z0], [x1, z0], [x1, z0], [x1, z1], [x1, z1], [x0, z1], [x0, z1], [x0, z0]].map(([x, z]) => new Vector3(x, y, z))

export const damp = (dt: number, rate: number) => 1 - Math.exp(-dt * rate)
export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
export const smooth = (t: number) => t * t * (3 - 2 * t)

/** A growable line buffer written in place each frame and drawn up to `n` vertices. */
export class Lines {
  geo = new BufferGeometry()
  pos = new Float32Array(0)
  col = new Float32Array(0)
  n = 0
  constructor(private colors: boolean) {}
  begin(vertices: number) {
    if (vertices > this.pos.length / 3) {
      const cap = Math.max(256, vertices * 2)
      this.pos = new Float32Array(cap * 3)
      this.geo.setAttribute('position', new BufferAttribute(this.pos, 3).setUsage(DynamicDrawUsage))
      if (this.colors) {
        this.col = new Float32Array(cap * 3)
        this.geo.setAttribute('color', new BufferAttribute(this.col, 3).setUsage(DynamicDrawUsage))
      }
    }
    this.n = 0
  }
  push(x: number, y: number, z: number, c?: Color) {
    const i = this.n++ * 3
    this.pos[i] = x; this.pos[i + 1] = y; this.pos[i + 2] = z
    if (c) { this.col[i] = c.r; this.col[i + 1] = c.g; this.col[i + 2] = c.b }
  }
  end() {
    this.geo.setDrawRange(0, this.n)
    const p = this.geo.getAttribute('position')
    if (p) p.needsUpdate = true
    const c = this.geo.getAttribute('color')
    if (c) c.needsUpdate = true
  }
}
