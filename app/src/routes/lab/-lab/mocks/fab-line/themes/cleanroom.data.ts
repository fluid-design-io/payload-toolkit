import type { ThemeVariant, Tokens } from '../core/contract'
import { lazyComponent } from '../core/lazy'
import { BRAND } from './brand'

const shared = { ...BRAND, codex: '#0E0F10', codexInk: '#F2F2F2', spark: '#FFFFFF' }
const epoxy = { body: '#1A1D1F', bodyEdge: '#3D4448', ink: '#A5ADB2', pin: '#C9CED1', silk: '#EEF2EC', lit: '#F0C36A', sub: '#2E4A36' }

const light: Tokens = {
  ...shared, ...epoxy, flat: false, rough: 1, shadow: 0.18, s: 45, l: 70,
  bg: 'linear-gradient(180deg, #FFF8DC 0%, #FBF1C9 100%)', surface: '#FFFCEF', fg: '#3B3418', muted: '#8C8150', edge: '#B4A66E', dim: '#E3D9AE', accent: '#2C7DB3', floor: '#FBF4D8', floorEdge: '#E0D5A6',
  board: '#2C6646', boardEdge: '#1E4B33', trace: '#3B7D58', ghost: '#4B8566',
}
const dark: Tokens = {
  ...shared, ...epoxy, flat: false, rough: 1, shadow: 0.5, s: 30, l: 46,
  bg: 'radial-gradient(120% 90% at 50% 20%, #2A2412 0%, #12100A 75%)', surface: '#2A2617', fg: '#FFF4CF', muted: '#B3A374', edge: '#9C8A4C', dim: '#4A4128', accent: '#7FD0F5', floor: '#1E1B10', floorEdge: '#3C3520',
  board: '#173A28', boardEdge: '#2E6B4C', trace: '#22513A', ghost: '#24493A',
}

export const cleanroom: ThemeVariant = {
  id: 'cleanroom',
  label: 'Cleanroom fab',
  scene: 'INT. FAB 2',
  lens: { fov: 17, el: 32, frame: 0.98 },
  tokens: { light, dark },
  Stage: lazyComponent(() => import('./cleanroom').then((m) => m.Stage)),
}
