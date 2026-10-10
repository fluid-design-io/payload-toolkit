import { useFrame } from '@react-three/fiber'
import type { ThreeEvent } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import {
  AdditiveBlending, BoxGeometry, BufferAttribute, BufferGeometry, Color, CylinderGeometry, DynamicDrawUsage,
  LineBasicMaterial, Matrix4, MeshBasicMaterial, MeshStandardMaterial, SphereGeometry, Vector3,
} from 'three'
import type { CanvasTexture, InstancedMesh, LineSegments, Mesh } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import { agents, databases, frameworks, packageManagers } from '../../../../../workspace/-workspace/workspace.constants'
import type { Option, Setup } from '../../../../../workspace/-workspace/workspace.types'
import {
  APPLY, BANDS, BAND_DEPTH, BOARD, BUS_X, CHIP_KEYS, COLUMN, CPU, FONT, MEMORY, MEZZANINE, MONO, PAGE_RECT, PASSIVES, POWER, PROBE,
  bandZ, boxEdges, clamp, textTexture,
} from './contract'
import type { Chip, ChipKey, Look } from './contract'
import { bump } from './sim'
import type { Sim } from './sim'

type Key = ChipKey
const KEYS = CHIP_KEYS

export type BoardProps = {
  look: Look
  setup: Setup
  set: <K extends Key>(key: K, value: Setup[K]) => void
  sim: Sim
  /** False until the first frame has drawn; the silkscreen and chip art wait for it. */
  ready: boolean
  /** Phones: silkscreen outlines without lettering. */
  bare: boolean
  tip: { show: (e: PointerEvent, title: string, sub: string) => void; move: (e: PointerEvent) => void; hide: () => void }
  guard: { moved: boolean }
}

const Y = BOARD.y
const TY = Y + 0.006
const THICK = 0.08
const HALF = CPU.size / 2
const CPU_E = CPU.x + HALF
const CPU_N = CPU.z - HALF
const CPU_S = CPU.z + HALF
const PIN_Z0 = -2.75
const PIN_Z1 = -1.35
const LANES = 12
const PULSES = 12
const STRIP = 24

const bandGate = (e: number, b: number) => clamp((e - 0.04 - b * 0.06) / 0.1, 0, 1)
const staticGate = (e: number) => clamp((e - 0.56) / 0.2, 0, 1)
const cpuGate = (e: number) => clamp((e - 0.76) / 0.24, 0, 1)

const labelOf = <T extends string>(list: readonly Option<T>[], v: T) => list.find((o) => o.value === v)?.label ?? v
function cycle<T extends string>(list: readonly Option<T>[], v: T): T {
  const i = list.findIndex((o) => o.value === v)
  return list[(i + 1) % list.length]!.value
}

type Box = { c: [number, number, number]; s: [number, number, number]; top?: [number, number, number, number]; cyl?: boolean }
const ART: Record<string, [number, number]> = {
  framework: [512, 512],
  postgres: [1024, 166],
  mongodb: [768, 256],
  packageManager: [900, 193],
  agent: [1040, 320],
}
const artSize = (k: Key, database: Setup['database']) => ART[k === 'database' ? database : k]!

const PROBE_BOX = { w: 1.3, h: 0.08, d: 0.4 }
const PADS = Array.from({ length: 10 }, (_, i) => ({ au: 0.07 + (i % 5) * 0.07, av: i < 5 ? 0.68 : 0.32 }))

function boxesFor(k: Key, database: Setup['database']): Box[] {
  if (k === 'framework')
    return [
      { c: [CPU.x, Y + 0.03, CPU.z], s: [CPU.size, 0.06, CPU.size] },
      { c: [CPU.x, Y + 0.095, CPU.z], s: [1.3, 0.07, 1.3], top: [0, 0, 1, 1] },
    ]
  if (k === 'database') {
    if (database === 'postgres')
      return [
        { c: [MEMORY.x, Y + 0.02, MEMORY.z], s: [MEMORY.w, 0.04, MEMORY.d] },
        { c: [MEMORY.x, Y + 0.09, MEMORY.z], s: [2.46, 0.1, 0.4], top: [0, 0, 1, 1] },
      ]
    const out: Box[] = []
    for (let i = 0; i < 3; i++)
      for (let l = 0; l < 3; l++) {
        const s = 0.46 - l * 0.04
        out.push({ c: [MEMORY.x + (i - 1) * 0.85, Y + 0.035 + l * 0.08, MEMORY.z], s: [s, 0.07, s], top: l === 2 ? [i / 3, 0, (i + 1) / 3, 1] : undefined })
      }
    return out
  }
  if (k === 'packageManager') {
    const out: Box[] = [-0.9, 0, 0.9].map((dx, i) => ({ c: [POWER.x + dx, Y + 0.05, POWER.z - 0.04], s: [0.56, 0.1, 0.36], top: [i / 3, 0, (i + 1) / 3, 1] }))
    for (const dx of [-0.45, 0.45]) for (const dz of [-0.1, 0.1]) out.push({ c: [POWER.x + dx, Y + 0.08, POWER.z + dz], s: [0.15, 0.16, 0.15], cyl: true })
    return out
  }
  return [{ c: [PROBE.x, Y + PROBE_BOX.h / 2, PROBE.z], s: [PROBE_BOX.w, PROBE_BOX.h, PROBE_BOX.d], top: [0, 0, 1, 1] }]
}

