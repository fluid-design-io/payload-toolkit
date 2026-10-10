import type { Agent } from '@/routes/workspace/-workspace/workspace.types'
import type { BoardVariant, Part } from '../../core/contract'
import { chipTop } from '../../core/spec'
import type { Spec } from '../../core/spec'
import { reducedMotion } from '../../core/three'

/**
 * A job is a script: a timeline of phases in natural seconds that the
 * machine plays while the sim runs the job from t = 0 to 1. The Claude drone
 * solders (approach, scan, four tacks, a seam along every pin row, lift);
 * the Codex hexapod etches (approach, raster scan, burn each stroke, lift).
 * Beads and strokes carry the script time they are laid, so the marks and
 * their cooling follow from `part.finish` alone. Coordinates are
 * chip-local at scale 1, centred on the package, y up from its bottom.
 */
export type P2 = { x: number; z: number }
/** A solder joint and the size of its bead. */
export type Bead = P2 & { sx: number; sy: number; sz: number; at: number }
export type Stroke = { pts: P2[]; cum: number[]; len: number; t0: number; dur: number }
export type Phase =
  | { kind: 'approach' | 'scan' | 'lift'; t0: number; dur: number; at: P2 }
  | { kind: 'move'; t0: number; dur: number; from: P2; to: P2 }
  | { kind: 'tack'; t0: number; dur: number; at: P2 }
  | { kind: 'seam'; t0: number; dur: number; from: P2; to: P2 }
  | { kind: 'etch'; t0: number; dur: number; stroke: Stroke }
export type Machine = 'drone' | 'hexapod'
export type Script = {
  machine: Machine
  total: number
  phases: Phase[]
  beads: Bead[]
  strokes: Stroke[]
  /** Height of the worked surface: the joints for solder, the lid for etching. */
  y: number
  /** The worked area, for scans. */
  area: { x0: number; x1: number; z0: number; z1: number }
}

export const machineOf = (agent: Agent): Machine | null => (agent === 'claude' ? 'drone' : agent === 'codex' ? 'hexapod' : null)

type Row = { pins: Bead[] }
const bead = (x: number, z: number, sx: number, sy: number, sz: number): Bead => ({ x, z, sx, sy, sz, at: 0 })

/** Pin rows in seam order, matching the package's lead layout. Quad packages run once around the body. */
export function pinRows(spec: Spec): Row[] {
  const { pkg, w, d, lead } = spec
  if (pkg === 'passive') return [-1, 1].map((s) => ({ pins: [bead(s * (w / 2 - 0.06), 0, 0.13, 0.05, d + 0.06)] }))
  if (pkg === 'module') return [0.35, 0.45].map((z, r) => ({ pins: Array.from({ length: 10 }, (_, i) => bead(r ? -0.1 - i * 0.1 : -1.0 + i * 0.1, z, 0.05, 0.035, 0.05)) }))
  const off = pkg === 'qfn' ? 0.02 : pkg === 'dip' ? 0.1 : lead * 0.78
  const along = (len: number) => {
    const n = Math.max(3, Math.floor(len / 0.1))
    return Array.from({ length: n }, (_, i) => -len / 2 + (i + 0.5) * (len / n))
  }
  const [sa, so] = pkg === 'dip' ? [0.07, 0.07] : pkg === 'qfn' ? [0.045, 0.06] : [0.045, 0.08]
  const zRow = (sign: number, len: number) => {
    const us = along(len)
    if (sign > 0) us.reverse()
    return { pins: us.map((u) => bead(u, sign * (d / 2 + off), sa, 0.026, so)) }
  }
  const xRow = (sign: number, len: number) => {
    const us = along(len)
    if (sign < 0) us.reverse()
    return { pins: us.map((u) => bead(sign * (w / 2 + off), u, so, 0.026, sa)) }
  }
  if (pkg === 'qfp' || pkg === 'qfn') return [zRow(-1, w * 0.84), xRow(1, d * 0.84), zRow(1, w * 0.84), xRow(-1, d * 0.84)]
  return [zRow(-1, w * 0.86), zRow(1, w * 0.86)]
}

