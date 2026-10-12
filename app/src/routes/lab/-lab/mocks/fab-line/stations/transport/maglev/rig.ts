import {
  AdditiveBlending, BoxGeometry, BufferAttribute, BufferGeometry, Color, DoubleSide, DynamicDrawUsage, InstancedMesh, LineBasicMaterial, Matrix4, Mesh,
  MeshBasicMaterial, NormalBlending, TorusGeometry, Vector3,
} from 'three'

import type { Part } from '../../../core/contract'
import { box, clamp } from '../../../core/three'
import type { Piece } from '../../../core/three'
import { Glows } from '../../../fx/glow'
import { Particles, SPARK } from '../../../fx/particles'
import { Batch, tintMat } from '../fleet'
import { sweepBox, yawOf } from '../kit'
import { BEAM, DOCK, BAY, GAP, GATE, SLED, cruiseAt, frameAt, pointAt } from './course'
import type { Course } from './course'

const v = { a: new Vector3(), b: new Vector3(), t: new Vector3(), u: new Vector3(), s: new Vector3(), p: new Vector3() }
const m4 = new Matrix4()

/** Top centre of the guideway under a floating part at `s`: the sled and the hover gap below cruise height. */
function beamTop(c: Course, s: number, out: Vector3) {
  pointAt(c, s, out)
  return out.setY(cruiseAt(c, s) - SLED.h - GAP)
}

/** The guideway: a box section swept along the course and rolled by its bank, half a sled past both ends. */
function sweepBeam(c: Course) {
  const samples: number[] = [-0.7]
  for (let s = 0; s < c.len; s += 0.18) samples.push(s)
  samples.push(c.len, c.len + 0.7)
  return sweepBox(samples.length, (i, f) => {
    const s = samples[i]
    const sc = clamp(s, 0, c.len)
    beamTop(c, sc, f.p)
    if (s !== sc) f.p.addScaledVector(frameAt(c, 'tan', sc, v.t).setY(0).normalize(), s - sc)
    frameAt(c, 'up', sc, f.up)
    frameAt(c, 'side', sc, f.side)
  }, { w: BEAM.w, y0: -BEAM.h, y1: 0 }, { smooth: true })
}

/** Everything static: the swept guideway, its pylons, the dock and bay plinths and the coil rings' feet. */
export function guidewayPieces(c: Course): Piece[] {
  const pieces: Piece[] = [{ geo: sweepBeam(c), threshold: 24 }]
  const under = cruiseAt(c, 0) - SLED.h - GAP - BEAM.h
  pieces.push({ geo: box(1.9, under, 1.4), at: [DOCK.x - 0.15, under / 2, DOCK.z] })
  pieces.push({ geo: box(1.7, under, 1.4), at: [BAY.x - 0.25, under / 2, BAY.z] })
  for (let s = 2.2; s < c.len - 2; s += 4.2) {
    beamTop(c, s, v.p)
    frameAt(c, 'up', s, v.u)
    v.p.addScaledVector(v.u, -BEAM.h)
    if (v.p.y < 0.5) continue
    pieces.push({ geo: box(0.24, v.p.y, 0.24), at: [v.p.x, v.p.y / 2, v.p.z] }, { geo: box(0.6, 0.06, 0.6), at: [v.p.x, 0.03, v.p.z] })
  }
  for (const s of c.gates) {
    gateCentre(c, s, v.p)
    frameAt(c, 'tan', s, v.t)
    const h = Math.max(0.05, v.p.y - GATE.r + 0.02)
    pieces.push({ geo: box(0.26, h, 1.0), at: [v.p.x, h / 2, v.p.z], rot: [0, yawOf(v.t), 0] })
  }
  return pieces
}

function gateCentre(c: Course, s: number, out: Vector3) {
  pointAt(c, s, out).setY(cruiseAt(c, s))
  return out.addScaledVector(frameAt(c, 'up', s, v.u), GATE.lift)
}

/** A matrix whose x, y and z axes are `x`, `y`, `z` scaled by `k`, at `at`. */
function placed(out: Matrix4, at: Vector3, x: Vector3, y: Vector3, z: Vector3, k: Vector3) {
  return out.makeBasis(x, y, z).scale(k).setPosition(at)
}

export type Sled = {
  state: 'free' | 'ride' | 'fade'
  part: Part | null
  s: number
  prev: number
  v: number
  /** Presence: 0 sunk into the dock or faded, 1 floating. */
  k: number
  pos: Vector3
  yaw: number
  t0: number
  lifted: boolean
  arrived: boolean
}

/** The two ribbons of a trail: one standing on the banked up, one lying along the side, and their half widths. */
const RIBBONS = [['up', 0.15], ['side', 0.24]] as const

