import type { BoardVariant } from '../../../core/contract'
import { Wafer } from './board'
import { DECK, HEADER, WY, plan, route } from './plan'

const O = { x: 11.0, z: 0.3, s: 0.84 }
const X0 = O.x + DECK.x0 * O.s, X1 = O.x + DECK.x1 * O.s
const Z0 = O.z + DECK.z0 * O.s, Z1 = O.z + DECK.z1 * O.s

/** A wafer on a prober stage: the framework is the core die and the page reads clockwise, one sector per band. */
export const wafer: BoardVariant = {
  id: 'wafer',
  label: 'Wafer',
  origin: O,
  footprint: { x0: X0, x1: X1, z0: Z0, z1: Z1, h: WY * O.s },
  frame: [[X0 - 0.3, 0, Z1 + 1.9], [X1 + 1.2, 0, Z1 + 1.9], [X1 + 1.2, 0, Z0], [X0 - 0.3, 0, Z0]],
  plan,
  route,
  dock: [HEADER.x, HEADER.y, HEADER.z],
  Component: Wafer,
}
