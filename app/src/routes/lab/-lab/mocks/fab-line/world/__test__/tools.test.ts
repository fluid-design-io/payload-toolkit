import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { Vector3 } from 'three'
import type { PersistStorage, StorageValue } from 'zustand/middleware'

import type { Shot, ShotContext } from '../../core/contract'
import { lineOf } from '../../core/line'
import { parseBundle } from '../../mods/data'
import { BUILTIN, resolve, toolPick } from '../slots'
import { createWorld } from '../store'
import type { Saved } from '../store'

function fresh() {
  const rows = new Map<string, StorageValue<Saved>>()
  const storage: PersistStorage<Saved> = {
    getItem: async (name) => (rows.has(name) ? structuredClone(rows.get(name)!) : null),
    setItem: async (name, value) => void rows.set(name, structuredClone(value)),
    removeItem: async (name) => void rows.delete(name),
  }
  const world = createWorld(storage)
  return new Promise<typeof world>((resolve) => {
    if (world.getState().hydrated) return resolve(world)
    const off = world.subscribe((s) => s.hydrated && (off(), resolve(world)))
  })
}
const codeMod = (id: string, code: string) => parseBundle(JSON.stringify({ fabmod: 1, id, name: id, code }))
const shot = (): Shot => ({ pos: new Vector3(0, 9, 9), look: new Vector3(), fov: 20 })
const pose = (s: Shot) => [...s.pos.toArray(), ...s.look.toArray(), s.fov]
const toolsOf = (world: Awaited<ReturnType<typeof fresh>>) => resolve(world.getState().lists, world.getState().picks).tools
const ids = (world: Awaited<ReturnType<typeof fresh>>) => toolsOf(world).map((v) => v.id)
const viewOf = (world: Awaited<ReturnType<typeof fresh>>) => {
  const tool = toolsOf(world)[0]
  if (tool?.kind !== 'view') throw new Error('expected a view tool')
  return tool
}

/** A line built from every slot's default, with nothing moving. */
const line = lineOf({ layout: BUILTIN.layout[0], cabinet: BUILTIN.cabinet[0], table: BUILTIN.table[0], transport: BUILTIN.transport[0], board: BUILTIN.board[0], integrator: BUILTIN.integrator[0] })
const idle = { line, arm: { pos: new Vector3(20, 2, 0), holding: null }, carried: [], latest: null } as unknown as ShotContext['sim']
const at = (t: number, variant: string | null = null): ShotContext => ({ sim: idle, t, dt: 1 / 60, aspect: 1.6, variant })
const orbit = (extra = '') => `export default () => ({ tools: [{ id: 'orbit', kind: 'view', label: 'Orbit'${extra}, shot(ctx, out) { out.pos.set(10, 5, 0); out.look.set(0, 0, 0); out.fov = 30 } }] })`

