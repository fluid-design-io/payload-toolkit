import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { PerspectiveCamera, Vector3 } from 'three'

import { FocusRing, Mirror, announce, useSceneKeys } from '../kit/a11y'
import { useViewport } from '../kit/mobile'
import { dprRange } from '../kit/perf'
import { useSound } from '../kit/sound'
import { useSceneGestures } from '../kit/touch'
import type { Lab, MockProps } from '../lab.types'
import { createCam, hudText, runCamera } from './fab-workspace/camera'
import type { Cam, Follow, Framing } from './fab-workspace/camera'
import { BANDS, PAD, PAGE, SOCKET, matchItem } from './fab-workspace/layout'
import { lookOf } from './fab-workspace/look'
import { Belt, DrawerLabels, Dynamic, Lids, Silk, SocketArt, Static, TitleBlock, Traces, TrayPads, TrayStrip } from './fab-workspace/scene'
import type { Hover, Motion, Tip } from './fab-workspace/scene'
import { applyPage, createSim, drop, isBusy, step, wake } from './fab-workspace/sim'
import type { Event, Part, Sim } from './fab-workspace/sim'

/** The Install bar floats about 110px tall at the bottom centre of the embedded panel. */
const BAR_CLEAR = 120
const params = new URLSearchParams(location.search)
const FOLLOWS: readonly { value: Follow; label: string }[] = [
  { value: 'off', label: 'Off' },
  { value: 'soft', label: 'Soft' },
  { value: 'chase', label: 'Chase' },
]
const FRAMINGS: readonly { value: Framing; label: string }[] = [
  { value: 'frame', label: 'Frame' },
  { value: 'stay', label: 'Stay' },
]
const MOTIONS = [
  { value: 'system', label: 'System' },
  { value: 'reduced', label: 'Reduced' },
] as const
/** Phones and tablets render at most 1.5x for battery; the loop lowers it further when frames sag. */
const DPR_CAP = Math.min(devicePixelRatio || 1, dprRange()[1])

