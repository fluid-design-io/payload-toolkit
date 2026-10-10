import { CatmullRomCurve3, Vector3 } from 'three'

import type { CatalogItem, CategoryId, Setup } from '../../../../workspace/-workspace/workspace.types'
import type { Lab } from '../../lab.types'
import type { Aisle } from '../../warehouse'

export const ACCENT = '#5A91AD'
export const POWER = '#E8A33D'
export const CLAUDE = '#D97757'
export const BY = 0.62
export const BOARD = { x0: -8.4, x1: 12.0, z0: -6.7, z1: 6.7 }
export const PAGE = { x0: 0.6, x1: 11.7, z0: -6.3, z1: 6.3, chipX0: 2.05, chipX1: 11.45 }
export const BELT = { x0: -16.4, x1: -9.9, z: -7.75, y: 0.62, speed: 5.2, gap: 1.25 }
export const RAIL = { back: -8.9, x0: -11.0, x1: 12.6, top: 3.6 }
export const SAFE = BY + 2.1
export const PARK = new Vector3(-9.9, SAFE, -7.75)
export const CPU = new Vector3(-4.6, BY, -1.4)
export const HEADER = new Vector3(-1.9, BY, 5.95)
export const PASSIVES = { x0: -3.3, x1: -1.25, z0: 1.45, z1: 5.0 }
export const FEATURE_BAY = { x: -6.05, z0: 2.0, pitch: 1.55 }
export const MEMORY = { x: -7.15, z0: -3.9, z1: 0.3 }
export const POWER_STAGE = { x0: -7.7, x1: -2.5, z0: -6.3, z1: -4.05 }
export const LED = { pwr: new Vector3(-8.0, BY, -5.6), act: new Vector3(-8.0, BY, -5.2) }

export type Pkg = 'qfp' | 'qfn' | 'soic' | 'dip' | 'passive' | 'module'
export type Spec = { pkg: Pkg; w: number; d: number; h: number; lead: number; fw: number; fd: number; c: number }

/** One package per role. Groups that share a package share a silhouette, so the legend reads once. */
export const PACKAGES: Record<Pkg, { name: string; pins: string; role: string; groups: string[] }> = {
  qfp: { name: 'LQFP', pins: '64 to 144', role: 'Page-sized blocks', groups: ['hero', 'feature', 'pricing', 'comparator'] },
  soic: { name: 'SOIC', pins: '16 to 28', role: 'Long-form content', groups: ['content', 'testimonials', 'faq', 'contact', 'footer'] },
  qfn: { name: 'QFN', pins: '16 to 32', role: 'Compact widgets', groups: ['integration', 'logo', 'stats', 'call', 'team'] },
  dip: { name: 'PDIP', pins: '8 to 16', role: 'Legacy and other', groups: ['other'] },
  passive: { name: '2220 SMD', pins: '2', role: 'Components', groups: ['component'] },
  module: { name: 'Mezzanine', pins: '40', role: 'Features', groups: ['feature'] },
}
export const PKG_NAME = Object.fromEntries(Object.entries(PACKAGES).map(([k, v]) => [k, v.name])) as Record<Pkg, string>

export const BANDS: { label: string; groups: string[] }[] = [
  { label: 'HERO', groups: ['hero'] },
  { label: 'LOGOS', groups: ['logo'] },
  { label: 'FEATURES', groups: ['feature', 'integration'] },
  { label: 'CONTENT', groups: ['content', 'stats', 'comparator'] },
  { label: 'SOCIAL', groups: ['testimonials', 'team'] },
  { label: 'PRICING', groups: ['pricing', 'faq'] },
  { label: 'CONVERT', groups: ['call', 'contact'] },
  { label: 'FOOTER', groups: ['footer', 'other'] },
]
const BAND_D = (PAGE.z1 - PAGE.z0) / BANDS.length
export const bandZ = (b: number) => PAGE.z0 + b * BAND_D
export const BAND_DEPTH = BAND_D

const groupOf = (category: CategoryId) => (category.startsWith('block:') ? category.slice(6) : category)
export function bandOf(category: CategoryId) {
  const g = groupOf(category)
  const at = BANDS.findIndex((band) => band.groups.includes(g))
  return at === -1 ? BANDS.length - 1 : at
}
export function pkgOf(item: Pick<CatalogItem, 'kind' | 'category'>): Pkg {
  if (item.kind === 'feature') return 'module'
  if (item.kind === 'component') return 'passive'
  const g = groupOf(item.category)
  return (Object.keys(PACKAGES) as Pkg[]).find((pkg) => PACKAGES[pkg].groups.includes(g)) ?? 'dip'
}

export const hash = (s: string) => {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return (h >>> 0) / 4294967295
}

export function specOf(item: CatalogItem): Spec {
  const c = Math.min(1, (item.description.length + item.title.length * 4) / 220) * 0.75 + hash(item.ref) * 0.25
  const q = (v: number) => Math.round(v * 20) / 20
  const make = (pkg: Pkg, w: number, d: number, h: number, lead: number, leadX: boolean, leadZ: boolean): Spec => ({
    pkg, w: q(w), d: q(d), h, lead, c,
    fw: q(w) + (leadX ? lead * 2 : 0), fd: q(d) + (leadZ ? lead * 2 : 0),
  })
  const pkg = pkgOf(item)
  if (pkg === 'module') return make('module', 2.6, 1.3, 0.5, 0, false, false)
  if (pkg === 'passive') return make('passive', 1.0, 0.5, 0.26, 0, false, false)
  if (pkg === 'qfp') { const s = 0.95 + 0.5 * c; return make(pkg, s, s, 0.13, 0.17, true, true) }
  if (pkg === 'qfn') { const s = 0.7 + 0.38 * c; return make(pkg, s, s, 0.09, 0.03, true, true) }
  if (pkg === 'soic') return make(pkg, 1.0 + 0.7 * c, 0.52, 0.15, 0.17, false, true)
  return make('dip', 1.15 + 0.6 * c, 0.58, 0.3, 0.1, false, true)
}

