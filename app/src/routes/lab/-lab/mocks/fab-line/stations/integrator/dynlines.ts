import { BufferAttribute, BufferGeometry, LineBasicMaterial, LineSegments } from 'three'

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
  /** Adds every segment of a list of line-segment pairs, such as `ring`'s. */
  addAll(list: readonly number[]) {
    for (let i = 0; i + 5 < list.length; i += 6) this.add(list[i], list[i + 1], list[i + 2], list[i + 3], list[i + 4], list[i + 5])
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
