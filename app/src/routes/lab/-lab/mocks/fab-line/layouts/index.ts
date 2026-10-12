import type { LayoutVariant } from '../core/contract'
import { line } from '../core/line'

/** How the stations are arranged. The first entry is the default; mods add more. */
export const LAYOUTS: readonly LayoutVariant[] = [line]
