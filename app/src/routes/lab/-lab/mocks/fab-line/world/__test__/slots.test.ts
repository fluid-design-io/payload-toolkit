import { describe, expect, test } from 'bun:test'
import { Vector3 } from 'three'
import type { PersistStorage, StorageValue } from 'zustand/middleware'

import type { Rig, Site } from '../../core/contract'
import { lineOf, placeLine } from '../../core/line'
import { adopt } from '../../mods/adopt'
import { parseBundle } from '../../mods/data'
import { visibleCategories } from '../categories'
import { BUILTIN, SLOT_KEYS, SLOTS, resolve, toolPick } from '../slots'
import type { SlotKey } from '../slots'
import { createWorld } from '../store'
import type { Saved } from '../store'

const rig: Rig = { layout: BUILTIN.layout[0], cabinet: BUILTIN.cabinet[0], table: BUILTIN.table[0], transport: BUILTIN.transport[0], board: BUILTIN.board[0], integrator: BUILTIN.integrator[0] }
const site: Site = { pick: { x0: -18, x1: -8, z0: -4, z1: 4, h: 4 }, board: { x0: 2, x1: 19, z0: -5, z1: 6, h: 0.5 }, rail: { x0: 0, x1: 19, z: -6 } }
/** A built-in default under a mod's id, with `field` replaced. */
const variantOf = (slot: SlotKey, field: string, value: unknown) => ({ ...(SLOTS[slot].builtins[0] as object), id: 'x', [field]: value })
const refusal = (slot: SlotKey, variant: object) => {
  try {
    adopt('m', { [slot]: [variant] }, () => {})
    return null
  } catch (e) {
    return (e as Error).message
  }
}
/** Adopts one variant and collects what the mod reports once the current call returns. */
function adopted(slot: SlotKey, variant: object) {
  const errors: string[] = []
  const v = adopt('m', { [slot]: [variant] }, (m) => errors.push(m))[slot]![0] as unknown as Record<string, (...args: unknown[]) => unknown>
  return { v, errors }
}
const pts = (list: readonly Vector3[]) => list.map((p) => p.toArray().map((n) => +n.toFixed(4)))

async function fresh() {
  const rows = new Map<string, StorageValue<Saved>>()
  const storage: PersistStorage<Saved> = {
    getItem: async (name) => rows.get(name) ?? null,
    setItem: async (name, value) => void rows.set(name, value),
    removeItem: async (name) => void rows.delete(name),
  }
  const world = createWorld(storage)
  await new Promise<void>((resolve) => world.getState().hydrated ? resolve() : world.subscribe((s) => s.hydrated && resolve()))
  return world
}
const codeMod = (id: string, code: string) => parseBundle(JSON.stringify({ fabmod: 1, id, name: id, code }))

