import { useFrame, useThree } from '@react-three/fiber'
import { Line } from '@react-three/drei'
import { useEffect, useMemo, useRef } from 'react'
import { BoxGeometry, Color, InstancedBufferAttribute, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, Object3D, PlaneGeometry, Quaternion, Vector3 } from 'three'
import type { LineBasicMaterial, Texture } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import type { Lab } from '../../lab.types'
import type { Cam } from './camera'
import { instancedEdges } from './kit/hairline'
import { FONT, MONO, fitText, textTexture, tint } from './kit/look'
import type { Guard, Hover, Look, Tip } from './kit/look'
import { screenshot } from './kit/textures'
import { CABINET_DEPTH, CARD, DRAWER, DROP, SAFE_Y, WALL, cabinetHeight, drawerY } from './layout'
import { matchItem } from './model'
import type { Card, GroupBy, Store } from './model'
import { WORLD } from './scene'
import type { Sim } from './sim'

const TILE = { w: 304, h: 80, cols: 6 }
const FACET_HUES = [210, 28, 150, 275, 0, 95, 330, 185, 50]
const POOL = 36
const unit = new BoxGeometry(1, 1, 1)
const plane = new PlaneGeometry(1, 1)
/** A unit tray: floor and four walls, so filed cards show when it slides out. Wall thickness is in unit space. */
const tray = (() => {
  const wall = 0.03, floor = 0.08
  const part = (w: number, h: number, d: number, x: number, y: number, z: number) => new BoxGeometry(w, h, d).translate(x, y, z)
  return mergeGeometries([
    part(1, floor, 1, 0, -0.5 + floor / 2, 0),
    part(1, 1, wall, 0, 0, 0.5 - wall / 2),
    part(1, 0.6, wall, 0, -0.2, -0.5 + wall / 2),
    part(wall, 0.6, 1, -0.5 + wall / 2, -0.2, 0),
    part(wall, 0.6, 1, 0.5 - wall / 2, -0.2, 0),
  ])!
})()
const m4 = new Matrix4()
const q = new Quaternion()
const v = new Vector3()
const s = new Vector3()
const color = new Color()
const dummy = new Object3D()
/** Instances read their atlas tile from a per-instance `tile` (u0, v0, du, dv). */
function atlasMaterial(map: Texture) {
  const material = new MeshBasicMaterial({ map, toneMapped: false })
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 tile;').replace('#include <uv_vertex>', '#include <uv_vertex>\nvMapUv = tile.xy + vMapUv * tile.zw;')
  }
  return material
}

export type Matches = { refs: Set<string>; perDrawer: number[]; perCabinet: number[] } | null

export function matchesOf(store: Store, query: string): Matches {
  if (!query.trim()) return null
  const refs = new Set<string>()
  const perDrawer = store.drawers.map((d) => d.cards.filter((c) => matchItem(c.item, query) && refs.add(c.item.ref)).length)
  const perCabinet = store.cabinets.map((c) => c.drawers.reduce((n, d) => n + perDrawer[store.drawers.indexOf(d)], 0))
  return { refs, perDrawer, perCabinet }
}

