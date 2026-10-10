/**
 * Fab bench: the chip board as the hero of a macro workbench shot from above.
 * A sloped parts cabinet feeds a short belt, a desktop SCARA seats each chip,
 * and bench props (magnifier lamp, multimeter, tweezers, solder) stay in
 * hairline. Zoom runs board → chip → die as one camera move; the follow cam
 * tracks a part at tabletop height and back to its drawer when it is removed.
 * Everything but a handful of hero meshes is instanced or merged, so draw
 * calls stay flat as the selection grows. The lab kit adds sound, touch
 * gestures, a phone sheet, a DOM mirror with keyboard focus, and a demand
 * frame loop.
 */
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { FocusEvent as ReactFocusEvent, KeyboardEvent as ReactKeyboardEvent, ReactNode, WheelEvent as ReactWheelEvent } from 'react'
import type { Vector3 } from 'three'

import { agents, databases, frameworks, packageManagers } from '../../../workspace/-workspace/workspace.constants'
import type { CategoryId } from '../../../workspace/-workspace/workspace.types'
import { FocusRing, Mirror, announce, useSceneKeys } from '../kit/a11y'
import { Sheet, useViewport } from '../kit/mobile'
import { FrameGovernor, PerfProbe, disposeTree, dprRange } from '../kit/perf'
import { hum, play, useSound } from '../kit/sound'
import { useSceneGestures } from '../kit/touch'
import type { Lab, MockProps } from '../lab.types'
import type { Ids } from './fab-bench/art'
import { Belt, BenchMat, Cabinet, Lamp, Props, Scara } from './fab-bench/bench'
import { AgentFlash, Board, Cpu, Memory, Power, Probe, Pulses, Traces } from './fab-bench/board'
import { CameraRig, orbitEl } from './fab-bench/camera'
import type { Director, Insets } from './fab-bench/camera'
import { clamp, palette, reducedMotion } from './fab-bench/kit'
import type { Tip } from './fab-bench/kit'
import { CAB, PKG_NAME, bandOf, createSim, inFlight, openDrawer, simBusy, specOf, step, tileWorld } from './fab-bench/model'
import type { Sim } from './fab-bench/model'
import { PartsLayer, createCam } from './fab-bench/parts'
import type { Cam } from './fab-bench/parts'

const params = new URLSearchParams(location.search)
const parts = (n: number) => `${n} ${n === 1 ? 'part' : 'parts'}`
const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'

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

/** Advances the bench and drains what happened into sound and the live region. */
function Simulator({ sim, lab }: { sim: Sim; lab: { current: Lab } }) {
  useFrame((_, dt) => {
    step(sim, lab.current, Math.min(dt, 0.1))
    for (const e of sim.events) {
      if (e.kind === 'queue') play('pick')
      else if (e.kind === 'toss') play('toss')
      else if (e.kind === 'servo') play('servo')
      else if (e.kind === 'chirp') play('chirp')
      else if (e.kind === 'zap') play('zap')
      else {
        play('seat')
        let seated = 0
        for (const p of sim.parts.values()) if (p.mode === 'seated' && lab.current.selected.has(p.item.ref)) seated++
        announce(`${e.part.item.title} seated on the board, ${parts(seated)}`)
      }
    }
    sim.events.length = 0
    hum(Math.min(1, inFlight(sim) / 3))
  })
  return null
}

/** Writes the harness's view of the bench (seated and moving counts, camera mode) onto the root every half second. */
function Stats({ sim, cam, root }: { sim: Sim; cam: Cam; root: { current: HTMLDivElement | null } }) {
  const { gl } = useThree()
  const acc = useRef({ frames: 0, t: 0 })
  useFrame((_, dt) => {
    const a = acc.current
    a.frames++
    a.t += dt
    if (a.t < 0.5 || !root.current) return
    let seated = 0, moving = 0
    for (const p of sim.parts.values()) {
      if (p.mode === 'seated') seated++
      else moving++
    }
    root.current.dataset.stats = JSON.stringify({ calls: gl.info.render.calls, fps: Math.round(a.frames / a.t), mode: cam.mode, seated, moving, drawer: sim.drawer.aisle })
    a.frames = 0
    a.t = 0
  })
  return null
}

