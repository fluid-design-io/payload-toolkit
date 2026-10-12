import type { Vector3 } from 'three'

import type { TableVariant } from '../../core/contract'
import { lazyComponent } from '../../core/lazy'
import { tableFrame } from './frame'

/** One bay of 20 pockets, five across and four deep, on a four-legged table. */
export const TABLE = { x0: -13.7, x1: -7.15, z0: -1.75, z1: 3.15, y: 0.9 }
export const PAD = { cols: 5, rows: 4, x0: -13.1, z0: -1.0, pitchX: 1.3, pitchZ: 1.12 }
export const POCKETS = PAD.cols * PAD.rows

export function pocket(index: number, out: Vector3) {
  return out.set(PAD.x0 + (index % PAD.cols) * PAD.pitchX, TABLE.y, PAD.z0 + Math.floor(index / PAD.cols) * PAD.pitchZ)
}

export const tray: TableVariant = {
  id: 'tray',
  label: 'Tray 20',
  ...tableFrame({ x0: TABLE.x0, x1: TABLE.x1, z0: TABLE.z0, z1: TABLE.z1, h: TABLE.y }, [[TABLE.x0 - 0.4, 0, TABLE.z1 + 0.6], [TABLE.x1 + 0.6, 0, TABLE.z1 + 0.6], [TABLE.x1 + 0.6, 0, TABLE.z0 - 0.4], [TABLE.x0 - 0.4, 0, TABLE.z0 - 0.4], [TABLE.x0, 1.4, TABLE.z0]], 52),
  bays: 1,
  cols: PAD.cols,
  pocket,
  fit: { max: 0.8, size: 1.02 },
  Component: lazyComponent(() => import('./tray').then((m) => m.Tray)),
}
