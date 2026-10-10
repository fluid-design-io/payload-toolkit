import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  BoxGeometry, BufferGeometry, CanvasTexture, Color, DynamicDrawUsage, Float32BufferAttribute, InstancedBufferAttribute, InstancedMesh,
  LineSegments as ThreeLineSegments, Matrix4, Mesh, MeshBasicMaterial, PlaneGeometry, Quaternion, SRGBColorSpace, Sphere, Vector3,
} from 'three'
import type { Texture } from 'three'

import type { Guard } from '../../kit/touch'

import type { CatalogItem } from '../../../../workspace/-workspace/workspace.types'
import type { Lab } from '../../lab.types'
import { dieArt, drawMarking } from './art'
import type { Ids } from './art'
import { ACCENT, Lines, damp, reducedMotion } from './kit'
import type { Colors, Tip } from './kit'
import { BY } from './model'
import type { Part, Sim, Spec } from './model'

export type Cam = {
  hovered: string | null
  focus: string | null
  decap: number
  decapTarget: number
  seenAdd: number
  manual: boolean
  orbit: { az: number; el: number; zoom: number }
  /** Set while the pointer rests on a drawer that has more rows than it shows; the wheel pages it instead of zooming. */
  pageDrawer: ((rows: number) => void) | null
  lamp: { head: Vector3; chip: Vector3 } | null
  mode: string
  /** True while the pose still eases toward its target; the frame governor reads it. */
  moving: boolean
  /** The chip or tray item under the last press, for long-press details on touch. */
  pressed: string | null
  /** Portrait viewport: the bench runs top to bottom. */
  portrait: boolean
  /** Phones keep the drawer shot a while after each pick, so tray tiles stay large enough to tap. */
  holdTray: boolean
  trayAt: number
}

export const createCam = (): Cam => ({
  hovered: null, focus: null, decap: 0, decapTarget: 0, seenAdd: -99, manual: false, orbit: { az: 0, el: 0, zoom: 1 }, pageDrawer: null, lamp: null, mode: '',
  moving: true, pressed: null, portrait: false, holdTray: false, trayAt: -99,
})

/** Instances move every frame, so raycasts test against one sphere around the whole bench instead of a sphere three.js would cache from the first frame. */
export const BENCH_SPHERE = new Sphere(new Vector3(0, 0, 0), 60)

const standoff = (spec: Spec) => (spec.pkg === 'qfp' || spec.pkg === 'soic' ? 0.03 : spec.pkg === 'dip' ? 0.06 : 0)
export const chipTop = (spec: Spec) => standoff(spec) + spec.h

type PinBox = { x: number; y: number; z: number; sx: number; sy: number; sz: number }
const pinCache = new Map<string, PinBox[]>()
function pinsOf(spec: Spec) {
  const key = `${spec.pkg}-${spec.w}-${spec.d}`
  const hit = pinCache.get(key)
  if (hit) return hit
  const out: PinBox[] = []
  const add = (sx: number, sy: number, sz: number, x: number, y: number, z: number) => out.push({ x, y, z, sx, sy, sz })
  const so = standoff(spec)
  const side = (len: number, axis: 'x' | 'z', sign: number, edge: number) => {
    const n = Math.max(3, Math.floor(len / 0.1))
    const pitch = len / n
    const t = 0.028
    for (let i = 0; i < n; i++) {
      const u = -len / 2 + (i + 0.5) * pitch
      const place = (along: number, outw: number, sx: number, sy: number, y: number) =>
        axis === 'z' ? add(sx, sy, along, u, y, sign * (edge + outw)) : add(along, sy, sx, sign * (edge + outw), y, u)
      if (spec.pkg === 'qfn') place(0.07, 0, t * 1.4, 0.02, 0.01)
      else if (spec.pkg === 'dip') {
        place(0.1, 0.05, t * 1.6, 0.03, so + spec.h * 0.35)
        place(0.03, 0.1, t * 1.6, so + spec.h * 0.35 + 0.05, (so + spec.h * 0.35 - 0.05) / 2)
      } else {
        const l = spec.lead
        place(l * 0.55, l * 0.27, t, 0.025, so + spec.h * 0.45)
        place(0.025, l * 0.55, t, so + spec.h * 0.45, (so + spec.h * 0.45) / 2)
        place(l * 0.45, l * 0.78, t, 0.022, 0.011)
      }
    }
  }
  if (spec.pkg === 'qfp' || spec.pkg === 'qfn') {
    for (const sign of [-1, 1]) {
      side(spec.w * 0.84, 'z', sign, spec.d / 2)
      side(spec.d * 0.84, 'x', sign, spec.w / 2)
    }
  } else if (spec.pkg === 'soic' || spec.pkg === 'dip') for (const sign of [-1, 1]) side(spec.w * 0.86, 'z', sign, spec.d / 2)
  else if (spec.pkg === 'passive') {
    add(0.12, spec.h + 0.01, spec.d + 0.01, -spec.w / 2 + 0.06, spec.h / 2, 0)
    add(0.12, spec.h + 0.01, spec.d + 0.01, spec.w / 2 - 0.06, spec.h / 2, 0)
  } else {
    for (let i = 0; i < 10; i++) for (const r of [-1, 1]) add(0.05, 0.42, 0.05, -1.0 + i * 0.1, 0.21, r * 0.05 + 0.4)
    add(1.1, 0.12, 0.22, -0.55, 0.06, 0.4)
    add(spec.w * 0.56, 0.2, spec.d * 0.72, spec.w * 0.12, 0.58, 0)
  }
  pinCache.set(key, out)
  return out
}

