import { useEffect, useMemo, useRef } from 'react'
import type { ThreeEvent } from '@react-three/fiber'
import type { Matrix4 } from 'three'
import { Vector3 } from 'three'

import type { CabinetProps, CabinetVariant, Tokens } from '../../core/contract'
import { Body } from '../../core/scene'
import { FONT, MONO, box, lineMat, reducedMotion, segs, textTexture, tint } from '../../core/three'
import type { Piece } from '../../core/three'
import type { Aisle } from '@/routes/lab/-lab/warehouse'
import { Units, aisleEvents, atlasLayout, code, countText, damp, frontQuad, paintTag, showAisle, sphereAt, topQuad, useAtlasTexture } from './units'

/**
 * A rotary vertical lift: one tray per aisle hangs from twin chains on a
 * vertical loop. Opening an aisle retracts the presented tray, turns the
 * loop the short way round until that aisle's tray reaches the access
 * window, then slides it out onto the counter. Everything goes in and out
 * through that window, so it is also where parts off the table rest.
 */
const P = { cx: -12.0, w: 3.6, d: 0.4, h: 0.34, hang: 0.1, r: 0.75, zf: -2.75, yb: 1.35, L: 10.08, win: 2.6, slide: 0.5 }
const RUN = (P.L - 2 * Math.PI * P.r) / 2
const YT = P.yb + RUN
const ZC = P.zf - P.r
const ZB = P.zf - 2 * P.r
const SW = P.win - P.yb
const H = YT + P.r + 0.22
const HX = { x0: P.cx - P.w / 2 - 0.25, x1: P.cx + P.w / 2 + 0.25, z0: ZB - P.d / 2 - 0.12, z1: P.zf + P.d / 2 + 0.08 }
const SCREEN = { x: HX.x1 + 0.86, y: 2.65, z: -2.4, w: 1.44, h: 2.3, rot: 0.32 }
const TRAY_Y = -P.hang - P.h

/** Pivot height and depth `s` units round the loop: up the front run, over the top, down the back, under the bottom. */
function loop(s: number, out: { y: number; z: number }) {
  s = ((s % P.L) + P.L) % P.L
  const arc = Math.PI * P.r
  if (s < RUN) { out.y = P.yb + s; out.z = P.zf; return out }
  s -= RUN
  if (s < arc) { const a = s / P.r; out.y = YT + P.r * Math.sin(a); out.z = ZC + P.r * Math.cos(a); return out }
  s -= arc
  if (s < RUN) { out.y = YT - s; out.z = ZB; return out }
  s -= RUN
  const a = Math.PI + s / P.r
  out.y = P.yb + P.r * Math.sin(a); out.z = ZC + P.r * Math.cos(a)
  return out
}

function drawer(aisle: number, out: Vector3) {
  return out.set(P.cx - 1.2 + (aisle % 6) * 0.48, P.win + TRAY_Y + 0.04, P.zf + P.slide)
}

const TRAY: Piece[] = [
  { geo: box(P.w, 0.03, P.d), at: [0, TRAY_Y + 0.015, 0] },
  { geo: box(P.w, P.h, 0.03), at: [0, -P.hang - P.h / 2, P.d / 2 - 0.015] },
  { geo: box(P.w, P.h * 0.55, 0.03), at: [0, TRAY_Y + P.h * 0.275, -P.d / 2 + 0.015] },
  { geo: box(0.03, P.h, P.d), at: [-P.w / 2 + 0.015, -P.hang - P.h / 2, 0] },
  { geo: box(0.03, P.h, P.d), at: [P.w / 2 - 0.015, -P.hang - P.h / 2, 0] },
  { geo: box(0.025, P.hang, 0.025), at: [-P.w / 2 + 0.015, -P.hang / 2, 0] },
  { geo: box(0.025, P.hang, 0.025), at: [P.w / 2 - 0.015, -P.hang / 2, 0] },
  { geo: box(0.12, 0.05, 0.05), at: [-P.w / 2 - 0.04, 0, 0] },
  { geo: box(0.12, 0.05, 0.05), at: [P.w / 2 + 0.04, 0, 0] },
]
const QUADS = [
  frontQuad(-P.w / 2 + 0.03, P.w / 2 - 0.03, TRAY_Y + 0.025, -P.hang - 0.025, P.d / 2 + 0.002),
  topQuad(-P.w / 2 + 0.05, P.w / 2 - 0.05, -P.d / 2 + 0.05, P.d / 2 - 0.05, TRAY_Y + 0.032),
]
const KINDS = [{ w: 1024, h: 84 }, { w: 1024, h: 120 }] as const
const CROWN = { w: 3.4, h: 0.62, y: H + 0.42 }
const SPHERE = sphereAt(P.cx, H / 2, ZC + 0.3, 3.8)

