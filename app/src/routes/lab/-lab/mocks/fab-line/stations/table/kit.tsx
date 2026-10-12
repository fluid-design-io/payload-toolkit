import { useFrame } from '@react-three/fiber'
import type { ThreeEvent } from '@react-three/fiber'
import { LineDashedMaterial, Vector3 } from 'three'

import type { TableProps } from '../../core/contract'
import { rect, segs, useDisposable } from '../../core/three'

/** Dashed outlines `w` by `d` from their centre around the first `count` pockets; the first `slots` of them draw. */
export function Pockets({ count, pocket, w, d, dash, color, slots }: {
  count: number
  pocket: (i: number, out: Vector3) => Vector3
  w: number
  d: number
  dash: [number, number]
  color: string
  slots: number
}) {
  const [geo, mat] = useDisposable(() => {
    const l: number[] = []
    const p = new Vector3()
    for (let i = 0; i < count; i++) {
      pocket(i, p)
      l.push(...rect(p.x - w, p.z - d, p.x + w, p.z + d, p.y + 0.004))
    }
    return [segs(l), new LineDashedMaterial({ color, dashSize: dash[0], gapSize: dash[1] })] as const
  }, [color])
  useFrame(() => geo.setDrawRange(0, Math.min(slots, count) * 8))
  return <lineSegments geometry={geo} material={mat} onUpdate={(s) => s.computeLineDistances()} />
}

/** Pages back from a click left of `mid` on the strip, forward from one right of it, in the clicked mesh's own x. */
export function turnPage(e: ThreeEvent<MouseEvent>, mid: number, { page, pages, setPage, guard }: Pick<TableProps, 'page' | 'pages' | 'setPage' | 'guard'>) {
  e.stopPropagation()
  if (guard.moved || pages < 2) return
  const x = e.object.worldToLocal(e.point.clone()).x
  setPage((page + (x < mid ? pages - 1 : 1)) % pages)
}