function useTip() {
  const ref = useRef<HTMLDivElement>(null)
  const api = useMemo<Tip>(() => {
    const move = (e: PointerEvent) => {
      const el = ref.current
      if (!el) return
      const x = Math.min(e.clientX + 14, innerWidth - el.offsetWidth - 8)
      const y = Math.min(e.clientY + 14, innerHeight - el.offsetHeight - 8)
      el.style.transform = `translate(${x}px, ${y}px)`
    }
    const at = (x: number, y: number, title: string, sub: string, image?: string) => {
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
      el.style.transform = `translate(${Math.min(x + 14, innerWidth - el.offsetWidth - 8)}px, ${Math.min(y + 14, innerHeight - el.offsetHeight - 8)}px)`
    }
    return {
      at,
      show: (e, title, sub, image) => {
        const el = ref.current
        if (!el || e.pointerType === 'touch') return
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

type LoopProps = {
  sim: Sim
  cam: Cam
  lab: { current: Lab }
  motion: Motion
  hover: Hover
  hud: { current: HTMLElement | null }
  stats: { current: HTMLElement | null }
  root: { current: HTMLElement | null }
  onEvent: { current: (event: Event) => void }
  onFirstFrame: () => void
  /** The keyboard-focused item, whose ring pulses while focus stays. */
  focus: { current: string | null }
  play: (name: 'servo' | 'tick') => void
  hum: (level: number) => void
}

/**
 * The one per-frame driver, ahead of every scene callback: it steps the sim,
 * moves the camera, hands the sim's events on, then asks for another frame
 * only while something still moves, so an idle scene costs nothing. Render
 * fps counts busy frames only and lowers the pixel ratio when they sag.
 */
function Loop({ sim, cam, lab, motion, hover, hud, stats, root, onEvent, onFirstFrame, focus, play, hum }: LoopProps) {
  const gl = useThree((s) => s.gl)
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  const invalidate = useThree((s) => s.invalidate)
  const setDpr = useThree((s) => s.setDpr)
  const m = useRef({ n: 0, t: 0, fps: 0, dpr: DPR_CAP, calm: 0, tail: 2, first: -1, mounted: performance.now(), job: null as Part | null, hover: null as string | null })
  useEffect(() => {
    gl.info.autoReset = false
    setDpr(DPR_CAP)
    return () => {
      gl.info.autoReset = true
    }
  }, [gl, setDpr])
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1)
    const L = lab.current
    step(sim, L, dt, motion.current)
    runCamera(cam, sim, L, motion.current, hover.picking, size, camera as PerspectiveCamera, rawDt)
    for (const event of sim.events) onEvent.current(event)
    sim.events.length = 0
    const f = m.current
    if (sim.arm.job && sim.arm.job !== f.job) play('servo')
    f.job = sim.arm.job
    if (hover.ref !== f.hover) {
      f.hover = hover.ref
      if (hover.ref) play('tick')
    }
    hum(Math.min(1, (sim.feed.length + sim.belt.length) / 4))
    const busy = isBusy(sim, motion.current) || !cam.settled || (!!focus.current && motion.current === 1)
    if (busy) f.tail = 2
    if (f.tail > 0) {
      f.tail--
      invalidate()
    }
    const calls = gl.info.render.calls
    const frame = gl.info.render.frame
    gl.info.reset()
    if (f.first < 0) {
      f.first = Math.round(performance.now() - f.mounted)
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
      el.dataset.calls = String(calls)
      el.dataset.fps = String(f.fps)
      el.dataset.dpr = String(f.dpr)
      el.dataset.busy = busy ? '1' : '0'
      el.dataset.cam = cam.mode
      el.dataset.frame = String(frame)
      el.dataset.firstFrame = String(f.first)
      let seated = 0
      for (const p of sim.live) if (p.mode === 'board') seated++
      el.dataset.seated = String(seated)
    }
    if (stats.current) {
      const text = `${calls} calls · ${f.fps} fps · ${f.dpr}x`
      if (stats.current.textContent !== text) stats.current.textContent = text
    }
    if (hud.current) {
      const text = hudText(cam)
      if (hud.current.textContent !== text) hud.current.textContent = text
    }
  }, -1)
  return null
}

/** Asks for a frame after any React update inside the scene, since hover and selection are not React state. */
function Wake() {
  const invalidate = useThree((s) => s.invalidate)
  useEffect(() => invalidate())
  return null
}

function Seg<T extends string>({ value, options, onChange }: { value: T; options: readonly { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="grid gap-0.5 rounded-lg border border-border p-0.5" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)} className={`truncate rounded-md px-1.5 py-1 text-[11px] transition-colors focus-visible:outline-2 focus-visible:outline-accent ${o.value === value ? 'bg-accent text-accent-foreground' : 'text-muted hover:text-foreground'}`}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export default function FabWorkspace({ lab }: MockProps) {
  const labRef = useRef(lab)
  labRef.current = lab
  const [sim] = useState(() => createSim(lab))
  const [cam] = useState<Cam>(createCam)
  const [follow, setFollow] = useState<Follow>((params.get('follow') as Follow) ?? 'soft')
  const [framing, setFraming] = useState<Framing>((params.get('framing') as Framing) ?? 'frame')
  const [motionPref, setMotionPref] = useState<'system' | 'reduced'>(params.get('motion') === 'reduced' ? 'reduced' : 'system')
  const [systemReduced, setSystemReduced] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches)
  const embedded = lab.chrome === 'embedded'
  const view = useViewport()
  const phone = view.phone
  const [open, setOpen] = useState(() => !embedded && !phone)
  const [manual, setManual] = useState(false)
  const [copied, setCopied] = useState(false)
  const [ready, setReady] = useState(false)
  const [tipRef, tip] = useTip()
  const hover = useRef<Hover>({ ref: null, picking: false, pressed: null }).current
  const motion = useRef<Motion>({ current: 1 }).current
  const onEvent = useRef<(event: Event) => void>(() => {})
  const { play, hum, muted, setMuted } = useSound(lab)
  const hud = useRef<HTMLDivElement>(null)
  const stats = useRef<HTMLDivElement>(null)
  const root = useRef<HTMLDivElement>(null)
  const c = lookOf(lab.theme)
  const reduced = motionPref === 'reduced' || systemReduced
  motion.current = reduced ? 0.5 : 1
  cam.follow = follow
  cam.framing = framing
  cam.inset = embedded
    ? { top: 24, bottom: BAR_CLEAR, left: 16, right: 16 }
    : { top: 70, bottom: phone ? 84 : 16, left: open && !phone ? 280 : 16, right: view.width > 900 ? 330 : 16 }

  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = () => setSystemReduced(media.matches)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

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
  sim.active = active
  const pages = useMemo(() => {
    const aisle = aisles[active]
    const bins = aisle.racks.flatMap((r) => r.bins)
    const toParts = (list: typeof bins) => list.map((b) => sim.parts.get(b.item.ref)).filter((p): p is Part => !!p)
    if (query) {
      const hits = bins.filter((b) => matchItem(b.item, query))
      if (!hits.length) return [{ parts: [] as Part[], label: `No matches for “${query}” in ${aisle.label}` }]
      return Array.from({ length: Math.ceil(hits.length / PAGE) }, (_, k) => ({ parts: toParts(hits.slice(k * PAGE, k * PAGE + PAGE)), label: `“${query}” · ${hits.length} in ${aisle.label}` }))
    }
    const bays = new Map<number, typeof bins>()
    for (const b of bins) bays.set(b.bay, [...(bays.get(b.bay) ?? []), b])
    return [...bays].map(([bay, list]) => ({ parts: toParts(list), label: `${aisle.label} · bay ${String(bay).padStart(2, '0')} · ${aisle.racks[list[0].rack].name}` }))
  }, [aisles, active, query, sim])
  const [pageState, setPage] = useState({ key: '', page: 0 })
  const pageKey = `${active}|${query}`
  const page = pageState.key === pageKey ? Math.min(pageState.page, pages.length - 1) : 0
  useLayoutEffect(() => applyPage(sim, pages[page].parts), [sim, pages, page])
  useEffect(() => {
    if (lab.focus.category !== 'all') cam.focusUntil = sim.time + 2.6
    wake(sim)
  }, [lab.focus.category, cam, sim])
  const activeBand = useMemo(() => {
    const id = aisles[active]?.id
    if (!id?.startsWith('block:')) return -1
    const b = BANDS.findIndex((band) => band.groups.includes(id.slice(6)))
    return b === -1 ? BANDS.length - 1 : b
  }, [aisles, active])

  const count = lab.setup.items.length
  onEvent.current = (event) => {
    if (event.kind === 'pick') play('pick')
    else if (event.kind === 'return') play('toss')
    else if (event.kind === 'probe') play('zap')
    else {
      play('seat')
      announce(`${event.part.item.title} seated on the board, ${count} ${count === 1 ? 'part' : 'parts'}`)
    }
  }
  const pageParts = pages[page].parts
  const keyItems = useRef<string[]>([])
  keyItems.current = useMemo(() => {
    const onPage = new Set(pageParts.map((p) => p.item.ref))
    return [...onPage, ...lab.setup.items.filter((ref) => !onPage.has(ref))]
  }, [pageParts, lab.setup.items])
  const keys = useSceneKeys({
    lab,
    label: 'Factory scene',
    items: () => keyItems.current,
    cols: PAD.cols,
    onFocusItem: (ref) => {
      hover.ref = ref
      wake(sim)
    },
  })
  useEffect(() => {
    if (!keys.focused && !hover.picking) hover.ref = null
  }, [keys.focused, hover])
  const locate = (ref: string, out: Vector3) => {
    const p = sim.parts.get(ref)
    if (!p || !p.visible || p.scale < 0.3) return 0
    out.set(p.pos.x, p.pos.y - (p.size[1] * p.scale) / 2 + 0.02, p.pos.z)
    return Math.max(p.size[0], p.size[2]) * p.scale * 0.8
  }
  useEffect(() => {
    const el = root.current
    if (!el) return
    el.dataset.count = String(count)
    el.dataset.follow = follow
    el.dataset.motion = reduced ? 'reduced' : 'full'
  }, [count, follow, reduced])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.metaKey || e.ctrlKey) return
      const cycle = <T,>(list: readonly T[], v: T) => list[(list.indexOf(v) + 1) % list.length]
      if (e.key === 'f') setFollow(cycle(FOLLOWS.map((f) => f.value), follow))
      if (e.key === 'r') setFraming(cycle(FRAMINGS.map((f) => f.value), framing))
      if (e.key === 'm') setMotionPref(motionPref === 'system' ? 'reduced' : 'system')
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  })

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
  }
  const { guard, props: gestures } = useSceneGestures({
    onInteract: () => {
      cam.lastPick = sim.time
      wake(sim)
    },
    onOrbit: (dx, dy) => {
      cam.orbit.az -= dx * 0.005
      cam.orbit.el = Math.min(0.9, Math.max(-0.3, cam.orbit.el + dy * 0.004))
      takeCamera()
    },
    onZoom: (factor) => {
      cam.orbit.zoom = Math.min(2.2, Math.max(0.4, cam.orbit.zoom / factor))
      takeCamera()
    },
    onLongPress: (x, y) => {
      const part = hover.pressed
      if (root.current) root.current.dataset.pressed = part?.item.ref ?? ''
      if (!part) return
      if (lab.inspect) lab.inspect(part.item.ref)
      else tip.at(x, y, part.item.title, `${part.item.label} · ${part.code}`, lab.theme === 'dark' ? (part.item.imageDark ?? part.item.image) : part.item.image)
    },
    onReset: reset,
  })
  const onPart = (p: Part) => {
    tip.hide()
    play('tick')
    hover.ref = null
    if (p.mode === 'board') {
      if (lab.inspect) lab.inspect(p.item.ref)
      else lab.toggle(p.item.ref)
      return
    }
    if (p.mode === 'home' || p.mode === 'queued' || p.mode === 'belt') lab.toggle(p.item.ref)
  }
  const onSocket = (key: keyof typeof SOCKET) => {
    play('swap')
    drop(sim, key)
    if (key === 'j1') drop(sim, 'pod')
    const s = lab.setup
    if (key === 'cpu') lab.set('framework', s.framework === 'next' ? 'tanstack' : 'next')
    if (key === 'mem') lab.set('database', s.database === 'postgres' ? 'mongodb' : 'postgres')
    if (key === 'pwr') lab.set('packageManager', s.packageManager === 'pnpm' ? 'npm' : s.packageManager === 'npm' ? 'bun' : 'pnpm')
    if (key === 'j1') lab.set('agent', s.agent === 'none' ? 'claude' : s.agent === 'claude' ? 'codex' : 'none')
  }
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(lab.command)
    } catch {}
    play('copy')
    setCopied(true)
    setTimeout(() => setCopied(false), 1400)
  }

  const search = (
    <>
      <span className="text-xs text-foreground/70">⌕</span>
      <input value={lab.focus.query} onChange={(e) => lab.setFocus({ query: e.target.value })} placeholder={`Search ${lab.catalog.items.length.toLocaleString()} parts`} aria-label="Search parts" className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted focus-visible:[box-shadow:0_1px_0_var(--color-accent)]" />
      {lab.focus.category !== 'all' && (
        <button type="button" onClick={() => lab.setFocus({ category: 'all' })} className="shrink-0 rounded-full bg-background px-2 py-0.5 text-[11px] text-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent">
          {aisles[active].label} ×
        </button>
      )}
    </>
  )

  return (
    <div ref={root} className="relative h-full w-full select-none overflow-hidden" style={{ background: c.bg }} data-fab data-count={count}>
      <div
        {...keys.props}
        {...gestures}
        onPointerDownCapture={() => {
          hover.pressed = null
        }}
        className="absolute inset-0 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
      >
        <Canvas frameloop="demand" camera={{ fov: 14, near: 0.5, far: 400, position: [40, 30, 40] }} onPointerMissed={() => tip.hide()} gl={{ antialias: true, powerPreference: 'high-performance' }}>
          <Loop sim={sim} cam={cam} lab={labRef} motion={motion} hover={hover} hud={hud} stats={stats} root={root} onEvent={onEvent} onFirstFrame={() => setReady(true)} focus={keys.focusRef} play={play} hum={hum} />
          <Wake />
          <FocusRing focus={keys.focusRef} locate={locate} color={c.accent} />
          <Static c={c} aisles={aisles.length} />
          <Dynamic
            sim={sim}
            lab={lab}
            c={c}
            aisles={aisles}
            active={active}
            matches={matches}
            pageParts={pageParts}
            tip={tip}
            guard={guard}
            hover={hover}
            onDrawer={(i) => {
              play('drawer')
              lab.setFocus({ category: aisles[i].id })
            }}
            onPart={onPart}
            onSocket={onSocket}
          />
          <Belt c={c} sim={sim} motion={motion} />
          <Traces sim={sim} lab={lab} c={c} />
          <Lids sim={sim} lab={lab} hover={hover} />
          <TrayPads pageParts={pageParts} lab={lab} guard={guard} tip={tip} />
          {ready && (
            <>
              <TitleBlock c={c} />
              <DrawerLabels aisles={aisles} active={active} matches={matches} c={c} sim={sim} />
              <TrayStrip c={c} label={pages[page].label} pages={pages.length} page={page} setPage={(n) => {
                  play('page')
                  setPage({ key: pageKey, page: n })
                }} tip={tip} guard={guard} />
              <Silk setup={lab.setup} c={c} activeBand={activeBand} />
              <SocketArt setup={lab.setup} c={c} sim={sim} />
            </>
          )}
        </Canvas>
      </div>

      <div className={`pointer-events-auto absolute z-20 rounded-2xl border border-border bg-surface/90 text-foreground shadow-lg backdrop-blur ${embedded ? 'right-3 top-3' : 'left-3 top-[72px]'} ${open ? 'w-[232px] p-3' : 'px-2.5 py-1.5'}`} data-director>
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center justify-between gap-3 rounded-lg focus-visible:outline-2 focus-visible:outline-accent">
          <span className="flex items-center gap-2 text-[11px] tracking-[0.18em] text-foreground/70">
            <span className={`size-1.5 rounded-full ${reduced ? 'bg-muted' : 'bg-[#FF3B30] shadow-[0_0_6px_#FF3B30]'}`} />
            DIRECTOR
          </span>
          <span className="text-xs text-foreground/70">{open ? '–' : '+'}</span>
        </button>
        {open && (
          <div className="mt-3 space-y-2.5">
            <div>
              <div className="mb-1 flex justify-between text-[10px] tracking-[0.16em] text-foreground/70"><span>FOLLOW</span><span className="opacity-70">F</span></div>
              <Seg value={follow} options={FOLLOWS} onChange={setFollow} />
            </div>
            <div>
              <div className="mb-1 flex justify-between text-[10px] tracking-[0.16em] text-foreground/70"><span>RAIL CATEGORY</span><span className="opacity-70">R</span></div>
              <Seg value={framing} options={FRAMINGS} onChange={setFraming} />
            </div>
            <div>
              <div className="mb-1 flex justify-between text-[10px] tracking-[0.16em] text-foreground/70"><span>MOTION{systemReduced ? ' · OS REDUCED' : ''}</span><span className="opacity-70">M</span></div>
              <Seg value={motionPref} options={MOTIONS} onChange={setMotionPref} />
            </div>
            <button type="button" aria-pressed={!muted} onClick={() => setMuted(!muted)} className="flex w-full items-center justify-between rounded-lg border border-border px-2 py-1 text-[10px] tracking-[0.16em] text-foreground/70 hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent" data-sound-toggle>
              <span>SOUND</span>
              <span className={muted ? '' : 'text-accent'}>{muted ? 'OFF' : 'ON'}</span>
            </button>
            <div className="rounded-lg bg-background px-2 py-1.5 font-mono text-[10px] tracking-wider">
              <div className="flex items-center justify-between gap-2">
                <div ref={hud} className="truncate text-foreground" data-hud />
                {manual && <button type="button" onClick={reset} className="shrink-0 rounded text-accent focus-visible:outline-2 focus-visible:outline-accent">resume</button>}
              </div>
              <div ref={stats} className="mt-0.5 text-foreground/70" data-stats />
            </div>
            <div className="text-[10px] leading-snug text-foreground/70">{view.touch ? 'Drag to orbit, pinch to zoom, double-tap to hand the camera back.' : 'Drag to orbit, scroll to zoom, double-click to hand the camera back.'}</div>
          </div>
        )}
      </div>

      {!embedded && (
        <>
          {!phone && <div className="pointer-events-auto absolute bottom-4 left-4 z-20 flex w-[300px] items-center gap-2 rounded-full border border-border bg-surface/90 px-3 py-1.5 shadow-lg backdrop-blur">{search}</div>}
          {!phone && <div className="pointer-events-auto absolute right-4 top-[72px] z-20 w-[300px] max-w-[calc(100%-32px)] rounded-2xl border border-border bg-surface/90 p-3 shadow-lg backdrop-blur">
            <div className="flex items-center justify-between">
              <span className="text-[10px] tracking-[0.18em] text-foreground/70">BUILD</span>
              <span className="rounded-md bg-background px-2 py-0.5 font-mono text-xs tabular-nums">{String(count).padStart(2, '0')} parts</span>
            </div>
            <div className="mt-2 max-h-[6em] overflow-hidden font-mono text-[11px] leading-[1.5] text-foreground [overflow-wrap:anywhere]">
              <span className="text-accent">$ </span>
              {lab.command}
            </div>
            <div className="mt-2.5 flex items-center gap-2">
              <button type="button" onClick={copy} className="rounded-lg bg-accent px-3 py-1 text-xs text-accent-foreground focus-visible:outline-2 focus-visible:outline-foreground active:scale-[0.98]">{copied ? 'Copied' : 'Copy'}</button>
              <button type="button" onClick={() => lab.clear()} disabled={!count} className="rounded-lg border border-border px-2.5 py-1 text-xs text-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40">Clear</button>
            </div>
          </div>}
          {phone && <div className="pointer-events-auto absolute left-3 right-[76px] z-20 flex items-center gap-2" style={{ bottom: 'calc(12px + env(safe-area-inset-bottom, 0px))' }} data-chips>
            <label className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-border bg-surface/90 px-3 py-2 shadow-lg backdrop-blur">{search}</label>
            <span className="shrink-0 rounded-full border border-border bg-surface/90 px-3 py-2 font-mono text-xs tabular-nums text-foreground shadow-lg backdrop-blur" aria-label={`${count} parts in the build`}>
              {String(count).padStart(2, '0')}
            </span>
            <button type="button" onClick={copy} className="shrink-0 rounded-full bg-accent px-3 py-2 text-xs text-accent-foreground shadow-lg focus-visible:outline-2 focus-visible:outline-foreground active:scale-[0.98]">{copied ? 'Copied' : 'Copy'}</button>
          </div>}
        </>
      )}
      <Mirror lab={lab} title={embedded ? 'Factory' : 'Fab for /workspace'} />
      <div ref={tipRef} className="pointer-events-none fixed left-0 top-0 z-40 w-56 rounded-lg border border-border bg-surface p-1.5 opacity-0 shadow-lg transition-opacity">
        <img alt="" className="mb-1.5 hidden aspect-[16/10] w-full rounded object-cover object-top" />
        <div data-title className="px-1 text-sm text-foreground" />
        <div data-sub className="px-1 pb-0.5 text-[11px] text-foreground/70" />
      </div>
    </div>
  )
}
