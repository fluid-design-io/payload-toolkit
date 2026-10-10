/**
 * Assistive access to a canvas scene. `Mirror` is a focusable DOM twin of the
 * catalog and setup, hidden until it holds focus; it also carries the polite
 * live region that `announce` feeds. `useSceneKeys` gives the scene container
 * a keyboard focus model (arrows, Enter, Escape) whose current item
 * `FocusRing` marks in 3D.
 */
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { FocusEvent as ReactFocusEvent, KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react'
import { Vector3 } from 'three'
import type { Mesh } from 'three'

import { agents, databases, frameworks, packageManagers, targets } from '../../../workspace/-workspace/workspace.constants'
import type { CatalogItem } from '../../../workspace/-workspace/workspace.types'
import type { Lab } from '../lab.types'

const motionQuery = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null
export const prefersReducedMotion = () => !!motionQuery?.matches
export function useReducedMotion() {
  return useSyncExternalStore(
    (l) => {
      motionQuery?.addEventListener('change', l)
      return () => motionQuery?.removeEventListener('change', l)
    },
    prefersReducedMotion,
    () => false,
  )
}

type Live = { text: string; n: number }
let live: Live = { text: '', n: 0 }
const liveListeners = new Set<() => void>()
/** Queues one polite announcement ("Hero Split seated on the board, 3 parts"). */
export function announce(text: string) {
  live = { text, n: live.n + 1 }
  liveListeners.forEach((l) => l())
}
const subscribeLive = (l: () => void) => {
  liveListeners.add(l)
  return () => liveListeners.delete(l)
}
function LiveRegion() {
  const msg = useSyncExternalStore(subscribeLive, () => live, () => live)
  return (
    <div aria-live="polite" aria-atomic="true" className="sr-only" data-live>
      {msg.text}
      {msg.n % 2 ? ' ' : ''}
    </div>
  )
}

export const itemId = (ref: string) => `lab-item-${ref.replace(/[^a-z0-9]+/gi, '-')}`
const parts = (n: number) => `${n} ${n === 1 ? 'part' : 'parts'}`

function Select<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: readonly { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <label className="flex items-center justify-between gap-2 py-0.5">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value as T)} className="rounded-md border border-border bg-background px-1.5 py-0.5 text-foreground">
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}

/**
 * The scene's DOM twin: selected count, setup controls, the command, and every
 * catalog item as an `aria-pressed` toggle grouped by aisle. Visually hidden
 * until focus enters it, then docked at the right edge. Announces adds and
 * removes; scenes announce seats themselves.
 */