/** `row` and `col` place the chip in its region's grid; the router keeps traces in the gaps between rows. */
export type Slot = {
  x: number; y: number; z: number; s: number; row: number; col: number; ncol: number; region: 'band' | 'passives' | 'features'
  /** The trace channel above this row: it starts at `gz` and is `gd` deep. */
  gz: number; gd: number
}
export type Ghost = { spec: Spec; band: number; slot: Slot; title: string; year: string }
export type Hatch = { x0: number; x1: number; z0: number; z1: number }
export type Channel = { z: number; x0: number; x1: number; region: Slot['region']; band: number; row: number }

const ghostSpecs: { band: number; pkg: Pkg; c: number; title: string; year: string }[] = [
  { band: 0, pkg: 'dip', c: 0.7, title: 'SITE HEADER', year: '2019' },
  { band: 3, pkg: 'dip', c: 0.4, title: 'RICH TEXT', year: '2021' },
  { band: 3, pkg: 'soic', c: 0.2, title: 'MEDIA', year: '2021' },
  { band: 3, pkg: 'dip', c: 0.9, title: 'ARCHIVE', year: '2020' },
  { band: 7, pkg: 'soic', c: 1, title: 'SITE FOOTER', year: '2019' },
]
const fakeSpec = (pkg: Pkg, c: number): Spec => {
  const item = { kind: 'block', category: `block:${PACKAGES[pkg].groups[0]}`, description: 'x'.repeat(Math.round(c * 200)), title: '', ref: `ghost-${pkg}-${c}` } as CatalogItem
  return specOf(item)
}

type Entry = { key: string; spec: Spec }
export const ROW_GAP = 0.34

/** Flows a band's chips into rows of a shared scale; the gap above every row is a trace channel. */
function packBand(entries: Entry[], b: number, out: Map<string, Slot>, channels: Channel[]) {
  if (!entries.length) return
  const W = PAGE.chipX1 - PAGE.chipX0
  const top = bandZ(b) + 0.42
  const D = BAND_D - 0.5
  let s = 1
  for (let tries = 0; tries < 40; tries++) {
    const gap = 0.3 * s
    const rows: Entry[][] = [[]]
    let x = 0
    for (const e of entries) {
      const w = e.spec.fw * s
      if (x > 0 && x + w > W) { rows.push([]); x = 0 }
      rows[rows.length - 1].push(e)
      x += w + gap
    }
    const rowD = Math.max(...entries.map((e) => e.spec.fd)) * s
    const rowGap = ROW_GAP * Math.max(0.5, s)
    const total = rows.length * (rowD + rowGap)
    if (total <= D || s < 0.15) {
      rows.forEach((row, r) => {
        let cx = PAGE.chipX0
        const z0 = top + r * (rowD + rowGap)
        channels.push({ z: z0 + rowGap * 0.5, x0: PAGE.x0 + 0.1, x1: PAGE.chipX1, region: 'band', band: b, row: r })
        row.forEach((e, col) => {
          const w = e.spec.fw * s
          out.set(e.key, { x: cx + w / 2, y: BY, z: z0 + rowGap + (e.spec.fd * s) / 2, s, row: r, col, ncol: row.length, region: 'band', gz: z0, gd: rowGap })
          cx += w + gap
        })
      })
      return
    }
    s *= 0.9
  }
}

function packGrid(keys: Entry[], area: { x0: number; x1: number; z0: number; z1: number }, pitchX: number, pitchZ: number, out: Map<string, Slot>, channels: Channel[], region: Slot['region']) {
  if (!keys.length) return
  const W = area.x1 - area.x0, D = area.z1 - area.z0
  let s = 1
  while (s > 0.12) {
    const cols = Math.max(1, Math.floor(W / (pitchX * s)))
    const rows = Math.ceil(keys.length / cols)
    if (rows * pitchZ * s <= D) {
      const gd = pitchZ * s * 0.42
      for (let r = 0; r < rows; r++) channels.push({ z: area.z0 + r * pitchZ * s + gd / 2, x0: area.x0 - 0.5, x1: area.x1, region, band: -1, row: r })
      keys.forEach((e, i) => {
        const row = Math.floor(i / cols)
        out.set(e.key, { x: area.x0 + ((i % cols) + 0.5) * pitchX * s, y: BY, z: area.z0 + (row + 0.72) * pitchZ * s, s, row, col: i % cols, ncol: Math.min(cols, keys.length - row * cols), region, gz: area.z0 + row * pitchZ * s, gd })
      })
      return
    }
    s *= 0.88
  }
}

export type Layout = { slots: Map<string, Slot>; ghosts: Ghost[]; hatches: Hatch[]; channels: Channel[] }

export function layout(parts: Part[], target: Setup['target']): Layout {
  const slots = new Map<string, Slot>()
  const ghosts: Ghost[] = []
  const hatches: Hatch[] = []
  const channels: Channel[] = []
  const byBand: Entry[][] = BANDS.map(() => [])
  const ghostList = target === 'existing' ? ghostSpecs : []
  ghostList.forEach((g, i) => byBand[g.band].push({ key: `ghost:${i}`, spec: fakeSpec(g.pkg, g.c) }))
  const comps: Entry[] = []
  const feats: Entry[] = []
  for (const p of parts) {
    const e = { key: p.item.ref, spec: p.spec }
    if (p.item.kind === 'component') comps.push(e)
    else if (p.item.kind === 'feature') feats.push(e)
    else byBand[bandOf(p.item.category)].push(e)
  }
  byBand.forEach((entries, b) => {
    const packed = new Map<string, Slot>()
    packBand(entries, b, packed, channels)
    let hx1 = -Infinity, hz0 = Infinity, hz1 = -Infinity
    for (const [key, slot] of packed) {
      if (key.startsWith('ghost:')) {
        const i = Number(key.slice(6))
        const spec = entries.find((e) => e.key === key)!.spec
        ghosts.push({ spec, band: b, slot, title: ghostList[i].title, year: ghostList[i].year })
        hx1 = Math.max(hx1, slot.x + (spec.fw * slot.s) / 2)
        hz0 = Math.min(hz0, slot.z - (spec.fd * slot.s) / 2)
        hz1 = Math.max(hz1, slot.z + (spec.fd * slot.s) / 2)
      } else slots.set(key, slot)
    }
    if (hx1 > -Infinity) hatches.push({ x0: PAGE.chipX0 - 0.2, x1: hx1 + 0.18, z0: hz0 - 0.1, z1: hz1 + 0.12 })
  })
  packGrid(comps, PASSIVES, 1.05, 1.15, slots, channels, 'passives')
  feats.forEach((e, i) => slots.set(e.key, { x: FEATURE_BAY.x, y: BY + Math.floor(i / 3) * 0.72, z: FEATURE_BAY.z0 + (i % 3) * FEATURE_BAY.pitch, s: 1, row: i % 3, col: 0, ncol: 1, region: 'features', gz: 0, gd: 0 }))
  return { slots, ghosts, hatches, channels }
}

