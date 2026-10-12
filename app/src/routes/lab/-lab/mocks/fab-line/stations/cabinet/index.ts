import type { CabinetVariant } from '../../core/contract'
import { drawers } from './drawers.data'
import { paternoster } from './paternoster.data'
import { pegboard } from './pegboard.data'
import { vending } from './vending.data'

/** Inventory: where parts live before the table. The first entry is the default. */
export const CABINETS: readonly CabinetVariant[] = [drawers, paternoster, pegboard, vending]
