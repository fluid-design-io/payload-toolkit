import { useEffect, useState } from 'react'
import type { ThreeEvent } from '@react-three/fiber'

import { binsPerBay, levelsPerBay } from '@/routes/lab/-lab/warehouse'
import type { Sim, TableProps, Tokens } from '../../core/contract'
import { Body } from '../../core/scene'
import { FONT, MONO, box, quadGeometry, textTexture, useDisposable } from '../../core/three'
import type { Piece } from '../../core/three'
import { M, Y, geometry, pocketOf } from './bench.data'
import type { Bench } from './bench.data'
import { Pockets, turnPage } from './kit'

const ATLAS = { w: 2048, h: 256, strip: { y: 0, h: 128 }, tags: { y: 128, h: 64, w: 512 }, digits: { y: 192, h: 64, w: 64 } }
const STRIP_H = 0.42

function tagOf(codes: string[], first: number) {
  if (!codes.length) return ''
  const bays = new Set(codes.map((c) => c.split('-')[1]))
  return bays.size === 1 ? `BAY ${[...bays][0]}` : `${first + 1}–${first + codes.length}`
}

/** Reads the parts after the entry's layout effect has put them on this page's pockets. */
function useTags(sim: Sim, bays: number, page: number, label: string, slots: number) {
  const [tags, setTags] = useState<string[]>([])
  useEffect(() => {
    const codes: string[][] = Array.from({ length: bays }, () => [])
    for (const p of sim.list) if (p.onPage) codes[Math.floor(p.pad / binsPerBay)]?.push(p.code)
    const next = codes.map((list, g) => tagOf(list, (page * bays + g) * binsPerBay))
    setTags((prev) => (prev.join('|') === next.join('|') ? prev : next))
  }, [sim, bays, page, label, slots])
  return tags
}

/** A label lying flat at `y`, `w` by `d` around (cx, cz), reading from the front edge, that shows atlas pixels (px, py, pw, ph). */
function quad(corners: number[], uvs: [number, number, number, number][], cx: number, y: number, cz: number, w: number, d: number, px: number, py: number, pw: number, ph: number) {
  const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2
  corners.push(x0, y, z1, x1, y, z1, x1, y, z0, x0, y, z0)
  uvs.push([px / ATLAS.w, 1 - (py + ph) / ATLAS.h, (px + pw) / ATLAS.w, 1 - py / ATLAS.h])
}

