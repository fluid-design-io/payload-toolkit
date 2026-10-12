import {
  BoxGeometry, BufferAttribute, BufferGeometry, Color, DataTexture, DynamicDrawUsage, EdgesGeometry, Float32BufferAttribute, FloatType, Group,
  InstancedBufferAttribute, InstancedMesh, LineBasicMaterial, LineSegments, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, NearestFilter,
  RGBAFormat, ShaderChunk, Sphere, Vector3,
} from 'three'
import type { Material, WebGLProgramParametersWithUniforms, WebGLRenderer } from 'three'

import type { CatalogItem } from '@/routes/workspace/-workspace/workspace.types'
import { CELL, MarkingAtlas, cellRect } from './atlas'
import type { ChipBox, ChipLid, ChipVariant } from './contract'
import { chipTop } from './spec'
import type { Spec } from './spec'

/** One package a batch draws: `key` names it among the batch's entries, `code` is printed on its lid. */
export type BatchEntry = { key: string; item: CatalogItem; code: string; spec: Spec }
/** The materials a batch paints with: package body and plated metal, hairlines, and the fill opacity (ghosts are see-through). */
export type BatchLook = { flat: boolean; opacity: number; body: string; pin: string; edge: string; edgeOpacity: number }

/** The logical width a print is painted at, whatever its cell's texel size. */
const PRINT_W = 512

/**
 * A package's vertices at scale 1 in its own frame: the fill (indexed, with normals and a paint per vertex, 0 body
 * and 1 metal) and the hairline segments of its edged boxes. Built once per variant and spec.
 */
export type Template = { position: Float32Array; normal: Int8Array; paint: Uint8Array; index: Uint32Array; edges: Float32Array }

const unitBox = new BoxGeometry(1, 1, 1)
const unitEdges = new EdgesGeometry(unitBox)
const BOX = { position: unitBox.attributes.position.array as Float32Array, normal: unitBox.attributes.normal.array as Float32Array, index: unitBox.index!.array as Uint16Array }
const EDGE = unitEdges.attributes.position.array as Float32Array

/** The boxes as one package's vertices. */
export function templateOf(boxes: readonly ChipBox[]): Template {
  const nv = BOX.position.length / 3, ni = BOX.index.length, ne = EDGE.length / 3
  const edged = boxes.filter((b) => b.edge).length
  const t: Template = {
    position: new Float32Array(boxes.length * nv * 3), normal: new Int8Array(boxes.length * nv * 3), paint: new Uint8Array(boxes.length * nv),
    index: new Uint32Array(boxes.length * ni), edges: new Float32Array(edged * ne * 3),
  }
  let e = 0
  boxes.forEach((b, k) => {
    for (let v = 0; v < nv; v++)
      for (let a = 0; a < 3; a++) {
        t.position[(k * nv + v) * 3 + a] = BOX.position[v * 3 + a] * b.size[a] + b.at[a]
        t.normal[(k * nv + v) * 3 + a] = BOX.normal[v * 3 + a] * 127
      }
    t.paint.fill(b.paint === 'pin' ? 1 : 0, k * nv, (k + 1) * nv)
    for (let i = 0; i < ni; i++) t.index[k * ni + i] = BOX.index[i] + k * nv
    if (!b.edge) return
    for (let v = 0; v < ne; v++) for (let a = 0; a < 3; a++) t.edges[(e * ne + v) * 3 + a] = EDGE[v * 3 + a] * b.size[a] + b.at[a]
    e++
  })
  return t
}

const templates = new WeakMap<object, WeakMap<Spec, Template>>()
/** The variant's template for a spec, cached while both live. */
export function templateFor(chip: Pick<ChipVariant, 'boxes'>, spec: Spec) {
  let bySpec = templates.get(chip)
  if (!bySpec) templates.set(chip, (bySpec = new WeakMap()))
  let t = bySpec.get(spec)
  if (!t) bySpec.set(spec, (t = templateOf(chip.boxes(spec))))
  return t
}

