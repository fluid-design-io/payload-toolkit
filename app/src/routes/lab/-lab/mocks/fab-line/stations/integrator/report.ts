import type { Vector3 } from 'three'

/**
 * What the running machine is doing, written each frame and published on the
 * canvas as `data-integrator` for harnesses. `moving` is false once the
 * machine is home and still, with no particles left in the air.
 */
export type Report = { phase: string; moving: boolean; at: Vector3; beads: number; strokes: number; next: number; w: Vector3 }
