import { useEffect, useMemo, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import type { ThreeEvent } from '@react-three/fiber'
import { BufferGeometry, Float32BufferAttribute, LineDashedMaterial, LineSegments, Vector3 } from 'three'

import { binsPerBay, levelsPerBay, slotsPerLevel } from '@/routes/lab/-lab/warehouse'
import type { Sim, TableProps, TableVariant, Tokens } from '../../core/contract'
import { Body } from '../../core/scene'
import { FONT, MONO, box, textTexture } from '../../core/three'
import type { Piece } from '../../core/three'

/**
 * A pick bench that lays out warehouse bays as they are shelved: each bay is
 * four slots across and five levels deep, read like a page (level 1 at the
 * back, slot A on the left) so a pick code such as `B07-03-2C` reads off the
 * table as bay tag, row digit and column, and the keyboard grid's down
 * arrow moves toward the viewer. Each row is a step `rise` above the one in
 * front, so back rows never hide behind front ones in the iso view.
 */
export type Bench = {
  id: string
  label: string
  bays: number
  pitch: { x: number; z: number }
  gap: number
  rise: number
  el: number
  fit: { max: number; size: number }
}

const Y = 0.9
const X0 = -13.7
const Z0 = -1.75
const M = { left: 0.62, right: 0.3, back: 0.18, apron: 1.02 }
const ATLAS = { w: 2048, h: 256, strip: { y: 0, h: 128 }, tags: { y: 128, h: 64, w: 512 }, digits: { y: 192, h: 64, w: 64 } }
const STRIP_H = 0.42

function geometry(b: Bench) {
  const bayW = slotsPerLevel * b.pitch.x
  const x1 = X0 + M.left + b.bays * bayW + (b.bays - 1) * b.gap + M.right
  const z1 = Z0 + M.back + levelsPerBay * b.pitch.z + M.apron
  const front = z1 - M.apron
  const bayX = (bay: number) => X0 + M.left + bay * (bayW + b.gap)
  const rowZ = (level: number) => Z0 + M.back + (level + 0.5) * b.pitch.z
  const topY = (level: number) => Y + (levelsPerBay - 1 - level) * b.rise
  return { bayW, x1, z1, front, bayX, rowZ, topY }
}

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

function quad(pos: number[], uv: number[], cx: number, y: number, cz: number, w: number, d: number, px: number, py: number, pw: number, ph: number) {
  const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2
  const u0 = px / ATLAS.w, u1 = (px + pw) / ATLAS.w, v0 = 1 - (py + ph) / ATLAS.h, v1 = 1 - py / ATLAS.h
  pos.push(x0, y, z0, x0, y, z1, x1, y, z1, x0, y, z0, x1, y, z1, x1, y, z0)
  uv.push(u0, v1, u0, v0, u1, v0, u0, v1, u1, v0, u1, v1)
}

function make(b: Bench): TableVariant {
  const g = geometry(b)
  const pockets = b.bays * binsPerBay
  const width = g.x1 - X0, cx = (X0 + g.x1) / 2
  const stripW = width - 0.3, stripPx = Math.min(ATLAS.strip.h, Math.round((ATLAS.w * STRIP_H) / stripW))
  const stripZ = g.z1 - 0.32

  function pocket(index: number, out: Vector3) {
    const bay = Math.floor(index / binsPerBay), within = index % binsPerBay
    const level = Math.floor(within / slotsPerLevel), slot = within % slotsPerLevel
    return out.set(g.bayX(bay) + (slot + 0.5) * b.pitch.x, g.topY(level), g.rowZ(level))
  }

  function Frame({ c }: { c: Tokens }) {
    const pieces = useMemo((): Piece[] => {
      const out: Piece[] = [{ geo: box(width, 0.12, g.z1 - Z0), at: [cx, Y - 0.06, (Z0 + g.z1) / 2] }]
      const legX = width > 8 ? [X0 + 0.15, cx, g.x1 - 0.15] : [X0 + 0.15, g.x1 - 0.15]
      for (const x of legX) for (const z of [Z0 + 0.15, g.z1 - 0.15]) out.push({ geo: box(0.12, Y - 0.12, 0.12), at: [x, (Y - 0.12) / 2, z] })
      const back = Z0 + 0.08
      for (let k = 1; k < levelsPerBay; k++) {
        const z = Z0 + M.back + (levelsPerBay - k) * b.pitch.z
        out.push({ geo: box(width - 0.16, b.rise, z - back), at: [cx, Y + (k - 0.5) * b.rise, (z + back) / 2] })
      }
      return out
    }, [])
    return <Body id={`table-${b.id}`} c={c} fill={c.surface} edge={c.edge} pieces={pieces} />
  }

  function Pads({ c, slots }: { c: Tokens; slots: number }) {
    const pads = useMemo(() => {
      const l: number[] = []
      const p = new Vector3(), w = b.pitch.x * 0.44, d = b.pitch.z * 0.43
      for (let i = 0; i < pockets; i++) {
        pocket(i, p)
        const y = p.y + 0.004
        l.push(p.x - w, y, p.z - d, p.x + w, y, p.z - d, p.x + w, y, p.z - d, p.x + w, y, p.z + d, p.x + w, y, p.z + d, p.x - w, y, p.z + d, p.x - w, y, p.z + d, p.x - w, y, p.z - d)
      }
      const geo = new BufferGeometry()
      geo.setAttribute('position', new Float32BufferAttribute(l, 3))
      const seg = new LineSegments(geo, new LineDashedMaterial({ color: c.edge, dashSize: 0.08, gapSize: 0.06 }))
      seg.computeLineDistances()
      return seg
    }, [c.edge])
    useEffect(() => () => { pads.geometry.dispose(); pads.material.dispose() }, [pads])
    useFrame(() => pads.geometry.setDrawRange(0, Math.min(slots, pockets) * 8))
    return <primitive object={pads} />
  }

  function Labels({ sim, c, slots, label, pages, page, setPage, tip, guard }: TableProps) {
    const tags = useTags(sim, b.bays, page, label, slots)
    const geo = useMemo(() => {
      const pos: number[] = [], uv: number[] = []
      quad(pos, uv, cx, Y + 0.005, stripZ, stripW, STRIP_H, 0, ATLAS.strip.y, ATLAS.w, stripPx)
      const tagD = g.bayW * (ATLAS.tags.h / ATLAS.tags.w)
      for (let bay = 0; bay < b.bays; bay++)
        quad(pos, uv, g.bayX(bay) + g.bayW / 2, Y + 0.005, g.front + 0.06 + tagD / 2, g.bayW, tagD, bay * ATLAS.tags.w, ATLAS.tags.y, ATLAS.tags.w, ATLAS.tags.h)
      for (let level = 0; level < levelsPerBay; level++)
        quad(pos, uv, X0 + M.left / 2 + 0.04, g.topY(level) + 0.005, g.rowZ(level), 0.4, 0.4, level * ATLAS.digits.w, ATLAS.digits.y, ATLAS.digits.w, ATLAS.digits.h)
      const out = new BufferGeometry()
      out.setAttribute('position', new Float32BufferAttribute(pos, 3))
      out.setAttribute('uv', new Float32BufferAttribute(uv, 2))
      return out
    }, [])
    useEffect(() => () => geo.dispose(), [geo])
    const map = useMemo(
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
    useEffect(() => () => map.dispose(), [map])
    const onStrip = (e: ThreeEvent<PointerEvent | MouseEvent>) => e.faceIndex !== undefined && e.faceIndex !== null && e.faceIndex < 2
    return (
      <mesh
        geometry={geo}
        onClick={(e) => {
          if (!onStrip(e)) return
          e.stopPropagation()
          if (guard.moved || pages < 2) return
          const x = e.object.worldToLocal(e.point.clone()).x
          setPage((page + (x < cx ? pages - 1 : 1)) % pages)
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
        <Pads c={props.c} slots={props.slots} />
        <Labels {...props} />
      </group>
    )
  }

  const top = g.topY(0) + 0.6
  return {
    id: b.id,
    label: b.label,
    footprint: { x0: X0, x1: g.x1, z0: Z0, z1: g.z1, h: g.topY(0) },
    frame: [[X0 - 0.4, 0, g.z1 + 0.6], [g.x1 + 0.6, 0, g.z1 + 0.6], [g.x1 + 0.6, 0, Z0 - 0.4], [X0 - 0.4, 0, Z0 - 0.4], [X0, top, Z0]],
    el: b.el,
    bays: b.bays,
    cols: slotsPerLevel,
    pocket,
    fit: b.fit,
    Component,
  }
}

export const riser = make({ id: 'riser', label: 'Riser 40', bays: 2, pitch: { x: 0.98, z: 0.92 }, gap: 0.42, rise: 0.2, el: 50, fit: { max: 0.7, size: 0.8 } })
export const riser3 = make({ id: 'riser3', label: 'Riser 60', bays: 3, pitch: { x: 0.88, z: 0.84 }, gap: 0.36, rise: 0.18, el: 50, fit: { max: 0.64, size: 0.72 } })
