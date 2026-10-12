import { describe, expect, test } from 'bun:test'
import { Vector3 } from 'three'

import { makeRoute, viaDistances } from '../route'

describe('viaDistances', () => {
  test('puts each via where the trace passes nearest it, chamfered corners included, and answers again from the cache', () => {
    const route = makeRoute([new Vector3(0, 0, 0), new Vector3(2, 0, 0), new Vector3(2, 0, 2)], [new Vector3(1, 0, 0), new Vector3(2, 0, 0), new Vector3(2, 0, 1.5)])
    const first = viaDistances(route)
    expect([...first].map((d) => +d.toFixed(2))).toEqual([1.02, 1.91, 3.33])
    expect(viaDistances(route)).toBe(first)
  })
})