/** A tray's bed, seen from above: each registry's bays as blocks of 4 × 5 bins, a dot per part. */
function paintBed(ctx: CanvasRenderingContext2D, w: number, h: number, a: Aisle, dim: boolean, c: Tokens) {
  ctx.fillStyle = c.surface
  ctx.fillRect(0, 0, w, h)
  ctx.globalAlpha = dim ? 0.3 : 1
  const bays = a.racks.reduce((n, r) => n + r.bays, 0)
  const gaps = a.racks.length - 1
  const unit = Math.max(3, Math.min(11, Math.floor((w - 40 - gaps * 14) / (bays * 5))))
  const top = h - 12 - unit * 5
  let x = 20
  const fill = tint(a.hue, c.s, c.l)
  for (const [ri, rack] of a.racks.entries()) {
    const width = rack.bays * unit * 5
    if (width > 90 || a.racks.length === 1) {
      ctx.fillStyle = c.muted
      ctx.font = `500 ${Math.min(20, top - 8)}px ${MONO}`
      ctx.textBaseline = 'alphabetic'
      let name = rack.name.toUpperCase()
      while (name.length > 3 && ctx.measureText(name).width > Math.max(width, 200)) name = name.slice(0, -1)
      ctx.fillText(name, x, top - 8)
    }
    for (const bin of rack.bins) {
      const bay = bin.bay - rack.bins[0].bay
      const bx = x + bay * unit * 5 + bin.slot * unit
      const by = top + (bin.level - 1) * unit
      ctx.fillStyle = fill
      ctx.fillRect(bx, by, unit - 1, unit - 1)
    }
    x += width + 14
    if (ri < gaps) {
      ctx.fillStyle = c.dim
      ctx.fillRect(x - 8, top - 4, 2, unit * 5 + 4)
    }
  }
  ctx.globalAlpha = 1
}

const KEYS = { cols: 3, header: 120, pad: 18, px: { w: 600, h: 960 } }
const keyRows = (n: number) => Math.ceil(n / KEYS.cols)
/** The call panel: one button per tray, like a lift's floor buttons, lit for the tray at the window. */
function paintScreen(ctx: CanvasRenderingContext2D, w: number, h: number, aisles: readonly Aisle[], active: number, matches: number[] | null, c: Tokens) {
  ctx.fillStyle = c.surface
  ctx.fillRect(0, 0, w, h)
  ctx.strokeStyle = c.edge
  ctx.lineWidth = 3
  ctx.strokeRect(6, 6, w - 12, h - 12)
  ctx.textBaseline = 'middle'
  ctx.fillStyle = c.muted
  ctx.font = `500 30px ${MONO}`
  ctx.fillText('CALL A TRAY', 30, 62)
  ctx.textAlign = 'right'
  ctx.fillStyle = c.accent
  ctx.fillText(`${String(active + 1).padStart(2, '0')}/${String(aisles.length).padStart(2, '0')}`, w - 30, 62)
  const rows = keyRows(aisles.length)
  const cw = (w - KEYS.pad * 2) / KEYS.cols, ch = (h - KEYS.header - KEYS.pad) / rows
  aisles.forEach((a, i) => {
    const x = KEYS.pad + (i % KEYS.cols) * cw, y = KEYS.header + Math.floor(i / KEYS.cols) * ch
    const on = i === active
    const none = matches && !matches[i]
    const hit = matches && matches[i]
    ctx.globalAlpha = none ? 0.3 : 1
    ctx.fillStyle = on ? c.accent : c.surface
    ctx.fillRect(x + 8, y + 8, cw - 16, ch - 16)
    ctx.strokeStyle = on || hit ? c.accent : c.edge
    ctx.lineWidth = hit && !on ? 6 : 3
    ctx.strokeRect(x + 8, y + 8, cw - 16, ch - 16)
    ctx.fillStyle = on ? c.surface : tint(a.hue, c.s, c.l)
    ctx.fillRect(x + 22, y + 26, 8, ch * 0.38)
    ctx.textAlign = 'left'
    ctx.fillStyle = on ? c.surface : c.fg
    ctx.font = `500 ${Math.round(ch * 0.4)}px ${MONO}`
    ctx.fillText(code(a), x + 42, y + ch * 0.38)
    ctx.font = `400 ${Math.round(ch * 0.2)}px ${FONT}`
    ctx.fillStyle = on ? c.surface : c.muted
    const label = a.label.length > 12 ? `${a.label.slice(0, 11)}…` : a.label
    ctx.fillText(label, x + 24, y + ch * 0.72)
    ctx.globalAlpha = 1
  })
}

