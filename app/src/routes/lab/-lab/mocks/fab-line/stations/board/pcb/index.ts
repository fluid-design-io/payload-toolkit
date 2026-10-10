import type { BoardVariant } from '../../../core/contract'
import { Pcb } from './board'
import { BOARD, BY, HEADER, plan, routeAll } from './plan'

const O = { x: 8.9, z: 0.3, s: 0.84 }
const X0 = O.x + BOARD.x0 * O.s, X1 = O.x + BOARD.x1 * O.s
const Z0 = O.z + BOARD.z0 * O.s, Z1 = O.z + BOARD.z1 * O.s

/** The v4 app board: a four-layer PCB with page bands, a CPU socket per framework and an autorouted bus. */
export const pcb: BoardVariant = {
  id: 'pcb',
  label: 'PCB',
  origin: O,
  footprint: { x0: X0, x1: X1, z0: Z0, z1: Z1, h: BY * O.s },
  frame: [[X0 - 0.3, 0, Z1 + 1.9], [X1 + 1.2, 0, Z1 + 1.9], [X1 + 1.2, 0, Z0], [X0 - 0.3, 0, Z0]],
  plan,
  route: routeAll,
  dock: [HEADER.x, HEADER.y, HEADER.z],
  Component: Pcb,
}
