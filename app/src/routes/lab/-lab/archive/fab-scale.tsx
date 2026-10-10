import { Canvas, addAfterEffect, invalidate, useFrame, useThree } from '@react-three/fiber'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from 'react'
import { Vector3 } from 'three'
import type { PerspectiveCamera } from 'three'

import { FocusRing, Mirror, announce, itemId, sceneFocusClass, useSceneKeys } from '../kit/a11y'
import { hum, play, useSound } from '../kit/sound'
import type { SoundName } from '../kit/sound'
import type { Lab, MockProps } from '../lab.types'
import { createCam, directCamera, hudText } from './fab-scale/camera'
import type { Cam, Follow, Inset } from './fab-scale/camera'
import { ChipBoard } from './fab-scale/kit/board.tsx'
import { LabelLayer } from './fab-scale/kit/labels'
import type { Label } from './fab-scale/kit/labels'
import { lookOf } from './fab-scale/kit/look'
import type { Guard, Hover, Tip } from './fab-scale/kit/look'
import { Minimap } from './fab-scale/kit/minimap'
import type { MiniView } from './fab-scale/kit/minimap'
import { clearScreenshots } from './fab-scale/kit/textures'
import { BOARD, COLS, DRAWER, DROP, WALL, cabinetHeight, drawerY } from './fab-scale/layout'
import { GROUPS, buildStore } from './fab-scale/model'
import type { Card, GroupBy } from './fab-scale/model'
import { Arm, Belt, Callouts, Crane, Floor, Parts } from './fab-scale/scene'
import { createSim, isBusy, setStore, step, wake } from './fab-scale/sim'
import type { Event, Level, Part, Sim } from './fab-scale/sim'
import { Wall, matchesOf } from './fab-scale/wall'

const params = new URLSearchParams(location.search)
const DEFAULT = { group: (params.get('group') ?? 'source') as GroupBy, follow: (params.get('follow') ?? 'chase') as Follow }
const FOLLOWS: readonly { value: Follow; label: string }[] = [
  { value: 'off', label: 'Off' },
  { value: 'chase', label: 'Chase' },
]
const PICK_ALL = 24
const coarse = matchMedia('(pointer: coarse)').matches
/** Phones and tablets render at most 1.5x for battery; the loop lowers it further while busy frames sag. */
const DPR_CAP = Math.min(devicePixelRatio || 1, coarse ? 1.5 : 2)
const LONG_PRESS = 500
const DOUBLE_TAP = 320
/** The workspace's Install bar floats about 110 px tall at the bottom centre of the embedded panel. */
const BAR_CLEAR = 120
const VOICE: Record<Event['kind'], SoundName> = { pick: 'pick', seat: 'seat', return: 'toss', probe: 'zap', drawer: 'drawer', route: 'chirp' }

/** Keyboard items are catalog refs for parts and these keys for the wall's cabinets and drawers. */
type WallKey = { kind: 'cabinet' | 'drawer'; index: number }
const wallKey = (kind: WallKey['kind'], index: number) => `wall:${kind}:${index}`
const parseWall = (key: string): WallKey | null => {
  const m = /^wall:(cabinet|drawer):(\d+)$/.exec(key)
  return m ? { kind: m[1] as WallKey['kind'], index: Number(m[2]) } : null
}
/** A drawer's rows run away from the camera, so the next row sits higher on screen. */
const ROWS_AWAY: Record<string, string> = { ArrowUp: 'ArrowDown', ArrowDown: 'ArrowUp' }

type Pinned = { x: number; y: number; title: string; sub: string }

function useTip() {
  const ref = useRef<HTMLDivElement>(null)
  const timer = useRef(0)
  /** Set by the last press; a finger never gets hover tips, whatever event three hands the scene. */
  const touching = useRef(false)
  const api = useMemo(() => {
    const place = (x: number, y: number) => {
      const el = ref.current
      if (!el) return
      const left = Math.max(8, Math.min(x + 14, innerWidth - el.offsetWidth - 8))
      const top = Math.max(8, Math.min(y + 14, innerHeight - el.offsetHeight - 8))
      el.style.transform = `translate(${left}px, ${top}px)`
    }
    const fill = (title: string, sub: string) => {
      const el = ref.current!
      el.children[0].textContent = title
      el.children[1].textContent = sub
      el.style.opacity = '1'
    }
    const tip: Tip = {
      show: (e, title, sub) => {
        if (!ref.current || e.pointerType === 'touch' || touching.current || timer.current) return
        fill(title, sub)
        document.body.style.cursor = 'pointer'
        place(e.clientX, e.clientY)
      },
      move: (e) => {
        if (e.pointerType !== 'touch' && !touching.current && !timer.current) place(e.clientX, e.clientY)
      },
      hide: () => {
        if (timer.current) return
        if (ref.current) ref.current.style.opacity = '0'
        document.body.style.cursor = ''
      },
    }
    /** A long press with no host detail card pins the tooltip above the finger for a moment. */
    const pin = (p: Pinned) => {
      if (!ref.current) return
      clearTimeout(timer.current)
      fill(p.title, p.sub)
      place(p.x - 40, p.y - 96)
      timer.current = window.setTimeout(() => {
        timer.current = 0
        if (ref.current) ref.current.style.opacity = '0'
      }, 2400)
    }
    return { tip, pin }
  }, [])
  useEffect(() => () => clearTimeout(timer.current), [])
  return [ref, api.tip, api.pin, touching] as const
}

