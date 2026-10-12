import { useFrame } from '@react-three/fiber'
import type { ThreeEvent } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useRef } from 'react'
import { BufferGeometry, Float32BufferAttribute, Matrix4, Sphere, Vector3 } from 'three'
import type { InstancedMesh, LineSegments, Mesh, Texture } from 'three'

import { keepAnimating } from '../../../../kit/busy'
import type { CabinetProps, Tokens, V3 } from '../../core/contract'
import { FONT, MONO, fillMat, lineMat, mergeEdges, mergeFills, quadGeometry, textTexture, tint, useDisposable } from '../../core/three'
import { luminance } from '../../fx/heat'
import type { Piece } from '../../core/three'
import type { Aisle } from '@/routes/lab/-lab/warehouse'

/** A label rectangle in a unit's own frame: bottom-left, bottom-right, top-right, top-left as the texture reads. */
export type Quad = [V3, V3, V3, V3]
export const frontQuad = (x0: number, x1: number, y0: number, y1: number, z: number): Quad => [[x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]]
/** Facing up, reading from the front (+z) edge. */
export const topQuad = (x0: number, x1: number, z0: number, z1: number, y: number): Quad => [[x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0]]

type Cell = { w: number; h: number }
/** Cells for `n` units and one cell size per label kind, packed into blocks of rows in one canvas. */
export function atlasLayout(n: number, kinds: readonly Cell[], width = 2048) {
  let y = 0
  const blocks = kinds.map((k) => {
    const cols = Math.max(1, Math.floor(width / k.w))
    const at = { cols, y, ...k }
    y += Math.ceil(n / cols) * k.h
    return at
  })
  const height = Math.max(1, y)
  const rect = (i: number, k: number) => {
    const b = blocks[k]
    return { x: (i % b.cols) * b.w, y: b.y + Math.floor(i / b.cols) * b.h, w: b.w, h: b.h }
  }
  const uv = (i: number, k: number): [number, number, number, number] => {
    const r = rect(i, k)
    return [r.x / width, 1 - (r.y + r.h) / height, (r.x + r.w) / width, 1 - r.y / height]
  }
  return { width, height, rect, uv }
}
export type Atlas = ReturnType<typeof atlasLayout>

/** Draws every unit's cells; `draw(ctx, i, k, w, h)` paints cell k of unit i in its own coordinates. */
export function useAtlasTexture(atlas: Atlas, n: number, kinds: number, draw: (ctx: CanvasRenderingContext2D, i: number, k: number, w: number, h: number) => void, deps: unknown[]) {
  return useDisposable(
    () =>
      textTexture(atlas.width, atlas.height, (ctx) => {
        for (let i = 0; i < n; i++)
          for (let k = 0; k < kinds; k++) {
            const r = atlas.rect(i, k)
            ctx.save()
            ctx.beginPath()
            ctx.rect(r.x, r.y, r.w, r.h)
            ctx.clip()
            ctx.translate(r.x, r.y)
            draw(ctx, i, k, r.w, r.h)
            ctx.restore()
          }
      }),
    deps,
  )
}

type AisleEvent = ThreeEvent<PointerEvent | MouseEvent>
const instanceAt = (e: AisleEvent, n: number) => (e.instanceId !== undefined && e.instanceId < n ? e.instanceId : -1)
/**
 * Hover card and open-on-click for a cabinet's aisles, behind the drag guard. `at` names the aisle under an
 * event (-1 for none): the instance by default, or a cell on a panel. `hover` is that aisle for the frame loop.
 */
