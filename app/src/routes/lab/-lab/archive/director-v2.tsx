/**
 * Director's cut v2: the assembly line (parts cabinet, pick tray, belt,
 * two-link arm, app board) shot from an authored shot list in switchable
 * worlds. The lab kit adds sound, touch gestures, a phone sheet, a DOM mirror
 * with keyboard focus, and a demand frame loop.
 */
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react'
import { Fog, Vector3 } from 'three'
import type { Camera, PerspectiveCamera } from 'three'

import type { Agent } from '../../../workspace/-workspace/workspace.types'
import { FocusRing, Mirror, announce, useSceneKeys } from '../kit/a11y'
import { Sheet, useViewport } from '../kit/mobile'
import { FrameGovernor, PerfProbe, dprRange } from '../kit/perf'
import { hum, play, useSound } from '../kit/sound'
import { useSceneGestures } from '../kit/touch'
import type { Lab, MockProps } from '../lab.types'
import { PICK_DELAY, createCam, direct } from './director-v2/camera'
import type { Cam, Mode } from './director-v2/camera'
import { Arm, Belt, Board, Cabinet, Parts, Table } from './director-v2/factory'
import type { Tip } from './director-v2/factory'
import { Integrator } from './director-v2/integrators'
import { WORLDS, lookOf } from './director-v2/look'
import type { WorldId } from './director-v2/look'
import { PAD_COLS, PAGE, REDUCED, TABLE_Y, applyPage, createSim, matchItem, padPos, step } from './director-v2/sim'
import type { Part, Sim } from './director-v2/sim'
import { TileFlip, WorldStage } from './director-v2/worlds'
import type { Cover, Power, Revision, Transition } from './director-v2/worlds'

const params = new URLSearchParams(location.search)
const DEFAULT = {
  world: (WORLDS.some((w) => w.id === params.get('world')) ? params.get('world') : 'blueprint') as WorldId,
  mode: (params.get('camera') === 'locked' ? 'locked' : 'director') as Mode,
}
const MODES: readonly { value: Mode; label: string }[] = [
  { value: 'director', label: 'Director' },
  { value: 'locked', label: 'Locked' },
]
const WORLD_OPTIONS = WORLDS.map((w) => ({ value: w.id, label: w.label.split(' ')[0] }))
const AGENT_OPTIONS = [{ value: 'none', label: 'no agent' }, { value: 'claude', label: 'claude' }, { value: 'codex', label: 'codex' }] as const
const INTEGRATORS: Record<Agent, string> = { none: 'Arm only', claude: 'Claude drone', codex: 'Codex hexapod' }
const AGENTS: readonly Agent[] = ['none', 'claude', 'codex']
/** World change: lights dip, the slate claps, the floor flips, lights return. Skippable. */
const TRANSITION = 1.05
const SWAP_AT = 0.32
/** The phone sheet's collapsed height (59 px measured) plus a hairline of air, which the camera keeps clear. */
const SHEET = 64
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
const parts = (n: number) => `${n} ${n === 1 ? 'part' : 'parts'}`
const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'

