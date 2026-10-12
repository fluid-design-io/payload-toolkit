import type { PathTransport } from '../../core/contract'
import { lazyComponent } from '../../core/lazy'
import { clamp } from '../../core/three'
import { BAY, DOCK, V0, wrapCourse } from './maglev/course'
import type { Course } from './maglev/course'

/**
 * A maglev that takes the scenic, violent way round the campus. A sled
 * rises out of the dock under each part and drifts toward the camera; a
 * linear motor fires it along the front through a tunnel of coil rings that
 * light just ahead of it, and the sonic boom shakes the whole scene. It
 * climbs into a banked half ring round the board's far end, dives over
 * camelbacks along the back trailing light and glides on glowing eddy
 * brakes into the arm's bay, where the empty sled sinks away.
 */
export const GAP_U = 1.3

const ride = BAY.x - DOCK.x

export const maglev: PathTransport<Course> = {
  id: 'maglev',
  kind: 'path',
  label: 'Maglev',
  footprint: { x0: -8.55, x1: 0.1, z0: -3.15, z1: -0.65, h: 1.5 },
  frame: { pts: [[-8.7, 0, -3.4], [0.4, 0, -3.4], [-8.7, 0, 8.6], [0.4, 3.0, 8.6], [0.4, 2.6, -1.2]], el: 40 },
  length: ride,
  speed: V0,
  gap: GAP_U,
  at: (u, out) => {
    const f = clamp(u / ride, 0, 1)
    return out.set(DOCK.x + (BAY.x - DOCK.x) * f, DOCK.y + (BAY.y - DOCK.y) * f, DOCK.z + (BAY.z - DOCK.z) * f)
  },
  load: { dur: 0.6, h: 1.4 },
  wrap: wrapCourse,
  Component: lazyComponent(() => import('./maglev').then((m) => m.Maglev)),
}