function useViewport() {
  const [size, setSize] = useState(() => ({ w: innerWidth, h: innerHeight }))
  useEffect(() => {
    const onResize = () => setSize({ w: innerWidth, h: innerHeight })
    addEventListener('resize', onResize)
    return () => removeEventListener('resize', onResize)
  }, [])
  return size
}

function useReducedMotion() {
  const forced = params.get('motion') === 'reduced'
  const [system, setSystem] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = () => setSystem(media.matches)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])
  return forced || system
}

type LoopProps = {
  sim: Sim
  cam: Cam
  lab: { current: Lab }
  motion: { current: number }
  hud: { current: HTMLElement | null }
  view: { current: MiniView }
  root: { current: HTMLElement | null }
  onEvent: { current: (event: Event) => void }
  onFirstFrame: () => void
  mounted: number
  hover: Hover
  /** The keyboard-focused item; its ring pulses, so the loop keeps drawing while it is set. */
  focus: { current: string | null }
}

const proj = new Vector3()
const screen = (v: Vector3, camera: PerspectiveCamera, size: { width: number; height: number }) => {
  proj.copy(v).project(camera)
  return `${Math.round(((proj.x + 1) / 2) * size.width)},${Math.round(((1 - proj.y) / 2) * size.height)}`
}
const at = new Vector3()
const TOWARD_TOP = new Vector3()

/**
 * Where a harness should click next, in canvas pixels: the focused cabinet
 * (Hero by default), its first drawer's front and the first card filed in
 * the open drawer.
 */
function aim(sim: Sim, camera: PerspectiveCamera, size: { width: number; height: number }) {
  const store = sim.store
  const f = sim.focus
  const hero = store.cabinets.findIndex((cab) => cab.aisle.id === 'block:hero')
  const cab = store.cabinets[f.cabinet >= 0 ? f.cabinet : Math.max(0, hero)]
  const h = cabinetHeight(store.slots)
  const drawer = f.level === 'drawer' ? store.drawers[f.drawer] : cab.drawers[0]
  const k = store.drawers.indexOf(drawer)
  const out = [`cab:${cab.index}:${screen(at.set(cab.x, h * 0.55, WALL.z1), camera, size)}`]
  out.push(`drawer:${k}:${screen(at.set(cab.x, drawerY(drawer.slot, store.slots), WALL.z1 + sim.drawerOpen[k] * DRAWER.travel + 0.05), camera, size)}`)
  const card = drawer.cards.find((c) => sim.parts.get(c.item.ref)!.mode === 'home')
  if (card && sim.drawerOpen[k] > 0.9) {
    const p = sim.parts.get(card.item.ref)!
    const d = p.size[2]
    at.copy(p.pos).add(TOWARD_TOP.set(0, 0.11 + 0.81 * d * 0.3, -0.58 * d * 0.3))
    out.push(`card:${card.item.ref}:${screen(at, camera, size)}`)
  }
  return out.join(' ')
}

/**
 * The one per-frame driver, ahead of every scene callback: it steps the sim,
 * moves the camera, hands the sim's events on, and asks for another frame
 * only while `isBusy` or the camera is still moving, so an idle scene draws
 * nothing. Render fps counts busy frames only and lowers the pixel ratio
 * when they sag. The root element carries the numbers for harnesses.
 */
function Loop({ sim, cam, lab, motion, hud, view, root, onEvent, onFirstFrame, mounted, hover, focus }: LoopProps) {
  const gl = useThree((s) => s.gl)
  const setDpr = useThree((s) => s.setDpr)
  const m = useRef({
    n: 0, t: 0, fps: 0, dpr: DPR_CAP, calm: 0, tail: 2, first: -1, hud: null as HTMLElement | null, mode: '', lens: 0,
    job: null as Part | null, trip: null as Sim['crane']['trip'], hovered: null as Card | Part | null,
  })
  useEffect(() => {
    gl.info.autoReset = false
    setDpr(DPR_CAP)
    const stop = addAfterEffect(() => {
      stop()
      if (root.current) root.current.dataset.firstPaint = String(Math.round(performance.now() - mounted))
    })
    return () => {
      stop()
      gl.info.autoReset = true
    }
  }, [gl, setDpr, root, mounted])
  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.1)
    const L = lab.current
    const camera = state.camera as PerspectiveCamera
    step(sim, L, dt, motion.current)
    directCamera(sim, cam, camera, state.size, dt, motion.current)
    const v = view.current
    v.x = cam.pose.look.x
    v.z = cam.pose.look.z
    v.az = Math.atan2(cam.pose.look.x - cam.pose.pos.x, cam.pose.look.z - cam.pose.pos.z)
    v.level = sim.focus.level
    v.cabinet = sim.focus.cabinet
    v.draw?.()
    for (const event of sim.events) onEvent.current(event)
    sim.events.length = 0

    const f = m.current
    if (sim.arm.job && sim.arm.job !== f.job) play('servo')
    f.job = sim.arm.job
    if (sim.crane.trip && sim.crane.trip !== f.trip) play('servo')
    f.trip = sim.crane.trip
    const hovered = hover.card ?? hover.part
    if (hovered !== f.hovered) {
      f.hovered = hovered
      if (hovered) play('tick')
    }
    hum(Math.min(1, (sim.waiting.length + sim.crane.tote.length + sim.belt.length) / 4))
    const busy = isBusy(sim, motion.current) || !cam.settled || (!!focus.current && motion.current === 1)
    if (busy) f.tail = 2
    if (f.tail > 0) {
      f.tail--
      state.invalidate()
    }
    const calls = gl.info.render.calls
    const frame = gl.info.render.frame
    gl.info.reset()
    if (f.first < 0) {
      f.first = Math.round(performance.now() - mounted)
      onFirstFrame()
    }
    if (busy && rawDt < 0.25) {
      f.n++
      f.t += rawDt
    }
    if (f.t >= 1) {
      f.fps = Math.round(f.n / f.t)
      f.n = 0
      f.t = 0
      if (f.fps < 40 && f.dpr > 1) {
        f.dpr = Math.max(1, f.dpr - 0.25)
        f.calm = 0
        setDpr(f.dpr)
      } else if (f.fps > 56 && f.dpr < DPR_CAP && ++f.calm >= 3) {
        f.dpr = Math.min(DPR_CAP, f.dpr + 0.25)
        f.calm = 0
        setDpr(f.dpr)
      }
    }
    const el = root.current
    if (el) {
      let seated = 0
      for (const p of sim.live) if (p.mode === 'board') seated++
      const d = el.dataset
      d.calls = String(calls)
      d.fps = String(f.fps)
      d.dpr = String(f.dpr)
      d.busy = busy ? '1' : '0'
      d.frame = String(frame)
      d.seated = String(seated)
      d.count = String(L.setup.items.length)
      d.firstFrame = String(f.first)
      if (!busy || frame % 10 === 0) {
        const p = sim.latest
        if (p) d.latest = `${p.item.ref}|${p.mode}|${screen(p.pos, camera, state.size)}`
        d.aim = aim(sim, camera, state.size)
      }
    }
    const lens = Math.round(cam.pose.fov)
    const text = hud.current
    if (text && (f.hud !== text || f.mode !== cam.mode || f.lens !== lens)) {
      f.hud = text
      f.mode = cam.mode
      f.lens = lens
      text.textContent = hudText(cam)
    }
  }, -1)
  return null
}

