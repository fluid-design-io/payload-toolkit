import { useFrame } from '@react-three/fiber'
import type { ThreeEvent } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  BoxGeometry, BufferGeometry, Color, CylinderGeometry, EdgesGeometry, Float32BufferAttribute, Group,
  LineBasicMaterial, LineSegments, MeshBasicMaterial, PointsMaterial, TorusGeometry,
} from 'three'
import type { Texture } from 'three'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js'
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import { agents, databases, frameworks, packageManagers } from '../../../../../workspace/-workspace/workspace.constants'
import type { Setup } from '../../../../../workspace/-workspace/workspace.types'
import type { Lab } from '../../../lab.types'
import {
  BANDS, BOARD, COMPONENT_BAND, FEATURE_BAND, GHOSTS, ZONES, bandTop, blockX, footprints, laneX, rowZ, traceOf,
} from './board'
import type { BoardState, Chip as ChipId, Seat } from './board'
import { FONT, MONO, fitText, textTexture } from './look'
import type { Guard, Look, Tip } from './look'

const Y = BOARD.y
const SLAB = 0.08
const W = BOARD.x1 - BOARD.x0
const D = BOARD.z1 - BOARD.z0
const CLAUDE = { fill: '#D97757', edge: '#8C3F25' }

type Vec = [number, number, number]
type Shape = { at: Vec; box?: Vec; cyl?: [number, number]; ring?: [number, number]; fill?: string; edge?: string }
type Stroke = { pts: number[]; color?: string }
type Solid = { fill: BufferGeometry; edges: BufferGeometry }

function paint(g: BufferGeometry, color: string) {
  const c = new Color(color)
  const n = g.getAttribute('position').count
  const a = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3)
  g.setAttribute('color', new Float32BufferAttribute(a, 3))
  return g
}

function circle(cx: number, y: number, cz: number, r: number, seg = 28) {
  const pts: number[] = []
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * Math.PI * 2, b = ((i + 1) / seg) * Math.PI * 2
    pts.push(cx + Math.cos(a) * r, y, cz + Math.sin(a) * r, cx + Math.cos(b) * r, y, cz + Math.sin(b) * r)
  }
  return pts
}

/** One fill mesh and one edge mesh per chip, colored per vertex so a chip costs two draw calls whatever its detail. */
function solid(shapes: Shape[], fill: string, edge: string, strokes: Stroke[] = []): Solid {
  const fills: BufferGeometry[] = []
  const lines: number[] = []
  const colors: number[] = []
  const col = new Color()
  const line = (pts: number[], color: string) => {
    col.set(color)
    lines.push(...pts)
    for (let i = 0; i < pts.length / 3; i++) colors.push(col.r, col.g, col.b)
  }
  for (const s of shapes) {
    let g: BufferGeometry
    if (s.box) g = new BoxGeometry(...s.box)
    else if (s.cyl) g = new CylinderGeometry(s.cyl[0], s.cyl[0], s.cyl[1], 28)
    else g = new TorusGeometry(s.ring![0], s.ring![1], 10, 36).rotateX(Math.PI / 2)
    g.translate(...s.at)
    if (s.ring) {
      line(circle(s.at[0], s.at[1], s.at[2], s.ring[0] + s.ring[1]), s.edge ?? edge)
      line(circle(s.at[0], s.at[1], s.at[2], s.ring[0] - s.ring[1]), s.edge ?? edge)
    } else {
      const e = new EdgesGeometry(g, 30)
      line(Array.from(e.getAttribute('position').array), s.edge ?? edge)
      e.dispose()
    }
    g.deleteAttribute('normal')
    g.deleteAttribute('uv')
    fills.push(paint(g, s.fill ?? fill))
  }
  for (const s of strokes) line(s.pts, s.color ?? edge)
  const merged = mergeGeometries(fills)!
  fills.forEach((g) => g.dispose())
  const edges = new BufferGeometry()
  edges.setAttribute('position', new Float32BufferAttribute(lines, 3))
  edges.setAttribute('color', new Float32BufferAttribute(colors, 3))
  return { fill: merged, edges }
}

function useDispose(...items: ({ dispose: () => void } | null | undefined)[]) {
  useEffect(() => () => items.forEach((i) => i?.dispose()), items)
}

type Mats = ReturnType<typeof materials>
function materials(c: Look) {
  const dot = textTexture(32, 32, (ctx) => {
    ctx.fillStyle = '#fff'
    ctx.beginPath()
    ctx.arc(16, 16, 14, 0, Math.PI * 2)
    ctx.fill()
  })
  return {
    fill: new MeshBasicMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1, toneMapped: false }),
    line: new LineBasicMaterial({ vertexColors: true, toneMapped: false }),
    hot: new LineBasicMaterial({ color: c.accent, toneMapped: false }),
    footprint: new LineBasicMaterial({ color: c.dark ? c.muted : c.edge, transparent: true, opacity: 0.55, toneMapped: false }),
    trace: new LineBasicMaterial({ color: c.dark ? c.dim : '#88A9CB', toneMapped: false }),
    lit: new LineMaterial({ color: new Color(c.accent).getHex(), linewidth: 2, toneMapped: false }),
    pulse: new PointsMaterial({ color: c.accent, size: 7, sizeAttenuation: false, map: dot, transparent: true, alphaTest: 0.4, depthTest: false, toneMapped: false }),
    dot,
  }
}

