import { keepAnimating } from '../../../kit/busy'
import { reducedMotion } from './three'

/**
 * Scene-wide jolts. Anything on the line can `kick` the scene (a maglev launch,
 * a capsule slamming home); the camera director steps the decay once per frame
 * and shakes the picture by `joltOffset`, in CSS pixels, through its view offset.
 * A ringing shake keeps the line animating.
 * One scene is mounted at a time, so the state is module-level.
 */
const state = { amp: 0, hz: 14, t: 0 }
/** Pixels of shake at amplitude 1. */
const REACH = 14
const DECAY = 5

/** Shakes the scene with strength `amount` (0..1), summed with any shake still ringing. `hz` sets how fast it rattles. */
export function kick(amount: number, hz = 14) {
  if (reducedMotion) return
  state.amp = Math.min(1, state.amp + Math.max(0, amount))
  state.hz = hz
  keepAnimating()
}

export function stepJolt(dt: number) {
  if (!state.amp) return
  keepAnimating()
  state.t += dt
  state.amp *= Math.exp(-dt * DECAY)
  if (state.amp < 0.004) state.amp = 0
}

/** Writes the current shake into `out` as pixel offsets. */
export function joltOffset(out: { x: number; y: number }) {
  const a = state.amp * REACH, w = state.t * state.hz * Math.PI * 2
  out.x = a * Math.sin(w) * 0.7
  out.y = a * Math.sin(w * 1.37 + 1.1)
  return out
}
