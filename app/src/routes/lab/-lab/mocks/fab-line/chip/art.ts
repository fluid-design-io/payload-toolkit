import { Color, RepeatWrapping } from 'three'
import type { CanvasTexture } from 'three'

import type { CatalogItem } from '@/routes/workspace/-workspace/workspace.types'
import type { Tokens } from '../core/contract'
import { groupOf, PKG_NAME } from '../core/spec'
import type { Spec } from '../core/spec'
import { FONT, MONO, textTexture } from '../core/three'
import type { Floorplan, PadAt, Placed } from './floorplan'
import type { Guts } from './guts'

const fit = (ctx: CanvasRenderingContext2D, text: string, max: number) => {
  if (ctx.measureText(text).width <= max) return text
  let t = text
  while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1)
  return `${t}…`
}
/** The largest font size up to `max` at which `text` fits `width`, never below `min`. */
const sizeFor = (ctx: CanvasRenderingContext2D, text: string, font: (px: number) => string, width: number, max: number, min: number) => {
  ctx.font = font(100)
  return Math.max(min, Math.min(max, Math.floor((100 * width) / Math.max(1, ctx.measureText(text).width))))
}

const CONNECTORS = new Set(['to', 'action', 'cloud'])
/** What tells an item apart inside its group: `call-to-action-boxed` prints BOXED, `logo-cloud-inline-wrap` INLINE WRAP. */
export function variantWord(item: Pick<CatalogItem, 'name' | 'category' | 'label'>) {
  const drop = new Set([groupOf(item.category), ...item.label.toLowerCase().split(/\s+/), ...CONNECTORS])
  const words = item.name.split('-')
  let i = 0
  while (i < words.length - 1 && drop.has(words[i])) i++
  return words.slice(i).join(' ').toUpperCase()
}

/**
 * The lid print, built to read from the overview: the item's variant word
 * as large as the lid allows, a hue edge for its group, and the pick code
 * small underneath. Up close the title and source are still there.
 */
export function chipMarking(item: CatalogItem, code: string, spec: Spec, body: string, ink: string) {
  const W = 512
  const H = Math.max(176, Math.round((W * spec.d) / spec.w))
  return textTexture(W, H, (ctx) => {
    ctx.fillStyle = body
    ctx.fillRect(0, 0, W, H)
    ctx.fillStyle = `hsl(${item.hue}, 58%, 56%)`
    ctx.fillRect(0, 0, 18, H)
    ctx.strokeStyle = ink
    ctx.globalAlpha = 0.6
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.arc(48, 30, 9, 0, Math.PI * 2)
    ctx.stroke()
    ctx.globalAlpha = 1
    const word = variantWord(item)
    const parts = word.includes(' ') && word.length > 9 && H > 300 ? [word.slice(0, word.lastIndexOf(' ')), word.slice(word.lastIndexOf(' ') + 1)] : [word]
    const bold = (px: number) => `700 ${px}px ${FONT}`
    const big = Math.min(...parts.map((p) => sizeFor(ctx, p, bold, W - 64, (H * 0.56) / parts.length, 40)))
    ctx.fillStyle = ink
    ctx.font = bold(big)
    ctx.textBaseline = 'alphabetic'
    const base = H * 0.62 - ((parts.length - 1) * big * 0.98) / 2
    parts.forEach((p, k) => ctx.fillText(fit(ctx, p, W - 64), 36, base + k * big * 0.98 + big * 0.34))
    const small = Math.max(22, Math.min(30, H * 0.11))
    ctx.font = `500 ${small}px ${MONO}`
    ctx.globalAlpha = 0.75
    ctx.fillText(fit(ctx, `${code} · ${PKG_NAME[spec.pkg]}`, W - 64), 36, H - small * 0.7)
    ctx.globalAlpha = 0.55
    ctx.font = `500 ${small * 0.8}px ${MONO}`
    ctx.fillText(fit(ctx, item.title, W - 96), 70, 30 + small * 0.28)
  })
}