describe('slot table', () => {
  test('every open slot refuses a mod variant without a required field, naming the field', () => {
    const refused = SLOT_KEYS.flatMap((slot) =>
      Object.entries(SLOTS[slot].fields ?? {}).flatMap(([field, kind]) => (kind!.endsWith('?') || !SLOTS[slot].builtins[0] ? [] : [refusal(slot, variantOf(slot, field, undefined))])),
    )
    expect(refused).toEqual([
      'theme[0].Stage must be a component.',
      'layout[0].place must be a function.',
      'cabinet[0].drawer must be a function.',
      'cabinet[0].Component must be a component.',
      'table[0].pocket must be a function.',
      'table[0].Component must be a component.',
      'transport[0].at must be a function.',
      'transport[0].wrap must be a function.',
      'transport[0].Component must be a component.',
      'board[0].plan must be a function.',
      'board[0].route must be a function.',
      'board[0].Component must be a component.',
      'signals[0].Component must be a component.',
      'integrator[0].workTime must be a function.',
      'integrator[0].Component must be a component.',
      'chip[0].boxes must be a function.',
      'chip[0].lid must be a function.',
      'chip[0].marking must be a function.',
      'chip[0].CloseUp must be a component.',
    ])
  })

  test('code and data mods share one id rule, so ids cannot break a namespace or the URL', () => {
    const bad = ['a.b', 'a&b', 'a=b', 'A'].map((id) => refusal('fx', { id, label: 'Glow', Component: null }))
    const data = (() => {
      try {
        return parseBundle(JSON.stringify({ fabmod: 1, id: 'm', name: 'M', theme: [{ id: 'a.b', label: 'A', tokens: {} }] }))
      } catch (e) {
        return (e as Error).message
      }
    })()
    const good = adopt('m', { fx: [{ id: 'glow', label: 'A label well over twenty-four characters', thumbnail: 'https://example.com/glow.png', Component: null }] }, () => {}).fx![0]
    expect([...bad, data, good.id, good.label, good.thumbnail]).toEqual([
      'fx[0].id must be lowercase letters, digits and dashes.',
      'fx[0].id must be lowercase letters, digits and dashes.',
      'fx[0].id must be lowercase letters, digits and dashes.',
      'fx[0].id must be lowercase letters, digits and dashes.',
      'theme[0].id must be lowercase letters, digits and dashes.',
      'm.glow',
      'A label well over twenty',
      'https://example.com/glow.png',
    ])
    expect(refusal('follow', { id: 'spin', label: 'Spin' })).toBe('Unknown slot "follow". Slots: theme, fx, layout, cabinet, table, transport, board, swap, signals, integrator, chip, tools.')
  })

  test('a mod function that throws returns what the slot default returns, and the mod reports the first throw once', async () => {
    const broke = (name: string) => () => {
      throw new Error(`${name} broke`)
    }
    const cases = [
      { slot: 'layout', field: 'place', call: (f: Function) => f(rig).board, want: placeLine(rig).board },
      { slot: 'cabinet', field: 'drawer', call: (f: Function) => f(2, new Vector3()).toArray(), want: BUILTIN.cabinet[0].drawer(2, new Vector3()).toArray() },
      { slot: 'table', field: 'pocket', call: (f: Function) => f(7, new Vector3()).toArray(), want: BUILTIN.table[0].pocket(7, new Vector3()).toArray() },
      { slot: 'transport', field: 'at', call: (f: Function) => f(1.5, new Vector3()).toArray(), want: [-5.1, 0.9, -1.2] },
      { slot: 'transport', field: 'wrap', call: (f: Function) => pts(f(site).pts).length, want: pts(BUILTIN.transport[0].kind === 'path' ? BUILTIN.transport[0].wrap(site).pts : []).length },
      { slot: 'board', field: 'plan', call: (f: Function) => f([], 'new').slots.size, want: 0 },
      { slot: 'integrator', field: 'workTime', call: (f: Function) => f('none', null), want: 0 },
      { slot: 'integrator', field: 'footprint', call: (f: Function) => f(BUILTIN.board[0]), want: BUILTIN.integrator[0].footprint!(BUILTIN.board[0]) },
    ] as const
    const results = []
    for (const c of cases) {
      const { v, errors } = adopted(c.slot, variantOf(c.slot, c.field, broke(`${c.slot}.${c.field}`)))
      const first = c.call(v[c.field])
      const again = c.call(v[c.field])
      await Bun.sleep(0)
      results.push([first, again, errors])
    }
    expect(results).toEqual(cases.map((c) => [c.want, c.want, [`${c.slot}.${c.field} broke`]]))
  })

  test('after one throw a mod stops running its other functions too', async () => {
    let wraps = 0
    const { v, errors } = adopted('transport', {
      ...variantOf('transport', 'at', () => {
        throw new Error('derailed')
      }),
      wrap: () => (wraps++, { pts: [new Vector3(0, 0, 0), new Vector3(1, 0, 0)] }),
    })
    const before = (v.wrap(site) as { pts: Vector3[] }).pts.length
    v.at(1, new Vector3())
    const after = (v.wrap(site) as { pts: Vector3[] }).pts.length
    await Bun.sleep(0)
    expect([before, wraps, after > 2, errors]).toEqual([2, 1, true, ['derailed']])
  })

  test('a path transport needs a route of two or more points; a mod transport must be a path', async () => {
    const none = refusal('transport', { id: 'gone', label: 'Gone', kind: 'none', footprint: rig.transport.footprint, frame: { pts: [] } })
    const { v, errors } = adopted('transport', variantOf('transport', 'wrap', () => ({ pts: [new Vector3()] })))
    const route = v.wrap(site) as { pts: Vector3[] }
    await Bun.sleep(0)
    const lines = BUILTIN.transport.flatMap((t) => (t.kind === 'path' ? [[t.id, lineOf({ ...rig, transport: t }).path!.pts.length > 1]] : []))
    expect([none, route.pts.length > 2, errors]).toEqual(["transport[0].kind must be 'path'.", true, ['transport[0].wrap must return { pts } with at least two points.']])
    expect(lines).toEqual([['belt', true], ['tube', true], ['monorail', true], ['agv', true], ['maglev', true]])
  })
})

describe('the tools slot', () => {
  test('every enabled mod\'s tools are on at once, in install order, each with its own saved variant', async () => {
    const world = await fresh()
    const tool = (id: string) => `export default () => ({ tools: [{ id: '${id}', kind: 'toggle', label: '${id}', variants: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }] }] })`
    await world.install(codeMod('one', tool('lamp')), true)
    await world.install(codeMod('two', tool('xray')), true)
    world.setPick('two.xray', 'b')
    const { lists, picks } = world.getState()
    const tools = resolve(lists, picks).tools
    expect(tools.map((t) => [t.id, toolPick(t, picks)])).toEqual([['one.lamp', 'a'], ['two.xray', 'b']])
  })
})

describe('the signals slot', () => {
  test('a code mod adds a signal treatment that World settings lists, the world can pick and a broken one falls back from', async () => {
    const world = await fresh()
    await world.install(codeMod('sparkle', "export default ({ React }) => ({ signals: [{ id: 'fizz', label: 'Fizz', Component: () => React.createElement('group') }] })"), true)
    world.setPick('signals', 'sparkle.fizz')
    const { lists, picks } = world.getState()
    const ids = lists.signals.map((v) => v.id)
    expect([ids.at(-1), ids.length - BUILTIN.signals.length, visibleCategories(lists).includes('signals'), resolve(lists, picks).signals.id, resolve(lists, { signals: 'gone.away' }).signals.id]).toEqual([
      'sparkle.fizz', 1, true, 'sparkle.fizz', BUILTIN.signals[0].id,
    ])
  })
})
