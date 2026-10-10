import { Vector3 } from 'three'

import type { CatalogItem, CategoryId, Target } from '../../../../../workspace/-workspace/workspace.types'

/**
 * The app board's footprint in world units. The arm base sits at (4.2, 0,
 * -1.4) with an 11-unit reach, so these bounds must not grow.
 */
export const BOARD = { x0: 5.2, x1: 13.95, z0: -3.75, z1: 3.15, y: 0.45 } as const

/** A page region: blocks seat in the band their category belongs to. */
export type Band = { id: string; label: string; groups: readonly string[] }

/**
 * One footprint on the board. `n` counts footprints inside a band from 0;
 * `tier` is 0 for the first layer and grows when a band overflows its grid,
 * so a viral build stacks rather than refusing.
 */
export type Seat = { band: number; n: number; x: number; z: number; tier: number }

/** What the board reads each frame. Owned by the simulation, mutated in place. */
export type BoardState = {
  seated: Map<string, { item: CatalogItem; seat: Seat; since: number }>
  /** Bumped whenever `seated` or a seat changes, so the lit traces rebuild only then. */
  version: number
  /** A pulse runs the trace of `seat` from CPU to chip; `t` goes 0 to 1. */
  pulses: { seat: Seat; t: number }[]
  time: number
  /** A swapped chip hops; 1 at the click, decaying to 0. */
  bumps: Record<Chip, number>
}

export type Chip = 'cpu' | 'mem' | 'pwr' | 'j1'

export const BANDS: readonly Band[] = [
  { id: 'hero', label: 'HERO', groups: ['hero'] },
  { id: 'logos', label: 'LOGOS', groups: ['logo'] },
  { id: 'features', label: 'FEATURES', groups: ['feature', 'integration'] },
  { id: 'content', label: 'CONTENT', groups: ['content', 'stats', 'comparator'] },
  { id: 'social', label: 'SOCIAL', groups: ['testimonials', 'team'] },
  { id: 'pricing', label: 'PRICING', groups: ['pricing', 'faq'] },
  { id: 'convert', label: 'CONVERT', groups: ['call', 'contact'] },
  { id: 'footer', label: 'FOOTER', groups: ['footer', 'other'] },
]

/** Features and components have their own areas; -1 and -2 name them so `seatAt` can branch. */
export const FEATURE_BAND = -1
export const COMPONENT_BAND = -2

export function bandOf(category: CategoryId): number {
  if (category === 'feature') return FEATURE_BAND
  if (category === 'component') return COMPONENT_BAND
  const group = category.startsWith('block:') ? category.slice(6) : category
  const at = BANDS.findIndex((band) => band.groups.includes(group))
  return at === -1 ? BANDS.length - 1 : at
}

const GRID = (x0: number, z0: number, cols: number, rows: number, pitch: number, size: number) => ({
  x0, z0, cols, rows, pitch, size, x1: x0 + size + (cols - 1) * pitch, z1: z0 + size + (rows - 1) * pitch,
})

/** Fixed regions in world units. Blocks fill the right of the board; the CPU and its satellites the left. */
export const ZONES = {
  bands: { x0: 8.3, x1: BOARD.x1 - 0.3, z0: -3.5, z1: 2.4 },
  blocks: { x0: 9.05, cols: 9, pitch: 0.52, w: 0.44, d: 0.3 },
  feature: GRID(5.5, -0.65, 3, 3, 0.66, 0.56),
  passive: GRID(5.5, 1.52, 6, 3, 0.33, 0.3),
  cpu: { x: 6.7, z: -1.8, half: 0.65 },
  mem: { x0: 5.35, x1: 5.9, z0: -2.55, z1: -1.05 },
  pwr: { x0: 5.35, x1: 7.45, z0: -3.62, z1: -2.75 },
  j1: { x: 5.95, z: 2.86 },
  title: { x0: 10.35, x1: BOARD.x1 - 0.3, z0: 2.52, z1: 3.0 },
  /** The bus: one vertical lane per band between the CPU and the band rows, plus one for the passives. */
  lanes: { x0: 7.74, step: 0.065, passive: 7.58 },
} as const

export const BAND_DEPTH = (ZONES.bands.z1 - ZONES.bands.z0) / BANDS.length
export const bandTop = (band: number) => ZONES.bands.z0 + band * BAND_DEPTH
export const rowZ = (band: number) => bandTop(band) + 0.43
const channelZ = (band: number) => bandTop(band) + 0.16
export const blockX = (col: number) => ZONES.blocks.x0 + ZONES.blocks.w / 2 + col * ZONES.blocks.pitch