const seg = (out: number[], x0: number, z0: number, x1: number, z1: number, y: number) => out.push(x0, y, z0, x1, y, z1)
const rect = (out: number[], x0: number, z0: number, x1: number, z1: number, y: number) => {
  seg(out, x0, z0, x1, z0, y); seg(out, x1, z0, x1, z1, y); seg(out, x1, z1, x0, z1, y); seg(out, x0, z1, x0, z0, y)
}
function brackets(out: number[], x: number, z: number, hw: number, hd: number, k: number, y: number) {
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const cx = x + sx * hw, cz = z + sz * hd
    seg(out, cx, cz, cx - sx * k, cz, y)
    seg(out, cx, cz, cx, cz - sz * k, y)
  }
}
const lines = (pts: number[]) => {
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pts, 3))
  return g
}

function footprintGeometry(target: Setup['target']) {
  const out: number[] = []
  const y = Y + 0.003
  const { blocks, feature, passive } = ZONES
  for (const s of footprints(target)) {
    if (s.band === FEATURE_BAND) {
      const h = feature.size / 2 + 0.02
      brackets(out, s.x, s.z, h, h, 0.12, y)
      for (let i = 0; i < 8; i++) {
        const x = s.x - 0.21 + i * 0.06
        seg(out, x, s.z - h + 0.05, x, s.z - h + 0.1, y)
      }
      rect(out, s.x - h + 0.05, s.z + h - 0.1, s.x - h + 0.1, s.z + h - 0.05, y)
      rect(out, s.x + h - 0.1, s.z + h - 0.1, s.x + h - 0.05, s.z + h - 0.05, y)
    } else if (s.band === COMPONENT_BAND) {
      const h = passive.size / 2
      rect(out, s.x - h, s.z - 0.07, s.x - h + 0.08, s.z + 0.07, y)
      rect(out, s.x + h - 0.08, s.z - 0.07, s.x + h, s.z + 0.07, y)
    } else {
      const hw = blocks.w / 2 + 0.02, hd = blocks.d / 2 + 0.02
      brackets(out, s.x, s.z, hw, hd, 0.07, y)
      for (let i = 0; i < 6; i++) {
        const x = s.x - 0.15 + i * 0.06
        seg(out, x, s.z - hd + 0.01, x, s.z - hd + 0.05, y)
        seg(out, x, s.z + hd - 0.05, x, s.z + hd - 0.01, y)
      }
    }
  }
  if (target === 'existing')
    for (const g of GHOSTS) {
      const x0 = blockX(g.col) - blocks.w / 2 - 0.02, x1 = blockX(g.col + g.span - 1) + blocks.w / 2 + 0.02
      const z0 = rowZ(g.band) - blocks.d / 2 - 0.02, z1 = rowZ(g.band) + blocks.d / 2 + 0.02
      rect(out, x0, z0, x1, z1, y)
      const h = z1 - z0
      for (let x = x0 - h + 0.05; x < x1; x += 0.05) {
        const a = Math.max(x, x0), b = Math.min(x + h, x1)
        if (b > a) seg(out, a, z1 - (a - x), b, z1 - (b - x), y)
      }
    }
  return lines(out)
}

function traceGeometry(target: Setup['target']) {
  const out: number[] = []
  const y = Y + 0.002
  for (const s of footprints(target)) {
    const t = traceOf(s)
    for (let i = 2; i < t.length; i += 2) seg(out, t[i - 2], t[i - 1], t[i], t[i + 1], y)
  }
  const { cpu, pwr, mem } = ZONES
  for (let i = 0; i < 3; i++) {
    const x = cpu.x - 0.4 + i * 0.4
    for (const d of [-0.035, 0.035]) seg(out, x + d, pwr.z1, x + d, cpu.z - cpu.half, y)
  }
  for (let i = 0; i < 9; i++) {
    const z = cpu.z - 0.56 + i * 0.14
    seg(out, mem.x1, z, cpu.x - cpu.half, z, y)
  }
  return lines(out)
}

type Route = { pts: number[]; cum: number[]; len: number }
const routeKey = (s: Seat) => `${s.band}:${s.x.toFixed(3)}:${s.z.toFixed(3)}`
function routeOf(cache: Map<string, Route>, seat: Seat) {
  const key = routeKey(seat)
  let r = cache.get(key)
  if (r) return r
  const pts = traceOf(seat)
  const cum = [0]
  for (let i = 2; i < pts.length; i += 2) cum.push(cum[cum.length - 1] + Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]))
  r = { pts, cum, len: cum[cum.length - 1] }
  cache.set(key, r)
  return r
}
function sample(r: Route, d: number, out: Float32Array, at: number) {
  const k = Math.max(0, Math.min(r.len, d))
  let i = 1
  while (i < r.cum.length - 1 && r.cum[i] < k) i++
  const f = (k - r.cum[i - 1]) / (r.cum[i] - r.cum[i - 1] || 1)
  out[at] = r.pts[(i - 1) * 2] + (r.pts[i * 2] - r.pts[(i - 1) * 2]) * f
  out[at + 1] = Y + 0.01
  out[at + 2] = r.pts[(i - 1) * 2 + 1] + (r.pts[i * 2 + 1] - r.pts[(i - 1) * 2 + 1]) * f
}

