import type { Mock } from './lab.types'

export const mocks: readonly Mock[] = [
  {
    id: 'fab-line',
    title: 'Fab line',
    pitch: 'Cabinet, pick table, transport, arm and chip board as one pannable line.',
    load: () => import('./mocks/fab-line'),
  },
]
