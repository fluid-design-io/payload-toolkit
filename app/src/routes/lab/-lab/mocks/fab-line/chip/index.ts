import type { ChipVariant } from '../core/contract'
import { chipMarking } from './art'
import { CloseUp } from './closeup'
import { lidOf, packageBoxes } from './package'

/** How a part looks on the line and up close. The first entry is the default. */
export const CHIPS: readonly ChipVariant[] = [
  {
    id: 'package',
    label: 'Package',
    boxes: packageBoxes,
    lid: lidOf,
    marking: chipMarking,
    CloseUp,
  },
]
