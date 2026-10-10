/**
 * How deep the close-up has peeled a seated chip. Depth runs continuously
 * from 0 (the package) to the last stage (the circuit); scroll and pinch
 * nudge the target, it settles on the nearest whole stage once input stops,
 * and Escape climbs one stage at a time. `top` stages want the camera
 * looking straight down at the die.
 */
export const STAGES = [
  { id: 'package', label: 'Package', cue: 'Scroll or pinch in to lift the lid', top: false },
  { id: 'lid', label: 'Lid off', cue: 'Bond wires run from the die to the lead frame', top: false },
  { id: 'section', label: 'Section', cue: 'Leads, mold, paddle and die, cut in half', top: false },
  { id: 'die', label: 'Die', cue: 'The block itself, printed as silicon', top: true },
  { id: 'circuit', label: 'Circuit', cue: 'Its files, fields and the path a request takes', top: true },
] as const
export type Stage = (typeof STAGES)[number]
export const DEEPEST = STAGES.length - 1

export type Depth = { target: number; value: number; idle: number }
export const createDepth = (): Depth => ({ target: 0, value: 0, idle: 99 })

/** Depth per wheel pixel, and per unit of log pinch scale. */
export const WHEEL = 1 / 240
export const PINCH = 1.3
/** Seconds without input before the target snaps to a whole stage. */
export const SNAP_AFTER = 0.32

const clamp = (v: number) => Math.min(DEEPEST, Math.max(0, v))

export function nudge(d: Depth, delta: number) {
  d.target = clamp(d.target + delta)
  d.idle = 0
}
export function goStage(d: Depth, stage: number) {
  d.target = clamp(Math.round(stage))
  d.idle = SNAP_AFTER
}
/** Escape: one stage up. False when already on the package, so the caller can let the close-up go. */
export function climb(d: Depth) {
  const at = Math.ceil(d.target - 0.001)
  if (at <= 0) return false
  goStage(d, at - 1)
  return true
}
/** Advances one frame: snaps an idle target, then eases the value toward it. */
export function settle(d: Depth, dt: number, instant = false) {
  d.idle += dt
  if (d.idle >= SNAP_AFTER) d.target = Math.round(d.target)
  d.value = instant ? d.target : d.value + (d.target - d.value) * (1 - Math.exp(-dt * 5.5))
  if (Math.abs(d.target - d.value) < 1e-3) d.value = d.target
}
export const stageAt = (depth: number) => STAGES[Math.round(clamp(depth))]
/** The stage the depth is heading for. */
export const heading = (d: Depth) => Math.round(d.target)

const smooth = (t: number) => t * t * (3 - 2 * t)
/** How far stage `i` has come in at depth `d`: 0 before stage i - 1, 1 at stage i. */
export const reveal = (d: number, i: number) => smooth(Math.min(1, Math.max(0, d - (i - 1))))
