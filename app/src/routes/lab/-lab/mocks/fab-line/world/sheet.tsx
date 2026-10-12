/**
 * World settings as a bottom sheet over the scene, in two pages a segment in
 * the header switches between. On the World page a row of categories is a
 * centred scroll picker: the category under the middle is the one shown, so
 * scrolling, tapping or arrowing through it only swaps the strip below. The
 * strip holds that category's options as cards, and a tap, Enter or Space
 * picks one. The Mods page is the mods panel. The sheet is non-modal, so the
 * line stays live. Switching pages snaps it to a third of the scene's height
 * for World and two thirds for Mods; its handle drags between the two or down
 * to close. It stays mounted while closed, so a dropped mod or a share link
 * can open it.
 */
import { Button, CloseButton, cn, ScrollShadow, Spinner, Tooltip } from '@heroui/react'
import { Segment } from '@heroui-pro/react'
import { RiResetLeftLine, RiVolumeMuteLine, RiVolumeUpLine } from '@remixicon/react'
import type { RemixiconComponentType } from '@remixicon/react'
import { animate, motion, useTransform } from 'motion/react'
import type { MotionValue } from 'motion/react'
import { useEffect, useId, useLayoutEffect, useRef, useState, useTransition } from 'react'
import type { CSSProperties, KeyboardEvent, RefObject } from 'react'

import { play, setMuted, useMuted } from '../../../kit/sound'
import type { Mode } from '../core/contract'
import { clamp, reducedMotion } from '../core/three'
import { CardArt } from '../mods/art'
import { ModsSection } from '../mods/panel'
import { centered, optionsOf, visibleCategories } from './categories'
import type { Option } from './categories'
import { SLOTS } from './slots'
import type { Contribution, Picks, SlotKey } from './slots'
import { useWorld } from './store'
type Page = 'world' | 'mods'
type Snap = 'low' | 'high'

const spring = reducedMotion ? { duration: 0 } : { type: 'spring' as const, stiffness: 380, damping: 40 }
const SAFE_BOTTOM = 'max(12px, env(safe-area-inset-bottom))'
/** Pro's NESTED_DISPLACEMENT: how far a parent sheet shrinks and rises under a nested one. */
const NESTED_INSET = 16

