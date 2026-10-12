import type { PathTransport } from '../../core/contract'
import { lazyComponent } from '../../core/lazy'
import { END, RISER, SPEED, START, TOP, courseOf } from './tube/course'
import type { Course } from './tube/course'

export const ZB = -2.8
export const HOME = -8.2
export const LENGTH = END.x - START.x
export const GAP = 1.7
export const TANK = { x: -7.0, y: 2.25, r: 0.55, len: 2.2 }

export const tube: PathTransport<Course> = {
  id: 'tube',
  kind: 'path',
  label: 'Pneumatic',
  footprint: { x0: HOME - 0.6, x1: 0.62, z0: ZB - 0.55, z1: START.z + 0.75, h: TANK.y + TANK.r },
  frame: { pts: [[HOME - 0.8, 0, START.z + 1.8], [0.9, 0, ZB - 1.0], [HOME - 0.8, 3, ZB - 1.0], [RISER, TOP + 1.2, START.z], [-2.8, 0, 7.9], [2.8, 6.4, 7.9]] },
  length: LENGTH,
  speed: SPEED,
  gap: GAP,
  at: (u, out) => out.lerpVectors(START, END, Math.min(1, Math.max(0, u / LENGTH))),
  load: { dur: 0.6, h: 1.4 },
  wrap: (site) => {
    const course = courseOf(site, tube.footprint)
    return { pts: course.pts, pace: course.rate, data: course }
  },
  Component: lazyComponent(() => import('./tube').then((m) => m.Tube)),
}
