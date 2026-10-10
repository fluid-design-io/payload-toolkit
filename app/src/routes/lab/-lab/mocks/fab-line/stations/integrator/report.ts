import type { Vector3 } from 'three'

/** What the running machine is doing, written each frame and published on the canvas as `data-integrator` for harnesses. */
export type Report = { phase: string; at: Vector3; beads: number; strokes: number; next: number; w: Vector3 }
