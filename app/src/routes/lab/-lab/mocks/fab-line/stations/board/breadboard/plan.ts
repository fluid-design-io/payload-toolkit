import { CatmullRomCurve3, Vector3 } from 'three'

import type { Setup } from '@/routes/workspace/-workspace/workspace.types'
import type { Ghost, Hatch, Plan, Route, Routed, RouteStyle, Slot } from '../../../core/contract'
import { makeRoute } from '../../../core/route'
import { BY, cpuHalf } from '../shared/dims'
import { bandOf, ghostIndex, packGrid, sortParts } from '../shared/pack'
import type { Entry } from '../shared/pack'
import { CPU, PAGE, bandZ, blockLanes, routeBase } from '../pcb/plan'

/**
 * A solderless breadboard over the page area, beside a dev board that keeps
 * the PCB's core. Each page band is one terminal strip: a power rail, a top
 * half, the centre channel the packages straddle, and a bottom half.
 */
export const BB = { x0: 0.55, x1: 11.85 }
/** The dev board's slab: the PCB's core half. */
export const DEV = { x0: -8.4, x1: 0.42, z0: -6.7, z1: 6.7 }
export const PITCH = 0.254
/** Offsets within a band from its top edge. */
export const STRIP = { rail: [0.04, 0.36], top: [0.4, 0.9], bottom: [1.04, 1.54] } as const
export const channelZ = (b: number) => bandZ(b) + (STRIP.top[1] + STRIP.bottom[0]) / 2
/** Packages start right of the band's printed label. */
const CHIP_X0 = PAGE.chipX0
const snap = (x: number) => BB.x0 + Math.round((x - BB.x0) / PITCH) * PITCH

/**
 * Packages straddle the band's channel in one row. A crowded band splits into
 * rows spread across the strip, whichever count keeps packages largest; each
 * centre snaps to the hole pitch while it still clears its neighbour.
 */
function packStrip(entries: Entry[], b: number) {
  const out = new Map<string, { x: number; z: number; s: number }>()
  if (!entries.length) return out
  const W = PAGE.chipX1 - CHIP_X0
  const reach = STRIP.bottom[1] - STRIP.top[0] - 0.06
  const gap = 0.3
  const fd = Math.max(...entries.map((e) => e.spec.fd))
  let best = { k: 1, s: 0 }
  for (let k = 1; k <= 6; k++) {
    const per = Math.ceil(entries.length / k)
    const widest = Math.max(...Array.from({ length: k }, (_, r) => entries.slice(r * per, (r + 1) * per).reduce((a, e) => a + e.spec.fw + gap, -gap)))
    const s = Math.min(1, reach / (k * fd + (k - 1) * 0.08), W / Math.max(widest, 0.01))
    if (s > best.s + 1e-6) best = { k, s }
  }
  const { k, s } = best
  const per = Math.ceil(entries.length / k)
  const rowD = fd * s + 0.08 * s
  for (let r = 0; r < k; r++) {
    const z = channelZ(b) + (r - (k - 1) / 2) * rowD
    let edge = CHIP_X0 - gap * s
    for (const e of entries.slice(r * per, (r + 1) * per)) {
      const w = e.spec.fw * s
      const want = edge + gap * s + w / 2
      const snapped = snap(want)
      const x = snapped - w / 2 >= edge + gap * s * 0.5 ? snapped : want
      out.set(e.key, { x, z, s })
      edge = x + w / 2
    }
  }
  return out
}

export function plan(parts: readonly Routed[], target: Setup['target']): Plan {
  const slots = new Map<string, Slot>()
  const ghosts: Ghost[] = []
  const hatches: Hatch[] = []
  const sorted = sortParts(parts, target)
  sorted.bands.forEach((entries, b) => {
    let hx1 = -Infinity
    for (const [key, at] of packStrip(entries, b)) {
      const slot = { x: at.x, y: BY, z: at.z, s: at.s }
      const i = ghostIndex(key)
      if (i >= 0) {
        const spec = entries.find((e) => e.key === key)!.spec
        ghosts.push({ spec, band: b, slot, title: sorted.ghosts[i].title })
        hx1 = Math.max(hx1, slot.x + (spec.fw * slot.s) / 2)
      } else slots.set(key, slot)
    }
    if (hx1 > -Infinity) hatches.push({ x0: CHIP_X0 - 0.2, x1: hx1 + 0.18, z0: bandZ(b) + STRIP.top[0], z1: bandZ(b) + STRIP.bottom[1] })
  })
  for (const [k, v] of packGrid(sorted.comps, { x0: -3.75, x1: -1.35, z0: 1.45, z1: 4.95 }, 0.82, 0.58)) slots.set(k, { x: v.x, y: BY, z: v.z, s: v.s })
  sorted.feats.forEach((e, i) => slots.set(e.key, { x: -6.05, y: BY + Math.floor(i / 3) * 0.72, z: 2.0 + (i % 3) * 1.55, s: 1 }))
  return { slots, ghosts, hatches }
}

/** A polyline as a route, with its cumulative lengths. */
function asRoute(pts: Vector3[], vias: Vector3[]): Route {
  const cum = [0]
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]))
  return { pts, vias, len: cum[cum.length - 1], cum }
}

/** A loose jumper that arcs from hole to hole, higher the further it reaches. */
export function arc(a: Vector3, b: Vector3, rise = 1) {
  const up = (p: Vector3, h: number) => p.clone().setY(p.y + h)
  const d = a.distanceTo(b)
  const mid = a.clone().lerp(b, 0.5).setY(Math.max(a.y, b.y) + (0.55 + d * 0.07) * rise)
  const curve = new CatmullRomCurve3([a, up(a, 0.22), mid, up(b, 0.22), b], false, 'centripetal', 0.5)
  return asRoute(curve.getSpacedPoints(Math.max(16, Math.ceil(curve.getLength() / 0.06))), [a, b])
}

/**
 * Wires from the hole above each package's first pin to a CPU pin. Manhattan
 * and 45° lay pre-cut jumpers flat along the PCB's bus lanes; organic plugs in
 * loose jumpers that arc over the board.
 */
export function route(parts: readonly Routed[], style: RouteStyle, framework: Setup['framework']) {
  const east = CPU.x + cpuHalf(framework).w
  const flat = BY + 0.04
  for (const [p, { c, x, pz }] of blockLanes(parts, framework)) {
    const s = p.slot!
    const hx = snap(s.x - (p.spec.fw * s.s) / 2 + 0.1)
    const hz = Math.max(bandZ(bandOf(p.item.category)) + STRIP.top[0] + 0.06, s.z - (p.spec.fd * s.s) / 2 - 0.1)
    const hole = new Vector3(hx, BY, hz)
    const pin = new Vector3(east, BY, pz)
    if (style === 'organic') {
      p.route = arc(pin, hole)
      continue
    }
    const corners = [pin, pin.clone().setY(flat), new Vector3(x, flat, pz), new Vector3(x, flat, c), new Vector3(hole.x, flat, c), hole.clone().setY(flat), hole]
    p.route = makeRoute(corners, style, [pin, hole])
  }
  routeBase(parts, style, framework)
}
