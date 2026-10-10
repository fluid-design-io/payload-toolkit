import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  BoxGeometry, BufferAttribute, BufferGeometry, CanvasTexture, Color, DynamicDrawUsage, EdgesGeometry, Group, InstancedBufferAttribute, InstancedMesh,
  LineSegments as ThreeLineSegments, Matrix4, Mesh, MeshBasicMaterial, Plane, PlaneGeometry, Quaternion, SRGBColorSpace, Vector3,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import type { Guard } from '../../kit/touch'

import type { CatalogItem } from '../../../../workspace/-workspace/workspace.types'
import type { Lab } from '../../lab.types'
import { cabinetArt, matArt, meterArt } from './art'
import { ACCENT, FONT, Hairline, canvasTexture, damp, fit, tint } from './kit'
import type { Colors, Mat, Tip } from './kit'
import { ARM, BELT, BENCH, BOARD, BY, CAB, CAB_INVERSE, CAB_MATRIX, LAMP, METER, drawerLocal, drawerMatrix, ik2, scaraSolve, scrollDrawer, tileLocal, tileVisible } from './model'
import type { Sim } from './model'
import { BENCH_SPHERE } from './parts'
import type { Cam } from './parts'

function Statics({ build, edge, position, rough }: { build: (h: Hairline) => void; edge: string; position?: [number, number, number]; rough?: number }) {
  const mesh = useMemo(() => {
    const h = new Hairline()
    build(h)
    return h.build(edge, rough)
  }, [build, edge, rough])
  useEffect(() => () => { mesh.geometry.dispose(); (mesh.children[0] as Mesh).geometry.dispose() }, [mesh])
  return <primitive object={mesh} position={position} />
}

export function BenchMat({ mat, c }: { mat: Mat; c: Colors }) {
  const tex = useMemo(() => matArt(mat, c), [mat, c])
  useEffect(() => () => tex.dispose(), [tex])
  const shadow = useMemo(
    () =>
      canvasTexture(512, 512, (ctx) => {
        const g = ctx.createRadialGradient(256, 256, 120, 256, 256, 256)
        g.addColorStop(0, 'rgba(0,0,0,0.5)')
        g.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.fillStyle = g
        ctx.fillRect(0, 0, 512, 512)
      }),
    [],
  )
  const dark = c.dark
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[(BENCH.x0 + BENCH.x1) / 2, 0, (BENCH.z0 + BENCH.z1) / 2]}>
        <planeGeometry args={[BENCH.x1 - BENCH.x0, BENCH.z1 - BENCH.z0]} />
        <meshBasicMaterial map={tex} toneMapped={false} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[(BOARD.x0 + BOARD.x1) / 2 + 0.3, 0.002, (BOARD.z0 + BOARD.z1) / 2 + 0.4]}>
        <planeGeometry args={[BOARD.x1 - BOARD.x0 + 2.4, BOARD.z1 - BOARD.z0 + 2.4]} />
        <meshBasicMaterial map={shadow} transparent opacity={dark ? 0.7 : 0.32} depthWrite={false} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[CAB.pivot.x, 0.002, CAB.pivot.z - 1.0]}>
        <planeGeometry args={[CAB.W + 2.2, 5.6]} />
        <meshBasicMaterial map={shadow} transparent opacity={dark ? 0.6 : 0.28} depthWrite={false} />
      </mesh>
    </group>
  )
}

/** Width of the label that lies on the mat in front of an open drawer. */
const TAG_W = 2.6
const T_CW = 340, T_CH = 192, T_COLS = 3, T_ROWS = 6, T_W = T_CW * T_COLS, T_H = T_CH * T_ROWS, T_CELLS = T_COLS * T_ROWS

