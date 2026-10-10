import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { Color, ExtrudeGeometry, Matrix4, Object3D, Shape, Vector3 } from 'three'
import type { InstancedMesh } from 'three'

import type { CabinetProps, CabinetVariant, Tokens } from '../../core/contract'
import { Body } from '../../core/scene'
import { FONT, MONO, box, fillMat, reducedMotion, textTexture, tint } from '../../core/three'
import type { Piece } from '../../core/three'
import type { Aisle } from '@/routes/lab/-lab/warehouse'
import { Units, aisleEvents, atlasLayout, code, damp, frontQuad, paintTag, paler, sphereAt, useAtlasTexture } from './units'

/**
 * A shadow board: hopper bins hang on a pegboard, one per aisle, in a
 * grid that reads like the rail (features, components, then blocks). A
 * bin's width grows with its aisle's part count on a log scale and the heap
 * inside shows how full it is, so the busiest aisles stand out at viral
 * scale. Opening an aisle lifts its bin off the hooks and tips it toward
 * the table; the outline painted behind it lights up where it hung.
 */
const B = { x0: -14.5, x1: -7.3, y0: 1.0, y1: 4.84, z: -2.775, rows: [3.78, 2.98, 2.18], pad: 0.12 }
const BIN = { h: 0.58, lip: 0.3, d: 0.46, t: 0.025 }
const OPEN = { lift: 0.3, out: 0.5, tilt: 0.24 }
const PX = 284

type Spot = { x: number; y: number; w: number; fill: number }
const COLS = 6
const CELL = (B.x1 - B.x0 - B.pad * 2) / COLS
/** Aisle i hangs in a fixed cell, so its place never depends on counts (the sim asks for it before the wall mounts). */
const cell = (i: number) => ({ x: B.x0 + B.pad + ((i % COLS) + 0.5) * CELL, y: B.rows[Math.floor(i / COLS) % B.rows.length] })
/** One cell per aisle in rail order; the bin's width inside its cell grows with its part count on a log scale. */
function layout(aisles: readonly Aisle[]): Spot[] {
  const counts = aisles.map((a) => Math.max(1, a.count))
  const lo = Math.log(Math.min(...counts)), hi = Math.log(Math.max(...counts))
  return aisles.map((_, i) => {
    const t = hi > lo ? (Math.log(counts[i]) - lo) / (hi - lo) : 0.5
    return { ...cell(i), w: 0.62 + (CELL - 0.12 - 0.62) * t, fill: t }
  })
}

function drawer(aisle: number, out: Vector3) {
  const s = cell(aisle)
  return out.set(s.x, s.y + OPEN.lift + 0.06, B.z + BIN.d / 2 + OPEN.out)
}

/** A unit-wide hopper bin, bottom centre at the origin, back against the board. */
const HOPPER: Piece[] = (() => {
  const side = new Shape()
  side.moveTo(-BIN.d / 2, 0)
  side.lineTo(BIN.d / 2, 0)
  side.lineTo(BIN.d / 2, BIN.lip)
  side.lineTo(-BIN.d / 2, BIN.h)
  side.closePath()
  const plate = new ExtrudeGeometry(side, { depth: BIN.t, bevelEnabled: false })
  const flat = (w: number, h: number, d: number) => box(w, h, d).toNonIndexed()
  return [
    { geo: flat(1, BIN.h, BIN.t), at: [0, BIN.h / 2, -BIN.d / 2 + BIN.t / 2] },
    { geo: flat(1, BIN.t, BIN.d), at: [0, BIN.t / 2, 0] },
    { geo: flat(1, BIN.lip, BIN.t), at: [0, BIN.lip / 2, BIN.d / 2 - BIN.t / 2] },
    { geo: plate, at: [-0.5 + BIN.t, 0, 0], rot: [0, -Math.PI / 2, 0] },
    { geo: plate.clone(), at: [0.5, 0, 0], rot: [0, -Math.PI / 2, 0] },
  ]
})()
const QUADS = [frontQuad(-0.46, 0.46, 0.025, BIN.lip - 0.025, BIN.d / 2 + 0.002)]
const KINDS = [{ w: 1024, h: 230 }] as const
const SPHERE = sphereAt((B.x0 + B.x1) / 2, (B.y0 + B.y1) / 2, B.z + 0.4, 5)

