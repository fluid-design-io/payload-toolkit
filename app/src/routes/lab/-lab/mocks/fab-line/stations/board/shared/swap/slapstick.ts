import {
  BufferGeometry, Color, DoubleSide, EdgesGeometry, Float32BufferAttribute, Group, LineSegments, Mesh, MeshBasicMaterial,
  MeshStandardMaterial, SphereGeometry, Vector3,
} from 'three'
import type { Material } from 'three'

import { play } from '../../../../../../kit/sound'
import type { SoundName } from '../../../../../../kit/sound'
import type { SocketKind, SwapBox, SwapClock, SwapRig, SwapVariant, Tokens } from '../../../../core/contract'
import { kick } from '../../../../core/jolt'
import { lineMat } from '../../../../core/three'
import { isDark } from '../../../../fx/heat'
import type { Ramp } from '../../../../fx/heat'
import { DUST, Particles, SPARK } from '../../../../fx/particles'
import { crossed, easeBack, easeIn, easeInOut, easeOut, every, span, wobble } from './kit'

/** Beats as fractions of the swap. The parachute shows high up while the old part is still sailing off. */
const LAUNCH = 0.15
const GONE = 0.44
const ARRIVE = 0.38
const OPEN = 0.45
const TOUCH = 0.75
/** Share of the exit window spent winding up before the launch. */
const WIND = LAUNCH / GONE

/** A part's pose relative to its resting box: offset, Euler rotation and scale about the pivot `p*` (rest frame, from the box's bottom centre). */
type Pose = { x: number; y: number; z: number; rx: number; ry: number; rz: number; sx: number; sy: number; sz: number; px: number; py: number; pz: number }

type Fx = { sparks: Particles; dust: Particles }

/** One window of the swap: the clock, the box it plays on, the pose it writes and the effects it may fire. */
class Stage {
  p: Pose = { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1, px: 0, py: 0, pz: 0 }
  b: SwapBox = { x: 0, y: 0, z: 0, w: 1, d: 1, h: 1 }
  a = 0
  z = 1
  /** The running swap's clock, set each frame. */
  clock!: SwapClock
  constructor(readonly fx: Fx) {}
  open(b: SwapBox, a: number, z: number) {
    const p = this.p
    p.x = p.y = p.z = p.rx = p.ry = p.rz = p.px = p.py = p.pz = 0
    p.sx = p.sy = p.sz = 1
    this.b = b
    this.a = a
    this.z = z
    return this
  }
  get k() { return span(this.clock.u, this.a, this.z) }
  /** Seconds since the window opened. */
  get t() { return Math.max(0, this.clock.u - this.a) * this.clock.dur }
  get dt() { return Math.max(0, this.clock.u - this.clock.prev) * this.clock.dur }
  hit(k: number) { return crossed(this.clock, this.a + k * (this.z - this.a)) }
  /** Volume-kept squash (< 1) or stretch (> 1) along y. */
  squash(s: number) {
    const q = 1 / Math.sqrt(s)
    this.p.sy *= s
    this.p.sx *= q
    this.p.sz *= q
  }
  /** A loose lid: tilts and hops at a few hertz, growing with `k`. */
  rattle(k: number) {
    const t = this.t, p = this.p
    this.centre()
    p.rx += 0.07 * k * Math.sin(t * 2 * Math.PI * 9)
    p.rz += 0.07 * k * Math.cos(t * 2 * Math.PI * 7)
    p.y += 0.12 * k * Math.abs(Math.sin(t * 2 * Math.PI * 6))
  }
  shake(amount: number) {
    const t = this.t
    this.p.x += Math.sin(t * 151) * amount
    this.p.z += Math.sin(t * 127 + 1.3) * amount
  }
  /** Rotate and scale about the box centre rather than its bottom. */
  centre() { this.p.py = this.b.h / 2 }
  /** About `n` specks a second from the box's rim at height `y`, flung outward. */
  spray(pool: Particles, n: number, y: number, out: number, rise: number) {
    const { b, p } = this
    for (let left = n * this.dt; left > 0; left--) {
      if (left < 1 && Math.random() > left) break
      const a = Math.random() * Math.PI * 2, cs = Math.cos(a), sn = Math.sin(a)
      pool.emit(b.x + p.x + cs * b.w, b.y + p.y + y, b.z + p.z + sn * b.d, cs * out, rise * (0.5 + Math.random()), sn * out, 0.4 + Math.random() * 0.5)
    }
  }
  ring(n: number, speed: number) {
    const { b, p } = this
    this.fx.dust.burst(n, b.x + p.x, b.y + 0.04, b.z + p.z, 0, 0.12, 0, [speed * 0.5, speed], 1, [0.5, 1])
  }
}

