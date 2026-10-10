import { Canvas, useFrame } from '@react-three/fiber'
import { ContactShadows } from '@react-three/drei'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Vector3 } from 'three'

import { agents, packageManagers } from '../../../workspace/-workspace/workspace.constants'
import type { CategoryId } from '../../../workspace/-workspace/workspace.types'
import type { Lab, MockProps } from '../lab.types'
import { Arm, Board, Crane, Drone, PartMesh, Shell, palette } from './logistics-town/factory'
import type { Colors, Tip } from './logistics-town/factory'
import { createSim, setTraffic, step } from './logistics-town/sim'
import type { Event, Sim } from './logistics-town/sim'
import { FACTORY, FH, toTown } from './logistics-town/town'
import type { Town } from './logistics-town/town'
import { AZ, CameraRig, Carrier, Community, Ground, Lamps, Projector, SignPosts, Sky, Traffic, Utilities, Warehouses } from './logistics-town/world'
import type { Anchors, CamRequest, Env, Highlight, Knobs } from './logistics-town/world'

function Simulator({ sim, labRef }: { sim: Sim; labRef: { current: Lab } }) {
  useFrame((_, dt) => step(sim, labRef.current, Math.min(dt, 0.25)))
  return null
}

function Moving({ sim, lab, c, tip, env }: { sim: Sim; lab: Lab; c: Colors; tip: Tip; env: Env }) {
  const [, setVersion] = useState(0)
  const seen = useRef(-1)
  useFrame(() => {
    if (seen.current !== sim.version) {
      seen.current = sim.version
      setVersion(sim.version)
    }
  })
  const followed = sim.follow
  return (
    <>
      {[...sim.parts.values()].map((p) => (
        <PartMesh key={p.ref} p={p} sim={sim} lab={lab} c={c} tip={tip} followed={p === followed && p.where !== 'board'} />
      ))}
      {sim.vehicles.map((v) => (
        <Carrier key={v.id} v={v} sim={sim} c={c} env={env} followed={!!followed && v.cargo === followed} />
      ))}
    </>
  )
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
      show: (e, title, sub, image) => {
        const el = ref.current
        if (!el) return
        el.querySelector('[data-title]')!.textContent = title
        el.querySelector('[data-sub]')!.textContent = sub
        const img = el.querySelector('img')!
        if (image) {
          if (img.getAttribute('src') !== image) img.setAttribute('src', image)
          img.style.display = 'block'
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

function Seg<T extends string>({ value, options, onChange }: { value: T; options: readonly { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-0.5 rounded-md border border-border p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
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

function Director({ knobs, setKnobs, mode, onOverview, sim }: { knobs: Knobs; setKnobs: (k: Partial<Knobs>) => void; mode: string; onOverview: () => void; sim: Sim }) {
  const [open, setOpen] = useState(() => innerWidth >= 768)
  const [flying, setFlying] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setFlying(sim.vehicles.filter((v) => v.cargo && sim.time >= v.depart).length), 300)
    return () => clearInterval(id)
  }, [sim])
  const row = (label: string, node: React.ReactNode) => (
    <>
      <span className="pt-0.5 text-muted">{label}</span>
      {node}
    </>
  )
  return (
    <div className="pointer-events-auto absolute left-3 top-[72px] z-30 w-[268px] rounded-xl border border-border bg-surface/90 text-xs shadow-lg backdrop-blur">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center justify-between px-3 py-2">
        <span className="flex items-center gap-2">
          <span className="size-1.5 rounded-full bg-accent shadow-[0_0_6px_currentColor]" />
          <span className="tracking-wide">DIRECTOR</span>
        </span>
        <span className="font-mono text-[10px] text-muted" data-cam={mode}>
          {mode} · {flying} en route {open ? '−' : '+'}
        </span>
      </button>
      {open && (
        <div className="grid grid-cols-[52px_1fr] items-start gap-x-2 gap-y-1.5 border-t border-border px-3 pb-3 pt-2">
          {row('Camera', <Seg value={knobs.rig} options={[{ value: 'tilt', label: 'Tilt-shift' }, { value: 'chase', label: 'Chase' }, { value: 'street', label: 'Street' }] as const} onChange={(rig) => setKnobs({ rig })} />)}
          {row('Follow', <Seg value={knobs.follow ? 'on' : 'off'} options={[{ value: 'on', label: 'Follow deliveries' }, { value: 'off', label: 'Off' }] as const} onChange={(v) => setKnobs({ follow: v === 'on' })} />)}
          {row('Carrier', <Seg value={knobs.carrier} options={[{ value: 'truck', label: 'Trucks' }, { value: 'drone', label: 'Cargo drones' }] as const} onChange={(carrier) => setKnobs({ carrier })} />)}
          {row('Time', <Seg value={knobs.time} options={[{ value: 'theme', label: 'Theme' }, { value: 'day', label: 'Day' }, { value: 'dusk', label: 'Dusk' }, { value: 'night', label: 'Night' }, { value: 'cycle', label: 'Cycle' }] as const} onChange={(time) => setKnobs({ time })} />)}
          {row('Traffic', <Seg value={knobs.traffic} options={[{ value: 'quiet', label: 'Quiet' }, { value: 'busy', label: 'Community' }, { value: 'rush', label: 'Rush hour' }] as const} onChange={(traffic) => setKnobs({ traffic })} />)}
          {row('Lens', <Seg value={knobs.lens ? 'on' : 'off'} options={[{ value: 'on', label: 'Miniature' }, { value: 'off', label: 'Clear' }] as const} onChange={(v) => setKnobs({ lens: v === 'on' })} />)}
          <span />
          <button type="button" onClick={onOverview} className="justify-self-start rounded-md border border-border px-2 py-0.5 text-[11px] text-muted hover:border-accent hover:text-foreground">
            Fly to overview
          </button>
        </div>
      )}
    </div>
  )
}

function Lens({ strength }: { strength: number }) {
  const band = (inner: number) => `linear-gradient(to bottom, black 0%, transparent ${inner}%, transparent ${100 - inner}%, black 100%)`
  const layer = (blur: number, inner: number) => ({
    backdropFilter: `blur(${blur}px) saturate(1.12)`,
    WebkitBackdropFilter: `blur(${blur}px) saturate(1.12)`,
    maskImage: band(inner),
    WebkitMaskImage: band(inner),
    opacity: strength,
    transition: 'opacity 700ms ease',
  })
  return (
    <>
      <div className="pointer-events-none absolute inset-0 z-10" style={layer(1.4, 34)} />
      <div className="pointer-events-none absolute inset-0 z-10" style={layer(3.6, 20)} />
    </>
  )
}

function Ticker({ sim }: { sim: Sim }) {
  const [events, setEvents] = useState<Event[]>([])
  useEffect(() => {
    let last = -1
    const id = setInterval(() => {
      const top = sim.log[sim.log.length - 1]?.id ?? 0
      if (top !== last) {
        last = top
        setEvents(sim.log.slice(-5))
      }
    }, 250)
    return () => clearInterval(id)
  }, [sim])
  const dot = { out: 'bg-accent', in: 'bg-[#F2C14E]', seat: 'bg-[#6BCB77]', back: 'bg-[#D97757]' }
  return (
    <div className="pointer-events-none absolute bottom-4 left-4 z-20 hidden w-[380px] font-mono text-[11px] leading-5 md:block">
      <div className="mb-1 text-[10px] tracking-[0.2em] text-muted">DISPATCH RADIO</div>
      {events.length === 0 && <div className="text-muted">Quiet streets. Click a bin in any warehouse to dispatch it.</div>}
      {events.map((e, i) => (
        <div key={e.id} className="flex items-center gap-2 truncate" style={{ opacity: 0.4 + (0.6 * (i + 1)) / events.length }}>
          <span className={`size-1.5 shrink-0 rounded-full ${dot[e.tone]}`} />
          <span className="text-muted">{String(Math.floor(e.t / 60)).padStart(2, '0')}:{String(Math.floor(e.t % 60)).padStart(2, '0')}</span>
          <span className="truncate text-foreground">{e.text}</span>
        </div>
      ))}
    </div>
  )
}

function Dispatch({ lab, town, view, setView }: { lab: Lab; town: Town; view: View; setView: (v: View) => void }) {
  const [copied, setCopied] = useState(false)
  const query = lab.focus.query.trim().toLowerCase()
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(lab.command)
    } catch {}
    setCopied(true)
    setTimeout(() => setCopied(false), 1300)
  }
  const list = useMemo(() => {
    if (query) return { title: 'Search results', items: town.bins.filter((b) => matches(b.item, query)).slice(0, 40).map((b) => b.item) }
    if (view.building !== null && view.floor !== null) {
      const b = town.buildings[view.building]
      return { title: `${b.name} · floor ${view.floor} ${town.floors[view.floor].label}`, items: b.bins.map((i) => town.bins[i]).filter((x) => x.floor === view.floor).map((x) => x.item) }
    }
    return { title: 'On your board', items: lab.catalog.items.filter((i) => lab.selected.has(i.ref)) }
  }, [query, view, town, lab.selected, lab.catalog])
  const total = query ? town.bins.filter((b) => matches(b.item, query)).length : list.items.length
  return (
    <div className="pointer-events-auto absolute bottom-2 left-2 right-2 z-30 flex max-h-[44%] flex-col rounded-2xl border border-border bg-surface/92 p-3 shadow-lg backdrop-blur md:bottom-4 md:left-auto md:right-4 md:top-[72px] md:max-h-none md:w-[330px]">
      <div className="flex items-center justify-between">
        <span className="text-xs tracking-wide text-muted">DISPATCH DESK</span>
        <span className="rounded-md bg-background px-2 py-0.5 font-mono text-xs tabular-nums" data-count={lab.selected.size}>
          {String(lab.selected.size).padStart(2, '0')} parts ordered
        </span>
      </div>
      <input
        value={lab.focus.query}
        onChange={(e) => lab.setFocus({ query: e.target.value })}
        placeholder={`Search ${town.bins.length.toLocaleString()} parts in ${town.buildings.length} warehouses`}
        className="mt-2 rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm outline-none placeholder:text-muted focus:border-accent"
      />
      <select
        value={lab.focus.category}
        onChange={(e) => lab.setFocus({ category: e.target.value as CategoryId })}
        className="mt-1.5 rounded-lg border border-border bg-background px-2 py-1 text-xs text-foreground outline-none"
      >
        <option value="all">All floors</option>
        {town.floors.map((f, i) => (
          <option key={f.id} value={f.id}>
            Floor {i} · {f.label} ({f.count.toLocaleString()})
          </option>
        ))}
      </select>
      {view.building !== null && (
        <div className="mt-2 flex items-center justify-between rounded-lg bg-background px-2 py-1 text-[11px]">
          <span className="truncate">
            Visiting <span className="text-foreground">{town.buildings[view.building].name}</span>
            <span className="text-muted"> · {town.buildings[view.building].count.toLocaleString()} items</span>
          </span>
          <button type="button" className="text-muted hover:text-foreground" onClick={() => setView({ building: null, floor: null })}>
            leave
          </button>
        </div>
      )}
      <div className="mt-2 flex items-baseline justify-between text-[11px]">
        <span className="text-muted">{list.title}</span>
        <span className="text-muted tabular-nums">{total > list.items.length ? `${list.items.length} of ${total}` : total}</span>
      </div>
      <div className="mt-1 min-h-[60px] flex-1 overflow-y-auto rounded-lg border border-border">
        {list.items.length === 0 && <div className="p-2 text-[11px] text-muted">Nothing here yet. Click a warehouse bin, or pull a floor out to browse it.</div>}
        {list.items.map((item) => {
          const on = lab.selected.has(item.ref)
          return (
            <button
              key={item.ref}
              type="button"
              onClick={() => lab.toggle(item.ref)}
              className="flex w-full items-center gap-2 border-b border-border px-2 py-1 text-left text-[11px] last:border-b-0 hover:bg-background"
            >
              <span className="size-2 shrink-0 rounded-sm" style={{ background: `hsl(${item.hue} 45% 62%)` }} />
              <span className="min-w-0 flex-1 truncate">{item.title}</span>
              <span className="shrink-0 truncate text-muted">{item.source === 'payload-toolkit' ? 'bundled' : item.source}</span>
              <span className={`shrink-0 rounded px-1 ${on ? 'bg-accent text-accent-foreground' : 'text-muted'}`}>{on ? 'ordered' : 'order'}</span>
            </button>
          )
        })}
      </div>
      <div className="mt-2 grid grid-cols-[auto_1fr] items-center gap-x-2 gap-y-1 text-[11px] text-muted">
        <span>Target</span>
        <Seg value={lab.setup.target} options={[{ value: 'existing', label: 'add' }, { value: 'new', label: 'init' }] as const} onChange={(v) => lab.set('target', v)} />
        {lab.setup.target === 'new' && (
          <>
            <span>Name</span>
            <input value={lab.setup.name} onChange={(e) => lab.set('name', e.target.value)} className="min-w-0 rounded-md border border-border bg-background px-1.5 py-0.5 font-mono text-[11px] text-foreground outline-none focus:border-accent" />
          </>
        )}
        <span>Installer</span>
        <Seg value={lab.setup.packageManager} options={packageManagers} onChange={(v) => lab.set('packageManager', v)} />
        <span>Crew</span>
        <Seg value={lab.setup.agent} options={agents.map((a) => ({ value: a.value, label: a.value }))} onChange={(v) => lab.set('agent', v)} />
      </div>
      <div className="mt-2 max-h-20 overflow-y-auto rounded-lg bg-background p-2 font-mono text-[10.5px] leading-snug [overflow-wrap:anywhere]">
        <span className="text-accent">$ </span>
        {lab.command}
      </div>
      <div className="mt-2 flex gap-2">
        <button type="button" onClick={copy} className="flex-1 rounded-lg bg-accent px-3 py-1.5 text-sm text-accent-foreground active:scale-[0.98]">
          {copied ? 'Copied' : 'Copy command'}
        </button>
        <button type="button" onClick={() => lab.clear()} disabled={!lab.selected.size} className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted hover:text-foreground disabled:opacity-40">
          Recall all
        </button>
      </div>
    </div>
  )
}

function Labels({ town, anchors, hl, view, onPick }: { town: Town; anchors: Anchors; hl: Highlight; view: View; onPick: (b: number, f: number | null) => void }) {
  const anchor = (key: string, pos: Vector3) => (el: HTMLElement | null) => {
    if (el) anchors.set(key, { pos, el })
    else anchors.delete(key)
  }
  const visiting = view.building !== null ? town.buildings[view.building] : null
  return (
    <div className="pointer-events-none absolute inset-0 z-[15] overflow-hidden">
      {town.buildings.map((b, i) => {
        const found = hl.matches ? b.bins.filter((k) => hl.matches!.has(k)).length : null
        const on = (found ?? 0) > 0 || view.building === i
        const dim = found === 0 || (view.building !== null && view.building !== i)
        return (
          <div key={b.source} ref={anchor(`b:${b.source}`, new Vector3(b.cx, b.floors * FH + 1.15, b.cz))} className="absolute left-0 top-0" style={{ visibility: 'hidden' }}>
            <button
              type="button"
              data-sign={b.source}
              onClick={() => onPick(i, null)}
              className={`pointer-events-auto -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md border px-2 py-1 text-left leading-tight shadow-sm transition-opacity ${on ? 'border-accent bg-surface' : 'border-border bg-surface/90'} ${dim ? 'opacity-40' : ''}`}
            >
              <div className="text-[11px] text-foreground">{b.source === 'payload-toolkit' ? 'Payload Toolkit depot' : b.name}</div>
              <div className={`text-[10px] ${found ? 'text-accent' : 'text-muted'}`}>
                {found !== null ? `${found} match${found === 1 ? '' : 'es'}` : `${b.count.toLocaleString()} item${b.count === 1 ? '' : 's'} · ${b.stocked.length} floor${b.stocked.length === 1 ? '' : 's'}`}
              </div>
            </button>
          </div>
        )
      })}
      {visiting &&
        visiting.stocked.map((f) => (
          <div key={`${visiting.source}:${f.floor}`} ref={anchor(`f:${visiting.source}:${f.floor}`, new Vector3(visiting.cx + visiting.w / 2 + 0.3, f.floor * FH + FH * 0.5, visiting.cz + visiting.d / 2))} className="absolute left-0 top-0" style={{ visibility: 'hidden' }}>
            <button
              type="button"
              onClick={() => onPick(visiting.index, view.floor === f.floor ? null : f.floor)}
              className={`pointer-events-auto -translate-y-1/2 whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] leading-tight shadow-sm ${view.floor === f.floor ? 'border-accent bg-accent text-accent-foreground' : 'border-border bg-surface/90 text-foreground hover:border-accent'}`}
            >
              <span className="mr-1 inline-block size-1.5 rounded-full" style={{ background: `hsl(${f.hue} 50% 60%)` }} />
              {f.floor} {f.category.label} <span className="opacity-60">{f.count}</span>
            </button>
          </div>
        ))}
    </div>
  )
}

const matches = (item: { title: string; label: string; ref: string }, q: string) =>
  item.title.toLowerCase().includes(q) || item.label.toLowerCase().includes(q) || item.ref.toLowerCase().includes(q)

type View = { building: number | null; floor: number | null }

function useWide() {
  const [wide, setWide] = useState(() => innerWidth >= 768)
  useEffect(() => {
    const on = () => setWide(innerWidth >= 768)
    addEventListener('resize', on)
    return () => removeEventListener('resize', on)
  }, [])
  return wide
}

export default function LogisticsTown({ lab }: MockProps) {
  const town = useMemo(() => toTown(lab.catalog), [lab.catalog])
  const labRef = useRef(lab)
  labRef.current = lab
  const [sim] = useState(() => createSim(town, lab))
  Object.assign(window, { __town: sim, __townFocus: lab.setFocus })
  const [knobs, setKnobsState] = useState<Knobs>({ rig: 'chase', follow: true, carrier: 'truck', time: 'theme', traffic: 'busy', lens: true })
  const setKnobs = (k: Partial<Knobs>) => setKnobsState((cur) => ({ ...cur, ...k }))
  sim.carrier = knobs.carrier
  const [view, setView] = useState<View>({ building: null, floor: null })
  const [env] = useState<Env>(() => ({ night: lab.theme === 'dark' ? 0.85 : 0 }))
  const [mode, setMode] = useState('pose')
  const [request, setRequest] = useState<CamRequest>({ seq: 0, kind: 'overview' })
  const ask = (r: { kind: 'overview' } | { kind: 'pose'; target: Vector3; dist: number; az: number; el: number }) => setRequest((prev) => ({ ...r, seq: prev.seq + 1 }))
  const [tipRef, tip] = useTip()
  const c = palette(lab.theme)
  const [anchors] = useState<Anchors>(() => new Map())

  useEffect(() => {
    setTraffic(sim, { quiet: 0, busy: lab.scale === 'viral' ? 40 : 20, rush: 85 }[knobs.traffic])
  }, [knobs.traffic, sim, lab.scale])

  const query = lab.focus.query.trim().toLowerCase()
  const found = useMemo(() => (query ? new Set(town.bins.filter((b) => matches(b.item, query)).map((b) => b.index)) : null), [query, town])
  const floorIndex = town.floors.findIndex((f) => f.id === lab.focus.category)
  const catFloor = lab.focus.category === 'all' || floorIndex < 0 ? null : floorIndex
  const hl: Highlight = useMemo(
    () => ({ matches: found, floor: catFloor, building: view.building, drawer: view.building !== null && view.floor !== null ? { building: view.building, floor: view.floor } : null }),
    [found, catFloor, view.building, view.floor],
  )

  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    if (view.building === null) {
      ask({ kind: 'overview' })
      return
    }
    const b = town.buildings[view.building]
    const h = b.floors * FH
    if (view.floor !== null) ask({ kind: 'pose', target: new Vector3(b.cx, view.floor * FH + 0.3, b.cz + b.d), dist: 15 + b.w * 1.1, az: 0.38, el: 0.55 })
    else ask({ kind: 'pose', target: new Vector3(b.cx, h * 0.45, b.cz + b.d / 2), dist: 12 + h * 1.5, az: 0.5, el: 0.3 })
  }, [view.building, view.floor])
  useEffect(() => {
    if (catFloor === null) {
      if (!first.current) ask({ kind: 'overview' })
      return
    }
    const stocked = town.buildings.filter((b) => b.floors > catFloor)
    const center = stocked.reduce((sum, b) => sum.add(new Vector3(b.cx, 0, b.cz)), new Vector3()).divideScalar(Math.max(1, stocked.length))
    center.y = catFloor * FH + FH / 2
    const spread = Math.max(8, ...stocked.map((b) => Math.hypot(b.cx - center.x, b.cz - center.z)))
    ask({ kind: 'pose', target: center, dist: spread * 2.6 + 14, az: AZ - 0.2, el: 0.22 })
  }, [catFloor])
  useEffect(() => {
    if (!query) return
    if (view.building !== null) setView({ building: null, floor: null })
    else ask({ kind: 'overview' })
  }, [query])

  const pick = (building: number, floor: number | null) => setView({ building, floor })
  const lensStrength = !knobs.lens ? 0 : mode === 'street' ? 0.1 : mode === 'chase' ? 0.55 : 1
  const full = lab.chrome === 'full'
  const wide = useWide()

  return (
    <div className="relative h-full w-full">
      <Canvas
        dpr={[1, 2]}
        camera={{ fov: 24, near: 0.5, far: 2400, position: [90, 80, 120] }}
        onPointerMissed={() => {
          tip.hide()
          if (view.building !== null) setView({ building: null, floor: null })
        }}
        className="absolute inset-0"
      >
        <Sky knobs={knobs} c={c} env={env} />
        <CameraRig sim={sim} knobs={knobs} request={request} lab={lab} onMode={setMode} inset={full && wide ? 350 : 0} />
        <Simulator sim={sim} labRef={labRef} />
        <Ground c={c} />
        <Warehouses town={town} sim={sim} lab={lab} c={c} tip={tip} hl={hl} env={env} onPick={pick} />
        <SignPosts town={town} c={c} hl={hl} />
        <Projector anchors={anchors} />
        <Community town={town} c={c} />
        <Utilities lab={lab} c={c} tip={tip} />
        <Lamps env={env} />
        <Traffic sim={sim} c={c} env={env} />
        <group position={[FACTORY.x, 0, FACTORY.z]} scale={FACTORY.s}>
          <Shell c={c} lab={lab} />
          <Arm sim={sim} c={c} />
          <Board lab={lab} sim={sim} c={c} tip={tip} />
          <Drone sim={sim} lab={lab} c={c} />
          <Crane sim={sim} lab={lab} c={c} tip={tip} />
        </group>
        <Moving sim={sim} lab={lab} c={c} tip={tip} env={env} />
        <ContactShadows position={[0, 0.09, 0]} scale={[100, 66]} resolution={1024} blur={1.6} far={14} opacity={lab.theme === 'dark' ? 0.55 : 0.32} frames={1} />
      </Canvas>
      <Lens strength={lensStrength} />
      <Labels town={town} anchors={anchors} hl={hl} view={view} onPick={pick} />
      <Director knobs={knobs} setKnobs={setKnobs} mode={mode} sim={sim} onOverview={() => { setView({ building: null, floor: null }); ask({ kind: 'overview' }) }} />
      {full && <Dispatch lab={lab} town={town} view={view} setView={setView} />}
      {full && <Ticker sim={sim} />}
      <div ref={tipRef} className="pointer-events-none fixed left-0 top-0 z-50 w-64 rounded-lg border border-border bg-surface px-2.5 py-1.5 opacity-0 shadow-lg transition-opacity">
        <img alt="" className="mb-1.5 hidden aspect-[16/10] w-full rounded object-cover object-top" />
        <div data-title className="text-sm text-foreground" />
        <div data-sub className="text-xs text-muted" />
      </div>
    </div>
  )
}
