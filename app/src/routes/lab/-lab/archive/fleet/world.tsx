import { useFrame } from '@react-three/fiber'
import { Billboard, Edges, Line } from '@react-three/drei'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Color, Group, InstancedMesh, Mesh, MeshBasicMaterial, MeshStandardMaterial, Object3D, Quaternion, Shape, SRGBColorSpace, TextureLoader, Vector3 } from 'three'
import type { Texture } from 'three'

import type { Framework } from '../../../../workspace/-workspace/workspace.types'
import type { Lab } from '../../lab.types'
import { ACCENT, BRAND, Box, FONT, Flat, circle, hover, plateTexture, segmentWriter, staticSegments, textTexture, tint, useSegments } from './kit'
import type { Colors, Tip } from './kit'
import {
  BY, CELL, DOCK, HANGAR, INTAKE, KIT_PAD, MACHINES, PAD, PORT, SILO, SILO_EMIT, SLOTS, SLOT_COUNT, STORE_PAD, TUBE, WH, binPos, machine, tracePath,
} from './sim'
import type { Part, Rig, Sim, SlotKey, TransportId } from './sim'

type Deploy = (slot: SlotKey, id: string) => void
type Common = { sim: Sim; c: Colors; tip: Tip }

const dummy = new Object3D()
const color = new Color()
const v = new Vector3()

export const matches = (item: Part['item'], q: string) =>
  !q || item.title.toLowerCase().includes(q) || item.label.toLowerCase().includes(q) || item.ref.toLowerCase().includes(q)

export function aisleZ(no: number, aisles: number) {
  return (no - 1 - (aisles - 1) / 2) * WH.row
}

export function Warehouse({ lab, sim, c, tip, version }: Common & { lab: Lab; version: number }) {
  const bins = useMemo(() => [...lab.warehouse.bins.values()], [lab.warehouse])
  const A = lab.warehouse.aisles.length
  const mesh = useRef<InstancedMesh>(null)
  const span = useMemo(() => {
    const deepest = Math.max(...lab.warehouse.aisles.map((a) => a.bays))
    return { x0: WH.x1 - deepest * WH.bay - 0.5, x1: WH.x1 + 2.7, z0: aisleZ(1, A) - 0.9, z1: aisleZ(A, A) + 0.9 }
  }, [lab.warehouse, A])
  const frames = useMemo(() => {
    const pts: number[] = []
    const top = WH.base + 5 * WH.level
    for (const aisle of lab.warehouse.aisles) {
      const z = aisleZ(aisle.no, A)
      for (let b = 0; b < aisle.bays; b++) {
        const x0 = WH.x1 - b * WH.bay, x1 = x0 - WH.bay
        for (let k = 0; k <= 5; k++) {
          const y = WH.base + k * WH.level
          pts.push(x0, y, z - WH.depth / 2, x1, y, z - WH.depth / 2, x0, y, z + WH.depth / 2, x1, y, z + WH.depth / 2)
        }
        for (const x of b === aisle.bays - 1 ? [x0, x1] : [x0]) for (const dz of [-1, 1]) pts.push(x, 0, z + (dz * WH.depth) / 2, x, top, z + (dz * WH.depth) / 2)
      }
    }
    const { x0, x1, z0, z1 } = span
    pts.push(x0, 0.005, z0, x1, 0.005, z0, x1, 0.005, z0, x1, 0.005, z1, x1, 0.005, z1, x0, 0.005, z1, x0, 0.005, z1, x0, 0.005, z0)
    return staticSegments(pts, c.edge)
  }, [lab.warehouse, A, c.edge, span])

  const labels = useMemo(
    () =>
      lab.warehouse.aisles.map((aisle) => {
        const on = lab.focus.category === aisle.id
        return textTexture(560, 120, (ctx) => {
          ctx.fillStyle = on ? ACCENT : tint(aisle.hue, c)
          ctx.fillRect(10, 30, 12, 60)
          ctx.fillStyle = on ? ACCENT : c.fg
          ctx.font = `500 46px ${FONT}`
          ctx.fillText(`${String(aisle.no).padStart(2, '0')}  ${aisle.label.length > 14 ? `${aisle.label.slice(0, 13)}…` : aisle.label}`, 40, 76)
          ctx.fillStyle = c.muted
          ctx.font = `400 38px ${FONT}`
          ctx.textAlign = 'right'
          ctx.fillText(aisle.count.toLocaleString(), 550, 76)
        })
      }),
    [lab.warehouse, c, lab.focus.category],
  )
  const racks = useMemo(() => {
    const aisle = lab.warehouse.aisles.find((a) => a.id === lab.focus.category)
    if (!aisle) return []
    const z = aisleZ(aisle.no, A)
    return aisle.racks.slice(0, 12).map((rack) => {
      const first = Math.min(...rack.bins.map((b) => b.bay))
      const tex = textTexture(520, 96, (ctx) => {
        ctx.fillStyle = c.surface
        ctx.strokeStyle = ACCENT
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.roundRect(3, 3, 514, 90, 14)
        ctx.fill()
        ctx.stroke()
        ctx.fillStyle = c.fg
        ctx.font = `500 40px ${FONT}`
        ctx.fillText(rack.name.length > 16 ? `${rack.name.slice(0, 15)}…` : rack.name, 20, 62)
        ctx.fillStyle = c.muted
        ctx.textAlign = 'right'
        ctx.fillText(String(rack.bins.length), 500, 62)
      })
      const x = WH.x1 - (first - 1 + rack.bays / 2) * WH.bay
      return { key: rack.source, tex, at: [x, 1.62, z] as [number, number, number], w: Math.min(2.4, Math.max(1.5, rack.bays * WH.bay - 0.1)) }
    })
  }, [lab.warehouse, lab.focus.category, A, c])
  const title = useMemo(
    () =>
      textTexture(900, 120, (ctx) => {
        ctx.fillStyle = c.fg
        ctx.font = `500 52px ${FONT}`
        ctx.fillText('WAREHOUSE', 0, 70)
        ctx.fillStyle = c.muted
        ctx.font = `400 40px ${FONT}`
        ctx.fillText(`${bins.length.toLocaleString()} bins · ${A} aisles`, 330, 70)
      }),
    [c, bins.length, A],
  )

  useLayoutEffect(() => {
    const m = mesh.current
    if (!m) return
    const q = lab.focus.query.trim().toLowerCase()
    const cat = lab.focus.category
    bins.forEach((bin, i) => {
      const p = sim.parts.get(bin.item.ref)
      const out = !!p && sim.live.includes(p) && p.phase !== 'home'
      binPos(bin, A, dummy.position)
      dummy.scale.setScalar(out ? 0.0001 : 1)
      dummy.updateMatrix()
      m.setMatrixAt(i, dummy.matrix)
      const hit = matches(bin.item, q) && (cat === 'all' || bin.item.category === cat)
      if (!hit) color.set(c.dim)
      else if (q || cat !== 'all') color.set(tint(bin.item.hue, c, c.theme === 'dark' ? 55 : 58))
      else color.set(tint(bin.item.hue, c, c.theme === 'dark' ? 28 : 82))
      m.setColorAt(i, color)
    })
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
    m.computeBoundingSphere()
  }, [bins, A, lab.focus, version, c, sim, lab.selected])

  return (
    <group>
      <primitive object={frames} />
      <instancedMesh
        ref={mesh}
        args={[undefined, undefined, bins.length]}
        onClick={(e) => {
          e.stopPropagation()
          if (e.instanceId !== undefined) lab.toggle(bins[e.instanceId].item.ref)
        }}
        onPointerMove={(e) => {
          e.stopPropagation()
          const bin = e.instanceId !== undefined ? bins[e.instanceId] : null
          if (bin) tip.show(e.nativeEvent, bin.item.title, `${bin.code} · ${bin.item.label} · click to order`)
        }}
        onPointerOut={() => tip.hide()}
      >
        <boxGeometry args={[0.18, 0.16, 0.26]} />
        <meshStandardMaterial roughness={1} />
      </instancedMesh>
      {lab.warehouse.aisles.map((aisle, i) => (
        <Flat key={aisle.id} texture={labels[i]} size={[2.2, 0.47]} position={[WH.x1 + 1.45, 0.01, aisleZ(aisle.no, A)]} />
      ))}
      <Flat texture={title} size={[6.0, 0.8]} position={[span.x1 - 3.0, 0.01, span.z1 + 0.7]} />
      {racks.map((r) => (
        <Billboard key={r.key} position={r.at}>
          <mesh>
            <planeGeometry args={[r.w, r.w * (96 / 520)]} />
            <meshBasicMaterial map={r.tex} transparent toneMapped={false} depthTest={false} />
          </mesh>
        </Billboard>
      ))}
    </group>
  )
}