/** Thumbnails for the tiles in the open drawer: an 18-cell atlas (six rows of three, like the drawer), one draw, images loaded lazily per cell. */
class ThumbAtlas {
  canvas = document.createElement('canvas')
  ctx: CanvasRenderingContext2D
  texture: CanvasTexture
  cells = new Map<string, number>()
  images = new Map<string, HTMLImageElement>()
  constructor() {
    this.canvas.width = T_W
    this.canvas.height = T_H
    this.ctx = this.canvas.getContext('2d')!
    this.texture = new CanvasTexture(this.canvas)
    this.texture.colorSpace = SRGBColorSpace
    this.texture.flipY = false
    this.texture.anisotropy = 8
  }
  rect(slot: number) {
    const x = (slot % T_COLS) * T_CW, y = Math.floor(slot / T_COLS) * T_CH
    return [x / T_W, (y + T_CH) / T_H, T_CW / T_W, -T_CH / T_H] as const
  }
  draw(slot: number, item: CatalogItem, image: string | undefined, c: Colors) {
    const x = (slot % T_COLS) * T_CW, y = Math.floor(slot / T_COLS) * T_CH
    const ctx = this.ctx
    const paint = (img: HTMLImageElement | null) => {
      ctx.save()
      ctx.beginPath()
      ctx.rect(x, y, T_CW, T_CH)
      ctx.clip()
      ctx.fillStyle = tint(item.hue, c, c.l + (c.dark ? -14 : 22))
      ctx.fillRect(x, y, T_CW, T_CH)
      if (img) {
        const ratio = Math.max(T_CW / img.width, (T_CH - 45) / img.height)
        ctx.drawImage(img, x, y, img.width * ratio, img.height * ratio)
      }
      ctx.fillStyle = c.surface
      ctx.fillRect(x, y + T_CH - 45, T_CW, 45)
      ctx.fillStyle = c.fg
      ctx.font = `500 23px ${FONT}`
      ctx.textBaseline = 'middle'
      ctx.fillText(fit(ctx, item.title, T_CW - 30), x + 14, y + T_CH - 22)
      ctx.fillStyle = tint(item.hue, c)
      ctx.fillRect(x, y + T_CH - 45, 5, 45)
      ctx.restore()
      this.texture.needsUpdate = true
    }
    const ready = image ? this.images.get(image) : undefined
    if (ready) return paint(ready)
    paint(null)
    if (!image) return
    const img = new Image()
    img.onload = () => {
      this.images.set(image, img)
      if (this.cells.get(item.ref) === slot) paint(img)
    }
    img.src = image
  }
}

function atlasMaterial(map: CanvasTexture, planes: Plane[]) {
  const m = new MeshBasicMaterial({ map, toneMapped: false, clippingPlanes: planes, transparent: true })
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 uvRect;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvMapUv = uvRect.xy + uv * uvRect.zw;')
  }
  return m
}

const m4 = new Matrix4(), v3 = new Vector3(), s3 = new Vector3(), tileScale = new Vector3(), qid = new Quaternion(), col = new Color()
const flat = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2)

