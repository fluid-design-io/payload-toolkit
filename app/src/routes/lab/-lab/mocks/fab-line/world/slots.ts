/**
 * The world's slots, one row each. A slot is a list of variants, built-ins first and then every enabled mod's: World
 * settings shows a `one` slot as a category whose cards pick one variant (the first by default) and the URL names it as
 * `?<slot>=<id>`; every variant of a `many` slot is on at once (the tools, as toolbar buttons). `fields` is what a mod's
 * variant must carry and how each crosses the boundary (see `mods/guard.ts`); a slot without it takes no mod variants.
 * The store, the sheet, the URL, the Mods page, adoption and the entry all iterate this table.
 */
import {
  RiArchiveDrawerLine, RiArrowLeftRightLine, RiCpuLine, RiFocus3Line, RiLayoutGridLine, RiLayoutMasonryLine, RiPaletteLine, RiPulseLine,
  RiRobot2Line, RiRouteLine, RiShapesLine, RiSparkling2Line, RiToolsLine,
} from '@remixicon/react'
import type { RemixiconComponentType } from '@remixicon/react'

import { CHIPS } from '../chip'
import type { Follow } from '../core/camera'
import type {
  BoardVariant, CabinetVariant, ChipVariant, FxVariant, IntegratorVariant, LayoutVariant, Mode, SignalVariant, Site, SwapVariant, TableVariant, ThemeVariant, Tokens, Tool,
  TransportVariant, Wrapped,
} from '../core/contract'
import { FX } from '../fx'
import { LAYOUTS } from '../layouts'
import { fail, guardSwap, guardTool } from '../mods/guard'
import type { Field, Trip } from '../mods/guard'
import { BOARDS } from '../stations/board'
import { SIGNALS } from '../stations/board/shared/signals'
import { SWAPS } from '../stations/board/shared/swap'
import { CABINETS } from '../stations/cabinet'
import { INTEGRATORS } from '../stations/integrator'
import { TABLES } from '../stations/table'
import { TRANSPORTS } from '../stations/transport'
import { THEMES } from '../themes'

/** How the camera follows a part on its way to the board. Reduced motion never follows, whatever the pick. */
export type FollowVariant = { id: Follow; label: string; thumbnail?: string }

export type Variants = {
  theme: ThemeVariant
  fx: FxVariant
  follow: FollowVariant
  layout: LayoutVariant
  cabinet: CabinetVariant
  table: TableVariant
  transport: TransportVariant
  board: BoardVariant
  swap: SwapVariant
  signals: SignalVariant
  integrator: IntegratorVariant
  chip: ChipVariant
  tools: Tool
}
export type SlotKey = keyof Variants

export type Palette = { bg: string; floor: string; marks: readonly string[] }
type Keys<T> = T extends unknown ? keyof T : never

export type Slot<K extends SlotKey = SlotKey> = {
  label: string
  Icon: RemixiconComponentType
  builtins: readonly Variants[K][]
  pick: 'one' | 'many'
  /** Older URL names still read, so links open as sent. */
  aliases?: readonly string[]
  /** The fields a mod's variant must carry and how each is guarded. Its component fields are also what loads before a variant shows. */
  fields?: Partial<Record<Keys<Variants[K]>, Field>>
  /** Checks and guards a slot's fields need beyond `fields`, run first. Throws a message naming `what`. */
  adopt?: (v: Record<string, unknown>, what: string, trip: Trip) => Record<string, unknown>
  /** A card's own colors, where a variant has some. */
  palette?: (v: Variants[K], mode: Mode) => Palette
}

export const paletteOf = (t: Tokens): Palette => ({ bg: t.bg, floor: t.floor, marks: [t.surface, t.accent, t.lit] })