const TRAIL = [0, 0.06, 0.12]

function Signals({ state, mats }: { state: { current: BoardState }; mats: Mats }) {
  const cache = useMemo(() => new Map<string, Route>(), [])
  const lit = useMemo(() => {
    const l = new LineSegments2(new LineSegmentsGeometry(), mats.lit)
    l.frustumCulled = false
    l.visible = false
    return l
  }, [mats.lit])
  useEffect(() => () => lit.geometry.dispose(), [lit])
  const pulses = useMemo(() => {
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(new Float32Array(64 * 3 * TRAIL.length), 3))
    g.setDrawRange(0, 0)
    return g
  }, [])
  useDispose(pulses)
  const sig = useRef(-1)
  const drawn = useRef(0)
  useFrame(() => {
    const s = state.current
    if (s.version !== sig.current) {
      sig.current = s.version
      const seen = new Set<string>()
      const out: number[] = []
      for (const v of s.seated.values()) {
        const key = routeKey(v.seat)
        if (seen.has(key)) continue
        seen.add(key)
        const t = routeOf(cache, v.seat).pts
        for (let i = 2; i < t.length; i += 2) out.push(t[i - 2], Y + 0.005, t[i - 1], t[i], Y + 0.005, t[i + 1])
      }
      lit.geometry.dispose()
      lit.geometry = new LineSegmentsGeometry()
      if (out.length) lit.geometry.setPositions(out)
      lit.visible = out.length > 0
    }
    const n = s.pulses.length * TRAIL.length
    if (!n && !drawn.current) return
    let attr = pulses.getAttribute('position') as Float32BufferAttribute
    if (n * 3 > attr.array.length) {
      attr = new Float32BufferAttribute(new Float32Array(n * 6), 3)
      pulses.setAttribute('position', attr)
    }
    const arr = attr.array as Float32Array
    for (let i = 0; i < s.pulses.length; i++) {
      const p = s.pulses[i]
      const r = routeOf(cache, p.seat)
      for (let k = 0; k < TRAIL.length; k++) sample(r, p.t * r.len - TRAIL[k], arr, (i * TRAIL.length + k) * 3)
    }
    attr.needsUpdate = true
    pulses.setDrawRange(0, n)
    drawn.current = n
  })
  return (
    <>
      <primitive object={lit} />
      <points geometry={pulses} material={mats.pulse} frustumCulled={false} renderOrder={2} />
    </>
  )
}

const toPx = (x: number, z: number, px: number) => [(x - BOARD.x0) * px, (z - BOARD.z0) * px] as const