export function Stations({ c }: { c: Colors }) {
  const legs = (x: number, z: number, w: number, d: number, h: number) =>
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => (
      <Box key={`${sx}${sz}`} size={[0.08, h, 0.08]} position={[x + sx * (w / 2 - 0.1), h / 2, z + sz * (d / 2 - 0.1)]} color={c.surface} edge={c.edge} />
    ))
  const dock = useMemo(() => textTexture(300, 80, (ctx) => { ctx.fillStyle = c.muted; ctx.font = `500 44px ${FONT}`; ctx.fillText('OUTBOUND', 0, 56) }), [c])
  const intake = useMemo(() => textTexture(300, 80, (ctx) => { ctx.fillStyle = c.muted; ctx.font = `500 44px ${FONT}`; ctx.fillText('INTAKE', 0, 56) }), [c])
  return (
    <group>
      <Box size={[1.3, 0.06, 1.3]} position={[DOCK.x, DOCK.y - 0.03, DOCK.z]} color={c.surface} edge={c.edge} />
      {legs(DOCK.x, DOCK.z, 1.3, 1.3, DOCK.y - 0.06)}
      <Flat texture={dock} size={[1.5, 0.4]} position={[DOCK.x, 0.01, DOCK.z + 1.1]} />
      <Box size={[1.3, 0.06, 1.3]} position={[INTAKE.x, INTAKE.y - 0.03, INTAKE.z]} color={c.surface} edge={c.edge} />
      {legs(INTAKE.x, INTAKE.z, 1.3, 1.3, INTAKE.y - 0.06)}
      <Flat texture={intake} size={[1.5, 0.4]} position={[INTAKE.x, 0.01, INTAKE.z + 1.1]} />
    </group>
  )
}

export function Belt({ sim, c }: Omit<Common, 'tip'>) {
  const group = useRef<Group>(null)
  const slats = useRef<(Mesh | null)[]>([])
  const L = INTAKE.x - DOCK.x
  const n = 28
  useFrame(({ clock }) => {
    const g = group.current!
    const s = sim.show.belt
    g.visible = s > 0.01
    g.scale.set(Math.max(0.001, s), 1, 1)
    const off = (clock.elapsedTime * 2.5) % (L / n)
    slats.current.forEach((m, i) => m && (m.position.x = ((i * L) / n + off) % L))
  })
  return (
    <group ref={group} position={[DOCK.x, 0, DOCK.z]}>
      <Box size={[L, 0.3, 1.1]} position={[L / 2, DOCK.y - 0.17, 0]} color={c.surface} edge={c.edge} />
      <Box size={[L, 0.06, 0.05]} position={[L / 2, DOCK.y - 0.05, 0.6]} color={BRAND.npm} edge={BRAND.npm} />
      {[0, L].map((x) => (
        <mesh key={x} position={[x, DOCK.y - 0.17, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.16, 0.16, 1.12, 20]} />
          <meshStandardMaterial color={c.surface} roughness={1} />
          <Edges color={c.edge} threshold={20} />
        </mesh>
      ))}
      {[0.6, L / 2, L - 0.6].flatMap((x) => [-0.4, 0.4].map((z) => (
        <Box key={`${x}${z}`} size={[0.08, DOCK.y - 0.32, 0.08]} position={[x, (DOCK.y - 0.32) / 2, z]} color={c.surface} edge={c.edge} />
      )))}
      {Array.from({ length: n }, (_, i) => (
        <mesh key={i} ref={(m) => { slats.current[i] = m }} position={[0, DOCK.y - 0.015, 0]}>
          <boxGeometry args={[0.02, 0.01, 1.0]} />
          <meshBasicMaterial color={c.edge} />
        </mesh>
      ))}
    </group>
  )
}