/** Hatched footprints for code an existing project already has; `span` counts block columns. */
export const GHOSTS = [
  { band: 0, col: 0, span: 2, title: 'site header' },
  { band: 3, col: 0, span: 2, title: 'rich text' },
  { band: 3, col: 2, span: 1, title: 'media' },
  { band: 7, col: 0, span: 2, title: 'site footer' },
] as const

export const ghostCols = (band: number, target: Target) =>
  target === 'existing' ? GHOSTS.reduce((sum, g) => (g.band === band ? sum + g.span : sum), 0) : 0

function gridSeat(zone: ReturnType<typeof GRID>, band: number, n: number): Seat {
  const per = zone.cols * zone.rows
  const k = n % per
  return {
    band, n, tier: Math.floor(n / per),
    x: zone.x0 + zone.size / 2 + (k % zone.cols) * zone.pitch,
    z: zone.z0 + zone.size / 2 + Math.floor(k / zone.cols) * zone.pitch,
  }
}

/**
 * Where the `n`th item of its band seats. Pure: pass the same `target` the
 * board draws, because an existing project's ghosts push blocks right.
 */
export function seatAt(item: CatalogItem, n: number, target: Target = 'new'): Seat {
  const band = bandOf(item.category)
  if (band === FEATURE_BAND) return gridSeat(ZONES.feature, band, n)
  if (band === COMPONENT_BAND) return gridSeat(ZONES.passive, band, n)
  const skip = ghostCols(band, target)
  const per = ZONES.blocks.cols - skip
  return { band, n, x: blockX(skip + (n % per)), z: rowZ(band), tier: Math.floor(n / per) }
}

/** The center of a card of `thickness` resting on `seat`, lifted per tier so overflow stacks. */
export function seatPos(seat: Seat, thickness: number, out = new Vector3()) {
  return out.set(seat.x, BOARD.y + thickness / 2 + seat.tier * (thickness + 0.03), seat.z)
}

const laneOrder = (() => {
  const pin = (b: number) => pinZ(b)
  const north = BANDS.map((_, b) => b).filter((b) => channelZ(b) < pin(b))
  const south = BANDS.map((_, b) => b).filter((b) => channelZ(b) >= pin(b))
  const order = new Array<number>(BANDS.length)
  north.forEach((b, i) => (order[b] = i))
  south.forEach((b, i) => (order[b] = BANDS.length - 1 - i))
  return order
})()
function pinZ(band: number) {
  return ZONES.cpu.z - 0.5 + band / (BANDS.length - 1)
}
export const laneX = (band: number) => ZONES.lanes.x0 + laneOrder[band] * ZONES.lanes.step

/**
 * The manhattan trace from a CPU pin to the seat's tier-0 footprint, as flat
 * [x, z, x, z, ...] corners. Bands nearer the CPU take the inner lanes, so no
 * two bus traces cross.
 */
export function traceOf(seat: Seat): number[] {
  const { cpu, lanes, feature, passive, blocks } = ZONES
  const east = cpu.x + cpu.half
  if (seat.band === FEATURE_BAND) {
    const col = Math.round((seat.x - feature.x0 - feature.size / 2) / feature.pitch)
    const side = col < feature.cols - 1 ? 1 : -1
    const gap = seat.x + (side * feature.pitch) / 2
    return [gap, cpu.z + cpu.half, gap, seat.z, seat.x + (side * feature.size) / 2, seat.z]
  }
  if (seat.band === COMPONENT_BAND) {
    const pin = cpu.z + cpu.half - 0.07
    const ch = seat.z + passive.pitch / 2
    return [east, pin, lanes.passive, pin, lanes.passive, ch, seat.x, ch, seat.x, seat.z + passive.size / 2]
  }
  const pin = pinZ(seat.band)
  const lane = laneX(seat.band)
  const ch = channelZ(seat.band)
  return [east, pin, lane, pin, lane, ch, seat.x, ch, seat.x, seat.z - blocks.d / 2]
}

/** Every tier-0 footprint the board draws, for static traces and outlines. */
export function footprints(target: Target): Seat[] {
  const out: Seat[] = []
  for (let b = 0; b < BANDS.length; b++)
    for (let col = ghostCols(b, target); col < ZONES.blocks.cols; col++)
      out.push({ band: b, n: col, x: blockX(col), z: rowZ(b), tier: 0 })
  const { feature, passive } = ZONES
  for (let n = 0; n < feature.cols * feature.rows; n++) out.push(gridSeat(feature, FEATURE_BAND, n))
  for (let n = 0; n < passive.cols * passive.rows; n++) out.push(gridSeat(passive, COMPONENT_BAND, n))
  return out
}