export function WorldSheet({ open, onOpenChange, height, mode, choices, onChoose, onReset, onApplyMod, returnFocus }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The sheet's height in pixels, which the toolbar rides on and the camera lifts the picture by. */
  height: MotionValue<number>
  mode: Mode
  /** The resolved choice per slot, URL overrides included. */
  choices: Picks
  /** Picks run inside a transition, so the sheet stays responsive while the scene rebuilds and the spinner shows while a variant loads. */
  onChoose: (slot: SlotKey, id: string) => Promise<void>
  onReset: () => void
  onApplyMod: (adds: Contribution) => void
  /** Where focus goes when the sheet closes itself. */
  returnFocus: RefObject<HTMLElement | null>
}) {
  const lists = useWorld((s) => s.lists)
  const mods = useWorld((s) => s.mods)
  const categories = visibleCategories(lists)
  const [chosen, setChosen] = useState<SlotKey>('theme')
  const category = categories.find((k) => k === chosen) ?? categories[0]
  const current = SLOTS[category]
  const [page, setPage] = useState<Page>('world')
  const [snap, setSnap] = useState<Snap>('low')
  const muted = useMuted()
  const [isPending, startTransition] = useTransition()
  const [tapped, setTapped] = useState<{ category: SlotKey; id: string } | null>(null)
  const root = useRef<HTMLDivElement>(null)
  const [space, setSpace] = useState(0)
  const [width, setWidth] = useState(720)
  /** The installed mods' sheet is open on top, so this one steps back the way a Pro parent sheet does. */
  const [nested, setNested] = useState(false)
  const ids = useId()

  useLayoutEffect(() => {
    const scene = root.current?.parentElement
    if (!scene) return
    const measure = () => {
      setSpace(scene.clientHeight)
      setWidth(root.current?.offsetWidth || 720)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(scene)
    return () => observer.disconnect()
  }, [])
  const low = Math.max(0, Math.min(Math.max(Math.round(space / 3), 248), space - 48))
  const high = Math.max(low, Math.round((space * 2) / 3))
  const target = open ? (snap === 'high' ? high : low) : 0
  useEffect(() => {
    const motion = animate(height, target, spring)
    return () => motion.stop()
  }, [height, target])
  const visibility = useTransform(height, (h) => (h < 1 ? 'hidden' : 'visible'))

  // A frame later, so the gear's own press handling has finished with focus. The World page's selected category, else the Mods segment.
  useEffect(() => {
    if (!open) return
    const id = requestAnimationFrame(() => {
      const el = root.current
      const target = el?.querySelector<HTMLElement>('[role=tab][aria-selected=true]') ?? el?.querySelector<HTMLElement>('[data-slot=segment-item][data-selected=true]')
      target?.focus({ preventScroll: true })
    })
    return () => cancelAnimationFrame(id)
  }, [open])
  const close = () => {
    onOpenChange(false)
    returnFocus.current?.focus()
  }
  const show = (next: Page) => {
    setPage(next)
    setSnap(next === 'mods' ? 'high' : 'low')
  }
  const choose = (id: string) => {
    if (id === choices[category] && !isPending) return
    play('tick')
    setTapped({ category, id })
    startTransition(() => onChoose(category, id))
  }

  // The handle drags the sheet between its snaps, or closes it below 60 % of the low one. A press without a drag toggles the snap.
  const drag = useRef<{ y: number; h: number; moved: boolean } | null>(null)
  const dragged = useRef(false)
  const release = (up: boolean) => {
    const d = drag.current
    drag.current = null
    if (!d) return
    if (!d.moved) {
      animate(height, target, spring)
      return
    }
    dragged.current = up
    const h = height.get()
    if (h < low * 0.6) return close()
    const next: Snap = Math.abs(h - low) <= Math.abs(h - high) ? 'low' : 'high'
    setSnap(next)
    animate(height, next === 'high' ? high : low, spring)
  }

  return (
    <motion.div
      ref={root}
      role="dialog"
      aria-modal="false"
      aria-label="World settings"
      inert={!open}
      style={{ height, visibility: open ? 'visible' : visibility }}
      animate={nested ? { scale: (width - NESTED_INSET) / width, y: -NESTED_INSET } : { scale: 1, y: 0 }}
      transition={spring}
      // Keys pressed in the sheet stay out of the scene's hotkeys (W, F, digits, arrows, Escape).
      // Portaled content (a toast's Undo, the installed mods' sheet) bubbles here through React but is not in the sheet.
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key !== 'Escape' || e.defaultPrevented || !e.currentTarget.contains(e.target as Node)) return
        e.preventDefault()
        close()
      }}
      className="pointer-events-auto absolute inset-x-0 bottom-0 z-30 mx-auto flex w-full max-w-[720px] flex-col overflow-hidden rounded-t-3xl border border-b-0 border-border bg-overlay/90 text-foreground shadow-overlay backdrop-blur"
      data-world-sheet={open ? 'open' : 'closed'}
      data-snap={snap}
      data-page={page}
    >
      <button
        type="button"
        aria-label={snap === 'high' ? 'Shrink world settings' : 'Grow world settings'}
        className="flex h-5 shrink-0 cursor-[var(--cursor-interactive)] touch-none items-end justify-center outline-none focus-visible:[&>span]:ring-2 focus-visible:[&>span]:ring-focus"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          height.stop()
          drag.current = { y: e.clientY, h: height.get(), moved: false }
        }}
        onPointerMove={(e) => {
          const d = drag.current
          if (!d) return
          const dy = d.y - e.clientY
          if (Math.abs(dy) > 4) d.moved = true
          if (d.moved) height.set(clamp(d.h + dy, 0, space - 24))
        }}
        onPointerUp={() => release(true)}
        onPointerCancel={() => release(false)}
        onClick={() => {
          if (dragged.current) dragged.current = false
          else setSnap((s) => (s === 'high' ? 'low' : 'high'))
        }}
        data-sheet-handle
      >
        <span className="block h-1.5 w-9 rounded-full bg-default" />
      </button>
      <div className="flex shrink-0 items-center gap-1 ps-7 pe-5 pt-1.5">
        <Segment
          aria-label="World settings page"
          size="sm"
          selectedKey={page}
          onSelectionChange={(key) => {
            play('tick')
            show(key === 'mods' ? 'mods' : 'world')
          }}
          data-world-pages
        >
          <Segment.Item id="world">World</Segment.Item>
          <Segment.Item id="mods" aria-label={mods.length ? `Mods, ${mods.length} installed` : 'Mods'}>
            Mods
            {mods.length > 0 && <span className="tabular-nums text-muted">{mods.length}</span>}
          </Segment.Item>
        </Segment>
        <div className="ms-auto flex items-center gap-1">
          <Tooltip delay={400}>
            <Button isIconOnly size="sm" variant="ghost" aria-label="Reset" aria-description="Built-in stations, theme and camera; mods stay installed" onPress={onReset} data-world-reset>
              <RiResetLeftLine aria-hidden className="size-4" />
            </Button>
            <Tooltip.Content>Reset world · mods stay</Tooltip.Content>
          </Tooltip>
          <Tooltip delay={400}>
            <Button isIconOnly size="sm" variant="ghost" aria-label={muted ? 'Turn sound on' : 'Mute'} onPress={() => setMuted(!muted)} data-world-sound={muted ? 'off' : 'on'}>
              {muted ? <RiVolumeMuteLine aria-hidden className="size-4" /> : <RiVolumeUpLine aria-hidden className="size-4" />}
            </Button>
            <Tooltip.Content>{muted ? 'Turn sound on' : 'Mute'}</Tooltip.Content>
          </Tooltip>
          <CloseButton aria-label="Close world settings" onPress={close} />
        </div>
      </div>
      {page === 'world' && (
        <>
          <Categories ids={ids} categories={categories} value={category} onChange={setChosen} />
          <div role="tabpanel" id={`${ids}-panel`} aria-labelledby={`${ids}-tab-${category}`} className="flex min-h-0 flex-1 flex-col justify-center pt-1" style={{ paddingBottom: SAFE_BOTTOM }}>
            <Options
              key={category}
              label={current.label}
              Icon={current.Icon}
              category={category}
              options={optionsOf(category, lists, mods, mode)}
              value={choices[category]}
              pending={isPending && tapped?.category === category ? tapped.id : null}
              onChoose={choose}
            />
          </div>
        </>
      )}
      <div className={cn('flex min-h-0 flex-1 flex-col pt-3', page !== 'mods' && 'hidden')} style={{ paddingBottom: SAFE_BOTTOM }}>
        <ScrollShadow className="min-h-0 flex-1 overflow-y-auto px-7 pb-2">
          <ModsSection
            mode={mode}
            onApply={onApplyMod}
            onOpen={() => {
              onOpenChange(true)
              show('mods')
            }}
            onNest={setNested}
          />
        </ScrollShadow>
      </div>
    </motion.div>
  )
}

