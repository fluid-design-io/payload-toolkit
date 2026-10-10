import type { Catalog, CatalogItem } from '../../../../workspace/-workspace/workspace.types'

export type Grouping = 'category' | 'source' | 'grid'
export type Sort = 'facet' | 'name' | 'newest' | 'popular'
export type Density = 'roomy' | 'standard' | 'dense'

export const SLOT = 0.95
export const POST = 0.3
export const LEVEL_H = 0.62
export const BASE_H = 0.28
export const BIN = { w: 0.8, h: 0.44, d: 0.58 }
export const RACK_D = 0.8
export const WALK = 4.4
export const PITCH = WALK + RACK_D
export const SPINE_W = 3.6
export const PAD = 1.4
export const GAP = 7
export const ROAD = 4.2

const DENSITY: Record<Density, readonly [number, number]> = { roomy: [4, 3], standard: [4, 5], dense: [8, 5] }

/** Where the picker can stand: a rack walkway, the front road, or the dock beside the belt. */
export type Loc = { k: 'walk'; b: number; zw: number; x: number } | { k: 'road'; x: number } | { k: 'dock' }
export type Way = { x: number; z: number; loc: Loc }

export type Building = { key: string; label: string; count: number; aisles: number; x0: number; x1: number; z0: number; z1: number; spine: number; h: number }
export type Row = { b: number; face: number; walk: number; x0: number; x1: number }
export type Group = { key: string; no: number; label: string; hue: number; count: number; b: number; row: number; x: number }
export type Sign = { group: number; row: number; x: number; first: boolean; w: number }
export type Section = { group: number; label: string; hue: number; count: number; row: number; x0: number; x1: number; first: boolean }
export type Bay = { x: number; row: number; items: number[] }
export type Lane = { label: string; hue: number; x0: number; x1: number; z0: number; z1: number; column: boolean }

export type Layout = {
  key: string
  slots: number
  levels: number
  bayW: number
  rackH: number
  pos: Float32Array
  codes: string[]
  groupOf: Int16Array
  rowOf: Int16Array
  groups: Group[]
  buildings: Building[]
  rows: Row[]
  signs: Sign[]
  sections: Section[]
  bays: Bay[]
  lanes: Lane[]
  dock: { x: number; z: number }
  cell: { x: number; z: number }
  bounds: { x0: number; x1: number; z0: number; z1: number }
}

export type Facts = { installs: Float32Array; age: Float32Array; sourceHue: Map<string, number>; sourceName: Map<string, string> }

function hash(text: string) {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return (h >>> 0) / 4294967296
}

const firstParty = (source: string) => source === 'payload-toolkit' || source === '@payload-components'

/** Synthetic installs and age, deterministic per ref: originals are older and popular, remixes are new with a long tail. */
export function toFacts(catalog: Catalog): Facts {
  const n = catalog.items.length
  const installs = new Float32Array(n)
  const age = new Float32Array(n)
  const sourceName = new Map<string, string>()
  catalog.items.forEach((item, i) => {
    const a = hash(item.ref), b = hash(`${item.ref}#`)
    const round = Number(/-(\d+)$/.exec(item.name)?.[1] ?? 0)
    const remix = round > 0 && !firstParty(item.source)
    installs[i] = remix ? 20 + 6000 * a ** 4 : 900 + 9000 * a
    age[i] = remix ? 1 + Math.floor(160 * b * b) : 60 + Math.floor(500 * b)
    sourceName.set(item.source, item.sourceName ?? (item.source === 'payload-toolkit' ? 'Payload Toolkit' : item.source))
  })
  const sources = [...sourceName.keys()].sort((x, y) => Number(firstParty(y)) - Number(firstParty(x)) || x.localeCompare(y))
  const sourceHue = new Map(sources.map((source, i) => [source, firstParty(source) ? 200 : (28 + i * 41) % 360]))
  return { installs, age, sourceHue, sourceName }
}

const zoneLabels: Record<string, string> = { F: 'Features', C: 'Components', B: 'Blocks', P: 'First-party', R: 'Community' }
const letters = ['A–C', 'D–F', 'G–K', 'L–O', 'P–S', 'T–Z'] as const
const letterOf = (title: string) => {
  const ch = title.trim().toUpperCase().charCodeAt(0)
  let at = 0
  'ADGLPT'.split('').forEach((start, k) => {
    if (ch >= start.charCodeAt(0)) at = k
  })
  return at
}

