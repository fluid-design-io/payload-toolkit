import { useFrame, useThree } from '@react-three/fiber'
import type { ThreeEvent } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { BufferGeometry, Color, Float32BufferAttribute, Matrix4, Vector3 } from 'three'
import type { Group, InstancedMesh } from 'three'

import type { CabinetProps, CabinetVariant, Tokens } from '../../core/contract'
import { Body } from '../../core/scene'
import { FONT, MONO, box, fillMat, lineMat, reducedMotion, segs, textTexture, tint } from '../../core/three'
import type { Piece } from '../../core/three'
import { atlasLayout, code, countText, paintTag, paler, showAisle, useAtlasTexture } from './units'

/**
 * A parts vending machine: one spiral coil per aisle behind the glass, six
 * across and three high, each holding up to six packages tinted by aisle.
 * Opening an aisle vends from its coil: the spiral turns once, the row
 * advances a pitch and the front package drops to the flap, which is also
 * where parts off the table rest. The panel shows the selection as a code
 * you would key in.
 */
const M = { x0: -14.5, x1: -8.2, z0: -3.95, z1: -2.45, h: 4.9 }
const GLASS = { x0: -14.3, x1: -9.95, y0: 1.95, y1: 4.4 }
const GRID = { cols: 6, rows: 3, shelf: [3.68, 2.93, 2.18], lip: 0.2 }
const COIL = { r: 0.17, len: 1.05, turns: 6, seg: 18, front: M.z1 - 0.3 }
const SLOTS = 6
const PITCH = COIL.len / COIL.turns
const ITEM = { w: 0.24, h: 0.09, d: 0.11 }
const PANEL = { x: (GLASS.x1 + M.x1) / 2 + 0.05, y: 3.12, w: 1.6, h: 2.5 }
const FLAP = { x: (GLASS.x0 + GLASS.x1) / 2, y: 1.42, w: 3.0, h: 0.42 }
const VEND = reducedMotion ? 0 : 1.25
const cellW = (GLASS.x1 - GLASS.x0) / GRID.cols

const cellOf = (i: number) => ({ col: i % GRID.cols, row: Math.floor(i / GRID.cols) % GRID.rows })
const axis = (i: number) => { const { col, row } = cellOf(i); return { x: GLASS.x0 + (col + 0.5) * cellW, y: GRID.shelf[row] + 0.03 + COIL.r } }

function drawer(aisle: number, out: Vector3) {
  return out.set(FLAP.x + ((aisle % 6) - 2.5) * 0.42, FLAP.y - 0.12, M.z1 - 0.2)
}

/** A helix around +z through (0, 0), starting at the front, as line-segment pairs. */
function helix(out: number[], ox: number, oy: number) {
  const N = COIL.turns * COIL.seg
  for (let k = 0; k < N; k++) {
    const a0 = (k / COIL.seg) * Math.PI * 2, a1 = ((k + 1) / COIL.seg) * Math.PI * 2
    out.push(ox + COIL.r * Math.sin(a0), oy - COIL.r * Math.cos(a0), COIL.front - (k / N) * COIL.len, ox + COIL.r * Math.sin(a1), oy - COIL.r * Math.cos(a1), COIL.front - ((k + 1) / N) * COIL.len)
  }
  out.push(ox, oy - COIL.r, COIL.front - COIL.len, ox, oy - COIL.r - 0.03, COIL.front - COIL.len - 0.06)
}