function silkArt(c: Look, setup: Setup) {
  const PX = 2048 / W
  const H = Math.round(D * PX)
  const ink = c.muted
  return textTexture(2048, H, (ctx) => {
    const font = (size: number, weight = 600, family = FONT, track = 0.12) => {
      ctx.font = `${weight} ${size * PX}px ${family}`
      ctx.letterSpacing = `${size * PX * track}px`
    }
    const text = (s: string, x: number, z: number, align: CanvasTextAlign = 'left') => {
      const [px, pz] = toPx(x, z, PX)
      ctx.textAlign = align
      ctx.fillText(s, px, pz)
    }
    const box = (x0: number, z0: number, x1: number, z1: number, r = 0.05) => {
      const [a, b] = toPx(x0, z0, PX)
      ctx.beginPath()
      ctx.roundRect(a, b, (x1 - x0) * PX, (z1 - z0) * PX, r * PX)
      ctx.stroke()
    }
    const hline = (x0: number, x1: number, z: number) => {
      const [a, b] = toPx(x0, z, PX)
      ctx.beginPath()
      ctx.moveTo(a, b)
      ctx.lineTo(a + (x1 - x0) * PX, b)
      ctx.stroke()
    }
    const ring = (x: number, z: number, r: number, fill = false) => {
      const [a, b] = toPx(x, z, PX)
      ctx.beginPath()
      ctx.arc(a, b, r * PX, 0, Math.PI * 2)
      if (fill) ctx.fill()
      else ctx.stroke()
    }
    const { bands, cpu, mem, pwr, feature, passive, j1, title } = ZONES
    ctx.fillStyle = ink
    ctx.strokeStyle = ink
    ctx.lineWidth = 2

    for (const [x, z] of [[BOARD.x0 + 0.3, BOARD.z0 + 0.3], [BOARD.x1 - 0.3, BOARD.z0 + 0.3], [BOARD.x0 + 0.3, BOARD.z1 - 0.3], [BOARD.x1 - 0.3, BOARD.z1 - 0.3]]) {
      ring(x, z, 0.16)
      ring(x, z, 0.1)
    }
    for (const [x, z] of [[BOARD.x1 - 0.75, BOARD.z0 + 0.2], [BOARD.x0 + 0.2, BOARD.z1 - 0.75]]) {
      ring(x, z, 0.06, true)
      ring(x, z, 0.11)
    }

    ctx.fillStyle = c.grid
    ctx.globalAlpha = c.dark ? 0.7 : 0.55
    for (const f of footprints(setup.target)) {
      const [hw, hd] = f.band === FEATURE_BAND ? [feature.size / 2, feature.size / 2] : f.band === COMPONENT_BAND ? [passive.size / 2, 0.08] : [ZONES.blocks.w / 2, ZONES.blocks.d / 2]
      const [px, pz] = toPx(f.x - hw, f.z - hd, PX)
      ctx.beginPath()
      ctx.roundRect(px, pz, hw * 2 * PX, hd * 2 * PX, 0.02 * PX)
      ctx.fill()
    }
    if (setup.target === 'existing')
      for (const g of GHOSTS) {
        const [px, pz] = toPx(blockX(g.col) - ZONES.blocks.w / 2, rowZ(g.band) - ZONES.blocks.d / 2, PX)
        ctx.fillRect(px, pz, (g.span * ZONES.blocks.pitch - (ZONES.blocks.pitch - ZONES.blocks.w)) * PX, ZONES.blocks.d * PX)
      }
    ctx.globalAlpha = 1
    ctx.fillStyle = ink

    font(0.085)
    text('PAGE · TOP TO BOTTOM', bands.x0 + 0.05, bands.z0 - 0.09)
    ctx.setLineDash([10, 8])
    ctx.globalAlpha = 0.6
    for (let b = 1; b < BANDS.length; b++) hline(bands.x0, bands.x1, bandTop(b))
    ctx.setLineDash([])
    ctx.globalAlpha = 1
    BANDS.forEach((band, b) => {
      const top = bandTop(b)
      font(0.15, 600, MONO, 0)
      ctx.fillStyle = c.fg
      text(String(b + 1).padStart(2, '0'), bands.x0 + 0.05, top + 0.4)
      ctx.fillStyle = ink
      font(0.075)
      text(band.label, bands.x0 + 0.05, top + 0.54)
      font(0.058, 500, MONO, 0)
      ctx.globalAlpha = 0.75
      text(fitText(ctx, band.groups.join(' '), 0.68 * PX), bands.x0 + 0.05, top + 0.65)
      ctx.globalAlpha = 1
    })
    if (setup.target === 'existing') {
      font(0.058, 600, MONO, 0)
      for (const g of GHOSTS) {
        const x0 = blockX(g.col) - ZONES.blocks.w / 2 + 0.03
        const [px, pz] = toPx(x0, rowZ(g.band) + 0.03, PX)
        ctx.fillStyle = c.bg
        ctx.fillRect(px - 5, pz - 0.062 * PX, ctx.measureText(g.title).width + 10, 0.085 * PX)
        ctx.fillStyle = c.fg
        text(g.title, x0, rowZ(g.band) + 0.03)
      }
      ctx.fillStyle = ink
    }

    const zone = (x0: number, z0: number, x1: number, z1: number, label: string, at: 'top' | 'bottom' | 'side') => {
      box(x0, z0, x1, z1, 0.06)
      font(0.075)
      const w = ctx.measureText(label).width
      if (at !== 'side') {
        const z = at === 'top' ? z0 : z1
        const [px, pz] = toPx(x0 + 0.08, z - 0.05, PX)
        ctx.clearRect(px - 6, pz, w + 12, 0.1 * PX)
        text(label, x0 + 0.1, z + 0.025)
        return
      }
      const [px, pz] = toPx(x0, z1 - 0.12, PX)
      ctx.clearRect(px - 0.05 * PX, pz - w - 6, 0.1 * PX, w + 12)
      ctx.save()
      ctx.translate(px + 0.026 * PX, pz)
      ctx.rotate(-Math.PI / 2)
      ctx.textAlign = 'left'
      ctx.fillText(label, 0, 0)
      ctx.restore()
    }
    ctx.globalAlpha = 0.9
    zone(pwr.x0 - 0.04, pwr.z0 + 0.04, pwr.x1 + 0.04, pwr.z1, `PWR · ${setup.packageManager.toUpperCase()}`, 'bottom')
    zone(feature.x0 - 0.1, feature.z0 - 0.08, feature.x1 + 0.07, feature.z1 + 0.08, 'FEATURE BAY', 'side')
    zone(passive.x0 - 0.07, passive.z0 - 0.12, passive.x1 + 0.07, passive.z1 + 0.2, 'PASSIVES', 'top')
    ctx.globalAlpha = 1
    font(0.075)
    text('CPU0', cpu.x + cpu.half, cpu.z + cpu.half + 0.24, 'right')
    text(`MEM · ${setup.database === 'postgres' ? 'PGSQL' : 'MONGO'}`, mem.x0, cpu.z + cpu.half + 0.24)
    text('J1 DEBUG', j1.x + 0.5, j1.z - 0.04)
    font(0.06, 500, MONO, 0)
    ctx.globalAlpha = 0.8
    text(setup.agent === 'none' ? 'no probe' : `${agents.find((a) => a.value === setup.agent)?.label.toLowerCase()} attached`, j1.x + 0.5, j1.z + 0.07)
    ctx.globalAlpha = 1

    ctx.strokeStyle = c.dim
    ctx.lineWidth = 3
    for (let b = 0; b < BANDS.length; b++) ring(laneX(b), bandTop(b) + 0.16, 0.035)

    ctx.strokeStyle = ink
    ctx.lineWidth = 2
    box(title.x0, title.z0, title.x1, title.z1, 0.03)
    hline(title.x0, title.x1, title.z0 + 0.3)
    const cmd = setup.target === 'existing' ? 'payload-toolkit add · rework' : `payload-toolkit init · ${setup.name || 'my-app'} · blank board`
    font(0.11, 500, MONO, 0)
    ctx.fillStyle = c.fg
    text(fitText(ctx, cmd, (title.x1 - title.x0 - 0.2) * PX), title.x0 + 0.1, title.z0 + 0.2)
    ctx.fillStyle = ink
    font(0.058)
    text('APP BOARD', title.x0 + 0.1, title.z1 - 0.06)
    text('REV 4 · TOP · 1:1', title.x1 - 0.1, title.z1 - 0.06, 'right')
  })
}

