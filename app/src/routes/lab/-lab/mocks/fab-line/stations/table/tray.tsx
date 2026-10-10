import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { BufferGeometry, Float32BufferAttribute, LineDashedMaterial, LineSegments as ThreeLineSegments, Vector3 } from 'three'

import type { TableProps, TableVariant, Tokens } from '../../core/contract'
import { Body } from '../../core/scene'
import { FONT, box, textTexture } from '../../core/three'
import type { Piece } from '../../core/three'

/** One bay of 20 pockets, five across and four deep, on a four-legged table. */
const TABLE = { x0: -13.7, x1: -7.15, z0: -1.75, z1: 3.15, y: 0.9 }
const PAD = { cols: 5, rows: 4, x0: -13.1, z0: -1.0, pitchX: 1.3, pitchZ: 1.12 }
const POCKETS = PAD.cols * PAD.rows

function pocket(index: number, out: Vector3) {
  return out.set(PAD.x0 + (index % PAD.cols) * PAD.pitchX, TABLE.y, PAD.z0 + Math.floor(index / PAD.cols) * PAD.pitchZ)
}

function Top({ c }: { c: Tokens }) {
  const pieces = useMemo((): Piece[] => {
    const tx = (TABLE.x0 + TABLE.x1) / 2, tw = TABLE.x1 - TABLE.x0
    const out: Piece[] = [{ geo: box(tw, 0.12, TABLE.z1 - TABLE.z0), at: [tx, TABLE.y - 0.06, (TABLE.z0 + TABLE.z1) / 2] }]
    for (const [x, z] of [[TABLE.x0 + 0.15, TABLE.z0 + 0.15], [TABLE.x1 - 0.15, TABLE.z0 + 0.15], [TABLE.x0 + 0.15, TABLE.z1 - 0.15], [TABLE.x1 - 0.15, TABLE.z1 - 0.15]])
      out.push({ geo: box(0.12, TABLE.y - 0.12, 0.12), at: [x, (TABLE.y - 0.12) / 2, z] })
    return out
  }, [])
  return <Body id="table" c={c} fill={c.surface} edge={c.edge} pieces={pieces} />
}

function Tray({ c, slots, label, pages, page, setPage, tip, guard }: TableProps) {
  const strip = useMemo(
    () =>
      textTexture(1024, 96, (ctx) => {
        ctx.fillStyle = c.surface
        ctx.fillRect(0, 0, 1024, 96)
        ctx.fillStyle = c.muted
        ctx.font = `500 34px ${FONT}`
        ctx.fillText(label, 110, 60)
        ctx.textAlign = 'right'
        ctx.fillStyle = c.fg
        ctx.fillText(`${page + 1} / ${pages}`, 910, 60)
        ctx.strokeStyle = pages > 1 ? c.fg : c.dim
        ctx.lineWidth = 4
        ctx.beginPath()
        ctx.moveTo(60, 28); ctx.lineTo(36, 48); ctx.lineTo(60, 68)
        ctx.moveTo(964, 28); ctx.lineTo(988, 48); ctx.lineTo(964, 68)
        ctx.stroke()
      }),
    [c, label, page, pages],
  )
  useEffect(() => () => strip.dispose(), [strip])
  const pads = useMemo(() => {
    const l: number[] = []
    const y = TABLE.y + 0.004, p = new Vector3()
    for (let i = 0; i < POCKETS; i++) {
      pocket(i, p)
      const w = 0.56, d = 0.48
      l.push(p.x - w, y, p.z - d, p.x + w, y, p.z - d, p.x + w, y, p.z - d, p.x + w, y, p.z + d, p.x + w, y, p.z + d, p.x - w, y, p.z + d, p.x - w, y, p.z + d, p.x - w, y, p.z - d)
    }
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(l, 3))
    const seg = new ThreeLineSegments(g, new LineDashedMaterial({ color: c.edge, dashSize: 0.09, gapSize: 0.07 }))
    seg.computeLineDistances()
    return seg
  }, [c.edge])
  useEffect(() => () => { pads.geometry.dispose(); pads.material.dispose() }, [pads])
  useFrame(() => {
    const g = pads.geometry
    g.setDrawRange(0, slots * 8)
  })
  const cx = (TABLE.x0 + TABLE.x1) / 2, w = TABLE.x1 - TABLE.x0
  return (
    <group>
      <Top c={c} />
      <primitive object={pads} />
      <mesh
        position={[cx, TABLE.y + 0.005, TABLE.z1 - 0.34]}
        rotation={[-Math.PI / 2, 0, 0]}
        onClick={(e) => {
          e.stopPropagation()
          if (guard.moved || pages < 2) return
          const local = e.point.x - cx
          setPage((page + (local < 0 ? pages - 1 : 1)) % pages)
        }}
        onPointerOver={(e) => { e.stopPropagation(); tip.show(e.nativeEvent, 'Pick tray', pages > 1 ? 'Click left or right half to change bay' : 'One bay') }}
        onPointerMove={(e) => tip.move(e.nativeEvent)}
        onPointerOut={() => tip.hide()}
      >
        <planeGeometry args={[w - 0.3, (w - 0.3) * (96 / 1024)]} />
        <meshBasicMaterial map={strip} toneMapped={false} />
      </mesh>
    </group>
  )
}

export const tray: TableVariant = {
  id: 'tray',
  label: 'Tray 20',
  footprint: { x0: TABLE.x0, x1: TABLE.x1, z0: TABLE.z0, z1: TABLE.z1, h: TABLE.y },
  frame: [[TABLE.x0 - 0.4, 0, TABLE.z1 + 0.6], [TABLE.x1 + 0.6, 0, TABLE.z1 + 0.6], [TABLE.x1 + 0.6, 0, TABLE.z0 - 0.4], [TABLE.x0 - 0.4, 0, TABLE.z0 - 0.4], [TABLE.x0, 1.4, TABLE.z0]],
  el: 52,
  bays: 1,
  cols: PAD.cols,
  pocket,
  fit: { max: 0.8, size: 1.02 },
  Component: Tray,
}
