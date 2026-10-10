import { Vector3 } from 'three'

import type { Lab } from '../../lab.types'
import type { Density, Facts, Grouping, Layout, Sort } from './layout'
import type { Sim } from './sim'
import type { Tip } from './kit'

export type Heat = 'popular' | 'selection' | 'off'
export type Knobs = { grouping: Grouping; sort: Sort; density: Density; heat: Heat; minimap: boolean; follow: boolean; lanes: boolean }

export type Cam = {
  target: Vector3
  ppu: number
  want: Vector3
  wantPpu: number
  rate: number
  override: boolean
  following: boolean
  home: { target: Vector3; ppu: number }
}

/** Mutable state shared by the scene, the DOM overlays and the frame loop without re-rendering React. */
export type RT = {
  lab: Lab
  L: Layout
  facts: Facts
  sim: Sim
  knobs: Knobs
  cam: Cam
  size: { w: number; h: number; panel: number; bottom: number }
  match: Uint8Array | null
  /** True when `match` comes from a search; a category focus lights bins without a pick list. */
  query: boolean
  binPos: Float32Array
  corners: Float32Array
  hover: number
  tip: Tip
  where: string[]
  level: number
  fps: number
}

export const AZ = 0.42
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
export const ss = smooth

export const elFor = (ppu: number) => 0.98 + (0.56 - 0.98) * smooth(Math.log(4.5), Math.log(40), Math.log(ppu))

export function basis(el: number) {
  const dir = new Vector3(Math.sin(AZ) * Math.cos(el), Math.sin(el), Math.cos(AZ) * Math.cos(el))
  const right = new Vector3(Math.cos(AZ), 0, -Math.sin(AZ))
  const up = new Vector3().crossVectors(dir, right)
  const fwd = new Vector3(-Math.sin(AZ), 0, -Math.cos(AZ))
  return { dir, right, up, fwd }
}

export const LEVELS = ['Campus', 'Hall', 'Aisle', 'Bin'] as const
export const LEVEL_PPU = [3.9, 7.5, 18, 80] as const
export const levelOf = (ppu: number) => (ppu < 4.2 ? 0 : ppu < 12.5 ? 1 : ppu < 32 ? 2 : 3)

export function lod(ppu: number) {
  return {
    roof: 1 - smooth(3.4, 5, ppu),
    heat: 1 - smooth(10.5, 13, ppu),
    bins: smooth(10, 13, ppu),
    labels: smooth(12, 17, ppu),
    signs: smooth(3.6, 5, ppu),
  }
}

/** Fits 3D points in the free part of the viewport; the panel and the top pill take their share. */
export function fit(points: readonly (readonly [number, number, number])[], size: RT['size'], pad = 0.04) {
  const w = size.w - size.panel
  const h = size.h - 72 - size.bottom
  let ppu = 8
  let center = new Vector3()
  for (let iter = 0; iter < 4; iter++) {
    const { dir, right, up } = basis(elFor(ppu))
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
    const v = new Vector3()
    for (const p of points) {
      v.set(p[0], p[1], p[2])
      const x = v.dot(right), y = v.dot(up)
      x0 = Math.min(x0, x); x1 = Math.max(x1, x)
      y0 = Math.min(y0, y); y1 = Math.max(y1, y)
    }
    ppu = Math.min(w * (1 - 2 * pad) / Math.max(1, x1 - x0), h * (1 - 2 * pad) / Math.max(1, y1 - y0))
    ppu = Math.min(90, Math.max(2.4, ppu))
    center = right.clone().multiplyScalar((x0 + x1) / 2).addScaledVector(up, (y0 + y1) / 2)
    center.addScaledVector(dir, -center.y / dir.y)
  }
  return { target: offset(center, size, ppu), ppu }
}

/** Shifts a ground point so it lands in the centre of the free area rather than the canvas centre. */
export function offset(point: Vector3, size: RT['size'], ppu: number) {
  const el = elFor(ppu)
  const { right, fwd } = basis(el)
  return point.clone().addScaledVector(right, size.panel / 2 / ppu).addScaledVector(fwd, (36 - size.bottom / 2) / ppu / Math.sin(el))
}
