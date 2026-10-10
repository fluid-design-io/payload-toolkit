import { Canvas, useThree } from '@react-three/fiber'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from 'react'
import { Plane, Vector3 } from 'three'

import { agents, databases, frameworks, packageManagers } from '../../../workspace/-workspace/workspace.constants'
import type { Lab, MockProps } from '../lab.types'
import {
  Arm, Belt, Bins, Board, Building, CameraRig, CloseUps, Dock, LabelProjector, Lamps, Movers, Pickers, Signs, Simulator, Welder, aislePose, fitPose, palette,
} from './fulfillment/scene'
import type { Colors, Fx, Tip } from './fulfillment/scene'
import { clamp, createSim, toLayout } from './fulfillment/sim'
import type { Layout, PickerKind, Pose, Sim } from './fulfillment/sim'

type Director = {
  open: boolean
  view: 'iso' | 'plan'
  follow: boolean
  lights: 'day' | 'night'
  picker: 'auto' | PickerKind
  fleet: 1 | 4 | 8
}

const clonePose = (p: Pose): Pose => ({ ...p, target: p.target.clone() })

function BaseRig({ sim, L, view, category, inset }: { sim: Sim; L: Layout; view: Director['view']; category: string; inset: number }) {
  const { size } = useThree()
  const first = useRef(true)
  useEffect(() => {
    const aisle = category !== 'all' ? L.byId.get(category) : undefined
    sim.base = aisle ? aislePose(aisle) : fitPose(L, size.width, size.height, size.width > 700 ? inset : 0, view === 'plan')
    sim.baseKind = aisle ? 'aisle' : view
    if (aisle) sim.follow.ref = null
    if (first.current) {
      first.current = false
      sim.cam = clonePose(sim.base)
      sim.cam.size *= 1.7
      sim.cam.az += 0.7
      sim.cam.el -= 0.15
    }
  }, [sim, L, view, category, size.width, size.height, inset])
  return null
}

