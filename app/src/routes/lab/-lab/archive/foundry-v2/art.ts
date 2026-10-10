import { CanvasTexture, SRGBColorSpace } from 'three'

import type { Agent, CatalogItem, PackageManager, Setup } from '../../../../workspace/-workspace/workspace.types'
import { BANDS, BOARD, CPU, HEADER, LED, PACKAGES, PAGE, PKG_NAME, PASSIVES, bandZ, hash, pkgOf } from './model'
import type { Pkg, Spec } from './model'

export const FONT = '"Timeless Grotesk", ui-sans-serif, system-ui, sans-serif'
export const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace'

export function canvasTexture(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  draw(canvas.getContext('2d')!)
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 8
  return texture
}

const fit = (ctx: CanvasRenderingContext2D, text: string, max: number) => {
  if (ctx.measureText(text).width <= max) return text
  let t = text
  while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1)
  return `${t}…`
}

/** Bundled parts carry a filled square, the first-party registry a ring, every other registry a hexagon with its initials. */
export function glyph(ctx: CanvasRenderingContext2D, source: string, x: number, y: number, r: number, ink: string) {
  const initials = source.replace(/^@/, '').split(/[-_/]/).map((w) => w[0]?.toUpperCase() ?? '').join('').slice(0, 2)
  ctx.save()
  ctx.strokeStyle = ink
  ctx.fillStyle = ink
  ctx.lineWidth = Math.max(2, r * 0.14)
  ctx.lineJoin = 'round'
  if (source === 'payload-toolkit') {
    ctx.beginPath(); ctx.roundRect(x - r, y - r, r * 2, r * 2, r * 0.3); ctx.fill()
    ctx.fillStyle = '#FFFFFF'
    ctx.globalCompositeOperation = 'destination-out'
  } else if (source === '@payload-components') {
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke()
  } else {
    ctx.beginPath()
    for (let i = 0; i < 6; i++) ctx.lineTo(x + Math.cos((i / 6) * Math.PI * 2 + Math.PI / 6) * r, y + Math.sin((i / 6) * Math.PI * 2 + Math.PI / 6) * r)
    ctx.closePath(); ctx.stroke()
  }
  ctx.font = `700 ${r * 1.05}px ${MONO}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(initials, x, y + r * 0.05)
  ctx.restore()
}

export function chipMarking(item: CatalogItem, code: string, spec: Spec, body: string, ink: string) {
  const W = 512
  const H = Math.max(160, Math.round((W * spec.d) / spec.w))
  const rev = `v4.${Math.floor(hash(item.ref) * 9)}.${Math.floor(hash(item.title) * 12)}`
  return canvasTexture(W, H, (ctx) => {
    ctx.fillStyle = body
    ctx.fillRect(0, 0, W, H)
    ctx.fillStyle = ink
    ctx.globalAlpha = 0.5
    ctx.beginPath(); ctx.arc(34, 34, 11, 0, Math.PI * 2); ctx.fill()
    ctx.globalAlpha = 1
    const big = Math.min(50, H * 0.22)
    ctx.font = `600 ${big}px ${MONO}`
    ctx.fillText(fit(ctx, item.title.toUpperCase(), W - 62), 34, H * 0.4 + big * 0.3)
    ctx.globalAlpha = 0.82
    const small = Math.min(32, H * 0.13)
    ctx.font = `500 ${small}px ${MONO}`
    const line2 = `${code}   ${PKG_NAME[spec.pkg]}`
    const stamp = `${rev}  2641`
    const tall = H >= 300
    ctx.fillText(line2, 34, H * (tall ? 0.58 : 0.63) + small * 0.3)
    if (!tall && ctx.measureText(line2).width + ctx.measureText(stamp).width + 90 < W) {
      ctx.textAlign = 'right'
      ctx.fillText(stamp, W - 34, H * 0.63 + small * 0.3)
      ctx.textAlign = 'left'
    }
    ctx.globalAlpha = 0.62
    const r = small * 0.62
    const y3 = H * (tall ? 0.74 : 0.83)
    glyph(ctx, item.source, 34 + r, y3, r, ink)
    ctx.fillStyle = ink
    ctx.font = `500 ${small}px ${MONO}`
    ctx.fillText(fit(ctx, item.source.replace(/^@/, ''), W - 80 - r * 2), 34 + r * 2 + 14, y3 + small * 0.33)
    if (tall) ctx.fillText(stamp, 34, H * 0.88 + small * 0.3)
  })
}

export function legacyMarking(title: string, year: string, spec: Spec) {
  const W = 512
  const H = Math.max(160, Math.round((W * spec.d) / spec.w))
  return canvasTexture(W, H, (ctx) => {
    ctx.fillStyle = '#3A3D3F'
    ctx.fillRect(0, 0, W, H)
    ctx.fillStyle = 'rgba(255,255,255,0.05)'
    for (let i = 0; i < 40; i++) ctx.fillRect(Math.random() * W, Math.random() * H, 60, 2)
    ctx.fillStyle = '#D9DADB'
    ctx.globalAlpha = 0.9
    ctx.beginPath(); ctx.arc(34, 34, 11, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.arc(W / 2, 18, 26, 0, Math.PI); ctx.fillStyle = '#2B2E30'; ctx.fill()
    ctx.fillStyle = '#D9DADB'
    const big = Math.min(56, H * 0.22)
    ctx.font = `600 ${big}px ${MONO}`
    ctx.fillText(fit(ctx, title, W - 70), 34, H * 0.46 + big * 0.3)
    ctx.globalAlpha = 0.7
    const small = Math.min(30, H * 0.12)
    ctx.font = `500 ${small}px ${MONO}`
    ctx.fillText(`YOUR-APP  ${PKG_NAME[spec.pkg]}  ©${year}`, 34, H * 0.78 + small * 0.3)
  })
}

export function cpuArt(framework: Setup['framework']) {
  if (framework === 'next')
    return canvasTexture(512, 512, (ctx) => {
      ctx.fillStyle = '#0A0B0C'
      ctx.fillRect(0, 0, 512, 512)
      ctx.strokeStyle = 'rgba(255,255,255,0.07)'
      ctx.lineWidth = 1
      for (let i = 0; i < 512; i += 16) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 512); ctx.stroke()
        ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(512, i); ctx.stroke()
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.22)'
      ctx.lineWidth = 2
      ctx.strokeRect(28, 28, 456, 456)
      ctx.fillStyle = '#FFFFFF'
      ctx.beginPath(); ctx.moveTo(52, 70); ctx.lineTo(70, 40); ctx.lineTo(88, 70); ctx.closePath(); ctx.fill()
      const cx = 256, cy = 236, r = 124
      ctx.strokeStyle = '#FFFFFF'
      ctx.lineWidth = 6
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke()
      ctx.lineWidth = 16
      ctx.beginPath(); ctx.moveTo(cx - 48, cy + 62); ctx.lineTo(cx - 48, cy - 62); ctx.lineTo(cx + 58, cy + 92); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(cx + 48, cy - 62); ctx.lineTo(cx + 48, cy + 20); ctx.stroke()
      ctx.fillStyle = '#FFFFFF'
      ctx.font = `600 30px ${MONO}`
      ctx.fillText('NEXT.JS 16', 52, 420)
      ctx.fillStyle = 'rgba(255,255,255,0.55)'
      ctx.font = `500 20px ${MONO}`
      ctx.fillText('APP ROUTER · RSC · CPU0', 52, 452)
      ctx.fillText('BGA-1700', 380, 70)
    })
  return canvasTexture(640, 416, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 640, 416)
    g.addColorStop(0, '#1B2B3A')
    g.addColorStop(0.5, '#2A2147')
    g.addColorStop(1, '#173A3A')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 640, 416)
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'
    for (let i = 0; i < 640; i += 12) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 416); ctx.stroke() }
    for (let i = 0; i < 416; i += 12) { ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(640, i); ctx.stroke() }
    ctx.strokeStyle = '#FFD27A'
    ctx.lineWidth = 4
    ctx.beginPath(); ctx.arc(470, 120, 44, 0, Math.PI * 2); ctx.stroke()
    ctx.strokeStyle = '#E9F3F7'
    ctx.lineWidth = 5
    ctx.beginPath(); ctx.ellipse(300, 300, 190, 46, 0, Math.PI, Math.PI * 2); ctx.stroke()
    for (let w = 0; w < 3; w++) {
      ctx.beginPath()
      for (let x = 80; x <= 560; x += 4) ctx.lineTo(x, 330 + w * 22 + Math.sin(x / 18 + w) * 5)
      ctx.globalAlpha = 0.7 - w * 0.2
      ctx.stroke()
    }
    ctx.globalAlpha = 1
    ctx.lineWidth = 7
    ctx.beginPath(); ctx.moveTo(300, 262); ctx.quadraticCurveTo(280, 170, 320, 96); ctx.stroke()
    ctx.lineWidth = 4
    for (const [dx, dy] of [[-90, 20], [-70, -30], [80, 10], [70, -36], [0, -60]]) {
      ctx.beginPath(); ctx.moveTo(320, 96); ctx.quadraticCurveTo(320 + dx * 0.5, 96 + dy - 30, 320 + dx, 96 + dy + 30); ctx.stroke()
    }
    ctx.fillStyle = '#E9F3F7'
    ctx.font = `600 30px ${MONO}`
    ctx.fillText('TANSTACK START', 40, 56)
    ctx.fillStyle = 'rgba(233,243,247,0.6)'
    ctx.font = `500 20px ${MONO}`
    ctx.fillText('SSR · SERVER FN · CPU0', 40, 86)
    ctx.fillText('LGA-1200', 40, 392)
  })
}

export function dimmArt() {
  return canvasTexture(640, 220, (ctx) => {
    ctx.fillStyle = '#F2F4F5'
    ctx.fillRect(0, 0, 640, 220)
    ctx.strokeStyle = '#336791'
    ctx.lineWidth = 6
    ctx.beginPath(); ctx.ellipse(110, 104, 62, 56, 0, 0, Math.PI * 2); ctx.stroke()
    ctx.beginPath(); ctx.ellipse(70, 92, 30, 42, -0.3, 0, Math.PI * 2); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(150, 120); ctx.quadraticCurveTo(178, 170, 150, 196); ctx.quadraticCurveTo(140, 204, 132, 194); ctx.stroke()
    ctx.beginPath(); ctx.arc(128, 86, 6, 0, Math.PI * 2); ctx.fillStyle = '#336791'; ctx.fill()
    ctx.fillStyle = '#1D2225'
    ctx.font = `700 46px ${MONO}`
    ctx.fillText('PostgreSQL 17', 210, 92)
    ctx.fillStyle = '#5B6469'
    ctx.font = `500 28px ${MONO}`
    ctx.fillText('DDR5-6400 · 2×16GB', 210, 138)
    ctx.fillText('ECC · WAL · ROW STORE', 210, 176)
  })
}

export function leafArt() {
  return canvasTexture(256, 256, (ctx) => {
    ctx.fillStyle = '#0F1A14'
    ctx.fillRect(0, 0, 256, 256)
    ctx.strokeStyle = '#00ED64'
    ctx.lineWidth = 6
    ctx.beginPath()
    ctx.moveTo(128, 34)
    ctx.bezierCurveTo(196, 90, 176, 170, 128, 200)
    ctx.bezierCurveTo(80, 170, 60, 90, 128, 34)
    ctx.stroke()
    ctx.lineWidth = 4
    ctx.beginPath(); ctx.moveTo(128, 60); ctx.lineTo(128, 232); ctx.stroke()
    ctx.fillStyle = 'rgba(255,255,255,0.7)'
    ctx.font = `600 22px ${MONO}`
    ctx.fillText('MDB 8 · DOC NAND', 36, 248)
  })
}

export function probeArt(agent: Agent) {
  return canvasTexture(512, 320, (ctx) => {
    if (agent === 'claude') {
      ctx.fillStyle = '#D97757'
      ctx.fillRect(0, 0, 512, 320)
      ctx.strokeStyle = '#FFF4EC'
      ctx.lineWidth = 12
      ctx.lineCap = 'round'
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2
        ctx.beginPath()
        ctx.moveTo(130 + Math.cos(a) * 18, 130 + Math.sin(a) * 18)
        ctx.lineTo(130 + Math.cos(a) * (i % 2 ? 60 : 78), 130 + Math.sin(a) * (i % 2 ? 60 : 78))
        ctx.stroke()
      }
      ctx.fillStyle = '#FFF4EC'
      ctx.font = `700 46px ${FONT}`
      ctx.fillText('Claude Code', 236, 118)
      ctx.font = `500 28px ${MONO}`
      ctx.fillText('JTAG · firmware flash', 236, 164)
    } else {
      ctx.fillStyle = '#0E0F10'
      ctx.fillRect(0, 0, 512, 320)
      ctx.strokeStyle = '#FFFFFF'
      ctx.lineWidth = 10
      ctx.beginPath(); ctx.moveTo(70, 80); ctx.lineTo(120, 130); ctx.lineTo(70, 180); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(140, 184); ctx.lineTo(210, 184); ctx.stroke()
      ctx.fillStyle = '#FFFFFF'
      ctx.font = `700 46px ${FONT}`
      ctx.fillText('Codex', 250, 118)
      ctx.font = `500 28px ${MONO}`
      ctx.fillText('ISP · firmware flash', 250, 164)
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'
    ctx.lineWidth = 3
    ctx.strokeRect(40, 236, 432, 36)
    ctx.fillStyle = 'rgba(255,255,255,0.75)'
    ctx.font = `500 22px ${MONO}`
    ctx.fillText('FLASH', 40, 226)
  })
}

const pmLabel: Record<PackageManager, string> = { pnpm: 'VRM · pnpm · 6-phase', npm: 'LDO · npm · linear', bun: 'BUCK · bun · compact' }
const BW = 2560
const BH = Math.round((BW * (BOARD.z1 - BOARD.z0)) / (BOARD.x1 - BOARD.x0))
export const toPx = (x: number, z: number) => [((x - BOARD.x0) / (BOARD.x1 - BOARD.x0)) * BW, ((z - BOARD.z0) / (BOARD.z1 - BOARD.z0)) * BH] as const
const PX = BW / (BOARD.x1 - BOARD.x0)

/** A tiny top-down package silhouette for the printed key. */
function silhouette(ctx: CanvasRenderingContext2D, pkg: Pkg, x: number, z: number, size: number) {
  const [px, pz] = toPx(x, z)
  const s = size * PX
  ctx.save()
  ctx.translate(px, pz)
  ctx.lineWidth = 2.5
  const body = (w: number, d: number) => ctx.strokeRect(-w / 2, -d / 2, w, d)
  const pins = (sides: ('n' | 's' | 'e' | 'w')[], n: number, w: number, d: number, len: number) => {
    for (const side of sides)
      for (let i = 0; i < n; i++) {
        const u = -w / 2 + ((i + 0.5) / n) * w
        const v = -d / 2 + ((i + 0.5) / n) * d
        ctx.beginPath()
        if (side === 'n') { ctx.moveTo(u, -d / 2); ctx.lineTo(u, -d / 2 - len) }
        if (side === 's') { ctx.moveTo(u, d / 2); ctx.lineTo(u, d / 2 + len) }
        if (side === 'w') { ctx.moveTo(-w / 2, v); ctx.lineTo(-w / 2 - len, v) }
        if (side === 'e') { ctx.moveTo(w / 2, v); ctx.lineTo(w / 2 + len, v) }
        ctx.stroke()
      }
  }
  if (pkg === 'qfp') { body(s * 0.6, s * 0.6); pins(['n', 's', 'e', 'w'], 6, s * 0.6, s * 0.6, s * 0.16) }
  else if (pkg === 'qfn') { body(s * 0.55, s * 0.55); pins(['n', 's', 'e', 'w'], 5, s * 0.55, s * 0.55, s * 0.06) }
  else if (pkg === 'soic') { body(s * 0.9, s * 0.42); pins(['n', 's'], 7, s * 0.9, s * 0.42, s * 0.16) }
  else if (pkg === 'dip') { body(s * 0.9, s * 0.42); pins(['n', 's'], 5, s * 0.9, s * 0.42, s * 0.2); ctx.beginPath(); ctx.arc(-s * 0.45, 0, s * 0.08, -Math.PI / 2, Math.PI / 2); ctx.stroke() }
  else if (pkg === 'passive') { body(s * 0.8, s * 0.4); ctx.fillRect(-s * 0.4, -s * 0.2, s * 0.16, s * 0.4); ctx.fillRect(s * 0.24, -s * 0.2, s * 0.16, s * 0.4) }
  else { body(s * 0.95, s * 0.5); ctx.strokeRect(-s * 0.3, -s * 0.3, s * 0.55, s * 0.3); pins(['w'], 4, s * 0.95, s * 0.5, s * 0.12) }
  ctx.restore()
}

export function silkArt(setup: Setup, silk: string, accent: string, activeBand: number) {
  return canvasTexture(BW, BH, (ctx) => {
    ctx.clearRect(0, 0, BW, BH)
    ctx.fillStyle = silk
    const text = (s: string, x: number, z: number, size: number, weight = 500, font = MONO, align: CanvasTextAlign = 'left') => {
      const [px, pz] = toPx(x, z)
      ctx.font = `${weight} ${size * PX}px ${font}`
      ctx.textAlign = align
      ctx.fillText(s, px, pz)
    }
    BANDS.forEach((band, b) => {
      ctx.fillStyle = b === activeBand ? accent : silk
      text(String(b + 1).padStart(2, '0'), PAGE.x0 + 0.12, bandZ(b) + 0.62, 0.3, 600)
      text(band.label, PAGE.x0 + 0.12, bandZ(b) + 0.98, 0.22, 600)
      ctx.globalAlpha = 0.75
      text(band.groups.join(' '), PAGE.x0 + 0.12, bandZ(b) + 1.24, 0.13, 400)
      const pkgs = [...new Set(band.groups.map((g) => pkgOf({ kind: 'block', category: `block:${g}` })))]
      text(pkgs.map((p) => PKG_NAME[p]).join(' · '), PAGE.x0 + 0.12, bandZ(b) + 1.44, 0.13, 600)
      ctx.globalAlpha = 1
    })
    ctx.save()
    ctx.strokeStyle = silk
    ctx.fillStyle = silk
    ctx.globalAlpha = 0.3
    ctx.lineWidth = 3
    const box = (x: number, z: number, w: number, d: number, r = 0.08) => {
      const [px, pz] = toPx(x, z)
      ctx.beginPath()
      ctx.roundRect(px, pz, w * PX, d * PX, r * PX)
      ctx.stroke()
    }
    const bar = (x: number, z: number, w: number, h = 0.07) => {
      const [px, pz] = toPx(x, z)
      ctx.fillRect(px, pz, w * PX, h * PX)
    }
    const X = PAGE.chipX0 + 0.1
    BANDS.forEach((_, b) => {
      const z = bandZ(b) + 0.42
      if (b === 0) {
        bar(X, z + 0.05, 3.4, 0.16); bar(X, z + 0.32, 2.6, 0.16); bar(X, z + 0.6, 2.2); box(X, z + 0.78, 0.9, 0.22, 0.11); box(X + 1.05, z + 0.78, 0.9, 0.22, 0.11); box(X + 4.6, z, 4.6, 1.0)
      } else if (b === 1) for (let i = 0; i < 7; i++) box(X + i * 1.32, z + 0.3, 1.0, 0.4)
      else if (b === 2) for (let i = 0; i < 3; i++) {
        const [px, pz] = toPx(X + i * 3.1 + 0.2, z + 0.2)
        ctx.beginPath(); ctx.arc(px, pz, 0.16 * PX, 0, Math.PI * 2); ctx.stroke()
        bar(X + i * 3.1, z + 0.5, 2.2, 0.09); bar(X + i * 3.1, z + 0.68, 2.6); bar(X + i * 3.1, z + 0.82, 2.0)
      } else if (b === 3) {
        for (let i = 0; i < 6; i++) bar(X, z + i * 0.16, i % 3 === 2 ? 2.8 : 4.0)
        box(X + 4.7, z, 4.5, 1.0)
      } else if (b === 4) for (let i = 0; i < 3; i++) {
        box(X + i * 3.1, z, 2.8, 1.0)
        bar(X + i * 3.1 + 0.2, z + 0.25, 2.2); bar(X + i * 3.1 + 0.2, z + 0.42, 1.8)
        const [px, pz] = toPx(X + i * 3.1 + 0.4, z + 0.75)
        ctx.beginPath(); ctx.arc(px, pz, 0.12 * PX, 0, Math.PI * 2); ctx.stroke()
      } else if (b === 5) for (let i = 0; i < 3; i++) {
        box(X + i * 3.1, z - 0.05, 2.8, 1.08)
        bar(X + i * 3.1 + 0.2, z + 0.15, 1.0, 0.16); for (let k = 0; k < 3; k++) bar(X + i * 3.1 + 0.2, z + 0.45 + k * 0.14, 2.0)
      } else if (b === 6) {
        bar(X + 2.4, z + 0.12, 4.4, 0.16); bar(X + 3.0, z + 0.42, 3.2); box(X + 3.3, z + 0.65, 1.1, 0.26, 0.13); box(X + 4.6, z + 0.65, 1.1, 0.26, 0.13)
      } else for (let i = 0; i < 4; i++) {
        bar(X + i * 2.35, z + 0.05, 1.0, 0.1); for (let k = 0; k < 4; k++) bar(X + i * 2.35, z + 0.3 + k * 0.17, 1.5)
      }
    })
    ctx.restore()
    ctx.fillStyle = silk
    text('PAGE · top → bottom', PAGE.x0 + 0.1, PAGE.z0 - 0.12, 0.2, 600)
    text('BUS', -0.55, CPU.z - 1.65, 0.2, 600, MONO, 'center')
    text(`CPU0 · ${setup.framework === 'next' ? 'Next.js' : 'TanStack Start'}`, CPU.x, CPU.z + 2.35, 0.2, 600, MONO, 'center')
    text(`MEM · ${setup.database === 'postgres' ? 'PostgreSQL' : 'MongoDB'}`, -7.15, CPU.z + 2.35, 0.17, 600, MONO, 'center')
    text(pmLabel[setup.packageManager], -5.1, -6.25, 0.2, 600, MONO, 'center')
    text('FEATURE BAY · mezzanine', -7.65, 1.15, 0.17, 600)
    text('PASSIVES · components', PASSIVES.x0 - 0.45, 1.15, 0.17, 600)
    text(setup.agent === 'none' ? 'J1 DEBUG · no agent' : `J1 DEBUG · ${setup.agent}`, HEADER.x, HEADER.z - 0.55, 0.16, 600, MONO, 'center')
    text('PWR', LED.pwr.x + 0.16, LED.pwr.z + 0.05, 0.11, 600)
    text('ACT', LED.act.x + 0.16, LED.act.z + 0.05, 0.11, 600)
    ctx.save()
    ctx.strokeStyle = silk
    ctx.fillStyle = silk
    ctx.globalAlpha = 0.8
    text('KEY', -7.65, 5.42, 0.14, 600)
    const entries = (Object.keys(PACKAGES) as Pkg[]).map((pkg) => ({ pkg, ...PACKAGES[pkg] }))
    entries.forEach((e, i) => {
      const col = i % 3, row = Math.floor(i / 3)
      const x = -7.55 + col * 1.15, z = 5.72 + row * 0.42
      silhouette(ctx, e.pkg, x, z, 0.26)
      text(e.name, x + 0.22, z - 0.03, 0.1, 600)
      text(e.role, x + 0.22, z + 0.11, 0.085, 400)
    })
    ctx.restore()
    if (setup.target === 'existing') {
      ctx.fillStyle = silk
      text('EXISTING CODE · untouched', PAGE.chipX0 - 0.1, bandZ(0) + 0.3, 0.15, 600)
      text('payload-toolkit add · rework', BOARD.x1 - 0.4, BOARD.z1 - 0.35, 0.24, 600, MONO, 'right')
    } else {
      ctx.save()
      ctx.globalAlpha = 0.9
      text(setup.name || 'my-payload-app', BOARD.x1 - 0.4, BOARD.z1 - 0.7, 0.62, 700, FONT, 'right')
      ctx.globalAlpha = 0.7
      text('payload-toolkit init · REV 0.1 · blank board', BOARD.x1 - 0.4, BOARD.z1 - 0.3, 0.2, 500, MONO, 'right')
      ctx.restore()
    }
    text('PAYLOAD/APP  REV 4.0  ·  4-LAYER', BOARD.x0 + 0.4, BOARD.z1 - 0.3, 0.2, 600)
  })
}

const dieCache = new Map<string, Promise<CanvasTexture>>()
export function dieArt(image: string | undefined, hue: number, title: string) {
  const key = `${image}|${hue}`
  const hit = dieCache.get(key)
  if (hit) return hit
  const promise = new Promise<CanvasTexture>((resolve) => {
    const draw = (img: HTMLImageElement | null) =>
      resolve(
        canvasTexture(1024, 1024, (ctx) => {
          ctx.fillStyle = '#0C1014'
          ctx.fillRect(0, 0, 1024, 1024)
          const inset = 70
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
          g.addColorStop(0, `hsl(${hue}, 35%, 86%)`)
          g.addColorStop(0.55, `hsl(${(hue + 40) % 360}, 30%, 90%)`)
          g.addColorStop(1, `hsl(${(hue + 200) % 360}, 35%, 84%)`)
          ctx.fillStyle = g
          ctx.fillRect(inset, inset, S, S)
          ctx.globalCompositeOperation = 'source-over'
          ctx.strokeStyle = 'rgba(255,255,255,0.13)'
          ctx.lineWidth = 1
          for (let i = inset; i <= 1024 - inset; i += 16) {
            ctx.beginPath(); ctx.moveTo(i, inset); ctx.lineTo(i, 1024 - inset); ctx.stroke()
            ctx.beginPath(); ctx.moveTo(inset, i); ctx.lineTo(1024 - inset, i); ctx.stroke()
          }
          ctx.strokeStyle = 'rgba(255,255,255,0.28)'
          for (let i = inset; i <= 1024 - inset; i += 128) {
            ctx.beginPath(); ctx.moveTo(i, inset); ctx.lineTo(i, 1024 - inset); ctx.stroke()
            ctx.beginPath(); ctx.moveTo(inset, i); ctx.lineTo(1024 - inset, i); ctx.stroke()
          }
          ctx.strokeStyle = '#C9A54C'
          ctx.lineWidth = 6
          ctx.strokeRect(inset - 24, inset - 24, S + 48, S + 48)
          ctx.fillStyle = '#D8B865'
          for (let i = 0; i < 24; i++) {
            const t = inset + (i + 0.5) * (S / 24) - 8
            ctx.fillRect(t, 14, 16, 22); ctx.fillRect(t, 1024 - 36, 16, 22)
            ctx.fillRect(14, t, 22, 16); ctx.fillRect(1024 - 36, t, 22, 16)
          }
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

/** Frees every cached die texture; the scene calls it on unmount. */
export function dropDies() {
  for (const promise of dieCache.values()) void promise.then((t) => t.dispose())
  dieCache.clear()
}