export function Mirror({ lab, title, children }: { lab: Lab; title: string; children?: ReactNode }) {
  const [shown, setShown] = useState(false)
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set(lab.scale === 'real' ? lab.warehouse.aisles.map((a) => a.id) : []))
  const count = lab.setup.items.length
  const byRef = useMemo(() => new Map(lab.catalog.items.map((i) => [i.ref, i])), [lab.catalog])
  const prev = useRef<ReadonlySet<string> | null>(null)
  useEffect(() => {
    const before = prev.current
    prev.current = lab.selected
    if (!before) return
    const added = [...lab.selected].filter((r) => !before.has(r))
    const removed = [...before].filter((r) => !lab.selected.has(r))
    const name = (r: string) => byRef.get(r)?.title ?? r
    if (added.length === 1 && !removed.length) announce(`${name(added[0])} added, ${parts(count)}`)
    else if (removed.length === 1 && !added.length) announce(`${name(removed[0])} removed, ${parts(count)}`)
    else if (added.length || removed.length) announce(`${added.length} added, ${removed.length} removed, ${parts(count)}`)
  }, [lab.selected, byRef, count])
  useEffect(() => {
    if (lab.focus.category !== 'all' && !open.has(lab.focus.category)) setOpen(new Set([...open, lab.focus.category]))
  }, [lab.focus.category, open])
  const onBlur = (e: ReactFocusEvent<HTMLElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget)) setShown(false)
  }
  return (
    <section
      aria-label={`${title}: parts and setup`}
      data-mirror={shown ? 'shown' : 'hidden'}
      onFocus={() => setShown(true)}
      onBlur={onBlur}
      className={
        shown
          ? 'pointer-events-auto absolute bottom-3 right-3 top-16 z-40 w-[320px] max-w-[calc(100%-24px)] overflow-y-auto rounded-2xl border border-border bg-surface p-3 text-[13px] text-foreground shadow-xl [&_button:focus-visible]:outline-2 [&_button:focus-visible]:outline-offset-2 [&_button:focus-visible]:outline-accent [&_input:focus-visible]:outline-2 [&_input:focus-visible]:outline-accent [&_select:focus-visible]:outline-2 [&_select:focus-visible]:outline-accent'
          : 'sr-only'
      }
    >
      <LiveRegion />
      <h2 className="text-sm font-medium">{title}</h2>
      <p className="text-muted" data-a11y-count={count}>
        {parts(count)} selected
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => void navigator.clipboard?.writeText(lab.command).then(() => announce('Command copied')).catch(() => announce('Copy failed'))}
          className="rounded-lg border border-border px-2.5 py-1"
        >
          Copy command
        </button>
        <button type="button" onClick={() => lab.clear()} disabled={!count} className="rounded-lg border border-border px-2.5 py-1 disabled:opacity-50">
          Remove all
        </button>
      </div>
      <output className="mt-2 block break-all font-mono text-[11px] text-muted" aria-label="Command">
        {lab.command}
      </output>
      {lab.chrome === 'full' && (
        <fieldset className="mt-3 space-y-0.5 rounded-xl border border-border p-2">
          <legend className="px-1 text-muted">Setup</legend>
          <Select label="Target" value={lab.setup.target} options={targets} onChange={(v) => lab.set('target', v)} />
          {lab.setup.target === 'new' && (
            <label className="flex items-center justify-between gap-2 py-0.5">
              <span>Directory</span>
              <input value={lab.setup.name} onChange={(e) => lab.set('name', e.target.value)} className="w-32 rounded-md border border-border bg-background px-1.5 py-0.5 font-mono text-foreground" />
            </label>
          )}
          <Select label="Framework" value={lab.setup.framework} options={frameworks} onChange={(v) => lab.set('framework', v)} />
          <Select label="Database" value={lab.setup.database} options={databases} onChange={(v) => lab.set('database', v)} />
          <Select label="Package manager" value={lab.setup.packageManager} options={packageManagers} onChange={(v) => lab.set('packageManager', v)} />
          <Select label="Agent" value={lab.setup.agent} options={agents} onChange={(v) => lab.set('agent', v)} />
        </fieldset>
      )}
      {children}
      <h3 className="mt-3 text-muted">Parts by aisle</h3>
      {lab.warehouse.aisles.map((aisle) => {
        const isOpen = open.has(aisle.id)
        return (
          <details
            key={aisle.id}
            open={isOpen}
            onToggle={(e) => {
              const next = new Set(open)
              if (e.currentTarget.open) next.add(aisle.id)
              else next.delete(aisle.id)
              setOpen(next)
            }}
            className="mt-1"
          >
            <summary className="cursor-pointer rounded-md px-1 py-0.5">
              {aisle.label} ({aisle.count})
            </summary>
            {isOpen && (
              <ul className="ml-2 mt-0.5 space-y-0.5">
                {aisle.racks.flatMap((rack) =>
                  rack.bins.map((bin) => {
                    const pressed = lab.selected.has(bin.item.ref)
                    return (
                      <li key={bin.item.ref}>
                        <button
                          type="button"
                          id={itemId(bin.item.ref)}
                          aria-pressed={pressed}
                          data-ref={bin.item.ref}
                          onClick={() => lab.toggle(bin.item.ref)}
                          className="flex w-full items-center justify-between gap-2 rounded-md px-1.5 py-0.5 text-left hover:bg-background aria-pressed:bg-background"
                        >
                          <span className="truncate">{bin.item.title}</span>
                          <span className="shrink-0 font-mono text-[10.5px] text-muted">
                            {bin.code}
                            {pressed ? ' · added' : ''}
                          </span>
                        </button>
                      </li>
                    )
                  }),
                )}
              </ul>
            )}
          </details>
        )
      })}
    </section>
  )
}

/**
 * Focus ring for the scene container, drawn on an overlay pseudo-element: an
 * inset ring on the container itself paints beneath an opaque canvas. It sets
 * no position, so the container must be positioned itself; a `relative` here
 * would override an `absolute inset-0` container and collapse it.
 */
export const sceneFocusClass =
  'outline-none after:pointer-events-none after:absolute after:inset-0 after:z-10 after:rounded-[inherit] focus-visible:after:ring-[3px] focus-visible:after:ring-inset focus-visible:after:ring-accent'

export type SceneKeys = {
  /** The item under keyboard focus, readable from frame loops. */
  focusRef: { current: string | null }
  focused: string | null
  props: {
    tabIndex: 0
    role: 'application'
    'aria-label': string
    'aria-activedescendant': string | undefined
    'data-focus-ref': string | undefined
    onKeyDown: (e: ReactKeyboardEvent<HTMLElement>) => void
    onFocus: (e: ReactFocusEvent<HTMLElement>) => void
    onBlur: (e: ReactFocusEvent<HTMLElement>) => void
  }
}

