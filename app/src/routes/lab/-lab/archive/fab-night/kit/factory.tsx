/**
 * The line's meshes. Everything that never moves (cabinet carcass, table,
 * belt frame, arm base, board slab) is one fill mesh and one hairline set;
 * the arm is two instanced meshes and one hairline buffer; every part is
 * one instanced body, one instanced hairline set and one instanced top whose
 * screenshot lives in a shared atlas, so draw calls stay flat as parts pile up.
 */
import { useFrame, useThree } from '@react-three/fiber'
import type { ThreeEvent } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  BoxGeometry, BufferAttribute, BufferGeometry, CanvasTexture, Color, CylinderGeometry, DynamicDrawUsage, Float32BufferAttribute,
  InstancedBufferAttribute, InstancedBufferGeometry, InstancedMesh, LineBasicMaterial, LineSegments, LinearFilter, LinearMipmapLinearFilter,
  Matrix4, MeshBasicMaterial, MeshStandardMaterial, Object3D, PerspectiveCamera, PlaneGeometry, Points, SRGBColorSpace, Sphere, Vector2, Vector3,
} from 'three'
import type { Group, Mesh, Sprite } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import { agents } from '../../../../../workspace/-workspace/workspace.constants'
import { play } from '../../../kit/sound'
import type { Guard } from '../../../kit/touch'
import type { Lab } from '../../../lab.types'
import type { Aisle } from '../../../warehouse'
import {
  APPLY, ARM, BASE, BELT, BELT_LEN, BOARD, DRAWER, FONT, PAGE, REDUCED_MOTION, SLATS, TABLE, TABLE_Y, bandOf, boxEdges, clamp, textTexture, tint,
} from './contract'
import type { Look } from './contract'
import { applyPage, drawerPos, matchItem, padPos } from './sim'
import type { Part, Sim } from './sim'

export type Tip = { show: (e: PointerEvent, title: string, sub: string) => void; move: (e: PointerEvent) => void; hide: () => void }

/** One merged hairline LineSegments from a flat xyz pair list. */
export function Hairlines({ segs, color, opacity = 1, depthTest = true }: { segs: number[]; color: string; opacity?: number; depthTest?: boolean }) {
  const geometry = useMemo(() => new BufferGeometry().setAttribute('position', new Float32BufferAttribute(segs, 3)), [segs])
  useEffect(() => () => geometry.dispose(), [geometry])
  return (
    <lineSegments geometry={geometry} frustumCulled={false}>
      <lineBasicMaterial color={color} transparent={opacity < 1} opacity={opacity} depthTest={depthTest} />
    </lineSegments>
  )
}

function cylinderEdges(out: number[], cx: number, cy: number, cz: number, r: number, h: number, axis: 'y' | 'z', n = 24) {
  for (const sign of [-1, 1]) {
    for (let k = 0; k < n; k++) {
      const a0 = (k / n) * Math.PI * 2, a1 = ((k + 1) / n) * Math.PI * 2
      if (axis === 'y') out.push(cx + Math.cos(a0) * r, cy + (sign * h) / 2, cz + Math.sin(a0) * r, cx + Math.cos(a1) * r, cy + (sign * h) / 2, cz + Math.sin(a1) * r)
      else out.push(cx + Math.cos(a0) * r, cy + Math.sin(a0) * r, cz + (sign * h) / 2, cx + Math.cos(a1) * r, cy + Math.sin(a1) * r, cz + (sign * h) / 2)
    }
  }
}

const BOARD_THICK = 0.08
const ROWS = 24
const CAB = { w: DRAWER.gapX * 3 + 0.1, h: DRAWER.gapY * 6 + 0.1, cx: DRAWER.x0 + DRAWER.gapX, cz: DRAWER.front - DRAWER.d / 2 - 0.05 }
const TBL = { cx: (TABLE.x0 + TABLE.x1) / 2, w: TABLE.x1 - TABLE.x0, cz: (TABLE.z0 + TABLE.z1) / 2, d: TABLE.z1 - TABLE.z0 }
const TABLE_LEGS: [number, number][] = [[TABLE.x0 + 0.15, TABLE.z0 + 0.15], [TABLE.x1 - 0.15, TABLE.z0 + 0.15], [TABLE.x0 + 0.15, TABLE.z1 - 0.15], [TABLE.x1 - 0.15, TABLE.z1 - 0.15]]
const BELT_MID = (BELT.start + BELT.end) / 2

type Solid = { geo: BufferGeometry; color: 'surface' | 'board' }
const box = (x: number, y: number, z: number, w: number, h: number, d: number, color: Solid['color'] = 'surface'): Solid => ({ geo: new BoxGeometry(w, h, d).translate(x, y, z), color })

/** The static carcass of the line: geometry, then one colour pass per look. */
function staticSolids(): Solid[] {
  const roller = (x: number): Solid => ({ geo: new CylinderGeometry(0.25, 0.25, 1.34, 20).rotateX(Math.PI / 2).translate(x, BELT.y - 0.25, BELT.z), color: 'surface' })
  return [
    box(CAB.cx, DRAWER.base + CAB.h + 0.02, CAB.cz, CAB.w, 0.12, DRAWER.d + 0.2),
    box(CAB.cx, DRAWER.base / 2, CAB.cz, CAB.w, DRAWER.base, DRAWER.d + 0.2),
    box(CAB.cx, DRAWER.base + CAB.h / 2, DRAWER.front - DRAWER.d - 0.1, CAB.w, CAB.h, 0.1),
    box(TBL.cx, TABLE_Y - 0.06, TBL.cz, TBL.w, 0.12, TBL.d),
    ...TABLE_LEGS.map(([x, z]) => box(x, (TABLE_Y - 0.12) / 2, z, 0.12, TABLE_Y - 0.12, 0.12)),
    box(BELT_MID, BELT.y - 0.29, BELT.z, BELT_LEN, 0.42, 1.3),
    box(BELT_MID, BELT.y, BELT.z - 0.7, BELT_LEN + 0.1, 0.16, 0.08),
    box(BELT_MID, BELT.y, BELT.z + 0.7, BELT_LEN + 0.1, 0.16, 0.08),
    roller(BELT.start - 0.5),
    roller(BELT.end + 0.5),
    { geo: new CylinderGeometry(0.9, 1.0, 0.36, 36).translate(BASE.x, 0.18, BASE.z), color: 'surface' },
    { geo: new CylinderGeometry(0.38, 0.5, ARM.h0 - 0.36, 24).translate(BASE.x, (ARM.h0 + 0.36) / 2, BASE.z), color: 'surface' },
    box((BOARD.x0 + BOARD.x1) / 2, BOARD.y - BOARD_THICK / 2, (BOARD.z0 + BOARD.z1) / 2, BOARD.x1 - BOARD.x0, BOARD_THICK, BOARD.z1 - BOARD.z0, 'board'),
  ]
}

