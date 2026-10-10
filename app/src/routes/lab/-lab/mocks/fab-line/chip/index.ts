import type { ChipVariant } from '../core/contract'
import { chipMarking } from './art'
import { ChipBody } from './package'
import { PartView } from './part'

/** How a part looks on the line and up close. The first entry is the default. */
export const CHIPS: readonly ChipVariant[] = [
  {
    id: 'package',
    label: 'Package',
    Part: PartView,
    Package: ChipBody,
    marking: (item, code, spec, colors) => chipMarking(item, code, spec, colors.body, colors.ink),
  },
]