function Housing({ c }: { c: Tokens }) {
  const pieces = useMemo((): Piece[] => {
    const W = HX.x1 - HX.x0, D = HX.z1 - HX.z0, cz = (HX.z0 + HX.z1) / 2
    const ow = P.w / 2 + 0.07, oy0 = P.win + TRAY_Y - 0.06, oy1 = P.win - P.hang + 0.06
    return [
      { geo: box(W, 0.15, D), at: [P.cx, 0.075, cz] },
      { geo: box(W, 0.14, D), at: [P.cx, H - 0.07, cz] },
      { geo: box(W, H, 0.05), at: [P.cx, H / 2, HX.z0 + 0.025] },
      { geo: box(0.05, H, D), at: [HX.x0 + 0.025, H / 2, cz] },
      { geo: box(0.08, H, 0.08), at: [HX.x0 + 0.04, H / 2, HX.z1 - 0.04] },
      { geo: box(0.08, H, 0.08), at: [HX.x1 - 0.04, H / 2, HX.z1 - 0.04] },
      { geo: box(0.08, H, 0.08), at: [HX.x1 - 0.04, H / 2, HX.z0 + 0.04] },
      { geo: box(0.05, 0.05, D), at: [HX.x1 - 0.04, YT + 0.2, cz] },
      { geo: box(0.05, 0.05, D), at: [HX.x1 - 0.04, P.yb - 0.2, cz] },
      { geo: box(P.w + 0.3, 0.05, 0.5), at: [P.cx, P.win + TRAY_Y - 0.026, HX.z1 + 0.17] },
      { geo: box(P.w + 0.24, 0.05, 0.05), at: [P.cx, oy1, HX.z1 - 0.02] },
      { geo: box(P.w + 0.24, 0.05, 0.05), at: [P.cx, oy0, HX.z1 - 0.02] },
      { geo: box(0.05, oy1 - oy0, 0.05), at: [P.cx - ow - 0.05, (oy0 + oy1) / 2, HX.z1 - 0.02] },
      { geo: box(0.05, oy1 - oy0, 0.05), at: [P.cx + ow + 0.05, (oy0 + oy1) / 2, HX.z1 - 0.02] },
      { geo: box(0.5, 0.06, 0.06), at: [HX.x1 + 0.2, SCREEN.y, SCREEN.z - 0.04] },
      { geo: box(P.w + 0.02, YT - P.yb, 0.04), at: [P.cx, (YT + P.yb) / 2, ZC] },
    ]
  }, [])
  return <Body id="paternoster-housing" c={c} fill={c.surface} edge={c.edge} pieces={pieces} />
}

/** Chains, sprockets and the glazing ticks on the front and the open side. */
function Rigging({ c }: { c: Tokens }) {
  const geo = useMemo(() => {
    const out: number[] = []
    const p = { y: 0, z: 0 }, q = { y: 0, z: 0 }
    for (const x of [P.cx - P.w / 2 - 0.04, P.cx + P.w / 2 + 0.04]) {
      const N = 96
      for (let k = 0; k < N; k++) {
        loop((k / N) * P.L, p); loop(((k + 1) / N) * P.L, q)
        out.push(x, p.y, p.z, x, q.y, q.z)
      }
      for (const yc of [P.yb, YT]) {
        const r = P.r - 0.1
        for (let k = 0; k < 24; k++) {
          const a0 = (k / 24) * Math.PI * 2, a1 = ((k + 1) / 24) * Math.PI * 2
          out.push(x, yc + r * Math.sin(a0), ZC + r * Math.cos(a0), x, yc + r * Math.sin(a1), ZC + r * Math.cos(a1))
        }
        for (let k = 0; k < 3; k++) {
          const a = (k / 3) * Math.PI
          out.push(x, yc + r * Math.sin(a), ZC + r * Math.cos(a), x, yc - r * Math.sin(a), ZC - r * Math.cos(a))
        }
      }
    }
    const hatch = (ax: number, ay: number, az: number, side: boolean) => {
      for (let k = 0; k < 3; k++) {
        const o = k * 0.12, l = k === 1 ? 0.5 : 0.3
        if (side) out.push(ax, ay + o, az - o, ax, ay + o + l, az - o - l)
        else out.push(ax + o, ay + o, az, ax + o + l, ay + o + l, az)
      }
    }
    hatch(P.cx - 1.1, 3.1, HX.z1 + 0.01, false)
    hatch(P.cx + 0.6, 0.6, HX.z1 + 0.01, false)
    hatch(HX.x1 + 0.01, 3.3, HX.z1 - 0.5, true)
    hatch(HX.x1 + 0.01, 0.7, HX.z1 - 0.8, true)
    return segs(out)
  }, [])
  useEffect(() => () => geo.dispose(), [geo])
  return <lineSegments geometry={geo} material={lineMat(c.dim)} />
}

