import type { Vector3 } from 'three'

import type { CabinetVariant } from '../../core/contract'
import { lazyComponent } from '../../core/lazy'
import { cabinetFrame } from './frame'

/**
 * A rotary vertical lift: one tray per aisle hangs from twin chains on a
 * vertical loop. Opening an aisle retracts the presented tray, turns the
 * loop the short way round until that aisle's tray reaches the access
 * window, then slides it out onto the counter. Everything goes in and out
 * through that window, so it is also where parts off the table rest.
 */
export const P = { cx: -12.0, w: 3.6, d: 0.4, h: 0.34, hang: 0.1, r: 0.75, zf: -2.75, yb: 1.35, L: 10.08, win: 2.6, slide: 0.5 }
export const RUN = (P.L - 2 * Math.PI * P.r) / 2
export const YT = P.yb + RUN
export const ZC = P.zf - P.r
export const ZB = P.zf - 2 * P.r
export const SW = P.win - P.yb
export const H = YT + P.r + 0.22
export const HX = { x0: P.cx - P.w / 2 - 0.25, x1: P.cx + P.w / 2 + 0.25, z0: ZB - P.d / 2 - 0.12, z1: P.zf + P.d / 2 + 0.08 }
export const SCREEN = { x: HX.x1 + 0.86, y: 2.65, z: -2.4, w: 1.44, h: 2.3, rot: 0.32 }
export const TRAY_Y = -P.hang - P.h
export const CROWN = { w: 3.4, h: 0.62, y: H + 0.42 }

function drawer(aisle: number, out: Vector3) {
  return out.set(P.cx - 1.2 + (aisle % 6) * 0.48, P.win + TRAY_Y + 0.04, P.zf + P.slide)
}

export const paternoster: CabinetVariant = {
  id: 'paternoster',
  label: 'Paternoster',
  ...cabinetFrame({ x0: HX.x0, x1: SCREEN.x + SCREEN.w / 2 + 0.05, z0: HX.z0, z1: HX.z1 + 0.45, h: CROWN.y + CROWN.h / 2 }, [[HX.x0 - 0.2, 0.9, HX.z1], [HX.x0 - 0.2, H, HX.z0], [HX.x0 - 0.2, CROWN.y + 0.4, HX.z1], [SCREEN.x + 0.7, CROWN.y + 0.4, HX.z1], [SCREEN.x + 0.7, 0.9, HX.z1 + 0.6]], 16),
  drawer,
  Component: lazyComponent(() => import('./paternoster').then((m) => m.Paternoster)),
}
