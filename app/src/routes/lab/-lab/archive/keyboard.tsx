import { ContactShadows } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import type { ThreeEvent } from '@react-three/fiber'
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react'
import * as THREE from 'three'

import type { CatalogItem, Setup } from '../../../workspace/-workspace/workspace.types'
import type { Lab, MockProps } from '../lab.types'

type Vec = [number, number]
type Action =
  | 'clear'
  | 'copy'
  | 'numcopy'
  | 'undo'
  | 'find'
  | 'shift'
  | 'space'
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'framework'
  | 'database'
  | 'packageManager'
  | 'agent'
  | 'target'
type Key = {
  code: string
  hot: string
  poly: Vec[]
  row: number
  cx: number
  cz: number
  w: number
  d: number
  item?: CatalogItem
  action?: Action
}
type Theme = Lab['theme']
type Legend = {
  glyph?: string
  tint?: string
  text: string
  size?: number
  lines?: number
  sub?: string
  hot?: string
  pips?: [number, number]
  led?: boolean
  center?: boolean
  ink?: string
}
type Fx = {
  held: Set<string>
  hovered: string | null
  hx: number
  hz: number
  ripples: { x: number; z: number; t: number; color: THREE.Color }[]
}

const ACCENT = '#5A91AD'
const FONT = "'Timeless Grotesk', ui-sans-serif, system-ui, sans-serif"
const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace'
const TRAVEL = 0.17
const REST = 0.12
const PX = 300
const CENTER: Vec = [11.25, 3.25]
const SCULPT = [
  { h: 0.42, tilt: -0.12 },
  { h: 0.46, tilt: -0.14 },
  { h: 0.42, tilt: -0.07 },
  { h: 0.4, tilt: 0 },
  { h: 0.41, tilt: 0.07 },
  { h: 0.42, tilt: 0.12 },
]
const palette = {
  light: { case: '#FFFFFF', line: '#B4BDC2', mod: '#E2E7EA', switch: '#C3CBD0', ink: '#1D2225', muted: '#727C81', bg: '#EDF1F3' },
  dark: { case: '#12171A', line: '#353D42', mod: '#1B2125', switch: '#06090B', ink: '#FCFCFC', muted: '#8A9094', bg: '#090E11' },
}
const GLYPHS: Record<string, string> = {
  feature: 'ƒ',
  component: '◇',
  'block:hero': '◐',
  'block:feature': '✦',
  'block:other': '∗',
  'block:logo': '◎',
  'block:content': '¶',
  'block:integration': '⇄',
  'block:call': '➜',
  'block:contact': '@',
  'block:team': '☺',
  'block:faq': '?',
  'block:comparator': '⇔',
  'block:testimonials': '❝',
  'block:stats': '▲',
  'block:pricing': '$',
  'block:footer': '▁',
}
const CYCLES = {
  framework: ['next', 'tanstack'],
  database: ['postgres', 'mongodb'],
  packageManager: ['pnpm', 'npm', 'bun'],
  agent: ['none', 'claude', 'codex'],
  target: ['existing', 'new'],
} as const
type CycleKey = keyof typeof CYCLES
const CYCLE_LABEL: Record<CycleKey, string> = {
  framework: 'framework',
  database: 'database',
  packageManager: 'pkg mgr',
  agent: 'agent',
  target: 'target',
}

const rect = (x: number, z: number, w: number, d: number): Vec[] => [
  [x, z],
  [x + w, z],
  [x + w, z + d],
  [x, z + d],
]

