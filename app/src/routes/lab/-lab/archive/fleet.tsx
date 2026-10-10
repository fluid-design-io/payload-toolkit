import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { ContactShadows, OrbitControls } from '@react-three/drei'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Vector3 } from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'

import { agents, databases, frameworks, packageManagers } from '../../../workspace/-workspace/workspace.constants'
import type { CategoryId } from '../../../workspace/-workspace/workspace.types'
import type { Lab, MockProps } from '../lab.types'
import { ACCENT, palette, useTip } from './fleet/kit'
import type { Colors, Tip } from './fleet/kit'
import { CELL, HANGAR, INTEGRATORS, MACHINES, SETUP_KEY, WH, createSim, fromSetup, machine, step } from './fleet/sim'
import type { Rig, Sim, SlotKey } from './fleet/sim'
import { ArmUnit, DroneUnit, WalkerUnit } from './fleet/units'
import { Belt, Cable, Cell, Depot, Hangar, Mongo, Parts, Postgres, Stations, Tube, Warehouse, aisleZ, matches } from './fleet/world'

type Cam = 'follow' | 'overview' | 'hangar'
type Deploy = (slot: SlotKey, id: string) => void
type Box3 = { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number }

const SLOT_LABEL: Record<SlotKey, string> = { integrator: 'Agent', transport: 'Installer', cell: 'Framework', storage: 'Database' }
const TRANSIT: Record<string, string> = { belt: 'riding the npm belt', depot: 'linking from the pnpm store', tube: 'firing down the Bun tube' }
const FINISH: Record<string, string> = { arm: 'settling, a bit crooked', drone: 'welding solder beads', walker: 'laser-etching it' }

const corners = (b: Box3) => {
  const out: Vector3[] = []
  for (const x of [b.x0, b.x1]) for (const y of [b.y0, b.y1]) for (const z of [b.z0, b.z1]) out.push(new Vector3(x, y, z))
  return out
}

