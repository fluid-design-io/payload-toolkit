import { describe, expect, test } from 'bun:test'

import { frameInsets, insetsOf } from '../insets'

const box = (x0: number, y0: number, w: number, h: number) => ({ x0, y0, x1: x0 + w, y1: y0 + h })

describe('measured insets', () => {
  // /lab at 1440 x 900: the bar centred at the top, the strip at the left, the search bottom left, the call sheet bottom right.
  const scene = box(0, 0, 1440, 900)
  const bar = box(560, 12, 320, 40)
  const strip = box(16, 500, 40, 328)
  const search = box(16, 844, 300, 40)
  const sheet = box(960, 640, 400, 244)

  test('each piece of chrome counts against the edge where it hides the least of the scene', () => {
    expect(insetsOf(scene, [bar, strip, search, sheet])).toEqual({ top: 52, right: 0, bottom: 260, left: 56 })
  })

  test('the strip rests above only the chrome in its column', () => {
    expect(insetsOf(scene, [bar, search, sheet], { x0: 16, x1: 56 }).bottom).toBe(56)
    // The workspace's Install bar sits centred in the column, clear of the strip, until a phone spans it across.
    expect(insetsOf(box(240, 0, 784, 900), [box(457, 820, 350, 56)], { x0: 256, x1: 296 }).bottom).toBe(0)
    expect(insetsOf(box(0, 0, 390, 844), [box(16, 764, 358, 56)], { x0: 12, x1: 52 }).bottom).toBe(80)
  })

  test('chrome outside the scene, or only touching it, counts for nothing', () => {
    expect(insetsOf(box(240, 0, 784, 900), [box(0, 0, 240, 900), box(240, 900, 784, 40)])).toEqual({ top: 0, right: 0, bottom: 0, left: 0 })
  })

  test('a framed shot keeps clear of the chrome and below the header fade', () => {
    expect(frameInsets({ top: 64, right: 0, bottom: 80, left: 56 })).toEqual({ top: 112, right: 16, bottom: 96, left: 72 })
  })
})
