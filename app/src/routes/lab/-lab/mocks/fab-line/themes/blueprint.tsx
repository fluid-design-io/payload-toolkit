import { Grid } from '@react-three/drei'
import { useEffect, useRef } from 'react'
import { Matrix4 } from 'three'
import type { InstancedMesh } from 'three'

import type { StageProps } from '../core/contract'
import { fillMat, lineMat, ring, segs, useDisposable } from '../core/three'
import { useHideOnCloseUp } from './grade'
import { LineShadow, Lights, MarkTag, label, markTexture } from './shared'

type V3 = [number, number, number]

const GRID = { light: { cell: '#D3E0EC', section: '#B4C9DE' }, dark: { cell: '#1B3A5E', section: '#2C527D' } }
const LIGHTS = { amb: 2, sun: 0, hemi: 0, color: '#FFFFFF', sunColor: '#FFFFFF', ground: '#3A3328' }

/** Dimension lines, callout leaders and the sheet border, all sized from the line's stations. */
function Annotations({ c, cam, line }: Pick<StageProps, 'c' | 'cam' | 'line'>) {
  const group = useHideOnCloseUp(cam)
  const data = useDisposable(() => {
    const ink: number[] = []
    const faint: number[] = []
    const dims: { text: string; at: V3 }[] = []
    const callouts: { text: string; at: V3; letter: string }[] = []
    const seg = (list: number[], a: V3, b: V3) => list.push(...a, ...b)
    const dim = (a: V3, b: V3, off: V3, text: string) => {
      const A: V3 = [a[0] + off[0], a[1] + off[1], a[2] + off[2]]
      const B: V3 = [b[0] + off[0], b[1] + off[1], b[2] + off[2]]
      seg(ink, A, B)
      const o = (p: V3, k: number): V3 => [p[0] + Math.sign(off[0]) * k, p[1] + Math.sign(off[1]) * k, p[2] + Math.sign(off[2]) * k]
      seg(faint, o(a, 0.25), o(A, 0.25))
      seg(faint, o(b, 0.25), o(B, 0.25))
      const tick = (p: V3) => {
        if (A[1] !== B[1]) seg(ink, [p[0] - 0.16, p[1] - 0.16, p[2]], [p[0] + 0.16, p[1] + 0.16, p[2]])
        else seg(ink, [p[0] - 0.16, p[1], p[2] + 0.16], [p[0] + 0.16, p[1], p[2] - 0.16])
      }
      tick(A)
      tick(B)
      dims.push({ text, at: [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2 + 0.3, (A[2] + B[2]) / 2] })
    }
    const dots: V3[] = []
    const callout = (at: V3, to: V3, letter: string, text: string) => {
      seg(ink, at, to)
      callouts.push({ text, at: to, letter })
      dots.push(at)
    }
    const m = (v: number) => `${v.toFixed(2)} m`
    let letter = 65
    for (const stop of line.stops) {
      for (const d of stop.dims) dim(d.from, d.to, d.off, m(Math.hypot(d.to[0] - d.from[0], d.to[1] - d.from[1], d.to[2] - d.from[2])))
      for (const l of stop.callouts) callout(l.at, l.tag, String.fromCharCode(letter++), l.text.toUpperCase())
    }
    const x0 = line.extent.x0 - 1.7, x1 = line.extent.x1 + 2.0
    const sheet: V3[] = [[x0, 0.01, -9.2], [x1, 0.01, -9.2], [x1, 0.01, 9.4], [x0, 0.01, 9.4]]
    for (let i = 0; i < 4; i++) seg(faint, sheet[i], sheet[(i + 1) % 4])
    const inner: V3[] = [[x0 + 0.4, 0.01, -8.8], [x1 - 0.4, 0.01, -8.8], [x1 - 0.4, 0.01, 9.0], [x0 + 0.4, 0.01, 9.0]]
    for (let i = 0; i < 4; i++) seg(faint, inner[i], inner[(i + 1) % 4])
    const nx = x0 + 1.5
    seg(ink, [nx, 0.02, -6.6], [nx, 0.02, -8.4]); seg(ink, [nx, 0.02, -8.4], [nx - 0.35, 0.02, -7.9]); seg(ink, [nx, 0.02, -8.4], [nx + 0.35, 0.02, -7.9])
    ring(nx, 0.02, -7.5, 1.1, 40, faint)
    const sx = x0 + 0.85
    for (let k = 0; k < 33; k++) seg(ink, [sx, 0.05, -5 + k * 0.5], [sx - (k % 2 ? 0.18 : 0.34), 0.05, -5 + k * 0.5])
    seg(ink, [sx, 0.05, -5], [sx, 0.05, 11])
    seg(ink, [sx - 0.4, 0.05, -5], [sx - 0.4, 0.05, 11])
    return { ink: segs(ink), faint: segs(faint), dims, callouts, dots, north: [nx, 0.02, -9.1] as V3 }
  }, [line])
  const maps = useDisposable(() => data.dims.map((d) => label(d.text, { fg: c.edge, size: 40, w: 256, h: 64 })), [data, c])
  const tags = useDisposable(() => data.callouts.map((l) => markTexture(l.letter, l.text, { ring: c.edge, fill: c.surface, mark: c.edge, name: c.fg, weight: 500 })), [data, c])
  const north = useDisposable(() => label('N', { fg: c.edge, size: 64, w: 128, h: 128, weight: 600 }), [c])
  const dots = useRef<InstancedMesh>(null)
  useEffect(() => {
    const m = new Matrix4()
    data.dots.forEach((d, i) => dots.current?.setMatrixAt(i, m.makeTranslation(...d)))
    if (dots.current) dots.current.instanceMatrix.needsUpdate = true
  }, [data])
  return (
    <group ref={group}>
      <lineSegments geometry={data.ink} material={lineMat(c.edge)} />
      <lineSegments geometry={data.faint} material={lineMat(c.dim)} />
      <instancedMesh key={data.dots.length} ref={dots} args={[undefined, undefined, data.dots.length]} material={fillMat(c.edge, true)}>
        <sphereGeometry args={[0.07, 8, 8]} />
      </instancedMesh>
      {data.dims.map((d, i) => (
        <sprite key={i} position={d.at} scale={[0.92, 0.23, 1]}>
          <spriteMaterial map={maps[i]} transparent toneMapped={false} depthWrite={false} />
        </sprite>
      ))}
      {data.callouts.map((l, i) => (
        <MarkTag key={i} map={tags[i]} at={l.at} h={0.4} />
      ))}
      <mesh position={data.north} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.7, 0.7]} />
        <meshBasicMaterial map={north} transparent toneMapped={false} depthWrite={false} />
      </mesh>
    </group>
  )
}

export function Stage({ c, mode, power, cam, line }: StageProps) {
  const grid = GRID[mode]
  return (
    <>
      <Lights preset={LIGHTS} power={power} />
      <Grid
        args={[140, 140]}
        cellSize={0.5}
        cellThickness={0.6}
        cellColor={grid.cell}
        sectionSize={2.5}
        sectionThickness={1}
        sectionColor={grid.section}
        fadeDistance={110}
        fadeStrength={1.5}
        infiniteGrid
      />
      <Annotations c={c} cam={cam} line={line} />
      <LineShadow c={c} line={line} />
    </>
  )
}