export function Cabinet({ sim, lab, c, cam, tip, version, guard, onPage, onDrawer }: {
  sim: Sim; lab: Lab; c: Colors; cam: Cam; tip: Tip; version: number; guard: Guard; onPage: () => void; onDrawer: (aisle: number) => void
}) {
  const n = CAB.cols * CAB.rows
  const drawers = useRef<InstancedMesh>(null)
  const fronts = useRef<InstancedMesh>(null)
  const tiles = useRef<InstancedMesh>(null)
  const thumbs = useRef<InstancedMesh>(null)
  const label = useRef<Mesh>(null)
  const [thumbAtlas] = useState(() => new ThumbAtlas())
  useEffect(() => () => thumbAtlas.texture.dispose(), [thumbAtlas])
  const query = lab.focus.query.trim().toLowerCase()
  const matches = useMemo(() => {
    if (!query) return null
    return sim.aisles.map((a) => a.racks.reduce((s, r) => s + r.bins.filter((b) => `${b.item.title} ${b.item.label} ${b.item.ref}`.toLowerCase().includes(query)).length, 0))
  }, [sim.aisles, query])
  const labels = useMemo(() => {
    const t = cabinetArt(sim.aisles, matches, sim.drawer.aisle, c)
    t.flipY = false
    return t
  }, [sim.aisles, matches, sim.drawer.aisle, c])
  useEffect(() => () => labels.dispose(), [labels])
  const planes = useMemo(() => [new Plane(new Vector3(0, 0, 1), CAB.d - 0.12), new Plane(new Vector3(0, 0, -1), -0.12)], [])
  const frontGeo = useMemo(() => {
    const g = new PlaneGeometry(CAB.w, CAB.h)
    const attr = new InstancedBufferAttribute(new Float32Array(n * 4), 4)
    for (let i = 0; i < n; i++) {
      const col = i % CAB.cols, row = Math.floor(i / CAB.cols)
      attr.setXYZW(i, (col * CAB.pitchX + 0.06) / CAB.W, (0.08 + row * CAB.pitchY + 0.025 + CAB.h) / CAB.H, CAB.w / CAB.W, -CAB.h / CAB.H)
    }
    g.setAttribute('uvRect', attr)
    return g
  }, [n])
  const frontMat = useMemo(() => atlasMaterial(labels, []), [labels])
  useEffect(() => () => frontMat.dispose(), [frontMat])
  const thumbGeo = useMemo(() => {
    const g = new PlaneGeometry(CAB.tile.pitch * 0.84, CAB.tile.pitch * 0.63)
    const attr = new InstancedBufferAttribute(new Float32Array(T_CELLS * 4), 4)
    attr.setUsage(DynamicDrawUsage)
    g.setAttribute('uvRect', attr)
    return g
  }, [])
  const thumbMat = useMemo(() => atlasMaterial(thumbAtlas.texture, planes), [thumbAtlas, planes])
  const tray = useMemo(() => {
    const t = 0.04
    const parts = [
      new BoxGeometry(CAB.w, t, CAB.d).translate(0, -CAB.h / 2 + t / 2, -CAB.d / 2),
      new BoxGeometry(t, CAB.h, CAB.d).translate(-CAB.w / 2 + t / 2, 0, -CAB.d / 2),
      new BoxGeometry(t, CAB.h, CAB.d).translate(CAB.w / 2 - t / 2, 0, -CAB.d / 2),
      new BoxGeometry(CAB.w, CAB.h, t).translate(0, 0, -CAB.d + t / 2),
      new BoxGeometry(CAB.w, CAB.h, 0.07).translate(0, 0, -0.035),
    ]
    const merged = mergeGeometries(parts)!
    parts.forEach((p) => p.dispose())
    const edge = new EdgesGeometry(new BoxGeometry(CAB.w, CAB.h, CAB.d).translate(0, 0, -CAB.d / 2))
    return { geo: merged, edge }
  }, [])
  const shell = useMemo(
    () => (h: Hairline) => {
      const { W, H, D } = CAB
      h.box([W, 0.08, D], [0, 0.04, -D / 2], c.surface).box([W, 0.08, D], [0, H - 0.04, -D / 2], c.surface)
      h.box([0.08, H, D], [-W / 2 + 0.04, H / 2, -D / 2], c.surface).box([0.08, H, D], [W / 2 - 0.04, H / 2, -D / 2], c.surface)
      h.box([W, H, 0.08], [0, H / 2, -D + 0.04], c.surface)
      for (let r = 1; r < CAB.rows; r++) h.box([W - 0.16, 0.04, D - 0.1], [0, 0.08 + r * CAB.pitchY - 0.01, -D / 2], c.surface)
      for (let k = 1; k < CAB.cols; k++) h.box([0.04, H - 0.16, D - 0.1], [(k - CAB.cols / 2) * CAB.pitchX, H / 2, -D / 2], c.surface)
    },
    [c.surface],
  )
  const plinth = useMemo(
    () => (h: Hairline) => {
      const back = -CAB.D * Math.cos(CAB.tilt) + CAB.pivot.z
      h.box([CAB.W, CAB.pivot.y - 0.02, 0.5], [CAB.pivot.x, (CAB.pivot.y - 0.02) / 2, CAB.pivot.z - 0.22], c.surface)
      h.box([CAB.W, 0.12, CAB.pivot.z - 0.46 - back], [CAB.pivot.x, 0.06, (CAB.pivot.z - 0.46 + back) / 2], c.surface)
    },
    [c.surface],
  )
  useEffect(() => () => { tray.geo.dispose(); tray.edge.dispose(); frontGeo.dispose(); thumbGeo.dispose(); thumbMat.dispose() }, [tray, frontGeo, thumbGeo, thumbMat])
  const hover = useRef(-1)
  const seen = useRef({ version: -1, c: null as Colors | null })
  const edgeBuf = useMemo(() => {
    const count = tray.edge.getAttribute('position').count
    const pos = new Float32Array(n * count * 3)
    const geo = new BufferGeometry()
    geo.setAttribute('position', new BufferAttribute(pos, 3).setUsage(DynamicDrawUsage))
    return { geo, pos, count }
  }, [n, tray])
  useEffect(() => () => edgeBuf.geo.dispose(), [edgeBuf])
  const localM = useMemo(() => new Matrix4(), [])
  const closingM = useMemo(() => new Matrix4(), [])
  const last = useRef({ open: -1, closing: -1, scroll: -1, aisle: -2, hover: -2, version: -1, query: '', c: null as Colors | null, meshes: [] as (InstancedMesh | null)[] })
  useFrame(() => {
    const D = drawers.current, F = fronts.current, T = tiles.current, TH = thumbs.current
    if (!D || !F || !T || !TH) return
    const open = sim.drawer.aisle
    const L = last.current
    const closing = sim.drawer.closing ? sim.drawer.closing.open : -1
    const remounted = L.meshes[0] !== D || L.meshes[1] !== F || L.meshes[2] !== T || L.meshes[3] !== TH
    const drawersMoved = remounted || L.open !== sim.drawer.open || L.closing !== closing || L.aisle !== open || L.c !== c
    const tilesMoved = drawersMoved || L.scroll !== sim.drawer.scroll || L.hover !== hover.current || L.version !== version || L.query !== query
    if (!tilesMoved) return
    Object.assign(L, { open: sim.drawer.open, closing, scroll: sim.drawer.scroll, aisle: open, hover: hover.current, version, query, c, meshes: [D, F, T, TH] })
    if (drawersMoved) {
      const edgeBase = tray.edge.getAttribute('position')
      const out = edgeBuf.pos
      let w = 0
      for (let i = 0; i < n; i++) {
        const d = drawerLocal(i)
        if (i === open) localM.copy(CAB_INVERSE).multiply(sim.drawer.matrix)
        else if (sim.drawer.closing?.aisle === i) localM.copy(CAB_INVERSE).multiply(drawerMatrix(i, sim.drawer.closing.open, closingM))
        else localM.makeTranslation(d.x, d.y, 0)
        D.setMatrixAt(i, localM)
        col.set(i === open ? c.sub : c.surface)
        D.setColorAt(i, col)
        F.setMatrixAt(i, m4.makeTranslation(0, 0, 0.001).premultiply(localM))
        for (let k = 0; k < edgeBuf.count; k++) {
          v3.set(edgeBase.getX(k), edgeBase.getY(k), edgeBase.getZ(k)).applyMatrix4(localM)
          out[w++] = v3.x; out[w++] = v3.y; out[w++] = v3.z
        }
      }
      edgeBuf.geo.getAttribute('position').needsUpdate = true
      D.instanceMatrix.needsUpdate = true
      if (D.instanceColor) D.instanceColor.needsUpdate = true
      F.instanceMatrix.needsUpdate = true
    }
    const items = sim.drawer.items
    let t = 0
    if (seen.current.version !== version || seen.current.c !== c) {
      seen.current.version = version
      seen.current.c = c
      thumbAtlas.cells.clear()
    }
    const attr = TH.geometry.getAttribute('uvRect') as InstancedBufferAttribute
    const M = sim.drawer.matrix
    planes[0].set(v3.set(0, 0, 1), CAB.d - 0.12).applyMatrix4(M)
    planes[1].set(v3.set(0, 0, -1), -0.12).applyMatrix4(M)
    if (open >= 0) {
      for (let k = 0; k < items.length && t < T_CELLS; k++) {
        tileLocal(k, sim.drawer.scroll, v3)
        if (!(v3.z < 0.3 && v3.z > -(CAB.d + 0.3))) continue
        const item = items[k]
        const row = Math.floor(k / CAB.tile.cols)
        const slot = (row % T_ROWS) * T_COLS + (k % CAB.tile.cols)
        if (thumbAtlas.cells.get(item.ref) !== slot) {
          for (const [ref, sl] of thumbAtlas.cells) if (sl === slot) thumbAtlas.cells.delete(ref)
          thumbAtlas.cells.set(item.ref, slot)
          thumbAtlas.draw(slot, item, lab.theme === 'dark' ? (item.imageDark ?? item.image) : item.image, c)
        }
        const out = sim.parts.has(item.ref)
        const match = !query || `${item.title} ${item.label} ${item.ref}`.toLowerCase().includes(query)
        const lift = k === hover.current ? 0.05 : 0
        const x = v3.x, y = v3.y + lift, z = v3.z
        m4.compose(s3.set(x, y + 0.02, z), qid, tileScale.set(CAB.tile.pitch * 0.86, out ? 0.012 : 0.05, CAB.tile.pitch * 0.66)).premultiply(M)
        T.setMatrixAt(t, m4)
        col.set(out ? c.dim : k === hover.current ? ACCENT : match ? tint(item.hue, c) : c.dim)
        T.setColorAt(t, col)
        m4.compose(s3.set(x, y + (out ? 0.028 : 0.047), z), flat, tileScale.set(out ? 0.001 : 1, out ? 0.001 : 1, 1)).premultiply(M)
        TH.setMatrixAt(t, m4)
        const r = thumbAtlas.rect(slot)
        attr.setXYZW(t, r[0], r[1], r[2], r[3])
        t++
      }
    }
    T.count = t
    TH.count = t
    T.instanceMatrix.needsUpdate = true
    if (T.instanceColor) T.instanceColor.needsUpdate = true
    TH.instanceMatrix.needsUpdate = true
    attr.needsUpdate = true
    if (label.current) {
      label.current.visible = open >= 0 && sim.drawer.open > 0.85
      label.current.matrix.makeTranslation(0, -CAB.h / 2 + 0.006, 0.42).premultiply(M)
      label.current.matrix.multiply(m4.makeRotationX(-Math.PI / 2))
    }
  })
  const tileAt = (e: { instanceId?: number }) => {
    if (e.instanceId === undefined) return null
    let t = 0
    for (let k = 0; k < sim.drawer.items.length; k++) {
      tileLocal(k, sim.drawer.scroll, v3)
      if (!(v3.z < 0.3 && v3.z > -(CAB.d + 0.3))) continue
      if (t === e.instanceId) return tileVisible(v3.z) ? { k, item: sim.drawer.items[k] } : null
      t++
    }
    return null
  }
  const image = (item: CatalogItem) => (lab.theme === 'dark' ? (item.imageDark ?? item.image) : item.image)
  const rows = Math.ceil(sim.drawer.items.length / CAB.tile.cols)
  const pageLabel = useMemo(() => {
    const aisle = sim.drawer.aisle >= 0 ? sim.aisles[sim.drawer.aisle] : null
    if (!aisle) return null
    const from = Math.round(sim.drawer.scrollTarget) * CAB.tile.cols + 1
    const to = Math.min(sim.drawer.items.length, (Math.round(sim.drawer.scrollTarget) + CAB.tile.rowsVisible) * CAB.tile.cols)
    return canvasTexture(640, 128, (ctx) => {
      ctx.fillStyle = c.fg
      ctx.font = `600 58px ${FONT}`
      ctx.textBaseline = 'middle'
      ctx.fillText(fit(ctx, aisle.label.toUpperCase(), 360), 8, 64)
      ctx.fillStyle = c.muted
      ctx.textAlign = 'right'
      ctx.font = `500 46px ${FONT}`
      ctx.fillText(sim.drawer.items.length ? `${from}–${to} / ${sim.drawer.items.length}` : query ? 'no match' : 'empty', 632, 64)
    })
  }, [sim.drawer.aisle, sim.drawer.scrollTarget, sim.drawer.items.length, sim.aisles, c, version, query])
  useEffect(() => () => pageLabel?.dispose(), [pageLabel])
  return (
    <group>
      <Statics build={plinth} edge={c.edge} />
      <group matrix={CAB_MATRIX} matrixAutoUpdate={false}>
        <Statics build={shell} edge={c.edge} />
        <instancedMesh
          ref={(m) => {
            drawers.current = m
            if (m) m.boundingSphere = BENCH_SPHERE
          }}
          args={[tray.geo, undefined, n]}
          frustumCulled={false}
          onPointerMove={(e) => {
            if (e.instanceId === undefined) return
            e.stopPropagation()
            const aisle = sim.aisles[e.instanceId]
            if (!aisle) { tip.hide(); return }
            tip.show(e.nativeEvent, aisle.label, `Drawer ${String(e.instanceId + 1).padStart(2, '0')} · ${aisle.count.toLocaleString()} parts · ${aisle.racks.length} ${aisle.racks.length === 1 ? 'registry' : 'registries'} · ${e.instanceId === sim.drawer.aisle ? 'click to put back' : 'click to pull'}`)
            tip.move(e.nativeEvent)
          }}
          onPointerOut={() => tip.hide()}
          onClick={(e) => {
            if (e.instanceId === undefined || !sim.aisles[e.instanceId]) return
            e.stopPropagation()
            if (guard.moved) return
            onDrawer(e.instanceId)
          }}
        >
          <meshStandardMaterial roughness={0.9} />
        </instancedMesh>
        <lineSegments geometry={edgeBuf.geo} frustumCulled={false} raycast={() => null}>
          <lineBasicMaterial color={c.edge} />
        </lineSegments>
        <instancedMesh ref={fronts} args={[frontGeo, frontMat, n]} frustumCulled={false} raycast={() => null} />
      </group>
      <instancedMesh
        ref={(m) => {
          tiles.current = m
          if (m) m.boundingSphere = BENCH_SPHERE
        }}
        args={[undefined, undefined, T_CELLS]}
        frustumCulled={false}
        onPointerDown={(e) => {
          const hit = tileAt(e)
          if (hit) cam.pressed = hit.item.ref
        }}
        onPointerMove={(e) => {
          const hit = tileAt(e)
          if (!hit) return
          e.stopPropagation()
          if (hover.current !== hit.k) {
            hover.current = hit.k
            cam.hovered = null
            cam.pageDrawer = rows > CAB.tile.rowsVisible ? (n) => { scrollDrawer(sim, n); onPage() } : null
            tip.show(e.nativeEvent, hit.item.title, `${hit.item.label} · ${sim.parts.has(hit.item.ref) ? 'on the board' : 'click to place'}`, image(hit.item))
          }
          tip.move(e.nativeEvent)
        }}
        onPointerOut={() => { hover.current = -1; cam.pageDrawer = null; tip.hide() }}
        onClick={(e) => {
          const hit = tileAt(e)
          if (!hit) return
          e.stopPropagation()
          if (guard.moved) return
          sim.lastClickAt = sim.time
          cam.trayAt = sim.time
          cam.manual = false
          tip.hide()
          hover.current = -1
          lab.toggle(hit.item.ref)
        }}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.8} clippingPlanes={planes} />
      </instancedMesh>
      <instancedMesh ref={thumbs} args={[thumbGeo, thumbMat, T_CELLS]} frustumCulled={false} raycast={() => null} />
      <mesh ref={label} matrixAutoUpdate={false} visible={false} raycast={() => null}>
        <planeGeometry args={[TAG_W, TAG_W * (128 / 640)]} />
        <meshBasicMaterial map={pageLabel ?? undefined} visible={!!pageLabel} transparent toneMapped={false} depthWrite={false} />
      </mesh>
    </group>
  )
}

