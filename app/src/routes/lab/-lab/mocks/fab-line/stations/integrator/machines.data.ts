import type { IntegratorVariant } from '../../core/contract'
import { lazyComponent } from '../../core/lazy'
import { padFootprint } from './pad.data'
import { workTime } from './script'

export const machines: IntegratorVariant = {
  id: 'machines',
  label: 'Drone · hexapod',
  workTime,
  footprint: padFootprint,
  Component: lazyComponent(() => import('./machines').then((m) => m.Machines)),
}
