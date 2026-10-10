import { CatmullRomCurve3, Euler, Matrix4, Quaternion, Vector3 } from 'three'

import type { CatalogItem, CategoryId, Setup } from '../../../../workspace/-workspace/workspace.types'
import type { Lab } from '../../lab.types'
import type { Aisle } from '../../warehouse'
import { reducedMotion } from './kit'

export const BY = 0.62
export const BOARD = { x0: -8.4, x1: 12.0, z0: -6.7, z1: 6.7 }
export const PAGE = { x0: 0.6, x1: 11.7, z0: -6.3, z1: 6.3, chipX0: 2.05, chipX1: 11.45 }
export const CPU = new Vector3(-4.6, BY, -1.4)
export const HEADER = new Vector3(-1.9, BY, 5.95)
export const SAFE = BY + 2.2

/** The belt runs toward negative z, from the cabinet side up to the arm's pickup. */
export const BELT = { x: -10.1, z0: 2.4, z1: -6.1, y: 0.56, w: 1.15, speed: 5.4, gap: 1.3 }
/** A SCARA on a rail along the board's top edge: the carriage slides to the job, two links swing in the plane of the bench. */
export const ARM = { rail: { x0: -14.0, x1: 11.6, z: -8.75 }, L1: 7.7, L2: 7.7, h: 3.2, park: new Vector3(3.36, SAFE + 0.4, -8.75) }
export const LAMP = { clamp: new Vector3(12.9, 0, 0.3), post: 3.0, L1: 6.3, L2: 6.3, park: new Vector3(13.5, 2.2, 11.6), ring: 1.0 }
export const METER = { x: 13.75, z: -5.3, w: 1.9, d: 2.7, h: 0.5 }
export const BENCH = { x0: -16.9, x1: 15.1, z0: -9.8, z1: 9.1 }

/** Drawer organizer leaning back `tilt` so its fronts face a camera that looks down from +z. */
export const CAB = {
  cols: 3, rows: 6, tilt: (25 * Math.PI) / 180,
  w: 1.5, h: 0.42, d: 2.4, pitchX: 1.58, pitchY: 0.47, slide: 1.1,
  W: 4.86, H: 2.92, D: 2.6,
  pivot: new Vector3(-13.95, 1.1, 2.6),
  /** Where a pulled drawer is set down flat on the mat. */
  tray: { z: 5.9 },
  tile: { cols: 3, pitch: 0.5, rowsVisible: 4, front: 0.35 },
}
export const CAB_MATRIX = new Matrix4().makeRotationFromEuler(new Euler(-CAB.tilt, 0, 0)).setPosition(CAB.pivot)
export const CAB_INVERSE = CAB_MATRIX.clone().invert()
const CAB_QUAT = new Quaternion().setFromEuler(new Euler(-CAB.tilt, 0, 0))
export const cabWorld = (local: Vector3, out = new Vector3()) => out.copy(local).applyMatrix4(CAB_MATRIX)
export const drawerLocal = (i: number) => ({
  x: (i % CAB.cols - (CAB.cols - 1) / 2) * CAB.pitchX,
  y: CAB.H - 0.08 - (Math.floor(i / CAB.cols) + 0.5) * CAB.pitchY,
})

const dPos = new Vector3(), dPosB = new Vector3(), dQuat = new Quaternion(), dScale = new Vector3(1, 1, 1)
const IDENTITY = new Quaternion()
/**
 * A drawer's world matrix at pull-out progress `open`: it slides out of its
 * slot, then lifts out and is set down flat on the mat in front of the cabinet.
 */
export function drawerMatrix(aisle: number, open: number, out: Matrix4) {
  const d = drawerLocal(aisle)
  const a = Math.min(1, open / 0.3)
  const s = Math.max(0, (open - 0.3) / 0.7)
  const e = s * s * (3 - 2 * s)
  cabWorld(dPos.set(d.x, d.y, CAB.slide * a))
  dPosB.set(CAB.pivot.x + d.x, CAB.h / 2 + 0.03, CAB.tray.z)
  dPos.lerp(dPosB, e)
  dPos.y += Math.sin(e * Math.PI) * 1.4
  dQuat.copy(CAB_QUAT).slerp(IDENTITY, e)
  return out.compose(dPos, dQuat, dScale)
}
export type Pkg = 'qfp' | 'qfn' | 'soic' | 'dip' | 'passive' | 'module'
export type Spec = { pkg: Pkg; w: number; d: number; h: number; lead: number; fw: number; fd: number; c: number }

export const BANDS: { label: string; groups: string[] }[] = [
  { label: 'HERO', groups: ['hero'] },
  { label: 'LOGOS', groups: ['logo'] },
  { label: 'FEATURES', groups: ['feature', 'integration', 'embed'] },
  { label: 'CONTENT', groups: ['content', 'stats', 'comparator', 'collection'] },
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
  const at = BANDS.findIndex((band) => band.groups.includes(groupOf(category)))
  return at === -1 ? BANDS.length - 1 : at
}

