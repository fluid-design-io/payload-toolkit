/**
 * Phone layout helpers: `useViewport` for phone/touch/landscape breakpoints
 * and `Sheet`, a bottom sheet that keeps a one-line peek above the home
 * indicator and expands to a scrollable panel.
 */
import { useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'

export type Viewport = { phone: boolean; touch: boolean; landscape: boolean; width: number; height: number }

const read = (): Viewport => ({
  phone: innerWidth < 640 || (innerHeight < 480 && matchMedia('(pointer: coarse)').matches),
  touch: matchMedia('(pointer: coarse)').matches,
  landscape: innerWidth > innerHeight,
  width: innerWidth,
  height: innerHeight,
})
let cached: Viewport | null = null
const snapshot = () => {
  const next = read()
  if (!cached || cached.phone !== next.phone || cached.touch !== next.touch || cached.landscape !== next.landscape || cached.width !== next.width || cached.height !== next.height) cached = next
  return cached
}
const server: Viewport = { phone: false, touch: false, landscape: true, width: 1440, height: 900 }
export function useViewport(): Viewport {
  return useSyncExternalStore(
    (l) => {
      addEventListener('resize', l)
      addEventListener('orientationchange', l)
      return () => {
        removeEventListener('resize', l)
        removeEventListener('orientationchange', l)
      }
    },
    snapshot,
    () => server,
  )
}

export const safeBottom = (px: number) => `max(${px}px, env(safe-area-inset-bottom))`

/**
 * `peek` stays visible when collapsed; `actions` (a Copy button, say) sit
 * beside the toggle, with a right gutter clear of the lab's 64 px devtools
 * button in full chrome (`gutter` false in embedded chrome).
 */
export function Sheet({ peek, actions, open, onToggle, label, children, gutter = true }: { peek: ReactNode; actions?: ReactNode; open: boolean; onToggle: () => void; label: string; children: ReactNode; gutter?: boolean }) {
  return (
    <div
      className="pointer-events-auto absolute inset-x-0 bottom-0 z-30 rounded-t-2xl border-t border-border bg-surface/95 text-foreground shadow-[0_-8px_30px_rgba(0,0,0,0.18)] backdrop-blur"
      style={{ paddingBottom: safeBottom(8), paddingLeft: 'env(safe-area-inset-left)', paddingRight: 'env(safe-area-inset-right)' }}
      data-sheet={open ? 'open' : 'peek'}
    >
      <div className="flex items-end gap-2 px-3 pt-1.5">
        <button type="button" aria-expanded={open} aria-label={`${label}, ${open ? 'collapse' : 'expand'}`} onClick={onToggle} className="min-w-0 flex-1 rounded-lg px-1 pb-2 pt-1 text-left focus-visible:outline-2 focus-visible:outline-accent">
          <span className="mx-auto mb-2 block h-1 w-10 rounded-full bg-border" />
          <span className="flex items-center justify-between gap-3 text-xs">{peek}</span>
        </button>
        {actions && <div className={`flex shrink-0 items-center gap-1.5 pb-2 ${gutter ? 'mr-14' : ''}`}>{actions}</div>}
      </div>
      {open && <div className="max-h-[48svh] overflow-y-auto px-4 pb-2">{children}</div>}
    </div>
  )
}
