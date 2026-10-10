import { useEffect, useMemo } from 'react'
import { BufferAttribute, BufferGeometry, LineBasicMaterial, LineSegments } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import type { Tokens } from '../../core/contract'
import { fillMat, lineMat, mergeEdges, mergeFills, segs } from '../../core/three'
import type { Piece } from '../../core/three'

/** A circle of `n` segments in the XZ plane at height `y`, as line-segment pairs. */
export function ring(cx: number, y: number, cz: number, r: number, n = 32, out: number[] = []) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, b = ((i + 1) / n) * Math.PI * 2
    out.push(cx + Math.cos(a) * r, y, cz + Math.sin(a) * r, cx + Math.cos(b) * r, y, cz + Math.sin(b) * r)
  }
  return out
}

/** A rigid part: one merged fill and one merged hairline draw. `lines` adds hand-drawn hairlines (rings, curves) to the edges. */
export function useRigid(build: () => { pieces: Piece[]; lines?: number[] }, deps: unknown[] = []) {
  const geo = useMemo(() => {
    const { pieces, lines } = build()
    const edges = mergeEdges(pieces)
    const extra = lines?.length ? segs(lines) : null
    const merged = extra ? mergeGeometries([edges, extra])! : edges
    if (extra) { extra.dispose(); edges.dispose() }
    return { fill: mergeFills(pieces), edges: merged as BufferGeometry }
  }, deps)
  useEffect(() => () => { geo.fill.dispose(); geo.edges.dispose() }, [geo])
  return geo
}

export function Rigid({ geo, fill, edge, c, metal }: { geo: { fill: BufferGeometry; edges: BufferGeometry }; fill: string; edge: string; c: Tokens; metal?: number }) {
  return (
    <>
      <mesh geometry={geo.fill} material={fillMat(fill, c.flat, c.rough, { metal })} />
      <lineSegments geometry={geo.edges} material={lineMat(edge)} />
    </>
  )
}

/** A hairline buffer rewritten every frame: `begin`, `add` segments, `end`. One draw. */
export class DynLines {
  readonly object: LineSegments
  private readonly arr: Float32Array
  private n = 0
  constructor(readonly cap: number, color: string, opacity = 1) {
    const g = new BufferGeometry()
    this.arr = new Float32Array(cap * 6)
    g.setAttribute('position', new BufferAttribute(this.arr, 3))
    g.setDrawRange(0, 0)
    this.object = new LineSegments(g, new LineBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 }))
    this.object.frustumCulled = false
    this.object.raycast = () => {}
  }
  get material() { return this.object.material as LineBasicMaterial }
  begin() { this.n = 0 }
  add(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) {
    if (this.n >= this.cap) return
    const o = this.n++ * 6, a = this.arr
    a[o] = x0; a[o + 1] = y0; a[o + 2] = z0; a[o + 3] = x1; a[o + 4] = y1; a[o + 5] = z1
  }
  end() {
    this.object.geometry.setDrawRange(0, this.n * 2)
    ;(this.object.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true
  }
  dispose() {
    this.object.geometry.dispose()
    this.material.dispose()
  }
}