function partGeometry(boxes: Box[], artH: number) {
  const H = artH + STRIP
  const patch = STRIP / 2 / H
  const geos = boxes.map((b) => {
    const g = b.cyl ? new CylinderGeometry(b.s[0] / 2, b.s[0] / 2, b.s[1], 14) : new BoxGeometry(b.s[0], b.s[1], b.s[2])
    g.translate(b.c[0], b.c[1], b.c[2])
    const pos = g.getAttribute('position'), nor = g.getAttribute('normal'), uv = g.getAttribute('uv')
    for (let i = 0; i < pos.count; i++) {
      if (b.top && nor.getY(i) > 0.5) {
        const [u0, v0, u1, v1] = b.top
        const fx = (pos.getX(i) - (b.c[0] - b.s[0] / 2)) / b.s[0]
        const fz = (pos.getZ(i) - (b.c[2] - b.s[2] / 2)) / b.s[2]
        uv.setXY(i, u0 + fx * (u1 - u0), (STRIP + (v1 - fz * (v1 - v0)) * artH) / H)
      } else uv.setXY(i, 0.5, patch)
    }
    return g
  })
  const merged = mergeGeometries(geos)!
  geos.forEach((g) => g.dispose())
  return merged
}

function partEdges(out: number[], boxes: Box[]) {
  for (const b of boxes) {
    if (!b.cyl) {
      boxEdges(out, b.c[0], b.c[1], b.c[2], b.s[0], b.s[1], b.s[2])
      continue
    }
    const r = b.s[0] / 2, y0 = b.c[1] - b.s[1] / 2, y1 = b.c[1] + b.s[1] / 2, n = 12
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, a2 = ((i + 1) / n) * Math.PI * 2
      for (const y of [y0, y1]) out.push(b.c[0] + Math.cos(a) * r, y, b.c[2] + Math.sin(a) * r, b.c[0] + Math.cos(a2) * r, y, b.c[2] + Math.sin(a2) * r)
      if (i % 3 === 0) out.push(b.c[0] + Math.cos(a) * r, y0, b.c[2] + Math.sin(a) * r, b.c[0] + Math.cos(a) * r, y1, b.c[2] + Math.sin(a) * r)
    }
  }
}

function buildStructure(database: Setup['database']) {
  const out: number[] = []
  const cx = (BOARD.x0 + BOARD.x1) / 2, cz = (BOARD.z0 + BOARD.z1) / 2
  boxEdges(out, cx, Y - THICK / 2, cz, BOARD.x1 - BOARD.x0, THICK, BOARD.z1 - BOARD.z0)
  const legH = Y - THICK
  for (const x of [BOARD.x0 + 0.3, BOARD.x1 - 0.3]) for (const z of [BOARD.z0 + 0.3, BOARD.z1 - 0.3]) boxEdges(out, x, legH / 2, z, 0.12, legH, 0.12)
  const ranges = {} as Record<Key, [number, number]>
  for (const k of KEYS) {
    const from = out.length
    partEdges(out, boxesFor(k, database))
    if (k === 'agent')
      for (const p of PADS) {
        const x = PROBE.x - PROBE_BOX.w / 2 + p.au * PROBE_BOX.w, z = PROBE.z - PROBE_BOX.d / 2 + (1 - p.av) * PROBE_BOX.d
        out.push(x, Y + PROBE_BOX.h, z, x, Y + PROBE_BOX.h + 0.11, z)
      }
    ranges[k] = [from, out.length]
  }
  const base = new Float32Array(out)
  const geometry = new BufferGeometry()
  const attr = new BufferAttribute(base.slice(), 3)
  attr.setUsage(DynamicDrawUsage)
  geometry.setAttribute('position', attr)
  return { geometry, base, ranges }
}

function artTexture(w: number, h: number, look: Look, draw: (ctx: CanvasRenderingContext2D) => void) {
  return textTexture(w, h + STRIP, (ctx) => {
    ctx.fillStyle = look.chip
    ctx.fillRect(0, 0, w, h + STRIP)
    ctx.save()
    ctx.beginPath()
    ctx.rect(0, 0, w, h)
    ctx.clip()
    draw(ctx)
    ctx.restore()
  })
}

const alpha = (ctx: CanvasRenderingContext2D, a: number, f: () => void) => {
  ctx.save()
  ctx.globalAlpha = a
  f()
  ctx.restore()
}

function cpuArt(framework: Setup['framework'], look: Look) {
  return artTexture(512, 512, look, (ctx) => {
    const fg = look.chipFg
    if (framework === 'next') {
      alpha(ctx, 0.07, () => {
        ctx.strokeStyle = fg
        for (let i = 0; i < 512; i += 16) {
          ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 512); ctx.stroke()
          ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(512, i); ctx.stroke()
        }
      })
      alpha(ctx, 0.3, () => { ctx.strokeStyle = fg; ctx.lineWidth = 2; ctx.strokeRect(28, 28, 456, 456) })
      ctx.fillStyle = fg
      ctx.beginPath(); ctx.moveTo(52, 70); ctx.lineTo(70, 40); ctx.lineTo(88, 70); ctx.closePath(); ctx.fill()
      const cx = 256, cy = 236, r = 124
      ctx.strokeStyle = fg
      ctx.lineWidth = 6
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke()
      ctx.lineWidth = 16
      ctx.beginPath(); ctx.moveTo(cx - 48, cy + 62); ctx.lineTo(cx - 48, cy - 62); ctx.lineTo(cx + 58, cy + 92); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(cx + 48, cy - 62); ctx.lineTo(cx + 48, cy + 20); ctx.stroke()
      ctx.font = `600 30px ${MONO}`
      ctx.fillText('NEXT.JS 16', 52, 420)
      alpha(ctx, 0.55, () => {
        ctx.font = `500 20px ${MONO}`
        ctx.fillText('APP ROUTER · RSC · CPU0', 52, 452)
        ctx.fillText('BGA-1700', 380, 70)
      })
      return
    }
    alpha(ctx, 0.35, () => {
      const g = ctx.createLinearGradient(0, 0, 512, 512)
      g.addColorStop(0, '#1B2B3A'); g.addColorStop(0.5, '#2A2147'); g.addColorStop(1, '#173A3A')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, 512, 512)
    })
    alpha(ctx, 0.08, () => {
      ctx.strokeStyle = fg
      for (let i = 0; i < 512; i += 12) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 512); ctx.stroke()
        ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(512, i); ctx.stroke()
      }
    })
    ctx.strokeStyle = '#FFD27A'
    ctx.lineWidth = 4
    ctx.beginPath(); ctx.arc(380, 150, 38, 0, Math.PI * 2); ctx.stroke()
    ctx.strokeStyle = fg
    ctx.lineWidth = 5
    ctx.beginPath(); ctx.ellipse(256, 340, 160, 38, 0, Math.PI, Math.PI * 2); ctx.stroke()
    for (let w = 0; w < 3; w++)
      alpha(ctx, 0.75 - w * 0.2, () => {
        ctx.beginPath()
        for (let x = 80; x <= 432; x += 4) ctx.lineTo(x, 368 + w * 20 + Math.sin(x / 16 + w) * 4)
        ctx.stroke()
      })
    ctx.lineWidth = 7
    ctx.beginPath(); ctx.moveTo(256, 306); ctx.quadraticCurveTo(238, 226, 272, 160); ctx.stroke()
    ctx.lineWidth = 4
    for (const [dx, dy] of [[-80, 18], [-62, -26], [72, 10], [62, -32], [0, -54]] as const) {
      ctx.beginPath(); ctx.moveTo(272, 160); ctx.quadraticCurveTo(272 + dx * 0.5, 160 + dy - 26, 272 + dx, 160 + dy + 26); ctx.stroke()
    }
    ctx.fillStyle = fg
    ctx.font = `600 30px ${MONO}`
    ctx.fillText('TANSTACK START', 40, 62)
    alpha(ctx, 0.6, () => {
      ctx.font = `500 20px ${MONO}`
      ctx.fillText('SSR · SERVER FN · CPU0', 40, 92)
      ctx.fillText('LGA-1200', 40, 482)
    })
  })
}

