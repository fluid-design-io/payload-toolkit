import { useRef } from 'react'
import type { Ref } from 'react'

import type { Tip } from './contract'

/**
 * The hover card every pickable mesh drives through `Tip`. It is written to the DOM directly, so a hover never
 * re-renders the line. Render `<TipCard ref={ref} />` once.
 */
export function useTip() {
  const ref = useRef<HTMLDivElement>(null)
  const move = (e: PointerEvent) => {
    const el = ref.current
    if (!el) return
    const x = Math.min(e.clientX + 14, innerWidth - el.offsetWidth - 8)
    el.style.transform = `translate(${x}px, ${Math.min(e.clientY + 14, innerHeight - el.offsetHeight - 8)}px)`
  }
  const tip: Tip = {
    show: (e, title, sub, image) => {
      const el = ref.current
      if (!el) return
      const img = el.querySelector('img')!
      if (image) {
        if (img.getAttribute('src') !== image) img.src = image
        img.style.display = 'block'
      } else img.style.display = 'none'
      el.querySelector('[data-title]')!.textContent = title
      el.querySelector('[data-sub]')!.textContent = sub
      el.style.opacity = '1'
      document.body.style.cursor = 'pointer'
      move(e)
    },
    move,
    hide: () => {
      if (ref.current) ref.current.style.opacity = '0'
      document.body.style.cursor = ''
    },
  }
  return [ref, tip] as const
}

export function TipCard({ ref }: { ref: Ref<HTMLDivElement> }) {
  return (
    <div ref={ref} className="pointer-events-none fixed left-0 top-0 z-40 w-60 max-w-[calc(100vw-16px)] rounded-2xl bg-overlay p-1.5 opacity-0 shadow-overlay transition-opacity md:w-80 md:p-2">
      <img alt="" className="mb-1.5 hidden aspect-[16/10] w-full rounded-xl object-cover object-top md:mb-2" />
      <div data-title className="px-1.5 text-sm font-medium text-foreground md:text-base" />
      <div data-sub className="px-1.5 pb-1 text-xs text-muted md:text-sm" />
    </div>
  )
}
