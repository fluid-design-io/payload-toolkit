import { CanvasTexture, RepeatWrapping } from 'three'

import type { Agent, CatalogItem, Setup } from '../../../../workspace/-workspace/workspace.types'
import type { Aisle } from '../../warehouse'
import { ACCENT, FONT, MONO, canvasTexture, fit, tint } from './kit'
import type { Colors, Mat } from './kit'
import { BANDS, BENCH, BOARD, CAB, CPU, HEADER, PAGE, PKG_NAME, bandZ } from './model'
import type { Part, Spec } from './model'

export type Ids = { code: string; refdes: string }

/** Laser marking for one chip, drawn into an atlas cell: pin-1 dot, hue bar, title, refdes and pick code, package and lot. */
export function drawMarking(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, item: CatalogItem, ids: Ids, spec: Spec, body: string, ink: string) {
  ctx.save()
  ctx.translate(x, y)
  ctx.fillStyle = body
  ctx.fillRect(0, 0, w, h)
  const pad = w * 0.06
  const notch = spec.pkg === 'soic' || spec.pkg === 'dip'
  ctx.strokeStyle = ink
  ctx.lineWidth = Math.max(2, w * 0.006)
  ctx.globalAlpha = 0.5
  ctx.beginPath()
  ctx.arc(pad + w * 0.03, pad + w * 0.03, w * 0.024, 0, Math.PI * 2)
  ctx.stroke()
  if (notch) {
    ctx.beginPath()
    ctx.arc(w / 2, 0, h * 0.09, 0, Math.PI)
    ctx.stroke()
  }
  ctx.globalAlpha = 1
  ctx.fillStyle = tint(item.hue, { s: 55, l: 58 } as Colors)
  ctx.fillRect(w - pad - w * 0.08, pad, w * 0.08, h * 0.04)
  ctx.fillStyle = ink
  const big = Math.min(h * 0.22, w * 0.11)
  ctx.font = `600 ${big}px ${MONO}`
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(fit(ctx, item.title.toUpperCase(), w - pad * 2 - w * 0.05), pad, h * 0.44)
  ctx.globalAlpha = 0.82
  const small = Math.min(h * 0.13, w * 0.065)
  ctx.font = `500 ${small}px ${MONO}`
  ctx.fillText(fit(ctx, `${ids.refdes}  ${ids.code}`, w - pad * 2), pad, h * 0.66)
  ctx.globalAlpha = 0.6
  const source = item.source === 'payload-toolkit' ? 'payload-toolkit' : item.source
  ctx.fillText(fit(ctx, `${PKG_NAME[spec.pkg]} · ${source} · 2641`, w - pad * 2), pad, h * 0.86)
  ctx.restore()
}

export function cpuArt(framework: Setup['framework']) {
  if (framework === 'next')
    return canvasTexture(512, 512, (ctx) => {
      ctx.fillStyle = '#0A0B0C'
      ctx.fillRect(0, 0, 512, 512)
      ctx.strokeStyle = 'rgba(255,255,255,0.06)'
      ctx.lineWidth = 1
      for (let i = 0; i < 512; i += 16) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 512); ctx.stroke()
        ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(512, i); ctx.stroke()
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.22)'
      ctx.lineWidth = 2
      ctx.strokeRect(28, 28, 456, 456)
      ctx.fillStyle = '#FFFFFF'
      ctx.beginPath()
      ctx.moveTo(52, 70); ctx.lineTo(70, 40); ctx.lineTo(88, 70); ctx.closePath()
      ctx.fill()
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
      ctx.fillText('APP ROUTER · RSC · U1', 52, 452)
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
      ctx.beginPath(); ctx.moveTo(320, 96); ctx.quadraticCurveTo(320 + dx * 0.5, 96 + dy * 0.5 - 30, 320 + dx, 96 + dy); ctx.stroke()
    }
    ctx.fillStyle = '#FFFFFF'
    ctx.font = `700 34px ${MONO}`
    ctx.fillText('TANSTACK START', 60, 60)
    ctx.fillStyle = 'rgba(255,255,255,0.6)'
    ctx.font = `500 20px ${MONO}`
    ctx.fillText('ISOMORPHIC · U1 · LGA-1156', 60, 90)
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
    ctx.fillText('ECC · WAL', 210, 176)
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
    ctx.fillText('MDB 8 NAND', 60, 248)
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
        ctx.moveTo(130 + Math.cos(a) * 18, 160 + Math.sin(a) * 18)
        ctx.lineTo(130 + Math.cos(a) * (i % 2 ? 60 : 78), 160 + Math.sin(a) * (i % 2 ? 60 : 78))
        ctx.stroke()
      }
      ctx.fillStyle = '#FFF4EC'
      ctx.font = `700 46px ${FONT}`
      ctx.fillText('Claude', 236, 150)
      ctx.font = `500 30px ${MONO}`
      ctx.fillText('JTAG · debug', 236, 198)
    } else {
      ctx.fillStyle = '#0E0F10'
      ctx.fillRect(0, 0, 512, 320)
      ctx.strokeStyle = '#FFFFFF'
      ctx.lineWidth = 10
      ctx.beginPath(); ctx.moveTo(70, 110); ctx.lineTo(120, 160); ctx.lineTo(70, 210); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(140, 214); ctx.lineTo(210, 214); ctx.stroke()
      ctx.fillStyle = '#FFFFFF'
      ctx.font = `700 46px ${FONT}`
      ctx.fillText('Codex', 250, 150)
      ctx.font = `500 30px ${MONO}`
      ctx.fillText('ISP flasher', 250, 198)
    }
  })
}

