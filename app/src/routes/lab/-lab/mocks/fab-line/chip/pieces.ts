import { BoxGeometry, Color, EdgesGeometry, Float32BufferAttribute } from 'three'
import type { BufferGeometry } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import { standoff } from '../core/spec'
import type { Spec } from '../core/spec'

/**
 * A package as tagged boxes. `layer` says what the box is physically, so the
 * overview merges everything but the die into one body, and the close-up
 * splits it: the cap lifts, the halves part along x = 0, the layers explode.
 * `paint` picks the body or the plated-metal color.
 */
export type Layer = 'lead' | 'body' | 'cap' | 'paddle' | 'die'
export type Piece = { layer: Layer; paint: 'body' | 'pin'; size: [number, number, number]; at: [number, number, number]; edge: boolean }
/** Where the die sits and how big it is, in package units. */
export type Cavity = { x: number; y: number; w: number; d: number }

/** The mold splits at this fraction of the body height: below is the base that holds the die, above is the cap. */
const PARTING = 0.6

export function cavityOf(spec: Spec): Cavity {
  if (spec.pkg === 'module') return { x: spec.w * 0.12, y: 0.48, w: spec.w * 0.56 * 0.72, d: spec.d * 0.72 * 0.72 }
  if (spec.pkg === 'passive') return { x: 0, y: spec.h * PARTING, w: spec.w * 0.56, d: spec.d * 0.62 }
  const so = standoff(spec)
  return { x: 0, y: so + spec.h * PARTING, w: spec.w * 0.56, d: spec.d * 0.56 }
}

/** Every box in the package. `split` cuts the mold into base and cap; the overview keeps it whole. */
export function piecesOf(spec: Spec, split: boolean): Piece[] {
  const out: Piece[] = []
  const add = (layer: Layer, paint: Piece['paint'], sx: number, sy: number, sz: number, x: number, y: number, z: number, edge = false) =>
    out.push({ layer, paint, size: [sx, sy, sz], at: [x, y, z], edge })
  const cav = cavityOf(spec)
  const mold = (y0: number, y1: number, w: number, d: number, x = 0, paint: Piece['paint'] = 'body') => {
    if (!split) return add('body', paint, w, y1 - y0, d, x, (y0 + y1) / 2, 0, true)
    const ym = cav.y
    add('body', paint, w, ym - y0, d, x, (y0 + ym) / 2, 0, true)
    add('cap', paint, w, y1 - ym, d, x, (ym + y1) / 2, 0, true)
  }
  const so = standoff(spec)
  if (spec.pkg === 'module') {
    for (let i = 0; i < 10; i++) for (const r of [-1, 1]) add('lead', 'pin', 0.05, 0.42, 0.05, -1.0 + i * 0.1, 0.21, r * 0.05 + 0.4)
    add('lead', 'pin', 1.1, 0.12, 0.22, -0.55, 0.06, 0.4)
    add('body', 'body', spec.w, 0.06, spec.d, 0, 0.45, 0, true)
    if (split) add('cap', 'pin', spec.w * 0.56, 0.2, spec.d * 0.72, spec.w * 0.12, 0.58, 0, true)
    else add('body', 'pin', spec.w * 0.56, 0.2, spec.d * 0.72, spec.w * 0.12, 0.58, 0, true)
    for (const x of [-0.95, -0.7, -0.45]) add('body', 'body', 0.16, 0.08, 0.3, x, 0.52, -0.3, true)
  } else if (spec.pkg === 'passive') {
    mold(0, spec.h, spec.w, spec.d)
    add('lead', 'pin', 0.12, spec.h + 0.01, spec.d + 0.01, -spec.w / 2 + 0.06, spec.h / 2, 0)
    add('lead', 'pin', 0.12, spec.h + 0.01, spec.d + 0.01, spec.w / 2 - 0.06, spec.h / 2, 0)
  } else {
    mold(so, so + spec.h, spec.w, spec.d)
    const side = (len: number, axis: 'x' | 'z', sign: number, edge: number) => {
      const n = Math.max(3, Math.floor(len / 0.1))
      const pitch = len / n
      const t = 0.028
      for (let i = 0; i < n; i++) {
        const u = -len / 2 + (i + 0.5) * pitch
        const place = (along: number, o: number, sx: number, sy: number, y: number) =>
          axis === 'z' ? add('lead', 'pin', sx, sy, along, u, y, sign * (edge + o)) : add('lead', 'pin', along, sy, sx, sign * (edge + o), y, u)
        if (spec.pkg === 'qfn') place(0.07, 0, t * 1.4, 0.02, 0.01)
        else if (spec.pkg === 'dip') {
          place(0.1, 0.05, t * 1.6, 0.03, so + spec.h * 0.35)
          place(0.03, 0.1, t * 1.6, so + spec.h * 0.35 + 0.05, (so + spec.h * 0.35 - 0.05) / 2)
        } else {
          const l = spec.lead
          place(l * 0.55, l * 0.27, t, 0.025, so + spec.h * 0.45)
          place(0.025, l * 0.55, t, so + spec.h * 0.45, (so + spec.h * 0.45) / 2)
          place(l * 0.45, l * 0.78, t, 0.022, 0.011)
        }
      }
    }
    if (spec.pkg === 'qfp' || spec.pkg === 'qfn') for (const sign of [-1, 1]) { side(spec.w * 0.84, 'z', sign, spec.d / 2); side(spec.d * 0.84, 'x', sign, spec.w / 2) }
    else for (const sign of [-1, 1]) side(spec.w * 0.86, 'z', sign, spec.d / 2)
  }
  if (split) {
    const paddleY = spec.pkg === 'module' ? cav.y + 0.004 : cav.y - spec.h * 0.34
    add('paddle', 'pin', cav.w * 1.22, 0.014, cav.d * 1.22, cav.x, paddleY, 0, true)
    add('die', 'body', cav.w, 0.024, cav.d, cav.x, cav.y + 0.006, 0, true)
  }
  return out
}