function drawTiles(store: Store, c: Look, matches: Matches, selected: ReadonlySet<string>, groupBy: GroupBy) {
  const tiles: { u0: number; v0: number; du: number; dv: number }[] = []
  const count = store.cabinets.length + store.drawers.length
  const rows = Math.ceil(count / TILE.cols)
  const W = TILE.cols * TILE.w, H = rows * TILE.h
  const texture = textTexture(W, H, (ctx) => {
    ctx.fillStyle = c.surface
    ctx.fillRect(0, 0, W, H)
    const at = (i: number) => [(i % TILE.cols) * TILE.w, Math.floor(i / TILE.cols) * TILE.h] as const
    let i = 0
    for (const cab of store.cabinets) {
      const [x, y] = at(i)
      tiles.push({ u0: x / W, v0: 1 - (y + TILE.h) / H, du: TILE.w / W, dv: TILE.h / H })
      const picked = cab.drawers.reduce((n, d) => n + d.cards.filter((card) => selected.has(card.item.ref)).length, 0)
      const hit = matches ? matches.perCabinet[cab.index] : -1
      ctx.globalAlpha = matches && !hit ? 0.35 : 1
      ctx.fillStyle = tint(cab.hue, c, c.dark ? 55 : 60)
      ctx.fillRect(x + 14, y + 18, 8, 44)
      ctx.fillStyle = c.fg
      ctx.font = `500 30px ${FONT}`
      ctx.textAlign = 'left'
      ctx.fillText(fitText(ctx, cab.label.toUpperCase(), 170), x + 36, y + 44)
      ctx.font = `500 22px ${MONO}`
      ctx.textAlign = 'right'
      if (matches) {
        ctx.fillStyle = hit ? c.accent : c.muted
        ctx.fillText(`${hit}/${cab.count}`, x + TILE.w - 16, y + 44)
      } else {
        ctx.fillStyle = c.muted
        ctx.fillText(String(cab.count), x + TILE.w - 16, y + 44)
      }
      ctx.fillStyle = c.dim
      ctx.fillRect(x + 36, y + 60, TILE.w - 52, 2)
      if (picked) {
        ctx.fillStyle = c.accent
        ctx.fillRect(x + 36, y + 59, Math.max(6, ((TILE.w - 52) * picked) / cab.count), 4)
      }
      ctx.globalAlpha = 1
      i++
    }
    for (const [k, d] of store.drawers.entries()) {
      const [x, y] = at(i)
      tiles.push({ u0: x / W, v0: 1 - (y + TILE.h) / H, du: TILE.w / W, dv: TILE.h / H })
      const hit = matches ? matches.perDrawer[k] : -1
      ctx.globalAlpha = matches && !hit ? 0.3 : 1
      const tab = groupBy === 'source' ? tint(FACET_HUES[d.facet % FACET_HUES.length], c, c.dark ? 52 : 62) : c.dim
      ctx.fillStyle = tab
      ctx.beginPath()
      ctx.roundRect(x + 14, y + 22, 44, 36, 4)
      ctx.fill()
      ctx.fillStyle = c.dark ? '#0C2440' : '#FFFFFF'
      ctx.font = `600 18px ${MONO}`
      ctx.textAlign = 'center'
      ctx.fillText(groupBy === 'source' ? store.facets[d.facet].replace('@', '').slice(0, 2).toUpperCase() : String(d.slot + 1).padStart(2, '0'), x + 36, y + 47)
      ctx.fillStyle = c.fg
      ctx.font = `500 26px ${FONT}`
      ctx.textAlign = 'left'
      ctx.fillText(fitText(ctx, d.label, 180), x + 70, y + 48)
      ctx.font = `500 22px ${MONO}`
      ctx.textAlign = 'right'
      ctx.fillStyle = matches ? (hit ? c.accent : c.muted) : c.muted
      ctx.fillText(matches ? `${hit}/${d.cards.length}` : String(d.cards.length), x + TILE.w - 16, y + 48)
      ctx.globalAlpha = 1
      i++
    }
  })
  texture.flipY = true
  return { texture, tiles }
}

