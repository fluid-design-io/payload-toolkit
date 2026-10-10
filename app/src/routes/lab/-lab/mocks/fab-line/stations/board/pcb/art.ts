import type { Setup } from '@/routes/workspace/-workspace/workspace.types'
import { FONT, MONO } from '../../../core/three'
import { frameTexture, pageHints } from '../shared/paint'
import type { Painter } from '../shared/paint'
import { BANDS, BOARD, CPU, HEADER, PAGE, bandZ } from './plan'

const pmLabel: Record<Setup['packageManager'], string> = { pnpm: 'VRM · pnpm · 6-phase', npm: 'LDO · npm · linear', bun: 'BUCK · bun · compact' }

/** The silk of the PCB's core half: CPU, memory, power, bays, the J1 header and the board's title block. */
export function coreSilk(p: Painter, setup: Setup, rev: string, title = { x: BOARD.x1 - 0.4, z: BOARD.z1, size: 0.62 }) {
  const { text, ctx } = p
  text('BUS', -0.55, CPU.z - 1.65, 0.2, 600, MONO, 'center')
  text(`CPU0 · ${setup.framework === 'next' ? 'Next.js' : 'TanStack Start'}`, CPU.x, CPU.z + 2.35, 0.2, 600, MONO, 'center')
  text(`MEM · ${setup.database === 'postgres' ? 'PostgreSQL' : 'MongoDB'}`, -7.15, CPU.z + 2.35, 0.17, 600, MONO, 'center')
  text(pmLabel[setup.packageManager], -5.1, -6.25, 0.2, 600, MONO, 'center')
  text('FEATURE BAY · mezzanine', -7.65, 1.15, 0.17, 600)
  text('PASSIVES · components', -3.75, 1.15, 0.17, 600)
  text(setup.agent === 'none' ? 'J1 DEBUG · no agent' : `J1 DEBUG · ${setup.agent}`, HEADER.x, HEADER.z - 0.55, 0.16, 600, MONO, 'center')
  const k = title.size / 0.62
  if (setup.target === 'existing') text('payload-toolkit add · rework', title.x, title.z - 0.35 * k, 0.24 * k, 600, MONO, 'right')
  else {
    ctx.save()
    ctx.globalAlpha = 0.9
    text(setup.name || 'my-payload-app', title.x, title.z - 0.7 * k, title.size, 700, FONT, 'right')
    ctx.globalAlpha = 0.7
    text('payload-toolkit init · REV 0.1 · blank board', title.x, title.z - 0.3 * k, 0.2 * k, 500, MONO, 'right')
    ctx.restore()
  }
  text(rev, BOARD.x0 + 0.4, BOARD.z1 - 0.3, 0.2, 600)
}

export function silkArt(setup: Setup, silk: string, accent: string, activeBand: number) {
  return frameTexture(BOARD, 2560, (p) => {
    const { ctx, text } = p
    ctx.fillStyle = silk
    BANDS.forEach((band, b) => {
      ctx.fillStyle = b === activeBand ? accent : silk
      text(String(b + 1).padStart(2, '0'), PAGE.x0 + 0.12, bandZ(b) + 0.62, 0.3, 600)
      text(band.label, PAGE.x0 + 0.12, bandZ(b) + 0.98, 0.22, 600)
      text(`${band.groups.join(' ')}`, PAGE.x0 + 0.12, bandZ(b) + 1.26, 0.13, 400)
    })
    ctx.save()
    ctx.strokeStyle = silk
    ctx.fillStyle = silk
    ctx.globalAlpha = 0.32
    ctx.lineWidth = 3
    BANDS.forEach((_, b) => pageHints(p, b, PAGE.chipX0 + 0.1, bandZ(b) + 0.42))
    ctx.restore()
    ctx.fillStyle = silk
    text('PAGE · top → bottom', PAGE.x0 + 0.1, PAGE.z0 - 0.12, 0.2, 600)
    if (setup.target === 'existing') text('EXISTING CODE · untouched', PAGE.chipX0 - 0.1, bandZ(0) + 0.26, 0.15, 600)
    coreSilk(p, setup, 'PAYLOAD/APP  REV 4.0  ·  4-LAYER')
  })
}