/** A leaving part's whole act: `wind` 0..1 winds up, then `fly` 0..1 carries it out of frame. */
type Exit = { sound: SoundName; act: (s: Stage, wind: number, fly: number) => void }
/** An arriving part's touchdown: the impact squash, then its own settle. `drift` is where it touches down, off the socket in x, for a gag that slides home. */
type Land = { kick: number; squash: number; lobes: number; drift?: number; sound?: SoundName; settle?: (s: Stage) => void }

/** The CPU rattles hot in its socket, pops, and glides off flat and spinning like a frisbee. */
const frisbee: Exit = {
  sound: 'zap',
  act(s, wind, fly) {
    const p = s.p
    if (!fly) {
      s.rattle(wind)
      if (wind > 0.3) s.spray(s.fx.sparks, 60 * wind, s.b.h, 1.5, 2)
      return
    }
    s.centre()
    s.squash(1 + 0.5 * (1 - fly) ** 4)
    p.x = 4 * fly
    p.z = -9 * fly
    p.y = 7 * fly * (1.5 - fly)
    p.ry = 5 * Math.PI * easeOut(fly)
    p.rx = -0.4 * easeOut(fly)
    p.rz = 0.25 * Math.sin(fly * Math.PI)
  },
}

/** The DIMM pair leans back, then cartwheels away over the board like one wheel. */
const cartwheel: Exit = {
  sound: 'toss',
  act(s, wind, fly) {
    const p = s.p
    if (!fly) {
      p.pz = -s.b.d
      p.rx = -0.25 * easeOut(wind) + Math.sin(s.t * 40) * 0.025 * wind
      s.squash(1 - 0.12 * wind)
      return
    }
    s.centre()
    p.rx = -0.25 - 3 * Math.PI * fly
    p.z = -11 * fly
    p.y = 1.6 * Math.abs(Math.sin(fly * Math.PI * 2)) * (1 - fly) + 6 * fly ** 3
  },
}

/** The NAND stacks crouch, spring up tall and wobble on the spring, then shoot out of the top. */
const jack: Exit = {
  sound: 'chirp',
  act(s, wind, fly) {
    const p = s.p
    if (!fly) {
      s.squash(1 - 0.5 * easeOut(wind))
      s.shake(0.04 * wind)
      return
    }
    const boing = span(fly, 0, 0.5), lift = span(fly, 0.45, 1)
    s.squash(0.5 + 1.9 * easeOut(span(boing, 0, 0.2)) + 0.5 * wobble(span(boing, 0.2, 1), 4) - 0.6 * lift)
    p.rz = 0.14 * Math.sin(boing * 14) * (1 - lift)
    p.y = 12 * lift ** 1.6
    p.ry = 2 * Math.PI * easeIn(lift)
  },
}

/** The pnpm row is a skateboard: tail press, pop, kickflip and away. */
const kickflip: Exit = {
  sound: 'pick',
  act(s, wind, fly) {
    const p = s.p
    if (!fly) {
      p.px = s.b.w
      p.rz = -0.3 * easeBack(wind)
      s.shake(0.015 * wind)
      return
    }
    s.centre()
    p.x = 3 * fly
    p.z = -6 * fly
    p.y = 0.7 + 8 * fly - 2 * fly * fly
    p.rx = 2 * Math.PI * easeInOut(span(fly, 0.05, 0.6))
    p.rz = -0.3 * (1 - fly)
    p.ry = 0.5 * Math.PI * easeOut(fly)
  },
}

