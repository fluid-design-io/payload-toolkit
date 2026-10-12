import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import { BufferAttribute, BufferGeometry, Color, InstancedBufferAttribute, LineBasicMaterial, Matrix4, MeshBasicMaterial, Sphere, SphereGeometry, Vector3 } from 'three'
import type { InstancedMesh } from 'three'

import type { Part, Sim, Tokens } from '../../core/contract'
import { clamp, reducedMotion, useDisposable } from '../../core/three'
import type { Glows } from '../../fx/glow'
import { contrastOn, cooled, heatColor, ramp } from '../../fx/heat'
import { scriptOf } from './script'
import type { Report } from './report'
import type { Machine, Stroke } from './script'

/** Who worked a chip and when, from its `work` event: script time maps to sim time through `start` and `dur`. */
export type Job = { machine: Machine; start: number; dur: number }
export type Log = Map<Part, Job>

const BEADS = 4096
const ETCH = 9000
/** Etched strokes are cut into chunks this long so heat can cool along the line. */
const CHUNK = 0.07
const M = new Matrix4()
const K = new Color()
const SCENE = new Sphere(new Vector3(0, 0, 0), 60)

/** The first and last float a frame changed in one attribute's array. */
type Span = { lo: number; hi: number }
const span = (): Span => ({ lo: Infinity, hi: -1 })
/** Stores `v` at `i`, widening `d` only when the stored float changes. */
const put = (a: Float32Array, i: number, v: number, d: Span) => {
  const f = Math.fround(v)
  if (a[i] === f) return
  a[i] = f
  if (i < d.lo) d.lo = i
  if (i > d.hi) d.hi = i
}
/**
 * Uploads the floats `d` covers and resets it, so a frame that changed nothing uploads nothing. A range still
 * pending from a frame no render drew is folded in, since the renderer clears the ranges only once it uploads them.
 */
function flush(attr: BufferAttribute, d: Span) {
  if (d.hi < d.lo) return
  let start = d.lo, end = d.hi + 1
  for (const r of attr.updateRanges) {
    start = Math.min(start, r.start)
    end = Math.max(end, r.start + r.count)
  }
  attr.clearUpdateRanges()
  attr.addUpdateRange(start, end - start)
  attr.needsUpdate = true
  d.lo = Infinity
  d.hi = -1
}

export const beadRamp = (c: Tokens) => ramp(c.spark, c.claude, c.pin)
export const etchRamp = (c: Tokens) => ramp(c.spark, c.lit, contrastOn(c.body, c.codex, c.codexInk))

/**
 * Everything the integrators left on seated chips: solder beads at every
 * joint (one instanced draw) and laser-etched lid marks (one hairline draw).
 * Both are rebuilt from `part.finish` and the job log each frame, so a chip
 * that is removed, moved or re-planned carries its marks along; hot marks
 * cool from the spark color to matte and add a halo to the shared glows.
 * Only the floats that changed since the last frame are uploaded.
 */
