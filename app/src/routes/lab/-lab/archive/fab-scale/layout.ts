import { Vector3 } from 'three'

import type { ItemKind } from '../../../../workspace/-workspace/workspace.types'
import { BOARD } from './kit/board'

export { BOARD }

/** The storage wall: one cabinet per category, along x at the back of the floor. */
export const WALL = { z0: -12.8, z1: -7.6, pitch: 2.2, width: 2.0, cx: -1.5 }
/** Drawer fronts, in cabinet-local units. `travel` is how far an open drawer slides out (+z). */
export const DRAWER = { h: 0.56, gap: 0.05, base: 0.34, header: 0.54, inset: 0.1, travel: 3.1 }
export const CABINET_DEPTH = WALL.z1 - WALL.z0

/** Cards stand in a drawer leaning back by `lean` radians; rows run along z, columns along x. */
export const CARD = { lean: 0.62, row: 0.22 }
export const COLS: Record<ItemKind, number> = { block: 3, component: 4, feature: 2 }
export const colPitch = (kind: ItemKind) => (WALL.width - 2 * DRAWER.inset - 0.2) / COLS[kind]
export const ROWS = Math.floor((CABINET_DEPTH - 0.6) / CARD.row)
export const drawerCapacity = (kind: ItemKind) => COLS[kind] * ROWS

/** The bridge crane's runways (y) and the hook's safe travel height. */
export const RUNWAY = { y: 8.9, zBack: WALL.z0 - 0.6, zFront: -1.8 }
/** The runways span the whole wall plus a bay at each end. */
export const runwayX = (cabinets: number) => ({ x0: cabinetX(0, cabinets) - WALL.pitch, x1: cabinetX(cabinets - 1, cabinets) + WALL.pitch })
export const SAFE_Y = 6.9
/** Where the crane lowers a tote: the feeder's start. The return tray sits beside it. */
export const DROP = new Vector3(-3.7, 0.9, -3.2)
export const RETURN = new Vector3(-5.6, 0.9, -3.2)

/** The belt is an L: a feeder along z from the drop, a corner, then the main run along x to the arm. */
export const BELT = { y: 0.9, speed: 4.4, gap: 1.0, width: 1.2 }
export const BELT_PATH = [new Vector3(DROP.x, BELT.y, DROP.z), new Vector3(DROP.x, BELT.y, 1.6), new Vector3(1.7, BELT.y, 1.6)]
export const BELT_LENGTH = BELT_PATH[0].distanceTo(BELT_PATH[1]) + BELT_PATH[1].distanceTo(BELT_PATH[2])

export function beltAt(s: number, out = new Vector3()) {
  const a = BELT_PATH[0].distanceTo(BELT_PATH[1])
  if (s <= a) return out.lerpVectors(BELT_PATH[0], BELT_PATH[1], Math.max(0, s) / a)
  return out.lerpVectors(BELT_PATH[1], BELT_PATH[2], Math.min(1, (s - a) / (BELT_LENGTH - a)))
}

export const ARM = { base: new Vector3(4.2, 0, -1.4), h0: 1.9, l1: 5.6, l2: 5.4, rest: new Vector3(2.6, 3.6, 0.6), toss: new Vector3(0.2, 4.6, 1.0) }

export const cabinetX = (index: number, count: number) => WALL.cx + (index - (count - 1) / 2) * WALL.pitch
export const cabinetHeight = (slots: number) => DRAWER.base + slots * (DRAWER.h + DRAWER.gap) + DRAWER.header
export const drawerY = (slot: number, slots: number) => DRAWER.base + (slots - 1 - slot) * (DRAWER.h + DRAWER.gap) + DRAWER.h / 2

