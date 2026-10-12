import type { Object3D } from 'three'

import type { SocketKind, SwapAct, SwapBox, SwapClock } from '../../../../core/contract'

/** The same act on every socket. */
export const every = (act: SwapAct): Record<SocketKind, SwapAct> => ({ cpu: act, memory: act, power: act })

/** True on the one frame the clock passes `beat`. */
export const crossed = (clock: SwapClock, beat: number) => clock.prev < beat && clock.u >= beat

/** 0..1 progress of `u` through the window [a, b]. */
export const span = (u: number, a: number, b: number) => (u <= a ? 0 : u >= b ? 1 : (u - a) / (b - a))

export const easeIn = (k: number) => k * k * k
export const easeOut = (k: number) => 1 - (1 - k) ** 3
export const easeInOut = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2)
/** Overshoots and settles, for a landing. */
export const easeBack = (k: number, s = 1.7) => 1 + (s + 1) * (k - 1) ** 3 + s * (k - 1) ** 2
/** A damped bounce from 1 to 0 over k 0..1, `n` lobes. */
export const wobble = (k: number, n = 3) => (k >= 1 ? 0 : Math.sin(k * Math.PI * n) * (1 - k) ** 2)

/** Puts a part at rest on its box. */
export function rest(g: Object3D | null, b: SwapBox | null) {
  if (!g || !b) return
  g.position.set(b.x, b.y, b.z)
  g.rotation.set(0, 0, 0)
  g.scale.set(1, 1, 1)
}
