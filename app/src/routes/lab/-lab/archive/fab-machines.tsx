import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { PerspectiveCamera, Vector3 } from 'three'

import { FocusRing, Mirror, announce, sceneFocusClass, useSceneKeys } from '../kit/a11y'
import { useViewport } from '../kit/mobile'
import { hum, play, useSound } from '../kit/sound'
import type { SoundName } from '../kit/sound'
import { useSceneGestures } from '../kit/touch'
import type { Lab, MockProps } from '../lab.types'
import { createCam, hudText, runCamera } from './fab-machines/camera'
import type { Cam, Follow, Rig } from './fab-machines/camera'
import { Cell } from './fab-machines/kit/cell'
import { lookOf, useTip } from './fab-machines/kit/hairline'
import { Integrators, WorkMarks } from './fab-machines/kit/integrators'
import { Storage } from './fab-machines/kit/storage'
import { TransportKit, Transports } from './fab-machines/kit/transports'
import { Parts } from './fab-machines/parts'
import type { Press } from './fab-machines/parts'
import { MACHINES, PAGE, SETUP_KEY, TRANSPORTS, TRAY_COLS, applyPage, createSim, fromSetup, isBusy, machine, seatedCount, step, wake } from './fab-machines/sim'
import type { Event, Part, Sim, SlotKey } from './fab-machines/sim'
import { Cabinet, Floor, Hangar, Table, matchItem } from './fab-machines/stage'

/*
 * Fab machines. The combined line (cabinet, transport, integrator, cell,
 * storage) where every setup choice is a machine with its own silhouette,
 * motion personality and idle loop, parked in a hangar when idle. One
 * hairline vocabulary (kit/hairline.tsx) keeps the family together.
 */

const params = new URLSearchParams(location.search)
const DEFAULT = {
  rig: (params.get('rig') ?? 'iso') as Rig,
  follow: (params.get('follow') ?? 'both') as Follow,
}
/** The Install bar floats about 110px tall at the bottom centre of the embedded panel. */
const BAR_CLEAR = 120
const coarse = matchMedia('(pointer: coarse)').matches
/** Phones and tablets render at most 1.5x for battery; the loop lowers it further when busy frames sag. */
const DPR_CAP = Math.min(devicePixelRatio || 1, coarse ? 1.5 : 2)
const RIGS: readonly { value: Rig; label: string }[] = [
  { value: 'iso', label: 'Iso' },
  { value: 'crane', label: 'Crane' },
  { value: 'hangar', label: 'Hangar' },
]
const FOLLOWS: readonly { value: Follow; label: string }[] = [
  { value: 'off', label: 'Off' },
  { value: 'part', label: 'Part' },
  { value: 'machine', label: 'Machine' },
  { value: 'both', label: 'Both' },
]
const MOTIONS = [
  { value: 'system', label: 'System' },
  { value: 'reduced', label: 'Reduced' },
] as const
const SLOT_LABEL: Record<SlotKey, string> = { integrator: 'AGENT · INTEGRATOR', transport: 'INSTALLER · TRANSPORT', cell: 'FRAMEWORK · CELL', storage: 'DATABASE · STORAGE' }
/** The kit voice for each sim event; camera moves and shot cuts stay silent. */
const VOICE: Record<Event['kind'], SoundName> = { pick: 'pick', seat: 'seat', return: 'toss', probe: 'zap', job: 'servo', route: 'chirp', swap: 'swap', drawer: 'drawer' }
const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'

type LoopProps = {
  sim: Sim
  cam: Cam
  lab: { current: Lab }
  motion: { current: number }
  hud: { current: HTMLElement | null }
  stats: { current: HTMLElement | null }
  root: { current: HTMLElement | null }
  onEvent: { current: (event: Event) => void }
  kick: { current: () => void }
  /** The keyboard-focused part; its ring pulses, so frames keep coming at full motion. */
  focus: { current: string | null }
  onFirstFrame: () => void
  onManual: (manual: boolean) => void
}

