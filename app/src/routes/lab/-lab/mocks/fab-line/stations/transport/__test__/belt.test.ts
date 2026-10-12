import { describe, expect, test } from 'bun:test'
import { Vector3 } from 'three'

import { lineOf, line as straight } from '../../../core/line'
import { parseBundle, recipes } from '../../../mods/data'
import sample from '../../../mods/samples/vaporwave.fabmod.json'
import { BOARDS } from '../../board'
import { CABINETS } from '../../cabinet'
import { machines } from '../../integrator/machines.data'
import { TABLES } from '../../table'
import { belt } from '../belt.data'

/** The radius of the circle through three consecutive points: infinite on a straight. */
function radius(a: Vector3, b: Vector3, c: Vector3) {
  const ab = b.clone().sub(a), bc = c.clone().sub(b)
  const cross = Math.abs(ab.x * bc.z - ab.z * bc.x)
  return cross < 1e-9 ? Infinity : (ab.length() * bc.length() * a.distanceTo(c)) / (2 * cross)
}

const belts = [belt, ...recipes(parseBundle(JSON.stringify(sample))).transport]

describe('conveyor turns', () => {
  for (const transport of belts)
    for (const table of TABLES)
      for (const board of BOARDS)
        test(`the ${transport.id} belt on the ${table.id} table and ${board.id} board turns wider than its frame`, () => {
          const pts = lineOf({ layout: straight, cabinet: CABINETS[0], table, transport, board, integrator: machines }).path!.pts!
          let tightest = Infinity
          for (let i = 1; i < pts.length - 1; i++) tightest = Math.min(tightest, radius(pts[i - 1], pts[i], pts[i + 1]))
          expect(tightest).toBeGreaterThan(0.74)
        })
})