/**
 * The centred scroll picker: whichever category sits under the middle is
 * selected, as in the iOS camera's mode switcher. Scrolling snaps a category
 * to the middle and selects it; a tap, an arrow key or a wheel notch selects
 * one and scrolls it there. Each change ticks.
 */
function Categories({ ids, categories, value, onChange }: {
  ids: string
  categories: readonly SlotKey[]
  value: SlotKey
  onChange: (id: SlotKey) => void
}) {
  const scroller = useRef<HTMLDivElement>(null)
  /** A programmatic scroll's destination; scroll events pass through it without selecting. */
  const heading = useRef<SlotKey | null>(null)
  /** The last change came from the user's scroll, which is already moving the row. */
  const scrolled = useRef(false)
  const wheel = useRef(0)
  const [pad, setPad] = useState({ start: 0, end: 0 })
  const tabs = () => [...(scroller.current?.querySelectorAll<HTMLElement>('[role=tab]') ?? [])]
  const select = (id: SlotKey) => {
    if (id === value) return
    play('tick')
    onChange(id)
  }
  const step = (by: number) => {
    const at = categories.indexOf(value)
    return categories[clamp(at + by, 0, categories.length - 1)]
  }

  // Padding that lets the first and last category reach the middle.
  const key = categories.join()
  useLayoutEffect(() => {
    const el = scroller.current
    if (!el) return
    const measure = () => {
      const list = tabs()
      if (!list.length) return
      setPad({ start: el.clientWidth / 2 - list[0].offsetWidth / 2, end: el.clientWidth / 2 - list[list.length - 1].offsetWidth / 2 })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [key])

  /** Scrolls `value` to the middle, unless it is already there. Returns whether it scrolled. */
  const centre = (behavior: ScrollBehavior) => {
    const el = scroller.current
    const tab = el?.querySelector<HTMLElement>(`[data-category="${value}"]`)
    if (!el || !tab) return false
    const left = tab.offsetLeft + tab.offsetWidth / 2 - el.clientWidth / 2
    if (Math.abs(el.scrollLeft - left) < 1) {
      heading.current = null
      return false
    }
    heading.current = value
    el.scrollTo({ left, behavior })
    return true
  }

  const first = useRef(true)
  useLayoutEffect(() => {
    if (scrolled.current) {
      scrolled.current = false
      return
    }
    if (centre(first.current || reducedMotion ? 'instant' : 'smooth')) first.current = false
  }, [value, key, pad])

  const onScroll = () => {
    const el = scroller.current
    const list = tabs()
    if (!el || !list.length) return
    const id = list[centered(list.map((t) => ({ start: t.offsetLeft, width: t.offsetWidth })), el.scrollLeft, el.clientWidth)].dataset.category as SlotKey
    if (heading.current) {
      if (id === heading.current) heading.current = null
      return
    }
    if (id !== value) {
      scrolled.current = true
      select(id)
    }
  }
  const onKeyDown = (e: KeyboardEvent) => {
    const next = { ArrowLeft: step(-1), ArrowRight: step(1), Home: categories[0], End: categories[categories.length - 1] }[e.key]
    if (!next) return
    e.preventDefault()
    select(next)
    scroller.current?.querySelector<HTMLElement>(`[data-category="${next}"]`)?.focus({ preventScroll: true })
  }

  return (
    <ScrollShadow
      ref={scroller}
      orientation="horizontal"
      hideScrollBar
      role="tablist"
      aria-label="Settings category"
      aria-orientation="horizontal"
      className="relative mx-5 mt-1.5 flex shrink-0 snap-x snap-mandatory gap-1 overflow-x-auto py-0.5"
      style={{ paddingInlineStart: pad.start, paddingInlineEnd: pad.end } as CSSProperties}
      onScroll={onScroll}
      // A glide can stop short (a view transition from a pick cancels it), parking the row between two categories with `heading` still set.
      // The row always comes to rest on the selected one, so a later scroll event cannot read a neighbour from where it parked.
      onScrollEnd={() => centre(reducedMotion ? 'instant' : 'smooth')}
      onPointerDown={() => (heading.current = null)}
      onWheel={(e) => {
        if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) {
          heading.current = null
          return
        }
        wheel.current += e.deltaY
        if (Math.abs(wheel.current) < 40) return
        select(step(Math.sign(wheel.current)))
        wheel.current = 0
      }}
      onKeyDown={onKeyDown}
      data-categories
    >
      {categories.map((c) => {
        const selected = c === value
        return (
          <button
            key={c}
            type="button"
            role="tab"
            id={`${ids}-tab-${c}`}
            aria-selected={selected}
            aria-controls={`${ids}-panel`}
            tabIndex={selected ? 0 : -1}
            onClick={() => select(c)}
            className={cn(
              'h-8 shrink-0 snap-center whitespace-nowrap rounded-full px-3 text-sm outline-none cursor-[var(--cursor-interactive)] focus-visible:ring-2 focus-visible:ring-focus',
              selected ? 'bg-default font-medium text-foreground' : 'text-muted hover:text-foreground',
            )}
            data-category={c}
          >
            {SLOTS[c].label}
          </button>
        )
      })}
    </ScrollShadow>
  )
}

/**
 * The selected category's options as cards. Scrolling only scrolls: a tap,
 * Enter or Space picks the focused card, and the arrow keys move focus.
 */
function Options({ label, Icon, category, options, value, pending, onChoose }: {
  label: string
  Icon: RemixiconComponentType
  category: SlotKey
  options: readonly Option[]
  value: string
  /** The tapped option while its pick is still rendering. */
  pending: string | null
  onChoose: (id: string) => void
}) {
  const scroller = useRef<HTMLDivElement>(null)
  const [focus, setFocus] = useState(value)
  const roving = options.some((o) => o.id === focus) ? focus : value

  const first = useRef(true)
  useLayoutEffect(() => {
    const el = scroller.current
    const card = el?.querySelector<HTMLElement>(`[data-option="${CSS.escape(value)}"]`)
    if (!el || !card) return
    const left = card.offsetLeft + card.offsetWidth / 2 - el.clientWidth / 2
    el.scrollTo({ left, behavior: first.current || reducedMotion ? 'instant' : 'smooth' })
    first.current = false
  }, [value])

  const move = (e: KeyboardEvent, id: string) => {
    const at = options.findIndex((o) => o.id === id)
    const next = { ArrowLeft: at - 1, ArrowRight: at + 1, Home: 0, End: options.length - 1 }[e.key]
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      return onChoose(id)
    }
    if (next === undefined) return
    e.preventDefault()
    const to = options[clamp(next, 0, options.length - 1)].id
    setFocus(to)
    scroller.current?.querySelector<HTMLElement>(`[data-option="${CSS.escape(to)}"]`)?.focus()
  }

  return (
    <ScrollShadow
      ref={scroller}
      orientation="horizontal"
      hideScrollBar
      role="listbox"
      aria-label={label}
      aria-orientation="horizontal"
      className="relative flex shrink-0 gap-3 overflow-x-auto px-7 py-1.5"
      onWheel={(e) => {
        if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && scroller.current) scroller.current.scrollLeft += e.deltaY
      }}
      data-options={category}
    >
      {options.map((o) => {
        const selected = o.id === value
        return (
          <div
            key={o.id}
            role="option"
            aria-selected={selected}
            aria-label={o.group ? `${o.label}, from ${o.group}` : o.label}
            aria-busy={pending === o.id || undefined}
            title={o.group ? `${o.label} · ${o.group}` : undefined}
            tabIndex={o.id === roving ? 0 : -1}
            onClick={() => onChoose(o.id)}
            onFocus={() => setFocus(o.id)}
            onKeyDown={(e) => move(e, o.id)}
            className="group flex w-[76px] shrink-0 first:ms-auto last:me-auto sm:w-[88px] cursor-[var(--cursor-interactive)] flex-col items-center gap-1.5 outline-none"
            data-option={o.id}
            data-selected={selected}
          >
            <span
              className={cn(
                'relative grid aspect-[4/3] w-full place-items-center overflow-hidden rounded-xl ring-1 ring-black/5 outline-offset-2 dark:ring-white/10',
                selected && 'outline-2 outline-accent',
                'group-focus-visible:outline-2 group-focus-visible:outline-focus',
              )}
            >
              <CardArt art={o} Icon={Icon} look="card" className="absolute inset-0 grid place-items-center" />
              {pending === o.id && (
                <span className="absolute inset-0 grid place-items-center bg-black/25">
                  <Spinner size="sm" color="current" className="text-white" />
                </span>
              )}
            </span>
            <span className={cn('w-full truncate text-center text-xs', selected ? 'font-medium text-foreground' : 'text-muted')}>{o.label}</span>
          </div>
        )
      })}
    </ScrollShadow>
  )
}
