import { Vector3 } from 'three'

import type { CatalogItem, CategoryId } from '../../../../workspace/-workspace/workspace.types'

/**
 * The cell in world units, composed for a 1000x780 panel: cabinet and pick
 * tray back-left, a short belt, the arm between belt and board, the board
 * front-right. Depth is kept at about half the width so the iso projection
 * fills a 1.5 aspect frame with a 120px band spared at the bottom.
 */
export const CAB = { cols: 3, w: 2.6, h: 0.56, d: 1.8, gapX: 2.75, gapY: 0.64, x0: -10.4, base: 0.5, front: -2.2 }
export const TABLE = { x0: -9.6, x1: -4.0, z0: -1.6, z1: 2.4, y: 0.9 }
export const PAD = { cols: 5, rows: 4, x0: -9.0, z0: -1.1, dx: 1.1, dz: 0.95, w: 1.04, d: 0.8 }
export const PAGE = PAD.cols * PAD.rows
export const BELT = { start: -3.5, end: 0.8, z: 0.4, y: 0.9, speed: 3.2, gap: 1.15 }
export const ARM = { x: 3.4, z: 0.2, h0: 1.5, l1: 4.6, l2: 4.6 }
export const BOARD = { x0: 4.6, x1: 11.6, z0: -3.2, z1: 2.8, y: 0.45 }
export const SOCKET = {
  cpu: { x: 5.8, z: -2.1, w: 1.3, d: 1.3, h: 0.22 },
  mem: { x: 5.8, z: -0.95, w: 1.6, d: 0.44, h: 0.16 },
  pwr: { x: 5.3, z: 2.25, w: 0.8, d: 0.4, h: 0.28 },
  j1: { x: 6.4, z: 2.25, w: 0.6, d: 0.3, h: 0.12 },
}
export const POD = { x: 6.4, y: 0.35, z: 3.5, w: 1.1, h: 0.3, d: 0.6 }
export const FEATURE_BAY = { x: 5.8, z0: -0.25, dz: 0.42, rows: 3 }
export const COMPONENT_BAY = { x0: 5.05, x1: 6.55, z0: 1.2, z1: 1.85 }
export const PAGE_AREA = { x0: 7.0, x1: 11.3, z0: -2.9, z1: 2.5 }
export const SPINE_X = 6.86
export const TOSS = new Vector3(2.2, 3.8, 1.0)
export const REST = new Vector3(2.4, 3.2, 0.9)

export const BANDS: { label: string; groups: readonly string[] }[] = [
  { label: 'HERO', groups: ['hero'] },
  { label: 'LOGOS', groups: ['logo'] },
  { label: 'FEATURES', groups: ['feature', 'integration'] },
  { label: 'CONTENT', groups: ['content', 'stats', 'comparator'] },
  { label: 'SOCIAL', groups: ['testimonials', 'team'] },
  { label: 'PRICING', groups: ['pricing', 'faq'] },
  { label: 'CONVERT', groups: ['call', 'contact'] },
  { label: 'FOOTER', groups: ['footer', 'other'] },
]
export const BAND_D = (PAGE_AREA.z1 - PAGE_AREA.z0) / BANDS.length
export const bandZ = (b: number) => PAGE_AREA.z0 + b * BAND_D

export function bandOf(category: CategoryId) {
  const g = category.startsWith('block:') ? category.slice(6) : category
  const at = BANDS.findIndex((band) => band.groups.includes(g))
  return at === -1 ? BANDS.length - 1 : at
}

export type Size = [number, number, number]
export const sizeOf = (item: CatalogItem): Size =>
  item.kind === 'block' ? [0.96, 0.1, 0.72] : item.kind === 'feature' ? [1.2, 0.3, 0.6] : [0.5, 0.22, 0.36]

export function padPos(index: number, out = new Vector3()) {
  return out.set(PAD.x0 + (index % PAD.cols) * PAD.dx, TABLE.y, PAD.z0 + Math.floor(index / PAD.cols) * PAD.dz)
}
export function drawerPos(aisle: number, out = new Vector3()) {
  const col = aisle % CAB.cols, row = Math.floor(aisle / CAB.cols)
  return out.set(CAB.x0 + col * CAB.gapX, CAB.base + row * CAB.gapY + CAB.h / 2, CAB.front)
}
export const cabinetRows = (aisles: number) => Math.ceil(aisles / CAB.cols)

/** A board placement at scale `s`; `band` is the page region for blocks. */
export type Slot = { x: number; z: number; s: number; band: number }

type Entry = { ref: string; size: Size; band: number }

function packBand(entries: Entry[], b: number, out: Map<string, Slot>) {
  if (!entries.length) return
  const W = PAGE_AREA.x1 - PAGE_AREA.x0 - 0.95
  const x0 = PAGE_AREA.x0 + 0.85
  const D = BAND_D - 0.1
  let s = 0.8
  for (let tries = 0; tries < 40; tries++) {
    const gap = 0.14 * s
    const rows: Entry[][] = [[]]
    let x = 0
    for (const e of entries) {
      const w = e.size[0] * s
      if (x > 0 && x + w > W) {
        rows.push([])
        x = 0
      }
      rows[rows.length - 1].push(e)
      x += w + gap
    }
    const rowD = Math.max(...entries.map((e) => e.size[2])) * s
    const total = rows.length * rowD + (rows.length - 1) * 0.06 * s
    if (total <= D || s < 0.12) {
      const top = bandZ(b) + 0.05 + (D - total) / 2
      rows.forEach((row, r) => {
        let cx = x0
        const cz = top + r * (rowD + 0.06 * s) + rowD / 2
        for (const e of row) {
          const w = e.size[0] * s
          out.set(e.ref, { x: cx + w / 2, z: cz, s, band: b })
          cx += w + gap
        }
      })
      return
    }
    s *= 0.9
  }
}