const PKG_BY_GROUP: Record<string, Pkg> = {
  hero: 'qfp', feature: 'qfp', pricing: 'qfp', comparator: 'qfp', collection: 'qfp',
  content: 'soic', testimonials: 'soic', faq: 'soic', contact: 'soic', footer: 'soic',
  integration: 'qfn', logo: 'qfn', stats: 'qfn', call: 'qfn', team: 'qfn', embed: 'qfn',
  other: 'dip',
}
export const PKG_NAME: Record<Pkg, string> = { qfp: 'LQFP', qfn: 'QFN', soic: 'SOIC', dip: 'PDIP', passive: '1206', module: 'MEZZ' }

const hash = (s: string) => {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return (h >>> 0) / 4294967295
}

const specs = new Map<string, Spec>()
export function specOf(item: CatalogItem): Spec {
  const hit = specs.get(item.ref)
  if (hit) return hit
  const c = Math.min(1, (item.description.length + item.title.length * 4) / 220) * 0.75 + hash(item.ref) * 0.25
  const q = (v: number) => Math.round(v * 20) / 20
  const make = (pkg: Pkg, w: number, d: number, h: number, lead: number, leadX: boolean, leadZ: boolean): Spec => ({
    pkg, w: q(w), d: q(d), h, lead, c, fw: q(w) + (leadX ? lead * 2 : 0), fd: q(d) + (leadZ ? lead * 2 : 0),
  })
  let s: Spec
  if (item.kind === 'feature') s = make('module', 2.6, 1.3, 0.5, 0, false, false)
  else if (item.kind === 'component') s = make('passive', 0.62, 0.32, 0.2, 0, false, false)
  else {
    const pkg = PKG_BY_GROUP[groupOf(item.category)] ?? 'dip'
    if (pkg === 'qfp') { const k = 0.95 + 0.5 * c; s = make(pkg, k, k, 0.13, 0.17, true, true) }
    else if (pkg === 'qfn') { const k = 0.7 + 0.38 * c; s = make(pkg, k, k, 0.09, 0.03, true, true) }
    else if (pkg === 'soic') s = make(pkg, 1.0 + 0.7 * c, 0.52, 0.15, 0.17, false, true)
    else s = make('dip', 1.15 + 0.6 * c, 0.58, 0.3, 0.1, false, true)
  }
  specs.set(item.ref, s)
  return s
}

export type Slot = { x: number; y: number; z: number; s: number }
export type Ghost = { spec: Spec; band: number; slot: Slot; title: string }
export type Hatch = { x0: number; x1: number; z0: number; z1: number }

const ghostSpecs: { band: number; pkg: Pkg; c: number; title: string }[] = [
  { band: 0, pkg: 'qfp', c: 0.7, title: 'site header' },
  { band: 3, pkg: 'soic', c: 0.4, title: 'rich text' },
  { band: 3, pkg: 'qfn', c: 0.2, title: 'media' },
  { band: 3, pkg: 'soic', c: 0.9, title: 'archive' },
  { band: 7, pkg: 'soic', c: 1, title: 'site footer' },
]
const fakeSpec = (pkg: Pkg, c: number): Spec => {
  const item = { kind: 'block', category: `block:${Object.entries(PKG_BY_GROUP).find(([, p]) => p === pkg)![0]}`, description: 'x'.repeat(Math.round(c * 200)), title: '', ref: `ghost-${pkg}-${c}` } as CatalogItem
  return specOf(item)
}

type Entry = { key: string; spec: Spec }
function packBand(entries: Entry[], b: number) {
  const out = new Map<string, Slot>()
  if (!entries.length) return out
  const W = PAGE.chipX1 - PAGE.chipX0
  const top = bandZ(b) + 0.36
  const D = BAND_D - 0.42
  let s = 1
  for (let tries = 0; tries < 30; tries++) {
    const gap = 0.32 * s
    const rows: Entry[][] = [[]]
    let x = 0
    for (const e of entries) {
      const w = e.spec.fw * s
      if (x > 0 && x + w > W) { rows.push([]); x = 0 }
      rows[rows.length - 1].push(e)
      x += w + gap
    }
    const rowD = Math.max(...entries.map((e) => e.spec.fd)) * s
    const total = rows.length * rowD + (rows.length - 1) * 0.1 * s
    if (total <= D || s < 0.15) {
      rows.forEach((row, r) => {
        let cx = PAGE.chipX0
        const cz = top + r * (rowD + 0.1 * s) + rowD / 2 + Math.max(0, (D - total) / 2) * 0.5
        for (const e of row) {
          const w = e.spec.fw * s
          out.set(e.key, { x: cx + w / 2, y: BY, z: cz, s })
          cx += w + gap
        }
      })
      return out
    }
    s *= 0.9
  }
  return out
}

