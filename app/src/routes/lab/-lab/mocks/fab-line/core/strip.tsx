import type { RefObject } from 'react'

import type { LineLayout, StopId } from './contract'

/**
 * The line as a strip: one button per station at its true x extent (the
 * cabinet in the back lane, the rest in front), an overview button, and a
 * window that the camera director slides to show what the viewport sees.
 */
export function Strip({ line, active, onGo, windowRef, compact }: {
  line: LineLayout
  /** `overview`, a stop id, or `free`. */
  active: string
  onGo: (to: 'overview' | StopId) => void
  windowRef: RefObject<HTMLDivElement | null>
  compact?: boolean
}) {
  const { x0, x1 } = line.extent
  const w = Math.max(1, x1 - x0)
  const pct = (v: number) => `${((v - x0) / w) * 100}%`
  return (
    <nav aria-label="Stations" className={`pointer-events-auto flex items-stretch gap-1.5 rounded-xl border border-border bg-surface/90 p-1 shadow-lg backdrop-blur ${compact ? 'w-[300px]' : 'w-[440px]'}`} data-strip data-extent={`${x0.toFixed(1)},${x1.toFixed(1)}`}>
      <button
        type="button"
        onClick={() => onGo('overview')}
        aria-pressed={active === 'overview'}
        aria-label="Whole line (0)"
        className={`shrink-0 rounded-lg px-2 text-[10px] tracking-[0.14em] focus-visible:outline-2 focus-visible:outline-accent ${active === 'overview' ? 'bg-accent text-accent-foreground' : 'text-muted hover:text-foreground'}`}
      >
        ALL
      </button>
      <div className="relative h-[38px] min-w-0 flex-1">
        {line.stops.map((s, i) => {
          const back = s.id === 'cabinet'
          const on = active === s.id
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onGo(s.id)}
              aria-pressed={on}
              aria-label={`${s.label} (${i + 1})`}
              title={`${s.label} · ${i + 1}`}
              data-stop={s.id}
              className={`absolute flex items-center overflow-hidden rounded-[5px] border px-1 text-left text-[10px] leading-none focus-visible:outline-2 focus-visible:outline-accent ${back ? 'top-0 h-[16px]' : 'bottom-0 h-[18px]'} ${on ? 'border-accent bg-accent/15 text-foreground' : 'border-border bg-background/70 text-muted hover:text-foreground'}`}
              style={{ left: pct(s.box.x0), width: `calc(${((s.box.x1 - s.box.x0) / w) * 100}% - 2px)` }}
            >
              <span className="mr-1 font-mono opacity-60">{i + 1}</span>
              {((s.box.x1 - s.box.x0) / w) * (compact ? 240 : 380) > 52 && <span className="truncate">{s.label}</span>}
            </button>
          )
        })}
        <div ref={windowRef} aria-hidden className="pointer-events-none absolute inset-y-[-2px] rounded-md border-[1.5px] border-accent" style={{ left: '0%', width: '100%' }} data-window />
      </div>
    </nav>
  )
}

/** Writes the visible x range into the strip's window element. Called from the frame loop. */
export function placeWindow(el: HTMLDivElement | null, line: LineLayout, visible: { x0: number; x1: number }) {
  if (!el) return
  const w = Math.max(1, line.extent.x1 - line.extent.x0)
  const a = Math.max(0, Math.min(1, (visible.x0 - line.extent.x0) / w))
  const b = Math.max(a, Math.min(1, (visible.x1 - line.extent.x0) / w))
  const left = `${(a * 100).toFixed(1)}%`, width = `${((b - a) * 100).toFixed(1)}%`
  if (el.style.left !== left) el.style.left = left
  if (el.style.width !== width) el.style.width = width
}
