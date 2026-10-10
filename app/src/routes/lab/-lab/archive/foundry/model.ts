import { CatmullRomCurve3, Vector3 } from 'three'

import type { CatalogItem, CategoryId, Setup } from '../../../../workspace/-workspace/workspace.types'
import type { Lab } from '../../lab.types'

export const ACCENT = '#5A91AD'
export const debug = { speed: 1, hideTray: false }
export const BY = 0.62
export const BOARD = { x0: -8.4, x1: 12.0, z0: -6.7, z1: 6.7 }
export const PAGE = { x0: 0.6, x1: 11.7, z0: -6.3, z1: 6.3, chipX0: 2.05, chipX1: 11.45 }
export const TRAY = { x0: -16.6, x1: -10.6, z0: -5.4, z1: 6.4, y: 0.62 }
export const BELT = { x0: -16.4, x1: -9.9, z: -7.75, y: 0.62, speed: 5.2, gap: 1.25 }
export const RAIL = { back: -8.9, front: 7.5, x0: -11.0, x1: 12.6, top: 3.6 }
export const SAFE = BY + 2.1
export const PARK = new Vector3(-9.9, SAFE, -7.75)
export const CPU = new Vector3(-4.6, BY, -1.4)
export const HEADER = new Vector3(-1.9, BY, 5.95)

export type Pkg = 'qfp' | 'qfn' | 'soic' | 'dip' | 'passive' | 'module'
/** Body size at scale 1, lead reach beyond the body, and the footprint the layout reserves. */
export type Spec = { pkg: Pkg; w: number; d: number; h: number; lead: number; fw: number; fd: number; c: number }

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

const PKG_BY_GROUP: Record<string, Pkg> = {
  hero: 'qfp', feature: 'qfp', pricing: 'qfp', comparator: 'qfp',
  content: 'soic', testimonials: 'soic', faq: 'soic', contact: 'soic', footer: 'soic',
  integration: 'qfn', logo: 'qfn', stats: 'qfn', call: 'qfn', team: 'qfn',
  other: 'dip',
}
export const PKG_NAME: Record<Pkg, string> = {
  qfp: 'LQFP', qfn: 'QFN', soic: 'SOIC', dip: 'PDIP', passive: '1206 SMD', module: 'Mezzanine',
}

const hash = (s: string) => {
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
  if (item.kind === 'feature') return make('module', 2.6, 1.3, 0.5, 0, false, false)
  if (item.kind === 'component') return make('passive', 0.62, 0.32, 0.2, 0, false, false)
  const pkg = PKG_BY_GROUP[groupOf(item.category)] ?? 'dip'
  if (pkg === 'qfp') { const s = 0.95 + 0.5 * c; return make(pkg, s, s, 0.13, 0.17, true, true) }
  if (pkg === 'qfn') { const s = 0.7 + 0.38 * c; return make(pkg, s, s, 0.09, 0.03, true, true) }
  if (pkg === 'soic') return make(pkg, 1.0 + 0.7 * c, 0.52, 0.15, 0.17, false, true)
  return make('dip', 1.15 + 0.6 * c, 0.58, 0.3, 0.1, false, true)
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

export type RouteStyle = 'manhattan' | 'diagonal' | 'organic'
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

function densify(poly: Vector3[], step = 0.06) {
  const pts: Vector3[] = [poly[0].clone()]
  for (let i = 1; i < poly.length; i++) {
    const a = poly[i - 1], b = poly[i]
    const n = Math.max(1, Math.ceil(a.distanceTo(b) / step))
    for (let k = 1; k <= n; k++) pts.push(a.clone().lerp(b, k / n))
  }
  return pts
}

export function makeRoute(corners: Vector3[], style: RouteStyle, vias: Vector3[]): Route {
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
export function routeAll(parts: Part[], style: RouteStyle, framework: Setup['framework']) {
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
      p.route = makeRoute(corners.reverse(), style, [new Vector3(x, y, c), new Vector3(x, y, pz)])
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
    p.route = makeRoute(corners, style, [new Vector3(s.x, y, southEdge + lane)])
  })
  parts.filter((p) => p.item.kind === 'feature' && p.slot).forEach((p, i) => {
    const s = p.slot!
    const x = s.x - 0.9 + (i % 3) * 0.25
    const corners = [new Vector3(x, y, southEdge), new Vector3(x, y, s.z - 0.75)]
    p.route = makeRoute(corners, style, [])
  })
}