type G = { key: string; label: string; hue: number; zone: string; items: number[] }
type S = { label: string; hue: number; items: number[]; facet?: string }

export function buildLayout(catalog: Catalog, facts: Facts, grouping: Grouping, sort: Sort, density: Density): Layout {
  const items = catalog.items
  const n = items.length
  const [slots, levels] = DENSITY[density]
  const per = slots * levels
  const bayW = slots * SLOT + POST
  const rackH = BASE_H + levels * LEVEL_H + 0.08
  const categories = [...catalog.kinds.filter((k) => k.id !== 'all'), ...catalog.blocks].filter((c) => c.count > 0)
  const catLabel = new Map(categories.map((c) => [c.id as string, c.label]))
  const catHue = new Map<string, number>()
  for (const item of items) if (!catHue.has(item.category)) catHue.set(item.category, item.hue)

  const push = (map: Map<string, number[]>, key: string, i: number) => {
    const list = map.get(key)
    if (list) list.push(i)
    else map.set(key, [i])
  }

  let groups: G[]
  if (grouping === 'source') {
    const by = new Map<string, number[]>()
    items.forEach((item, i) => push(by, item.source, i))
    groups = [...by]
      .sort((a, b) => Number(firstParty(b[0])) - Number(firstParty(a[0])) || b[1].length - a[1].length)
      .map(([source, list]) => ({ key: source, label: facts.sourceName.get(source) ?? source, hue: facts.sourceHue.get(source) ?? 200, zone: firstParty(source) ? 'P' : 'R', items: list }))
  } else {
    const by = new Map<string, number[]>()
    items.forEach((item, i) => push(by, item.category, i))
    groups = categories
      .map((c) => ({ key: c.id as string, label: c.label, hue: catHue.get(c.id) ?? 0, zone: c.id === 'feature' ? 'F' : c.id === 'component' ? 'C' : 'B', items: by.get(c.id) ?? [] }))
      .filter((g) => g.items.length)
  }

  const facetOf = (item: CatalogItem) => (grouping === 'source' ? item.category : item.source)
  const facetLabel = (key: string) => (grouping === 'source' ? (catLabel.get(key) ?? key) : (facts.sourceName.get(key) ?? key))
  const facetHue = (key: string) => (grouping === 'source' ? (catHue.get(key) ?? 0) : (facts.sourceHue.get(key) ?? 200))
  const byTitle = (a: number, b: number) => items[a].title.localeCompare(items[b].title)
  const inner = (a: number, b: number) =>
    sort === 'newest' ? facts.age[a] - facts.age[b] || byTitle(a, b) : sort === 'popular' ? facts.installs[b] - facts.installs[a] || byTitle(a, b) : byTitle(a, b)

  function sectionsOf(list: number[]): S[] {
    if (sort === 'facet' || grouping === 'grid') {
      const by = new Map<string, number[]>()
      for (const i of list) push(by, facetOf(items[i]), i)
      return [...by]
        .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
        .map(([key, members]) => ({ label: facetLabel(key), hue: facetHue(key), items: members.sort(inner), facet: key }))
    }
    const sorted = [...list].sort(inner)
    const buckets: S[] = []
    const bucket = (label: string, hue: number) => {
      let last = buckets[buckets.length - 1]
      if (!last || last.label !== label) buckets.push((last = { label, hue, items: [] }))
      return last
    }
    sorted.forEach((i, rank) => {
      if (sort === 'name') {
        const at = letterOf(items[i].title)
        bucket(letters[at], 180 + at * 22).items.push(i)
      } else if (sort === 'newest') {
        const d = facts.age[i]
        const [label, hue] = d <= 7 ? ['This week', 150] : d <= 30 ? ['This month', 175] : d <= 120 ? ['This quarter', 200] : ['Older', 222]
        bucket(label, hue).items.push(i)
      } else {
        const p = rank / sorted.length
        const [label, hue] = p < 0.1 ? ['Bestsellers', 18] : p < 0.4 ? ['Steady', 38] : ['Long tail', 215]
        bucket(label, hue).items.push(i)
      }
    })
    return buckets
  }

  const pos = new Float32Array(n * 3)
  const codes: string[] = new Array(n)
  const groupOf = new Int16Array(n)
  const rowOf = new Int16Array(n)
  const bOf = new Int16Array(n)
  const colOf = new Int16Array(n)
  const levelOf = new Int8Array(n)
  const slotOf = new Int8Array(n)
  const outGroups: Group[] = []
  const buildings: Building[] = []
  const rows: Row[] = []
  const signs: (Sign & { col: number })[] = []
  const sections: (Section & { c0: number; c1: number })[] = []
  const bays: (Bay & { col: number })[] = []
  const lanes: (Lane & { c0: number; c1: number; b: number })[] = []

  const totalBays = groups.reduce((sum, g) => sum + sectionsOf(g.items).reduce((s, sec) => s + Math.ceil(sec.items.length / per), 0), 0)
  const rowBays = Math.min(24, Math.max(3, Math.round(Math.sqrt(totalBays) * 1.5)))
  const zones = [...new Set(groups.map((g) => g.zone))]
  const pad = (v: number) => String(v).padStart(2, '0')

  for (const zone of zones) {
    const b = buildings.length
    const rowStart = rows.length
    let col = 0
    let maxCol = 0
    const zoneGroups = groups.filter((g) => g.zone === zone)
    const newRow = () => {
      rows.push({ b, face: 0, walk: 0, x0: 0, x1: 0 })
      col = 0
    }
    const placeBins = (list: number[], baysOf: { row: number; col: number }[], gi: number, no: number, startBay: number) => {
      list.forEach((i, j) => {
        const bay = baysOf[Math.floor(j / per)]
        const within = j % per
        groupOf[i] = gi
        rowOf[i] = bay.row
        bOf[i] = b
        colOf[i] = bay.col
        levelOf[i] = Math.floor(within / slots)
        slotOf[i] = within % slots
        codes[i] = `${zone}${pad(no)}-${pad(startBay + Math.floor(j / per) + 1)}-${levelOf[i] + 1}${'ABCDEFGH'[slotOf[i]]}`
      })
    }

    if (grouping === 'grid') {
      const facetsHere = new Map<string, number>()
      for (const g of zoneGroups) for (const sec of sectionsOf(g.items)) facetsHere.set(sec.facet!, Math.max(facetsHere.get(sec.facet!) ?? 0, Math.ceil(sec.items.length / per)))
      const order = [...facetsHere.keys()].sort((x, y) => Number(firstParty(y)) - Number(firstParty(x)) || x.localeCompare(y))
      const start = new Map<string, number>()
      let acc = 0
      for (const key of order) {
        start.set(key, acc)
        acc += facetsHere.get(key)!
      }
      maxCol = acc
      for (const key of order) lanes.push({ label: facetLabel(key), hue: facetHue(key), x0: 0, x1: 0, z0: 0, z1: 0, column: true, c0: start.get(key)!, c1: start.get(key)! + facetsHere.get(key)!, b })
      for (const g of zoneGroups) {
        const gi = outGroups.length
        newRow()
        const row = rows.length - 1
        outGroups.push({ key: g.key, no: gi + 1, label: g.label, hue: g.hue, count: g.items.length, b, row, x: 0 })
        signs.push({ group: gi, row, x: 0, first: true, col: 0, w: 0 })
        for (const sec of sectionsOf(g.items)) {
          const c0 = start.get(sec.facet!)!
          const nb = Math.ceil(sec.items.length / per)
          const baysOf = Array.from({ length: nb }, (_, k) => ({ row, col: c0 + k }))
          placeBins(sec.items, baysOf, gi, gi + 1, c0)
          baysOf.forEach((bay, k) => bays.push({ x: 0, row, items: sec.items.slice(k * per, (k + 1) * per), col: bay.col }))
          sections.push({ group: gi, label: sec.label, hue: sec.hue, count: sec.items.length, row, x0: 0, x1: 0, first: true, c0, c1: c0 + nb })
        }
      }
    } else {
      newRow()
      for (const g of zoneGroups) {
        const gi = outGroups.length
        const secs = sectionsOf(g.items)
        const gb = secs.reduce((s, sec) => s + Math.ceil(sec.items.length / per), 0)
        if (col > 0 && col + gb > rowBays && (gb <= rowBays || rowBays - col < 3)) newRow()
        outGroups.push({ key: g.key, no: gi + 1, label: g.label, hue: g.hue, count: g.items.length, b, row: rows.length - 1, x: 0 })
        let bayNo = 0
        let lastRow = -1
        for (const sec of secs) {
          const nb = Math.ceil(sec.items.length / per)
          const baysOf: { row: number; col: number }[] = []
          for (let k = 0; k < nb; k++) {
            if (col >= rowBays) newRow()
            const row = rows.length - 1
            baysOf.push({ row, col })
            if (row !== lastRow) {
              signs.push({ group: gi, row, x: 0, first: lastRow === -1, col, w: 0 })
              lastRow = row
            }
            col++
            maxCol = Math.max(maxCol, col)
          }
          placeBins(sec.items, baysOf, gi, gi + 1, bayNo)
          bayNo += nb
          baysOf.forEach((bay, k) => bays.push({ x: 0, row: bay.row, items: sec.items.slice(k * per, (k + 1) * per), col: bay.col }))
          let runStart = 0
          for (let k = 1; k <= baysOf.length; k++) {
            if (k === baysOf.length || baysOf[k].row !== baysOf[runStart].row) {
              const inRun = sec.items.slice(runStart * per, k * per).length
              sections.push({ group: gi, label: sec.label, hue: sec.hue, count: runStart === 0 ? sec.items.length : inRun, row: baysOf[runStart].row, x0: 0, x1: 0, first: runStart === 0, c0: baysOf[runStart].col, c1: baysOf[k - 1].col + 1 })
              runStart = k
            }
          }
        }
      }
    }

    const x0 = buildings.length ? buildings[buildings.length - 1].x1 + GAP : 0
    const count = zoneGroups.reduce((s, g) => s + g.items.length, 0)
    rows.slice(rowStart).forEach((row, k) => {
      row.face = -WALK - k * PITCH
      row.walk = row.face + WALK * 0.5
    })
    const depth = rows.length - rowStart
    const x1 = x0 + PAD + maxCol * bayW + SPINE_W
    buildings.push({ key: zone, label: zoneLabels[zone] ?? zone, count, aisles: zoneGroups.length, x0, x1, z0: -WALK - (depth - 1) * PITCH - RACK_D - 1.4, z1: 0, spine: x1 - SPINE_W / 2, h: rackH + 2.4 })
  }

  const colX = (b: number, col: number) => buildings[b].x0 + PAD + col * bayW
  for (let i = 0; i < n; i++) {
    const row = rows[rowOf[i]]
    pos[i * 3] = colX(bOf[i], colOf[i]) + POST / 2 + slotOf[i] * SLOT + SLOT / 2
    pos[i * 3 + 1] = BASE_H + levelOf[i] * LEVEL_H + BIN.h / 2 + 0.03
    pos[i * 3 + 2] = row.face - BIN.d / 2 - 0.06
  }
  for (const row of rows) {
    row.x0 = buildings[row.b].x0 + PAD
    row.x1 = row.x0
  }
  for (const bay of bays) {
    const row = rows[bay.row]
    bay.x = colX(row.b, bay.col) + bayW / 2
    row.x1 = Math.max(row.x1, colX(row.b, bay.col) + bayW)
  }
  for (const g of outGroups) {
    const sign = signs.find((s) => s.group === outGroups.indexOf(g))!
    g.row = sign.row
    g.x = colX(rows[sign.row].b, sign.col)
  }
  for (const s of signs) s.x = colX(rows[s.row].b, s.col)
  for (const s of sections) {
    const b = rows[s.row].b
    s.x0 = colX(b, s.c0)
    s.x1 = colX(b, s.c1)
  }
  for (const s of signs) s.w = Math.max(...sections.filter((sec) => sec.group === s.group && sec.row === s.row).map((sec) => sec.x1)) - s.x
  const outLanes: Lane[] = []
  if (grouping === 'grid')
    for (const lane of lanes) {
      const bd = buildings[lane.b]
      outLanes.push({ label: lane.label, hue: lane.hue, x0: colX(lane.b, lane.c0) + 0.1, x1: colX(lane.b, lane.c1) - 0.1, z0: bd.z0 + 0.6, z1: ROAD - 1.6, column: true })
    }
  else for (const s of sections) outLanes.push({ label: s.label, hue: s.hue, x0: s.x0 + 0.08, x1: s.x1 - 0.08, z0: rows[s.row].face + 0.1, z1: rows[s.row].face + 1.0, column: false })

  const x0 = buildings[0].x0, x1 = buildings[buildings.length - 1].x1
  const cell = { x: Math.max(x0 + 6, (x0 + x1) / 2 - 4), z: ROAD + 7 }
  const dock = { x: cell.x - 5.2, z: cell.z + 1.6 }
  const bounds = { x0: x0 - 2, x1: Math.max(x1, cell.x + 15) + 2, z0: Math.min(...buildings.map((bd) => bd.z0)) - 2, z1: cell.z + 4.6 }
  return {
    key: `${grouping}-${sort}-${density}-${n}`,
    slots, levels, bayW, rackH, pos, codes, groupOf, rowOf,
    groups: outGroups, buildings, rows,
    signs: signs.map(({ col: _, ...s }) => s),
    sections: sections.map(({ c0: _, c1: __, ...s }) => s),
    bays: bays.map(({ col: _, ...b }) => b),
    lanes: outLanes, dock, cell, bounds,
  }
}

