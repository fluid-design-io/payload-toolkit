import type { TransportVariant } from '../../core/contract'
import { agv } from './agv'
import { belt } from './belt'
import { maglev } from './maglev'
import { monorail } from './monorail'
import { tube } from './tube'

/** The arm picks queued parts straight from their pocket or drawer. */
const none: TransportVariant = { id: 'none', kind: 'none', label: 'None', footprint: { x0: 0, x1: 0, z0: 0, z1: 0, h: 0 }, frame: [] }

/** How parts get from the table to the arm. The first entry is the default. */
export const TRANSPORTS: readonly TransportVariant[] = [belt, tube, monorail, agv, maglev, none]