/** The lid area a laser can mark: the whole lid, or the raised block of a mezzanine module. */
function lid(spec: Spec) {
  if (spec.pkg === 'module') {
    const cx = spec.w * 0.12, hw = spec.w * 0.28, hd = spec.d * 0.36
    return { x0: cx - hw, x1: cx + hw, z0: -hd, z1: hd }
  }
  return { x0: -spec.w / 2, x1: spec.w / 2, z0: -spec.d / 2, z1: spec.d / 2 }
}

function stroke(pts: P2[]): Stroke {
  const cum = [0]
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z))
  return { pts, cum, len: cum[cum.length - 1], t0: 0, dur: 0 }
}

/** What the laser writes on a lid: an inset border, the `>_` prompt, then lines of "code" sized to the lid. */
export function etchStrokes(spec: Spec): Stroke[] {
  const a = lid(spec)
  const W = a.x1 - a.x0, D = a.z1 - a.z0
  const m = Math.min(0.07, 0.14 * Math.min(W, D))
  const x0 = a.x0 + m, x1 = a.x1 - m, z0 = a.z0 + m, z1 = a.z1 - m
  const out = [stroke([{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }, { x: x0, z: z0 }])]
  const gh = Math.min((z1 - z0) * 0.42, 0.24), gw = gh * 0.55
  const gl = x0 + Math.min(0.12, W * 0.08)
  if (gh > 0.05 && W > 0.7) {
    out.push(stroke([{ x: gl, z: -gh / 2 }, { x: gl + gw, z: 0 }, { x: gl, z: gh / 2 }]))
    out.push(stroke([{ x: gl + gw * 1.35, z: gh / 2 }, { x: gl + gw * 2.4, z: gh / 2 }]))
  }
  const lx = gh > 0.05 && W > 0.7 ? gl + gw * 3.2 : x0 + 0.06
  const room = x1 - 0.06 - lx
  if (room > 0.12) {
    const rows = z1 - z0 > 0.42 ? [-0.24, 0, 0.24] : [0]
    const fill = [0.92, 0.58, 0.76]
    rows.forEach((f, i) => {
      const z = f * (z1 - z0)
      out.push(stroke([{ x: lx, z }, { x: lx + room * fill[i], z }]))
    })
  }
  return out
}

const sweep = (from: P2, to: P2, speed: number, min: number) => Math.max(min, Math.hypot(to.x - from.x, to.z - from.z) / speed)

function weld(spec: Spec): Script {
  const rows = pinRows(spec)
  const phases: Phase[] = []
  let t = 0
  const push = (p: Phase) => { phases.push(p); t += p.dur }
  const center = { x: 0, z: 0 }
  push({ kind: 'approach', t0: t, dur: 0.95, at: center })
  push({ kind: 'scan', t0: t, dur: 0.85, at: center })
  const tacks = rows.length === 4 ? rows.map((r) => r.pins[0]) : rows.flatMap((r) => (r.pins.length > 1 ? [r.pins[0], r.pins[r.pins.length - 1]] : r.pins))
  let at: P2 = center
  for (const p of tacks) {
    push({ kind: 'move', t0: t, dur: 0.18, from: at, to: p })
    push({ kind: 'tack', t0: t, dur: 0.3, at: p })
    p.at = t - 0.12
    at = p
  }
  for (const r of rows) {
    const a = r.pins[0], b = r.pins[r.pins.length - 1]
    push({ kind: 'move', t0: t, dur: 0.28, from: at, to: a })
    const dur = Math.max(0.42, r.pins.length * 0.05)
    const t0 = t
    push({ kind: 'seam', t0, dur, from: a, to: b })
    r.pins.forEach((p, i) => {
      if (!tacks.includes(p)) p.at = t0 + (r.pins.length > 1 ? i / (r.pins.length - 1) : 0.5) * dur
    })
    at = b
  }
  push({ kind: 'lift', t0: t, dur: 0.6, at })
  const beads = rows.flatMap((r) => r.pins)
  const xs = beads.map((b) => b.x), zs = beads.map((b) => b.z)
  return { machine: 'drone', total: t, phases, beads, strokes: [], y: spec.pkg === 'dip' ? 0.004 : 0.012, area: { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) } }
}