const dieCache = new Map<string, Promise<CanvasTexture>>()
/** The die's top metal: the block's screenshot printed as silicon, gridded, inside the pad ring. Cached per image and theme. */
export function dieArt(image: string | undefined, hue: number, title: string, c: Pick<Tokens, 'die' | 'gold'>) {
  const key = `${image}|${hue}|${c.die}|${c.gold}`
  const hit = dieCache.get(key)
  if (hit) return hit
  const promise = new Promise<CanvasTexture>((resolve) => {
    const draw = (img: HTMLImageElement | null) =>
      resolve(
        textTexture(1024, 1024, (ctx) => {
          ctx.fillStyle = c.die
          ctx.fillRect(0, 0, 1024, 1024)
          const inset = Math.round(1024 * CORE_INSET)
          const S = 1024 - inset * 2
          if (img) {
            const side = Math.min(img.width, img.height)
            ctx.drawImage(img, (img.width - side) / 2, 0, side, side, inset, inset, S, S)
          } else {
            ctx.fillStyle = `hsl(${hue}, 30%, 22%)`
            ctx.fillRect(inset, inset, S, S)
            ctx.fillStyle = `hsl(${hue}, 40%, 70%)`
            ctx.font = `600 54px ${MONO}`
            ctx.fillText(title.toUpperCase().slice(0, 22), inset + 40, 512)
          }
          ctx.globalCompositeOperation = 'multiply'
          const g = ctx.createLinearGradient(0, 0, 1024, 1024)
          g.addColorStop(0, `hsl(${hue}, 70%, 72%)`)
          g.addColorStop(0.5, `hsl(${(hue + 120) % 360}, 70%, 78%)`)
          g.addColorStop(1, `hsl(${(hue + 240) % 360}, 70%, 72%)`)
          ctx.fillStyle = g
          ctx.fillRect(inset, inset, S, S)
          ctx.globalCompositeOperation = 'source-over'
          ctx.strokeStyle = 'rgba(255,255,255,0.13)'
          ctx.lineWidth = 1
          for (let i = inset; i <= 1024 - inset; i += 16) {
            ctx.beginPath(); ctx.moveTo(i, inset); ctx.lineTo(i, 1024 - inset); ctx.stroke()
            ctx.beginPath(); ctx.moveTo(inset, i); ctx.lineTo(1024 - inset, i); ctx.stroke()
          }
          ctx.strokeStyle = c.gold
          ctx.globalAlpha = 0.85
          ctx.lineWidth = 6
          ctx.strokeRect(inset - 18, inset - 18, S + 36, S + 36)
          ctx.globalAlpha = 1
        }),
      )
    if (!image) return draw(null)
    const img = new Image()
    img.onload = () => draw(img)
    img.onerror = () => draw(null)
    img.src = image
  })
  dieCache.set(key, promise)
  return promise
}
/** Where the core starts inside the die, shared by the screenshot and the circuit so one wipes into the other. */
export const CORE_INSET = 0.1

const lum = (hex: string) => {
  const k = new Color(hex)
  return 0.2126 * k.r + 0.7152 * k.g + 0.0722 * k.b
}
/** Of the theme's foreground and surface, the one that reads on `ground`. */
export const inkOn = (ground: string, c: Pick<Tokens, 'fg' | 'surface'>) => (Math.abs(lum(c.fg) - lum(ground)) > Math.abs(lum(c.surface) - lum(ground)) ? c.fg : c.surface)

let seed = 1
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)

