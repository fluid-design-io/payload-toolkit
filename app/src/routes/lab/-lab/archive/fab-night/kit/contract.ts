/**
 * Shared contract for the fab-night kit. Every kit file imports from here and
 * nothing here imports a kit file. World units: 1 = 1 m. Y is up. The line
 * runs west to east: cabinet and pick table around x -10, belt -3.7 to 1.7,
 * arm base at x 4.2, chip board from x 5.4 to 14.6.
 */
import { CanvasTexture, SRGBColorSpace, Vector3 } from 'three'

import type { CatalogItem } from '../../../../../workspace/-workspace/workspace.types'

export type WorldId = 'night' | 'cleanroom'

/** Per world and theme colours. Hue only where it carries meaning. */
export type Look = {
  world: WorldId
  dark: boolean
  /** CSS background behind the canvas. */
  bg: string
  surface: string
  fg: string
  muted: string
  /** Hairline stroke colour for every edge. */
  edge: string
  dim: string
  board: string
  chip: string
  chipFg: string
  /** The one bright stroke: active part, lit trace, beacon. */
  accent: string
  /** Sodium lamp colour (night) or ceiling strip colour (cleanroom). */
  lamp: string
  floor: string
  floorEdge: string
  /** Part face tint lightness and saturation. */
  l: number
  s: number
}

/** The OS setting, or `?motion=reduced` so a harness can test it: no follow camera, halved tweens, no idle loops. */
export const REDUCED_MOTION =
  typeof matchMedia === 'function' && (matchMedia('(prefers-reduced-motion: reduce)').matches || new URLSearchParams(location.search).get('motion') === 'reduced')
/** Tween duration scale: reduced motion halves every flight, sweep and settle. */
export const MOTION = REDUCED_MOTION ? 0.5 : 1
/** Narrow or short: a phone in either orientation, where panels give way to chips. */
export const isPhone = (w: number, h: number) => w < 640 || h < 480
/** Priority for useFrame callbacks that copy sim state onto scene objects: after the sim step, before the floor's mirror pass. */
export const APPLY = -5

export const TABLE_Y = 0.9
export const BELT = { start: -3.7, end: 1.7, z: 1.6, y: 0.9, speed: 3.4, gap: 1.2 }
export const BELT_LEN = BELT.end - BELT.start + 1.0
export const SLATS = 22
export const BASE = { x: 4.2, z: -0.6 }
export const ARM = { h0: 1.9, l1: 6.0, l2: 5.8 }
export const BOARD = { x0: 5.4, x1: 14.6, z0: -4.0, z1: 3.3, y: 0.45 }
export const DRAWER = { w: 2.0, h: 0.5, d: 2.0, gapX: 2.1, gapY: 0.6, x0: -9.4, base: 0.75, front: -1.0 }
export const TABLE = { x0: -10.55, x1: -4.05, z0: -0.1, z1: 4.6 }
export const PAGE = 20
export type ChipKey = 'framework' | 'database' | 'packageManager' | 'agent'
export const CHIP_KEYS: readonly ChipKey[] = ['framework', 'database', 'packageManager', 'agent']

/** Block tile at scale 1. Features and components are cubes. */
export const TILE: [number, number, number] = [0.96, 0.1, 0.72]
export const CUBE: [number, number, number] = [0.56, 0.42, 0.56]

/**
 * Chip board regions, all in world coordinates. The left column holds the
 * setup chips, the page region on the right holds blocks by page band.
 */
