import type { Vector3 } from 'three'

import type { TableVariant } from '../../core/contract'
import { lazyComponent } from '../../core/lazy'
import { PICK, tableFrame } from './frame'

/** One bay of 20 pockets, five across and four deep, on a four-legged table. */
const W = 6.55, D = 4.9
export const TABLE = { x0: PICK.cx - W / 2, x1: PICK.cx + W / 2, z0: PICK.back, z1: PICK.back + D, y: 0.9 }
export const PAD = { cols: 5, rows: 4, x0: TABLE.x0 + 0.6, z0: TABLE.z0 + 0.75, pitchX: 1.3, pitchZ: 1.12 }
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
