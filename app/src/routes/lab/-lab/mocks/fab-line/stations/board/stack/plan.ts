import { Vector3 } from 'three'

import type { Setup } from '@/routes/workspace/-workspace/workspace.types'
import type { Ghost, Hatch, Plan, Routed, RouteStyle, Slot } from '../../../core/contract'
import { makeRoute } from '../../../core/route'
import { BY, cpuHalf } from '../shared/dims'
import { BANDS, bandOf, ghostIndex, packGrid, packRows, sortParts } from '../shared/pack'
import { CPU, PAGE, bandZ, blockLanes, routeBase } from '../pcb/plan'

/**
 * The page as a terraced stack of daughter boards over the PCB's core: four
 * layers of two bands each, the top of the page highest and furthest back,
 * so the arm reaches every layer from above.
 */
export const LAYERS = 4
export const RISE = 0.7
export const LIFT = 0.42
export const SLAB = 0.16
const LAYER_D = (PAGE.z1 - PAGE.z0) / LAYERS
export const layerOf = (band: number) => Math.floor(band / (BANDS.length / LAYERS))
export const layerZ = (k: number) => PAGE.z0 + k * LAYER_D
/** Surface height of layer `k` while the stack is closed. */
export const layerTop = (k: number) => BY + LIFT + (LAYERS - 1 - k) * RISE
/** Where the layer's traces fall down its flex to the core. */
export const DROP_X = 0.5
/** How far the stack spreads while hovered. */
export const EXPLODE = 1.45

/** Closed-stack height of every slot that sits on a layer, so the board can spread the stack by moving `slot.y`. */
export const closed = new WeakMap<Slot, number>()

export function plan(parts: readonly Routed[], target: Setup['target']): Plan {
  const slots = new Map<string, Slot>()
  const ghosts: Ghost[] = []
  const hatches: Hatch[] = []
  const sorted = sortParts(parts, target)
  sorted.bands.forEach((entries, b) => {
    const y = layerTop(layerOf(b))
    const top = bandZ(b) + 0.36
    let hx1 = -Infinity
    for (const [key, at] of packRows(entries, { x0: PAGE.chipX0, x1: PAGE.chipX1, z0: top, z1: top + (PAGE.z1 - PAGE.z0) / BANDS.length - 0.42 })) {
      const slot = { x: at.x, y, z: at.z, s: at.s }
      closed.set(slot, y)
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

/** The PCB's bus, with a fall down the layer's flex between the band channel and the spine. Heights are closed-stack. */
export function route(parts: readonly Routed[], style: RouteStyle, framework: Setup['framework']) {
  const y = BY + 0.006
  const east = CPU.x + cpuHalf(framework).w
  for (const [p, { c, x, pz }] of blockLanes(parts, framework)) {
    const s = p.slot!
    const yt = layerTop(layerOf(bandOf(p.item.category))) + 0.006
    const top = s.z - (p.spec.fd * s.s) / 2
    const corners = [
      new Vector3(s.x, yt, top), new Vector3(s.x, yt, c), new Vector3(DROP_X + 0.3, yt, c), new Vector3(DROP_X, yt - SLAB, c),
      new Vector3(DROP_X, y, c), new Vector3(x, y, c), new Vector3(x, y, pz), new Vector3(east, y, pz),
    ]
    p.route = makeRoute(corners.reverse(), style, [new Vector3(x, y, c), new Vector3(x, y, pz)])
  }
  routeBase(parts, style, framework)
}