function buildKeys(items: readonly CatalogItem[]): Key[] {
  const slots: Omit<Key, 'cx' | 'cz' | 'w' | 'd'>[] = []
  const put = (row: number, z: number, x: number, defs: [string, string, number?, number?][]) => {
    for (const [code, hot, w = 1, d = 1] of defs) {
      if (code) slots.push({ code, hot, poly: rect(x, z, w, d), row })
      x += w
    }
  }
  put(0, 0, 0, [['Escape', 'esc'], ['', '', 1]])
  put(0, 0, 2, Array.from({ length: 4 }, (_, i) => [`F${i + 1}`, `F${i + 1}`] as [string, string]))
  put(0, 0, 6.5, Array.from({ length: 4 }, (_, i) => [`F${i + 5}`, `F${i + 5}`] as [string, string]))
  put(0, 0, 11, Array.from({ length: 4 }, (_, i) => [`F${i + 9}`, `F${i + 9}`] as [string, string]))
  put(0, 0, 15.25, [['PrintScreen', 'prt sc'], ['ScrollLock', 'scr lk'], ['Pause', 'pause']])
  put(1, 1.5, 0, [
    ['Backquote', '`'],
    ...'1234567890'.split('').map((c) => [`Digit${c}`, c] as [string, string]),
    ['Minus', '-'],
    ['Equal', '='],
    ['Backspace', 'bksp', 2],
  ])
  put(2, 2.5, 0, [
    ['Tab', 'tab', 1.5],
    ...'QWERTYUIOP'.split('').map((c) => [`Key${c}`, c] as [string, string]),
    ['BracketLeft', '['],
    ['BracketRight', ']'],
  ])
  slots.push({
    code: 'Enter',
    hot: 'enter',
    row: 3,
    poly: [
      [13.5, 2.5],
      [15, 2.5],
      [15, 4.5],
      [13.75, 4.5],
      [13.75, 3.5],
      [13.5, 3.5],
    ],
  })
  put(3, 3.5, 0, [
    ['CapsLock', 'caps', 1.75],
    ...'ASDFGHJKL'.split('').map((c) => [`Key${c}`, c] as [string, string]),
    ['Semicolon', ';'],
    ['Quote', "'"],
    ['Backslash', '\\'],
  ])
  put(4, 4.5, 0, [
    ['ShiftLeft', 'shift', 2.25],
    ...'ZXCVBNM'.split('').map((c) => [`Key${c}`, c] as [string, string]),
    ['Comma', ','],
    ['Period', '.'],
    ['Slash', '/'],
    ['ShiftRight', 'shift', 2.75],
  ])
  put(5, 5.5, 0, [
    ['ControlLeft', 'ctrl', 1.75],
    ['MetaLeft', 'cmd', 1.75],
    ['AltLeft', 'alt', 1.5],
    ['Space', 'space', 5.5],
    ['AltRight', 'alt', 1.75],
    ['ControlRight', 'ctrl', 2.75],
  ])
  put(1, 1.5, 15.25, [['Insert', 'ins'], ['Home', 'home'], ['PageUp', 'pg up']])
  put(2, 2.5, 15.25, [['Delete', 'del'], ['End', 'end'], ['PageDown', 'pg dn']])
  put(4, 4.5, 16.25, [['ArrowUp', '↑']])
  put(5, 5.5, 15.25, [['ArrowLeft', '←'], ['ArrowDown', '↓'], ['ArrowRight', '→']])
  put(1, 1.5, 18.5, [['NumLock', 'num'], ['NumpadDivide', '/'], ['NumpadMultiply', '*'], ['NumpadSubtract', '−']])
  put(2, 2.5, 18.5, [['Numpad7', '7'], ['Numpad8', '8'], ['Numpad9', '9'], ['NumpadAdd', '+', 1, 2]])
  put(3, 3.5, 18.5, [['Numpad4', '4'], ['Numpad5', '5'], ['Numpad6', '6']])
  put(4, 4.5, 18.5, [['Numpad1', '1'], ['Numpad2', '2'], ['Numpad3', '3'], ['NumpadEnter', 'enter', 1, 2]])
  put(5, 5.5, 18.5, [['Numpad0', '0', 2], ['NumpadDecimal', '.']])

  const keys: Key[] = slots.map((slot) => {
    const xs = slot.poly.map((p) => p[0])
    const zs = slot.poly.map((p) => p[1])
    const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)]
    return { ...slot, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0 }
  })
  const byCode = new Map(keys.map((key) => [key.code, key]))
  const actions: Record<string, Action> = {
    Escape: 'clear',
    Enter: 'copy',
    NumpadEnter: 'numcopy',
    Backspace: 'undo',
    Tab: 'find',
    CapsLock: 'find',
    ShiftLeft: 'shift',
    ShiftRight: 'shift',
    Space: 'space',
    ArrowUp: 'up',
    ArrowDown: 'down',
    ArrowLeft: 'left',
    ArrowRight: 'right',
    ControlLeft: 'framework',
    MetaLeft: 'database',
    AltLeft: 'packageManager',
    AltRight: 'agent',
    ControlRight: 'target',
  }
  for (const [code, action] of Object.entries(actions)) byCode.get(code)!.action = action

  const alpha = keys
    .filter((key) => key.row >= 1 && key.row <= 4 && key.cx < 15 && !actions[key.code])
    .sort((a, b) => Math.floor(a.cx) - Math.floor(b.cx) || a.row - b.row)
    .map((key) => key.code)
  const regions: [string[], string[]][] = [
    [Array.from({ length: 12 }, (_, i) => `F${i + 1}`), ['feature', 'component', 'block:call', 'block:comparator']],
    [
      ['PrintScreen', 'ScrollLock', 'Pause', 'Insert', 'Home', 'PageUp', 'Delete', 'End', 'PageDown'],
      ['block:team', 'block:contact', 'block:footer'],
    ],
    [
      'NumLock NumpadDivide NumpadMultiply NumpadSubtract Numpad7 Numpad8 Numpad9 NumpadAdd Numpad4 Numpad5 Numpad6 Numpad1 Numpad2 Numpad3 Numpad0 NumpadDecimal'.split(
        ' ',
      ),
      ['block:stats', 'block:pricing', 'block:logo', 'block:other'],
    ],
    [alpha, ['block:hero', 'block:feature', 'block:content', 'block:integration', 'block:faq', 'block:testimonials']],
  ]
  const placed = new Set<string>()
  for (const [codes, zones] of regions) {
    const zoneItems = zones.flatMap((zone) => items.filter((item) => item.category === zone))
    codes.forEach((code, i) => {
      const item = zoneItems[i]
      if (!item) return
      byCode.get(code)!.item = item
      placed.add(item.ref)
    })
  }
  const spare = items.filter((item) => !placed.has(item.ref))
  for (const key of keys) if (!key.item && !key.action && spare.length) key.item = spare.shift()
  return keys
}

function shortNames(items: readonly CatalogItem[]) {
  const out = new Map<string, string>()
  const groups = new Map<string, CatalogItem[]>()
  for (const item of items) groups.set(item.category, [...(groups.get(item.category) ?? []), item])
  for (const group of groups.values()) {
    let prefix = group.length > 1 ? group[0].name : ''
    for (const item of group) while (prefix && !item.name.startsWith(prefix)) prefix = prefix.slice(0, -1)
    prefix = prefix.slice(0, prefix.lastIndexOf('-') + 1)
    for (const item of group) out.set(item.ref, (item.name.slice(prefix.length) || item.name).replaceAll('-', ' '))
  }
  return out
}

function signedArea(poly: Vec[]) {
  let a = 0
  for (let i = 0; i < poly.length; i++) {
    const [x0, z0] = poly[i]
    const [x1, z1] = poly[(i + 1) % poly.length]
    a += x0 * z1 - x1 * z0
  }
  return a / 2
}

function inset(poly: Vec[], t: number): Vec[] {
  const n = poly.length
  return poly.map((p, i) => {
    const prev = poly[(i - 1 + n) % n]
    const next = poly[(i + 1) % n]
    const a = norm([p[0] - prev[0], p[1] - prev[1]])
    const b = norm([next[0] - p[0], next[1] - p[1]])
    return [p[0] + t * (-a[1] - b[1]), p[1] + t * (a[0] + b[0])]
  })
}

function norm([x, z]: Vec): Vec {
  const l = Math.hypot(x, z) || 1
  return [x / l, z / l]
}

const SEG = 4
function round(poly: Vec[], r: number): Vec[] {
  const n = poly.length
  const out: Vec[] = []
  poly.forEach((p, i) => {
    const prev = poly[(i - 1 + n) % n]
    const next = poly[(i + 1) % n]
    const ra = Math.min(r, Math.hypot(p[0] - prev[0], p[1] - prev[1]) / 2)
    const rb = Math.min(r, Math.hypot(next[0] - p[0], next[1] - p[1]) / 2)
    const a = norm([p[0] - prev[0], p[1] - prev[1]])
    const b = norm([next[0] - p[0], next[1] - p[1]])
    const p0: Vec = [p[0] - a[0] * ra, p[1] - a[1] * ra]
    const p1: Vec = [p[0] + b[0] * rb, p[1] + b[1] * rb]
    for (let s = 0; s <= SEG; s++) {
      const t = s / SEG
      const u = 1 - t
      out.push([u * u * p0[0] + 2 * u * t * p[0] + t * t * p1[0], u * u * p0[1] + 2 * u * t * p[1] + t * t * p1[1]])
    }
  })
  return out
}

type CapGeo = { body: THREE.BufferGeometry; lines: THREE.BufferGeometry; top: { cx: number; cz: number; w: number; d: number; y: number } }