describe('mod tools', () => {
  test('the CCTV sample adds a view tool whose variants auto-cycle, hold one camera, or start over when picked again, always cutting hard', async () => {
    const world = await fresh()
    const read = (file: string) => readFileSync(new URL(`../../mods/samples/cctv/${file}`, import.meta.url), 'utf8')
    const mod = await world.install(parseBundle(JSON.stringify({ ...JSON.parse(read('fabmod.json')), main: undefined, code: read('mod.js') })), true)
    expect([mod?.status, mod?.error]).toEqual(['ready', null])
    const view = viewOf(world)
    expect([view.id, view.label, view.variants?.map((v) => v.id), typeof view.Overlay, typeof view.Scenery]).toEqual([
      'cctv.cctv', 'CCTV', ['auto', 'follow', 'cam-1', 'cam-2', 'cam-3', 'cam-4', 'cam-5', 'cam-6'], 'function', 'function',
    ])

    const out = shot()
    const step = (t: number, variant: string) => [view.shot(at(t, variant), out), out.fov]
    const auto = [step(0, 'auto'), step(1, 'auto'), step(4.1, 'auto'), step(0, 'auto')]
    const fixed = [step(0, 'cam-2'), step(9, 'cam-2'), step(30, 'cam-2')]
    // Every frame is a hard cut (the heads move like motors, never eased); the lens tells the cameras apart.
    expect(auto).toEqual([[true, 52], [true, 52], [true, 50], [true, 52]])
    expect(fixed).toEqual([[true, 50], [true, 50], [true, 50]])
    expect(out.pos.distanceTo(out.look)).toBeGreaterThan(5)
  })

  test('the picked variant is saved per tool and falls back to the first while the tool no longer offers it', async () => {
    const world = await fresh()
    await world.install(codeMod('multi', orbit(", variants: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }]")), true)
    const tool = viewOf(world)
    const before = toolPick(tool, world.getState().picks)
    world.setPick('multi.orbit', 'b')
    const picked = toolPick(tool, world.getState().picks)
    world.setPick('multi.orbit', 'gone')
    const stale = toolPick(tool, world.getState().picks)
    world.setPick('multi.orbit', 'b')
    world.reset()
    expect([before, picked, stale, toolPick(tool, world.getState().picks)]).toEqual(['a', 'b', 'a', 'a'])
  })

  test('tools are refused by name for a missing kind or shot, a bad icon or variants, or an unknown key', async () => {
    const world = await fresh()
    const cases = {
      nokind: "export default () => ({ tools: [{ id: 'cam', label: 'Cam', shot() {} }] })",
      noshot: "export default () => ({ tools: [{ id: 'cam', kind: 'view', label: 'Cam' }] })",
      icon: "export default () => ({ tools: [{ id: 'cam', kind: 'toggle', label: 'Cam', icon: '<svg/>' }] })",
      twins: "export default () => ({ tools: [{ id: 'cam', kind: 'toggle', label: 'Cam', variants: [{ id: 'a', label: 'A' }, { id: 'a', label: 'B' }] }] })",
      nolabel: "export default () => ({ tools: [{ id: 'cam', kind: 'toggle' }] })",
      slot: 'export default () => ({ views: [] })',
    }
    const errors: Record<string, string | null | undefined> = {}
    for (const [id, code] of Object.entries(cases)) errors[id] = (await world.install(codeMod(id, code), true))?.error
    expect(errors).toEqual({
      nokind: "tools[0] needs kind 'view' or 'toggle'.",
      noshot: 'tools[0] is a view and needs a shot(ctx, out) function.',
      icon: 'tools[0].icon must be SVG path data on a 24 × 24 grid.',
      twins: 'tools[0].variants need distinct ids.',
      nolabel: 'tools[0].label must be a non-empty string.',
      slot: 'Unknown slot "views". Slots: theme, fx, layout, cabinet, table, transport, board, swap, signals, integrator, chip, tools.',
    })
    expect(ids(world)).toEqual([])
  })

  test('a tool leaves the toolbar when its mod is switched off or removed, and comes back when switched on', async () => {
    const world = await fresh()
    await world.install(codeMod('spin', orbit()), true)
    await world.install(codeMod('xray', "export default () => ({ tools: [{ id: 'xray', kind: 'toggle', label: 'X-ray' }] })"), true)
    const on = ids(world)
    world.setEnabled('spin', false)
    await Bun.sleep(0)
    const off = ids(world)
    world.setEnabled('spin', true)
    await Bun.sleep(20)
    const back = ids(world)
    world.remove(['spin'])
    expect([on, off, back, ids(world)]).toEqual([['spin.orbit', 'xray.xray'], ['xray.xray'], ['spin.orbit', 'xray.xray'], ['xray.xray']])
  })

  test('a view that throws switches its mod off and the camera keeps its last good pose', async () => {
    const world = await fresh()
    const code = `let calls = 0
      export default () => ({ tools: [{ id: 'shaky', kind: 'view', label: 'Shaky', shot(ctx, out) {
        calls++
        if (calls > 1) { out.pos.set(NaN, 0, 0); throw new Error('lens cap on (' + calls + ')') }
        out.pos.set(3, 4, 5); out.look.set(0, 1, 0); out.fov = 40
        return true
      } }] })`
    await world.install(codeMod('flaky', code), true)
    const view = viewOf(world)
    const out = shot()
    const first = view.shot(at(0), out)
    const second = view.shot(at(0.1), out)
    const third = view.shot(at(0.2), out)
    await Bun.sleep(0)
    const mod = world.getState().mods[0]
    expect([first, second, third, pose(out)]).toEqual([true, false, false, [3, 4, 5, 0, 1, 0, 40]])
    expect([mod.status, mod.error, ids(world)]).toEqual(['error', 'lens cap on (2)', []])
  })

  test('a view that writes an unusable pose is treated as a throw', async () => {
    const world = await fresh()
    await world.install(codeMod('blind', "export default () => ({ tools: [{ id: 'eye', kind: 'view', label: 'Eye', shot(ctx, out) { out.look.copy(out.pos) } }] })"), true)
    const view = viewOf(world)
    const out = shot()
    expect([view.shot(at(0), out), pose(out)]).toEqual([false, [0, 9, 9, 0, 0, 0, 20]])
    await Bun.sleep(0)
    expect(world.getState().mods[0].error).toBe('A view\'s shot must write a finite pos and look point apart from each other, and a fov between 1 and 150 degrees.')
  })
})