function staticEdges(aisles: number) {
  const segs: number[] = []
  boxEdges(segs, CAB.cx, DRAWER.base + CAB.h + 0.02, CAB.cz, CAB.w, 0.12, DRAWER.d + 0.2)
  boxEdges(segs, CAB.cx, DRAWER.base / 2, CAB.cz, CAB.w, DRAWER.base, DRAWER.d + 0.2)
  boxEdges(segs, CAB.cx, DRAWER.base + CAB.h / 2, DRAWER.front - DRAWER.d - 0.1, CAB.w, CAB.h, 0.1)
  const at = new Vector3()
  for (let i = 0; i < Math.min(aisles, ROWS); i++) {
    drawerPos(i, at)
    boxEdges(segs, at.x, at.y, DRAWER.front - DRAWER.d / 2, DRAWER.w, DRAWER.h, DRAWER.d)
  }
  boxEdges(segs, TBL.cx, TABLE_Y - 0.06, TBL.cz, TBL.w, 0.12, TBL.d)
  for (const [x, z] of TABLE_LEGS) boxEdges(segs, x, (TABLE_Y - 0.12) / 2, z, 0.12, TABLE_Y - 0.12, 0.12)
  boxEdges(segs, BELT_MID, BELT.y - 0.29, BELT.z, BELT_LEN, 0.42, 1.3)
  boxEdges(segs, BELT_MID, BELT.y, BELT.z - 0.7, BELT_LEN + 0.1, 0.16, 0.08)
  boxEdges(segs, BELT_MID, BELT.y, BELT.z + 0.7, BELT_LEN + 0.1, 0.16, 0.08)
  for (const x of [BELT.start - 0.5, BELT.end + 0.5]) cylinderEdges(segs, x, BELT.y - 0.25, BELT.z, 0.25, 1.34, 'z', 20)
  for (const [x, z] of [[BELT.start + 0.4, 0.95], [BELT.end - 0.4, 0.95], [BELT.start + 0.4, 2.25], [BELT.end - 0.4, 2.25]]) boxEdges(segs, x, (BELT.y - 0.5) / 2, z, 0.12, BELT.y - 0.5, 0.12)
  cylinderEdges(segs, BASE.x, 0.18, BASE.z, 0.95, 0.36, 'y', 36)
  cylinderEdges(segs, BASE.x, (ARM.h0 + 0.36) / 2, BASE.z, 0.44, ARM.h0 - 0.36, 'y', 24)
  return segs
}

/** Cabinet carcass, table, belt frame, arm base and board slab: two draw calls. */
export function Static({ c, aisles }: { c: Look; aisles: number }) {
  const fill = useMemo(() => {
    const solids = staticSolids()
    const counts = solids.map((s) => s.geo.getAttribute('position').count)
    const geo = mergeGeometries(solids.map((s) => s.geo))!
    solids.forEach((s) => s.geo.dispose())
    geo.setAttribute('color', new BufferAttribute(new Float32Array(geo.getAttribute('position').count * 3), 3))
    return { geo, kinds: solids.map((s) => s.color), counts }
  }, [])
  useLayoutEffect(() => {
    const colors = fill.geo.getAttribute('color') as BufferAttribute
    const surface = new Color(c.surface), board = new Color(c.board)
    let v = 0
    fill.kinds.forEach((kind, i) => {
      const col = kind === 'board' ? board : surface
      for (let k = 0; k < fill.counts[i]; k++, v++) colors.setXYZ(v, col.r, col.g, col.b)
    })
    colors.needsUpdate = true
  }, [fill, c.surface, c.board])
  useEffect(() => () => fill.geo.dispose(), [fill])
  const edges = useMemo(() => staticEdges(aisles), [aisles])
  return (
    <>
      <mesh geometry={fill.geo} raycast={() => null}>
        <meshStandardMaterial vertexColors roughness={0.9} />
      </mesh>
      <Hairlines segs={edges} color={c.edge} />
    </>
  )
}

/** Drawers slide out of the cabinet, so the sphere three caches on first raycast must cover them all. */
const CABINET_SPHERE = new Sphere(new Vector3(CAB.cx, 2.5, DRAWER.front), 5)

