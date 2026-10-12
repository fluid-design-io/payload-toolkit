import type { Vector3 } from 'three'

import type { CabinetVariant } from '../../core/contract'
import { lazyComponent } from '../../core/lazy'
import { cabinetFrame } from './frame'

/**
 * A shadow board: hopper bins hang on a pegboard, one per aisle, in a
 * grid that reads like the rail (features, components, then blocks). A
 * bin's width grows with its aisle's part count on a log scale and the heap
 * inside shows how full it is, so the busiest aisles stand out at viral
 * scale. Opening an aisle lifts its bin off the hooks and tips it toward
 * the table; the outline painted behind it lights up where it hung.
 */
export const B = { x0: -14.5, x1: -7.3, y0: 1.0, y1: 4.84, z: -2.775, rows: [3.78, 2.98, 2.18], pad: 0.12 }
export const BIN = { h: 0.58, lip: 0.3, d: 0.46, t: 0.025 }
export const OPEN = { lift: 0.3, out: 0.5, tilt: 0.24 }

const COLS = 6
export const CELL = (B.x1 - B.x0 - B.pad * 2) / COLS
/** Aisle i hangs in a fixed cell, so its place never depends on counts (the sim asks for it before the wall mounts). */
export const cell = (i: number) => ({ x: B.x0 + B.pad + ((i % COLS) + 0.5) * CELL, y: B.rows[Math.floor(i / COLS) % B.rows.length] })

function drawer(aisle: number, out: Vector3) {
  const s = cell(aisle)
  return out.set(s.x, s.y + OPEN.lift + 0.06, B.z + BIN.d / 2 + OPEN.out)
}

export const pegboard: CabinetVariant = {
  id: 'pegboard',
  label: 'Pegboard',
  ...cabinetFrame({ x0: B.x0 - 0.25, x1: B.x1 + 0.25, z0: B.z - 0.5, z1: B.z + BIN.d + OPEN.out, h: B.y1 + 0.2 }, [[B.x0 - 0.2, 1.4, B.z + 0.5], [B.x0 - 0.2, B.y1 + 0.3, B.z - 0.2], [B.x1 + 0.2, B.y1 + 0.3, B.z + 0.5], [B.x1 + 0.2, 1.4, B.z + 0.9]], 16),
  drawer,
  Component: lazyComponent(() => import('./pegboard').then((m) => m.Pegboard)),
}
