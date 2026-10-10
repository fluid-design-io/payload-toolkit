import type { Setup } from '@/routes/workspace/-workspace/workspace.types'
import { MONO } from '../../../core/three'
import { BANDS } from '../shared/pack'
import { frameTexture, pageHints } from '../shared/paint'
import { coreSilk } from '../pcb/art'
import { BOARD, PAGE, bandZ } from '../pcb/plan'
import { LAYERS, layerZ } from './plan'

export const ATLAS = { x0: PAGE.x0, x1: PAGE.x1, z0: PAGE.z0, z1: PAGE.z1 }

/** The core board's silk; the page area is left for the layers. */
export function baseSilk(setup: Setup, silk: string) {
  return frameTexture(BOARD, 2560, (p) => {
    p.ctx.fillStyle = silk
    coreSilk(p, setup, 'PAYLOAD/APP  REV 4.1  ·  MEZZANINE')
    p.text('FLEX · L1–L4', 0.48, 6.45, 0.16, 600, MONO, 'center')
  })
}

/** Every layer's silk in one atlas over the page area: band numbers and names, page wireframes, layer tags. */
export function layerSilk(target: Setup['target'], silk: string, accent: string, activeBand: number) {
  return frameTexture(ATLAS, 2048, (p) => {
    const { ctx, text } = p
    BANDS.forEach((band, b) => {
      ctx.fillStyle = b === activeBand ? accent : silk
      text(String(b + 1).padStart(2, '0'), PAGE.x0 + 0.12, bandZ(b) + 0.62, 0.3, 600)
      text(band.label, PAGE.x0 + 0.12, bandZ(b) + 0.98, 0.22, 600)
      text(band.groups.join(' '), PAGE.x0 + 0.12, bandZ(b) + 1.26, 0.13, 400)
    })
    ctx.save()
    ctx.strokeStyle = silk
    ctx.fillStyle = silk
    ctx.globalAlpha = 0.32
    ctx.lineWidth = 3
    BANDS.forEach((_, b) => pageHints(p, b, PAGE.chipX0 + 0.1, bandZ(b) + 0.42))
    ctx.restore()
    ctx.fillStyle = silk
    for (let k = 0; k < LAYERS; k++) text(`L${k + 1}`, PAGE.x1 - 0.12, layerZ(k) + 0.3, 0.2, 700, MONO, 'right')
    text('PAGE · top → bottom · top layer first', PAGE.x1 - 0.75, PAGE.z0 + 0.3, 0.15, 600, MONO, 'right')
    if (target === 'existing') text('EXISTING CODE · untouched', PAGE.chipX0 - 0.1, bandZ(0) + 0.26, 0.15, 600)
  })
}
