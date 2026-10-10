import type { CabinetVariant } from '../../core/contract'
import { drawers } from './drawers'
import { paternoster } from './paternoster'
import { pegboard } from './pegboard'
import { vending } from './vending'

/** Inventory: where parts live before the table. The first entry is the default. */
export const CABINETS: readonly CabinetVariant[] = [drawers, paternoster, pegboard, vending]
