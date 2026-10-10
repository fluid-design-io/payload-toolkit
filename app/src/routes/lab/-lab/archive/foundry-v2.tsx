/**
 * Chip foundry v2. The app board is the hero and explains the app: framework CPU, database memory,
 * package-manager power stage, agent probe, features as mezzanines, components as passives, blocks as
 * ICs placed by page region. Traces route in the gaps between rows and never under a chip; the router
 * keeps a sticky bus lane per block and rebuilds only routes whose inputs changed. The board powers on
 * with its first part, the CPU ticks render pulses down the page, a seated form sends submissions to
 * memory, and the agent probe flashes firmware into each new part. The feeder bank lays parts out by
 * pick code (bay, level, slot) with sticky section headers and labels that appear as you zoom; a
 * four-nozzle head gang-picks off the belt so bulk adds overlap. The lab kit adds sound, touch
 * gestures, a phone sheet, a DOM mirror with keyboard focus, and a demand frame loop.
 */
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react'
import type { Vector3 } from 'three'

import { agents, databases, frameworks, packageManagers } from '../../../workspace/-workspace/workspace.constants'
import type { CategoryId } from '../../../workspace/-workspace/workspace.types'
import { FocusRing, Mirror, announce, useReducedMotion, useSceneKeys } from '../kit/a11y'
import { Sheet, useViewport } from '../kit/mobile'
import { FrameGovernor, PerfProbe, dprRange } from '../kit/perf'
import { hum, play, useSound } from '../kit/sound'
import { useSceneGestures } from '../kit/touch'
import type { Lab, MockProps } from '../lab.types'
import { ACCENT, PACKAGES, PAGE, BAND_DEPTH, bandOf, bandZ, createSim, hash, lineBusy, pocket, specOf, step, trayLayout } from './foundry-v2/model'
import type { Sim } from './foundry-v2/model'
import { Scene, createCam } from './foundry-v2/scene'
import type { Cam, CameraMode, Director, Finish, Tip } from './foundry-v2/scene'
import { LABEL_POOL, LABEL_POOL_PHONE } from './foundry-v2/tray'
import type { TrayOverlay } from './foundry-v2/tray'

const parts = (n: number) => `${n} ${n === 1 ? 'part' : 'parts'}`
const ring = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'

/** Substeps so a slow frame still advances the line in real time, up to a 0.3 s catch-up. Drains the line's events into sound and the live region. */
function Simulator({ sim, labRef, directorRef, cam, root, debug }: { sim: Sim; labRef: { current: Lab }; directorRef: { current: Director }; cam: Cam; root: { current: HTMLDivElement | null }; debug: { current: HTMLDivElement | null } }) {
  const { gl } = useThree()
  const frames = useRef({ n: 0, t: 0 })
  useFrame((_, dt) => {
    const total = Math.min(dt, 0.3)
    const n = Math.max(1, Math.ceil(total / 0.05))
    for (let i = 0; i < n; i++) step(sim, labRef.current, directorRef.current.routing, total / n)
    for (const e of sim.events) {
      if (e.kind === 'queue') play('pick')
      else if (e.kind === 'toss') play('toss')
      else if (e.kind === 'servo') play('servo')
      else if (e.kind === 'chirp') play('chirp')
      else if (e.kind === 'zap') play('zap')
      else {
        play('seat')
        announce(`${e.part.item.title} seated on the board, ${parts(sim.seated)}`)
      }
    }
    sim.events.length = 0
    let held = 0
    for (const q of sim.gantry.held) if (q) held++
    hum(Math.min(1, (sim.belt.length + sim.feed.length + sim.pops + held) / 3))
    const f = frames.current
    f.n++
    f.t += dt
    if (f.t < 0.5) return
    const fps = Math.round(f.n / f.t)
    f.n = 0
    f.t = 0
    const calls = gl.info.render.calls
    if (root.current) root.current.dataset.stats = JSON.stringify({ calls, fps, seated: sim.seated, flying: sim.parts.size - sim.seated, mode: cam.mode, routes: sim.router.total, power: Number(sim.power.toFixed(2)) })
    if (debug.current && directorRef.current.debug) debug.current.textContent = `${calls} calls · ${fps} fps · ${cam.mode} · ${sim.router.total} routes · ${sim.router.built} built over ${sim.router.runs} passes · ${sim.router.rebuilt} in the last`
  })
  return null
}

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

