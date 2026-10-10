import type { Lab } from '../../lab.types'

export type WorldId = 'blueprint' | 'night' | 'cleanroom'

/** One world's palette. `flat` worlds render unlit; the rest use standard materials. */
export type Look = {
  world: WorldId
  dark: boolean
  bg: string
  surface: string
  fg: string
  muted: string
  edge: string
  dim: string
  board: string
  chip: string
  chipFg: string
  accent: string
  floor: string
  floorEdge: string
  fog: string
  /** Opacity of the hairline reflection in the floor. */
  mirror: number
  l: number
  s: number
  flat: boolean
  rough: number
}

export const WORLDS: readonly { id: WorldId; label: string; scene: string; blurb: string; key: string }[] = [
  { id: 'blueprint', label: 'Blueprint', scene: 'INT. DRAFTING TABLE', blurb: 'Drafting paper, dimensions and a revision table', key: '1' },
  { id: 'night', label: 'Night shift', scene: 'INT. WAREHOUSE · NIGHT', blurb: 'Sodium lamps, wet floor, beacon on the arm', key: '2' },
  { id: 'cleanroom', label: 'Cleanroom fab', scene: 'INT. FAB 2 · ISO 5', blurb: 'Yellow light, glass partitions, air shower', key: '3' },
]

/** Per-world overview lens: field of view, elevation and framing margin. */
export const LENS: Record<WorldId, { fov: number; el: number; frame: number }> = {
  blueprint: { fov: 12, el: 34, frame: 1.06 },
  night: { fov: 22, el: 25, frame: 1.0 },
  cleanroom: { fov: 18, el: 29, frame: 1.02 },
}

export const tint = (hue: number, c: Look, l = c.l) => `hsl(${hue}, ${c.s}%, ${l}%)`

export function lookOf(world: WorldId, theme: Lab['theme']): Look {
  const dark = theme === 'dark'
  const base = { world, dark, flat: false, rough: 1, mirror: 0, s: dark ? 34 : 46, l: dark ? 42 : 64 }
  switch (world) {
    case 'blueprint':
      return dark
        ? { ...base, flat: true, bg: '#0B2440', surface: '#0F2B4C', fg: '#EEF4FA', muted: '#8FB0D0', edge: '#D6E6F5', dim: '#3A5F88', board: '#0D2A4A', chip: '#0B2440', chipFg: '#EEF4FA', accent: '#FF8A5B', floor: '#0B2440', floorEdge: '#1E4064', fog: '#0B2440', l: 40, s: 40 }
        : { ...base, flat: true, bg: '#F3EFE6', surface: '#FAF8F2', fg: '#1E3A5C', muted: '#5E7893', edge: '#2E5F96', dim: '#B4C4D4', board: '#F3EFE6', chip: '#F3EFE6', chipFg: '#1E3A5C', accent: '#D8432A', floor: '#F3EFE6', floorEdge: '#D3DCE2', fog: '#F3EFE6', l: 80, s: 48 }
    case 'night':
      return dark
        ? { ...base, bg: 'radial-gradient(120% 90% at 50% 25%, #121A20 0%, #05080A 70%)', surface: '#1B2328', fg: '#FCFCFC', muted: '#8A9094', edge: '#6A777E', dim: '#2B353C', board: '#141B20', chip: '#0D1215', chipFg: '#FCFCFC', accent: '#FFB454', floor: '#0A0F12', floorEdge: '#1F282E', fog: '#070B0E', mirror: 0.42, rough: 0.85 }
        : { ...base, bg: 'radial-gradient(120% 90% at 50% 22%, #C9D1D7 0%, #8C979F 78%)', surface: '#EEF0F1', fg: '#1D2225', muted: '#4F5A61', edge: '#4E5A61', dim: '#8E989F', board: '#E9ECEE', chip: '#1D2225', chipFg: '#FCFCFC', accent: '#B8620F', floor: '#9AA4AB', floorEdge: '#87919A', fog: '#959FA6', mirror: 0.3, rough: 0.85 }
    case 'cleanroom':
      return dark
        ? { ...base, bg: 'radial-gradient(120% 90% at 50% 20%, #2A2412 0%, #12100A 75%)', surface: '#2A2617', fg: '#FFF4CF', muted: '#B3A374', edge: '#A89650', dim: '#4A4128', board: '#2E2919', chip: '#14120A', chipFg: '#FFF4CF', accent: '#7FD0F5', floor: '#1E1B10', floorEdge: '#3C3520', fog: '#14110A', mirror: 0.12, l: 46, s: 30 }
        : { ...base, bg: 'linear-gradient(180deg, #FFF8DC 0%, #FBF1C9 100%)', surface: '#FFFCEF', fg: '#3B3418', muted: '#8C8150', edge: '#A89754', dim: '#E3D9AE', board: '#FFFBEA', chip: '#2E2A17', chipFg: '#FFF8DC', accent: '#2C7DB3', floor: '#FBF4D8', floorEdge: '#E0D5A6', fog: '#FBF1C9', mirror: 0.1, l: 70, s: 45 }
  }
}
