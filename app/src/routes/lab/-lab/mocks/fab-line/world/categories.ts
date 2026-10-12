/**
 * What the World settings sheet's World page offers: a category per `one` slot, each with the options its strip shows.
 * A slot with a single variant has nothing to choose, so its category stays hidden until a mod adds a second.
 */
import { hueAt } from '@/routes/workspace/-workspace/workspace.utils'
import type { Mode } from '../core/contract'
import { PICKED, SLOTS } from './slots'
import type { Lists, Palette, SlotKey } from './slots'
import type { Mod } from './store'

export const visibleCategories = (lists: Lists) => PICKED.filter((k) => lists[k].length > 1)

/** A card's picture: `thumbnail` when it loads, else a variant's own `palette`, else an icon on a tint of `hue`. */
export type Art = { thumbnail?: string; palette?: Palette; hue: number }
/** One card in a strip. */
export type Option = Art & {
  id: string
  label: string
  /** The mod a variant comes from. */
  group?: string
}

export function optionsOf<K extends SlotKey>(key: K, lists: Lists, mods: readonly Mod[], mode: Mode): Option[] {
  const groupOf = (variant: string) => {
    const at = variant.indexOf('.')
    if (at < 0) return undefined
    const mod = variant.slice(0, at)
    return mods.find((m) => m.bundle.id === mod)?.bundle.name ?? mod
  }
  return lists[key].map((v, i) => ({
    id: v.id,
    label: v.label,
    group: groupOf(v.id),
    thumbnail: v.thumbnail,
    hue: hueAt(i),
    palette: SLOTS[key].palette?.(v, mode),
  }))
}

/** The index of the item whose centre is nearest the middle of a scroller `viewport` wide, scrolled to `scroll`. */
export function centered(items: readonly { start: number; width: number }[], scroll: number, viewport: number) {
  const middle = scroll + viewport / 2
  let best = 0
  let distance = Infinity
  items.forEach((item, i) => {
    const d = Math.abs(item.start + item.width / 2 - middle)
    if (d < distance) {
      distance = d
      best = i
    }
  })
  return best
}