export function Belt({ c, still }: { c: Colors; still: boolean }) {
  const slats = useRef<InstancedMesh>(null)
  const len = BELT.z0 - BELT.z1 + 0.9
  const n = 26
  const mid = (BELT.z0 + BELT.z1) / 2
  useFrame(({ clock }) => {
    const m = slats.current
    if (!m) return
    const offset = still ? 0 : (clock.elapsedTime * BELT.speed) % (len / n)
    for (let i = 0; i < n; i++) {
      m4.makeTranslation(BELT.x, BELT.y - 0.01, BELT.z0 + 0.45 - (((i * len) / n + offset) % len))
      m.setMatrixAt(i, m4)
    }
    m.instanceMatrix.needsUpdate = true
  })
  const build = useMemo(
    () => (h: Hairline) => {
      h.box([BELT.w, 0.3, len], [BELT.x, BELT.y - 0.17, mid], c.surface)
      for (const dx of [-BELT.w / 2 - 0.04, BELT.w / 2 + 0.04]) h.box([0.07, 0.14, len + 0.1], [BELT.x + dx, BELT.y + 0.02, mid], c.surface)
      for (const z of [BELT.z0 + 0.2, BELT.z1 - 0.2]) h.box([0.12, BELT.y - 0.32, 0.12], [BELT.x, (BELT.y - 0.32) / 2, z], c.surface)
      for (const z of [BELT.z0 + 0.45, BELT.z1 - 0.45]) h.cyl(0.14, 0.14, BELT.w + 0.1, [BELT.x, BELT.y - 0.12, z], c.surface, [0, 0, Math.PI / 2], 16)
    },
    [c.surface, len, mid],
  )
  return (
    <group>
      <Statics build={build} edge={c.edge} />
      <instancedMesh ref={slats} args={[undefined, undefined, n]} frustumCulled={false}>
        <boxGeometry args={[BELT.w - 0.1, 0.01, 0.02]} />
        <meshBasicMaterial color={c.edge} />
      </instancedMesh>
    </group>
  )
}