function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: readonly { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-0.5 rounded-md border border-border p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => { play('tick'); onChange(o.value) }}
          className={`flex-1 whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] transition-colors ${ring} ${o.value === value ? 'bg-accent text-accent-foreground' : 'text-muted hover:text-foreground'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Toggle({ on, label, onChange }: { on: boolean; label: string; onChange: () => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={() => { play('tick'); onChange() }} className={`flex items-center justify-between gap-2 rounded-md border border-border px-2 py-1 text-left text-[11px] text-muted ${ring}`}>
      {label}
      <span className={`h-3.5 w-6 shrink-0 rounded-full p-0.5 transition-colors ${on ? 'bg-accent' : 'bg-border'}`}>
        <span className={`block size-2.5 rounded-full bg-white transition-transform ${on ? 'translate-x-2.5' : ''}`} />
      </span>
    </button>
  )
}

const finishes = [{ value: 'hairline', label: 'Hairline' }, { value: 'fr4', label: 'Green FR4' }] as const
const routings = [{ value: 'manhattan', label: 'Manhattan' }, { value: 'diagonal', label: '45°' }, { value: 'organic', label: 'Organic' }] as const
const cameras = [{ value: 'board', label: 'Board' }, { value: 'macro', label: 'Macro' }, { value: 'die', label: 'Die' }] as const

function Knobs({ director, setDirector, debug, reduced, help }: { director: Director; setDirector: (update: (d: Director) => Director) => void; debug: { current: HTMLDivElement | null }; reduced: boolean; help: string }) {
  return (
    <div className="grid gap-2">
      <div className="grid gap-1 text-[11px] text-muted">
        Board finish
        <Seg label="Board finish" value={director.finish} options={finishes} onChange={(v) => setDirector((d) => ({ ...d, finish: v as Finish }))} />
      </div>
      <div className="grid gap-1 text-[11px] text-muted">
        Autorouter
        <Seg label="Autorouter" value={director.routing} options={routings} onChange={(v) => setDirector((d) => ({ ...d, routing: v }))} />
      </div>
      <div className="grid gap-1 text-[11px] text-muted">
        Camera
        <Seg label="Camera" value={director.camera} options={cameras} onChange={(v) => setDirector((d) => ({ ...d, camera: v as CameraMode }))} />
      </div>
      <Toggle on={director.follow && !reduced} label={reduced ? 'Follow cam is off while motion is reduced' : 'Follow cam rides each new part'} onChange={() => setDirector((d) => ({ ...d, follow: !d.follow }))} />
      <Toggle on={director.debug} label="Router debug: channels, lanes, stats" onChange={() => setDirector((d) => ({ ...d, debug: !d.debug }))} />
      <div ref={debug} className={`font-mono text-[10.5px] text-muted ${director.debug ? '' : 'hidden'}`} />
      <p className="text-[10.5px] leading-snug text-muted">{help}</p>
    </div>
  )
}

function DirectorPanel({ children, open, setOpen }: { children: ReactNode; open: boolean; setOpen: (open: boolean) => void }) {
  return (
    <div className={`pointer-events-auto absolute left-4 top-[72px] z-20 max-w-[calc(100%-32px)] rounded-xl border border-border bg-surface/90 text-xs shadow-lg backdrop-blur ${open ? 'w-[248px]' : 'w-fit'}`}>
      <button type="button" aria-expanded={open} onClick={() => { play('tick'); setOpen(!open) }} className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 ${ring}`}>
        <span className="tracking-wide text-muted">FOUNDRY · DIRECTOR</span>
        <span className="text-muted" aria-hidden>{open ? '–' : '+'}</span>
      </button>
      {open && <div className="px-3 pb-3">{children}</div>}
    </div>
  )
}