export function Depot({ sim, c }: Omit<Common, 'tip'>) {
  const group = useRef<Group>(null)
  const tiles = useRef<InstancedMesh>(null)
  const beams = useSegments(800, BRAND.pnpm, 0.75)
  const frame = useMemo(() => {
    const pts: number[] = []
    for (const y of [0.02, 0.9, 1.8, 2.7, 3.6]) circle(pts, 0, y, 0, 1.05, 40)
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2
      pts.push(Math.cos(a) * 1.05, 0, Math.sin(a) * 1.05, Math.cos(a) * 1.05, 3.6, Math.sin(a) * 1.05)
      pts.push(Math.cos(a) * 1.05, 3.6, Math.sin(a) * 1.05, Math.cos(a) * 0.4, 4.1, Math.sin(a) * 0.4)
    }
    circle(pts, 0, 4.1, 0, 0.4, 24)
    return staticSegments(pts, c.edge)
  }, [c.edge])
  const ring = useMemo(() => staticSegments(circle(circle([], 0, 3.6, 0, 1.08, 40), 0, 2.6, 0, 0.18, 16), BRAND.pnpm), [])
  const plate = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 640
    canvas.height = 200
    const tex = textTexture(1, 1, () => {})
    tex.image = canvas
    return { canvas, tex, n: -1 }
  }, [])
  useFrame(() => {
    const g = group.current!
    const s = sim.show.depot
    g.visible = s > 0.01
    g.scale.set(1, Math.max(0.001, s), 1)
    const n = sim.store.length
    if (plate.n !== n) {
      plate.n = n
      const ctx = plate.canvas.getContext('2d')!
      ctx.clearRect(0, 0, 640, 200)
      ctx.fillStyle = BRAND.pnpm
      ctx.fillRect(14, 30, 14, 60)
      ctx.fillStyle = c.fg
      ctx.font = `500 48px ${FONT}`
      ctx.fillText('pnpm store', 46, 76)
      ctx.fillStyle = c.muted
      ctx.font = `400 34px ${FONT}`
      ctx.fillText(`${n} package${n === 1 ? '' : 's'} · one copy each`, 46, 130)
      ctx.fillText('slots get hard links', 46, 176)
      plate.tex.needsUpdate = true
      const m = tiles.current!
      const shown = Math.min(n, 56)
      for (let i = 0; i < shown; i++) {
        const ref = sim.store[n - shown + i]
        const a = i * 0.95
        dummy.position.set(Math.cos(a) * 0.42, 0.16 + i * 0.062, Math.sin(a) * 0.42)
        dummy.rotation.set(0, -a, 0)
        dummy.scale.setScalar(1)
        dummy.updateMatrix()
        m.setMatrixAt(i, dummy.matrix)
        m.setColorAt(i, color.set(tint(sim.items.get(ref)?.hue ?? 0, c)))
      }
      m.count = shown
      m.instanceMatrix.needsUpdate = true
      if (m.instanceColor) m.instanceColor.needsUpdate = true
    }
    const w = segmentWriter(beams)
    for (const p of sim.live) {
      if (!p.ghost || p.phase === 'home') continue
      const k = p.stage === 'beam' ? Math.min(1, p.run * 1.6) : 1
      w.add(SILO_EMIT.x, SILO_EMIT.y, SILO_EMIT.z, SILO_EMIT.x + (p.pos.x - SILO_EMIT.x) * k, SILO_EMIT.y + (p.pos.y - SILO_EMIT.y) * k, SILO_EMIT.z + (p.pos.z - SILO_EMIT.z) * k)
    }
    w.done()
  })
  return (
    <>
      <group ref={group} position={[SILO.x, 0, SILO.z]}>
        <primitive object={frame} />
        <primitive object={ring} />
        <mesh position={[0, 1.8, 0]}>
          <cylinderGeometry args={[1.04, 1.04, 3.6, 40, 1, true]} />
          <meshBasicMaterial color={c.glass} transparent opacity={0.35} depthWrite={false} />
        </mesh>
        <instancedMesh ref={tiles} args={[undefined, undefined, 56]} frustumCulled={false}>
          <boxGeometry args={[0.46, 0.05, 0.34]} />
          <meshStandardMaterial roughness={1} />
        </instancedMesh>
        <Flat texture={plate.tex} size={[2.6, 0.81]} position={[0, 0.01, 1.75]} />
      </group>
      <primitive object={beams} />
    </>
  )
}

export function Tube({ sim, c }: Omit<Common, 'tip'>) {
  const N = 30
  const rings = useRef<(Mesh | null)[]>([])
  const puffs = useRef<(Mesh | null)[]>([])
  const whoosh = useRef<Mesh>(null)
  const streak = useSegments(40, BRAND.bun, 1)
  const frames = useMemo(
    () =>
      Array.from({ length: N + 1 }, (_, i) => {
        const u = i / N
        const p = TUBE.getPointAt(u)
        const t = TUBE.getTangentAt(u)
        return { p, q: new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), t) }
      }),
    [],
  )
  const rails = useMemo(() => {
    const pts = TUBE.getSpacedPoints(80)
    return [0.34, -0.34].map((dy) => pts.map((p) => [p.x, p.y + dy, p.z] as [number, number, number]))
  }, [])
  const word = useMemo(() => textTexture(420, 140, (ctx) => { ctx.fillStyle = BRAND.bun; ctx.font = `italic 600 92px ${FONT}`; ctx.fillText('whoosh', 10, 100) }), [])
  const railGroup = useRef<Group>(null)
  useFrame(() => {
    const s = sim.show.tube
    rings.current.forEach((m, i) => {
      if (!m) return
      const k = Math.min(1, Math.max(0, s * (N + 4) - i))
      m.visible = k > 0.01
      m.scale.setScalar(Math.max(0.001, k))
    })
    railGroup.current!.visible = s > 0.6
    const w = segmentWriter(streak)
    for (const p of sim.queue) {
      if (p.stage !== 'tube') continue
      const u = Math.min(1, p.run * p.run)
      for (let k = 0; k < 6; k++) {
        const a = TUBE.getPointAt(Math.max(0, u - 0.03 * (k + 1)))
        const b = TUBE.getPointAt(Math.max(0, u - 0.03 * k))
        w.add(a.x, a.y, a.z, b.x, b.y, b.z)
      }
    }
    w.done()
    puffs.current.forEach((m, i) => {
      if (!m) return
      const t = sim.puffs[i]
      m.visible = t !== undefined
      if (t === undefined) return
      m.scale.setScalar(0.4 + t * 2.4)
      ;(m.material as MeshBasicMaterial).opacity = 1 - t
    })
    const newest = sim.puffs.length ? Math.min(...sim.puffs) : 1
    whoosh.current!.visible = newest < 1 && s > 0.5
    ;(whoosh.current!.material as MeshBasicMaterial).opacity = 1 - newest
    whoosh.current!.position.y = 3.0 + newest * 0.6
  })
  const end = TUBE.getPointAt(1)
  return (
    <group>
      {frames.map(({ p, q }, i) => (
        <mesh key={i} ref={(m) => { rings.current[i] = m }} position={p} quaternion={q}>
          <torusGeometry args={[0.36, 0.02, 6, 28]} />
          <meshBasicMaterial color={i === 0 || i === N ? BRAND.bun : c.edge} />
        </mesh>
      ))}
      <group ref={railGroup}>
        {rails.map((points, i) => <Line key={i} points={points} color={c.edge} lineWidth={1} />)}
      </group>
      <primitive object={streak} />
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <mesh key={i} ref={(m) => { puffs.current[i] = m }} position={[end.x, end.y - 0.2, end.z]} rotation={[Math.PI / 2, 0, 0]} visible={false}>
          <torusGeometry args={[0.4, 0.015, 6, 32]} />
          <meshBasicMaterial color={BRAND.bun} transparent toneMapped={false} />
        </mesh>
      ))}
      <mesh ref={whoosh} position={[end.x + 0.6, 3.0, end.z + 0.6]} visible={false}>
        <planeGeometry args={[1.8, 0.6]} />
        <meshBasicMaterial map={word} transparent toneMapped={false} depthWrite={false} />
      </mesh>
    </group>
  )
}

