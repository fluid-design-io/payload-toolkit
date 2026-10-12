import type { Vector3 } from 'three'

import type { CabinetVariant } from '../../core/contract'
import { lazyComponent } from '../../core/lazy'
import { cabinetFrame } from './frame'

/**
 * A parts vending machine: one spiral coil per aisle behind the glass, six
 * across and three high, each holding up to six packages tinted by aisle.
 * Opening an aisle vends from its coil: the spiral turns once, the row
 * advances a pitch and the front package drops to the flap, which is also
 * where parts off the table rest. The panel shows the selection as a code
 * you would key in.
 */
export const M = { x0: -14.5, x1: -8.2, z0: -3.95, z1: -2.45, h: 4.9 }
export const GLASS = { x0: -14.3, x1: -9.95, y0: 1.95, y1: 4.4 }
export const FLAP = { x: (GLASS.x0 + GLASS.x1) / 2, y: 1.42, w: 3.0, h: 0.42 }

function drawer(aisle: number, out: Vector3) {
  return out.set(FLAP.x + ((aisle % 6) - 2.5) * 0.42, FLAP.y - 0.12, M.z1 - 0.2)
}

export const vending: CabinetVariant = {
  id: 'vending',
  label: 'Vending',
  ...cabinetFrame({ x0: M.x0, x1: M.x1, z0: M.z0, z1: M.z1 + 0.1, h: M.h }, [[M.x0 - 0.2, 1.4, M.z1 + 0.3], [M.x0 - 0.2, M.h + 0.1, M.z0], [M.x1 + 0.2, M.h + 0.1, M.z1 + 0.3], [M.x1 + 0.2, 1.4, M.z1 + 0.8]], 16),
  drawer,
  Component: lazyComponent(() => import('./vending').then((m) => m.Vending)),
}