function useTip() {
  const ref = useRef<HTMLDivElement>(null)
  const api = useMemo<Tip>(() => {
    const move = (e: PointerEvent) => {
      const el = ref.current
      if (!el) return
      const x = Math.min(e.clientX + 14, innerWidth - 270)
      el.style.transform = `translate(${x}px, ${e.clientY + 14}px)`
    }
    return {
      show: (e, title, sub, code, image) => {
        const el = ref.current
        if (!el) return
        el.querySelector<HTMLElement>('[data-title]')!.textContent = title
        el.querySelector<HTMLElement>('[data-sub]')!.textContent = sub
        const codeEl = el.querySelector<HTMLElement>('[data-code]')!
        codeEl.textContent = code ?? ''
        codeEl.style.display = code ? '' : 'none'
        const img = el.querySelector<HTMLImageElement>('img')!
        if (image) {
          if (img.getAttribute('src') !== image) img.src = image
          img.style.display = ''
        } else img.style.display = 'none'
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

function Seg<T extends string | number>({ value, options, onChange }: { value: T; options: readonly { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex gap-0.5 rounded-md border border-border p-0.5">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          onClick={() => onChange(o.value)}
          className={`rounded px-1.5 py-0.5 text-[11px] transition-colors ${o.value === value ? 'bg-accent text-accent-foreground' : 'text-muted hover:text-foreground'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function DirectorPanel({ d, set, lab }: { d: Director; set: (patch: Partial<Director>) => void; lab: Lab }) {
  const auto = lab.setup.agent !== 'none' ? 'drones' : 'AGVs'
  return (
    <div className="pointer-events-auto w-[248px] rounded-xl border border-border bg-surface/90 text-xs shadow-lg backdrop-blur">
      <button type="button" onClick={() => set({ open: !d.open })} className="flex w-full items-center justify-between px-3 py-2">
        <span className="flex items-center gap-2 tracking-wide text-muted">
          <span className="size-1.5 rounded-full bg-[#D9A441] shadow-[0_0_6px_#D9A441]" />
          DIRECTOR
        </span>
        <span className="text-muted">{d.open ? '–' : '+'}</span>
      </button>
      {d.open && (
        <div className="grid grid-cols-[52px_1fr] items-center gap-x-2 gap-y-1.5 px-3 pb-3 text-[11px] text-muted">
          <span>Camera</span>
          <Seg value={d.view} options={[{ value: 'iso', label: 'Iso overview' }, { value: 'plan', label: 'Floor plan' }] as const} onChange={(view) => { set({ view }); lab.setFocus({ category: 'all' }) }} />
          <span>Follow</span>
          <Seg value={d.follow ? 'on' : 'off'} options={[{ value: 'on', label: 'Ride along' }, { value: 'off', label: 'Off' }] as const} onChange={(v) => set({ follow: v === 'on' })} />
          <span>Lights</span>
          <Seg value={d.lights} options={[{ value: 'day', label: 'Day shift' }, { value: 'night', label: 'Night shift' }] as const} onChange={(lights) => set({ lights })} />
          <span>Picker</span>
          <Seg value={d.picker} options={[{ value: 'auto', label: 'Auto' }, { value: 'agv', label: 'AGV' }, { value: 'drone', label: 'Drone' }, { value: 'forklift', label: 'Forklift' }] as const} onChange={(picker) => set({ picker })} />
          <span>Fleet</span>
          <Seg value={d.fleet} options={[{ value: 1, label: '1' }, { value: 4, label: '4' }, { value: 8, label: '8' }] as const} onChange={(fleet) => set({ fleet })} />
          <span className="col-span-2 pt-1 leading-snug">
            Auto sends {auto}{lab.setup.agent !== 'none' ? ` (agent: ${lab.setup.agent})` : ''}. Drag to pan, right-drag to orbit, scroll to zoom.
          </span>
        </div>
      )}
    </div>
  )
}

function Directory({ lab, L }: { lab: Lab; L: Layout }) {
  const active = lab.focus.category
  return (
    <div className="pointer-events-auto flex max-h-[min(38vh,360px)] w-[248px] flex-col rounded-xl border border-border bg-surface/90 text-xs shadow-lg backdrop-blur">
      <div className="px-3 pt-2.5 text-[11px] tracking-wide text-muted">DIRECTORY</div>
      <input
        value={lab.focus.query}
        onChange={(e) => lab.setFocus({ query: e.target.value })}
        placeholder="Search SKU, title or pick code"
        className="mx-3 mt-2 rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground outline-none focus:border-accent"
      />
      <div className="mt-1.5 min-h-0 flex-1 overflow-y-auto px-1.5 pb-1.5">
        <button
          type="button"
          onClick={() => lab.setFocus({ category: 'all' })}
          className={`flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left ${active === 'all' ? 'bg-accent/15 text-foreground' : 'text-muted hover:text-foreground'}`}
        >
          <span className="w-6 font-mono text-[10px]">ALL</span>
          <span className="flex-1">Whole floor</span>
          <span className="font-mono text-[10px] tabular-nums">{lab.catalog.items.length.toLocaleString()}</span>
        </button>
        {L.zones.map((z) => (
          <div key={z.id}>
            <div className="px-1.5 pb-0.5 pt-1.5 text-[10px] tracking-wider text-muted">ZONE {z.id} · {z.label.toUpperCase()}</div>
            {L.aisles
              .filter((a) => a.aisle.zone === z.id)
              .map((a) => (
                <button
                  key={a.aisle.id}
                  type="button"
                  onClick={() => lab.setFocus({ category: a.aisle.id })}
                  className={`flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left ${active === a.aisle.id ? 'bg-accent/15 text-foreground' : 'text-muted hover:text-foreground'}`}
                >
                  <span className="h-3 w-1 rounded-full" style={{ background: `hsl(${a.aisle.hue}, 50%, 60%)` }} />
                  <span className="w-5 font-mono text-[10px]">{String(a.aisle.no).padStart(2, '0')}</span>
                  <span className="flex-1 truncate">{a.aisle.label}</span>
                  <span className="font-mono text-[10px] tabular-nums">{a.aisle.count}</span>
                </button>
              ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function Ticket({ lab, onShip, shipment }: { lab: Lab; onShip: () => void; shipment: number }) {
  const [copied, setCopied] = useState(false)
  const items = lab.catalog.items.filter((item) => lab.selected.has(item.ref))
  const ship = () => {
    onShip()
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }
  const row = (k: string, v: string) => (
    <div className="flex justify-between gap-3">
      <span className="text-muted">{k}</span>
      <span className="truncate text-right">{v}</span>
    </div>
  )
  const paper = palette(lab.theme, false).paper
  return (
    <div className="pointer-events-auto flex h-full min-h-0 flex-col">
      <div className="relative z-10 rounded-2xl border border-border bg-surface p-3 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`size-2 rounded-full ${copied ? 'bg-[#6BCB77]' : 'bg-accent'} shadow-[0_0_8px_currentColor]`} />
            <span className="text-xs tracking-wide text-muted">PICK TICKET</span>
          </div>
          <div className="rounded-md bg-background px-2 py-0.5 font-mono text-xs tabular-nums" data-count={items.length}>
            {String(items.length).padStart(2, '0')} picks
          </div>
        </div>
        <div className="mt-2.5 grid grid-cols-[auto_1fr] items-center gap-x-2 gap-y-1.5 text-[11px] text-muted">
          <span>Target</span>
          <Seg value={lab.setup.target} options={[{ value: 'existing', label: 'add' }, { value: 'new', label: 'init' }] as const} onChange={(v) => lab.set('target', v)} />
          <span>Installer</span>
          <Seg value={lab.setup.packageManager} options={packageManagers} onChange={(v) => lab.set('packageManager', v)} />
          <span>Agent</span>
          <Seg value={lab.setup.agent} options={[{ value: 'none', label: 'none' }, { value: 'claude', label: 'claude' }, { value: 'codex', label: 'codex' }] as const} onChange={(v) => lab.set('agent', v)} />
          {lab.setup.target === 'new' && (
            <>
              <span>Name</span>
              <input
                value={lab.setup.name}
                onChange={(e) => lab.set('name', e.target.value)}
                className="min-w-0 rounded-md border border-border bg-background px-1.5 py-0.5 font-mono text-[11px] text-foreground outline-none focus:border-accent"
              />
            </>
          )}
        </div>
        <div className="mt-3 flex gap-2">
          <button type="button" data-ship onClick={ship} className="flex-1 rounded-lg bg-accent px-3 py-1.5 text-sm text-accent-foreground active:scale-[0.98]">
            {copied ? 'Shipped, command copied' : 'Ship it'}
          </button>
          <button type="button" onClick={() => lab.clear()} disabled={!items.length} className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted hover:text-foreground disabled:opacity-40">
            Return all
          </button>
        </div>
        <div className="absolute inset-x-6 -bottom-1 h-2 rounded-full bg-foreground/80" />
      </div>
      <div className="relative -mt-1 min-h-0 flex-1 overflow-hidden px-4">
        <div className="absolute inset-x-4 top-0 max-h-full overflow-y-auto font-mono text-[11px] leading-[1.45] text-foreground">
          <div className="px-4 pb-3 pt-5 shadow-md" style={{ background: paper }}>
            <div className="text-center text-xs tracking-[0.2em]">PAYLOAD FULFILLMENT</div>
            <div className="text-center text-muted">shipment #{String(shipment).padStart(4, '0')}</div>
            <div className="my-2 border-t border-dashed border-border" />
            {row('MODE', lab.setup.target === 'new' ? `init ${lab.setup.name}` : 'add to project')}
            {row('FRAMEWORK', frameworks.find((f) => f.value === lab.setup.framework)!.label)}
            {row('DATABASE', databases.find((d) => d.value === lab.setup.database)!.label)}
            {row('INSTALLER', lab.setup.packageManager)}
            {row('AGENT', agents.find((a) => a.value === lab.setup.agent)!.label)}
            <div className="my-2 border-t border-dashed border-border" />
            <div className="flex justify-between text-muted">
              <span>PICK CODE</span>
              <span>SKU</span>
            </div>
            {items.length === 0 && <div className="py-1 text-center text-muted">click a bin to pick a part</div>}
            <AnimatePresence initial={false}>
              {items.map((item) => (
                <motion.button
                  type="button"
                  key={item.ref}
                  onClick={() => lab.toggle(item.ref)}
                  title="Return to its bin"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex w-full justify-between gap-2 overflow-hidden text-left hover:text-accent"
                >
                  <span className="shrink-0 text-accent">{lab.warehouse.bins.get(item.ref)?.code}</span>
                  <span className="truncate">{item.title}</span>
                </motion.button>
              ))}
            </AnimatePresence>
            <div className="my-2 border-t border-dashed border-border" />
            <div className="flex justify-between text-xs">
              <span>PIECES</span>
              <span>{items.length}</span>
            </div>
            <div className="my-2 border-t border-dashed border-border" />
            <motion.div key={lab.command} initial={{ backgroundColor: 'rgba(90,145,173,0.25)' }} animate={{ backgroundColor: 'rgba(90,145,173,0)' }} transition={{ duration: 1 }} className="rounded-sm [overflow-wrap:anywhere]" data-command>
              <span className="text-accent">$ </span>
              {lab.command}
            </motion.div>
            <div
              className="mx-auto mt-3 h-8 w-4/5 opacity-70"
              style={{ background: 'repeating-linear-gradient(90deg, currentColor 0 2px, transparent 2px 4px, currentColor 4px 5px, transparent 5px 8px, currentColor 8px 11px, transparent 11px 12px)' }}
            />
            <div className="mt-1 text-center text-[10px] text-muted">label printed on the outbound pallet</div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Scene({ lab, sim, labRef, L, fx, c, tip, kind, onShip }: {
  lab: Lab; sim: Sim; labRef: { current: Lab }; L: Layout; fx: Fx; c: Colors; tip: Tip; kind: PickerKind; onShip: () => void
}) {
  return (
    <>
      <color attach="background" args={[c.bg]} />
      <fog attach="fog" args={[c.bg, 260, 600]} />
      <CameraRig sim={sim} fx={fx} />
      <Simulator sim={sim} labRef={labRef} />
      <ambientLight intensity={c.night ? 0.55 : lab.theme === 'dark' ? 0.9 : 1.6} />
      <directionalLight position={[16, 30, 20]} intensity={c.night ? 0.35 : lab.theme === 'dark' ? 0.9 : 1.3} />
      <hemisphereLight args={[c.night ? '#FFD9A0' : c.surface, c.bg, c.night ? 0.25 : 0.5]} />
      <Building L={L} c={c} fx={fx} lab={lab} tip={tip} />
      <Bins sim={sim} fx={fx} c={c} lab={lab} tip={tip} />
      <CloseUps sim={sim} fx={fx} c={c} lab={lab} L={L} />
      <Signs L={L} c={c} fx={fx} sim={sim} lab={lab} />
      <Belt c={c} />
      <Arm sim={sim} c={c} />
      <Board lab={lab} sim={sim} c={c} tip={tip} />
      <Movers sim={sim} c={c} lab={lab} tip={tip} />
      <Pickers sim={sim} c={c} kind={kind} agent={lab.setup.agent} />
      <Welder sim={sim} lab={lab} c={c} />
      <Dock sim={sim} lab={lab} c={c} tip={tip} onShip={onShip} />
      <Lamps L={L} c={c} />
    </>
  )
}

export default function Fulfillment({ lab }: MockProps) {
  const L = useMemo(() => toLayout(lab.warehouse), [lab.warehouse])
  const labRef = useRef(lab)
  labRef.current = lab
  const [sim] = useState(() => createSim(lab, L))
  useEffect(() => {
    ;(window as unknown as { __fulfillment: unknown }).__fulfillment = {
      modes: () => [...sim.active].map((p) => `${p.bin.code}:${p.mode}`),
      pickers: () => sim.pickers.filter((k) => k.job).map((k) => `${k.id}:${k.job}:${k.tag}`),
      ship: () => sim.ship,
    }
  }, [sim])
  const [fx] = useState<Fx>(() => ({ near: 1, close: 0, query: null, queryVersion: 0, hover: null, clip: new Plane(new Vector3(-1, 0, 0), 1e4), cut: 1e3, label: 0 }))
  const [d, setD] = useState<Director>(() => ({ open: innerWidth > 700, view: 'iso', follow: true, lights: 'day', picker: 'auto', fleet: 4 }))
  const set = (patch: Partial<Director>) => setD((current) => ({ ...current, ...patch }))
  const [shipment, setShipment] = useState(1)
  const kind: PickerKind = d.picker === 'auto' ? (lab.setup.agent !== 'none' ? 'drone' : 'agv') : d.picker
  sim.kind = kind
  sim.fleet = d.fleet
  sim.follow.on = d.follow
  if (!d.follow) sim.follow.ref = null
  const c = palette(lab.theme, d.lights === 'night')
  const [tipRef, tip] = useTip()
  const embedded = lab.chrome === 'embedded'

  useEffect(() => {
    const q = lab.focus.query.trim().toLowerCase()
    fx.query = q
      ? new Set(
          lab.catalog.items
            .filter((item) => `${item.title} ${item.label} ${item.name} ${item.ref} ${lab.warehouse.bins.get(item.ref)?.code ?? ''}`.toLowerCase().includes(q))
            .map((item) => item.ref),
        )
      : null
    fx.queryVersion++
  }, [lab.focus.query, lab.catalog, lab.warehouse, fx])

  const onShip = async () => {
    try {
      await navigator.clipboard.writeText(lab.command)
    } catch {}
    if (sim.ship.t < 0) sim.ship.t = 0
    setTimeout(() => setShipment(sim.ship.count), 1800)
  }

  const farLabels = useRef<(HTMLDivElement | null)[]>([])
  const hits = useMemo(() => {
    const q = lab.focus.query.trim().toLowerCase()
    if (!q) return null
    return L.aisles.map((a) => a.aisle.racks.reduce((s, r) => s + r.bins.filter((b) => `${b.item.title} ${b.item.label} ${b.item.name} ${b.item.ref} ${b.code}`.toLowerCase().includes(q)).length, 0))
  }, [L, lab.focus.query])
  const drag = useRef<{ x: number; y: number; button: number; shift: boolean; moved: boolean } | null>(null)
  const takeOver = () => {
    sim.follow.ref = null
    if (sim.baseKind !== 'manual') {
      sim.base = clonePose(sim.cam)
      sim.baseKind = 'manual'
    }
  }
  const onPointerDown = (e: ReactPointerEvent) => {
    drag.current = { x: e.clientX, y: e.clientY, button: e.button, shift: e.shiftKey, moved: false }
  }
  const onPointerMove = (e: ReactPointerEvent) => {
    const g = drag.current
    if (!g || !e.buttons) return
    const dx = e.clientX - g.x, dy = e.clientY - g.y
    if (!g.moved && Math.hypot(dx, dy) < 5) return
    if (!g.moved) takeOver()
    g.moved = true
    g.x = e.clientX
    g.y = e.clientY
    const base = sim.base
    const h = (e.currentTarget as HTMLElement).clientHeight
    if (g.button === 2 || g.shift) {
      base.az -= dx * 0.006
      base.el = clamp(base.el + dy * 0.004, 0.1, 1.53)
      sim.cam.az = base.az
      sim.cam.el = base.el
      return
    }
    const wpp = (2 * sim.cam.size) / h
    const right = new Vector3(Math.cos(sim.cam.az), 0, -Math.sin(sim.cam.az))
    const fwd = new Vector3(-Math.sin(sim.cam.az), 0, -Math.cos(sim.cam.az))
    const delta = right.multiplyScalar(-dx * wpp).addScaledVector(fwd, (dy * wpp) / Math.max(Math.sin(sim.cam.el), 0.35))
    base.target.add(delta)
    sim.cam.target.add(delta)
  }
  const onWheel = (e: ReactWheelEvent) => {
    takeOver()
    sim.base.size = clamp(sim.base.size * Math.exp(e.deltaY * 0.0012), 1.6, 140)
  }

  return (
    <div className="relative h-full w-full">
      <div
        className={`absolute inset-x-0 top-0 ${embedded ? 'bottom-0' : 'bottom-[38%] md:bottom-0 md:right-[340px]'}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => { drag.current = null }}
        onWheel={onWheel}
        onContextMenu={(e) => e.preventDefault()}
        data-fulfillment
      >
        <Canvas dpr={[1, 2]} onCreated={({ gl }) => { gl.localClippingEnabled = true }} camera={{ position: [40, 40, 40], fov: 24, near: 0.1, far: 800 }} onPointerMissed={() => tip.hide()}>
          <BaseRig sim={sim} L={L} view={d.view} category={lab.focus.category} inset={embedded ? 0 : 230} />
          <LabelProjector L={L} fx={fx} els={farLabels} />
          <Scene lab={lab} sim={sim} labRef={labRef} L={L} fx={fx} c={c} tip={tip} kind={kind} onShip={onShip} />
        </Canvas>
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          {L.aisles.map((a, i) => (
            <div
              key={a.aisle.id}
              ref={(el) => { farLabels.current[i] = el }}
              onClick={() => lab.setFocus({ category: a.aisle.id })}
              className="absolute left-0 top-0 flex cursor-pointer flex-col items-center opacity-0"
            >
              <div className={`flex items-baseline gap-1 whitespace-nowrap rounded-md border bg-surface/90 px-1.5 py-0.5 shadow-sm backdrop-blur ${lab.focus.category === a.aisle.id ? 'border-accent' : 'border-border'}`}>
                <span className="font-mono text-[11px] text-foreground">{String(a.aisle.no).padStart(2, '0')}</span>
                <span className="max-w-[72px] truncate text-[10px] text-muted">{a.aisle.label}</span>
                <span className={`font-mono text-[10px] tabular-nums ${hits && hits[i] ? 'text-accent' : 'text-muted'}`}>{hits ? `${hits[i]}/` : ''}{a.aisle.count}</span>
              </div>
              <div className="h-3 w-px" style={{ background: `hsl(${a.aisle.hue}, 50%, 58%)` }} />
            </div>
          ))}
        </div>
      </div>
      <div className="pointer-events-none absolute left-3 top-16 z-20 flex flex-col gap-2">
        <DirectorPanel d={d} set={set} lab={lab} />
      </div>
      {!embedded && (
        <>
          <div className="pointer-events-none absolute bottom-4 left-3 z-20 hidden md:block">
            <Directory lab={lab} L={L} />
          </div>
          <div className="absolute bottom-2 left-2 right-2 top-[62%] md:bottom-4 md:left-auto md:right-4 md:top-20 md:w-[316px]">
            <Ticket lab={lab} onShip={onShip} shipment={shipment} />
          </div>
        </>
      )}
      <div ref={tipRef} className="pointer-events-none fixed left-0 top-0 z-40 w-64 rounded-lg border border-border bg-surface p-2 opacity-0 shadow-lg transition-opacity">
        <img alt="" className="mb-1.5 aspect-[16/9] w-full rounded object-cover object-top" style={{ display: 'none' }} />
        <div data-code className="mb-0.5 font-mono text-[11px] text-accent" />
        <div data-title className="text-sm text-foreground" />
        <div data-sub className="text-xs text-muted" />
      </div>
    </div>
  )
}
