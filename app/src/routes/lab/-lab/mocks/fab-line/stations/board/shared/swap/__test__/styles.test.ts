import { describe, expect, test } from 'bun:test'
import { Group } from 'three'

import type { SocketKind, SwapAct } from '../../../../../core/contract'
import { THEMES } from '../../../../../themes'
import { SWAPS, actFor, mix } from '..'
import { SwapMachine } from '../machine'

const KINDS: SocketKind[] = ['cpu', 'memory', 'power']
const PAIRS: Record<SocketKind, [string, string]> = { cpu: ['next', 'tanstack'], memory: ['postgres', 'mongodb'], power: ['pnpm', 'bun'] }
const box = (v: string) => ({ x: v.length, y: 0, z: 0, w: 1, d: 1, h: 0.5 })
const byId = (id: string) => SWAPS.find((s) => s.id === id)!

/** Plays one swap through an act the way a socket drives it and reports which parts show on its last running frame. */
function playThrough(act: SwapAct, kind: SocketKind) {
  const [from, to] = PAIRS[kind]
  const m = new SwapMachine(act, from, box)
  const rig = act.rig(THEMES[0].tokens.light, kind)
  const old = new Group(), next = new Group()
  m.ask(to)
  m.settle()
  let shown = { old: true, next: false }
  while (m.step(1 / 60) === 'run') {
    rig.frame(m, old, next, 1 / 60)
    shown = { old: old.visible, next: next.visible }
  }
  rig.dispose?.()
  return shown
}

describe('swap styles', () => {
  test('the built-ins, mix first as the default', () => {
    expect(SWAPS.map((s) => [s.id, s.label])).toEqual([
      ['mix', 'Mix'], ['slapstick', 'Slapstick'], ['bench', 'Bench tech'], ['arcade', 'Arcade'], ['drop', 'Drop'],
    ])
  })

  test("the mix plays the bench tech's CPU act and slapstick's memory and power acts", () => {
    expect(mix.acts.cpu).toBe(byId('bench').acts.cpu)
    expect(mix.acts.memory).toBe(byId('slapstick').acts.memory)
    expect(mix.acts.power).toBe(byId('slapstick').acts.power)
    expect(mix.acts.cpu).not.toBe(byId('slapstick').acts.cpu)
  })

  test('every style plays its own act, and the same calm glide under reduced motion', () => {
    expect(actFor(mix, 'cpu', false)).toBe(byId('bench').acts.cpu)
    const calm = actFor(byId('arcade'), 'power', true)
    for (const style of SWAPS) for (const kind of KINDS) expect(actFor(style, kind, true)).toBe(calm)
    expect([calm.duration, calm.arrive]).toEqual([0.55, 0.5])
  })

  test('every act, calm included, ends a swap with the old part gone and the new one showing', () => {
    const acts = [...SWAPS.flatMap((s) => KINDS.map((k) => [s.id, k, s.acts[k]] as const)), ...KINDS.map((k) => ['calm', k, actFor(mix, k, true)] as const)]
    const ends = acts.map(([id, kind, act]) => `${id}.${kind}: ${JSON.stringify(playThrough(act, kind))}`)
    expect(ends).toEqual(acts.map(([id, kind]) => `${id}.${kind}: {"old":false,"next":true}`))
  })
})