const pmLabel: Record<Setup['packageManager'], string> = { pnpm: 'VRM · pnpm · 6-phase', npm: 'LDO · npm · linear', bun: 'BUCK · bun · compact' }
const BW = 3072
const BH = Math.round((BW * (BOARD.z1 - BOARD.z0)) / (BOARD.x1 - BOARD.x0))
const toPx = (x: number, z: number) => [((x - BOARD.x0) / (BOARD.x1 - BOARD.x0)) * BW, ((z - BOARD.z0) / (BOARD.z1 - BOARD.z0)) * BH] as const
const PX = BW / (BOARD.x1 - BOARD.x0)

/** The board's silkscreen: band titles, section names, the page wireframe and a refdes beside every seated part. */
export function silkArt(setup: Setup, silk: string, accent: string, activeBand: number, seated: { p: Part; ids: Ids }[]) {
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
      text(band.groups.join(' '), PAGE.x0 + 0.12, bandZ(b) + 1.26, 0.13, 400)
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
    text(`U1 · ${setup.framework === 'next' ? 'Next.js' : 'TanStack Start'}`, CPU.x, CPU.z + 2.35, 0.2, 600, MONO, 'center')
    text(`MEM · ${setup.database === 'postgres' ? 'PostgreSQL' : 'MongoDB'}`, -7.15, CPU.z + 2.35, 0.17, 600, MONO, 'center')
    text(pmLabel[setup.packageManager], -5.1, -6.25, 0.2, 600, MONO, 'center')
    text('M · FEATURE BAY', -7.65, 1.15, 0.17, 600)
    text('R · PASSIVES', -3.75, 1.15, 0.17, 600)
    text(setup.agent === 'none' ? 'J1 DEBUG · no agent' : `J1 DEBUG · ${setup.agent}`, HEADER.x, HEADER.z - 0.55, 0.16, 600, MONO, 'center')
    for (const { p, ids } of seated) {
      if (!p.slot) continue
      const s = p.slot
      const hw = (p.spec.fw * s.s) / 2, hd = (p.spec.fd * s.s) / 2
      const size = Math.min(0.17, 0.11 + 0.07 * s.s)
      if (p.item.kind === 'feature') text(ids.refdes, s.x - hw, s.z - hd - 0.1, size, 600)
      else text(ids.refdes, s.x - hw, s.z + hd + size + 0.04, size, 600)
    }
    if (setup.target === 'existing') {
      text('EXISTING CODE · untouched', PAGE.chipX0 - 0.1, bandZ(0) + 0.26, 0.15, 600)
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

const MW = 2048
const MH = Math.round((MW * (BENCH.z1 - BENCH.z0)) / (BENCH.x1 - BENCH.x0))
const MPX = MW / (BENCH.x1 - BENCH.x0)

/** The bench mat under everything: a self-healing cutting mat, an ESD rubber mat or a drafting grid. */
export function matArt(mat: Mat, c: Colors) {
  return canvasTexture(MW, MH, (ctx) => {
    ctx.fillStyle = c.mat
    ctx.fillRect(0, 0, MW, MH)
    const px = (x: number, z: number) => [(x - BENCH.x0) * MPX, (z - BENCH.z0) * MPX] as const
    const line = (x0: number, z0: number, x1: number, z1: number) => {
      const [a, b] = px(x0, z0), [d, e] = px(x1, z1)
      ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(d, e); ctx.stroke()
    }
    const cell = mat === 'blueprint' ? 0.5 : 1
    const major = mat === 'blueprint' ? 2.5 : 5
    for (let x = Math.ceil(BENCH.x0); x <= BENCH.x1; x += cell) {
      const isMajor = Math.abs(x / major - Math.round(x / major)) < 1e-6
      ctx.strokeStyle = isMajor ? c.matMajor : c.matLine
      ctx.lineWidth = isMajor ? 3 : 1.5
      line(x, BENCH.z0, x, BENCH.z1)
    }
    for (let z = Math.ceil(BENCH.z0); z <= BENCH.z1; z += cell) {
      const isMajor = Math.abs(z / major - Math.round(z / major)) < 1e-6
      ctx.strokeStyle = isMajor ? c.matMajor : c.matLine
      ctx.lineWidth = isMajor ? 3 : 1.5
      line(BENCH.x0, z, BENCH.x1, z)
    }
    ctx.fillStyle = c.matInk
    ctx.font = `500 ${0.26 * MPX}px ${FONT}`
    ctx.textAlign = 'center'
    if (mat === 'cutting') {
      for (let x = Math.ceil(BENCH.x0 / 5) * 5; x <= BENCH.x1; x += 5) {
        const [a, b] = px(x, BENCH.z0 + 0.4)
        ctx.fillText(String(x + 20), a, b)
        const [a2, b2] = px(x, BENCH.z1 - 0.2)
        ctx.fillText(String(x + 20), a2, b2)
      }
      ctx.textAlign = 'left'
      ctx.font = `600 ${0.3 * MPX}px ${FONT}`
      ctx.fillText('A1 · SELF-HEALING · 5 mm GRID', ...px(BENCH.x0 + 0.5, BENCH.z1 - 0.65))
      ctx.strokeStyle = c.matMajor
      ctx.lineWidth = 2.5
      const [cx, cz] = [BENCH.x1 - 0.6, BENCH.z1 - 0.6]
      for (const deg of [30, 45, 60]) {
        const r = deg * (Math.PI / 180)
        line(cx, cz, cx - Math.cos(r) * 8, cz - Math.sin(r) * 8)
      }
      ctx.beginPath()
      const [ax, az] = px(cx, cz)
      ctx.arc(ax, az, 5 * MPX, Math.PI, Math.PI * 1.5)
      ctx.stroke()
      ctx.textAlign = 'right'
      ctx.font = `500 ${0.22 * MPX}px ${FONT}`
      ctx.fillText('30° · 45° · 60°', ...px(BENCH.x1 - 0.5, BENCH.z1 - 5.4))
    } else if (mat === 'esd') {
      ctx.textAlign = 'left'
      ctx.font = `600 ${0.3 * MPX}px ${FONT}`
      ctx.fillText('ESD SAFE · 10⁶ – 10⁹ Ω · GROUNDED', ...px(BENCH.x0 + 0.5, BENCH.z1 - 0.65))
      ctx.strokeStyle = c.matMajor
      ctx.lineWidth = 3
      const [sx, sz] = px(BENCH.x1 - 0.9, BENCH.z0 + 0.9)
      ctx.beginPath(); ctx.arc(sx, sz, 0.22 * MPX, 0, Math.PI * 2); ctx.stroke()
      ctx.beginPath(); ctx.arc(sx, sz, 0.1 * MPX, 0, Math.PI * 2); ctx.stroke()
      ctx.beginPath()
      for (let i = 0; i <= 60; i++) {
        const t = i / 60
        const [qx, qz] = px(BENCH.x1 - 0.9 - t * 4.5, BENCH.z0 + 0.9 + Math.sin(t * Math.PI * 14) * 0.16 + t * 0.4)
        if (i === 0) ctx.moveTo(qx, qz)
        else ctx.lineTo(qx, qz)
      }
      ctx.stroke()
    } else {
      ctx.textAlign = 'left'
      ctx.font = `600 ${0.34 * MPX}px ${FONT}`
      ctx.fillText('PAYLOAD TOOLKIT · BENCH 04 · SHEET 1 OF 1', ...px(BENCH.x0 + 0.5, BENCH.z1 - 0.65))
      ctx.strokeStyle = c.matMajor
      ctx.lineWidth = 3
      const [a, b] = px(BENCH.x0 + 0.3, BENCH.z0 + 0.3)
      ctx.strokeRect(a, b, (BENCH.x1 - BENCH.x0 - 0.6) * MPX, (BENCH.z1 - BENCH.z0 - 0.6) * MPX)
    }
  })
}

const CW = 1024
const CH = Math.round((CW * CAB.H) / CAB.W)
const CPX = CW / CAB.W

/** Drawer labels across the whole cabinet front: category, count and the live match count. */
export function cabinetArt(aisles: readonly Aisle[], matches: number[] | null, active: number, c: Colors) {
  return canvasTexture(CW, CH, (ctx) => {
    ctx.clearRect(0, 0, CW, CH)
    for (let i = 0; i < CAB.cols * CAB.rows; i++) {
      const aisle = aisles[i]
      const col = i % CAB.cols, row = Math.floor(i / CAB.cols)
      const x = (col * CAB.pitchX + 0.06) * CPX
      const y = (0.08 + row * CAB.pitchY + 0.025) * CPX
      const w = CAB.w * CPX, h = CAB.h * CPX
      ctx.fillStyle = c.surface
      ctx.fillRect(x - 2, y - 2, w + 4, h + 4)
      ctx.strokeStyle = i === active ? ACCENT : c.edge
      ctx.lineWidth = i === active ? 5 : 2.5
      ctx.strokeRect(x, y, w, h)
      ctx.fillStyle = c.dark ? '#1E272C' : '#F2F5F6'
      ctx.fillRect(x + 0.1 * CPX, y + 0.07 * CPX, w - 0.2 * CPX, h - 0.14 * CPX)
      if (!aisle) continue
      const none = matches && !matches[i]
      ctx.globalAlpha = none ? 0.35 : 1
      ctx.fillStyle = tint(aisle.hue, c)
      ctx.fillRect(x + 0.13 * CPX, y + 0.1 * CPX, 0.05 * CPX, h - 0.2 * CPX)
      const count = matches ? `${matches[i]}/${aisle.count}` : String(aisle.count)
      ctx.font = `500 ${0.15 * CPX}px ${MONO}`
      const countW = ctx.measureText(count).width
      ctx.fillStyle = matches && matches[i] ? ACCENT : c.muted
      ctx.textAlign = 'right'
      ctx.textBaseline = 'middle'
      ctx.fillText(count, x + w - 0.12 * CPX, y + h / 2 + 0.01 * CPX)
      ctx.fillStyle = c.fg
      ctx.font = `600 ${0.215 * CPX}px ${FONT}`
      ctx.textAlign = 'left'
      ctx.fillText(fit(ctx, aisle.label, w - 0.36 * CPX - countW - 0.08 * CPX), x + 0.24 * CPX, y + h / 2 + 0.015 * CPX)
      ctx.globalAlpha = 1
    }
    ctx.fillStyle = c.muted
    ctx.font = `600 ${0.13 * CPX}px ${MONO}`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    ctx.fillText('PARTS CABINET · ONE DRAWER PER SECTION · SCROLL A DRAWER TO PAGE', 0.1 * CPX, CH - 0.03 * CPX)
  })
}

export function meterArt(count: number, line2: string, c: Colors) {
  return canvasTexture(512, 288, (ctx) => {
    ctx.fillStyle = c.dark ? '#121A14' : '#C9D4BE'
    ctx.fillRect(0, 0, 512, 288)
    ctx.fillStyle = c.dark ? '#B9D9A6' : '#1F2A1A'
    ctx.font = `600 150px ${MONO}`
    ctx.textAlign = 'right'
    ctx.fillText(String(count).padStart(3, '0'), 460, 170)
    ctx.font = `500 34px ${MONO}`
    ctx.textAlign = 'left'
    ctx.fillText('PARTS', 36, 60)
    ctx.fillText('DC', 36, 170)
    ctx.globalAlpha = 0.75
    ctx.font = `500 30px ${MONO}`
    ctx.fillText(fit(ctx, line2, 440), 36, 246)
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

export function repeatTexture(t: CanvasTexture, rx: number, ry: number) {
  t.wrapS = t.wrapT = RepeatWrapping
  t.repeat.set(rx, ry)
  return t
}