function Housing({ c }: { c: Tokens }) {
  const pieces = useMemo((): Piece[] => {
    const W = M.x1 - M.x0, D = M.z1 - M.z0, cx = (M.x0 + M.x1) / 2, cz = (M.z0 + M.z1) / 2
    const gw = GLASS.x1 - GLASS.x0, gx = (GLASS.x0 + GLASS.x1) / 2
    const out: Piece[] = [
      { geo: box(W, 0.2, D), at: [cx, 0.1, cz] },
      { geo: box(W, 0.12, D), at: [cx, M.h - 0.06, cz] },
      { geo: box(W, M.h, 0.05), at: [cx, M.h / 2, M.z0 + 0.025] },
      { geo: box(0.06, M.h, D), at: [M.x0 + 0.03, M.h / 2, cz] },
      { geo: box(0.06, M.h, D), at: [M.x1 - 0.03, M.h / 2, cz] },
      { geo: box(gw + 0.2, GLASS.y0 - 0.2, 0.06), at: [gx, 0.2 + (GLASS.y0 - 0.2) / 2, M.z1 - 0.03] },
      { geo: box(gw + 0.2, M.h - 0.12 - GLASS.y1, 0.06), at: [gx, (GLASS.y1 + M.h - 0.12) / 2, M.z1 - 0.03] },
      { geo: box(M.x1 - GLASS.x1 - 0.06, M.h - 0.32, 0.06), at: [(GLASS.x1 + M.x1 - 0.06) / 2, 0.2 + (M.h - 0.32) / 2, M.z1 - 0.03] },
      { geo: box(0.1, GLASS.y1 - GLASS.y0, 0.08), at: [GLASS.x0 - 0.05, (GLASS.y0 + GLASS.y1) / 2, M.z1 - 0.02] },
      { geo: box(0.1, GLASS.y1 - GLASS.y0, 0.08), at: [GLASS.x1 + 0.05, (GLASS.y0 + GLASS.y1) / 2, M.z1 - 0.02] },
      { geo: box(FLAP.w, FLAP.h, 0.05), at: [FLAP.x, FLAP.y, M.z1 + 0.01] },
      { geo: box(FLAP.w + 0.16, 0.06, 0.12), at: [FLAP.x, FLAP.y + FLAP.h / 2 + 0.04, M.z1 + 0.03] },
      { geo: box(0.3, 0.5, 0.06), at: [PANEL.x + 0.45, 1.45, M.z1 + 0.01] },
    ]
    for (const y of GRID.shelf) {
      out.push({ geo: box(gw, 0.03, COIL.len + 0.2), at: [gx, y + 0.015, COIL.front - COIL.len / 2] })
      out.push({ geo: box(gw, GRID.lip, 0.03), at: [gx, y - GRID.lip / 2 + 0.03, COIL.front + 0.06] })
    }
    return out
  }, [])
  return <Body id="vending-housing" c={c} fill={c.surface} edge={c.edge} pieces={pieces} />
}

/** Every coil but the one vending, and the glazing ticks. */
function Coils({ n, active, c }: { n: number; active: number; c: Tokens }) {
  const geo = useMemo(() => {
    const out: number[] = []
    for (let i = 0; i < n; i++) if (i !== active) { const a = axis(i); helix(out, a.x, a.y) }
    const tick = (x: number, y: number) => {
      for (let k = 0; k < 3; k++) { const o = k * 0.1, l = k === 1 ? 0.42 : 0.26; out.push(x + o, y + o, M.z1 + 0.012, x + o + l, y + o + l, M.z1 + 0.012) }
    }
    tick(GLASS.x0 + 0.25, GLASS.y1 - 0.62)
    tick(GLASS.x1 - 0.9, GLASS.y0 + 0.06)
    return segs(out)
  }, [n, active])
  useEffect(() => () => geo.dispose(), [geo])
  return <lineSegments geometry={geo} material={lineMat(c.pin)} />
}

const tagQuad = (i: number) => {
  const a = axis(i), { row } = cellOf(i)
  const x0 = a.x - cellW / 2 + 0.04, x1 = a.x + cellW / 2 - 0.04, y0 = GRID.shelf[row] - GRID.lip + 0.05, y1 = GRID.shelf[row] + 0.01, z = COIL.front + 0.077
  return [x0, y0, z, x1, y0, z, x1, y1, z, x0, y1, z]
}
const TAG = [{ w: 512, h: 120 }] as const

function Tags({ aisles, active, matches, c }: Pick<CabinetProps, 'aisles' | 'active' | 'matches' | 'c'>) {
  const n = aisles.length
  const atlas = useMemo(() => atlasLayout(n, TAG), [n])
  const tex = useAtlasTexture(atlas, n, 1, (ctx, i, _k, w, h) => paintTag(ctx, w, h, aisles[i], i, { c, matches, active: i === active, size: h * 0.46, bg: i === active ? c.surface : undefined }), [atlas, aisles, matches, active, c])
  const geo = useMemo(() => {
    const pos: number[] = [], uv: number[] = [], idx: number[] = []
    for (let i = 0; i < n; i++) {
      pos.push(...tagQuad(i))
      const [u0, v0, u1, v1] = atlas.uv(i, 0)
      uv.push(u0, v0, u1, v0, u1, v1, u0, v1)
      idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3)
    }
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(pos, 3))
    g.setAttribute('uv', new Float32BufferAttribute(uv, 2))
    g.setIndex(idx)
    return g
  }, [n, atlas])
  useEffect(() => () => geo.dispose(), [geo])
  const hi = useMemo(() => {
    const q = tagQuad(Math.max(0, active))
    return segs([q[0], q[1], q[2], q[3], q[4], q[5], q[3], q[4], q[5], q[6], q[7], q[8], q[6], q[7], q[8], q[9], q[10], q[11], q[9], q[10], q[11], q[0], q[1], q[2]].map((v, k) => (k % 3 === 2 ? v + 0.002 : v)))
  }, [active])
  useEffect(() => () => hi.dispose(), [hi])
  return (
    <group>
      <mesh geometry={geo}>
        <meshBasicMaterial map={tex} toneMapped={false} />
      </mesh>
      {active >= 0 && <lineSegments geometry={hi} material={lineMat(c.accent)} />}
    </group>
  )
}

