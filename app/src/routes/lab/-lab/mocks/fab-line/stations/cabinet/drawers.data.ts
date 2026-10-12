import type { Vector3 } from 'three'

import type { CabinetVariant } from '../../core/contract'
import { lazyComponent } from '../../core/lazy'
import { cabinetFrame } from './frame'

/** Three columns of drawers behind the pick table, one per aisle. */
export const CABINET = { x0: -13.5, cols: 3, rows: 6, w: 2.0, h: 0.5, d: 2.0, gapX: 2.1, gapY: 0.6, base: 0.75, front: -2.5 }

function drawer(cat: number, out: Vector3) {
  const col = cat % CABINET.cols, row = Math.floor(cat / CABINET.cols)
  return out.set(CABINET.x0 + col * CABINET.gapX, CABINET.base + (CABINET.rows - 1 - row) * CABINET.gapY + CABINET.h / 2, CABINET.front + 0.1)
}

export const drawers: CabinetVariant = {
  id: 'drawers',
  label: 'Drawers',
  ...cabinetFrame({ x0: -14.6, x1: -8.2, z0: -4.65, z1: -2.45, h: 4.57 }, [[-14.9, 0, -4.7], [-14.9, 4.6, -2.4], [-7.9, 4.6, -2.4], [-7.9, 0, -1.6]], 22),
  drawer,
  Component: lazyComponent(() => import('./drawers').then((m) => m.Drawers)),
}
