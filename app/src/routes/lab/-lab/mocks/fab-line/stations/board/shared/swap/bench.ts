import { Group, LineBasicMaterial, LineSegments, Mesh, MeshBasicMaterial, MeshStandardMaterial, TorusGeometry } from 'three'
import type { Material, Object3D } from 'three'

import { play } from '../../../../../../kit/sound'
import type { SwapAct, SwapBox, SwapClock, SwapRig, SwapVariant, Tokens } from '../../../../core/contract'
import { kick } from '../../../../core/jolt'
import { box, cyl, mergeEdges, mergeFills, segs } from '../../../../core/three'
import type { Piece } from '../../../../core/three'
import { isDark, ramp } from '../../../../fx/heat'
import { Particles, SPARK } from '../../../../fx/particles'
import { crossed, easeBack, easeIn, easeInOut, easeOut, span, wobble } from './kit'

/** When the new part first shows; every timeline below hands over here. */
const ARRIVE = 0.5
/** Where tools and parts wait out of frame, relative to the part's box. */
const OFF_CPU = { x: -2.6, y: 11, z: -2.6 }
const OFF_MEM = { x: -5, y: 11, z: 0 }
const RAIL = 12

const noHit = () => {}
const lerp = (a: number, b: number, k: number) => a + (b - a) * k
/** Socket hardware fades in as the tech reaches for it and out once it is clamped. */
const fixtureAlpha = (u: number) => span(u, 0, 0.04) * (1 - span(u, 0.965, 1))

function paint(c: Tokens) {
  const fill = (color: string, metal: number, transparent: boolean) =>
    c.flat ? new MeshBasicMaterial({ color, transparent }) : new MeshStandardMaterial({ color, roughness: c.rough, metalness: metal, transparent })
  const p = {
    metal: fill(c.pin, 0.6, true),
    plastic: fill(c.sub, 0, true),
    shell: fill(c.body, 0.3, true),
    tool: fill(c.body, 0.2, false),
    edge: new LineBasicMaterial({ color: c.bodyEdge, transparent: true }),
    toolEdge: new LineBasicMaterial({ color: c.bodyEdge }),
  }
  return { ...p, all: Object.values(p) as Material[], fading: [p.metal, p.plastic, p.shell, p.edge] as Material[] }
}

/** One fill draw and one hairline draw that the pointer ignores, so tools never steal the socket's hover card. */
function solid(pieces: Piece[], fill: Material, edge: LineBasicMaterial) {
  const g = new Group()
  const mesh = new Mesh(mergeFills(pieces), fill)
  const lines = new LineSegments(mergeEdges(pieces), edge)
  mesh.raycast = noHit
  lines.raycast = noHit
  g.add(mesh, lines)
  for (const p of pieces) p.geo.dispose()
  return g
}

function release(root: Object3D, mats: Material[]) {
  root.traverse((o) => { if (o instanceof Mesh || o instanceof LineSegments) o.geometry.dispose() })
  for (const m of mats) m.dispose()
}

function place(g: Object3D, b: SwapBox, dx: number, dy: number, dz: number, show: boolean, yaw = 0, pitch = 0) {
  g.visible = show
  g.position.set(b.x + dx, b.y + dy, b.z + dz)
  g.rotation.set(pitch, yaw, 0)
  g.scale.set(1, 1, 1)
}

/* CPU: lever up, load plate open, vacuum pen out with the old chip, a beat on the bare pins, pen in with the new chip, align, seat, plate and lever clamp. */

const W0 = 1.95, D0 = 1.6

