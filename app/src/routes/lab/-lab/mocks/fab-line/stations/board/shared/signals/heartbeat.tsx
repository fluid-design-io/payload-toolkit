import { useFrame } from '@react-three/fiber'
import { useEffect, useState } from 'react'
import {
  AdditiveBlending, BufferAttribute, BufferGeometry, Color, CylinderGeometry, DynamicDrawUsage, InstancedBufferAttribute, InstancedMesh, Matrix4,
  MeshBasicMaterial, NormalBlending, Points, ShaderMaterial, Vector3,
} from 'three'

import type { Part, Route, SignalProps, SimEvent, Tokens } from '../../../../core/contract'
import { keepAnimating } from '../../../../../../kit/busy'
import { sampleRoute, viaDistances } from '../../../../core/route'
import { useSimEvents } from '../../../../core/scene'
import { reducedMotion } from '../../../../core/three'
import { isDark } from '../../../../fx/heat'

/** A wavefront's shape along a trace: units per second, comb spacing, front softness, tail decay and cutoff. */
type Wave = { speed: number; step: number; lead: number; decay: number; tail: number; size: number }
const DATA: Wave = { speed: 7, step: 0.13, lead: 0.16, decay: 0.38, tail: 1.3, size: 0.26 }
const POWER: Wave = { speed: 2.2, step: 0.26, lead: 0.45, decay: 0.6, tail: 1.8, size: 0.3 }

/** One beat leaving the heart: when, how hard, and which traces carry it. */
type Beat = { t0: number; amp: number; live: boolean; power: boolean; part: Part | null; drawingOnly: boolean }

const CAP = 3200
const VIA_CAP = 400
const BEATS = 32
const SHAPE_BEAD = 0, SHAPE_RING = 1
const ATTRS = ['position', 'aColor', 'aAux'] as const

const VERT = /* glsl */ `
attribute vec4 aColor;
attribute vec3 aAux;
uniform float uHalfH;
uniform float uDpr;
varying vec4 vColor;
varying vec2 vAux;
void main() {
  vColor = aColor;
  vAux = aAux.yz;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float k = length(modelMatrix[0].xyz);
  float px = aAux.x * k * projectionMatrix[1][1] * uHalfH / max(0.001, -mv.z);
  mv.xyz += normalize(-mv.xyz) * aAux.x * k * mix(0.6, 1.2, aAux.z);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = max(2.5 * uDpr, px);
}
`
const FRAG = /* glsl */ `
uniform vec3 uHot;
uniform float uHotAmt;
uniform vec3 uRing;
uniform float uRingAmt;
uniform float uHalo;
varying vec4 vColor;
varying vec2 vAux;
void main() {
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float d = length(q);
  if (d >= 1.0) discard;
  float aa = max(fwidth(d), 0.02);
  float rgb_a, ring_a;
  vec3 col = mix(vColor.rgb, uHot, (1.0 - smoothstep(0.0, 0.35, d)) * uHotAmt * vAux.x);
  if (vAux.y > 0.5) {
    float band = 1.0 - smoothstep(0.08 - aa, 0.08 + aa, abs(d - 0.82));
    float glow = (1.0 - abs(d - 0.82) / 0.82) * uHalo * 0.5;
    rgb_a = max(band, glow);
    ring_a = 0.0;
  } else {
    float core = 1.0 - smoothstep(0.52 - aa, 0.52 + aa, d);
    float edge = (1.0 - smoothstep(0.74 - aa, 0.74 + aa, d)) - core;
    float halo = (1.0 - d) * (1.0 - d) * uHalo * (1.0 - core);
    ring_a = edge * uRingAmt;
    rgb_a = core + halo;
  }
  float a = (rgb_a + ring_a) * vColor.a;
  if (a <= 0.003) discard;
  gl_FragColor = vec4((col * rgb_a + uRing * ring_a) / max(rgb_a + ring_a, 0.0001), a);
  #include <colorspace_fragment>
}
`

