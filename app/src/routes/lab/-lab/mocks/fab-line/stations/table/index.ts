import type { TableVariant } from '../../core/contract'
import { riser, riser3 } from './bench'
import { tray } from './tray'

/** The pick table: how many warehouse bays a page shows and how its pockets sit. The first entry is the default. */
export const TABLES: readonly TableVariant[] = [riser, riser3, tray]
