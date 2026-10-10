/**
 * Fab line: cabinet, pick table, transport, rail arm and chip board as one
 * line along +x that the camera pans. Every station is a slot with a
 * registry of variants (fab-line/stations, chip, themes, fx; the contract is
 * fab-line/core/contract.ts and CONTRACT.md); the Director and the URL
 * (`?cabinet=&table=&transport=&board=&integrator=&chip=&theme=&fx=`) pick
 * one per slot and the line reflows. The lab kit adds sound, touch, a phone
 * sheet, a DOM mirror with keyboard focus, and a demand frame loop.
 */
import { Canvas, useFrame } from '@react-three/fiber'
import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode, WheelEvent as ReactWheelEvent } from 'react'
import { Vector3 } from 'three'

import { FocusRing, Mirror, announce, sceneFocusClass, useSceneKeys } from '../kit/a11y'
import { Sheet, useViewport } from '../kit/mobile'
import { FrameGovernor, PerfProbe, dprRange } from '../kit/perf'
import { hum, play, useSound } from '../kit/sound'
import { useSceneGestures } from '../kit/touch'
import type { Lab, MockProps } from '../lab.types'
import { binsPerBay } from '../warehouse'
import { CHIPS } from './fab-line/chip'
import { Arm, Rail } from './fab-line/core/arm'
import { CameraDirector, createCam, dragBy, goTo, panTo, zoomBy } from './fab-line/core/camera'
import type { Follow, Rig as CameraRig, View } from './fab-line/core/camera'
import type { Part, Power as PowerRef, Rig, RouteStyle, Sim, StopId, Tip, Tokens } from './fab-line/core/contract'
import { Parts } from './fab-line/core/parts'
import { BoardFrame, StationFrame, useSimEvents } from './fab-line/core/scene'
import { applyPage, createSim, matchItem, setRig, simBusy, step } from './fab-line/core/sim'
import { PKG_NAME } from './fab-line/core/spec'
import { Strip } from './fab-line/core/strip'
import { clamp, reducedMotion } from './fab-line/core/three'
import { FX } from './fab-line/fx'
import { BOARDS } from './fab-line/stations/board'
import { CABINETS } from './fab-line/stations/cabinet'
import { INTEGRATORS } from './fab-line/stations/integrator'
import { TABLES } from './fab-line/stations/table'
import { TRANSPORTS } from './fab-line/stations/transport'
import { THEMES, TileFlip } from './fab-line/themes'
import type { Transition } from './fab-line/themes'

type Entry = { id: string; label: string }
/** Every slot the Director and the URL can set, with its registry. */
const SLOTS = {
  theme: { title: 'THEME', list: THEMES },
  cabinet: { title: 'CABINET', list: CABINETS },
  table: { title: 'PICK TABLE', list: TABLES },
  transport: { title: 'TRANSPORT', list: TRANSPORTS },
  board: { title: 'BOARD', list: BOARDS },
  integrator: { title: 'INTEGRATOR', list: INTEGRATORS },
  chip: { title: 'CHIP', list: CHIPS },
  fx: { title: 'FX', list: FX },
} satisfies Record<string, { title: string; list: readonly Entry[] }>
type SlotKey = keyof typeof SLOTS
type Picks = Record<SlotKey, string>
const SLOT_KEYS = Object.keys(SLOTS) as SlotKey[]
function pick<T extends Entry>(list: readonly T[], id: string): T {
  return list.find((v) => v.id === id) ?? list[0]
}
const firstOf = (list: readonly Entry[], id: string) => pick<Entry>(list, id).id

const params = new URLSearchParams(location.search)
const DEFAULT = {
  picks: Object.fromEntries(SLOT_KEYS.map((k) => [k, firstOf(SLOTS[k].list, params.get(k) ?? (k === 'theme' ? (params.get('world') ?? '') : ''))])) as Picks,
  rig: (params.get('rig') ?? 'iso') as CameraRig,
  follow: (params.get('follow') ?? (reducedMotion ? 'off' : 'chase')) as Follow,
  routing: (params.get('routing') ?? 'manhattan') as RouteStyle,
}
const RIGS: readonly { value: CameraRig; label: string }[] = [
  { value: 'iso', label: 'Iso' },
  { value: 'crane', label: 'Crane' },
]
const FOLLOWS: readonly { value: Follow; label: string }[] = [
  { value: 'off', label: 'Off' },
  { value: 'chase', label: 'Chase' },
  { value: 'ride', label: 'Ride' },
]
const ROUTINGS: readonly { value: RouteStyle; label: string }[] = [
  { value: 'manhattan', label: 'Manhattan' },
  { value: 'diagonal', label: '45°' },
  { value: 'organic', label: 'Organic' },
]
const parts = (n: number) => `${n} ${n === 1 ? 'part' : 'parts'}`
const bay = (n: number) => String(n).padStart(2, '0')

