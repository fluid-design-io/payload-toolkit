import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { BoxGeometry, BufferGeometry, Color, Float32BufferAttribute, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, Quaternion, Vector3 } from 'three'
import type { ThreeEvent } from '@react-three/fiber'

import type { CatalogItem } from '../../../../workspace/-workspace/workspace.types'
import { play } from '../../kit/sound'
import type { Guard } from '../../kit/touch'
import type { Lab } from '../../lab.types'
import { MONO, canvasTexture } from './art'
import { Assembly } from './hairline'
import type { Prim } from './hairline'
import { ACCENT, pocket, specOf, trayScale } from './model'
import type { Sim, Spec, TrayLayout } from './model'
import type { Cam, Colors, Tip } from './scene'

/** Pocket labels the scene may position at once; phones get a smaller pool. */
export const LABEL_POOL = 96
export const LABEL_POOL_PHONE = 24
/** A finger needs this many pixels per pocket before a tap toggles a part; below it a tap opens the aisle or zooms in. */
const TAP_PX = 24
/** DOM nodes the scene positions every frame: one header per tray section and a pool of pocket labels. */
export type TrayOverlay = { headers: { current: (HTMLDivElement | null)[] }; labels: { current: (HTMLDivElement | null)[] }; top: number; panel: { right: number; bottom: number } }

const specs = new Map<string, Spec>()
function specCache(item: CatalogItem) {
  let s = specs.get(item.ref)
  if (!s) specs.set(item.ref, (s = specOf(item)))
  return s
}
const tint = (hue: number, c: Colors) => `hsl(${hue}, ${c.s}%, ${c.l + (c.dark ? -6 : 12)}%)`

/** The pocket whose pitch cell contains the world point, or -1. */
function pocketAt(tray: TrayLayout, x: number, z: number) {
  const half = tray.pitch / 2
  for (let i = 0; i < tray.items.length; i++) if (Math.abs(tray.at[i * 2] - x) <= half && Math.abs(tray.at[i * 2 + 1] - z) <= half) return i
  return -1
}
const sectionOf = (tray: TrayLayout, i: number) => {
  for (const sec of tray.sections) if (i >= sec.first && i < sec.first + sec.count) return sec
  return null
}