export function benchOf(b: Bench) {
  const g = geometry(b)
  const pockets = b.bays * binsPerBay
  const width = g.x1 - g.x0, cx = (g.x0 + g.x1) / 2
  const stripW = width - 0.3, stripPx = Math.min(ATLAS.strip.h, Math.round((ATLAS.w * STRIP_H) / stripW))
  const stripZ = g.z1 - 0.32

  const pocket = pocketOf(b, g)

  function Frame({ c }: { c: Tokens }) {
    const pieces: Piece[] = [{ geo: box(width, 0.12, g.z1 - g.z0), at: [cx, Y - 0.06, (g.z0 + g.z1) / 2] }]
    const legX = width > 8 ? [g.x0 + 0.15, cx, g.x1 - 0.15] : [g.x0 + 0.15, g.x1 - 0.15]
    for (const x of legX) for (const z of [g.z0 + 0.15, g.z1 - 0.15]) pieces.push({ geo: box(0.12, Y - 0.12, 0.12), at: [x, (Y - 0.12) / 2, z] })
    const back = g.z0 + 0.08
    for (let k = 1; k < levelsPerBay; k++) {
      const z = g.z0 + M.back + (levelsPerBay - k) * b.pitch.z
      pieces.push({ geo: box(width - 0.16, b.rise, z - back), at: [cx, Y + (k - 0.5) * b.rise, (z + back) / 2] })
    }
    return <Body id={`table-${b.id}`} c={c} fill={c.surface} edge={c.edge} pieces={pieces} />
  }

  function Labels({ sim, c, slots, label, pages, page, setPage, tip, guard }: TableProps) {
    const tags = useTags(sim, b.bays, page, label, slots)
    const geo = useDisposable(() => {
      const corners: number[] = [], uvs: [number, number, number, number][] = []
      quad(corners, uvs, cx, Y + 0.005, stripZ, stripW, STRIP_H, 0, ATLAS.strip.y, ATLAS.w, stripPx)
      const tagD = g.bayW * (ATLAS.tags.h / ATLAS.tags.w)
      for (let bay = 0; bay < b.bays; bay++)
        quad(corners, uvs, g.bayX(bay) + g.bayW / 2, Y + 0.005, g.front + 0.06 + tagD / 2, g.bayW, tagD, bay * ATLAS.tags.w, ATLAS.tags.y, ATLAS.tags.w, ATLAS.tags.h)
      for (let level = 0; level < levelsPerBay; level++)
        quad(corners, uvs, g.x0 + M.left / 2 + 0.04, g.topY(level) + 0.005, g.rowZ(level), 0.4, 0.4, level * ATLAS.digits.w, ATLAS.digits.y, ATLAS.digits.w, ATLAS.digits.h)
      return quadGeometry(uvs, corners)
    }, [])
    const map = useDisposable(
      () =>
        textTexture(ATLAS.w, ATLAS.h, (ctx) => {
          const h = stripPx, mid = h / 2, font = Math.round(h * 0.42)
          ctx.textBaseline = 'middle'
          ctx.font = `500 ${font}px ${FONT}`
          ctx.fillStyle = c.muted
          ctx.fillText(label, h * 1.1, mid)
          ctx.textAlign = 'right'
          ctx.fillStyle = c.fg
          ctx.fillText(`${page + 1} / ${pages}`, ATLAS.w - h * 1.1, mid)
          ctx.strokeStyle = pages > 1 ? c.fg : c.dim
          ctx.lineWidth = Math.max(3, h * 0.05)
          const a = h * 0.2
          ctx.beginPath()
          ctx.moveTo(h * 0.62, mid - a); ctx.lineTo(h * 0.38, mid); ctx.lineTo(h * 0.62, mid + a)
          ctx.moveTo(ATLAS.w - h * 0.62, mid - a); ctx.lineTo(ATLAS.w - h * 0.38, mid); ctx.lineTo(ATLAS.w - h * 0.62, mid + a)
          ctx.stroke()
          const T = ATLAS.tags
          ctx.textAlign = 'center'
          ctx.font = `600 ${Math.round(T.h * 0.46)}px ${MONO}`
          tags.forEach((tag, i) => {
            if (!tag) return
            const x0 = i * T.w, ty = T.y + T.h / 2
            const tw = ctx.measureText(tag).width / 2 + 16
            ctx.fillStyle = c.fg
            ctx.fillText(tag, x0 + T.w / 2, ty)
            ctx.strokeStyle = c.muted
            ctx.lineWidth = 3
            ctx.beginPath()
            ctx.moveTo(x0 + 10, ty - 14); ctx.lineTo(x0 + 10, ty); ctx.lineTo(x0 + T.w / 2 - tw, ty)
            ctx.moveTo(x0 + T.w / 2 + tw, ty); ctx.lineTo(x0 + T.w - 10, ty); ctx.lineTo(x0 + T.w - 10, ty - 14)
            ctx.stroke()
          })
          const D = ATLAS.digits
          ctx.font = `600 ${Math.round(D.h * 0.62)}px ${MONO}`
          ctx.fillStyle = c.muted
          for (let level = 0; level < levelsPerBay; level++) ctx.fillText(String(level + 1), level * D.w + D.w / 2, D.y + D.h / 2 + 2)
        }),
      [c, label, page, pages, tags],
    )
    const onStrip = (e: ThreeEvent<PointerEvent | MouseEvent>) => e.faceIndex !== undefined && e.faceIndex !== null && e.faceIndex < 2
    return (
      <mesh
        geometry={geo}
        onClick={(e) => {
          if (onStrip(e)) turnPage(e, cx, { page, pages, setPage, guard })
        }}
        onPointerMove={(e) => {
          if (!onStrip(e)) return tip.hide()
          e.stopPropagation()
          tip.show(e.nativeEvent, 'Pick table', pages > 1 ? 'Click left or right half to change page' : `${pockets} pockets`)
        }}
        onPointerOut={() => tip.hide()}
      >
        <meshBasicMaterial map={map} transparent depthWrite={false} toneMapped={false} />
      </mesh>
    )
  }

  function Component(props: TableProps) {
    return (
      <group>
        <Frame c={props.c} />
        <Pockets count={pockets} pocket={pocket} w={b.pitch.x * 0.44} d={b.pitch.z * 0.43} dash={[0.08, 0.06]} color={props.c.edge} slots={props.slots} />
        <Labels {...props} />
      </group>
    )
  }

  return Component
}