function cpuKit(c: Tokens): SwapRig {
  const p = paint(c)
  const t = 0.05, ox = W0 + 0.18, oz = D0 + 0.18, bx = 0.22, bz = 0.22
  const plate = solid([
    { geo: box(bx, t, oz * 2), at: [-ox + bx / 2, 0, oz] },
    { geo: box(bx, t, oz * 2), at: [ox - bx / 2, 0, oz] },
    { geo: box(ox * 2 - bx * 2, t, bz), at: [0, 0, bz / 2] },
    { geo: box(ox * 2 - bx * 2, t, bz), at: [0, 0, oz * 2 - bz / 2] },
    { geo: box(0.5, t, 0.2), at: [0, 0, oz * 2 + 0.1] },
  ], p.shell, p.edge)
  const arm = oz * 2 + 0.1, shaft = (W0 + 0.32) * 2
  const lever = solid([
    { geo: cyl(0.045, 0.045, arm, 10), at: [0, 0, arm / 2], rot: [Math.PI / 2, 0, 0], threshold: 30 },
    { geo: cyl(0.07, 0.07, 0.45, 10), at: [0.22, 0, arm], rot: [0, 0, Math.PI / 2], threshold: 30 },
    { geo: cyl(0.035, 0.035, shaft, 8), at: [-shaft / 2, 0, 0], rot: [0, 0, Math.PI / 2], threshold: 30 },
    { geo: box(0.3, 0.12, 0.1), at: [-shaft / 2, 0.06, 0.05] },
  ], p.metal, p.edge)
  const pen = solid([
    { geo: cyl(0.1, 0.3, 0.14, 18), at: [0, 0.07, 0], threshold: 30 },
    { geo: cyl(0.045, 0.045, 0.32, 8), at: [0, 0.3, 0], threshold: 30 },
    { geo: cyl(0.13, 0.13, 4.4, 14), at: [0, 0.46 + 2.2, 0], threshold: 30 },
    { geo: cyl(0.17, 0.17, 0.7, 14), at: [0, 1.4, 0], threshold: 30 },
    { geo: box(0.09, 0.14, 0.18), at: [0.17, 2.0, 0] },
    { geo: cyl(0.06, 0.06, 6, 8), at: [0, 4.86 + 3, 0], threshold: 30 },
  ], p.tool, p.toolEdge)
  const pinMat = new LineBasicMaterial({ color: c.pin, transparent: true })
  const pinPts: number[] = []
  for (let x = -W0 + 0.12; x <= W0 - 0.12; x += 0.15)
    for (let z = -D0 + 0.12; z <= D0 - 0.12; z += 0.15) pinPts.push(x, 0.004, z, x + 0.05, 0.05, z - 0.03)
  const pins = new LineSegments(segs(pinPts), pinMat)
  pins.raycast = noHit
  const body = new Group()
  body.add(plate, lever, pins, pen)
  const root = new Group()
  root.name = 'bench.cpu'
  root.add(body)
  body.visible = false
  const fading = [...p.fading, pinMat]
  let on = false

  /** Sizes the socket hardware once per swap from both parts' boxes, so a retarget never resizes an open lever. */
  function fit(fb: SwapBox, tb: SwapBox) {
    const w = Math.max(fb.w, tb.w), d = Math.max(fb.d, tb.d), h = Math.max(fb.h, tb.h)
    const sz = (d + 0.18) / (D0 + 0.18)
    plate.position.set(fb.x, fb.y + h - 0.04, fb.z - (d + 0.18))
    plate.scale.set((w + 0.18) / (W0 + 0.18), 1, sz)
    lever.position.set(fb.x + w + 0.32, fb.y + 0.1, fb.z - d - 0.28)
    lever.scale.set((w + 0.32) / (W0 + 0.32), 1, sz)
    pins.position.set(fb.x, fb.y, fb.z)
    pins.scale.set(Math.min(fb.w, tb.w) / W0, 1, Math.min(fb.d, tb.d) / D0)
  }

  function frame(clock: SwapClock, old: Object3D, next: Object3D) {
    if (!clock.active) { body.visible = false; on = false; return }
    const fb = clock.fromBox ?? clock.toBox, tb = clock.toBox, u = clock.u
    if (!on) { on = true; fit(fb, tb) }
    body.visible = true
    const a = fixtureAlpha(u)
    for (const m of fading) m.opacity = a

    const press = -0.07 * Math.sin(Math.PI * span(u, 0.012, 0.035))
    const leverUp = easeBack(span(u, 0.035, 0.11), 1.1), leverDown = easeIn(span(u, 0.9, 0.95))
    lever.rotation.x = -(1.75 * leverUp * (1 - leverDown) + press - 0.06 * wobble(span(u, 0.95, 1), 2))
    const plateUp = easeOut(span(u, 0.09, 0.19)), plateDown = easeIn(span(u, 0.85, 0.91))
    plate.rotation.x = -1.95 * plateUp * (1 - plateDown) - 0.03 * wobble(span(u, 0.91, 0.97), 2)

    const hOld = fb.h, hNew = tb.h
    let px = OFF_CPU.x, py = OFF_CPU.y, pz = OFF_CPU.z, yaw = 0
    if (u < 0.21) {
      const k = easeOut(span(u, 0.06, 0.21))
      px = lerp(OFF_CPU.x, 0, k); py = lerp(OFF_CPU.y, hOld + 0.35, k); pz = lerp(OFF_CPU.z, 0, k)
    } else if (u < 0.26) {
      px = 0; pz = 0; py = lerp(hOld + 0.35, hOld, easeInOut(span(u, 0.21, 0.25)))
    } else if (u < 0.31) {
      px = 0; pz = 0; py = hOld + 0.16 * easeOut(span(u, 0.26, 0.31))
    } else if (u < ARRIVE) {
      const k = easeIn(span(u, 0.31, 0.45))
      px = lerp(0, OFF_CPU.x, k * k); py = lerp(hOld + 0.16, OFF_CPU.y, k); pz = lerp(0, OFF_CPU.z, k * k)
    } else if (u < 0.66) {
      const k = easeOut(span(u, ARRIVE, 0.66))
      px = lerp(OFF_CPU.x, 0.45, k); py = lerp(OFF_CPU.y, hNew + 0.6, k); pz = lerp(OFF_CPU.z, 0.3, k); yaw = 0.24 * k
    } else if (u < 0.74) {
      const f = 1 - easeBack(span(u, 0.66, 0.74), 2.4)
      px = 0.45 * f; py = hNew + 0.6; pz = 0.3 * f; yaw = 0.24 * f
    } else if (u < 0.8) {
      px = 0; pz = 0; py = lerp(hNew + 0.6, hNew, easeInOut(span(u, 0.74, 0.8)))
    } else if (u < 0.83) {
      px = 0; pz = 0; py = hNew - 0.03 * Math.sin(Math.PI * span(u, 0.8, 0.83))
    } else {
      const k = easeIn(span(u, 0.83, 0.93))
      px = lerp(0, OFF_CPU.x, k * k); py = lerp(hNew, OFF_CPU.y, k); pz = lerp(0, OFF_CPU.z, k * k)
    }
    const base = u < ARRIVE ? fb : tb
    pen.visible = u > 0.06 && u < 0.93
    pen.position.set(base.x + px, base.y + py, base.z + pz)
    pen.rotation.set(-0.24, yaw, 0.2)

    const free = u >= 0.26 && u < 0.31 ? 0.05 * wobble(span(u, 0.26, 0.31), 2) : 0
    if (u >= 0.25 && u < ARRIVE) place(old, fb, px, py - hOld, pz, u < 0.45, 0, free)
    else place(old, fb, 0, 0, 0, u < 0.45)
    if (u < 0.8) place(next, tb, px, py - hNew, pz, u >= ARRIVE, yaw)
    else place(next, tb, 0, 0, 0, true)

    if (crossed(clock, 0.03)) play('tick')
    if (crossed(clock, 0.1)) play('page')
    if (crossed(clock, 0.25)) play('pick')
    if (crossed(clock, 0.8)) play('tick')
    if (crossed(clock, 0.91)) play('page')
    if (crossed(clock, 0.95)) { play('seat'); kick(0.18, 18) }
  }
  return { root, frame, dispose: () => release(root, [...p.all, pinMat]) }
}