/** `bare` (phones) keeps each drawer's colour tab and drops the lettering, which would be a few pixels tall. */
export function Cabinet({ aisles, active, matches, onOpen, c, tip, guard, sim, ready, bare }: {
  aisles: readonly Aisle[]; active: number; matches: number[] | null; onOpen: (i: number) => void; c: Look; tip: Tip; guard: Guard; sim: Sim; ready: boolean; bare: boolean
}) {
  const inst = useRef<InstancedMesh>(null)
  const dummy = useMemo(() => new Object3D(), [])
  const at = useMemo(() => new Vector3(), [])
  const atlas = useMemo(
    () =>
      !ready
        ? null
        : textTexture(512, 96 * ROWS, (ctx) => {
            aisles.forEach((aisle, i) => {
              if (i >= ROWS) return
              const y = 96 * (ROWS - 1 - i)
              const none = matches && !matches[i]
              ctx.fillStyle = c.surface
              ctx.fillRect(0, y, 512, 96)
              ctx.globalAlpha = none ? 0.3 : 1
              ctx.fillStyle = tint(aisle.hue, c)
              if (bare) {
                ctx.fillRect(26, y + 24, 460, 48)
                ctx.globalAlpha = 1
                return
              }
              ctx.fillRect(26, y + 30, 10, 36)
              ctx.fillStyle = c.fg
              ctx.font = `500 34px ${FONT}`
              ctx.textAlign = 'left'
              ctx.fillText(aisle.label.length > 14 ? `${aisle.label.slice(0, 13)}…` : aisle.label, 52, y + 60)
              ctx.fillStyle = matches && matches[i] ? c.accent : c.muted
              ctx.font = `400 26px ${FONT}`
              ctx.textAlign = 'right'
              ctx.fillText(matches ? `${matches[i]}/${aisle.count}` : String(aisle.count), 486, y + 60)
              ctx.globalAlpha = 1
            })
          }),
    [aisles, c, matches, ready, bare],
  )
  useEffect(() => () => atlas?.dispose(), [atlas])
  const geometry = useMemo(() => {
    const g = new BoxGeometry(DRAWER.w, DRAWER.h, DRAWER.d)
    g.clearGroups()
    g.addGroup(0, 24, 0)
    g.addGroup(24, 6, 1)
    g.addGroup(30, 6, 0)
    const rows = new Float32Array(ROWS)
    for (let i = 0; i < ROWS; i++) rows[i] = i
    g.setAttribute('aRow', new InstancedBufferAttribute(rows, 1))
    return g
  }, [])
  useEffect(() => () => geometry.dispose(), [geometry])
  const materials = useMemo(() => {
    const body = new MeshStandardMaterial({ color: c.surface, roughness: 0.9 })
    if (!atlas) return [body, new MeshBasicMaterial({ color: c.surface, toneMapped: false })]
    const front = new MeshBasicMaterial({ map: atlas, toneMapped: false })
    front.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aRow;')
        .replace('#include <uv_vertex>', `#include <uv_vertex>\nvMapUv = vec2(vMapUv.x, (vMapUv.y + aRow) / ${ROWS}.0);`)
    }
    return [body, front]
  }, [atlas, c.surface])
  useEffect(() => () => materials.forEach((m) => m.dispose()), [materials])
  const activeEdges = useMemo(() => {
    const segs: number[] = []
    boxEdges(segs, 0, 0, 0, DRAWER.w + 0.01, DRAWER.h + 0.01, DRAWER.d + 0.01)
    return segs
  }, [])
  const activeRef = useRef<Group>(null)
  useLayoutEffect(() => {
    if (inst.current) inst.current.boundingSphere = CABINET_SPHERE
  }, [])
  const n = Math.min(ROWS, aisles.length)
  useFrame(() => {
    const m = inst.current
    if (!m) return
    for (let i = 0; i < n; i++) {
      drawerPos(i, at)
      dummy.position.set(at.x, at.y, DRAWER.front - DRAWER.d / 2 + (sim.drawers[i] ?? 0))
      dummy.updateMatrix()
      m.setMatrixAt(i, dummy.matrix)
    }
    m.instanceMatrix.needsUpdate = true
    const g = activeRef.current
    if (g && aisles[active]) {
      drawerPos(active, at)
      g.position.set(at.x, at.y, DRAWER.front - DRAWER.d / 2 + (sim.drawers[active] ?? 0))
    }
  }, APPLY)
  const hit = (e: { instanceId?: number }) => e.instanceId ?? -1
  return (
    <group>
      <instancedMesh
        ref={inst}
        args={[geometry, undefined, ROWS]}
        material={materials}
        count={n}
        onClick={(e) => { e.stopPropagation(); const i = hit(e); if (!guard.moved && i >= 0) onOpen(i) }}
        onPointerOver={(e) => {
          e.stopPropagation()
          const aisle = aisles[hit(e)]
          if (aisle) tip.show(e.nativeEvent, aisle.label, `Aisle ${String(aisle.no).padStart(2, '0')} · ${aisle.count} parts · ${aisle.racks.length} registries`)
        }}
        onPointerMove={(e) => tip.move(e.nativeEvent)}
        onPointerOut={() => tip.hide()}
      />
      <group ref={activeRef}>
        <Hairlines segs={activeEdges} color={c.accent} />
      </group>
    </group>
  )
}

export function Table({ c, count, label, pages, page, setPage, tip, guard, ready, bare }: {
  c: Look; count: number; label: string; pages: number; page: number; setPage: (n: number) => void; tip: Tip; guard: Guard; ready: boolean; bare: boolean
}) {
  const strip = useMemo(
    () =>
      !ready
        ? null
        : textTexture(1024, 96, (ctx) => {
            ctx.fillStyle = c.surface
            ctx.fillRect(0, 0, 1024, 96)
            if (!bare) {
              ctx.fillStyle = c.muted
              ctx.font = `500 34px ${FONT}`
              ctx.fillText(label, 110, 60)
              ctx.textAlign = 'right'
              ctx.fillStyle = c.fg
              ctx.fillText(`${page + 1} / ${pages}`, 910, 60)
            }
            ctx.strokeStyle = pages > 1 ? c.fg : c.dim
            ctx.lineWidth = 4
            ctx.beginPath()
            ctx.moveTo(60, 28); ctx.lineTo(36, 48); ctx.lineTo(60, 68)
            ctx.moveTo(964, 28); ctx.lineTo(988, 48); ctx.lineTo(964, 68)
            ctx.stroke()
          }),
    [c, label, page, pages, ready, bare],
  )
  useEffect(() => () => strip?.dispose(), [strip])
  const pads = useMemo(() => {
    const segs: number[] = []
    const y = TABLE_Y + 0.004
    const p = new Vector3()
    for (let i = 0; i < Math.min(count, PAGE); i++) {
      padPos(i, p)
      const x0 = p.x - 0.52, x1 = p.x + 0.52, z0 = p.z - 0.4, z1 = p.z + 0.4
      const dash = (ax: number, az: number, bx: number, bz: number) => {
        const len = Math.hypot(bx - ax, bz - az), n = Math.round(len / 0.14)
        for (let k = 0; k < n; k++) {
          const t0 = k / n, t1 = (k + 0.55) / n
          segs.push(ax + (bx - ax) * t0, y, az + (bz - az) * t0, ax + (bx - ax) * t1, y, az + (bz - az) * t1)
        }
      }
      dash(x0, z0, x1, z0); dash(x1, z0, x1, z1); dash(x1, z1, x0, z1); dash(x0, z1, x0, z0)
    }
    return segs
  }, [count])
  return (
    <group>
      {pads.length > 0 && <Hairlines segs={pads} color={c.edge} opacity={0.7} />}
      <mesh
        position={[TBL.cx, TABLE_Y + 0.005, TABLE.z1 - 0.38]}
        rotation={[-Math.PI / 2, 0, 0]}
        onClick={(e) => {
          e.stopPropagation()
          if (guard.moved || pages < 2) return
          setPage((page + (e.point.x - TBL.cx < 0 ? pages - 1 : 1)) % pages)
        }}
        onPointerOver={(e) => { e.stopPropagation(); tip.show(e.nativeEvent, 'Pick tray', pages > 1 ? 'Click left or right half to change bay' : 'One bay') }}
        onPointerMove={(e) => tip.move(e.nativeEvent)}
        onPointerOut={() => tip.hide()}
      >
        <planeGeometry args={[TBL.w - 0.3, (TBL.w - 0.3) * (96 / 1024)]} />
        <meshBasicMaterial map={strip} color={strip ? '#ffffff' : c.surface} toneMapped={false} />
      </mesh>
    </group>
  )
}

