import { Canvas, useFrame } from '@react-three/fiber'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { agents, databases, frameworks, packageManagers } from '../../../workspace/-workspace/workspace.constants'
import type { CategoryId } from '../../../workspace/-workspace/workspace.types'
import type { Lab, MockProps } from '../lab.types'
import { BANDS, BAND_DEPTH, PAGE, PKG_NAME, TRAY, bandOf, bandZ, createSim, debug, specOf, step, trayLayout } from './foundry/model'
import type { Sim } from './foundry/model'
import { Scene } from './foundry/scene'
import type { Cam, CameraMode, Director, Finish, Tip } from './foundry/scene'

function Simulator({ sim, labRef, directorRef }: { sim: Sim; labRef: { current: Lab }; directorRef: { current: Director } }) {
  useFrame((_, dt) => {
    for (let i = 0; i < debug.speed; i++) step(sim, labRef.current, directorRef.current.routing, Math.min(dt, 1 / 10))
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
      el.style.transform = `translate(${x}px, ${e.clientY + 14}px)`
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

function Seg<T extends string>({ value, options, onChange }: { value: T; options: readonly { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex gap-0.5 rounded-md border border-border p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`flex-1 whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] transition-colors ${o.value === value ? 'bg-accent text-accent-foreground' : 'text-muted hover:text-foreground'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

const finishes = [
  { value: 'hairline', label: 'Hairline' },
  { value: 'fr4', label: 'Green FR4' },
  { value: 'black', label: 'Matte black' },
  { value: 'ceramic', label: 'Ceramic' },
] as const
const routings = [
  { value: 'manhattan', label: 'Manhattan' },
  { value: 'diagonal', label: '45°' },
  { value: 'organic', label: 'Organic' },
] as const
const cameras = [
  { value: 'board', label: 'Board' },
  { value: 'macro', label: 'Macro' },
  { value: 'die', label: 'Die' },
] as const

function DirectorPanel({ director, setDirector }: { director: Director; setDirector: (d: Director) => void }) {
  const [open, setOpen] = useState(() => innerWidth > 640)
  return (
    <div className="pointer-events-auto absolute left-4 top-[112px] z-20 w-[248px] md:top-[72px] max-w-[calc(100%-32px)] rounded-xl border border-border bg-surface/90 text-xs shadow-lg backdrop-blur">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center justify-between px-3 py-2">
        <span className="tracking-wide text-muted">FOUNDRY · DIRECTOR</span>
        <span className="text-muted">{open ? '–' : '+'}</span>
      </button>
      {open && (
        <div className="grid gap-2 px-3 pb-3">
          <label className="grid gap-1 text-[11px] text-muted">
            Board finish
            <div className="grid grid-cols-2 gap-1">
              {finishes.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => setDirector({ ...director, finish: f.value as Finish })}
                  className={`rounded-md border px-2 py-1 text-left text-[11px] ${director.finish === f.value ? 'border-accent text-foreground' : 'border-border text-muted hover:text-foreground'}`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </label>
          <label className="grid gap-1 text-[11px] text-muted">
            Autorouter
            <Seg value={director.routing} options={routings} onChange={(v) => setDirector({ ...director, routing: v })} />
          </label>
          <label className="grid gap-1 text-[11px] text-muted">
            Camera
            <Seg value={director.camera} options={cameras} onChange={(v) => setDirector({ ...director, camera: v as CameraMode })} />
          </label>
          <button
            type="button"
            onClick={() => setDirector({ ...director, follow: !director.follow })}
            className="flex items-center justify-between rounded-md border border-border px-2 py-1 text-[11px] text-muted"
          >
            Follow cam rides each new part
            <span className={`h-3.5 w-6 rounded-full p-0.5 transition-colors ${director.follow ? 'bg-accent' : 'bg-border'}`}>
              <span className={`block size-2.5 rounded-full bg-white transition-transform ${director.follow ? 'translate-x-2.5' : ''}`} />
            </span>
          </button>
        </div>
      )}
    </div>
  )
}

function PartsPanel({ lab }: { lab: Lab }) {
  const categories = [...lab.catalog.kinds, ...lab.catalog.blocks]
  const query = lab.focus.query.trim().toLowerCase()
  const matches = useMemo(() => {
    if (!query) return { list: [], total: 0 }
    const all = lab.catalog.items.filter((item) => `${item.title} ${item.label} ${item.ref}`.toLowerCase().includes(query))
    return { list: all.slice(0, 6), total: all.length }
  }, [lab.catalog, query])
  return (
    <div className="pointer-events-auto absolute bottom-4 left-4 z-20 w-[300px] max-w-[calc(100%-32px)] rounded-xl border border-border bg-surface/90 p-2.5 text-xs shadow-lg backdrop-blur">
      <div className="flex gap-1.5">
        <input
          value={lab.focus.query}
          onChange={(e) => lab.setFocus({ query: e.target.value })}
          placeholder="Search parts…"
          className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground outline-none focus:border-accent"
        />
        <select
          value={lab.focus.category}
          onChange={(e) => lab.setFocus({ category: e.target.value as CategoryId })}
          className="w-[118px] rounded-md border border-border bg-background px-1 py-1 text-xs text-foreground outline-none"
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
          <div className="px-1 text-[10.5px] text-muted">{matches.total.toLocaleString()} matches lit in the tray</div>
          {matches.list.map((item) => {
            const on = lab.selected.has(item.ref)
            return (
              <button key={item.ref} type="button" onClick={() => lab.toggle(item.ref)} className="flex items-center justify-between gap-2 rounded-md px-1.5 py-1 text-left hover:bg-background">
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

function BomPanel({ lab }: { lab: Lab }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(lab.command)
    } catch {}
    setCopied(true)
    setTimeout(() => setCopied(false), 1300)
  }
  const s = lab.setup
  return (
    <div className="pointer-events-auto absolute right-4 top-[72px] z-20 w-[300px] max-w-[calc(100%-32px)] rounded-xl border border-border bg-surface/90 p-3 text-xs shadow-lg backdrop-blur max-md:hidden">
      <div className="flex items-center justify-between">
        <span className="tracking-wide text-muted">BILL OF MATERIALS</span>
        <span className="rounded-md bg-background px-2 py-0.5 font-mono tabular-nums" data-count={lab.selected.size}>
          {String(lab.selected.size).padStart(2, '0')} parts
        </span>
      </div>
      <div className="mt-2.5 grid grid-cols-[64px_1fr] items-center gap-x-2 gap-y-1.5 text-[11px] text-muted">
        <span>Board</span>
        <Seg value={s.target} options={[{ value: 'existing', label: 'existing' }, { value: 'new', label: 'new' }] as const} onChange={(v) => lab.set('target', v)} />
        {s.target === 'new' && (
          <>
            <span>Name</span>
            <input value={s.name} onChange={(e) => lab.set('name', e.target.value)} className="min-w-0 rounded-md border border-border bg-background px-1.5 py-0.5 font-mono text-[11px] text-foreground outline-none focus:border-accent" />
          </>
        )}
        <span>CPU</span>
        <Seg value={s.framework} options={frameworks} onChange={(v) => lab.set('framework', v)} />
        <span>Memory</span>
        <Seg value={s.database} options={databases} onChange={(v) => lab.set('database', v)} />
        <span>Power</span>
        <Seg value={s.packageManager} options={packageManagers} onChange={(v) => lab.set('packageManager', v)} />
        <span>Probe</span>
        <Seg value={s.agent} options={agents.map((a) => ({ ...a, label: a.value === 'none' ? 'none' : a.value }))} onChange={(v) => lab.set('agent', v)} />
      </div>
      <div className="mt-2.5 max-h-24 overflow-y-auto rounded-md bg-background p-2 font-mono text-[10.5px] leading-snug [overflow-wrap:anywhere]">
        <span className="text-accent">$ </span>
        {lab.command}
      </div>
      <div className="mt-2 flex gap-1.5">
        <button type="button" onClick={copy} className="flex-1 rounded-lg bg-accent px-3 py-1.5 text-accent-foreground active:scale-[0.98]">
          {copied ? 'Copied' : 'Copy command'}
        </button>
        <button type="button" onClick={() => lab.clear()} disabled={!lab.selected.size} className="rounded-lg border border-border px-3 py-1.5 text-muted hover:text-foreground disabled:opacity-40">
          Desolder all
        </button>
      </div>
    </div>
  )
}

function PhoneBar({ lab }: { lab: Lab }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="pointer-events-auto absolute inset-x-4 top-[64px] z-20 flex items-center gap-2 rounded-xl border border-border bg-surface/90 p-1.5 pl-3 text-xs shadow-lg backdrop-blur md:hidden">
      <span className="font-mono tabular-nums text-muted">{String(lab.selected.size).padStart(2, '0')} parts</span>
      <span className="min-w-0 flex-1 truncate font-mono text-[10.5px]">{lab.command}</span>
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(lab.command)
          } catch {}
          setCopied(true)
          setTimeout(() => setCopied(false), 1300)
        }}
        className="rounded-lg bg-accent px-2.5 py-1 text-accent-foreground"
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  )
}

function Inspector({ lab, focusRef, decap, onDecap, onClose, codeOf, full }: {
  lab: Lab; focusRef: string; decap: boolean; onDecap: () => void; onClose: () => void; codeOf: (ref: string) => string; full: boolean
}) {
  const item = lab.catalog.items.find((i) => i.ref === focusRef)
  if (!item) return null
  const spec = specOf(item)
  return (
    <div className={`pointer-events-auto absolute right-4 z-30 w-[280px] max-w-[calc(100%-32px)] rounded-xl border border-border bg-surface/95 p-3 text-xs shadow-lg backdrop-blur ${full ? 'bottom-20 md:bottom-4 md:right-[336px]' : 'top-[72px]'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm text-foreground">{item.title}</div>
          <div className="font-mono text-[10.5px] text-muted">
            {codeOf(item.ref)} · {PKG_NAME[spec.pkg]} · {item.label}
          </div>
        </div>
        <button type="button" onClick={onClose} className="text-muted hover:text-foreground">✕</button>
      </div>
      <p className="mt-1.5 line-clamp-3 text-[11px] leading-snug text-muted">{item.description}</p>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        <button type="button" onClick={onDecap} className={`rounded-lg px-2.5 py-1 ${decap ? 'bg-accent text-accent-foreground' : 'border border-border text-foreground'}`}>
          {decap ? 'Re-lid chip' : 'Decap the die'}
        </button>
        <button type="button" onClick={() => { lab.toggle(item.ref); onClose() }} className="rounded-lg border border-border px-2.5 py-1 text-muted hover:text-foreground">
          Desolder
        </button>
        {lab.inspect && (
          <button type="button" onClick={() => lab.inspect?.(item.ref)} className="rounded-lg border border-border px-2.5 py-1 text-muted hover:text-foreground">
            Details
          </button>
        )}
      </div>
    </div>
  )
}

function areaFor(category: CategoryId): [number, number, number, number] {
  if (category === 'feature') return [TRAY.x0, TRAY.z0, -4.3, 6.2]
  if (category === 'component') return [TRAY.x0, TRAY.z0, -1.2, 6.2]
  const b = bandOf(category)
  return [TRAY.x0, Math.min(TRAY.z0, bandZ(b)), PAGE.x1, Math.max(TRAY.z1, bandZ(b) + BAND_DEPTH)]
}

export default function Foundry({ lab }: MockProps) {
  const [director, setDirector] = useState<Director>({ finish: 'hairline', routing: 'manhattan', camera: 'board', follow: true })
  const labRef = useRef(lab)
  labRef.current = lab
  const directorRef = useRef(director)
  directorRef.current = director
  const trayItems = useMemo(() => {
    const aisles = lab.focus.category === 'all' ? lab.warehouse.aisles : lab.warehouse.aisles.filter((a) => a.id === lab.focus.category)
    return aisles.map((a) => ({ label: a.label, items: a.racks.flatMap((r) => r.bins.map((b) => b.item)) }))
  }, [lab.warehouse, lab.focus.category])
  const tray = useMemo(() => trayLayout(trayItems), [trayItems])
  const [sim] = useState(() => createSim(lab, tray, director.routing))
  useEffect(() => {
    if (sim.tray === tray) return
    sim.tray = tray
    sim.version++
  }, [sim, tray])
  const cam = useRef<Cam>({ focusRef: null, decap: false, decapRef: null, area: null, hold: false, holdUntil: 0, seenAdd: -99, hovered: null }).current
  const [focusRef, setFocusRef] = useState<string | null>(null)
  const [decap, setDecap] = useState(false)
  const [tipRef, tip] = useTip()
  const codeOf = useCallback((ref: string) => lab.warehouse.bins.get(ref)?.code ?? 'X00-00-0A', [lab.warehouse])
  const onFocus = useCallback((ref: string) => {
    cam.focusRef = ref
    cam.decap = false
    cam.hold = false
    cam.holdUntil = 0
    setFocusRef(ref)
    setDecap(false)
  }, [cam])
  const close = () => {
    cam.focusRef = null
    cam.decap = false
    cam.hold = false
    cam.holdUntil = 0
    setFocusRef(null)
    setDecap(false)
  }
  useEffect(() => {
    if (focusRef && !lab.selected.has(focusRef)) {
      cam.focusRef = null
      setFocusRef(null)
    }
  }, [lab.selected, focusRef, cam])
  useEffect(() => {
    const category = lab.focus.category
    cam.area = category === 'all' ? null : { box: areaFor(category), until: performance.now() + 6000 }
    cam.hold = false
    cam.holdUntil = 0
  }, [lab.focus.category, cam])
  const toggleDecap = () => {
    cam.decap = !cam.decap
    cam.hold = false
    cam.holdUntil = 0
    setDecap(cam.decap)
  }
  useEffect(() => {
    ;(window as unknown as { __foundry: unknown }).__foundry = { sim, labRef, focus: onFocus, decap: toggleDecap, setDirector, debug }
  })
  const activeBand = lab.focus.category.startsWith('block:') ? bandOf(lab.focus.category) : -1
  const trayLabel = lab.focus.category === 'all' ? 'all categories' : ([...lab.catalog.kinds, ...lab.catalog.blocks].find((c) => c.id === lab.focus.category)?.label ?? '')
  const full = lab.chrome === 'full'
  return (
    <div className="relative h-full w-full" data-foundry>
      <Canvas orthographic dpr={[1, 2]} camera={{ position: [30, 40, 60], zoom: 30, near: 0.1, far: 400 }} onPointerMissed={() => tip.hide()}>
        <Simulator sim={sim} labRef={labRef} directorRef={directorRef} />
        <Scene lab={lab} sim={sim} cam={cam} director={director} tip={tip} codeOf={codeOf} onFocus={onFocus} trayLabel={trayLabel} activeBand={activeBand} />
      </Canvas>
      <DirectorPanel director={director} setDirector={setDirector} />
      {full && <PartsPanel lab={lab} />}
      {full && <BomPanel lab={lab} />}
      {focusRef && (
        <Inspector
          lab={lab}
          focusRef={focusRef}
          decap={decap}
          full={full}
          codeOf={codeOf}
          onClose={close}
          onDecap={toggleDecap}
        />
      )}
      {full && <PhoneBar lab={lab} />}
      <div className={`pointer-events-none absolute bottom-4 left-1/2 hidden w-[520px] -translate-x-1/2 text-center text-[11px] leading-snug text-muted ${full ? 'lg:block' : ''}`}>
        Click tray parts to place them. Click the CPU, memory, power stage or debug probe to swap framework, database, installer or agent. Click a seated chip for pin level, then decap its die. {BANDS.length} page regions · {lab.selected.size} parts on the bill.
      </div>
      <div ref={tipRef} className="pointer-events-none fixed left-0 top-0 z-40 w-60 rounded-lg border border-border bg-surface p-1.5 opacity-0 shadow-lg transition-opacity">
        <img alt="" className="mb-1.5 hidden aspect-[16/10] w-full rounded object-cover object-top" />
        <div data-title className="px-1 text-sm text-foreground" />
        <div data-sub className="px-1 pb-0.5 text-[11px] text-muted" />
      </div>
    </div>
  )
}
