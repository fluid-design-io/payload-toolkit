import { useLayoutEffect, useRef } from 'react'
import { Sphere, Vector3 } from 'three'
import type { Matrix4 } from 'three'

import type { CabinetProps, Tokens } from '../../core/contract'
import { Body } from '../../core/scene'
import { FONT, box, damp, lerp, tint } from '../../core/three'
import type { Piece } from '../../core/three'
import type { Aisle } from '@/routes/lab/-lab/warehouse'
import { CABINET } from './drawers.data'
import { Units, atlasLayout, countText, frontQuad, useAisleEvents, useAtlasTexture } from './units'

/** Sliding drawers must not be raycast against the sphere three.js caches on the first hit, so the mesh gets one that covers every drawer fully open. */
const DRAWER_SPHERE = new Sphere(new Vector3(CABINET.x0 + CABINET.gapX, CABINET.base + (CABINET.rows * CABINET.gapY) / 2, CABINET.front - CABINET.d / 2 + 0.4), 7)

/** The carcass: top, plinth, back and sides as one fill and one hairline draw. */
function Frame({ c }: { c: Tokens }) {
  const width = CABINET.gapX * CABINET.cols + 0.1
  const height = CABINET.gapY * CABINET.rows + 0.1
  const cx = CABINET.x0 + CABINET.gapX, cz = CABINET.front - CABINET.d / 2 - 0.05
  const pieces: Piece[] = [
    { geo: box(width, 0.12, CABINET.d + 0.2), at: [cx, CABINET.base + height + 0.02, cz] },
    { geo: box(width, CABINET.base, CABINET.d + 0.2), at: [cx, CABINET.base / 2, cz] },
    { geo: box(width, height, 0.1), at: [cx, CABINET.base + height / 2, CABINET.front - CABINET.d - 0.1] },
    { geo: box(0.1, height, CABINET.d + 0.2), at: [CABINET.x0 - CABINET.gapX / 2 - 0.05, CABINET.base + height / 2, cz] },
    { geo: box(0.1, height, CABINET.d + 0.2), at: [CABINET.x0 + CABINET.gapX * 2.5 + 0.05, CABINET.base + height / 2, cz] },
  ]
  return <Body id="cabinet" c={c} fill={c.surface} edge={c.edge} pieces={pieces} />
}

const DRAWER: Piece[] = [{ geo: box(CABINET.w, CABINET.h, CABINET.d) }]
/** The open drawer's accent outline sits just outside its edges, so it never z-fights them. */
const OPEN: Piece[] = [{ geo: box(CABINET.w + 0.01, CABINET.h + 0.01, CABINET.d + 0.01) }]
const FACE = [frontQuad(-CABINET.w / 2, CABINET.w / 2, -CABINET.h / 2, CABINET.h / 2, CABINET.d / 2 + 0.004)]
const KINDS = [{ w: 512, h: 128 }] as const

/** A drawer's face label: hue tick, name and count, dimmed when a search finds nothing in it. */
function paintFace(ctx: CanvasRenderingContext2D, aisle: Aisle, i: number, matches: number[] | null, c: Tokens) {
  ctx.fillStyle = c.surface
  ctx.fillRect(0, 0, 512, 128)
  ctx.globalAlpha = matches && !matches[i] ? 0.3 : 1
  ctx.fillStyle = tint(aisle.hue, c.s, c.l)
  ctx.fillRect(26, 38, 12, 52)
  ctx.fillStyle = c.fg
  ctx.font = `500 44px ${FONT}`
  ctx.textBaseline = 'middle'
  ctx.fillText(aisle.label.length > 13 ? `${aisle.label.slice(0, 12)}…` : aisle.label, 58, 66)
  ctx.fillStyle = matches && matches[i] ? c.accent : c.muted
  ctx.font = `400 34px ${FONT}`
  ctx.textAlign = 'right'
  ctx.fillText(countText(aisle, i, matches), 486, 66)
}

export function Drawers(props: CabinetProps) {
  const { aisles, active, matches, c } = props
  const n = aisles.length
  const atlas = atlasLayout(n, KINDS, CABINET.cols * KINDS[0].w)
  const texture = useAtlasTexture(atlas, n, 1, (ctx, i) => paintFace(ctx, aisles[i], i, matches, c), [atlas, aisles, matches, c])
  const offsets = useRef(new Float32Array(n))
  useLayoutEffect(() => {
    if (offsets.current.length !== n) offsets.current = new Float32Array(n)
  })
  const { events } = useAisleEvents(props)
  const tick = (dt: number) => {
    const off = offsets.current
    let moved = false
    for (let i = 0; i < n; i++) {
      const next = lerp(off[i], i === active ? 0.75 : 0, damp(dt, 10))
      if (Math.abs(next - off[i]) > 1e-4) moved = true
      off[i] = next
    }
    return moved
  }
  const place = (i: number, m: Matrix4) => {
    const col = i % CABINET.cols, row = Math.floor(i / CABINET.cols)
    m.makeTranslation(CABINET.x0 + col * CABINET.gapX, CABINET.base + (CABINET.rows - 1 - row) * CABINET.gapY + CABINET.h / 2, CABINET.front - CABINET.d / 2 + offsets.current[i])
  }
  return (
    <group>
      <Units n={n} pieces={DRAWER} outline={OPEN} quads={FACE} atlas={atlas} texture={texture} place={place} tick={tick} active={active} sphere={DRAWER_SPHERE} c={c} events={events} keyId="drawers" />
      <Frame c={c} />
    </group>
  )
}

