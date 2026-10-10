import { useEffect, useMemo } from 'react'
import { Color, ExtrudeGeometry, InstancedMesh, Matrix4, Shape, Vector2, Vector3 } from 'three'

import { play } from '../../../../kit/sound'
import type { TransportProps, TransportVariant } from '../../core/contract'
import { Body } from '../../core/scene'
import { box, fillMat, lineMat, reducedMotion } from '../../core/three'
import type { Piece } from '../../core/three'
import { Batch, tintMat } from './fleet'
import type { Carrier, FleetSpec } from './fleet'
import { ease, pose, useFleet, useSkin, yawOf } from './kit'
import { Pace, Track, rounded, smooth01 } from './track'

/**
 * A magnetic levitation loop. Movers sit on a flat oval guideway; one lifts
 * off as its part lands, glides the front straight with a long, smooth
 * surge and settles into the pickup without a sound. The coils under a
 * floating mover glow as it passes. Empties round the far end, run the back
 * straight and settle nose to tail at the load end, magnets off.
 */
const Y = 1.0
const Z = -1.2
const ZB = -2.6
const LOAD = -7.25
const PICK = -1.2
const SLED = { len: 1.0, w: 0.9, h: 0.14, saddle: 0.06 }
const FLOAT = 0.15
const REST = 0.03
const COIL = 0.32

const loop = new Track(rounded([[-8.0, Y, Z], [-0.45, Y, Z], [-0.45, Y, ZB], [-8.0, Y, ZB]], 0.7, true, 18), true)
const sLoad = loop.locate([LOAD, Y, Z])
const sPick = loop.locate([PICK, Y, Z])
const run = PICK - LOAD
const pace = new Pace(run, (s) => 1 + 3.4 * smooth01(s / 1.7) * smooth01((run - s) / 1.7))
const back = loop.slice(sPick, sLoad + loop.len)

const SPEC: FleetSpec = { n: 7, length: pace.length, speed: 1.25, gap: 1.2, back: back.len, spacing: 1.12, vmax: 4.2, accel: 3.2, dwell: 0.45 }

/** Hover gap over the guideway for a riding mover `u` along: it lifts off just after the part lands. */
const hover = (u: number, s: number) => REST + (FLOAT - REST) * smooth01((u - 0.06) / 0.3) + (reducedMotion ? 0 : 0.012 * Math.sin(s * 4.2) * smooth01(u / 0.4))
const partAt = (u: number, out: Vector3) => {
  const s = pace.s(u)
  return out.set(LOAD + s, Y + hover(u, s) + SLED.h + SLED.saddle, Z)
}

const at = new Vector3()
const tan = new Vector3()
const other = new Vector3()
const m = new Matrix4()

/** The guideway: an oval slab extruded from the loop offset to both sides. */
function slabGeometry() {
  const pts = loop.samples(0.1)
  const t = new Vector3()
  const ring = (k: number) => pts.map((p, i) => {
    loop.tangent((loop.len * i) / (pts.length - 1), t)
    return new Vector2(p.x - t.z * k, p.z + t.x * k)
  })
  const shape = new Shape(ring(0.4))
  const hole = new Shape(ring(-0.4).reverse())
  shape.holes.push(hole)
  const g = new ExtrudeGeometry(shape, { depth: 0.26, bevelEnabled: false, curveSegments: 1 })
  g.rotateX(Math.PI / 2)
  g.translate(0, Y, 0)
  return g
}

function pylonPieces(): Piece[] {
  const out: Piece[] = []
  for (const [x, z] of [[-7.3, (Z + ZB) / 2], [-4.2, Z], [-4.2, ZB], [-1.15, (Z + ZB) / 2]] as const) {
    const h = Y - 0.26
    out.push({ geo: box(0.24, h, 0.24), at: [x, h / 2, z] }, { geo: box(0.6, 0.06, 0.6), at: [x, 0.03, z] })
  }
  out.push({ geo: box(0.5, 0.05, 0.7), at: [LOAD - 0.8, Y + 0.025, Z] })
  return out
}

function moverPieces() {
  const body: Piece[] = [
    { geo: box(SLED.len, SLED.h, SLED.w), at: [0, SLED.h / 2, 0] },
    { geo: box(SLED.len - 0.1, 0.24, 0.05), at: [0, -0.08, SLED.w / 2 - 0.02] },
    { geo: box(SLED.len - 0.1, 0.24, 0.05), at: [0, -0.08, -SLED.w / 2 + 0.02] },
    { geo: box(0.7, SLED.saddle, 0.56), at: [0, SLED.h + SLED.saddle / 2, 0] },
  ]
  const glow: Piece[] = [{ geo: box(SLED.len - 0.16, 0.012, SLED.w - 0.24), at: [0, -0.01, 0] }]
  return { body, glow }
}

