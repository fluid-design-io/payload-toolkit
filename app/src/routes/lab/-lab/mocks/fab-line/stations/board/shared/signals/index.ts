import type { SignalVariant } from '../../../../core/contract'
import { lazyComponent } from '../../../../core/lazy'

/** How the board's accent dots read signal flow along its traces. The first entry is the default. */
export const SIGNALS: readonly SignalVariant[] = [
  /** One clock for the board: bead trains leave the CPU in step, power flows slower, vias tick as a beat passes. */
  { id: 'heartbeat', label: 'Heartbeat', Component: lazyComponent(() => import('./heartbeat').then((m) => m.Heartbeat)) },
  /** The quiet original: sparse square dots, a hot head while a trace draws, plain via discs. */
  { id: 'classic', label: 'Classic', Component: lazyComponent(() => import('./classic').then((m) => m.Classic)) },
]
