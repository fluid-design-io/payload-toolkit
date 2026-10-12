import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import { Matrix4, Vector3 } from 'three'
import type { InstancedMesh } from 'three'

import type { TransportProps } from '../../core/contract'
import { Body } from '../../core/scene'
import { box, cyl, fillMat, reducedMotion } from '../../core/three'
import type { Piece } from '../../core/three'
import { BELT } from './belt.data'
import { pose, sweepBox, yawOf } from './kit'
import type { Frame } from './kit'
import { Track } from './track'

const SLAT = 0.24
const LEG = 3.2

const side = (t: Vector3, out: Vector3) => out.set(-t.z, 0, t.x)
const scratch = { m: new Matrix4(), p: new Vector3(), t: new Vector3() }

/**
 * The belt's frame at point `i` of a flat polyline: the side is mitered
 * across the bend so the section keeps its width, and heights are absolute.
 */
function mitered(pts: readonly Vector3[]) {
  const n = pts.length
  const t0 = new Vector3(), t1 = new Vector3(), s0 = new Vector3()
  return (i: number, f: Frame) => {
    t0.subVectors(pts[Math.min(n - 1, i + 1)], pts[Math.max(0, i - 1)]).setY(0).normalize()
    t1.subVectors(pts[i], pts[Math.max(0, i - 1)]).setY(0)
    if (t1.lengthSq() < 1e-8) t1.copy(t0)
    side(t1.normalize(), s0)
    side(t0, f.side)
    f.side.multiplyScalar(1 / Math.max(0.5, f.side.dot(s0)))
    f.p.set(pts[i].x, 0, pts[i].z)
    f.up.set(0, 1, 0)
  }
}

function shapeOf(path: readonly Vector3[]) {
  // The frame runs half a roller past both ends of the path, which start and finish heading +x.
  const run = [path[0].clone().setX(path[0].x - 0.5), ...path, path[path.length - 1].clone().setX(path[path.length - 1].x + 0.5)]
  const track = new Track(run)
  const { y } = BELT
  const frame = mitered(run)
  const pieces: Piece[] = [
    { geo: sweepBox(run.length, frame, { w: BELT.w, y0: y - 0.5, y1: y - 0.08 }), threshold: 20 },
    { geo: sweepBox(run.length, frame, { w: 0.08, off: -0.7, y0: y - 0.08, y1: y + 0.08 }), threshold: 20 },
    { geo: sweepBox(run.length, frame, { w: 0.08, off: 0.7, y0: y - 0.08, y1: y + 0.08 }), threshold: 20 },
  ]
  for (const p of [run[0], run[run.length - 1]]) pieces.push({ geo: cyl(0.25, 0.25, 1.34, 24), at: [p.x, y - 0.25, p.z], rot: [Math.PI / 2, 0, 0], threshold: 20 })
  const p = new Vector3(), t = new Vector3(), s = new Vector3()
  for (let d = 0.4; d < track.len - 0.2; d += LEG) {
    track.point(d, p)
    side(track.tangent(d, t), s)
    for (const k of [-0.65, 0.65]) pieces.push({ geo: box(0.12, y - 0.5, 0.12), at: [p.x + s.x * k, (y - 0.5) / 2, p.z + s.z * k] })
  }
  return { pieces, track, id: `belt-${track.len.toFixed(3)}`, slats: Math.max(8, Math.floor(track.len / SLAT)) }
}

export function Belt({ line, c }: TransportProps) {
  const shape = shapeOf(line.path.pts)
  const slats = useRef<InstancedMesh>(null)
  const laid = useRef<string | null>(null)
  useFrame(({ clock }) => {
    const mesh = slats.current
    if (!mesh || (reducedMotion && laid.current === shape.id)) return
    laid.current = shape.id
    const { track, slats: n } = shape
    const { m, p, t } = scratch
    const step = track.len / n
    const offset = reducedMotion ? 0 : (clock.elapsedTime * BELT.speed) % step
    for (let i = 0; i < n; i++) {
      const d = (i * step + offset) % track.len
      track.point(d, p).setY(BELT.y - 0.07)
      mesh.setMatrixAt(i, pose(m, p, yawOf(track.tangent(d, t))))
    }
    mesh.instanceMatrix.needsUpdate = true
  })
  return (
    <group>
      <Body id={shape.id} c={c} fill={c.surface} edge={c.edge} pieces={shape.pieces} />
      <instancedMesh key={shape.id} ref={slats} args={[undefined, undefined, shape.slats]} material={fillMat(c.edge, true)} frustumCulled={false}>
        <boxGeometry args={[0.02, 0.01, 1.2]} />
      </instancedMesh>
    </group>
  )
}