export type RouteStyle = 'manhattan' | 'diagonal' | 'organic'
export type Route = { pts: Vector3[]; vias: Vector3[]; len: number; cum: number[]; key: string }

function chamfer(corners: Vector3[], r: number) {
  const out = [corners[0]]
  for (let i = 1; i < corners.length - 1; i++) {
    const a = corners[i - 1], p = corners[i], b = corners[i + 1]
    const c = Math.min(r, a.distanceTo(p) / 2, p.distanceTo(b) / 2)
    out.push(p.clone().addScaledVector(p.clone().sub(a).normalize(), -c), p.clone().addScaledVector(b.clone().sub(p).normalize(), c))
  }
  out.push(corners[corners.length - 1])
  return out
}

function densify(poly: Vector3[], step = 0.06) {
  const pts: Vector3[] = [poly[0].clone()]
  for (let i = 1; i < poly.length; i++) {
    const a = poly[i - 1], b = poly[i]
    const n = Math.max(1, Math.ceil(a.distanceTo(b) / step))
    for (let k = 1; k <= n; k++) pts.push(a.clone().lerp(b, k / n))
  }
  return pts
}

export function makeRoute(corners: Vector3[], style: RouteStyle, vias: Vector3[], key = ''): Route {
  let pts: Vector3[]
  if (style === 'manhattan') pts = densify(corners)
  else if (style === 'diagonal') pts = densify(chamfer(corners, 0.32))
  else {
    const soft = chamfer(corners, 0.9)
    const curve = new CatmullRomCurve3(soft, false, 'centripetal', 0.5)
    const len = curve.getLength()
    pts = curve.getSpacedPoints(Math.max(8, Math.ceil(len / 0.06)))
  }
  const cum = [0]
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]))
  return { pts, vias, len: cum[cum.length - 1], cum, key }
}

export function sampleRoute(route: Route, t: number, out: Vector3) {
  const d = Math.min(1, Math.max(0, t)) * route.len
  let lo = 0, hi = route.cum.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (route.cum[mid] < d) lo = mid
    else hi = mid
  }
  const seg = route.cum[hi] - route.cum[lo] || 1
  return out.lerpVectors(route.pts[lo], route.pts[hi], (d - route.cum[lo]) / seg)
}

export const cpuHalf = (framework: Setup['framework']) => (framework === 'next' ? { w: 1.6, d: 1.6 } : { w: 1.95, d: 1.3 })

const LANE_PITCH = 0.07
const LANES = 18
const PIN_PITCH = 0.1
const SOUTH_LANES = [-3.55, -3.62, -3.69, -3.76, -3.83, -3.9]
const TRACE_Y = BY + 0.006

/** A sticky bus lane per block: the first free index on its side, kept until the block leaves the board. */
function takeLane(sim: Sim, ref: string, side: -1 | 1) {
  const held = sim.lanes.get(ref)
  if (held && held.side === side) return held.index
  const used = new Set([...sim.lanes.values()].filter((l) => l.side === side).map((l) => l.index))
  let index = 0
  while (used.has(index)) index++
  sim.lanes.set(ref, { side, index })
  return index
}

/** The westmost chip in a row takes the channel line nearest the row, so stubs never cross a neighbour's line. */
const channelZ = (slot: Slot) => slot.gz + slot.gd - 0.05 - slot.col * Math.min(0.05, (slot.gd - 0.08) / Math.max(1, slot.ncol))

function blockNet(p: Part, slot: Slot, lane: number, side: -1 | 1, framework: Setup['framework']) {
  const half = cpuHalf(framework)
  const east = CPU.x + half.w
  const y = TRACE_Y
  const top = slot.z - (p.spec.fd * slot.s) / 2
  const channel = channelZ(slot)
  const x = -1.05 + (lane % LANES) * LANE_PITCH
  const pz = CPU.z + side * (half.d - 0.12 - (lane % Math.floor((half.d * 2 - 0.3) / PIN_PITCH)) * PIN_PITCH)
  return [new Vector3(east, y, pz), new Vector3(x, y, pz), new Vector3(x, y, channel), new Vector3(slot.x, y, channel), new Vector3(slot.x, y, top)]
}

function passiveNet(p: Part, slot: Slot, lane: number, framework: Setup['framework']) {
  const half = cpuHalf(framework)
  const y = TRACE_Y
  const trunk = SOUTH_LANES[lane % SOUTH_LANES.length]
  const top = slot.z - (p.spec.fd * slot.s) / 2
  const channel = channelZ(slot)
  return [new Vector3(trunk, y, CPU.z + half.d), new Vector3(trunk, y, channel), new Vector3(slot.x, y, channel), new Vector3(slot.x, y, top)]
}

