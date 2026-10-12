import { useFrame } from '@react-three/fiber'
import { useEffect, useState } from 'react'
import { BufferAttribute, BufferGeometry, CylinderGeometry, DynamicDrawUsage, InstancedMesh, Matrix4, MeshBasicMaterial, Points, PointsMaterial, SphereGeometry, Vector3 } from 'three'

import { keepAnimating } from '../../../../../../kit/busy'
import type { Route, SignalProps, Tokens } from '../../../../core/contract'
import { sampleRoute, viaDistances } from '../../../../core/route'
import { reducedMotion } from '../../../../core/three'
import { contrastOn } from '../../../../fx/heat'

const HEADS = 6, VIAS = 400

/** A fixed pool of square dots riding routes. A slot is free while its route is null; `t` runs 0..1 along the route. */
function makePool(cap: number, size: number, opacity: number) {
  const pos = new Float32Array(cap * 3)
  const geo = new BufferGeometry()
  const attr = new BufferAttribute(pos, 3).setUsage(DynamicDrawUsage)
  geo.setAttribute('position', attr)
  geo.setDrawRange(0, 0)
  const mat = new PointsMaterial({ size, sizeAttenuation: false, toneMapped: false, transparent: opacity < 1, opacity })
  const points = new Points(geo, mat)
  points.frustumCulled = false
  points.visible = false
  return { cap, route: new Array<Route | null>(cap).fill(null), t: new Float32Array(cap), speed: new Float32Array(cap), next: 0, live: 0, pos, attr, geo, mat, points }
}
type Pool = ReturnType<typeof makePool>

function spawn(pool: Pool, route: Route, t: number, speed: number) {
  for (let n = 0; n < pool.cap; n++) {
    const i = (pool.next + n) % pool.cap
    if (pool.route[i]) continue
    pool.route[i] = route; pool.t[i] = t; pool.speed[i] = speed
    pool.next = (i + 1) % pool.cap
    return
  }
}

/** Moves every dot, writes the visible ones and uploads only what was written. A negative speed runs from the far end. */
function advance(pool: Pool, dt: number, lift: number, out: Vector3) {
  const prev = pool.live
  let w = 0
  for (let i = 0; i < pool.cap; i++) {
    const route = pool.route[i]
    if (!route) continue
    pool.t[i] += Math.abs(pool.speed[i]) * dt
    const t = pool.t[i]
    if (t > 1) { pool.route[i] = null; continue }
    if (t < 0) continue
    sampleRoute(route, pool.speed[i] < 0 ? 1 - t : t, out)
    pool.pos[w * 3] = out.x; pool.pos[w * 3 + 1] = out.y + lift; pool.pos[w * 3 + 2] = out.z
    w++
  }
  pool.live = w
  pool.geo.setDrawRange(0, w)
  pool.points.visible = w > 0
  if (!w && !prev) return
  pool.attr.clearUpdateRanges()
  pool.attr.addUpdateRange(0, w * 3)
  pool.attr.needsUpdate = true
}

function makeGpu(c: Tokens) {
  const heads = new InstancedMesh(new SphereGeometry(0.07, 10, 10), new MeshBasicMaterial({ color: c.spark, toneMapped: false }), HEADS)
  const vias = new InstancedMesh(new CylinderGeometry(0.07, 0.07, 0.006, 16), new MeshBasicMaterial({ color: c.pin }), VIAS)
  for (const m of [heads, vias]) {
    m.count = 0
    m.frustumCulled = false
    m.instanceMatrix.setUsage(DynamicDrawUsage)
  }
  return {
    heads, vias,
    data: makePool(600, 5, 1),
    power: makePool(160, 6, 0.7),
    /** Which via each lit instance shows (`part index × 64 + via index`), so instances are rewritten only when that changes. */
    shown: new Int32Array(VIAS).fill(-1),
    version: -1,
    seen: -1,
    m: new Matrix4(),
    v: new Vector3(),
  }
}
type Gpu = ReturnType<typeof makeGpu>

