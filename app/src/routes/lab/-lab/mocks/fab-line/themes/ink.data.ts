import type { ThemeVariant, Tokens } from '../core/contract'
import { lazyComponent } from '../core/lazy'

const light: Tokens = {
  bg: '#F4F1E8', surface: '#FAF8F2', fg: '#161616', muted: '#5A5750', edge: '#1A1A1A', dim: '#B9B4A8', accent: '#C8102E', floor: '#F4F1E8', floorEdge: '#CFC9BB',
  flat: true, rough: 1, shadow: 0, s: 0, l: 22,
  board: '#FAF8F2', boardEdge: '#1A1A1A', silk: '#1A1A1A', trace: '#B9B4A8', lit: '#C8102E', body: '#FAF8F2', bodyEdge: '#1A1A1A', ink: '#161616', pin: '#6E6A61', sub: '#E9E5DA', ghost: '#EFECE3',
  gold: '#8C8576', die: '#2A2A2A', led: '#C8102E', ledBusy: '#FF4A5E', ledOff: '#D8D3C6', spark: '#C8102E',
  claude: '#FAF8F2', claudeEdge: '#1A1A1A', claudeInk: '#C8102E', claudeCable: '#6E6A61',
  codex: '#1A1A1A', codexInk: '#FAF8F2', codexCable: '#6E6A61',
}
const dark: Tokens = {
  bg: '#121211', surface: '#171716', fg: '#EDEAE2', muted: '#9C978C', edge: '#E8E5DC', dim: '#4A4741', accent: '#FF5A47', floor: '#121211', floorEdge: '#34322E',
  flat: true, rough: 1, shadow: 0, s: 0, l: 78,
  board: '#171716', boardEdge: '#E8E5DC', silk: '#E8E5DC', trace: '#4A4741', lit: '#FF5A47', body: '#171716', bodyEdge: '#E8E5DC', ink: '#EDEAE2', pin: '#8F8A80', sub: '#22211F', ghost: '#1B1B19',
  gold: '#A39D90', die: '#050505', led: '#FF5A47', ledBusy: '#FF9C90', ledOff: '#33302C', spark: '#FFB3A8',
  claude: '#171716', claudeEdge: '#E8E5DC', claudeInk: '#FF5A47', claudeCable: '#8F8A80',
  codex: '#E8E5DC', codexInk: '#121211', codexCable: '#8F8A80',
}

export const ink: ThemeVariant = {
  id: 'ink',
  label: 'Manual ink',
  scene: 'INT. SERVICE MANUAL, P. 12',
  lens: { fov: 8, el: 33, frame: 1.0 },
  tokens: { light, dark },
  Stage: lazyComponent(() => import('./ink').then((m) => m.Stage)),
}
