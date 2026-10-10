/**
 * The first-run power-up and world-change dimmer, as a cue sheet. Each cue
 * raises one Energy channel over its window; the driver writes every channel
 * from elapsed time, so skipping is just jumping `t` to the end. Every dip is
 * one slow beat, never more than about 2 Hz, so nothing flashes.
 */
import { LAMP_ROWS, REDUCED_MOTION, clamp, damp } from './contract'
import type { Energy } from './contract'

type Cue = { channel: 'row' | 'belt' | 'machines' | 'board'; index?: number; at: number; dur: number; label: string }

export const CUES: readonly Cue[] = [
  ...Array.from({ length: LAMP_ROWS }, (_, i): Cue => ({ channel: 'row', index: i, at: 0.5 + i * 0.62, dur: 0.55, label: `MAINS · LAMP ROW ${i + 1} OF ${LAMP_ROWS}` })),
  { channel: 'belt', at: 3.9, dur: 0.8, label: 'CONVEYOR · DRIVE ENGAGED' },
  { channel: 'machines', at: 4.3, dur: 0.6, label: 'ARM · HOMING' },
  { channel: 'board', at: 4.9, dur: 2.4, label: 'APP BOARD · RAILS ENERGIZING' },
]
export const POWER_TOTAL = 7.9

/** `speed` plays the cue sheet faster: phones get a short version. */
export type PowerUp = { t: number; active: boolean; speed: number }

/** Sodium strike: a glow, one dark beat, then the lamp climbs and holds. */
const strike = (k: number) => (k < 0.3 ? (k / 0.3) * 0.45 : k < 0.5 ? 0.18 : 0.18 + ((k - 0.5) / 0.5) * 0.82)

/** Returns true on the frame the first lamp row strikes (or a skip lights it), once per power-up. */
export function drivePowerUp(power: PowerUp, energy: Energy, dt: number) {
  if (!power.active) return false
  const dark = energy.rows[0] === 0
  power.t += REDUCED_MOTION ? POWER_TOTAL : dt * power.speed
  const done = power.t >= POWER_TOTAL
  for (const cue of CUES) {
    const k = clamp((power.t - cue.at) / cue.dur, 0, 1)
    const v = done ? 1 : cue.channel === 'row' ? strike(k) : k * k * (3 - 2 * k)
    if (cue.channel === 'row') energy.rows[cue.index!] = Math.max(energy.rows[cue.index!], v)
    else energy[cue.channel] = Math.max(energy[cue.channel], v)
  }
  if (done) power.active = false
  return dark && energy.rows[0] > 0
}

export function powerLabel(power: PowerUp) {
  let label = 'MAINS · STANDBY'
  for (const cue of CUES) if (power.t >= cue.at) label = cue.label
  return label
}

/** World change: lights drop, the world swaps at the bottom, then everything banks back on with one dip. */
export type Dimmer = { t: number; active: boolean; swapped: boolean }

export function driveDimmer(dim: Dimmer, energy: Energy, dt: number, onSwap: () => void, onEnd: () => void) {
  if (!dim.active) {
    energy.all += (1 - energy.all) * damp(dt, 8)
    if (energy.all > 0.999) energy.all = 1
    return
  }
  dim.t += Math.min(dt, 0.1) / (REDUCED_MOTION ? 0.6 : 1.9)
  const t = dim.t
  if (t < 0.25) energy.all = 1 - t / 0.25
  else if (t < 0.55) energy.all = 0
  else {
    const up = Math.min(1, (t - 0.55) / 0.35)
    const dip = REDUCED_MOTION ? 0 : Math.max(0, 1 - Math.abs(t - 0.74) / 0.06) * 0.5
    energy.all = up * (1 - dip)
  }
  if (!dim.swapped && t >= 0.45) {
    dim.swapped = true
    onSwap()
  }
  if (t >= 1) {
    dim.active = false
    energy.all = 1
    onEnd()
  }
}
