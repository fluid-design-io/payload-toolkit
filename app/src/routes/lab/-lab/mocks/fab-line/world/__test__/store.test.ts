import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { Group } from 'three'
import type { PersistStorage, StorageValue } from 'zustand/middleware'

import { THEMES } from '../../themes'
import { parseBundle } from '../../mods/data'
import { SwapMachine } from '../../stations/board/shared/swap/machine'
import sample from '../../mods/samples/vaporwave.fabmod.json'
import { createWorld } from '../store'
import type { Saved } from '../store'

const vaporwave = JSON.stringify(sample)

/** Async like IndexedDB, and structured-cloned so a test sees only what was written. */
function fakeStorage() {
  const rows = new Map<string, StorageValue<Saved>>()
  const storage: PersistStorage<Saved> = {
    getItem: async (name) => (rows.has(name) ? structuredClone(rows.get(name)!) : null),
    setItem: async (name, value) => void rows.set(name, structuredClone(value)),
    removeItem: async (name) => void rows.delete(name),
  }
  return { rows, storage }
}
const hydrated = (world: ReturnType<typeof createWorld>) =>
  new Promise<void>((resolve) => {
    if (world.getState().hydrated) return resolve()
    const off = world.subscribe((s) => s.hydrated && (off(), resolve()))
  })