function loft(input: Vec[], h: number, tilt: number, gap: number, taper: number, r: number): CapGeo {
  const poly = signedArea(input) < 0 ? [...input].reverse() : input
  const base = round(inset(poly, gap), r)
  const topPoly = inset(poly, gap + taper)
  const top = round(topPoly, r * 0.85)
  const y = (z: number) => h + tilt * z
  const pos: number[] = []
  const v = new THREE.Vector3()
  const e1 = new THREE.Vector3()
  const e2 = new THREE.Vector3()
  const tri = (a: number[], b: number[], c: number[], out: number[]) => {
    e1.set(b[0] - a[0], b[1] - a[1], b[2] - a[2])
    e2.set(c[0] - a[0], c[1] - a[1], c[2] - a[2])
    v.crossVectors(e1, e2)
    if (v.lengthSq() < 1e-12) return
    if (v.x * out[0] + v.y * out[1] + v.z * out[2] < 0) pos.push(...a, ...c, ...b)
    else pos.push(...a, ...b, ...c)
  }
  const n = base.length
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    const b0 = [base[i][0], 0, base[i][1]]
    const b1 = [base[j][0], 0, base[j][1]]
    const t0 = [top[i][0], y(top[i][1]), top[i][1]]
    const t1 = [top[j][0], y(top[j][1]), top[j][1]]
    const out = [top[j][1] - top[i][1] + b1[2] - b0[2], 0, -(top[j][0] - top[i][0] + b1[0] - b0[0])]
    tri(b0, b1, t1, out)
    tri(b0, t1, t0, out)
  }
  const faces = THREE.ShapeUtils.triangulateShape(
    top.map(([x, z]) => new THREE.Vector2(x, z)),
    [],
  )
  for (const [a, b, c] of faces)
    tri([top[a][0], y(top[a][1]), top[a][1]], [top[b][0], y(top[b][1]), top[b][1]], [top[c][0], y(top[c][1]), top[c][1]], [0, 1, 0])
  const body = new THREE.BufferGeometry()
  body.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  body.computeVertexNormals()

  const seg: number[] = []
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    seg.push(top[i][0], y(top[i][1]) + 0.002, top[i][1], top[j][0], y(top[j][1]) + 0.002, top[j][1])
    seg.push(base[i][0], 0.002, base[i][1], base[j][0], 0.002, base[j][1])
  }
  for (let c = 0; c < poly.length; c++) {
    const i = c * (SEG + 1) + SEG / 2
    seg.push(base[i][0], 0.002, base[i][1], top[i][0], y(top[i][1]), top[i][1])
  }
  const lines = new THREE.BufferGeometry()
  lines.setAttribute('position', new THREE.Float32BufferAttribute(seg, 3))
  const xs = topPoly.map((p) => p[0])
  const zs = topPoly.map((p) => p[1])
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2
  const cz = (Math.min(...zs) + Math.max(...zs)) / 2
  return {
    body,
    lines,
    top: { cx, cz, w: Math.max(...xs) - Math.min(...xs), d: Math.max(...zs) - Math.min(...zs), y: y(cz) },
  }
}

function capGeo(key: Key) {
  const rel = key.poly.map(([x, z]) => [x - key.cx, z - key.cz] as Vec)
  const { h, tilt } = SCULPT[key.row]
  return loft(rel, h, tilt, 0.045, 0.1, 0.07)
}

function drawLegend(l: Legend, w: number, h: number, theme: Theme) {
  const W = Math.max(8, Math.round(w * PX))
  const H = Math.max(8, Math.round(h * PX))
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  const p = palette[theme]
  const ink = l.ink ?? p.ink
  const muted = l.ink ? l.ink : p.muted
  const pad = 22
  ctx.textBaseline = 'alphabetic'
  let y = pad
  if (l.glyph) {
    ctx.font = `600 42px ${FONT}`
    ctx.fillStyle = l.tint ?? ink
    ctx.fillText(l.glyph, pad, pad + 36)
    y = pad + 36
  }
  const size = l.size ?? 44
  ctx.font = `600 ${size}px ${FONT}`
  ctx.fillStyle = ink
  const max = W - pad * 2
  const words = l.text.split(' ')
  const lines: string[] = []
  const limit = l.lines ?? 2
  let current = ''
  while (words.length) {
    const next = current ? `${current} ${words[0]}` : words[0]
    if (ctx.measureText(next).width <= max || !current) {
      current = next
      words.shift()
    } else {
      lines.push(current)
      current = ''
      if (lines.length === limit) break
    }
  }
  if (current && lines.length < limit) lines.push(current)
  if (words.length || lines.some((line) => ctx.measureText(line).width > max)) {
    let last = lines[lines.length - 1] ?? ''
    while (last.length > 1 && ctx.measureText(`${last}…`).width > max) last = last.slice(0, -1)
    lines[lines.length - 1] = `${last.trimEnd()}…`
  }
  if (l.center) {
    ctx.textAlign = 'center'
    const start = H / 2 - ((lines.length - 1) * size * 1.05) / 2 + size * 0.35
    lines.forEach((line, i) => ctx.fillText(line, W / 2, start + i * size * 1.05))
    ctx.textAlign = 'left'
  } else {
    lines.forEach((line, i) => ctx.fillText(line, pad, y + size * 1.15 + i * size * 1.05))
  }
  if (l.sub) {
    ctx.font = `500 28px ${FONT}`
    ctx.fillStyle = muted
    ctx.fillText(l.sub, pad, H - pad)
  }
  if (l.hot) {
    ctx.font = `500 28px ${MONO}`
    ctx.fillStyle = muted
    ctx.textAlign = 'right'
    ctx.fillText(l.hot, W - pad, H - pad)
    ctx.textAlign = 'left'
  }
  if (l.pips) {
    const [count, active] = l.pips
    for (let i = 0; i < count; i++) {
      ctx.beginPath()
      ctx.arc(W - pad - 8 - (count - 1 - i) * 26, pad + 10, 8, 0, Math.PI * 2)
      ctx.fillStyle = i === active ? ACCENT : muted
      ctx.globalAlpha = i === active ? 1 : 0.35
      ctx.fill()
      ctx.globalAlpha = 1
    }
  }
  if (l.led !== undefined) {
    ctx.beginPath()
    ctx.arc(W - pad - 10, pad + 12, 10, 0, Math.PI * 2)
    ctx.fillStyle = l.led ? '#7FE0FF' : muted
    ctx.globalAlpha = l.led ? 1 : 0.3
    if (l.led) {
      ctx.shadowColor = '#7FE0FF'
      ctx.shadowBlur = 18
    }
    ctx.fill()
    ctx.shadowBlur = 0
    ctx.globalAlpha = 1
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  return texture
}

let glowTexture: THREE.Texture | null = null
function glow() {
  if (glowTexture) return glowTexture
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 128
  const ctx = canvas.getContext('2d')!
  const g = ctx.createRadialGradient(64, 64, 6, 64, 64, 64)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.45, 'rgba(255,255,255,0.55)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 128, 128)
  glowTexture = new THREE.CanvasTexture(canvas)
  return glowTexture
}

let audio: AudioContext | null = null
let noise: AudioBuffer | null = null
const SOUNDS = { latch: [2100, 150, 0.3], unlatch: [3400, 220, 0.2], tap: [2900, 190, 0.18], space: [1300, 92, 0.38] } as const
function thock(kind: keyof typeof SOUNDS) {
  try {
    audio ??= new AudioContext()
    const a = audio
    if (a.state === 'suspended') void a.resume()
    if (!noise) {
      noise = a.createBuffer(1, Math.floor(a.sampleRate * 0.05), a.sampleRate)
      const data = noise.getChannelData(0)
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 6
    }
    const [band, body, gain] = SOUNDS[kind]
    const t = a.currentTime
    const src = a.createBufferSource()
    src.buffer = noise
    src.playbackRate.value = 0.85 + Math.random() * 0.3
    const filter = a.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = band
    filter.Q.value = 0.9
    const g = a.createGain()
    g.gain.value = gain
    src.connect(filter).connect(g).connect(a.destination)
    src.start(t)
    const osc = a.createOscillator()
    osc.frequency.setValueAtTime(body, t)
    osc.frequency.exponentialRampToValueAtTime(body * 0.45, t + 0.07)
    const og = a.createGain()
    og.gain.setValueAtTime(gain * 0.9, t)
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.09)
    osc.connect(og).connect(a.destination)
    osc.start(t)
    osc.stop(t + 0.1)
  } catch {}
}

