import type { SocketKind, SwapAct, SwapVariant } from '../../../../core/contract'
import { reducedMotion } from '../../../../core/three'
import { arcade } from './arcade'
import { bench } from './bench'
import { calm } from './calm'
import { drop } from './drop'
import { slapstick } from './slapstick'

/** The bench tech's lever and vacuum pen for the CPU, slapstick gags for the memory and the power stage. */
export const mix: SwapVariant = {
  id: 'mix',
  label: 'Mix',
  acts: { cpu: bench.acts.cpu, memory: slapstick.acts.memory, power: slapstick.acts.power },
}

/** The swap slot's built-ins. The first is the default. */
export const SWAPS: readonly SwapVariant[] = [mix, slapstick, bench, arcade, drop]

/** The act a socket plays: the style's own, or the calm glide under reduced motion whatever the style. */
export const actFor = (swap: SwapVariant, kind: SocketKind, reduced = reducedMotion): SwapAct => (reduced ? calm : swap.acts[kind])
