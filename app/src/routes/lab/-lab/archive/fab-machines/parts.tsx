import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { BufferGeometry, CanvasTexture, Color, Euler, InstancedMesh, LinearMipmapLinearFilter, Matrix4, Mesh, MeshBasicMaterial, Quaternion, SRGBColorSpace, Sphere, Vector3 } from 'three'

import { play } from '../../kit/sound'
import type { Lab } from '../../lab.types'
import { fillMat, flushQuads, quadGeometry, segmentWriter, tint, useSegments } from './kit/hairline'
import type { Guard, Look, Tip, UV } from './kit/hairline'
import { BRAND } from './sim'
import type { Part, Sim } from './sim'

const CAP = 1024
const M = new Matrix4()
const Q = new Quaternion()
const E = new Euler()
const P = new Vector3()
const S = new Vector3()
const C = new Color()
/** Instances fly all over the floor, so the pick sphere is fixed to the whole scene: three.js would otherwise cache the first one it computes. */
const SCENE_SPHERE = new Sphere(new Vector3(2, 2, 0), 40)

/** The part under a pointer since pointerdown, for a long press. */
export type Press = { part: Part | null }

const CELL_W = 256
const CELL_H = 192
const COLS = 8
const ROWS = 10
const CELLS = COLS * ROWS
const GUTTER = 4
const TOP_CAP = 256

/**
 * Every screenshot top shares one 2048×1920 canvas: 80 cells of 256×192,
 * loaded on demand for parts that are live (on the tray, travelling or
 * seated) and recycled least-recently-used, so tops cost one draw however
 * many there are. Uploads are batched to at most one every 120 ms.
 */
class TopAtlas {
  readonly canvas = document.createElement('canvas')
  readonly texture: CanvasTexture
  private readonly ctx: CanvasRenderingContext2D
  private readonly cell = new Map<string, number>()
  private readonly owner: (string | null)[] = Array(CELLS).fill(null)
  private readonly loaded = new Uint8Array(CELLS)
  private readonly touched = new Float64Array(CELLS)
  private readonly uvs: UV[] = []
  private dirty = false
  private uploaded = 0
  private alive = true
  constructor(private readonly onLoad: () => void) {
    this.canvas.width = COLS * CELL_W
    this.canvas.height = ROWS * CELL_H
    this.ctx = this.canvas.getContext('2d')!
    this.texture = new CanvasTexture(this.canvas)
    this.texture.colorSpace = SRGBColorSpace
    this.texture.anisotropy = 8
    this.texture.minFilter = LinearMipmapLinearFilter
    for (let i = 0; i < CELLS; i++) {
      const x = (i % COLS) * CELL_W + GUTTER, y = Math.floor(i / COLS) * CELL_H + GUTTER
      const W = this.canvas.width, H = this.canvas.height
      this.uvs.push([x / W, 1 - (y + CELL_H - 2 * GUTTER) / H, (x + CELL_W - 2 * GUTTER) / W, 1 - y / H])
    }
  }
  /** The uv rect for `url` once its image is drawn, else null (and the load is started). */
  get(url: string, now: number): UV | null {
    let i = this.cell.get(url)
    if (i === undefined) {
      i = 0
      for (let k = 1; k < CELLS; k++) if (this.touched[k] < this.touched[i]) i = k
      if (this.touched[i] === now) return null
      const old = this.owner[i]
      if (old) this.cell.delete(old)
      this.owner[i] = url
      this.loaded[i] = 0
      this.cell.set(url, i)
      const cell = i
      const img = new Image()
      img.decoding = 'async'
      img.onload = () => {
        if (!this.alive || this.owner[cell] !== url) return
        const w = CELL_W - 2 * GUTTER, h = CELL_H - 2 * GUTTER
        const sh = Math.min(img.height, img.width * (h / w))
        this.ctx.drawImage(img, 0, 0, img.width, sh, (cell % COLS) * CELL_W + GUTTER, Math.floor(cell / COLS) * CELL_H + GUTTER, w, h)
        this.loaded[cell] = 1
        this.dirty = true
        this.onLoad()
      }
      img.src = url
    }
    this.touched[i] = now
    return this.loaded[i] ? this.uvs[i] : null
  }
  /** Uploads pending draws; true when a later frame must upload again. */
  flush(now: number) {
    if (!this.dirty) return false
    if (now - this.uploaded < 120) return true
    this.texture.needsUpdate = true
    this.uploaded = now
    this.dirty = false
    return false
  }
  dispose() {
    this.alive = false
    this.texture.dispose()
  }
}

