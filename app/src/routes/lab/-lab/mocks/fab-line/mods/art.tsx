/** How a mod reads at a glance, shared by the Mods panel and the installed list: its picture, what it adds and its state. */
import { Chip, cn } from '@heroui/react'
import { RiCodeSSlashLine, RiPuzzle2Line } from '@remixicon/react'
import type { RemixiconComponentType } from '@remixicon/react'
import { useState } from 'react'
import type { CSSProperties } from 'react'

import { matTint } from '@/routes/workspace/-workspace/registry/registry.mat'
import { hueAt } from '@/routes/workspace/-workspace/workspace.utils'
import type { Mode } from '../core/contract'
import { fnv1a } from '../core/spec'
import type { Art } from '../world/categories'
import { SLOT_KEYS, SLOTS } from '../world/slots'
import type { Contribution } from '../world/slots'
import type { ModStatus } from '../world/store'
import { recipes } from './data'
import type { Bundle } from './data'

/** What a contribution adds, one entry per slot it fills. */
export function slotsOf(adds: Contribution) {
  return SLOT_KEYS.flatMap((k) => {
    const list = adds[k]
    return list?.length ? [{ slot: k, label: SLOTS[k].label, names: list.map((v) => v.label) }] : []
  })
}

/** The tint behind a mod's icon when its thumbnail fails to load. */
const FALLBACK_HUE = 200
/** A mod's picture: a variant's thumbnail, else the first variant with colors of its own, else a tint keyed to its id. */
export function artOf(bundle: Bundle, adds: Contribution, mode: Mode): Art {
  const known: Contribution = { ...recipes(bundle), ...adds }
  const variants = SLOT_KEYS.flatMap((k) => (known[k] ?? []).map((v) => ({ k, v })))
  const thumbnail = variants.find(({ v }) => v.thumbnail)?.v.thumbnail
  if (thumbnail) return { thumbnail, hue: FALLBACK_HUE }
  for (const { k, v } of variants) {
    const palette = SLOTS[k].palette?.(v as never, mode)
    if (palette) return { palette, hue: FALLBACK_HUE }
  }
  return { hue: hueAt(fnv1a(bundle.id) % 97) }
}

/** Class sets per place the art is drawn, written out whole so Tailwind finds them. */
const LOOKS = {
  /** World settings cards, tinted the way the registry's mats are. */
  card: { tint: matTint, icon: 'size-6', mark: 'size-2.5' },
  mod: { tint: 'bg-[color-mix(in_oklch,oklch(72%_0.12_var(--hue))_22%,var(--surface))]', icon: 'size-5', mark: 'size-2' },
}

/**
 * `art` in a span classed `className`, which must be a grid that centres. The icon's tint is that span's own
 * background, never a layer clipped by it, so rounded corners antialias the same. A thumbnail that fails to load
 * falls through to the palette or the icon.
 */
export function CardArt({ art, Icon, look, className }: { art: Art; Icon: RemixiconComponentType; look: keyof typeof LOOKS; className?: string }) {
  const [broken, setBroken] = useState<string | null>(null)
  const { tint, icon, mark } = LOOKS[look]
  const { thumbnail, palette } = art
  if (thumbnail && thumbnail !== broken)
    return (
      <span className={className}>
        <img src={thumbnail} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(thumbnail)} className="absolute inset-0 size-full object-cover" />
      </span>
    )
  if (palette)
    return (
      <span className={className}>
        <span className="absolute inset-0" style={{ background: palette.bg }} />
        <span className="absolute inset-x-0 bottom-0 h-[38%]" style={{ background: palette.floor }} />
        <span className="relative flex gap-1">
          {palette.marks.map((color, i) => (
            <span key={i} className={cn(mark, 'rounded-full ring-1 ring-black/10')} style={{ background: color }} />
          ))}
        </span>
      </span>
    )
  return (
    <span style={{ '--hue': art.hue } as CSSProperties} className={cn(className, tint)}>
      <Icon aria-hidden className={cn(icon, 'text-[oklch(55%_0.12_var(--hue))]')} />
    </span>
  )
}

export function ModArt({ art, code, className }: { art: Art; code: boolean; className?: string }) {
  return (
    <CardArt
      art={art}
      Icon={code ? RiCodeSSlashLine : RiPuzzle2Line}
      look="mod"
      className={cn('relative grid shrink-0 place-items-center overflow-hidden ring-1 ring-black/5 dark:ring-white/10', className)}
    />
  )
}

export function SlotChips({ slots }: { slots: ReturnType<typeof slotsOf> }) {
  return (
    <ul className="flex flex-wrap gap-1" aria-label="Adds">
      {slots.map((s) => (
        <li key={s.slot} title={s.names.join(', ')} aria-label={`${s.label}: ${s.names.join(', ')}`}>
          <Chip size="sm" variant="secondary">
            <Chip.Label>
              {s.label}
              {s.names.length > 1 && <span className="tabular-nums text-muted"> ×{s.names.length}</span>}
            </Chip.Label>
          </Chip>
        </li>
      ))}
    </ul>
  )
}

export const KIND = (b: Bundle) => (b.code ? 'Code' : 'Data')
export const STATUS: Partial<Record<ModStatus, { text: string; tone: string }>> = {
  loading: { text: 'Starting…', tone: 'text-muted' },
  untrusted: { text: 'Its code waits for your trust', tone: 'text-warning' },
  error: { text: 'Stopped', tone: 'text-danger' },
  off: { text: 'Off', tone: 'text-muted' },
}