function slotRect(cell: Framework, pts: number[], k: number) {
  const s = SLOTS[cell][k]
  const cs = Math.cos(s.yaw), sn = Math.sin(s.yaw)
  const corners = [[-0.48, -0.36], [0.48, -0.36], [0.48, 0.36], [-0.48, 0.36]].map(([x, z]) => [s.x + x * cs + z * sn, s.z - x * sn + z * cs])
  for (let i = 0; i < 4; i++) {
    const a = corners[i], b = corners[(i + 1) % 4]
    pts.push(a[0], BY + 0.01, a[1], b[0], BY + 0.01, b[1])
  }
}

export function Cell({ cell, sim, c, tip, swap }: Common & { cell: Framework; swap: () => void }) {
  const group = useRef<Group>(null)
  const traces = useRef<({ material: { color: Color; linewidth: number } } | null)[]>([])
  const lit = useMemo(() => new Color(ACCENT), [])
  const dim = useMemo(() => new Color(c.dim), [c.dim])
  const paths = useMemo(() => Array.from({ length: SLOT_COUNT }, (_, k) => tracePath(cell, k)), [cell])
  const outlines = useMemo(() => {
    const pts: number[] = []
    for (let k = 0; k < SLOT_COUNT; k++) slotRect(cell, pts, k)
    if (cell === 'tanstack') for (const r of [1.3, 2.3, 3.2, 4.05]) circle(pts, CELL.x, BY + 0.008, CELL.z, r, 72, true)
    else for (const [x, z] of [[-4.0, -3.0], [4.0, -3.0], [-4.0, 3.0], [4.0, 3.0]]) circle(pts, CELL.x + x, BY + 0.008, CELL.z + z, 0.14, 16)
    return staticSegments(pts, c.dim)
  }, [cell, c.dim])
  const pins = useMemo(() => {
    const pts: number[] = []
    const y = BY + 0.01
    if (cell === 'next') {
      for (let k = 0; k < 9; k++) {
        const x = CELL.x - 1.0 + k * 0.25
        pts.push(x, y, CELL.z - 0.75, x, y, CELL.z - 0.92, x, y, CELL.z + 0.75, x, y, CELL.z + 0.92)
      }
      for (let k = 0; k < 5; k++) {
        const z = CELL.z - 0.5 + k * 0.25
        pts.push(CELL.x - 1.2, y, z, CELL.x - 1.38, y, z, CELL.x + 1.2, y, z, CELL.x + 1.38, y, z)
      }
    } else
      for (let k = 0; k < 28; k++) {
        const a = (k / 28) * Math.PI * 2
        pts.push(CELL.x + Math.cos(a) * 1.05, y, CELL.z + Math.sin(a) * 1.05, CELL.x + Math.cos(a) * 1.2, y, CELL.z + Math.sin(a) * 1.2)
      }
    return staticSegments(pts, c.edge)
  }, [cell, c.edge])
  const label = useMemo(
    () =>
      textTexture(400, 260, (ctx) => {
        ctx.fillStyle = '#14191C'
        ctx.fillRect(0, 0, 400, 260)
        ctx.strokeStyle = cell === 'next' ? '#FCFCFC' : BRAND.tanstack
        ctx.lineWidth = 3
        if (cell === 'next') ctx.strokeRect(14, 14, 372, 232)
        else {
          ctx.beginPath()
          ctx.arc(200, 130, 112, 0, Math.PI * 2)
          ctx.stroke()
        }
        ctx.textAlign = 'center'
        ctx.fillStyle = '#8A9094'
        ctx.font = `500 22px ${FONT}`
        ctx.fillText('FRAMEWORK', 200, 98)
        ctx.fillStyle = '#FCFCFC'
        ctx.font = `500 ${cell === 'next' ? 54 : 40}px ${FONT}`
        ctx.fillText(cell === 'next' ? 'Next.js' : 'TanStack', 200, 152)
        ctx.fillStyle = '#8A9094'
        ctx.font = `400 20px ${FONT}`
        ctx.fillText('click to swap ↻', 200, 196)
      }),
    [cell],
  )
  useFrame(() => {
    const g = group.current!
    const s = sim.show[cell]
    g.visible = s > 0.01
    g.position.set(CELL.x, (s - 1) * 1.6, CELL.z)
    g.scale.setScalar(0.75 + 0.25 * s)
    traces.current.forEach((line, k) => {
      if (!line) return
      let on = false
      for (let i = k; i < sim.slots.length; i += SLOT_COUNT) if (sim.slots[i]?.phase === 'seated') on = true
      line.material.color.copy(on && sim.rig.cell === cell ? lit : dim)
      line.material.linewidth = on ? 2.4 : 1
    })
  })
  const events = {
    onClick: (e: { stopPropagation: () => void }) => {
      e.stopPropagation()
      swap()
    },
    ...hover(tip, () => `${machine('cell', cell).brand} cell`, () => `${machine('cell', cell).model} · click to swap framework`),
  }
  return (
    <group ref={group}>
      <group position={[-CELL.x, 0, -CELL.z]}>
        {cell === 'next' ? (
          <Box size={[8.8, BY, 6.8]} position={[CELL.x, BY / 2, CELL.z]} color={c.board} edge={c.edge} />
        ) : (
          <mesh position={[CELL.x, BY / 2, CELL.z]}>
            <cylinderGeometry args={[4.35, 4.35, BY, 96]} />
            <meshStandardMaterial color={c.board} roughness={1} />
            <Edges color={c.edge} threshold={20} />
          </mesh>
        )}
        <primitive object={outlines} />
        <primitive object={pins} />
        {paths.map((points, k) => (
          <Line key={k} ref={(l) => { traces.current[k] = l as never }} points={points} color={c.dim} lineWidth={1} />
        ))}
        {cell === 'next' ? (
          <mesh position={[CELL.x, BY + 0.15, CELL.z]} {...events}>
            <boxGeometry args={[2.4, 0.3, 1.5]} />
            {[0, 1, 3, 4, 5].map((i) => <meshStandardMaterial key={i} attach={`material-${i}`} color="#14191C" roughness={1} />)}
            <meshBasicMaterial attach="material-2" map={label} toneMapped={false} />
            <Edges color={c.edge} />
          </mesh>
        ) : (
          <group position={[CELL.x, BY + 0.15, CELL.z]}>
            <mesh {...events}>
              <cylinderGeometry args={[1.05, 1.05, 0.3, 48]} />
              <meshStandardMaterial color="#14191C" roughness={1} />
              <Edges color={BRAND.tanstack} threshold={20} />
            </mesh>
            <mesh position={[0, 0.152, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <circleGeometry args={[1.0, 48]} />
              <meshBasicMaterial map={label} toneMapped={false} />
            </mesh>
          </group>
        )}
      </group>
    </group>
  )
}

export function Postgres({ sim, c, tip, deploy }: Common & { deploy: Deploy }) {
  const group = useRef<Group>(null)
  const reels = useRef<(Group | null)[]>([])
  const leds = useRef<(MeshStandardMaterial | null)[]>([])
  const grey = c.theme === 'dark' ? '#7F8C99' : '#6E7E8C'
  const top = useMemo(() => textTexture(400, 160, (ctx) => {
    ctx.fillStyle = c.fg
    ctx.font = `500 54px ${FONT}`
    ctx.fillText('PostgreSQL', 18, 74)
    ctx.fillStyle = c.muted
    ctx.font = `400 32px ${FONT}`
    ctx.fillText('tape library', 18, 124)
  }), [c])
  useFrame((_, dt) => {
    const s = sim.stores.postgres
    group.current!.position.copy(s.pos)
    reels.current.forEach((r, i) => r && (r.rotation.z -= dt * (0.4 + s.kick * 14) * (i ? 1.3 : 1)))
    leds.current.forEach((m, i) => m && m.color.set(Math.sin(sim.time * (3 + i) + i * 2) > 0.6 - s.kick * 1.5 ? (i % 3 ? '#6BCB77' : BRAND.postgres) : c.dim))
  })
  const parked = () => sim.rig.storage !== 'postgres'
  return (
    <group
      ref={group}
      onClick={(e) => {
        e.stopPropagation()
        if (parked()) deploy('storage', 'postgres')
      }}
      {...hover(tip, () => 'PostgreSQL · tape library rack', () => (parked() ? 'Parked · click to roll it in' : 'Storing every seated part'))}
    >
      <Box size={[1.5, 3.2, 1.2]} position={[0, 1.6, 0]} color={c.pg} edge={grey} />
      <Box size={[1.56, 0.12, 1.26]} position={[0, 3.26, 0]} color={c.pg} edge={grey} />
      <Flat texture={top} size={[1.4, 0.56]} position={[0, 3.33, 0]} />
      {[-0.36, 0.36].map((x, i) => (
        <group key={x} position={[x, 2.4, 0.605]}>
          <mesh>
            <torusGeometry args={[0.3, 0.014, 6, 40]} />
            <meshBasicMaterial color={grey} />
          </mesh>
          <group ref={(g) => { reels.current[i] = g }}>
            {[0, 1, 2].map((k) => (
              <mesh key={k} rotation={[0, 0, (k * Math.PI * 2) / 3]} position={[0, 0, 0.005]}>
                <boxGeometry args={[0.02, 0.5, 0.005]} />
                <meshBasicMaterial color={grey} />
              </mesh>
            ))}
            <mesh>
              <torusGeometry args={[0.09, 0.012, 6, 20]} />
              <meshBasicMaterial color={BRAND.postgres} />
            </mesh>
          </group>
        </group>
      ))}
      <Line points={[[-0.72, 2.0, 0.605], [0.72, 2.0, 0.605], [0.72, 2.8, 0.605], [-0.72, 2.8, 0.605], [-0.72, 2.0, 0.605]]} color={grey} lineWidth={1} />
      {[0, 1, 2, 3].map((k) => (
        <Box key={k} size={[1.2, 0.14, 0.02]} position={[0, 0.45 + k * 0.24, 0.61]} color={c.pg} edge={grey} />
      ))}
      {Array.from({ length: 8 }, (_, i) => (
        <mesh key={i} position={[-0.49 + i * 0.14, 1.55, 0.61]}>
          <boxGeometry args={[0.06, 0.06, 0.02]} />
          <meshStandardMaterial ref={(m) => { leds.current[i] = m }} color={c.dim} emissive="#000" roughness={1} />
        </mesh>
      ))}
    </group>
  )
}

export function Mongo({ sim, c, tip, deploy }: Common & { deploy: Deploy }) {
  const group = useRef<Group>(null)
  const leaf = useRef<Group>(null)
  const last = useRef<Mesh>(null)
  const [count, setCount] = useState(() => Math.min(26, sim.stores.mongodb.writes + 3))
  const shape = useMemo(() => {
    const s = new Shape()
    s.moveTo(0, 0)
    s.quadraticCurveTo(0.62, 0.75, 0, 1.75)
    s.quadraticCurveTo(-0.62, 0.75, 0, 0)
    return s
  }, [])
  const label = useMemo(() => textTexture(400, 160, (ctx) => {
    ctx.fillStyle = c.fg
    ctx.font = `500 54px ${FONT}`
    ctx.fillText('MongoDB', 18, 74)
    ctx.fillStyle = c.muted
    ctx.font = `400 32px ${FONT}`
    ctx.fillText('document stacker', 18, 124)
  }), [c])
  useFrame(() => {
    const s = sim.stores.mongodb
    group.current!.position.copy(s.pos)
    leaf.current!.rotation.y = Math.sin(sim.time * 0.8) * 0.35
    leaf.current!.rotation.z = Math.sin(sim.time * 1.3) * 0.05
    const want = Math.min(26, s.writes + 3)
    if (want !== count) setCount(want)
    if (last.current) {
      last.current.position.y = 0.32 + (count - 1) * 0.06 + s.kick * 0.9
      last.current.rotation.z = s.kick * 0.6
    }
  })
  const parked = () => sim.rig.storage !== 'mongodb'
  return (
    <group
      ref={group}
      onClick={(e) => {
        e.stopPropagation()
        if (parked()) deploy('storage', 'mongodb')
      }}
      {...hover(tip, () => 'MongoDB · document stacker', () => (parked() ? 'Parked · click to roll it in' : 'A sheet per stored document'))}
    >
      <Box size={[1.5, 0.3, 1.2]} position={[0, 0.15, 0]} color={c.mongo} edge={BRAND.mongo} />
      <Flat texture={label} size={[1.4, 0.56]} position={[0, 0.01, 1.0]} />
      {Array.from({ length: count }, (_, i) => (
        <mesh key={i} ref={i === count - 1 ? last : undefined} position={[Math.sin(i * 2.3) * 0.04, 0.32 + i * 0.06, Math.cos(i * 1.7) * 0.03]} rotation={[0, Math.sin(i * 1.1) * 0.05, 0]}>
          <boxGeometry args={[1.0, 0.035, 0.74]} />
          <meshStandardMaterial color={c.surface} roughness={1} />
          <Edges color={BRAND.mongo} />
        </mesh>
      ))}
      <Line points={[[0.55, 0.3, -0.45], [0.55, 2.2, -0.45]]} color={BRAND.mongo} lineWidth={1.2} />
      <group ref={leaf} position={[0.55, 2.2, -0.45]}>
        <mesh>
          <shapeGeometry args={[shape]} />
          <meshBasicMaterial color={BRAND.leaf} transparent opacity={0.22} side={2} depthWrite={false} />
          <Edges color={BRAND.mongo} />
        </mesh>
        <Line points={[[0, 0, 0], [0, 1.6, 0]]} color={BRAND.mongo} lineWidth={1} />
      </group>
    </group>
  )
}

export function Cable({ sim, c }: Omit<Common, 'tip'>) {
  const cable = useSegments(24, c.edge)
  const balls = useRef<(Mesh | null)[]>([])
  useFrame(() => {
    const s = sim.stores[sim.rig.storage]
    const end = v.copy(s.pos).add(new Vector3(-0.76, 0.5, 0))
    const w = segmentWriter(cable)
    let px = PORT.x, py = PORT.y + 0.02, pz = PORT.z
    for (let i = 1; i <= 16; i++) {
      const t = i / 16
      const x = PORT.x + (end.x - PORT.x) * t
      const z = PORT.z + (end.z - PORT.z) * t
      const y = PORT.y + 0.02 + (end.y - PORT.y) * t * t - Math.sin(t * Math.PI) * 0.12
      w.add(px, py, pz, x, y, z)
      px = x; py = y; pz = z
    }
    w.done()
    balls.current.forEach((m, i) => {
      if (!m) return
      const pl = sim.pulses[i]
      m.visible = !!pl
      if (!pl) return
      const path = pl.path
      path[path.length - 1].copy(end)
      const total = path.slice(1).reduce((sum, p, k) => sum + p.distanceTo(path[k]), 0)
      let left = pl.t * total
      for (let k = 1; k < path.length; k++) {
        const seg = path[k].distanceTo(path[k - 1])
        if (left <= seg || k === path.length - 1) {
          m.position.lerpVectors(path[k - 1], path[k], Math.min(1, left / seg))
          break
        }
        left -= seg
      }
    })
  })
  return (
    <>
      <primitive object={cable} />
      <Box size={[0.3, 0.16, 0.3]} position={[PORT.x - 0.1, BY + 0.08, PORT.z]} color={c.surface} edge={c.edge} />
      {Array.from({ length: 10 }, (_, i) => (
        <mesh key={i} ref={(m) => { balls.current[i] = m }} visible={false}>
          <sphereGeometry args={[0.09, 12, 12]} />
          <meshBasicMaterial color={ACCENT} toneMapped={false} />
        </mesh>
      ))}
    </>
  )
}

const KIT_COLOR: Record<TransportId, string> = { belt: BRAND.npm, depot: BRAND.pnpm, tube: BRAND.bun }
const UNIT_COLOR = { arm: '', drone: BRAND.claude, walker: BRAND.codex }

export function Hangar({ sim, c, tip, deploy, rig }: Common & { deploy: Deploy; rig: Rig }) {
  const frame = useMemo(() => {
    const { x0, x1, z0, z1, h } = HANGAR
    const pts: number[] = []
    const rect = (y: number) => pts.push(x0, y, z0, x1, y, z0, x1, y, z0, x1, y, z1, x1, y, z1, x0, y, z1, x0, y, z1, x0, y, z0)
    rect(0.005)
    for (let x = x0; x <= x1 + 1e-3; x += (x1 - x0) / 6) pts.push(x, 0, z0, x, h, z0)
    for (let z = z0; z <= z1 + 1e-3; z += (z1 - z0) / 6) pts.push(x1, 0, z, x1, h, z)
    pts.push(x0, h, z0, x1, h, z0, x1, h, z0, x1, h, z1)
    for (const id of ['arm', 'drone', 'walker'] as const) circle(pts, PAD[id].x, 0.01, PAD[id].z, 1.9, 56, true)
    for (const id of ['postgres', 'mongodb'] as const) circle(pts, STORE_PAD[id].x, 0.01, STORE_PAD[id].z, 1.25, 40, true)
    for (const id of ['belt', 'depot', 'tube'] as const) circle(pts, KIT_PAD[id].x, 0.01, KIT_PAD[id].z, 1.15, 40, true)
    return staticSegments(pts, c.edge)
  }, [c.edge])
  const title = useMemo(() => textTexture(1000, 120, (ctx) => {
    ctx.fillStyle = c.fg
    ctx.font = `500 56px ${FONT}`
    ctx.fillText('HANGAR', 0, 76)
    ctx.fillStyle = c.muted
    ctx.font = `400 42px ${FONT}`
    ctx.fillText('idle machines · click one to deploy', 250, 76)
  }), [c])
  const plates = useMemo(() => {
    const out: { key: string; tex: ReturnType<typeof plateTexture>; at: [number, number, number] }[] = []
    for (const m of MACHINES.integrator) {
      const live = rig.integrator === m.id
      const pad = PAD[m.id as keyof typeof PAD]
      out.push({ key: m.id, tex: plateTexture(c, UNIT_COLOR[m.id as keyof typeof UNIT_COLOR] || c.fg, m.brand, m.model, live ? 'on the job' : 'parked · click to launch', live), at: [pad.x, 0.012, pad.z + 2.35] })
    }
    for (const m of MACHINES.storage) {
      const live = rig.storage === m.id
      const pad = STORE_PAD[m.id as keyof typeof STORE_PAD]
      out.push({ key: m.id, tex: plateTexture(c, m.id === 'postgres' ? BRAND.postgres : BRAND.mongo, m.brand, m.model, live ? 'wired to the cell' : 'parked · click to roll in', live), at: [pad.x, 0.012, pad.z + 1.85] })
    }
    for (const m of MACHINES.transport) {
      const live = rig.transport === m.id
      const pad = KIT_PAD[m.id as TransportId]
      out.push({ key: m.id, tex: plateTexture(c, KIT_COLOR[m.id as TransportId], m.brand, m.model, live ? 'deployed on the floor' : 'kit · click to install', live), at: [pad.x, 0.012, pad.z + 1.5] })
    }
    return out
  }, [c, rig])
  return (
    <group>
      <primitive object={frame} />
      <Flat texture={title} size={[7.0, 0.84]} position={[HANGAR.x0 + 3.6, 0.01, HANGAR.z1 + 0.75]} />
      {plates.map((p) => <Flat key={p.key} texture={p.tex} size={[3.4, 1.06]} position={p.at} />)}
      {(['belt', 'depot', 'tube'] as const).map((id) => <Kit key={id} id={id} sim={sim} c={c} tip={tip} deploy={deploy} />)}
    </group>
  )
}

function Kit({ id, sim, c, tip, deploy }: Common & { id: TransportId; deploy: Deploy }) {
  const group = useRef<Group>(null)
  const [hot, setHot] = useState(false)
  const k = KIT_COLOR[id]
  useFrame((_, dt) => {
    const g = group.current!
    const deployed = sim.rig.transport === id
    g.position.y += ((hot && !deployed ? 0.35 : 0) + Math.sin(sim.time * 1.4 + KIT_PAD[id].x) * 0.04 - g.position.y) * (1 - Math.exp(-dt * 8))
    g.scale.setScalar(0.92 + (1 - sim.show[id]) * 0.08)
    g.traverse((o) => {
      const mat = (o as Mesh).material as MeshStandardMaterial | undefined
      if (mat && 'opacity' in mat) {
        mat.transparent = true
        mat.opacity = 0.25 + (1 - sim.show[id]) * 0.75
      }
    })
  })
  const pad = KIT_PAD[id]
  return (
    <group position={[pad.x, 0, pad.z]}>
      <group
        ref={group}
        onClick={(e) => {
          e.stopPropagation()
          if (sim.rig.transport !== id) deploy('transport', id)
        }}
        onPointerOver={(e) => {
          e.stopPropagation()
          setHot(true)
          tip.show(e.nativeEvent, `${machine('transport', id).brand} · ${machine('transport', id).model}`, sim.rig.transport === id ? 'Deployed on the floor' : 'Click to install this transport')
        }}
        onPointerMove={(e) => tip.move(e.nativeEvent)}
        onPointerOut={() => {
          setHot(false)
          tip.hide()
        }}
      >
        {id === 'belt' && (
          <>
            <Box size={[1.8, 0.22, 0.6]} position={[0, 0.35, 0]} color={c.surface} edge={c.edge} />
            <Box size={[1.8, 0.04, 0.04]} position={[0, 0.46, 0.32]} color={k} edge={k} />
            {[-0.9, 0.9].map((x) => (
              <mesh key={x} position={[x, 0.35, 0]} rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.12, 0.12, 0.62, 16]} />
                <meshStandardMaterial color={c.surface} roughness={1} />
                <Edges color={c.edge} threshold={20} />
              </mesh>
            ))}
            {[-0.6, 0, 0.6].map((x) => <Box key={x} size={[0.3, 0.06, 0.24]} position={[x, 0.49, 0]} color={c.surface} edge={k} />)}
          </>
        )}
        {id === 'depot' && (
          <>
            <mesh position={[0, 0.7, 0]}>
              <cylinderGeometry args={[0.5, 0.5, 1.3, 8]} />
              <meshStandardMaterial color={c.surface} roughness={1} />
              <Edges color={c.edge} />
            </mesh>
            <mesh position={[0, 1.45, 0]}>
              <coneGeometry args={[0.5, 0.25, 8]} />
              <meshStandardMaterial color={c.surface} roughness={1} />
              <Edges color={k} />
            </mesh>
            {[0, 1, 2].map((i) => <Box key={i} size={[0.36, 0.04, 0.28]} position={[0, 0.2 + i * 0.07, 0]} rotation={[0, i, 0]} color={k} edge={k} />)}
          </>
        )}
        {id === 'tube' && (
          <>
            <mesh position={[0, 0.25, 0]}>
              <torusGeometry args={[0.85, 0.16, 10, 36, Math.PI]} />
              <meshStandardMaterial color={c.surface} roughness={1} />
              <Edges color={c.edge} threshold={25} />
            </mesh>
            {[-0.85, 0.85].map((x) => (
              <mesh key={x} position={[x, 0.2, 0]} rotation={[Math.PI / 2, 0, 0]}>
                <torusGeometry args={[0.2, 0.025, 6, 20]} />
                <meshBasicMaterial color={k} />
              </mesh>
            ))}
          </>
        )}
      </group>
    </group>
  )
}

