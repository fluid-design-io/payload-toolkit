import type { Catalog, CatalogItem, CategoryId, RegistryItem } from '../../workspace/-workspace/workspace.types'

/** F holds bundled features, C components, B blocks. */
export type ZoneId = 'F' | 'C' | 'B'

/**
 * One item's pick location. `code` reads zone, aisle, bay, then level and
 * slot, such as `B07-03-2C`: aisle 7, bay 3, level 2, slot C.
 */
export type Bin = {
  item: CatalogItem
  code: string
  zone: ZoneId
  aisle: number
  rack: number
  bay: number
  level: number
  slot: number
}

/** One registry source's shelving inside an aisle. Bays run along the aisle. */
export type Rack = { source: string; name: string; bays: number; bins: readonly Bin[] }

export type Aisle = {
  id: CategoryId
  no: number
  label: string
  hue: number
  zone: ZoneId
  racks: readonly Rack[]
  count: number
  bays: number
}

export type Zone = { id: ZoneId; label: string; aisles: readonly Aisle[] }

export type Warehouse = {
  zones: readonly Zone[]
  aisles: readonly Aisle[]
  /** By ref. */
  bins: ReadonlyMap<string, Bin>
}

export const slotsPerLevel = 4
export const levelsPerBay = 5
export const binsPerBay = slotsPerLevel * levelsPerBay

const zoneLabels: Record<ZoneId, string> = { F: 'Features', C: 'Components', B: 'Blocks' }
const zoneOf = (id: CategoryId): ZoneId => (id === 'feature' ? 'F' : id === 'component' ? 'C' : 'B')
const pad = (value: number) => String(value).padStart(2, '0')

/**
 * Zone, then aisle per category in rail order, then rack per registry source
 * (largest first), then bays of `binsPerBay` filled level by level in title
 * order. Bay numbers continue across an aisle's racks.
 */
export function toWarehouse(catalog: Catalog): Warehouse {
  const bins = new Map<string, Bin>()
  const aisles = [...catalog.kinds.slice(1), ...catalog.blocks]
    .filter((category) => category.count > 0)
    .map((category, index): Aisle => {
      const no = index + 1
      const zone = zoneOf(category.id)
      const members = catalog.items.filter((item) => item.category === category.id)
      const bySource = new Map<string, CatalogItem[]>()
      for (const item of members) bySource.set(item.source, [...(bySource.get(item.source) ?? []), item])
      let bay = 0
      const racks = [...bySource]
        .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
        .map(([source, items], rack): Rack => {
          const sorted = [...items].sort((a, b) => a.title.localeCompare(b.title))
          const first = bay
          const rackBins = sorted.map((item, position): Bin => {
            const within = position % binsPerBay
            const bin: Bin = {
              item,
              zone,
              aisle: no,
              rack,
              bay: first + Math.floor(position / binsPerBay) + 1,
              level: Math.floor(within / slotsPerLevel) + 1,
              slot: within % slotsPerLevel,
              code: '',
            }
            bin.code = `${zone}${pad(no)}-${pad(bin.bay)}-${bin.level}${'ABCD'[bin.slot]}`
            bins.set(item.ref, bin)
            return bin
          })
          bay += Math.ceil(sorted.length / binsPerBay)
          return { source, name: items[0].sourceName ?? source, bays: Math.ceil(sorted.length / binsPerBay), bins: rackBins }
        })
      return { id: category.id, no, label: category.label, hue: 0, zone, racks, count: members.length, bays: bay }
    })
    .map((aisle) => ({ ...aisle, hue: catalog.items.find((item) => item.category === aisle.id)?.hue ?? 0 }))

  const zones = (['F', 'C', 'B'] as const).map((id) => ({
    id,
    label: zoneLabels[id],
    aisles: aisles.filter((aisle) => aisle.zone === id),
  }))
  return { zones, aisles, bins }
}

const registries = [
  ['@payload-components', 'Payload Components'],
  ['@shipblocks', 'Shipblocks'],
  ['@acme-ui', 'Acme UI'],
  ['@cms-kit', 'CMS Kit'],
  ['@fluid', 'Fluid'],
  ['@pixelforge', 'Pixelforge'],
  ['@northwind', 'Northwind Blocks'],
  ['@studio-x', 'Studio X'],
] as const
const flavours = ['bold', 'soft', 'mono', 'glass', 'brutal', 'retro', 'neon', 'paper', 'swiss', 'dense', 'airy', 'noir']

/**
 * A deterministic "gone viral" catalog of about `target` items for scale
 * experiments: the real items plus remixes from fake registries. Group
 * prefixes are kept so `toCatalog` groups them as before; popular groups
 * (larger real groups) get proportionally more remixes. Remixes reuse the
 * original screenshot.
 */
export function viralItems(items: readonly RegistryItem[], target = 2400): RegistryItem[] {
  const out: RegistryItem[] = [...items]
  const seeds = items.filter((item) => item.kind !== 'feature' || item.name === 'forms')
  let round = 0
  while (out.length < target) {
    for (const [index, seed] of seeds.entries()) {
      if (out.length >= target) break
      const weight = seed.kind === 'block' ? 1 : 0.35
      if (((index * 7 + round * 13) % 100) / 100 > weight) continue
      const [source, sourceName] = registries[(index + round) % registries.length]
      const flavour = flavours[(index * 5 + round) % flavours.length]
      const name = `${seed.name}-${flavour}-${round + 1}`
      out.push({
        ...seed,
        ref: `${source}/${name}`,
        name,
        title: `${seed.title} ${flavour[0].toUpperCase()}${flavour.slice(1)} ${round + 1}`,
        source,
        sourceName,
        guide: undefined,
        itemUrl: undefined,
      })
    }
    round++
  }
  return out
}
