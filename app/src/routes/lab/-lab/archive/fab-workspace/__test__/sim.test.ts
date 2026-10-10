import { describe, expect, test } from 'bun:test'
import { catalog as raw } from '../../../../../workspace/-workspace/workspace.catalog'
import { defaultSetup } from '../../../../../workspace/-workspace/workspace.constants'
import { toCatalog } from '../../../../../workspace/-workspace/workspace.utils'
import type { Lab } from '../../../lab.types'
import { toWarehouse } from '../../../warehouse'
import { IDLE_AFTER, createSim, isBusy, step, wake } from '../sim'
import type { Sim } from '../sim'

const catalog = toCatalog(raw)
const warehouse = toWarehouse(catalog)
const hero = catalog.items.find((item) => item.kind === 'block')!.ref

/** A Lab whose selection is the given refs; everything else the sim reads is real catalog data. */
function labWith(items: readonly string[]): Lab {
  return {
    catalog,
    warehouse,
    scale: 'real',
    setup: { ...defaultSetup, items },
    selected: new Set(items),
    toggle: () => {},
    clear: () => {},
    set: () => {},
    command: '',
    theme: 'light',
    chrome: 'full',
    focus: { category: 'all', query: '' },
    setFocus: () => {},
  }
}

/** Steps at 60 Hz until `until` holds or `seconds` pass; returns the seconds spent. */
function run(sim: Sim, lab: Lab, seconds: number, until: () => boolean = () => false) {
  let t = 0
  while (t < seconds && !until()) {
    step(sim, lab, 1 / 60, 1)
    t += 1 / 60
  }
  return t
}

describe('fab-workspace sim', () => {
  test('a selected part travels the belt, is carried by the arm and seats', () => {
    const sim = createSim(labWith([]))
    const lab = labWith([hero])
    const part = sim.parts.get(hero)!
    run(sim, lab, 10, () => part.mode === 'held')
    expect(part.mode).toBe('held')
    run(sim, lab, 10, () => part.mode === 'board')
    expect(part.mode).toBe('board')
    expect(sim.events.filter((event) => event.kind === 'seat').map((event) => event.part.item.ref)).toEqual([hero])
  })

  test('a part cleared while the arm carries it never seats', () => {
    const sim = createSim(labWith([]))
    const part = sim.parts.get(hero)!
    run(sim, labWith([hero]), 10, () => part.mode === 'held')
    expect(part.mode).toBe('held')
    const modes = new Set<string>()
    run(sim, labWith([]), 10, () => {
      modes.add(part.mode)
      return part.mode === 'home' && !part.fly
    })
    expect(modes.has('board')).toBe(false)
    expect(part.mode).toBe('home')
    expect(sim.events.some((event) => event.kind === 'seat')).toBe(false)
  })

  test('a part cleared on the belt turns back without reaching the arm', () => {
    const sim = createSim(labWith([]))
    const part = sim.parts.get(hero)!
    run(sim, labWith([hero]), 10, () => part.mode === 'belt' && !part.fly)
    expect(part.mode).toBe('belt')
    run(sim, labWith([]), 10, () => part.mode === 'home' && !part.fly)
    expect(part.mode).toBe('home')
    expect(sim.arm.holding).toBeNull()
  })

  test('the sim rests after the idle window and wakes on activity', () => {
    const sim = createSim(labWith([]))
    const lab = labWith([hero])
    const part = sim.parts.get(hero)!
    run(sim, lab, 10, () => part.mode === 'board')
    run(sim, lab, IDLE_AFTER + 3)
    expect(isBusy(sim, 1)).toBe(false)
    wake(sim)
    expect(isBusy(sim, 1)).toBe(true)
  })

  test('reduced motion still seats, then rests without waiting out the idle window', () => {
    const sim = createSim(labWith([]))
    const lab = labWith([hero])
    const part = sim.parts.get(hero)!
    let t = 0
    while (t < 12 && part.mode !== 'board') {
      step(sim, lab, 1 / 60, 0.5)
      t += 1 / 60
    }
    expect(part.mode).toBe('board')
    for (let k = 0; k < 180; k++) step(sim, lab, 1 / 60, 0.5)
    expect(isBusy(sim, 0.5)).toBe(false)
    expect(sim.time - sim.lastActivity).toBeLessThan(IDLE_AFTER)
  })
})