const hsl = (h: number, s: number, l: number) => new THREE.Color().setHSL(h / 360, s / 100, l / 100)
const css = (h: number, s: number, l: number) => `hsl(${h} ${s}% ${l}%)`

type CapProps = {
  k: Key
  geo: CapGeo
  selected: boolean
  dim: boolean
  lift: boolean
  pulse: boolean
  line: string
  legend: string
  theme: Theme
  fx: Fx
  onDown: (code: string, shift: boolean) => void
  onHover: (code: string | null) => void
}

const Cap = memo(function Cap({ k, geo, selected, dim, lift, pulse, line, legend, theme, fx, onDown, onHover }: CapProps) {
  const moving = useRef<THREE.Group>(null)
  const body = useRef<THREE.MeshStandardMaterial>(null)
  const glowMat = useRef<THREE.MeshBasicMaterial>(null)
  const legendMat = useRef<THREE.MeshBasicMaterial>(null)
  const spring = useRef({ y: 0, v: 0, rx: 0, rz: 0 })
  const tex = useMemo(() => drawLegend(JSON.parse(legend) as Legend, geo.top.w, geo.top.d, theme), [legend, geo, theme])
  useEffect(() => () => tex.dispose(), [tex])
  const hue = k.item?.hue
  const dark = theme === 'dark'
  const colors = useMemo(() => {
    const p = palette[theme]
    if (k.action === 'copy' || k.action === 'numcopy')
      return { base: new THREE.Color(ACCENT), on: new THREE.Color(ACCENT), glow: new THREE.Color(ACCENT), dim: new THREE.Color(p.mod) }
    if (hue === undefined)
      return { base: new THREE.Color(p.mod), on: new THREE.Color(p.mod), glow: new THREE.Color(ACCENT), dim: new THREE.Color(p.mod) }
    return {
      base: dark ? hsl(hue, 16, 15) : hsl(hue, 48, 89),
      on: dark ? hsl(hue, 62, 50) : hsl(hue, 70, 68),
      glow: hsl(hue, 90, dark ? 60 : 55),
      dim: dark ? new THREE.Color('#111518') : new THREE.Color('#E6EAEC'),
    }
  }, [theme, hue, k.action, dark])
  const tint = useMemo(() => new THREE.Color(), [])
  const ripple = useMemo(() => new THREE.Color(), [])

  useFrame((_, dt) => {
    const s = spring.current
    const hovered = fx.hovered === k.code
    const held = fx.held.has(k.code)
    const target = held ? -TRAVEL : selected ? -TRAVEL * 0.62 : hovered ? 0.07 : lift ? 0.11 : dim ? -0.03 : 0
    const steps = Math.min(8, Math.ceil(dt / (1 / 240)))
    const h = Math.min(dt, 1 / 20) / steps
    for (let i = 0; i < steps; i++) {
      s.v += (760 * (target - s.y) - 21 * s.v) * h
      s.y += s.v * h
      if (s.y < -TRAVEL) {
        s.y = -TRAVEL
        s.v = Math.abs(s.v) * 0.18
      }
    }
    const ease = 1 - Math.exp(-dt * 14)
    s.rx += ((hovered && !held ? fx.hz * 0.16 : 0) - s.rx) * ease
    s.rz += ((hovered && !held ? -fx.hx * 0.16 : 0) - s.rz) * ease
    const g = moving.current!
    g.position.y = REST + s.y
    g.rotation.x = s.rx
    g.rotation.z = s.rz

    const now = performance.now() / 1000
    let wave = 0
    ripple.setRGB(0, 0, 0)
    for (const r of fx.ripples) {
      const age = now - r.t
      const dist = Math.hypot(k.cx - r.x, k.cz - r.z)
      const w = Math.exp(-((dist - age * 16) ** 2) / 1.2) * Math.exp(-age * 1.4)
      if (w > 0.01) {
        wave += w
        ripple.lerp(r.color, w / Math.max(wave, 1e-6))
      }
    }
    const beat = pulse ? 0.6 + 0.4 * Math.sin(now * 8) : 0
    const on = Math.max(selected ? 1 : 0, beat)
    const mat = glowMat.current!
    tint.copy(colors.glow).lerp(ripple, Math.min(1, wave))
    mat.color.copy(tint)
    mat.opacity += ((on + wave * 0.9) * (dark ? 0.95 : 0.6) - mat.opacity) * Math.min(1, dt * 18)
    const m = body.current!
    tint.copy(selected ? colors.on : colors.base)
    if (dim) tint.copy(colors.dim)
    legendMat.current!.opacity += ((dim ? 0.25 : 1) - legendMat.current!.opacity) * ease
    m.color.lerp(tint, ease)
    m.emissive.copy(colors.glow).multiplyScalar((dark ? 0.16 : 0.04) * on + wave * (dark ? 0.25 : 0.08))
  })

  const pointer = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    const local = e.point.x - (k.cx - CENTER[0])
    const localZ = e.point.z - (k.cz - CENTER[1])
    fx.hx = THREE.MathUtils.clamp(local / (k.w / 2), -1, 1)
    fx.hz = THREE.MathUtils.clamp(localZ / (k.d / 2), -1, 1)
    if (fx.hovered !== k.code) {
      fx.hovered = k.code
      onHover(k.code)
    }
  }
  const glowW = k.w + (k.item ? 0.75 : 0.5)
  const glowD = k.d + (k.item ? 0.75 : 0.5)
  return (
    <group position={[k.cx - CENTER[0], 0, k.cz - CENTER[1]]}>
      <mesh rotation-x={-Math.PI / 2} position-y={0.006} scale={[glowW, glowD, 1]}>
        <planeGeometry />
        <meshBasicMaterial
          ref={glowMat}
          map={glow()}
          transparent
          opacity={0}
          depthWrite={false}
          blending={dark ? THREE.AdditiveBlending : THREE.NormalBlending}
          toneMapped={false}
        />
      </mesh>
      <group ref={moving} position-y={REST}>
        <mesh
          geometry={geo.body}
          castShadow
          receiveShadow
          onPointerMove={pointer}
          onPointerOut={(e) => {
            e.stopPropagation()
            if (fx.hovered === k.code) {
              fx.hovered = null
              onHover(null)
            }
            if (fx.held.has(`ptr:${k.code}`)) fx.held.delete(k.code)
          }}
          onPointerDown={(e) => {
            e.stopPropagation()
            fx.held.add(k.code)
            fx.held.add(`ptr:${k.code}`)
            onDown(k.code, e.nativeEvent.shiftKey)
          }}
        >
          <meshStandardMaterial ref={body} roughness={0.62} metalness={0} flatShading />
        </mesh>
        <lineSegments geometry={geo.lines}>
          <lineBasicMaterial color={line} transparent opacity={0.9} />
        </lineSegments>
        <mesh
          position={[geo.top.cx, geo.top.y + 0.004, geo.top.cz]}
          rotation-x={-Math.PI / 2 - Math.atan(SCULPT[k.row].tilt)}
          raycast={() => null}
        >
          <planeGeometry args={[geo.top.w, geo.top.d * Math.hypot(1, SCULPT[k.row].tilt)]} />
          <meshBasicMaterial ref={legendMat} map={tex} transparent depthWrite={false} toneMapped={false} />
        </mesh>
      </group>
    </group>
  )
})