/** Pegboard holes, the outline of every bin's place with its code, and zone heads, painted once per layout. */
function paintBoard(ctx: CanvasRenderingContext2D, W: number, H: number, aisles: readonly Aisle[], spots: Spot[], active: number, c: Tokens) {
  const X = (x: number) => (x - B.x0) * PX, Y = (y: number) => (B.y1 - y) * PX
  ctx.fillStyle = c.surface
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = c.dim
  const pitch = 0.1 * PX
  for (let y = pitch / 2; y < H; y += pitch) for (let x = pitch / 2; x < W; x += pitch) { ctx.beginPath(); ctx.arc(x, y, 2.6, 0, Math.PI * 2); ctx.fill() }
  ctx.textBaseline = 'alphabetic'
  aisles.forEach((a, i) => {
    const s = spots[i]
    if (!s) return
    const on = i === active
    const x0 = X(s.x - s.w / 2), x1 = X(s.x + s.w / 2), y0 = Y(s.y + BIN.h), y1 = Y(s.y)
    ctx.fillStyle = c.surface
    ctx.fillRect(x0 - 6, y0 - 66, x1 - x0 + 12, y1 - y0 + 72)
    ctx.setLineDash(on ? [] : [14, 10])
    ctx.lineWidth = on ? 6 : 3
    ctx.strokeStyle = on ? c.accent : c.dim
    ctx.beginPath()
    ctx.moveTo(x0, y0); ctx.lineTo(x1, y0); ctx.lineTo(x1, Y(s.y + BIN.lip)); ctx.lineTo(x1, y1); ctx.lineTo(x0, y1); ctx.closePath()
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = on ? c.accent : c.muted
    ctx.font = `500 52px ${MONO}`
    ctx.fillText(code(a), x0 + 4, y0 - 14)
    if (on) {
      ctx.font = `500 46px ${FONT}`
      ctx.fillStyle = c.accent
      ctx.textBaseline = 'middle'
      ctx.textAlign = 'center'
      ctx.fillText(a.label.length > 14 ? `${a.label.slice(0, 13)}…` : a.label, (x0 + x1) / 2, (y0 + y1) / 2)
      ctx.textAlign = 'left'
      ctx.textBaseline = 'alphabetic'
    }
  })
  const heads: { x: number; y: number; text: string }[] = []
  aisles.forEach((a, i) => { if (spots[i] && (i === 0 || a.zone !== aisles[i - 1].zone)) heads.push({ x: spots[i].x - spots[i].w / 2, y: spots[i].y, text: a.zone }) })
  ctx.fillStyle = c.muted
  ctx.font = `500 30px ${MONO}`
  ctx.fillText(`PARTS WALL · ${aisles.length} AISLES · ${aisles.reduce((n, a) => n + a.count, 0).toLocaleString()} PARTS`, X(B.x0 + B.pad), Y(B.y1 - 0.16))
  ctx.textAlign = 'right'
  ctx.fillText('F FEATURES · C COMPONENTS · B BLOCKS', X(B.x1 - B.pad), Y(B.y1 - 0.16))
  ctx.textAlign = 'left'
  ctx.fillStyle = c.dim
  ctx.fillRect(X(B.x0 + B.pad), Y(B.y1 - 0.24), X(B.x1 - B.pad) - X(B.x0 + B.pad), 3)
  for (const h of heads) {
    ctx.fillStyle = c.edge
    ctx.fillRect(X(h.x) - 18, Y(h.y + BIN.h + 0.22), 4, (BIN.h + 0.22) * PX)
  }
}

function Frame({ c, spots: at }: { c: Tokens; spots: Spot[] }) {
  const key = at.map((s) => `${s.x.toFixed(2)}:${s.y}:${s.w.toFixed(2)}`).join('|')
  const pieces = useMemo((): Piece[] => {
    const W = B.x1 - B.x0, Hb = B.y1 - B.y0
    const out: Piece[] = [
      { geo: box(W, Hb, 0.05), at: [(B.x0 + B.x1) / 2, (B.y0 + B.y1) / 2, B.z - 0.027] },
      { geo: box(0.14, B.y1 + 0.2, 0.14), at: [B.x0 - 0.07, (B.y1 + 0.2) / 2, B.z - 0.09] },
      { geo: box(0.14, B.y1 + 0.2, 0.14), at: [B.x1 + 0.07, (B.y1 + 0.2) / 2, B.z - 0.09] },
      { geo: box(0.2, 0.08, 0.9), at: [B.x0 - 0.07, 0.04, B.z - 0.09] },
      { geo: box(0.2, 0.08, 0.9), at: [B.x1 + 0.07, 0.04, B.z - 0.09] },
      { geo: box(W + 0.42, 0.12, 0.24), at: [(B.x0 + B.x1) / 2, B.y1 + 0.14, B.z - 0.06] },
    ]
    for (const s of at) {
      for (const dx of [-s.w / 2 + 0.12, s.w / 2 - 0.12]) out.push({ geo: box(0.03, 0.03, 0.1), at: [s.x + dx, s.y + BIN.h - 0.06, B.z + 0.05] })
    }
    return out
  }, [key])
  return <Body id={`pegboard-frame-${key}`} c={c} fill={c.surface} edge={c.edge} pieces={pieces} />
}

