import { describe, expect, test } from 'bun:test'
import { PerspectiveCamera, Vector3 } from 'three'

import { BUILTIN } from '../../world/slots'
import { createCam, goTo, takeShot } from '../camera'
import type { Cam } from '../camera'
import type { Part, Rig, Sim, ViewTool } from '../contract'
import { lineOf } from '../line'

const rig: Rig = { layout: BUILTIN.layout[0], cabinet: BUILTIN.cabinet[0], table: BUILTIN.table[0], transport: BUILTIN.transport[0], board: BUILTIN.board[0], integrator: BUILTIN.integrator[0] }
const WIDE = { width: 1440, height: 900 }
const TALL = { width: 390, height: 844 }

function part(mode: Part['mode'], extra: Partial<Part> = {}): Part {
  return { item: { ref: 'p1' }, spec: { pkg: 'qfn', w: 0.5, d: 0.5, h: 0.1, lead: 0, fw: 0.5, fd: 0.5, c: 0 }, pos: new Vector3(4, 1, 0), scale: 1, mode, fly: null, slot: { x: 0, y: 0, z: 0, s: 1 }, drawn: 1, flash: 0, ...extra } as Part
}
/** A line at sim time 10 whose last added part is `p`, wanted unless `wanted` is false. */
function scene(p: Part | null = null, { wanted = true, working = false } = {}) {
  const sim = {
    time: 10, addSeq: 0, latest: p, line: lineOf(rig), rig, at: lineOf(rig).at,
    parts: new Map(p ? [[p.item.ref, p]] : []), wanted: new Set(p && wanted ? [p.item.ref] : []),
    work: { job: working && p ? { part: p, t: 0.5, dur: 2 } : null, queue: [] }, feed: [], carried: [], removals: [], arm: { holding: null },
  } as unknown as Sim
  const cam = createCam()
  cam.follow = 'chase'
  return { sim, cam }
}
const shotOf = (cam: Cam, sim: Sim, size = WIDE) => takeShot(cam, sim, size, 1 / 60).shot.id
const cctv: ViewTool = { id: 'cctv.feed', label: 'CCTV', kind: 'view', shot: (_, out) => void out.pos.set(0, 9, 9) }

describe('camera shots', () => {
  test('with nothing going on the camera frames the whole line, top to bottom on a portrait canvas', () => {
    const { sim, cam } = scene()
    expect([shotOf(cam, sim, WIDE), shotOf(cam, sim, TALL)]).toEqual(['overview', 'portrait'])
  })

  test('a picked stop frames that stop; a stop the line no longer has falls through to the overview', () => {
    const { sim, cam } = scene()
    goTo(cam, { kind: 'stop', id: 'table' })
    const table = shotOf(cam, sim)
    goTo(cam, { kind: 'stop', id: 'gone' })
    expect([table, shotOf(cam, sim)]).toEqual(['stop', 'overview'])
  })

  test('the aisle focus waits while the user holds a free camera, and takes it after the next add', () => {
    const { sim, cam } = scene()
    goTo(cam, { kind: 'free', look: new Vector3(), az: 0.6, el: 0.6, dist: 40 })
    cam.manual = true
    cam.aisleUntil = sim.time + 2
    const held = shotOf(cam, sim)
    cam.manual = false
    expect([held, shotOf(cam, sim)]).toEqual(['free', 'aisle'])
  })

  test('a part on its way is chased or ridden a beat after the last press, never with follow off', () => {
    const { sim, cam } = scene(part('carried'))
    cam.touched = sim.time - 0.5
    const pressing = shotOf(cam, sim)
    cam.touched = -99
    const chase = shotOf(cam, sim)
    cam.follow = 'ride'
    const ride = shotOf(cam, sim)
    cam.follow = 'off'
    expect([pressing, chase, ride, shotOf(cam, sim)]).toEqual(['overview', 'chase', 'ride', 'overview'])
  })

  test('a part sent back is not followed', () => {
    const { sim, cam } = scene(part('carried'), { wanted: false })
    expect(shotOf(cam, sim)).toBe('overview')
  })

  test('a seated part holds the camera while its trace draws or the integrator works it, then lets go', () => {
    const drawing = scene(part('seated', { drawn: 0.4 }))
    const working = scene(part('seated'), { working: true })
    const done = scene(part('seated'))
    expect([shotOf(drawing.cam, drawing.sim), shotOf(working.cam, working.sim), shotOf(done.cam, done.sim)]).toEqual(['seated', 'seated', 'overview'])
  })

  test('a mod view outranks follow shots, and a chip close-up outranks the mod view', () => {
    const { sim, cam } = scene(part('carried'))
    goTo(cam, { kind: 'mod', tool: cctv, variant: null, since: 0 })
    const view = shotOf(cam, sim)
    const seated = part('seated', { item: { ref: 'p2' } as Part['item'] })
    sim.parts.set('p2', seated)
    cam.focusRef = 'p2'
    expect([view, shotOf(cam, sim)]).toEqual(['view', 'chip'])
  })

  test('a mod view hides the themes\' labels, as a close-up does', () => {
    const { sim, cam } = scene()
    goTo(cam, { kind: 'mod', tool: cctv, variant: null, since: 0 })
    takeShot(cam, sim, WIDE, 1 / 60)
    expect({ mode: cam.mode, closeUp: cam.closeUp }).toEqual({ mode: 'view', closeUp: true })
  })
})

describe('framed shots', () => {
  test('the overview sits between the chrome on every side', () => {
    const { sim, cam } = scene()
    cam.insets = { top: 100, right: 16, bottom: 300, left: 80 }
    const { want } = takeShot(cam, sim, WIDE, 1 / 60)
    const eye = new PerspectiveCamera(want.fov, WIDE.width / WIDE.height, 0.2, 600)
    eye.position.copy(want.pos)
    eye.lookAt(want.look)
    eye.updateMatrixWorld()
    const px = sim.line.all.map((p) => p.clone().project(eye)).map((q) => [((q.x + 1) / 2) * WIDE.width, ((1 - q.y) / 2) * WIDE.height])
    const r = (n: number) => Math.round(n)
    const box = { x0: r(Math.min(...px.map((q) => q[0]))), x1: r(Math.max(...px.map((q) => q[0]))), y0: r(Math.min(...px.map((q) => q[1]))), y1: r(Math.max(...px.map((q) => q[1]))) }
    expect({ left: box.x0 >= 80, right: box.x1 <= WIDE.width - 16, top: box.y0 >= 100, bottom: box.y1 <= WIDE.height - 300 }).toEqual({ left: true, right: true, top: true, bottom: true })
  })
})
