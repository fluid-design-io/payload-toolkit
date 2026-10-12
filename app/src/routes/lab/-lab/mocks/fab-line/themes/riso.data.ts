import type { Mode, ThemeVariant, Tokens } from '../core/contract'
import { lazyComponent } from '../core/lazy'
import { hexOf } from './grade'

export const PRESS = {
  light: { paper: '#F2EDE2', a: '#0078BF', b: '#FF48B0', offset: [1.6, -1.1] },
  dark: { paper: '#191722', a: '#3FB8E8', b: '#FF4FAE', offset: [1.6, -1.1] },
} as const

/** The plate code for `ta` of ink A and `tb` of ink B. */
export const plate = (mode: Mode, ta: number, tb: number) => (mode === 'light' ? hexOf([1 - ta, 1 - tb, 1]) : hexOf([ta, tb, 0]))

function tokens(mode: Mode): Tokens {
  const k = (ta: number, tb: number) => plate(mode, ta, tb)
  const dk = mode === 'dark'
  return {
    bg: PRESS[mode].paper, surface: k(0, 0), fg: k(1, 0), muted: k(0.6, 0), edge: k(1, 0), dim: k(0.3, 0), accent: k(0, 1), floor: k(0, 0), floorEdge: k(0.2, 0),
    flat: true, rough: 1, shadow: 0, s: 80, l: 55,
    board: k(0, dk ? 0.16 : 0.12), boardEdge: k(1, 0), silk: k(0.9, 0), trace: k(0.35, 0), lit: k(0, 1), body: k(0, 0), bodyEdge: k(1, 0), ink: k(1, 0), pin: k(0.55, 0), sub: k(0.12, 0), ghost: k(0, 0.07),
    gold: k(0, 0.65), die: dk ? k(0.12, 0.06) : k(1, 1), led: k(0, 1), ledBusy: k(0.35, 1), ledOff: k(0.2, 0), spark: dk ? k(0.6, 1) : k(0, 1),
    claude: k(0, 0.85), claudeEdge: k(0.6, 1), claudeInk: k(0, 0), claudeCable: k(0.35, 0),
    codex: k(1, 0.15), codexInk: k(0, 0), codexCable: k(0.5, 0),
  }
}

export const riso: ThemeVariant = {
  id: 'riso',
  label: 'Riso print',
  scene: 'INT. PRINT SHOP',
  lens: { fov: 11, el: 38, frame: 1.0 },
  tokens: { light: tokens('light'), dark: tokens('dark') },
  Stage: lazyComponent(() => import('./riso').then((m) => m.Stage)),
}
