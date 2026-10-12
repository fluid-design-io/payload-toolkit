import { describe, expect, test } from 'bun:test'

import { parseBundle } from '../../mods/data'
import sample from '../../mods/samples/vaporwave.fabmod.json'
import { centered, optionsOf, visibleCategories } from '../categories'
import { BUILTIN } from '../slots'
import type { Lists } from '../slots'
import { createWorld } from '../store'

const memory = () => {
  const rows = new Map()
  return {
    getItem: async (name: string) => rows.get(name) ?? null,
    setItem: async (name: string, value: unknown) => void rows.set(name, value),
    removeItem: async (name: string) => void rows.delete(name),
  }
}

describe('world sheet categories', () => {
  test('a slot with one variant is hidden until a mod adds a second', () => {
    expect(visibleCategories(BUILTIN)).toEqual(['theme', 'fx', 'follow', 'cabinet', 'table', 'transport', 'board', 'swap', 'signals', 'integrator'])
    const withLayout: Lists = { ...BUILTIN, layout: [...BUILTIN.layout, { ...BUILTIN.layout[0], id: 'tower.tower', label: 'Tower' }] }
    expect(visibleCategories(withLayout)).toContain('layout')
  })

  test('mod variants carry their mod name and thumbnail, built-ins a registry hue', async () => {
    const world = createWorld(memory())
    await new Promise<void>((resolve) => world.subscribe((s) => s.hydrated && resolve()))
    await world.install(parseBundle(JSON.stringify({ ...sample, theme: [{ ...sample.theme[0], thumbnail: 'data:image/png;base64,iVBORw0KGgo=' }] })), false)
    const { lists, mods } = world.getState()
    const themes = optionsOf('theme', lists, mods, 'light')
    expect(themes.at(-1)).toMatchObject({ id: 'vaporwave.mall', label: 'Vaporwave', group: 'Vaporwave', thumbnail: 'data:image/png;base64,iVBORw0KGgo=' })
    expect(themes[0]).toMatchObject({ id: 'blueprint', group: undefined, thumbnail: undefined, hue: 20 })
    expect(() => parseBundle(JSON.stringify({ ...sample, theme: [{ ...sample.theme[0], thumbnail: 'https://example.com/mall.png' }] }))).toThrow('theme[0].thumbnail must be a data:image URL.')
    expect(themes[1].hue).toBe(158)
  })

  test('the centred item is the one nearest the middle of the scroller', () => {
    const items = [
      { start: 100, width: 60 },
      { start: 168, width: 90 },
      { start: 266, width: 50 },
    ]
    expect(centered(items, 0, 260)).toBe(0)
    expect(centered(items, 84, 260)).toBe(1)
    expect(centered(items, 200, 260)).toBe(2)
  })
})
