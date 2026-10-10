import type { FxVariant } from '../core/contract'
import { Bloom } from './bloom'

/**
 * Scene-wide effects mounted last inside the Canvas. Shared primitives live
 * beside this file for any station to import: `particles` (sparks, ablation
 * dust), `glow` (instanced soft glows and heat tints), `smoke` (wisps) and
 * `heat` (token heat ramps). The first entry is the default.
 */
export const FX: readonly FxVariant[] = [
  { id: 'none', label: 'None', Component: null },
  { id: 'bloom', label: 'Bloom', Component: Bloom },
]
