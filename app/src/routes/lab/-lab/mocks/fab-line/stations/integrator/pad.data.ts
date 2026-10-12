import type { BoardVariant, Footprint } from '../../core/contract'
import { surfaceOf } from './script'
import type { Surface } from './script'

export type PadSpot = { x: number; y: number; z: number }
export const TOP = 0.05
/** Half the parked machine's reach, board-local: the drone's rotor guards end 1.25 out. */
const CLEAR = 1.3

/** Where a machine parks: on the floor past the board's far end, at its front corner, where the line's camera sees it. */
export const padAt = (surface: Surface): PadSpot => ({ x: surface.x1 + 1.45, y: TOP, z: surface.z1 - 1.3 })

/** The parked machine's floor box in the board's station frame, so transports route around it. */
export function padFootprint(board: BoardVariant): Footprint {
  const o = board.origin, pad = padAt(surfaceOf(board))
  const x = o.x + pad.x * o.s, z = o.z + pad.z * o.s, r = CLEAR * o.s
  return { x0: x - r, x1: x + r, z0: z - r, z1: z + r, h: 0.8 * o.s }
}