export function stopOf(L: Layout, i: number): Loc {
  const row = L.rows[L.rowOf[i]]
  return { k: 'walk', b: row.b, zw: row.walk, x: L.pos[i * 3] }
}

export function posOf(L: Layout, loc: Loc): [number, number] {
  if (loc.k === 'walk') return [loc.x, loc.zw]
  if (loc.k === 'road') return [loc.x, ROAD]
  return [L.dock.x, L.dock.z]
}

function exit(L: Layout, a: Loc, out: Way[]) {
  if (a.k === 'walk') {
    const spine = L.buildings[a.b].spine
    out.push({ x: spine, z: a.zw, loc: { k: 'walk', b: a.b, zw: a.zw, x: spine } }, { x: spine, z: ROAD, loc: { k: 'road', x: spine } })
  } else if (a.k === 'dock') out.push({ x: L.dock.x, z: ROAD, loc: { k: 'road', x: L.dock.x } })
}

function enter(L: Layout, b: Loc, out: Way[]) {
  if (b.k === 'walk') {
    const spine = L.buildings[b.b].spine
    out.push({ x: spine, z: ROAD, loc: { k: 'road', x: spine } }, { x: spine, z: b.zw, loc: { k: 'walk', b: b.b, zw: b.zw, x: spine } }, { x: b.x, z: b.zw, loc: b })
  } else if (b.k === 'road') out.push({ x: b.x, z: ROAD, loc: b })
  else out.push({ x: L.dock.x, z: ROAD, loc: { k: 'road', x: L.dock.x } }, { x: L.dock.x, z: L.dock.z, loc: b })
}

