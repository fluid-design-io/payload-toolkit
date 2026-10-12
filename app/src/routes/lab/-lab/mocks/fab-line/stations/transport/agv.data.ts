import type { Vector3 } from 'three'

import type { PathTransport } from '../../core/contract'
import { lazyComponent } from '../../core/lazy'
import { clamp } from '../../core/three'
import { DRIVE, GAP, LOAD, PICK, wrap } from './agv/route'
import type { Plan } from './agv/route'

const length = LOAD.distanceTo(PICK)

export const agv: PathTransport<Plan> = {
  id: 'agv',
  kind: 'path',
  label: 'AGV shuttle',
  footprint: { x0: -8.95, x1: 0.3, z0: -4.2, z1: 0.2, h: 1.3 },
  frame: { pts: [[-9.1, 0, 3.2], [1.6, 0, 3.2], [1.6, 0, -4.4], [-9.1, 0, -4.4], [-7.6, 1.6, -0.5]], el: 48 },
  length,
  speed: DRIVE.min,
  gap: GAP,
  at: (u: number, o: Vector3) => o.lerpVectors(LOAD, PICK, clamp(u / length, 0, 1)),
  load: { dur: 0.6, h: 1.0 },
  wrap,
  Component: lazyComponent(() => import('./agv').then((m) => m.Agv)),
}
