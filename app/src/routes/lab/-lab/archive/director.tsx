import { Canvas, useFrame } from '@react-three/fiber'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'

import type { Lab, MockProps } from '../lab.types'
import { CCTVRender, CameraDirector, FEEDS, createCam } from './director/camera'
import type { Follow, Rig } from './director/camera'
import { Arm, Belt, Board, Cabinet, Drone, PAGE, Parts, Table, applyPage, createSim, matchItem, step } from './director/factory'
import type { Guard, Part, Sim, Tip, WorldId } from './director/factory'
import { TileFlip, WORLDS, WorldStage, lookOf } from './director/worlds'
import type { Power, Transition } from './director/worlds'

const params = new URLSearchParams(location.search)
const DEFAULT = {
  world: (params.get('world') ?? 'blueprint') as WorldId,
  rig: (params.get('rig') ?? 'iso') as Rig,
  follow: (params.get('follow') ?? 'chase') as Follow,
}
const RIGS: readonly { value: Rig; label: string }[] = [
  { value: 'iso', label: 'Iso' },
  { value: 'crane', label: 'Crane' },
  { value: 'cctv', label: 'CCTV' },
  { value: 'trailer', label: 'Trailer' },
]
const FOLLOWS: readonly { value: Follow; label: string }[] = [
  { value: 'off', label: 'Off' },
  { value: 'chase', label: 'Chase' },
  { value: 'ride', label: 'Ride' },
]
const TAGLINES = ['IN A WORLD', 'THIS SEASON', 'ONE BLOCK', 'AGAINST ALL ODDS', 'NO COMPROMISES', 'COMING SOON', 'ONE MORE THING']