export function Belt({ c, sim }: { c: Look; sim: Sim }) {
  const slats = useRef<LineSegments>(null)
  const slatGeometry = useMemo(() => {
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(new Float32Array(SLATS * 6), 3).setUsage(DynamicDrawUsage))
    return g
  }, [])
  useEffect(() => () => slatGeometry.dispose(), [slatGeometry])
  const shown = useRef(-1)
  useFrame(() => {
    if (!slats.current || shown.current === sim.beltOffset) return
    shown.current = sim.beltOffset
    const attr = slatGeometry.getAttribute('position') as BufferAttribute
    const arr = attr.array as Float32Array
    const offset = sim.beltOffset % (BELT_LEN / SLATS)
    for (let i = 0; i < SLATS; i++) {
      const x = BELT.start - 0.5 + (((i * BELT_LEN) / SLATS + offset) % BELT_LEN)
      const o = i * 6
      arr[o] = x; arr[o + 1] = BELT.y - 0.07; arr[o + 2] = BELT.z - 0.6
      arr[o + 3] = x; arr[o + 4] = BELT.y - 0.07; arr[o + 5] = BELT.z + 0.6
    }
    attr.needsUpdate = true
  }, APPLY)
  return (
    <lineSegments ref={slats} geometry={slatGeometry} frustumCulled={false}>
      <lineBasicMaterial color={c.edge} transparent opacity={0.8} />
    </lineSegments>
  )
}

const ARM_BOXES = 6
const ARM_CYLS = 3
const RING = 24
const UNIT_BOX_EDGES = (() => {
  const s: number[] = []
  boxEdges(s, 0, 0, 0, 1, 1, 1)
  return new Float32Array(s)
})()
const UNIT_CYL_EDGES = (() => {
  const s: number[] = []
  cylinderEdges(s, 0, 0, 0, 0.5, 1, 'y', RING)
  return new Float32Array(s)
})()
const ARM_VERTS = ARM_BOXES * (UNIT_BOX_EDGES.length / 3) + ARM_CYLS * (UNIT_CYL_EDGES.length / 3)
const ARM_SPHERE = new Sphere(new Vector3(BASE.x, 4, BASE.z), 16)
const cylGeometry = new CylinderGeometry(0.5, 0.5, 1, RING)
const boxGeometry = new BoxGeometry(1, 1, 1)

/**
 * The two-link arm by inverse kinematics: shoulder, elbow and wrist joints are
 * three instanced cylinders, links, gripper and fingers six instanced boxes,
 * and every hairline one buffer rewritten from the same matrices.
 */