function CameraRig({ sim, lab, cam, hud, reserve }: { sim: Sim; lab: Lab; cam: Cam; hud: { current: HTMLDivElement | null }; reserve: number }) {
  const { camera, size, controls } = useThree()
  const st = useMemo(() => ({ hold: false, seq: -1, cam: '' as string, focus: '', ready: false, text: '' }), [])
  const boxes = useMemo(() => {
    const deepest = Math.max(...lab.warehouse.aisles.map((a) => a.bays))
    const A = lab.warehouse.aisles.length
    const wz = aisleZ(A, A) + 1.2
    const wx0 = WH.x1 - deepest * WH.bay - 0.6
    const warehouse = { x0: wx0, x1: WH.x1 + 2.8, y0: 0, y1: 1.3, z0: -wz, z1: wz + 0.8 }
    const hangar = { x0: HANGAR.x0 - 0.5, x1: HANGAR.x1, y0: 0, y1: HANGAR.h, z0: HANGAR.z0 - 0.5, z1: HANGAR.z1 + 1.3 }
    return {
      all: [...corners(warehouse), ...corners(hangar), new Vector3(-4.3, 5.2, 3.2), new Vector3(15, 6.6, -3.9), new Vector3(CELL.x, 0, 4.5)],
      hangar: [...corners(hangar), new Vector3(15, 6.6, -3.9)],
      warehouse: corners(warehouse),
    }
  }, [lab.warehouse])
  const v = useMemo(() => ({ dir: new Vector3(), right: new Vector3(), up: new Vector3(), center: new Vector3(), goal: new Vector3(), mid: new Vector3() }), [])
  const fit = (pts: Vector3[], pad = 1.06) => {
    v.right.crossVectors(UP, v.dir).normalize()
    v.up.crossVectors(v.dir, v.right).normalize()
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
    for (const p of pts) {
      const a = p.dot(v.right), c = p.dot(v.up)
      x0 = Math.min(x0, a); x1 = Math.max(x1, a); y0 = Math.min(y0, c); y1 = Math.max(y1, c)
    }
    const zoom = Math.min((size.width - reserve) / ((x1 - x0) * pad), (size.height - 70) / ((y1 - y0) * pad))
    const center = v.right.clone().multiplyScalar((x0 + x1) / 2 - reserve / 2 / zoom).addScaledVector(v.up, (y0 + y1) / 2 + 20 / zoom)
    return { center: projectToGround(center, v.dir), zoom }
  }
  const gl = useThree((s) => s.gl)
  useEffect(() => {
    const el = gl.domElement
    let down: [number, number] | null = null
    const onDown = (e: PointerEvent) => {
      down = [e.clientX, e.clientY]
    }
    const onMove = (e: PointerEvent) => {
      if (down && e.buttons && Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) st.hold = true
    }
    const onUp = () => {
      down = null
    }
    const onWheel = () => {
      st.hold = true
    }
    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMove)
    addEventListener('pointerup', onUp)
    el.addEventListener('wheel', onWheel, { passive: true })
    return () => {
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMove)
      removeEventListener('pointerup', onUp)
      el.removeEventListener('wheel', onWheel)
    }
  }, [gl, st])
  useFrame((_, dt) => {
    const ctl = controls as unknown as OrbitControlsImpl | null
    if (!ctl) return
    if (!st.ready) {
      v.dir.set(Math.sin(0.92) * Math.cos(0.6), Math.sin(0.6), Math.cos(0.92) * Math.cos(0.6)).normalize()
    } else v.dir.copy(camera.position).sub(ctl.target).normalize()
    const focusKey = `${lab.focus.category}|${lab.focus.query}`
    if (sim.seq !== st.seq || st.cam !== cam || st.focus !== focusKey) {
      if (st.ready) st.hold = false
      st.seq = sim.seq
      st.cam = cam
      st.focus = focusKey
    }
    const all = fit(boxes.all)
    let goal = all
    let text = 'Overview'
    let subject: Vector3 | null = null
    let k = 2.5
    const launching = INTEGRATORS.map((id) => sim.units[id]).find((u) => u.state === 'launch')
    const f = sim.follow
    const unit = sim.units[sim.rig.integrator]
    const im = machine('integrator', sim.rig.integrator)
    const who = `${im.brand} ${im.model.toLowerCase()}`
    if (cam === 'follow') {
      if (launching) {
        const m = machine('integrator', launching.id)
        subject = launching.id === 'arm' ? v.mid.copy(launching.base).setY(2.5) : launching.pos
        text = `${m.brand} ${m.model.toLowerCase()} launching from the hangar`
        k = 1.7
      } else if (f && sim.live.includes(f) && f.phase !== 'home' && !(f.phase === 'seated' && f.finish >= 1 && sim.time - sim.followDone > 0.9)) {
        if (f.phase === 'pick') {
          subject = f.pos
          text = `Part: ${f.item.title} leaving bin ${sim.bins.get(f.ref)?.code ?? ''}`
        } else if (f.phase === 'transit') {
          subject = f.pos
          text = `Part: ${f.item.title} ${TRANSIT[sim.rig.transport]}`
        } else if (f.phase === 'intake') {
          subject = unit.job === f ? unit.pos : v.mid.lerpVectors(unit.pos, f.pos, 0.5)
          text = unit.job === f ? `Integrator: ${who} coming for ${f.item.title}` : `Part: ${f.item.title} waiting at intake`
        } else if (f.phase === 'carried') {
          subject = unit.pos
          text = `Integrator: ${who} carrying ${f.item.title}`
        } else {
          subject = unit.work?.part === f ? unit.pos : f.pos
          text = f.finish < 1 ? `Integrator: ${who} ${FINISH[sim.rig.integrator]}` : `Part: ${f.item.title} seated`
        }
      }
    }
    const busy = sim.queue.length + sim.intake.length + sim.live.filter((p) => p.phase === 'pick' || p.phase === 'carried' || p.stage === 'beam' || p.stage === 'fly').length
    if (subject) {
      v.goal.copy(subject)
      if (busy > 2) {
        v.center.set(0, 0, 0)
        let n = 0
        for (const p of sim.live)
          if (p.phase !== 'seated' && p.phase !== 'home') {
            v.center.add(p.pos)
            n++
          }
        if (n) v.goal.lerp(v.center.multiplyScalar(1 / n), Math.min(0.6, (busy - 2) * 0.15))
        k = Math.min(k, 1.7)
        text += ` · ${busy} in flight`
      }
      const zoom = Math.max(all.zoom * 1.3, Math.min(20 * k, 80))
      v.right.crossVectors(UP, v.dir).normalize()
      goal = { center: projectToGround(v.goal.clone().addScaledVector(v.right, -reserve / 2 / zoom), v.dir), zoom }
    } else if (cam === 'hangar') {
      goal = fit(boxes.hangar, 1.1)
      text = 'Hangar'
    } else if (lab.focus.category !== 'all') {
      const aisle = lab.warehouse.aisles.find((a) => a.id === lab.focus.category)
      if (aisle) {
        const z = aisleZ(aisle.no, lab.warehouse.aisles.length)
        goal = fit(corners({ x0: WH.x1 - Math.max(aisle.bays, 3) * WH.bay - 0.4, x1: WH.x1 + 2.8, y0: 0, y1: 1.4, z0: z - 2.2, z1: z + 2.2 }), 1.2)
        text = `Aisle ${String(aisle.no).padStart(2, '0')}: ${aisle.label} · ${aisle.count.toLocaleString()} parts`
      }
    } else if (lab.focus.query.trim()) {
      goal = fit(boxes.warehouse, 1.15)
      text = `Searching “${lab.focus.query.trim()}”`
    }
    if (st.hold) text = 'Free camera · add a part or pick a camera to resume'
    if (text !== st.text && hud.current) {
      st.text = text
      hud.current.textContent = text
    }
    if (!st.ready) {
      ctl.target.copy(goal.center)
      camera.position.copy(goal.center).addScaledVector(v.dir, 90)
      camera.zoom = goal.zoom
      camera.updateProjectionMatrix()
      st.ready = true
      return
    }
    if (st.hold) return
    const slow = busy > 2 ? 0.6 : 1
    dt = Math.min(dt, 0.25)
    ctl.target.lerp(goal.center, 1 - Math.exp(-dt * 2.4 * slow))
    camera.position.copy(ctl.target).addScaledVector(v.dir, 90)
    camera.zoom += (goal.zoom - camera.zoom) * (1 - Math.exp(-dt * 1.8 * slow))
    camera.updateProjectionMatrix()
  })
  return null
}
const UP = new Vector3(0, 1, 0)
function projectToGround(p: Vector3, dir: Vector3) {
  const t = p.y / dir.y
  return p.clone().addScaledVector(dir, -t)
}