/** A desktop SCARA on a rail: the carriage slides along the board's top edge, two links swing flat over the bench and a quill drops to place. */
export function Scara({ sim, c }: { sim: Sim; c: Colors }) {
  const carriage = useRef<Group>(null)
  const shoulder = useRef<Group>(null)
  const elbow = useRef<Group>(null)
  useFrame(() => {
    const { baseX, t1, t2 } = scaraSolve(sim.arm.pos)
    if (carriage.current) carriage.current.position.x = baseX
    if (shoulder.current) shoulder.current.rotation.y = t1
    if (elbow.current) elbow.current.rotation.y = t2 - t1
  })
  const rail = useMemo(
    () => (h: Hairline) => {
      const len = ARM.rail.x1 - ARM.rail.x0 + 1.2
      const mid = (ARM.rail.x0 + ARM.rail.x1) / 2
      h.box([len, 0.26, 0.55], [mid, 0.45, ARM.rail.z], c.surface)
      h.box([len, 0.06, 0.08], [mid, 0.6, ARM.rail.z + 0.2], c.pin, [0, 0, 0], false)
      h.box([len, 0.06, 0.08], [mid, 0.6, ARM.rail.z - 0.2], c.pin, [0, 0, 0], false)
      for (const x of [ARM.rail.x0 - 0.3, mid, ARM.rail.x1 + 0.3]) h.box([0.7, 0.32, 0.9], [x, 0.16, ARM.rail.z], c.surface)
    },
    [c.surface, c.pin],
  )
  const car = useMemo(
    () => (h: Hairline) => {
      h.box([1.5, 0.5, 1.0], [0, 0.85, 0], c.surface)
      h.cyl(0.42, 0.5, ARM.h - 1.1, [0, (ARM.h + 1.1) / 2 - 0.1, 0], c.surface, [0, 0, 0], 24)
    },
    [c.surface],
  )
  const upper = useMemo(() => (h: Hairline) => { h.cyl(0.56, 0.56, 0.5, [0, ARM.h, 0], c.surface, [0, 0, 0], 24).box([ARM.L1, 0.32, 0.84], [ARM.L1 / 2, ARM.h, 0], c.surface) }, [c.surface])
  const fore = useMemo(
    () => (h: Hairline) => {
      h.cyl(0.44, 0.44, 0.44, [0, 0, 0], c.surface, [0, 0, 0], 24).box([ARM.L2, 0.24, 0.62], [ARM.L2 / 2, 0, 0], c.surface)
      h.box([0.56, 0.66, 0.56], [ARM.L2, 0.16, 0], c.surface).cyl(0.22, 0.22, 0.4, [ARM.L2, 0, 0], c.surface, [0, 0, 0], 16)
    },
    [c.surface],
  )
  return (
    <group>
      <Statics build={rail} edge={c.edge} />
      <group ref={carriage} position={[ARM.rail.x0 + 2, 0, ARM.rail.z]}>
        <Statics build={car} edge={c.edge} />
        <group ref={shoulder}>
          <Statics build={upper} edge={c.edge} />
          <group ref={elbow} position={[ARM.L1, ARM.h - 0.36, 0]}>
            <Statics build={fore} edge={c.edge} />
          </group>
        </group>
      </group>
      <Nozzle sim={sim} c={c} />
    </group>
  )
}