const PAGE_W = 2048, PAGE_H = 2048, CELL_W = 512, CELL_H = 256
const COLS = PAGE_W / CELL_W, ROWS = PAGE_H / CELL_H
export const CELLS = COLS * ROWS

/** One 2048² marking atlas: 32 laser-marked lids in a single draw. A frame that marks several chips uploads it once. */
class Atlas {
  canvas = document.createElement('canvas')
  ctx: CanvasRenderingContext2D
  texture: CanvasTexture
  constructor() {
    this.canvas.width = PAGE_W
    this.canvas.height = PAGE_H
    this.ctx = this.canvas.getContext('2d')!
    this.texture = new CanvasTexture(this.canvas)
    this.texture.colorSpace = SRGBColorSpace
    this.texture.flipY = false
    this.texture.anisotropy = 8
  }
  /** Draws the marking in the cell at the chip's aspect and returns its uv rect (u0, v0, du, dv). */
  draw(slot: number, item: CatalogItem, ids: Ids, spec: Spec, body: string, ink: string) {
    const aspect = spec.w / spec.d
    const w = aspect >= 2 ? CELL_W : Math.round(CELL_H * aspect)
    const h = aspect >= 2 ? Math.round(CELL_W / aspect) : CELL_H
    const x = (slot % COLS) * CELL_W, y = Math.floor(slot / COLS) * CELL_H
    this.ctx.clearRect(x, y, CELL_W, CELL_H)
    drawMarking(this.ctx, x, y, w, h, item, ids, spec, body, ink)
    this.texture.needsUpdate = true
    return [x / PAGE_W, (y + h) / PAGE_H, w / PAGE_W, -h / PAGE_H] as const
  }
  dispose() {
    this.texture.dispose()
  }
}

function lidMaterial(map: Texture) {
  const m = new MeshBasicMaterial({ map, transparent: true, toneMapped: false })
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 uvRect;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvMapUv = uvRect.xy + uv * uvRect.zw;')
  }
  return m
}

type Unit = { key: string; part: Part | null; item: CatalogItem; spec: Spec; pos: Vector3; scale: number; ghost: boolean; ids: Ids }

const m4 = new Matrix4(), m4b = new Matrix4(), q = new Quaternion(), tilt = new Quaternion(), v3 = new Vector3(), s3 = new Vector3(), color = new Color()
const UP = new Vector3(0, 1, 0), Z = new Vector3(0, 0, 1)
const QID = new Quaternion()
const flat = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2)

const settled = (p: Part) => !p.fly && p.mode === 'seated' && p.flash <= 0 && (!p.slot || (Math.abs(p.scale - p.slot.s) < 1e-4 && Math.abs(p.pos.x - p.slot.x) + Math.abs(p.pos.y - p.slot.y) + Math.abs(p.pos.z - p.slot.z) < 1e-4))

/**
 * Every chip on the bench in a handful of draws: one instanced body box, one
 * instanced pin box, one instanced lid plane per 32 markings, one LineSegments
 * for all hairline edges and highlight rings, plus a single decapped die.
 * Instances are rewritten only on frames where something moved or a highlight changed.
 */