/** Asks for a frame after any React update, since selection and focus reach the sim through refs. */
function Wake() {
  const invalidate = useThree((s) => s.invalidate)
  useEffect(() => invalidate())
  return null
}

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: readonly { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="grid gap-0.5 rounded-lg border border-border p-0.5" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={o.value === value}
          className={`truncate rounded-md px-1.5 py-1 text-[11px] transition-colors focus-visible:outline-2 focus-visible:outline-accent ${o.value === value ? 'bg-accent text-accent-foreground' : 'text-foreground/70 hover:text-foreground'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export default function FabScale({ lab }: MockProps) {
  const labRef = useRef(lab)
  labRef.current = lab
  const root = useRef<HTMLDivElement>(null)
  const [mounted] = useState(() => performance.now())
  const embedded = lab.chrome === 'embedded'
  const viewport = useViewport()
  /** Narrow or short: a phone in either orientation, where panels give way to a chip row. */
  const phone = viewport.w < 640 || viewport.h < 480
  const compact = !phone && viewport.w < 1100
  const reduced = useReducedMotion()
  const [groupBy, setGroupBy] = useState<GroupBy>(DEFAULT.group)
  const [follow, setFollow] = useState<Follow>(DEFAULT.follow)
  const [open, setOpen] = useState(() => !embedded && !phone && !compact)
  const [manual, setManual] = useState(false)
  const [copied, setCopied] = useState(false)
  const [ready, setReady] = useState(false)
  const [focus, setFocusState] = useState<{ level: Level; cabinet: number; drawer: number }>({ level: 'overview', cabinet: -1, drawer: -1 })
  const [tipRef, tip, pin, touching] = useTip()
  const guard = useRef<Guard>({ moved: false }).current
  const hover = useRef<Hover>({ card: null, part: null, pressed: null }).current
  const motion = useRef(1)
  motion.current = reduced ? 0.5 : 1
  const { muted, setMuted } = useSound(lab)
  /** The sim's events, voiced, with each seat announced. */
  const onEvent = useRef((event: Event) => {
    play(VOICE[event.kind])
    if (event.kind !== 'seat') return
    const n = labRef.current.setup.items.length
    announce(`${event.part.item.title} seated on the board, ${n} ${n === 1 ? 'part' : 'parts'}`)
  })
  const hud = useRef<HTMLDivElement>(null)
  const labelHost = useRef<HTMLDivElement>(null)
  const view = useRef<MiniView>({ x: 0, z: 0, az: 0, level: 'overview', cabinet: -1 })
  const storeRef = useRef<ReturnType<typeof buildStore> | null>(null)
  const store = useMemo(() => {
    const next = buildStore(lab.warehouse, groupBy, storeRef.current ?? undefined)
    storeRef.current = next
    return next
  }, [lab.warehouse, groupBy])
  const [sim] = useState(() => createSim(lab, store))
  const [cam] = useState(createCam)
  const board = useRef(sim.board)
  cam.follow = follow
  const inset: Inset = embedded
    ? { top: 72, bottom: BAR_CLEAR, left: 16, right: 16 }
    : phone
      ? viewport.w > viewport.h
        ? { top: 60, bottom: 68, left: 150, right: 12 }
        : { top: 112, bottom: 76, left: 12, right: 12 }
      : compact
        ? { top: 72, bottom: 236, left: 16, right: 16 }
        : { top: 72, bottom: 16, left: 300, right: 16 }
  cam.inset = inset
  useEffect(() => {
    if (sim.store !== store) setStore(sim, store)
  }, [sim, store])
  useEffect(() => clearScreenshots, [])

  const c = lookOf(lab.theme)
  const query = lab.focus.query.trim()
  const matches = useMemo(() => matchesOf(store, query), [store, query])

  const setFocus = useCallback(
    (next: { level: Level; cabinet: number; drawer: number }) => {
      sim.focus = next
      cam.manual = false
      cam.orbit = { az: 0, el: 0, zoom: 1 }
      setManual(false)
      setFocusState(next)
    },
    [sim, cam],
  )
  const openCabinet = useCallback(
    (i: number) => {
      play('drawer')
      setFocus({ level: 'cabinet', cabinet: i, drawer: -1 })
    },
    [setFocus],
  )
  const openDrawer = useCallback(
    (k: number) => {
      const d = store.drawers[k]
      play('drawer')
      setFocus({ level: 'drawer', cabinet: d.cabinet, drawer: k })
    },
    [setFocus, store],
  )
  const up = useCallback(() => {
    const f = sim.focus
    if (f.level === 'drawer') setFocus({ level: 'cabinet', cabinet: f.cabinet, drawer: -1 })
    else setFocus({ level: 'overview', cabinet: -1, drawer: -1 })
  }, [sim, setFocus])

  /**
   * Keyboard items follow the wall's levels: cabinets on the overview, a
   * cabinet's drawers, then the open drawer's cards in filing order; every
   * selected part not already listed comes after. Read from the sim, so the
   * list changes the moment a level opens.
   */
  const keyItems = () => {
    const f = sim.focus, s = sim.store
    const head =
      f.level === 'drawer' ? (s.drawers[f.drawer]?.cards.map((card) => card.item.ref) ?? [])
      : f.level === 'cabinet' ? (s.cabinets[f.cabinet]?.drawers.map((d) => wallKey('drawer', s.drawers.indexOf(d))) ?? [])
      : s.cabinets.map((cab) => wallKey('cabinet', cab.index))
    const listed = new Set(head)
    return [...head, ...labRef.current.setup.items.filter((ref) => !listed.has(ref))]
  }
  const scene = useRef<HTMLDivElement>(null)
  const keys = useSceneKeys({
    lab,
    label: 'Storage wall',
    items: keyItems,
    cols: focus.level === 'drawer' ? COLS[store.drawers[focus.drawer]?.cards[0]?.item.kind ?? 'block'] : focus.level === 'cabinet' ? 1 : store.cabinets.length,
    onActivate: (key) => {
      const w = parseWall(key)
      if (!w) {
        cam.lastPick = sim.time
        labRef.current.toggle(key)
        return
      }
      if (w.kind === 'cabinet') openCabinet(w.index)
      else openDrawer(w.index)
      focusKey(keyItems()[0])
    },
    onFocusItem: (key) => {
      hover.card = null
      hover.part = null
      invalidate()
      const w = parseWall(key)
      if (!w) {
        const p = sim.parts.get(key)
        if (p?.mode === 'home' || p?.mode === 'wait') hover.card = sim.store.byRef.get(key) ?? null
        else if (p) hover.part = p
        return
      }
      play('tick')
      const list = keyItems()
      const at = `${list.indexOf(key) + 1} of ${list.length}`
      if (w.kind === 'cabinet') {
        const cab = sim.store.cabinets[w.index]
        announce(`${cab.label} cabinet, ${cab.count} parts in ${cab.drawers.length} ${cab.drawers.length === 1 ? 'drawer' : 'drawers'}, ${at}. Enter opens it.`)
      } else {
        const d = sim.store.drawers[w.index]
        announce(`${d.label} drawer, ${d.cards.length} parts, ${at}. Enter pulls it out.`)
      }
    },
  })
  useEffect(() => {
    if (keys.focused) return
    hover.card = null
    hover.part = null
  }, [keys.focused, hover])
  const sendKey = (key: string, real?: { preventDefault: () => void }) => {
    const el = scene.current
    if (el) keys.props.onKeyDown({ key, target: el, currentTarget: el, preventDefault: () => real?.preventDefault() } as unknown as ReactKeyboardEvent<HTMLElement>)
  }
  /** The kit moves focus only by keys, so landing on `key` walks there from Home. */
  const focusKey = (key: string | undefined) => {
    const at = key ? keyItems().indexOf(key) : -1
    if (at < 0) return
    sendKey('Home')
    for (let i = 0; i < at; i++) sendKey('ArrowRight')
  }
  /** Escape climbs a level and keeps focus on what it came out of; on the overview it leaves the scene. */
  const onSceneKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return
    const f = sim.focus
    if (e.key === 'Escape') {
      if (!keys.focusRef.current) return
      e.stopPropagation()
      if (f.level !== 'overview') {
        e.preventDefault()
        const back = f.level === 'drawer' ? wallKey('drawer', f.drawer) : wallKey('cabinet', f.cabinet)
        up()
        focusKey(back)
        return
      }
    }
    if (f.level === 'drawer' && ROWS_AWAY[e.key]) sendKey(ROWS_AWAY[e.key], e)
    else keys.props.onKeyDown(e)
  }
  const locate = (key: string, out: Vector3) => {
    const f = sim.focus, s = sim.store
    const w = parseWall(key)
    if (w?.kind === 'cabinet') {
      const cab = s.cabinets[w.index]
      if (f.level !== 'overview' || !cab) return 0
      out.set(cab.x, cabinetHeight(s.slots) + 0.02, (WALL.z0 + WALL.z1) / 2)
      return 1
    }
    if (w) {
      const d = s.drawers[w.index]
      if (f.level !== 'cabinet' || d?.cabinet !== f.cabinet) return 0
      out.set(s.cabinets[d.cabinet].x, drawerY(d.slot, s.slots) + DRAWER.h / 2, WALL.z1 + sim.drawerOpen[w.index] * DRAWER.travel)
      return 1
    }
    const p = sim.parts.get(key)
    if (!p) return 0
    if (p.mode === 'home' || p.mode === 'wait') {
      const card = s.byRef.get(key)
      if (!card || (!p.fly && sim.drawerOpen[card.drawer] < 0.02)) return 0
      out.set(p.pos.x, p.pos.y + 0.02, p.pos.z)
    } else out.set(p.pos.x, p.pos.y - p.size[1] / 2 + 0.02, p.pos.z)
    return Math.max(p.size[0], p.size[2]) * 0.8
  }

  const { framework, database, packageManager, agent, target } = lab.setup
  const setupKey = `${framework}|${database}|${packageManager}|${agent}|${target}`
  const lastSetup = useRef(setupKey)
  useEffect(() => {
    if (lastSetup.current === setupKey) return
    lastSetup.current = setupKey
    play('swap')
  }, [setupKey])

  useEffect(() => {
    if (lab.focus.category === 'all') return
    const at = store.cabinets.findIndex((cab) => cab.aisle.id === lab.focus.category)
    if (at >= 0) openCabinet(at)
  }, [lab.focus.category, store, openCabinet])

  useEffect(() => {
    if (!query || !matches) return
    const best = matches.perCabinet.indexOf(Math.max(...matches.perCabinet))
    if (sim.focus.level !== 'overview' && matches.perCabinet[sim.focus.cabinet] === 0 && best >= 0 && matches.perCabinet[best] > 0) openCabinet(best)
  }, [query, matches, sim, openCabinet])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement || e.metaKey || e.ctrlKey) return
      if (e.key === 'Escape') up()
      if (e.key === 'g') setGroupBy((g) => GROUPS[(GROUPS.findIndex((x) => x.value === g) + 1) % GROUPS.length].value)
      if (e.key === 'f') setFollow((f) => (f === 'off' ? 'chase' : 'off'))
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [up])

  const pointers = useRef(new Map<number, { x: number; y: number }>()).current
  const gesture = useRef({ pinch: 0, press: 0, start: { x: 0, y: 0 }, tap: { x: 0, y: 0, t: -1e9 } }).current
  const cancelPress = () => {
    if (gesture.press) clearTimeout(gesture.press)
    gesture.press = 0
  }
  const takeCamera = () => {
    if (!cam.manual) {
      cam.manual = true
      setManual(true)
    }
  }
  const reset = () => {
    cam.orbit = { az: 0, el: 0, zoom: 1 }
    cam.manual = false
    setManual(false)
    invalidate()
  }
  const details = (ref: string, x: number, y: number) => {
    if (lab.inspect) {
      lab.inspect(ref)
      return
    }
    const p = sim.parts.get(ref)
    const card = sim.store.byRef.get(ref)
    if (p) pin({ x, y, title: p.item.title, sub: `${p.item.label}${card?.code ? ` · ${card.code}` : ''} · ${sim.wanted.has(ref) ? 'in the build' : 'tap to pick'}` })
  }
  const onDown = (e: ReactPointerEvent) => {
    invalidate()
    touching.current = e.pointerType === 'touch'
    if (touching.current) tip.hide()
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    cam.lastPick = sim.time
    cancelPress()
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()]
      gesture.pinch = Math.hypot(a.x - b.x, a.y - b.y)
      guard.moved = true
      return
    }
    if (pointers.size !== 1) return
    guard.moved = false
    gesture.start = { x: e.clientX, y: e.clientY }
    if (e.pointerType !== 'touch') return
    const x = e.clientX, y = e.clientY
    gesture.press = window.setTimeout(() => {
      gesture.press = 0
      if (guard.moved || pointers.size !== 1 || !hover.pressed) return
      guard.moved = true
      details(hover.pressed, x, y)
    }, LONG_PRESS)
  }
  const onMove = (e: ReactPointerEvent) => {
    invalidate()
    if (e.pointerType === 'mouse') touching.current = false
    const d = pointers.get(e.pointerId)
    if (!d) return
    if (pointers.size === 2) {
      d.x = e.clientX
      d.y = e.clientY
      const [a, b] = [...pointers.values()]
      const dist = Math.hypot(a.x - b.x, a.y - b.y)
      if (gesture.pinch > 0 && dist > 0) cam.orbit.zoom = Math.min(2.4, Math.max(0.3, cam.orbit.zoom * (gesture.pinch / dist)))
      gesture.pinch = dist
      takeCamera()
      return
    }
    if (!guard.moved && Math.hypot(e.clientX - gesture.start.x, e.clientY - gesture.start.y) < (e.pointerType === 'touch' ? 10 : 5)) return
    if (!guard.moved) tip.hide()
    guard.moved = true
    cancelPress()
    const dx = e.clientX - d.x, dy = e.clientY - d.y
    d.x = e.clientX
    d.y = e.clientY
    cam.orbit.az -= dx * 0.005
    cam.orbit.el = Math.min(0.9, Math.max(-0.3, cam.orbit.el + dy * 0.004))
    takeCamera()
  }
  const onUp = (e: ReactPointerEvent) => {
    invalidate()
    const had = pointers.delete(e.pointerId)
    cancelPress()
    gesture.pinch = 0
    hover.pressed = null
    if (!had || pointers.size || guard.moved || e.pointerType !== 'touch') return
    const t = e.timeStamp, last = gesture.tap
    if (t - last.t < DOUBLE_TAP && Math.hypot(e.clientX - last.x, e.clientY - last.y) < 28) {
      gesture.tap = { x: 0, y: 0, t: -1e9 }
      guard.moved = true
      reset()
      return
    }
    gesture.tap = { x: e.clientX, y: e.clientY, t }
  }
  const onCancel = (e: ReactPointerEvent) => {
    pointers.delete(e.pointerId)
    cancelPress()
    gesture.pinch = 0
  }
  const onWheel = (e: ReactWheelEvent) => {
    invalidate()
    cam.orbit.zoom = Math.min(2.4, Math.max(0.3, cam.orbit.zoom * Math.exp(e.deltaY * 0.0012)))
    takeCamera()
  }

  const pickAll = () => {
    if (!matches) return
    let n = 0
    for (const ref of matches.refs) {
      if (lab.selected.has(ref)) continue
      lab.toggle(ref)
      if (++n >= PICK_ALL) break
    }
    cam.lastPick = sim.time
    wake(sim)
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(lab.command)
    } catch {}
    play('copy')
    setCopied(true)
    setTimeout(() => setCopied(false), 1400)
  }

  const height = cabinetHeight(store.slots)
  const labels = useCallback((): Label[] => {
    const out: Label[] = []
    for (const p of sim.live) {
      if (p.mode === 'board' || p.mode === 'returned') continue
      const card = sim.store.byRef.get(p.item.ref)
      out.push({ key: p.item.ref, x: p.pos.x, y: p.pos.y + 0.3, z: p.pos.z, title: p.item.title, sub: card?.code, weight: p === sim.latest ? 3 : 2, kind: 'name', hue: p.item.hue, accent: p.mode === 'tote' || p.mode === 'held' })
    }
    if (sim.crane.tote.length) {
      const c0 = sim.crane.pos
      out.push({ key: 'tote', x: c0.x, y: c0.y - 0.7, z: c0.z, title: `TOTE ${sim.crane.tote.length}/4`, weight: 4, kind: 'count', accent: true })
    }
    if (sim.focus.level === 'overview')
      for (const cab of sim.store.cabinets) {
        const hits = matches ? matches.perCabinet[cab.index] : -1
        out.push({ key: `cab:${cab.index}`, x: cab.x, y: height + 0.15, z: WALL.z1, title: cab.label, sub: matches ? `${hits}/${cab.count}` : String(cab.count), weight: hits > 0 ? 1.5 : 1, kind: 'count', hue: cab.hue, accent: hits > 0 })
      }
    if (sim.focus.level === 'drawer' && cam.px > 14) {
      const d = sim.store.drawers[sim.focus.drawer]
      for (const card of d?.cards ?? []) {
        const p = sim.parts.get(card.item.ref)!
        if (p.mode !== 'home' && p.mode !== 'wait') continue
        const hit = !!matches?.refs.has(card.item.ref)
        if (!hit && card.row % 3 !== 0 && hover.card !== card) continue
        out.push({ key: card.item.ref, x: p.pos.x, y: p.pos.y + 0.28, z: p.pos.z, title: card.code, weight: hit ? 2 : 1, kind: 'code', accent: hit })
      }
    }
    return out
  }, [sim, cam, matches, hover, height])

  const mini = useMemo(
    () =>
      store.cabinets.map((cab) => ({
        index: cab.index,
        label: cab.label,
        hue: cab.hue,
        count: cab.count,
        selected: cab.drawers.reduce((n, d) => n + d.cards.filter((card) => lab.selected.has(card.item.ref)).length, 0),
        matches: matches ? matches.perCabinet[cab.index] : null,
        x0: cab.x - WALL.width / 2,
        x1: cab.x + WALL.width / 2,
      })),
    [store, lab.selected, matches],
  )

  const count = lab.setup.items.length
  const crumb = focus.level === 'overview' ? 'WALL' : focus.level === 'cabinet' ? `${String(focus.cabinet + 1).padStart(2, '0')} ${store.cabinets[focus.cabinet]?.label.toUpperCase()}` : `${String(focus.cabinet + 1).padStart(2, '0')} ${store.cabinets[focus.cabinet]?.label.toUpperCase()} › ${store.drawers[focus.drawer]?.label.toUpperCase()}`
  const search = (
    <>
      <span className="text-xs text-foreground/70">⌕</span>
      <input
        value={lab.focus.query}
        onChange={(e) => lab.setFocus({ query: e.target.value })}
        placeholder={`Search ${lab.catalog.items.length.toLocaleString()} parts`}
        aria-label="Search parts"
        className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted"
      />
      {lab.focus.category !== 'all' && (
        <button type="button" onClick={() => lab.setFocus({ category: 'all' })} className="shrink-0 rounded-full bg-background px-2 py-0.5 text-[11px] text-foreground/70 hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent">
          {store.cabinets.find((cab) => cab.aisle.id === lab.focus.category)?.label} ×
        </button>
      )}
    </>
  )

  return (
    <div
      ref={root}
      className="relative h-full w-full select-none overflow-hidden"
      style={{ background: c.bg }}
      data-fab-scale
      data-level={focus.level}
      data-group={groupBy}
      data-motion={reduced ? 'reduced' : 'full'}
      data-phone={phone ? '1' : '0'}
    >
      <div
        ref={scene}
        {...keys.props}
        onKeyDown={onSceneKey}
        className={`relative h-full w-full touch-none ${sceneFocusClass}`}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onCancel}
        onWheel={onWheel}
        onDoubleClick={reset}
      >
        <Canvas frameloop="demand" dpr={DPR_CAP} camera={{ fov: 14, near: 0.2, far: 400, position: [40, 30, 40] }} onPointerMissed={() => tip.hide()} gl={{ antialias: true, powerPreference: 'high-performance' }}>
          <Loop sim={sim} cam={cam} lab={labRef} motion={motion} hud={hud} view={view} root={root} onEvent={onEvent} onFirstFrame={() => setReady(true)} mounted={mounted} hover={hover} focus={keys.focusRef} />
          <Wake />
          <FocusRing focus={keys.focusRef} locate={locate} color={c.accent} />
          <Floor c={c} slots={store.slots} cabinets={store.cabinets.length} ready={ready} />
          {ready && !phone && <Callouts c={c} slots={store.slots} />}
          <Wall sim={sim} lab={lab} c={c} cam={cam} tip={tip} guard={guard} groupBy={groupBy} matches={matches} onCabinet={openCabinet} onDrawer={openDrawer} hover={hover} ready={ready} />
          <Crane sim={sim} c={c} cabinets={store.cabinets.length} />
          <Belt sim={sim} c={c} />
          <Arm sim={sim} c={c} />
          <ChipBoard lab={lab} look={c} state={board} tip={tip} guard={guard} ready={ready} />
          <Parts sim={sim} lab={lab} c={c} tip={tip} guard={guard} hover={hover} matches={matches?.refs ?? null} onInspect={lab.inspect} />
          <LabelLayer source={labels} host={labelHost} large={phone} />
        </Canvas>
      </div>
      <div ref={labelHost} className="pointer-events-none absolute inset-0 overflow-hidden" />

      <div className={`pointer-events-auto absolute left-3 top-[72px] z-20 rounded-2xl border border-border bg-surface/90 text-foreground shadow-lg backdrop-blur sm:left-4 ${open ? 'w-[248px] p-3' : 'px-3 py-2'}`} data-director>
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center justify-between gap-3 rounded-lg focus-visible:outline-2 focus-visible:outline-accent">
          <span className="flex items-center gap-2 text-xs tracking-[0.18em] text-foreground/70">
            <span className={`size-2 rounded-full ${reduced ? 'bg-muted' : 'bg-[#FF3B30] shadow-[0_0_8px_#FF3B30]'}`} />
            DIRECTOR
          </span>
          <span className="text-xs text-foreground/70">{open ? '–' : '+'}</span>
        </button>
        {open && (
          <div className="mt-3 space-y-2.5">
            <div>
              <div className="mb-1 flex justify-between text-[10px] tracking-[0.16em] text-foreground/70">
                <span>DRAWERS BY</span>
                <span className="opacity-70">G</span>
              </div>
              <Segmented value={groupBy} options={GROUPS} onChange={setGroupBy} />
            </div>
            <div>
              <div className="mb-1 flex justify-between text-[10px] tracking-[0.16em] text-foreground/70">
                <span>{reduced ? 'FOLLOW · REDUCED MOTION' : 'FOLLOW THE PART'}</span>
                <span className="opacity-70">F</span>
              </div>
              <Segmented value={follow} options={FOLLOWS} onChange={setFollow} />
            </div>
            <button type="button" aria-pressed={!muted} onClick={() => setMuted(!muted)} className="flex w-full items-center justify-between rounded-lg border border-border px-2 py-1 text-[10px] tracking-[0.16em] text-foreground/70 hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent" data-sound-toggle>
              <span>SOUND</span>
              <span className={muted ? '' : 'text-accent'}>{muted ? 'OFF' : 'ON'}</span>
            </button>
            <div className="rounded-lg bg-background px-2 py-1.5 font-mono text-[10px] tracking-wider">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-foreground" data-crumb>{crumb}</span>
                {focus.level !== 'overview' && (
                  <button type="button" onClick={up} className="shrink-0 rounded text-accent focus-visible:outline-2 focus-visible:outline-accent">
                    up
                  </button>
                )}
              </div>
              <div className="mt-1 flex items-center justify-between gap-2 text-foreground/70">
                <div ref={hud} className="truncate" data-hud />
                {manual && (
                  <button type="button" onClick={reset} className="shrink-0 rounded text-accent focus-visible:outline-2 focus-visible:outline-accent">
                    resume
                  </button>
                )}
              </div>
            </div>
            {matches && (
              <button type="button" onClick={pickAll} disabled={!matches.refs.size} className="w-full rounded-lg border border-border px-2 py-1.5 text-left text-[11px] text-foreground hover:border-accent focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40" data-pick-all>
                Pick all {matches.refs.size.toLocaleString()} matches
                {matches.refs.size > PICK_ALL && <span className="text-foreground/70"> · {PICK_ALL} per trip</span>}
              </button>
            )}
            <div className="text-[10px] leading-snug text-foreground/70">
              {coarse
                ? 'Tap a cabinet, a drawer, then a card. Long-press for details. Drag to orbit, pinch to zoom, double-tap to hand the camera back.'
                : 'Click a cabinet, then a drawer, then a card. Esc goes up. Drag to orbit, scroll to zoom, double-click to hand the camera back. Tab into the scene for arrows and Enter.'}
            </div>
          </div>
        )}
      </div>

      {phone && focus.level !== 'overview' && !open && (
        <button
          type="button"
          onClick={up}
          className="pointer-events-auto absolute left-[158px] top-[72px] z-20 flex max-w-[calc(100%-170px)] items-center gap-1.5 rounded-2xl border border-border bg-surface/90 px-3 py-2 text-xs text-foreground shadow-lg backdrop-blur focus-visible:outline-2 focus-visible:outline-accent"
          data-up
        >
          <span className="text-accent">‹</span>
          <span className="truncate">{focus.level === 'drawer' ? store.cabinets[focus.cabinet]?.label : 'Wall'}</span>
        </button>
      )}

      {!phone && (
        <Minimap
          cabinets={mini}
          wall={{ z0: WALL.z0, z1: WALL.z1 }}
          line={{ x0: DROP.x - 2.4, x1: BOARD.x1 + 0.4, z0: DROP.z - 0.6, z1: BOARD.z1 + 0.4 }}
          view={view}
          active={focus.cabinet}
          onPick={openCabinet}
          className="absolute right-4 top-[72px] z-20"
        />
      )}

      {!embedded && !phone && (
        <>
          <div className="pointer-events-auto absolute bottom-4 left-4 z-20 flex w-[300px] items-center gap-2 rounded-full border border-border bg-surface/90 px-3 py-1.5 shadow-lg backdrop-blur focus-within:outline-2 focus-within:outline-accent">{search}</div>
          <div className="pointer-events-auto absolute bottom-[60px] left-4 z-20 w-[360px] rounded-2xl border border-border bg-surface/90 p-3 shadow-lg backdrop-blur">
            <div className="flex items-center justify-between">
              <span className="text-[10px] tracking-[0.18em] text-foreground/70">CALL SHEET</span>
              <span className="rounded-md bg-background px-2 py-0.5 font-mono text-xs tabular-nums">{String(count).padStart(2, '0')} parts</span>
            </div>
            <div className="mt-2 max-h-[4.5em] overflow-hidden font-mono text-[11px] leading-[1.5] text-foreground [overflow-wrap:anywhere]">
              <span className="text-accent">$ </span>
              {lab.command}
            </div>
            <div className="mt-2.5 flex items-center gap-2">
              <Segmented
                value={lab.setup.target}
                options={[{ value: 'existing', label: 'add to project' }, { value: 'new', label: 'new project' }] as const}
                onChange={(v) => lab.set('target', v)}
              />
              <button type="button" onClick={copy} className="ml-auto rounded-lg bg-accent px-3 py-1 text-xs text-accent-foreground focus-visible:outline-2 focus-visible:outline-foreground active:scale-[0.98]">
                {copied ? 'Copied' : 'Copy'}
              </button>
              <button type="button" onClick={() => lab.clear()} disabled={!count} className="rounded-lg border border-border px-2.5 py-1 text-xs text-foreground/70 hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40">
                Wrap
              </button>
            </div>
          </div>
        </>
      )}
      {!embedded && phone && (
        <div className="pointer-events-auto absolute left-3 right-[76px] z-20 flex items-center gap-2" style={{ bottom: 'calc(12px + env(safe-area-inset-bottom, 0px))' }} data-chips>
          <label className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-border bg-surface/90 px-3 py-2 shadow-lg backdrop-blur focus-within:outline-2 focus-within:outline-accent">{search}</label>
          <span className="shrink-0 rounded-full border border-border bg-surface/90 px-3 py-2 font-mono text-xs tabular-nums text-foreground shadow-lg backdrop-blur" aria-label={`${count} parts in the build`}>
            {String(count).padStart(2, '0')}
          </span>
          <button type="button" onClick={copy} className="shrink-0 rounded-full bg-accent px-3 py-2 text-xs text-accent-foreground shadow-lg focus-visible:outline-2 focus-visible:outline-foreground active:scale-[0.98]">
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      )}
      <div ref={tipRef} className="pointer-events-none fixed left-0 top-0 z-40 max-w-72 rounded-lg border border-border bg-surface px-2.5 py-1.5 opacity-0 shadow-lg transition-opacity" data-tip>
        <div className="text-sm text-foreground" />
        <div className="text-xs text-foreground/70" />
      </div>
      <Mirror lab={lab} title={embedded ? 'Storage wall' : 'Fab at scale'}>
        <h3 className="mt-3 text-foreground/70">Wall</h3>
        <ul className="ml-1 mt-0.5 space-y-0.5">
          {store.cabinets.map((cab) => (
            <li key={cab.index}>
              <button type="button" id={itemId(wallKey('cabinet', cab.index))} aria-current={focus.cabinet === cab.index || undefined} onClick={() => openCabinet(cab.index)} className="w-full rounded-md px-1.5 py-0.5 text-left hover:bg-background">
                {cab.label} cabinet, {cab.count} parts
              </button>
              {focus.cabinet === cab.index && (
                <ul className="ml-3 space-y-0.5">
                  {cab.drawers.map((d) => {
                    const k = store.drawers.indexOf(d)
                    return (
                      <li key={k}>
                        <button type="button" id={itemId(wallKey('drawer', k))} aria-current={focus.drawer === k || undefined} onClick={() => openDrawer(k)} className="w-full rounded-md px-1.5 py-0.5 text-left hover:bg-background">
                          {d.label} drawer, {d.cards.length} parts
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </Mirror>
    </div>
  )
}
