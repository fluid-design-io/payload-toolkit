import { Color } from 'three'

import { Glows } from './glow'

/**
 * Smoke wisps: soft puffs that rise, drift, swell and thin out, drawn as one
 * instanced glow draw with ordinary blending so they read on light and dark
 * grounds alike. Call `step` once per frame.
 */
export class Smoke {
  readonly glows: Glows
  readonly col = new Color()
  private readonly pos: Float32Array
  private readonly vel: Float32Array
  private readonly age: Float32Array
  private readonly life: Float32Array
  private readonly size: Float32Array
  private next = 0
  private alive = 0

  constructor(readonly cap: number, color: string, readonly opacity = 0.2) {
    this.glows = new Glows(cap, 0)
    this.col.set(color)
    this.pos = new Float32Array(cap * 3)
    this.vel = new Float32Array(cap * 3)
    this.age = new Float32Array(cap)
    this.life = new Float32Array(cap)
    this.size = new Float32Array(cap)
  }

  get object() { return this.glows.object }
  get busy() { return this.alive > 0 }

  setColor(color: string) { this.col.set(color) }

  emit(x: number, y: number, z: number, size: number, life = 2.2) {
    const i = this.next
    this.next = (i + 1) % this.cap
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z
    this.vel[i * 3] = (Math.random() - 0.5) * 0.16
    this.vel[i * 3 + 1] = 0.26 + Math.random() * 0.14
    this.vel[i * 3 + 2] = (Math.random() - 0.5) * 0.16
    this.age[i] = 0
    this.life[i] = life * (0.8 + Math.random() * 0.4)
    this.size[i] = size
  }

  step(dt: number) {
    const g = this.glows
    g.begin()
    let alive = 0
    for (let i = 0; i < this.cap; i++) {
      if (this.age[i] >= this.life[i]) continue
      alive++
      this.age[i] += dt
      const t = Math.min(1, this.age[i] / this.life[i])
      const k = i * 3
      this.vel[k] *= 1 - dt * 0.4
      this.vel[k + 1] *= 1 - dt * 0.5
      this.vel[k + 2] *= 1 - dt * 0.4
      this.pos[k] += (this.vel[k] + 0.05) * dt
      this.pos[k + 1] += this.vel[k + 1] * dt
      this.pos[k + 2] += this.vel[k + 2] * dt
      const a = this.opacity * Math.min(1, t * 6) * (1 - t) * (1 - t)
      g.add(this.pos[k], this.pos[k + 1], this.pos[k + 2], this.size[i] * (1 + t * 4), this.col, a)
    }
    g.end()
    this.alive = alive
  }

  clear() {
    this.age.fill(0)
    this.life.fill(0)
    this.alive = 0
  }

  dispose() { this.glows.dispose() }
}