function cpuArt(c: Look, label: string, w: number, d: number) {
  const S = 512
  const H = Math.round((S * d) / w)
  return textTexture(S, H, (ctx) => {
    ctx.fillStyle = c.chip
    ctx.fillRect(0, 0, S, H)
    ctx.fillStyle = c.chipFg
    ctx.beginPath()
    ctx.moveTo(22, 22)
    ctx.lineTo(54, 22)
    ctx.lineTo(22, 54)
    ctx.fill()
    ctx.font = `600 30px ${MONO}`
    ctx.textAlign = 'right'
    ctx.fillText('CPU0', S - 24, 48)
    ctx.textAlign = 'center'
    ctx.letterSpacing = '-1px'
    const size = H > 400 ? 84 : 64
    ctx.font = `600 ${size}px ${FONT}`
    const words = label.split(' ')
    if (ctx.measureText(label).width <= S - 60 || words.length < 2) ctx.fillText(fitText(ctx, label, S - 60), S / 2, H / 2 + size * 0.3)
    else {
      ctx.fillText(words[0], S / 2, H / 2 - size * 0.2)
      ctx.fillText(words.slice(1).join(' '), S / 2, H / 2 + size * 0.75)
    }
    ctx.letterSpacing = '4px'
    ctx.font = `600 24px ${FONT}`
    ctx.globalAlpha = 0.6
    ctx.fillText('CLICK TO SWAP', S / 2, H - 34)
  })
}

function podArt(label: string, fg: string, bg: string) {
  return textTexture(512, 300, (ctx) => {
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, 512, 300)
    ctx.fillStyle = fg
    ctx.font = `600 26px ${FONT}`
    ctx.letterSpacing = '4px'
    ctx.globalAlpha = 0.75
    ctx.fillText('AGENT PROBE', 36, 66)
    ctx.globalAlpha = 1
    ctx.letterSpacing = '-1px'
    ctx.font = `600 76px ${FONT}`
    ctx.fillText(label, 34, 170)
    ctx.font = `500 26px ${MONO}`
    ctx.letterSpacing = '0px'
    ctx.globalAlpha = 0.75
    ctx.fillText('J1 · SWD · click to swap', 36, 250)
  })
}

const next = <T extends string>(options: readonly { value: T }[], value: T) =>
  options[(options.findIndex((o) => o.value === value) + 1) % options.length].value

type ChipProps = {
  id: ChipId
  geo: Solid
  at: Vec
  mats: Mats
  tip: Tip
  guard: Guard
  state: { current: BoardState }
  title: string
  sub: string
  onSwap: () => void
  children?: ReactNode
}

function Chip({ id, geo, at, mats, tip, guard, state, title, sub, onSwap, children }: ChipProps) {
  const group = useRef<Group>(null)
  const edges = useRef<LineSegments>(null)
  useDispose(geo.fill, geo.edges)
  useFrame(() => {
    if (group.current) group.current.position.y = at[1] + 0.32 * Math.sin(Math.PI * state.current.bumps[id])
  })
  const hover = (on: boolean) => {
    if (edges.current) edges.current.material = on ? mats.hot : mats.line
  }
  return (
    <group
      ref={group}
      position={at}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation()
        if (guard.moved) return
        state.current.bumps[id] = 1
        onSwap()
      }}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation()
        hover(true)
        tip.show(e.nativeEvent, title, sub)
      }}
      onPointerMove={(e: ThreeEvent<PointerEvent>) => tip.show(e.nativeEvent, title, sub)}
      onPointerOut={() => {
        hover(false)
        tip.hide()
      }}
    >
      <mesh geometry={geo.fill} material={mats.fill} />
      <lineSegments ref={edges} geometry={geo.edges} material={mats.line} raycast={() => null} />
      {children}
    </group>
  )
}