/** Board rhythm and the GPU buffers it writes, mutated only from the frame loop. */
function makeHeart() {
  const geo = new BufferGeometry()
  const pos = new Float32Array(CAP * 3), col = new Float32Array(CAP * 4), aux = new Float32Array(CAP * 3)
  geo.setAttribute('position', new BufferAttribute(pos, 3).setUsage(DynamicDrawUsage))
  geo.setAttribute('aColor', new BufferAttribute(col, 4).setUsage(DynamicDrawUsage))
  geo.setAttribute('aAux', new BufferAttribute(aux, 3).setUsage(DynamicDrawUsage))
  geo.setDrawRange(0, 0)
  const mat = new ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      uHalfH: { value: 450 }, uDpr: { value: 1 }, uHot: { value: new Color() }, uHotAmt: { value: 0 }, uRing: { value: new Color() }, uRingAmt: { value: 0 }, uHalo: { value: 0 },
    },
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  })
  const points = new Points(geo, mat)
  points.frustumCulled = false
  points.renderOrder = 4
  const viaGeo = new CylinderGeometry(0.07, 0.07, 0.006, 16)
  const viaMat = new MeshBasicMaterial({ toneMapped: false })
  const vias = new InstancedMesh(viaGeo, viaMat, VIA_CAP)
  vias.instanceColor = new InstancedBufferAttribute(new Float32Array(VIA_CAP * 3), 3)
  vias.frustumCulled = false
  vias.count = 0
  const beats: Beat[] = []
  for (let i = 0; i < BEATS; i++) beats.push({ t0: 0, amp: 0, live: false, power: false, part: null, drawingOnly: false })
  return {
    points, geo, mat, pos, col, aux, n: 0,
    vias, viaGeo, viaMat,
    beats, next: 0,
    /** Seconds of board time, phase of the data and power clocks, and excitement that decays toward rest. */
    now: 0, phase: 0, powerPhase: 0, energy: 0,
    lit: new Color(), spark: new Color(), pin: new Color(), board: new Color(), tmp: new Color(),
    dark: true,
    /** What each via instance shows (`part index × 64 + via index`) and at what scale, so only changed instances upload. */
    viaId: new Int32Array(VIA_CAP).fill(-1),
    viaK: new Float32Array(VIA_CAP),
    version: -1,
    hue: new WeakMap<Part, Color>(),
    hueKey: null as ((p: Part) => string) | null,
    m: new Matrix4(), v: new Vector3(), s: new Vector3(),
  }
}
type Heart = ReturnType<typeof makeHeart>

function emit(h: Heart, amp: number, power: boolean, part: Part | null, drawingOnly: boolean) {
  const b = h.beats[h.next]
  h.next = (h.next + 1) % BEATS
  b.t0 = h.now; b.amp = amp; b.live = true; b.power = power; b.part = part; b.drawingOnly = drawingOnly
}

/** How bright a dot `x` units behind a wavefront is: a quick rise ahead of it and a decaying tail behind. */
function envelope(x: number, w: Wave) {
  if (x < 0) {
    const t = 1 + x / w.lead
    return t > 0 ? t * t : 0
  }
  return x > w.tail ? 0 : Math.exp(-x / w.decay)
}

function put(h: Heart, x: number, y: number, z: number, color: Color, alpha: number, size: number, heat: number, shape: number) {
  if (h.n >= CAP || alpha <= 0.01) return
  const i = h.n++
  h.pos[i * 3] = x; h.pos[i * 3 + 1] = y; h.pos[i * 3 + 2] = z
  h.col[i * 4] = color.r; h.col[i * 4 + 1] = color.g; h.col[i * 4 + 2] = color.b; h.col[i * 4 + 3] = Math.min(1, alpha)
  h.aux[i * 3] = size; h.aux[i * 3 + 1] = heat; h.aux[i * 3 + 2] = shape
}

/**
 * Lights the comb dots of one wavefront on `route`. The front is at arc length `front`, moving toward
 * increasing arc length when `dir` is 1. Dots sit at fixed multiples of the comb step, so a front moving
 * faster than a dot per frame still reads as a smooth chase at 30 Hz.
 */
function band(h: Heart, route: Route, front: number, dir: number, reach: number, w: Wave, amp: number, color: Color, lift: number) {
  const lo = Math.max(0, dir > 0 ? front - w.tail : front - w.lead)
  const hi = Math.min(reach, dir > 0 ? front + w.lead : front + w.tail)
  if (hi < lo) return
  for (let k = Math.ceil(lo / w.step); k * w.step <= hi; k++) {
    const s = k * w.step
    const e = envelope(dir * (front - s), w)
    const a = amp * e
    if (a < 0.03) continue
    sampleRoute(route, s / route.len, h.v)
    put(h, h.v.x, h.v.y + lift, h.v.z, color, a, w.size * (0.45 + 0.55 * e), e, SHAPE_BEAD)
  }
}

/** How strongly every beat in flight is passing arc length `at` right now (vias and chip ends tick on it). */
function passing(h: Heart, p: Part, at: number) {
  let pop = 0
  for (const b of h.beats) {
    if (!b.live || b.power || !carries(b, p)) continue
    const x = (h.now - b.t0) * DATA.speed - at
    if (x < -0.15 || x > 0.9) continue
    pop += b.amp * Math.exp(-(x * x) / 0.06)
  }
  return pop
}