function Rig({ portrait }: { portrait: boolean }) {
  const camera = useThree((s) => s.camera) as THREE.OrthographicCamera
  const size = useThree((s) => s.size)
  useLayoutEffect(() => {
    const top = Math.min(205, size.height * 0.28)
    const zoom = portrait
      ? Math.min((size.width * 0.96) / 10.5, (size.height - top - 10) / 24)
      : Math.min((size.width * 0.96) / 24.6, (size.height - top - 16) / 9)
    const dir = portrait ? new THREE.Vector3(-1, 0.85, 0.32).normalize() : new THREE.Vector3(0.17, 1, 0.85).normalize()
    camera.zoom = zoom
    camera.position.copy(dir).multiplyScalar(60)
    camera.up.set(0, 1, 0)
    camera.lookAt(0, 0, 0)
    camera.updateMatrixWorld()
    const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1)
    camera.position.addScaledVector(up, top / 2 / zoom)
    camera.updateProjectionMatrix()
  }, [camera, size, portrait])
  return null
}

function Board({
  keys,
  geos,
  lab,
  fx,
  find,
  matches,
  cursor,
  copied,
  onDown,
  onHover,
  names,
}: {
  keys: Key[]
  geos: Map<string, CapGeo>
  lab: Lab
  fx: Fx
  find: boolean
  matches: string[]
  cursor: string | null
  copied: boolean
  onDown: (code: string, shift: boolean) => void
  onHover: (code: string | null) => void
  names: Map<string, string>
}) {
  const p = palette[lab.theme]
  const dark = lab.theme === 'dark'
  const caseGeo = useMemo(() => loft(rect(-0.45, -0.45, 23.4, 7.4).map(([x, z]) => [x - CENTER[0], z - CENTER[1]] as Vec), 0.5, 0, 0, 0.12, 0.4), [])
  const switches = useRef<THREE.InstancedMesh>(null)
  useLayoutEffect(() => {
    const m = new THREE.Matrix4()
    keys.forEach((k, i) => switches.current!.setMatrixAt(i, m.makeTranslation(k.cx - CENTER[0], 0.07, k.cz - CENTER[1])))
    switches.current!.instanceMatrix.needsUpdate = true
  }, [keys])
  const matchSet = new Set(matches)
  const brand = useMemo(() => {
    const t = drawLegend({ text: 'payload-toolkit', size: 40, lines: 1, sub: 'find      latch      sound', ink: p.muted }, 3.8, 0.9, lab.theme)
    return t
  }, [lab.theme, p.muted])
  const leds = [find, lab.selected.size > 0, true]

  return (
    <group>
      <mesh geometry={caseGeo.body} position-y={-0.5} receiveShadow>
        <meshStandardMaterial color={p.case} roughness={0.85} flatShading />
      </mesh>
      <lineSegments geometry={caseGeo.lines} position-y={-0.5}>
        <lineBasicMaterial color={p.line} />
      </lineSegments>
      <mesh rotation-x={-Math.PI / 2} position={[20.5 - CENTER[0], 0.003, 0.5 - CENTER[1]]}>
        <planeGeometry args={[3.8, 0.9]} />
        <meshBasicMaterial map={brand} transparent depthWrite={false} toneMapped={false} />
      </mesh>
      {leds.map((on, i) => (
        <mesh key={i} position={[18.85 + i * 0.97 - CENTER[0], 0.02, 0.62 - CENTER[1]]}>
          <cylinderGeometry args={[0.06, 0.06, 0.04, 16]} />
          <meshStandardMaterial
            color={on ? '#7FE0FF' : p.line}
            emissive={on ? '#7FE0FF' : '#000000'}
            emissiveIntensity={on ? 1.4 : 0}
            toneMapped={false}
          />
        </mesh>
      ))}
      <instancedMesh ref={switches} args={[undefined, undefined, keys.length]} castShadow={false}>
        <boxGeometry args={[0.56, 0.14, 0.56]} />
        <meshStandardMaterial color={p.switch} roughness={0.9} />
      </instancedMesh>
      {keys.map((k) => {
        const item = k.item
        const selected = item ? lab.selected.has(item.ref) : false
        const isMatch = item ? matchSet.has(k.code) : false
        const first = find && matches[0] === k.code
        const isCursor = cursor === k.code
        let line = p.line
        if (item && (selected || isMatch)) line = dark ? css(item.hue, 70, 70) : css(item.hue, 55, 42)
        if (first || isCursor) line = ACCENT
        return (
          <Cap
            key={k.code}
            k={k}
            geo={geos.get(k.code)!}
            selected={selected}
            dim={find && matches.length > 0 && !isMatch && !!item}
            lift={isCursor || (find && isMatch)}
            pulse={first || isCursor}
            line={line}
            legend={JSON.stringify(legendFor(k, lab, names, find, copied))}
            theme={lab.theme}
            fx={fx}
            onDown={onDown}
            onHover={onHover}
          />
        )
      })}
      <ContactShadows position={[0, -0.51, 0]} scale={[30, 12]} blur={2.6} opacity={dark ? 0.6 : 0.3} far={3} />
    </group>
  )
}