function packGrid(keys: Entry[], area: { x0: number; x1: number; z0: number; z1: number }, pitchX: number, pitchZ: number) {
  const out = new Map<string, Slot>()
  const W = area.x1 - area.x0, D = area.z1 - area.z0
  let s = 1
  while (s > 0.12) {
    const cols = Math.max(1, Math.floor(W / (pitchX * s)))
    const rows = Math.ceil(keys.length / cols)
    if (rows * pitchZ * s <= D) {
      keys.forEach((e, i) => out.set(e.key, { x: area.x0 + ((i % cols) + 0.5) * pitchX * s, y: BY, z: area.z0 + (Math.floor(i / cols) + 0.5) * pitchZ * s, s }))
      return out
    }
    s *= 0.88
  }
  return out
}

export type Layout = { slots: Map<string, Slot>; ghosts: Ghost[]; hatches: Hatch[] }

export function layout(parts: Part[], target: Setup['target']): Layout {
  const slots = new Map<string, Slot>()
  const ghosts: Ghost[] = []
  const hatches: Hatch[] = []
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
    const packed = packBand(entries, b)
    let hx1 = -Infinity
    for (const [key, slot] of packed) {
      if (key.startsWith('ghost:')) {
        const i = Number(key.slice(6))
        const spec = entries.find((e) => e.key === key)!.spec
        ghosts.push({ spec, band: b, slot, title: ghostList[i].title })
        hx1 = Math.max(hx1, slot.x + (spec.fw * slot.s) / 2)
      } else slots.set(key, slot)
    }
    if (hx1 > -Infinity) hatches.push({ x0: PAGE.chipX0 - 0.2, x1: hx1 + 0.18, z0: bandZ(b) + 0.3, z1: bandZ(b + 1) - 0.04 })
  })
  for (const [k, v] of packGrid(comps, { x0: -3.75, x1: -1.35, z0: 1.45, z1: 4.95 }, 0.82, 0.58)) slots.set(k, v)
  feats.forEach((e, i) => slots.set(e.key, { x: -6.05, y: BY + Math.floor(i / 3) * 0.72, z: 2.0 + (i % 3) * 1.55, s: 1 }))
  return { slots, ghosts, hatches }
}

export type Route = { pts: Vector3[]; vias: Vector3[]; len: number; cum: number[] }

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

function densify(poly: Vector3[], step = 0.08) {
  const pts: Vector3[] = [poly[0].clone()]
  for (let i = 1; i < poly.length; i++) {
    const a = poly[i - 1], b = poly[i]
    const n = Math.max(1, Math.ceil(a.distanceTo(b) / step))
    for (let k = 1; k <= n; k++) pts.push(a.clone().lerp(b, k / n))
  }
  return pts
}

export function makeRoute(corners: Vector3[], vias: Vector3[], organic = false): Route {
  let pts: Vector3[]
  if (!organic) pts = densify(chamfer(corners, 0.22))
  else {
    const curve = new CatmullRomCurve3(chamfer(corners, 0.9), false, 'centripetal', 0.5)
    pts = curve.getSpacedPoints(Math.max(8, Math.ceil(curve.getLength() / 0.08)))
  }
  const cum = [0]
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]))
  return { pts, vias, len: cum[cum.length - 1], cum }
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