const cache = new Map<string, Texture>()
const loader = new TextureLoader()
function useImage(url: string | undefined, block: boolean) {
  const [texture, setTexture] = useState<Texture | null>(() => (url ? (cache.get(url) ?? null) : null))
  useEffect(() => {
    if (!url) return setTexture(null)
    const hit = cache.get(url)
    if (hit) return setTexture(hit)
    let live = true
    loader.load(url, (t) => {
      t.colorSpace = SRGBColorSpace
      t.anisotropy = 4
      const img = t.image as HTMLImageElement
      const aspect = img.height / img.width
      const want = block ? 0.6 / 0.82 : 1
      if (aspect > want) {
        t.repeat.set(1, want / aspect)
        t.offset.set(0, 1 - want / aspect)
      }
      cache.set(url, t)
      if (live) setTexture(t)
    })
    return () => {
      live = false
    }
  }, [url, block])
  return texture
}

function PartMesh({ p, lab, sim, c, tip }: Common & { p: Part; lab: Lab }) {
  const ref = useRef<Mesh>(null)
  const [hot, setHot] = useState(false)
  const image = lab.theme === 'dark' ? (p.item.imageDark ?? p.item.image) : p.item.image
  const texture = useImage(image, p.item.kind === 'block')
  const [ghost, setGhost] = useState(p.ghost)
  useFrame(() => {
    const m = ref.current
    if (!m) return
    if (p.ghost !== ghost) setGhost(p.ghost)
    m.position.copy(p.pos)
    if (hot && p.phase === 'seated') m.position.y += 0.12
    m.scale.setScalar(Math.max(0.001, p.scale))
    m.rotation.set(p.spin * 0.3, p.rot + p.spin, Math.sin(sim.time * 22) * 0.16 * p.wob)
  })
  const side = tint(p.item.hue, c)
  const op = ghost ? 0.22 : 1
  return (
    <mesh
      ref={ref}
      position={p.pos}
      onClick={(e) => {
        e.stopPropagation()
        setHot(false)
        tip.hide()
        lab.toggle(p.ref)
      }}
      onPointerOver={(e) => {
        e.stopPropagation()
        setHot(true)
        const how = p.ghost ? 'hard link to the pnpm store' : p.mark === 'drone' ? 'welded by Claude Code' : p.mark === 'walker' ? 'etched by Codex' : p.mark === 'arm' ? 'seated by hand' : 'in transit'
        tip.show(e.nativeEvent, p.item.title, `${p.item.label} · ${how} · click to send back`)
      }}
      onPointerMove={(e) => tip.move(e.nativeEvent)}
      onPointerOut={() => {
        setHot(false)
        tip.hide()
      }}
    >
      <boxGeometry args={p.size} />
      {[0, 1, 3, 4, 5].map((i) => (
        <meshStandardMaterial key={i} attach={`material-${i}`} color={side} roughness={1} transparent={ghost} opacity={op} depthWrite={!ghost} />
      ))}
      {texture ? (
        <meshBasicMaterial attach="material-2" map={texture} toneMapped={false} transparent={ghost} opacity={ghost ? 0.55 : 1} />
      ) : (
        <meshStandardMaterial attach="material-2" color={tint(p.item.hue, c, c.l + 12)} roughness={1} transparent={ghost} opacity={op} />
      )}
      <Edges color={hot || p.phase === 'carried' ? ACCENT : ghost ? BRAND.pnpm : c.edge} />
    </mesh>
  )
}

