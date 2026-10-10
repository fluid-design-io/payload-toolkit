import {
  BufferAttribute, BufferGeometry, Color, DynamicDrawUsage, InstancedMesh, LineSegments, Matrix4, MeshBasicMaterial, MeshStandardMaterial,
} from 'three'
import type { Material } from 'three'

import type { Part } from '../../core/contract'
import { mergeEdges, mergeFills, reducedMotion } from '../../core/three'
import type { Piece } from '../../core/three'

/**
 * A carrier's life on a looped transport: `ride` under a carried part,
 * `coast` empty to the path's end when its part was sent back mid-ride,
 * `hold` at the pick point after the arm lifts the part, then `back` along
 * the return route to the idle queue at the load point.
 */
export type CarrierState = 'ride' | 'coast' | 'hold' | 'back'
export type Carrier = {
  state: CarrierState
  part: Part | null
  /** Distance along the sim's path while riding or coasting. */
  u: number
  /** Distance along the return route while back; `back` is the load point. */
  b: number
  v: number
  /** Seconds in the current state. */
  t: number
  arrived: boolean
  docked: boolean
  /** A free 0..1 value each variant eases for its own machinery (a lid, a hoist). */
  k: number
}

export type FleetSpec = {
  /** Carriers in the fleet; trimmed so the idle queue fits on the return route. */
  n: number
  /** The sim path's length, speed and gap. */
  length: number
  speed: number
  gap: number
  /** Return route length; b = back is the load point. */
  back: number
  /** Spacing of idle carriers queued before the load point. */
  spacing: number
  vmax: number
  accel: number
  /** Seconds a carrier waits at the pick point after its part leaves. */
  dwell: number
}

export type FleetEvents = {
  bind?: (c: Carrier) => void
  arrive?: (c: Carrier) => void
  release?: (c: Carrier) => void
  depart?: (c: Carrier) => void
  dock?: (c: Carrier) => void
}

/** Binds carriers to the sim's carried parts and runs the empties home. Parts never wait on a carrier. */
export class Fleet {
  readonly carriers: Carrier[]
  readonly spec: FleetSpec
  private queue: Carrier[] = []

  constructor(spec: FleetSpec) {
    this.spec = spec
    const n = Math.max(1, Math.min(spec.n, Math.floor(spec.back / spec.spacing) + 1))
    this.carriers = Array.from({ length: n }, (_, i) => ({
      state: 'back' as const, part: null, u: 0, b: spec.back - i * spec.spacing, v: 0, t: 0, arrived: false, docked: true, k: i === 0 ? 1 : 0,
    }))
  }

  step(carried: readonly Part[], dt: number, on: FleetEvents) {
    const s = this.spec
    for (const c of this.carriers) {
      c.t += dt
      if (c.state !== 'ride' || (c.part && carried.includes(c.part))) continue
      const atEnd = c.u >= s.length - 0.02
      c.part = null
      c.state = atEnd ? 'hold' : 'coast'
      c.t = 0
      on.release?.(c)
    }
    for (const p of carried) {
      if (this.carriers.some((c) => c.part === p)) continue
      let pick: Carrier | null = null
      for (const c of this.carriers) if (c.state === 'back' && (!pick || c.b > pick.b)) pick = c
      if (!pick) continue
      pick.state = 'ride'
      pick.part = p
      pick.u = p.u
      pick.t = 0
      pick.arrived = false
      pick.docked = false
      on.bind?.(pick)
    }
    for (const c of this.carriers) {
      if (c.state === 'ride' && c.part) {
        if (c.part.u > 0.25 && c.u <= 0.25 && !c.part.fly) on.depart?.(c)
        c.u = c.part.u
        if (c.b < s.back) c.b = Math.min(s.back, c.b + s.vmax * 2 * dt)
        if (!c.arrived && !c.part.fly && c.u >= s.length - 0.01) {
          c.arrived = true
          on.arrive?.(c)
        }
      } else if (c.state === 'coast') {
        let limit = s.length
        for (const o of this.carriers) if (o !== c && (o.state === 'ride' || o.state === 'coast') && o.u > c.u) limit = Math.min(limit, o.u - s.gap)
        c.u = Math.max(c.u, Math.min(c.u + s.speed * 1.5 * dt, limit))
        if (c.u >= s.length - 0.01) this.toBack(c)
      } else if (c.state === 'hold' && c.t >= (reducedMotion ? s.dwell * 0.4 : s.dwell)) this.toBack(c)
    }
    const queue = this.queue
    queue.length = 0
    let leaving = Infinity
    for (const c of this.carriers) {
      if (c.state === 'back') queue.push(c)
      else if (c.state === 'ride' || c.state === 'coast') leaving = Math.min(leaving, c.u)
    }
    const head = s.back - Math.max(0, s.spacing - leaving)
    queue.sort((x, y) => y.b - x.b)
    queue.forEach((c, i) => {
      const target = Math.max(c.b, Math.min(s.back - i * s.spacing, i ? queue[i - 1].b - s.spacing : head))
      const d = target - c.b
      const want = Math.min(s.vmax, Math.sqrt(2 * s.accel * Math.max(0, d)))
      c.v += (want - c.v) * (1 - Math.exp(-dt * 10))
      c.b = Math.min(target, c.b + Math.max(0, c.v) * dt)
      const still = target - c.b < 1e-3
      if (still && !c.docked && c.t > 0.05) {
        c.docked = true
        c.v = 0
        on.dock?.(c)
      } else if (!still) c.docked = false
    })
  }