/** Channel above each chip, then the bus spine west of the page, then a CPU pin. Lane order keeps the bus crossing-free. */
export function routeAll(parts: Part[], framework: Setup['framework']) {
  const y = BY + 0.006
  const half = cpuHalf(framework)
  const east = CPU.x + half.w
  const blocks = parts.filter((p) => p.item.kind === 'block' && p.slot)
  const byBand = new Map<number, Part[]>()
  for (const p of blocks) {
    const b = bandOf(p.item.category)
    byBand.set(b, [...(byBand.get(b) ?? []), p])
  }
  const zc = new Map<Part, number>()
  for (const [b, list] of byBand) {
    const sorted = [...list].sort((a, c) => c.slot!.x - a.slot!.x)
    const step = Math.min(0.06, 0.26 / sorted.length)
    sorted.forEach((p, i) => zc.set(p, bandZ(b) + 0.05 + i * step))
  }
  const north = blocks.filter((p) => zc.get(p)! < CPU.z).sort((a, c) => zc.get(a)! - zc.get(c)!)
  const south = blocks.filter((p) => zc.get(p)! >= CPU.z).sort((a, c) => zc.get(c)! - zc.get(a)!)
  const lanes = (group: Part[], sign: number) => {
    const sx = Math.min(0.075, 1.25 / Math.max(1, group.length))
    const sz = Math.min(0.11, (half.d - 0.15) / Math.max(1, group.length))
    group.forEach((p, i) => {
      const s = p.slot!
      const top = s.z - (p.spec.fd * s.s) / 2
      const x = -1.05 + i * sx
      const pz = CPU.z + sign * (half.d - 0.12 - i * sz)
      const c = zc.get(p)!
      const corners = [new Vector3(s.x, y, top), new Vector3(s.x, y, c), new Vector3(x, y, c), new Vector3(x, y, pz), new Vector3(east, y, pz)]
      p.route = makeRoute(corners.reverse(), [new Vector3(x, y, c), new Vector3(x, y, pz)])
    })
  }
  lanes(north, -1)
  lanes(south, 1)
  const southEdge = CPU.z + half.d
  parts.filter((p) => p.item.kind === 'component' && p.slot).forEach((p, i) => {
    const s = p.slot!
    const lane = 0.95 - (i % 8) * 0.07
    const x = CPU.x + half.w - 0.25 - (i % 12) * 0.2
    const corners = [new Vector3(x, y, southEdge), new Vector3(x, y, southEdge + lane), new Vector3(s.x, y, southEdge + lane), new Vector3(s.x, y, s.z - 0.14 * s.s)]
    p.route = makeRoute(corners, [new Vector3(s.x, y, southEdge + lane)])
  })
  parts.filter((p) => p.item.kind === 'feature' && p.slot).forEach((p, i) => {
    const s = p.slot!
    const x = s.x - 0.9 + (i % 3) * 0.25
    p.route = makeRoute([new Vector3(x, y, southEdge), new Vector3(x, y, s.z - 0.75)], [])
  })
}

export function staticRoutes(framework: Setup['framework']) {
  const y = BY + 0.006
  const half = cpuHalf(framework)
  const power: Route[] = []
  const memory: Route[] = []
  for (let i = 0; i < 5; i++) {
    const x = CPU.x - 1.1 + i * 0.55
    const x2 = -7.0 + i * 1.05
    power.push(makeRoute([new Vector3(x2, y, -4.25), new Vector3(x2, y, -3.7 + i * 0.07), new Vector3(x, y, -3.7 + i * 0.07), new Vector3(x, y, CPU.z - half.d)], []))
  }
  for (let i = 0; i < 8; i++) {
    const z = CPU.z - 1.05 + i * 0.3
    memory.push(makeRoute([new Vector3(-6.85, y, z), new Vector3(-6.55, y, z), new Vector3(-6.4, y, CPU.z - 1.0 + i * 0.28), new Vector3(CPU.x - half.w, y, CPU.z - 1.0 + i * 0.28)], []))
  }
  return { power, memory }
}

export type Mode = 'queued' | 'pop' | 'belt' | 'carry' | 'seated' | 'lift' | 'return'
type Fly = { from: Vector3; to: Vector3; t: number; dur: number; h: number; s0: number; s1: number; then: Mode | 'gone' }
export type Part = {
  item: CatalogItem
  spec: Spec
  aisle: number
  pos: Vector3
  yaw: number
  scale: number
  mode: Mode
  fly: Fly | null
  beltT: number
  slot: Slot | null
  order: number
  seatedAt: number
  route: Route | null
  drawn: number
  flash: number
  cell: number
}
type Step = { to: (out: Vector3) => Vector3; arrive?: () => boolean | void }
/** What the line did this step, drained by the entry into sound and the live region. */
export type SimEvent = { kind: 'queue' | 'seat' | 'toss' | 'servo' | 'chirp' | 'zap'; part: Part }

/** The one pulled-out drawer: its filtered items, scroll in rows and pull-out progress. */
export type Drawer = {
  aisle: number
  items: CatalogItem[]
  index: Map<string, number>
  scroll: number
  scrollTarget: number
  open: number
  matrix: Matrix4
  /** The previous drawer on its way back into the cabinet. */
  closing: { aisle: number; open: number } | null
}

export type Sim = {
  /** The newest `Lab`, so arm callbacks that fire later read the current selection, not the one they were queued under. */
  lab: Lab
  parts: Map<string, Part>
  feed: Part[]
  belt: Part[]
  removals: Part[]
  arm: { pos: Vector3; steps: Step[]; holding: Part | null; job: Part | null }
  drawer: Drawer
  drawerOf: Map<CategoryId, number>
  aisles: readonly Aisle[]
  time: number
  order: number
  selected: ReadonlySet<string> | null
  target: Setup['target'] | null
  framework: Setup['framework'] | null
  layout: Layout
  version: number
  lastAdded: Part | null
  lastAddedAt: number
  lastSeat: Part | null
  lastSeatAt: number
  lastRemoved: Part | null
  lastRemovedAt: number
  lastClickAt: number
  agentFlash: { part: Part; t: number } | null
  cells: number[]
  events: SimEvent[]
}