function Screen({ aisles, active, matches, onOpen, c, tip, guard }: CabinetProps) {
  const tex = useMemo(() => textTexture(KEYS.px.w, KEYS.px.h, (ctx) => paintScreen(ctx, KEYS.px.w, KEYS.px.h, aisles, active, matches, c)), [aisles, active, matches, c])
  useEffect(() => () => tex.dispose(), [tex])
  const row = (e: ThreeEvent<PointerEvent | MouseEvent>) => {
    if (!e.uv) return -1
    const x = e.uv.x * KEYS.px.w, y = (1 - e.uv.y) * KEYS.px.h
    const col = Math.floor((x - KEYS.pad) / ((KEYS.px.w - KEYS.pad * 2) / KEYS.cols))
    const r = Math.floor((y - KEYS.header) / ((KEYS.px.h - KEYS.header - KEYS.pad) / keyRows(aisles.length)))
    const i = r * KEYS.cols + col
    return col >= 0 && col < KEYS.cols && r >= 0 && i < aisles.length ? i : -1
  }
  const hover = useRef(-1)
  return (
    <group position={[SCREEN.x, SCREEN.y, SCREEN.z]} rotation={[0, SCREEN.rot, 0]}>
      <Body id="paternoster-bezel" c={c} fill={c.surface} edge={c.edge} pieces={[{ geo: box(SCREEN.w + 0.1, SCREEN.h + 0.1, 0.06), at: [0, 0, -0.035] }]} />
      <mesh
        onClick={(e) => { e.stopPropagation(); const i = row(e); if (i >= 0 && !guard.moved) onOpen(i) }}
        onPointerMove={(e) => { e.stopPropagation(); const i = row(e); if (i !== hover.current) { hover.current = i; if (i >= 0) showAisle({ aisles, tip }, e.nativeEvent, i); else tip.hide() } tip.move(e.nativeEvent) }}
        onPointerOut={() => { hover.current = -1; tip.hide() }}
      >
        <planeGeometry args={[SCREEN.w, SCREEN.h]} />
        <meshBasicMaterial map={tex} toneMapped={false} />
      </mesh>
    </group>
  )
}

/** The "now serving" sign on the crown: the tray at the window, large enough to read from the overview. */
function Crown({ aisle, i, matches, c }: { aisle: Aisle; i: number; matches: number[] | null; c: Tokens }) {
  const tex = useMemo(
    () =>
      textTexture(1024, 188, (ctx) => {
        ctx.fillStyle = c.surface
        ctx.fillRect(0, 0, 1024, 188)
        ctx.strokeStyle = c.accent
        ctx.lineWidth = 4
        ctx.strokeRect(8, 8, 1008, 172)
        ctx.textBaseline = 'middle'
        ctx.fillStyle = c.accent
        ctx.font = `500 74px ${MONO}`
        ctx.fillText(code(aisle), 44, 98)
        const left = 44 + ctx.measureText('B00').width + 36
        ctx.textAlign = 'right'
        ctx.fillStyle = c.muted
        ctx.font = `400 46px ${FONT}`
        const count = `${countText(aisle, i, matches)} parts`
        ctx.fillText(count, 980, 100)
        const room = 980 - ctx.measureText(count).width - 30 - left
        ctx.textAlign = 'left'
        ctx.fillStyle = c.fg
        ctx.font = `500 80px ${FONT}`
        let label = aisle.label
        while (label.length > 3 && ctx.measureText(label).width > room) label = `${label.slice(0, -2)}…`
        ctx.fillText(label, left, 100)
      }),
    [aisle, i, matches, c],
  )
  useEffect(() => () => tex.dispose(), [tex])
  const pieces = useMemo((): Piece[] => [
    { geo: box(CROWN.w + 0.1, CROWN.h + 0.1, 0.08), at: [0, 0, -0.045] },
    { geo: box(0.06, CROWN.y - CROWN.h / 2 - H, 0.06), at: [-CROWN.w / 2 + 0.3, -(CROWN.y - H) / 2 - CROWN.h / 4, -0.05] },
    { geo: box(0.06, CROWN.y - CROWN.h / 2 - H, 0.06), at: [CROWN.w / 2 - 0.3, -(CROWN.y - H) / 2 - CROWN.h / 4, -0.05] },
  ], [])
  return (
    <group position={[P.cx, CROWN.y, HX.z1 - 0.3]}>
      <Body id="paternoster-crown" c={c} fill={c.surface} edge={c.edge} pieces={pieces} />
      <mesh>
        <planeGeometry args={[CROWN.w, CROWN.h]} />
        <meshBasicMaterial map={tex} toneMapped={false} />
      </mesh>
    </group>
  )
}