const colored = (geo: BufferGeometry, color: Color) => {
  const n = geo.getAttribute('position').count
  const arr = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) arr.set([color.r, color.g, color.b], i * 3)
  geo.setAttribute('color', new Float32BufferAttribute(arr, 3))
  return geo
}

/** Clips a box to one side of the plane x = `cut`; null when nothing is left. `keep` -1 keeps x < cut. */
function clipBox(p: Piece, keep: -1 | 0 | 1, cut: number): Piece | null {
  if (!keep) return p
  const lo = p.at[0] - p.size[0] / 2, hi = p.at[0] + p.size[0] / 2
  const a = keep < 0 ? lo : Math.max(lo, cut), b = keep < 0 ? Math.min(hi, cut) : hi
  if (b - a < 1e-4) return null
  return { ...p, size: [b - a, p.size[1], p.size[2]], at: [(a + b) / 2, p.at[1], p.at[2]] }
}

/**
 * One fill (vertex-colored) and one hairline geometry for the pieces that
 * pass `pick`, optionally clipped to one half. The die and paddle cut a hair
 * past x = 0 so their faces never fight the mold's.
 */
export function buildPieces(list: Piece[], colors: { body: string; pin: string; die: string }, pick: (p: Piece) => boolean, keep: -1 | 0 | 1 = 0) {
  const fills: BufferGeometry[] = []
  const edges: BufferGeometry[] = []
  const paint = { body: new Color(colors.body), pin: new Color(colors.pin), die: new Color(colors.die) }
  for (const raw of list) {
    if (!pick(raw)) continue
    const p = clipBox(raw, keep, raw.layer === 'die' || raw.layer === 'paddle' ? -keep * 0.004 : 0)
    if (!p) continue
    const b = new BoxGeometry(...p.size)
    if (p.edge) edges.push(new EdgesGeometry(b).translate(...p.at))
    b.translate(...p.at)
    fills.push(colored(b, p.layer === 'die' ? paint.die : paint[p.paint]))
  }
  const out = { fill: fills.length ? mergeGeometries(fills)! : null, edges: edges.length ? mergeGeometries(edges)! : null }
  fills.forEach((g) => g.dispose())
  edges.forEach((g) => g.dispose())
  return out
}