function useTip() {
  const ref = useRef<HTMLDivElement>(null)
  const api = useMemo<Tip>(() => {
    const move = (e: PointerEvent) => {
      const el = ref.current
      if (el) el.style.transform = `translate(${Math.min(e.clientX + 14, innerWidth - el.offsetWidth - 8)}px, ${e.clientY + 14}px)`
    }
    return {
      show: (e, title, sub) => {
        const el = ref.current
        if (!el) return
        el.children[0].textContent = title
        el.children[1].textContent = sub
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

/** Steps the line and drains its events into sound and the live region. */
function Simulator({ sim, lab }: { sim: Sim; lab: { current: Lab } }) {
  useFrame((_, dt) => {
    step(sim, lab.current, Math.min(dt, 0.1))
    for (const e of sim.events) {
      if (e.kind !== 'seat') {
        play(e.kind === 'queue' ? 'pick' : e.kind)
        continue
      }
      play('seat')
      let seated = 0
      for (const p of sim.live) if (p.mode === 'board') seated++
      announce(`${e.part.item.title} seated on the board, ${parts(seated)}`)
    }
    sim.events.length = 0
    hum(Math.min(1, (sim.belt.length + sim.feed.length + (sim.arm.holding ? 1 : 0)) / 3))
  })
  return null
}

const tapA = new Vector3()
const tapB = new Vector3()
const tapC = new Vector3()
/** The smaller on-screen edge, in CSS pixels, of a block part sitting on the first tray pad. */
function tapSize(camera: Camera, size: { width: number; height: number }) {
  padPos(0, tapA)
  tapA.set(tapA.x - 0.48, TABLE_Y + 0.1, tapA.z - 0.36)
  tapB.copy(tapA).setX(tapA.x + 0.96).project(camera)
  tapC.copy(tapA).setZ(tapA.z + 0.72).project(camera)
  tapA.project(camera)
  const w = Math.hypot(((tapB.x - tapA.x) * size.width) / 2, ((tapB.y - tapA.y) * size.height) / 2)
  const h = Math.hypot(((tapC.x - tapA.x) * size.width) / 2, ((tapC.y - tapA.y) * size.height) / 2)
  return Math.round(Math.min(w, h))
}

/** Runs the shot list and writes the shot and line state onto the root for harnesses. */
function CameraDirector({ sim, cam, lab, hud, root, onAdd }: {
  sim: Sim; cam: Cam; lab: { current: Lab }; hud: { current: HTMLDivElement | null }; root: { current: HTMLDivElement | null }; onAdd: (p: Part) => void
}) {
  const { camera, size, scene } = useThree()
  const since = useRef(0)
  useFrame((_, rawDt) => {
    direct(cam, sim, lab.current, camera as PerspectiveCamera, scene.fog instanceof Fog ? scene.fog : null, size, Math.min(rawDt, 0.1), onAdd)
    if (hud.current && hud.current.textContent !== cam.hud) hud.current.textContent = cam.hud
    since.current += rawDt
    if (since.current < 0.25 || !root.current) return
    since.current = 0
    let seated = 0, held = 0, flying = 0
    for (const p of sim.live) {
      if (p.mode === 'board') seated++
      else if (p.mode === 'held') held++
      else if (p.mode !== 'home') flying++
    }
    root.current.dataset.stats = JSON.stringify({ mode: cam.shot, seated, held, flying, seats: sim.seats, tap: cam.shot === 'OVERVIEW' ? tapSize(camera, size) : undefined })
  })
  return null
}

/** Dips the lights around a world swap. Dips sit at least 0.4 s apart; reduced motion fades without them. */
function TransitionDriver({ tr, power, overlay, onSwap, onEnd }: {
  tr: { current: Transition & { swapped: boolean; start: number } }
  power: Power
  overlay: { current: HTMLDivElement | null }
  onSwap: () => void
  onEnd: () => void
}) {
  useFrame((_, dt) => {
    const s = tr.current
    if (!s.active) {
      power.current += (1 - power.current) * (1 - Math.exp(-dt * 10))
    } else {
      s.t = Math.max(s.t, (performance.now() - s.start) / 1000 / (REDUCED ? 0.35 : TRANSITION))
      const t = s.t
      const flick = (at: number, w: number) => (!REDUCED && t > at && t < at + w ? 0.2 : 1)
      if (t < SWAP_AT) power.current = Math.max(0, 1 - t / SWAP_AT) * flick(0.12, 0.05)
      else power.current = Math.min(1, (t - SWAP_AT) / 0.5) * flick(0.5, 0.05)
      if (!s.swapped && t >= SWAP_AT) {
        s.swapped = true
        onSwap()
      }
      if (t >= 1) {
        s.active = false
        power.current = 1
        onEnd()
      }
    }
    if (overlay.current) overlay.current.style.opacity = String((1 - power.current) * 0.7)
  })
  return null
}

function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: readonly { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid gap-0.5 rounded-lg border border-border p-0.5" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => { play('tick'); onChange(o.value) }}
          className={`truncate rounded-md px-1 py-1 text-[11px] transition-colors ${focusRing} ${o.value === value ? 'bg-accent text-accent-foreground' : 'text-muted hover:text-foreground'}`}
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

const clock = () => {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

export default function DirectorsCutV2({ lab }: MockProps) {
  const labRef = useRef(lab)
  labRef.current = lab
  const embedded = lab.chrome === 'embedded'
  const vp = useViewport()
  const phone = vp.phone
  const [sim] = useState(() => createSim(lab))
  const [cam] = useState(() => createCam(embedded))
  const [world, setWorld] = useState<WorldId>(DEFAULT.world)
  const [shown, setShown] = useState<WorldId>(DEFAULT.world)
  const [mode, setMode] = useState<Mode>(DEFAULT.mode)
  const [open, setOpen] = useState(() => !embedded && vp.width >= 900)
  const [sheet, setSheet] = useState(false)
  const [manual, setManual] = useState(false)
  const [slate, setSlate] = useState<{ key: number; scene: string; label: string } | null>(null)
  const [details, setDetails] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [warm, setWarm] = useState(false)
  const [tipRef, tip] = useTip()
  const power = useRef<number>(1) as Power
  const overlay = useRef<HTMLDivElement>(null)
  const hud = useRef<HTMLDivElement>(null)
  const root = useRef<HTMLDivElement>(null)
  const pressed = useRef<string | null>(null)
  const covers = useRef<Cover[]>([])
  const look = lookOf(shown, lab.theme)
  const tr = useRef<Transition & { swapped: boolean; start: number }>({ t: 0, from: look, to: look, active: false, swapped: false, start: 0 })
  const pending = useRef<WorldId>(DEFAULT.world)
  const times = useRef(new Map<string, string>())
  useSound(lab)
  cam.mode = mode
  cam.world = shown
  cam.embedded = embedded
  cam.portrait = !vp.landscape
  cam.compact = phone && vp.landscape
  cam.reserve = embedded ? 0 : phone ? SHEET : vp.landscape ? 0 : 172

  useEffect(() => {
    const id = requestAnimationFrame(() => setWarm(true))
    return () => cancelAnimationFrame(id)
  }, [])

  const log = useMemo<Revision[]>(() => {
    const now = clock()
    return lab.setup.items.map((ref) => {
      if (!times.current.has(ref)) times.current.set(ref, now)
      return { ref, title: lab.catalog.items.find((i) => i.ref === ref)?.title ?? ref, time: times.current.get(ref)! }
    })
  }, [lab.setup.items, lab.catalog.items])

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
  const pages = useMemo(() => {
    const aisle = aisles[active]
    const bins = aisle.racks.flatMap((r) => r.bins)
    const toParts = (list: typeof bins) => list.map((b) => sim.parts.get(b.item.ref)).filter((p): p is Part => !!p)
    if (query) {
      const hits = bins.filter((b) => matchItem(b.item, query))
      if (!hits.length) return [{ parts: [] as Part[], label: `NO MATCHES FOR “${query.toUpperCase()}”` }]
      return Array.from({ length: Math.ceil(hits.length / PAGE) }, (_, k) => ({
        parts: toParts(hits.slice(k * PAGE, k * PAGE + PAGE)),
        label: `“${query.toUpperCase()}” · ${hits.length} IN ${aisle.label.toUpperCase()}`,
      }))
    }
    const bays = new Map<number, typeof bins>()
    for (const b of bins) bays.set(b.bay, [...(bays.get(b.bay) ?? []), b])
    return [...bays].map(([bay, list]) => ({
      parts: toParts(list),
      label: `BAY ${String(bay).padStart(2, '0')} · ${aisle.racks[list[0].rack].name.toUpperCase()}`,
    }))
  }, [aisles, active, query, sim])
  const [pageState, setPage] = useState({ key: '', page: 0 })
  const pageKey = `${active}|${query}`
  const page = pageState.key === pageKey ? Math.min(pageState.page, pages.length - 1) : 0
  useLayoutEffect(() => applyPage(sim, pages[page].parts), [sim, pages, page])

  useEffect(() => {
    if (lab.focus.category !== 'all') cam.focusUntil = sim.time + 2.8
  }, [lab.focus.category, cam, sim])

  useLayoutEffect(() => {
    const el = root.current
    if (!el) return
    const measure = () => {
      const box = el.getBoundingClientRect()
      const list: Cover[] = embedded
        ? [{ x0: box.width / 2 - 320, y0: box.height - 120, x1: box.width / 2 + 320, y1: box.height }]
        : [{ x0: 0, y0: 0, x1: box.width, y1: 60 }]
      for (const n of el.querySelectorAll<HTMLElement>('[data-cover],[data-sheet]')) {
        const r = n.getBoundingClientRect()
        if (r.width && r.height) list.push({ x0: r.left - box.left, y0: r.top - box.top, x1: r.right - box.left, y1: r.bottom - box.top })
      }
      covers.current = list
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    for (const n of el.querySelectorAll('[data-cover],[data-sheet]')) observer.observe(n)
    return () => observer.disconnect()
  }, [open, phone, embedded, sheet, details])

  const changeWorld = (next: WorldId) => {
    setWorld(next)
    pending.current = next
    const s = tr.current
    if (s.active && !s.swapped) {
      s.to = lookOf(next, lab.theme)
      return
    }
    tr.current = { t: 0, from: lookOf(shown, lab.theme), to: lookOf(next, lab.theme), active: true, swapped: false, start: performance.now() }
    const index = WORLDS.findIndex((w) => w.id === next)
    setSlate({ key: Date.now(), scene: `SCENE ${String(index + 1).padStart(2, '0')}`, label: WORLDS[index].scene })
  }
  const skip = () => {
    const s = tr.current
    if (!s.active) return
    if (!s.swapped) {
      s.swapped = true
      setShown(pending.current)
    }
    s.t = 1
  }
  const cycleAgent = () => {
    play('swap')
    lab.set('agent', AGENTS[(AGENTS.indexOf(lab.setup.agent) + 1) % AGENTS.length])
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement || e.metaKey || e.ctrlKey) return
      if (e.key === 'Escape') {
        skip()
        setDetails(null)
      }
      if (e.key === 'w') changeWorld(WORLDS[(WORLDS.findIndex((w) => w.id === world) + 1) % WORLDS.length].id)
      if (e.key === 'c') setMode(mode === 'director' ? 'locked' : 'director')
      if (e.key === 'a') cycleAgent()
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  })

  const manualOn = () => {
    if (cam.manual) return
    cam.manual = true
    setManual(true)
  }
  const reset = () => {
    cam.orbit = { az: 0, el: 0, zoom: 1 }
    cam.manual = false
    setManual(false)
  }
  const { guard, props: gestures } = useSceneGestures({
    onInteract: () => {
      cam.lastPick = sim.time
      skip()
    },
    onOrbit: (dx, dy) => {
      cam.orbit.az -= dx * 0.005
      cam.orbit.el = clamp(cam.orbit.el + dy * 0.004, -0.4, 0.9)
      manualOn()
    },
    onZoom: (f) => {
      cam.orbit.zoom = clamp(cam.orbit.zoom / f, 0.35, 2.2)
      manualOn()
    },
    onLongPress: () => {
      if (!pressed.current) return
      tip.hide()
      setDetails(pressed.current)
    },
    onReset: reset,
  })
  const keys = useSceneKeys({
    lab,
    label: "Director's cut scene",
    items: () => {
      const table = pages[page].parts.map((p) => p.item.ref)
      const onTable = new Set(table)
      return [...table, ...lab.setup.items.filter((r) => !onTable.has(r))]
    },
    cols: PAD_COLS,
  })
  const onSceneKey = (e: ReactKeyboardEvent<HTMLElement>) => {
    if (e.key === 'i' && keys.focusRef.current) setDetails(keys.focusRef.current)
    keys.props.onKeyDown(e)
  }
  const locate = useCallback((ref: string, out: Vector3) => {
    const p = sim.parts.get(ref)
    if (!p || !p.visible) return 0
    out.copy(p.pos)
    out.y += (p.size[1] * p.scale) / 2 + 0.02
    return Math.max(p.size[0], p.size[2]) * p.scale * 0.72 + 0.12
  }, [sim])
  const busy = useCallback(() => tr.current.active || power.current < 0.995 || cam.moving || sim.moving, [sim, cam])
  const onPress = useCallback((ref: string) => { pressed.current = ref }, [])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(lab.command)
    } catch {}
    play('copy')
    setCopied(true)
    setTimeout(() => setCopied(false), 1400)
  }

  const count = lab.setup.items.length
  const panelTop = embedded ? 'top-[68px] left-3' : 'top-[72px] left-4'
  const detailItem = details ? lab.catalog.items.find((i) => i.ref === details) : undefined
  const detailCode = details ? lab.warehouse.bins.get(details)?.code : undefined

  const knobs = (
    <>
      <Knob title="WORLD" hotkey={vp.touch ? '' : 'W'}>
        <Segmented label="World" value={world} options={WORLD_OPTIONS} onChange={(v) => v !== world && changeWorld(v)} />
      </Knob>
      <Knob title="CAMERA" hotkey={vp.touch ? '' : 'C'}>
        <Segmented label="Camera" value={mode} options={MODES} onChange={(v) => { setMode(v); reset() }} />
      </Knob>
      <Knob title="INTEGRATOR" hotkey={vp.touch ? '' : 'A'}>
        <button type="button" onClick={cycleAgent} className={`flex w-full items-center justify-between rounded-lg border border-border px-2 py-1 text-[11px] text-foreground hover:bg-background ${focusRing}`}>
          <span>{INTEGRATORS[lab.setup.agent]}</span>
          <span className="text-muted">agent · {lab.setup.agent}</span>
        </button>
      </Knob>
      <div className="flex items-center justify-between gap-2 rounded-lg bg-background px-2 py-1.5 font-mono text-[10px] tracking-wider">
        <div ref={hud} className="truncate text-foreground" data-hud />
        {manual && (
          <button type="button" onClick={reset} className={`shrink-0 rounded text-accent ${focusRing}`}>
            resume
          </button>
        )}
      </div>
    </>
  )
  const search = (
    <div className="flex items-center gap-2 rounded-full border border-border bg-surface/90 px-3 py-1.5 focus-within:border-accent">
      <span className="text-xs text-muted" aria-hidden>⌕</span>
      <input
        value={lab.focus.query}
        aria-label="Search parts"
        onChange={(e) => lab.setFocus({ query: e.target.value })}
        placeholder={`Search ${lab.catalog.items.length.toLocaleString()} parts`}
        className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted"
      />
      {lab.focus.category !== 'all' && (
        <button type="button" onClick={() => lab.setFocus({ category: 'all' })} className={`shrink-0 rounded-full bg-background px-2 py-0.5 text-[11px] text-muted hover:text-foreground ${focusRing}`}>
          {aisles[active].label} ×
        </button>
      )}
    </div>
  )
  const setupRow = (
    <div className="mt-2.5 flex items-center gap-2">
      <Segmented label="Agent" value={lab.setup.agent} options={AGENT_OPTIONS} onChange={(v) => lab.set('agent', v)} />
      {!phone && (
        <button type="button" onClick={copy} className={`ml-auto rounded-lg bg-accent px-3 py-1 text-xs text-accent-foreground active:scale-[0.98] ${focusRing}`}>
          {copied ? 'Copied' : 'Copy'}
        </button>
      )}
      <button type="button" onClick={() => lab.clear()} disabled={!count} className={`rounded-lg border border-border px-2.5 py-1 text-xs text-muted hover:text-foreground disabled:opacity-40 ${phone ? 'ml-auto' : ''} ${focusRing}`}>
        Wrap
      </button>
    </div>
  )

  return (
    <div
      ref={root}
      className="relative h-full w-full select-none overflow-hidden"
      style={{ background: look.bg }}
      data-mock="director-v2"
      data-world={shown}
      data-camera={mode}
      data-agent={lab.setup.agent}
      data-count={count}
    >
      <div
        className="absolute inset-0 outline-none after:pointer-events-none after:absolute after:inset-0 focus-visible:after:ring-[3px] focus-visible:after:ring-inset focus-visible:after:ring-accent"
        {...gestures}
        {...keys.props}
        onKeyDown={onSceneKey}
        onPointerDownCapture={() => { pressed.current = null }}
        onMouseDown={(e) => e.preventDefault()}
      >
        <Canvas dpr={dprRange()} camera={{ fov: 20, near: 0.2, far: 600, position: [30, 20, 30] }} onPointerMissed={() => tip.hide()} gl={{ antialias: true }}>
          <FrameGovernor busy={busy} />
          <PerfProbe />
          <Simulator sim={sim} lab={labRef} />
          <CameraDirector sim={sim} cam={cam} lab={labRef} hud={hud} root={root} onAdd={() => setManual(false)} />
          <TransitionDriver tr={tr} power={power} overlay={overlay} onSwap={() => setShown(pending.current)} onEnd={() => setSlate(null)} />
          <WorldStage key={shown} world={shown} c={look} sim={sim} power={power} lab={lab} log={log} covers={covers} />
          <Cabinet aisles={aisles} active={active} matches={matches} onOpen={(i) => { play('drawer'); lab.setFocus({ category: aisles[i].id }) }} c={look} tip={tip} guard={guard} />
          <Table c={look} count={pages[page].parts.length} label={pages[page].label} pages={pages.length} page={page} setPage={(n) => { play('page'); setPage({ key: pageKey, page: n }) }} tip={tip} guard={guard} />
          <Belt c={look} />
          <Arm sim={sim} c={look} />
          <Board lab={lab} sim={sim} c={look} tip={tip} guard={guard} />
          {warm && <Parts sim={sim} lab={lab} c={look} tip={tip} guard={guard} onPress={onPress} />}
          <Integrator sim={sim} c={look} kind={lab.setup.agent} />
          <FocusRing focus={keys.focusRef} locate={locate} color={look.accent} />
          {!REDUCED && <TileFlip tr={tr} />}
        </Canvas>
      </div>

      <div ref={overlay} className="pointer-events-none absolute inset-0 bg-black opacity-0" />
      <AnimatePresence>
        {slate && (
          <motion.div
            key={slate.key}
            initial={REDUCED ? { opacity: 1 } : { opacity: 0, y: 24, rotate: -3 }}
            animate={{ opacity: 1, y: 0, rotate: 0 }}
            exit={{ opacity: 0, y: REDUCED ? 0 : -16, transition: { duration: REDUCED ? 0 : 0.15 } }}
            transition={REDUCED ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 26 }}
            className="pointer-events-none absolute left-1/2 top-1/2 w-[280px] max-w-[calc(100%-32px)] -translate-x-1/2 -translate-y-1/2 font-mono text-white"
          >
            <motion.div
              initial={REDUCED ? false : { rotate: -20 }}
              animate={{ rotate: 0 }}
              transition={{ delay: 0.16, duration: 0.09, ease: 'easeIn' }}
              style={{ transformOrigin: '0% 100%', background: 'repeating-linear-gradient(115deg, #111 0 18px, #F4F4F4 18px 36px)' }}
              className="h-6 rounded-t-sm border border-white/80"
            />
            <div className="rounded-b-sm border border-white/80 bg-[#111] px-4 py-3">
              <div className="flex justify-between text-[10px] tracking-[0.25em] text-white/60">
                <span>PAYLOAD TOOLKIT</span>
                <span>TAKE {lab.setup.items.length + 1}</span>
              </div>
              <div className="mt-2 text-2xl tracking-[0.1em]">{slate.scene}</div>
              <div className="mt-1 text-xs tracking-[0.18em] text-white/80">{slate.label}</div>
              <div className="mt-2 text-[9px] tracking-[0.2em] text-white/40">ESC OR CLICK TO SKIP</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!phone && (
        <div className={`pointer-events-auto absolute ${panelTop} z-20 ${open ? 'w-[236px]' : 'w-auto'} rounded-2xl border border-border bg-surface/90 p-3 text-foreground shadow-lg backdrop-blur`} data-director data-cover>
          <button type="button" aria-expanded={open} aria-label={open ? 'Collapse director panel' : 'Expand director panel'} onClick={() => { play('tick'); setOpen(!open) }} className={`flex w-full items-center justify-between gap-6 rounded-md ${focusRing}`}>
            <span className="flex items-center gap-2 text-xs tracking-[0.18em] text-muted">
              <span className="size-2 rounded-full bg-[#FF3B30] shadow-[0_0_8px_#FF3B30]" />
              DIRECTOR
            </span>
            <span className="text-xs text-muted" aria-hidden>{open ? '–' : '+'}</span>
          </button>
          {open && (
            <div className="mt-3 space-y-2.5">
              {knobs}
              <div className="text-[10px] leading-snug text-muted">
                Drag to orbit, scroll to zoom, double-click to hand the camera back, hold a part for details. Tab into the scene: arrows move, Enter builds or sends back, I opens details. Follow waits {PICK_DELAY}s after your last pick.
              </div>
            </div>
          )}
        </div>
      )}

      {detailItem && (
        <div
          role="dialog"
          aria-label={`${detailItem.title} details`}
          data-details
          data-cover
          className={`pointer-events-auto absolute z-30 rounded-xl border border-border bg-surface/95 p-3 text-xs shadow-lg backdrop-blur ${
            phone ? 'left-3 right-3 top-[64px]' : embedded ? 'right-3 top-[68px] w-[280px]' : 'right-4 top-[72px] w-[280px]'
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-sm text-foreground">{detailItem.title}</div>
              <div className="font-mono text-[10.5px] text-muted">
                {detailCode} · {detailItem.label} · {lab.selected.has(detailItem.ref) ? 'in the build' : 'not in the build'}
              </div>
            </div>
            <button type="button" onClick={() => setDetails(null)} aria-label="Close details" className={`rounded px-1 text-muted hover:text-foreground ${focusRing}`}>✕</button>
          </div>
          <p className="mt-1.5 line-clamp-3 text-[11px] leading-snug text-muted">{detailItem.description}</p>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            <button type="button" onClick={() => { lab.toggle(detailItem.ref); setDetails(null) }} className={`rounded-lg bg-accent px-2.5 py-1 text-accent-foreground ${focusRing}`}>
              {lab.selected.has(detailItem.ref) ? 'Send it back' : 'Build it'}
            </button>
            {lab.inspect && (
              <button type="button" onClick={() => lab.inspect?.(detailItem.ref)} className={`rounded-lg border border-border px-2.5 py-1 text-muted hover:text-foreground ${focusRing}`}>
                Details
              </button>
            )}
          </div>
        </div>
      )}

      {!embedded && !phone && (
        <>
          <div className="pointer-events-auto absolute bottom-4 left-4 z-20 w-[300px] shadow-lg backdrop-blur" data-cover>{search}</div>
          <div className="pointer-events-auto absolute bottom-4 right-20 z-20 w-[360px] rounded-2xl border border-border bg-surface/90 p-3 shadow-lg backdrop-blur" data-cover>
            <div className="flex items-center justify-between">
              <span className="text-[10px] tracking-[0.18em] text-muted">CALL SHEET</span>
              <span className="rounded-md bg-background px-2 py-0.5 font-mono text-xs tabular-nums">{String(count).padStart(2, '0')} parts</span>
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
              <span className="rounded-md bg-background px-2 py-0.5 font-mono text-xs tabular-nums">{String(count).padStart(2, '0')} parts</span>
              <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted">
                <span className="text-accent">$ </span>
                {lab.command}
              </span>
            </>
          }
          actions={
            <button type="button" onClick={copy} className={`rounded-lg bg-accent px-3 py-1.5 text-xs text-accent-foreground active:scale-[0.98] ${focusRing}`}>
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
            <div className="text-[11px] leading-snug text-muted">Tap a part to build it, hold for details, drag to orbit, pinch to zoom, double-tap to hand the camera back.</div>
          </div>
        </Sheet>
      )}
      <div ref={tipRef} className="pointer-events-none fixed left-0 top-0 z-40 max-w-72 rounded-lg border border-border bg-surface px-2.5 py-1.5 opacity-0 shadow-lg transition-opacity">
        <div className="text-sm text-foreground" />
        <div className="text-xs text-muted" />
      </div>
      <Mirror lab={lab} title="Director's cut v2" />
    </div>
  )
}