function legendFor(k: Key, lab: Lab, names: Map<string, string>, find: boolean, copied: boolean): Legend {
  const item = k.item
  if (item) {
    const dark = lab.theme === 'dark'
    return {
      glyph: GLYPHS[item.category] ?? '·',
      tint: dark ? css(item.hue, 70, 72) : css(item.hue, 55, 42),
      text: names.get(item.ref) ?? item.name,
      size: k.w > 1.5 ? 54 : 46,
      hot: k.hot,
    }
  }
  const setup = lab.setup
  switch (k.action) {
    case 'clear':
      return { text: 'esc', sub: 'clear', size: 46 }
    case 'copy':
      return find
        ? { text: 'latch 1st', size: 54, sub: '⏎ enter', ink: '#FFFFFF' }
        : { text: copied ? 'copied ✓' : 'copy', size: 64, sub: '⏎ enter', ink: '#FFFFFF' }
    case 'numcopy':
      return { text: copied ? '✓' : 'copy', size: 44, sub: 'enter', ink: '#FFFFFF' }
    case 'undo':
      return { text: '⌫ undo', size: 44, sub: 'backspace' }
    case 'find':
      return k.code === 'Tab'
        ? { text: 'tab', size: 44, sub: 'find' }
        : { text: 'caps', size: 44, sub: 'find lock', led: find }
    case 'shift':
      return { text: '⇧ shift', size: 44, sub: '+ key = whole zone' }
    case 'space':
      return {
        text: `${lab.selected.size} / ${lab.catalog.items.length} latched`,
        size: 54,
        center: true,
        sub: 'space · latch cursor',
      }
    case 'up':
    case 'down':
    case 'left':
    case 'right':
      return { text: k.hot, size: 64, center: true }
    case 'framework':
    case 'database':
    case 'packageManager':
    case 'agent':
    case 'target': {
      const options = CYCLES[k.action] as readonly string[]
      const value = setup[k.action] as string
      return {
        text: value,
        size: 50,
        lines: 1,
        sub: CYCLE_LABEL[k.action],
        pips: [options.length, options.indexOf(value)],
      }
    }
  }
  return { text: k.hot, size: 40 }
}