function etch(spec: Spec): Script {
  const strokes = etchStrokes(spec)
  const a = lid(spec)
  const phases: Phase[] = []
  let t = 0
  const push = (p: Phase) => { phases.push(p); t += p.dur }
  const center = { x: (a.x0 + a.x1) / 2, z: 0 }
  push({ kind: 'approach', t0: t, dur: 2.2, at: center })
  push({ kind: 'scan', t0: t, dur: 0.95, at: center })
  let at: P2 = { x: a.x0, z: a.z1 }
  for (const s of strokes) {
    push({ kind: 'move', t0: t, dur: sweep(at, s.pts[0], 3.2, 0.1), from: at, to: s.pts[0] })
    s.t0 = t
    s.dur = Math.max(0.18, s.len / 1.7)
    push({ kind: 'etch', t0: t, dur: s.dur, stroke: s })
    at = s.pts[s.pts.length - 1]
  }
  push({ kind: 'lift', t0: t, dur: 0.5, at })
  return { machine: 'hexapod', total: t, phases, beads: [], strokes, y: chipTop(spec) + 0.004, area: a }
}

const cache = { drone: new WeakMap<Spec, Script>(), hexapod: new WeakMap<Spec, Script>() }
export function scriptOf(machine: Machine, spec: Spec) {
  let s = cache[machine].get(spec)
  if (!s) cache[machine].set(spec, (s = machine === 'drone' ? weld(spec) : etch(spec)))
  return s
}

/** The point on a stroke `d` along its length. */
export function strokeAt(s: Stroke, d: number, out: P2) {
  let i = 1
  while (i < s.pts.length - 1 && s.cum[i] < d) i++
  const a = s.pts[i - 1], b = s.pts[i]
  const seg = s.cum[i] - s.cum[i - 1] || 1
  const f = Math.min(1, Math.max(0, (d - s.cum[i - 1]) / seg))
  out.x = a.x + (b.x - a.x) * f
  out.z = a.z + (b.z - a.z) * f
  return out
}

/** Where the tool is at script time `time`: the phase, its 0..1 progress, the point, and whether the arc or beam burns. */
export type Tool = { phase: Phase; u: number; x: number; z: number; on: boolean }
export function toolAt(s: Script, time: number, out: Tool) {
  let k = 0
  while (k < s.phases.length - 1 && time >= s.phases[k].t0 + s.phases[k].dur) k++
  const ph = s.phases[k]
  const u = Math.min(1, Math.max(0, (time - ph.t0) / ph.dur))
  out.phase = ph
  out.u = u
  out.on = false
  if (ph.kind === 'move' || ph.kind === 'seam') {
    const e = ph.kind === 'move' ? u * u * (3 - 2 * u) : u
    out.x = ph.from.x + (ph.to.x - ph.from.x) * e
    out.z = ph.from.z + (ph.to.z - ph.from.z) * e
    out.on = ph.kind === 'seam'
  } else if (ph.kind === 'etch') {
    strokeAt(ph.stroke, u * ph.stroke.len, out)
    out.on = true
  } else {
    out.x = ph.at.x
    out.z = ph.at.z
    out.on = ph.kind === 'tack' && u > 0.25
  }
  return out
}

/**
 * How many chips wait behind the running job. The mounted station writes it
 * every frame so a long backlog welds faster; a single chip gets the full,
 * slow treatment.
 */
export const backlog = { waiting: 0 }

export function workTime(agent: Agent, part: Part) {
  const m = machineOf(agent)
  if (!m) return 0
  if (reducedMotion) return 1.2
  const w = backlog.waiting
  const rush = w >= 5 ? 0.42 : w >= 3 ? 0.6 : w >= 1 ? 0.8 : 1
  return scriptOf(m, part.spec).total * rush
}

/** The board's surface in its local frame, from its footprint and origin. */
export function surfaceOf(board: BoardVariant) {
  const { origin: o, footprint: f } = board
  return { x0: (f.x0 - o.x) / o.s, x1: (f.x1 - o.x) / o.s, z0: (f.z0 - o.z) / o.s, z1: (f.z1 - o.z) / o.s, y: f.h / o.s }
}
export type Surface = ReturnType<typeof surfaceOf>
