import type { BoardVariant } from '../../../core/contract'
import { BOARD, HEADER } from '../pcb/plan'
import { Stack } from './board'
import { EXPLODE, layerTop, plan, route } from './plan'
import { BY } from '../shared/dims'

const O = { x: 8.9, z: 0.3, s: 0.84 }
const X0 = O.x + BOARD.x0 * O.s, X1 = O.x + BOARD.x1 * O.s
const Z0 = O.z + BOARD.z0 * O.s, Z1 = O.z + BOARD.z1 * O.s
const TOP = (BY + (layerTop(0) - BY) * EXPLODE) * O.s

/** The page as a terraced stack of daughter boards over the PCB's core; hover spreads the layers. */
export const stack: BoardVariant = {
  id: 'stack',
  label: 'Stack',
  origin: O,
  footprint: { x0: X0, x1: X1, z0: Z0, z1: Z1, h: TOP },
  frame: [[X0 - 0.3, 0, Z1 + 1.9], [X1 + 1.2, 0, Z1 + 1.9], [X1 + 1.2, TOP, Z0], [X0 - 0.3, 0, Z0]],
  el: 27,
  plan,
  route,
  dock: [HEADER.x, HEADER.y, HEADER.z],
  Component: Stack,
}