function Nozzle({ sim, c }: { sim: Sim; c: Colors }) {
  const g = useRef<Group>(null)
  const edge = useRef<ThreeLineSegments>(null)
  const quill = useRef<Mesh>(null)
  useFrame(() => {
    if (!g.current) return
    const p = sim.arm.pos
    g.current.position.copy(p)
    if (edge.current) (edge.current.material as MeshBasicMaterial).color.set(sim.arm.holding ? ACCENT : c.edge)
    const len = Math.max(0.1, ARM.h - 0.1 - p.y - 0.32)
    if (quill.current) {
      quill.current.scale.y = len
      quill.current.position.y = 0.32 + len / 2
    }
  })
  const geo = useMemo(() => {
    const cyl = new BoxGeometry(0.22, 0.32, 0.22).translate(0, 0.16, 0)
    return { cyl, edge: new EdgesGeometry(cyl, 30) }
  }, [])
  return (
    <group ref={g}>
      <group position={[0, 0, 0]}>
        <mesh geometry={geo.cyl}>
          <meshStandardMaterial color={c.surface} />
        </mesh>
        <lineSegments ref={edge} geometry={geo.edge}>
          <lineBasicMaterial color={c.edge} />
        </lineSegments>
      </group>
      <mesh ref={quill}>
        <cylinderGeometry args={[0.09, 0.09, 1, 10]} />
        <meshStandardMaterial color={c.pin} metalness={0.4} roughness={0.5} />
      </mesh>
    </group>
  )
}

