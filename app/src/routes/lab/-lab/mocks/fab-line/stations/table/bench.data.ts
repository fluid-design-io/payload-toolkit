import type { Vector3 } from 'three'

import { levelsPerBay, slotsPerLevel, binsPerBay } from '@/routes/lab/-lab/warehouse'
import type { TableVariant } from '../../core/contract'
import { lazyComponent } from '../../core/lazy'
import { tableFrame } from './frame'

/**
 * A pick bench that lays out warehouse bays as they are shelved: each bay is
 * four slots across and five levels deep, read like a page (level 1 at the
 * back, slot A on the left) so a pick code such as `B07-03-2C` reads off the
 * table as bay tag, row digit and column, and the keyboard grid's down
 * arrow moves toward the viewer. Each row is a step `rise` above the one in
 * front, so back rows never hide behind front ones in the iso view.
 */
export type Bench = {
  id: string
  label: string
  bays: number
  pitch: { x: number; z: number }
  gap: number
  rise: number
  el: number
  fit: { max: number; size: number }
}

export const Y = 0.9
export const X0 = -13.7
export const Z0 = -1.75
export const M = { left: 0.62, right: 0.3, back: 0.18, apron: 1.02 }

export function geometry(b: Bench) {
  const bayW = slotsPerLevel * b.pitch.x
  const x1 = X0 + M.left + b.bays * bayW + (b.bays - 1) * b.gap + M.right
  const z1 = Z0 + M.back + levelsPerBay * b.pitch.z + M.apron
  const front = z1 - M.apron
  const bayX = (bay: number) => X0 + M.left + bay * (bayW + b.gap)
  const rowZ = (level: number) => Z0 + M.back + (level + 0.5) * b.pitch.z
  const topY = (level: number) => Y + (levelsPerBay - 1 - level) * b.rise
  return { bayW, x1, z1, front, bayX, rowZ, topY }
}

export function pocketOf(b: Bench, g = geometry(b)) {
  return (index: number, out: Vector3) => {
    const bay = Math.floor(index / binsPerBay), within = index % binsPerBay
    const level = Math.floor(within / slotsPerLevel), slot = within % slotsPerLevel
    return out.set(g.bayX(bay) + (slot + 0.5) * b.pitch.x, g.topY(level), g.rowZ(level))
  }
}

export function make(b: Bench): TableVariant {
  const g = geometry(b)
  return {
    id: b.id,
    label: b.label,
    // The pocket rows, not the apron or the floor: the stop is for reading and hovering chips.
    ...tableFrame({ x0: X0, x1: g.x1, z0: Z0, z1: g.z1, h: g.topY(0) }, [[X0, Y, g.front], [g.x1, Y, g.front], [g.x1, g.topY(0), Z0], [X0, g.topY(0), Z0]], b.el),
    bays: b.bays,
    cols: slotsPerLevel,
    pocket: pocketOf(b, g),
    fit: b.fit,
    Component: lazyComponent(() => import('./bench').then((m) => m.benchOf(b))),
  }
}

export const riser = make({ id: 'riser', label: 'Riser 40', bays: 2, pitch: { x: 0.98, z: 0.92 }, gap: 0.42, rise: 0.2, el: 50, fit: { max: 0.7, size: 0.8 } })
export const riser3 = make({ id: 'riser3', label: 'Riser 60', bays: 3, pitch: { x: 0.88, z: 0.84 }, gap: 0.36, rise: 0.18, el: 50, fit: { max: 0.64, size: 0.72 } })
