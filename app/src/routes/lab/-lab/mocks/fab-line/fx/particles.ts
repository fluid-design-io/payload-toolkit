import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, LineBasicMaterial, LineSegments, NormalBlending } from 'three'

import { heatColor } from './heat'
import type { Ramp } from './heat'

/**
 * How a particle kind moves and looks. Sparks fall, bounce and streak;
 * ablation dust drifts up and hangs. `streak` is seconds of velocity drawn
 * as the tail; `speck` is the shortest tail so a slow particle still shows.
 */
export type Physics = { gravity: number; drag: number; bounce: number; streak: number; speck: number }

export const SPARK: Physics = { gravity: 12, drag: 0.6, bounce: 0.34, streak: 0.05, speck: 0.014 }
export const DUST: Physics = { gravity: -0.5, drag: 3.2, bounce: 0, streak: 0.06, speck: 0.018 }

/**
 * A ring buffer of particles drawn as one hairline draw: each particle is a
 * segment from its position back along its velocity, colored down a heat
 * ramp and faded by age. Positions are in the parent's frame.
 */
export class Particles {
  readonly object: LineSegments
  private readonly pos: Float32Array
  private readonly vel: Float32Array
  private readonly age: Float32Array
  private readonly life: Float32Array
  private readonly verts: Float32Array
  private readonly colors: Float32Array
  private next = 0
  private alive = 0
  private readonly col = new Color()

  constructor(readonly cap: number, readonly physics: Physics) {
    this.pos = new Float32Array(cap * 3)
    this.vel = new Float32Array(cap * 3)
    this.age = new Float32Array(cap)
    this.life = new Float32Array(cap)
    this.verts = new Float32Array(cap * 6)
    this.colors = new Float32Array(cap * 8)
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(this.verts, 3))
    g.setAttribute('color', new BufferAttribute(this.colors, 4))
    const m = new LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, toneMapped: false })
    this.object = new LineSegments(g, m)
    this.object.frustumCulled = false
    this.object.renderOrder = 3
  }

  /** Additive light on dark grounds, ordinary ink on light ones. */
  setGlow(additive: boolean) {
    const m = this.object.material as LineBasicMaterial
    const b = additive ? AdditiveBlending : NormalBlending
    if (m.blending !== b) { m.blending = b; m.needsUpdate = true }
  }

  get busy() { return this.alive > 0 }

  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number) {
    const i = this.next
    this.next = (i + 1) % this.cap
    const k = i * 3
    this.pos[k] = x; this.pos[k + 1] = y; this.pos[k + 2] = z
    this.vel[k] = vx; this.vel[k + 1] = vy; this.vel[k + 2] = vz
    this.age[i] = 0
    this.life[i] = life
  }

  /** A cone of `n` particles around `(nx, ny, nz)`, `spread` 0..1 from a jet to a hemisphere. */
  burst(n: number, x: number, y: number, z: number, nx: number, ny: number, nz: number, speed: [number, number], spread: number, life: [number, number]) {
    for (let j = 0; j < n; j++) {
      const a = Math.random() * Math.PI * 2
      const r = Math.random() * spread
      const s = speed[0] + Math.random() * (speed[1] - speed[0])
      const vx = nx + Math.cos(a) * r, vz = nz + Math.sin(a) * r, vy = ny + (Math.random() - 0.3) * spread * 0.6
      const l = Math.hypot(vx, vy, vz) || 1
      this.emit(x, y, z, (vx / l) * s, (vy / l) * s, (vz / l) * s, life[0] + Math.random() * (life[1] - life[0]))
    }
  }

  /** Advances every particle; `floor(x, z)` is the surface height a spark bounces on. */
  step(dt: number, floor: (x: number, z: number) => number, look: Ramp) {
    const { gravity, drag, bounce, streak, speck } = this.physics
    const P = this.pos, V = this.vel, out = this.verts, C = this.colors
    const damp = Math.exp(-drag * dt)
    let alive = 0
    for (let i = 0; i < this.cap; i++) {
      const k = i * 3, o = i * 6, q = i * 8
      if (this.age[i] >= this.life[i]) {
        C[q + 3] = 0; C[q + 7] = 0
        out[o] = out[o + 3] = P[k]; out[o + 1] = out[o + 4] = P[k + 1]; out[o + 2] = out[o + 5] = P[k + 2]
        continue
      }
      alive++
      this.age[i] += dt
      V[k] *= damp; V[k + 2] *= damp
      V[k + 1] = V[k + 1] * damp - gravity * dt
      P[k] += V[k] * dt; P[k + 1] += V[k + 1] * dt; P[k + 2] += V[k + 2] * dt
      const f = floor(P[k], P[k + 2])
      if (P[k + 1] < f) {
        P[k + 1] = f
        if (bounce > 0 && V[k + 1] < 0) {
          V[k + 1] = -V[k + 1] * bounce
          V[k] *= 0.55; V[k + 2] *= 0.55
        } else V[k + 1] = 0
      }
      const sp = Math.hypot(V[k], V[k + 1], V[k + 2])
      const len = Math.max(speck, sp * streak) / (sp || 1)
      out[o] = P[k]; out[o + 1] = P[k + 1]; out[o + 2] = P[k + 2]
      out[o + 3] = P[k] - V[k] * len; out[o + 4] = P[k + 1] - V[k + 1] * len; out[o + 5] = P[k + 2] - V[k + 2] * len
      const t = this.age[i] / this.life[i]
      heatColor(1 - t, look, this.col)
      const a = 1 - t * t
      C[q] = C[q + 4] = this.col.r; C[q + 1] = C[q + 5] = this.col.g; C[q + 2] = C[q + 6] = this.col.b
      C[q + 3] = a
      C[q + 7] = a * 0.15
    }
    this.alive = alive
    const g = this.object.geometry
    g.getAttribute('position').needsUpdate = true
    g.getAttribute('color').needsUpdate = true
  }

  clear() {
    this.age.fill(0)
    this.life.fill(0)
    this.alive = 0
  }

  dispose() {
    this.object.geometry.dispose()
    ;(this.object.material as LineBasicMaterial).dispose()
  }
}
