import type { TableProps, Tokens } from '../../core/contract'
import { Body } from '../../core/scene'
import { FONT, box, textTexture, useDisposable } from '../../core/three'
import type { Piece } from '../../core/three'
import { Pockets, turnPage } from './kit'
import { POCKETS, TABLE, pocket } from './tray.data'

function Top({ c }: { c: Tokens }) {
  const tx = (TABLE.x0 + TABLE.x1) / 2, tw = TABLE.x1 - TABLE.x0
  const pieces: Piece[] = [{ geo: box(tw, 0.12, TABLE.z1 - TABLE.z0), at: [tx, TABLE.y - 0.06, (TABLE.z0 + TABLE.z1) / 2] }]
  for (const [x, z] of [[TABLE.x0 + 0.15, TABLE.z0 + 0.15], [TABLE.x1 - 0.15, TABLE.z0 + 0.15], [TABLE.x0 + 0.15, TABLE.z1 - 0.15], [TABLE.x1 - 0.15, TABLE.z1 - 0.15]])
    pieces.push({ geo: box(0.12, TABLE.y - 0.12, 0.12), at: [x, (TABLE.y - 0.12) / 2, z] })
  return <Body id="table" c={c} fill={c.surface} edge={c.edge} pieces={pieces} />
}

export function Tray({ c, slots, label, pages, page, setPage, tip, guard }: TableProps) {
  const strip = useDisposable(
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
  const cx = (TABLE.x0 + TABLE.x1) / 2, w = TABLE.x1 - TABLE.x0
  return (
    <group>
      <Top c={c} />
      <Pockets count={POCKETS} pocket={pocket} w={0.56} d={0.48} dash={[0.09, 0.07]} color={c.edge} slots={slots} />
      <mesh
        position={[cx, TABLE.y + 0.005, TABLE.z1 - 0.34]}
        rotation={[-Math.PI / 2, 0, 0]}
        onClick={(e) => turnPage(e, 0, { page, pages, setPage, guard })}
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