/** The npm heatsink rumbles in its smoke, then lifts off on a column of sparks. */
const rocket: Exit = {
  sound: 'zap',
  act(s, wind, fly) {
    const p = s.p
    if (!fly) {
      s.shake(0.07 * wind * wind)
      s.squash(1 - 0.12 * wind)
      s.spray(s.fx.dust, 120 * wind, 0.05, 1.6, 0.4)
      return
    }
    s.squash(1.15)
    p.y = 14 * fly * fly
    p.rz = 0.05 * Math.sin(s.t * 30) * (1 - fly)
    const { b } = s
    for (let left = 300 * s.dt; left > 0; left--) {
      if (left < 1 && Math.random() > left) break
      s.fx.sparks.emit(b.x + (Math.random() - 0.5) * b.w, b.y + p.y, b.z + (Math.random() - 0.5) * b.d, (Math.random() - 0.5) * 2, -3 - Math.random() * 4, (Math.random() - 0.5) * 2, 0.3 + Math.random() * 0.4)
    }
  },
}

/** The bun stage spins up like pizza dough and is tossed, spinning and flattening, out of frame. */
const dough: Exit = {
  sound: 'toss',
  act(s, wind, fly) {
    const p = s.p
    s.centre()
    p.ry = 2 * Math.PI * (fly ? 1 + 3.5 * fly : wind * wind)
    const tilt = fly ? 0.2 * Math.sin(fly * 9) : 0.1 * wind
    p.rx = tilt * Math.cos(p.ry * 0.5)
    p.rz = tilt * Math.sin(p.ry * 0.5)
    if (!fly) {
      s.squash(1 - 0.2 * wind)
      return
    }
    s.squash(1 - 0.45 * easeOut(fly))
    p.x = -4 * fly
    p.z = -2 * fly
    p.y = 5 * fly + 5 * fly * fly
  },
}

const EXITS: Record<string, Exit> = { next: frisbee, tanstack: frisbee, postgres: cartwheel, mongodb: jack, pnpm: kickflip, npm: rocket, bun: dough }

const RATTLE = [0.3, 0.5, 0.63, 0.73, 0.81, 0.87]

/** A dropped coin settling: the wobble shrinks while it speeds up, with a rising rattle. */
const coin: Land = {
  kick: 0.25, squash: 0.25, lobes: 3,
  settle(s) {
    const k = span(s.k, 0.08, 1)
    const tilt = 0.15 * (1 - k) ** 1.5
    const spin = 2 * Math.PI * (2 * k + 5 * k * k)
    s.p.rx = tilt * Math.cos(spin)
    s.p.rz = tilt * Math.sin(spin)
    s.p.y += Math.sin(tilt) * Math.max(s.b.w, s.b.d) * 0.9
    for (let i = 0; i < RATTLE.length; i++) if (s.hit(0.08 + RATTLE[i] * 0.92)) play('tick')
  },
}

/** The DIMMs rock in their slots and click home. */
const clip: Land = {
  kick: 0.25, squash: 0.3, lobes: 3,
  settle(s) {
    s.p.rz = 0.2 * wobble(span(s.k, 0.05, 0.75), 3)
    if (s.hit(0.62)) {
      play('pick')
      kick(0.1)
    }
  },
}

const spring: Land = { kick: 0.2, squash: 0.5, lobes: 5, sound: 'chirp' }

/** Lands a step off its socket and skids home in a dust trail. */
const skid: Land = {
  kick: 0.3, squash: 0.3, lobes: 2, drift: 1.4, sound: 'drawer',
  settle(s) {
    const k = span(s.k, 0, 0.6)
    s.p.x = 1.4 * (1 - easeOut(k))
    s.p.rz = -0.05 * wobble(s.k, 2)
    if (k < 1) s.spray(s.fx.dust, 120 * (1 - k), 0.05, 0.8, 0.3)
  },
}