function Terminal({
  lab,
  find,
  query,
  matches,
  copied,
  muted,
  onCopy,
  onMute,
}: {
  lab: Lab
  find: boolean
  query: string
  matches: number
  copied: boolean
  muted: boolean
  onCopy: () => void
  onMute: () => void
}) {
  const command = lab.command
  const [shown, setShown] = useState('')
  const [blink, setBlink] = useState(true)
  useEffect(() => {
    let raf = 0
    let last = performance.now()
    let budget = 0
    const step = (now: number) => {
      budget += now - last
      last = now
      setShown((cur) => {
        if (cur === command) return cur
        let common = 0
        while (common < cur.length && common < command.length && cur[common] === command[common]) common++
        const gone = cur.length - common
        const rate = gone > 0 ? Math.max(0.18, gone / 160) : Math.max(0.09, (command.length - cur.length) / 650)
        const n = Math.floor(budget * rate)
        if (n < 1) return cur
        budget -= n / rate
        return gone > 0 ? cur.slice(0, Math.max(common, cur.length - n)) : command.slice(0, cur.length + n)
      })
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [command])
  useEffect(() => {
    setBlink(true)
    const id = setInterval(() => setBlink((b) => !b), 530)
    return () => clearInterval(id)
  }, [shown])
  const typing = shown !== command
  return (
    <div className="pointer-events-auto absolute left-1/2 top-[68px] z-20 w-[min(760px,calc(100%-32px))] -translate-x-1/2 overflow-hidden rounded-xl border border-border bg-surface/90 shadow-[0_18px_50px_-20px_rgba(0,0,0,0.45)] backdrop-blur">
      <div className="flex items-center gap-2 whitespace-nowrap border-b border-border px-3 py-2 text-[11px] text-muted">
        <span className="flex gap-1.5">
          <i className="size-2.5 rounded-full bg-[#FF5F57]" />
          <i className="size-2.5 rounded-full bg-[#FEBC2E]" />
          <i className="size-2.5 rounded-full bg-[#28C840]" />
        </span>
        <span className="ml-1 hidden font-mono sm:inline">payload-toolkit — zsh</span>
        <span className="ml-auto font-mono" data-testid="kb-count">
          {lab.selected.size} latched
        </span>
        <button type="button" onClick={onMute} className="rounded px-1.5 py-0.5 font-mono hover:bg-default">
          {muted ? 'sound off' : 'sound on'}
        </button>
        <button
          type="button"
          onClick={onCopy}
          className="rounded-md bg-accent px-2 py-0.5 font-mono text-accent-foreground transition-transform active:scale-95"
        >
          {copied ? 'copied ✓' : 'copy ⏎'}
        </button>
      </div>
      <div className="max-h-[92px] overflow-y-auto px-4 py-3 font-mono text-[13px] leading-[1.55] break-all whitespace-pre-wrap text-foreground">
        <span className="text-accent">$ </span>
        {shown.split(/(\s+)/).map((part, i) => (
          <span key={i} className={part.startsWith('--') ? 'text-accent' : part.startsWith('@') ? 'text-muted' : undefined}>
            {part}
          </span>
        ))}
        <span className={`ml-px inline-block h-[1.1em] w-[0.6em] translate-y-[0.2em] bg-foreground ${blink || typing ? 'opacity-90' : 'opacity-0'}`} />
      </div>
      <div className="flex flex-wrap items-center gap-x-3 border-t border-border px-4 py-1.5 font-mono text-[11px] text-muted">
        {find ? (
          <>
            <span className="rounded bg-accent px-1.5 text-accent-foreground">FIND</span>
            <span className="text-foreground">
              /{query}
              <span className={blink ? 'opacity-100' : 'opacity-0'}>▏</span>
            </span>
            <span>{query ? `${matches} match${matches === 1 ? '' : 'es'}` : 'type to filter caps'}</span>
            <span className="ml-auto">⏎ latch first · ⇧⏎ zone · esc exit</span>
          </>
        ) : (
          <>
            <span className="rounded border border-border px-1.5">DIRECT</span>
            <span>caps mirror your keyboard: press Q, F1, Numpad 7…</span>
            <span className="ml-auto hidden sm:inline">⇪/tab find · ⇧ zone · esc clear · ⏎ copy · ⌫ undo · arrows+space</span>
          </>
        )}
      </div>
    </div>
  )
}

function Tooltip({ k, lab, anchor }: { k: Key | null; lab: Lab; anchor: RefObject<HTMLDivElement | null> }) {
  if (!k) return <div ref={anchor} className="hidden" />
  const item = k.item
  const image = item && (lab.theme === 'dark' ? (item.imageDark ?? item.image) : item.image)
  const selected = item ? lab.selected.has(item.ref) : false
  const cycle = k.action && k.action in CYCLES ? (k.action as CycleKey) : null
  return (
    <div ref={anchor} className="pointer-events-none fixed left-0 top-0 z-30 w-[240px] will-change-transform">
      <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-xl">
        {item ? (
          <>
            {image ? (
              <img src={image} alt="" className="aspect-[2/1] w-full border-b border-border object-cover object-top" />
            ) : (
              <div
                className="grid aspect-[2/1] w-full place-items-center border-b border-border text-4xl"
                style={{ background: css(item.hue, 40, lab.theme === 'dark' ? 16 : 92), color: css(item.hue, 55, 50) }}
              >
                {GLYPHS[item.category]}
              </div>
            )}
            <div className="p-3">
              <div className="flex items-center gap-2">
                <span className="size-2 rounded-full" style={{ background: css(item.hue, 60, 55) }} />
                <span className="text-[11px] text-muted">
                  {item.label} · {item.kind}
                </span>
                <kbd className="ml-auto rounded border border-border px-1.5 font-mono text-[10px] text-muted">{k.hot}</kbd>
              </div>
              <div className="mt-1 text-sm font-medium text-foreground">{item.title}</div>
              <p className="mt-1 line-clamp-3 text-xs text-muted">{item.description}</p>
              <div className="mt-2 text-[11px] text-muted">
                {selected ? 'latched · press to release' : 'press to latch'} · ⇧ for the whole zone
              </div>
            </div>
          </>
        ) : (
          <div className="p-3 text-xs text-muted">
            <div className="text-sm font-medium text-foreground">{cycle ? CYCLE_LABEL[cycle] : k.hot}</div>
            {cycle
              ? `click to cycle: ${CYCLES[cycle].join(' → ')}`
              : {
                  clear: 'Esc releases every latched key.',
                  copy: 'Copies the command. In find mode it latches the first match.',
                  numcopy: 'Copies the command.',
                  undo: 'Releases the last key you latched.',
                  find: 'Find mode: type to filter caps.',
                  shift: 'Hold shift while pressing a cap to latch its whole zone.',
                  space: 'Latches the arrow cursor.',
                  up: 'Moves the cursor.',
                  down: 'Moves the cursor.',
                  left: 'Moves the cursor.',
                  right: 'Moves the cursor.',
                }[k.action as string] ?? ''}
          </div>
        )}
      </div>
    </div>
  )
}

export default function KeyboardMock({ lab }: MockProps) {
  const keys = useMemo(() => buildKeys(lab.catalog.items), [lab.catalog])
  const geos = useMemo(() => new Map(keys.map((k) => [k.code, capGeo(k)])), [keys])
  const byCode = useMemo(() => new Map(keys.map((k) => [k.code, k])), [keys])
  const names = useMemo(() => shortNames(lab.catalog.items), [lab.catalog])
  const [fx] = useState<Fx>(() => ({ held: new Set(), hovered: null, hx: 0, hz: 0, ripples: [] }))
  const [find, setFind] = useState(false)
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [muted, setMuted] = useState(false)
  const [hover, setHover] = useState<string | null>(null)
  const [portrait, setPortrait] = useState(false)
  const [fontsReady, setFontsReady] = useState(false)
  const tooltip = useRef<HTMLDivElement>(null)
  const history = useRef<string[]>([])
  const copyTimer = useRef(0)

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!find || !q) return []
    return keys
      .filter((k) => k.item && `${k.item.title} ${k.item.name} ${k.item.label}`.toLowerCase().includes(q))
      .map((k) => k.code)
  }, [find, query, keys])

  const live = useRef({ lab, find, query, matches, cursor, muted })
  live.current = { lab, find, query, matches, cursor, muted }

  useEffect(() => {
    void document.fonts.ready.then(() => setFontsReady(true))
    const onResize = () => setPortrait(innerWidth < innerHeight * 0.8)
    onResize()
    addEventListener('resize', onResize)
    return () => removeEventListener('resize', onResize)
  }, [])

  const sound = useCallback((kind: keyof typeof SOUNDS) => {
    if (!live.current.muted) thock(kind)
  }, [])

  const ripple = useCallback(
    (k: Key) => {
      const color = k.item ? hsl(k.item.hue, 90, 60) : new THREE.Color(ACCENT)
      const t = performance.now() / 1000
      fx.ripples = [...fx.ripples.filter((r) => t - r.t < 2.5), { x: k.cx, z: k.cz, t, color }].slice(-6)
    },
    [fx],
  )

  const toggleItem = useCallback(
    (item: CatalogItem, zone: boolean) => {
      const { lab: current } = live.current
      if (zone) {
        const group = current.catalog.items.filter((other) => other.category === item.category)
        const all = group.every((other) => current.selected.has(other.ref))
        for (const other of group) if (current.selected.has(other.ref) === all) current.toggle(other.ref)
        sound(all ? 'unlatch' : 'latch')
        group.slice(1, 5).forEach((_, i) => setTimeout(() => sound(all ? 'unlatch' : 'latch'), 35 * (i + 1)))
        return
      }
      const on = current.selected.has(item.ref)
      if (!on) history.current.push(item.ref)
      else history.current = history.current.filter((ref) => ref !== item.ref)
      current.toggle(item.ref)
      sound(on ? 'unlatch' : 'latch')
    },
    [sound],
  )

  const copy = useCallback(() => {
    void navigator.clipboard?.writeText(live.current.lab.command).catch(() => {})
    setCopied(true)
    clearTimeout(copyTimer.current)
    copyTimer.current = window.setTimeout(() => setCopied(false), 1400)
  }, [])

  const moveCursor = useCallback(
    (dir: Vec) => {
      const from = live.current.cursor ? byCode.get(live.current.cursor) : null
      const items = keys.filter((k) => k.item)
      if (!from) {
        setCursor(items.find((k) => k.code === 'KeyF')?.code ?? items[0].code)
        return
      }
      let best: Key | null = null
      let score = Infinity
      for (const k of items) {
        const vx = k.cx - from.cx
        const vz = k.cz - from.cz
        const along = vx * dir[0] + vz * dir[1]
        if (along < 0.4) continue
        const s = along + Math.abs(vx * dir[1] - vz * dir[0]) * 2.5
        if (s < score) {
          score = s
          best = k
        }
      }
      if (best) setCursor(best.code)
    },
    [keys, byCode],
  )

  const press = useCallback(
    (code: string, shift: boolean) => {
      const k = byCode.get(code)
      if (!k) return
      ripple(k)
      const { lab: current, find: finding, matches: found, cursor: at } = live.current
      if (k.item) return toggleItem(k.item, shift)
      switch (k.action) {
        case 'clear':
          if (finding) {
            setFind(false)
            setQuery('')
            sound('tap')
            return
          }
          ;[...current.selected].slice(0, 6).forEach((_, i) => setTimeout(() => sound('unlatch'), i * 28))
          sound('tap')
          history.current = []
          current.clear()
          for (const other of keys) if (other.item && current.selected.has(other.item.ref)) ripple(other)
          return
        case 'copy':
          if (finding) {
            const first = found[0] && byCode.get(found[0])?.item
            if (first) toggleItem(first, shift)
            else sound('tap')
            return
          }
          sound('space')
          return copy()
        case 'numcopy':
          sound('space')
          return copy()
        case 'undo': {
          sound('tap')
          if (finding) return setQuery((q) => q.slice(0, -1))
          const last = history.current.pop()
          if (last && current.selected.has(last)) {
            current.toggle(last)
            sound('unlatch')
          }
          return
        }
        case 'find':
          sound('tap')
          setFind((f) => !f)
          setQuery('')
          return
        case 'space': {
          sound('space')
          const target = at ? byCode.get(at)?.item : null
          if (target) toggleItem(target, shift)
          return
        }
        case 'up':
        case 'down':
        case 'left':
        case 'right':
          sound('tap')
          return moveCursor({ up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[k.action] as Vec)
        case 'framework':
        case 'database':
        case 'packageManager':
        case 'agent':
        case 'target': {
          sound('tap')
          const options = CYCLES[k.action] as readonly string[]
          const next = options[(options.indexOf(current.setup[k.action] as string) + 1) % options.length]
          current.set(k.action, next as Setup[typeof k.action])
          return
        }
        default:
          sound('tap')
      }
    },
    [byCode, copy, keys, moveCursor, ripple, sound, toggleItem],
  )

  useEffect(() => {
    const visualOnly = new Set(['ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'MetaLeft', 'AltLeft', 'AltRight'])
    const onDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.code === 'CapsLock') {
        fx.held.add('CapsLock')
        ripple(byCode.get('CapsLock')!)
        sound('tap')
        setFind(e.getModifierState('CapsLock'))
        setQuery('')
        return
      }
      if (visualOnly.has(e.code)) {
        if (byCode.has(e.code)) fx.held.add(e.code)
        return
      }
      if (e.metaKey || e.ctrlKey) return
      if (e.shiftKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) return
      const k = byCode.get(e.code)
      const { find: finding } = live.current
      if (finding && e.key.length === 1 && e.code !== 'Space') {
        e.preventDefault()
        e.stopImmediatePropagation()
        if (k) fx.held.add(k.code)
        if (!e.repeat) sound('tap')
        setQuery((q) => q + e.key)
        return
      }
      if (!k) return
      e.preventDefault()
      e.stopImmediatePropagation()
      fx.held.add(k.code)
      if (!e.repeat || k.action === 'undo') press(k.code, e.shiftKey)
    }
    const onUp = (e: KeyboardEvent) => {
      fx.held.delete(e.code)
      if (e.code === 'CapsLock') setFind(e.getModifierState('CapsLock'))
    }
    const onPointerUp = () => {
      for (const id of [...fx.held]) {
        if (id.startsWith('ptr:')) {
          fx.held.delete(id)
          fx.held.delete(id.slice(4))
        }
      }
    }
    const onBlur = () => fx.held.clear()
    addEventListener('keydown', onDown, true)
    addEventListener('keyup', onUp, true)
    addEventListener('pointerup', onPointerUp)
    addEventListener('blur', onBlur)
    return () => {
      removeEventListener('keydown', onDown, true)
      removeEventListener('keyup', onUp, true)
      removeEventListener('pointerup', onPointerUp)
      removeEventListener('blur', onBlur)
    }
  }, [byCode, fx, press, ripple, sound])

  const onHover = useCallback((code: string | null) => setHover(code), [])
  const moveTip = (e: ReactPointerEvent) => {
    const el = tooltip.current
    if (!el) return
    const x = Math.min(e.clientX + 22, innerWidth - 256)
    const y = Math.max(72, e.clientY - 22 - el.offsetHeight)
    el.style.transform = `translate(${x}px, ${y}px)`
  }

  return (
    <div className="relative h-full w-full bg-background" onPointerMove={moveTip} onPointerLeave={() => setHover(null)}>
      <Canvas
        key={fontsReady ? 'ready' : 'loading'}
        orthographic
        flat
        shadows
        dpr={[1, 2]}
        camera={{ position: [0, 30, 40], zoom: 50, near: 0.1, far: 200 }}
        onPointerMissed={() => setCursor(null)}
        style={{ cursor: hover ? 'pointer' : 'default' }}
      >
        <Rig portrait={portrait} />
        <ambientLight intensity={lab.theme === 'dark' ? 0.75 : 1.05} />
        <hemisphereLight args={['#ffffff', lab.theme === 'dark' ? '#0b1114' : '#cfd8dc', 0.6]} />
        <directionalLight
          position={[-7, 16, 9]}
          intensity={lab.theme === 'dark' ? 1.3 : 1.7}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-16}
          shadow-camera-right={16}
          shadow-camera-top={10}
          shadow-camera-bottom={-10}
          shadow-bias={-0.0004}
        />
        <group>
          <Board
            keys={keys}
            geos={geos}
            lab={lab}
            fx={fx}
            find={find}
            matches={matches}
            cursor={cursor}
            copied={copied}
            onDown={press}
            onHover={onHover}
            names={names}
          />
        </group>
      </Canvas>
      <Terminal
        lab={lab}
        find={find}
        query={query}
        matches={matches.length}
        copied={copied}
        muted={muted}
        onCopy={() => {
          sound('space')
          copy()
        }}
        onMute={() => setMuted((m) => !m)}
      />
      <Tooltip k={hover ? (byCode.get(hover) ?? null) : null} lab={lab} anchor={tooltip} />
    </div>
  )
}
