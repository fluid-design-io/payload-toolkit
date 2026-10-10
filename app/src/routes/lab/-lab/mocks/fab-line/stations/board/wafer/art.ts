import type { Setup } from '@/routes/workspace/-workspace/workspace.types'
import { FONT, MONO } from '../../../core/three'
import { BANDS } from '../shared/pack'
import { frameTexture } from '../shared/paint'
import type { Painter } from '../shared/paint'
import { DECK, HEADER, R, R0, SECTOR, mid, polar, streetOf } from './plan'

export const DISC = { x0: -R, x1: R, z0: -R, z1: R }
/** Where the wafer's flat is cut, toward the camera. */
export const FLAT = R - 0.3

const pmLabel: Record<Setup['packageManager'], string> = { pnpm: 'VRM · pnpm · 6-phase', npm: 'LDO · npm · linear', bun: 'BUCK · bun · compact' }

function wedge(p: Painter, b: number) {
  const { ctx, px, PX } = p
  const [cx, cz] = px(0, 0)
  const a0 = b * SECTOR - Math.PI / 2, a1 = (b + 1) * SECTOR - Math.PI / 2
  ctx.beginPath()
  ctx.arc(cx, cz, R0 * PX, a0, a1)
  ctx.arc(cx, cz, (R - 0.42) * PX, a1, a0, true)
  ctx.closePath()
}

/**
 * The wafer's face: a die grid per sector at the plan's pitch, the streets
 * between sectors, the core's keep-out ring, the edge exclusion with each
 * band's number and name around the rim, and the lot line along the flat.
 */
export function waferArt(setup: Setup, silk: string, accent: string, activeBand: number, pitch: number) {
  return frameTexture(DISC, 2048, (p) => {
    const { ctx, px, PX, text } = p
    const [cx, cz] = px(0, 0)
    ctx.save()
    ctx.beginPath()
    ctx.arc(cx, cz, R * PX, 0, Math.PI * 2)
    ctx.clip()
    BANDS.forEach((_, b) => {
      ctx.save()
      wedge(p, b)
      if (b === activeBand) {
        ctx.fillStyle = accent
        ctx.globalAlpha = 0.1
        ctx.fill()
      }
      ctx.clip()
      ctx.strokeStyle = b === activeBand ? accent : silk
      ctx.globalAlpha = b === activeBand ? 0.5 : 0.22
      ctx.lineWidth = 1.5
      ctx.beginPath()
      for (let v = -Math.ceil(R / pitch) * pitch; v <= R; v += pitch) {
        const [a] = px(v, 0)
        const [, z] = px(0, v)
        ctx.moveTo(a, 0); ctx.lineTo(a, ctx.canvas.height)
        ctx.moveTo(0, z); ctx.lineTo(ctx.canvas.width, z)
      }
      ctx.stroke()
      ctx.restore()
    })
    ctx.strokeStyle = silk
    ctx.lineWidth = 2.5
    ctx.globalAlpha = 0.6
    for (let k = 0; k < BANDS.length; k++) {
      const a = k * SECTOR
      const n = { x: Math.cos(a), z: Math.sin(a) }
      for (const side of [-1, 1]) {
        const w = streetOf(k) * side
        const s0 = polar(a, R0 - 0.1), s1 = polar(a, R - 0.42)
        const [x0, z0] = px(s0.x + n.x * w, s0.z + n.z * w)
        const [x1, z1] = px(s1.x + n.x * w, s1.z + n.z * w)
        ctx.beginPath(); ctx.moveTo(x0, z0); ctx.lineTo(x1, z1); ctx.stroke()
      }
    }
    ctx.beginPath(); ctx.arc(cx, cz, R0 * PX, 0, Math.PI * 2); ctx.stroke()
    ctx.setLineDash([10, 8])
    ctx.beginPath(); ctx.arc(cx, cz, (R - 0.42) * PX, 0, Math.PI * 2); ctx.stroke()
    ctx.setLineDash([])
    ctx.globalAlpha = 1
    BANDS.forEach((band, b) => {
      const a = mid(b)
      const at = polar(a, R - 0.21)
      const [x, z] = px(at.x, at.z)
      ctx.save()
      ctx.translate(x, z)
      const flip = a > Math.PI / 2 && a < (Math.PI * 3) / 2
      ctx.rotate(flip ? a + Math.PI : a)
      ctx.fillStyle = b === activeBand ? accent : silk
      ctx.font = `700 ${0.25 * PX}px ${MONO}`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(`${String(b + 1).padStart(2, '0')} ${band.label}`, 0, 0)
      ctx.restore()
    })
    ctx.fillStyle = silk
    ctx.globalAlpha = 0.9
    text(`CORE · ${setup.framework === 'next' ? 'Next.js' : 'TanStack Start'}`, 0, R0 - 0.32, 0.17, 600, MONO, 'center')
    text('PAGE · clockwise from 12', 0, -R0 + 0.42, 0.15, 600, MONO, 'center')
    if (setup.target === 'existing') text('payload-toolkit add · rework', 0, FLAT - 0.62, 0.2, 600, MONO, 'center')
    else {
      text(setup.name || 'my-payload-app', 0, FLAT - 0.62, 0.36, 700, FONT, 'center')
      ctx.globalAlpha = 0.7
      text('payload-toolkit init · blank wafer', 0, FLAT - 0.4, 0.13, 500, MONO, 'center')
    }
    ctx.restore()
  })
}

/** The prober deck's silk: memory, power, the bays, J1 and the stage plate. */
export function deckSilk(setup: Setup, silk: string) {
  return frameTexture(DECK, 2560, (p) => {
    const { ctx, text } = p
    ctx.fillStyle = silk
    text(`MEM · ${setup.database === 'postgres' ? 'PostgreSQL' : 'MongoDB'}`, -11.3, 0.8, 0.17, 600, MONO, 'center')
    text(pmLabel[setup.packageManager], -9.6, -6.45, 0.2, 600, MONO, 'center')
    text('FEATURE BAY', -11.75, 1.15, 0.17, 600)
    text('PASSIVES', -8.95, 1.15, 0.17, 600)
    text(setup.agent === 'none' ? 'J1 DEBUG · no agent' : `J1 DEBUG · ${setup.agent}`, HEADER.x, HEADER.z - 0.55, 0.16, 600, MONO, 'center')
    text('PROBER STAGE · W4 · 8-SECTOR', DECK.x0 + 0.3, DECK.z1 - 0.25, 0.18, 600)
    text('BUS ▸ west street', -7.0, -0.55, 0.15, 600, MONO, 'right')
  })
}
