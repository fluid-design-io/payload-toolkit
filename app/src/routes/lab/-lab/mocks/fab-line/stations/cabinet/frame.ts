import type { Footprint, Framing, V3 } from '../../core/contract'

/**
 * A cabinet's footprint and framing: its stop is its own close-up, its label rises over its back, its floor print sits
 * right of it, clear of the table in front, and a drawing measures its height.
 */
export function cabinetFrame(footprint: Footprint, pts: readonly V3[], el: number): { footprint: Footprint; frame: Framing } {
  const { x0, x1, z0, z1, h } = footprint
  return {
    footprint,
    frame: {
      pts,
      el,
      min: 0,
      callout: { at: [(x0 + x1) / 2, h, (z0 + z1) / 2], tag: [x0 + (x1 - x0) * 0.3, h + 1.2, z0 - 0.5] },
      print: [x1 + 0.3, z0 - 0.4],
      dims: [{ from: [x0, 0, z0 + 1], to: [x0, h, z0 + 1], off: [-1.1, 0, 0] }],
    },
  }
}