/** A unit's fill pattern, one per kind, so the floorplan reads like silicon: ROM dots, cell rows, SRAM mesh, arrays, hatch. */
function pattern(ctx: CanvasRenderingContext2D, u: Placed, x: number, y: number, w: number, h: number) {
  ctx.save()
  ctx.beginPath()
  ctx.rect(x, y, w, h)
  ctx.clip()
  const kind = u.kind
  if (kind === 'schema') {
    for (let yy = y + 10; yy < y + h; yy += 18) for (let xx = x + 10; xx < x + w; xx += 18) if (rnd() > 0.35) ctx.fillRect(xx, yy, 6, 6)
  } else if (kind === 'field' || kind === 'action') {
    for (let yy = y + 8; yy < y + h; yy += 22) {
      let xx = x + 6
      while (xx < x + w) {
        const cw = 10 + rnd() * 34
        ctx.fillRect(xx, yy, cw, 12)
        xx += cw + 5
      }
    }
  } else if (kind === 'media') {
    for (let xx = x; xx < x + w; xx += 12) ctx.fillRect(xx, y, 2, h)
    for (let yy = y; yy < y + h; yy += 12) ctx.fillRect(x, yy, w, 2)
  } else if (kind === 'list') {
    const cw = 46, ch = 30
    for (let yy = y + 8; yy + ch < y + h; yy += ch + 10) for (let xx = x + 8; xx + cw < x + w; xx += cw + 10) ctx.strokeRect(xx, yy, cw, ch)
  } else if (kind === 'motion') {
    for (let k = 0; k < h; k += 26) {
      ctx.beginPath()
      for (let xx = 0; xx <= w; xx += 8) ctx.lineTo(x + xx, y + k + 10 + Math.sin(xx / 22 + k) * 8)
      ctx.stroke()
    }
  } else if (kind === 'render') {
    for (let i = 0; i < (w * h) / 260; i++) ctx.fillRect(x + rnd() * w, y + rnd() * h, 4 + rnd() * 14, 4 + rnd() * 6)
  } else if (kind === 'hook') {
    for (let k = -h; k < w; k += 16) { ctx.beginPath(); ctx.moveTo(x + k, y + h); ctx.lineTo(x + k + h, y); ctx.stroke() }
  } else {
    for (let yy = y + 18; yy < y + h; yy += 30) for (let xx = x + 18; xx < x + w; xx += 30) { ctx.beginPath(); ctx.arc(xx, yy, 9, 0, Math.PI * 2); ctx.stroke() }
  }
  ctx.restore()
}

/** The die's circuit layer: the floorplan's units with labels and patterns, the signal wires in the lit color, and the pads. */
export function circuitArt(guts: Guts, plan: Floorplan, c: Tokens) {
  const N = 2048
  seed = guts.name.length * 7919 + 13
  const ink = inkOn(c.die, c)
  return textTexture(N, N, (ctx) => {
    ctx.fillStyle = c.die
    ctx.fillRect(0, 0, N, N)
    ctx.strokeStyle = ink
    ctx.globalAlpha = 0.06
    ctx.lineWidth = 1
    for (let i = 0; i <= N; i += 32) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, N); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(N, i); ctx.stroke() }
    ctx.globalAlpha = 0.9
    ctx.strokeStyle = c.gold
    ctx.lineWidth = 6
    const ring = N * (CORE_INSET - 0.018)
    ctx.strokeRect(ring, ring, N - ring * 2, N - ring * 2)
    ctx.lineWidth = 2
    ctx.strokeRect(ring + 14, ring + 14, N - ring * 2 - 28, N - ring * 2 - 28)
    for (const u of plan.units) {
      const x = u.x * N, y = u.y * N, w = u.w * N, h = u.h * N
      ctx.globalAlpha = 0.08
      ctx.fillStyle = ink
      ctx.fillRect(x, y, w, h)
      ctx.globalAlpha = 0.2
      ctx.strokeStyle = ink
      ctx.lineWidth = 2
      pattern(ctx, u, x + 10, y + 10, w - 20, h - 20)
      ctx.globalAlpha = 0.95
      ctx.lineWidth = 4
      ctx.strokeRect(x, y, w, h)
    }
    ctx.globalAlpha = 0.9
    ctx.strokeStyle = c.lit
    ctx.fillStyle = c.lit
    ctx.lineWidth = 9
    ctx.lineJoin = 'round'
    for (const wire of plan.wires) {
      ctx.beginPath()
      wire.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x * N, y * N) : ctx.moveTo(x * N, y * N)))
      ctx.stroke()
      for (const [x, y] of wire.pts.slice(1, -1)) ctx.fillRect(x * N - 12, y * N - 12, 24, 24)
    }
    for (const u of plan.units) {
      const x = u.x * N, y = u.y * N, w = u.w * N, h = u.h * N
      const big = sizeFor(ctx, u.label, (px) => `700 ${px}px ${FONT}`, w - 48, Math.min(76, h * 0.26), 30)
      const small = Math.max(24, Math.min(34, big * 0.5))
      const boxH = big * 1.1 + small * 1.5 + 22
      ctx.globalAlpha = 0.92
      ctx.fillStyle = c.die
      ctx.font = `700 ${big}px ${FONT}`
      const lw = Math.min(w - 24, Math.max(ctx.measureText(u.label).width, (ctx.font = `500 ${small}px ${MONO}`, ctx.measureText(u.sub).width)) + 28)
      ctx.fillRect(x + 12, y + 12, lw, boxH)
      ctx.globalAlpha = 1
      ctx.fillStyle = ink
      ctx.font = `700 ${big}px ${FONT}`
      ctx.textBaseline = 'top'
      ctx.fillText(fit(ctx, u.label, w - 48), x + 24, y + 22)
      ctx.globalAlpha = 0.7
      ctx.font = `500 ${small}px ${MONO}`
      ctx.fillText(fit(ctx, u.sub, w - 48), x + 24, y + 22 + big * 1.1)
    }
    ctx.globalAlpha = 1
    for (const p of plan.pads) {
      ctx.fillStyle = p.dir === 'pwr' ? ink : c.gold
      ctx.globalAlpha = p.dir === 'pwr' ? 0.35 : 1
      ctx.fillRect(p.x * N - 30, p.y * N - 30, 60, 60)
    }
    ctx.globalAlpha = 0.55
    ctx.fillStyle = ink
    ctx.font = `500 30px ${MONO}`
    ctx.textBaseline = 'alphabetic'
    ctx.fillText(`${guts.name.toUpperCase()} · REV 4α`, ring + 26, N - ring - 26)
  })
}