function featureNet(slot: Slot, index: number, framework: Setup['framework']) {
  const half = cpuHalf(framework)
  const y = TRACE_Y
  const x = slot.x - 0.9 + (index % 3) * 0.25
  return [new Vector3(x, y, CPU.z + half.d), new Vector3(x, y, slot.z - 0.72)]
}

/** The form daughterboard's submissions land in memory: west off the mezzanine, then north into the DIMM slot. */
export function formNet(slot: Slot, style: RouteStyle) {
  const y = TRACE_Y
  const x = slot.x - 1.45
  return makeRoute([new Vector3(x, y, slot.z + 0.2), new Vector3(x - 0.25, y, slot.z + 0.2), new Vector3(x - 0.25, y, MEMORY.z1 + 0.35), new Vector3(MEMORY.x - 0.25, y, MEMORY.z1 + 0.35), new Vector3(MEMORY.x - 0.25, y, MEMORY.z1 - 0.1)], style, [new Vector3(x - 0.25, y, MEMORY.z1 + 0.35)], 'form')
}

const routeKey = (corners: Vector3[], style: RouteStyle) => `${style}|${corners.map((c) => `${c.x.toFixed(3)},${c.z.toFixed(3)}`).join(';')}`

/**
 * Rebuilds only the routes whose inputs changed. A seated block's corners depend on its own slot,
 * its sticky lane and the CPU, so appending a part leaves the others' routes untouched.
 */
export function routeAll(sim: Sim, parts: Part[], style: RouteStyle, framework: Setup['framework']) {
  let rebuilt = 0
  const alive = new Set<string>()
  let feature = 0
  for (const p of parts) {
    const slot = p.slot
    if (!slot) continue
    alive.add(p.item.ref)
    let corners: Vector3[]
    let vias: Vector3[]
    if (p.item.kind === 'block') {
      const side: -1 | 1 = bandZ(bandOf(p.item.category)) + BAND_DEPTH / 2 < CPU.z ? -1 : 1
      const lane = takeLane(sim, p.item.ref, side)
      corners = blockNet(p, slot, lane, side, framework)
      vias = [corners[1].clone(), corners[2].clone()]
    } else if (p.item.kind === 'component') {
      const lane = takeLane(sim, p.item.ref, 1)
      corners = passiveNet(p, slot, lane, framework)
      vias = [corners[1].clone()]
    } else {
      corners = featureNet(slot, feature++, framework)
      vias = []
    }
    const key = routeKey(corners, style)
    if (p.route?.key === key) continue
    p.route = makeRoute(corners, style, vias, key)
    rebuilt++
  }
  for (const ref of [...sim.lanes.keys()]) if (!alive.has(ref) && !sim.parts.has(ref)) sim.lanes.delete(ref)
  sim.router.rebuilt = rebuilt
  sim.router.built += rebuilt
  sim.router.total = parts.filter((p) => p.route).length
  sim.router.runs++
}

export function staticRoutes(style: RouteStyle, framework: Setup['framework']) {
  const y = TRACE_Y
  const half = cpuHalf(framework)
  const power: Route[] = []
  const memory: Route[] = []
  for (let i = 0; i < 5; i++) {
    const x = CPU.x - 1.1 + i * 0.55
    const x2 = -7.0 + i * 1.05
    power.push(makeRoute([new Vector3(x2, y, -4.25), new Vector3(x2, y, -3.7 + i * 0.07), new Vector3(x, y, -3.7 + i * 0.07), new Vector3(x, y, CPU.z - half.d)], style, [], `power${i}`))
  }
  for (let i = 0; i < 8; i++) {
    const z = CPU.z - 1.05 + i * 0.3
    memory.push(makeRoute([new Vector3(-6.85, y, z), new Vector3(-6.55, y, z), new Vector3(-6.4, y, CPU.z - 1.0 + i * 0.28), new Vector3(CPU.x - half.w, y, CPU.z - 1.0 + i * 0.28)], style, [], `mem${i}`))
  }
  return { power, memory }
}

export type Mode = 'queued' | 'pop' | 'belt' | 'carry' | 'seated' | 'lift' | 'return'
type Fly = { from: Vector3; to: Vector3; t: number; dur: number; h: number; s0: number; s1: number; then: Mode | 'gone' }
export type Part = {
  item: CatalogItem
  spec: Spec
  pos: Vector3
  yaw: number
  scale: number
  mode: Mode
  fly: Fly | null
  beltX: number
  slot: Slot | null
  order: number
  seatedAt: number
  route: Route | null
  drawn: number
  /** Agent flash afterglow. */
  flash: number
  /** Render pulse arrival glow. */
  lit: number
}
/**
 * One move of the head. `to` writes the target into `out`; the head waits there until `ready` says
 * go, then `arrive` runs with the current lab and may return false to cancel the rest of the plan.
 */
type Step = { to: (out: Vector3) => Vector3; ready?: () => boolean; arrive?: (lab: Lab) => boolean | void }
/** What just happened on the line, drained each frame by whoever plays sounds or announces. */
export type SimEvent = { kind: 'queue' | 'seat' | 'toss' | 'servo' | 'chirp' | 'zap'; part: Part }

export type TrayBay = { no: number; x: number; z: number; rows: number }
export type TraySection = { id: CategoryId; label: string; hue: number; code: string; count: number; x0: number; x1: number; z0: number; z1: number; head: number; bays: TrayBay[]; first: number }
/**
 * Pockets sit where their pick code says: four slots across, five levels per bay, bays filling a
 * section left to right then down. Sections flow into masonry columns and the pitch is solved so
 * the whole bank fits its slab.
 */
export type TrayLayout = {
  items: CatalogItem[]
  index: Map<string, number>
  pitch: number
  at: Float32Array
  sections: TraySection[]
  box: { x0: number; x1: number; z0: number; z1: number; y: number }
  viral: boolean
}