function Paternoster(props: CabinetProps) {
  const { aisles, active, matches, c } = props
  const n = aisles.length
  const atlas = useMemo(() => atlasLayout(n, KINDS), [n])
  const tex = useAtlasTexture(
    atlas,
    n,
    2,
    (ctx, i, k, w, h) => {
      if (k === 0) paintTag(ctx, w, h, aisles[i], i, { c, matches, active: i === active, size: h * 0.56 })
      else paintBed(ctx, w, h, aisles[i], !!matches && !matches[i], c)
    },
    [atlas, aisles, matches, active, c],
  )
  const st = useRef({ phase: active, vel: 0, off: new Float32Array(n), p: { y: 0, z: 0 } })
  if (st.current.off.length !== n) st.current.off = new Float32Array(n)
  const hover = useRef(-1)
  const spacing = P.L / Math.max(1, n)
  const tick = (dt: number) => {
    const s = st.current
    let delta = (((active - s.phase) % n) + n) % n
    if (delta > n / 2) delta -= n
    const parked = Math.abs(delta) < 0.01
    let moved = false, out = false
    for (let i = 0; i < n; i++) {
      const want = parked && i === active ? P.slide : parked && i === hover.current ? 0.07 : 0
      const next = reducedMotion ? want : damp(s.off[i], want, i === active ? 7 : 12, dt)
      if (Math.abs(next - s.off[i]) > 1e-4) moved = true
      s.off[i] = next
      if (i !== active && next > 0.05) out = true
    }
    if (reducedMotion) { s.phase = active; s.vel = 0; return moved }
    if (!out && (Math.abs(delta) > 1e-3 || Math.abs(s.vel) > 1e-3)) {
      const W = 4.2
      s.vel += (W * W * delta - 2 * W * s.vel) * dt
      s.vel = Math.max(-7, Math.min(7, s.vel))
      s.phase += s.vel * dt
      moved = true
    } else if (Math.abs(delta) <= 1e-3) {
      s.phase = active
      s.vel = 0
    }
    return moved
  }
  const place = (i: number, m: Matrix4) => {
    const s = st.current
    const p = loop(SW + (i - s.phase) * spacing, s.p)
    m.makeTranslation(P.cx, p.y, p.z + s.off[i])
  }
  const events = useMemo(() => aisleEvents(props, hover), [props.aisles, props.onOpen, props.tip, props.guard])
  return (
    <group>
      <Units n={n} pieces={TRAY} quads={QUADS} atlas={atlas} texture={tex} place={place} tick={tick} active={active} sphere={SPHERE} c={c} events={events} keyId="paternoster" />
      <Housing c={c} />
      <Rigging c={c} />
      <Screen {...props} />
      <Crown aisle={aisles[active]} i={active} matches={matches} c={c} />
    </group>
  )
}

export const paternoster: CabinetVariant = {
  id: 'paternoster',
  label: 'Paternoster',
  footprint: { x0: HX.x0, x1: SCREEN.x + SCREEN.w / 2 + 0.05, z0: HX.z0, z1: HX.z1 + 0.45, h: CROWN.y + CROWN.h / 2 },
  frame: [[HX.x0 - 0.2, 0.9, HX.z1], [HX.x0 - 0.2, H, HX.z0], [HX.x0 - 0.2, CROWN.y + 0.4, HX.z1], [SCREEN.x + 0.7, CROWN.y + 0.4, HX.z1], [SCREEN.x + 0.7, 0.9, HX.z1 + 0.6]],
  el: 16,
  drawer,
  Component: Paternoster,
}