function packGrid(entries: Entry[], area: { x0: number; x1: number; z0: number; z1: number }, pitchX: number, pitchZ: number, out: Map<string, Slot>) {
  const W = area.x1 - area.x0, D = area.z1 - area.z0
  let s = 1
  while (s > 0.1) {
    const cols = Math.max(1, Math.floor(W / (pitchX * s)))
    const rows = Math.ceil(entries.length / cols)
    if (rows * pitchZ * s <= D) {
      entries.forEach((e, i) =>
        out.set(e.ref, { x: area.x0 + ((i % cols) + 0.5) * pitchX * s, z: area.z0 + (Math.floor(i / cols) + 0.5) * pitchZ * s, s, band: -1 }),
      )
      return
    }
    s *= 0.88
  }
}

/**
 * Where every selected item sits on the board. Pure in the selected refs in
 * catalog order, so the grid and the scene agree on placements. Blocks pack
 * into their page band, features stack in the mezzanine bay, components tile
 * the passives bay.
 */
export function layoutBoard(items: readonly CatalogItem[]): Map<string, Slot> {
  const out = new Map<string, Slot>()
  const byBand: Entry[][] = BANDS.map(() => [])
  const features: Entry[] = []
  const components: Entry[] = []
  for (const item of items) {
    const e = { ref: item.ref, size: sizeOf(item), band: item.kind === 'block' ? bandOf(item.category) : -1 }
    if (item.kind === 'feature') features.push(e)
    else if (item.kind === 'component') components.push(e)
    else byBand[e.band].push(e)
  }
  byBand.forEach((entries, b) => packBand(entries, b, out))
  packGrid(features, { x0: FEATURE_BAY.x - 0.7, x1: FEATURE_BAY.x + 0.7, z0: FEATURE_BAY.z0, z1: FEATURE_BAY.z0 + FEATURE_BAY.dz * FEATURE_BAY.rows }, 1.4, FEATURE_BAY.dz, out)
  packGrid(components, COMPONENT_BAY, 0.56, 0.42, out)
  return out
}

/**
 * Manhattan route from a seated part to its socket: blocks go west to the bus
 * spine, along it, then into the CPU's east pins on a lane of their own;
 * features and components drop straight north to the memory slab.
 */
export function routeOf(slot: Slot, size: Size, lane: number, lanes: number): Vector3[] {
  const y = BOARD.y + 0.008
  if (slot.band < 0) {
    const top = slot.z - (size[2] * slot.s) / 2
    return [new Vector3(slot.x, y, top), new Vector3(slot.x, y, SOCKET.mem.z + SOCKET.mem.d / 2)]
  }
  const west = slot.x - (size[0] * slot.s) / 2
  const spine = SPINE_X - (lane / Math.max(1, lanes - 1)) * 0.16
  const pinZ = SOCKET.cpu.z - SOCKET.cpu.d / 2 + 0.14 + (lane / Math.max(1, lanes - 1)) * (SOCKET.cpu.d - 0.28)
  return [new Vector3(west, y, slot.z), new Vector3(spine, y, slot.z), new Vector3(spine, y, pinZ), new Vector3(SOCKET.cpu.x + SOCKET.cpu.w / 2, y, pinZ)]
}

/** The agent's probe route from J1 to a freshly seated part, drawn as the flash. */
export function probeRoute(slot: Slot, size: Size): Vector3[] {
  const y = BOARD.y + 0.012
  const x = SOCKET.j1.x
  if (slot.band < 0) return [new Vector3(x, y, SOCKET.j1.z - SOCKET.j1.d / 2), new Vector3(x, y, slot.z + (size[2] * slot.s) / 2 + 0.02)]
  const spine = SPINE_X + 0.06
  return [new Vector3(x, y, SOCKET.j1.z - SOCKET.j1.d / 2), new Vector3(x, y, slot.z), new Vector3(spine, y, slot.z), new Vector3(slot.x - (size[0] * slot.s) / 2, y, slot.z)]
}

export const routeLength = (pts: readonly Vector3[]) => pts.slice(1).reduce((sum, p, i) => sum + p.distanceTo(pts[i]), 0)

export function sampleRoute(pts: readonly Vector3[], t: number, out: Vector3) {
  let left = Math.min(1, Math.max(0, t)) * routeLength(pts)
  for (let k = 1; k < pts.length; k++) {
    const seg = pts[k].distanceTo(pts[k - 1])
    if (left <= seg || k === pts.length - 1) return out.lerpVectors(pts[k - 1], pts[k], seg ? Math.min(1, left / seg) : 1)
    left -= seg
  }
  return out.copy(pts[pts.length - 1])
}

export const matchItem = (item: CatalogItem, query: string) => {
  const q = query.trim().toLowerCase()
  return !q || item.title.toLowerCase().includes(q) || item.label.toLowerCase().includes(q) || item.ref.toLowerCase().includes(q)
}