export function Arm({ sim, c, wrist: wristOut }: { sim: Sim; c: Look; wrist: { current: Vector3 } }) {
  const boxes = useRef<InstancedMesh>(null)
  const cyls = useRef<InstancedMesh>(null)
  const kit = useMemo(() => {
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(ARM_VERTS * 3), 3).setUsage(DynamicDrawUsage))
    geometry.setAttribute('color', new BufferAttribute(new Float32Array(ARM_VERTS * 3), 3).setUsage(DynamicDrawUsage))
    return {
      geometry,
      M: Array.from({ length: 6 }, () => new Matrix4()),
      part: new Matrix4(), local: new Matrix4(),
      edge: new Color(), accent: new Color(), y: new Vector3(0, 1, 0), z: new Vector3(0, 0, 1),
    }
  }, [])
  useEffect(() => () => kit.geometry.dispose(), [kit])
  useLayoutEffect(() => {
    if (boxes.current) boxes.current.boundingSphere = ARM_SPHERE
    if (cyls.current) cyls.current.boundingSphere = ARM_SPHERE
  }, [])
  useFrame(() => {
    const b = boxes.current, cy = cyls.current
    if (!b || !cy) return
    const { h0, l1, l2 } = ARM
    const w = sim.arm.pos
    const dx = w.x - BASE.x, dz = w.z - BASE.z
    const yaw = Math.atan2(-dz, dx)
    const r = Math.max(Math.hypot(dx, dz), 0.001)
    const h = w.y - h0
    const d = clamp(Math.hypot(r, h), Math.abs(l1 - l2) + 0.05, l1 + l2 - 0.01)
    const phi = Math.atan2(h, r)
    const a = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1))
    const t1 = phi + a
    const t2 = Math.atan2(h - l1 * Math.sin(t1), r - l1 * Math.cos(t1))
    const open = 0.36 - sim.arm.grip * 0.1
    const [S, E, W, F0, F1, T] = kit.M
    const rot = (m: Matrix4, axis: Vector3, angle: number) => m.multiply(kit.local.makeRotationAxis(axis, angle))
    const move = (m: Matrix4, x: number, y: number, z: number) => m.multiply(kit.local.makeTranslation(x, y, z))
    S.makeTranslation(BASE.x, 0, BASE.z)
    rot(S, kit.y, yaw)
    move(S, 0, h0, 0)
    rot(S, kit.z, t1)
    rot(move(E.copy(S), l1, 0, 0), kit.z, t2 - t1)
    rot(move(W.copy(E), l2, 0, 0), kit.z, -t2)
    move(F0.copy(W), 0, 0, -open)
    move(F1.copy(W), 0, 0, open)
    wristOut.current.setFromMatrixPosition(W)

    kit.edge.set(c.edge)
    kit.accent.set(c.accent)
    const pos = kit.geometry.getAttribute('position') as BufferAttribute
    const col = kit.geometry.getAttribute('color') as BufferAttribute
    const pa = pos.array as Float32Array, ca = col.array as Float32Array
    let vi = 0
    const lines = (m: Matrix4, unit: Float32Array, hot: boolean) => {
      const e = m.elements
      const tint = hot ? kit.accent : kit.edge
      for (let k = 0; k < unit.length; k += 3) {
        const x = unit[k], y = unit[k + 1], z = unit[k + 2]
        pa[vi * 3] = e[0] * x + e[4] * y + e[8] * z + e[12]
        pa[vi * 3 + 1] = e[1] * x + e[5] * y + e[9] * z + e[13]
        pa[vi * 3 + 2] = e[2] * x + e[6] * y + e[10] * z + e[14]
        ca[vi * 3] = tint.r; ca[vi * 3 + 1] = tint.g; ca[vi * 3 + 2] = tint.b
        vi++
      }
    }
    const hot = !!sim.arm.holding
    const placeBox = (i: number, parent: Matrix4, x: number, y: number, z: number, sx: number, sy: number, sz: number, glow = false) => {
      T.copy(parent).multiply(kit.local.makeTranslation(x, y, z)).multiply(kit.part.makeScale(sx, sy, sz))
      b.setMatrixAt(i, T)
      lines(T, UNIT_BOX_EDGES, glow && hot)
    }
    const placeCyl = (i: number, parent: Matrix4, radius: number, length: number) => {
      T.copy(parent).multiply(kit.local.makeRotationX(Math.PI / 2)).multiply(kit.part.makeScale(radius * 2, length, radius * 2))
      cy.setMatrixAt(i, T)
      lines(T, UNIT_CYL_EDGES, false)
    }
    placeBox(0, S, l1 / 2, 0, 0.3, l1, 0.3, 0.3)
    placeBox(1, S, l1 / 2, 0, -0.3, l1, 0.3, 0.3)
    placeBox(2, E, l2 / 2, 0, 0, l2, 0.34, 0.34)
    placeBox(3, W, 0, -0.32, 0, 0.5, 0.3, 0.86, true)
    placeBox(4, F0, 0, -0.62, 0, 0.36, 0.38, 0.06, true)
    placeBox(5, F1, 0, -0.62, 0, 0.36, 0.38, 0.06, true)
    placeCyl(0, S, 0.42, 0.9)
    placeCyl(1, E, 0.36, 0.95)
    placeCyl(2, W, 0.24, 0.6)
    b.instanceMatrix.needsUpdate = true
    cy.instanceMatrix.needsUpdate = true
    pos.needsUpdate = true
    col.needsUpdate = true
  }, APPLY)
  return (
    <group>
      <instancedMesh ref={boxes} args={[boxGeometry, undefined, ARM_BOXES]} frustumCulled={false}>
        <meshStandardMaterial color={c.surface} roughness={0.9} />
      </instancedMesh>
      <instancedMesh ref={cyls} args={[cylGeometry, undefined, ARM_CYLS]} frustumCulled={false}>
        <meshStandardMaterial color={c.surface} roughness={0.9} />
      </instancedMesh>
      <lineSegments geometry={kit.geometry} frustumCulled={false}>
        <lineBasicMaterial vertexColors />
      </lineSegments>
    </group>
  )
}

const MAX_PARTS = 320
/** Parts travel the whole line, so the sphere three caches on first raycast must cover it, not their first positions. */
const LINE_SPHERE = new Sphere(new Vector3(2, 2, 0), 30)
/** Screenshot tops share one atlas of 256x192 cells (the tile's 4:3), loaded only for parts that are live and visible. */
const ATLAS = 2048
const CELL = { w: 256, h: 192 }
const COLS = ATLAS / CELL.w
const CELLS = COLS * Math.floor(ATLAS / CELL.h)
const LOADS = 6
const topGeometry = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0.5, 0)

type Cell = { part: Part | null; url: string; ready: boolean }

/**
 * Bodies are one instanced box (hue tinted) that also takes every pointer
 * event, edges one instanced LineSegments, and screenshot tops one instanced
 * quad reading its cell of the shared atlas. The pointer's part and the
 * keyboard's `focus` part both lift and take the accent edge; `pressed` is
 * the part under the last press, for long press.
 */