describe('world store', () => {
  test('picks, follow and an installed data mod survive a reload through storage', async () => {
    const { rows, storage } = fakeStorage()
    const first = createWorld(storage)
    await hydrated(first)
    await first.install(parseBundle(vaporwave), false)
    first.setPick('theme', 'vaporwave.mall')
    first.setPick('follow', 'ride')
    await Bun.sleep(0)

    const saved = rows.get('fab-line:world')!
    expect(saved.state.picks).toEqual({ theme: 'vaporwave.mall', follow: 'ride' })
    expect(saved.state.mods.map((m) => [JSON.parse(m.source).id, m.enabled, m.trust])).toEqual([['vaporwave', true, null]])

    const second = createWorld(storage)
    expect(second.getState().hydrated).toBe(false)
    await hydrated(second)
    await Bun.sleep(0)
    const s = second.getState()
    expect(s.picks).toEqual({ theme: 'vaporwave.mall', follow: 'ride' })
    expect(s.mods.map((m) => [m.bundle.id, m.status])).toEqual([['vaporwave', 'ready']])
    expect(s.lists.theme.map((t) => t.id)).toContain('vaporwave.mall')
    expect(s.lists.transport.map((t) => t.id)).toContain('vaporwave.grand-tour')
  })

  test('a damaged stored value hydrates to defaults and keeps what still parses', async () => {
    const { rows, storage } = fakeStorage()
    rows.set('fab-line:world', {
      version: 1,
      state: { picks: { theme: 'clay', nope: 'x', chip: 7 }, follow: 'spin', toolbar: 'floating', mods: [{ source: '{broken', enabled: true, trust: null }] } as never,
    })
    const world = createWorld(storage)
    await hydrated(world)
    expect(world.getState().picks).toEqual({ theme: 'clay', follow: 'spin' })
    expect(world.getState().mods).toEqual([])
  })

  test('a world saved before follow and tool variants were picks keeps both, and drops the old toolbar placement on the next write', async () => {
    const { rows, storage } = fakeStorage()
    rows.set('fab-line:world', { version: 1, state: { picks: { theme: 'clay' }, follow: 'ride', tools: { 'cctv.cctv': 'cam-2', bad: 'x' }, toolbar: 'side', mods: [] } as never })
    const world = createWorld(storage)
    await hydrated(world)
    expect([world.getState().picks, 'toolbar' in world.getState()]).toEqual([{ 'cctv.cctv': 'cam-2', theme: 'clay', follow: 'ride' }, false])
    world.setPick('fx', 'sparks')
    await Bun.sleep(0)
    expect(rows.get('fab-line:world')).toEqual({ version: 1, state: { picks: { 'cctv.cctv': 'cam-2', theme: 'clay', follow: 'ride', fx: 'sparks' }, mods: [] } })
  })

  test('reset clears picks and follow but keeps mods installed', async () => {
    const { storage } = fakeStorage()
    const world = createWorld(storage)
    await hydrated(world)
    await world.install(parseBundle(vaporwave), false)
    world.setPick('fx', 'sparks')
    world.setPick('follow', 'off')
    world.setPick('cctv.cctv', 'cam-2')
    world.reset()
    expect([world.getState().picks, world.getState().mods.length]).toEqual([{}, 1])
  })

  test('restoring removed mods puts each back in its place with its switch, trust and variants', async () => {
    const world = createWorld(fakeStorage().storage)
    await hydrated(world)
    const data = (id: string) => parseBundle(JSON.stringify({ ...JSON.parse(vaporwave), id, name: id }))
    for (const id of ['a', 'b', 'c', 'd']) await world.install(data(id), false)
    world.setEnabled('b', false)
    await Bun.sleep(0)
    world.setPick('theme', 'c.mall')
    const c = world.getState().mods[2]
    const removed = world.remove(['c', 'b'])
    expect(world.getState().mods.map((m) => m.bundle.id)).toEqual(['a', 'd'])
    expect(world.getState().lists.theme.map((t) => t.id)).not.toContain('c.mall')

    world.restore(removed)
    const after = world.getState()
    expect(after.mods.map((m) => [m.bundle.id, m.enabled, m.status, m.trust])).toEqual([
      ['a', true, 'ready', null],
      ['b', false, 'off', null],
      ['c', true, 'ready', null],
      ['d', true, 'ready', null],
    ])
    expect(after.mods[2]).toBe(c)
    expect(after.picks).toEqual({ theme: 'c.mall' })
    expect(after.lists.theme.map((t) => t.id)).toContain('c.mall')
    expect(after.lists.theme.map((t) => t.id)).not.toContain('b.mall')
  })

  test('removing several mods saves the world once', async () => {
    const { rows, storage } = fakeStorage()
    let writes = 0
    const world = createWorld({ ...storage, setItem: (name, value) => (writes++, storage.setItem(name, value)) })
    await hydrated(world)
    const data = (id: string) => parseBundle(JSON.stringify({ ...JSON.parse(vaporwave), id, name: id }))
    for (const id of ['a', 'b', 'c']) await world.install(data(id), false)
    await Bun.sleep(0)
    const before = writes
    world.remove(['a', 'c', 'gone'])
    await Bun.sleep(0)
    expect([writes - before, rows.get('fab-line:world')!.state.mods.map((m) => JSON.parse(m.source).id)]).toEqual([1, ['b']])
  })

  test('undoing two separate removals in either order puts every mod back in install order', async () => {
    const world = createWorld(fakeStorage().storage)
    await hydrated(world)
    const data = (id: string) => parseBundle(JSON.stringify({ ...JSON.parse(vaporwave), id, name: id }))
    for (const id of ['a', 'b', 'c', 'd', 'e']) await world.install(data(id), false)
    const order = () => world.getState().mods.map((m) => m.bundle.id).join('')

    const first = world.remove(['b'])
    const second = world.remove(['c'])
    world.restore(first)
    const olderFirst = order()
    world.restore(second)
    const both = order()

    const third = world.remove(['b', 'd'])
    const fourth = world.remove(['c', 'e'])
    world.restore(fourth)
    const newerFirst = order()
    world.restore(third)
    expect([olderFirst, both, newerFirst, order()]).toEqual(['abde', 'abcde', 'ace', 'abcde'])
  })

  test('a code mod over plain http, where crypto.subtle is missing, lands in an error instead of loading forever', async () => {
    const world = createWorld(fakeStorage().storage)
    await hydrated(world)
    const bundle = parseBundle(JSON.stringify({ fabmod: 1, id: 'lan', name: 'LAN', code: 'export default () => ({})' }))
    Object.defineProperty(crypto, 'subtle', { value: undefined, configurable: true })
    try {
      const trusted = await world.install(bundle, true)
      const untrusted = await world.install(bundle, false)
      const message = 'Code mods need a secure context. Open this page over https or on localhost.'
      expect([trusted?.status, trusted?.error, untrusted?.status, untrusted?.error]).toEqual(['error', message, 'error', message])
    } finally {
      delete (crypto as { subtle?: unknown }).subtle
    }
  })

  describe('swap mods', () => {
    const codeMod = (id: string, code: string) => parseBundle(JSON.stringify({ fabmod: 1, id, name: id, code }))
    const fresh = async () => {
      const world = createWorld(fakeStorage().storage)
      await hydrated(world)
      return world
    }

    test('the teleporter sample adds its style to the swap slot after the built-ins', async () => {
      const world = await fresh()
      const read = (file: string) => readFileSync(new URL(`../../mods/samples/teleporter/${file}`, import.meta.url), 'utf8')
      const bundle = parseBundle(JSON.stringify({ ...JSON.parse(read('fabmod.json')), main: undefined, code: read('mod.js') }))
      const mod = await world.install(bundle, true)
      expect([mod?.status, mod?.error]).toEqual(['ready', null])
      expect(world.getState().lists.swap.map((s) => s.id)).toEqual(['mix', 'slapstick', 'bench', 'arcade', 'drop', 'teleporter.teleporter'])
    })

    test('a swap style missing a socket act is refused by name', async () => {
      const world = await fresh()
      const act = '{ duration: 1, arrive: 0.5, rig: () => ({ frame() {} }) }'
      const mod = await world.install(codeMod('half', `export default () => ({ swap: [{ id: 'half', label: 'Half', acts: { cpu: ${act}, memory: ${act} } }] })`), true)
      expect([mod?.status, mod?.error]).toEqual(['error', 'swap[0] needs acts.power with a rig function, a duration in seconds (up to 10) and arrive between 0 and 1.'])
      expect(world.getState().lists.swap.map((s) => s.id)).not.toContain('half.half')
    })

    test('a style that throws mid-swap switches its mod off and the socket lands the new part', async () => {
      const world = await fresh()
      const act = "{ duration: 1, arrive: 0.5, rig: () => ({ frame(clock) { if (clock.u > 0.3) throw new Error('beam misaligned') } }) }"
      await world.install(codeMod('broken', `export default ({ swap }) => ({ swap: [{ id: 'oops', label: 'Oops', acts: swap.every(${act}) }] })`), true)
      const style = world.getState().lists.swap.find((s) => s.id === 'broken.oops')!
      const rig = style.acts.memory.rig(THEMES[0].tokens.light, 'memory')
      const m = new SwapMachine(style.acts.memory, 'postgres', () => ({ x: 1, y: 0, z: 2, w: 1, d: 1, h: 1 }))
      const old = new Group(), next = new Group()
      m.ask('mongodb')
      m.settle()
      next.visible = false
      while (m.step(0.05) === 'run') rig.frame(m, old, next, 0.05)
      await Bun.sleep(0)
      const mod = world.getState().mods[0]
      expect([mod.status, mod.error]).toEqual(['error', 'beam misaligned'])
      expect([old.visible, next.visible, next.position.toArray()]).toEqual([false, true, [1, 0, 2]])
      expect(world.getState().lists.swap.map((s) => s.id)).toEqual(['mix', 'slapstick', 'bench', 'arcade', 'drop'])
    })
  })
})