function Simulator({ sim, labRef, rigRef }: { sim: Sim; labRef: { current: Lab }; rigRef: { current: Rig } }) {
  const acc = useRef(0)
  useFrame((_, dt) => {
    acc.current = Math.min(acc.current + dt, 0.5)
    while (acc.current > 1 / 60) {
      const h = Math.min(acc.current, 1 / 30)
      step(sim, labRef.current, rigRef.current, h)
      acc.current -= h
    }
  })
  return null
}

function Scene({ lab, sim, labRef, rigRef, rig, cam, c, tip, deploy, version, hud, reserve }: {
  lab: Lab; sim: Sim; labRef: { current: Lab }; rigRef: { current: Rig }; rig: Rig; cam: Cam; c: Colors; tip: Tip; deploy: Deploy; version: number; hud: { current: HTMLDivElement | null }; reserve: number
}) {
  const common = { sim, c, tip }
  const swap = () => deploy('cell', rig.cell === 'next' ? 'tanstack' : 'next')
  return (
    <>
      <OrbitControls makeDefault enableDamping={false} minPolarAngle={0.35} maxPolarAngle={1.25} minZoom={6} maxZoom={140} />
      <CameraRig sim={sim} lab={lab} cam={cam} hud={hud} reserve={reserve} />
      <Simulator sim={sim} labRef={labRef} rigRef={rigRef} />
      <ambientLight intensity={lab.theme === 'dark' ? 0.9 : 1.6} />
      <directionalLight position={[6, 12, 8]} intensity={lab.theme === 'dark' ? 0.9 : 1.3} />
      <hemisphereLight args={[c.surface, c.bg, 0.5]} />
      <Warehouse lab={lab} version={version} {...common} />
      <Stations c={c} />
      <Belt sim={sim} c={c} />
      <Depot sim={sim} c={c} />
      <Tube sim={sim} c={c} />
      <Cell cell="next" swap={swap} {...common} />
      <Cell cell="tanstack" swap={swap} {...common} />
      <Cable sim={sim} c={c} />
      <Postgres deploy={deploy} {...common} />
      <Mongo deploy={deploy} {...common} />
      <Hangar deploy={deploy} rig={rig} {...common} />
      <ArmUnit deploy={deploy} {...common} />
      <DroneUnit deploy={deploy} {...common} />
      <WalkerUnit deploy={deploy} {...common} />
      <Parts lab={lab} version={version} {...common} />
      <ContactShadows position={[CELL.x, 0.001, 0]} scale={[44, 22]} resolution={512} blur={2.4} far={6} opacity={lab.theme === 'dark' ? 0.55 : 0.25} color="#000" />
    </>
  )
}

