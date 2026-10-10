import type { BoardVariant } from '../../core/contract'
import { breadboard } from './breadboard'
import { pcb } from './pcb'
import { stack } from './stack'
import { wafer } from './wafer'

/** The app board: form, finish, page bands and routing. The first entry is the default. */
export const BOARDS: readonly BoardVariant[] = [pcb, wafer, stack, breadboard]
