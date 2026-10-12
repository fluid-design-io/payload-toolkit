import type { Footprint, Framing, V3 } from '../../core/contract'

/** The pick frame's centreline, which every cabinet centres on, and a flat table's back edge, just clear of the cabinet fronts. */
export const PICK = { cx: -11.4, back: -1.75 }

/**
 * A pick table's footprint and framing: its stop is a tight close-up of `pts` (its pocket rows), so single chips are
 * easy to hover; the overview already shows its neighbours. Its label leads out past its front left corner.
 */
export function tableFrame(footprint: Footprint, pts: readonly V3[], el: number): { footprint: Footprint; frame: Framing } {
  const { x0, z1, h } = footprint
  return {
    footprint,
    frame: { pts, el, min: 0, margin: 1, callout: { at: [x0 + 0.9, h, z1 - 0.5], tag: [x0 - 2.6, h + 1, z1 + 0.4] }, print: [x0, z1 + 0.9], dims: [] },
  }
}