/**
 * The one per-frame driver, ahead of every scene callback: it steps the sim,
 * moves the camera, hands the sim's events on, then asks for another frame
 * only while `isBusy` or the camera still moves, so an idle hangar costs
 * nothing. Render fps counts busy frames only and lowers the pixel ratio when
 * they sag. The root element carries the probe the harness reads.
 */
function Loop({ sim, cam, lab, motion, hud, stats, root, onEvent, kick, focus, onFirstFrame, onManual }: LoopProps) {
  const gl = useThree((s) => s.gl)
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  const invalidate = useThree((s) => s.invalidate)
  const setDpr = useThree((s) => s.setDpr)
  const m = useRef({ n: 0, t: 0, fps: 0, dpr: DPR_CAP, calm: 0, quiet: 0, first: -1, mounted: performance.now(), manual: false })
  useEffect(() => {
    gl.info.autoReset = false
    setDpr(DPR_CAP)
    kick.current = () => {
      wake(sim)
      invalidate()
    }
    return () => {
      gl.info.autoReset = true
      kick.current = () => {}
    }
  }, [gl, setDpr, invalidate, kick, sim])
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1)
    step(sim, lab.current, dt, motion.current)
    runCamera(cam, sim, size, camera as PerspectiveCamera, rawDt)
    for (const event of sim.events) onEvent.current(event)
    sim.events.length = 0
    hum(Math.min(1, (sim.feed.length + sim.queue.length) / 4))
    const f = m.current
    const busy = isBusy(sim) || !cam.settled || (!!focus.current && motion.current === 1)
    // A short tail lets renderer-side easing (drone tilt, walker feet, hover lifts) land after the sim rests.
    f.quiet = busy ? 0 : f.quiet + rawDt
    if (f.quiet < 0.5) invalidate()
    const calls = gl.info.render.calls
    const frame = gl.info.render.frame
    gl.info.reset()
    if (f.first < 0) {
      f.first = Math.round(performance.now() - f.mounted)
      onFirstFrame()
    }
    if (cam.manual !== f.manual) {
      f.manual = cam.manual
      onManual(cam.manual)
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
      el.dataset.frame = String(frame)
      el.dataset.firstFrame = String(f.first)
      el.dataset.seated = String(seatedCount(sim))
      el.dataset.latest = sim.latest?.mode ?? ''
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

/** Asks for a frame after any React update inside the scene: selection, setup and focus reach the sim through `lab`. */
function Wake() {
  const invalidate = useThree((s) => s.invalidate)
  useEffect(() => invalidate())
  return null
}

function Segmented<T extends string>({ value, options, onChange, cols }: { value: T; options: readonly { value: T; label: string }[]; onChange: (v: T) => void; cols?: number }) {
  return (
    <div className="grid gap-0.5 rounded-lg border border-border p-0.5" style={{ gridTemplateColumns: `repeat(${cols ?? options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`truncate rounded-md px-1.5 py-1 text-[11px] transition-colors ${FOCUS} ${o.value === value ? 'bg-accent text-accent-foreground' : 'text-foreground/70 hover:text-foreground'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export default function FabMachines({ lab }: MockProps) {
  const labRef = useRef(lab)
  labRef.current = lab
  const [sim] = useState(() => createSim(lab))
  const [cam] = useState(createCam)
  const [rig, setRig] = useState<Rig>(DEFAULT.rig)
  const [follow, setFollow] = useState<Follow>(DEFAULT.follow)
  const [motionPref, setMotionPref] = useState<'system' | 'reduced'>(params.get('motion') === 'reduced' ? 'reduced' : 'system')
  const [systemReduced, setSystemReduced] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches)
  const embedded = lab.chrome === 'embedded'
  const view = useViewport()
  /** Narrow, or short on a touch screen: a phone in either orientation, where panels give way to a chip row. */
  const phone = view.phone
  const portrait = view.height > view.width * 1.1
  /** On phones the Director is a bottom sheet behind a chip, so the top band stays the switcher's. */
  const sheet = phone && !embedded
  const [open, setOpen] = useState(() => !embedded && !phone && innerWidth >= 1100)
  const [manual, setManual] = useState(false)
  const [copied, setCopied] = useState(false)
  const [ready, setReady] = useState(false)
  const [tipRef, tip] = useTip()
  const { muted, setMuted } = useSound(lab)
  const press = useRef<Press>({ part: null }).current
  const motion = useRef({ current: 1 }).current
  /** The sim's events, handed on once per frame to the sound kit and the live region. */
  const onEvent = useRef<(event: Event) => void>(() => {})
  const kick = useRef<() => void>(() => {})
  const hud = useRef<HTMLDivElement>(null)
  const stats = useRef<HTMLDivElement>(null)
  const root = useRef<HTMLDivElement>(null)
  const c = useMemo(() => lookOf(lab.theme), [lab.theme])
  const reduced = motionPref === 'reduced' || systemReduced
  motion.current = reduced ? 0.5 : 1
  cam.rig = rig
  cam.follow = follow
  cam.inset = embedded
    ? { top: 24, bottom: BAR_CLEAR, left: 16, right: open ? 260 : 16 }
    : phone
      ? { top: 64, bottom: 64, left: 12, right: 12 }
      : { top: 72, bottom: portrait || view.width < 1200 ? 150 : 24, left: open ? 290 : 24, right: 24 }

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
  const hits = useMemo(() => (query ? new Set(lab.catalog.items.filter((item) => matchItem(item, query)).map((item) => item.ref)) : null), [lab.catalog, query])
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
      const found = bins.filter((b) => matchItem(b.item, query))
      if (!found.length) return [{ parts: [] as Part[], label: `NO MATCHES FOR “${query.toUpperCase()}”` }]
      return Array.from({ length: Math.ceil(found.length / PAGE) }, (_, k) => ({
        parts: toParts(found.slice(k * PAGE, k * PAGE + PAGE)),
        label: `“${query.toUpperCase()}” · ${found.length} IN ${aisle.label.toUpperCase()}`,
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
    kick.current()
  }, [lab.focus.category, cam, sim])

  const deploy = (slot: SlotKey, id: string) => {
    const key = SETUP_KEY[slot]
    lab.set(key, machine(slot, id).setup as never)
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.metaKey || e.ctrlKey) return
      const cycle = <T,>(list: readonly T[], v: T) => list[(list.indexOf(v) + 1) % list.length]
      if (e.key === 'c') setRig(cycle(RIGS.map((r) => r.value), rig))
      if (e.key === 'f') setFollow(cycle(FOLLOWS.map((f) => f.value), follow))
      if (e.key === 'm') setMotionPref(motionPref === 'system' ? 'reduced' : 'system')
      if (embedded) return
      if (e.key === 'a') deploy('integrator', cycle(MACHINES.integrator.map((m) => m.id), sim.rig.integrator))
      if (e.key === 'i') deploy('transport', cycle(MACHINES.transport.map((m) => m.id), sim.rig.transport))
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  })
  useEffect(() => kick.current(), [rig, follow, reduced, view.width, view.height, open])

  /** The Loop mirrors `cam.manual` into React state, so camera handlers only touch the cam. */
  const takeCamera = () => {
    cam.manual = true
    kick.current()
  }
  const reset = () => {
    cam.orbit = { az: 0, el: 0, zoom: 1 }
    cam.manual = false
    kick.current()
  }
  const { guard, props: gestures } = useSceneGestures({
    onInteract: () => {
      cam.lastPick = sim.time
      kick.current()
    },
    onOrbit: (dx, dy) => {
      cam.orbit.az -= dx * 0.005
      cam.orbit.el = Math.min(0.9, Math.max(-0.4, cam.orbit.el + dy * 0.004))
      takeCamera()
    },
    onZoom: (factor) => {
      cam.orbit.zoom = Math.min(2.2, Math.max(0.35, cam.orbit.zoom / factor))
      takeCamera()
    },
    onLongPress: (_x, _y, e) => {
      const part = press.part
      if (!part) return
      if (lab.inspect) lab.inspect(part.item.ref)
      else tip.show(e, part.item.title, `${part.item.label} · ${part.code} · ${lab.selected.has(part.item.ref) ? 'in the build' : 'not in the build'}`, true)
    },
    onReset: reset,
  })
  const count = lab.setup.items.length
  onEvent.current = (event) => {
    play(VOICE[event.kind])
    if (event.kind !== 'seat') return
    const n = seatedCount(sim)
    announce(`${event.part.item.title} seated on the board, ${n} ${n === 1 ? 'part' : 'parts'}`)
  }
  const keys = useSceneKeys({
    lab,
    label: 'Fab machines floor',
    items: () => {
      const onPage = pages[page].parts.map((p) => p.item.ref)
      const shown = new Set(onPage)
      return [...onPage, ...lab.setup.items.filter((ref) => !shown.has(ref))]
    },
    cols: TRAY_COLS,
    onFocusItem: () => {
      play('tick')
      kick.current()
    },
  })
  const locate = (ref: string, out: Vector3) => {
    const p = sim.parts.get(ref)
    if (!p || !p.visible || p.scale < 0.3) return 0
    out.set(p.pos.x, p.pos.y - (p.size[1] * p.scale) / 2 + 0.02, p.pos.z)
    return Math.max(p.size[0], p.size[2]) * p.scale * 0.8
  }
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(lab.command)
    } catch {}
    play('copy')
    setCopied(true)
    setTimeout(() => setCopied(false), 1400)
  }
  const current = fromSetup(lab.setup)

  const search = (
    <>
      <span className="text-xs text-foreground/70">⌕</span>
      <input
        value={lab.focus.query}
        onChange={(e) => lab.setFocus({ query: e.target.value })}
        placeholder={`Search ${lab.catalog.items.length.toLocaleString()} parts`}
        aria-label="Search parts"
        className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-foreground/70"
      />
      {lab.focus.category !== 'all' && (
        <button type="button" onClick={() => lab.setFocus({ category: 'all' })} className={`shrink-0 rounded-full bg-background px-2 py-0.5 text-[11px] text-foreground/70 hover:text-foreground ${FOCUS}`}>
          {aisles[active].label} ×
        </button>
      )}
    </>
  )

  const director = (
    <div className="space-y-2.5">
      {!embedded &&
        (['integrator', 'transport', 'cell', 'storage'] as const).map((slot) => (
          <div key={slot}>
            <div className="mb-1 flex justify-between text-[10px] tracking-[0.16em] text-foreground/70">
              <span>{SLOT_LABEL[slot]}</span>
              <span className="truncate pl-2 text-right normal-case tracking-normal text-foreground/80">{machine(slot, current[slot]).model}</span>
            </div>
            <Segmented value={current[slot]} options={MACHINES[slot].map((m) => ({ value: m.id, label: m.brand }))} onChange={(id) => deploy(slot, id)} />
          </div>
        ))}
      <div>
        <div className="mb-1 flex justify-between text-[10px] tracking-[0.16em] text-foreground/70">
          <span>CAMERA</span>
          <span>C</span>
        </div>
        <Segmented value={rig} options={RIGS} onChange={(v) => { setRig(v); reset() }} />
      </div>
      <div>
        <div className="mb-1 flex justify-between text-[10px] tracking-[0.16em] text-foreground/70">
          <span>FOLLOW</span>
          <span>F</span>
        </div>
        <Segmented value={follow} options={FOLLOWS} onChange={setFollow} />
      </div>
      <div>
        <div className="mb-1 flex justify-between text-[10px] tracking-[0.16em] text-foreground/70">
          <span>MOTION{systemReduced ? ' · OS REDUCED' : ''}</span>
          <span>M</span>
        </div>
        <Segmented value={motionPref} options={MOTIONS} onChange={setMotionPref} />
      </div>
      <button
        type="button"
        aria-pressed={!muted}
        onClick={() => setMuted(!muted)}
        className="flex w-full items-center justify-between rounded-lg border border-border px-2 py-1 text-[10px] tracking-[0.16em] text-foreground/70 hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent"
        data-sound-toggle
      >
        <span>SOUND</span>
        <span className={muted ? '' : 'text-accent'}>{muted ? 'OFF' : 'ON'}</span>
      </button>
      <div className="rounded-lg bg-background px-2 py-1.5 font-mono text-[10px] tracking-wider">
        <div className="flex items-center justify-between gap-2">
          <div ref={hud} className="truncate text-foreground" data-hud />
          {manual && (
            <button type="button" onClick={reset} className={`shrink-0 rounded text-accent ${FOCUS}`}>
              resume
            </button>
          )}
        </div>
        <div ref={stats} className="mt-0.5 text-foreground/70" data-stats />
      </div>
      <div className="text-[10px] leading-snug text-foreground/70">
        {coarse
          ? 'Tap a part to build it, hold it for details. Tap a parked machine to deploy it. Drag to orbit, pinch to zoom, double-tap to hand the camera back.'
          : 'Click a parked machine in the hangar to deploy it. Drag to orbit, scroll to zoom, double-click to hand the camera back.'}
      </div>
    </div>
  )

  return (
    <div ref={root} className="relative h-full w-full select-none overflow-hidden" style={{ background: c.bg }} data-fab data-count={count} data-rig={rig} data-follow={follow} data-motion={reduced ? 'reduced' : 'full'} data-manual={manual ? 1 : 0}>
      <div
        {...keys.props}
        {...gestures}
        onPointerDownCapture={() => {
          press.part = null
        }}
        onPointerMove={(e) => {
          kick.current()
          gestures.onPointerMove(e)
        }}
        className={`relative h-full w-full ${sceneFocusClass}`}
      >
        <Canvas frameloop="demand" camera={{ fov: 20, near: 0.2, far: 600, position: [30, 20, 30] }} onPointerMissed={() => tip.hide()} gl={{ antialias: true, powerPreference: 'high-performance' }}>
          <Loop sim={sim} cam={cam} lab={labRef} motion={motion} hud={hud} stats={stats} root={root} onEvent={onEvent} kick={kick} focus={keys.focusRef} onFirstFrame={() => setReady(true)} onManual={setManual} />
          <Wake />
          <FocusRing focus={keys.focusRef} locate={locate} color={c.accent} />
          <Floor c={c} rig={current} ready={ready && !phone && !portrait && !embedded} />
          <Cabinet aisles={aisles} sim={sim} active={active} matches={matches} onOpen={(i) => lab.setFocus({ category: aisles[i].id })} c={c} tip={tip} guard={guard} ready={ready} text={!phone} />
          <Table
            c={c}
            count={pages[page].parts.length}
            label={pages[page].label}
            pages={pages.length}
            page={page}
            setPage={(n) => {
              play('page')
              setPage({ key: pageKey, page: n })
            }}
            tip={tip}
            guard={guard}
            ready={ready}
          />
          <Transports sim={sim} c={c} labels={ready && !phone} />
          <Cell sim={sim} lab={lab} c={c} tip={tip} guard={guard} labels={!phone} onSwap={(key) => (key === 'framework' ? lab.set('framework', lab.setup.framework === 'next' ? 'tanstack' : 'next') : lab.set('database', lab.setup.database === 'postgres' ? 'mongodb' : 'postgres'))} />
          <Storage sim={sim} c={c} tip={tip} labels={ready && !phone} deploy={(id) => deploy('storage', id)} />
          <Hangar c={c} rig={current} ready={ready && !phone} />
          {TRANSPORTS.map((id) => (
            <TransportKit key={id} id={id} sim={sim} c={c} tip={tip} deploy={(t) => deploy('transport', t)} />
          ))}
          <Integrators sim={sim} c={c} tip={tip} deploy={(id) => deploy('integrator', id)} />
          <WorkMarks sim={sim} c={c} />
          <Parts sim={sim} lab={lab} c={c} tip={tip} guard={guard} press={press} hits={hits} focus={keys.focusRef} />
        </Canvas>
      </div>

      {!sheet && (
        <div
          className={`pointer-events-auto absolute z-20 max-h-[calc(100%-96px)] overflow-y-auto rounded-2xl border border-border bg-surface/90 text-foreground shadow-lg backdrop-blur ${embedded ? 'right-3 top-3' : 'left-3 top-[72px]'} ${open ? 'w-[256px] p-3' : 'px-3 py-2'}`}
          data-director
        >
          <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className={`flex w-full items-center justify-between gap-3 rounded-md ${FOCUS}`}>
            <span className="flex items-center gap-2 text-[11px] tracking-[0.18em] text-foreground/70">
              <span className={`size-2 rounded-full ${reduced ? 'bg-muted' : 'bg-accent shadow-[0_0_8px_var(--color-accent)]'}`} />
              FAB MACHINES
            </span>
            <span className="text-xs text-foreground/70">{open ? '–' : '+'}</span>
          </button>
          {open && <div className="mt-3">{director}</div>}
        </div>
      )}
      {sheet && open && (
        <div
          className="pointer-events-auto absolute inset-x-3 z-30 max-h-[min(70%,calc(100%-136px))] overflow-y-auto rounded-2xl border border-border bg-surface/95 p-3 text-foreground shadow-lg backdrop-blur"
          style={{ bottom: 'calc(64px + env(safe-area-inset-bottom, 0px))' }}
          data-director
        >
          {director}
        </div>
      )}

      {!embedded && !phone && (
        <>
          <div className="pointer-events-auto absolute bottom-4 left-4 z-20 flex w-[300px] items-center gap-2 rounded-full border border-border bg-surface/90 px-3 py-1.5 shadow-lg backdrop-blur focus-within:outline-2 focus-within:outline-accent">{search}</div>
          <div className="pointer-events-auto absolute bottom-4 right-20 z-20 w-[360px] max-w-[calc(100%-112px)] rounded-2xl border border-border bg-surface/90 p-3 shadow-lg backdrop-blur">
            <div className="flex items-center justify-between">
              <span className="text-[10px] tracking-[0.18em] text-foreground/70">WORK ORDER</span>
              <span className="rounded-md bg-background px-2 py-0.5 font-mono text-xs tabular-nums">{String(count).padStart(2, '0')} parts</span>
            </div>
            <div className="mt-2 max-h-[4.5em] overflow-hidden font-mono text-[11px] leading-[1.5] text-foreground [overflow-wrap:anywhere]">
              <span className="text-accent">$ </span>
              {lab.command}
            </div>
            <div className="mt-2.5 flex items-center gap-2">
              <button type="button" onClick={copy} className={`rounded-lg bg-accent px-3 py-1 text-xs text-accent-foreground active:scale-[0.98] ${FOCUS}`}>
                {copied ? 'Copied' : 'Copy'}
              </button>
              <button type="button" onClick={() => lab.clear()} disabled={!count} className={`rounded-lg border border-border px-2.5 py-1 text-xs text-foreground/70 hover:text-foreground disabled:opacity-40 ${FOCUS}`}>
                Clear
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
          <button type="button" onClick={copy} className={`shrink-0 rounded-full bg-accent px-3 py-2 text-xs text-accent-foreground shadow-lg active:scale-[0.98] ${FOCUS}`}>
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-label="Director" className={`shrink-0 rounded-full border border-border px-3 py-2 text-xs shadow-lg backdrop-blur ${FOCUS} ${open ? 'bg-foreground text-background' : 'bg-surface/90 text-foreground'}`}>
            Rig
          </button>
        </div>
      )}
      <div ref={tipRef} className="pointer-events-none fixed left-0 top-0 z-40 max-w-72 rounded-lg border border-border bg-surface px-2.5 py-1.5 opacity-0 shadow-lg transition-opacity">
        <div className="text-sm text-foreground" />
        <div className="text-xs text-foreground/70" />
      </div>
      <Mirror lab={lab} title="Fab machines" />
    </div>
  )
}