export function PartsLayer({ sim, lab, c, cam, tip, ids, onFocus, version, guard }: {
  sim: Sim; lab: Lab; c: Colors; cam: Cam; tip: Tip; ids: (ref: string) => Ids; onFocus: (ref: string) => void; version: number; guard: Guard
}) {
  const bodies = useRef<InstancedMesh>(null)
  const pins = useRef<InstancedMesh>(null)
  const edges = useRef<ThreeLineSegments>(null)
  const corners = useRef<ThreeLineSegments>(null)
  const dieMesh = useRef<Mesh>(null)
  const wires = useRef<ThreeLineSegments>(null)
  const [capacity, setCapacity] = useState({ units: 64, pins: 2048 })
  const [pages, setPages] = useState<number[]>([0])
  const lidRefs = useRef<(InstancedMesh | null)[]>([])
  const atlases = useRef<Atlas[]>([])
  const state = useRef({
    cells: new Map<string, number>(), drawn: new Map<string, string>(), uv: new Map<string, readonly [number, number, number, number]>(), die: null as Texture | null, dieFor: '', wireFor: '',
    units: [] as Unit[], version: -1, c: null as Colors | null, hovered: null as string | null, focus: null as string | null, query: '', queryRaw: '', agent: '', capacity: 0, lidCount: [] as number[],
  })
  const lines = useMemo(() => ({ edge: new Lines(true), corner: new Lines(false) }), [])
  const geo = useMemo(() => ({ box: new BoxGeometry(1, 1, 1), plane: new PlaneGeometry(1, 1), wire: new BufferGeometry() }), [])
  useEffect(() => () => { geo.box.dispose(); geo.plane.dispose(); geo.wire.dispose(); lines.edge.geo.dispose(); lines.corner.geo.dispose(); atlases.current.forEach((a) => a.dispose()) }, [geo, lines])
  const lidMats = useMemo(() => new Map<number, MeshBasicMaterial>(), [])
  useEffect(() => () => lidMats.forEach((m) => m.dispose()), [lidMats])

  const atlas = (page: number) => {
    while (atlases.current.length <= page) atlases.current.push(new Atlas())
    return atlases.current[page]
  }
  const image = (item: CatalogItem) => (lab.theme === 'dark' ? (item.imageDark ?? item.image) : item.image)

  useFrame(({ clock }, dt) => {
    const st = state.current
    let dirty = false
    if (st.version !== version) {
      st.version = version
      dirty = true
      const list: Unit[] = []
      for (const p of sim.parts.values()) list.push({ key: p.item.ref, part: p, item: p.item, spec: p.spec, pos: p.pos, scale: p.scale, ghost: false, ids: ids(p.item.ref) })
      sim.layout.ghosts.forEach((g, i) => {
        const item = { title: `existing ${g.title}`, hue: 210, source: 'your-app', ref: `ghost:${i}`, description: '', kind: 'block', category: 'block:other', label: 'Existing', name: g.title } as CatalogItem
        list.push({ key: item.ref, part: null, item, spec: g.spec, pos: new Vector3(g.slot.x, g.slot.y, g.slot.z), scale: g.slot.s, ghost: true, ids: { code: 'OWNED', refdes: `X${i + 1}` } })
      })
      const live = new Set(list.map((u) => u.key))
      for (const key of [...st.cells.keys()]) if (!live.has(key)) { st.cells.delete(key); st.drawn.delete(key); st.uv.delete(key) }
      const taken = new Set(st.cells.values())
      for (const u of list) {
        if (st.cells.has(u.key)) continue
        let cell = 0
        while (taken.has(cell)) cell++
        taken.add(cell)
        st.cells.set(u.key, cell)
      }
      st.units = list
      const needPages = Math.max(1, Math.ceil((Math.max(-1, ...taken) + 1) / CELLS))
      if (needPages > pages.length) setPages(Array.from({ length: needPages }, (_, i) => i))
      const needUnits = list.length
      let needPins = 0
      for (const u of list) needPins += pinsOf(u.spec).length
      if (needUnits > capacity.units || needPins > capacity.pins) setCapacity({ units: Math.max(capacity.units, needUnits * 2), pins: Math.max(capacity.pins, needPins * 2) })
    }
    if (st.c !== c) { st.c = c; st.drawn.clear(); dirty = true }
    if (st.queryRaw !== lab.focus.query) { st.queryRaw = lab.focus.query; st.query = lab.focus.query.trim().toLowerCase(); dirty = true }
    if (st.hovered !== cam.hovered || st.focus !== cam.focus || st.agent !== lab.setup.agent || st.capacity !== capacity.units + capacity.pins + pages.length) {
      st.hovered = cam.hovered; st.focus = cam.focus; st.agent = lab.setup.agent; st.capacity = capacity.units + capacity.pins + pages.length
      dirty = true
    }
    const decapping = Math.abs(cam.decapTarget - cam.decap) > 0.001
    cam.decap = decapping ? cam.decap + (cam.decapTarget - cam.decap) * (reducedMotion ? 1 : damp(dt, 4)) : cam.decapTarget
    if (decapping) dirty = true
    if (!dirty) for (const u of st.units) if (u.part && !settled(u.part)) { dirty = true; break }
    const B = bodies.current, P = pins.current
    if (corners.current) (corners.current.material as MeshBasicMaterial).opacity = reducedMotion ? 0.85 : 0.55 + Math.sin(clock.elapsedTime * 8) * 0.45
    if (!B || !P || !dirty) return
    const units = st.units
    const query = st.query
    let pin = 0
    const lidCount = st.lidCount
    for (let i = 0; i < pages.length; i++) lidCount[i] = 0
    let decapUnit: Unit | null = null
    lines.edge.begin(units.length * 32)
    lines.corner.begin(units.length * 16)
    const n = Math.min(units.length, capacity.units)
    for (let i = 0; i < n; i++) {
      const u = units[i]
      const p = u.part
      const pos = p ? p.pos : u.pos, scale = p ? p.scale : u.scale, yaw = p ? p.yaw : 0
      const spec = u.spec
      const so = standoff(spec)
      const cell = st.cells.get(u.key)!
      const page = Math.floor(cell / CELLS), slot = cell % CELLS
      const drawKey = `${cell}|${u.ids.refdes}`
      if (st.drawn.get(u.key) !== drawKey) {
        st.drawn.set(u.key, drawKey)
        st.uv.set(u.key, atlas(page).draw(slot, u.item, u.ids, spec, u.ghost ? c.ghost : spec.pkg === 'passive' ? (spec.c > 0.5 ? c.body : '#C8A87E') : c.body, u.ghost ? c.muted : c.ink))
      }
      q.setFromAxisAngle(UP, yaw)
      m4.compose(pos, q, s3.setScalar(Math.max(0.001, scale)))
      const module = spec.pkg === 'module'
      const bw = spec.w, bh = module ? 0.06 : spec.h, bd = spec.d, by = module ? 0.45 : so + spec.h / 2
      m4b.compose(v3.set(0, by, 0), QID, s3.set(bw, bh, bd)).premultiply(m4)
      B.setMatrixAt(i, m4b)
      color.set(u.ghost ? c.ghost : module ? c.sub : spec.pkg === 'passive' ? (spec.c > 0.5 ? c.body : '#C8A87E') : c.body)
      B.setColorAt(i, color)
      for (const b of pinsOf(spec)) {
        if (pin >= capacity.pins) break
        m4b.compose(v3.set(b.x, b.y, b.z), QID, s3.set(b.sx, b.sy, b.sz)).premultiply(m4)
        P.setMatrixAt(pin++, m4b)
      }
      const lid = lidRefs.current[page]
      const uv = st.uv.get(u.key)
      if (lid && uv && spec.pkg !== 'passive') {
        const k = lidCount[page]++
        const open = cam.focus === u.key ? cam.decap : 0
        const lidY = module ? 0.682 : so + spec.h + 0.003
        const lidW = module ? spec.w * 0.54 : spec.w * 0.97, lidD = module ? spec.d * 0.7 : spec.d * 0.97
        const lx = module ? spec.w * 0.12 : 0
        tilt.setFromAxisAngle(Z, open * 0.55).multiply(flat)
        m4b.compose(v3.set(lx + open * spec.w * 0.9, lidY + open * 0.5, 0), tilt, s3.set(lidW, lidD, 1)).premultiply(m4)
        lid.setMatrixAt(k, m4b)
        const attr = lid.geometry.getAttribute('uvRect') as InstancedBufferAttribute
        attr.setXYZW(k, uv[0], uv[1], uv[2], uv[3])
        attr.needsUpdate = true
        if (open > 0.02) decapUnit = u
      }
      const hot = cam.hovered === u.key || cam.focus === u.key || p?.mode === 'carry' || p?.mode === 'lift'
      const match = !!query && !u.ghost && `${u.item.title} ${u.item.label}`.toLowerCase().includes(query)
      const flash = p ? p.flash : 0
      color.set(flash > 0 ? (lab.setup.agent === 'codex' ? c.fg : '#D97757') : hot || match ? ACCENT : u.ghost ? c.edge : c.bodyEdge)
      const e = lines.edge
      const hw = bw / 2, hd = bd / 2, y0 = by - bh / 2, y1 = by + bh / 2
      for (let k = 0; k < 4; k++) {
        const y = k < 2 ? y0 : y1, z = k % 2 ? hd : -hd
        pt(e, m4, -hw, y, z); pt(e, m4, hw, y, z)
        const x = k < 2 ? -hw : hw, z2 = k % 2 ? hd : -hd
        pt(e, m4, x, y0, z2); pt(e, m4, x, y1, z2)
        const x3 = k < 2 ? -hw : hw, y3 = k % 2 ? y1 : y0
        pt(e, m4, x3, y3, -hd); pt(e, m4, x3, y3, hd)
      }
      if (hot || match || flash > 0) {
        const fw = spec.fw / 2 + 0.08, fd = spec.fd / 2 + 0.08, y = 0.012
        pt(e, m4, -fw, y, -fd); pt(e, m4, fw, y, -fd); pt(e, m4, fw, y, -fd); pt(e, m4, fw, y, fd); pt(e, m4, fw, y, fd); pt(e, m4, -fw, y, fd); pt(e, m4, -fw, y, fd); pt(e, m4, -fw, y, -fd)
      }
      if (p && p.slot && p.mode !== 'seated' && p.mode !== 'return' && p.mode !== 'lift') {
        const s = p.slot
        const w = (spec.fw * s.s) / 2 + 0.08, d = (spec.fd * s.s) / 2 + 0.08
        const y = s.y + 0.01
        const kk = 0.18 * s.s + 0.06
        for (const [x, z, dx, dz] of CORNERS) {
          const cx = s.x + x * w, cz = s.z + z * d
          lines.corner.push(cx, y, cz); lines.corner.push(cx + dx * kk, y, cz)
          lines.corner.push(cx, y, cz); lines.corner.push(cx, y, cz + dz * kk)
        }
      }
    }
    B.count = n
    B.instanceMatrix.needsUpdate = true
    if (B.instanceColor) B.instanceColor.needsUpdate = true
    P.count = pin
    P.instanceMatrix.needsUpdate = true
    for (let page = 0; page < lidRefs.current.length; page++) {
      const lid = lidRefs.current[page]
      if (!lid) continue
      lid.count = lidCount[page] ?? 0
      lid.instanceMatrix.needsUpdate = true
    }
    lines.edge.end()
    lines.corner.end()
    if (edges.current) edges.current.visible = lines.edge.n > 0
    if (corners.current) corners.current.visible = lines.corner.n > 0
    const die = dieMesh.current, wire = wires.current
    if (die && wire) {
      const u = decapUnit as Unit | null
      die.visible = !!u && !!st.die && st.dieFor === u.key
      wire.visible = !!u && cam.decap > 0.3
      if (u) {
        if (st.dieFor !== u.key) {
          st.dieFor = u.key
          st.die = null
          void dieArt(image(u.item), u.item.hue, u.item.title).then((t) => { if (st.dieFor === u.key) st.die = t })
        }
        const mat = die.material as MeshBasicMaterial
        if (st.die && mat.map !== st.die) { mat.map = st.die; mat.needsUpdate = true }
        const p = u.part
        const pos = p ? p.pos : u.pos, scale = p ? p.scale : u.scale
        const size = Math.min(u.spec.w, u.spec.d) * 0.78
        die.position.copy(pos).setY(pos.y + (standoff(u.spec) + u.spec.h + 0.002) * scale)
        die.scale.setScalar(size * scale)
        wire.position.copy(die.position)
        wire.scale.setScalar(scale)
        if (st.wireFor !== u.key) {
          st.wireFor = u.key
          geo.wire.setAttribute('position', new Float32BufferAttribute(bondWires(u.spec, size), 3))
        }
      }
    }
  })

  const at = (e: { instanceId?: number }) => (e.instanceId !== undefined ? state.current.units[e.instanceId] : undefined)
  return (
    <group>
      <instancedMesh
        ref={(m) => {
          bodies.current = m
          if (m) m.boundingSphere = BENCH_SPHERE
        }}
        key={`b${capacity.units}`}
        args={[geo.box, undefined, capacity.units]}
        frustumCulled={false}
        onPointerDown={(e) => {
          const u = at(e)
          if (u && !u.ghost) cam.pressed = u.key
        }}
        onPointerMove={(e) => {
          const u = at(e)
          if (!u) return
          e.stopPropagation()
          if (cam.hovered !== u.key) {
            cam.hovered = u.key
            const p = u.part
            tip.show(e.nativeEvent, u.item.title, u.ghost ? 'Existing code · untouched by the toolkit' : `${u.ids.refdes} · ${u.ids.code} · ${u.item.label} · ${p?.mode === 'seated' ? 'click to inspect' : p?.mode ?? ''}`, u.ghost ? undefined : image(u.item))
          }
          tip.move(e.nativeEvent)
        }}
        onPointerOut={() => { cam.hovered = null; tip.hide() }}
        onClick={(e) => {
          const u = at(e)
          if (!u || u.ghost || !u.part) return
          e.stopPropagation()
          if (guard.moved) return
          tip.hide()
          if (u.part.mode === 'seated') onFocus(u.key)
          else lab.toggle(u.key)
        }}
      >
        <meshStandardMaterial roughness={0.85} />
      </instancedMesh>
      <instancedMesh ref={pins} key={`p${capacity.pins}`} args={[geo.box, undefined, capacity.pins]} frustumCulled={false} raycast={() => null}>
        <meshStandardMaterial color={c.pin} metalness={0.5} roughness={0.45} />
      </instancedMesh>
      {pages.map((page) => (
        <Lids key={page} page={page} geo={geo.plane} mats={lidMats} texture={atlas(page).texture} refs={lidRefs} />
      ))}
      <lineSegments ref={edges} geometry={lines.edge.geo} frustumCulled={false} raycast={() => null}>
        <lineBasicMaterial vertexColors />
      </lineSegments>
      <lineSegments ref={corners} geometry={lines.corner.geo} frustumCulled={false} raycast={() => null}>
        <lineBasicMaterial color={ACCENT} transparent />
      </lineSegments>
      <mesh ref={dieMesh} rotation-x={-Math.PI / 2} visible={false} raycast={() => null}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial toneMapped={false} />
      </mesh>
      <lineSegments ref={wires} geometry={geo.wire} visible={false} frustumCulled={false} raycast={() => null}>
        <lineBasicMaterial color="#D8B865" />
      </lineSegments>
    </group>
  )
}