function PartsSearch({ lab }: { lab: Lab }) {
  const categories = [...lab.catalog.kinds, ...lab.catalog.blocks]
  const query = lab.focus.query.trim().toLowerCase()
  const matches = useMemo(() => {
    if (!query) return { list: [], total: 0 }
    const all = lab.catalog.items.filter((item) => `${item.title} ${item.label} ${item.ref}`.toLowerCase().includes(query))
    return { list: all.slice(0, 6), total: all.length }
  }, [lab.catalog, query])
  return (
    <div>
      <div className="flex gap-1.5">
        <input
          value={lab.focus.query}
          aria-label="Search parts"
          onChange={(e) => lab.setFocus({ query: e.target.value })}
          placeholder="Search parts…"
          className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground outline-none focus:border-accent focus-visible:outline-2 focus-visible:outline-accent"
        />
        <select
          value={lab.focus.category}
          aria-label="Aisle"
          onChange={(e) => { play('drawer'); lab.setFocus({ category: e.target.value as CategoryId }) }}
          className="w-[118px] rounded-md border border-border bg-background px-1 py-1 text-xs text-foreground outline-none focus-visible:outline-2 focus-visible:outline-accent"
        >
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label} · {c.count}
            </option>
          ))}
        </select>
      </div>
      {query && (
        <div className="mt-2 grid gap-0.5">
          <div className="px-1 text-[10.5px] text-muted">{matches.total.toLocaleString()} matches lit in the feeder bank</div>
          {matches.list.map((item) => {
            const on = lab.selected.has(item.ref)
            return (
              <button key={item.ref} type="button" aria-pressed={on} onClick={() => lab.toggle(item.ref)} className={`flex items-center justify-between gap-2 rounded-md px-1.5 py-1 text-left hover:bg-background ${ring}`}>
                <span className="truncate">
                  {item.title} <span className="text-muted">· {item.label}</span>
                </span>
                <span className={on ? 'text-accent' : 'text-muted'}>{on ? 'on board' : '+ place'}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function useCopy(text: string) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
    } catch {}
    play('copy')
    setCopied(true)
    setTimeout(() => setCopied(false), 1300)
  }
  return [copied, copy] as const
}

function SetupRows({ lab }: { lab: Lab }) {
  const s = lab.setup
  return (
    <div className="grid grid-cols-[64px_1fr] items-center gap-x-2 gap-y-1.5 text-[11px] text-muted">
      <span>Board</span>
      <Seg label="Board" value={s.target} options={[{ value: 'existing', label: 'existing' }, { value: 'new', label: 'new' }] as const} onChange={(v) => lab.set('target', v)} />
      {s.target === 'new' && (
        <>
          <span>Name</span>
          <input value={s.name} aria-label="Directory name" onChange={(e) => lab.set('name', e.target.value)} className="min-w-0 rounded-md border border-border bg-background px-1.5 py-0.5 font-mono text-[11px] text-foreground outline-none focus:border-accent focus-visible:outline-2 focus-visible:outline-accent" />
        </>
      )}
      <span>CPU</span>
      <Seg label="CPU, framework" value={s.framework} options={frameworks} onChange={(v) => lab.set('framework', v)} />
      <span>Memory</span>
      <Seg label="Memory, database" value={s.database} options={databases} onChange={(v) => lab.set('database', v)} />
      <span>Power</span>
      <Seg label="Power, package manager" value={s.packageManager} options={packageManagers} onChange={(v) => lab.set('packageManager', v)} />
      <span>Probe</span>
      <Seg label="Probe, agent" value={s.agent} options={agents.map((a) => ({ ...a, label: a.value === 'none' ? 'none' : a.value }))} onChange={(v) => lab.set('agent', v)} />
    </div>
  )
}

function BomPanel({ lab }: { lab: Lab }) {
  const [copied, copy] = useCopy(lab.command)
  return (
    <div className="pointer-events-auto absolute right-4 top-[72px] z-20 w-[300px] max-w-[calc(100%-32px)] rounded-xl border border-border bg-surface/90 p-3 text-xs shadow-lg backdrop-blur">
      <div className="flex items-center justify-between">
        <span className="tracking-wide text-muted">BILL OF MATERIALS</span>
        <span className="rounded-md bg-background px-2 py-0.5 font-mono tabular-nums">{String(lab.selected.size).padStart(2, '0')} parts</span>
      </div>
      <div className="mt-2.5">
        <SetupRows lab={lab} />
      </div>
      <div className="mt-2.5 max-h-24 overflow-y-auto rounded-md bg-background p-2 font-mono text-[10.5px] leading-snug [overflow-wrap:anywhere]">
        <span className="text-accent">$ </span>
        {lab.command}
      </div>
      <div className="mt-2 flex gap-1.5">
        <button type="button" onClick={copy} className={`flex-1 rounded-lg bg-accent px-3 py-1.5 text-accent-foreground active:scale-[0.98] ${ring}`}>
          {copied ? 'Copied' : 'Copy command'}
        </button>
        <button type="button" onClick={() => lab.clear()} disabled={!lab.selected.size} className={`rounded-lg border border-border px-3 py-1.5 text-muted hover:text-foreground disabled:opacity-40 ${ring}`}>
          Desolder all
        </button>
      </div>
    </div>
  )
}

/** A datasheet front page for the chip under inspection, on the board or still in the feeder bank. */
function Datasheet({ lab, sim, focusRef, decap, onDecap, onClose, codeOf, place }: {
  lab: Lab; sim: Sim; focusRef: string; decap: boolean; onDecap: () => void; onClose: () => void; codeOf: (ref: string) => string; place: string
}) {
  const item = lab.catalog.items.find((i) => i.ref === focusRef)
  if (!item) return null
  const spec = specOf(item)
  const pkg = PACKAGES[spec.pkg]
  const rev = `v4.${Math.floor(hash(item.ref) * 9)}.${Math.floor(hash(item.title) * 12)}`
  const band = item.kind === 'block' ? bandOf(item.category) : -1
  const seated = sim.parts.get(item.ref)?.mode === 'seated'
  const on = lab.selected.has(item.ref)
  return (
    <div role="dialog" aria-label={`${item.title} datasheet`} data-datasheet className={`pointer-events-auto absolute z-30 rounded-xl border border-border bg-surface/95 p-3 text-xs shadow-lg backdrop-blur ${place}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[10px] tracking-wide text-muted">DATASHEET · {codeOf(item.ref)}</div>
          <div className="truncate text-sm text-foreground">{item.title}</div>
        </div>
        <button type="button" aria-label="Close datasheet" onClick={onClose} className={`rounded px-1 text-muted hover:text-foreground ${ring}`}>✕</button>
      </div>
      <dl className="mt-2 grid grid-cols-[68px_1fr] gap-x-2 gap-y-0.5 font-mono text-[10.5px]">
        <dt className="text-muted">Package</dt><dd>{pkg.name} · {pkg.pins} pins</dd>
        <dt className="text-muted">Role</dt><dd>{pkg.role}{band >= 0 ? ` · region ${String(band + 1).padStart(2, '0')}` : ''}</dd>
        <dt className="text-muted">Group</dt><dd>{item.label}</dd>
        <dt className="text-muted">Source</dt><dd className="truncate">{item.source}</dd>
        <dt className="text-muted">Marking</dt><dd>{rev} · 2641</dd>
      </dl>
      <p className="mt-1.5 line-clamp-3 text-[11px] leading-snug text-muted">{item.description}</p>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {seated ? (
          <>
            <button type="button" aria-pressed={decap} onClick={onDecap} className={`rounded-lg px-2.5 py-1 ${ring} ${decap ? 'bg-accent text-accent-foreground' : 'border border-border text-foreground'}`}>
              {decap ? 'Re-lid chip' : 'Decap the die'}
            </button>
            <button type="button" onClick={() => { lab.toggle(item.ref); onClose() }} className={`rounded-lg border border-border px-2.5 py-1 text-muted hover:text-foreground ${ring}`}>
              Desolder
            </button>
          </>
        ) : (
          <button type="button" onClick={() => { lab.toggle(item.ref); onClose() }} className={`rounded-lg bg-accent px-2.5 py-1 text-accent-foreground ${ring}`}>
            {on ? 'Send it back' : 'Place it'}
          </button>
        )}
        {lab.inspect && (
          <button type="button" onClick={() => lab.inspect?.(item.ref)} className={`rounded-lg border border-border px-2.5 py-1 text-muted hover:text-foreground ${ring}`}>
            Details
          </button>
        )}
      </div>
    </div>
  )
}

export default function FoundryV2({ lab }: MockProps) {
  const reduced = useReducedMotion()
  useSound(lab)
  const vp = useViewport()
  const embedded = lab.chrome === 'embedded'
  const compact = vp.phone || (!vp.landscape && vp.width < 900)
  const [director, setDirector] = useState<Director>({ finish: 'hairline', routing: 'manhattan', camera: 'board', follow: true, debug: false })
  const labRef = useRef(lab)
  labRef.current = lab
  const directorRef = useRef(director)
  directorRef.current = director
  const aisles = useMemo(
    () => (lab.focus.category === 'all' ? lab.warehouse.aisles : lab.warehouse.aisles.filter((a) => a.id === lab.focus.category)),
    [lab.warehouse, lab.focus.category],
  )
  const tray = useMemo(() => trayLayout(aisles, lab.scale === 'viral'), [aisles, lab.scale])
  const [sim] = useState(() => createSim(lab, tray, director.routing))
  sim.reduced = reduced
  useEffect(() => {
    if (sim.tray === tray) return
    sim.tray = tray
    sim.version++
  }, [sim, tray])
  const [cam] = useState(createCam)
  const [knobsOpen, setKnobsOpen] = useState(() => !embedded && innerWidth >= 900)
  cam.inset = embedded
    ? { left: 0, right: 0, bottom: 120 }
    : compact
      ? { left: 0, right: 0, bottom: 64 }
      : { left: knobsOpen ? 240 : 0, right: vp.width >= 900 ? 150 : 0, bottom: 40 }
  const [focusRef, setFocusRef] = useState<string | null>(null)
  const [decap, setDecap] = useState(false)
  const [sheet, setSheet] = useState(false)
  const [tipRef, tip] = useTip()
  const root = useRef<HTMLDivElement>(null)
  const debug = useRef<HTMLDivElement>(null)
  const headers = useRef<(HTMLDivElement | null)[]>([])
  const labels = useRef<(HTMLDivElement | null)[]>([])
  const pool = compact ? LABEL_POOL_PHONE : LABEL_POOL
  labels.current.length = pool
  const overlay = useMemo<TrayOverlay>(
    () => ({ headers, labels, top: compact ? 64 : 72, panel: !embedded && !compact ? { right: 284, bottom: 360 } : { right: 0, bottom: 0 } }),
    [embedded, compact],
  )
  const codeOf = useCallback((ref: string) => lab.warehouse.bins.get(ref)?.code ?? 'X00-00-0A', [lab.warehouse])
  const onFocus = useCallback((ref: string) => {
    cam.focusRef = ref
    cam.decap = false
    cam.holdUntil = 0
    setFocusRef(ref)
    setDecap(false)
  }, [cam])
  const close = useCallback(() => {
    cam.focusRef = null
    cam.decap = false
    setFocusRef(null)
    setDecap(false)
  }, [cam])
  useEffect(() => {
    if (focusRef && !lab.selected.has(focusRef) && sim.parts.get(focusRef)?.mode === 'seated') close()
  }, [lab.selected, focusRef, close, sim])
  useEffect(() => {
    const category = lab.focus.category
    if (category === 'all') cam.area = null
    else if (category.startsWith('block:')) {
      const b = bandOf(category)
      const sec = tray.sections[0]
      cam.area = { box: [sec ? sec.x0 - 0.3 : tray.box.x0, Math.min(tray.box.z0, bandZ(b)), PAGE.x1, Math.max(sec ? sec.z1 : tray.box.z1, bandZ(b) + BAND_DEPTH)], until: performance.now() + 6000 }
    } else cam.area = { box: [tray.box.x0, tray.box.z0, category === 'feature' ? -4.3 : -1.2, 6.2], until: performance.now() + 6000 }
    cam.holdUntil = 0
  }, [lab.focus.category, cam, tray])
  const toggleDecap = () => {
    cam.decap = !cam.decap
    cam.holdUntil = 0
    setDecap(cam.decap)
  }

  const { guard, props: gestures } = useSceneGestures({
    onOrbit: (dx, dy) => cam.orbit(dx, dy),
    onPan: (dx, dy) => cam.pan(dx, dy),
    onZoom: (factor, x, y) => cam.zoomAt(factor, x, y),
    onLongPress: () => {
      const ref = cam.pressed
      if (!ref) return
      tip.hide()
      onFocus(ref)
    },
    onReset: () => {
      cam.reset()
      close()
    },
  })
  const keys = useSceneKeys({
    lab,
    label: 'Chip foundry scene',
    items: () => {
      const bank = sim.tray.items.map((i) => i.ref)
      const inBank = new Set(bank)
      return [...bank, ...lab.setup.items.filter((r) => !inBank.has(r))]
    },
    cols: 4,
  })
  const onSceneKey = (e: ReactKeyboardEvent<HTMLElement>) => {
    if (e.key === 'i' && keys.focusRef.current) onFocus(keys.focusRef.current)
    if (e.key === 'Escape' && focusRef) {
      e.preventDefault()
      close()
      return
    }
    keys.props.onKeyDown(e)
  }
  const [ringed, setRinged] = useState(false)
  const locate = useCallback((ref: string, out: Vector3) => {
    const p = sim.parts.get(ref)
    if (p) {
      out.copy(p.pos)
      out.y += 0.03
      return Math.max(p.spec.fw, p.spec.fd) * p.scale * 0.75 + 0.1
    }
    const i = sim.tray.index.get(ref)
    if (i === undefined) return 0
    pocket(sim.tray, i, out)
    return sim.tray.pitch * 0.62
  }, [sim])
  const busy = useCallback(() => cam.moving || lineBusy(sim), [cam, sim])

  const [copied, copy] = useCopy(lab.command)
  const count = lab.setup.items.length
  const help = compact
    ? 'Tap an aisle to open it, then tap a part to place it. Tap a socket to swap it. Hold a part for its datasheet, drag to orbit, pinch to zoom, double-tap to hand the camera back.'
    : 'Click parts to place them, sockets to swap them, seated chips for datasheets. Drag orbits, scroll zooms, double-click resets. Tab in: arrows, Enter, I for the datasheet.'
  const knobs = <Knobs director={director} setDirector={setDirector} debug={debug} reduced={reduced} help={help} />
  const place = compact ? 'left-3 right-3 top-[64px]' : embedded ? 'right-4 top-[72px] w-[292px]' : 'bottom-4 right-[336px] w-[292px] max-lg:right-4 max-lg:top-[440px] max-lg:bottom-auto'

  return (
    <div ref={root} className="relative h-full w-full select-none overflow-hidden" data-foundry-v2 data-mock="foundry-v2" data-count={count} data-aisle={lab.focus.category}>
      <div
        className="absolute inset-0 outline-none"
        {...gestures}
        {...keys.props}
        onKeyDown={onSceneKey}
        onFocus={(e) => { keys.props.onFocus(e); if (e.target === e.currentTarget) setRinged(e.currentTarget.matches(':focus-visible')) }}
        onBlur={(e) => { keys.props.onBlur(e); if (e.target === e.currentTarget) setRinged(false) }}
      >
        <Canvas orthographic dpr={dprRange()} camera={{ position: [30, 40, 60], zoom: 30, near: 0.1, far: 400 }} onPointerMissed={() => tip.hide()}>
          <FrameGovernor busy={busy} />
          <PerfProbe />
          <Simulator sim={sim} labRef={labRef} directorRef={directorRef} cam={cam} root={root} debug={debug} />
          <Scene lab={lab} sim={sim} cam={cam} director={director} tip={tip} codeOf={codeOf} onFocus={onFocus} overlay={overlay} reduced={reduced} focusRef={focusRef} guard={guard} touch={vp.touch} />
          <FocusRing focus={keys.focusRef} locate={locate} color={ACCENT} />
        </Canvas>
      </div>
      {ringed && <div className="pointer-events-none absolute inset-0 z-10 ring-2 ring-inset ring-accent" />}
      <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden" aria-hidden>
        {tray.sections.map((sec, i) => (
          <div
            key={sec.id}
            ref={(el) => { headers.current[i] = el }}
            data-section={sec.id}
            className={`pointer-events-auto absolute left-0 top-0 flex w-fit cursor-pointer items-center gap-1.5 overflow-hidden whitespace-nowrap rounded-md border border-border/0 bg-surface/90 px-1.5 font-mono text-[10.5px] opacity-0 transition-colors data-[stuck=1]:border-border data-[stuck=1]:shadow data-[stuck=1]:backdrop-blur ${vp.touch ? 'min-h-7 py-1' : 'py-0.5'}`}
            onClick={() => { play('drawer'); lab.setFocus({ category: lab.focus.category === sec.id ? 'all' : sec.id }) }}
          >
            <span className="size-1.5 shrink-0 rounded-full" style={{ background: `hsl(${sec.hue} 45% 55%)` }} />
            <span className="truncate text-foreground">{sec.code} {sec.label.toUpperCase()}</span>
            <span className="text-muted">{sec.count.toLocaleString()}</span>
          </div>
        ))}
        {Array.from({ length: pool }, (_, i) => (
          <div key={i} ref={(el) => { labels.current[i] = el }} className="absolute left-0 top-0 line-clamp-2 rounded bg-surface/80 px-1 text-center font-mono leading-tight text-foreground opacity-0" />
        ))}
      </div>
      {!compact && <DirectorPanel open={knobsOpen} setOpen={setKnobsOpen}>{knobs}</DirectorPanel>}
      {!embedded && !compact && (
        <>
          <div className="pointer-events-auto absolute bottom-4 left-4 z-20 w-[300px] max-w-[calc(100%-32px)] rounded-xl border border-border bg-surface/90 p-2.5 text-xs shadow-lg backdrop-blur">
            <PartsSearch lab={lab} />
          </div>
          <BomPanel lab={lab} />
        </>
      )}
      {!embedded && compact && lab.focus.category !== 'all' && (
        <button type="button" onClick={() => { play('drawer'); lab.setFocus({ category: 'all' }) }} className={`pointer-events-auto absolute left-3 top-[64px] z-20 min-h-8 rounded-full border border-border bg-surface/90 px-3 text-xs text-foreground shadow backdrop-blur ${ring}`}>
          ← All aisles
        </button>
      )}
      {!embedded && compact && (
        <Sheet
          label="Bill of materials"
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
            <button type="button" onClick={copy} className={`mr-14 rounded-lg bg-accent px-3 py-1.5 text-xs text-accent-foreground active:scale-[0.98] ${ring}`}>
              {copied ? 'Copied' : 'Copy'}
            </button>
          }
        >
          <div className="grid gap-3 text-xs">
            <PartsSearch lab={lab} />
            <div className="break-all rounded-md bg-background p-2 font-mono text-[11px] leading-[1.5] text-foreground">
              <span className="text-accent">$ </span>
              {lab.command}
            </div>
            <SetupRows lab={lab} />
            <button type="button" onClick={() => lab.clear()} disabled={!count} className={`justify-self-start rounded-lg border border-border px-3 py-1.5 text-muted hover:text-foreground disabled:opacity-40 ${ring}`}>
              Desolder all
            </button>
            <div className="border-t border-border pt-3">{knobs}</div>
          </div>
        </Sheet>
      )}
      {focusRef && <Datasheet lab={lab} sim={sim} focusRef={focusRef} decap={decap} codeOf={codeOf} onClose={close} onDecap={toggleDecap} place={place} />}
      <div ref={tipRef} className="pointer-events-none fixed left-0 top-0 z-40 w-60 max-w-[calc(100vw-16px)] rounded-lg border border-border bg-surface p-1.5 opacity-0 shadow-lg transition-opacity">
        <img alt="" className="mb-1.5 hidden aspect-[16/10] w-full rounded object-cover object-top" />
        <div data-title className="px-1 text-sm text-foreground" />
        <div data-sub className="px-1 pb-0.5 text-[11px] text-muted" />
      </div>
      <Mirror lab={lab} title="Chip foundry v2" />
    </div>
  )
}
