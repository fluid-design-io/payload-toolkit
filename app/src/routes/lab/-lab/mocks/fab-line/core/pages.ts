import { binsPerBay } from '../../../warehouse'
import type { Aisle } from '../../../warehouse'
import type { Part, Rig, Sim } from './contract'
import { matchItem } from './sim'

/** One table page: the part on each pocket (null leaves it empty), how many pockets it uses, and its label. */
export type Page = { parts: (Part | null)[]; slots: number; label: string }

const bay = (n: number) => String(n).padStart(2, '0')

/** The aisle the table shows: the rail's category, else the aisle with the most matches, else the hero block. */
export function activeAisle(aisles: readonly Aisle[], category: string, matches: number[] | null) {
  const at = aisles.findIndex((a) => a.id === category)
  if (at >= 0) return at
  if (matches) return matches.indexOf(Math.max(...matches))
  return Math.max(0, aisles.findIndex((a) => a.id === 'block:hero'))
}

/** The table's pages for one aisle: every match when searching, else whole bays grouped to fit the table. */
export function pagesOf(aisle: Aisle, table: Pick<Rig['table'], 'bays'>, query: string, sim: Pick<Sim, 'parts'>): Page[] {
  const bins = aisle.racks.flatMap((r) => r.bins)
  const per = table.bays * binsPerBay
  const of = (ref: string) => sim.parts.get(ref) ?? null
  if (query) {
    const hits = bins.filter((b) => matchItem(b.item, query))
    if (!hits.length) return [{ parts: [], slots: 0, label: `NO MATCHES FOR “${query.toUpperCase()}”` }]
    return Array.from({ length: Math.ceil(hits.length / per) }, (_, k) => {
      const list = hits.slice(k * per, k * per + per).map((b) => of(b.item.ref))
      return { parts: list, slots: list.length, label: `“${query.toUpperCase()}” · ${hits.length} IN ${aisle.label.toUpperCase()}` }
    })
  }
  const bays = new Map<number, typeof bins>()
  for (const b of bins) {
    const group = bays.get(b.bay)
    if (group) group.push(b)
    else bays.set(b.bay, [b])
  }
  const groups = [...bays]
  return Array.from({ length: Math.ceil(groups.length / table.bays) }, (_, k) => {
    const chunk = groups.slice(k * table.bays, k * table.bays + table.bays)
    const list: (Part | null)[] = []
    chunk.forEach(([, items], j) => items.forEach((b, i) => { list[j * binsPerBay + i] = of(b.item.ref) }))
    const last = chunk[chunk.length - 1]
    const racks = [...new Set(chunk.map(([, items]) => aisle.racks[items[0].rack].name.toUpperCase()))]
    const name = racks.length > 1 ? `${racks[0]} +${racks.length - 1}` : racks[0]
    return {
      parts: list,
      slots: (chunk.length - 1) * binsPerBay + last[1].length,
      label: chunk.length > 1 ? `BAYS ${bay(chunk[0][0])}–${bay(last[0])} · ${name}` : `BAY ${bay(chunk[0][0])} · ${name}`,
    }
  })
}
