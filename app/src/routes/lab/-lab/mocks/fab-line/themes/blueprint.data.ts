import type { ThemeVariant, Tokens } from '../core/contract'
import { lazyComponent } from '../core/lazy'
import { BRAND } from './brand'

const light: Tokens = {
  ...BRAND, flat: true, rough: 1, shadow: 0, s: 50, l: 80,
  bg: '#F2F6F9', surface: '#F2F6F9', fg: '#18375A', muted: '#5C7A99', edge: '#2F65A0', dim: '#A9C2DC', accent: '#E0482B', floor: '#F2F6F9', floorEdge: '#A9C2DC',
  board: '#EDF3F8', boardEdge: '#2F65A0', silk: '#2F65A0', trace: '#A9C2DC', lit: '#E0482B', body: '#F2F6F9', bodyEdge: '#2F65A0', ink: '#18375A', pin: '#7E9FC2', sub: '#E3ECF4', ghost: '#E6EEF5',
  spark: '#E0482B', codex: '#18375A', codexInk: '#F2F6F9',
}
const dark: Tokens = {
  ...BRAND, flat: true, rough: 1, shadow: 0, s: 40, l: 40,
  bg: '#0C2440', surface: '#0C2440', fg: '#EAF2FA', muted: '#8FB0D0', edge: '#CFE0F2', dim: '#3B5D84', accent: '#FF8A5B', floor: '#0C2440', floorEdge: '#3B5D84',
  board: '#0E2A4A', boardEdge: '#CFE0F2', silk: '#CFE0F2', trace: '#3B5D84', lit: '#FF8A5B', body: '#0C2440', bodyEdge: '#CFE0F2', ink: '#EAF2FA', pin: '#8FB0D0', sub: '#143759', ghost: '#10304F',
  spark: '#FF8A5B', codex: '#EAF2FA', codexInk: '#0C2440',
}

export const blueprint: ThemeVariant = {
  id: 'blueprint',
  label: 'Blueprint',
  scene: 'INT. DRAFTING TABLE',
  lens: { fov: 12, el: 36, frame: 1.0 },
  tokens: { light, dark },
  Stage: lazyComponent(() => import('./blueprint').then((m) => m.Stage)),
}