export function Parts({ sim, lab, c, tip, guard, pressed, focus, ready, onPart }: {
  sim: Sim; lab: Lab; c: Look; tip: Tip; guard: Guard; pressed: { current: Part | null }; focus: { current: string | null }; ready: boolean; onPart: (p: Part) => void
}) {
  const gl = useThree((s) => s.gl)
  const invalidate = useThree((s) => s.invalidate)
  const bodies = useRef<InstancedMesh>(null)
  const tops = useRef<InstancedMesh>(null)
  const ids = useRef<Part[]>([])
  const hover = useRef<Part | null>(null)
  const dummy = useMemo(() => new Object3D(), [])
  const edgeGeometry = useMemo(() => {
    const segs: number[] = []
    boxEdges(segs, 0, 0, 0, 1, 1, 1)
    const g = new InstancedBufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(segs, 3))
    g.setAttribute('instanceMatrix', new InstancedBufferAttribute(new Float32Array(MAX_PARTS * 16), 16).setUsage(DynamicDrawUsage))
    g.setAttribute('instanceColor', new InstancedBufferAttribute(new Float32Array(MAX_PARTS * 3), 3).setUsage(DynamicDrawUsage))
    g.instanceCount = 0
    return g
  }, [])
  const edgeMaterial = useMemo(() => {
    const m = new LineBasicMaterial({ color: '#FFFFFF' })
    m.defines = { USE_INSTANCING: '', USE_INSTANCING_COLOR: '' }
    return m
  }, [])
  const atlas = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = ATLAS
    const texture = new CanvasTexture(canvas)
    texture.colorSpace = SRGBColorSpace
    texture.minFilter = LinearMipmapLinearFilter
    texture.magFilter = LinearFilter
    texture.anisotropy = 4
    const scratch = document.createElement('canvas')
    scratch.width = CELL.w
    scratch.height = CELL.h
    const source = new CanvasTexture(scratch)
    return { texture, scratch, source, cells: Array.from({ length: CELLS }, (): Cell => ({ part: null, url: '', ready: false })), of: new Map<Part, number>(), loading: 0, at: new Vector2() }
  }, [])
  const topMaterial = useMemo(() => {
    const m = new MeshBasicMaterial({ map: atlas.texture, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 })
    m.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec4 aCell;')
        .replace('#include <uv_vertex>', '#include <uv_vertex>\nvMapUv = aCell.xy + uv * aCell.zw;')
    }
    return m
  }, [atlas])
  const cellAttr = useMemo(() => new InstancedBufferAttribute(new Float32Array(MAX_PARTS * 4), 4).setUsage(DynamicDrawUsage), [])
  const topGeo = useMemo(() => {
    const g = topGeometry.clone()
    g.setAttribute('aCell', cellAttr)
    return g
  }, [cellAttr])
  useEffect(() => () => {
    edgeGeometry.dispose()
    edgeMaterial.dispose()
    topMaterial.dispose()
    topGeo.dispose()
    atlas.texture.dispose()
    atlas.source.dispose()
  }, [edgeGeometry, edgeMaterial, topMaterial, topGeo, atlas])
  useLayoutEffect(() => {
    if (bodies.current) bodies.current.boundingSphere = LINE_SPHERE
    if (tops.current) tops.current.boundingSphere = LINE_SPHERE
  }, [ready])

  const tints = useMemo(() => new Map<number, Color>(), [c])
  const tintOf = (hue: number) => tints.get(hue) ?? tints.set(hue, new Color(tint(hue, c))).get(hue)!
  const accent = useMemo(() => new Color(c.accent), [c.accent])
  const edge = useMemo(() => new Color(c.edge), [c.edge])
  const dark = lab.theme === 'dark'
  const imageOf = (p: Part) => (dark ? (p.item.imageDark ?? p.item.image) : p.item.image) ?? ''
  const seenLive = useRef(-1)

  const load = (p: Part, url: string) => {
    const k = atlas.cells.findIndex((cell) => !cell.part)
    if (k < 0) return
    const cell = atlas.cells[k]
    cell.part = p
    cell.url = url
    cell.ready = false
    atlas.of.set(p, k)
    atlas.loading++
    const img = new Image()
    img.decoding = 'async'
    img.src = url
    img
      .decode()
      .then(() => {
        if (cell.part !== p || cell.url !== url) return
        const ctx = atlas.scratch.getContext('2d')!
        const sh = Math.min(img.naturalHeight, img.naturalWidth * (CELL.h / CELL.w))
        ctx.clearRect(0, 0, CELL.w, CELL.h)
        ctx.drawImage(img, 0, 0, img.naturalWidth, sh, 0, 0, CELL.w, CELL.h)
        const col = k % COLS, row = Math.floor(k / COLS)
        gl.copyTextureToTexture(atlas.source, atlas.texture, null, atlas.at.set(col * CELL.w, row * CELL.h))
        cell.ready = true
        invalidate()
      })
      .catch(() => {})
      .finally(() => {
        atlas.loading--
      })
  }

  useEffect(() => {
    for (const cell of atlas.cells) {
      cell.part = null
      cell.ready = false
    }
    atlas.of.clear()
  }, [atlas, dark])

  useFrame(() => {
    const b = bodies.current
    if (!b) return
    if (sim.liveVersion !== seenLive.current) {
      seenLive.current = sim.liveVersion
      for (const [p, k] of atlas.of) {
        if (p.live) continue
        atlas.of.delete(p)
        atlas.cells[k].part = null
        atlas.cells[k].ready = false
      }
    }
    const im = edgeGeometry.getAttribute('instanceMatrix') as InstancedBufferAttribute
    const ic = edgeGeometry.getAttribute('instanceColor') as InstancedBufferAttribute
    const ca = cellAttr.array as Float32Array
    const t = tops.current
    let i = 0, j = 0
    const query = lab.focus.query
    const focused = focus.current ? sim.parts.get(focus.current) : undefined
    for (const p of sim.live) {
      if (!p.visible || i >= MAX_PARTS) continue
      ids.current[i] = p
      const hot = hover.current === p || focused === p
      const lift = hot && (p.mode === 'home' || p.mode === 'board') ? 0.14 : 0
      dummy.position.set(p.pos.x, p.pos.y + lift, p.pos.z)
      dummy.rotation.set(p.spin * 0.3, p.spin, 0)
      dummy.scale.set(p.size[0] * p.scale, p.size[1] * p.scale, p.size[2] * p.scale)
      dummy.updateMatrix()
      b.setMatrixAt(i, dummy.matrix)
      b.setColorAt(i, tintOf(p.item.hue))
      dummy.matrix.toArray(im.array as Float32Array, i * 16)
      const match = !!query && p.mode === 'board' && matchItem(p.item, query)
      const active = hot || p.mode === 'held' || p.mode === 'queued' || match
      ;(active ? accent : edge).toArray(ic.array as Float32Array, i * 3)
      const url = ready ? imageOf(p) : ''
      if (url && t) {
        const k = atlas.of.get(p)
        if (k === undefined) {
          if (atlas.loading < LOADS) load(p, url)
        } else if (atlas.cells[k].ready && j < MAX_PARTS) {
          t.setMatrixAt(j, dummy.matrix)
          const col = k % COLS, row = Math.floor(k / COLS)
          ca[j * 4] = (col * CELL.w + 1) / ATLAS
          ca[j * 4 + 1] = (row * CELL.h + 1) / ATLAS
          ca[j * 4 + 2] = (CELL.w - 2) / ATLAS
          ca[j * 4 + 3] = (CELL.h - 2) / ATLAS
          j++
        }
      }
      i++
    }
    b.count = i
    b.instanceMatrix.needsUpdate = true
    if (b.instanceColor) b.instanceColor.needsUpdate = true
    edgeGeometry.instanceCount = i
    im.needsUpdate = true
    ic.needsUpdate = true
    if (t) {
      t.count = j
      t.instanceMatrix.needsUpdate = true
      cellAttr.needsUpdate = true
    }
  }, APPLY)

  const partAt = (e: ThreeEvent<PointerEvent | MouseEvent>) => (e.instanceId === undefined ? null : (ids.current[e.instanceId] ?? null))
  const describe = (p: Part) => {
    const verb = sim.wanted.has(p.item.ref) ? (p.mode === 'board' ? 'on the board · click to send back' : 'on its way · click to cancel') : 'click to build'
    return `${p.item.label} · ${p.code} · ${verb}`
  }
  return (
    <>
      <instancedMesh
        ref={bodies}
        args={[undefined, undefined, MAX_PARTS]}
        frustumCulled={false}
        onPointerDown={(e) => {
          pressed.current = partAt(e)
        }}
        onPointerMove={(e) => {
          e.stopPropagation()
          const p = partAt(e)
          if (p !== hover.current) {
            hover.current = p
            if (p) tip.show(e.nativeEvent, p.item.title, describe(p))
            else tip.hide()
            if (p && e.nativeEvent.pointerType !== 'touch' && !e.nativeEvent.buttons) play('tick')
            invalidate()
          }
          tip.move(e.nativeEvent)
        }}
        onPointerOut={() => {
          hover.current = null
          tip.hide()
          invalidate()
        }}
        onClick={(e) => {
          e.stopPropagation()
          if (guard.moved) return
          const p = partAt(e)
          if (!p) return
          hover.current = null
          tip.hide()
          onPart(p)
        }}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#FFFFFF" roughness={0.85} />
      </instancedMesh>
      <lineSegments geometry={edgeGeometry} material={edgeMaterial} frustumCulled={false} raycast={() => null} />
      {ready && <instancedMesh ref={tops} args={[topGeo, topMaterial, MAX_PARTS]} frustumCulled={false} raycast={() => null} />}
    </>
  )
}