/** Coil tiles along the guideway, one instance each, lit under floating movers. */
function useCoils(c: TransportProps['c']) {
  const coils = useMemo(() => {
    const n = Math.floor(loop.len / COIL)
    const geo = box(0.16, 0.02, 0.5)
    const mat = tintMat(c.flat)
    const mesh = new InstancedMesh(geo, mat, n)
    const p = new Vector3()
    const t = new Vector3()
    const mm = new Matrix4()
    const pos: Vector3[] = []
    for (let i = 0; i < n; i++) {
      const s = (i + 0.5) * COIL
      loop.point(s, p)
      loop.tangent(s, t)
      pose(mm, p.setY(Y + 0.012), yawOf(t))
      mesh.setMatrixAt(i, mm)
      pos.push(p.clone())
    }
    return { mesh, geo, mat, pos, lit: new Float32Array(n).fill(-1) }
  }, [c.flat])
  useEffect(() => () => { coils.geo.dispose(); coils.mat.dispose(); coils.mesh.dispose() }, [coils])
  return coils
}

function Maglev({ sim, c }: TransportProps) {
  const slab = useMemo(slabGeometry, [])
  const slabPieces = useMemo((): Piece[] => [{ geo: slab, threshold: 30 }], [slab])
  const pylons = useMemo(pylonPieces, [])
  const glowMat = useMemo(() => tintMat(true), [])
  useEffect(() => () => { slab.dispose(); glowMat.dispose() }, [slab, glowMat])
  const coils = useCoils(c)
  const tones = useMemo(() => ({ lit: new Color(c.lit), off: new Color(c.dim), on: new Color(c.lit).lerp(new Color(c.dim), 0.55) }), [c.lit, c.dim])
  const layers = useMemo(() => {
    const p = moverPieces()
    return { body: new Batch(p.body, SPEC.n, fillMat(c.surface, c.flat, c.rough), lineMat(c.edge)), glow: new Batch(p.glow, SPEC.n, glowMat, null) }
  }, [])
  useSkin(c, () => {
    layers.body.mesh.material = fillMat(c.surface, c.flat, c.rough)
    layers.body.lines!.material = lineMat(c.edge)
    coils.lit.fill(-1)
  })
  const floating = useMemo(() => Array.from({ length: SPEC.n }, () => new Vector3(0, -99, 0)), [])
  useFleet(sim, SPEC, layers, (car: Carrier, i, dt) => {
    let yaw = 0
    let lift: number
    if (car.state === 'back') {
      back.point(car.b, at)
      back.tangent(car.b, tan)
      yaw = yawOf(tan)
      ease(car, car.docked ? 0 : 1, dt, car.docked ? 3 : 6, reducedMotion)
      lift = REST + (FLOAT - REST) * car.k
    } else {
      const u = car.state === 'hold' ? SPEC.length : car.u
      const s = pace.s(u)
      at.set(LOAD + s, Y, Z)
      lift = hover(u, s)
      car.k = 1
      if (car.state === 'ride' && car.b < SPEC.back) {
        back.point(car.b, other)
        at.lerp(other, Math.min(1, (SPEC.back - car.b) / SPEC.spacing))
      }
    }
    floating[i].copy(at)
    if (lift < REST + 0.04) floating[i].y = -99
    at.y = Y + lift
    pose(m, at, yaw)
    layers.body.set(i, m)
    layers.glow.set(i, m)
    layers.glow.color(i, lift > REST + 0.04 ? tones.lit : tones.off)
    if (i === SPEC.n - 1) lightCoils()
  }, {
    depart: () => play('chirp'),
    arrive: () => play('tick'),
  })
  function lightCoils() {
    let dirty = false
    for (let k = 0; k < coils.pos.length; k++) {
      const p = coils.pos[k]
      let near = 0
      for (const f of floating) {
        if (f.y < 0) continue
        const d = Math.abs(f.x - p.x) + Math.abs(f.z - p.z)
        if (d < 0.75) near = Math.max(near, d < 0.42 ? 2 : 1)
      }
      if (coils.lit[k] === near) continue
      coils.lit[k] = near
      coils.mesh.setColorAt(k, near === 2 ? tones.lit : near === 1 ? tones.on : tones.off)
      dirty = true
    }
    if (dirty && coils.mesh.instanceColor) coils.mesh.instanceColor.needsUpdate = true
  }
  return (
    <group>
      <Body id="maglev-slab" c={c} fill={c.sub} edge={c.edge} pieces={slabPieces} />
      <Body id="maglev-pylons" c={c} fill={c.surface} edge={c.edge} pieces={pylons} />
      <primitive object={coils.mesh} />
      <primitive object={layers.body.mesh} />
      <primitive object={layers.body.lines!} />
      <primitive object={layers.glow.mesh} />
    </group>
  )
}

export const maglev: TransportVariant = {
  id: 'maglev',
  kind: 'path',
  label: 'Maglev',
  footprint: { x0: -8.55, x1: 0.1, z0: ZB - 0.55, z1: Z + 0.55, h: Y + 0.5 },
  frame: [[-8.7, 0, Z + 1.4], [0.3, 0, Z + 1.4], [0.3, Y + 0.6, ZB - 0.9], [-8.7, Y + 0.6, ZB - 0.9]],
  el: 44,
  length: pace.length,
  speed: SPEC.speed,
  gap: SPEC.gap,
  at: partAt,
  load: { dur: 0.6, h: 1.3 },
  Component: Maglev,
}