function Label({ map, w, d, y }: { map: Texture; w: number; d: number; y: number }) {
  useDispose(map)
  return (
    <mesh position={[0, y, 0]} rotation-x={-Math.PI / 2} scale={[w, d, 1]} raycast={() => null}>
      <planeGeometry />
      <meshBasicMaterial map={map} toneMapped={false} />
    </mesh>
  )
}

type PartProps = { lab: Lab; c: Look; mats: Mats; tip: Tip; guard: Guard; art: boolean; state: { current: BoardState } }

function Cpu({ lab, c, mats, tip, guard, art: drawArt, state }: PartProps) {
  const fw = lab.setup.framework
  const label = frameworks.find((f) => f.value === fw)?.label ?? fw
  const lid = fw === 'next' ? { w: 1.0, d: 1.0, h: 0.11 } : { w: 0.98, d: 0.6, h: 0.07 }
  const geo = useMemo(() => {
    const h = ZONES.cpu.half
    const shapes: Shape[] = [{ box: [h * 2, 0.05, h * 2], at: [0, 0.025, 0] }]
    const strokes: Stroke[] = []
    if (fw === 'next') shapes.push({ box: [lid.w, lid.h, lid.d], at: [0, 0.05 + lid.h / 2, 0] })
    else {
      shapes.push({ box: [lid.w, lid.h, lid.d], at: [0, 0.05 + lid.h / 2, 0] })
      for (const x of [-0.42, -0.28, 0.28, 0.42]) shapes.push({ box: [0.07, 0.03, 0.05], at: [x, 0.065, 0.48] }, { box: [0.07, 0.03, 0.05], at: [x, 0.065, -0.48] })
      const pts: number[] = []
      rect(pts, -0.6, -0.42, 0.6, 0.42, 0.052)
      strokes.push({ pts })
    }
    for (let i = 0; i < 9; i++) {
      const u = -0.56 + i * 0.14
      const pts: number[] = []
      for (const [x, z] of [[u, -h], [u, h], [-h, u], [h, u]]) seg(pts, x, z, x + (Math.abs(x) === h ? Math.sign(x) * 0.05 : 0), z + (Math.abs(z) === h ? Math.sign(z) * 0.05 : 0), 0.003)
      strokes.push({ pts })
    }
    return solid(shapes, c.chip, c.fg, strokes)
  }, [fw, c, lid.w, lid.h, lid.d])
  const art = useMemo(() => (drawArt ? cpuArt(c, label, lid.w, lid.d) : null), [c, label, lid.w, lid.d, drawArt])
  return (
    <Chip
      id="cpu" geo={geo} at={[ZONES.cpu.x, Y, ZONES.cpu.z]} mats={mats} tip={tip} guard={guard} state={state}
      title={`Framework chip · ${label}`} sub="Click to swap"
      onSwap={() => lab.set('framework', next(frameworks, fw))}
    >
      {art && <Label map={art} w={lid.w * 0.96} d={lid.d * 0.96} y={0.05 + lid.h + 0.002} />}
    </Chip>
  )
}

function Memory({ lab, c, mats, tip, guard, state }: PartProps) {
  const db = lab.setup.database
  const { mem } = ZONES
  const geo = useMemo(() => {
    const shapes: Shape[] = []
    const strokes: Stroke[] = []
    if (db === 'postgres')
      for (const x of [-0.13, 0.13]) {
        shapes.push(
          { box: [0.14, 0.1, 1.42], at: [x, 0.05, 0] },
          { box: [0.16, 0.16, 0.06], at: [x, 0.08, -0.74] },
          { box: [0.16, 0.16, 0.06], at: [x, 0.08, 0.74] },
          { box: [0.03, 0.4, 1.3], at: [x, 0.3, 0] },
        )
        for (let k = 0; k < 4; k++) shapes.push({ box: [0.03, 0.13, 0.26], at: [x + 0.03, 0.3, -0.47 + k * 0.313] })
        strokes.push({ pts: [x - 0.016, 0.13, -0.62, x - 0.016, 0.13, 0.62] })
      }
    else
      for (const z of [-0.38, 0.38]) {
        shapes.push({ box: [0.5, 0.03, 0.62], at: [0, 0.015, z] })
        for (let k = 0; k < 4; k++) {
          const x = -0.04 + k * 0.035
          shapes.push({ box: [0.36, 0.045, 0.5], at: [x, 0.055 + k * 0.06, z] })
          const ex = x - 0.18, ey = 0.077 + k * 0.06
          for (const dz of [-0.16, 0, 0.16]) strokes.push({ pts: [ex, ey, z + dz, ex - 0.04, ey + 0.02, z + dz, ex - 0.04, ey + 0.02, z + dz, -0.23, 0.03, z + dz] })
        }
      }
    return solid(shapes, c.chip, c.fg, strokes)
  }, [db, c])
  const label = databases.find((d) => d.value === db)?.label ?? db
  return (
    <Chip
      id="mem" geo={geo} at={[(mem.x0 + mem.x1) / 2, Y, (mem.z0 + mem.z1) / 2]} mats={mats} tip={tip} guard={guard} state={state}
      title={`Memory · ${label}`} sub="Click to swap"
      onSwap={() => lab.set('database', next(databases, db))}
    />
  )
}