export function useAisleEvents(p: Pick<CabinetProps, 'aisles' | 'onOpen' | 'tip' | 'guard'>, at: (e: AisleEvent, n: number) => number = instanceAt) {
  const hover = useRef(-1)
  const n = p.aisles.length
  const events = {
    onClick: (e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); const i = at(e, n); if (i >= 0 && !p.guard.moved) p.onOpen(i) },
    onPointerOver: (e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); const i = at(e, n); if (i < 0) return; hover.current = i; showAisle(p, e.nativeEvent, i) },
    onPointerMove: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation()
      const i = at(e, n)
      if (hover.current !== i) {
        hover.current = i
        if (i >= 0) showAisle(p, e.nativeEvent, i)
        else p.tip.hide()
      }
      p.tip.move(e.nativeEvent)
    },
    onPointerOut: () => { hover.current = -1; p.tip.hide() },
  }
  return { hover, events }
}
export function showAisle(p: Pick<CabinetProps, 'aisles' | 'tip'>, e: PointerEvent, i: number) {
  const a = p.aisles[i]
  p.tip.show(e, a.label, `${code(a)} · ${a.count} parts · ${a.racks.length} ${a.racks.length === 1 ? 'registry' : 'registries'} · click to open`)
}

export const code = (a: Aisle) => `${a.zone}${String(a.no).padStart(2, '0')}`
export const short = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s)
export const countText = (a: Aisle, i: number, matches: number[] | null) => (matches ? `${matches[i]}/${a.count}` : String(a.count))

/** A label cell: hue tick, aisle code, name and count, dimmed when a search finds nothing in it. */
export function paintTag(ctx: CanvasRenderingContext2D, w: number, h: number, a: Aisle, i: number, o: { c: Tokens; matches: number[] | null; active: boolean; size?: number; squeeze?: number; bg?: string }) {
  const { c, matches } = o
  const sx = o.squeeze ?? 1
  ctx.fillStyle = o.bg ?? c.surface
  ctx.fillRect(0, 0, w, h)
  ctx.save()
  ctx.scale(sx, 1)
  const W = w / sx
  ctx.globalAlpha = matches && !matches[i] ? 0.32 : 1
  const fs = o.size ?? h * 0.42
  ctx.textBaseline = 'middle'
  ctx.fillStyle = tint(a.hue, c.s, c.l)
  ctx.fillRect(fs * 0.45, h * 0.24, fs * 0.22, h * 0.52)
  ctx.fillStyle = o.active ? c.accent : c.muted
  ctx.font = `500 ${fs * 0.78}px ${MONO}`
  ctx.fillText(code(a), fs * 1.0, h / 2)
  const codeW = ctx.measureText('B00').width
  ctx.fillStyle = c.fg
  ctx.font = `500 ${fs}px ${FONT}`
  const left = fs * 1.0 + codeW + fs * 0.45
  ctx.textAlign = 'right'
  ctx.font = `400 ${fs * 0.8}px ${FONT}`
  const count = countText(a, i, matches)
  const countW = ctx.measureText(count).width
  ctx.fillStyle = matches && matches[i] ? c.accent : c.muted
  ctx.fillText(count, W - fs * 0.5, h / 2)
  ctx.textAlign = 'left'
  ctx.fillStyle = c.fg
  ctx.font = `500 ${fs}px ${FONT}`
  let label = a.label
  const room = W - left - countW - fs * 1.1
  while (label.length > 3 && ctx.measureText(label).width > room) label = `${label.slice(0, -2)}…`
  ctx.fillText(label, left, h / 2)
  ctx.restore()
}

const m = new Matrix4()

/**
 * Moving units (trays, bins) drawn as one instanced fill, one hairline
 * draw rewritten while they move, label quads from one atlas, and the
 * active unit's outline in the accent (`outline`, else the unit's own
 * edges). `tick` advances the variant's own
 * state and says whether anything moved; `place` writes unit i's matrix.
 * While anything moves it keeps the line animating.
 */