const thud: Land = { kick: 0.55, squash: 0.45, lobes: 2, settle: (s) => { if (s.hit(0)) s.ring(40, 5) } }

/** Lands spinning like a top, precesses and winds down. */
const top: Land = {
  kick: 0.25, squash: 0.25, lobes: 2, sound: 'servo',
  settle(s) {
    s.centre()
    const k = s.k
    s.p.ry = 6 * Math.PI * easeOut(k)
    const tilt = 0.14 * Math.sin(Math.PI * Math.min(1, k * 1.3)) * (1 - k)
    s.p.rx = tilt * Math.cos(s.p.ry * 0.6)
    s.p.rz = tilt * Math.sin(s.p.ry * 0.6)
    if (s.hit(0.45)) play('servo')
  },
}

const LANDS: Record<string, Land> = { next: coin, tanstack: coin, postgres: clip, mongodb: spring, pnpm: skid, npm: thud, bun: top }

const V = new Vector3()
/** Writes a pose onto a part's group, which pivots on its box's bottom centre at rest. */
function place(g: Group, b: SwapBox, p: Pose) {
  g.rotation.set(p.rx, p.ry, p.rz)
  g.scale.set(p.sx, p.sy, p.sz)
  V.set(p.px, p.py, p.pz).multiply(g.scale).applyEuler(g.rotation)
  g.position.set(b.x + p.x + p.px - V.x, b.y + p.y + p.py - V.y, b.z + p.z + p.pz - V.z)
}

const GORES = 10
/** The canopy trails behind its load, away from the camera, so it never covers the part's face. */
const TRAIL = 1.6
const RIM = Array.from({ length: 8 }, (_, i) => (i + 0.5) * (Math.PI / 4))

