import { describe, expect, test } from 'bun:test'

import { SwapMachine } from '../machine'

const box = (v: string) => ({ x: v.length, y: 0, z: 0, w: 1, d: 1, h: 1 })
const make = () => new SwapMachine({ duration: 2, arrive: 0.5 }, 'pnpm', box)
const run = (m: SwapMachine, seconds: number) => {
  m.settle()
  let last = 'idle'
  for (let i = 0; i < Math.round(seconds / 0.05); i++) last = m.step(0.05)
  return last
}
const roles = (m: SwapMachine) => ({ swapping: m.from !== null, from: m.from, to: m.to, queued: m.queued })

describe('socket swap', () => {
  test('a click at rest swaps the resting part out for the new one, then rests', () => {
    const m = make()
    expect(m.ask('npm')).toBe('start')
    expect(roles(m)).toEqual({ swapping: true, from: 'pnpm', to: 'npm', queued: null })
    expect(m.toBox.x).toBe(3)
    expect(run(m, 2)).toBe('end')
    expect(roles(m)).toEqual({ swapping: false, from: null, to: 'npm', queued: null })
  })

  test('a click before the new part shows only changes which part arrives', () => {
    const m = make()
    m.ask('npm')
    run(m, 0.5)
    expect(m.ask('bun')).toBe('retarget')
    expect(roles(m)).toEqual({ swapping: true, from: 'pnpm', to: 'bun', queued: null })
    expect(run(m, 1.5)).toBe('end')
    expect(m.to).toBe('bun')
  })

  test('clicks after the new part shows chain one faster swap to the latest value', () => {
    const m = make()
    m.ask('npm')
    run(m, 1.2)
    expect(m.ask('bun')).toBe('queue')
    expect(m.ask('pnpm')).toBe('queue')
    expect(run(m, 0.8)).toBe('chain')
    expect(roles(m)).toEqual({ swapping: true, from: 'npm', to: 'pnpm', queued: null })
    expect(m.dur).toBe(1.25)
    expect(run(m, 1.25)).toBe('end')
    expect(roles(m)).toEqual({ swapping: false, from: null, to: 'pnpm', queued: null })
  })

  test('toggling back to the arriving value cancels the queued swap', () => {
    const m = make()
    m.ask('npm')
    run(m, 1.2)
    m.ask('bun')
    m.ask('npm')
    expect(run(m, 0.8)).toBe('end')
    expect(m.to).toBe('npm')
  })

  test('a new swap holds still until its parts have rendered', () => {
    const m = make()
    m.ask('npm')
    expect(m.active).toBe(false)
    expect(m.step(0.05)).toBe('run')
    expect(m.u).toBe(0)
    expect(m.settle()).toBe(true)
    expect(m.settle()).toBe(false)
    expect(m.active).toBe(true)
  })

  test('a new act takes effect from the next swap; the running one keeps its length', () => {
    const m = make()
    m.ask('npm')
    run(m, 0.5)
    m.use({ duration: 1, arrive: 0.2 })
    expect(m.dur).toBe(2)
    expect(run(m, 1.5)).toBe('end')
    m.ask('bun')
    expect(m.dur).toBe(1)
    run(m, 0.3)
    expect(m.ask('pnpm')).toBe('queue')
  })
})