const carries = (b: Beat, p: Part) => (b.part ? b.part === p : !b.drawingOnly || p.drawn < 1)

function colorFor(h: Heart, p: Part, colorOf: ((p: Part) => string) | undefined) {
  if (!colorOf) return h.lit
  if (h.hueKey !== colorOf) { h.hue = new WeakMap(); h.hueKey = colorOf }
  let c = h.hue.get(p)
  if (!c) { c = new Color(colorOf(p)); h.hue.set(p, c) }
  return c
}

function uploadRange(a: BufferAttribute, from: number, to: number) {
  a.clearUpdateRanges()
  a.addUpdateRange(from * a.itemSize, (to - from) * a.itemSize)
  a.needsUpdate = true
}

function theme(h: Heart, c: Tokens) {
  h.viaId.fill(-1)
  h.lit.set(c.lit); h.spark.set(c.spark); h.pin.set(c.pin); h.board.set(c.board)
  h.dark = isDark(c)
  const u = h.mat.uniforms
  h.mat.blending = h.dark ? AdditiveBlending : NormalBlending
  h.mat.needsUpdate = true
  ;(u.uHot.value as Color).copy(h.spark)
  u.uHotAmt.value = h.dark ? 0.75 : 0
  ;(u.uRing.value as Color).copy(h.board)
  u.uRingAmt.value = h.dark ? 0 : 1
  u.uHalo.value = h.dark ? 0.55 : 0
}

/** How the rhythm answers line events: a seat startles it, a finished trace and a weld each send a beat. */
function react(h: Heart, e: SimEvent) {
  if (reducedMotion) return
  // An event's beat outruns the sim's busy frames on the longer traces, so it holds full rate while it crosses the board.
  if (e.kind === 'seat' || e.kind === 'chirp' || e.kind === 'done') keepAnimating(2.5)
  if (e.kind === 'seat') {
    h.energy = Math.max(h.energy, 0.9)
    h.phase = 0
    emit(h, 1.05, false, null, false)
  } else if (e.kind === 'chirp') {
    emit(h, 1.3, false, e.part, false)
  } else if (e.kind === 'work') {
    h.energy = Math.max(h.energy, 0.6)
  } else if (e.kind === 'done') {
    h.energy = 1
    h.phase = 0
    emit(h, 1.9, false, null, false)
    emit(h, 1.2, true, null, false)
  }
}

