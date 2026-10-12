import type { IntegratorVariant } from '../../core/contract'
import { lazyComponent } from '../../core/lazy'

export const probe: IntegratorVariant = {
  id: 'probe',
  label: 'Debug probe',
  workTime: (agent) => (agent === 'none' ? 0 : 1.1),
  Component: lazyComponent(() => import('./probe').then((m) => m.ProbeStation)),
}
