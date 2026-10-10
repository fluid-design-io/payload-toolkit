import type { BoardVariant } from '../../../core/contract'
import { BOARD, HEADER } from '../pcb/plan'
import { Breadboard } from './board'
import { plan, route } from './plan'

const O = { x: 8.9, z: 0.3, s: 0.84 }
const X0 = O.x + BOARD.x0 * O.s, X1 = O.x + BOARD.x1 * O.s
const Z0 = O.z + BOARD.z0 * O.s, Z1 = O.z + BOARD.z1 * O.s

/** A dev board and a solderless breadboard, one terminal strip per page band, wired with jumpers in each item's hue. */
export const breadboard: BoardVariant = {
  id: 'breadboard',
  label: 'Breadboard',
  origin: O,
  footprint: { x0: X0, x1: X1, z0: Z0, z1: Z1, h: 1.8 * O.s },
  frame: [[X0 - 0.3, 0, Z1 + 1.9], [X1 + 1.2, 0, Z1 + 1.9], [X1 + 1.2, 0, Z0], [X0 - 0.3, 0, Z0]],
  plan,
  route,
  dock: [HEADER.x, HEADER.y, HEADER.z],
  Component: Breadboard,
}
