import { Vector3 } from 'three'

import type { Catalog, CatalogItem, Category } from '../../../../workspace/-workspace/workspace.types'

export const P = 16
export const ROAD = 2.6
export const LOT = P - ROAD
export const PITCH = 0.5
export const FH = 0.62
export const SLAB = 0.05
export const BIN = { w: 0.4, h: 0.4, d: 0.4 }
export const LOTS_X = [-2, -1, 0, 1, 2]
export const LOTS_Z = [-1, 0, 1]
export const ROADS_X = [-2.5, -1.5, -0.5, 0.5, 1.5, 2.5].map((k) => k * P)
export const ROADS_Z = [-1.5, -0.5, 0.5, 1.5].map((k) => k * P)

/** The factory sits in lot (0, 0); everything inside it is authored in v1 units and scaled by `S`. */
export const FACTORY = { x: -3.64, z: 0.14, s: 0.7 }
export const toWorld = (local: Vector3, out = new Vector3()) =>
  out.set(FACTORY.x + local.x * FACTORY.s, local.y * FACTORY.s, FACTORY.z + local.z * FACTORY.s)
export const PAD_LOCAL = new Vector3(-2.1, 0.9, 1.6)
export const PAD = toWorld(PAD_LOCAL).setY(0)
export const PAD_ROAD = new Vector3(PAD.x, 0, P / 2)
export const UTILITIES = { x: 0, z: -P }

export type Floor = { category: Category; floor: number; count: number; hue: number }

/** One registry source: a warehouse whose floors are categories at fixed global heights. */
export type Building = {
  index: number
  source: string
  name: string
  count: number
  cx: number
  cz: number
  cols: number
  rows: number
  w: number
  d: number
  floors: number
  stocked: Floor[]
  bins: number[]
  door: Vector3
  road: Vector3
  roof: Vector3
}

export type Bin = { index: number; item: CatalogItem; building: number; floor: number; pos: Vector3 }

export type Community = { cx: number; cz: number; door: Vector3; road: Vector3; houses: { x: number; z: number; w: number; d: number; h: number }[] }

export type Town = {
  floors: Category[]
  buildings: Building[]
  bins: Bin[]
  byRef: Map<string, Bin>
  communities: Community[]
  vacant: { cx: number; cz: number }[]
  slabs: { building: number; floor: number }[]
}

const ORDER: [number, number][] = [[-1, 0], [1, 0], [-1, -1], [1, -1], [-2, -1], [2, -1], [-2, 0], [2, 0], [-1, 1], [1, 1], [-2, 1], [2, 1], [0, 1]]

/**
 * Registry first, then category: every source is a building, every category
 * is a floor at the same height in every building, so a category reads as a
 * band across the skyline. The largest sources take the lots beside the
 * factory; leftover lots become the community that ambient trucks serve.
 */
export function toTown(catalog: Catalog): Town {
  const floors = [...catalog.kinds.filter((k) => k.id !== 'all'), ...catalog.blocks]
  const floorOf = new Map(floors.map((f, i) => [f.id, i]))
  const bySource = new Map<string, CatalogItem[]>()
  for (const item of catalog.items) bySource.set(item.source, [...(bySource.get(item.source) ?? []), item])
  const sources = [...bySource].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0])).slice(0, ORDER.length - 1)
  const bins: Bin[] = []
  const buildings = sources.map(([source, items], index): Building => {
    const [a, b] = ORDER[index]
    const cx = a * P, cz = b * P
    const perFloor = new Map<number, CatalogItem[]>()
    for (const item of items) {
      const f = floorOf.get(item.category) ?? floors.length - 1
      perFloor.set(f, [...(perFloor.get(f) ?? []), item])
    }
    const max = Math.max(...[...perFloor.values()].map((v) => v.length))
    const cols = Math.min(16, Math.max(3, max))
    const rows = Math.max(1, Math.ceil(max / cols))
    const w = Math.max(3.2, cols * PITCH + 0.6)
    const d = Math.max(2.2, rows * PITCH + 0.8)
    const top = Math.max(...perFloor.keys())
    const own: number[] = []
    const stocked: Floor[] = []
    for (const [f, list] of [...perFloor].sort((x, y) => x[0] - y[0])) {
      stocked.push({ category: floors[f], floor: f, count: list.length, hue: list[0].hue })
      list.sort((x, y) => x.title.localeCompare(y.title)).forEach((item, k) => {
        const c = k % cols, r = Math.floor(k / cols)
        const pos = new Vector3(cx - (cols * PITCH) / 2 + (c + 0.5) * PITCH, f * FH + SLAB + BIN.h / 2, cz + d / 2 - 0.12 - (r + 0.5) * PITCH)
        own.push(bins.length)
        bins.push({ index: bins.length, item, building: index, floor: f, pos })
      })
    }
    return {
      index, source, name: items[0].sourceName ?? source, count: items.length, cx, cz, cols, rows, w, d,
      floors: top + 1, stocked, bins: own,
      door: new Vector3(cx, 0, cz + d / 2 + 0.4),
      road: new Vector3(cx, 0, cz + P / 2),
      roof: new Vector3(cx, (top + 1) * FH, cz),
    }
  })
  const used = new Set(['0,0', '0,-1', ...buildings.map((b) => `${b.cx / P},${b.cz / P}`)])
  const communities: Community[] = []
  const vacant: Town['vacant'] = []
  const front = [[0, 1], [-1, 1], [1, 1], [-2, 1], [2, 1]].filter(([a, b]) => !used.has(`${a},${b}`)).slice(0, 3).map(([a, b]) => `${a},${b}`)
  for (const a of LOTS_X)
    for (const b of LOTS_Z) {
      if (used.has(`${a},${b}`)) continue
      if (!front.includes(`${a},${b}`)) {
        vacant.push({ cx: a * P, cz: b * P })
        continue
      }
      const cx = a * P, cz = b * P
      const seed = (a * 7 + b * 13 + 40) % 5
      const houses = Array.from({ length: 3 + (seed % 2) }, (_, k) => ({
        x: cx - 4 + k * 2.9 - (seed % 3) * 0.3,
        z: cz + (k % 2 ? -2.2 : 1.2),
        w: 1.6 + ((seed + k) % 3) * 0.3,
        d: 1.4,
        h: 0.9 + ((seed + k * 2) % 3) * 0.35,
      }))
      communities.push({ cx, cz, door: new Vector3(cx, 0, cz + 3.6), road: new Vector3(cx, 0, cz + P / 2), houses })
    }
  const slabs: Town['slabs'] = []
  buildings.forEach((b) => {
    for (let f = 0; f <= b.floors; f++) slabs.push({ building: b.index, floor: f })
  })
  return { floors, buildings, bins, byRef: new Map(bins.map((bin) => [bin.item.ref, bin])), communities, vacant, slabs }
}