/** The keyed selection and the keypad. */
function Panel({ aisles, active, matches, c }: Pick<CabinetProps, 'aisles' | 'active' | 'matches' | 'c'>) {
  const a = aisles[active]
  const tex = useMemo(
    () =>
      textTexture(512, 800, (ctx) => {
        ctx.fillStyle = c.surface
        ctx.fillRect(0, 0, 512, 800)
        ctx.strokeStyle = c.edge
        ctx.lineWidth = 4
        ctx.strokeRect(24, 24, 464, 300)
        ctx.textBaseline = 'middle'
        ctx.fillStyle = c.muted
        ctx.font = `500 28px ${MONO}`
        ctx.fillText('SELECTION', 52, 64)
        ctx.textAlign = 'right'
        ctx.fillText(matches ? 'MATCHES' : 'IN STOCK', 460, 64)
        ctx.textAlign = 'left'
        ctx.fillStyle = c.accent
        ctx.font = `500 132px ${MONO}`
        ctx.fillText(a ? code(a) : '---', 48, 160)
        ctx.textAlign = 'right'
        ctx.font = `400 44px ${FONT}`
        ctx.fillStyle = matches && a && matches[active] ? c.accent : c.fg
        ctx.fillText(a ? countText(a, active, matches) : '', 460, 168)
        ctx.textAlign = 'left'
        ctx.fillStyle = c.fg
        ctx.font = `500 52px ${FONT}`
        let label = a?.label ?? ''
        while (label.length > 3 && ctx.measureText(label).width > 410) label = `${label.slice(0, -2)}…`
        ctx.fillText(label, 52, 262)
        const keys = ['F', 'C', 'B', '1', '2', '3', '4', '5', '6', '7', '8', '9', '◀', '0', '▶']
        const lit = new Set(a ? code(a).split('') : [])
        keys.forEach((k, j) => {
          const x = 52 + (j % 3) * 142, y = 372 + Math.floor(j / 3) * 82
          const on = lit.has(k)
          ctx.strokeStyle = on ? c.accent : c.edge
          ctx.lineWidth = on ? 5 : 3
          ctx.strokeRect(x, y, 124, 64)
          ctx.fillStyle = on ? c.accent : c.muted
          ctx.font = `500 36px ${MONO}`
          ctx.textAlign = 'center'
          ctx.fillText(k, x + 62, y + 34)
          ctx.textAlign = 'left'
        })
      }),
    [a, active, matches, c],
  )
  useEffect(() => () => tex.dispose(), [tex])
  return (
    <mesh position={[PANEL.x, PANEL.y, M.z1 + 0.004]}>
      <planeGeometry args={[PANEL.w, PANEL.h]} />
      <meshBasicMaterial map={tex} toneMapped={false} />
    </mesh>
  )
}