function useTip() {
  const ref = useRef<HTMLDivElement>(null)
  const api = useMemo<Tip>(() => {
    const move = (e: PointerEvent) => {
      const el = ref.current
      if (el) el.style.transform = `translate(${e.clientX + 14}px, ${e.clientY + 14}px)`
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

function Simulator({ sim, lab }: { sim: Sim; lab: { current: Lab } }) {
  useFrame((_, dt) => step(sim, lab.current, Math.min(dt, 0.1)))
  return null
}

function TransitionDriver({ tr, power, overlay, onSwap, onEnd }: {
  tr: { current: Transition & { swapped: boolean } }
  power: Power
  overlay: { current: HTMLDivElement | null }
  onSwap: () => void
  onEnd: () => void
}) {
  useFrame((_, dt) => {
    const s = tr.current
    if (!s.active) {
      power.current += (1 - power.current) * (1 - Math.exp(-dt * 8))
    } else {
      s.t += Math.min(dt, 0.1) / 2.1
      const t = s.t
      const flick = () => (Math.random() < 0.35 ? 0.15 : 1)
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

function Segmented<T extends string>({ value, options, onChange, cols }: { value: T; options: readonly { value: T; label: string }[]; onChange: (v: T) => void; cols?: number }) {
  return (
    <div className="grid gap-0.5 rounded-lg border border-border p-0.5" style={{ gridTemplateColumns: `repeat(${cols ?? options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`truncate rounded-md px-1.5 py-1 text-[11px] transition-colors ${o.value === value ? 'bg-accent text-accent-foreground' : 'text-muted hover:text-foreground'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function stamp(date: Date) {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())} ${p(date.getHours())}:${p(date.getMinutes())}:${p(date.getSeconds())}`
}

function CCTVOverlay({ dark }: { dark: boolean }) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return (
    <div className="pointer-events-none absolute inset-0 grid grid-cols-2 grid-rows-2">
      {FEEDS.map((feed, i) => (
        <div key={feed.name} className="relative border-[0.5px] border-black/70 font-mono text-[11px] tracking-wider text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.8)]">
          <div className={`absolute flex items-center gap-2 ${i < 2 ? 'top-[64px]' : 'top-3'} ${i % 2 ? 'left-3' : 'right-3 flex-row-reverse'}`}>
            <span className={`size-2 rounded-full bg-[#FF3B30] ${now.getSeconds() % 2 ? 'opacity-100' : 'opacity-30'}`} />
            <span>REC</span>
            <span className="opacity-80">{feed.name}{i === 3 ? ' · AUTO TRACK' : ''}</span>
          </div>
          <div className={`absolute bottom-3 tabular-nums opacity-90 ${i === 3 ? 'left-3' : 'right-3'}`}>{stamp(new Date(now.getTime() - i * 37))}</div>
          <div className="absolute inset-0 opacity-[0.16]" style={{ background: 'repeating-linear-gradient(0deg, #000 0 1px, transparent 1px 3px)' }} />
          <div className="absolute inset-0" style={{ background: `radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,${dark ? 0.55 : 0.35}) 100%)` }} />
        </div>
      ))}
    </div>
  )
}

export default function DirectorsCut({ lab }: MockProps) {
  const labRef = useRef(lab)
  labRef.current = lab
  const [sim] = useState(() => createSim(lab))
  const [cam] = useState(createCam)
  const [world, setWorld] = useState<WorldId>(DEFAULT.world)
  const [shown, setShown] = useState<WorldId>(DEFAULT.world)
  const [rig, setRig] = useState<Rig>(DEFAULT.rig)
  const [follow, setFollow] = useState<Follow>(DEFAULT.follow)
  const [open, setOpen] = useState(() => innerWidth > 640)
  const [manual, setManual] = useState(false)
  const [slate, setSlate] = useState<{ key: number; scene: string; label: string } | null>(null)
  const [cut, setCut] = useState<{ key: number; name: string; lens: string } | null>(null)
  const [title, setTitle] = useState<{ key: number; line: string; name: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const [tipRef, tip] = useTip()
  const guard = useRef<Guard>({ moved: false }).current
  const power = useRef<number>(1) as Power
  const overlay = useRef<HTMLDivElement>(null)
  const hud = useRef<HTMLDivElement>(null)
  const look = lookOf(shown, lab.theme)
  const tr = useRef<Transition & { swapped: boolean }>({ t: 0, from: look, to: look, active: false, swapped: false })
  const pending = useRef<WorldId>(DEFAULT.world)
  cam.rig = rig
  cam.follow = follow
  cam.world = shown

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

  const changeWorld = (next: WorldId) => {
    setWorld(next)
    pending.current = next
    const s = tr.current
    if (s.active && !s.swapped) {
      s.to = lookOf(next, lab.theme)
      return
    }
    tr.current = { t: 0, from: lookOf(shown, lab.theme), to: lookOf(next, lab.theme), active: true, swapped: false }
    const index = WORLDS.findIndex((w) => w.id === next)
    setSlate({ key: Date.now(), scene: `SCENE ${String(index + 1).padStart(2, '0')}`, label: `${WORLDS[index].scene} · ${WORLDS[index].label.toUpperCase()}` })
  }
  useEffect(() => {
    if (!title) return
    const id = setTimeout(() => setTitle(null), 2000)
    return () => clearTimeout(id)
  }, [title])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.metaKey || e.ctrlKey) return
      const cycle = <T,>(list: readonly T[], v: T) => list[(list.indexOf(v) + 1) % list.length]
      if (e.key === 'w') changeWorld(cycle(WORLDS.map((w) => w.id), world))
      if (e.key === 'c') setRig(cycle(RIGS.map((r) => r.value), rig))
      if (e.key === 'f') setFollow(cycle(FOLLOWS.map((f) => f.value), follow))
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  })

  const drag = useRef<{ x: number; y: number; id: number } | null>(null)
  const onDown = (e: ReactPointerEvent) => {
    guard.moved = false
    cam.lastPick = sim.time
    drag.current = { x: e.clientX, y: e.clientY, id: e.pointerId }
  }
  const onMove = (e: ReactPointerEvent) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId || rig === 'cctv') return
    const dx = e.clientX - d.x, dy = e.clientY - d.y
    if (!guard.moved && Math.hypot(dx, dy) < 5) return
    guard.moved = true
    d.x = e.clientX
    d.y = e.clientY
    cam.orbit.az -= dx * 0.005
    cam.orbit.el = Math.min(0.9, Math.max(-0.4, cam.orbit.el + dy * 0.004))
    if (!cam.manual) {
      cam.manual = true
      setManual(true)
    }
  }
  const onUp = () => {
    drag.current = null
  }
  const onWheel = (e: React.WheelEvent) => {
    if (rig === 'cctv') return
    cam.orbit.zoom = Math.min(2.2, Math.max(0.35, cam.orbit.zoom * Math.exp(e.deltaY * 0.0012)))
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

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(lab.command)
    } catch {}
    setCopied(true)
    setTimeout(() => setCopied(false), 1400)
  }

  const dark = lab.theme === 'dark'
  const tilt = (shown === 'island' || shown === 'desk') && rig !== 'cctv'
  const embedded = lab.chrome === 'embedded'
  const count = lab.setup.items.length

  return (
    <div className="relative h-full w-full select-none overflow-hidden" style={{ background: look.bg }} data-world={shown} data-rig={rig} data-follow={follow}>
      <div
        className="absolute inset-0"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onWheel={onWheel}
        onDoubleClick={reset}
        style={{ filter: rig === 'cctv' ? `grayscale(0.85) contrast(1.15) brightness(${dark ? 1.15 : 1.02})` : undefined }}
      >
        <Canvas
          dpr={[1, 2]}
          camera={{ fov: 20, near: 0.2, far: 600, position: [30, 20, 30] }}
          onPointerMissed={() => tip.hide()}
          onCreated={(state) => {
            ;(window as unknown as { __director: unknown }).__director = { sim, cam, lab: labRef, state, step }
            state.setEvents({
              compute: (event, s) => {
                const ev = event as PointerEvent
                const w = s.size.width, h = s.size.height
                if (cam.rig === 'cctv') {
                  const qx = ev.offsetX < w / 2 ? 0 : 1, qy = ev.offsetY < h / 2 ? 0 : 1
                  s.pointer.set(((ev.offsetX - (qx * w) / 2) / (w / 2)) * 2 - 1, -(((ev.offsetY - (qy * h) / 2) / (h / 2)) * 2 - 1))
                  s.raycaster.setFromCamera(s.pointer, cam.cctv[qy * 2 + qx])
                } else {
                  s.pointer.set((ev.offsetX / w) * 2 - 1, -(ev.offsetY / h) * 2 + 1)
                  s.raycaster.setFromCamera(s.pointer, s.camera)
                }
              },
            })
          }}
        >
          <Simulator sim={sim} lab={labRef} />
          <CameraDirector
            sim={sim}
            cam={cam}
            lab={labRef}
            hud={hud}
            onCut={(name, lens) => setCut({ key: Date.now(), name, lens })}
            onAdd={(p) => {
              setManual(false)
              if (cam.rig === 'trailer') setTitle({ key: Date.now(), line: TAGLINES[sim.addSeq % TAGLINES.length], name: p.item.title.toUpperCase() })
            }}
          />
          <TransitionDriver tr={tr} power={power} overlay={overlay} onSwap={() => setShown(pending.current)} onEnd={() => setSlate(null)} />
          <WorldStage key={shown} world={shown} c={look} theme={lab.theme} sim={sim} power={power} />
          <Cabinet aisles={aisles} active={active} matches={matches} onOpen={(i) => lab.setFocus({ category: aisles[i].id })} c={look} tip={tip} guard={guard} />
          <Table
            c={look}
            count={pages[page].parts.length}
            label={pages[page].label}
            pages={pages.length}
            page={page}
            setPage={(n) => setPage({ key: pageKey, page: n })}
            tip={tip}
            guard={guard}
          />
          <Belt c={look} />
          <Arm sim={sim} c={look} />
          <Board lab={lab} sim={sim} c={look} tip={tip} guard={guard} />
          <Parts sim={sim} lab={lab} c={look} tip={tip} guard={guard} />
          <Drone sim={sim} lab={lab} c={look} />
          <TileFlip tr={tr} />
          {rig === 'cctv' && <CCTVRender cam={cam} sim={sim} lab={labRef} />}
        </Canvas>
      </div>

      {tilt && (
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute inset-x-0 top-0 h-[34%] backdrop-blur-[5px] [mask-image:linear-gradient(to_bottom,black,transparent)]" />
          <div className="absolute inset-x-0 bottom-0 h-[30%] backdrop-blur-[5px] [mask-image:linear-gradient(to_top,black,transparent)]" />
          <div className="absolute inset-0" style={{ background: `radial-gradient(ellipse at 50% 55%, transparent 60%, rgba(0,0,0,${dark ? 0.35 : 0.12}) 100%)` }} />
        </div>
      )}
      {rig === 'cctv' && <CCTVOverlay dark={dark} />}
      {rig === 'trailer' && (
        <div className="pointer-events-none absolute inset-0">
          <motion.div initial={{ height: 0 }} animate={{ height: '9%' }} className="absolute inset-x-0 top-0 bg-black" />
          <motion.div initial={{ height: 0 }} animate={{ height: '9%' }} className="absolute inset-x-0 bottom-0 bg-black" />
          <AnimatePresence>
            {cut && (
              <motion.div
                key={cut.key}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                className="absolute bottom-[calc(9%+12px)] left-6 font-mono text-[11px] tracking-[0.2em] text-white/90 [text-shadow:0_1px_3px_rgba(0,0,0,0.7)]"
              >
                {cut.name} · {cut.lens}
              </motion.div>
            )}
          </AnimatePresence>
          <AnimatePresence>
            {title && (
              <motion.div
                key={title.key}
                initial={{ opacity: 0, scale: 1.08 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.5 }}
                className="absolute inset-x-0 top-[30%] text-center text-white [text-shadow:0_2px_24px_rgba(0,0,0,0.85)]"
              >
                <div className="text-xs tracking-[0.5em] opacity-80">{title.line}</div>
                <div className="mt-2 text-4xl font-medium tracking-[0.18em]">{title.name}</div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
      <div ref={overlay} className="pointer-events-none absolute inset-0 bg-black opacity-0" />
      <AnimatePresence>
        {slate && (
          <motion.div
            key={slate.key}
            initial={{ opacity: 0, y: 30, rotate: -4 }}
            animate={{ opacity: 1, y: 0, rotate: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ type: 'spring', stiffness: 260, damping: 22 }}
            className="pointer-events-none absolute left-1/2 top-1/2 w-[300px] -translate-x-1/2 -translate-y-1/2 font-mono text-white"
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
                <span>PAYLOAD TOOLKIT</span>
                <span>TAKE 1</span>
              </div>
              <div className="mt-2 text-2xl tracking-[0.1em]">{slate.scene}</div>
              <div className="mt-1 text-xs tracking-[0.18em] text-white/80">{slate.label}</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="pointer-events-auto absolute left-4 top-[72px] z-20 w-[248px] rounded-2xl border border-border bg-surface/90 p-3 text-foreground shadow-lg backdrop-blur" data-director>
        <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center justify-between">
          <span className="flex items-center gap-2 text-xs tracking-[0.18em] text-muted">
            <span className="size-2 rounded-full bg-[#FF3B30] shadow-[0_0_8px_#FF3B30]" />
            DIRECTOR
          </span>
          <span className="text-xs text-muted">{open ? '–' : '+'}</span>
        </button>
        {open && (
          <div className="mt-3 space-y-2.5">
            <div>
              <div className="mb-1 flex justify-between text-[10px] tracking-[0.16em] text-muted">
                <span>WORLD</span>
                <span className="opacity-70">W</span>
              </div>
              <div className="grid grid-cols-2 gap-0.5 rounded-lg border border-border p-0.5">
                {WORLDS.map((w) => (
                  <button
                    key={w.id}
                    type="button"
                    title={w.blurb}
                    onClick={() => w.id !== world && changeWorld(w.id)}
                    className={`truncate rounded-md px-1.5 py-1 text-left text-[11px] transition-colors ${w.id === world ? 'bg-accent text-accent-foreground' : 'text-muted hover:text-foreground'}`}
                  >
                    {w.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-1 flex justify-between text-[10px] tracking-[0.16em] text-muted">
                <span>CAMERA RIG</span>
                <span className="opacity-70">C</span>
              </div>
              <Segmented value={rig} options={RIGS} onChange={(v) => { setRig(v); reset() }} />
            </div>
            <div>
              <div className="mb-1 flex justify-between text-[10px] tracking-[0.16em] text-muted">
                <span>FOLLOW THE PART</span>
                <span className="opacity-70">F</span>
              </div>
              <Segmented value={follow} options={FOLLOWS} onChange={setFollow} />
            </div>
            <div className="flex items-center justify-between gap-2 rounded-lg bg-background px-2 py-1.5 font-mono text-[10px] tracking-wider">
              <div ref={hud} className="truncate text-foreground" data-hud />
              {manual && (
                <button type="button" onClick={reset} className="shrink-0 text-accent">
                  resume
                </button>
              )}
            </div>
            <div className="text-[10px] leading-snug text-muted">Drag to orbit, scroll to zoom, double-click to hand the camera back.</div>
          </div>
        )}
      </div>

      {!embedded && (
        <>
          <div className="pointer-events-auto absolute bottom-4 left-4 z-20 hidden w-[300px] items-center gap-2 sm:flex rounded-full border border-border bg-surface/90 px-3 py-1.5 shadow-lg backdrop-blur">
            <span className="text-xs text-muted">⌕</span>
            <input
              value={lab.focus.query}
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
          <div className="pointer-events-auto absolute bottom-4 left-4 right-4 z-20 rounded-2xl sm:left-auto sm:right-20 sm:w-[360px] border border-border bg-surface/90 p-3 shadow-lg backdrop-blur">
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
            <div className="mt-2.5 flex items-center gap-2">
              <Segmented
                value={lab.setup.agent}
                options={[{ value: 'none', label: 'no agent' }, { value: 'claude', label: 'claude' }, { value: 'codex', label: 'codex' }] as const}
                onChange={(v) => lab.set('agent', v)}
              />
              <button type="button" onClick={copy} className="ml-auto rounded-lg bg-accent px-3 py-1 text-xs text-accent-foreground active:scale-[0.98]">
                {copied ? 'Copied' : 'Copy'}
              </button>
              <button type="button" onClick={() => lab.clear()} disabled={!count} className="rounded-lg border border-border px-2.5 py-1 text-xs text-muted hover:text-foreground disabled:opacity-40">
                Wrap
              </button>
            </div>
          </div>
        </>
      )}
      <div ref={tipRef} className="pointer-events-none fixed left-0 top-0 z-40 max-w-72 rounded-lg border border-border bg-surface px-2.5 py-1.5 opacity-0 shadow-lg transition-opacity">
        <div className="text-sm text-foreground" />
        <div className="text-xs text-muted" />
      </div>
    </div>
  )
}
