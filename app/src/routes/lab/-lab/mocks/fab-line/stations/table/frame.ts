import type { Footprint, Framing, V3 } from '../../core/contract'

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