/** Every entry's template end to end, each vertex tagged with its entry's index. */
export type Packed = {
  position: Float32Array; normal: Int8Array; paint: Uint8Array; entry: Uint16Array; index: Uint32Array
  edges: Float32Array; edgeEntry: Uint16Array
}
export function pack(list: readonly Template[]): Packed {
  let nv = 0, ni = 0, ne = 0
  for (const t of list) {
    nv += t.paint.length
    ni += t.index.length
    ne += t.edges.length / 3
  }
  const out: Packed = {
    position: new Float32Array(nv * 3), normal: new Int8Array(nv * 3), paint: new Uint8Array(nv), entry: new Uint16Array(nv), index: new Uint32Array(ni),
    edges: new Float32Array(ne * 3), edgeEntry: new Uint16Array(ne),
  }
  let v = 0, i = 0, e = 0
  list.forEach((t, k) => {
    const n = t.paint.length, m = t.edges.length / 3
    out.position.set(t.position, v * 3)
    out.normal.set(t.normal, v * 3)
    out.paint.set(t.paint, v)
    out.entry.fill(k, v, v + n)
    for (let j = 0; j < t.index.length; j++) out.index[i + j] = t.index[j] + v
    out.edges.set(t.edges, e * 3)
    out.edgeEntry.fill(k, e, e + m)
    v += n
    i += t.index.length
    e += m
  })
  return out
}