function Power({ lab, c, mats, tip, guard, state }: PartProps) {
  const pm = lab.setup.packageManager
  const { pwr } = ZONES
  const geo = useMemo(() => {
    const shapes: Shape[] = [{ box: [0.3, 0.06, 0.3], at: [0.78, 0.03, 0.05] }]
    const strokes: Stroke[] = []
    for (let i = 0; i < 4; i++) strokes.push({ pts: [0.63, 0.003, -0.05 + i * 0.07, 0.6, 0.003, -0.05 + i * 0.07, 0.93, 0.003, -0.05 + i * 0.07, 0.96, 0.003, -0.05 + i * 0.07] })
    if (pm === 'pnpm')
      for (let i = 0; i < 4; i++) {
        const x = -0.8 + i * 0.37
        shapes.push({ box: [0.28, 0.2, 0.28], at: [x, 0.1, -0.05] }, { box: [0.12, 0.05, 0.07], at: [x, 0.025, 0.25] })
        strokes.push({ pts: circle(x, 0.201, -0.05, 0.09, 20) })
      }
    else if (pm === 'npm') {
      shapes.push({ box: [1.5, 0.04, 0.56], at: [-0.25, 0.02, 0] })
      for (let i = 0; i < 11; i++) shapes.push({ box: [0.022, 0.3, 0.56], at: [-0.95 + i * 0.14, 0.19, 0] })
    } else
      for (const x of [-0.7, -0.1]) {
        const R = 0.2, r = 0.075
        shapes.push({ ring: [R, r], at: [x, r, 0] })
        const pts: number[] = []
        for (let k = 0; k < 14; k++) {
          const a = (k / 14) * Math.PI * 2
          const ca = Math.cos(a), sa = Math.sin(a)
          pts.push(x + ca * (R - r), r * 1.9, sa * (R - r), x + ca * (R + r), r * 1.9, sa * (R + r))
          pts.push(x + ca * (R + r), r * 1.9, sa * (R + r), x + ca * (R + r) * 1.02, 0.01, sa * (R + r) * 1.02)
        }
        strokes.push({ pts })
      }
    return solid(shapes, c.chip, c.fg, strokes)
  }, [pm, c])
  const label = packageManagers.find((p) => p.value === pm)?.label ?? pm
  return (
    <Chip
      id="pwr" geo={geo} at={[(pwr.x0 + pwr.x1) / 2, Y, (pwr.z0 + pwr.z1) / 2 + 0.04]} mats={mats} tip={tip} guard={guard} state={state}
      title={`Power stage · ${label}`} sub="Package manager · click to swap"
      onSwap={() => lab.set('packageManager', next(packageManagers, pm))}
    />
  )
}