function memoryArt(database: Setup['database'], look: Look) {
  const [w, h] = ART[database]!
  return artTexture(w, h, look, (ctx) => {
    const fg = look.chipFg
    if (database === 'postgres') {
      const blue = '#6FA8DC'
      ctx.strokeStyle = blue
      ctx.lineWidth = 4
      ctx.beginPath(); ctx.ellipse(84, 78, 42, 38, 0, 0, Math.PI * 2); ctx.stroke()
      ctx.beginPath(); ctx.ellipse(56, 70, 21, 29, -0.3, 0, Math.PI * 2); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(112, 90); ctx.quadraticCurveTo(132, 124, 112, 142); ctx.quadraticCurveTo(104, 148, 98, 141); ctx.stroke()
      ctx.fillStyle = blue
      ctx.beginPath(); ctx.arc(98, 66, 4, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = fg
      ctx.font = `700 46px ${MONO}`
      ctx.fillText('PostgreSQL 17', 164, 72)
      alpha(ctx, 0.55, () => {
        ctx.font = `500 24px ${MONO}`
        ctx.fillText('DDR5-6400 · 2×16GB · ECC · WAL', 164, 112)
      })
      alpha(ctx, 0.35, () => {
        ctx.strokeStyle = fg
        ctx.lineWidth = 2
        for (let i = 0; i < 4; i++) ctx.strokeRect(700 + i * 78, 26, 62, 88)
      })
      alpha(ctx, 0.8, () => {
        ctx.fillStyle = '#C9A54C'
        for (let x = 20; x < w - 20; x += 14) if (Math.abs(x - w * 0.42) > 14) ctx.fillRect(x, h - 22, 8, 16)
      })
      return
    }
    for (let i = 0; i < 3; i++) {
      const cx = 128 + i * 256
      alpha(ctx, 0.25, () => { ctx.strokeStyle = fg; ctx.lineWidth = 2; ctx.strokeRect(cx - 116, 12, 232, 232) })
      ctx.strokeStyle = '#00ED64'
      ctx.lineWidth = 6
      ctx.beginPath()
      ctx.moveTo(cx, 40)
      ctx.bezierCurveTo(cx + 60, 90, cx + 44, 160, cx, 188)
      ctx.bezierCurveTo(cx - 44, 160, cx - 60, 90, cx, 40)
      ctx.stroke()
      ctx.lineWidth = 4
      ctx.beginPath(); ctx.moveTo(cx, 62); ctx.lineTo(cx, 214); ctx.stroke()
      alpha(ctx, 0.7, () => {
        ctx.fillStyle = fg
        ctx.font = `600 22px ${MONO}`
        ctx.textAlign = 'center'
        ctx.fillText(`MDB 8 · N${i}`, cx, 240)
      })
    }
  })
}

const PM_BRAND: Record<Setup['packageManager'], string> = { pnpm: '#F9AD00', npm: '#CB3837', bun: '#F472B6' }
function powerArt(pm: Setup['packageManager'], look: Look) {
  const [w, h] = ART.packageManager!
  return artTexture(w, h, look, (ctx) => {
    const fg = look.chipFg
    for (let i = 0; i < 3; i++) {
      const x = i * 300
      alpha(ctx, 0.3, () => { ctx.strokeStyle = fg; ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect(x + 10, 10, 280, h - 20, 10); ctx.stroke() })
      ctx.fillStyle = PM_BRAND[pm]
      ctx.fillRect(x + 28, 28, 44, 8)
      ctx.fillStyle = fg
      ctx.textAlign = 'center'
      ctx.font = `600 54px ${MONO}`
      ctx.fillText(labelOf(packageManagers, pm), x + 150, 114)
      alpha(ctx, 0.55, () => {
        ctx.font = `500 20px ${MONO}`
        ctx.fillText(`VRM${i + 1} · ${['5V', '3V3', '1V2'][i]}`, x + 150, 156)
      })
      ctx.textAlign = 'left'
    }
  })
}

function probeArt(agent: Setup['agent'], look: Look) {
  const [w, h] = ART.agent!
  return artTexture(w, h, look, (ctx) => {
    const fg = look.chipFg
    alpha(ctx, 0.55, () => {
      ctx.strokeStyle = fg
      ctx.lineWidth = 3
      PADS.forEach((p, i) => {
        const x = p.au * w, y = (1 - p.av) * h
        ctx.beginPath()
        if (i === 0) ctx.rect(x - 16, y - 16, 32, 32)
        else ctx.arc(x, y, 16, 0, Math.PI * 2)
        ctx.stroke()
      })
    })
    const x0 = 0.46 * w
    if (agent === 'claude') {
      ctx.fillStyle = '#D97757'
      ctx.beginPath(); ctx.arc(x0 + 14, 132, 14, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = fg
      ctx.font = `700 52px ${FONT}`
      ctx.fillText('Claude Code', x0 + 46, 150)
    } else if (agent === 'codex') {
      ctx.fillStyle = look.fg
      ctx.font = `700 48px ${MONO}`
      ctx.fillText('>_', x0, 150)
      ctx.fillStyle = fg
      ctx.font = `700 52px ${FONT}`
      ctx.fillText('Codex', x0 + 80, 150)
    } else {
      ctx.fillStyle = look.muted
      ctx.font = `700 46px ${MONO}`
      ctx.fillText('J1 · DEBUG', x0, 150)
    }
    ctx.fillStyle = look.muted
    ctx.font = `500 28px ${MONO}`
    ctx.fillText(agent === 'claude' ? 'JTAG · debug probe' : agent === 'codex' ? 'ISP flasher' : 'no agent attached', x0, 206)
  })
}

const SW = 2048
const PX = SW / (BOARD.x1 - BOARD.x0)
const SH = Math.round((BOARD.z1 - BOARD.z0) * PX)
const sx = (x: number) => (x - BOARD.x0) * PX
const sz = (z: number) => (z - BOARD.z0) * PX
const spaced = (s: string) => s.split('').join(' ')

/** `bare` keeps the outlines and drops the lettering, for phones where it would be a few pixels tall. */
function silkTexture(setup: Pick<Setup, 'target' | 'name' | 'framework' | 'database' | 'packageManager' | 'agent'>, look: Look, bare: boolean) {
  return textTexture(SW, SH, (ctx) => {
    ctx.clearRect(0, 0, SW, SH)
    const text = (s: string, x: number, z: number, size: number, color: string, weight = 600, font = MONO, align: CanvasTextAlign = 'left') => {
      if (bare) return 0
      ctx.font = `${weight} ${size * PX}px ${font}`
      ctx.fillStyle = color
      ctx.textAlign = align
      ctx.fillText(s, sx(x), sz(z))
      return ctx.measureText(s).width / PX
    }
    const rect = (x0: number, z0: number, x1: number, z1: number, r = 0.04) => {
      ctx.beginPath()
      ctx.roundRect(sx(x0), sz(z0), (x1 - x0) * PX, (z1 - z0) * PX, r * PX)
      ctx.stroke()
    }
    ctx.strokeStyle = look.edge
    ctx.lineWidth = 2
    rect(PAGE_RECT.x0, PAGE_RECT.z0, PAGE_RECT.x1, PAGE_RECT.z1, 0.06)
    alpha(ctx, 0.7, () => {
      ctx.setLineDash([10, 8])
      for (let b = 1; b < BANDS.length; b++) {
        ctx.beginPath(); ctx.moveTo(sx(PAGE_RECT.x0), sz(bandZ(b))); ctx.lineTo(sx(PAGE_RECT.x1), sz(bandZ(b))); ctx.stroke()
      }
    })
    BANDS.forEach((band, b) => {
      const x = PAGE_RECT.x1 - 0.08, z = bandZ(b) + 0.15
      const wl = text(spaced(band.label), x, z, 0.075, look.muted, 600, MONO, 'right')
      alpha(ctx, 0.75, () => text(String(b + 1).padStart(2, '0'), x - wl - 0.06, z, 0.075, look.fg, 600, MONO, 'right'))
    })
    text(spaced('PAGE · TOP → BOTTOM'), PAGE_RECT.x0, PAGE_RECT.z0 - 0.08, 0.075, look.muted)
    text(spaced('BUS'), BUS_X, PAGE_RECT.z0 - 0.08, 0.075, look.muted, 600, MONO, 'center')

    const pad = 0.08
    alpha(ctx, 0.85, () => {
      rect(POWER.x - POWER.w / 2 - pad, POWER.z - POWER.d / 2 - pad, POWER.x + POWER.w / 2 + pad, POWER.z + POWER.d / 2 + pad)
      rect(CPU.x - HALF - 0.12, CPU_N - 0.12, CPU_E + 0.12, CPU_S + 0.12)
      rect(MEMORY.x - MEMORY.w / 2 - pad, MEMORY.z - MEMORY.d / 2 - pad, MEMORY.x + MEMORY.w / 2 + pad, MEMORY.z + MEMORY.d / 2 + pad)
      rect(PROBE.x - PROBE.w / 2 - pad, PROBE.z - PROBE.d / 2 - pad, PROBE.x + PROBE.w / 2 + pad, PROBE.z + PROBE.d / 2 + pad)
      rect(PASSIVES.x0, PASSIVES.z0, PASSIVES.x1, PASSIVES.z1)
      rect(MEZZANINE.x - MEZZANINE.w / 2, MEZZANINE.z - MEZZANINE.d / 2, MEZZANINE.x + MEZZANINE.w / 2, MEZZANINE.z + MEZZANINE.d / 2)
    })
    const s = 0.075
    text(spaced(`PWR · ${labelOf(packageManagers, setup.packageManager)}`), POWER.x - POWER.w / 2 - pad, POWER.z - POWER.d / 2 - pad - 0.04, s, look.muted)
    if (!bare) {
      ctx.save()
      ctx.translate(sx(COLUMN.x0 + 0.06), sz(CPU_S))
      ctx.rotate(-Math.PI / 2)
      ctx.font = `600 ${s * PX}px ${MONO}`
      ctx.fillStyle = look.muted
      ctx.textAlign = 'left'
      ctx.fillText(spaced(`CPU0 · ${labelOf(frameworks, setup.framework)}`), 0, 0)
      ctx.restore()
    }
    text(spaced(`MEM · ${labelOf(databases, setup.database)}`), MEMORY.x - MEMORY.w / 2 - pad, MEMORY.z + MEMORY.d / 2 + pad + 0.1, s, look.muted)
    text(spaced(`J1 PROBE · ${labelOf(agents, setup.agent)}`), PROBE.x - PROBE.w / 2 - pad, PROBE.z + PROBE.d / 2 + pad + 0.1, s, look.muted)
    text(spaced('PASSIVES'), PASSIVES.x0, PASSIVES.z0 - 0.05, s, look.muted)
    text(spaced('MEZZANINE'), MEZZANINE.x - MEZZANINE.w / 2, MEZZANINE.z + MEZZANINE.d / 2 + 0.1, s, look.muted)

    ctx.strokeStyle = look.edge
    for (const x of [BOARD.x0 + 0.3, BOARD.x1 - 0.3])
      for (const z of [BOARD.z0 + 0.3, BOARD.z1 - 0.3]) {
        ctx.beginPath(); ctx.arc(sx(x), sz(z), 0.11 * PX, 0, Math.PI * 2); ctx.stroke()
        alpha(ctx, 0.5, () => { ctx.beginPath(); ctx.arc(sx(x), sz(z), 0.06 * PX, 0, Math.PI * 2); ctx.stroke() })
      }

    const right = BOARD.x1 - 0.5
    if (setup.target === 'new') {
      alpha(ctx, 0.9, () => text(setup.name || 'my-payload-app', right, PAGE_RECT.z1 + 0.15, 0.13, look.fg, 700, FONT, 'right'))
      text(spaced('PAYLOAD TOOLKIT · APP BOARD · REV 4'), right, PAGE_RECT.z1 + 0.25, 0.06, look.muted, 600, MONO, 'right')
    } else {
      text(spaced('PAYLOAD TOOLKIT · APP BOARD · REV 4'), right, PAGE_RECT.z1 + 0.13, 0.07, look.muted, 600, MONO, 'right')
      alpha(ctx, 0.7, () => text(spaced('existing project · add'), right, PAGE_RECT.z1 + 0.24, 0.055, look.muted, 500, MONO, 'right'))
    }
  })
}

type Route = { pts: number[]; cum: number[]; len: number }
type TraceKind = 'chip' | 'band' | 'power' | 'memory' | 'cpu'
type Group = { from: number; to: number; kind: TraceKind; i: number; ref: string; band: number; chip: Chip | null; key: number }

function route(pts: number[]): Route {
  const cum = [0]
  for (let k = 2; k < pts.length; k += 2) cum.push(cum[cum.length - 1]! + Math.hypot(pts[k]! - pts[k - 2]!, pts[k + 1]! - pts[k - 1]!))
  return { pts, cum, len: cum[cum.length - 1]! }
}

function sample(r: Route, t: number, out: Vector3) {
  const d = clamp(t, 0, 1) * r.len
  let k = 1
  while (k < r.cum.length - 1 && r.cum[k]! < d) k++
  const a = r.cum[k - 1]!, seg = r.cum[k]! - a
  const f = seg > 0 ? (d - a) / seg : 0
  const x0 = r.pts[(k - 1) * 2]!, z0 = r.pts[(k - 1) * 2 + 1]!, x1 = r.pts[k * 2] ?? x0, z1 = r.pts[k * 2 + 1] ?? z0
  return out.set(x0 + (x1 - x0) * f, TY, z0 + (z1 - z0) * f)
}

function buildTraces(chips: Chip[]) {
  const pos: number[] = []
  const foot: number[] = []
  const groups: Group[] = []
  const routes = new Map<string, Route>()
  const add = (kind: TraceKind, pts: number[], band = -1, i = -1, chip: Chip | null = null) => {
    const from = pos.length / 3
    for (let k = 0; k + 3 < pts.length; k += 2) pos.push(pts[k]!, TY, pts[k + 1]!, pts[k + 2]!, TY, pts[k + 3]!)
    groups.push({ from, to: pos.length / 3, kind, i, ref: chip?.ref ?? '', band, chip, key: -1 })
  }

  BANDS.forEach((_, b) => add('band', [PAGE_RECT.x0 + 0.04, bandZ(b + 1) - 0.035, PAGE_RECT.x1 - 0.04, bandZ(b + 1) - 0.035], b))
  const regSouth = POWER.z - 0.04 + 0.18
  ;[-0.9, 0, 0.9].forEach((dx, i) => {
    const rx = POWER.x + dx, cx = CPU.x + (i - 1) * 0.45, s = Math.sign(cx - rx), zj = -3.06
    for (const o of [-0.025, 0.025]) {
      if (s === 0) add('power', [rx + o, regSouth, rx + o, CPU_N])
      else add('power', [rx + o, regSouth, rx + o, zj - o * s, cx + o, zj - o * s, cx + o, CPU_N])
    }
  })
  for (let i = 0; i < 12; i++) add('memory', [6.45 + i * 0.1, MEMORY.z - MEMORY.d / 2, 6.45 + i * 0.1, CPU_S])
  for (let i = 0; i < 12; i++) {
    const u = -0.7 + (i / 11) * 1.4, L = 0.08
    add('cpu', [CPU_E, CPU.z + u, CPU_E + L, CPU.z + u])
    add('cpu', [CPU.x - HALF, CPU.z + u, CPU.x - HALF - L, CPU.z + u])
    add('cpu', [CPU.x + u, CPU_N, CPU.x + u, CPU_N - L])
    add('cpu', [CPU.x + u, CPU_S, CPU.x + u, CPU_S + L])
  }

  const fy = Y + 0.005
  const box = chips.map((c, i) => {
    const w = c.size[0] * c.slot.s, d = c.size[2] * c.slot.s, m = 0.03
    const x0 = c.slot.x - w / 2 - m, x1 = c.slot.x + w / 2 + m, z0 = c.slot.z - d / 2 - m, z1 = c.slot.z + d / 2 + m
    foot.push(x0, fy, z0, x1, fy, z0, x1, fy, z0, x1, fy, z1, x1, fy, z1, x0, fy, z1, x0, fy, z1, x0, fy, z0)
    for (let k = 0; k < 4; k++) {
      const z = z0 + ((k + 0.5) / 4) * (z1 - z0)
      foot.push(x0 - 0.05, fy, z, x0, fy, z, x1, fy, z, x1 + 0.05, fy, z)
    }
    return { c, i, x0, z0, start: x0 - 0.05 }
  })

  const page = box.filter((b) => b.c.slot.band >= 0)
  const zc = new Map<number, number>()
  for (let band = 0; band < BANDS.length; band++) {
    const list = page.filter((b) => b.c.slot.band === band).sort((a, b) => b.c.slot.x - a.c.slot.x)
    list.forEach((b, r) => zc.set(b.i, Math.min(bandZ(band) + 0.05 + Math.min(r, 8) * 0.03, b.z0 - 0.02, b.c.slot.z)))
  }
  const sorted = [...page].sort((a, b) => zc.get(a.i)! - zc.get(b.i)! || b.c.slot.x - a.c.slot.x)
  const n = sorted.length
  const pin = new Map<number, number>()
  sorted.forEach((b, k) => pin.set(b.i, n === 1 ? (PIN_Z0 + PIN_Z1) / 2 : PIN_Z0 + (k / (n - 1)) * (PIN_Z1 - PIN_Z0)))
  const above = sorted.filter((b) => zc.get(b.i)! < pin.get(b.i)!).reverse()
  const below = sorted.filter((b) => zc.get(b.i)! >= pin.get(b.i)!)
  for (const list of [above, below])
    list.forEach((b, rank) => {
      const lane = BUS_X - Math.min(rank, LANES - 1) * 0.05
      const z = b.c.slot.z, c = zc.get(b.i)!, p = pin.get(b.i)!, j = b.start - 0.06
      const pts = [b.start, z, j, z, j, c, lane, c, lane, p, CPU_E, p]
      add('chip', pts, b.c.slot.band, b.i, b.c)
      routes.set(b.c.ref, route(pts))
    })

  const side = (band: number, top: number, cap: number, trunk: number, zt: number, px: number) => {
    box
      .filter((b) => b.c.slot.band === band)
      .sort((a, b) => a.c.slot.x - b.c.slot.x)
      .forEach((b, r) => {
        const zcol = top - 0.05 - Math.min(r, cap) * 0.03, j = b.start - 0.06
        const pts = [b.start, b.c.slot.z, j, b.c.slot.z, j, zcol, trunk, zcol, trunk, zt, px, zt, px, CPU_S]
        add('chip', pts, band, b.i, b.c)
        routes.set(b.c.ref, route(pts))
      })
  }
  side(-1, PASSIVES.z0, 10, COLUMN.x0 - 0.14, CPU_S + 0.17, 6.3)
  side(-2, MEZZANINE.z - MEZZANINE.d / 2, 5, COLUMN.x0 - 0.2, CPU_S + 0.12, 6.2)

  return { pos: new Float32Array(pos), foot: new Float32Array(foot), groups, routes }
}

function useArt<T>(value: T, look: Look, make: (v: T, look: Look) => CanvasTexture, mat: MeshStandardMaterial, ready: boolean) {
  const tex = useMemo(() => (ready ? make(value, look) : null), [ready, value, look.chip, look.chipFg, look.fg, look.muted])
  useLayoutEffect(() => {
    mat.map = tex
    mat.emissiveMap = tex
    mat.color.set(tex ? '#ffffff' : look.chip)
    mat.needsUpdate = true
    return () => tex?.dispose()
  }, [tex, mat, look.chip])
}

const TIPS: Record<Key, string> = {
  framework: 'Framework chip · click to swap',
  database: 'Database chip · click to swap',
  packageManager: 'Package manager chip · click to swap',
  agent: 'Agent chip · click to swap',
}

export function Board({ look, setup, set, sim, ready, bare, tip, guard }: BoardProps) {
  const { target, name, framework, database, packageManager, agent } = setup
  const feed = sim.board
  const energy = sim.energy

  const mats = useMemo(() => {
    const make = () => new MeshStandardMaterial({ color: '#ffffff', roughness: 0.55, metalness: 0.15, emissive: '#ffffff', emissiveIntensity: 0 })
    return { framework: make(), database: make(), packageManager: make(), agent: make() } satisfies Record<Key, MeshStandardMaterial>
  }, [])
  const lines = useMemo(() => ({
    structure: new LineBasicMaterial({ color: look.edge }),
    trace: new LineBasicMaterial({ vertexColors: true, toneMapped: false }),
    glow: new LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.5, blending: AdditiveBlending, depthWrite: false, toneMapped: false }),
    foot: new LineBasicMaterial({ color: look.dim, toneMapped: false }),
    band: new LineBasicMaterial({ color: look.accent, toneMapped: false }),
    pulse: new MeshBasicMaterial({ color: look.accent, toneMapped: false }),
    pulseGeo: new SphereGeometry(0.032, 10, 8),
  }), [])
  useEffect(() => () => {
    Object.values(mats).forEach((m) => m.dispose())
    Object.values(lines).forEach((m) => m.dispose())
  }, [mats, lines])

  const colors = useMemo(() => ({
    edge: new Color(look.edge), dim: new Color(look.dim), accent: new Color(look.accent), white: new Color('#ffffff'),
  }), [look.edge, look.dim, look.accent])

  useArt(framework, look, cpuArt, mats.framework, ready)
  useArt(database, look, memoryArt, mats.database, ready)
  useArt(packageManager, look, powerArt, mats.packageManager, ready)
  useArt(agent, look, probeArt, mats.agent, ready)

  const geos = useMemo(() => {
    const out = {} as Record<Key, BufferGeometry>
    for (const k of KEYS) out[k] = partGeometry(boxesFor(k, database), artSize(k, database)[1])
    return out
  }, [database])
  useEffect(() => () => Object.values(geos).forEach((g) => g.dispose()), [geos])

  const structure = useMemo(() => buildStructure(database), [database])
  useEffect(() => () => structure.geometry.dispose(), [structure])

  const silk = useMemo(
    () => (ready ? silkTexture({ target, name, framework, database, packageManager, agent }, look, bare) : null),
    [ready, bare, target, name, framework, database, packageManager, agent, look.fg, look.muted, look.edge],
  )
  useEffect(() => () => silk?.dispose(), [silk])

  const silkMat = useRef<MeshBasicMaterial>(null)
  const meshes = useRef<Partial<Record<Key, Mesh | null>>>({})
  const traceRef = useRef<LineSegments>(null)
  const glowRef = useRef<LineSegments>(null)
  const footRef = useRef<LineSegments>(null)
  const bandRef = useRef<LineSegments>(null)
  const pulseRef = useRef<InstancedMesh>(null)
  const lifted = useRef<Record<Key, number>>({ framework: 0, database: 0, packageManager: 0, agent: 0 })
  const built = useRef<{ version: number; groups: Group[]; routes: Map<string, Route>; color: BufferAttribute | null; glow: BufferAttribute | null; colors: typeof colors | null; structure: typeof structure | null; band: number }>({
    version: Number.NaN, groups: [], routes: new Map(), color: null, glow: null, colors: null, structure: null, band: -2,
  })
  const tmp = useMemo(() => ({ v: new Vector3(), m: new Matrix4(), c: new Color() }), [])
  const bandPos = useMemo(() => new Float32Array(24), [])

  useEffect(() => () => {
    traceRef.current?.geometry.dispose()
    glowRef.current?.geometry.dispose()
    footRef.current?.geometry.dispose()
  }, [])

  useFrame(() => {
    const st = built.current
    const trace = traceRef.current, glow = glowRef.current, foot = footRef.current
    if (trace && glow && foot && st.version !== feed.version) {
      st.version = feed.version
      const data = buildTraces(feed.chips)
      const posAttr = new BufferAttribute(data.pos, 3)
      const color = new BufferAttribute(new Float32Array(data.pos.length), 3).setUsage(DynamicDrawUsage)
      const glowColor = new BufferAttribute(new Float32Array(data.pos.length), 3).setUsage(DynamicDrawUsage)
      const tg = new BufferGeometry().setAttribute('position', posAttr).setAttribute('color', color)
      const gg = new BufferGeometry().setAttribute('position', posAttr).setAttribute('color', glowColor)
      const fg = new BufferGeometry().setAttribute('position', new BufferAttribute(data.foot, 3))
      const old = [trace.geometry, glow.geometry, foot.geometry]
      trace.geometry = tg
      glow.geometry = gg
      foot.geometry = fg
      foot.visible = data.foot.length > 0
      old.forEach((g) => g.dispose())
      Object.assign(st, { groups: data.groups, routes: data.routes, color, glow: glowColor })
    }

    const e = clamp(energy.board, 0, 1), all = clamp(energy.all, 0, 1)
    const fade = (0.3 + 0.7 * e) * all
    const stat = staticGate(e), wake = cpuGate(e)

    if (st.colors !== colors) {
      st.colors = colors
      st.groups.forEach((g) => { g.key = -1 })
    }
    if (st.color && st.glow) {
      const ca = st.color.array as Float32Array, ga = st.glow.array as Float32Array
      const { dim, accent } = colors
      let dirty = false
      let populated = 0
      for (const chip of feed.chips) if (chip.slot.band >= 0) populated |= 1 << chip.slot.band
      for (const g of st.groups) {
        let f = 0
        if (g.kind === 'chip') {
          const live = feed.chips[g.i]
          const lit = live && live.ref === g.ref ? live.lit : (g.chip?.lit ?? 0)
          f = clamp(lit, 0, 1) * (g.band >= 0 ? bandGate(e, g.band) : stat)
        } else if (g.kind === 'band') {
          const settled = clamp((e - 0.22 - g.band * 0.06) / 0.22, 0, 1)
          f = bandGate(e, g.band) * (1 - settled * (populated & (1 << g.band) ? 0.7 : 0.88))
        }
        else if (g.kind === 'power') f = stat * 0.6
        else if (g.kind === 'memory') f = stat * 0.45
        else f = wake * 0.55
        const key = Math.round(f * 255) * 4096 + Math.round(fade * 255) * 16 + Math.round(all * 15)
        if (key === g.key) continue
        g.key = key
        dirty = true
        const r = (dim.r * fade * (1 - f) + accent.r * f) * all
        const gr = (dim.g * fade * (1 - f) + accent.g * f) * all
        const b = (dim.b * fade * (1 - f) + accent.b * f) * all
        const hr = accent.r * f * all, hg = accent.g * f * all, hb = accent.b * f * all
        for (let v = g.from; v < g.to; v++) {
          ca[v * 3] = r; ca[v * 3 + 1] = gr; ca[v * 3 + 2] = b
          ga[v * 3] = hr; ga[v * 3 + 1] = hg; ga[v * 3 + 2] = hb
        }
      }
      if (dirty) {
        st.color.needsUpdate = true
        st.glow.needsUpdate = true
      }
    }

    lines.structure.color.copy(colors.edge).multiplyScalar(0.4 + 0.6 * e * all)
    lines.foot.color.copy(colors.dim).multiplyScalar(fade)
    lines.band.color.copy(colors.accent).multiplyScalar(all * (0.35 + 0.65 * e))
    lines.pulse.color.copy(colors.accent).lerp(colors.white, 0.35).multiplyScalar(all)
    if (silkMat.current) silkMat.current.opacity = (0.2 + 0.8 * e) * all

    const breathe = 0.92 + 0.08 * Math.cos(sim.idleTime * 1.7)
    mats.framework.emissiveIntensity = wake * 0.7 * all * breathe
    mats.database.emissiveIntensity = mats.packageManager.emissiveIntensity = mats.agent.emissiveIntensity = stat * 0.5 * all

    const posAttr = structure.geometry.getAttribute('position') as BufferAttribute
    const arr = posAttr.array as Float32Array
    if (st.structure !== structure) {
      st.structure = structure
      KEYS.forEach((k) => { lifted.current[k] = -1 })
    }
    let moved = false
    for (const k of KEYS) {
      const p = sim.bumps[k]
      const lift = p >= 0 ? 0.18 * Math.sin(p * Math.PI) * (1 - 0.5 * p) : 0
      const mesh = meshes.current[k]
      if (mesh) mesh.position.y = lift
      if (lift === lifted.current[k]) continue
      lifted.current[k] = lift
      const [a, b] = structure.ranges[k]
      for (let i = a + 1; i < b; i += 3) arr[i] = structure.base[i]! + lift
      moved = true
    }
    if (moved) posAttr.needsUpdate = true

    const band = bandRef.current
    if (band) {
      const ab = feed.activeBand
      band.visible = ab >= 0 && ab < BANDS.length
      if (band.visible && ab !== st.band) {
        st.band = ab
        const x0 = PAGE_RECT.x0 + 0.02, x1 = PAGE_RECT.x1 - 0.02, z0 = bandZ(ab) + 0.02, z1 = bandZ(ab) + BAND_DEPTH - 0.02, y = TY + 0.002
        bandPos.set([x0, y, z0, x1, y, z0, x1, y, z0, x1, y, z1, x1, y, z1, x0, y, z1, x0, y, z1, x0, y, z0])
        const attr = band.geometry.getAttribute('position') as BufferAttribute | undefined
        if (attr) attr.needsUpdate = true
      }
    }

    const pulses = pulseRef.current
    if (pulses) {
      let n = 0
      for (const p of feed.pulses) {
        if (n >= PULSES) break
        const r = st.routes.get(p.ref)
        if (!r) continue
        sample(r, p.t, tmp.v)
        pulses.setMatrixAt(n++, tmp.m.makeTranslation(tmp.v.x, TY + 0.03, tmp.v.z))
      }
      pulses.count = n
      pulses.visible = n > 0
      if (n) pulses.instanceMatrix.needsUpdate = true
    }
  }, APPLY)

  const swap = (k: Key) => {
    bump(sim, k)
    if (k === 'framework') set('framework', cycle(frameworks, framework))
    else if (k === 'database') set('database', cycle(databases, database))
    else if (k === 'packageManager') set('packageManager', cycle(packageManagers, packageManager))
    else set('agent', cycle(agents, agent))
  }
  const titleOf = (k: Key) =>
    k === 'framework' ? `${labelOf(frameworks, framework)} · CPU0`
      : k === 'database' ? `${labelOf(databases, database)} · ${database === 'postgres' ? 'DIMM' : 'NAND stack'}`
        : k === 'packageManager' ? `${labelOf(packageManagers, packageManager)} · power stage`
          : agent === 'none' ? 'No agent · J1 header' : `${labelOf(agents, agent)} · debug probe`

  return (
    <group>
      <lineSegments geometry={structure.geometry} material={lines.structure} frustumCulled={false} />
      {silk && (
        <mesh position={[(BOARD.x0 + BOARD.x1) / 2, Y + 0.002, (BOARD.z0 + BOARD.z1) / 2]} rotation-x={-Math.PI / 2}>
          <planeGeometry args={[BOARD.x1 - BOARD.x0, BOARD.z1 - BOARD.z0]} />
          <meshBasicMaterial ref={silkMat} map={silk} transparent depthWrite={false} toneMapped={false} />
        </mesh>
      )}
      {KEYS.map((k) => (
        <mesh
          key={k}
          ref={(m) => { meshes.current[k] = m }}
          geometry={geos[k]}
          material={mats[k]}
          onClick={(e: ThreeEvent<MouseEvent>) => {
            e.stopPropagation()
            if (guard.moved) return
            swap(k)
          }}
          onPointerOver={(e: ThreeEvent<PointerEvent>) => {
            e.stopPropagation()
            tip.show(e.nativeEvent, titleOf(k), TIPS[k])
          }}
          onPointerMove={(e: ThreeEvent<PointerEvent>) => tip.move(e.nativeEvent)}
          onPointerOut={() => tip.hide()}
        />
      ))}
      <lineSegments ref={footRef} material={lines.foot} frustumCulled={false} />
      <lineSegments ref={traceRef} material={lines.trace} frustumCulled={false} />
      <lineSegments ref={glowRef} material={lines.glow} position-y={0.004} frustumCulled={false} renderOrder={1} />
      <lineSegments ref={bandRef} material={lines.band} frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[bandPos, 3]} />
        </bufferGeometry>
      </lineSegments>
      <instancedMesh ref={pulseRef} args={[lines.pulseGeo, lines.pulse, PULSES]} frustumCulled={false} />
    </group>
  )
}