const local = new Vector3()
/** Tile `k` in drawer-local space: origin at the front wall's centre, z running back into the drawer. Rows fill from the back wall forward. */
export function tileLocal(k: number, scroll: number, out = new Vector3()) {
  const col = k % CAB.tile.cols, row = Math.floor(k / CAB.tile.cols)
  return out.set((col - (CAB.tile.cols - 1) / 2) * CAB.tile.pitch, -CAB.h / 2 + 0.05, -(CAB.d - CAB.tile.front) + (row - scroll) * CAB.tile.pitch)
}
export const tileVisible = (z: number) => z < -0.14 && z > -(CAB.d - 0.14)

/** World position of tile `k` in the open drawer, or null when it is scrolled out of the drawer's opening. */
export function tileWorld(sim: Sim, k: number, out = new Vector3()) {
  tileLocal(k, sim.drawer.scroll, local)
  if (!tileVisible(local.z)) return null
  return out.copy(local).applyMatrix4(sim.drawer.matrix)
}

export function drawerFront(aisle: number, out = new Vector3()) {
  const d = drawerLocal(aisle)
  return cabWorld(local.set(d.x, d.y, 0.08), out)
}

export function homeOf(sim: Sim, p: Part, out = new Vector3()) {
  const k = sim.drawer.aisle === p.aisle && sim.drawer.open > 0.9 ? sim.drawer.index.get(p.item.ref) : undefined
  const at = k === undefined ? null : tileWorld(sim, k, out)
  if (at) return { pos: at.setY(at.y + 0.04), s: Math.min(1, (CAB.tile.pitch * 0.78) / Math.max(p.spec.fw, p.spec.fd)) }
  return { pos: drawerFront(p.aisle, out), s: 0.12 }
}

export const matches = (item: CatalogItem, q: string) => !q || `${item.title} ${item.label} ${item.ref}`.toLowerCase().includes(q)

export function openDrawer(sim: Sim, aisle: number, query: string) {
  const q = query.trim().toLowerCase()
  const items = aisle < 0 ? [] : sim.aisles[aisle].racks.flatMap((r) => r.bins.map((b) => b.item)).filter((i) => matches(i, q))
  if (sim.drawer.aisle !== aisle) {
    if (sim.drawer.aisle >= 0 && sim.drawer.open > 0.05) sim.drawer.closing = { aisle: sim.drawer.aisle, open: sim.drawer.open }
    sim.drawer.scroll = 0
    sim.drawer.scrollTarget = 0
    sim.drawer.open = 0
    drawerMatrix(aisle, 0, sim.drawer.matrix)
  }
  sim.drawer.aisle = aisle
  sim.drawer.items = items
  sim.drawer.index = new Map(items.map((item, i) => [item.ref, i]))
  sim.version++
}
export const drawerRows = (sim: Sim) => Math.ceil(sim.drawer.items.length / CAB.tile.cols)
export function scrollDrawer(sim: Sim, rows: number) {
  const max = Math.max(0, drawerRows(sim) - CAB.tile.rowsVisible)
  sim.drawer.scrollTarget = Math.min(max, Math.max(0, Math.round(sim.drawer.scrollTarget + rows)))
}

const FLY = reducedMotion ? 0.5 : 1
const RATE = reducedMotion ? 3 : 1

function startFly(p: Part, to: Vector3, dur: number, h: number, then: Fly['then'], s1: number) {
  p.fly = { from: p.pos.clone(), to: to.clone(), t: 0, dur: dur * FLY, h, s0: p.scale, s1, then }
}

function sendHome(sim: Sim, p: Part, dur = 0.9, h = 3) {
  p.mode = 'return'
  p.route = null
  p.drawn = 0
  const home = homeOf(sim, p)
  startFly(p, home.pos, dur, h, 'gone', home.s)
  sim.events.push({ kind: 'toss', part: p })
}

const cellOf = (sim: Sim) => {
  const taken = new Set<number>()
  for (const p of sim.parts.values()) taken.add(p.cell)
  let c = 0
  while (taken.has(c)) c++
  return c
}