/** Frees every geometry, material and texture still in the scene when the bench unmounts. */
function Disposer() {
  const scene = useThree((s) => s.scene)
  useLayoutEffect(() => () => disposeTree(scene), [scene])
  return null
}

function VersionWatcher({ sim, version, setVersion, cam, setManual }: { sim: Sim; version: number; setVersion: (v: number) => void; cam: Cam; setManual: (v: boolean) => void }) {
  const manual = useRef(false)
  useFrame(() => {
    if (sim.version !== version) setVersion(sim.version)
    if (cam.manual !== manual.current) {
      manual.current = cam.manual
      setManual(cam.manual)
    }
  })
  return null
}

function Seg<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: readonly { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid gap-0.5 rounded-lg border border-border p-0.5" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => {
            play('tick')
            onChange(o.value)
          }}
          className={`truncate rounded-md px-1.5 py-1 text-[11px] transition-colors focus-visible:outline-2 focus-visible:outline-accent ${o.value === value ? 'bg-accent text-accent-foreground' : 'text-muted hover:text-foreground'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

const ZOOMS = [{ value: 'board', label: 'Board' }, { value: 'chip', label: 'Chip' }, { value: 'die', label: 'Die' }] as const
const FOLLOWS = [{ value: 'off', label: 'Off' }, { value: 'macro', label: 'Macro' }] as const
const MATS = [{ value: 'cutting', label: 'Cutting mat' }, { value: 'esd', label: 'ESD mat' }, { value: 'blueprint', label: 'Blueprint' }] as const
const FINISHES = [{ value: 'hairline', label: 'Hairline' }, { value: 'fr4', label: 'FR4' }] as const

function Knob({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-[10px] tracking-[0.16em] text-muted">{title}</div>
      {children}
    </div>
  )
}

function Knobs({ director, setDirector }: { director: Director; setDirector: (d: Director) => void }) {
  return (
    <>
      <Knob title="ZOOM">
        <Seg label="Zoom" value={director.zoom} options={ZOOMS} onChange={(v) => setDirector({ ...director, zoom: v })} />
      </Knob>
      <Knob title="FOLLOW THE PART">
        <Seg label="Follow the part" value={director.follow} options={FOLLOWS} onChange={(v) => setDirector({ ...director, follow: v })} />
      </Knob>
      <Knob title="MAT">
        <Seg label="Mat" value={director.mat} options={MATS} onChange={(v) => setDirector({ ...director, mat: v })} />
      </Knob>
      <Knob title="BOARD FINISH">
        <Seg label="Board finish" value={director.finish} options={FINISHES} onChange={(v) => setDirector({ ...director, finish: v })} />
      </Knob>
    </>
  )
}

function Hud({ hud, manual, onResume }: { hud: { current: HTMLDivElement | null }; manual: boolean; onResume: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg bg-background px-2 py-1.5 font-mono text-[10px] tracking-wider">
      <div ref={hud} className="truncate text-foreground" data-hud />
      {manual && (
        <button type="button" onClick={onResume} className={`shrink-0 rounded text-accent ${focusRing}`}>
          resume
        </button>
      )}
    </div>
  )
}

function DirectorPanel({ director, setDirector, open, setOpen, hud, manual, onResume }: {
  director: Director; setDirector: (d: Director) => void; open: boolean; setOpen: (v: boolean) => void; hud: { current: HTMLDivElement | null }; manual: boolean; onResume: () => void
}) {
  return (
    <div className="pointer-events-auto absolute left-4 top-[72px] z-20 w-[228px] max-w-[calc(100%-32px)] rounded-xl border border-border bg-surface/90 text-xs shadow-lg backdrop-blur" data-director-panel>
      <button
        type="button"
        aria-expanded={open}
        aria-label={`Bench controls, ${open ? 'collapse' : 'expand'}`}
        onClick={() => {
          play('tick')
          setOpen(!open)
        }}
        className={`flex w-full items-center justify-between rounded-xl px-3 py-2 ${focusRing}`}
      >
        <span className="flex items-center gap-2 text-[11px] tracking-[0.18em] text-muted">
          <span className="size-2 rounded-full bg-[#E0482B]" />
          BENCH
        </span>
        <span className="text-muted">{open ? '–' : '+'}</span>
      </button>
      {open && (
        <div className="grid gap-2.5 px-3 pb-3">
          <Knobs director={director} setDirector={setDirector} />
          <Hud hud={hud} manual={manual} onResume={onResume} />
          <div className="text-[10px] leading-snug text-muted">
            Pull a drawer, click a part. Drag to orbit, scroll to zoom or page a drawer, double-click to reset. Keys: Tab in, arrows, Enter, I, Escape.
          </div>
        </div>
      )}
    </div>
  )
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
          <input
            value={s.name}
            aria-label="Directory name"
            onChange={(e) => lab.set('name', e.target.value)}
            className="min-w-0 rounded-md border border-border bg-background px-1.5 py-0.5 font-mono text-[11px] text-foreground outline-none focus:border-accent"
          />
        </>
      )}
      <span>U1 CPU</span>
      <Seg label="U1 CPU, framework" value={s.framework} options={frameworks} onChange={(v) => lab.set('framework', v)} />
      <span>Memory</span>
      <Seg label="Memory, database" value={s.database} options={databases} onChange={(v) => lab.set('database', v)} />
      <span>Power</span>
      <Seg label="Power, package manager" value={s.packageManager} options={packageManagers} onChange={(v) => lab.set('packageManager', v)} />
      <span>J1 probe</span>
      <Seg label="J1 probe, agent" value={s.agent} options={agents.map((a) => ({ ...a, label: a.value === 'none' ? 'none' : a.value }))} onChange={(v) => lab.set('agent', v)} />
    </div>
  )
}

function CopyButton({ lab, wide }: { lab: Lab; wide?: boolean }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(lab.command)
    } catch {}
    play('copy')
    announce('Command copied')
    setCopied(true)
    setTimeout(() => setCopied(false), 1300)
  }
  return (
    <button type="button" onClick={copy} className={`rounded-lg bg-accent px-3 py-1.5 text-xs text-accent-foreground active:scale-[0.98] ${wide ? 'flex-1' : 'shrink-0'} ${focusRing}`}>
      {copied ? 'Copied' : wide ? 'Copy command' : 'Copy'}
    </button>
  )
}

/** The call sheet, docked bottom right: one line with the count, the command and Copy; it opens upward into the full setup and the scene reframes to keep the board clear of it. */
function BomPanel({ lab, open, setOpen }: { lab: Lab; open: boolean; setOpen: (v: boolean) => void }) {
  const count = lab.selected.size
  return (
    <div className="pointer-events-auto absolute bottom-4 right-20 z-20 w-[340px] max-w-[calc(100%-112px)] rounded-xl border border-border bg-surface/90 p-3 text-xs shadow-lg backdrop-blur" data-bom={open ? 'open' : 'docked'}>
      <button
        type="button"
        aria-expanded={open}
        aria-label={`Bill of materials, ${parts(count)}, ${open ? 'collapse' : 'expand'}`}
        onClick={() => {
          play('tick')
          setOpen(!open)
        }}
        className={`flex w-full items-center justify-between rounded-md ${focusRing}`}
      >
        <span className="text-[11px] tracking-[0.18em] text-muted">BILL OF MATERIALS</span>
        <span className="flex items-center gap-2">
          <span className="rounded-md bg-background px-2 py-0.5 font-mono tabular-nums text-foreground" data-count={count}>
            {String(count).padStart(2, '0')} parts
          </span>
          <span className="w-3 text-center text-muted">{open ? '–' : '+'}</span>
        </span>
      </button>
      {open && (
        <div className="mt-2.5">
          <SetupRows lab={lab} />
        </div>
      )}
      <div className={`mt-2.5 rounded-md bg-background p-2 font-mono text-[10.5px] leading-snug [overflow-wrap:anywhere] ${open ? 'max-h-24 overflow-y-auto' : 'truncate'}`}>
        <span className="text-accent">$ </span>
        {lab.command}
      </div>
      <div className="mt-2 flex gap-1.5">
        <CopyButton lab={lab} wide />
        <button type="button" onClick={() => lab.clear()} disabled={!count} className={`rounded-lg border border-border px-3 py-1.5 text-muted hover:text-foreground disabled:opacity-40 ${focusRing}`}>
          Desolder all
        </button>
      </div>
    </div>
  )
}

function Search({ lab, aisleLabel }: { lab: Lab; aisleLabel: string | null }) {
  const categories = [...lab.catalog.kinds, ...lab.catalog.blocks]
  return (
    <div className="flex items-center gap-1.5 rounded-full border border-border bg-surface/90 py-1.5 pl-3 pr-1.5">
      <span className="text-xs text-muted" aria-hidden>
        ⌕
      </span>
      <input
        value={lab.focus.query}
        aria-label="Search parts"
        onChange={(e) => lab.setFocus({ query: e.target.value })}
        placeholder={`Search ${lab.catalog.items.length.toLocaleString()} parts`}
        className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted"
      />
      {aisleLabel ? (
        <button type="button" onClick={() => lab.setFocus({ category: 'all' })} className={`shrink-0 rounded-full bg-background px-2 py-0.5 text-[11px] text-muted hover:text-foreground ${focusRing}`}>
          {aisleLabel} ×
        </button>
      ) : (
        <select
          value={lab.focus.category}
          aria-label="Open a drawer"
          onChange={(e) => lab.setFocus({ category: e.target.value as CategoryId })}
          className="w-[96px] rounded-full bg-background px-1.5 py-0.5 text-[11px] text-muted outline-none focus-visible:outline-2 focus-visible:outline-accent"
        >
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label} · {c.count}
            </option>
          ))}
        </select>
      )}
    </div>
  )
}

function Inspector({ lab, sim, detailRef, director, setDirector, onClose, ids, phone }: {
  lab: Lab; sim: Sim; detailRef: string; director: Director; setDirector: (d: Director) => void; onClose: () => void; ids: (ref: string) => Ids; phone: boolean
}) {
  const item = lab.catalog.items.find((i) => i.ref === detailRef)
  if (!item) return null
  const spec = specOf(item)
  const id = ids(item.ref)
  const die = director.zoom === 'die'
  const seated = sim.parts.get(item.ref)?.mode === 'seated' && lab.selected.has(item.ref)
  const button = `rounded-lg px-2.5 py-1 ${focusRing}`
  return (
    <div
      role="dialog"
      aria-label={`${item.title} details`}
      className={`pointer-events-auto absolute z-30 rounded-xl border border-border bg-surface/95 p-3 text-xs shadow-lg backdrop-blur ${phone ? 'left-3 right-3 top-[64px]' : 'right-4 top-[72px] w-[280px] max-w-[calc(100%-32px)]'}`}
      data-inspector
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm text-foreground">{item.title}</div>
          <div className="font-mono text-[10.5px] text-muted">
            {id.refdes} · {id.code} · {PKG_NAME[spec.pkg]} · {item.label}
          </div>
        </div>
        <button type="button" onClick={onClose} aria-label="Close details" className={`rounded px-1 text-muted hover:text-foreground ${focusRing}`}>
          ✕
        </button>
      </div>
      <p className="mt-1.5 line-clamp-3 text-[11px] leading-snug text-muted">{item.description}</p>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {seated ? (
          <>
            <button type="button" aria-pressed={die} onClick={() => { play('tick'); setDirector({ ...director, zoom: die ? 'chip' : 'die' }) }} className={`${button} ${die ? 'bg-accent text-accent-foreground' : 'border border-border text-foreground'}`}>
              {die ? 'Re-lid the chip' : 'Decap the die'}
            </button>
            <button type="button" onClick={() => { lab.toggle(item.ref); onClose() }} className={`${button} border border-border text-muted hover:text-foreground`}>
              Desolder
            </button>
          </>
        ) : (
          <button type="button" onClick={() => { lab.toggle(item.ref); onClose() }} className={`${button} bg-accent text-accent-foreground`}>
            {lab.selected.has(item.ref) ? 'Send it back' : 'Place it'}
          </button>
        )}
        {lab.inspect && (
          <button type="button" onClick={() => lab.inspect?.(item.ref)} className={`${button} border border-border text-muted hover:text-foreground`}>
            Details
          </button>
        )}
      </div>
    </div>
  )
}

export default function FabBench({ lab }: MockProps) {
  const embedded = lab.chrome === 'embedded'
  const vp = useViewport()
  const phone = vp.phone
  const [director, setDirector] = useState<Director>(() => ({
    zoom: 'board',
    follow: reducedMotion ? 'off' : ((params.get('follow') as Director['follow']) ?? 'macro'),
    mat: (params.get('mat') as Director['mat']) ?? (lab.theme === 'dark' ? 'esd' : 'cutting'),
    finish: (params.get('finish') as Director['finish']) ?? 'hairline',
  }))
  const themeSeen = useRef(lab.theme)
  useEffect(() => {
    if (themeSeen.current === lab.theme) return
    themeSeen.current = lab.theme
    if (!params.get('mat')) setDirector((d) => ({ ...d, mat: lab.theme === 'dark' ? 'esd' : 'cutting' }))
  }, [lab.theme])
  const labRef = useRef(lab)
  labRef.current = lab
  const directorRef = useRef(director)
  directorRef.current = director
  useSound(lab)
  const ids = useMemo(() => {
    const counts: Record<string, number> = {}
    const letter = { block: 'U', component: 'R', feature: 'M' }
    const map = new Map<string, Ids>()
    for (const item of lab.catalog.items) {
      counts[item.kind] = (counts[item.kind] ?? 0) + 1
      map.set(item.ref, { refdes: `${letter[item.kind]}${counts[item.kind] + (item.kind === 'block' ? 1 : 0)}`, code: lab.warehouse.bins.get(item.ref)?.code ?? 'X00-00-0A' })
    }
    return (ref: string) => map.get(ref) ?? { refdes: 'U?', code: 'X00-00-0A' }
  }, [lab.catalog, lab.warehouse])
  const [sim] = useState(() => createSim(lab))
  const picked = useRef(false)
  useEffect(() => {
    const n = Number(params.get('pick'))
    if (!n || picked.current) return
    picked.current = true
    for (const item of lab.catalog.items.filter((i) => i.kind === 'block').slice(0, n)) lab.toggle(item.ref)
  }, [])
  const [cam] = useState(createCam)
  const [detailRef, setDetailRef] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const [manual, setManual] = useState(false)
  const [panel, setPanel] = useState(false)
  const [bom, setBom] = useState(false)
  const [sheet, setSheet] = useState(false)
  const [warm, setWarm] = useState(false)
  const [tipRef, tip] = useTip()
  const hud = useRef<HTMLDivElement>(null)
  const vignette = useRef<HTMLDivElement>(null)
  const root = useRef<HTMLDivElement>(null)
  const insets = useRef<Insets>({ top: 78, bottom: 10, left: 0, right: 0 })
  insets.current = phone
    ? { top: 64, bottom: embedded ? 124 : 68, left: 0, right: 0 }
    : { top: 78, bottom: embedded ? 124 : vp.landscape ? 112 : 168, left: panel ? 244 : 0, right: !embedded && bom ? 436 : 0 }
  cam.portrait = !vp.landscape
  cam.holdTray = phone

  useEffect(() => {
    const id = requestAnimationFrame(() => setWarm(true))
    return () => cancelAnimationFrame(id)
  }, [])

  useEffect(() => {
    const aisle = lab.focus.category === 'all' ? sim.drawer.aisle : (sim.drawerOf.get(lab.focus.category) ?? -1)
    const q = lab.focus.query.trim().toLowerCase()
    let next = aisle
    if (q) {
      const counts = sim.aisles.map((a) => a.racks.reduce((s, r) => s + r.bins.filter((b) => `${b.item.title} ${b.item.label} ${b.item.ref}`.toLowerCase().includes(q)).length, 0))
      if (lab.focus.category === 'all' && (next < 0 || counts[next] === 0)) {
        const best = counts.indexOf(Math.max(...counts))
        if (counts[best] > 0) next = best
      }
    }
    if (next !== sim.drawer.aisle && next >= 0) play('drawer')
    openDrawer(sim, next, lab.focus.query)
    setVersion(sim.version)
  }, [lab.focus.category, lab.focus.query, sim])

  const close = useCallback(() => {
    cam.focus = null
    setDetailRef(null)
    setDirector((d) => (d.zoom === 'board' ? d : { ...d, zoom: 'board' }))
  }, [cam])
  useEffect(() => {
    if (detailRef && cam.focus === detailRef && !lab.selected.has(detailRef)) close()
  }, [lab.selected, detailRef, cam, close])
  const onFocus = useCallback((ref: string) => {
    cam.focus = ref
    setDetailRef(ref)
    setDirector((d) => (d.zoom === 'board' ? { ...d, zoom: 'chip' } : d))
  }, [cam])
  const details = useCallback((ref: string) => {
    tip.hide()
    if (sim.parts.get(ref)?.mode === 'seated' && labRef.current.selected.has(ref)) onFocus(ref)
    else {
      cam.focus = null
      setDetailRef(ref)
    }
  }, [cam, onFocus, sim, tip])
  const choose = (d: Director) => {
    if (d.zoom === 'board' && director.zoom !== 'board') { cam.focus = null; setDetailRef(null) }
    setDirector(d)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !detailRef || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return
      if (e.target instanceof HTMLElement && e.target.getAttribute('role') === 'application') return
      close()
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [detailRef, close])

  const reset = () => {
    cam.manual = false
    cam.orbit.az = 0
    cam.orbit.el = 0
    cam.orbit.zoom = 1
  }
  const { guard, props: gestures } = useSceneGestures({
    onOrbit: (dx, dy) => {
      cam.orbit.az -= dx * 0.004
      cam.orbit.el = orbitEl(cam.orbit.el + dy * 0.004, cam.portrait)
      cam.manual = true
    },
    onZoom: (factor) => {
      cam.orbit.zoom = clamp(cam.orbit.zoom / factor, 0.28, 2.2)
      cam.manual = true
    },
    onLongPress: () => {
      const ref = cam.pressed ?? cam.hovered
      if (ref) details(ref)
    },
    onReset: reset,
  })
  const onWheel = (e: ReactWheelEvent) => {
    if (cam.pageDrawer) cam.pageDrawer(Math.sign(e.deltaY))
    else gestures.onWheel(e)
  }

  const trayItems = () => sim.drawer.items.map((i) => i.ref)
  const keys = useSceneKeys({
    lab,
    label: 'Fab bench',
    items: () => {
      const tray = trayItems()
      const onTray = new Set(tray)
      return [...tray, ...lab.setup.items.filter((r) => !onTray.has(r) && sim.parts.has(r))]
    },
    cols: CAB.tile.cols,
    onFocusItem: (ref) => {
      const k = sim.drawer.index.get(ref)
      if (k === undefined) return
      const row = Math.floor(k / CAB.tile.cols)
      const top = Math.round(sim.drawer.scrollTarget)
      if (row < top) sim.drawer.scrollTarget = row
      else if (row >= top + CAB.tile.rowsVisible) sim.drawer.scrollTarget = row - CAB.tile.rowsVisible + 1
      else return
      play('page')
      setVersion(++sim.version)
    },
  })
  const onSceneFocus = (e: ReactFocusEvent<HTMLElement>) => {
    if (e.target === e.currentTarget && !e.currentTarget.matches(':focus-visible')) return
    if (e.target === e.currentTarget && sim.drawer.aisle < 0) {
      const hero = sim.aisles.find((a) => a.id === 'block:hero') ?? sim.aisles[0]
      openDrawer(sim, sim.drawerOf.get(hero.id) ?? 0, lab.focus.query)
      play('drawer')
      lab.setFocus({ category: hero.id })
    }
    keys.props.onFocus(e)
  }
  const onSceneKey = (e: ReactKeyboardEvent<HTMLElement>) => {
    if (e.key === 'i' && keys.focusRef.current) details(keys.focusRef.current)
    if ((e.key === 'Enter' || e.key === ' ') && keys.focusRef.current) {
      sim.lastClickAt = sim.time
      cam.trayAt = sim.time
    }
    keys.props.onKeyDown(e)
  }
  const locate = useCallback((ref: string, out: Vector3) => {
    const k = sim.drawer.index.get(ref)
    if (k !== undefined && sim.drawer.open > 0.9) {
      if (!tileWorld(sim, k, out)) return 0
      out.y += 0.08
      return CAB.tile.pitch * 0.62
    }
    const p = sim.parts.get(ref)
    if (!p || p.mode !== 'seated') return 0
    out.copy(p.pos)
    out.y += 0.04
    return Math.max(p.spec.fw, p.spec.fd) * p.scale * 0.62 + 0.12
  }, [sim])
  const onDrawer = (aisle: number) => {
    if (aisle !== sim.drawer.aisle) return lab.setFocus({ category: sim.aisles[aisle].id })
    play('drawer')
    openDrawer(sim, -1, lab.focus.query)
    setVersion(sim.version)
    lab.setFocus({ category: 'all' })
  }
  const busy = useCallback(() => cam.moving || simBusy(sim) || Math.abs(cam.decap - cam.decapTarget) > 0.002, [cam, sim])

  const c = useMemo(() => palette(lab.theme, director.mat, director.finish), [lab.theme, director.mat, director.finish])
  const activeBand = lab.focus.category.startsWith('block:') ? bandOf(lab.focus.category) : -1
  const full = !embedded
  const aisleLabel = sim.drawer.aisle >= 0 && lab.focus.category !== 'all' ? sim.aisles[sim.drawer.aisle]?.label ?? null : null
  const meterLine = sim.drawer.aisle >= 0 ? `${sim.aisles[sim.drawer.aisle]?.label ?? ''} · ${sim.drawer.items.length}` : `${lab.catalog.items.length} in stock`
  const swap = (fn: () => void) => () => {
    play('swap')
    fn()
  }
  const cycle = {
    framework: swap(() => lab.set('framework', lab.setup.framework === 'next' ? 'tanstack' : 'next')),
    database: swap(() => lab.set('database', lab.setup.database === 'postgres' ? 'mongodb' : 'postgres')),
    pm: swap(() => lab.set('packageManager', lab.setup.packageManager === 'pnpm' ? 'npm' : lab.setup.packageManager === 'npm' ? 'bun' : 'pnpm')),
    agent: swap(() => lab.set('agent', lab.setup.agent === 'none' ? 'claude' : lab.setup.agent === 'claude' ? 'codex' : 'none')),
  }
  const count = lab.selected.size
  return (
    <div ref={root} className="relative h-full w-full select-none overflow-hidden" style={{ background: c.bg }} data-fab-bench data-bench data-count={count} data-follow={director.follow} data-motion={reducedMotion ? 'reduced' : 'full'}>
      <div
        className="peer absolute inset-0 outline-none"
        {...gestures}
        {...keys.props}
        onWheel={onWheel}
        onFocus={onSceneFocus}
        onKeyDown={onSceneKey}
        onPointerDownCapture={() => { cam.pressed = null }}
      >
        <Canvas
          dpr={dprRange()}
          gl={{ antialias: true, localClippingEnabled: true, powerPreference: 'high-performance' }}
          camera={{ fov: 22, near: 0.2, far: 400, position: [0, 40, 30] }}
          onPointerMissed={() => {
            tip.hide()
            if (detailRef && !guard.moved) close()
          }}
        >
          <Disposer />
          <FrameGovernor busy={busy} />
          <PerfProbe />
          <color attach="background" args={[c.bg]} />
          <Simulator sim={sim} lab={labRef} />
          <VersionWatcher sim={sim} version={version} setVersion={setVersion} cam={cam} setManual={setManual} />
          <Stats sim={sim} cam={cam} root={root} />
          <CameraRig sim={sim} cam={cam} director={directorRef} insets={insets} vignette={vignette} hud={hud} />
          <ambientLight intensity={c.dark ? 0.85 : 1.45} />
          <directionalLight position={[6, 18, 9]} intensity={c.dark ? 1.1 : 1.3} />
          <hemisphereLight args={[c.surface, c.bg, 0.5]} />
          <BenchMat mat={director.mat} c={c} />
          <Board lab={lab} sim={sim} c={c} activeBand={activeBand} ids={ids} version={version} />
          <Traces sim={sim} c={c} framework={lab.setup.framework} version={version} />
          <Pulses sim={sim} c={c} framework={lab.setup.framework} still={reducedMotion} />
          <Cpu key={lab.setup.framework} framework={lab.setup.framework} c={c} onClick={cycle.framework} tip={tip} guard={guard} />
          <Memory key={lab.setup.database} database={lab.setup.database} c={c} onClick={cycle.database} tip={tip} guard={guard} />
          <Power key={lab.setup.packageManager} pm={lab.setup.packageManager} c={c} onClick={cycle.pm} tip={tip} guard={guard} />
          <Probe key={lab.setup.agent} agent={lab.setup.agent} sim={sim} c={c} onClick={cycle.agent} tip={tip} guard={guard} />
          <AgentFlash sim={sim} agent={lab.setup.agent} />
          {warm && <PartsLayer sim={sim} lab={lab} c={c} cam={cam} tip={tip} ids={ids} onFocus={onFocus} version={version} guard={guard} />}
          <Cabinet sim={sim} lab={lab} c={c} cam={cam} tip={tip} version={version} guard={guard} onPage={() => { play('page'); sim.version++ }} onDrawer={onDrawer} />
          <Belt c={c} still={reducedMotion} />
          <Scara sim={sim} c={c} />
          <Lamp cam={cam} c={c} still={reducedMotion} />
          <Props count={count} line2={meterLine} c={c} />
          <FocusRing focus={keys.focusRef} locate={locate} color="#5A91AD" />
        </Canvas>
      </div>
      <div className="pointer-events-none absolute inset-0 z-10 hidden ring-2 ring-inset ring-accent peer-focus-visible:block" data-scene-ring />
      <div ref={vignette} className="pointer-events-none absolute inset-0 z-10 opacity-0" style={{ background: 'radial-gradient(ellipse 70% 62% at 50% 50%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.55) 100%)' }} />
      {!phone && <DirectorPanel director={director} setDirector={choose} open={panel} setOpen={setPanel} hud={hud} manual={manual} onResume={reset} />}
      {full && !phone && <BomPanel lab={lab} open={bom} setOpen={setBom} />}
      {full && !phone && (
        <div className="pointer-events-auto absolute bottom-4 left-4 z-20 w-[320px] max-w-[calc(100%-32px)] shadow-lg backdrop-blur">
          <Search lab={lab} aisleLabel={aisleLabel} />
        </div>
      )}
      {full && phone && (
        <Sheet
          label="Bill of materials"
          open={sheet}
          onToggle={() => {
            play('tick')
            setSheet(!sheet)
          }}
          peek={
            <>
              <span className="shrink-0 rounded-md bg-background px-2 py-0.5 font-mono text-xs tabular-nums" data-count={count}>
                {String(count).padStart(2, '0')} parts
              </span>
              <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted">
                <span className="text-accent">$ </span>
                {lab.command}
              </span>
            </>
          }
          actions={<CopyButton lab={lab} />}
        >
          <Search lab={lab} aisleLabel={aisleLabel} />
          <div className="mt-2 break-all font-mono text-[11px] leading-[1.5] text-foreground">
            <span className="text-accent">$ </span>
            {lab.command}
          </div>
          <div className="mt-3">
            <SetupRows lab={lab} />
          </div>
          <div className="mt-3 grid gap-2.5 border-t border-border pt-3 text-xs">
            <Knobs director={director} setDirector={choose} />
            <Hud hud={hud} manual={manual} onResume={reset} />
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] leading-snug text-muted">Tap a drawer, then a part to place it. Hold for details, drag to orbit, pinch to zoom, double-tap to hand the camera back.</span>
              <button type="button" onClick={() => lab.clear()} disabled={!count} className={`shrink-0 rounded-lg border border-border px-2.5 py-1 text-muted disabled:opacity-40 ${focusRing}`}>
                Desolder all
              </button>
            </div>
          </div>
        </Sheet>
      )}
      {detailRef && <Inspector lab={lab} sim={sim} detailRef={detailRef} director={director} setDirector={setDirector} onClose={close} ids={ids} phone={phone} />}
      <div ref={tipRef} className="pointer-events-none fixed left-0 top-0 z-40 w-60 max-w-[calc(100vw-16px)] rounded-lg border border-border bg-surface p-1.5 opacity-0 shadow-lg transition-opacity">
        <img alt="" className="mb-1.5 hidden aspect-[16/10] w-full rounded object-cover object-top" />
        <div data-title className="px-1 text-sm text-foreground" />
        <div data-sub className="px-1 pb-0.5 text-[11px] text-muted" />
      </div>
      <Mirror lab={lab} title="Fab bench" />
    </div>
  )
}
