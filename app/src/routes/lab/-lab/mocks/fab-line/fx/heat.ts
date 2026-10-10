import { Color } from 'three'

import type { Tokens } from '../core/contract'

/**
 * A three-stop heat ramp from token colors: `hot` at 1, `warm` at 0.5,
 * `cold` at 0. Solder beads, etched strokes, sparks and heat tints all read
 * one ramp so they cool through the same colors.
 */
export type Ramp = { hot: Color; warm: Color; cold: Color }

export const ramp = (hot: string, warm: string, cold: string): Ramp => ({ hot: new Color(hot), warm: new Color(warm), cold: new Color(cold) })

export function heatColor(k: number, r: Ramp, out: Color) {
  if (k <= 0) return out.copy(r.cold)
  if (k >= 1) return out.copy(r.hot)
  return k < 0.5 ? out.copy(r.cold).lerp(r.warm, k * 2) : out.copy(r.warm).lerp(r.hot, k * 2 - 1)
}

/** Heat left `age` seconds after a weld, cooling with time constant `tau`; 0 before it happened. */
export const cooled = (age: number, tau: number) => (age < 0 ? 0 : Math.exp(-age / tau))

const L = new Color()
const luminance = (hex: string) => {
  L.set(hex)
  return 0.2126 * L.r + 0.7152 * L.g + 0.0722 * L.b
}
/** The candidate with the most luminance contrast against `ground`, so a mark stays legible in every theme. */
export function contrastOn(ground: string, ...candidates: string[]) {
  const g = luminance(ground)
  let best = candidates[0]
  let d = -1
  for (const c of candidates) {
    const v = Math.abs(luminance(c) - g)
    if (v > d) { d = v; best = c }
  }
  return best
}

/** Whether a theme's ground is dark, which decides additive versus normal glow blending. */
export const isDark = (c: Tokens) => luminance(c.floor) < 0.25