export function createSim(lab: Lab): Sim {
  const sim: Sim = {
    lab, parts: new Map(), feed: [], belt: [], removals: [],
    arm: { pos: ARM.park.clone(), steps: [], holding: null, job: null },
    drawer: { aisle: -1, items: [], index: new Map(), scroll: 0, scrollTarget: 0, open: 0, matrix: new Matrix4(), closing: null },
    drawerOf: new Map(lab.warehouse.aisles.map((a, i) => [a.id, i])),
    aisles: lab.warehouse.aisles,
    time: 0, order: 0, selected: null, target: null, framework: null,
    layout: { slots: new Map(), ghosts: [], hatches: [] }, version: 0,
    lastAdded: null, lastAddedAt: -99, lastSeat: null, lastSeatAt: -99, lastRemoved: null, lastRemovedAt: -99, lastClickAt: -99, agentFlash: null, cells: [], events: [],
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
  relayout(sim, lab)
  for (const p of sim.parts.values()) if (p.slot) p.pos.set(p.slot.x, p.slot.y, p.slot.z)
  return sim
}

function newPart(sim: Sim, item: CatalogItem): Part {
  const p: Part = {
    item, spec: specOf(item), aisle: sim.drawerOf.get(item.category) ?? 0, pos: new Vector3(), yaw: 0, scale: 1, mode: 'queued', fly: null, beltT: 0,
    slot: null, order: sim.order++, seatedAt: -1, route: null, drawn: 0, flash: 0, cell: cellOf(sim),
  }
  const home = homeOf(sim, p)
  p.pos.copy(home.pos)
  p.scale = home.s
  return p
}

export function relayout(sim: Sim, lab: Lab) {
  const wanted = [...sim.parts.values()].filter((p) => lab.selected.has(p.item.ref)).sort((a, b) => a.order - b.order)
  sim.layout = layout(wanted, lab.setup.target)
  for (const p of sim.parts.values()) p.slot = sim.layout.slots.get(p.item.ref) ?? p.slot
  const seated = wanted.filter((p) => p.mode !== 'lift' && p.mode !== 'return')
  for (const p of seated) p.route = null
  routeAll(seated, lab.setup.framework)
  sim.target = lab.setup.target
  sim.framework = lab.setup.framework
  sim.version++
}

const tmp = new Vector3()
const armTo = new Vector3()
const beltAt = (t: number, out: Vector3) => out.set(BELT.x, BELT.y, BELT.z0 - t)
const BELT_LEN = BELT.z0 - BELT.z1

const removed = (sim: Sim, p: Part) => {
  sim.lastRemoved = p
  sim.lastRemovedAt = sim.time
}

export function step(sim: Sim, lab: Lab, dt: number) {
  sim.time += dt
  sim.lab = lab
  const wanted = lab.selected
  if (wanted !== sim.selected) {
    const instant = sim.time < 0.6
    const seatNow: Part[] = []
    for (const ref of wanted) {
      if (sim.parts.has(ref)) continue
      const item = lab.catalog.items.find((i) => i.ref === ref)
      if (!item) continue
      const p = newPart(sim, item)
      sim.parts.set(ref, p)
      if (instant) {
        p.mode = 'seated'
        p.scale = 1
        p.drawn = 1
        p.seatedAt = -10
        seatNow.push(p)
        continue
      }
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
        removed(sim, p)
      } else if (!want && p.mode === 'belt') {
        sim.belt.splice(sim.belt.indexOf(p), 1)
        sendHome(sim, p)
        removed(sim, p)
      } else if (!want && p.mode === 'seated' && sim.arm.job !== p && !sim.removals.includes(p)) {
        sim.removals.push(p)
        removed(sim, p)
      } else if (!want && (p.mode === 'carry' || p.mode === 'pop')) removed(sim, p)
      else if (want && p.mode === 'seated' && sim.removals.includes(p)) sim.removals.splice(sim.removals.indexOf(p), 1)
    }
    sim.selected = wanted
    relayout(sim, lab)
    for (const p of seatNow) if (p.slot) p.pos.set(p.slot.x, p.slot.y, p.slot.z)
  } else if (sim.target !== lab.setup.target || sim.framework !== lab.setup.framework) relayout(sim, lab)

  const d = sim.drawer
  d.open += ((d.aisle >= 0 ? 1 : 0) - d.open) * (1 - Math.exp(-dt * 6 * RATE))
  if (d.aisle >= 0) drawerMatrix(d.aisle, d.open, d.matrix)
  if (d.closing) {
    d.closing.open *= Math.exp(-dt * 7 * RATE)
    if (d.closing.open < 0.02) d.closing = null
  }
  d.scroll += (d.scrollTarget - d.scroll) * (1 - Math.exp(-dt * 12 * RATE))

  const last = sim.belt[sim.belt.length - 1]
  let popping = false
  for (const p of sim.parts.values()) if (p.mode === 'pop') popping = true
  if (sim.feed.length && !popping && (!last || last.beltT > 0.5 + BELT.gap)) {
    const p = sim.feed.shift()!
    p.mode = 'pop'
    startFly(p, beltAt(0.5, tmp), 0.7, 2.4, 'belt', 1)
  }
  for (let i = 0; i < sim.belt.length; i++) {
    const p = sim.belt[i]
    if (p.fly) continue
    const limit = i === 0 ? BELT_LEN : sim.belt[i - 1].beltT - BELT.gap
    p.beltT = Math.max(p.beltT, Math.min(p.beltT + BELT.speed * dt, limit))
    beltAt(p.beltT, p.pos)
  }

  const g = sim.arm
  if (!g.steps.length) {
    const removal = sim.removals[0]
    const head = sim.belt[0]
    if (removal && removal.mode !== 'seated') sim.removals.shift()
    else if (removal) {
      sim.removals.shift()
      g.job = removal
      sim.events.push({ kind: 'servo', part: removal })
      const at = (o: Vector3) => o.set(removal.pos.x, removal.pos.y + removal.spec.h * removal.scale + 0.02, removal.pos.z)
      g.steps = [
        { to: (o) => at(o).setY(SAFE) },
        {
          to: at,
          arrive: () => {
            if (sim.lab.selected.has(removal.item.ref) || removal.mode !== 'seated') return false
            removal.mode = 'lift'
            g.holding = removal
          },
        },
        {
          to: (o) => at(o).setY(SAFE + 0.6),
          arrive: () => {
            g.holding = null
            sendHome(sim, removal, 1.1, 3.4)
          },
        },
      ]
    } else if (head && !head.fly && head.beltT >= BELT_LEN - 0.01) {
      const pick = (o: Vector3) => beltAt(BELT_LEN, o).setY(BELT.y + head.spec.h + 0.02)
      const over = (o: Vector3) => o.set(head.slot?.x ?? 0, SAFE, head.slot?.z ?? 0)
      g.job = head
      sim.events.push({ kind: 'servo', part: head })
      g.steps = [
        { to: (o) => pick(o).setY(SAFE) },
        {
          to: pick,
          arrive: () => {
            if (sim.belt[0] !== head) return false
            sim.belt.shift()
            head.mode = 'carry'
            g.holding = head
          },
        },
        { to: (o) => pick(o).setY(SAFE) },
        { to: over },
        {
          to: (o) => o.set(head.slot?.x ?? 0, (head.slot?.y ?? BY) + head.spec.h * (head.slot?.s ?? 1) + 0.02, head.slot?.z ?? 0),
          arrive: () => {
            g.holding = null
            const L = sim.lab
            if (!L.selected.has(head.item.ref)) {
              sendHome(sim, head)
              return
            }
            head.mode = 'seated'
            head.seatedAt = sim.time
            head.drawn = 0
            if (!head.route) {
              const routed: Part[] = []
              for (const p of sim.parts.values()) if (p.mode === 'seated' || p.mode === 'carry') routed.push(p)
              routeAll(routed, L.setup.framework)
            }
            sim.lastSeat = head
            sim.lastSeatAt = sim.time
            sim.version++
            sim.events.push({ kind: 'seat', part: head })
            if (L.setup.agent !== 'none') sim.agentFlash = { part: head, t: 0 }
          },
        },
        { to: over },
      ]
    }
  }
  const target = g.steps.length ? g.steps[0].to(armTo) : ARM.park
  const rush = 1 + Math.min(1.5, (sim.belt.length + sim.removals.length + sim.feed.length) * 0.25)
  tmp.copy(target).sub(g.pos)
  const dist = tmp.length()
  const move = Math.min(dist * (1 - Math.exp(-dt * 8 * rush * RATE)), 20 * rush * RATE * dt)
  if (dist > 1e-5) g.pos.addScaledVector(tmp, move / dist)
  if (g.steps.length && g.pos.distanceTo(g.steps[0].to(armTo)) < 0.04) {
    const s = g.steps.shift()!
    if (s.arrive?.() === false) g.steps = []
    if (!g.steps.length) g.job = null
  }
  if (g.holding) {
    g.holding.pos.copy(g.pos).setY(g.pos.y - g.holding.spec.h * g.holding.scale - 0.02)
    const s1 = g.holding.mode === 'carry' ? (g.holding.slot?.s ?? 1) : g.holding.scale
    g.holding.scale += (s1 - g.holding.scale) * (1 - Math.exp(-dt * 6))
  }

  for (const p of sim.parts.values()) {
    if (p.fly) {
      const f = p.fly
      f.t += dt / f.dur
      const t = Math.min(1, f.t)
      const e = t * t * (3 - 2 * t)
      p.pos.lerpVectors(f.from, f.to, e)
      p.pos.y += f.h * 4 * t * (1 - t)
      p.scale = f.s0 + (f.s1 - f.s0) * e
      p.yaw = reducedMotion ? 0 : p.mode === 'return' ? t * Math.PI * 3 : p.mode === 'pop' ? t * Math.PI : 0
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
          if (!wanted.has(p.item.ref)) sendHome(sim, p)
          else {
            p.mode = 'belt'
            p.beltT = 0.5
            sim.belt.push(p)
          }
        }
      }
      continue
    }
    if (p.mode === 'queued') {
      const home = homeOf(sim, p, tmp)
      p.pos.lerp(home.pos, 1 - Math.exp(-dt * 12))
      if (!reducedMotion) p.pos.y += Math.abs(Math.sin(sim.time * 9 + p.order)) * 0.22
      p.scale = home.s
    } else if (p.mode === 'seated' && p.slot) {
      p.pos.lerp(tmp.set(p.slot.x, p.slot.y, p.slot.z), 1 - Math.exp(-dt * 10))
      p.scale += (p.slot.s - p.scale) * (1 - Math.exp(-dt * 10))
      if (p.drawn < 1) {
        p.drawn = Math.min(1, p.drawn + dt / (Math.max(0.5, (p.route?.len ?? 8) / 16) * FLY))
        if (p.drawn >= 1 && p.seatedAt > 0) sim.events.push({ kind: 'chirp', part: p })
      }
    }
    p.flash = Math.max(0, p.flash - dt * 1.6)
  }

  if (sim.agentFlash) {
    sim.agentFlash.t += dt / 1.1
    if (sim.agentFlash.t >= 1) {
      sim.agentFlash.part.flash = 1
      sim.events.push({ kind: 'zap', part: sim.agentFlash.part })
      sim.agentFlash = null
    }
  }
}