const pow2 = (n: number, min: number) => 2 ** Math.ceil(Math.log2(Math.max(min, n)))
/** A footprint outline as four segments, corners in units of the half extents. */
const RING = [[-1, -1], [1, -1], [1, -1], [1, 1], [1, 1], [-1, 1], [-1, 1], [-1, -1]] as const
/** A lid quad's corners in units of its half extents, back left first, and its two upward-facing triangles. */
const LID_CORNERS = [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const
const LID_INDEX = [0, 3, 2, 0, 2, 1]

/** An entry's pose is three texels, the rows of its affine matrix, fetched once per vertex. */
const POSE = /* glsl */ `
attribute float chipEntry;
uniform highp sampler2D chipPose;
mat4 chipPoseOf(float e) {
  int r = int(e + 0.5);
  return transpose(mat4(texelFetch(chipPose, ivec2(0, r), 0), texelFetch(chipPose, ivec2(1, r), 0), texelFetch(chipPose, ivec2(2, r), 0), vec4(0.0, 0.0, 0.0, 1.0)));
}
`

type Uniforms = { chipPose: { value: DataTexture | null }; chipBody: { value: Color }; chipPin: { value: Color } }
type Kind = 'fill' | 'edge' | 'lid'

/** Moves the material's vertices through their entry's pose row, so one draw places every package. */
function posed<M extends Material>(material: M, kind: Kind, uniforms: Uniforms) {
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    Object.assign(shader.uniforms, uniforms)
    let v = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${POSE}${kind === 'fill' ? 'attribute float chipPaint;\nuniform vec3 chipBody;\nuniform vec3 chipPin;\n' : ''}`)
      .replace('void main() {', 'void main() {\n\tmat4 chipM = chipPoseOf(chipEntry);')
      .replace('#include <begin_vertex>', 'vec3 transformed = (chipM * vec4(position, 1.0)).xyz;')
    if (kind === 'fill')
      v = v
        .replace('#include <beginnormal_vertex>', ShaderChunk.beginnormal_vertex.replace('vec3( normal )', 'mat3(chipM) * vec3( normal )'))
        .replace('#include <color_vertex>', 'vColor = vec4(mix(chipBody, chipPin, chipPaint), 1.0);')
    shader.vertexShader = v
  }
  material.customProgramCacheKey = () => `fab-chip-${kind}`
  return material
}

/** Writes `src` into a geometry attribute from the start, uploading only that range. */
function put(attr: BufferAttribute, src: ArrayLike<number>) {
  ;(attr.array as Float32Array).set(src as Float32Array)
  attr.clearUpdateRanges()
  attr.addUpdateRange(0, src.length)
  attr.needsUpdate = true
}

type Attrs = Record<string, readonly [number, typeof Float32Array | typeof Int8Array | typeof Uint8Array | typeof Uint16Array]>
/** A geometry with room for `vertices` of the named attributes (item size, array type) and `indices`, if any. */
function layer(vertices: number, indices: number, attrs: Attrs) {
  const g = new BufferGeometry()
  for (const [name, [size, Type]] of Object.entries(attrs)) g.setAttribute(name, new BufferAttribute(new Type(vertices * size), size, Type === Int8Array).setUsage(DynamicDrawUsage))
  if (indices) g.setIndex(new BufferAttribute(new Uint32Array(indices), 1).setUsage(DynamicDrawUsage))
  return g
}
const FILL_ATTRS: Attrs = { position: [3, Float32Array], normal: [3, Int8Array], chipPaint: [1, Uint8Array], chipEntry: [1, Uint16Array] }
const EDGE_ATTRS: Attrs = { position: [3, Float32Array], chipEntry: [1, Uint16Array] }
const LID_ATTRS: Attrs = { position: [3, Float32Array], uv: [2, Float32Array], chipEntry: [1, Uint16Array] }

/**
 * The GPU side of a batch of packages: every entry's template end to end in one fill and one hairline draw, every
 * lid print as a quad in one draw from a shared atlas, each vertex posed by its entry's row in one float texture.
 * `setEntries` repacks the vertices when the set changes; `frame` writes the poses, moves the pick boxes and rings,
 * and paints queued prints.
 */
export class ChipBatchGpu {
  readonly root = new Group()
  /** One undrawn footprint box per entry, for pointer picking by `instanceId`. Mount it where `root` is. */
  readonly hit: InstancedMesh
  /** Each entry's pose this frame, valid for the first `count` entries. */
  readonly poses: Matrix4[] = []
  count = 0
  private uniforms: Uniforms = { chipPose: { value: null }, chipBody: { value: new Color() }, chipPin: { value: new Color() } }
  private fill: Mesh<BufferGeometry, Material>
  private edge: LineSegments<BufferGeometry, Material>
  private lid: Mesh<BufferGeometry, MeshBasicMaterial>
  private ring: LineSegments<BufferGeometry, LineBasicMaterial>
  private atlas: MarkingAtlas | null = null
  private lidCells: (number | null)[] = []
  private lids: (ChipLid | null)[] = []
  private lidsDirty = false
  private look: BatchLook | null = null
  private feet: { w: number; d: number; top: number }[] = []
  private ringColor = new Color()
  private scratch = { m: new Matrix4(), v: new Vector3() }

  constructor() {
    this.fill = new Mesh(layer(1024, 1024, FILL_ATTRS), new MeshBasicMaterial())
    this.edge = new LineSegments(layer(1024, 0, EDGE_ATTRS), new LineBasicMaterial())
    this.lid = new Mesh(layer(1024, 1024, LID_ATTRS), posed(new MeshBasicMaterial({ toneMapped: false }), 'lid', this.uniforms))
    this.ring = new LineSegments(new BufferGeometry(), new LineBasicMaterial({ vertexColors: true }))
    for (const o of [this.fill, this.edge, this.lid, this.ring]) {
      o.frustumCulled = false
      o.visible = false
      this.root.add(o)
    }
    this.hit = new InstancedMesh(unitBox, new MeshBasicMaterial({ visible: false }), 16)
    this.hit.count = 0
    // Instances move every frame; a cached bounding sphere from the first poses would miss later clicks.
    this.hit.boundingSphere = new Sphere(new Vector3(), 1e6)
    this.hit.frustumCulled = false
    this.poseRows(16)
  }

  /** Materials for a look; rebuilt only when a material-defining field changes, colors are uniforms. */
  setLook(look: BatchLook) {
    const was = this.look
    this.look = look
    this.uniforms.chipBody.value.set(look.body)
    this.uniforms.chipPin.value.set(look.pin)
    if (was && was.flat === look.flat && was.opacity === look.opacity && was.edgeOpacity === look.edgeOpacity && was.edge === look.edge) return
    this.fill.material.dispose()
    this.edge.material.dispose()
    const ghost = look.opacity < 1
    this.fill.material = posed(
      look.flat
        ? new MeshBasicMaterial({ vertexColors: true, transparent: ghost, opacity: look.opacity })
        : new MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.18, transparent: ghost, opacity: look.opacity }),
      'fill', this.uniforms,
    )
    this.edge.material = posed(new LineBasicMaterial({ color: look.edge, transparent: look.edgeOpacity < 1, opacity: look.edgeOpacity }), 'edge', this.uniforms)
  }

  /** Repacks the vertices for `entries` and claims each lid's print cell; prints paint over the next frames. */
  setEntries(chip: ChipVariant, entries: readonly BatchEntry[], print: { body: string; ink: string }, maxTexture: number) {
    const packed = pack(entries.map((e) => templateFor(chip, e.spec)))
    this.count = entries.length
    this.poseRows(entries.length)
    const fg = (this.fill.geometry = this.fit(this.fill.geometry, packed.entry.length, packed.index.length, FILL_ATTRS))
    put(fg.attributes.position as BufferAttribute, packed.position)
    put(fg.attributes.normal as BufferAttribute, packed.normal)
    put(fg.attributes.chipPaint as BufferAttribute, packed.paint)
    put(fg.attributes.chipEntry as BufferAttribute, packed.entry)
    put(fg.index!, packed.index)
    fg.setDrawRange(0, packed.index.length)
    this.fill.visible = packed.index.length > 0
    const eg = (this.edge.geometry = this.fit(this.edge.geometry, packed.edgeEntry.length, 0, EDGE_ATTRS))
    put(eg.attributes.position as BufferAttribute, packed.edges)
    put(eg.attributes.chipEntry as BufferAttribute, packed.edgeEntry)
    eg.setDrawRange(0, packed.edgeEntry.length)
    this.edge.visible = packed.edgeEntry.length > 0
    this.feet = entries.map((e) => ({ w: e.spec.fw, d: e.spec.fd, top: chipTop(e.spec) }))
    this.sizeHitAndRing(entries.length)

    const lids = entries.map((e) => chip.lid(e.spec))
    const keys = entries.map((e, i) => (lids[i] ? `${chip.id}|${e.key}|${e.code}|${print.body}|${print.ink}` : null))
    const pinned = new Set(keys.filter((k): k is string => !!k))
    if (!this.atlas || this.atlas.capacity < pinned.size) {
      this.atlas?.dispose()
      this.atlas = new MarkingAtlas(pinned.size, Math.floor(Math.min(8192, maxTexture) / CELL.h))
      this.lid.material.map = this.atlas.texture
      this.lid.material.needsUpdate = true
    }
    const atlas = this.atlas
    this.lids = lids
    this.lidCells = entries.map((e, i) => {
      const lid = lids[i]
      const key = keys[i]
      if (!lid || !key) return null
      const w = PRINT_W, h = (PRINT_W * lid.d) / lid.w
      return atlas.claim(key, w, h, (ctx) => chip.marking(ctx, w, h, e.item, e.code, e.spec, print), pinned)
    })
    this.lidsDirty = true
  }

  /**
   * Poses every entry with `pose` (false hides it), uploads the poses, moves the pick boxes, outlines the entries
   * `ringOf` colors, and paints prints for up to `budget` ms. True while prints still wait to be painted.
   */
  frame(gl: WebGLRenderer, pose: (i: number, out: Matrix4) => boolean, budget: number, ringOf?: (i: number, out: Color) => boolean) {
    const tex = this.uniforms.chipPose.value!
    const data = tex.image.data as Float32Array
    const { m: box, v } = this.scratch
    const pos = this.ring.geometry.getAttribute('position') as BufferAttribute | undefined
    const col = this.ring.geometry.getAttribute('color') as BufferAttribute | undefined
    let rings = 0
    for (let i = 0; i < this.count; i++) {
      const m = this.poses[i]
      if (!pose(i, m)) m.makeScale(0, 0, 0)
      const e = m.elements, o = i * 12
      data[o] = e[0]; data[o + 1] = e[4]; data[o + 2] = e[8]; data[o + 3] = e[12]
      data[o + 4] = e[1]; data[o + 5] = e[5]; data[o + 6] = e[9]; data[o + 7] = e[13]
      data[o + 8] = e[2]; data[o + 9] = e[6]; data[o + 10] = e[10]; data[o + 11] = e[14]
      const f = this.feet[i]
      box.makeScale(f.w, f.top, f.d).setPosition(0, f.top / 2, 0).premultiply(m)
      this.hit.setMatrixAt(i, box)
      if (ringOf && pos && col && ringOf(i, this.ringColor)) {
        const hw = f.w / 2 + 0.06, hd = f.d / 2 + 0.06
        for (let k = 0; k < 8; k++) {
          v.set(RING[k][0] * hw, 0.012, RING[k][1] * hd).applyMatrix4(m)
          pos.setXYZ(rings * 8 + k, v.x, v.y, v.z)
          col.setXYZ(rings * 8 + k, this.ringColor.r, this.ringColor.g, this.ringColor.b)
        }
        rings++
      }
    }
    tex.needsUpdate = true
    this.hit.instanceMatrix.needsUpdate = true
    if (pos && col) {
      this.ring.geometry.setDrawRange(0, rings * 8)
      pos.needsUpdate = col.needsUpdate = rings > 0
      this.ring.visible = rings > 0
    }
    if (this.atlas && this.atlas.flush(gl, budget) > 0) this.lidsDirty = true
    if (this.lidsDirty) this.writeLids()
    return !!this.atlas?.pending
  }

  dispose() {
    for (const o of [this.fill, this.edge, this.lid, this.ring]) {
      o.geometry.dispose()
      o.material.dispose()
    }
    this.hit.dispose()
    this.uniforms.chipPose.value?.dispose()
    this.atlas?.dispose()
  }

  /** `g`, or a larger replacement when it holds fewer than `vertices` or `indices`. */
  private fit(g: BufferGeometry, vertices: number, indices: number, attrs: Attrs) {
    if (g.attributes.position.count >= vertices && (g.index?.count ?? 0) >= indices) return g
    g.dispose()
    return layer(pow2(vertices, 1024), indices ? pow2(indices, 1024) : 0, attrs)
  }

  private sizeHitAndRing(n: number) {
    const cap = pow2(n, 16)
    if (this.hit.instanceMatrix.count < cap) this.hit.instanceMatrix = new InstancedBufferAttribute(new Float32Array(cap * 16), 16)
    this.hit.count = n
    const pos = this.ring.geometry.getAttribute('position')
    if (!pos || pos.count < cap * 8) {
      this.ring.geometry.dispose()
      const g = new BufferGeometry()
      g.setAttribute('position', new Float32BufferAttribute(new Float32Array(cap * 24), 3).setUsage(DynamicDrawUsage))
      g.setAttribute('color', new Float32BufferAttribute(new Float32Array(cap * 24), 3).setUsage(DynamicDrawUsage))
      this.ring.geometry = g
    }
  }

  private poseRows(n: number) {
    const rows = pow2(n, 16)
    while (this.poses.length < rows) this.poses.push(new Matrix4())
    const old = this.uniforms.chipPose.value
    if (old && old.image.height >= rows) return
    old?.dispose()
    const tex = new DataTexture(new Float32Array(rows * 12), 3, rows, RGBAFormat, FloatType)
    tex.minFilter = tex.magFilter = NearestFilter
    tex.needsUpdate = true
    this.uniforms.chipPose.value = tex
  }

  /** The quads of every painted print; a print still waiting draws nothing, so the package shows its bare lid. */
  private writeLids() {
    this.lidsDirty = false
    const atlas = this.atlas
    const position: number[] = [], uv: number[] = [], entry: number[] = [], index: number[] = []
    this.lids.forEach((lid, e) => {
      const cell = this.lidCells[e]
      if (!lid || cell == null || !atlas || !atlas.ready(cell)) return
      const [u0, v0, u1, v1] = cellRect(cell, atlas.rows)
      const base = entry.length
      for (const [cx, cz] of LID_CORNERS) {
        position.push(lid.x + (cx * lid.w) / 2, lid.y, (cz * lid.d) / 2)
        uv.push(cx < 0 ? u0 : u1, cz < 0 ? v0 : v1)
        entry.push(e)
      }
      for (const k of LID_INDEX) index.push(base + k)
    })
    const g = (this.lid.geometry = this.fit(this.lid.geometry, entry.length, index.length, LID_ATTRS))
    put(g.attributes.position as BufferAttribute, position)
    put(g.attributes.uv as BufferAttribute, uv)
    put(g.attributes.chipEntry as BufferAttribute, entry)
    put(g.index!, index)
    g.setDrawRange(0, index.length)
    this.lid.visible = index.length > 0
  }
}