export function staticRoutes(style: RouteStyle, framework: Setup['framework']) {
  const y = BY + 0.006
  const half = cpuHalf(framework)
  const power: Route[] = []
  const memory: Route[] = []
  for (let i = 0; i < 5; i++) {
    const x = CPU.x - 1.1 + i * 0.55
    const x2 = -7.0 + i * 1.05
    power.push(makeRoute([new Vector3(x2, y, -4.25), new Vector3(x2, y, -3.7 + i * 0.07), new Vector3(x, y, -3.7 + i * 0.07), new Vector3(x, y, CPU.z - half.d)], style, []))
  }
  for (let i = 0; i < 8; i++) {
    const z = CPU.z - 1.05 + i * 0.3
    memory.push(makeRoute([new Vector3(-6.85, y, z), new Vector3(-6.55, y, z), new Vector3(-6.4, y, CPU.z - 1.0 + i * 0.28), new Vector3(CPU.x - half.w, y, CPU.z - 1.0 + i * 0.28)], style, []))
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
  flash: number
}
type Step = { to: () => Vector3; arrive?: () => boolean | void }

/** Where each ref sits in the tray right now; each aisle starts a fresh block under its own header. Refs outside the shown category fall back to the inlet. */
export type TrayLayout = {
  items: CatalogItem[]
  index: Map<string, number>
  pitch: number
  cols: number
  x0: number
  z0: number
  at: Float32Array
  headers: { label: string; z: number; h: number; count: number; rows: number }[]
}

export function trayLayout(groups: { label: string; items: CatalogItem[] }[]): TrayLayout {
  const items = groups.flatMap((g) => g.items)
  const n = Math.max(1, items.length)
  const W = TRAY.x1 - TRAY.x0, D = TRAY.z1 - TRAY.z0
  const headerH = (p: number) => (groups.length > 1 ? Math.max(0.3, p * 0.7) : 0)
  let pitch = Math.min(1.25, Math.sqrt((W * D) / n))
  let cols = 1
  for (let i = 0; i < 400; i++) {
    cols = Math.max(1, Math.floor(W / pitch))
    const depth = groups.reduce((sum, g) => sum + headerH(pitch) + Math.ceil(g.items.length / cols) * pitch, 0)
    if (depth <= D) break
    pitch *= 0.97
  }
  const x0 = TRAY.x0 + (W - cols * pitch) / 2
  const at = new Float32Array(items.length * 2)
  const headers: TrayLayout['headers'] = []
  let z = TRAY.z0
  let k = 0
  for (const g of groups) {
    const h = headerH(pitch)
    const rows = Math.ceil(g.items.length / cols)
    if (h) headers.push({ label: g.label, z, h, count: g.items.length, rows })
    z += h
    g.items.forEach((_, i) => {
      at[k * 2] = x0 + ((i % cols) + 0.5) * pitch
      at[k * 2 + 1] = z + (Math.floor(i / cols) + 0.5) * pitch
      k++
    })
    z += rows * pitch
  }
  return { items, index: new Map(items.map((item, i) => [item.ref, i])), pitch, cols, x0, z0: TRAY.z0, at, headers }
}
export function pocket(tray: TrayLayout, i: number, out = new Vector3()) {
  return out.set(tray.at[i * 2], TRAY.y + 0.04, tray.at[i * 2 + 1])
}
export const trayScale = (tray: TrayLayout, spec: Spec) => Math.min(1, (tray.pitch * 0.74) / Math.max(spec.fw, spec.fd))
const INLET = new Vector3(TRAY.x1 - 0.5, TRAY.y + 0.2, TRAY.z1 + 0.6)

export type Sim = {
  parts: Map<string, Part>
  feed: Part[]
  belt: Part[]
  removals: Part[]
  gantry: { pos: Vector3; steps: Step[]; holding: Part | null; job: Part | null }
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
}

export function homeOf(sim: Sim, p: Part, out = new Vector3()) {
  const i = sim.tray.index.get(p.item.ref)
  if (i === undefined) return { pos: out.copy(INLET), s: 0.15 }
  return { pos: pocket(sim.tray, i, out), s: trayScale(sim.tray, p.spec) }
}

function startFly(p: Part, to: Vector3, dur: number, h: number, then: Fly['then'], s1: number) {
  p.fly = { from: p.pos.clone(), to: to.clone(), t: 0, dur, h, s0: p.scale, s1, then }
}

function sendHome(sim: Sim, p: Part, dur = 0.9, h = 3) {
  p.mode = 'return'
  p.route = null
  p.drawn = 0
  const home = homeOf(sim, p)
  startFly(p, home.pos, dur, h, 'gone', home.s)
}

export function createSim(lab: Lab, tray: TrayLayout, style: RouteStyle): Sim {
  const sim: Sim = {
    parts: new Map(), feed: [], belt: [], removals: [],
    gantry: { pos: PARK.clone(), steps: [], holding: null, job: null },
    time: 0, order: 0, selected: null, target: null, style: null, framework: null, tray,
    layout: { slots: new Map(), ghosts: [], hatches: [] }, version: 0,
    lastAdded: null, lastAddedAt: -99, lastSeat: null, lastSeatAt: -99, agentFlash: null,
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
  return sim
}

function newPart(sim: Sim, item: CatalogItem): Part {
  const spec = specOf(item)
  const p: Part = {
    item, spec, pos: new Vector3(), yaw: 0, scale: 1, mode: 'queued', fly: null, beltX: 0,
    slot: null, order: sim.order++, seatedAt: -1, route: null, drawn: 0, flash: 0,
  }
  const home = homeOf(sim, p)
  p.pos.copy(home.pos)
  p.scale = home.s
  return p
}

export function relayout(sim: Sim, lab: Lab, style: RouteStyle) {
  const wanted = [...sim.parts.values()].filter((p) => lab.selected.has(p.item.ref)).sort((a, b) => a.order - b.order)
  sim.layout = layout(wanted, lab.setup.target)
  for (const p of sim.parts.values()) p.slot = sim.layout.slots.get(p.item.ref) ?? p.slot
  const seated = wanted.filter((p) => p.mode === 'seated' || p.mode === 'carry' || p.mode === 'belt' || p.mode === 'pop' || p.mode === 'queued')
  for (const p of seated) p.route = null
  routeAll(seated, style, lab.setup.framework)
  sim.target = lab.setup.target
  sim.style = style
  sim.framework = lab.setup.framework
  sim.version++
}

const tmp = new Vector3()

export function step(sim: Sim, lab: Lab, style: RouteStyle, dt: number) {
  sim.time += dt
  const wanted = lab.selected
  if (wanted !== sim.selected) {
    for (const ref of wanted) {
      const existing = sim.parts.get(ref)
      if (existing) continue
      const item = lab.catalog.items.find((i) => i.ref === ref)
      if (!item) continue
      const p = newPart(sim, item)
      sim.parts.set(ref, p)
      sim.feed.push(p)
      sim.lastAdded = p
      sim.lastAddedAt = sim.time
    }
    for (const p of sim.parts.values()) {
      const want = wanted.has(p.item.ref)
      if (!want && p.mode === 'queued') {
        sim.feed.splice(sim.feed.indexOf(p), 1)
        sendHome(sim, p, 0.4, 0.6)
      } else if (!want && p.mode === 'belt') {
        sim.belt.splice(sim.belt.indexOf(p), 1)
        sendHome(sim, p)
      } else if (!want && p.mode === 'seated' && sim.gantry.job !== p && !sim.removals.includes(p)) sim.removals.push(p)
      else if (want && p.mode === 'seated' && sim.removals.includes(p)) sim.removals.splice(sim.removals.indexOf(p), 1)
    }
    sim.selected = wanted
    relayout(sim, lab, style)
  } else if (sim.target !== lab.setup.target || sim.style !== style || sim.framework !== lab.setup.framework) relayout(sim, lab, style)

  const last = sim.belt[sim.belt.length - 1]
  const popping = [...sim.parts.values()].some((p) => p.mode === 'pop')
  if (sim.feed.length && !popping && (!last || last.beltX > BELT.x0 + 0.6 + BELT.gap)) {
    const p = sim.feed.shift()!
    p.mode = 'pop'
    startFly(p, tmp.set(BELT.x0 + 0.6, BELT.y, BELT.z), 0.6, 2.2, 'belt', 1)
  }
  sim.belt.forEach((p, i) => {
    if (p.fly) return
    const limit = i === 0 ? BELT.x1 : sim.belt[i - 1].beltX - BELT.gap
    p.beltX = Math.max(p.beltX, Math.min(p.beltX + BELT.speed * dt, limit))
    p.pos.set(p.beltX, BELT.y, BELT.z)
  })

  const g = sim.gantry
  if (!g.steps.length) {
    const removal = sim.removals[0]
    const head = sim.belt[0]
    if (removal && removal.mode !== 'seated') sim.removals.shift()
    else if (removal) {
      sim.removals.shift()
      g.job = removal
      const at = () => tmp.set(removal.pos.x, removal.pos.y + removal.spec.h * removal.scale + 0.02, removal.pos.z)
      g.steps = [
        { to: () => at().clone().setY(SAFE) },
        {
          to: () => at().clone(),
          arrive: () => {
            if (lab.selected.has(removal.item.ref) || removal.mode !== 'seated') return false
            removal.mode = 'lift'
            g.holding = removal
          },
        },
        {
          to: () => at().clone().setY(SAFE + 0.6),
          arrive: () => {
            g.holding = null
            sendHome(sim, removal, 1.1, 3.4)
          },
        },
      ]
    } else if (head && !head.fly && head.beltX >= BELT.x1 - 0.01) {
      const pick = () => tmp.set(BELT.x1, BELT.y + head.spec.h + 0.02, BELT.z)
      g.job = head
      g.steps = [
        { to: () => pick().clone().setY(SAFE) },
        {
          to: () => pick().clone(),
          arrive: () => {
            if (sim.belt[0] !== head) return false
            sim.belt.shift()
            head.mode = 'carry'
            g.holding = head
          },
        },
        { to: () => pick().clone().setY(SAFE) },
        { to: () => tmp.set(head.slot?.x ?? 0, SAFE, head.slot?.z ?? 0).clone() },
        {
          to: () => tmp.set(head.slot?.x ?? 0, (head.slot?.y ?? BY) + head.spec.h * (head.slot?.s ?? 1) + 0.02, head.slot?.z ?? 0).clone(),
          arrive: () => {
            g.holding = null
            if (!lab.selected.has(head.item.ref)) {
              sendHome(sim, head)
              return
            }
            head.mode = 'seated'
            head.seatedAt = sim.time
            head.drawn = 0
            if (!head.route) routeAll([...sim.parts.values()].filter((p) => p.mode === 'seated' || p.mode === 'carry'), style, lab.setup.framework)
            sim.lastSeat = head
            sim.lastSeatAt = sim.time
            if (lab.setup.agent !== 'none') sim.agentFlash = { part: head, t: 0 }
          },
        },
        { to: () => tmp.set(head.slot?.x ?? 0, SAFE, head.slot?.z ?? 0).clone() },
      ]
    }
  }
  const target = g.steps[0]?.to() ?? PARK
  const rush = 1 + Math.min(1.5, (sim.belt.length + sim.removals.length + sim.feed.length) * 0.25)
  tmp.copy(target).sub(g.pos)
  const dist = tmp.length()
  const move = Math.min(dist * (1 - Math.exp(-dt * 9 * rush)), 22 * rush * dt)
  if (dist > 1e-5) g.pos.addScaledVector(tmp, move / dist)
  if (g.steps.length && g.pos.distanceTo(g.steps[0].to()) < 0.04) {
    const s = g.steps.shift()!
    if (s.arrive?.() === false) g.steps = []
    if (!g.steps.length) g.job = null
  }
  if (g.holding) {
    g.holding.pos.copy(g.pos).setY(g.pos.y - g.holding.spec.h * g.holding.scale - 0.02)
    const s1 = g.holding.mode === 'carry' ? (g.holding.slot?.s ?? 1) : g.holding.scale
    g.holding.scale += (s1 - g.holding.scale) * (1 - Math.exp(-dt * 6))
  }

  for (const p of [...sim.parts.values()]) {
    if (p.fly) {
      const f = p.fly
      f.t += dt / f.dur
      const t = Math.min(1, f.t)
      const e = t * t * (3 - 2 * t)
      p.pos.lerpVectors(f.from, f.to, e)
      p.pos.y += f.h * 4 * t * (1 - t)
      p.scale = f.s0 + (f.s1 - f.s0) * e
      p.yaw = p.mode === 'return' ? t * Math.PI * 3 : p.mode === 'pop' ? t * Math.PI : 0
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
            p.beltX = BELT.x0 + 0.6
            sim.belt.push(p)
          }
        }
      }
      continue
    }
    if (p.mode === 'queued') {
      const home = homeOf(sim, p, tmp)
      p.pos.lerp(home.pos, 1 - Math.exp(-dt * 12))
      p.pos.y += Math.abs(Math.sin(sim.time * 9 + p.order)) * 0.25
      p.scale = home.s
    } else if (p.mode === 'seated' && p.slot) {
      p.pos.lerp(tmp.set(p.slot.x, p.slot.y, p.slot.z), 1 - Math.exp(-dt * 10))
      p.scale += (p.slot.s - p.scale) * (1 - Math.exp(-dt * 10))
      if (p.drawn < 1) p.drawn = Math.min(1, p.drawn + dt / Math.max(0.5, (p.route?.len ?? 8) / 16))
    }
    p.flash = Math.max(0, p.flash - dt * 1.6)
  }

  if (sim.agentFlash) {
    sim.agentFlash.t += dt / 1.1
    if (sim.agentFlash.t >= 1) {
      sim.agentFlash.part.flash = 1
      sim.agentFlash = null
    }
  }
}

/** The part the follow cam rides: the newest add while the queue is short, otherwise whatever the line is moving right now. */
export function travelling(sim: Sim) {
  if (sim.time - sim.lastAddedAt < 1.1) return null
  const moving = (p: Part | null | undefined) => !!p && sim.parts.has(p.item.ref) && (p.mode === 'queued' || p.mode === 'pop' || p.mode === 'belt' || p.mode === 'carry')
  if (inFlight(sim) <= 2 && moving(sim.lastAdded)) return sim.lastAdded
  const job = sim.gantry.job
  if (job && job.mode === 'carry') return job
  const popping = [...sim.parts.values()].find((p) => p.mode === 'pop')
  return popping ?? sim.belt[0] ?? null
}
export const inFlight = (sim: Sim) => sim.feed.length + sim.belt.length + [...sim.parts.values()].filter((p) => p.mode === 'pop' || p.mode === 'carry').length