  private toBack(c: Carrier) {
    c.state = 'back'
    c.b = 0
    c.v = 0
    c.t = 0
    c.docked = false
  }

  /** True while any carrier still moves on its own (returning, coasting or holding). */
  busy() {
    return this.carriers.some((c) => c.state === 'coast' || c.state === 'hold' || (c.state === 'back' && !c.docked))
  }
}

const glass = new Map<string, Material>()
/** A see-through fill that never writes depth, so parts and carriers inside it stay visible. */
export function glassMat(color: string, flat: boolean, opacity: number) {
  const key = `${color}|${flat}|${opacity}`
  let m = glass.get(key)
  if (!m) {
    const o = { color, transparent: true, opacity, depthWrite: false }
    m = flat ? new MeshBasicMaterial(o) : new MeshStandardMaterial({ ...o, roughness: 0.15, metalness: 0 })
    glass.set(key, m)
  }
  return m
}

/** A fill whose color comes from per-instance colors (white base, so `setColorAt` reads true). */
export function tintMat(flat: boolean, rough = 1) {
  return flat ? new MeshBasicMaterial() : new MeshStandardMaterial({ roughness: rough })
}

/**
 * `n` copies of one rigid body as two draws: an instanced fill and one
 * hairline buffer rewritten from the instance matrices. Hide a copy by
 * giving it a zero-scale matrix.
 */
export class Batch {
  readonly mesh: InstancedMesh
  readonly lines: LineSegments | null
  private readonly base: Float32Array | null
  private readonly out: Float32Array | null
  private readonly owned: BufferGeometry[] = []

  constructor(pieces: Piece[], n: number, fill: Material, line: Material | null) {
    const geo = mergeFills(pieces)
    this.owned.push(geo)
    this.mesh = new InstancedMesh(geo, fill, n)
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage)
    this.mesh.frustumCulled = false
    if (line) {
      const edges = mergeEdges(pieces)
      this.base = Float32Array.from(edges.getAttribute('position').array)
      edges.dispose()
      this.out = new Float32Array(this.base.length * n)
      const lg = new BufferGeometry()
      lg.setAttribute('position', new BufferAttribute(this.out, 3).setUsage(DynamicDrawUsage))
      this.owned.push(lg)
      this.lines = new LineSegments(lg, line)
      this.lines.frustumCulled = false
    } else {
      this.base = null
      this.out = null
      this.lines = null
    }
  }

  set(i: number, m: Matrix4) {
    this.mesh.setMatrixAt(i, m)
    const base = this.base
    const out = this.out
    if (!base || !out) return
    const e = m.elements
    const o = i * base.length
    for (let j = 0; j < base.length; j += 3) {
      const x = base[j], y = base[j + 1], z = base[j + 2]
      out[o + j] = e[0] * x + e[4] * y + e[8] * z + e[12]
      out[o + j + 1] = e[1] * x + e[5] * y + e[9] * z + e[13]
      out[o + j + 2] = e[2] * x + e[6] * y + e[10] * z + e[14]
    }
  }

  color(i: number, c: Color) {
    this.mesh.setColorAt(i, c)
  }

  commit() {
    this.mesh.instanceMatrix.needsUpdate = true
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true
    if (this.lines) this.lines.geometry.getAttribute('position').needsUpdate = true
  }

  dispose() {
    for (const g of this.owned) g.dispose()
    this.mesh.dispose()
  }
}

export const hidden = new Matrix4().makeScale(0, 0, 0)