function Seg<T extends string>({ value, options, onChange, dim }: { value: T; options: readonly { value: T; label: string }[]; onChange: (v: T) => void; dim?: T }) {
  return (
    <div className="flex flex-wrap gap-0.5 rounded-md border border-border p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`rounded px-1.5 py-0.5 text-[11px] transition-colors ${o.value === value ? 'bg-accent text-accent-foreground' : o.value === dim ? 'text-foreground' : 'text-muted hover:text-foreground'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Director({ rig, setup, over, setOver, cam, setCam, apply, open, setOpen }: {
  rig: Rig; setup: Rig; over: Partial<Rig>; setOver: (o: Partial<Rig>) => void; cam: Cam; setCam: (c: Cam) => void; apply: () => void; open: boolean; setOpen: (v: boolean) => void
}) {
  const slots = ['integrator', 'transport', 'cell', 'storage'] as const
  const previewing = Object.keys(over).length > 0
  return (
    <div className="pointer-events-auto absolute left-3 top-[68px] z-20 w-[272px] max-w-[calc(100%-24px)] rounded-2xl border border-border bg-surface/90 p-3 text-xs shadow-lg backdrop-blur">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center justify-between">
        <span className="tracking-wide text-muted">DIRECTOR</span>
        <span className="text-muted">{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div className="mt-2.5 space-y-2.5">
          {slots.map((slot) => {
            const m = machine(slot, rig[slot])
            return (
              <div key={slot}>
                <div className="mb-1 flex items-baseline justify-between gap-2">
                  <span className="text-muted">{SLOT_LABEL[slot]}</span>
                  <span className="truncate text-[11px] text-foreground">{m.brand} → {m.model}</span>
                </div>
                <Seg
                  value={(over[slot] ?? 'setup') as string}
                  dim={'setup'}
                  options={[{ value: 'setup', label: 'from setup' }, ...MACHINES[slot].map((x) => ({ value: x.id, label: x.tag }))]}
                  onChange={(value) => {
                    const next = { ...over }
                    if (value === 'setup' || value === setup[slot]) delete next[slot]
                    else (next as Record<string, string>)[slot] = value
                    setOver(next)
                  }}
                />
              </div>
            )
          })}
          <div className="text-[11px] leading-snug text-muted">{machine('integrator', rig.integrator).note}</div>
          {previewing && (
            <div className="flex items-center justify-between gap-2 rounded-lg bg-background px-2 py-1.5">
              <span className="text-[11px] text-muted">Preview only, setup unchanged</span>
              <span className="flex gap-1">
                <button type="button" className="rounded bg-accent px-1.5 py-0.5 text-[11px] text-accent-foreground" onClick={apply}>Apply</button>
                <button type="button" className="rounded border border-border px-1.5 py-0.5 text-[11px] text-muted" onClick={() => setOver({})}>Reset</button>
              </span>
            </div>
          )}
          <div>
            <div className="mb-1 text-muted">Camera</div>
            <Seg value={cam} options={[{ value: 'follow', label: 'follow' }, { value: 'overview', label: 'overview' }, { value: 'hangar', label: 'hangar' }] as const} onChange={setCam} />
          </div>
        </div>
      )}
    </div>
  )
}

