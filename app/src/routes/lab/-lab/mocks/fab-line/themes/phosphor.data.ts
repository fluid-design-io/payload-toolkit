import type { ThemeVariant, Tokens } from '../core/contract'
import { lazyComponent } from '../core/lazy'

export const P1 = '#33FF66'

const dark: Tokens = {
  bg: 'radial-gradient(120% 100% at 50% 45%, #07140B 0%, #020603 80%)', surface: '#04100A', fg: '#8DFFAA', muted: '#2C9C4E', edge: P1, dim: '#0F4A24', accent: '#D4FFE0', floor: '#030A06', floorEdge: '#0C3A1C',
  flat: true, rough: 1, shadow: 0, s: 30, l: 45,
  board: '#03130A', boardEdge: P1, silk: '#2BD957', trace: '#13652E', lit: '#D4FFE0', body: '#020805', bodyEdge: P1, ink: '#8DFFAA', pin: '#1F9E45', sub: '#06200F', ghost: '#05170C',
  gold: '#7DE89A', die: '#010402', led: '#8DFFAA', ledBusy: '#E8FFEE', ledOff: '#0A2A14', spark: '#F2FFF5',
  claude: '#9DFFB4', claudeEdge: '#1F9E45', claudeInk: '#021006', claudeCable: '#1C7438',
  codex: '#0B3A1B', codexInk: '#9DFFB4', codexCable: '#145A2B',
}
const light: Tokens = {
  bg: '#F3F5EE', surface: '#F7F8F3', fg: '#1E2A23', muted: '#5D6B62', edge: '#25332B', dim: '#B8C4BA', accent: '#C8372D', floor: '#F3F5EE', floorEdge: '#C9D6CA',
  flat: true, rough: 1, shadow: 0, s: 35, l: 52,
  board: '#F7F8F3', boardEdge: '#25332B', silk: '#25332B', trace: '#B8C4BA', lit: '#C8372D', body: '#F7F8F3', bodyEdge: '#25332B', ink: '#1E2A23', pin: '#6F7D74', sub: '#E5ECE3', ghost: '#ECF1EA',
  gold: '#7E8C82', die: '#25332B', led: '#C8372D', ledBusy: '#F06A5E', ledOff: '#D5DDD4', spark: '#C8372D',
  claude: '#F7F8F3', claudeEdge: '#C8372D', claudeInk: '#C8372D', claudeCable: '#6F7D74',
  codex: '#25332B', codexInk: '#F7F8F3', codexCable: '#6F7D74',
}

export const phosphor: ThemeVariant = {
  id: 'phosphor',
  label: 'Phosphor',
  scene: 'INT. TERMINAL ROOM',
  lens: { fov: 13, el: 34, frame: 1.0 },
  tokens: { light, dark },
  Stage: lazyComponent(() => import('./phosphor').then((m) => m.Stage)),
}
