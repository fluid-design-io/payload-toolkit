import type { ThemeVariant, Tokens } from '../core/contract'
import { lazyComponent } from '../core/lazy'

const light: Tokens = {
  bg: 'linear-gradient(180deg, #EFE3F1 0%, #E7D6EA 100%)', surface: '#FFF6EE', fg: '#4B3A33', muted: '#8C6E62', edge: '#9C7262', dim: '#E2C3B2', accent: '#FF6B45', floor: '#F7D9C4', floorEdge: '#E7BFA6',
  flat: false, rough: 0.92, shadow: 0.5, s: 68, l: 72,
  board: '#8FD3BA', boardEdge: '#3F8D72', silk: '#F2FFF9', trace: '#66B497', lit: '#FF6B45', body: '#FFF3E8', bodyEdge: '#A87C68', ink: '#5A4038', pin: '#D9A48C', sub: '#F1D0BE', ghost: '#B5E2D0',
  gold: '#F2C46D', die: '#6D5A8F', led: '#5FCB7B', ledBusy: '#A9F2BB', ledOff: '#D7C9BF', spark: '#FFFFFF',
  claude: '#FF9471', claudeEdge: '#B95839', claudeInk: '#FFF4EC', claudeCable: '#D9B3A1',
  codex: '#6676D6', codexInk: '#F4F5FF', codexCable: '#A9AFE3',
}
const dark: Tokens = {
  bg: 'radial-gradient(120% 90% at 50% 30%, #4A3E63 0%, #231E33 80%)', surface: '#776A99', fg: '#FFF2F8', muted: '#CDBBD8', edge: '#3A2F52', dim: '#5E5280', accent: '#FFA36C', floor: '#5A4D7A', floorEdge: '#6A5D8C',
  flat: false, rough: 0.92, shadow: 0.6, s: 45, l: 62,
  board: '#4F9682', boardEdge: '#25584A', silk: '#E8FFF6', trace: '#73B5A1', lit: '#FFC47A', body: '#8576A8', bodyEdge: '#3A2F52', ink: '#FFF2F8', pin: '#C7B2D9', sub: '#6A5D8C', ghost: '#4D8273',
  gold: '#E8B860', die: '#2A2340', led: '#7CF0A0', ledBusy: '#C0FFD2', ledOff: '#4D4366', spark: '#FFF3DE',
  claude: '#FF8F6B', claudeEdge: '#9A4A32', claudeInk: '#FFF4EC', claudeCable: '#9C8BB8',
  codex: '#8A96FF', codexInk: '#1E1A2B', codexCable: '#6E66A0',
}

export const clay: ThemeVariant = {
  id: 'clay',
  label: 'Clay toy',
  scene: 'INT. TOY BOX',
  lens: { fov: 21, el: 34, frame: 1.08 },
  tokens: { light, dark },
  Stage: lazyComponent(() => import('./clay').then((m) => m.Stage)),
}
