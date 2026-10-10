import { Vector3 } from 'three'

import type { Setup } from '@/routes/workspace/-workspace/workspace.types'
import type { Ghost, Hatch, Plan, Route, Routed, RouteStyle, Slot } from '../../../core/contract'
import { makeRoute } from '../../../core/route'
import { BY, cpuHalf } from '../shared/dims'
import { BANDS, bandOf, ghostIndex, packGrid, packRows, sortParts } from '../shared/pack'

export { BANDS, BY, bandOf, cpuHalf }

/** The PCB's local frame: slab bounds, the page area, the CPU socket and the J1 debug header. */
export const BOARD = { x0: -8.4, x1: 12.0, z0: -6.7, z1: 6.7 }
export const PAGE = { x0: 0.6, x1: 11.7, z0: -6.3, z1: 6.3, chipX0: 2.05, chipX1: 11.45 }
export const CPU = new Vector3(-4.6, BY, -1.4)
export const HEADER = new Vector3(-1.9, BY, 5.95)

const BAND_D = (PAGE.z1 - PAGE.z0) / BANDS.length
export const bandZ = (b: number) => PAGE.z0 + b * BAND_D
export const BAND_DEPTH = BAND_D

/** Blocks pack into their page band by package width; components into the passives grid; features stack in the mezzanine bay. */
export function plan(parts: readonly Routed[], target: Setup['target']): Plan {
  const slots = new Map<string, Slot>()
  const ghosts: Ghost[] = []
  const hatches: Hatch[] = []
  const sorted = sortParts(parts, target)
  sorted.bands.forEach((entries, b) => {
    const top = bandZ(b) + 0.36
    const packed = packRows(entries, { x0: PAGE.chipX0, x1: PAGE.chipX1, z0: top, z1: top + BAND_D - 0.42 })
    let hx1 = -Infinity
    for (const [key, at] of packed) {
      const slot = { x: at.x, y: BY, z: at.z, s: at.s }
      const i = ghostIndex(key)
      if (i >= 0) {
        const spec = entries.find((e) => e.key === key)!.spec
        ghosts.push({ spec, band: b, slot, title: sorted.ghosts[i].title })
        hx1 = Math.max(hx1, slot.x + (spec.fw * slot.s) / 2)
      } else slots.set(key, slot)
    }
    if (hx1 > -Infinity) hatches.push({ x0: PAGE.chipX0 - 0.2, x1: hx1 + 0.18, z0: bandZ(b) + 0.3, z1: bandZ(b + 1) - 0.04 })
  })
  for (const [k, v] of packGrid(sorted.comps, { x0: -3.75, x1: -1.35, z0: 1.45, z1: 4.95 }, 0.82, 0.58)) slots.set(k, { x: v.x, y: BY, z: v.z, s: v.s })
  sorted.feats.forEach((e, i) => slots.set(e.key, { x: -6.05, y: BY + Math.floor(i / 3) * 0.72, z: 2.0 + (i % 3) * 1.55, s: 1 }))
  return { slots, ghosts, hatches }
}

/** A block's bus lane: its channel `c` above the chip, its spine `x` west of the page and its CPU pin `pz`. */
export type Lane = { c: number; x: number; pz: number }

