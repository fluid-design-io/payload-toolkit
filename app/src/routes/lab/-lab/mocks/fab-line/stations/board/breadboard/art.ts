import type { Setup } from '@/routes/workspace/-workspace/workspace.types'
import type { Tokens } from '../../../core/contract'
import { MONO } from '../../../core/three'
import { BANDS } from '../shared/pack'
import { frameTexture } from '../shared/paint'
import { coreSilk } from '../pcb/art'
import { BOARD, PAGE, bandZ } from '../pcb/plan'
import { BB, DEV, PITCH, STRIP } from './plan'

export const ATLAS = { x0: BB.x0, x1: BB.x1, z0: PAGE.z0 - 0.35, z1: PAGE.z1 + 0.35 }

/** The dev board's silk: the PCB's core labels, with the app's name printed on the breadboard's foot. */
export function devSilk(setup: Setup, silk: string) {
  return frameTexture(BOARD, 2560, (p) => {
    p.ctx.fillStyle = silk
    coreSilk(p, setup, 'PAYLOAD/DEV  REV 4.2  ·  BREADBOARD', { x: BB.x1 - 0.2, z: ATLAS.z1 - 0.04, size: 0.3 })
    p.text('JUMPERS ▸', DEV.x1 - 0.12, -4.3, 0.15, 600, MONO, 'right')
  })
}

/**
 * The breadboard's face: tie-point holes in fives, red and blue rail stripes,
 * row letters, column numbers, and each band's number and name on the
 * strip's left end.
 */
export function faceArt(c: Tokens, activeBand: number) {
  return frameTexture(ATLAS, 2560, (p) => {
    const { ctx, text, px, PX } = p
    const [w, h] = [ctx.canvas.width, ctx.canvas.height]
    ctx.fillStyle = c.surface
    ctx.fillRect(0, 0, w, h)
    const hole = (x: number, z: number) => {
      const [a, b] = px(x, z)
      const r = 0.034 * PX
      ctx.fillRect(a - r, b - r, r * 2, r * 2)
    }
    const cols = Math.floor((BB.x1 - PAGE.chipX0 - 0.2) / PITCH)
    const x0 = BB.x0 + Math.ceil((PAGE.chipX0 - 0.1 - BB.x0) / PITCH) * PITCH
    BANDS.forEach((band, b) => {
      const z = bandZ(b)
      ctx.fillStyle = c.edge
      ctx.globalAlpha = 0.38
      for (let i = 0; i < cols; i++) {
        const x = x0 + i * PITCH
        for (let r = 0; r < 5; r++) {
          hole(x, z + STRIP.top[0] + 0.05 + r * 0.1)
          hole(x, z + STRIP.bottom[0] + 0.05 + r * 0.1)
        }
        if (i % 6 !== 5) for (const r of [0.15, 0.25]) hole(x, z + r)
      }
      ctx.globalAlpha = 1
      ctx.fillStyle = c.lit
      const [ra, rb] = px(x0 - 0.08, z + STRIP.rail[0] + 0.035)
      ctx.fillRect(ra, rb, (cols * PITCH) * PX, 0.022 * PX)
      ctx.fillStyle = c.edge
      const [ba, bb] = px(x0 - 0.08, z + STRIP.rail[1] - 0.05)
      ctx.fillRect(ba, bb, (cols * PITCH) * PX, 0.022 * PX)
      ctx.fillStyle = c.muted
      text('+', BB.x1 - 0.12, z + 0.17, 0.14, 700, MONO, 'right')
      text('−', BB.x1 - 0.12, z + 0.32, 0.14, 700, MONO, 'right')
      'abcde'.split('').forEach((l, r) => text(l, BB.x1 - 0.12, z + STRIP.top[0] + 0.085 + r * 0.1, 0.08, 600, MONO, 'right'))
      'fghij'.split('').forEach((l, r) => text(l, BB.x1 - 0.12, z + STRIP.bottom[0] + 0.085 + r * 0.1, 0.08, 600, MONO, 'right'))
      for (let i = 4; i < cols; i += 5) text(String(i + 1), x0 + i * PITCH, z + STRIP.top[0] - 0.005, 0.07, 500, MONO, 'center')
      ctx.fillStyle = b === activeBand ? c.lit : c.silk
      text(String(b + 1).padStart(2, '0'), PAGE.x0 + 0.12, z + STRIP.top[0] + 0.42, 0.34, 600)
      text(band.label, PAGE.x0 + 0.12, z + STRIP.bottom[0] + 0.24, 0.2, 600)
      ctx.globalAlpha = 0.8
      text(band.groups.join(' '), PAGE.x0 + 0.12, z + STRIP.bottom[0] + 0.44, 0.11, 400)
      ctx.globalAlpha = 1
    })
    ctx.fillStyle = c.silk
    text('PAGE · one strip per band, top → bottom', BB.x0 + 0.15, ATLAS.z0 + 0.24, 0.15, 600)
  })
}
