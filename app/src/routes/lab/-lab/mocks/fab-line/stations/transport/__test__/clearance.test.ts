import { describe, expect, test } from 'bun:test'

import { lineOf, line as straight } from '../../../core/line'
import { BOARDS } from '../../board'
import { CABINETS } from '../../cabinet'
import { machines } from '../../integrator/machines.data'
import { TABLES } from '../../table'
import { TRANSPORTS } from '..'

/** Half the width a transport occupies beside its route: the conveyor's frame and legs, the others' cars. */
const HALF: Record<string, number> = { belt: 0.72 }

describe('routes round the parked machine', () => {
  for (const transport of TRANSPORTS) {
    if (transport.kind !== 'path') continue
    for (const board of BOARDS)
      test(`the ${transport.id} route keeps clear of the drone pad on the ${board.id} board`, () => {
        const line = lineOf({ layout: straight, cabinet: CABINETS[0], table: TABLES[0], transport, board, integrator: machines })
        const pad = machines.footprint!(board)
        const dx = line.at.board.x - line.at.transport.x
        let clear = Infinity
        for (const p of line.path!.pts!) {
          const x = p.x - dx
          clear = Math.min(clear, Math.hypot(Math.max(pad.x0 - x, 0, x - pad.x1), Math.max(pad.z0 - p.z, 0, p.z - pad.z1)))
        }
        expect(clear).toBeGreaterThan(HALF[transport.id] ?? 0.6)
      })
  }
})