export function inFlight(sim: Sim) {
  let n = sim.feed.length + sim.belt.length
  for (const p of sim.parts.values()) if (p.mode === 'pop' || p.mode === 'carry') n++
  return n
}

const moving = (sim: Sim, p: Part | null | undefined): p is Part => !!p && sim.parts.get(p.item.ref) === p && (p.mode === 'queued' || p.mode === 'pop' || p.mode === 'belt' || p.mode === 'carry')

/** The part the follow cam tracks: the newest add while the queue is short, otherwise whatever the line is moving right now. */
export function travelling(sim: Sim) {
  if (inFlight(sim) <= 2 && moving(sim, sim.lastAdded)) return sim.lastAdded
  const job = sim.arm.job
  if (job && job.mode === 'carry') return job
  for (const p of sim.parts.values()) if (p.mode === 'pop') return p
  return sim.belt[0] ?? null
}

/** The latest removal while it is still on its way back: lifted off the board or flying home. */
export function returning(sim: Sim) {
  const p = sim.lastRemoved
  if (!p || sim.lastRemovedAt < sim.lastAddedAt || sim.parts.get(p.item.ref) !== p) return null
  if (p.mode === 'lift' || p.mode === 'return') return p
  if (p.mode === 'seated' && (sim.arm.job === p || sim.removals.includes(p))) return p
  return null
}

