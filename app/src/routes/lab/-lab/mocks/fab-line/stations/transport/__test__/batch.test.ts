import { describe, expect, test } from 'bun:test'
import { Color, Matrix4 } from 'three'
import type { BufferAttribute } from 'three'

import { Batch, hidden } from '../fleet'
import { carPieces } from '../monorail/build'

/** What the GPU holds for an attribute: the renderer copies the marked ranges (or everything) and clears them, as WebGLAttributes does. */
function gpu(attr: BufferAttribute) {
  const copy = new Float32Array(attr.array.length)
  let seen = -1
  return {
    copy,
    draw() {
      if (attr.version === seen) return
      seen = attr.version
      if (!attr.updateRanges.length) copy.set(attr.array)
      for (const r of attr.updateRanges) copy.set(attr.array.subarray(r.start, r.start + r.count), r.start)
      attr.clearUpdateRanges()
    },
  }
}

describe('Batch', () => {
  test('the GPU ends up holding every pose, colour and hairline, even across frames that were never drawn', () => {
    const batch = new Batch(carPieces().chassis, 7, null as never, {} as never)
    const m = new Matrix4()
    for (let i = 0; i < 7; i++) batch.color(i, new Color('#fff'))
    batch.commit()
    const views = [batch.mesh.instanceMatrix, batch.mesh.instanceColor!, batch.lines!.geometry.getAttribute('position') as BufferAttribute].map(gpu)
    const red = new Color('#c33')
    for (let frame = 0; frame < 30; frame++) {
      for (let i = 0; i < 7; i++) {
        if (i === frame % 7) batch.set(i, m.makeRotationY(frame).setPosition(i, frame * 0.1, 0))
        else if (frame % 11 === i) batch.set(i, hidden)
        if (frame % 5 === 0) batch.color(i, frame % 10 ? red : new Color('#fff'))
      }
      batch.commit()
      if (frame % 4 !== 3) for (const v of views) v.draw()
    }
    for (const v of views) v.draw()
    expect(Array.from(views[0].copy)).toEqual(Array.from(batch.mesh.instanceMatrix.array))
    expect(Array.from(views[1].copy)).toEqual(Array.from(batch.mesh.instanceColor!.array))
    expect(Array.from(views[2].copy)).toEqual(Array.from(batch.lines!.geometry.getAttribute('position').array))
  })

  test('a fleet that stands still uploads nothing', () => {
    const batch = new Batch(carPieces().chassis, 3, null as never, {} as never)
    const m = new Matrix4().makeTranslation(1, 2, 3)
    for (let i = 0; i < 3; i++) batch.set(i, m)
    batch.commit()
    const version = batch.mesh.instanceMatrix.version
    for (let i = 0; i < 3; i++) batch.set(i, m)
    batch.commit()
    expect(batch.mesh.instanceMatrix.version).toBe(version)
  })
})