export function Tray({ sim, lab, c, tip, cam, codeOf, overlay, guard, touch }: { sim: Sim; lab: Lab; c: Colors; tip: Tip; cam: Cam; codeOf: (ref: string) => string; overlay: TrayOverlay; guard: Guard; touch: boolean }) {
  const mesh = useRef<InstancedMesh>(null)
  const baked = useRef<Mesh>(null)
  const tray = sim.tray
  const n = tray.items.length
  const capacity = useMemo(() => Math.max(64, n), [n])
  const shown = useRef({ version: -1, query: '', raw: '', tray, hover: -1, theme: '', mesh: null as InstancedMesh | null })
  const hover = useRef(-1)
  const pocketPx = useRef(0)
  const { camera, size } = useThree()
  const scratch = useMemo(() => ({ v: new Vector3(), mat: new Matrix4(), q: new Quaternion(), pos: new Vector3(), scl: new Vector3(), col: new Color(), px: 0, py: 0 }), [])
  const geometry = useMemo(() => {
    const cube = new BoxGeometry(1, 1, 1)
    if (tray.pitch >= 0.35) return cube
    const index = cube.getIndex()!
    cube.setIndex([...index.array].slice(12, 18))
    return cube
  }, [tray.pitch])
  useEffect(() => () => geometry.dispose(), [geometry])
  const { x0: X0, x1: X1, z0: Z0, z1: Z1, y: Y } = tray.box
  const TW = X1 - X0, TD = Z1 - Z0
  /** Projects a tray point to canvas pixels in `scratch.px`, `scratch.py`. */
  const project = useMemo(() => (x: number, z: number) => {
    const v = scratch.v.set(x, Y + 0.05, z).project(camera)
    scratch.px = ((v.x + 1) / 2) * size.width
    scratch.py = ((1 - v.y) / 2) * size.height
  }, [scratch, camera, size, Y])

  const matches = (item: CatalogItem, query: string) => !query || `${item.title} ${item.label} ${item.ref}`.toLowerCase().includes(query)
  const paint = (m: InstancedMesh, i: number, query: string, match: boolean) => {
    const { col } = scratch
    if (i === hover.current || (query && match)) col.set(ACCENT)
    else if (!match) col.set(c.dim)
    else col.set(tint(tray.items[i].hue, c))
    m.setColorAt(i, col)
  }
  useFrame(() => {
    const m = mesh.current
    if (!m) return
    const s = shown.current
    if (s.version !== sim.version || s.raw !== lab.focus.query || s.tray !== tray || s.theme !== c.bg || s.mesh !== m) {
      const query = lab.focus.query.trim().toLowerCase()
      Object.assign(s, { version: sim.version, query, raw: lab.focus.query, tray, hover: hover.current, theme: c.bg, mesh: m })
      const { mat, q, pos, scl } = scratch
      for (let i = 0; i < n; i++) {
        const item = tray.items[i]
        const spec = specCache(item)
        const k = trayScale(tray, spec)
        pocket(tray, i, pos)
        const out = sim.parts.has(item.ref)
        const match = matches(item, query)
        scl.set(out ? 0 : spec.w * k, Math.max(0.03, spec.h * Math.max(k, 0.5)), out ? 0 : spec.d * k)
        pos.y += scl.y / 2 + (query && !out && match ? 0.12 : 0)
        m.setMatrixAt(i, mat.compose(pos, q, scl))
        paint(m, i, query, match)
      }
      m.count = n
      m.instanceMatrix.needsUpdate = true
      if (m.instanceColor) m.instanceColor.needsUpdate = true
    } else if (s.hover !== hover.current) {
      const was = s.hover
      s.hover = hover.current
      for (const i of [was, s.hover]) if (i >= 0 && i < n) paint(m, i, s.query, matches(tray.items[i], s.query))
      if (m.instanceColor) m.instanceColor.needsUpdate = true
    }

    project(X0, Z0)
    const ax = scratch.px, ay = scratch.py
    project(X0 + tray.pitch, Z0)
    const bx = scratch.px, by = scratch.py
    project(X0, Z0 + tray.pitch)
    const px = Math.hypot(bx - ax, by - ay)
    pocketPx.current = Math.min(px, Math.hypot(scratch.px - ax, scratch.py - ay))

    const showHeaders = px > 34
    const headers = overlay.headers.current
    for (let i = 0; i < tray.sections.length; i++) {
      const sec = tray.sections[i]
      const el = headers[i]
      if (!el) continue
      if (!showHeaders) {
        if (el.style.opacity !== '0') { el.style.opacity = '0'; el.style.pointerEvents = 'none' }
        continue
      }
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
      for (let k = 0; k < 4; k++) {
        project(k & 1 ? sec.x1 : sec.x0, k & 2 ? sec.z1 : sec.z0)
        minX = Math.min(minX, scratch.px); maxX = Math.max(maxX, scratch.px)
        minY = Math.min(minY, scratch.py); maxY = Math.max(maxY, scratch.py)
      }
      const onScreen = maxY > overlay.top && minY < size.height && maxX > 0 && minX < size.width
      if (!onScreen) {
        if (el.style.opacity !== '0') { el.style.opacity = '0'; el.style.pointerEvents = 'none' }
        continue
      }
      project(sec.x0, sec.z0 + sec.head * 0.5)
      const hx = scratch.px, hy = scratch.py
      const y = Math.min(Math.max(hy - 10, overlay.top), maxY - 24)
      let x = Math.min(Math.max(hx - 6, 12), Math.max(12, maxX - el.offsetWidth - 12))
      if (x < overlay.panel.right && y < overlay.panel.bottom && maxX > overlay.panel.right + el.offsetWidth) x = overlay.panel.right
      el.style.transform = `translate(${x}px, ${y}px)`
      el.style.opacity = '1'
      el.style.pointerEvents = 'auto'
      el.dataset.stuck = y > hy - 9 || x > hx - 5 ? '1' : '0'
    }
    if (baked.current) {
      const mat = baked.current.material as MeshBasicMaterial
      mat.opacity += ((showHeaders ? 0 : 1) - mat.opacity) * 0.2
      baked.current.visible = mat.opacity > 0.02
    }
    const labels = overlay.labels.current
    const pool = labels.length
    let used = 0
    if (px > 44) {
      for (let i = 0; i < n && used < pool; i++) {
        const item = tray.items[i]
        if (sim.parts.has(item.ref)) continue
        project(tray.at[i * 2], tray.at[i * 2 + 1] + tray.pitch * 0.5)
        const x = scratch.px, y = scratch.py
        if (x < -40 || x > size.width + 40 || y < overlay.top || y > size.height + 20) continue
        const el = labels[used++]
        if (!el) break
        el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`
        el.style.opacity = '1'
        el.style.width = `${Math.max(40, px * 0.96)}px`
        el.style.fontSize = `${Math.min(12, Math.max(9, px * 0.13))}px`
        if (el.dataset.ref !== item.ref) {
          el.dataset.ref = item.ref
          el.textContent = item.title
        }
      }
    }
    for (let i = used; i < pool; i++) {
      const el = labels[i]
      if (el && el.style.opacity !== '0') el.style.opacity = '0'
    }
  })

  const headerTex = useMemo(() => {
    const S = 1024 / TW
    return canvasTexture(1024, Math.round(TD * S), (ctx) => {
      ctx.fillStyle = c.muted
      ctx.font = `600 ${Math.min(26, 0.3 * S)}px ${MONO}`
      ctx.fillText(`FEEDER BANK · ${n.toLocaleString()} PARTS · ${tray.sections.length} AISLES`, 0.1 * S, (TD - 0.12) * S)
      for (const sec of tray.sections) {
        const hh = sec.head
        const w = (sec.x1 - sec.x0) * S
        const size = Math.min(hh * S * 0.62, Math.max(14, w * 0.11))
        const x = (sec.x0 - X0) * S
        const y = (sec.z0 - Z0 + hh * 0.76) * S
        ctx.globalAlpha = c.dark ? 0.28 : 0.2
        ctx.fillStyle = `hsl(${sec.hue} 45% ${c.dark ? 50 : 58}%)`
        ctx.fillRect(x - 2, (sec.z0 - Z0) * S, w + 4, (hh - 0.06) * S)
        ctx.font = `600 ${size}px ${MONO}`
        ctx.fillStyle = c.fg
        ctx.globalAlpha = 0.9
        const count = sec.count.toLocaleString()
        const room = w - ctx.measureText(` ${count}`).width
        let label = `${sec.code} ${sec.label.toUpperCase()}`
        while (label.length > 4 && ctx.measureText(label).width > room) label = `${label.slice(0, -2)}…`
        ctx.textAlign = 'left'
        ctx.fillText(label, x, y)
        ctx.textAlign = 'right'
        ctx.fillStyle = c.muted
        ctx.fillText(count, x + w, y)
        if (tray.pitch > 0.3)
          for (const bay of sec.bays) {
            ctx.textAlign = 'left'
            ctx.font = `500 ${Math.min(12, tray.pitch * S * 0.28)}px ${MONO}`
            ctx.fillStyle = c.muted
            ctx.fillText(`${sec.code}-${String(bay.no).padStart(2, '0')}`, (bay.x - X0) * S + 3, (bay.z - Z0) * S - 3)
          }
      }
    })
  }, [tray, c.fg, c.muted, c.dark, TW, TD, n, X0, Z0])
  useEffect(() => () => headerTex.dispose(), [headerTex])

  const grid = useMemo(() => {
    const l: number[] = []
    const y = Y + 0.002
    const rect = (x0: number, z0: number, x1: number, z1: number) => l.push(x0, y, z0, x1, y, z0, x1, y, z0, x1, y, z1, x1, y, z1, x0, y, z1, x0, y, z1, x0, y, z0)
    for (const sec of tray.sections) {
      const w = 4 * tray.pitch
      for (const bay of sec.bays) {
        rect(bay.x, bay.z, bay.x + w, bay.z + bay.rows * tray.pitch)
        if (tray.pitch > 0.3) {
          for (let i = 1; i < 4; i++) l.push(bay.x + i * tray.pitch, y, bay.z, bay.x + i * tray.pitch, y, bay.z + bay.rows * tray.pitch)
          for (let j = 1; j < bay.rows; j++) l.push(bay.x, y, bay.z + j * tray.pitch, bay.x + w, y, bay.z + j * tray.pitch)
        }
      }
      l.push(sec.x0, y, sec.z0 + sec.head - 0.04, sec.x1, y, sec.z0 + sec.head - 0.04)
    }
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(l, 3))
    return g
  }, [tray, Y])
  useEffect(() => () => grid.dispose(), [grid])
  const furniture = useMemo<Prim[]>(() => [
    { box: [TW + 0.5, 0.14, TD + 0.5], at: [(X0 + X1) / 2, Y - 0.07, (Z0 + Z1) / 2], color: c.surface },
    ...[[X0, Z0], [X1, Z0], [X0, Z1], [X1, Z1]].map(([x, z]): Prim => ({ box: [0.12, Y - 0.14, 0.12], at: [x, (Y - 0.14) / 2, z], color: c.surface })),
  ], [c.surface, TW, TD, X0, X1, Z0, Z1, Y])

  const at = (e: ThreeEvent<PointerEvent | MouseEvent>) => pocketAt(tray, e.point.x, e.point.z)
  const onTap = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    if (guard.moved) return
    const i = at(e)
    if (i < 0) return
    if (touch && pocketPx.current < TAP_PX) {
      const sec = sectionOf(tray, i)
      if (lab.focus.category === 'all' && sec) {
        play('drawer')
        lab.setFocus({ category: sec.id })
      }
      else cam.zoomAt(Math.min(4, (TAP_PX * 1.3) / Math.max(1, pocketPx.current)), e.nativeEvent.clientX, e.nativeEvent.clientY)
      return
    }
    cam.holdUntil = 0
    lab.toggle(tray.items[i].ref)
  }
  return (
    <group>
      <Assembly prims={furniture} edge={c.edge} />
      <lineSegments geometry={grid}>
        <lineBasicMaterial color={c.edge} transparent opacity={0.8} />
      </lineSegments>
      <instancedMesh ref={mesh} key={capacity} args={[undefined, undefined, capacity]} geometry={geometry} frustumCulled={false} raycast={() => null}>
        <meshStandardMaterial roughness={0.8} />
      </instancedMesh>
      <mesh
        position={[(X0 + X1) / 2, Y + 0.05, (Z0 + Z1) / 2]}
        rotation-x={-Math.PI / 2}
        visible={false}
        onPointerDown={(e) => {
          const i = at(e)
          cam.pressed = i >= 0 ? tray.items[i].ref : null
        }}
        onPointerMove={(e) => {
          e.stopPropagation()
          const i = at(e)
          if (i < 0) {
            if (hover.current >= 0) { hover.current = -1; cam.hovered = null; tip.hide() }
            return
          }
          const item = tray.items[i]
          if (hover.current !== i) {
            hover.current = i
            cam.hovered = item.ref
            tip.show(e.nativeEvent, item.title, `${item.label} · ${codeOf(item.ref)} · ${touch && pocketPx.current < TAP_PX ? 'tap to open the aisle' : 'click to place'}`, lab.theme === 'dark' ? (item.imageDark ?? item.image) : item.image)
          }
          tip.move(e.nativeEvent)
        }}
        onPointerOut={() => { hover.current = -1; cam.hovered = null; tip.hide() }}
        onClick={onTap}
      >
        <planeGeometry args={[TW, TD]} />
      </mesh>
      <mesh ref={baked} position={[(X0 + X1) / 2, Y + 0.003, (Z0 + Z1) / 2]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[TW, TD]} />
        <meshBasicMaterial map={headerTex} transparent toneMapped={false} depthWrite={false} />
      </mesh>
    </group>
  )
}