export function Marks({ sim, logRef, c, glows, reportRef }: { sim: Sim; logRef: RefObject<Log>; c: Tokens; glows: Glows; reportRef: RefObject<Report> }) {
  const beads = useRef<InstancedMesh>(null)
  const { camera } = useThree()
  const looks = { bead: beadRamp(c), etch: etchRamp(c) }
  const gpu = useDisposable(() => {
    const etchGeo = new BufferGeometry()
    etchGeo.setAttribute('position', new BufferAttribute(new Float32Array(ETCH * 6), 3))
    etchGeo.setAttribute('color', new BufferAttribute(new Float32Array(ETCH * 6), 3))
    etchGeo.setDrawRange(0, 0)
    return {
      bead: new SphereGeometry(0.5, 10, 6),
      beadMat: new MeshBasicMaterial({ color: '#ffffff', toneMapped: false }),
      etchGeo,
      etchMat: new LineBasicMaterial({ vertexColors: true, toneMapped: false }),
      dirty: { matrix: span(), tint: span(), pos: span(), col: span() },
    }
  }, [])
  useEffect(() => {
    const m = beads.current
    if (m && !m.instanceColor) m.instanceColor = new InstancedBufferAttribute(new Float32Array(BEADS * 3), 3)
  }, [])

  useFrame(() => {
    const m = beads.current
    if (!m || !m.instanceColor) return
    const pos = gpu.etchGeo.getAttribute('position') as BufferAttribute
    const col = gpu.etchGeo.getAttribute('color') as BufferAttribute
    const P = pos.array as Float32Array, C = col.array as Float32Array
    const MA = m.instanceMatrix.array as Float32Array, CA = m.instanceColor.array as Float32Array
    const dirty = gpu.dirty
    let n = 0, e = 0
    let sx = 0, sz = 0, y = 0, s = 1, start = 0, rate = 1, t0 = 0, rate0 = 1
    const paint = (at: number, d: number) => {
      const age = sim.time - (start + (t0 + d * rate0) * rate)
      heatColor(reducedMotion ? 0 : cooled(age, 1.1), looks.etch, K)
      put(C, at, K.r, dirty.col); put(C, at + 1, K.g, dirty.col); put(C, at + 2, K.b, dirty.col)
    }
    const seg = (ax: number, az: number, bx: number, bz: number, d0: number, d1: number) => {
      if (e >= ETCH) return
      const o = e * 6
      put(P, o, sx + ax * s, dirty.pos); put(P, o + 1, y, dirty.pos); put(P, o + 2, sz + az * s, dirty.pos)
      put(P, o + 3, sx + bx * s, dirty.pos); put(P, o + 4, y, dirty.pos); put(P, o + 5, sz + bz * s, dirty.pos)
      paint(o, d0)
      paint(o + 3, d1)
      e += 1
    }
    for (const p of sim.live) {
      const job = logRef.current.get(p)
      if (p.mode !== 'seated' || !p.slot || !job || p.finish <= 0) continue
      const script = scriptOf(job.machine, p.spec)
      const now = p.finish * script.total
      s = p.slot.s
      sx = p.slot.x
      sz = p.slot.z
      y = p.slot.y + script.y * s
      start = job.start
      rate = job.dur / script.total
      if (job.machine === 'drone') {
        for (const b of script.beads) {
          if (now < b.at || n >= BEADS) continue
          const age = sim.time - (start + b.at * rate)
          const heat = reducedMotion ? 0 : cooled(age, 1.5)
          const pop = Math.min(1, reducedMotion ? p.finish : age / 0.12 + 0.2)
          const x = sx + b.x * s, z = sz + b.z * s
          M.makeScale(b.sx * s * pop, b.sy * s * 2 * pop, b.sz * s * pop).setPosition(x, y, z)
          for (let k = 0; k < 16; k++) put(MA, n * 16 + k, M.elements[k], dirty.matrix)
          heatColor(heat, looks.bead, K)
          put(CA, n * 3, K.r, dirty.tint); put(CA, n * 3 + 1, K.g, dirty.tint); put(CA, n * 3 + 2, K.b, dirty.tint)
          n++
          if (heat > 0.12) glows.add(x, y + b.sy * s, z, (0.05 + heat * 0.07) * s, heatColor(Math.min(1, heat + 0.3), looks.bead, K), heat * 0.75)
        }
      } else {
        if (camera.position.distanceTo(p.pos) < Math.max(p.spec.fw, p.spec.fd) * p.scale * 2.6) continue
        for (const st of script.strokes) {
          const done = reducedMotion ? (p.finish >= 1 ? st.len : 0) : clamp((now - st.t0) / st.dur, 0, 1) * st.len
          if (done <= 0) continue
          t0 = st.t0
          rate0 = st.dur / st.len
          chunks(st, done, seg)
        }
      }
    }
    m.count = n
    reportRef.current.beads = n
    reportRef.current.strokes = e
    flush(m.instanceMatrix, dirty.matrix)
    flush(m.instanceColor, dirty.tint)
    gpu.etchGeo.setDrawRange(0, e * 2)
    flush(pos, dirty.pos)
    flush(col, dirty.col)
  })
  return (
    <>
      <instancedMesh ref={beads} args={[gpu.bead, gpu.beadMat, BEADS]} frustumCulled={false} boundingSphere={SCENE} raycast={() => null} />
      <lineSegments geometry={gpu.etchGeo} material={gpu.etchMat} frustumCulled={false} />
    </>
  )
}

/** Calls `seg` for each chunk of a stroke up to length `upto`, with the chunk's start and end distance along the stroke. */
function chunks(st: Stroke, upto: number, seg: (ax: number, az: number, bx: number, bz: number, d0: number, d1: number) => void) {
  for (let i = 1; i < st.pts.length; i++) {
    const a = st.pts[i - 1], b = st.pts[i]
    const s0 = st.cum[i - 1], s1 = st.cum[i]
    if (s0 >= upto) break
    const end = Math.min(s1, upto)
    const len = s1 - s0 || 1
    const pieces = Math.max(1, Math.ceil((end - s0) / CHUNK))
    for (let j = 0; j < pieces; j++) {
      const d0 = s0 + ((end - s0) * j) / pieces, d1 = s0 + ((end - s0) * (j + 1)) / pieces
      const f0 = (d0 - s0) / len, f1 = (d1 - s0) / len
      seg(a.x + (b.x - a.x) * f0, a.z + (b.z - a.z) * f0, a.x + (b.x - a.x) * f1, a.z + (b.z - a.z) * f1, d0, d1)
    }
  }
}
