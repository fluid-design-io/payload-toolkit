import type { Vector3 } from 'three'

import type { PathTransport, Site } from '../../core/contract'
import { lazyComponent } from '../../core/lazy'
import { RIDE, courseOf, rateAt } from './monorail/course'
import type { Course } from './monorail/course'

/**
 * A rollercoaster round the campus. A car leaves the station behind the
 * arm's rail, clacks up the chain lift, hangs at the crest, dives down the
 * first drop and slams through the bottom hard enough to shake the room,
 * leans hard round the board's far end, pops its part off the cup over a
 * camelback, skims the front over two bunny hops, climbs a helix in front of
 * the table, drops off its top and is grabbed by the brakes, which crawl it
 * up to the arm. Empty cars roll back along the station straight and queue
 * nose to tail at the load gate.
 */
export const GAP = 8.5

function wrap(site: Site) {
  const course = courseOf(site)
  return { pts: course.pts, pace: (s: number) => rateAt(course, s), data: course }
}

export const monorail: PathTransport<Course> = {
  id: 'monorail',
  kind: 'path',
  label: 'Monorail',
  footprint: { x0: -8.5, x1: 0.1, z0: -3.55, z1: -0.45, h: 4.55 },
  frame: { pts: [[-8.8, 0, -8], [2.2, 0, -8], [2.2, 0, 7.6], [-8.8, 0, 7.6], [-4.3, 4.2, 5.2], [1.6, 7.2, -7.6]] },
  length: RIDE.end - RIDE.start,
  speed: RIDE.lift,
  gap: GAP,
  at: (u: number, out: Vector3) => out.set(RIDE.start + u, RIDE.y, RIDE.z),
  load: { dur: 0.6, h: 1.1 },
  hum: 0.4,
  wrap,
  Component: lazyComponent(() => import('./monorail').then((m) => m.Monorail)),
}