const TRAY_Y = 0.62
const BAY_GAP = 0.1
export function trayLayout(aisles: readonly Aisle[], viral: boolean): TrayLayout {
  const W = viral ? 10.5 : 6.2
  const D = viral ? 15.5 : 11.8
  const x1 = -10.6
  const box = { x0: x1 - W, x1, z0: -5.4, z1: -5.4 + D, y: TRAY_Y }
  const groups = aisles.map((a) => ({ aisle: a, items: a.racks.flatMap((r) => r.bins.map((b) => b.item)) }))
  const n = groups.reduce((s, g) => s + g.items.length, 0)
  const C = aisles.length > 2 ? 3 : 1
  const colW = (W - 0.25 * (C - 1)) / C
  const headerH = (p: number) => Math.max(viral ? 0.8 : 0.42, p * 0.75)
  let pitch = Math.min(1.1, colW / 4.3)
  type Placed = { g: (typeof groups)[number]; col: number; z: number; across: number; bayRows: number }
  let placed: Placed[] = []
  for (let i = 0; i < 400; i++) {
    const p = pitch
    const depth = Array.from({ length: C }, () => 0)
    placed = []
    for (const g of groups) {
      const col = depth.indexOf(Math.min(...depth))
      const bays = Math.max(1, Math.ceil(g.items.length / 20))
      const across = Math.max(1, Math.min(bays, Math.floor((colW + BAY_GAP) / (4 * p + BAY_GAP))))
      const bayRows = Math.ceil(bays / across)
      const lastRows = Math.ceil((g.items.length - (bays - 1) * 20) / 4)
      const rows = (bayRows - 1) * 5 + (bays === bayRows * across ? lastRows : 5)
      placed.push({ g, col, z: depth[col], across, bayRows })
      depth[col] += headerH(p) + rows * p + (bayRows - 1) * 0.08 + 0.3
    }
    if (Math.max(...depth) <= D) { box.z1 = box.z0 + Math.max(...depth) + 0.4; break }
    pitch *= 0.97
  }
  const at = new Float32Array(n * 2)
  const items: CatalogItem[] = []
  const sections: TraySection[] = []
  const h = headerH(pitch)
  for (const s of placed) {
    const width = s.across * 4 * pitch + (s.across - 1) * BAY_GAP
    const x0 = box.x0 + s.col * (colW + 0.25) + (colW - width) / 2
    const z0 = box.z0 + s.z
    const first = items.length
    const bays = new Map<number, TrayBay>()
    s.g.aisle.racks.forEach((r) => r.bins.forEach((b) => {
      const bx = (b.bay - 1) % s.across, by = Math.floor((b.bay - 1) / s.across)
      const bay = bays.get(b.bay) ?? { no: b.bay, x: x0 + bx * (4 * pitch + BAY_GAP), z: z0 + h + by * (5 * pitch + 0.08), rows: 0 }
      bay.rows = Math.max(bay.rows, b.level)
      bays.set(b.bay, bay)
      at[items.length * 2] = bay.x + (b.slot + 0.5) * pitch
      at[items.length * 2 + 1] = bay.z + (b.level - 0.5) * pitch
      items.push(b.item)
    }))
    const list = [...bays.values()].sort((a, b) => a.no - b.no)
    const z1 = Math.max(...list.map((b) => b.z + b.rows * pitch))
    sections.push({ id: s.g.aisle.id, label: s.g.aisle.label, hue: s.g.aisle.hue, code: `${s.g.aisle.zone}${String(s.g.aisle.no).padStart(2, '0')}`, count: s.g.items.length, x0, x1: x0 + width, z0, z1, head: h, bays: list, first })
  }
  return { items, index: new Map(items.map((item, i) => [item.ref, i])), pitch, at, sections, box, viral }
}
export function pocket(tray: TrayLayout, i: number, out = new Vector3()) {
  return out.set(tray.at[i * 2], tray.box.y + 0.04, tray.at[i * 2 + 1])
}
export const trayScale = (tray: TrayLayout, spec: Spec) => Math.min(1, (tray.pitch * 0.74) / Math.max(spec.fw, spec.fd))

/** The head carries a row of vacuum nozzles: it gang-picks whatever the belt delivers, then places each part in turn. */
export const NOZZLES = 4
export const NOZZLE_PITCH = 0.62
export const nozzleX = (i: number) => (i - (NOZZLES - 1) / 2) * NOZZLE_PITCH
const HOVER = 0.42

export type Sim = {
  parts: Map<string, Part>
  feed: Part[]
  belt: Part[]
  removals: Part[]
  /** `held[i]` hangs from nozzle i; `job` is the part the current plan is moving. */
  gantry: { pos: Vector3; steps: Step[]; held: (Part | null)[]; job: Part | null }
  time: number
  order: number
  selected: ReadonlySet<string> | null
  target: Setup['target'] | null
  style: RouteStyle | null
  framework: Setup['framework'] | null
  tray: TrayLayout
  layout: Layout
  version: number
  lastAdded: Part | null
  lastAddedAt: number
  lastSeat: Part | null
  lastSeatAt: number
  agentFlash: { part: Part; t: number } | null
  lanes: Map<string, { side: -1 | 1; index: number }>
  router: { rebuilt: number; total: number; runs: number; built: number }
  /** 0 is dark, 1 is fully powered; rises on the first seated part and falls when the board empties. */
  power: number
  powerOnAt: number
  /** Last CPU render tick; blocks pulses from the CPU in page order after each. */
  renderAt: number
  renders: number
  /** Last form submission; a pulse rides from the mezzanine to memory. */
  submitAt: number
  submits: number
  /** Parts popping from the tray to the belt right now, and when the last one left. */
  pops: number
  popAt: number
  seated: number
  events: SimEvent[]
  /** Reduced motion: flights at half length, a faster head, no idle bobbing. */
  reduced: boolean
}

export function homeOf(sim: Sim, p: Part, out: Vector3) {
  const i = sim.tray.index.get(p.item.ref)
  if (i === undefined) {
    out.set(sim.tray.box.x1 - 0.5, sim.tray.box.y + 0.2, sim.tray.box.z1 + 0.6)
    return 0.15
  }
  pocket(sim.tray, i, out)
  return trayScale(sim.tray, p.spec)
}

