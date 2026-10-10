import type { IntegratorVariant } from '../../core/contract'
import { machines } from './machines'
import { probe } from './probe'

/** Who finishes seated chips for the chosen agent. The first entry is the default: the drone for Claude, the hexapod for Codex. */
export const INTEGRATORS: readonly IntegratorVariant[] = [machines, probe]