export function Units({ n, pieces, outline, quads, atlas, texture, place, tick, active, sphere, c, events, keyId }: {
  n: number
  pieces: Piece[]
  outline?: Piece[]
  quads: Quad[]
  atlas: Atlas
  texture: Texture | null
  place: (i: number, m: Matrix4) => void
  tick: (dt: number) => boolean
  active: number
  sphere: Sphere
  c: Tokens
  events: ReturnType<typeof useAisleEvents>['events']
  keyId: string
}) {
  const body = useRef<InstancedMesh>(null)
  const edges = useRef<LineSegments>(null)
  const hi = useRef<LineSegments>(null)
  const labels = useRef<Mesh>(null)
  const K = quads.length
  const geo = useDisposable(() => {
    const edge = mergeEdges(pieces)
    const base = edge.getAttribute('position').array as Float32Array
    const eg = new BufferGeometry()
    eg.setAttribute('position', new Float32BufferAttribute(new Float32Array(base.length * n), 3))
    const lg = quadGeometry(Array.from({ length: n * K }, (_, j) => atlas.uv(Math.floor(j / K), j % K)))
    return { fill: mergeFills(pieces), edge, base, eg, lg, hi: outline ? mergeEdges(outline) : edge }
  }, [n, keyId])
  useLayoutEffect(() => {
    if (body.current) body.current.boundingSphere = sphere
  }, [n, sphere])
  const dirty = useRef(true)
  useEffect(() => { dirty.current = true }, [geo, active, texture])
  useFrame((_, dt) => {
    const bm = body.current, em = edges.current, lm = labels.current
    if (!bm || !em) return
    const moving = tick(Math.min(dt, 0.05))
    if (!moving && !dirty.current) return
    dirty.current = false
    if (moving) keepAnimating()
    const ep = em.geometry.getAttribute('position') as Float32BufferAttribute
    const out = ep.array as Float32Array
    const base = geo.base, per = base.length
    const lp = lm?.geometry.getAttribute('position') as Float32BufferAttribute | undefined
    for (let i = 0; i < n; i++) {
      place(i, m)
      bm.setMatrixAt(i, m)
      const e = m.elements
      for (let k = 0; k < per; k += 3) {
        const x = base[k], y = base[k + 1], z = base[k + 2], o = i * per + k
        out[o] = e[0] * x + e[4] * y + e[8] * z + e[12]
        out[o + 1] = e[1] * x + e[5] * y + e[9] * z + e[13]
        out[o + 2] = e[2] * x + e[6] * y + e[10] * z + e[14]
      }
      if (lp) {
        const la = lp.array as Float32Array
        for (let q = 0; q < K; q++)
          for (let v = 0; v < 4; v++) {
            const [x, y, z] = quads[q][v], o = ((i * K + q) * 4 + v) * 3
            la[o] = e[0] * x + e[4] * y + e[8] * z + e[12]
            la[o + 1] = e[1] * x + e[5] * y + e[9] * z + e[13]
            la[o + 2] = e[2] * x + e[6] * y + e[10] * z + e[14]
          }
      }
      if (i === active && hi.current) hi.current.matrix.copy(m)
    }
    if (hi.current) { hi.current.visible = active >= 0 && active < n; hi.current.matrixWorldNeedsUpdate = true }
    bm.instanceMatrix.needsUpdate = true
    ep.needsUpdate = true
    if (lp) lp.needsUpdate = true
  })
  return (
    <group>
      <instancedMesh key={`${n}-${keyId}`} ref={body} args={[geo.fill, undefined, n]} material={fillMat(c.surface, c.flat, c.rough)} frustumCulled={false} {...events} />
      <lineSegments ref={edges} geometry={geo.eg} material={lineMat(c.edge)} frustumCulled={false} />
      <lineSegments ref={hi} geometry={geo.hi} material={lineMat(c.accent)} matrixAutoUpdate={false} renderOrder={1} frustumCulled={false} />
      {texture && K > 0 && (
        <mesh ref={labels} geometry={geo.lg} frustumCulled={false}>
          <meshBasicMaterial map={texture} toneMapped={false} />
        </mesh>
      )}
    </group>
  )
}

/** A fixed sphere for raycasting moving instances (three.js caches the first one it computes). */
export const sphereAt = (x: number, y: number, z: number, r: number) => new Sphere(new Vector3(x, y, z), r)

/** Instance colors multiply the material, so tinted instances start from whichever of the theme's surface and ink is paler. */
export const paler = (c: Tokens) => (luminance(c.surface) >= luminance(c.fg) ? c.surface : c.fg)