/** Plate layout in plate units (0..1, y down): the die window and how far the lead fingers reach past it. */
export const PLATE = { cx: 0.5, cy: 0.53, die: 0.54, finger: 0.05, gap: 0.014 }
export const plateToDie = (p: PadAt) => [PLATE.cx + (p.x - 0.5) * PLATE.die, PLATE.cy + (p.y - 0.5) * PLATE.die] as const
/** Where a pad's lead finger starts, just outside the die window. */
export function fingerAt(p: PadAt): [number, number] {
  const [x, y] = plateToDie(p)
  const h = PLATE.die / 2 + PLATE.gap
  return p.side === 0 ? [x, PLATE.cy - h] : p.side === 1 ? [PLATE.cx + h, y] : p.side === 2 ? [x, PLATE.cy + h] : [PLATE.cx - h, y]
}

/**
 * The inspection plate the die rises onto: a drawing sheet with the item's
 * title block, the lead fingers around the die window labelled with the
 * pads they carry, and the files the item installs.
 */
export function plateArt(item: CatalogItem, guts: Guts, plan: Floorplan, spec: Spec, code: string, c: Tokens) {
  const N = 2048
  return textTexture(N, N, (ctx) => {
    ctx.fillStyle = c.surface
    ctx.fillRect(0, 0, N, N)
    ctx.strokeStyle = c.edge
    ctx.lineWidth = 3
    ctx.strokeRect(28, 28, N - 56, N - 56)
    ctx.lineWidth = 2
    for (const [x, y] of [[28, 28], [N - 28, 28], [28, N - 28], [N - 28, N - 28]]) {
      ctx.beginPath(); ctx.moveTo(x - 22, y); ctx.lineTo(x + 22, y); ctx.moveTo(x, y - 22); ctx.lineTo(x, y + 22); ctx.stroke()
    }
    ctx.fillStyle = `hsl(${item.hue}, 58%, 56%)`
    ctx.fillRect(72, 78, 12, 98)
    ctx.fillStyle = c.fg
    ctx.textBaseline = 'top'
    ctx.font = `700 72px ${FONT}`
    ctx.fillText(fit(ctx, item.title, N * 0.62), 108, 72)
    ctx.fillStyle = c.muted
    ctx.font = `500 32px ${MONO}`
    ctx.fillText(fit(ctx, `${code} · ${PKG_NAME[spec.pkg]}-${plan.pads.length} · ${item.source}`, N * 0.62), 110, 152)
    ctx.textAlign = 'right'
    ctx.fillText('DIE · TOP METAL', N - 80, 82)
    ctx.fillText(`${guts.units.length} UNITS · ${plan.wires.length} NETS`, N - 80, 124)
    ctx.textAlign = 'left'
    ctx.strokeStyle = c.edge
    ctx.globalAlpha = 0.5
    ctx.beginPath(); ctx.moveTo(56, 216); ctx.lineTo(N - 56, 216); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(56, N - 150); ctx.lineTo(N - 56, N - 150); ctx.stroke()
    ctx.globalAlpha = 1
    const D = PLATE.die * N, x0 = (PLATE.cx - PLATE.die / 2) * N, y0 = (PLATE.cy - PLATE.die / 2) * N
    ctx.fillStyle = c.die
    ctx.fillRect(x0 - 8, y0 - 8, D + 16, D + 16)
    const fl = PLATE.finger * N
    for (const p of plan.pads) {
      const [fx, fy] = fingerAt(p).map((v) => v * N)
      const along = p.side % 2 === 0
      ctx.fillStyle = p.dir === 'pwr' ? c.muted : c.gold
      ctx.globalAlpha = p.dir === 'pwr' ? 0.5 : 1
      const out = p.side === 0 || p.side === 3 ? -1 : 1
      if (along) ctx.fillRect(fx - 14, out < 0 ? fy - fl : fy, 28, fl)
      else ctx.fillRect(out < 0 ? fx - fl : fx, fy - 14, fl, 28)
      ctx.globalAlpha = 1
      const tag = p.dir === 'in' ? 'IN' : p.dir === 'out' ? 'OUT' : ''
      const pad = fl + 16
      const room = along ? (PLATE.die / (plan.pads.length / 4)) * N - 16 : (PLATE.cx - PLATE.die / 2 - PLATE.gap - PLATE.finger) * N - pad - 40
      const font = (px: number) => `500 ${px}px ${MONO}`
      const px = p.dir === 'pwr' ? 26 : sizeFor(ctx, p.label, font, room, 36, 20)
      const x = p.side === 1 ? fx + pad : p.side === 3 ? fx - pad : fx
      const y = p.side === 0 ? fy - pad - px : p.side === 2 ? fy + pad + 30 : fy + px * 0.5
      ctx.textAlign = p.side === 1 ? 'left' : p.side === 3 ? 'right' : 'center'
      ctx.textBaseline = 'middle'
      if (tag) {
        ctx.font = font(22)
        ctx.fillStyle = c.muted
        ctx.fillText(tag, x, y - px * 0.5 - 16)
      }
      ctx.font = font(px)
      ctx.fillStyle = p.dir === 'pwr' ? c.muted : c.fg
      ctx.fillText(fit(ctx, p.label, room), x, p.dir === 'pwr' ? y - px * 0.5 : y + 4)
    }
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.strokeStyle = c.lit
    ctx.lineWidth = 9
    ctx.beginPath(); ctx.moveTo(80, N - 96); ctx.lineTo(160, N - 96); ctx.stroke()
    ctx.fillStyle = c.fg
    ctx.font = `500 30px ${MONO}`
    ctx.fillText('SIGNAL', 182, N - 96)
    ctx.fillStyle = c.muted
    ctx.fillText(fit(ctx, guts.files.join('   '), N - 520), 340, N - 96)
  })
}

const hatchCache = new Map<string, CanvasTexture>()
/** 45° section hatching for a cut face, tiled; shared per color and never disposed. */
export function hatch(color: string) {
  let t = hatchCache.get(color)
  if (!t) {
    t = textTexture(64, 64, (ctx) => {
      ctx.strokeStyle = color
      ctx.lineWidth = 9
      for (const k of [-64, 0, 64]) { ctx.beginPath(); ctx.moveTo(k, 64); ctx.lineTo(k + 64, 0); ctx.stroke() }
    })
    t.wrapS = t.wrapT = RepeatWrapping
    hatchCache.set(color, t)
  }
  return t
}