function Board({ aisles, at, active, c }: { aisles: readonly Aisle[]; at: Spot[]; active: number; c: Tokens }) {
  const W = Math.round((B.x1 - B.x0) * PX), H = Math.round((B.y1 - B.y0) * PX)
  const tex = useMemo(() => textTexture(W, H, (ctx) => paintBoard(ctx, W, H, aisles, at, active, c)), [aisles, at, active, c])
  useEffect(() => () => tex.dispose(), [tex])
  return (
    <mesh position={[(B.x0 + B.x1) / 2, (B.y0 + B.y1) / 2, B.z + 0.001]}>
      <planeGeometry args={[B.x1 - B.x0, B.y1 - B.y0]} />
      <meshBasicMaterial map={tex} toneMapped={false} />
    </mesh>
  )
}

function Pegboard(props: CabinetProps) {
  const { aisles, active, matches, c } = props
  const n = aisles.length
  const at = useMemo(() => layout(aisles), [aisles])
  const atlas = useMemo(() => atlasLayout(n, KINDS), [n])
  const tex = useAtlasTexture(atlas, n, 1, (ctx, i, _k, w, h) => paintTag(ctx, w, h, aisles[i], i, { c, matches, active: i === active, squeeze: 1 / at[i].w, size: h * 0.5 }), [atlas, aisles, matches, active, c, at])
  const st = useRef({ open: new Float32Array(n), hov: new Float32Array(n) })
  if (st.current.open.length !== n) st.current = { open: new Float32Array(n), hov: new Float32Array(n) }
  const hover = useRef(-1)
  const heap = useRef<InstancedMesh>(null)
  const tmp = useMemo(() => ({ o: new Object3D(), local: new Matrix4(), color: new Color() }), [])
  const tick = (dt: number) => {
    const s = st.current
    let moved = false
    for (let i = 0; i < n; i++) {
      const o = i === active ? 1 : 0, h = i === hover.current && i !== active ? 1 : 0
      const no = reducedMotion ? o : damp(s.open[i], o, 6, dt), nh = reducedMotion ? h : damp(s.hov[i], h, 14, dt)
      if (Math.abs(no - s.open[i]) > 1e-4 || Math.abs(nh - s.hov[i]) > 1e-4) moved = true
      s.open[i] = no; s.hov[i] = nh
    }
    return moved
  }
  const place = (i: number, m: Matrix4) => {
    const s = st.current, p = at[i], k = s.open[i], e = k * k * (3 - 2 * k)
    const o = tmp.o
    o.position.set(p.x, p.y + OPEN.lift * e + 0.03 * s.hov[i], B.z + BIN.d / 2 + OPEN.out * e + 0.05 * s.hov[i])
    o.rotation.set(OPEN.tilt * e, 0, 0)
    o.scale.set(p.w, 1, 1)
    o.updateMatrix()
    m.copy(o.matrix)
    const hm = heap.current
    if (hm) {
      const fill = 0.05 + 0.14 * p.fill
      tmp.local.makeScale(0.88, fill, BIN.d * 0.8).setPosition(0, BIN.t + fill / 2, -0.02)
      hm.setMatrixAt(i, tmp.local.premultiply(m))
      hm.instanceMatrix.needsUpdate = true
    }
  }
  useLayoutEffect(() => {
    const hm = heap.current
    if (!hm) return
    aisles.forEach((a, i) => hm.setColorAt(i, tmp.color.set(tint(a.hue, c.s, c.l)).multiplyScalar(matches && !matches[i] ? 0.55 : 1)))
    if (hm.instanceColor) hm.instanceColor.needsUpdate = true
  }, [aisles, c, matches, n])
  const events = useMemo(() => aisleEvents(props, hover), [props.aisles, props.onOpen, props.tip, props.guard])
  return (
    <group>
      <Units n={n} pieces={HOPPER} quads={QUADS} atlas={atlas} texture={tex} place={place} tick={tick} active={active} sphere={SPHERE} c={c} events={events} keyId={`peg-${at.map((s) => s.w.toFixed(2)).join(',')}`} />
      <instancedMesh key={n} ref={heap} args={[undefined, undefined, n]} material={fillMat(paler(c), c.flat, c.rough)} frustumCulled={false} raycast={() => null}>
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>
      <Board aisles={aisles} at={at} active={active} c={c} />
      <Frame c={c} spots={at} />
    </group>
  )
}

export const pegboard: CabinetVariant = {
  id: 'pegboard',
  label: 'Pegboard',
  footprint: { x0: B.x0 - 0.25, x1: B.x1 + 0.25, z0: B.z - 0.5, z1: B.z + BIN.d + OPEN.out, h: B.y1 + 0.2 },
  frame: [[B.x0 - 0.2, 1.4, B.z + 0.5], [B.x0 - 0.2, B.y1 + 0.3, B.z - 0.2], [B.x1 + 0.2, B.y1 + 0.3, B.z + 0.5], [B.x1 + 0.2, 1.4, B.z + 0.9]],
  el: 16,
  drawer,
  Component: Pegboard,
}