/** Manhattan route through the comb: walkway to the building's spine, spine to the road, road to the next spine. */
export function route(L: Layout, a: Loc, b: Loc): Way[] {
  const out: Way[] = []
  if (a.k === 'walk' && b.k === 'walk' && a.b === b.b) {
    if (Math.abs(a.zw - b.zw) > 1e-3) {
      const spine = L.buildings[a.b].spine
      out.push({ x: spine, z: a.zw, loc: { k: 'walk', b: a.b, zw: a.zw, x: spine } }, { x: spine, z: b.zw, loc: { k: 'walk', b: b.b, zw: b.zw, x: spine } })
    }
    out.push({ x: b.x, z: b.zw, loc: b })
  } else if (!(a.k === 'dock' && b.k === 'dock')) {
    exit(L, a, out)
    enter(L, b, out)
  }
  const [sx, sz] = posOf(L, a)
  return out.filter((w, k) => {
    const prev = k ? out[k - 1] : { x: sx, z: sz }
    return k === out.length - 1 || Math.abs(prev.x - w.x) + Math.abs(prev.z - w.z) > 1e-3
  })
}

export function routeLength(L: Layout, a: Loc, path: Way[]) {
  let [x, z] = posOf(L, a)
  let len = 0
  for (const w of path) {
    len += Math.abs(w.x - x) + Math.abs(w.z - z)
    x = w.x
    z = w.z
  }
  return len
}

/** Greedy nearest-neighbour tour from `start` over up to `cap` candidates, then back to the dock. */
export function tour(L: Layout, start: Loc, candidates: readonly number[], cap: number) {
  const left = new Set(candidates)
  const order: number[] = []
  const path: Way[] = []
  let at = start
  let length = 0
  while (left.size && order.length < cap) {
    let best = -1, bestLen = Infinity, bestPath: Way[] = []
    for (const i of left) {
      const p = route(L, at, stopOf(L, i))
      const len = routeLength(L, at, p)
      if (len < bestLen) [best, bestLen, bestPath] = [i, len, p]
    }
    left.delete(best)
    order.push(best)
    path.push(...bestPath)
    length += bestLen
    at = stopOf(L, best)
  }
  const home = route(L, at, { k: 'dock' })
  length += routeLength(L, at, home)
  path.push(...home)
  return { order, path, length }
}