const CORNERS = [[-1, -1, 1, 1], [1, -1, -1, 1], [1, 1, -1, -1], [-1, 1, 1, -1]] as const

/** One local-space vertex of a chip's edge cage, in the colour set for the current chip. */
function pt(e: Lines, m: Matrix4, x: number, y: number, z: number) {
  v3.set(x, y, z).applyMatrix4(m)
  e.push(v3.x, v3.y, v3.z, color)
}

function bondWires(spec: Spec, size: number) {
  const pts: number[] = []
  const n = 7
  for (let sd = 0; sd < 4; sd++) {
    if ((spec.pkg === 'soic' || spec.pkg === 'dip') && sd >= 2) continue
    for (let i = 0; i < n; i++) {
      const t = -size / 2 + ((i + 0.5) / n) * size
      const a = sd < 2 ? [t, 0, (sd ? 1 : -1) * size * 0.5] : [(sd === 3 ? 1 : -1) * size * 0.5, 0, t]
      const b = sd < 2 ? [t * 1.3, 0, (sd ? 1 : -1) * spec.d * 0.47] : [(sd === 3 ? 1 : -1) * spec.w * 0.47, 0, t * 1.3]
      const m = [a[0] + (b[0] - a[0]) * 0.4, size * 0.18, a[2] + (b[2] - a[2]) * 0.4]
      pts.push(...a, ...m, ...m, ...b)
    }
  }
  return pts
}

function Lids({ page, geo, mats, texture, refs }: { page: number; geo: PlaneGeometry; mats: Map<number, MeshBasicMaterial>; texture: Texture; refs: { current: (InstancedMesh | null)[] } }) {
  const geometry = useMemo(() => {
    const g = geo.clone()
    const attr = new InstancedBufferAttribute(new Float32Array(CELLS * 4), 4)
    attr.setUsage(DynamicDrawUsage)
    g.setAttribute('uvRect', attr)
    return g
  }, [geo])
  const material = useMemo(() => {
    let m = mats.get(page)
    if (!m) { m = lidMaterial(texture); mats.set(page, m) }
    return m
  }, [mats, page, texture])
  useEffect(() => () => geometry.dispose(), [geometry])
  return <instancedMesh ref={(m) => { refs.current[page] = m }} args={[geometry, material, CELLS]} frustumCulled={false} raycast={() => null} />
}

export const seatedY = BY