function Desk({ lab }: { lab: Lab }) {
  const [copied, setCopied] = useState(false)
  const q = lab.focus.query.trim().toLowerCase()
  const cats = useMemo(() => [...lab.catalog.kinds, ...lab.catalog.blocks], [lab.catalog])
  const results = useMemo(
    () => lab.catalog.items.filter((item) => (lab.focus.category === 'all' || item.category === lab.focus.category) && matches(item, q)),
    [lab.catalog, lab.focus.category, q],
  )
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(lab.command)
    } catch {}
    setCopied(true)
    setTimeout(() => setCopied(false), 1300)
  }
  return (
    <div className="pointer-events-auto flex h-full min-h-0 flex-col gap-2 rounded-2xl border border-border bg-surface/95 p-3 text-xs shadow-lg backdrop-blur">
      <div className="flex items-center justify-between">
        <span className="tracking-wide text-muted">ORDER DESK</span>
        <span className="rounded-md bg-background px-2 py-0.5 font-mono tabular-nums" data-count={lab.selected.size}>{String(lab.selected.size).padStart(2, '0')} parts</span>
      </div>
      <input
        value={lab.focus.query}
        onChange={(e) => lab.setFocus({ query: e.target.value })}
        placeholder={`Search ${lab.catalog.items.length.toLocaleString()} parts`}
        className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs text-foreground outline-none focus:border-accent"
      />
      <div className="flex gap-1 overflow-x-auto pb-0.5">
        {cats.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => lab.setFocus({ category: cat.id as CategoryId })}
            className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] ${lab.focus.category === cat.id ? 'border-accent bg-accent text-accent-foreground' : 'border-border text-muted hover:text-foreground'}`}
          >
            {cat.label} <span className="opacity-60">{cat.count}</span>
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-border">
        {results.slice(0, 60).map((item) => {
          const on = lab.selected.has(item.ref)
          return (
            <button key={item.ref} type="button" onClick={() => lab.toggle(item.ref)} className="flex w-full items-center justify-between gap-2 border-b border-border px-2 py-1 text-left last:border-0 hover:bg-background">
              <span className="truncate">
                <span className="mr-1.5 inline-block size-2 rounded-sm" style={{ background: `hsl(${item.hue} 45% 60%)` }} />
                {item.title}
              </span>
              <span className={`shrink-0 text-[11px] ${on ? 'text-accent' : 'text-muted'}`}>{on ? 'seated ✓' : 'add'}</span>
            </button>
          )
        })}
        {results.length > 60 && <div className="px-2 py-1 text-[11px] text-muted">+{(results.length - 60).toLocaleString()} more, narrow the search</div>}
      </div>
      <div className="grid grid-cols-[auto_1fr] items-center gap-x-2 gap-y-1 text-[11px] text-muted">
        <span>Target</span>
        <Seg value={lab.setup.target} options={[{ value: 'existing', label: 'add' }, { value: 'new', label: 'init' }] as const} onChange={(v) => lab.set('target', v)} />
        <span>Framework</span>
        <Seg value={lab.setup.framework} options={frameworks} onChange={(v) => lab.set('framework', v)} />
        <span>Database</span>
        <Seg value={lab.setup.database} options={databases} onChange={(v) => lab.set('database', v)} />
        <span>Installer</span>
        <Seg value={lab.setup.packageManager} options={packageManagers} onChange={(v) => lab.set('packageManager', v)} />
        <span>Agent</span>
        <Seg value={lab.setup.agent} options={agents} onChange={(v) => lab.set('agent', v)} />
      </div>
      <div className="max-h-24 overflow-y-auto rounded-lg bg-background px-2 py-1.5 font-mono text-[11px] leading-snug [overflow-wrap:anywhere]">
        <span className="text-accent">$ </span>
        {lab.command}
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={copy} className="flex-1 rounded-lg bg-accent px-3 py-1.5 text-sm text-accent-foreground">{copied ? 'Copied' : 'Copy command'}</button>
        <button type="button" onClick={() => lab.clear()} disabled={!lab.selected.size} className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted disabled:opacity-40">Recall all</button>
      </div>
    </div>
  )
}

export default function Fleet({ lab }: MockProps) {
  const embedded = lab.chrome === 'embedded'
  const [over, setOver] = useState<Partial<Rig>>({})
  const [cam, setCam] = useState<Cam>('follow')
  const narrow = typeof window !== 'undefined' && window.innerWidth < 768
  const [open, setOpen] = useState(!embedded && !narrow)
  const setup = fromSetup(lab.setup)
  const rig: Rig = { ...setup, ...over }
  const labRef = useRef(lab)
  labRef.current = lab
  const rigRef = useRef(rig)
  rigRef.current = rig
  const [sim] = useState(() => createSim(lab, rig))
  const [version, setVersion] = useState(0)
  sim.onLive = () => setVersion((n) => n + 1)
  const hud = useRef<HTMLDivElement>(null)
  const [tipRef, tip] = useTip()
  const c = palette(lab.theme)
  const deploy: Deploy = (slot, id) => {
    setOver((o) => {
      const next = { ...o }
      delete next[slot]
      return next
    })
    lab.set(SETUP_KEY[slot], machine(slot, id).setup as never)
  }
  const apply = () => {
    for (const slot of Object.keys(over) as SlotKey[]) lab.set(SETUP_KEY[slot], machine(slot, over[slot]!).setup as never)
    setOver({})
  }
  useEffect(() => () => tip.hide(), [tip])
  return (
    <div className="relative h-full w-full">
      <div className={`absolute inset-0 ${embedded ? '' : 'bottom-[40%] md:bottom-0 md:right-[340px]'}`}>
        <Canvas orthographic dpr={[1, 2]} camera={{ position: [40, 40, 40], zoom: 20, near: -200, far: 400 }} onPointerMissed={() => tip.hide()}>
          <Scene lab={lab} sim={sim} labRef={labRef} rigRef={rigRef} rig={rig} cam={cam} c={c} tip={tip} deploy={deploy} version={version} hud={hud} reserve={open && !narrow ? 230 : 0} />
        </Canvas>
      </div>
      <Director rig={rig} setup={setup} over={over} setOver={setOver} cam={cam} setCam={setCam} apply={apply} open={open} setOpen={setOpen} />
      <div className={`pointer-events-none absolute bottom-4 z-10 flex items-center gap-2 rounded-full border border-border bg-surface/85 px-3 py-1.5 text-xs shadow backdrop-blur ${embedded ? 'left-1/2 -translate-x-1/2' : 'left-4 bottom-[calc(40%+12px)] md:bottom-4'}`}>
        <span className="size-1.5 rounded-full" style={{ background: ACCENT, boxShadow: `0 0 8px ${ACCENT}` }} />
        <span className="text-muted">CAM</span>
        <span ref={hud} className="max-w-[56vw] truncate text-foreground">Overview</span>
      </div>
      {!embedded && (
        <div className="absolute bottom-2 left-2 right-2 top-[61%] md:bottom-4 md:left-auto md:right-4 md:top-[68px] md:w-[320px]">
          <Desk lab={lab} />
        </div>
      )}
      <div ref={tipRef} className="pointer-events-none fixed left-0 top-0 z-40 max-w-72 rounded-lg border border-border bg-surface px-2.5 py-1.5 opacity-0 shadow-lg transition-opacity">
        <div className="text-sm text-foreground" />
        <div className="text-xs text-muted" />
      </div>
    </div>
  )
}