/** Lanes for every placed block. Lane order keeps the bus crossing-free. */
export function blockLanes(parts: readonly Routed[], framework: Setup['framework']) {
  const half = cpuHalf(framework)
  const blocks = parts.filter((p) => p.item.kind === 'block' && p.slot)
  const byBand = new Map<number, Routed[]>()
  for (const p of blocks) {
    const b = bandOf(p.item.category)
    byBand.set(b, [...(byBand.get(b) ?? []), p])
  }
  const zc = new Map<Routed, number>()
  for (const [b, list] of byBand) {
    const sorted = [...list].sort((a, c) => c.slot!.x - a.slot!.x)
    const step = Math.min(0.06, 0.26 / sorted.length)
    sorted.forEach((p, i) => zc.set(p, bandZ(b) + 0.05 + i * step))
  }
  const out = new Map<Routed, Lane>()
  const north = blocks.filter((p) => zc.get(p)! < CPU.z).sort((a, c) => zc.get(a)! - zc.get(c)!)
  const south = blocks.filter((p) => zc.get(p)! >= CPU.z).sort((a, c) => zc.get(c)! - zc.get(a)!)
  const lanes = (group: Routed[], sign: number) => {
    const sx = Math.min(0.075, 1.25 / Math.max(1, group.length))
    const sz = Math.min(0.11, (half.d - 0.15) / Math.max(1, group.length))
    group.forEach((p, i) => out.set(p, { c: zc.get(p)!, x: -1.05 + i * sx, pz: CPU.z + sign * (half.d - 0.12 - i * sz) }))
  }
  lanes(north, -1)
  lanes(south, 1)
  return out
}

/** Channel above each chip, then the bus spine west of the page, then a CPU pin. */
export function routeAll(parts: readonly Routed[], style: RouteStyle, framework: Setup['framework']) {
  const y = BY + 0.006
  const east = CPU.x + cpuHalf(framework).w
  for (const [p, { c, x, pz }] of blockLanes(parts, framework)) {
    const s = p.slot!
    const top = s.z - (p.spec.fd * s.s) / 2
    const corners = [new Vector3(s.x, y, top), new Vector3(s.x, y, c), new Vector3(x, y, c), new Vector3(x, y, pz), new Vector3(east, y, pz)]
    p.route = makeRoute(corners.reverse(), style, [new Vector3(x, y, c), new Vector3(x, y, pz)])
  }
  routeBase(parts, style, framework)
}

/** Components fan out of the CPU's south edge to the passives grid; features drop straight into the mezzanine bay. */
export function routeBase(parts: readonly Routed[], style: RouteStyle, framework: Setup['framework']) {
  const y = BY + 0.006
  const half = cpuHalf(framework)
  const southEdge = CPU.z + half.d
  parts.filter((p) => p.item.kind === 'component' && p.slot).forEach((p, i) => {
    const s = p.slot!
    const lane = 0.95 - (i % 8) * 0.07
    const x = CPU.x + half.w - 0.25 - (i % 12) * 0.2
    const corners = [new Vector3(x, y, southEdge), new Vector3(x, y, southEdge + lane), new Vector3(s.x, y, southEdge + lane), new Vector3(s.x, y, s.z - 0.14 * s.s)]
    p.route = makeRoute(corners, style, [new Vector3(s.x, y, southEdge + lane)])
  })
  parts.filter((p) => p.item.kind === 'feature' && p.slot).forEach((p, i) => {
    const s = p.slot!
    const x = s.x - 0.9 + (i % 3) * 0.25
    const corners = [new Vector3(x, y, southEdge), new Vector3(x, y, s.z - 0.75)]
    p.route = makeRoute(corners, style, [])
  })
}

export function staticRoutes(style: RouteStyle, framework: Setup['framework']) {
  const y = BY + 0.006
  const half = cpuHalf(framework)
  const power: Route[] = []
  const memory: Route[] = []
  for (let i = 0; i < 5; i++) {
    const x = CPU.x - 1.1 + i * 0.55
    const x2 = -7.0 + i * 1.05
    power.push(makeRoute([new Vector3(x2, y, -4.25), new Vector3(x2, y, -3.7 + i * 0.07), new Vector3(x, y, -3.7 + i * 0.07), new Vector3(x, y, CPU.z - half.d)], style, []))
  }
  for (let i = 0; i < 8; i++) {
    const z = CPU.z - 1.05 + i * 0.3
    memory.push(makeRoute([new Vector3(-6.85, y, z), new Vector3(-6.55, y, z), new Vector3(-6.4, y, CPU.z - 1.0 + i * 0.28), new Vector3(CPU.x - half.w, y, CPU.z - 1.0 + i * 0.28)], style, []))
  }
  return { power, memory }
}