const table = {
  theme: { label: 'Theme', Icon: RiPaletteLine, builtins: THEMES, pick: 'one', aliases: ['world'], fields: { Stage: 'component' }, palette: (t, mode) => paletteOf(t.tokens[mode]) },
  fx: { label: 'Effects', Icon: RiSparkling2Line, builtins: FX, pick: 'one', fields: { Component: 'component?' } },
  follow: {
    label: 'Follow', Icon: RiFocus3Line, pick: 'one',
    builtins: [{ id: 'chase', label: 'Chase' }, { id: 'ride', label: 'Ride' }, { id: 'off', label: 'Off' }],
  },
  layout: { label: 'Layout', Icon: RiLayoutMasonryLine, builtins: LAYOUTS, pick: 'one', fields: { place: 'fn', Scenery: 'component?' } },
  cabinet: { label: 'Cabinet', Icon: RiArchiveDrawerLine, builtins: CABINETS, pick: 'one', fields: { drawer: 'fn', Component: 'component' } },
  table: { label: 'Pick table', Icon: RiLayoutGridLine, builtins: TABLES, pick: 'one', fields: { pocket: 'fn', Component: 'component' } },
  transport: {
    label: 'Transport', Icon: RiRouteLine, builtins: TRANSPORTS, pick: 'one',
    fields: { at: 'fn', wrap: 'fn', Component: 'component' },
    adopt: (v, what) => {
      if (v.kind !== 'path') fail(`${what}.kind must be 'path'.`)
      if (typeof v.wrap !== 'function') return v
      const wrap = v.wrap as (site: Site) => Partial<Wrapped<unknown>> | undefined
      // A route of fewer than two points has no length to sample, so it counts as a throw.
      return {
        ...v,
        wrap: (site: Site) => {
          const route = wrap(site)
          return Array.isArray(route?.pts) && route.pts.length > 1 ? route : fail(`${what}.wrap must return { pts } with at least two points.`)
        },
      }
    },
  },
  board: { label: 'Board', Icon: RiCpuLine, builtins: BOARDS, pick: 'one', fields: { plan: 'fn', route: 'fn', Component: 'component' } },
  swap: { label: 'Swap', Icon: RiArrowLeftRightLine, builtins: SWAPS, pick: 'one', fields: {}, adopt: guardSwap },
  signals: { label: 'Signals', Icon: RiPulseLine, builtins: SIGNALS, pick: 'one', fields: { Component: 'component' } },
  integrator: {
    label: 'Integrator', Icon: RiRobot2Line, builtins: INTEGRATORS, pick: 'one', fields: { workTime: 'fn', footprint: 'fn?', Component: 'component' },
  },
  chip: { label: 'Chip', Icon: RiShapesLine, builtins: CHIPS, pick: 'one', fields: { boxes: 'fn', lid: 'fn', marking: 'fn', CloseUp: 'component' } },
  tools: { label: 'Toolbar tool', Icon: RiToolsLine, builtins: [], pick: 'many', fields: { Overlay: 'component?', Scenery: 'component?' }, adopt: guardTool },
} satisfies { readonly [K in SlotKey]: Slot<K> }
export const SLOTS: { readonly [K in SlotKey]: Slot<K> } = table
export const SLOT_KEYS = Object.keys(SLOTS) as SlotKey[]
type ManyKey = { [K in SlotKey]: (typeof table)[K]['pick'] extends 'many' ? K : never }[SlotKey]
/** The slots World settings and the URL pick one variant for. */
export const PICKED = SLOT_KEYS.filter((k): k is Exclude<SlotKey, ManyKey> => SLOTS[k].pick === 'one')
export const componentsOf = (k: SlotKey) => Object.entries(SLOTS[k].fields ?? {}).flatMap(([key, f]) => (f?.startsWith('component') ? [key] : []))

export type Lists = { [K in SlotKey]: readonly Variants[K][] }
export const BUILTIN = Object.fromEntries(SLOT_KEYS.map((k) => [k, SLOTS[k].builtins])) as Lists
/** What one mod adds, by slot. */
export type Contribution = { [K in SlotKey]?: Variants[K][] }
/**
 * Variant ids by slot, and each mod tool's variant by its namespaced id (`<mod>.<tool>`, which no slot key matches). A
 * missing entry, or an id no list holds yet, falls back to the first.
 */
export type Picks = Readonly<Record<string, string>>

/** What the world shows: one variant per `one` slot, the whole list of a `many` slot. */
export type Chosen = { [K in SlotKey]: K extends ManyKey ? readonly Variants[K][] : Variants[K] }

/** An id no list holds (a mod not loaded yet, a removed one) falls back to the list's first entry. */
export function pick<T extends { id: string }>(list: readonly T[], id: string | undefined): T {
  return list.find((v) => v.id === id) ?? list[0]
}
export const resolve = (lists: Lists, picks: Picks) =>
  Object.fromEntries(SLOT_KEYS.map((k) => [k, SLOTS[k].pick === 'many' ? lists[k] : pick<{ id: string }>(lists[k], picks[k])])) as Chosen
/** A mod tool's picked variant id, or null for a tool without variants. */
export const toolPick = (tool: Tool, picks: Picks) => (tool.variants?.length ? pick(tool.variants, picks[tool.id]).id : null)