function startFly(sim: Sim, p: Part, to: Vector3, dur: number, h: number, then: Fly['then'], s1: number) {
  p.fly = { from: p.pos.clone(), to: to.clone(), t: 0, dur: dur * (sim.reduced ? 0.5 : 1), h, s0: p.scale, s1, then }
}

const home = new Vector3()
function sendHome(sim: Sim, p: Part, dur = 0.9, h = 3) {
  p.mode = 'return'
  p.route = null
  p.drawn = 0
  sim.lanes.delete(p.item.ref)
  const s = homeOf(sim, p, home)
  startFly(sim, p, home, dur, h, 'gone', s)
  sim.events.push({ kind: 'toss', part: p })
}

export function createSim(lab: Lab, tray: TrayLayout, style: RouteStyle): Sim {
  const sim: Sim = {
    parts: new Map(), feed: [], belt: [], removals: [],
    gantry: { pos: PARK.clone(), steps: [], held: Array.from({ length: NOZZLES }, () => null), job: null },
    time: 0, order: 0, selected: null, target: null, style: null, framework: null, tray,
    layout: { slots: new Map(), ghosts: [], hatches: [], channels: [] }, version: 0,
    lastAdded: null, lastAddedAt: -99, lastSeat: null, lastSeatAt: -99, agentFlash: null,
    lanes: new Map(), router: { rebuilt: 0, total: 0, runs: 0, built: 0 },
    power: 0, powerOnAt: -99, renderAt: -99, renders: 0, submitAt: -99, submits: 0,
    pops: 0, popAt: -99, seated: 0, events: [], reduced: false,
  }
  for (const ref of lab.setup.items) {
    const item = lab.catalog.items.find((i) => i.ref === ref)
    if (!item) continue
    const p = newPart(sim, item)
    p.mode = 'seated'
    p.scale = 1
    p.drawn = 1
    p.seatedAt = -10
    sim.parts.set(ref, p)
  }
  sim.selected = lab.selected
  relayout(sim, lab, style)
  for (const p of sim.parts.values()) if (p.slot) p.pos.set(p.slot.x, p.slot.y, p.slot.z)
  sim.seated = sim.parts.size
  if (sim.parts.size) { sim.power = 1; sim.powerOnAt = -10 }
  return sim
}

function newPart(sim: Sim, item: CatalogItem): Part {
  const spec = specOf(item)
  const p: Part = {
    item, spec, pos: new Vector3(), yaw: 0, scale: 1, mode: 'queued', fly: null, beltX: 0,
    slot: null, order: sim.order++, seatedAt: -1, route: null, drawn: 0, flash: 0, lit: 0,
  }
  p.scale = homeOf(sim, p, p.pos)
  return p
}

export function relayout(sim: Sim, lab: Lab, style: RouteStyle) {
  const wanted = [...sim.parts.values()].filter((p) => lab.selected.has(p.item.ref)).sort((a, b) => a.order - b.order)
  sim.layout = layout(wanted, lab.setup.target)
  for (const p of sim.parts.values()) p.slot = sim.layout.slots.get(p.item.ref) ?? p.slot
  const onBoard = wanted.filter((p) => p.mode === 'seated' || p.mode === 'carry' || p.mode === 'belt' || p.mode === 'pop' || p.mode === 'queued')
  routeAll(sim, onBoard, style, lab.setup.framework)
  sim.target = lab.setup.target
  sim.style = style
  sim.framework = lab.setup.framework
  sim.version++
}

function sameSet(a: ReadonlySet<string>, b: ReadonlySet<string> | null) {
  if (!b || a.size !== b.size) return false
  for (const ref of a) if (!b.has(ref)) return false
  return true
}

const tmp = new Vector3()
const goal = new Vector3()

/** Picks `q` off the belt end with nozzle `k`, waiting at a low hover until the belt delivers it. */
function pickPlan(sim: Sim, q: Part, k: number): Step[] {
  const g = sim.gantry
  const over = (out: Vector3, dy: number) => out.set(BELT.x1 - nozzleX(k), BELT.y + q.spec.h * q.scale + 0.02 + dy, BELT.z)
  const up: Step = { to: (out) => over(out, HOVER) }
  const steps: Step[] = []
  if (Math.abs(g.pos.y - (BELT.y + q.spec.h * q.scale + 0.02 + HOVER)) > 0.6) steps.push({ to: (out) => over(out, SAFE - BELT.y) })
  steps.push(
    { to: (out) => over(out, HOVER), ready: () => sim.belt[0] !== q || (!q.fly && q.beltX >= BELT.x1 - 0.01) },
    {
      to: (out) => over(out, 0),
      arrive: () => {
        if (sim.belt[0] !== q || q.mode !== 'belt') return false
        sim.belt.shift()
        q.mode = 'carry'
        g.held[k] = q
      },
    },
    up,
  )
  return steps
}

/** Seats the held part on nozzle `k`, or sends it home if it was cleared on the way. */
function placePlan(sim: Sim, q: Part, k: number): Step[] {
  const g = sim.gantry
  const over = (out: Vector3, y: number) => out.set((q.slot?.x ?? 0) - nozzleX(k), y, q.slot?.z ?? 0)
  return [
    { to: (out) => over(out, SAFE) },
    {
      to: (out) => over(out, (q.slot?.y ?? BY) + q.spec.h * q.scale + 0.02),
      arrive: (lab) => {
        g.held[k] = null
        if (!sim.selected!.has(q.item.ref)) {
          sendHome(sim, q)
          return
        }
        q.mode = 'seated'
        q.seatedAt = sim.time
        q.drawn = 0
        if (!q.route) routeAll(sim, [...sim.parts.values()].filter((p) => p.mode === 'seated' || p.mode === 'carry'), sim.style ?? 'manhattan', lab.setup.framework)
        sim.lastSeat = q
        sim.lastSeatAt = sim.time
        if (sim.power === 0 && sim.powerOnAt < 0) sim.powerOnAt = sim.time
        if (lab.setup.agent !== 'none') sim.agentFlash = { part: q, t: 0 }
        sim.events.push({ kind: 'seat', part: q })
      },
    },
    { to: (out) => over(out, SAFE) },
  ]
}

