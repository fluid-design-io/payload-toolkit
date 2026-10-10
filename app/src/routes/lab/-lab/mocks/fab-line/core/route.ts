import { CatmullRomCurve3 } from 'three'
import type { Vector3 } from 'three'

import type { Route, RouteStyle } from './contract'

function chamfer(corners: Vector3[], r: number) {
  const out = [corners[0]]
  for (let i = 1; i < corners.length - 1; i++) {
    const a = corners[i - 1], p = corners[i], b = corners[i + 1]
    const c = Math.min(r, a.distanceTo(p) / 2, p.distanceTo(b) / 2)
    out.push(p.clone().addScaledVector(p.clone().sub(a).normalize(), -c), p.clone().addScaledVector(b.clone().sub(p).normalize(), c))
  }
  out.push(corners[corners.length - 1])
  return out
}

function densify(poly: Vector3[], step = 0.06) {
  const pts: Vector3[] = [poly[0].clone()]
  for (let i = 1; i < poly.length; i++) {
    const a = poly[i - 1], b = poly[i]
    const n = Math.max(1, Math.ceil(a.distanceTo(b) / step))
    for (let k = 1; k <= n; k++) pts.push(a.clone().lerp(b, k / n))
  }
  return pts
}

/** A trace through `corners` in the given style, densified so it can be drawn and sampled by length. */
export function makeRoute(corners: Vector3[], style: RouteStyle, vias: Vector3[]): Route {
  let pts: Vector3[]
  if (style === 'manhattan') pts = densify(corners)
  else if (style === 'diagonal') pts = densify(chamfer(corners, 0.32))
  else {
    const soft = chamfer(corners, 0.9)
    const curve = new CatmullRomCurve3(soft, false, 'centripetal', 0.5)
    const len = curve.getLength()
    pts = curve.getSpacedPoints(Math.max(8, Math.ceil(len / 0.06)))
  }
  const cum = [0]
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]))
  return { pts, vias, len: cum[cum.length - 1], cum }
}

export function sampleRoute(route: Route, t: number, out: Vector3) {
  const d = Math.min(1, Math.max(0, t)) * route.len
  let lo = 0, hi = route.cum.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (route.cum[mid] < d) lo = mid
    else hi = mid
  }
  const seg = route.cum[hi] - route.cum[lo] || 1
  return out.lerpVectors(route.pts[lo], route.pts[hi], (d - route.cum[lo]) / seg)
}