/** A cross of two ribbons per trail, drawn as one mesh with per-vertex alpha. */
export class Trails {
  readonly mesh: Mesh
  readonly samples = 18
  private readonly pos: Float32Array
  private readonly col: Float32Array
  private readonly geo: BufferGeometry
  private readonly mat: MeshBasicMaterial
  private strips = 0
  private readonly cap: number
  private readonly c = new Color()

  constructor(trails: number) {
    this.cap = trails * 2
    const M = this.samples
    this.pos = new Float32Array(this.cap * M * 2 * 3)
    this.col = new Float32Array(this.cap * M * 2 * 4)
    const idx: number[] = []
    for (let k = 0; k < this.cap; k++)
      for (let j = 0; j < M - 1; j++) {
        const a = (k * M + j) * 2
        idx.push(a, a + 1, a + 3, a, a + 3, a + 2)
      }
    this.geo = new BufferGeometry()
    this.geo.setAttribute('position', new BufferAttribute(this.pos, 3).setUsage(DynamicDrawUsage))
    this.geo.setAttribute('color', new BufferAttribute(this.col, 4).setUsage(DynamicDrawUsage))
    this.geo.setIndex(idx)
    this.mat = new MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: DoubleSide, toneMapped: false })
    this.mesh = new Mesh(this.geo, this.mat)
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = 3
  }

  setGlow(additive: boolean) {
    const b = additive ? AdditiveBlending : NormalBlending
    if (this.mat.blending !== b) { this.mat.blending = b; this.mat.needsUpdate = true }
  }

  begin() { this.strips = 0 }

  /** A trail `len` long behind distance `s`, `h` above the path, fading from `head` to `tail` and away near `eye`, so a ride camera never sits inside it. */
  add(course: Course, s: number, len: number, h: number, alpha: number, head: Color, tail: Color, eye: Vector3) {
    if (this.strips + 2 > this.cap || alpha <= 0.01) return
    const M = this.samples
    for (const [axis, w] of RIBBONS) {
      const k = this.strips++
      for (let j = 0; j < M; j++) {
        const f = j / (M - 1)
        const sj = Math.max(0, s - len * f)
        pointAt(course, sj, v.p)
        v.p.y += h
        frameAt(course, axis, sj, v.a).multiplyScalar(w * (1 - 0.6 * f))
        const o = (k * M + j) * 2
        this.pos[o * 3] = v.p.x - v.a.x; this.pos[o * 3 + 1] = v.p.y - v.a.y; this.pos[o * 3 + 2] = v.p.z - v.a.z
        this.pos[o * 3 + 3] = v.p.x + v.a.x; this.pos[o * 3 + 4] = v.p.y + v.a.y; this.pos[o * 3 + 5] = v.p.z + v.a.z
        this.c.copy(head).lerp(tail, Math.min(1, f * 1.6))
        const near = Math.min(1, Math.max(0, (v.p.distanceTo(eye) - 1.5) / 4))
        const a = alpha * (1 - f) ** 1.5 * near * near
        for (let q = o; q <= o + 1; q++) {
          this.col[q * 4] = this.c.r; this.col[q * 4 + 1] = this.c.g; this.col[q * 4 + 2] = this.c.b; this.col[q * 4 + 3] = a
        }
      }
    }
  }

  end() {
    this.mesh.visible = this.strips > 0
    if (!this.strips) return
    this.geo.setDrawRange(0, this.strips * (this.samples - 1) * 6)
    this.geo.getAttribute('position').needsUpdate = true
    this.geo.getAttribute('color').needsUpdate = true
  }

  dispose() {
    this.geo.dispose()
    this.mat.dispose()
  }
}

/** A shock collar thrown off at the sonic boom: a ring round the path that swells and fades. */
export type Shock = { t: number; at: Vector3; x: Vector3; y: Vector3; z: Vector3 }
/** A pressure wave racing out across the floor from under the boom. */
export type Wave = { t: number; x: number; z: number }

/**
 * The maglev's disposable GPU objects and the state they animate, made in
 * one call per course: the coils on the guideway and the brake fins (one
 * instanced draw), the launch and tunnel rings, the sleds, trails, glows,
 * shock collars and brake sparks.
 */