function useTip() {
  const ref = useRef<HTMLDivElement>(null)
  const api = useMemo<Tip>(() => {
    const move = (e: PointerEvent) => {
      const el = ref.current
      if (!el) return
      const x = Math.min(e.clientX + 14, innerWidth - el.offsetWidth - 8)
      el.style.transform = `translate(${x}px, ${Math.min(e.clientY + 14, innerHeight - el.offsetHeight - 8)}px)`
    }
    return {
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
  }, [])
  return [ref, api] as const
}

/** Substeps so a slow frame still advances the line in real time, up to a 0.3 s catch-up. Plays the line's events and announces seats. */
function Simulator({ sim, lab, routing, root }: { sim: Sim; lab: { current: Lab }; routing: { current: RouteStyle }; root: { current: HTMLDivElement | null } }) {
  useFrame((_, dt) => {
    const total = Math.min(dt, 0.3)
    const n = Math.max(1, Math.ceil(total / 0.05))
    for (let i = 0; i < n; i++) step(sim, lab.current, routing.current, total / n)
    hum(Math.min(1, (sim.carried.length + sim.feed.length + (sim.arm.holding ? 1 : 0)) / 3))
  })
  useSimEvents(sim, (e) => {
    if (e.kind === 'queue') play('pick')
    else if (e.kind === 'toss') play('toss')
    else if (e.kind === 'servo') play('servo')
    else if (e.kind === 'chirp') play('chirp')
    else if (e.kind === 'done') play('zap')
    else if (e.kind === 'seat') {
      play('seat')
      let seated = 0
      for (const p of sim.live) if (p.mode === 'seated') seated++
      announce(`${e.part.item.title} seated on the board, ${parts(seated)}`)
      if (root.current) root.current.dataset.seats = String(Number(root.current.dataset.seats ?? 0) + 1)
    }
  })
  return null
}

function TransitionDriver({ tr, power, overlay, onSwap, onEnd }: {
  tr: { current: Transition & { swapped: boolean } }
  power: PowerRef
  overlay: { current: HTMLDivElement | null }
  onSwap: () => void
  onEnd: () => void
}) {
  useFrame((_, dt) => {
    const s = tr.current
    if (!s.active) {
      power.current += (1 - power.current) * (1 - Math.exp(-dt * 8))
    } else {
      s.t += Math.min(dt, 0.1) / (reducedMotion ? 0.6 : 2.1)
      const t = s.t
      const flick = () => (reducedMotion ? 1 : Math.floor(t * 5) % 2 ? 0.2 : 1)
      if (t < 0.28) power.current = Math.max(0, 1 - t / 0.28) * flick()
      else if (t < 0.6) power.current = 0
      else power.current = Math.min(1, ((t - 0.6) / 0.32) * flick() + (t > 0.85 ? 0.3 : 0))
      if (!s.swapped && t >= 0.5) {
        s.swapped = true
        onSwap()
      }
      if (t >= 1) {
        s.active = false
        power.current = 1
        onEnd()
      }
    }
    if (overlay.current) overlay.current.style.opacity = String((1 - power.current) * 0.74)
  })
  return null
}

/** Re-renders the board when the sim's plan version moves. */
function useSimVersion(sim: Sim) {
  const [version, setVersion] = useState(sim.version)
  useFrame(() => { if (sim.version !== version) setVersion(sim.version) })
  return version
}
function Board({ lab, sim, c, routing, rig, chip, cycle, tip, guard }: {
  lab: Lab; sim: Sim; c: Tokens; routing: RouteStyle; rig: Rig; chip: (typeof CHIPS)[number]; cycle: { framework: () => void; database: () => void; pm: () => void; agent: () => void }; tip: Tip; guard: { moved: boolean }
}) {
  const version = useSimVersion(sim)
  const B = rig.board.Component
  const I = rig.integrator.Component
  return (
    <BoardFrame sim={sim}>
      <B key={rig.board.id} lab={lab} sim={sim} c={c} routing={routing} version={version} chip={chip} cycle={cycle} tip={tip} guard={guard} />
      <I key={rig.integrator.id} agent={lab.setup.agent} sim={sim} board={rig.board} c={c} onCycle={cycle.agent} tip={tip} guard={guard} />
    </BoardFrame>
  )
}

function Segmented<T extends string>({ value, options, onChange, cols, label }: { value: T; options: readonly { value: T; label: string }[]; onChange: (v: T) => void; cols?: number; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid gap-0.5 rounded-lg border border-border p-0.5" style={{ gridTemplateColumns: `repeat(${cols ?? options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => { play('tick'); onChange(o.value) }}
          className={`truncate rounded-md px-1.5 py-1 text-[11px] transition-colors focus-visible:outline-2 focus-visible:outline-accent ${o.value === value ? 'bg-accent text-accent-foreground' : 'text-muted hover:text-foreground'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Knob({ title, hotkey, children }: { title: string; hotkey: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-[10px] tracking-[0.16em] text-muted">
        <span>{title}</span>
        <span className="opacity-70">{hotkey}</span>
      </div>
      {children}
    </div>
  )
}

/** One station slot: a segmented control for up to three variants, a select beyond that. */
function SlotKnob({ slot, value, onChange }: { slot: SlotKey; value: string; onChange: (id: string) => void }) {
  const { title, list } = SLOTS[slot]
  const options = list.map((v) => ({ value: v.id, label: v.label }))
  return (
    <div className="grid grid-cols-[78px_1fr] items-center gap-2" data-slot={slot}>
      <span className="truncate text-[10px] tracking-[0.14em] text-muted">{title}</span>
      {options.length <= 3 ? (
        <Segmented label={title} value={value} options={options} onChange={onChange} />
      ) : (
        <select
          aria-label={title}
          value={value}
          onChange={(e) => { play('tick'); onChange(e.target.value) }}
          className="w-full rounded-lg border border-border bg-background px-1.5 py-1 text-[11px] text-foreground outline-none focus-visible:outline-2 focus-visible:outline-accent"
        >
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      )}
    </div>
  )
}

export default function FabLine({ lab }: MockProps) {
  const labRef = useRef(lab)
  labRef.current = lab
  const embedded = lab.chrome === 'embedded'
  const [picks, setPicks] = useState<Picks>(DEFAULT.picks)
  const [shown, setShown] = useState(DEFAULT.picks.theme)
  const [camRig, setCamRig] = useState<CameraRig>(DEFAULT.rig)
  const [follow, setFollow] = useState<Follow>(DEFAULT.follow)
  const [routing, setRouting] = useState<RouteStyle>(DEFAULT.routing)
  const routingRef = useRef(routing)
  routingRef.current = routing
  const rig = useMemo<Rig>(() => ({
    cabinet: pick(CABINETS, picks.cabinet),
    table: pick(TABLES, picks.table),
    transport: pick(TRANSPORTS, picks.transport),
    board: pick(BOARDS, picks.board),
    integrator: pick(INTEGRATORS, picks.integrator),
  }), [picks.cabinet, picks.table, picks.transport, picks.board, picks.integrator])
  const chip = pick(CHIPS, picks.chip)
  const fx = pick(FX, picks.fx)
  const theme = pick(THEMES, shown)
  const [sim] = useState(() => createSim(lab, rig, routing))
  const line = useMemo(() => {
    setRig(sim, rig)
    return sim.line
  }, [sim, rig])
  const [cam] = useState(createCam)
  const vp = useViewport()
  const phone = vp.phone
  const [open, setOpen] = useState(() => vp.width >= 900 && !embedded)
  const [sheet, setSheet] = useState(false)
  const [manual, setManual] = useState(false)
  const [viewKey, setViewKey] = useState<string>('overview')
  const [slate, setSlate] = useState<{ key: number; scene: string; label: string } | null>(null)
  const [focusRef, setFocusRef] = useState<string | null>(null)
  const [decap, setDecap] = useState(false)
  const [copied, setCopied] = useState(false)
  const [warm, setWarm] = useState(false)
  const [tipRef, tip] = useTip()
  const power = useRef<number>(1) as PowerRef
  const overlay = useRef<HTMLDivElement>(null)
  const hud = useRef<HTMLDivElement>(null)
  const root = useRef<HTMLDivElement>(null)
  const stripWindow = useRef<HTMLDivElement>(null)
  const look = theme.tokens[lab.theme]
  const tr = useRef<Transition & { swapped: boolean }>({ t: 0, from: look, to: look, active: false, swapped: false })
  const pending = useRef(DEFAULT.picks.theme)
  useSound(lab)
  cam.rig = camRig
  cam.follow = follow
  cam.lens = theme.lens
  cam.portrait = !vp.landscape
  cam.reserve = embedded ? 120 : phone ? 92 : vp.landscape ? 96 : 150
  cam.inset = embedded ? 110 : phone || !vp.landscape ? 0 : 268

  useEffect(() => {
    const id = requestAnimationFrame(() => setWarm(true))
    return () => cancelAnimationFrame(id)
  }, [])

  const setSlot = (slot: SlotKey, id: string) => {
    if (slot === 'theme') return changeTheme(id)
    setPicks((p) => ({ ...p, [slot]: id }))
    if (!embedded) {
      const url = new URL(location.href)
      url.searchParams.set(slot, id)
      history.replaceState(history.state, '', url)
    }
  }

  const aisles = lab.warehouse.aisles
  const query = lab.focus.query.trim()
  const matches = useMemo(
    () => (query ? aisles.map((a) => a.racks.reduce((n, r) => n + r.bins.filter((b) => matchItem(b.item, query)).length, 0)) : null),
    [aisles, query],
  )
  const active = useMemo(() => {
    const at = aisles.findIndex((a) => a.id === lab.focus.category)
    if (at >= 0) return at
    if (matches) return matches.indexOf(Math.max(...matches))
    return Math.max(0, aisles.findIndex((a) => a.id === 'block:hero'))
  }, [aisles, lab.focus.category, matches])
  const table = rig.table
  const pages = useMemo(() => {
    const aisle = aisles[active]
    const bins = aisle.racks.flatMap((r) => r.bins)
    const per = table.bays * binsPerBay
    const of = (ref: string) => sim.parts.get(ref) ?? null
    if (query) {
      const hits = bins.filter((b) => matchItem(b.item, query))
      if (!hits.length) return [{ parts: [] as (Part | null)[], slots: 0, label: `NO MATCHES FOR “${query.toUpperCase()}”` }]
      return Array.from({ length: Math.ceil(hits.length / per) }, (_, k) => {
        const list = hits.slice(k * per, k * per + per).map((b) => of(b.item.ref))
        return { parts: list, slots: list.length, label: `“${query.toUpperCase()}” · ${hits.length} IN ${aisle.label.toUpperCase()}` }
      })
    }
    const bays = new Map<number, typeof bins>()
    for (const b of bins) bays.set(b.bay, [...(bays.get(b.bay) ?? []), b])
    const groups = [...bays]
    return Array.from({ length: Math.ceil(groups.length / table.bays) }, (_, k) => {
      const chunk = groups.slice(k * table.bays, k * table.bays + table.bays)
      const list: (Part | null)[] = []
      chunk.forEach(([, items], j) => items.forEach((b, i) => { list[j * binsPerBay + i] = of(b.item.ref) }))
      const last = chunk[chunk.length - 1]
      const racks = [...new Set(chunk.map(([, items]) => aisle.racks[items[0].rack].name.toUpperCase()))]
      const name = racks.length > 1 ? `${racks[0]} +${racks.length - 1}` : racks[0]
      return {
        parts: list,
        slots: (chunk.length - 1) * binsPerBay + last[1].length,
        label: chunk.length > 1 ? `BAYS ${bay(chunk[0][0])}–${bay(last[0])} · ${name}` : `BAY ${bay(chunk[0][0])} · ${name}`,
      }
    })
  }, [aisles, active, query, sim, table])
  const [pageState, setPage] = useState({ key: '', page: 0 })
  const pageKey = `${active}|${query}|${table.id}`
  const page = pageState.key === pageKey ? Math.min(pageState.page, pages.length - 1) : 0
  useLayoutEffect(() => applyPage(sim, pages[page].parts), [sim, pages, page])
  const turnPage = (n: number) => {
    if (pages.length < 2) return
    play('page')
    setPage({ key: pageKey, page: ((n % pages.length) + pages.length) % pages.length })
  }

  useEffect(() => {
    if (lab.focus.category !== 'all') cam.focusUntil = sim.time + 2.8
  }, [lab.focus.category, cam, sim])

  const codeOf = useCallback((ref: string) => lab.warehouse.bins.get(ref)?.code ?? 'X00-00-0A', [lab.warehouse])
  const closeFocus = useCallback(() => {
    cam.focusRef = null
    cam.decap = false
    setFocusRef(null)
    setDecap(false)
  }, [cam])
  const onFocus = useCallback((ref: string) => {
    cam.focusRef = ref
    cam.decap = false
    cam.manual = false
    setManual(false)
    setFocusRef(ref)
    setDecap(false)
  }, [cam])
  const toggleDecap = () => {
    cam.decap = !cam.decap
    setDecap(cam.decap)
  }
  useEffect(() => {
    if (focusRef && !lab.selected.has(focusRef) && sim.parts.get(focusRef)?.mode === 'seated') closeFocus()
  }, [lab.selected, focusRef, closeFocus, sim])

  function changeTheme(next: string) {
    setPicks((p) => ({ ...p, theme: next }))
    if (!embedded) {
      const url = new URL(location.href)
      url.searchParams.set('theme', next)
      url.searchParams.delete('world')
      history.replaceState(history.state, '', url)
    }
    pending.current = next
    const to = pick(THEMES, next)
    const s = tr.current
    if (s.active && !s.swapped) {
      s.to = to.tokens[lab.theme]
      return
    }
    tr.current = { t: 0, from: look, to: to.tokens[lab.theme], active: true, swapped: false }
    const index = THEMES.indexOf(to)
    setSlate({ key: Date.now(), scene: `SCENE ${String(index + 1).padStart(2, '0')}`, label: `${to.scene} · ${to.label.toUpperCase()}` })
  }

  const go = useCallback((to: 'overview' | StopId) => {
    play('tick')
    closeFocus()
    goTo(cam, to === 'overview' ? { kind: 'overview' } : { kind: 'stop', id: to })
    setManual(false)
    setViewKey(to)
  }, [cam, closeFocus])
  useEffect(() => {
    const v = cam.view
    if (v.kind === 'stop' && !line.stops.some((s) => s.id === v.id)) {
      goTo(cam, { kind: 'overview' })
      setViewKey('overview')
    }
  }, [line, cam])
  const stopOrder = useMemo(() => ['overview', ...line.stops.map((s) => s.id)] as ('overview' | StopId)[], [line])
  const viewIndex = (v: View) => {
    if (v.kind === 'overview') return 0
    if (v.kind === 'stop') return Math.max(0, stopOrder.indexOf(v.id))
    const x = v.look.x
    let best = 1, d = Infinity
    line.stops.forEach((s, i) => {
      const m = Math.abs((s.span.x0 + s.span.x1) / 2 - x)
      if (m < d) { d = m; best = i + 1 }
    })
    return best
  }
  const freed = () => {
    if (cam.view.kind === 'free') setViewKey('free')
    if (!manual) setManual(true)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement || e.metaKey || e.ctrlKey || e.altKey) return
      const cycle = <T,>(list: readonly T[], v: T) => list[(list.indexOf(v) + 1) % list.length]
      if (e.key === 'w') changeTheme(cycle(THEMES.map((w) => w.id), picks.theme))
      if (e.key === 'c') setCamRig(cycle(RIGS.map((r) => r.value), camRig))
      if (e.key === 'f') setFollow(cycle(FOLLOWS.map((f) => f.value), follow))
      if (e.key === 'r') setRouting(cycle(ROUTINGS.map((r) => r.value), routing))
      if (e.key === 'Escape') closeFocus()
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        const at = viewIndex(cam.view)
        const next = clamp(at + (e.key === 'ArrowRight' ? 1 : -1), 0, stopOrder.length - 1)
        if (next !== at || cam.view.kind === 'free') go(stopOrder[next])
      }
      if (/^[0-9]$/.test(e.key) && Number(e.key) < stopOrder.length) go(stopOrder[Number(e.key)])
      if (e.key === 'PageDown') turnPage(page + 1)
      if (e.key === 'PageUp') turnPage(page - 1)
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  })

  const reset = () => {
    goTo(cam, { kind: 'overview' })
    setManual(false)
    setViewKey('overview')
  }
  const alt = useRef(false)
  useEffect(() => {
    const on = (e: KeyboardEvent) => { alt.current = e.altKey }
    addEventListener('keydown', on)
    addEventListener('keyup', on)
    return () => { removeEventListener('keydown', on); removeEventListener('keyup', on) }
  }, [])
  const { guard, props: gestures } = useSceneGestures({
    onInteract: () => { cam.lastPick = sim.time },
    onOrbit: (dx, dy) => {
      if (alt.current) {
        cam.orbit.az -= dx * 0.005
        cam.orbit.el = clamp(cam.orbit.el + dy * 0.004, -0.4, 0.9)
        cam.manual = true
      } else dragBy(cam, sim, dx, dy)
      freed()
    },
    onPan: (dx, dy) => {
      dragBy(cam, sim, dx, dy, false)
      freed()
    },
    onZoom: (f) => {
      zoomBy(cam, f)
      freed()
    },
    onLongPress: () => {
      const ref = cam.pressed ?? cam.hovered
      if (ref) {
        tip.hide()
        onFocus(ref)
      }
    },
    onReset: reset,
  })
  const onWheel = (e: ReactWheelEvent<HTMLDivElement>) => {
    const sideways = Math.abs(e.deltaX) > Math.abs(e.deltaY)
    if (!sideways && !e.shiftKey) return gestures.onWheel(e)
    cam.lastPick = sim.time
    const d = -(sideways ? e.deltaX : e.deltaY)
    dragBy(cam, sim, d * cam.axis.x, d * cam.axis.y, false)
    freed()
  }
  const keys = useSceneKeys({
    lab,
    label: 'Fab line scene',
    items: () => {
      const onTable = pages[page].parts.filter((p): p is Part => !!p).map((p) => p.item.ref)
      const seen = new Set(onTable)
      return [...onTable, ...lab.setup.items.filter((r) => !seen.has(r))]
    },
    cols: table.cols,
    onFocusItem: (ref) => {
      const p = sim.parts.get(ref)
      if (!p || !p.visible) return
      if (p.pos.x < cam.visible.x0 + 1 || p.pos.x > cam.visible.x1 - 1) {
        if (cam.view.kind === 'free') panTo(cam, sim, p.pos.x)
        else go(p.mode === 'seated' ? 'board' : 'table')
      }
    },
  })
  const onSceneKey = (e: ReactKeyboardEvent<HTMLElement>) => {
    if (e.key === 'i' && keys.focusRef.current) onFocus(keys.focusRef.current)
    keys.props.onKeyDown(e)
  }
  const locate = useCallback((ref: string, out: Vector3) => {
    const p = sim.parts.get(ref)
    if (!p || !p.visible) return 0
    out.copy(p.pos)
    out.y += 0.03
    return Math.max(p.spec.fw, p.spec.fd) * p.scale * 0.8 + 0.12
  }, [sim])
  const busy = useCallback(() => tr.current.active || power.current < 0.995 || cam.moving || sim.time < cam.focusUntil || simBusy(sim), [sim, cam])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(lab.command)
    } catch {}
    play('copy')
    setCopied(true)
    setTimeout(() => setCopied(false), 1400)
  }

  const swap = (fn: () => void) => () => { play('swap'); fn() }
  const cycle = {
    framework: swap(() => lab.set('framework', lab.setup.framework === 'next' ? 'tanstack' : 'next')),
    database: swap(() => lab.set('database', lab.setup.database === 'postgres' ? 'mongodb' : 'postgres')),
    pm: swap(() => lab.set('packageManager', lab.setup.packageManager === 'pnpm' ? 'npm' : lab.setup.packageManager === 'npm' ? 'bun' : 'pnpm')),
    agent: swap(() => lab.set('agent', lab.setup.agent === 'none' ? 'claude' : lab.setup.agent === 'claude' ? 'codex' : 'none')),
  }
  const count = lab.setup.items.length
  const focused = focusRef ? lab.catalog.items.find((i) => i.ref === focusRef) : null
  const focusedPart = focusRef ? sim.parts.get(focusRef) : null
  const C = rig.cabinet.Component
  const T = rig.table.Component
  const transport = rig.transport
  const Stage = theme.Stage
  const Fx = fx.Component

  const knobs = (
    <>
      <div className="space-y-1.5" data-stations>
        {SLOT_KEYS.map((k) => <SlotKnob key={k} slot={k} value={picks[k]} onChange={(id) => id !== picks[k] && setSlot(k, id)} />)}
      </div>
      <Knob title="CAMERA RIG" hotkey="C">
        <Segmented label="Camera rig" value={camRig} options={RIGS} onChange={(v) => { setCamRig(v); reset() }} />
      </Knob>
      <Knob title="FOLLOW THE PART" hotkey="F">
        <Segmented label="Follow the part" value={follow} options={FOLLOWS} onChange={setFollow} />
      </Knob>
      <Knob title="AUTOROUTER" hotkey="R">
        <Segmented label="Autorouter" value={routing} options={ROUTINGS} onChange={setRouting} />
      </Knob>
    </>
  )
  const hudRow = (
    <div className="flex items-center justify-between gap-2 rounded-lg bg-background px-2 py-1.5 font-mono text-[10px] tracking-wider">
      <div ref={hud} className="truncate text-foreground" data-hud />
      {manual && (
        <button type="button" onClick={reset} className="shrink-0 text-accent">
          resume
        </button>
      )}
    </div>
  )
  const setupRow = (
    <>
      <div className="mt-2.5 grid grid-cols-[1fr_auto] items-center gap-2">
        <Segmented
          label="Target"
          value={lab.setup.target}
          options={[{ value: 'existing', label: 'existing board' }, { value: 'new', label: 'new board' }] as const}
          onChange={(v) => lab.set('target', v)}
        />
        {lab.setup.target === 'new' ? (
          <input
            value={lab.setup.name}
            aria-label="Directory name"
            onChange={(e) => lab.set('name', e.target.value)}
            className="w-[120px] rounded-lg border border-border bg-background px-2 py-1 font-mono text-[11px] text-foreground outline-none focus:border-accent"
          />
        ) : (
          <span />
        )}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <Segmented
          label="Agent"
          value={lab.setup.agent}
          options={[{ value: 'none', label: 'no agent' }, { value: 'claude', label: 'claude' }, { value: 'codex', label: 'codex' }] as const}
          onChange={(v) => lab.set('agent', v)}
        />
        {!phone && (
          <button type="button" onClick={copy} className="ml-auto rounded-lg bg-accent px-3 py-1 text-xs text-accent-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[0.98]">
            {copied ? 'Copied' : 'Copy'}
          </button>
        )}
        <button type="button" onClick={() => lab.clear()} disabled={!count} className={`rounded-lg border border-border px-2.5 py-1 text-xs text-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40 ${phone ? 'ml-auto' : ''}`}>
          Wrap
        </button>
      </div>
    </>
  )
  const search = (
    <div className="flex items-center gap-2 rounded-full border border-border bg-surface/90 px-3 py-1.5">
      <span className="text-xs text-muted" aria-hidden>⌕</span>
      <input
        value={lab.focus.query}
        aria-label="Search parts"
        onChange={(e) => lab.setFocus({ query: e.target.value })}
        placeholder={`Search ${lab.catalog.items.length.toLocaleString()} parts`}
        className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted"
      />
      {lab.focus.category !== 'all' && (
        <button type="button" onClick={() => lab.setFocus({ category: 'all' })} className="shrink-0 rounded-full bg-background px-2 py-0.5 text-[11px] text-muted hover:text-foreground">
          {aisles[active].label} ×
        </button>
      )}
    </div>
  )

  return (
    <div
      ref={root}
      className="relative h-full w-full select-none overflow-hidden"
      style={{ background: look.bg }}
      data-fab
      data-world={shown}
      data-rig={camRig}
      data-follow={follow}
      data-count={count}
      data-slots={SLOT_KEYS.map((k) => `${k}=${picks[k]}`).join('&')}
      data-view={viewKey}
    >
      <div
        className={`absolute inset-0 ${sceneFocusClass}`}
        {...gestures}
        onWheel={onWheel}
        {...keys.props}
        onKeyDown={onSceneKey}
      >
        <Canvas dpr={dprRange()} camera={{ fov: 20, near: 0.2, far: 600, position: [30, 20, 30] }} onPointerMissed={() => tip.hide()}>
          <FrameGovernor busy={busy} />
          <PerfProbe />
          <Simulator sim={sim} lab={labRef} routing={routingRef} root={root} />
          <CameraDirector sim={sim} cam={cam} lab={labRef} hud={hud} root={root} strip={stripWindow} onAdd={() => { setManual(false); closeFocus() }} />
          <TransitionDriver tr={tr} power={power} overlay={overlay} onSwap={() => setShown(pending.current)} onEnd={() => setSlate(null)} />
          <Stage key={shown} c={look} mode={lab.theme} sim={sim} power={power} cam={cam} line={line} />
          <StationFrame sim={sim} slot="pick">
            <C key={rig.cabinet.id} sim={sim} aisles={aisles} active={active} matches={matches} onOpen={(i) => { play('drawer'); lab.setFocus({ category: aisles[i].id }) }} c={look} tip={tip} guard={guard} />
            <T key={rig.table.id} sim={sim} c={look} slots={pages[page].slots} label={pages[page].label} pages={pages.length} page={page} setPage={turnPage} tip={tip} guard={guard} />
          </StationFrame>
          {transport.kind === 'path' && (
            <StationFrame sim={sim} slot="transport">
              <transport.Component key={transport.id} sim={sim} c={look} tip={tip} guard={guard} />
            </StationFrame>
          )}
          <Rail sim={sim} c={look} />
          <Arm sim={sim} c={look} />
          <Board lab={lab} sim={sim} c={look} routing={routing} rig={rig} chip={chip} cycle={cycle} tip={tip} guard={guard} />
          {warm && <Parts sim={sim} chip={chip} lab={lab} c={look} tip={tip} guard={guard} cam={cam} codeOf={codeOf} onFocus={onFocus} />}
          <FocusRing focus={keys.focusRef} locate={locate} color={look.accent} />
          <TileFlip tr={tr} line={line} />
          {Fx && <Fx key={fx.id} c={look} mode={lab.theme} sim={sim} />}
        </Canvas>
      </div>

      <div ref={overlay} className="pointer-events-none absolute inset-0 bg-black opacity-0" />
      <AnimatePresence>
        {slate && (
          <motion.div
            key={slate.key}
            initial={{ opacity: 0, y: 30, rotate: -4 }}
            animate={{ opacity: 1, y: 0, rotate: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ type: 'spring', stiffness: 260, damping: 22 }}
            className="pointer-events-none absolute left-1/2 top-1/2 w-[300px] max-w-[calc(100%-32px)] -translate-x-1/2 -translate-y-1/2 font-mono text-white"
          >
            <motion.div
              initial={{ rotate: -22 }}
              animate={{ rotate: 0 }}
              transition={{ delay: 0.25, duration: 0.12, ease: 'easeIn' }}
              style={{ transformOrigin: '0% 100%', background: 'repeating-linear-gradient(115deg, #111 0 18px, #F4F4F4 18px 36px)' }}
              className="h-7 rounded-t-sm border border-white/80"
            />
            <div className="rounded-b-sm border border-white/80 bg-[#111] px-4 py-3">
              <div className="flex justify-between text-[10px] tracking-[0.25em] text-white/60">
                <span>FAB LINE</span>
                <span>TAKE 1</span>
              </div>
              <div className="mt-2 text-2xl tracking-[0.1em]">{slate.scene}</div>
              <div className="mt-1 text-xs tracking-[0.18em] text-white/80">{slate.label}</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className={`pointer-events-none absolute z-20 ${embedded ? 'left-4 top-4' : `left-1/2 -translate-x-1/2 ${phone ? 'top-[64px]' : 'top-[72px]'}`}`}>
        <Strip line={line} active={viewKey} onGo={go} windowRef={stripWindow} compact={phone || embedded} />
      </div>

      {!phone && (
        <div className="pointer-events-auto absolute left-4 top-[72px] z-20 flex max-h-[calc(100%-180px)] w-[256px] flex-col rounded-2xl border border-border bg-surface/90 p-3 text-foreground shadow-lg backdrop-blur" data-director>
          <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex w-full shrink-0 items-center justify-between rounded-md focus-visible:outline-2 focus-visible:outline-accent">
            <span className="flex items-center gap-2 text-xs tracking-[0.18em] text-muted">
              <span className="size-2 rounded-full bg-[#FF3B30] shadow-[0_0_8px_#FF3B30]" />
              DIRECTOR
            </span>
            <span className="text-xs text-muted">{open ? '–' : '+'}</span>
          </button>
          {open && (
            <div className="-mr-1.5 mt-3 min-h-0 space-y-2.5 overflow-y-auto pr-1.5">
              {knobs}
              {hudRow}
              <div className="text-[10px] leading-snug text-muted">
                Drag or swipe sideways to pan the line, 1–{stopOrder.length - 1} or ← → to jump between stations, 0 for all. Scroll to zoom, Alt-drag to orbit, double-click to hand the camera back. Click a drawer to open its bay, a part to build it, a seated chip to push in. Tab into the scene: arrows move, Enter builds or sends back, I inspects, Escape leaves.
              </div>
            </div>
          )}
        </div>
      )}

      {focused && (
        <div
          className={`pointer-events-auto absolute z-30 rounded-xl border border-border bg-surface/95 p-3 text-xs shadow-lg backdrop-blur ${
            phone ? 'left-3 right-3 top-[112px]' : embedded ? 'right-4 top-[72px] w-[280px]' : 'bottom-4 right-[456px] w-[280px] max-lg:bottom-auto max-lg:right-4 max-lg:top-[128px]'
          }`}
          data-inspector
          role="dialog"
          aria-label={`${focused.title} details`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-sm text-foreground">{focused.title}</div>
              <div className="font-mono text-[10.5px] text-muted">
                {codeOf(focused.ref)} · {focusedPart ? PKG_NAME[focusedPart.spec.pkg] : ''} · {focused.label}
              </div>
            </div>
            <button type="button" onClick={closeFocus} aria-label="Close details" className="rounded px-1 text-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent">✕</button>
          </div>
          <p className="mt-1.5 line-clamp-3 text-[11px] leading-snug text-muted">{focused.description}</p>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {focusedPart?.mode === 'seated' ? (
              <>
                <button type="button" onClick={toggleDecap} aria-pressed={decap} className={`rounded-lg px-2.5 py-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${decap ? 'bg-accent text-accent-foreground' : 'border border-border text-foreground'}`}>
                  {decap ? 'Re-lid chip' : 'Decap the die'}
                </button>
                <button type="button" onClick={() => { lab.toggle(focused.ref); closeFocus() }} className="rounded-lg border border-border px-2.5 py-1 text-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent">
                  Desolder
                </button>
              </>
            ) : (
              <button type="button" onClick={() => { lab.toggle(focused.ref); closeFocus() }} className="rounded-lg bg-accent px-2.5 py-1 text-accent-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
                {lab.selected.has(focused.ref) ? 'Send it back' : 'Build it'}
              </button>
            )}
            {lab.inspect && (
              <button type="button" onClick={() => lab.inspect?.(focused.ref)} className="rounded-lg border border-border px-2.5 py-1 text-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent">
                Details
              </button>
            )}
          </div>
        </div>
      )}

      {!embedded && !phone && (
        <>
          <div className="pointer-events-auto absolute bottom-4 left-4 z-20 w-[300px] shadow-lg backdrop-blur">{search}</div>
          <div className="pointer-events-auto absolute bottom-4 right-20 z-20 w-[360px] rounded-2xl border border-border bg-surface/90 p-3 shadow-lg backdrop-blur">
            <div className="flex items-center justify-between">
              <span className="text-[10px] tracking-[0.18em] text-muted">CALL SHEET</span>
              <span className="rounded-md bg-background px-2 py-0.5 font-mono text-xs tabular-nums" data-count={count}>
                {String(count).padStart(2, '0')} parts
              </span>
            </div>
            <div className="mt-2 max-h-[4.5em] overflow-hidden font-mono text-[11px] leading-[1.5] text-foreground [overflow-wrap:anywhere]">
              <span className="text-accent">$ </span>
              {lab.command}
            </div>
            {setupRow}
          </div>
        </>
      )}
      {!embedded && phone && (
        <Sheet
          label="Call sheet"
          open={sheet}
          onToggle={() => { play('tick'); setSheet(!sheet) }}
          peek={
            <>
              <span className="rounded-md bg-background px-2 py-0.5 font-mono text-xs tabular-nums" data-count={count}>
                {String(count).padStart(2, '0')} parts
              </span>
              <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted">
                <span className="text-accent">$ </span>
                {lab.command}
              </span>
            </>
          }
          actions={
            <button type="button" onClick={copy} className="rounded-lg bg-accent px-3 py-1.5 text-xs text-accent-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[0.98]">
              {copied ? 'Copied' : 'Copy'}
            </button>
          }
        >
          {search}
          <div className="mt-2 break-all font-mono text-[11px] leading-[1.5] text-foreground">
            <span className="text-accent">$ </span>
            {lab.command}
          </div>
          {setupRow}
          <div className="mt-3 space-y-2.5 border-t border-border pt-3">
            {knobs}
            {hudRow}
            <div className="text-[11px] leading-snug text-muted">Swipe sideways to move along the line, tap a station in the strip to jump. Tap a part to build it, hold for details, pinch to zoom, double-tap to hand the camera back.</div>
          </div>
        </Sheet>
      )}
      <div ref={tipRef} className="pointer-events-none fixed left-0 top-0 z-40 w-60 max-w-[calc(100vw-16px)] rounded-lg border border-border bg-surface p-1.5 opacity-0 shadow-lg transition-opacity">
        <img alt="" className="mb-1.5 hidden aspect-[16/10] w-full rounded object-cover object-top" />
        <div data-title className="px-1 text-sm text-foreground" />
        <div data-sub className="px-1 pb-0.5 text-[11px] text-muted" />
      </div>
      <Mirror lab={lab} title="Fab line" />
    </div>
  )
}