/** The magnifier lamp: clamped beside the board, two links swing flat over the bench and the ring hangs over the chip in focus, lighting a circle under it. */
export function Lamp({ cam, c, still }: { cam: Cam; c: Colors; still: boolean }) {
  const shoulder = useRef<Group>(null)
  const elbow = useRef<Group>(null)
  const head = useRef<Group>(null)
  const pool = useRef<Mesh>(null)
  const target = useMemo(() => LAMP.park.clone(), [])
  const chip = useMemo(() => new Vector3(), [])
  const glow = useRef(0)
  const poolTex = useMemo(
    () =>
      canvasTexture(256, 256, (ctx) => {
        const g = ctx.createRadialGradient(128, 128, 20, 128, 128, 128)
        g.addColorStop(0, 'rgba(255,244,214,0.95)')
        g.addColorStop(0.55, 'rgba(255,240,200,0.45)')
        g.addColorStop(1, 'rgba(255,236,190,0)')
        ctx.fillStyle = g
        ctx.fillRect(0, 0, 256, 256)
      }),
    [],
  )
  useFrame((_, dt) => {
    const want = cam.lamp
    const rate = still ? 60 : 3.2
    if (want) {
      target.lerp(want.head, damp(dt, rate))
      chip.lerp(want.chip, damp(dt, rate))
    } else target.lerp(LAMP.park, damp(dt, rate))
    glow.current += ((want ? 1 : 0) - glow.current) * damp(dt, still ? 60 : 4)
    const { t1, t2 } = ik2(target.x - LAMP.clamp.x, -(target.z - LAMP.clamp.z), LAMP.L1, LAMP.L2, -1)
    if (shoulder.current) shoulder.current.rotation.y = t1
    if (elbow.current) elbow.current.rotation.y = t2 - t1
    if (head.current) {
      head.current.rotation.y = -t2
      head.current.position.y = target.y - LAMP.post
    }
    if (pool.current) {
      pool.current.visible = glow.current > 0.02
      pool.current.position.set(chip.x, BY + 0.008, chip.z)
      const m = pool.current.material as MeshBasicMaterial
      m.opacity = glow.current * (c.dark ? 0.55 : 0.5)
      pool.current.scale.setScalar(LAMP.ring * 2.6)
    }
  })
  const clamp = useMemo(
    () => (h: Hairline) => {
      h.box([1.0, 0.45, 1.3], [LAMP.clamp.x, 0.22, LAMP.clamp.z], c.surface)
      h.cyl(0.13, 0.15, LAMP.post, [LAMP.clamp.x, LAMP.post / 2, LAMP.clamp.z], c.surface, [0, 0, 0], 14)
    },
    [c.surface],
  )
  const upper = useMemo(() => (h: Hairline) => { h.cyl(0.24, 0.24, 0.4, [0, 0, 0], c.surface, [0, 0, 0], 18).box([LAMP.L1, 0.2, 0.2], [LAMP.L1 / 2, 0, 0], c.surface) }, [c.surface])
  const fore = useMemo(() => (h: Hairline) => { h.cyl(0.24, 0.24, 0.4, [0, 0, 0], c.surface, [0, 0, 0], 18).box([LAMP.L2, 0.16, 0.16], [LAMP.L2 / 2, 0, 0], c.surface) }, [c.surface])
  const ring = useMemo(
    () => (h: Hairline) => {
      h.cyl(0.08, 0.08, 1.0, [0, -0.5, 0], c.surface, [0, 0, 0], 10, false)
      h.cyl(LAMP.ring + 0.16, LAMP.ring + 0.16, 0.16, [0, -1.0, 0], c.surface, [0, 0, 0], 48, true, 60, true)
      h.cyl(LAMP.ring + 0.02, LAMP.ring + 0.02, 0.16, [0, -1.0, 0], c.surface, [0, 0, 0], 48, true, 60, true)
    },
    [c.surface],
  )
  return (
    <group>
      <Statics build={clamp} edge={c.edge} />
      <group ref={shoulder} position={[LAMP.clamp.x, LAMP.post, LAMP.clamp.z]}>
        <Statics build={upper} edge={c.edge} />
        <group ref={elbow} position={[LAMP.L1, 0, 0]}>
          <Statics build={fore} edge={c.edge} />
          <group ref={head} position={[LAMP.L2, 0, 0]}>
            <group position={[LAMP.ring + 0.25, 0, 0]}>
              <Statics build={ring} edge={c.edge} />
              <mesh rotation-x={-Math.PI / 2} position={[0, -0.98, 0]} raycast={() => null}>
                <circleGeometry args={[LAMP.ring, 40]} />
                <meshBasicMaterial color={c.dark ? '#9FD5F0' : '#DDEFF8'} transparent opacity={0.14} depthWrite={false} />
              </mesh>
            </group>
          </group>
        </group>
      </group>
      <mesh ref={pool} rotation-x={-Math.PI / 2} visible={false}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial map={poolTex} transparent depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  )
}

