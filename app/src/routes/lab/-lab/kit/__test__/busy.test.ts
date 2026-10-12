import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { createDemand } from '../busy'

const clock = () => {
  const c = { t: 0, now: () => c.t }
  return c
}

describe('frame demand', () => {
  test('any one asker keeps the next frame at full rate', () => {
    const d = createDemand(clock().now)
    const belt = () => d.keep()
    const drawer = () => d.keep()
    expect(d.wanted()).toBe(false)
    drawer()
    expect(d.wanted()).toBe(true)
    d.rendered()
    belt()
    drawer()
    expect(d.wanted()).toBe(true)
  })

  test('an ask waits for a render, however many frames pass before one starts', () => {
    const d = createDemand(clock().now)
    d.keep()
    expect([d.wanted(), d.wanted(), d.wanted()]).toEqual([true, true, true])
  })

  test('an asker that settles or unmounts holds nothing after the render it asked for', () => {
    const d = createDemand(clock().now)
    d.keep()
    d.rendered()
    expect(d.wanted()).toBe(false)
  })

  test('a timed request runs until its end through renders, then expires', () => {
    const c = clock()
    const d = createDemand(c.now)
    d.keep(0.5)
    c.t = 100
    d.rendered()
    expect(d.wanted()).toBe(true)
    c.t = 499
    expect(d.wanted()).toBe(true)
    c.t = 500
    expect(d.wanted()).toBe(false)
  })

  test('a shorter request never cuts a longer one short', () => {
    const c = clock()
    const d = createDemand(c.now)
    d.keep(2)
    c.t = 1000
    d.keep(0.2)
    c.t = 1500
    expect(d.wanted()).toBe(true)
    c.t = 2000
    expect(d.wanted()).toBe(false)
  })
})

describe('frame loop ownership', () => {
  test('only the frame governor calls invalidate, so every frame it renders is one it chose', () => {
    const lab = join(import.meta.dir, '..', '..')
    const callers = readdirSync(lab, { recursive: true, encoding: 'utf8' })
      .filter((f) => /\.(tsx?|js)$/.test(f) && !f.includes('__test__'))
      .filter((f) => /\binvalidate\b/.test(readFileSync(join(lab, f), 'utf8')))
    expect(callers).toEqual(['kit/perf.tsx'])
  })
})