function removePlan(sim: Sim, q: Part, k: number): Step[] {
  const g = sim.gantry
  const over = (out: Vector3, y?: number) => out.set(q.pos.x - nozzleX(k), y ?? q.pos.y + q.spec.h * q.scale + 0.02, q.pos.z)
  return [
    { to: (out) => over(out, SAFE) },
    {
      to: (out) => over(out),
      arrive: () => {
        if (sim.selected!.has(q.item.ref) || q.mode !== 'seated') return false
        q.mode = 'lift'
        g.held[k] = q
      },
    },
    {
      to: (out) => over(out, SAFE + 0.6),
      arrive: () => {
        g.held[k] = null
        sendHome(sim, q, 1.1, 3.4)
      },
    },
  ]
}

/** The head's next job: keep gang-picking while the belt is delivering, else place the nearest held part, else desolder. */
function plan(sim: Sim) {
  const g = sim.gantry
  let free = -1, carrying = 0, nearest = -1, best = Infinity
  for (let i = 0; i < NOZZLES; i++) {
    const q = g.held[i]
    if (!q) {
      if (free < 0) free = i
      continue
    }
    carrying++
    const d = q.slot ? (q.slot.x - nozzleX(i) - g.pos.x) ** 2 + (q.slot.z - g.pos.z) ** 2 : 0
    if (d < best) { best = d; nearest = i }
  }
  const head = sim.belt[0]
  const atFeeder = Math.abs(g.pos.x - BELT.x1) < 2.5 && Math.abs(g.pos.z - BELT.z) < 0.8
  const coming = !!head && !head.fly && head.beltX >= BELT.x1 - (carrying ? 1.6 : 0.01)
  if (free >= 0 && coming && (!carrying || atFeeder)) {
    g.job = head
    g.steps = pickPlan(sim, head, free)
    if (!carrying) sim.events.push({ kind: 'servo', part: head })
    return
  }
  if (carrying) {
    const q = g.held[nearest]!
    g.job = q
    g.steps = placePlan(sim, q, nearest)
    return
  }
  while (sim.removals.length && sim.removals[0].mode !== 'seated') sim.removals.shift()
  const removal = sim.removals.shift()
  if (removal) {
    g.job = removal
    g.steps = removePlan(sim, removal, Math.max(0, free))
    sim.events.push({ kind: 'servo', part: removal })
  }
}