/**
 * Keyboard access to a scene container: Tab in, arrows walk `items()` (a grid
 * when `cols` > 1), Enter or Space activates (toggles by default), Escape
 * hands focus back to where it came from.
 */
export function useSceneKeys(o: {
  lab: Lab
  label: string
  items: () => readonly string[]
  cols?: number
  onActivate?: (ref: string) => void
  onFocusItem?: (ref: string) => void
}): SceneKeys {
  const [focused, setFocused] = useState<string | null>(null)
  const focusRef = useRef<string | null>(null)
  const lastIndex = useRef(0)
  const from = useRef<HTMLElement | null>(null)
  const o2 = useRef(o)
  o2.current = o
  const byRef = useMemo(() => new Map(o.lab.catalog.items.map((i) => [i.ref, i])), [o.lab.catalog])
  const move = (ref: string | null, index: number) => {
    focusRef.current = ref
    setFocused(ref)
    lastIndex.current = index
    if (!ref) return
    const { lab, onFocusItem, items } = o2.current
    const item: CatalogItem | undefined = byRef.get(ref)
    const n = items().length
    announce(`${item?.title ?? ref}, ${item?.label ?? ''}, ${lab.selected.has(ref) ? 'added' : 'not added'}, ${index + 1} of ${n}`)
    onFocusItem?.(ref)
  }
  const onKeyDown = (e: ReactKeyboardEvent<HTMLElement>) => {
    if (e.target !== e.currentTarget) return
    const { lab, items, cols = 1, onActivate } = o2.current
    const list = items()
    if (e.key === 'Escape') {
      e.preventDefault()
      move(null, lastIndex.current)
      const back = from.current
      e.currentTarget.blur()
      if (back && back.isConnected) back.focus()
      return
    }
    if (!list.length) return
    const current = focusRef.current ? list.indexOf(focusRef.current) : -1
    const step: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols }
    if (e.key in step) {
      e.preventDefault()
      const next = current < 0 ? Math.min(lastIndex.current, list.length - 1) : Math.min(list.length - 1, Math.max(0, current + step[e.key]))
      move(list[next], next)
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault()
      const next = e.key === 'Home' ? 0 : list.length - 1
      move(list[next], next)
    } else if ((e.key === 'Enter' || e.key === ' ') && focusRef.current) {
      e.preventDefault()
      if (onActivate) onActivate(focusRef.current)
      else lab.toggle(focusRef.current)
    }
  }
  const onFocus = (e: ReactFocusEvent<HTMLElement>) => {
    if (e.target !== e.currentTarget) return
    from.current = e.relatedTarget instanceof HTMLElement ? e.relatedTarget : null
    if (!e.currentTarget.matches(':focus-visible')) return
    const list = o2.current.items()
    if (!list.length) {
      announce(`${o2.current.label}. No parts on the table.`)
      return
    }
    const index = Math.min(lastIndex.current, list.length - 1)
    announce(`${o2.current.label}. ${list.length} parts. Arrow keys move, Enter adds or removes, Escape leaves.`)
    move(list[index], index)
  }
  const onBlur = (e: ReactFocusEvent<HTMLElement>) => {
    if (e.target !== e.currentTarget) return
    focusRef.current = null
    setFocused(null)
  }
  return {
    focusRef,
    focused,
    props: {
      tabIndex: 0,
      role: 'application',
      'aria-label': o.label,
      'aria-activedescendant': focused ? itemId(focused) : undefined,
      'data-focus-ref': focused ?? undefined,
      onKeyDown,
      onFocus,
      onBlur,
    },
  }
}

/**
 * A hairline ring at the keyboard-focused item. `locate` writes the item's
 * world position and returns the ring radius, or 0 when it has no place.
 */
export function FocusRing({ focus, locate, color }: { focus: { current: string | null }; locate: (ref: string, out: Vector3) => number; color: string }) {
  const mesh = useRef<Mesh>(null)
  const v = useMemo(() => new Vector3(), [])
  const still = useReducedMotion()
  useFrame(({ clock }) => {
    const m = mesh.current
    if (!m) return
    const ref = focus.current
    const r = ref ? locate(ref, v) : 0
    m.visible = r > 0
    if (!m.visible) return
    m.position.copy(v)
    const pulse = still ? 1 : 1 + Math.sin(clock.elapsedTime * 4) * 0.06
    m.scale.setScalar(r * pulse)
  })
  return (
    <mesh ref={mesh} rotation={[-Math.PI / 2, 0, 0]} visible={false} renderOrder={999} frustumCulled={false}>
      <ringGeometry args={[0.86, 1, 48]} />
      <meshBasicMaterial color={color} toneMapped={false} depthTest={false} transparent opacity={0.95} />
    </mesh>
  )
}