/* Memory: DIMM latches flip out and lever the sticks up, a gang vacuum head lifts the old part away, brings the new one, aligns and pushes it home; latches snap shut. */

function latchPieces(out: 1 | -1): Piece[] {
  return [-0.25, 0.25].flatMap((x): Piece[] => [
    { geo: box(0.18, 0.48, 0.12), at: [x, 0.24, 0] },
    { geo: box(0.24, 0.07, 0.22), at: [x, 0.49, out * 0.06] },
    { geo: box(0.12, 0.07, 0.1), at: [x, 0.38, -out * 0.09] },
  ])
}

function memoryKit(c: Tokens): SwapRig {
  const p = paint(c)
  const front = solid(latchPieces(1), p.plastic, p.edge)
  const back = solid(latchPieces(-1), p.plastic, p.edge)
  const headPieces: Piece[] = [
    { geo: box(0.3, 0.2, 3.4), at: [0, 0.45, 0] },
    { geo: cyl(0.1, 0.1, 9, 12), at: [0, 0.55 + 4.5, 0], threshold: 30 },
    { geo: box(0.5, 0.3, 0.5), at: [0, 0.7, 0] },
  ]
  for (const z of [-1.3, 0, 1.3]) headPieces.push({ geo: cyl(0.12, 0.3, 0.12, 16), at: [0, 0.06, z], threshold: 30 }, { geo: cyl(0.04, 0.04, 0.24, 8), at: [0, 0.24, z], threshold: 30 })
  const head = solid(headPieces, p.tool, p.toolEdge)
  const latches = new Group()
  latches.add(front, back)
  const body = new Group()
  body.add(latches, head)
  body.visible = false
  const root = new Group()
  root.name = 'bench.memory'
  root.add(body)

  function frame(clock: SwapClock, old: Object3D, next: Object3D) {
    if (!clock.active) { body.visible = false; return }
    const fb = clock.fromBox ?? clock.toBox, tb = clock.toBox, u = clock.u
    const fromPg = clock.from === 'postgres', toPg = clock.to === 'postgres'
    const pg = fromPg ? fb : toPg ? tb : null
    body.visible = true
    const a = fixtureAlpha(u)
    for (const m of p.fading) m.opacity = a

    latches.visible = pg !== null
    if (pg) {
      front.position.set(pg.x, pg.y + 0.1, pg.z + pg.d + 0.13)
      back.position.set(pg.x, pg.y + 0.1, pg.z - pg.d - 0.13)
      const open = easeBack(span(u, 0.04, 0.12), 1.4)
      const shut = easeBack(toPg ? span(u, 0.815, 0.85) : span(u, 0.47, 0.55), 2)
      const angle = 0.9 * open * (1 - shut)
      front.rotation.x = angle
      back.rotation.x = -angle
    }

    const eject = fromPg ? 0.13 * easeOut(span(u, 0.06, 0.11)) : 0
    const hOld = fb.h + eject, hNew = tb.h
    let hx = OFF_MEM.x, hy = OFF_MEM.y, hz = OFF_MEM.z
    if (u < 0.21) {
      const k = easeOut(span(u, 0.07, 0.21))
      hx = lerp(OFF_MEM.x, 0, k); hy = lerp(OFF_MEM.y, hOld + 0.4, k); hz = 0
    } else if (u < 0.26) {
      hx = 0; hz = 0; hy = lerp(hOld + 0.4, hOld, easeInOut(span(u, 0.21, 0.25)))
    } else if (u < 0.36) {
      const k = span(u, 0.26, 0.36)
      hx = 0; hz = 0; hy = hOld + 2.2 * (fromPg ? easeIn(k) : easeInOut(k))
    } else if (u < ARRIVE) {
      const k = easeIn(span(u, 0.36, 0.47))
      hx = lerp(0, OFF_MEM.x, k); hy = lerp(hOld + 2.2, OFF_MEM.y, k); hz = 0
    } else if (u < 0.66) {
      const k = easeOut(span(u, ARRIVE, 0.66))
      hx = lerp(OFF_MEM.x, 0, k); hy = lerp(OFF_MEM.y, hNew + 1, k); hz = 0.2 * k
    } else if (u < 0.71) {
      hx = 0; hy = hNew + 1; hz = 0.2 * (1 - easeBack(span(u, 0.66, 0.71), 2.4))
    } else if (toPg && u < 0.83) {
      hx = 0; hz = 0
      hy = u < 0.77 ? lerp(hNew + 1, hNew + 0.14, easeOut(span(u, 0.71, 0.77)))
        : u < 0.8 ? hNew + 0.14 - 0.02 * span(u, 0.77, 0.8)
        : lerp(hNew + 0.12, hNew, easeIn(span(u, 0.8, 0.82)))
    } else if (u < 0.83) {
      hx = 0; hz = 0; hy = lerp(hNew + 1, hNew, easeInOut(span(u, 0.71, 0.8)))
    } else {
      const k = easeIn(span(u, 0.83, 0.93))
      hx = lerp(0, OFF_MEM.x * 0.4, k * k); hy = lerp(hNew, OFF_MEM.y, k); hz = 0
    }
    const base = u < ARRIVE ? fb : tb
    head.visible = u > 0.07 && u < 0.93
    head.position.set(base.x + hx, base.y + hy, base.z + hz)

    const landed = toPg ? 0.82 : 0.8
    if (u >= 0.25 && u < ARRIVE) place(old, fb, hx, hy - fb.h, hz, u < 0.47)
    else place(old, fb, 0, eject, 0, u < 0.47)
    if (u < landed) place(next, tb, hx, hy - hNew, hz, u >= ARRIVE)
    else place(next, tb, 0, 0, 0, true)

    if (pg && crossed(clock, 0.05)) play('tick')
    if (crossed(clock, 0.25)) play('pick')
    if (fromPg && !toPg && crossed(clock, 0.55)) play('tick')
    if (toPg && crossed(clock, 0.82)) { play('seat'); kick(0.1, 20) }
    if (!toPg && crossed(clock, 0.8)) play('tick')
  }
  return { root, frame, dispose: () => release(root, p.all) }
}