export function Props({ count, line2, c }: { count: number; line2: string; c: Colors }) {
  const display = useMemo(() => meterArt(count, line2, c), [count, line2, c])
  useEffect(() => () => display.dispose(), [display])
  const build = useMemo(
    () => (h: Hairline) => {
      h.box([METER.w, METER.h, METER.d], [METER.x, METER.h / 2, METER.z], c.surface)
      h.cyl(0.42, 0.42, 0.08, [METER.x, METER.h + 0.04, METER.z + 0.72], c.surface, [0, 0, 0], 24)
      h.box([0.08, 0.04, 0.5], [METER.x, METER.h + 0.09, METER.z + 0.6], c.edge, [0, 0.6, 0], false)
      for (const dx of [-0.45, -0.15, 0.15, 0.45]) h.cyl(0.07, 0.07, 0.1, [METER.x + dx, METER.h + 0.05, METER.z + 1.2], dx > 0 ? '#CB3837' : '#1D2225', [0, 0, 0], 10, false)
      const tw = { x: -10.4, z: 7.0, a: 0.35 }
      for (const side of [-1, 1]) {
        const ang = tw.a + side * 0.05
        h.box([3.4, 0.05, 0.14], [tw.x + Math.cos(ang) * 1.6 + side * Math.sin(ang) * 0.09, 0.05, tw.z - Math.sin(ang) * 1.6 + side * Math.cos(ang) * 0.09], c.pin, [0, ang, 0])
      }
      h.cyl(0.85, 0.85, 0.5, [-6.4, 0.25, 8.0], c.surface, [0, 0, 0], 32)
      h.cyl(0.3, 0.3, 0.52, [-6.4, 0.25, 8.0], c.surface, [0, 0, 0], 16, true, 60)
      h.cyl(0.9, 0.9, 0.06, [-6.4, 0.53, 8.0], c.pin, [0, 0, 0], 32, false)
      const wire: Vector3[] = []
      for (let i = 0; i < 40; i++) {
        const t = i / 40, t2 = (i + 1) / 40
        const f = (u: number) => new Vector3(-6.4 + 0.85 * Math.cos(u * 4) + u * 3.2, 0.03 + Math.sin(u * 20) * 0.01, 8.0 + 0.85 * Math.sin(u * 4) - u * 0.8)
        wire.push(f(t), f(t2))
      }
      h.segs(wire)
    },
    [c.surface, c.edge, c.pin],
  )
  return (
    <group>
      <Statics build={build} edge={c.edge} />
      <mesh position={[METER.x, METER.h + 0.002, METER.z - 0.55]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[1.55, 0.87]} />
        <meshBasicMaterial map={display} toneMapped={false} />
      </mesh>
    </group>
  )
}