function upload(mesh: InstancedMesh, from: number, to: number) {
  mesh.instanceMatrix.clearUpdateRanges()
  mesh.instanceMatrix.addUpdateRange(from * 16, (to - from) * 16)
  mesh.instanceMatrix.needsUpdate = true
}

function frame(g: Gpu, { sim, version, statics, lift }: SignalProps, raw: number) {
  const dt = Math.min(raw, 0.1)
  const { heads, vias } = g
  if (version !== g.version) { g.version = version; g.shown.fill(-1) }
  let h = 0, v = 0, lo = VIAS, hi = 0
  for (let pi = 0; pi < sim.list.length; pi++) {
    const p = sim.list[pi]
    const route = p.route
    if (!route || p.mode !== 'seated') continue
    if (p.drawn < 1 && h < HEADS) heads.setMatrixAt(h++, g.m.makeTranslation(sampleRoute(route, p.drawn, g.v)))
    const at = viaDistances(route)
    for (let k = 0; k < at.length && v < VIAS; k++) {
      if (p.drawn * route.len < at[k] - 0.001) continue
      const id = pi * 64 + k
      if (g.shown[v] !== id) {
        g.shown[v] = id
        const via = route.vias[k]
        vias.setMatrixAt(v, g.m.makeTranslation(via.x, via.y + 0.003, via.z))
        lo = Math.min(lo, v); hi = v + 1
      }
      v++
    }
  }
  if (h) upload(heads, 0, h)
  heads.count = h
  if (hi > lo) upload(vias, lo, hi)
  vias.count = v

  // A new seat sends a burst of four down its trace; it outlives the seat's busy frames, so it keeps the frame rate up itself.
  if (sim.lastSeatAt !== g.seen && sim.lastSeat?.route) {
    g.seen = sim.lastSeatAt
    if (!reducedMotion) {
      for (let k = 0; k < 4; k++) spawn(g.data, sim.lastSeat.route, -k * 0.12 - 0.6, 1.1)
      keepAnimating(2)
    }
  }
  if (!reducedMotion) {
    for (const p of sim.list) if (p.mode === 'seated' && p.route && p.drawn >= 1 && Math.random() < dt * 0.55) spawn(g.data, p.route, 0, 6 / p.route.len)
    for (const r of statics.memory) if (Math.random() < dt * 1.4) spawn(g.data, r, 0, Math.random() < 0.5 ? 1.6 : -1.6)
    for (const r of statics.power) if (Math.random() < dt * 2) spawn(g.power, r, 0, 0.9)
  }
  advance(g.data, dt, lift, g.v)
  advance(g.power, dt, lift, g.v)
}

/** Square dots along traces and buses, a hot head on each trace as it draws, and via discs that appear as it reaches them. */
export function Classic(props: SignalProps) {
  const { c } = props
  const [g] = useState(() => makeGpu(c))
  useEffect(() => {
    ;(g.heads.material as MeshBasicMaterial).color.set(c.spark)
    ;(g.vias.material as MeshBasicMaterial).color.set(c.pin)
    // Dots ride lit traces, so they take whichever of spark or ink stands out from the trace color.
    const dot = contrastOn(c.lit, c.spark, c.ink)
    g.data.mat.color.set(dot)
    g.power.mat.color.set(dot)
  }, [g, c])
  useEffect(
    () => () => {
      for (const m of [g.heads, g.vias]) {
        m.geometry.dispose()
        ;(m.material as MeshBasicMaterial).dispose()
        m.dispose()
      }
      for (const p of [g.data, g.power]) { p.geo.dispose(); p.mat.dispose() }
    },
    [g],
  )
  useFrame((_, dt) => frame(g, props, dt))
  return (
    <>
      <primitive object={g.heads} />
      <primitive object={g.vias} />
      <primitive object={g.data.points} />
      <primitive object={g.power.points} />
    </>
  )
}
