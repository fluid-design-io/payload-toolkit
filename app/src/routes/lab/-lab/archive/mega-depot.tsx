import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Vector3 } from 'three'

import { agents, packageManagers } from '../../../workspace/-workspace/workspace.constants'
import type { Lab, MockProps } from '../lab.types'
import { ACCENT, palette, tint } from './mega-depot/kit'
import type { Tip } from './mega-depot/kit'
import { buildLayout, toFacts, tour } from './mega-depot/layout'
import type { Density, Grouping, Layout, Sort } from './mega-depot/layout'
import { fit, LEVEL_PPU, LEVELS, offset } from './mega-depot/rt'
import type { Heat, Knobs, RT } from './mega-depot/rt'
import { createSim, relayout, step } from './mega-depot/sim'
import { camStep, World } from './mega-depot/world'

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

function Simulator({ rt }: { rt: RT }) {
  const scene = useThree((s) => s.scene)
  useEffect(() => {
    ;(window as unknown as { __scene: unknown }).__scene = scene
  }, [scene])
  useFrame((_, dt) => step(rt.sim, rt.lab, rt.L, Math.min(dt, 0.12)), -1)
  return null
}

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: readonly { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex gap-0.5 rounded-md border border-border p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`flex-1 rounded px-1.5 py-0.5 text-[11px] transition-colors ${o.value === value ? 'bg-accent text-accent-foreground' : 'text-muted hover:text-foreground'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Toggle({ on, label, onChange }: { on: boolean; label: string; onChange: (v: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!on)} className="flex items-center gap-1.5 text-[11px] text-muted hover:text-foreground">
      <span className={`relative h-3.5 w-6 rounded-full transition-colors ${on ? 'bg-accent' : 'bg-border'}`}>
        <span className={`absolute top-0.5 size-2.5 rounded-full bg-white transition-all ${on ? 'left-3' : 'left-0.5'}`} />
      </span>
      {label}
    </button>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <span className="pt-1 text-[11px] text-muted">{label}</span>
      {children}
    </>
  )
}

function Director({ knobs, set, rt, level }: { knobs: Knobs; set: (k: Partial<Knobs>) => void; rt: RT; level: number }) {
  const [open, setOpen] = useState(() => innerWidth >= 768)
  const [fps, setFps] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setFps(Math.round(rt.fps)), 500)
    return () => clearInterval(id)
  }, [rt])
  const facet = knobs.grouping === 'source' ? 'Category' : 'Source'
  return (
    <div className="pointer-events-auto absolute left-4 top-[72px] z-20 w-[264px] rounded-xl border border-border bg-surface/92 text-foreground shadow-lg backdrop-blur" data-director>
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center justify-between px-3 py-2 text-xs">
        <span className="flex items-center gap-2 tracking-wide">
          <span className="size-1.5 rounded-full bg-accent" />
          DIRECTOR · MEGA DEPOT
        </span>
        <span className="font-mono text-[10px] text-muted tabular-nums">{fps} fps {open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="grid grid-cols-[64px_1fr] gap-x-2 gap-y-1.5 border-t border-border px-3 pb-3 pt-2.5">
          <Row label="Group">
            <Segmented<Grouping> value={knobs.grouping} options={[{ value: 'category', label: 'Category' }, { value: 'source', label: 'Source' }, { value: 'grid', label: 'Both' }]} onChange={(grouping) => set({ grouping })} />
          </Row>
          <Row label="Shelve by">
            <Segmented<Sort> value={knobs.sort} options={[{ value: 'facet', label: facet }, { value: 'name', label: 'Name' }, { value: 'newest', label: 'Newest' }, { value: 'popular', label: 'Popular' }]} onChange={(sort) => set({ sort })} />
          </Row>
          <Row label="Density">
            <Segmented<Density> value={knobs.density} options={[{ value: 'roomy', label: '12/bay' }, { value: 'standard', label: '20/bay' }, { value: 'dense', label: '40/bay' }]} onChange={(density) => set({ density })} />
          </Row>
          <Row label="Heatmap">
            <Segmented<Heat> value={knobs.heat} options={[{ value: 'popular', label: 'Popular' }, { value: 'selection', label: 'Picked' }, { value: 'off', label: 'Off' }]} onChange={(heat) => set({ heat })} />
          </Row>
          <Row label="Zoom">
            <Segmented<string>
              value={String(level)}
              options={LEVELS.map((label, i) => ({ value: String(i), label }))}
              onChange={(v) => {
                rt.cam.wantPpu = LEVEL_PPU[Number(v)]
                rt.cam.rate = 3
                if (Number(v) === 0) rt.cam.want.copy(fit([[rt.L.bounds.x0, 0, rt.L.bounds.z0], [rt.L.bounds.x1, 0, rt.L.bounds.z1]], rt.size).target)
              }}
            />
          </Row>
          <div className="col-span-2 mt-1 flex flex-wrap gap-x-3 gap-y-1.5">
            <Toggle on={knobs.follow} label="Follow cam" onChange={(follow) => set({ follow })} />
            <Toggle on={knobs.minimap} label="Minimap" onChange={(minimap) => set({ minimap })} />
            <Toggle on={knobs.lanes} label="Floor lanes" onChange={(lanes) => set({ lanes })} />
          </div>
        </div>
      )}
    </div>
  )
}

function Minimap({ rt, layout }: { rt: RT; layout: Layout }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const W = 236, H = 168
  useEffect(() => {
    const canvas = ref.current!
    const dpr = Math.min(2, devicePixelRatio || 1)
    canvas.width = W * dpr
    canvas.height = H * dpr
    const ctx = canvas.getContext('2d')!
    const draw = () => {
      const L = rt.L
      const c = palette(rt.lab.theme)
      const { x0, x1, z0, z1 } = L.bounds
      const s = Math.min((W - 16) / (x1 - x0), (H - 16) / (z1 - z0))
      const ox = (W - (x1 - x0) * s) / 2, oz = (H - (z1 - z0) * s) / 2
      const X = (x: number) => (ox + (x - x0) * s) * dpr
      const Z = (z: number) => (oz + (z - z0) * s) * dpr
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.lineWidth = dpr
      for (const b of L.buildings) {
        ctx.fillStyle = c.slab
        ctx.strokeStyle = c.edge
        ctx.fillRect(X(b.x0), Z(b.z0), (b.x1 - b.x0) * s * dpr, (b.z1 - b.z0) * s * dpr)
        ctx.strokeRect(X(b.x0), Z(b.z0), (b.x1 - b.x0) * s * dpr, (b.z1 - b.z0) * s * dpr)
      }
      ctx.lineWidth = 2 * dpr
      for (const sec of L.sections) {
        ctx.strokeStyle = tint(sec.hue, c, c.dark ? 50 : 60, 50)
        ctx.beginPath()
        ctx.moveTo(X(sec.x0 + 0.2), Z(L.rows[sec.row].face))
        ctx.lineTo(X(sec.x1 - 0.2), Z(L.rows[sec.row].face))
        ctx.stroke()
      }
      ctx.fillStyle = c.edge
      ctx.fillRect(X(L.cell.x - 6), Z(L.cell.z - 4.9), 21 * s * dpr, 9.6 * s * dpr)
      if (rt.match) {
        ctx.fillStyle = ACCENT
        rt.match.forEach((m, i) => m && ctx.fillRect(X(L.pos[i * 3]) - dpr, Z(L.pos[i * 3 + 2]) - dpr, 2 * dpr, 2 * dpr))
      }
      const plan = rt.sim.plan
      if (plan.length > 1 && rt.sim.picker.state !== 'idle') {
        ctx.strokeStyle = ACCENT
        ctx.lineWidth = 1.5 * dpr
        ctx.beginPath()
        plan.forEach(([x, z], k) => (k ? ctx.lineTo(X(x), Z(z)) : ctx.moveTo(X(x), Z(z))))
        ctx.stroke()
      }
      const pk = rt.sim.picker.pos
      ctx.fillStyle = ACCENT
      ctx.beginPath()
      ctx.arc(X(pk.x), Z(pk.z), 3.5 * dpr, 0, Math.PI * 2)
      ctx.fill()
      const k = rt.corners
      ctx.strokeStyle = c.fg
      ctx.fillStyle = 'rgba(90,145,173,0.12)'
      ctx.lineWidth = 1.2 * dpr
      ctx.beginPath()
      for (let i = 0; i < 4; i++) (i ? ctx.lineTo : ctx.moveTo).call(ctx, X(k[i * 2]), Z(k[i * 2 + 1]))
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
    }
    const id = setInterval(draw, 120)
    draw()
    return () => clearInterval(id)
  }, [rt, layout])
  return (
    <canvas
      ref={ref}
      style={{ width: W, height: H }}
      className="cursor-crosshair rounded-lg"
      data-minimap
      onClick={(e) => {
        const L = rt.L
        const rect = e.currentTarget.getBoundingClientRect()
        const { x0, x1, z0, z1 } = L.bounds
        const s = Math.min((W - 16) / (x1 - x0), (H - 16) / (z1 - z0))
        const ox = (W - (x1 - x0) * s) / 2, oz = (H - (z1 - z0) * s) / 2
        const x = x0 + (e.clientX - rect.left - ox) / s
        const z = z0 + (e.clientY - rect.top - oz) / s
        rt.cam.wantPpu = Math.max(rt.cam.wantPpu, 9)
        rt.cam.want.copy(offset(new Vector3(x, 0, z), rt.size, rt.cam.wantPpu))
        rt.cam.rate = 3
        rt.cam.override = true
      }}
    />
  )
}

function whereOf(rt: RT): string[] {
  const L = rt.L
  const k = rt.corners
  const x = (k[0] + k[2] + k[4] + k[6]) / 4, z = (k[1] + k[3] + k[5] + k[7]) / 4
  const out = ['Campus']
  const b = L.buildings.findIndex((bd) => x >= bd.x0 && x <= bd.x1 && z >= bd.z0 - 2 && z <= bd.z1 + 1)
  if (b < 0) return z > 3 ? [...out, 'Dock 1 · assembly cell'] : out
  out.push(L.buildings[b].label)
  if (rt.level < 1) return out
  let best = -1, bestD = Infinity
  L.rows.forEach((row, r) => {
    if (row.b !== b) return
    const d = Math.abs(z - row.walk)
    if (d < bestD) [best, bestD] = [r, d]
  })
  if (best < 0) return out
  const sec = L.sections.find((s) => s.row === best && x >= s.x0 && x <= s.x1) ?? L.sections.filter((s) => s.row === best).sort((p, q) => Math.abs((p.x0 + p.x1) / 2 - x) - Math.abs((q.x0 + q.x1) / 2 - x))[0]
  if (!sec) return out
  const g = L.groups[sec.group]
  out.push(`Aisle ${String(g.no).padStart(2, '0')} · ${g.label}`)
  if (rt.level >= 2) out.push(sec.label)
  return out
}

function useHud({ rt, layout }: { rt: RT; layout: Layout }) {
  const [state, setState] = useState({ level: 1, where: ['Campus'] })
  useEffect(() => {
    const id = setInterval(() => {
      const where = whereOf(rt)
      setState((s) => (s.level === rt.level && s.where.join() === where.join() ? s : { level: rt.level, where }))
    }, 250)
    return () => clearInterval(id)
  }, [rt, layout])
  return { ...state }
}

function BuildPanel({ lab, rt, matches, route, onPickAll, layout }: {
  lab: Lab; rt: RT; matches: number; route: ReturnType<typeof tour> | null; onPickAll: () => void; layout: Layout
}) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(lab.command)
    } catch {}
    setCopied(true)
    setTimeout(() => setCopied(false), 1300)
  }
  const flyGroup = (g: Layout['groups'][number]) => {
    if (rt.knobs.grouping !== 'source') {
      lab.setFocus({ category: g.key as Lab['focus']['category'] })
      return
    }
    const row = layout.rows[g.row]
    rt.cam.wantPpu = 14
    rt.cam.want.copy(offset(new Vector3(g.x + 10, 0, row.walk - 2), rt.size, 14))
    rt.cam.rate = 3
  }
  return (
    <div className="pointer-events-auto flex h-full min-h-0 flex-col gap-3 rounded-2xl border border-border bg-surface/95 p-3 shadow-lg backdrop-blur">
      <div>
        <div className="mb-1.5 flex items-center justify-between text-[11px] tracking-wide text-muted">
          <span>PICK LIST</span>
          {lab.focus.query && <span className="tabular-nums">{matches.toLocaleString()} bins lit</span>}
        </div>
        <input
          value={lab.focus.query}
          onChange={(e) => lab.setFocus({ query: e.target.value })}
          placeholder={`Search ${lab.catalog.items.length.toLocaleString()} parts…`}
          className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-accent"
          data-search
        />
        {route && route.order.length > 0 && (
          <div className="mt-2 flex items-center gap-2">
            <div className="flex-1 text-[11px] leading-tight text-muted">
              <span className="text-foreground">{route.order.length} stops</span>
              {matches > route.order.length ? ` nearest of ${matches}` : ''} · {Math.round(route.length)} m route
            </div>
            <button type="button" onClick={onPickAll} className="rounded-lg bg-accent px-3 py-1 text-xs text-accent-foreground active:scale-[0.98]" data-pick-all>
              Pick all
            </button>
          </div>
        )}
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="mb-1 flex justify-between text-[11px] tracking-wide text-muted">
          <span>DIRECTORY</span>
          {lab.focus.category === 'all' ? (
            <span>{layout.groups.length} aisles</span>
          ) : (
            <button type="button" onClick={() => lab.setFocus({ category: 'all' })} className="text-accent hover:underline">
              show all aisles
            </button>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          {layout.buildings.map((b, bi) => (
            <div key={b.key} className="mb-1.5">
              <div className="px-1 py-0.5 text-[10px] uppercase tracking-wider text-muted">{b.label} · {b.count.toLocaleString()}</div>
              {layout.groups.filter((g) => g.b === bi).map((g) => {
                const on = lab.focus.category === g.key
                return (
                  <button
                    key={g.key}
                    type="button"
                    onClick={() => flyGroup(g)}
                    className={`flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-xs transition-colors ${on ? 'bg-accent/15 text-foreground' : 'hover:bg-background'}`}
                  >
                    <span className="w-5 font-mono text-[10px] text-muted">{String(g.no).padStart(2, '0')}</span>
                    <span className="h-3 w-1 rounded-full" style={{ background: `hsl(${g.hue} 50% 60%)` }} />
                    <span className="flex-1 truncate">{g.label}</span>
                    <span className="font-mono text-[10px] text-muted tabular-nums">{g.count}</span>
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="border-t border-border pt-2.5">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[11px] tracking-wide text-muted">ON THE BOARD</span>
          <span className="rounded-md bg-background px-2 py-0.5 font-mono text-xs tabular-nums" data-count={lab.setup.items.length}>
            {String(lab.setup.items.length).padStart(2, '0')} parts
          </span>
        </div>
        <div className="mb-2 grid grid-cols-[52px_1fr] items-center gap-x-2 gap-y-1 text-[11px] text-muted">
          <span>Target</span>
          <Segmented value={lab.setup.target} options={[{ value: 'existing', label: 'add' }, { value: 'new', label: 'init' }] as const} onChange={(v) => lab.set('target', v)} />
          <span>Installer</span>
          <Segmented value={lab.setup.packageManager} options={packageManagers} onChange={(v) => lab.set('packageManager', v)} />
          <span>Agent</span>
          <Segmented value={lab.setup.agent} options={agents.map((a) => ({ value: a.value, label: a.value }))} onChange={(v) => lab.set('agent', v)} />
        </div>
        <div className="max-h-[72px] overflow-y-auto rounded-lg bg-background px-2 py-1.5 font-mono text-[10.5px] leading-snug [overflow-wrap:anywhere]">
          <span className="text-accent">$ </span>
          {lab.command}
        </div>
        <div className="mt-2 flex gap-2">
          <button type="button" onClick={copy} className="flex-1 rounded-lg bg-accent px-3 py-1.5 text-sm text-accent-foreground active:scale-[0.98]">
            {copied ? 'Copied' : 'Copy command'}
          </button>
          <button type="button" onClick={() => lab.clear()} disabled={!lab.setup.items.length} className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted hover:text-foreground disabled:opacity-40">
            Restock
          </button>
        </div>
      </div>
    </div>
  )
}

const defaults: Knobs = { grouping: 'category', sort: 'facet', density: 'standard', heat: 'popular', minimap: true, follow: true, lanes: true }

export default function MegaDepot({ lab }: MockProps) {
  const [knobs, setKnobs] = useState<Knobs>(defaults)
  const set = (k: Partial<Knobs>) => setKnobs((cur) => ({ ...cur, ...k }))
  const facts = useMemo(() => toFacts(lab.catalog), [lab.catalog])
  const L = useMemo(() => buildLayout(lab.catalog, facts, knobs.grouping, knobs.sort, knobs.density), [lab.catalog, facts, knobs.grouping, knobs.sort, knobs.density])
  const [tipRef, tip] = useTip()
  const [rt] = useState<RT>(() => ({
    lab, L, facts, knobs, tip,
    sim: createSim(lab, L),
    cam: { target: new Vector3(), ppu: 0, want: new Vector3(), wantPpu: 8, rate: 3, override: false, following: false, home: { target: new Vector3(), ppu: 8 } },
    size: { w: 1, h: 1, panel: 0, bottom: 0 },
    match: null,
    query: false,
    binPos: new Float32Array(L.pos),
    corners: new Float32Array(8),
    hover: -1,
    where: [],
    level: 1,
    fps: 60,
  }))
  rt.lab = lab
  rt.knobs = knobs
  rt.facts = facts
  if (rt.L !== L) {
    rt.L = L
    relayout(rt.sim, L)
  }

  const q = lab.focus.query.trim().toLowerCase()
  const cat = lab.focus.category
  const match = useMemo(() => {
    const tokens = q.split(/\s+/).filter(Boolean)
    if (!tokens.length) return null
    const out = new Uint8Array(lab.catalog.items.length)
    lab.catalog.items.forEach((item, i) => {
      const hay = `${item.title} ${item.label} ${item.name} ${item.sourceName ?? ''} ${item.source}`.toLowerCase()
      out[i] = tokens.every((t) => hay.includes(t)) && (cat === 'all' || item.category === cat) ? 1 : 0
    })
    return out
  }, [q, cat, lab.catalog])
  const lit = useMemo(() => {
    if (match || cat === 'all') return match
    return Uint8Array.from(lab.catalog.items, (item) => (item.category === cat ? 1 : 0))
  }, [match, cat, lab.catalog])
  rt.match = lit
  rt.query = !!match
  const matches = useMemo(() => (match ? match.reduce((s, v) => s + v, 0) : 0), [match])
  const route = useMemo(() => {
    if (!match) return null
    const candidates: number[] = []
    match.forEach((m, i) => m && !lab.selected.has(lab.catalog.items[i].ref) && candidates.push(i))
    return tour(L, { k: 'dock' }, candidates, 40)
  }, [match, L, lab.selected, lab.catalog])
  const version = `${L.key}|${q}|${cat}|${knobs.heat}|${lab.setup.items.length}`

  useEffect(() => {
    if (!match || !route?.order.length || rt.cam.following) return
    const id = setTimeout(() => {
      const pts = route.order.map((i) => [L.pos[i * 3], L.pos[i * 3 + 1], L.pos[i * 3 + 2]] as const)
      const f = fit([...pts, [L.dock.x, 0, L.dock.z]], rt.size, 0.1)
      rt.cam.want.copy(f.target)
      rt.cam.wantPpu = Math.min(f.ppu, 22)
      rt.cam.rate = 2.4
    }, 700)
    return () => clearTimeout(id)
  }, [route, match, L, rt])

  const firstLayout = useRef(L.key)
  useEffect(() => {
    if (firstLayout.current === L.key) return
    firstLayout.current = L.key
    const home = fit([[L.bounds.x0, 0, L.bounds.z0], [L.bounds.x1, 0, L.bounds.z0], [L.bounds.x0, 0, L.bounds.z1], [L.bounds.x1, 0, L.bounds.z1], [L.bounds.x0, 6, L.bounds.z0]], rt.size)
    rt.cam.home = home
    rt.cam.want.copy(home.target)
    rt.cam.wantPpu = home.ppu
    rt.cam.rate = 1.6
  }, [L, rt])

  useEffect(() => {
    const cat = lab.focus.category
    if (cat === 'all') return
    const pts: [number, number, number][] = []
    lab.catalog.items.forEach((item, i) => item.category === cat && pts.push([L.pos[i * 3], L.pos[i * 3 + 1], L.pos[i * 3 + 2]]))
    if (!pts.length) return
    const f = fit(pts, rt.size, 0.12)
    rt.cam.want.copy(f.target)
    rt.cam.wantPpu = Math.min(f.ppu, 24)
    rt.cam.rate = 2.4
  }, [lab.focus.category, L, lab.catalog, rt])

  const hud = useHud({ rt, layout: L })
  const pickAll = () => {
    if (!route) return
    for (const i of route.order) {
      const ref = lab.catalog.items[i].ref
      if (!lab.selected.has(ref)) lab.toggle(ref)
    }
  }

  useEffect(() => {
    const w = window as unknown as { __depot?: unknown }
    w.__depot = {
      rt,
      pick: (n: number, from = 0) => {
        const refs = rt.lab.catalog.items.slice(from, from + n).map((item) => item.ref)
        for (const ref of refs) rt.lab.toggle(ref)
        return refs
      },
      advance: (seconds: number) => {
        for (let t = 0; t < seconds; t += 1 / 30) {
          step(rt.sim, rt.lab, rt.L, 1 / 30)
          camStep(rt, 1 / 30)
        }
        return rt.sim.picker.state
      },
      fps: () => new Promise((resolve) => {
        let frames = 0
        const t0 = performance.now()
        const tick = () => {
          frames++
          if (performance.now() - t0 < 3000) requestAnimationFrame(tick)
          else resolve(Math.round((frames * 1000) / (performance.now() - t0)))
        }
        requestAnimationFrame(tick)
      }),
    }
  }, [rt])

  const embedded = lab.chrome === 'embedded'
  return (
    <div className="relative h-full w-full overflow-hidden" style={{ background: palette(lab.theme).floor }}>
      <div className="absolute inset-0">
        <Canvas orthographic dpr={[1, 2]} camera={{ position: [100, 100, 100], zoom: 8, near: 0.1, far: 2000 }} onPointerMissed={() => tip.hide()}>
          <Simulator rt={rt} />
          <World rt={rt} lab={lab} query={route?.path ?? null} version={version} focus={lab.focus.category} />
        </Canvas>
      </div>
      <Director knobs={knobs} set={set} rt={rt} level={hud.level} />
      <div className={`pointer-events-none absolute bottom-4 left-4 z-10 flex flex-col gap-2 ${embedded ? '' : 'max-md:hidden'}`}>
        <div className="pointer-events-auto w-fit rounded-xl border border-border bg-surface/92 p-2 text-[11px] shadow-lg backdrop-blur">
          <div className="flex gap-1" data-level={LEVELS[hud.level]}>
            {LEVELS.map((name, i) => (
              <span key={name} className={`rounded px-1.5 py-0.5 ${i === hud.level ? 'bg-accent text-accent-foreground' : 'text-muted'}`}>{name}</span>
            ))}
          </div>
          <div className="mt-1.5 max-w-[236px] truncate px-0.5 text-foreground" data-where>
            {hud.where.join(' › ')}
          </div>
          {knobs.minimap && (
            <div className="mt-2">
              <Minimap rt={rt} layout={L} />
            </div>
          )}
        </div>
      </div>
      {!embedded && (
        <div className="absolute bottom-2 left-2 right-2 top-[58%] z-20 md:bottom-4 md:left-auto md:right-4 md:top-[72px] md:w-[316px]">
          <BuildPanel lab={lab} rt={rt} matches={matches} route={route} onPickAll={pickAll} layout={L} />
        </div>
      )}
      <div ref={tipRef} className="pointer-events-none fixed left-0 top-0 z-40 max-w-72 rounded-lg border border-border bg-surface px-2.5 py-1.5 opacity-0 shadow-lg transition-opacity">
        <div className="text-sm text-foreground" />
        <div className="text-xs text-muted" />
      </div>
    </div>
  )
}