export function makeRig(course: Course, sleds: number) {
  const unit = new BoxGeometry(1, 1, 1)
  const pads: number[] = [], fins: number[] = []
  for (let s = 0.4; s < course.len - 0.3; s += 0.5) if (s < course.at.brake) pads.push(s)
  for (let s = course.at.brake; s < course.len - 0.5; s += 0.42) fins.push(s, s)
  const coilMat = tintMat(true)
  const coils = new InstancedMesh(unit, coilMat, pads.length + fins.length)
  const coilS = Float32Array.from([...pads, ...fins])
  const k = new Vector3()
  pads.forEach((s, i) => {
    beamTop(course, s, v.p)
    frameAt(course, 'tan', s, v.t)
    frameAt(course, 'up', s, v.u)
    frameAt(course, 'side', s, v.s)
    v.p.addScaledVector(v.u, 0.014)
    coils.setMatrixAt(i, placed(m4, v.p, v.t, v.u, v.s, k.set(0.14, 0.028, 0.42)))
  })
  fins.forEach((s, j) => {
    beamTop(course, s, v.p)
    frameAt(course, 'tan', s, v.t)
    frameAt(course, 'up', s, v.u)
    frameAt(course, 'side', s, v.s)
    v.p.addScaledVector(v.s, (j % 2 ? 1 : -1) * (BEAM.w / 2 + 0.06)).addScaledVector(v.u, 0.07)
    coils.setMatrixAt(pads.length + j, placed(m4, v.p, v.t, v.u, v.s, k.set(0.3, 0.28, 0.035)))
  })
  coils.setColorAt(0, new Color())
  coils.frustumCulled = false

  const ringGeo = new TorusGeometry(GATE.r, 0.05, 6, 40)
  const ringMat = tintMat(true)
  const gates = new InstancedMesh(ringGeo, ringMat, Math.max(1, course.gates.length))
  course.gates.forEach((s, i) => {
    gateCentre(course, s, v.p)
    frameAt(course, 'tan', s, v.t)
    frameAt(course, 'up', s, v.u)
    frameAt(course, 'side', s, v.s)
    gates.setMatrixAt(i, placed(m4, v.p, v.u, v.s, v.t, k.set(1, 1, 1)))
  })
  gates.count = course.gates.length
  gates.setColorAt(0, new Color())
  gates.frustumCulled = false

  const shockGeo = new TorusGeometry(1, 0.035, 6, 48)
  const shockMat = new MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false })
  const shocks = new InstancedMesh(shockGeo, shockMat, 4)
  shocks.instanceMatrix.setUsage(DynamicDrawUsage)
  shocks.setColorAt(0, new Color())
  shocks.count = 0
  shocks.frustumCulled = false

  const body: Piece[] = [
    { geo: box(SLED.len, 0.08, SLED.w), at: [0, SLED.h - 0.04, 0] },
    { geo: box(SLED.len - 0.3, 0.05, SLED.w - 0.2), at: [0.04, SLED.h + 0.0, 0] },
    { geo: box(SLED.len - 0.12, 0.16, 0.05), at: [0, 0.0, SLED.w / 2 - 0.025] },
    { geo: box(SLED.len - 0.12, 0.16, 0.05), at: [0, 0.0, -SLED.w / 2 + 0.025] },
  ]
  const blank = { fill: new MeshBasicMaterial(), line: new LineBasicMaterial() }
  const sled = new Batch(body, sleds, blank.fill, blank.line)
  for (const p of body) p.geo.dispose()

  return {
    course,
    coils,
    coilS,
    pads: pads.length,
    /** Per coil: how hot it is (0..1) and the heat its color last showed (-1 forces a repaint). */
    heat: new Float32Array(coilS.length),
    shown: new Float32Array(coilS.length).fill(-1),
    gates,
    charge: new Float32Array(course.gates.length),
    lit: new Float32Array(course.gates.length).fill(-1),
    shocks,
    shockList: Array.from({ length: 4 }, (): Shock => ({ t: -1, at: new Vector3(), x: new Vector3(), y: new Vector3(), z: new Vector3() })),
    waves: Array.from({ length: 4 }, (): Wave => ({ t: -1, x: 0, z: 0 })),
    sled,
    sleds: Array.from({ length: sleds }, (): Sled => ({ state: 'free', part: null, s: 0, prev: 0, v: 0, k: 0, pos: new Vector3(), yaw: 0, t0: 0, lifted: false, arrived: false })),
    trails: new Trails(sleds),
    glows: new Glows(sleds * 2 + course.gates.length + 8),
    sparks: new Particles(220, SPARK),
    kickAt: -9,
    kicks: 0,
    rides: [] as number[],
    vmax: 0,
    reportAt: 0,
    dispose() {
      unit.dispose()
      coilMat.dispose()
      coils.dispose()
      ringGeo.dispose()
      ringMat.dispose()
      gates.dispose()
      shockGeo.dispose()
      shockMat.dispose()
      shocks.dispose()
      blank.fill.dispose()
      blank.line.dispose()
      sled.dispose()
      this.trails.dispose()
      this.glows.dispose()
      this.sparks.dispose()
    },
  }
}
export type Rig = ReturnType<typeof makeRig>

/** Writes a shock collar's matrix: the ring swells to `r` round the path. */
export function shockMatrix(out: Matrix4, s: Shock, r: number) {
  return placed(out, s.at, s.x, s.y, s.z, v.a.set(r, r, r * 0.4))
}