export function step(sim: Sim, lab: Lab, style: RouteStyle, dt: number) {
  sim.time += dt
  const wanted = lab.selected
  const g = sim.gantry
  if (wanted !== sim.selected && sameSet(wanted, sim.selected)) sim.selected = wanted
  else if (wanted !== sim.selected) {
    for (const ref of wanted) {
      if (sim.parts.has(ref)) continue
      const item = lab.catalog.items.find((i) => i.ref === ref)
      if (!item) continue
      const p = newPart(sim, item)
      sim.parts.set(ref, p)
      sim.feed.push(p)
      sim.lastAdded = p
      sim.lastAddedAt = sim.time
      sim.events.push({ kind: 'queue', part: p })
    }
    for (const p of sim.parts.values()) {
      const want = wanted.has(p.item.ref)
      if (!want && p.mode === 'queued') {
        sim.feed.splice(sim.feed.indexOf(p), 1)
        sendHome(sim, p, 0.4, 0.6)
      } else if (!want && p.mode === 'belt') {
        sim.belt.splice(sim.belt.indexOf(p), 1)
        sendHome(sim, p)
      } else if (!want && p.mode === 'carry') {
        const k = g.held.indexOf(p)
        if (k >= 0) g.held[k] = null
        if (g.job === p) { g.steps.length = 0; g.job = null }
        sendHome(sim, p)
      } else if (!want && p.mode === 'seated' && g.job !== p && !sim.removals.includes(p)) sim.removals.push(p)
      else if (want && p.mode === 'seated' && sim.removals.includes(p)) sim.removals.splice(sim.removals.indexOf(p), 1)
    }
    sim.selected = wanted
    relayout(sim, lab, style)
  } else if (sim.target !== lab.setup.target || sim.style !== style || sim.framework !== lab.setup.framework) relayout(sim, lab, style)

  const last = sim.belt[sim.belt.length - 1]
  const room = !last || last.beltX > BELT.x0 + 0.6 + BELT.gap * (1 + sim.pops)
  if (sim.feed.length && sim.pops < 3 && sim.time - sim.popAt > 0.28 && room) {
    const p = sim.feed.shift()!
    p.mode = 'pop'
    sim.pops++
    sim.popAt = sim.time
    startFly(sim, p, tmp.set(BELT.x0 + 0.6, BELT.y, BELT.z), 0.6, 2.2, 'belt', 1)
  }
  for (let i = 0; i < sim.belt.length; i++) {
    const p = sim.belt[i]
    if (p.fly) continue
    const limit = i === 0 ? BELT.x1 : sim.belt[i - 1].beltX - BELT.gap
    p.beltX = Math.max(p.beltX, Math.min(p.beltX + BELT.speed * dt, limit))
    p.pos.set(p.beltX, BELT.y, BELT.z)
  }

  if (!g.steps.length) plan(sim)
  const s0 = g.steps[0]
  const target = s0 ? s0.to(goal) : goal.copy(PARK)
  let carrying = 0
  for (const q of g.held) if (q) carrying++
  const rush = (1 + Math.min(2, (sim.belt.length + sim.removals.length + sim.feed.length + carrying) * 0.3)) * (sim.reduced ? 1.6 : 1)
  tmp.copy(target).sub(g.pos)
  const dist = tmp.length()
  const move = Math.min(dist * (1 - Math.exp(-dt * 9 * rush)), 22 * rush * dt)
  if (dist > 1e-5) g.pos.addScaledVector(tmp, move / dist)
  if (s0 && dist - move < 0.04 && (!s0.ready || s0.ready())) {
    g.steps.shift()
    if (s0.arrive?.(lab) === false) g.steps.length = 0
    if (!g.steps.length) g.job = null
  }
  for (let i = 0; i < NOZZLES; i++) {
    const q = g.held[i]
    if (!q) continue
    const fit = q.mode === 'carry' ? (q.slot?.s ?? 1) : q.scale
    const s1 = q === g.job || q.mode !== 'carry' ? fit : Math.min(fit, (NOZZLE_PITCH * 0.9) / Math.max(q.spec.fw, q.spec.fd))
    q.scale += (s1 - q.scale) * (1 - Math.exp(-dt * 6))
    q.pos.set(g.pos.x + nozzleX(i), g.pos.y - q.spec.h * q.scale - 0.02, g.pos.z)
  }

  let seated = 0, form = false
  for (const p of sim.parts.values()) {
    if (p.fly) {
      const f = p.fly
      f.t += dt / f.dur
      const t = Math.min(1, f.t)
      const e = t * t * (3 - 2 * t)
      p.pos.lerpVectors(f.from, f.to, e)
      p.pos.y += f.h * 4 * t * (1 - t)
      p.scale = f.s0 + (f.s1 - f.s0) * e
      p.yaw = sim.reduced ? 0 : p.mode === 'return' ? t * Math.PI * 3 : p.mode === 'pop' ? t * Math.PI : 0
      if (f.t >= 1) {
        p.fly = null
        p.yaw = 0
        if (f.then === 'gone') {
          if (wanted.has(p.item.ref)) {
            p.mode = 'queued'
            sim.feed.push(p)
          } else {
            sim.parts.delete(p.item.ref)
            sim.version++
          }
        } else if (f.then === 'belt') {
          sim.pops--
          if (!wanted.has(p.item.ref)) sendHome(sim, p)
          else {
            p.mode = 'belt'
            p.beltX = BELT.x0 + 0.6
            sim.belt.push(p)
          }
        }
      }
      continue
    }
    if (p.mode === 'queued') {
      const s = homeOf(sim, p, tmp)
      p.pos.lerp(tmp, 1 - Math.exp(-dt * 12))
      if (!sim.reduced) p.pos.y += Math.abs(Math.sin(sim.time * 9 + p.order)) * 0.25
      p.scale = s
    } else if (p.mode === 'seated' && p.slot) {
      seated++
      if (p.item.kind === 'feature' && p.drawn >= 1) form = true
      p.pos.lerp(tmp.set(p.slot.x, p.slot.y, p.slot.z), 1 - Math.exp(-dt * 10))
      p.scale += (p.slot.s - p.scale) * (1 - Math.exp(-dt * 10))
      if (p.drawn < 1 && sim.power > 0.6) {
        p.drawn = Math.min(1, p.drawn + (dt * (sim.reduced ? 3 : 1)) / Math.max(0.5, (p.route?.len ?? 8) / 16))
        if (p.drawn >= 1) sim.events.push({ kind: 'chirp', part: p })
      }
    }
    p.flash = Math.max(0, p.flash - dt * 1.6)
    p.lit = Math.max(0, p.lit - dt * 2.2)
  }
  sim.seated = seated

  if (sim.agentFlash) {
    sim.agentFlash.t += dt / 1.4
    if (sim.agentFlash.t >= 1) {
      sim.agentFlash.part.flash = 1
      sim.events.push({ kind: 'zap', part: sim.agentFlash.part })
      sim.agentFlash = null
    }
  }

  if (seated === 0 && !sim.feed.length && !sim.belt.length && sim.power > 0) {
    sim.power = Math.max(0, sim.power - dt * 1.5)
    if (sim.power === 0) sim.powerOnAt = -99
  } else if (sim.powerOnAt >= 0 && sim.power < 1) sim.power = Math.min(1, (sim.time - sim.powerOnAt) / 1.6)

  if (sim.power >= 1 && seated > 0 && sim.time - sim.renderAt > 3.4) {
    sim.renderAt = sim.time
    sim.renders++
  }
  if (sim.power >= 1 && form && sim.time - sim.submitAt > 2.6 + (sim.submits % 3) * 0.7) {
    sim.submitAt = sim.time
    sim.submits++
  }
}

export const inFlight = (sim: Sim) => {
  let n = sim.feed.length + sim.belt.length + sim.pops
  for (const q of sim.gantry.held) if (q && q.mode === 'carry') n++
  return n
}

/** The part the follow cam rides: the newest add while the queue is short, otherwise whatever the line is moving right now. */
export function travelling(sim: Sim) {
  if (sim.time - sim.lastAddedAt < 1.1) return null
  const last = sim.lastAdded
  const moving = !!last && sim.parts.get(last.item.ref) === last && (last.mode === 'queued' || last.mode === 'pop' || last.mode === 'belt' || last.mode === 'carry')
  if (inFlight(sim) <= 2 && moving) return last
  const job = sim.gantry.job
  if (job && job.mode === 'carry') return job
  for (const q of sim.gantry.held) if (q && q.mode === 'carry') return q
  return sim.belt[0] ?? null
}

/** True while anything on the line, the board's power or a trace is still moving. */
export function lineBusy(sim: Sim) {
  if (sim.feed.length || sim.belt.length || sim.pops || sim.removals.length || sim.gantry.steps.length || sim.agentFlash) return true
  if (sim.power > 0 && sim.power < 1) return true
  for (const q of sim.gantry.held) if (q) return true
  if (sim.gantry.pos.distanceToSquared(PARK) > 1e-4) return true
  for (const p of sim.parts.values()) if (p.fly || p.mode === 'queued' || (p.mode === 'seated' && p.drawn < 1) || p.flash > 0 || p.lit > 0) return true
  return false
}