/** Writes the top face of a part (yawed, rolled) as quad `i`, the screenshot's top edge toward the part's back. */
function topQuad(g: BufferGeometry, i: number, x: number, y: number, z: number, hx: number, hz: number, yaw: number, roll: number, uv: UV) {
  const pos = g.getAttribute('position').array as Float32Array
  const tex = g.getAttribute('uv').array as Float32Array
  const cs = Math.cos(yaw), sn = Math.sin(yaw), cr = Math.cos(roll), sr = Math.sin(roll)
  for (let k = 0; k < 4; k++) {
    const ax = k === 0 || k === 3 ? -hx : hx
    const az = k < 2 ? hz : -hz
    const ry = -az * sr, rz = az * cr
    pos[i * 12 + k * 3] = x + ax * cs + rz * sn
    pos[i * 12 + k * 3 + 1] = y + ry
    pos[i * 12 + k * 3 + 2] = z - ax * sn + rz * cs
  }
  const t = i * 8
  tex[t] = uv[0]; tex[t + 1] = uv[1]
  tex[t + 2] = uv[2]; tex[t + 3] = uv[1]
  tex[t + 4] = uv[2]; tex[t + 5] = uv[3]
  tex[t + 6] = uv[0]; tex[t + 7] = uv[3]
}

/**
 * Every live part: one instanced body, pooled hairline edges, and screenshot
 * tops from one atlas. The keyboard's `focus` lifts and outlines its part the
 * way a hover does.
 */