const bracket = (x: number) => [
  Math.max(...ROADS_X.filter((r) => r <= x + 1e-3), ROADS_X[0]),
  Math.min(...ROADS_X.filter((r) => r >= x - 1e-3), ROADS_X[ROADS_X.length - 1]),
]

const length = (pts: Vector3[]) => pts.slice(1).reduce((sum, p, i) => sum + p.distanceTo(pts[i]), 0)

/** Door to door along the street grid: out to the lot's south road, along one avenue, then in. */
export function route(from: Vector3, fromRoad: Vector3, to: Vector3, toRoad: Vector3): Vector3[] {
  const clean = (pts: Vector3[]) => pts.filter((p, i) => i === 0 || p.distanceTo(pts[i - 1]) > 1e-3)
  if (Math.abs(fromRoad.z - toRoad.z) < 1e-3) return clean([from, fromRoad, toRoad, to])
  let best: Vector3[] = []
  let bestLen = Infinity
  for (const x of new Set([...bracket(fromRoad.x), ...bracket(toRoad.x)])) {
    const pts = clean([from, fromRoad, new Vector3(x, 0, fromRoad.z), new Vector3(x, 0, toRoad.z), toRoad, to])
    const len = length(pts)
    if (len < bestLen) {
      bestLen = len
      best = pts
    }
  }
  return best
}

/** Cargo drones fly straight over the roofs on a high arc. */
export function flight(from: Vector3, to: Vector3): Vector3[] {
  const peak = 8 + from.distanceTo(to) * 0.12
  return Array.from({ length: 25 }, (_, i) => {
    const t = i / 24
    const p = from.clone().lerp(to, t)
    p.y = from.y * (1 - t) + to.y * t + peak * Math.sin(Math.PI * Math.min(1, t * 1.15))
    return p
  })
}

export type Track = { pts: Vector3[]; cum: number[]; total: number }
export function track(pts: Vector3[]): Track {
  const cum = [0]
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]))
  return { pts, cum, total: cum[cum.length - 1] }
}

/** Position at arc length `s`, plus the unit direction of travel. */
export function sample(t: Track, s: number, pos: Vector3, dir: Vector3) {
  const clamped = Math.max(0, Math.min(t.total, s))
  let i = 1
  while (i < t.pts.length - 1 && t.cum[i] < clamped) i++
  const a = t.pts[i - 1], b = t.pts[i]
  const seg = t.cum[i] - t.cum[i - 1] || 1
  pos.lerpVectors(a, b, (clamped - t.cum[i - 1]) / seg)
  dir.subVectors(b, a).normalize()
}

/** The part of a track already driven, reversed: a U-turn home. */
export function reverseFrom(t: Track, s: number): Track {
  const pos = new Vector3(), dir = new Vector3()
  sample(t, s, pos, dir)
  const back = [pos]
  for (let i = t.pts.length - 1; i >= 0; i--) if (t.cum[i] < s - 1e-3) back.push(t.pts[i].clone())
  if (back.length < 2) back.push(pos.clone())
  return track(back)
}