export function Wall({ sim, lab, c, cam, tip, guard, groupBy, matches, onCabinet, onDrawer, hover, ready }: {
  sim: Sim; lab: Lab; c: Look; cam: Cam; tip: Tip; guard: Guard; groupBy: GroupBy; matches: Matches
  onCabinet: (i: number) => void; onDrawer: (i: number) => void; hover: Hover; ready: boolean
}) {
  const invalidate = useThree((s) => s.invalidate)
  const labRef = useRef(lab)
  labRef.current = lab
  const store = sim.store
  const n = store.cabinets.length
  const slots = store.slots
  const height = cabinetHeight(slots)
  const drawerCount = n * slots

  const statics = useMemo(() => {
    const bodies = new InstancedMesh(unit, new MeshBasicMaterial({ color: c.surface }), n)
    store.cabinets.forEach((cab, i) => {
      m4.compose(v.set(cab.x, height / 2, (WALL.z0 + WALL.z1) / 2), q.identity(), s.set(WALL.width, height, CABINET_DEPTH))
      bodies.setMatrixAt(i, m4)
    })
    bodies.instanceMatrix.needsUpdate = true
    const bodyEdges = instancedEdges(bodies, c.edge)
    const drawers = new InstancedMesh(tray, new MeshBasicMaterial({ color: c.surface }), drawerCount)
    drawers.frustumCulled = false
    drawers.boundingSphere = WORLD
    const drawerEdges = instancedEdges(drawers, c.edge)
    const plates = new InstancedMesh(plane.clone(), new MeshBasicMaterial({ color: c.surface }), n + drawerCount)
    plates.frustumCulled = false
    plates.boundingSphere = WORLD
    plates.raycast = () => {}
    store.cabinets.forEach((cab, i) => {
      for (let slot = cab.drawers.length; slot < slots; slot++) {
        m4.compose(v.set(cab.x, drawerY(slot, slots), WALL.z1 + 0.02 - (CABINET_DEPTH - 0.2) / 2), q.identity(), s.set(WALL.width - 0.16, DRAWER.h - 0.08, CABINET_DEPTH - 0.2))
        drawers.setMatrixAt(i * slots + slot, m4)
      }
      m4.compose(v.set(cab.x, height - DRAWER.header / 2, WALL.z1 + 0.012), q.identity(), s.set(WALL.width - 0.2, 0.44, 1))
      plates.setMatrixAt(i, m4)
    })
    const cards = new InstancedMesh(unit, new MeshBasicMaterial({ color: '#ffffff' }), Math.max(1, store.cards.length))
    cards.frustumCulled = false
    cards.boundingSphere = WORLD
    const cardEdges = instancedEdges(cards, c.edge, 0.7)
    for (let i = 0; i < cards.count; i++) {
      cards.setMatrixAt(i, m4.makeScale(0, 0, 0))
      cards.setColorAt(i, color.set(c.surface))
    }
    cards.instanceMatrix.needsUpdate = true
    const pool = Array.from({ length: POOL }, () => {
      const mesh = new Mesh(plane, new MeshBasicMaterial({ toneMapped: false, transparent: true }))
      mesh.visible = false
      mesh.raycast = () => {}
      return mesh
    })
    return { bodies, bodyEdges, drawers, drawerEdges, plates, cards, cardEdges, pool, drawn: new Float32Array(store.drawers.length).fill(-1) }
  }, [store, c, n, slots, height, drawerCount])

  useEffect(() => () => {
    const { bodies, bodyEdges, drawers, drawerEdges, plates, cards, cardEdges, pool } = statics
    for (const mesh of [bodies, drawers, plates, cards]) (mesh.material as MeshBasicMaterial).dispose()
    for (const lines of [bodyEdges, drawerEdges, cardEdges]) {
      lines.geometry.dispose()
      ;(lines.material as LineBasicMaterial).dispose()
    }
    plates.geometry.dispose()
    for (const mesh of pool) (mesh.material as MeshBasicMaterial).dispose()
  }, [statics])

  const atlas = useMemo(() => (ready ? drawTiles(store, c, matches, lab.selected, groupBy) : null), [ready, store, c, matches, lab.selected, groupBy])
  useEffect(() => () => atlas?.texture.dispose(), [atlas])
  useEffect(() => {
    if (!atlas) return
    const { plates } = statics
    const plain = plates.material as MeshBasicMaterial
    const material = atlasMaterial(atlas.texture)
    plates.material = material
    const tile = new Float32Array(plates.count * 4)
    atlas.tiles.forEach((t, i) => tile.set([t.u0, t.v0, t.du, t.dv], i * 4))
    plates.geometry.setAttribute('tile', new InstancedBufferAttribute(tile, 4))
    for (let i = 0; i < plates.count; i++) plates.setColorAt(i, color.set('#ffffff'))
    plates.instanceColor!.needsUpdate = true
    invalidate()
    return () => {
      plates.material = plain
      material.dispose()
    }
  }, [atlas, statics, invalidate])

  const accent = useMemo(() => new Color(c.accent), [c])
  const dim = useMemo(() => new Color(c.dim), [c])
  const tints = useMemo(() => store.cards.map((card) => new Color(tint(card.item.hue, c))), [store, c])
  const shown = useRef(new Uint8Array(0))
  if (shown.current.length !== store.cards.length) shown.current = new Uint8Array(store.cards.length)
  const painted = useRef({ matches: null as Matches | undefined | null, hovered: -2, waiting: -1, tints: null as Color[] | null })
  const poolTick = useRef(-1)
  const poolCards = useRef<(Card | null)[]>(Array(POOL).fill(null))

  useFrame(() => {
    const { drawers, plates, cards, pool, drawn } = statics
    const open = sim.drawerOpen
    let moved = false
    for (let k = 0; k < store.drawers.length; k++) {
      const o = open[k] ?? 0
      if (drawn[k] === o) continue
      drawn[k] = o
      moved = true
      const d = store.drawers[k]
      const cab = store.cabinets[d.cabinet]
      const y = drawerY(d.slot, slots)
      const depth = CABINET_DEPTH - 0.2
      const z = WALL.z1 + 0.02 - depth / 2 + o * DRAWER.travel
      m4.compose(v.set(cab.x, y, z), q.identity(), s.set(WALL.width - 0.16, DRAWER.h - 0.08, depth))
      drawers.setMatrixAt(d.cabinet * slots + d.slot, m4)
      m4.compose(v.set(cab.x, y, WALL.z1 + 0.03 + o * DRAWER.travel), q.identity(), s.set(WALL.width - 0.3, 0.42, 1))
      plates.setMatrixAt(n + k, m4)
    }
    if (moved) {
      drawers.instanceMatrix.needsUpdate = true
      plates.instanceMatrix.needsUpdate = true
    }

    const lean = Math.PI / 2 - CARD.lean
    const hovered = hover.card
    let cardsMoved = false
    for (const card of store.cards) {
      const p = sim.parts.get(card.item.ref)!
      const inField = p.mode === 'home' || p.mode === 'wait'
      const visible = inField && ((open[card.drawer] ?? 0) > 0.02 || !!p.fly || p.mode === 'wait')
      const i = card.index
      if (!visible) {
        if (shown.current[i]) {
          shown.current[i] = 0
          cards.setMatrixAt(i, m4.makeScale(0, 0, 0))
          cardsMoved = true
        }
        continue
      }
      shown.current[i] = 1
      cardsMoved = true
      const [w, t, d] = p.size
      const a = lean * p.lean
      const lift = (d / 2) * Math.cos(a) * p.lean + (t / 2) * (1 - p.lean)
      const grow = hovered === card ? 1.08 : 1
      dummy.position.set(p.pos.x, p.pos.y + lift + (hovered === card ? 0.05 : 0), p.pos.z)
      dummy.rotation.set(a, p.spin, 0)
      dummy.scale.set(w * grow, t, d * grow)
      dummy.updateMatrix()
      cards.setMatrixAt(i, dummy.matrix)
    }
    if (cardsMoved) cards.instanceMatrix.needsUpdate = true

    const was = painted.current
    const hoveredIndex = hovered?.index ?? -1
    if (was.matches !== matches || was.hovered !== hoveredIndex || was.waiting !== sim.waiting.length || was.tints !== tints) {
      was.matches = matches
      was.hovered = hoveredIndex
      was.waiting = sim.waiting.length
      was.tints = tints
      for (const card of store.cards) {
        const p = sim.parts.get(card.item.ref)!
        const hit = matches?.refs.has(card.item.ref)
        if (hovered === card || p.mode === 'wait' || hit) cards.setColorAt(card.index, accent)
        else if (matches) cards.setColorAt(card.index, dim)
        else cards.setColorAt(card.index, tints[card.index])
      }
      cards.instanceColor!.needsUpdate = true
    }

    const close = cam.px > 9
    if (Math.abs(sim.time - poolTick.current) > 0.25) {
      poolTick.current = sim.time
      const target = cam.pose.look
      const near: [number, Card][] = []
      if (close)
        for (const card of store.cards) {
          if (!shown.current[card.index] || (open[card.drawer] ?? 0) < 0.85) continue
          const p = sim.parts.get(card.item.ref)!
          const dd = Math.hypot(p.pos.x - target.x, (p.pos.y - target.y) * 0.6, p.pos.z - target.z)
          if (dd < 7) near.push([dd, card])
        }
      near.sort((a, b) => a[0] - b[0])
      for (let k = 0; k < POOL; k++) poolCards.current[k] = near[k]?.[1] ?? null
    }
    const theme = labRef.current.theme
    for (let k = 0; k < POOL; k++) {
      const mesh = pool[k]
      const card = poolCards.current[k]
      const p = card && sim.parts.get(card.item.ref)
      if (!card || !p || !shown.current[card.index]) {
        mesh.visible = false
        continue
      }
      const [w, t, d] = p.size
      const tex = screenshot(theme === 'dark' ? (card.item.imageDark ?? card.item.image) : card.item.image, w / d, invalidate)
      const mat = mesh.material as MeshBasicMaterial
      if (!tex) {
        mesh.visible = false
        continue
      }
      if (mat.map !== tex) {
        mat.map = tex
        mat.needsUpdate = true
      }
      const a = lean * p.lean
      const lift = (d / 2) * Math.cos(a) * p.lean + (t / 2) * (1 - p.lean)
      const grow = hovered === card ? 1.08 : 1
      mesh.position.set(p.pos.x, p.pos.y + lift + (hovered === card ? 0.05 : 0), p.pos.z)
      mesh.rotation.set(a - Math.PI / 2, p.spin, 0)
      mesh.scale.set(w * grow, d * grow, 1)
      mesh.translateZ(t / 2 + 0.004)
      mesh.visible = true
      mat.opacity = Math.min(1, (cam.px - 9) / 6)
    }
  })

  const route = useMemo(() => {
    if (!matches) return null
    const stops = store.drawers
      .map((d, k) => ({ d, k, hit: matches.perDrawer[k] }))
      .filter((e) => e.hit > 0)
      .map((e) => new Vector3(store.cabinets[e.d.cabinet].x, drawerY(e.d.slot, slots), WALL.z1 + DRAWER.travel * 0.5))
    if (!stops.length) return null
    const pts: [number, number, number][] = [[DROP.x, SAFE_Y, DROP.z]]
    const pool = [...stops]
    let at = new Vector3(DROP.x, SAFE_Y, DROP.z)
    while (pool.length) {
      let best = 0
      for (let i = 1; i < pool.length; i++) if (Math.abs(pool[i].x - at.x) < Math.abs(pool[best].x - at.x)) best = i
      at = pool.splice(best, 1)[0]
      pts.push([at.x, SAFE_Y, at.z], [at.x, at.y + 0.6, at.z], [at.x, SAFE_Y, at.z])
    }
    pts.push([DROP.x, SAFE_Y, DROP.z])
    return pts
  }, [matches, store, slots])

  const pick = (e: { instanceId?: number; stopPropagation: () => void; nativeEvent: PointerEvent }) => {
    const card = store.cards[e.instanceId ?? -1]
    if (!card) return null
    const p = sim.parts.get(card.item.ref)!
    if (p.mode !== 'home' && p.mode !== 'wait') return null
    return card
  }

  return (
    <group>
      <primitive
        object={statics.bodies}
        onClick={(e: { instanceId?: number; stopPropagation: () => void }) => { e.stopPropagation(); if (!guard.moved && e.instanceId !== undefined) onCabinet(e.instanceId) }}
        onPointerOver={(e: { instanceId?: number; stopPropagation: () => void; nativeEvent: PointerEvent }) => {
          e.stopPropagation()
          const cab = store.cabinets[e.instanceId ?? -1]
          if (cab) tip.show(e.nativeEvent, cab.label, `Cabinet ${String(cab.index + 1).padStart(2, '0')} · ${cab.count} parts · ${cab.drawers.length} drawer${cab.drawers.length === 1 ? '' : 's'} · click to open`)
        }}
        onPointerMove={(e: { nativeEvent: PointerEvent }) => tip.move(e.nativeEvent)}
        onPointerOut={() => tip.hide()}
      />
      <primitive object={statics.bodyEdges} />
      <primitive
        object={statics.drawers}
        onClick={(e: { instanceId?: number; stopPropagation: () => void }) => {
          e.stopPropagation()
          if (guard.moved || e.instanceId === undefined) return
          const cab = store.cabinets[Math.floor(e.instanceId / slots)]
          const d = cab.drawers[e.instanceId % slots]
          if (d) onDrawer(store.drawers.indexOf(d))
          else onCabinet(cab.index)
        }}
        onPointerOver={(e: { instanceId?: number; stopPropagation: () => void; nativeEvent: PointerEvent }) => {
          e.stopPropagation()
          const cab = store.cabinets[Math.floor((e.instanceId ?? 0) / slots)]
          const d = cab?.drawers[(e.instanceId ?? 0) % slots]
          if (d) tip.show(e.nativeEvent, d.label, `${cab.label} · ${d.cards.length} parts · click to pull out`)
          else if (cab) tip.show(e.nativeEvent, 'Spare drawer', `${cab.label} · room to grow`)
        }}
        onPointerMove={(e: { nativeEvent: PointerEvent }) => tip.move(e.nativeEvent)}
        onPointerOut={() => tip.hide()}
      />
      <primitive object={statics.drawerEdges} />
      <primitive object={statics.plates} />
      <primitive
        object={statics.cards}
        onClick={(e: { instanceId?: number; stopPropagation: () => void; nativeEvent: PointerEvent }) => {
          e.stopPropagation()
          const card = pick(e)
          if (!card || guard.moved) return
          hover.card = null
          tip.hide()
          lab.toggle(card.item.ref)
        }}
        onPointerDown={(e: { instanceId?: number; stopPropagation: () => void; nativeEvent: PointerEvent }) => {
          const card = pick(e)
          if (card) hover.pressed = card.item.ref
        }}
        onPointerMove={(e: { instanceId?: number; stopPropagation: () => void; nativeEvent: PointerEvent }) => {
          e.stopPropagation()
          const card = pick(e)
          if (card && hover.card !== card) {
            hover.card = card
            const p = sim.parts.get(card.item.ref)!
            tip.show(e.nativeEvent, card.item.title, `${card.item.label} · ${card.code} · ${p.mode === 'wait' ? 'crane on its way' : 'click to pick'}`)
          }
          tip.move(e.nativeEvent)
        }}
        onPointerOut={() => { hover.card = null; tip.hide() }}
      />
      <primitive object={statics.cardEdges} />
      {statics.pool.map((mesh, k) => (
        <primitive key={k} object={mesh} />
      ))}
      {route && <Line points={route} color={c.accent} lineWidth={1.2} dashed dashSize={0.3} gapSize={0.2} />}
    </group>
  )
}

