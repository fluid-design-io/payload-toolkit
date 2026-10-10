import type { Guts, Pad, Unit } from './guts'
import { padRing } from './guts'

/**
 * The die's layout in die-local units (0..1, y down like the canvas it is
 * painted on): units packed by weight into a slicing floorplan, the pad ring
 * on the die edge, and wires (unit to unit, pad to unit) as Manhattan
 * polylines with cumulative lengths so pulses can ride them.
 */
export type Rect = { x: number; y: number; w: number; h: number }
export type Placed = Unit & Rect
export type Wire = { pts: [number, number][]; cum: number[]; len: number; from: string; to: string }
export type PadAt = Pad & { x: number; y: number; side: 0 | 1 | 2 | 3; at: number }
export type Floorplan = { core: Rect; units: Placed[]; pads: PadAt[]; wires: Wire[] }

/** Pads sit this far in from the die edge; the core starts past them. */
export const PAD_IN = 0.045
const CORE = 0.13
const GAP = 0.022

function slice(list: Unit[], r: Rect, out: Placed[]) {
  if (list.length === 1) {
    out.push({ ...list[0], x: r.x + GAP / 2, y: r.y + GAP / 2, w: r.w - GAP, h: r.h - GAP })
    return
  }
  const total = list.reduce((s, u) => s + u.weight, 0)
  let k = 1, acc = list[0].weight
  while (k < list.length - 1 && Math.abs(acc + list[k].weight - total / 2) < Math.abs(acc - total / 2)) acc += list[k++].weight
  const t = acc / total
  if (r.w >= r.h) {
    slice(list.slice(0, k), { ...r, w: r.w * t }, out)
    slice(list.slice(k), { ...r, x: r.x + r.w * t, w: r.w * (1 - t) }, out)
  } else {
    slice(list.slice(0, k), { ...r, h: r.h * t }, out)
    slice(list.slice(k), { ...r, y: r.y + r.h * t, h: r.h * (1 - t) }, out)
  }
}

function wire(pts: [number, number][], from: string, to: string): Wire {
  const cum = [0]
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.abs(pts[i][0] - pts[i - 1][0]) + Math.abs(pts[i][1] - pts[i - 1][1]))
  return { pts, cum, len: cum[cum.length - 1], from, to }
}
const mid = (u: Rect): [number, number] => [u.x + u.w / 2, u.y + u.h / 2]

/** Lays out a square die for `guts`. */
export function floorplan(guts: Guts): Floorplan {
  const core: Rect = { x: CORE, y: CORE, w: 1 - CORE * 2, h: 1 - CORE * 2 }
  const units: Placed[] = []
  slice(guts.units, core, units)
  const byId = new Map(units.map((u) => [u.id, u]))
  const ring = padRing(guts)
  const per = ring.length / 4
  const pads = ring.map((p, i): PadAt => {
    const side = Math.floor(i / per) as 0 | 1 | 2 | 3
    const at = CORE + ((i % per) + 0.5) * ((1 - CORE * 2) / per)
    const [x, y] = side === 0 ? [at, PAD_IN] : side === 1 ? [1 - PAD_IN, at] : side === 2 ? [1 - at, 1 - PAD_IN] : [PAD_IN, 1 - at]
    return { ...p, x, y, side, at }
  })
  const wires: Wire[] = []
  guts.nets.forEach(([a, b], i) => {
    const A = byId.get(a), B = byId.get(b)
    if (!A || !B) return
    const [ax, ay] = mid(A), [bx, by] = mid(B)
    wires.push(wire(i % 2 ? [[ax, ay], [ax, by], [bx, by]] : [[ax, ay], [bx, ay], [bx, by]], a, b))
  })
  for (const p of pads) {
    const U = p.unit ? byId.get(p.unit) : undefined
    if (!U) continue
    const [ux, uy] = mid(U)
    const pts: [number, number][] = p.side % 2 ? [[p.x, p.y], [ux, p.y], [ux, uy]] : [[p.x, p.y], [p.x, uy], [ux, uy]]
    wires.push(p.dir === 'in' ? wire(pts, `pad:${p.label}`, U.id) : wire(pts.slice().reverse(), U.id, `pad:${p.label}`))
  }
  return { core, units, pads, wires }
}

/** Writes the point `u` (0..1) along `w` into `out`. */
export function along(w: Wire, u: number, out: [number, number]) {
  const s = Math.min(1, Math.max(0, u)) * w.len
  let i = 1
  while (i < w.cum.length - 1 && w.cum[i] < s) i++
  const seg = w.cum[i] - w.cum[i - 1] || 1
  const t = (s - w.cum[i - 1]) / seg
  out[0] = w.pts[i - 1][0] + (w.pts[i][0] - w.pts[i - 1][0]) * t
  out[1] = w.pts[i - 1][1] + (w.pts[i][1] - w.pts[i - 1][1]) * t
  return out
}
