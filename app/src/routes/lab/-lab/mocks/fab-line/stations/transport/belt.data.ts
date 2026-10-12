import type { Vector3 } from 'three'

import type { PathTransport, Site } from '../../core/contract'
import { lazyComponent } from '../../core/lazy'
import { rounded } from './track'
import type { P3 } from './track'

/**
 * A conveyor that takes the long way round the campus: out of the table's
 * edge, along the front past the board, round its far end, back behind the
 * rail and into the arm's bay, where the old straight belt ended and the arm
 * still picks.
 */
export const BELT = { start: -6.6, end: -0.9, z: -1.2, y: 0.9, speed: 6.5, gap: 1.3, w: 1.3, r: 1.1 }
/** Clearance from the stations the loop runs around; the back lane also clears the arm's base on the rail. */
const MARGIN = { side: 1.25, back: 1.55 }

/**
 * Named lanes a route can refer to, in the transport's frame: the belt's own lane and the clearances around the campus.
 * `out` and `bay` sit two radii from the belt's ends: `rounded` gives a corner at most half an end leg, and a shorter
 * leg turns the belt tighter than it is wide.
 */
export type Lane = { y: number; z: number; out: number; bay: number; front: number; back: number; far: number }
export function laneOf(site: Site): Lane {
  return {
    y: BELT.y,
    z: BELT.z,
    out: BELT.start + 2 * BELT.r,
    bay: BELT.end - 2 * BELT.r,
    front: Math.max(site.pick.z1, site.board.z1) + MARGIN.side,
    back: Math.min(site.board.z0, site.rail.z) - MARGIN.back,
    far: site.board.x1 + MARGIN.side,
  }
}
/** The corners between leaving the table's lane at `out` and re-entering it at `bay`, as [x, z] pairs. */
export type Via = (site: Site, lane: Lane) => readonly (readonly [number, number])[]
const around: Via = (_, l) => [[l.out, l.front], [l.far, l.front], [l.far, l.back], [l.bay, l.back]]

function wrapper(via: Via) {
  return (site: Site) => {
    const l = laneOf(site)
    const { y, z } = l
    const corners: P3[] = [[BELT.start, y, z], [l.out, y, z], ...via(site, l).map(([x, zz]): P3 => [x, y, zz]), [l.bay, y, z], [BELT.end, y, z]]
    return { pts: rounded(corners, BELT.r).filter((p, i, all) => !i || p.distanceToSquared(all[i - 1]) > 1e-8), data: undefined }
  }
}

/** A conveyor that runs the given route; the default runs round the board. */
export function makeBelt(id: string, label: string, via: Via = around): PathTransport {
  return {
    id,
    kind: 'path',
    label,
    footprint: { x0: BELT.start - 0.5, x1: BELT.end + 0.5, z0: BELT.z - 0.7, z1: BELT.z + 0.7, h: BELT.y },
    frame: { pts: [[BELT.start - 0.8, 0, BELT.z - 1.4], [BELT.start - 0.8, 0, BELT.z + 1.4], [BELT.end + 0.8, 0, BELT.z + 1.4], [BELT.end + 0.8, 1.6, BELT.z - 1.4]] },
    length: BELT.end - BELT.start,
    speed: BELT.speed,
    gap: BELT.gap,
    at: (u: number, out: Vector3) => out.set(BELT.start + u, BELT.y, BELT.z),
    load: { dur: 0.55, h: 1.7 },
    hum: 1,
    wrap: wrapper(via),
    Component: lazyComponent(() => import('./belt').then((m) => m.Belt)),
  }
}

export const belt = makeBelt('belt', 'Conveyor')
