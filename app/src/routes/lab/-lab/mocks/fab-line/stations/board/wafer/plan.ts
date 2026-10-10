import { Vector3 } from 'three'

import type { Setup } from '@/routes/workspace/-workspace/workspace.types'
import type { Ghost, Hatch, Plan, Route, Routed, RouteStyle, Slot } from '../../../core/contract'
import { makeRoute } from '../../../core/route'
import { BY, cpuHalf } from '../shared/dims'
import { BANDS, bandOf, ghostIndex, packGrid, sortParts } from '../shared/pack'
import type { Entry } from '../shared/pack'

/**
 * A wafer on a prober stage. The framework CPU is the core die at the
 * centre; the page reads clockwise from twelve o'clock, one sector per band,
 * and packages land on the die grid in their sector, nearest the core first.
 * The stage's left deck keeps memory, power, the bays and the J1 header.
 */
export const R = 6.55
/** The core's keep-out radius. */
export const R0 = 2.45
export const WY = BY + 0.26
export const DECK = { x0: -12.2, x1: 7.0, z0: -6.9, z1: 6.9 }
export const HEADER = new Vector3(-8.1, BY, 5.95)
export const SECTOR = (Math.PI * 2) / BANDS.length
/** Half-width of each street between sectors; the west street carries the deck's buses. */
export const streetOf = (k: number) => (k === 6 ? 0.42 : 0.16)
/** Clockwise from twelve o'clock (-z) seen from above: x = sin, z = -cos. */
export const polar = (a: number, r: number) => ({ x: Math.sin(a) * r, z: -Math.cos(a) * r })
export const mid = (b: number) => (b + 0.5) * SECTOR
const DIE = 0.5

const inSector = (b: number, x: number, z: number) => {
  const a0 = b * SECTOR, a1 = (b + 1) * SECTOR
  return x * Math.cos(a0) + z * Math.sin(a0) >= streetOf(b) && -(x * Math.cos(a1) + z * Math.sin(a1)) >= streetOf((b + 1) % BANDS.length)
}
/** Whether a rectangle lies in sector `b`, outside the core and inside the edge exclusion. */
function fits(b: number, x0: number, z0: number, x1: number, z1: number) {
  for (const [x, z] of [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]) if (!inSector(b, x, z) || Math.hypot(x, z) > R - 0.42) return false
  const nx = Math.max(x0, Math.min(0, x1)), nz = Math.max(z0, Math.min(0, z1))
  return Math.hypot(nx, nz) >= R0
}

/** Die cells nearest the core first, then clockwise. */
const cells = (n: number, pitch: number) => {
  const out: [number, number][] = []
  for (let i = -n; i < n; i++) for (let j = -n; j < n; j++) out.push([i, j])
  const key = ([i, j]: [number, number]) => Math.hypot((i + 0.5) * pitch, (j + 0.5) * pitch)
  return out.sort((a, b) => key(a) - key(b))
}

/** Places every sector's packages on one shared die grid, shrinking the grid until all sectors fit. */
function packSectors(bands: Entry[][]) {
  const room = ((Math.PI * ((R - 0.42) ** 2 - R0 ** 2)) / BANDS.length) * 0.55
  const need = Math.max(...bands.map((list) => list.reduce((a, e) => a + (e.spec.fw + 0.12) * (e.spec.fd + 0.12), 0)))
  for (let s = Math.min(1, Math.sqrt(room / Math.max(need, 1e-6))); s > 0.12; s *= 0.93) {
    const pitch = DIE * s
    const n = Math.ceil(R / pitch)
    const order = cells(n, pitch)
    const out = new Map<string, { x: number; z: number; s: number; band: number }>()
    const ok = bands.every((entries, b) => {
      const used = new Set<string>()
      const own = order.filter(([i, j]) => inSector(b, (i + 0.5) * pitch, (j + 0.5) * pitch) && Math.hypot((i + 0.5) * pitch, (j + 0.5) * pitch) >= R0)
      let cursor = 0
      return entries.every((e) => {
        const nw = Math.ceil((e.spec.fw * s + 0.12 * s) / pitch), nd = Math.ceil((e.spec.fd * s + 0.12 * s) / pitch)
        while (cursor < own.length && used.has(`${own[cursor][0]},${own[cursor][1]}`)) cursor++
        for (let k = cursor; k < own.length; k++) {
          const [i, j] = own[k]
          const x0 = i * pitch, z0 = j * pitch, x1 = x0 + nw * pitch, z1 = z0 + nd * pitch
          if (!fits(b, x0, z0, x1, z1)) continue
          let free = true
          for (let a = 0; a < nw && free; a++) for (let c = 0; c < nd && free; c++) if (used.has(`${i + a},${j + c}`)) free = false
          if (!free) continue
          for (let a = 0; a < nw; a++) for (let c = 0; c < nd; c++) used.add(`${i + a},${j + c}`)
          out.set(e.key, { x: (x0 + x1) / 2, z: (z0 + z1) / 2, s, band: b })
          return true
        }
        return false
      })
    })
    if (ok) return { spots: out, pitch }
  }
  return { spots: new Map<string, { x: number; z: number; s: number; band: number }>(), pitch: DIE * 0.12 }
}

/** The die pitch of the latest plan, so the wafer's grid art matches where packages landed. */
export const grid = { pitch: DIE }