/** The striped canopy, its shrouds and two particle pools. */
function build() {
  const dome = new SphereGeometry(1, GORES, 3, 0, Math.PI * 2, 0, Math.PI / 2).toNonIndexed()
  const gores = new EdgesGeometry(dome, 1)
  const at = dome.getAttribute('position')
  const stripe = new Uint8Array(at.count)
  for (let v = 0; v < at.count; v += 3) {
    const x = at.getX(v) + at.getX(v + 1) + at.getX(v + 2), z = at.getZ(v) + at.getZ(v + 1) + at.getZ(v + 2)
    stripe[v] = stripe[v + 1] = stripe[v + 2] = Math.floor(((Math.atan2(-z, x) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2 / GORES)) % 2
  }
  dome.setAttribute('color', new Float32BufferAttribute(new Float32Array(at.count * 3), 3))
  const flat = new MeshBasicMaterial({ side: DoubleSide, vertexColors: true })
  const lit = new MeshStandardMaterial({ side: DoubleSide, vertexColors: true })
  const cloth = new Mesh<BufferGeometry, Material>(dome, flat)
  const seams = new LineSegments(gores)
  const canopy = new Group()
  canopy.add(cloth, seams)
  const cords = new BufferGeometry()
  cords.setAttribute('position', new Float32BufferAttribute(new Float32Array(RIM.length * 6), 3))
  const shrouds = new LineSegments(cords)
  shrouds.frustumCulled = false
  const sparks = new Particles(300, SPARK)
  const dust = new Particles(260, DUST)
  // three raycasts hidden objects too, so the drawn props never take the pointer.
  for (const o of [cloth, seams, shrouds, sparks.object, dust.object]) o.raycast = () => {}
  canopy.visible = shrouds.visible = sparks.object.visible = dust.object.visible = false
  const ramp = (): Ramp => ({ hot: new Color(), warm: new Color(), cold: new Color() })
  return { dome, stripe, gores, flat, lit, cloth, seams, canopy, cords, shrouds, fx: { sparks, dust }, hot: ramp(), haze: ramp() }
}

type Props = ReturnType<typeof build>
const C = [new Color(), new Color()]

function paint(r: Props, c: Tokens) {
  C[0].set(c.surface)
  C[1].set(c.accent)
  const col = r.dome.getAttribute('color')
  for (let v = 0; v < col.count; v++) col.setXYZ(v, C[r.stripe[v]].r, C[r.stripe[v]].g, C[r.stripe[v]].b)
  col.needsUpdate = true
  r.lit.roughness = c.rough
  r.cloth.material = c.flat ? r.flat : r.lit
  r.seams.material = lineMat(c.bodyEdge)
  r.shrouds.material = lineMat(c.edge)
  r.fx.sparks.setGlow(isDark(c))
  r.hot.hot.set(c.spark); r.hot.warm.set(c.lit); r.hot.cold.set(c.dim)
  r.haze.hot.set(c.muted); r.haze.warm.set(c.edge); r.haze.cold.set(c.dim)
}

const floor = () => 0

/** The canopy and particles are built once per socket and theme; the stage's clock is the socket's, set each frame. */
function rig(c: Tokens, kind: SocketKind): SwapRig {
  const r = build()
  const stage = new Stage(r.fx)
  paint(r, c)
  const root = new Group()
  root.name = `slapstick.${kind}`
  root.add(r.canopy, r.shrouds, r.fx.sparks.object, r.fx.dust.object)
  return {
    root,
    frame(clock, old, next, delta) {
      stage.clock = clock
      return tick(r, stage, clock, old, next, delta)
    },
    dispose() {
      r.dome.dispose(); r.gores.dispose(); r.flat.dispose(); r.lit.dispose(); r.cords.dispose()
      r.fx.sparks.dispose(); r.fx.dust.dispose()
    },
  }
}

/** One frame: pose the swap while it runs, step particles, and say whether lingering particles need another frame. */
function tick(r: Props, stage: Stage, clock: SwapClock, old: Group, next: Group, delta: number) {
  const { sparks, dust } = r.fx
  if (clock.active) {
    act(r, stage, clock, old, next)
  } else r.canopy.visible = r.shrouds.visible = false
  const dt = Math.min(delta, 0.05)
  if (clock.active || sparks.busy) sparks.step(dt, floor, r.hot)
  if (clock.active || dust.busy) dust.step(dt, floor, r.haze)
  sparks.object.visible = sparks.busy
  dust.object.visible = dust.busy
  return !clock.active && (sparks.busy || dust.busy)
}

function act(r: Props, stage: Stage, clock: SwapClock, old: Group, next: Group) {
  const u = clock.u
  if (clock.from && clock.fromBox) {
    old.visible = u < GONE
    const exit = EXITS[clock.from] ?? frisbee
    const s = stage.open(clock.fromBox, 0, GONE)
    if (s.hit(WIND)) {
      play('toss')
      if (exit.sound !== 'toss') play(exit.sound)
      s.ring(24, 3)
      if (exit === rocket) kick(0.3)
    }
    if (old.visible) {
      const k = s.k
      exit.act(s, span(k, 0, WIND), span(k, WIND, 1))
      place(old, clock.fromBox, s.p)
    }
  }
  descend(r, stage, clock, next)
}

/**
 * The new part swings face-up under a canopy that trails behind it, away from the camera. It touches down and settles while the canopy collapses and a gust
 * carries it off.
 */
function descend(r: Props, s: Stage, clock: SwapClock, next: Group) {
  const u = clock.u, b = clock.toBox
  const land = LANDS[clock.to] ?? spring
  next.visible = u >= ARRIVE
  r.canopy.visible = next.visible
  if (!next.visible) return
  const radius = Math.max(1.2, Math.hypot(b.w, b.d) * 0.72)
  const cord = 2.4 + radius * 0.5
  const drift = land.drift ?? 0
  if (u < TOUCH) {
    s.open(b, ARRIVE, TOUCH)
    if (s.hit((OPEN - ARRIVE) / (TOUCH - ARRIVE))) play('page')
    const fall = span(u, ARRIVE, OPEN), sway = span(u, OPEN, TOUCH)
    const height = sway ? 7 * (1 - sway) ** 1.15 : 13 - 6 * easeIn(fall)
    const swing = 0.2 * Math.sin(sway * Math.PI * 3.4) * (1 - sway) ** 1.5
    next.rotation.set(0.3 * swing * Math.cos(sway * 7), 0, swing)
    next.scale.set(1, 1, 1)
    V.set(0, -(cord + b.h), 0).applyEuler(next.rotation)
    const cx = b.x + drift + 1.8 * (1 - sway) ** 2, cy = b.y + height + cord + b.h, cz = b.z
    next.position.set(cx + V.x, cy + V.y, cz + V.z)
    const open = easeBack(fall, 2.2)
    r.canopy.position.set(cx, cy, cz - TRAIL)
    r.canopy.rotation.set(next.rotation.x - 0.35, 0, next.rotation.z)
    r.canopy.scale.set(radius * (0.3 + 0.7 * open), radius * 0.6 * (0.3 + 0.7 * open), radius * (0.3 + 0.7 * open))
    r.shrouds.visible = true
  } else {
    s.open(b, TOUCH, 1)
    if (s.hit(0)) {
      play('seat')
      if (land.sound) play(land.sound)
      kick(land.kick)
      s.ring(30, 3.5)
    }
    land.settle?.(s)
    s.squash(1 - land.squash * wobble(span(s.k, 0, 0.6), land.lobes))
    place(next, b, s.p)
    const sag = span(s.k, 0, 0.4), gust = span(s.k, 0.4, 1)
    const flutter = 0.12 * Math.sin(s.t * 26) * (1 - gust)
    r.canopy.position.set(
      b.x + drift + 0.8 * sag + 7 * easeIn(gust),
      b.y + b.h + cord - (cord - 1.6) * easeOut(sag) + 5 * easeIn(gust),
      b.z - TRAIL - 0.8 * sag - 5 * easeIn(gust),
    )
    r.canopy.rotation.set(-0.35 - 0.3 * sag - 2 * easeIn(gust), 0, -0.4 * sag - 3 * easeIn(gust))
    const wide = radius * (1 + 0.15 * sag + flutter) * (1 - 0.6 * gust)
    r.canopy.scale.set(wide, radius * 0.6 * (1 - 0.8 * sag) * (1 - 0.6 * gust) + 0.01, radius * (1 + 0.15 * sag - flutter) * (1 - 0.6 * gust))
    r.shrouds.visible = sag < 0.9
  }
  if (r.shrouds.visible) tether(r, next, b)
}

/** Strings each canopy rim point to the nearest top corner of the hanging part. */
function tether(r: Props, next: Group, b: SwapBox) {
  r.canopy.updateMatrix()
  next.updateMatrix()
  const pos = r.cords.getAttribute('position')
  const a = pos.array as Float32Array
  for (let i = 0; i < RIM.length; i++) {
    const cs = Math.cos(RIM[i]), sn = Math.sin(RIM[i])
    V.set(cs, 0, sn).applyMatrix4(r.canopy.matrix)
    a[i * 6] = V.x; a[i * 6 + 1] = V.y; a[i * 6 + 2] = V.z
    V.set(Math.sign(cs) * b.w * 0.9, b.h, Math.sign(sn) * b.d * 0.9).applyMatrix4(next.matrix)
    a[i * 6 + 3] = V.x; a[i * 6 + 4] = V.y; a[i * 6 + 5] = V.z
  }
  pos.needsUpdate = true
}

/** Every part leaves with a gag (a frisbee, a cartwheel, a kickflip) and the new one floats down under a striped parachute. */
export const slapstick: SwapVariant = { id: 'slapstick', label: 'Slapstick', acts: every({ duration: 2.6, arrive: ARRIVE, rig }) }
