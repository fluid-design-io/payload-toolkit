import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { Matrix4, Vector3 } from 'three'
import type { InstancedMesh } from 'three'

import type { TransportProps, TransportVariant } from '../../core/contract'
import { Body } from '../../core/scene'
import { box, cyl, fillMat, reducedMotion } from '../../core/three'
import type { Piece } from '../../core/three'

/** A straight conveyor from the table's edge to the arm's bay. */
const BELT = { start: -6.6, end: -0.9, z: -1.2, y: 0.9, speed: 3.6, gap: 1.3 }
const LEN = BELT.end - BELT.start + 1.0

function Belt({ c }: TransportProps) {
  const pieces = useMemo((): Piece[] => {
    const mid = (BELT.start + BELT.end) / 2
    const out: Piece[] = [
      { geo: box(LEN, 0.42, 1.3), at: [mid, BELT.y - 0.29, BELT.z] },
      { geo: box(LEN + 0.1, 0.16, 0.08), at: [mid, BELT.y, BELT.z - 0.7] },
      { geo: box(LEN + 0.1, 0.16, 0.08), at: [mid, BELT.y, BELT.z + 0.7] },
    ]
    for (const x of [BELT.start - 0.5, BELT.end + 0.5]) out.push({ geo: cyl(0.25, 0.25, 1.34, 24), at: [x, BELT.y - 0.25, BELT.z], rot: [Math.PI / 2, 0, 0], threshold: 20 })
    for (const [x, z] of [[BELT.start + 0.4, BELT.z - 0.65], [BELT.end - 0.4, BELT.z - 0.65], [BELT.start + 0.4, BELT.z + 0.65], [BELT.end - 0.4, BELT.z + 0.65]])
      out.push({ geo: box(0.12, BELT.y - 0.5, 0.12), at: [x, (BELT.y - 0.5) / 2, z] })
    return out
  }, [])
  const slats = useRef<InstancedMesh>(null)
  const n = 24
  const m = useMemo(() => new Matrix4(), [])
  const laid = useRef(false)
  useFrame(({ clock }) => {
    const s = slats.current
    if (!s || (reducedMotion && laid.current)) return
    laid.current = true
    const offset = reducedMotion ? 0 : (clock.elapsedTime * BELT.speed) % (LEN / n)
    for (let i = 0; i < n; i++) s.setMatrixAt(i, m.makeTranslation(BELT.start - 0.5 + (((i * LEN) / n + offset) % LEN), BELT.y - 0.07, BELT.z))
    s.instanceMatrix.needsUpdate = true
  })
  return (
    <group>
      <Body id="belt" c={c} fill={c.surface} edge={c.edge} pieces={pieces} />
      <instancedMesh ref={slats} args={[undefined, undefined, n]} material={fillMat(c.edge, true)} frustumCulled={false}>
        <boxGeometry args={[0.02, 0.01, 1.2]} />
      </instancedMesh>
    </group>
  )
}

export const belt: TransportVariant = {
  id: 'belt',
  kind: 'path',
  label: 'Conveyor',
  footprint: { x0: BELT.start - 0.5, x1: BELT.end + 0.5, z0: BELT.z - 0.7, z1: BELT.z + 0.7, h: BELT.y },
  frame: [[BELT.start - 0.8, 0, BELT.z - 1.4], [BELT.start - 0.8, 0, BELT.z + 1.4], [BELT.end + 0.8, 0, BELT.z + 1.4], [BELT.end + 0.8, 1.6, BELT.z - 1.4]],
  length: BELT.end - BELT.start,
  speed: BELT.speed,
  gap: BELT.gap,
  at: (u: number, out: Vector3) => out.set(BELT.start + u, BELT.y, BELT.z),
  load: { dur: 0.55, h: 1.7 },
  Component: Belt,
}