export function Parts({ sim, lab, c, tip, version }: Common & { lab: Lab; version: number }) {
  const beads = useRef<InstancedMesh>(null)
  const etch = useSegments(2400, BRAND.codex)
  useFrame(() => {
    const m = beads.current!
    let n = 0
    const w = segmentWriter(etch)
    for (const p of sim.live) {
      if (p.phase !== 'seated' && !(p.phase === 'home' && p.fly && p.mark)) continue
      const cs = Math.cos(p.rot), sn = Math.sin(p.rot)
      const [sx, sy, sz] = p.size
      if (p.mark === 'drone' && p.phase === 'seated') {
        const shown = Math.floor(p.finish * 4 + 1e-4)
        const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]]
        for (let k = 0; k < shown && n < 2000; k++) {
          const [a, b] = corners[k]
          const x = a * (sx / 2 + 0.035), z = b * (sz / 2 + 0.035)
          dummy.position.set(p.pos.x + x * cs + z * sn, p.pos.y - sy / 2 + 0.03, p.pos.z - x * sn + z * cs)
          dummy.rotation.set(0, 0, 0)
          dummy.scale.setScalar(1)
          dummy.updateMatrix()
          m.setMatrixAt(n++, dummy.matrix)
        }
      }
      if (p.mark === 'walker' && p.phase === 'seated') {
        const hx = sx / 2 - 0.07, hz = sz / 2 - 0.07
        const loop = [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz], [-hx, -hz]]
        const per = [2 * hx, 2 * hz, 2 * hx, 2 * hz]
        let left = p.finish * (per[0] + per[1] + per[2] + per[3])
        const y = p.pos.y + sy / 2 + 0.006
        for (let k = 0; k < 4 && left > 0; k++) {
          const t = Math.min(1, left / per[k])
          left -= per[k]
          const [ax, az] = loop[k], [bx, bz] = loop[k + 1]
          const ex = ax + (bx - ax) * t, ez = az + (bz - az) * t
          w.add(p.pos.x + ax * cs + az * sn, y, p.pos.z - ax * sn + az * cs, p.pos.x + ex * cs + ez * sn, y, p.pos.z - ex * sn + ez * cs)
        }
        if (p.finish >= 1) {
          const a = [-hx * 0.4, 0], b = [-hx * 0.1, -hz * 0.4], d = [hx * 0.45, hz * 0.45]
          for (const [u0, u1] of [[a, b], [b, d]]) w.add(p.pos.x + u0[0] * cs + u0[1] * sn, y, p.pos.z - u0[0] * sn + u0[1] * cs, p.pos.x + u1[0] * cs + u1[1] * sn, y, p.pos.z - u1[0] * sn + u1[1] * cs)
        }
      }
    }
    m.count = n
    m.instanceMatrix.needsUpdate = true
    w.done()
  })
  void version
  return (
    <>
      {sim.live.map((p) => <PartMesh key={p.ref} p={p} lab={lab} sim={sim} c={c} tip={tip} />)}
      <instancedMesh ref={beads} args={[undefined, undefined, 2000]} frustumCulled={false}>
        <sphereGeometry args={[0.05, 10, 8]} />
        <meshStandardMaterial color={BRAND.bead} roughness={0.35} metalness={0.4} emissive={BRAND.claude} emissiveIntensity={0.25} />
      </instancedMesh>
      <primitive object={etch} />
    </>
  )
}
