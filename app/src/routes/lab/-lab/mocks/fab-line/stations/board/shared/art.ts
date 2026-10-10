import type { Setup } from '@/routes/workspace/-workspace/workspace.types'
import type { Tokens } from '../../../core/contract'
import { MONO, textTexture } from '../../../core/three'

/** The colors the board's prints use, so Blueprint stays ink on paper and Cleanroom gets black epoxy. */
export type Ink = { body: string; ink: string; accent: string }
export const inkOf = (c: Tokens): Ink => ({ body: c.body, ink: c.ink, accent: c.lit })

export function cpuArt(framework: Setup['framework'], k: Ink) {
  if (framework === 'next')
    return textTexture(512, 512, (ctx) => {
      ctx.fillStyle = k.body
      ctx.fillRect(0, 0, 512, 512)
      ctx.strokeStyle = k.ink
      ctx.globalAlpha = 0.08
      ctx.lineWidth = 1
      for (let i = 0; i < 512; i += 16) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 512); ctx.stroke()
        ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(512, i); ctx.stroke()
      }
      ctx.globalAlpha = 0.3
      ctx.lineWidth = 2
      ctx.strokeRect(28, 28, 456, 456)
      ctx.globalAlpha = 1
      ctx.fillStyle = k.ink
      ctx.beginPath()
      ctx.moveTo(52, 70); ctx.lineTo(70, 40); ctx.lineTo(88, 70); ctx.closePath()
      ctx.fill()
      const cx = 256, cy = 236, r = 124
      ctx.lineWidth = 6
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke()
      ctx.lineWidth = 16
      ctx.beginPath(); ctx.moveTo(cx - 48, cy + 62); ctx.lineTo(cx - 48, cy - 62); ctx.lineTo(cx + 58, cy + 92); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(cx + 48, cy - 62); ctx.lineTo(cx + 48, cy + 20); ctx.stroke()
      ctx.font = `600 30px ${MONO}`
      ctx.fillText('NEXT.JS 16', 52, 420)
      ctx.globalAlpha = 0.6
      ctx.font = `500 20px ${MONO}`
      ctx.fillText('APP ROUTER · RSC · CPU0', 52, 452)
      ctx.fillText('BGA-1700', 380, 70)
    })
  return textTexture(640, 416, (ctx) => {
    ctx.fillStyle = k.body
    ctx.fillRect(0, 0, 640, 416)
    ctx.strokeStyle = k.ink
    ctx.globalAlpha = 0.08
    for (let i = 0; i < 640; i += 12) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 416); ctx.stroke() }
    for (let i = 0; i < 416; i += 12) { ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(640, i); ctx.stroke() }
    ctx.globalAlpha = 1
    ctx.strokeStyle = k.accent
    ctx.lineWidth = 4
    ctx.beginPath(); ctx.arc(470, 120, 44, 0, Math.PI * 2); ctx.stroke()
    ctx.strokeStyle = k.ink
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
    ctx.fillStyle = k.ink
    ctx.font = `600 30px ${MONO}`
    ctx.fillText('TANSTACK START', 40, 56)
    ctx.globalAlpha = 0.6
    ctx.font = `500 20px ${MONO}`
    ctx.fillText('SSR · SERVER FN · CPU0', 40, 86)
    ctx.fillText('LGA-1200', 40, 392)
  })
}

export function dimmArt(k: Ink) {
  return textTexture(640, 220, (ctx) => {
    ctx.fillStyle = k.body
    ctx.fillRect(0, 0, 640, 220)
    ctx.strokeStyle = k.accent
    ctx.lineWidth = 6
    ctx.beginPath()
    ctx.ellipse(110, 104, 62, 56, 0, 0, Math.PI * 2)
    ctx.stroke()
    ctx.beginPath()
    ctx.ellipse(70, 92, 30, 42, -0.3, 0, Math.PI * 2)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(150, 120); ctx.quadraticCurveTo(178, 170, 150, 196); ctx.quadraticCurveTo(140, 204, 132, 194)
    ctx.stroke()
    ctx.beginPath(); ctx.arc(128, 86, 6, 0, Math.PI * 2); ctx.fillStyle = k.accent; ctx.fill()
    ctx.fillStyle = k.ink
    ctx.font = `700 46px ${MONO}`
    ctx.fillText('PostgreSQL 17', 210, 92)
    ctx.globalAlpha = 0.65
    ctx.font = `500 28px ${MONO}`
    ctx.fillText('DDR5-6400 · 2×16GB', 210, 138)
    ctx.fillText('ECC · WAL', 210, 176)
  })
}

export function leafArt(k: Ink) {
  return textTexture(256, 256, (ctx) => {
    ctx.fillStyle = k.body
    ctx.fillRect(0, 0, 256, 256)
    ctx.strokeStyle = k.accent
    ctx.lineWidth = 6
    ctx.beginPath()
    ctx.moveTo(128, 34)
    ctx.bezierCurveTo(196, 90, 176, 170, 128, 200)
    ctx.bezierCurveTo(80, 170, 60, 90, 128, 34)
    ctx.stroke()
    ctx.lineWidth = 4
    ctx.beginPath(); ctx.moveTo(128, 60); ctx.lineTo(128, 232); ctx.stroke()
    ctx.fillStyle = k.ink
    ctx.globalAlpha = 0.7
    ctx.font = `600 22px ${MONO}`
    ctx.fillText('MDB 8 NAND', 60, 248)
  })
}