/** True while anything on the line, the drawer or a trace is still changing. */
export function simBusy(sim: Sim) {
  const d = sim.drawer
  if (sim.feed.length || sim.belt.length || sim.removals.length || sim.arm.steps.length || sim.agentFlash || d.closing) return true
  if (Math.abs((d.aisle >= 0 ? 1 : 0) - d.open) > 0.002 || Math.abs(d.scrollTarget - d.scroll) > 0.002) return true
  for (const p of sim.parts.values()) if (p.fly || p.mode !== 'seated' || p.drawn < 1 || p.flash > 0) return true
  return false
}

const ik = { t1: 0, t2: 0 }
/** Planar two-link inverse kinematics; `elbow` picks which of the two bends to use. Writes into and returns one shared result. */
export function ik2(dx: number, dy: number, L1: number, L2: number, elbow: 1 | -1) {
  const d = Math.min(Math.max(Math.hypot(dx, dy), Math.abs(L1 - L2) + 0.01), L1 + L2 - 0.01)
  const phi = Math.atan2(dy, dx)
  const a = Math.acos(Math.min(1, Math.max(-1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d))))
  ik.t1 = phi + elbow * a
  ik.t2 = Math.atan2(dy - L1 * Math.sin(ik.t1), dx - L1 * Math.cos(ik.t1))
  return ik
}

const softMax = (a: number, b: number, s: number) => b + s * Math.log1p(Math.exp((a - b) / s))
const scara = { baseX: 0, t1: 0, t2: 0 }
/**
 * The SCARA pose for a quill position. The carriage is a pure function of the
 * quill, a set reach behind it, and eases into the rail ends instead of
 * stopping dead, so the elbow folds gradually when the carriage runs out of
 * rail and never snaps while the quill reverses.
 */
export function scaraSolve(p: Vector3) {
  const dz = p.z - ARM.rail.z
  const reach = ARM.L1 + ARM.L2 - 0.4
  const bend = 0.62 + 0.23 * (1 - Math.min(1, Math.abs(dz) / 4))
  const k = bend * Math.sqrt(Math.max(0, reach * reach - dz * dz))
  scara.baseX = -softMax(-softMax(p.x - k, ARM.rail.x0, 2), -ARM.rail.x1, 2)
  const { t1, t2 } = ik2(p.x - scara.baseX, -dz, ARM.L1, ARM.L2, 1)
  scara.t1 = t1
  scara.t2 = t2
  return scara
}
