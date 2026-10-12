import { describe, expect, test } from 'bun:test'
import { Vector3 } from 'three'

import type { Footprint, Site } from '../../../../core/contract'
import { Track } from '../../track'
import { BREECH, END, SPEED, START, courseOf } from '../course'

/** The riser campus (drawers, Riser 40 table, PCB, machines) in the transport's frame, as the layout hands it to `wrap`. */
const site: Site = {
  pick: { x0: -18.93, x1: -8.85, z0: -4.65, z1: 4.05, h: 4.57 },
  board: { x0: 2.864, x1: 22.31, z0: -5.328, z1: 5.928, h: 0.672 },
  rail: { x0: 0.2, x1: 20.12, z: -6 },
}
const own: Footprint = { x0: -8.8, x1: 0.62, z0: -3.35, z1: -0.45, h: 2.8 }
const GLASS = 0.66
const course = courseOf(site, own)
const track = new Track(course.pts)

/** Seconds a capsule spends on the course at `rate(s)` times `SPEED`. */
function rideTime() {
  let t = 0
  for (let s = 0; s < track.len; s += 0.02) t += 0.02 / (course.rate(s + 0.01) * SPEED)
  return t
}

describe('pneumatic course', () => {
  test('starts where the part lands and ends where the arm picks, both heading along the line', () => {
    expect(course.pts[0].toArray()).toEqual(START.toArray())
    expect(course.pts[course.pts.length - 1].toArray()).toEqual(END.toArray())
    expect(track.tangent(0.01, new Vector3()).toArray().map((v) => Math.round(v))).toEqual([1, 0, 0])
    expect(track.tangent(track.len - 0.01, new Vector3()).toArray().map((v) => Math.round(v))).toEqual([1, 0, 0])
  })

  test('takes the long way: over 100 m, up past 8 m, round the board, about 13 s a ride', () => {
    const p = new Vector3()
    let top = 0, far = -Infinity
    for (let s = 0; s < track.len; s += 0.1) {
      track.point(s, p)
      top = Math.max(top, p.y)
      far = Math.max(far, p.x)
    }
    expect(track.len).toBeGreaterThan(100)
    expect(top).toBeCloseTo(8.4, 1)
    expect(far).toBeGreaterThan(site.board.x1 + 1)
    expect(rideTime()).toBeGreaterThan(11)
    expect(rideTime()).toBeLessThan(15)
  })

  test('creeps through the breech, blasts up the riser, hangs at the crest and slams in fast', () => {
    expect(course.rate(BREECH / 2)).toBe(1)
    const speeds = [4, 7, 12, track.len - 0.2].map((s) => Math.round(course.rate(s) * SPEED))
    expect(speeds).toEqual([16, 16, 5, 13])
    for (let s = 0; s < track.len; s += 0.25) expect(course.rate(s)).toBeGreaterThanOrEqual(1)
  })

  test('the glass never runs into itself or out of the room', () => {
    const a = new Vector3(), b = new Vector3()
    let closest = Infinity
    for (let s = 0; s < track.len; s += 0.2) {
      track.point(s, a)
      expect(Math.abs(a.z) + GLASS).toBeLessThan(8.6)
      for (let r = s + 4; r < track.len; r += 0.2) closest = Math.min(closest, a.distanceTo(track.point(r, b)))
    }
    expect(closest).toBeGreaterThan(2 * GLASS)
  })

  test('posts stand clear of every station', () => {
    expect(course.posts.length).toBeGreaterThan(6)
    for (const post of course.posts)
      for (const f of [site.pick, site.board, own]) expect(post.x > f.x0 && post.x < f.x1 && post.z > f.z0 && post.z < f.z1).toBe(false)
  })
})
