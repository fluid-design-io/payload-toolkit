import { cn } from '@heroui/react'
import type { CSSProperties, ReactNode, Ref } from 'react'
import type { CatalogItem } from '../workspace.types'
import { RegistryThumbnail } from './registry.thumbnail'

/** The item's category hue, mixed low into the surface so every theme keeps it quiet. */
export const matTint = 'bg-[color-mix(in_oklch,oklch(72%_0.12_var(--hue))_16%,var(--surface))]'

export function hueStyle(item: CatalogItem): CSSProperties {
  return { '--hue': item.hue } as CSSProperties
}

const pages = {
  card: 'inset-x-[8%] top-[12%] rounded-t-xl transition-transform duration-500 ease-[cubic-bezier(.34,1.5,.5,1)] group-data-[hovered=true]/mat:-translate-y-1.5 group-data-[hovered=true]/mat:scale-[1.03]',
  /** The detail card animates `--page-radius` from the card page's corner. */
  detail: 'inset-x-[8%] top-[12%] rounded-t-[var(--page-radius)]',
}

type RegistryMatProps = {
  item: CatalogItem
  size: keyof typeof pages
  ref?: Ref<HTMLSpanElement>
  className?: string
  /** Marks the card's mat, which the detail card measures to morph from and back to. */
  anchor?: string
  isHidden?: boolean
  /** The page's contents; the thumbnail by default. */
  children?: ReactNode
}

/**
 * A capture sits on its category's tint as a floating page anchored at the
 * top, so the empty lower half of a screenshot falls below the mat's edge.
 * Captures end in white in both themes, so their page continues in white.
 * An item with no capture shows its kind icon on the mat itself.
 */
export function RegistryMat({
  item,
  size,
  ref,
  className,
  anchor,
  isHidden,
  children,
}: RegistryMatProps) {
  const hasImage = Boolean(item.image || item.imageDark)
  const hasPage = item.kind === 'block' || hasImage
  return (
    <span
      ref={ref}
      data-registry-mat={anchor}
      data-hidden={isHidden}
      style={hueStyle(item)}
      className={cn('relative block overflow-hidden', matTint, className)}
    >
      {hasPage ? (
        <span
          data-registry-page
          className={cn(
            'absolute h-full overflow-hidden shadow-[0_10px_30px_-12px_rgb(0_0_0/0.3)] ring-1 ring-black/5',
            hasImage ? 'bg-white' : 'bg-surface',
            pages[size],
          )}
        >
          {children ?? <RegistryThumbnail item={item} />}
        </span>
      ) : (
        <RegistryThumbnail item={item} />
      )}
    </span>
  )
}

export type MatShape = { rect: DOMRect; radius: number; pageRadius: number }

function cornerRadius(element: Element | null) {
  return element ? parseFloat(getComputedStyle(element).borderTopLeftRadius) || 0 : 0
}

/**
 * The card mat the detail card morphs from, if it is on the page: its box and
 * its own and its page's computed corners, which the theme scales.
 */
export function matShape(ref: string): MatShape | null {
  const mat = document.querySelector(`[data-registry-mat="${CSS.escape(ref)}"]`)
  if (!mat) return null
  return {
    rect: mat.getBoundingClientRect(),
    radius: cornerRadius(mat),
    pageRadius: cornerRadius(mat.querySelector('[data-registry-page]')),
  }
}
