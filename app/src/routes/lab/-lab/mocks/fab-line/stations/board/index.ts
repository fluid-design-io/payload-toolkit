import type { Vector3 } from 'three'

import type { BoardVariant } from '../../core/contract'
import { lazyComponent } from '../../core/lazy'
import { plan as breadboardPlan, route as breadboardRoute } from './breadboard/plan'
import { BOARD, HEADER, plan as pcbPlan, routeAll } from './pcb/plan'
import { BY } from './shared/dims'
import type { Frame } from './shared/paint'
import { EXPLODE, layerTop, plan as stackPlan, route as stackRoute } from './stack/plan'
import { DECK, HEADER as WAFER_HEADER, WY, plan as waferPlan, route as waferRoute } from './wafer/plan'

/**
 * A board whose local frame sits at (`x`, 0.3) scaled 0.84 in its station frame: the footprint covers `slab` up to
 * height `h` (board-local), and the stop frames the slab with room in front. A `tall` board lifts the stop's far corner
 * to `h`. Its label leads up from its far back corner, and a drawing measures its length and depth.
 */
function boardVariant({ x = 8.9, slab, h, tall = false, el, dock, ...rest }: Pick<BoardVariant, 'id' | 'label' | 'plan' | 'route' | 'Component'> & {
  x?: number; slab: Frame; h: number; tall?: boolean; el?: number; dock: Vector3
}): BoardVariant {
  const O = { x, z: 0.3, s: 0.84 }
  const X0 = O.x + slab.x0 * O.s, X1 = O.x + slab.x1 * O.s
  const Z0 = O.z + slab.z0 * O.s, Z1 = O.z + slab.z1 * O.s
  const H = h * O.s
  return {
    ...rest,
    origin: O,
    footprint: { x0: X0, x1: X1, z0: Z0, z1: Z1, h: H },
    frame: {
      pts: [[X0 - 0.3, 0, Z1 + 1.9], [X1 + 1.2, 0, Z1 + 1.9], [X1 + 1.2, tall ? H : 0, Z0], [X0 - 0.3, 0, Z0]],
      el,
      callout: { at: [X1 - 0.6, 0.5, Z0 + 0.5], tag: [X1 - 0.2, 3.8, Z0 - 0.6] },
      print: [X0, Z1 + 0.9],
      dims: [{ from: [X0, 0, Z1], to: [X1, 0, Z1], off: [0, 0, 1.3] }, { from: [X1, 0, Z0], to: [X1, 0, Z1], off: [1.5, 0, 0] }],
    },
    dock: [dock.x, dock.y, dock.z],
  }
}

/** The app board: form, finish, page bands and routing. The first entry is the default. */
export const BOARDS: readonly BoardVariant[] = [
  /** The v4 app board: a four-layer PCB with page bands, a CPU socket per framework and an autorouted bus. */
  boardVariant({ id: 'pcb', label: 'PCB', slab: BOARD, h: BY, dock: HEADER, plan: pcbPlan, route: routeAll, Component: lazyComponent(() => import('./pcb/board').then((m) => m.Pcb)) }),
  /** A wafer on a prober stage: the framework is the core die and the page reads clockwise, one sector per band. */
  boardVariant({ id: 'wafer', label: 'Wafer', x: 11.0, slab: DECK, h: WY, dock: WAFER_HEADER, plan: waferPlan, route: waferRoute, Component: lazyComponent(() => import('./wafer/board').then((m) => m.Wafer)) }),
  /** The page as a terraced stack of daughter boards over the PCB's core; hover spreads the layers. */
  boardVariant({ id: 'stack', label: 'Stack', slab: BOARD, h: BY + (layerTop(0) - BY) * EXPLODE, tall: true, el: 27, dock: HEADER, plan: stackPlan, route: stackRoute, Component: lazyComponent(() => import('./stack/board').then((m) => m.Stack)) }),
  /** A dev board and a solderless breadboard, one terminal strip per page band, wired with jumpers in each item's hue. */
  boardVariant({ id: 'breadboard', label: 'Breadboard', slab: BOARD, h: 1.8, dock: HEADER, plan: breadboardPlan, route: breadboardRoute, Component: lazyComponent(() => import('./breadboard/board').then((m) => m.Breadboard)) }),
]