const SPARKS = 90

export function Drone({ sim, lab, c, anchor, ready }: { sim: Sim; lab: Lab; c: Look; anchor: { current: Vector3 }; ready: boolean }) {
  const group = useRef<Group>(null)
  const rotors = useRef<Group>(null)
  const glow = useRef<Mesh>(null)
  const points = useRef<Points>(null)
  const label = useRef<Sprite>(null)
  const size = useThree((s) => s.size)
  const state = useMemo(() => ({ pos: new Float32Array(SPARKS * 3).fill(-1e4), vel: new Float32Array(SPARKS * 3), life: new Float32Array(SPARKS), next: 0, emit: 0, last: 0, at: new Vector3() }), [])
  const body = lab.setup.agent === 'codex' ? c.fg : '#D97757'
  const frame = useMemo(() => {
    const segs: number[] = []
    boxEdges(segs, 0, 0, 0, 0.8, 0.22, 0.8)
    boxEdges(segs, 0, 0.18, 0, 0.3, 0.14, 0.3)
    for (const [x, z] of [[-0.62, -0.62], [0.62, -0.62], [-0.62, 0.62], [0.62, 0.62]]) segs.push(x * 0.45, 0.1, z * 0.45, x, 0.12, z)
    segs.push(0, -0.11, 0, 0, -0.55, 0.1)
    return segs
  }, [])
  const blades = useMemo(() => {
    const segs: number[] = []
    for (const [x, z] of [[-0.62, -0.62], [0.62, -0.62], [-0.62, 0.62], [0.62, 0.62]]) segs.push(x - 0.34, 0.16, z, x + 0.34, 0.16, z, x, 0.16, z - 0.34, x, 0.16, z + 0.34)
    return segs
  }, [])
  useFrame(({ camera }) => {
    const g = group.current
    if (!g || !glow.current || !points.current) return
    const d = sim.drone
    const dt = Math.max(0, Math.min(0.1, sim.time - state.last))
    state.last = sim.time
    g.visible = d.show > 0.001
    g.position.copy(d.pos)
    g.scale.setScalar(Math.max(0.001, d.show))
    g.rotation.z = Math.sin(sim.idleTime * 1.7) * 0.06
    anchor.current.copy(d.pos).setY(d.pos.y + 0.3)
    if (rotors.current) rotors.current.rotation.y = sim.idleTime * 30
    if (label.current) {
      const cam = camera as PerspectiveCamera
      label.current.getWorldPosition(state.at)
      const dist = cam.position.distanceTo(state.at)
      const world = ((size.width < 640 ? 38 : 32) / Math.max(1, size.height)) * 2 * dist * Math.tan((cam.fov * Math.PI) / 360)
      const h = world / Math.max(0.001, d.show)
      label.current.scale.set(h * 5, h, 1)
      label.current.material.opacity = clamp((dist - 4) / 4, 0, 1)
    }
    const weld = d.welds[0]?.at
    const welding = !!weld && d.weldT > 0
    glow.current.visible = welding
    if (welding) {
      glow.current.position.copy(weld).setY(weld.y + 0.06)
      glow.current.scale.setScalar(REDUCED_MOTION ? 1 : 0.95 + 0.3 * Math.sin(sim.time * Math.PI * 2 * 2.5))
      if (!REDUCED_MOTION) {
        state.emit += dt * 140
        for (; state.emit >= 1; state.emit--) {
          const i = state.next++ % SPARKS
          const a = Math.random() * Math.PI * 2, s = 1 + Math.random() * 2.4
          state.pos[i * 3] = weld.x + (Math.random() - 0.5) * 0.4
          state.pos[i * 3 + 1] = weld.y + 0.06
          state.pos[i * 3 + 2] = weld.z + (Math.random() - 0.5) * 0.3
          state.vel[i * 3] = Math.cos(a) * s
          state.vel[i * 3 + 1] = 1.5 + Math.random() * 3
          state.vel[i * 3 + 2] = Math.sin(a) * s
          state.life[i] = 0.35 + Math.random() * 0.35
        }
      }
    }
    for (let i = 0; i < SPARKS; i++) {
      if (state.life[i] <= 0) {
        state.pos[i * 3 + 1] = -1e4
        continue
      }
      state.life[i] -= dt
      state.vel[i * 3 + 1] -= 14 * dt
      state.pos[i * 3] += state.vel[i * 3] * dt
      state.pos[i * 3 + 1] = Math.max(BOARD.y + 0.02, state.pos[i * 3 + 1] + state.vel[i * 3 + 1] * dt)
      state.pos[i * 3 + 2] += state.vel[i * 3 + 2] * dt
    }
    ;(points.current.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true
  }, APPLY)
  const name = agents.find((a) => a.value === lab.setup.agent)?.label ?? ''
  const tag = useMemo(
    () =>
      !ready
        ? null
        : textTexture(500, 100, (ctx) => {
            ctx.fillStyle = c.surface
            ctx.strokeStyle = c.edge
            ctx.lineWidth = 3
            ctx.beginPath()
            ctx.roundRect(4, 14, 492, 72, 36)
            ctx.fill()
            ctx.stroke()
            ctx.fillStyle = body
            ctx.beginPath()
            ctx.arc(46, 50, 10, 0, Math.PI * 2)
            ctx.fill()
            ctx.fillStyle = c.fg
            ctx.font = `500 34px ${FONT}`
            ctx.fillText(`${name} is welding`, 70, 62)
          }),
    [c, body, name, ready],
  )
  useEffect(() => () => tag?.dispose(), [tag])
  return (
    <>
      <group ref={group}>
        <mesh>
          <boxGeometry args={[0.8, 0.22, 0.8]} />
          <meshStandardMaterial color={c.surface} roughness={0.9} />
        </mesh>
        <mesh position={[0, 0.18, 0]}>
          <boxGeometry args={[0.3, 0.14, 0.3]} />
          <meshBasicMaterial color={body} toneMapped={false} />
        </mesh>
        <Hairlines segs={frame} color={body} />
        <group ref={rotors}>
          <Hairlines segs={blades} color={c.edge} />
        </group>
        {tag && (
          <sprite ref={label} position={[0, 0.85, 0]} scale={[3.0, 0.6, 1]}>
            <spriteMaterial map={tag} transparent toneMapped={false} depthTest={false} />
          </sprite>
        )}
      </group>
      <mesh ref={glow} visible={false}>
        <sphereGeometry args={[0.12, 12, 12]} />
        <meshBasicMaterial color="#FFE2A8" toneMapped={false} />
      </mesh>
      <points ref={points} frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[state.pos, 3]} />
        </bufferGeometry>
        <pointsMaterial color="#FFB347" size={3.5} sizeAttenuation={false} toneMapped={false} />
      </points>
    </>
  )
}

