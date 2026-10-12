/**
 * Phone layout helpers: `useViewport` for the phone breakpoint
 * and `Sheet`, a one-line peek bar above the home indicator that opens a
 * HeroUI Pro bottom sheet with the full panel.
 */
import { Sheet as ProSheet } from '@heroui-pro/react'
import { useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'

import { coarsePointer } from './env'

export type Viewport = { phone: boolean }

const read = (): Viewport => ({
  phone: innerWidth < 640 || (innerHeight < 480 && coarsePointer()),
})
let cached: Viewport | null = null
const snapshot = () => {
  const next = read()
  if (!cached || cached.phone !== next.phone) cached = next
  return cached
}
const server: Viewport = { phone: false }
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

const safeBottom = (px: number) => `max(${px}px, env(safe-area-inset-bottom))`

/**
 * `peek` stays visible while the sheet is closed; `actions` (a Copy button,
 * say) sit beside it and again in the open sheet's header. The peek keeps a
 * right gutter clear of the lab's 64 px devtools button. Dragging the open sheet down, tapping
 * its backdrop or pressing Escape closes it through `onToggle`.
 */
export function Sheet({ peek, actions, open, onToggle, label, children }: { peek: ReactNode; actions?: ReactNode; open: boolean; onToggle: () => void; label: string; children: ReactNode }) {
  return (
    <>
      <div
        className="pointer-events-auto absolute inset-x-0 bottom-0 z-30 rounded-t-3xl border-t border-border bg-overlay/90 text-foreground shadow-overlay backdrop-blur"
        style={{ paddingBottom: safeBottom(8), paddingLeft: 'env(safe-area-inset-left)', paddingRight: 'env(safe-area-inset-right)' }}
        data-sheet={open ? 'open' : 'peek'}
        data-scene-chrome
      >
        <div className="flex items-end gap-2 px-3 pt-1.5">
          <button
            type="button"
            aria-expanded={open}
            aria-label={`${label}, ${open ? 'collapse' : 'expand'}`}
            onClick={onToggle}
            className="min-w-0 flex-1 cursor-[var(--cursor-interactive)] rounded-2xl px-1 pb-2 pt-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            <span className="mx-auto mb-2 block h-1.5 w-8 rounded-full bg-default" />
            <span className="flex items-center justify-between gap-3 text-xs">{peek}</span>
          </button>
          {actions && <div className="mr-14 flex shrink-0 items-center gap-1.5 pb-2">{actions}</div>}
        </div>
      </div>
      <ProSheet isOpen={open} onOpenChange={(next) => next !== open && onToggle()}>
        <ProSheet.Backdrop variant="transparent">
          <ProSheet.Content>
            <ProSheet.Dialog aria-label={label}>
              <ProSheet.Handle />
              <ProSheet.Header className="flex-row items-center justify-between gap-3 pt-0">
                <ProSheet.Heading>{label}</ProSheet.Heading>
                {actions}
              </ProSheet.Header>
              <ProSheet.Body className="max-h-[72svh]" style={{ paddingBottom: safeBottom(16) }}>
                {children}
              </ProSheet.Body>
            </ProSheet.Dialog>
          </ProSheet.Content>
        </ProSheet.Backdrop>
      </ProSheet>
    </>
  )
}