export function plan(parts: readonly Routed[], target: Setup['target']): Plan {
  const slots = new Map<string, Slot>()
  const ghosts: Ghost[] = []
  const hatches: Hatch[] = []
  const sorted = sortParts(parts, target)
  const { spots, pitch } = packSectors(sorted.bands)
  grid.pitch = pitch
  for (const [key, at] of spots) {
    const slot = { x: at.x, y: WY, z: at.z, s: at.s }
    const i = ghostIndex(key)
    if (i < 0) {
      slots.set(key, slot)
      continue
    }
    const spec = sorted.bands[at.band].find((e) => e.key === key)!.spec
    ghosts.push({ spec, band: at.band, slot, title: sorted.ghosts[i].title })
    const w = (spec.fw * at.s) / 2 + 0.08, d = (spec.fd * at.s) / 2 + 0.08
    hatches.push({ x0: at.x - w, x1: at.x + w, z0: at.z - d, z1: at.z + d })
  }
  for (const [k, v] of packGrid(sorted.comps, { x0: -8.95, x1: -7.3, z0: 1.45, z1: 4.95 }, 0.82, 0.58)) slots.set(k, { x: v.x, y: BY, z: v.z, s: v.s })
  sorted.feats.forEach((e, i) => slots.set(e.key, { x: -10.45, y: BY + Math.floor(i / 3) * 0.72, z: 2.0 + (i % 3) * 1.55, s: 1 }))
  return { slots, ghosts, hatches }
}

/** Where a ray from the core's centre at angle `a` leaves the CPU package, plus a margin. */
function cpuEdge(a: number, framework: Setup['framework'], out: Vector3) {
  const h = cpuHalf(framework)
  const d = polar(a, 1)
  const t = Math.min(h.w / Math.max(Math.abs(d.x), 1e-6), h.d / Math.max(Math.abs(d.z), 1e-6)) + 0.05
  return out.set(d.x * t, WY + 0.006, d.z * t)
}

/**
 * Polar manhattan: each package drops square onto its sector's spoke, then
 * runs the spoke into the core. Lanes fan across the spoke in seat order.
 */
export function route(parts: readonly Routed[], style: RouteStyle, framework: Setup['framework']) {
  const y = WY + 0.006
  const byBand = new Map<number, Routed[]>()
  for (const p of parts) if (p.item.kind === 'block' && p.slot) byBand.set(bandOf(p.item.category), [...(byBand.get(bandOf(p.item.category)) ?? []), p])
  for (const [b, list] of byBand) {
    const a = mid(b)
    const d = polar(a, 1), n = { x: Math.cos(a), z: Math.sin(a) }
    const ordered = [...list].sort((p, q) => Math.hypot(p.slot!.x, p.slot!.z) - Math.hypot(q.slot!.x, q.slot!.z))
    const step = Math.min(0.09, 1.1 / ordered.length)
    ordered.forEach((p, i) => {
      const s = p.slot!
      const off = (i - (ordered.length - 1) / 2) * step
      const along = s.x * d.x + s.z * d.z
      const foot = new Vector3(d.x * along + n.x * off, y, d.z * along + n.z * off)
      const inner = new Vector3(d.x * (R0 - 0.2) + n.x * off, y, d.z * (R0 - 0.2) + n.z * off)
      const core = cpuEdge(a, framework, new Vector3()).addScaledVector(new Vector3(n.x, 0, n.z), off)
      p.route = makeRoute([core, inner, foot, new Vector3(s.x, y, s.z)], style, [inner.clone()])
    })
  }
  const h = cpuHalf(framework)
  const deck = parts.filter((p) => p.item.kind !== 'block' && p.slot)
  deck.forEach((p, i) => {
    const s = p.slot!
    const z = -0.02 + (i % 4) * 0.035
    const xl = -7.15 + (i % 4) * 0.07
    const corners = [new Vector3(-h.w - 0.05, y, z), new Vector3(-R + 0.2, y, z), new Vector3(xl, BY + 0.006, z), new Vector3(xl, BY + 0.006, s.z), new Vector3(s.x, BY + 0.006, s.z)]
    p.route = makeRoute(corners, style, [corners[2].clone()])
  })
}

/** Memory and power buses down the west street from the deck to the core. */
export function staticRoutes(style: RouteStyle, framework: Setup['framework']) {
  const y = WY + 0.006, yd = BY + 0.006
  const h = cpuHalf(framework)
  const memory: Route[] = []
  const power: Route[] = []
  for (let i = 0; i < 6; i++) {
    const z = -0.36 + i * 0.06
    memory.push(makeRoute([new Vector3(-10.75, yd, -1.8 + (i - 2.5) * 0.3), new Vector3(-9.0, yd, -1.8 + (i - 2.5) * 0.3), new Vector3(-8.0, yd, z), new Vector3(-R + 0.2, y, z), new Vector3(-h.w - 0.05, y, z)], style, []))
  }
  for (let i = 0; i < 3; i++) {
    const z = 0.15 + i * 0.09
    power.push(makeRoute([new Vector3(-9.4 + i * 0.4, yd, -4.2), new Vector3(-9.4 + i * 0.4, yd, z), new Vector3(-R + 0.2, y, z), new Vector3(-h.w - 0.05, y, z)], style, []))
  }
  return { memory, power }
}
