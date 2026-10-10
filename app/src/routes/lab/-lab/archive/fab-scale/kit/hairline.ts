import { BoxGeometry, BufferGeometry, CylinderGeometry, EdgesGeometry, Float32BufferAttribute, LineBasicMaterial, LineSegments } from 'three'
import type { InstancedBufferAttribute, InstancedMesh } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

type V3 = [number, number, number]
/** A box, or a cylinder (top radius, bottom radius, height) along y or z that outlines its caps unless `bare`. */
export type Shape = { box: V3; at: V3 } | { cyl: V3; at: V3; axis?: 'y' | 'z'; bare?: boolean }

const ring = (out: number[], cx: number, cy: number, cz: number, r: number, axis: 'y' | 'z', seg = 32) => {
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * Math.PI * 2, b = ((i + 1) / seg) * Math.PI * 2
    if (axis === 'y') out.push(cx + Math.cos(a) * r, cy, cz + Math.sin(a) * r, cx + Math.cos(b) * r, cy, cz + Math.sin(b) * r)
    else out.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r, cz, cx + Math.cos(b) * r, cy + Math.sin(b) * r, cz)
  }
}

/** A circle as flat segment pairs, for `solidGeometry` strokes. */
export function circle(cx: number, cy: number, cz: number, r: number, axis: 'y' | 'z' = 'y', seg = 32) {
  const out: number[] = []
  ring(out, cx, cy, cz, r, axis, seg)
  return out
}

/**
 * One fill geometry and one hairline geometry for a rigid group of shapes,
 * so a whole station costs two draw calls. `strokes` adds loose segments
 * as flat [x, y, z, x, y, z, ...] lists.
 */
export function solidGeometry(shapes: readonly Shape[], strokes: readonly (readonly number[])[] = []) {
  const fills: BufferGeometry[] = []
  const lines: number[] = []
  for (const s of shapes) {
    const [x, y, z] = s.at
    if ('box' in s) {
      fills.push(new BoxGeometry(...s.box).translate(x, y, z))
      boxEdges(lines, s.box, s.at)
      continue
    }
    const [r0, r1, h] = s.cyl
    const axis = s.axis ?? 'y'
    const g = new CylinderGeometry(r0, r1, h, 28)
    if (axis === 'z') g.rotateX(Math.PI / 2)
    fills.push(g.translate(x, y, z))
    if (s.bare) continue
    if (axis === 'y') {
      ring(lines, x, y + h / 2, z, r0, 'y')
      ring(lines, x, y - h / 2, z, r1, 'y')
    } else {
      ring(lines, x, y, z - h / 2, r1, 'z')
      ring(lines, x, y, z + h / 2, r0, 'z')
    }
  }
  for (const s of strokes) lines.push(...s)
  for (const g of fills) {
    g.deleteAttribute('normal')
    g.deleteAttribute('uv')
  }
  const fill = mergeGeometries(fills)!
  fills.forEach((g) => g.dispose())
  const edges = new BufferGeometry()
  edges.setAttribute('position', new Float32BufferAttribute(lines, 3))
  return { fill, edges }
}

function boxEdges(out: number[], size: readonly number[], at: readonly number[]) {
  const [w, h, d] = size
  const [x, y, z] = at
  const corner = (i: number) => [x + (i & 1 ? w : -w) / 2, y + (i & 2 ? h : -h) / 2, z + (i & 4 ? d : -d) / 2]
  for (const [a, b] of BOX_EDGES) out.push(...corner(a), ...corner(b))
}
const BOX_EDGES = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]]

/**
 * Hairline edges for every instance of `mesh` in one draw call. three only
 * checks `isInstancedMesh`, `instanceMatrix` and `count` to draw instanced,
 * so a LineSegments that borrows the mesh's attributes follows it exactly.
 * `colors`, when given, tints each instance's edges (multiplied by `color`).
 */
export function instancedEdges(mesh: InstancedMesh, color: string, opacity = 1, colors: InstancedBufferAttribute | null = null) {
  const lines = new LineSegments(new EdgesGeometry(mesh.geometry, 1), new LineBasicMaterial({ color, transparent: opacity < 1, opacity }))
  Object.assign(lines, { isInstancedMesh: true, instanceMatrix: mesh.instanceMatrix, instanceColor: colors, morphTexture: null, count: mesh.count })
  lines.frustumCulled = false
  lines.raycast = () => {}
  lines.onBeforeRender = () => {
    ;(lines as unknown as { count: number }).count = mesh.count
  }
  return lines
}