function Probe({ lab, c, mats, tip, guard, art: drawArt, state }: PartProps) {
  const agent = lab.setup.agent
  const geo = useMemo(() => {
    const shapes: Shape[] = [{ box: [0.8, 0.08, 0.3], at: [0, 0.04, 0] }]
    const pins: number[] = []
    for (let i = 0; i < 5; i++) for (const z of [-0.075, 0.075]) pins.push(-0.3 + i * 0.15, 0.08, z, -0.3 + i * 0.15, 0.3, z)
    const strokes: Stroke[] = [{ pts: pins }]
    const zEdge = BOARD.z1 - ZONES.j1.z
    const cable = (from: Vec, to: Vec, color: string) => {
      const pts: number[] = []
      const P = (t: number): Vec => {
        const a = 1 - t
        const c1: Vec = [from[0], from[1] + 0.7, from[2] + 0.2], c2: Vec = [to[0], to[1] + 0.8, to[2] - 0.6]
        return [0, 1, 2].map((k) => a * a * a * from[k] + 3 * a * a * t * c1[k] + 3 * a * t * t * c2[k] + t * t * t * to[k]) as Vec
      }
      for (const off of [-0.035, 0.035]) {
        let prev = P(0)
        for (let i = 1; i <= 24; i++) {
          const p = P(i / 24)
          pts.push(prev[0] + off, prev[1], prev[2], p[0] + off, p[1], p[2])
          prev = p
        }
      }
      strokes.push({ pts, color })
    }
    if (agent === 'claude') {
      shapes.push({ box: [0.86, 0.16, 0.36], at: [0, 0.38, 0], fill: CLAUDE.fill, edge: CLAUDE.edge })
      shapes.push({ box: [1.0, 0.2, 0.6], at: [0.15, 0.1 - Y, zEdge + 0.95], fill: CLAUDE.fill, edge: CLAUDE.edge })
      cable([0, 0.46, 0.1], [0.15, 0.2 - Y, zEdge + 0.65], c.muted)
    } else if (agent === 'codex') {
      const black = '#121417', rim = c.dark ? '#7D93AD' : '#4A5866'
      shapes.push(
        { box: [0.86, 0.1, 0.62], at: [0, 0.37, 0.12], fill: black, edge: rim },
        { box: [0.86, 0.62, 0.08], at: [0, 0.11, zEdge + 0.08], fill: black, edge: rim },
        { box: [0.86, 0.07, 0.5], at: [0, -SLAB - 0.05, zEdge - 0.17], fill: black, edge: rim },
        { box: [0.9, 0.18, 0.55], at: [0.15, 0.09 - Y, zEdge + 0.95], fill: black, edge: rim },
      )
      cable([0, 0.42, 0.3], [0.15, 0.18 - Y, zEdge + 0.67], rim)
    }
    return solid(shapes, c.chip, c.fg, strokes)
  }, [agent, c])
  const art = useMemo(
    () => (!drawArt ? null : agent === 'claude' ? podArt('Claude Code', '#FFF7F2', CLAUDE.fill) : agent === 'codex' ? podArt('Codex', '#F2F4F6', '#121417') : null),
    [agent, drawArt],
  )
  const zEdge = BOARD.z1 - ZONES.j1.z
  const label = agents.find((a) => a.value === agent)?.label ?? agent
  return (
    <Chip
      id="j1" geo={geo} at={[ZONES.j1.x, Y, ZONES.j1.z]} mats={mats} tip={tip} guard={guard} state={state}
      title={agent === 'none' ? 'J1 debug header' : `Agent probe · ${label}`} sub="Click to swap"
      onSwap={() => lab.set('agent', next(agents, agent))}
    >
      {art && (
        <group position={[0.15, (agent === 'claude' ? 0.2 : 0.18) - Y + 0.002, zEdge + 0.95]}>
          <Label map={art} w={agent === 'claude' ? 0.96 : 0.86} d={agent === 'claude' ? 0.56 : 0.52} y={0} />
        </group>
      )}
    </Chip>
  )
}

function Slab({ c, mats }: { c: Look; mats: Mats }) {
  const geo = useMemo(() => {
    const shapes: Shape[] = [{ box: [W, SLAB, D], at: [(BOARD.x0 + BOARD.x1) / 2, Y - SLAB / 2, (BOARD.z0 + BOARD.z1) / 2], fill: c.board }]
    const h = Y - SLAB
    for (const [x, z] of [[BOARD.x0 + 0.3, BOARD.z0 + 0.3], [BOARD.x1 - 0.3, BOARD.z0 + 0.3], [BOARD.x0 + 0.3, BOARD.z1 - 0.3], [BOARD.x1 - 0.3, BOARD.z1 - 0.3]])
      shapes.push({ cyl: [0.1, h], at: [x, h / 2, z], fill: c.surface })
    return solid(shapes, c.chip, c.edge)
  }, [c])
  useDispose(geo.fill, geo.edges)
  return (
    <group>
      <mesh geometry={geo.fill} material={mats.fill} />
      <lineSegments geometry={geo.edges} material={mats.line} />
    </group>
  )
}

/** The app board. `ready` is false for the first frame, so its canvas-drawn silkscreen and chip art wait until the scene is up. */
export function ChipBoard({ lab, look, state, tip, guard, ready }: { lab: Lab; look: Look; state: { current: BoardState }; tip: Tip; guard: Guard; ready: boolean }) {
  const [fonts, setFonts] = useState(0)
  useEffect(() => {
    let live = true
    void document.fonts.ready.then(() => live && setFonts(1))
    return () => { live = false }
  }, [])
  const mats = useMemo(() => materials(look), [look])
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats])
  const { target, name, framework, database, packageManager, agent } = lab.setup
  const art = ready && fonts === 1
  const silk = useMemo(
    () => (art ? silkArt(look, lab.setup) : null),
    [look, target, name, framework, database, packageManager, agent, art],
  )
  useDispose(silk)
  const prints = useMemo(() => footprintGeometry(target), [target])
  const traces = useMemo(() => traceGeometry(target), [target])
  useDispose(prints, traces)
  const part = { lab, c: look, mats, tip, guard, art, state }
  return (
    <group>
      <Slab c={look} mats={mats} />
      {silk && (
        <mesh position={[(BOARD.x0 + BOARD.x1) / 2, Y + 0.001, (BOARD.z0 + BOARD.z1) / 2]} rotation-x={-Math.PI / 2} raycast={() => null}>
          <planeGeometry args={[W, D]} />
          <meshBasicMaterial map={silk} transparent depthWrite={false} toneMapped={false} />
        </mesh>
      )}
      <lineSegments geometry={traces} material={mats.trace} raycast={() => null} />
      <lineSegments geometry={prints} material={mats.footprint} raycast={() => null} />
      <Signals state={state} mats={mats} />
      <Cpu {...part} />
      <Memory {...part} />
      <Power {...part} />
      <Probe {...part} />
    </group>
  )
}