function Vending(props: CabinetProps) {
  const { aisles, active, matches, onOpen, c, tip, guard } = props
  const n = aisles.length
  const invalidate = useThree((s) => s.invalidate)
  const coil = useRef<Group>(null)
  const items = useRef<InstancedMesh>(null)
  const vend = useRef({ t: VEND, aisle: active })
  const last = useRef(active)
  if (last.current !== active) {
    last.current = active
    vend.current = { t: 0, aisle: active }
  }
  const stock = useMemo(() => aisles.map((a) => Math.min(SLOTS, a.count)), [aisles])
  const base = useMemo(() => stock.map((_, i) => stock.slice(0, i).reduce((a, b) => a + b, 0)), [stock])
  const total = stock.reduce((s, k) => s + k, 0)
  const activeCoil = useMemo(() => {
    const out: number[] = []
    helix(out, 0, 0)
    return segs(out)
  }, [])
  useEffect(() => () => activeCoil.dispose(), [activeCoil])
  const m = useMemo(() => ({ mat: new Matrix4(), color: new Color() }), [])
  const placeItems = (only: number, t: number) => {
    const im = items.current
    if (!im) return
    for (let i = 0; i < n; i++) {
      if (only >= 0 && i !== only) continue
      const a = axis(i), vending = i === vend.current.aisle && t < 1
      const e = vending ? t * t * (3 - 2 * t) : 0
      for (let k = 0; k < stock[i]; k++) {
        let z = COIL.front - (k + 0.5) * PITCH + e * PITCH
        const y0 = GRID.shelf[cellOf(i).row] + 0.03 + ITEM.h / 2 + 0.01
        let y = y0
        let s = 1
        if (vending && k === 0 && t > 0.55) {
          const f = (t - 0.55) / 0.45
          z += f * 0.1
          y = y0 + (FLAP.y - y0) * f * f
          s = Math.max(0.001, 1 - f * 0.6)
        }
        if (vending && k === stock[i] - 1 && stock[i] === SLOTS) s = Math.max(0.001, Math.min(1, (t - 0.6) / 0.4))
        m.mat.makeScale(ITEM.w * s, ITEM.h * s, ITEM.d * s).setPosition(a.x, y, z)
        im.setMatrixAt(base[i] + k, m.mat)
      }
    }
    im.instanceMatrix.needsUpdate = true
  }
  useLayoutEffect(() => {
    const im = items.current
    if (!im) return
    aisles.forEach((a, i) => {
      m.color.set(tint(a.hue, c.s, c.l)).multiplyScalar(matches && !matches[i] ? 0.5 : 1)
      for (let k = 0; k < stock[i]; k++) im.setColorAt(base[i] + k, m.color)
    })
    if (im.instanceColor) im.instanceColor.needsUpdate = true
    placeItems(-1, 1)
  }, [aisles, c, matches, stock, base])
  useFrame((_, dt) => {
    const v = vend.current
    const g = coil.current
    if (g) {
      const a = axis(Math.max(0, active))
      g.position.set(a.x, a.y, 0)
    }
    if (v.t >= 1 || VEND === 0) { v.t = 1; if (g) g.rotation.z = 0; return }
    v.t = Math.min(1, v.t + dt / VEND)
    const e = v.t * v.t * (3 - 2 * v.t)
    if (g) g.rotation.z = e * Math.PI * 2
    placeItems(v.aisle, v.t)
    if (v.t >= 1) placeItems(-1, 1)
    invalidate()
  })
  const hover = useRef(-1)
  const cell = (e: ThreeEvent<PointerEvent | MouseEvent>) => {
    const p = e.object.worldToLocal(e.point.clone())
    const col = Math.floor((p.x + (GLASS.x1 - GLASS.x0) / 2) / cellW)
    const y = p.y + (GLASS.y0 + GLASS.y1) / 2
    const row = GRID.shelf.findIndex((s) => y >= s - GRID.lip && y < s + 0.72)
    const i = row * GRID.cols + col
    return row >= 0 && col >= 0 && col < GRID.cols && i < n ? i : -1
  }
  return (
    <group>
      <Housing c={c} />
      <Coils n={n} active={active} c={c} />
      <group ref={coil}>
        <lineSegments geometry={activeCoil} material={lineMat(c.accent)} />
      </group>
      <instancedMesh key={total} ref={items} args={[undefined, undefined, Math.max(1, total)]} material={fillMat(paler(c), c.flat, c.rough)} frustumCulled={false} raycast={() => null}>
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>
      <Tags aisles={aisles} active={active} matches={matches} c={c} />
      <Panel aisles={aisles} active={active} matches={matches} c={c} />
      <mesh
        position={[(GLASS.x0 + GLASS.x1) / 2, (GLASS.y0 + GLASS.y1) / 2, M.z1 + 0.01]}
        onClick={(e) => { e.stopPropagation(); const i = cell(e); if (i >= 0 && !guard.moved) onOpen(i) }}
        onPointerMove={(e) => { e.stopPropagation(); const i = cell(e); if (i !== hover.current) { hover.current = i; if (i >= 0) showAisle({ aisles, tip }, e.nativeEvent, i); else tip.hide() } tip.move(e.nativeEvent) }}
        onPointerOut={() => { hover.current = -1; tip.hide() }}
      >
        <planeGeometry args={[GLASS.x1 - GLASS.x0, GLASS.y1 - GLASS.y0]} />
        <meshBasicMaterial color={c.surface} transparent opacity={0.08} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  )
}


export const vending: CabinetVariant = {
  id: 'vending',
  label: 'Vending',
  footprint: { x0: M.x0, x1: M.x1, z0: M.z0, z1: M.z1 + 0.1, h: M.h },
  frame: [[M.x0 - 0.2, 1.4, M.z1 + 0.3], [M.x0 - 0.2, M.h + 0.1, M.z0], [M.x1 + 0.2, M.h + 0.1, M.z1 + 0.3], [M.x1 + 0.2, 1.4, M.z1 + 0.8]],
  el: 16,
  drawer,
  Component: Vending,
}
