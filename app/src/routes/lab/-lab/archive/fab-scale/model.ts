import { Vector3 } from 'three'

import type { CatalogItem } from '../../../../workspace/-workspace/workspace.types'
import type { Aisle, Warehouse } from '../../warehouse'
import { CARD, COLS, DRAWER, WALL, cabinetX, colPitch, drawerCapacity, drawerY } from './layout'

/** How a cabinet's drawers are formed. Source is the warehouse's own racks. */
export type GroupBy = 'source' | 'name' | 'newest'
export const GROUPS: readonly { value: GroupBy; label: string }[] = [
  { value: 'source', label: 'Registry' },
  { value: 'name', label: 'A to Z' },
  { value: 'newest', label: 'Newest' },
]

export type Card = {
  item: CatalogItem
  code: string
  cabinet: number
  drawer: number
  col: number
  row: number
  /** Cabinet-local position of the card's center with its drawer closed. */
  local: Vector3
  /** Field index, stable across regroups. */
  index: number
}

export type Drawer = {
  cabinet: number
  slot: number
  label: string
  /** The registry's short tag for the colored tab, 0 when not grouped by source. */
  facet: number
  cards: Card[]
}

export type Cabinet = {
  index: number
  aisle: Aisle
  x: number
  label: string
  hue: number
  count: number
  drawers: Drawer[]
  slots: number
  height: number
}

export type Store = {
  cabinets: Cabinet[]
  cards: Card[]
  byRef: Map<string, Card>
  /** Every drawer across the wall, so dynamic open amounts can be a flat array. */
  drawers: Drawer[]
  slots: number
  facets: string[]
}

const chunk = <T,>(list: readonly T[], size: number) => Array.from({ length: Math.ceil(list.length / size) }, (_, k) => list.slice(k * size, (k + 1) * size))

function groupsOf(aisle: Aisle, groupBy: GroupBy, facets: Map<string, number>): { label: string; facet: number; items: CatalogItem[] }[] {
  const all = aisle.racks.flatMap((rack) => rack.bins.map((bin) => bin.item))
  const capacity = drawerCapacity(all[0]?.kind ?? 'block')
  if (groupBy === 'source')
    return aisle.racks.flatMap((rack) => {
      const sorted = [...rack.bins.map((bin) => bin.item)].sort((a, b) => a.title.localeCompare(b.title))
      const parts = chunk(sorted, capacity)
      return parts.map((items, k) => ({ label: parts.length > 1 ? `${rack.name} ${k + 1}/${parts.length}` : rack.name, facet: facets.get(rack.source) ?? 0, items }))
    })
  if (groupBy === 'name') {
    const sorted = [...all].sort((a, b) => a.title.localeCompare(b.title))
    return chunk(sorted, capacity).map((items) => {
      const a = items[0].title[0].toUpperCase(), b = items[items.length - 1].title[0].toUpperCase()
      return { label: a === b ? a : `${a} to ${b}`, facet: 0, items }
    })
  }
  const sorted = [...all].sort((a, b) => (b.ref > a.ref ? 1 : -1))
  return chunk(sorted, capacity).map((items, k) => ({ label: `${k === 0 ? 'Newest ' : ''}${k * capacity + 1} – ${k * capacity + items.length}`, facet: 0, items }))
}

/**
 * The wall from the warehouse: one cabinet per aisle, drawers by the chosen
 * grouping, cards filed in columns and rows. Every cabinet has the same
 * number of drawer slots so the wall reads as one piece; spare slots stay
 * blank, which is room to grow rather than emptiness.
 */
export function buildStore(warehouse: Warehouse, groupBy: GroupBy, previous?: Store): Store {
  const aisles = warehouse.aisles
  const facets = new Map<string, number>()
  for (const aisle of aisles) for (const rack of aisle.racks) if (!facets.has(rack.source)) facets.set(rack.source, facets.size)
  const grouped = aisles.map((aisle) => groupsOf(aisle, groupBy, facets))
  const slots = Math.max(4, ...grouped.map((g) => g.length))
  const index = new Map(previous?.cards.map((card) => [card.item.ref, card.index]) ?? [])
  const cards: Card[] = []
  const drawers: Drawer[] = []
  const cabinets = aisles.map((aisle, i): Cabinet => {
    const x = cabinetX(i, aisles.length)
    const kind = aisle.racks[0]?.bins[0]?.item.kind ?? 'block'
    const cols = COLS[kind], pitch = colPitch(kind)
    const cabinetDrawers = grouped[i].map((group, slot): Drawer => {
      const drawer: Drawer = { cabinet: i, slot, label: group.label, facet: group.facet, cards: [] }
      const y = drawerY(slot, slots)
      drawer.cards = group.items.map((item, n): Card => {
        const col = n % cols, row = Math.floor(n / cols)
        const card: Card = {
          item,
          code: warehouse.bins.get(item.ref)?.code ?? '',
          cabinet: i,
          drawer: drawers.length,
          col,
          row,
          local: new Vector3(-WALL.width / 2 + DRAWER.inset + 0.1 + (col + 0.5) * pitch, y - DRAWER.h / 2 + 0.06, WALL.z1 - DRAWER.inset - 0.22 - row * CARD.row),
          index: index.get(item.ref) ?? -1,
        }
        cards.push(card)
        return card
      })
      drawers.push(drawer)
      return drawer
    })
    return { index: i, aisle, x, label: aisle.label, hue: aisle.hue, count: aisle.count, drawers: cabinetDrawers, slots, height: 0 }
  })
  let next = index.size
  for (const card of cards) if (card.index < 0) card.index = next++
  cards.sort((a, b) => a.index - b.index)
  return { cabinets, cards, byRef: new Map(cards.map((card) => [card.item.ref, card])), drawers, slots, facets: [...facets.keys()] }
}

export const matchItem = (item: CatalogItem, query: string) => {
  const q = query.trim().toLowerCase()
  return !q || item.title.toLowerCase().includes(q) || item.label.toLowerCase().includes(q) || item.ref.toLowerCase().includes(q)
}