export const COLUMN = { x0: BOARD.x0 + 0.3, x1: 8.5 }
export const CPU = { x: 6.95, z: -2.05, size: 1.7 }
export const POWER = { x: 6.95, z: -3.45, w: 2.6, d: 0.5 }
export const MEMORY = { x: 6.95, z: -0.6, w: 2.6, d: 0.5 }
export const PROBE = { x: 6.95, z: 0.45, w: 1.4, d: 0.5 }
export const PASSIVES = { x0: 5.8, x1: 8.2, z0: 1.15, z1: 2.0 }
export const MEZZANINE = { x: 6.95, z: 2.65, w: 2.5, d: 0.85 }
export const PAGE_RECT = { x0: 8.9, x1: BOARD.x1 - 0.3, z0: BOARD.z0 + 0.3, z1: BOARD.z1 - 0.3 }
/** Bus spine between the column and the page. Lanes fan east from it. */
export const BUS_X = 8.68
export const BANDS: readonly { label: string; groups: readonly string[] }[] = [
  { label: 'HERO', groups: ['hero'] },
  { label: 'LOGOS', groups: ['logo'] },
  { label: 'FEATURES', groups: ['feature', 'integration'] },
  { label: 'CONTENT', groups: ['content', 'stats', 'comparator'] },
  { label: 'SOCIAL', groups: ['testimonials', 'team'] },
  { label: 'PRICING', groups: ['pricing', 'faq'] },
  { label: 'CONVERT', groups: ['call', 'contact'] },
  { label: 'FOOTER', groups: ['footer', 'other'] },
]
export const BAND_DEPTH = (PAGE_RECT.z1 - PAGE_RECT.z0) / BANDS.length
export const bandZ = (b: number) => PAGE_RECT.z0 + b * BAND_DEPTH
export function bandOf(category: string) {
  const g = category.startsWith('block:') ? category.slice(6) : category
  const at = BANDS.findIndex((band) => band.groups.includes(g))
  return at === -1 ? BANDS.length - 1 : at
}

/** Where a seated part sits and how far it shrank to fit its band. `band` is -1 for passives and -2 for the mezzanine. */
export type Slot = { x: number; z: number; s: number; band: number }

/** One seated or seating chip as the board sees it. `lit` is trace draw progress 0..1 after seating. */
export type Chip = { ref: string; item: CatalogItem; slot: Slot; size: [number, number, number]; lit: number; seatedAt: number }

/**
 * What the board renders from. The sim mutates it in place and bumps
 * `version` when chips are added, removed or re-laid out, so the board
 * rebuilds routes only then. `pulses` are trace pulses in flight.
 */
export type BoardFeed = {
  version: number
  chips: Chip[]
  pulses: { ref: string; t: number }[]
  /** Band index to outline, -1 for none. Driven by the rail category. */
  activeBand: number
}

/**
 * Power-up state every lit thing reads each frame. All values 0..1 and
 * mutated in place by the power driver. Outside the power-up they sit at 1.
 */
export type Energy = {
  /** Lamp rows from the cabinet end to the board end. */
  rows: Float32Array
  belt: number
  machines: number
  board: number
  /** Global dimmer for world changes (lights flicker and bank back on). */
  all: number
}
export const LAMP_ROWS = 5
export const createEnergy = (on: boolean): Energy => ({ rows: new Float32Array(LAMP_ROWS).fill(on ? 1 : 0), belt: on ? 1 : 0, machines: on ? 1 : 0, board: on ? 1 : 0, all: 1 })

export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
export const damp = (dt: number, rate: number) => 1 - Math.exp(-dt * rate)
export const tint = (hue: number, c: Look, l = c.l) => `hsl(${hue}, ${c.s}%, ${l}%)`
export const FONT = '"Timeless Grotesk", ui-sans-serif, system-ui, sans-serif'
export const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace'

export function textTexture(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  draw(canvas.getContext('2d')!)
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 8
  return texture
}

/** Push the 12 edges of an axis-aligned box into a flat segment list for one merged LineSegments. */
export function boxEdges(out: number[], cx: number, cy: number, cz: number, w: number, h: number, d: number) {
  const x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy - h / 2, y1 = cy + h / 2, z0 = cz - d / 2, z1 = cz + d / 2
  for (const y of [y0, y1]) for (const z of [z0, z1]) out.push(x0, y, z, x1, y, z)
  for (const x of [x0, x1]) for (const z of [z0, z1]) out.push(x, y0, z, x, y1, z)
  for (const x of [x0, x1]) for (const y of [y0, y1]) out.push(x, y, z0, x, y, z1)
}

export const V = (x = 0, y = 0, z = 0) => new Vector3(x, y, z)