export function Parts({ sim, lab, c, tip, guard, press, hits, focus }: {
  sim: Sim; lab: Lab; c: Look; tip: Tip; guard: Guard; press: Press; hits: ReadonlySet<string> | null; focus: { current: string | null }
}) {
  const invalidate = useThree((s) => s.invalidate)
  const bodies = useRef<InstancedMesh>(null)
  const edges = useSegments(CAP * 12, c.edge)
  const hotEdges = useSegments(64 * 12, c.accent)
  const linkEdges = useSegments(256 * 12, BRAND.pnpm)
  const atlas = useMemo(() => new TopAtlas(() => invalidate()), [invalidate])
  const tops = useMemo(() => {
    const solid = new Mesh(quadGeometry(TOP_CAP), new MeshBasicMaterial({ map: atlas.texture, toneMapped: false }))
    const ghost = new Mesh(quadGeometry(TOP_CAP), new MeshBasicMaterial({ map: atlas.texture, toneMapped: false, transparent: true, opacity: 0.45, depthWrite: false }))
    for (const m of [solid, ghost]) {
      m.frustumCulled = false
      m.raycast = () => {}
    }
    return { solid, ghost }
  }, [atlas])
  useEffect(
    () => () => {
      for (const m of [tops.solid, tops.ghost]) {
        m.geometry.dispose()
        m.material.dispose()
      }
      atlas.dispose()
    },
    [atlas, tops],
  )
  const seen = useRef({ version: -1, theme: '', hot: null as Part | null, ghosts: 0 })
  const order = useRef<Part[]>([])
  useLayoutEffect(() => {
    bodies.current!.boundingSphere = SCENE_SPHERE
  }, [])
  useFrame(() => {
    const m = bodies.current
    if (!m) return
    const s = seen.current
    let ghosts = 0
    for (const p of sim.live) if (p.ghost) ghosts++
    let recolor = s.theme !== c.bg
    if (s.version !== sim.liveVersion || s.ghosts !== ghosts) {
      s.version = sim.liveVersion
      s.ghosts = ghosts
      order.current = [...sim.live]
      recolor = true
    }
    const list = order.current
    s.theme = c.bg
    const w = segmentWriter(edges)
    const h = segmentWriter(hotEdges)
    const l = segmentWriter(linkEdges)
    const now = performance.now()
    const hot = s.hot ?? (focus.current ? sim.parts.get(focus.current) : undefined)
    let n = 0, solid = 0, ghost = 0
    for (const p of list) {
      if (n >= CAP) break
      const i = n++
      const lift = hot === p && (p.mode === 'home' || p.mode === 'board') ? 0.14 : 0
      const k = Math.max(0.001, p.scale)
      P.copy(p.pos)
      P.y += lift
      const roll = p.spin * 0.3 + Math.sin(sim.time * 22) * 0.16 * p.wob
      E.set(roll, p.rot + p.spin, 0, 'YXZ')
      m.setMatrixAt(i, M.compose(P, Q.setFromEuler(E), S.set(p.size[0] * k, p.size[1] * k, p.size[2] * k)))
      if (!p.visible || k < 0.01) m.setMatrixAt(i, M.makeScale(0, 0, 0))
      if (recolor) m.setColorAt(i, C.set(p.ghost ? c.board : tint(p.item.hue, c)))
      if (!p.visible || k < 0.01) continue
      const url = p.needsTexture && p.item.image ? (lab.theme === 'dark' ? (p.item.imageDark ?? p.item.image) : p.item.image) : null
      const uv = url ? atlas.get(url, now) : null
      if (uv) {
        if (p.ghost && ghost < TOP_CAP) topQuad(tops.ghost.geometry, ghost++, P.x, P.y + (p.size[1] / 2) * k + 0.003, P.z, (p.size[0] * k) / 2, (p.size[2] * k) / 2, p.rot + p.spin, roll, uv)
        else if (!p.ghost && solid < TOP_CAP) topQuad(tops.solid.geometry, solid++, P.x, P.y + (p.size[1] / 2) * k + 0.003, P.z, (p.size[0] * k) / 2, (p.size[2] * k) / 2, p.rot + p.spin, roll, uv)
      }
      const active = hot === p || p.mode === 'held' || p.mode === 'queued' || (!!hits && p.mode === 'board' && hits.has(p.item.ref))
      ;(p.ghost ? l : active ? h : w).box(P.x, P.y, P.z, (p.size[0] * k) / 2, (p.size[1] * k) / 2, (p.size[2] * k) / 2, p.rot + p.spin, roll)
    }
    m.count = n
    m.instanceMatrix.needsUpdate = true
    if (recolor && m.instanceColor) m.instanceColor.needsUpdate = true
    flushQuads(tops.solid.geometry, solid)
    flushQuads(tops.ghost.geometry, ghost)
    if (atlas.flush(now)) setTimeout(invalidate, 130)
    w.done()
    h.done()
    l.done()
  })
  const at = (e: { instanceId?: number }) => (e.instanceId !== undefined ? order.current[e.instanceId] : undefined)
  return (
    <>
      <instancedMesh
        ref={bodies}
        args={[undefined, fillMat('#ffffff'), CAP]}
        frustumCulled={false}
        onPointerDown={(e) => {
          press.part = at(e) ?? null
        }}
        onClick={(e) => {
          e.stopPropagation()
          const p = at(e)
          if (!p || guard.moved) return
          seen.current.hot = null
          tip.hide()
          lab.toggle(p.item.ref)
        }}
        onPointerMove={(e) => {
          e.stopPropagation()
          const p = at(e)
          if (!p || e.pointerType === 'touch') return
          if (seen.current.hot !== p) {
            seen.current.hot = p
            play('tick')
            const selected = lab.selected.has(p.item.ref)
            const how = p.ghost ? 'hard link from the pnpm silo' : p.mark === 'drone' ? 'welded by Claude Code' : p.mark === 'walker' ? 'etched by Codex' : p.mark === 'arm' ? 'seated by the arm' : p.mode === 'home' ? p.code : 'in transit'
            tip.show(e.nativeEvent, p.item.title, `${p.item.label} · ${how} · ${selected ? 'click to send back' : 'click to build'}`)
          }
          tip.move(e.nativeEvent)
        }}
        onPointerOut={() => {
          seen.current.hot = null
          tip.hide()
        }}
      >
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>
      <primitive object={edges} />
      <primitive object={hotEdges} />
      <primitive object={linkEdges} />
      <primitive object={tops.solid} />
      <primitive object={tops.ghost} />
    </>
  )
}