/* Power: the module tugs free and slides out along bench rails, the new one slides in and hits the connector with a spark; the bay fan, which spun down when power dropped, spins back up. */

const ground = () => 0

/** Fan speed 0..1.25 over the swap: running, spun down once unplugged, back up on reconnect with a little overshoot. */
const fanSpeed = (u: number) => {
  if (u < 0.45) return (1 - span(u, 0.08, 0.45)) ** 2
  if (u < 0.8) return 0
  return 1.25 * easeOut(span(u, 0.8, 0.9)) - 0.25 * span(u, 0.9, 1)
}

function powerKit(c: Tokens): SwapRig {
  const p = paint(c)
  const railPieces: Piece[] = [
    { geo: box(0.16, 0.44, 2.3), at: [0.11, 0.22, 0] },
    { geo: box(0.08, 0.18, 1.1), at: [0.02, 0.2, 0] },
    { geo: box(0.1, 0.55, 0.1), at: [0.62, 0.275, 0] },
  ]
  for (const z of [-1, 1]) railPieces.push({ geo: box(RAIL, 0.1, 0.07), at: [-RAIL / 2, 0.05, z] }, { geo: box(RAIL, 0.025, 0.16), at: [-RAIL / 2, 0.11, z * 0.955] })
  const rails = solid(railPieces, p.metal, p.edge)
  const fanPieces: Piece[] = [
    { geo: new TorusGeometry(0.42, 0.035, 6, 28), rot: [Math.PI / 2, 0, 0], threshold: 40 },
    { geo: cyl(0.12, 0.12, 0.1, 12), threshold: 30 },
  ]
  for (let i = 0; i < 5; i++) {
    const t = (i / 5) * Math.PI * 2
    fanPieces.push({ geo: box(0.32, 0.02, 0.22), at: [Math.cos(t) * 0.25, 0, -Math.sin(t) * 0.25], rot: [0.5, t, 0] })
  }
  const fan = solid(fanPieces, p.metal, p.edge)
  const sparks = new Particles(80, { ...SPARK, streak: 0.09, speck: 0.03 })
  sparks.setGlow(isDark(c))
  sparks.object.visible = false
  const look = ramp(c.spark, c.claude, c.pin)
  const body = new Group()
  body.add(rails, fan)
  body.visible = false
  const root = new Group()
  root.name = 'bench.power'
  root.add(body, sparks.object)
  let on = false, angle = 0, xr = 0, zc = 0

  function frame(clock: SwapClock, old: Object3D, next: Object3D, dt: number) {
    if (sparks.busy || sparks.object.visible) {
      sparks.step(Math.min(dt, 0.05), ground, look)
      sparks.object.visible = sparks.busy
    }
    if (!clock.active) { body.visible = false; on = false; return sparks.busy }
    const fb = clock.fromBox ?? clock.toBox, tb = clock.toBox, u = clock.u
    if (!on) {
      on = true
      xr = Math.max(fb.x + fb.w, tb.x + tb.w)
      zc = (fb.z + tb.z) / 2
      rails.position.set(xr, fb.y, zc)
      rails.scale.set(1, 1, Math.max(fb.d, tb.d) + 0.1)
      fan.position.set(xr + 0.62, fb.y + 0.57, zc)
    }
    body.visible = true
    const a = fixtureAlpha(u)
    for (const m of p.fading) m.opacity = a
    angle = (angle + fanSpeed(u) * 17 * Math.min(dt, 0.05)) % (Math.PI * 2)
    fan.rotation.y = angle

    const tug = -0.16 * easeOut(span(u, 0.05, 0.1))
    place(old, fb, tug - RAIL * easeIn(span(u, 0.12, 0.42)), 0, 0, u < 0.43)
    const slide = u < 0.74 ? lerp(-RAIL, -0.35, easeOut(span(u, 0.48, 0.74))) : lerp(-0.35, 0, easeIn(span(u, 0.74, 0.79)))
    place(next, tb, u < 0.79 ? slide : -0.07 * wobble(span(u, 0.79, 0.88), 2), 0, 0, u >= 0.48)

    if (crossed(clock, 0.79)) {
      const x = xr + 0.06, y = fb.y + 0.46
      for (const z of [zc - 0.4, zc + 0.4]) sparks.burst(32, x, y, z, 0.35, 1.3, 0.55, [2.4, 5.5], 0.9, [0.3, 0.75])
      sparks.object.visible = true
      play('zap')
      kick(0.14, 22)
    }
    if (crossed(clock, 0.05)) play('tick')
    if (crossed(clock, 0.13)) play('drawer')
    if (crossed(clock, 0.5)) play('drawer')
    if (crossed(clock, 0.82)) play('servo')
  }
  return { root, frame, dispose: () => { release(body, p.all); sparks.dispose() } }
}

const act = (rig: (c: Tokens) => SwapRig): SwapAct => ({ duration: 2.6, arrive: ARRIVE, rig })

/** A technician at an ESD bench: socket hardware opens, tools carry the old part out of frame, the new one is aligned and clamped. */
export const bench: SwapVariant = { id: 'bench', label: 'Bench tech', acts: { cpu: act(cpuKit), memory: act(memoryKit), power: act(powerKit) } }