/** Advances the rhythm one frame and rewrites every dot and via. */
function step(h: Heart, { sim, version, statics, lift, colorOf }: SignalProps, height: number, dpr: number, delta: number) {
  // A replan moves routes under the same part and via indices, so every via instance is rewritten once.
  if (h.version !== version) { h.version = version; h.viaId.fill(-1) }
  const dt = Math.min(delta, 0.1)
  h.now += dt
  h.mat.uniforms.uHalfH.value = height * dpr * 0.5
  h.mat.uniforms.uDpr.value = dpr

  let drawing = false
  for (const p of sim.list) if (p.mode === 'seated' && p.route && p.drawn < 1) drawing = true
  const floor = drawing || sim.work.job ? 0.55 : 0
  h.energy += (floor - h.energy) * (1 - Math.exp(-dt / 2.6))

  if (!reducedMotion) {
    const rate = 0.48 + 1.25 * h.energy
    const before = h.phase
    h.phase += rate * dt
    if (drawing && before < 0.5 && h.phase >= 0.5) emit(h, 0.75 + 0.3 * h.energy, false, null, true)
    if (h.phase >= 1) {
      h.phase -= 1
      emit(h, 0.55 + 0.5 * h.energy, false, null, false)
    }
    h.powerPhase += rate * 0.42 * dt
    if (h.powerPhase >= 1) {
      h.powerPhase -= 1
      emit(h, 0.32 + 0.4 * h.energy, true, null, false)
    }
  }
  for (const b of h.beats) if (b.live && h.now - b.t0 > (b.power ? 7 : 6)) b.live = false

  h.n = 0
  let v = 0
  const vias = h.vias
  let lo = VIA_CAP, hi = 0
  for (let pi = 0; pi < sim.list.length; pi++) {
    const p = sim.list[pi]
    const r = p.route
    if (!r || p.mode !== 'seated' || r.len <= 0) continue
    const reach = p.drawn * r.len
    const color = colorFor(h, p, colorOf)

    for (const b of h.beats) {
      if (!b.live || b.power || !carries(b, p)) continue
      band(h, r, (h.now - b.t0) * DATA.speed, 1, reach, DATA, b.amp, color, lift)
    }

    const at = viaDistances(r)
    for (let i = 0; i < at.length && v < VIA_CAP; i++) {
      if (reach < at[i]) continue
      const pop = reducedMotion ? 0 : Math.min(1.2, passing(h, p, at[i]))
      const k = 1 + 0.7 * pop
      const id = pi * 64 + i
      if (h.viaId[v] !== id || h.viaK[v] !== k) {
        h.viaId[v] = id
        h.viaK[v] = k
        const via = r.vias[i]
        vias.setMatrixAt(v, h.m.makeTranslation(via.x, via.y + 0.003, via.z).scale(h.s.set(k, 1, k)))
        vias.setColorAt(v, h.tmp.copy(h.pin).lerp(color, reducedMotion ? 0.55 : Math.min(1, 0.15 + pop)))
        lo = Math.min(lo, v); hi = v + 1
      }
      v++
    }

    if (p.drawn < 1) {
      sampleRoute(r, p.drawn, h.v)
      const surge = reducedMotion ? 0 : Math.min(1, passing(h, p, reach))
      put(h, h.v.x, h.v.y + lift, h.v.z, h.dark ? h.spark : color, 1, 0.46 * (1 + 0.6 * surge), 1, SHAPE_BEAD)
      for (let k = 1; k <= 5; k++) {
        const s = reach - k * DATA.step
        if (s < 0) break
        sampleRoute(r, s / r.len, h.v)
        const e = Math.exp(-k / 2.2)
        put(h, h.v.x, h.v.y + lift, h.v.z, color, 0.85 * e, DATA.size * (0.5 + 0.5 * e), e, SHAPE_BEAD)
      }
    } else {
      sampleRoute(r, 1, h.v)
      const pop = reducedMotion ? 0.7 : Math.min(1.4, passing(h, p, r.len))
      put(h, h.v.x, h.v.y + lift, h.v.z, color, 0.25 + 0.75 * Math.min(1, pop), 0.24 + 0.26 * pop, pop, SHAPE_BEAD)
      if (p.flash > 0) {
        const f = p.flash
        const grow = reducedMotion ? 0.5 : 1 - f
        put(h, h.v.x, h.v.y + lift, h.v.z, h.dark ? h.spark : color, f, 0.6 + 2.6 * grow, 1, SHAPE_RING)
        put(h, h.v.x, h.v.y + lift, h.v.z, color, f * 0.9, 0.5 * f + 0.26, 1, SHAPE_BEAD)
      }
    }
  }

  if (!reducedMotion) {
    for (const r of statics.memory) {
      if (r.len <= 0) continue
      for (const b of h.beats) {
        if (!b.live || b.power || b.part || b.drawingOnly) continue
        const d = (h.now - b.t0) * DATA.speed
        band(h, r, r.len - d, -1, r.len, DATA, b.amp * 0.8, h.lit, lift)
        band(h, r, d - r.len, 1, r.len, DATA, b.amp * 0.45, h.lit, lift)
      }
    }
    for (const r of statics.power) {
      if (r.len <= 0) continue
      for (const b of h.beats) {
        if (!b.live || !b.power) continue
        band(h, r, (h.now - b.t0) * POWER.speed, 1, r.len, POWER, b.amp, h.lit, lift)
      }
    }
  }

  vias.count = v
  if (hi > lo) {
    uploadRange(vias.instanceMatrix, lo, hi)
    uploadRange(vias.instanceColor!, lo, hi)
  }
  const was = h.points.visible
  h.geo.setDrawRange(0, h.n)
  h.points.visible = h.n > 0
  if (!h.n && !was) return
  for (const name of ATTRS) uploadRange(h.geo.getAttribute(name) as BufferAttribute, 0, h.n)
}

/**
 * The board keeps one rhythm. A clock beat leaves the CPU end of every live trace at the same speed, so
 * all traces pulse in step and longer ones hear it later; power flows as a slower current out of the
 * power stage; vias and chip ends tick as a beat passes. Seats quicken and brighten the beat, the trace
 * being drawn gets a doubled beat, and a finished chip sends one strong beat before the board relaxes.
 */
export function Heartbeat(props: SignalProps) {
  const { sim, c } = props
  const [h] = useState(makeHeart)
  useEffect(() => () => { h.geo.dispose(); h.mat.dispose(); h.viaGeo.dispose(); h.viaMat.dispose(); h.vias.dispose() }, [h])
  useEffect(() => theme(h, c), [h, c])

  useSimEvents(sim, (e: SimEvent) => react(h, e))
  useFrame((state, delta) => step(h, props, state.size.height, state.viewport.dpr, delta))

  return (
    <>
      <primitive object={h.vias} />
      <primitive object={h.points} />
    </>
  )
}