export function useBoardPaging(lab: Lab, sim: Sim) {
  const aisles = lab.warehouse.aisles
  const query = lab.focus.query.trim()
  const matches = useMemo(
    () => (query ? aisles.map((a) => a.racks.reduce((n, r) => n + r.bins.filter((b) => matchItem(b.item, query)).length, 0)) : null),
    [aisles, query],
  )
  const active = useMemo(() => {
    const at = aisles.findIndex((a) => a.id === lab.focus.category)
    if (at >= 0) return at
    if (matches) return matches.indexOf(Math.max(...matches))
    return Math.max(0, aisles.findIndex((a) => a.id === 'block:hero'))
  }, [aisles, lab.focus.category, matches])
  const pages = useMemo(() => {
    const aisle = aisles[active]
    const bins = aisle.racks.flatMap((r) => r.bins)
    const toParts = (list: typeof bins) => list.map((b) => sim.parts.get(b.item.ref)).filter((p): p is Part => !!p)
    if (query) {
      const hits = bins.filter((b) => matchItem(b.item, query))
      if (!hits.length) return [{ parts: [] as Part[], label: `NO MATCHES FOR “${query.toUpperCase()}”` }]
      return Array.from({ length: Math.ceil(hits.length / PAGE) }, (_, k) => ({
        parts: toParts(hits.slice(k * PAGE, k * PAGE + PAGE)),
        label: `“${query.toUpperCase()}” · ${hits.length} IN ${aisle.label.toUpperCase()}`,
      }))
    }
    const bays = new Map<number, typeof bins>()
    for (const b of bins) bays.set(b.bay, [...(bays.get(b.bay) ?? []), b])
    return [...bays].map(([bay, list]) => ({
      parts: toParts(list),
      label: `BAY ${String(bay).padStart(2, '0')} · ${aisle.racks[list[0].rack].name.toUpperCase()}`,
    }))
  }, [aisles, active, query, sim])
  const [pageState, setPage] = useState({ key: '', page: 0 })
  const pageKey = `${active}|${query}`
  const page = pageState.key === pageKey ? Math.min(pageState.page, pages.length - 1) : 0
  useLayoutEffect(() => {
    sim.active = active
  }, [sim, active])
  useLayoutEffect(() => applyPage(sim, pages[page].parts), [sim, pages, page])
  useEffect(() => {
    sim.board.activeBand = lab.focus.category.startsWith('block:') ? bandOf(lab.focus.category) : -1
  }, [sim, lab.focus.category])
  return { aisles, query, matches, active, pages, page, setPage: (n: number) => setPage({ key: pageKey, page: n }) }
}
