import { useFrame, useThree } from '@react-three/fiber'
import { Grid } from '@react-three/drei'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  BoxGeometry, BufferAttribute, BufferGeometry, Color, CylinderGeometry, DynamicDrawUsage, EdgesGeometry, Float32BufferAttribute,
  InstancedMesh, LineSegments, Matrix4, Mesh, Object3D, Points, SRGBColorSpace, Sphere, Texture, TextureLoader, Vector3,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import { agents, databases, frameworks, packageManagers } from '../../../../workspace/-workspace/workspace.constants'
import type { Setup } from '../../../../workspace/-workspace/workspace.types'
import type { Lab } from '../../lab.types'
import type { Aisle } from '../../warehouse'
import {
  ARM, BANDS, BAND_D, BELT, BOARD, CAB, COMPONENT_BAY, FEATURE_BAY, PAD, PAGE_AREA, POD, SOCKET, TABLE, bandZ, cabinetRows, drawerPos, padPos,
  probeRoute, routeLength, sampleRoute,
} from './layout'
import { AGENT_COLOR, FONT, MONO, fitText, textTexture, tint, useFontsReady } from './look'
import type { Look } from './look'
import { idleLoops } from './sim'
import type { Part, Sim } from './sim'

export type Tip = { show: (e: PointerEvent, title: string, sub: string, image?: string) => void; at: (x: number, y: number, title: string, sub: string, image?: string) => void; move: (e: PointerEvent) => void; hide: () => void }
export type Guard = { moved: boolean }
/** `pressed` is the part under the pointer since pointerdown, for a long press. */
export type Hover = { ref: string | null; picking: boolean; pressed: Part | null }
/** Motion scale: 1 for full motion; reduced motion halves every flight and stops idle animation. */
export type Motion = { current: number }

type Pick = { t: 'drawer'; i: number } | { t: 'part'; p: Part } | { t: 'socket'; key: keyof typeof SOCKET } | { t: 'pod' } | null
type V3 = [number, number, number]

const CORNERS: V3[] = [[-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, -0.5, 0.5], [-0.5, -0.5, 0.5], [-0.5, 0.5, -0.5], [0.5, 0.5, -0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5]]
const EDGES = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]]
const rectPts = (x0: number, z0: number, x1: number, z1: number, y: number): number[] => [x0, y, z0, x1, y, z0, x1, y, z0, x1, y, z1, x1, y, z1, x0, y, z1, x0, y, z1, x0, y, z0]

const box = (size: V3, at: V3) => {
  const g = new BoxGeometry(...size)
  g.translate(...at)
  return g
}
const cyl = (r0: number, r1: number, h: number, at: V3, segs = 24) => {
  const g = new CylinderGeometry(r0, r1, h, segs)
  g.translate(...at)
  return g
}

/** Everything that never moves, as one fill mesh and one hairline mesh. */
export function Static({ c, aisles }: { c: Look; aisles: number }) {
  const { fills, edges } = useMemo(() => {
    const rows = cabinetRows(aisles)
    const cw = CAB.gapX * CAB.cols + 0.1, ch = CAB.gapY * rows + 0.1, cx = CAB.x0 + (CAB.gapX * (CAB.cols - 1)) / 2, cz = CAB.front - CAB.d / 2 - 0.05
    const solids: BufferGeometry[] = [
      box([cw, 0.12, CAB.d + 0.2], [cx, CAB.base + ch + 0.02, cz]),
      box([cw, CAB.base, CAB.d + 0.2], [cx, CAB.base / 2, cz]),
      box([cw, ch, 0.1], [cx, CAB.base + ch / 2, CAB.front - CAB.d - 0.1]),
      box([0.1, ch, CAB.d + 0.2], [cx - cw / 2 + 0.05, CAB.base + ch / 2, cz]),
      box([0.1, ch, CAB.d + 0.2], [cx + cw / 2 - 0.05, CAB.base + ch / 2, cz]),
      box([TABLE.x1 - TABLE.x0, 0.12, TABLE.z1 - TABLE.z0], [(TABLE.x0 + TABLE.x1) / 2, TABLE.y - 0.06, (TABLE.z0 + TABLE.z1) / 2]),
      ...[[TABLE.x0 + 0.15, TABLE.z0 + 0.15], [TABLE.x1 - 0.15, TABLE.z0 + 0.15], [TABLE.x0 + 0.15, TABLE.z1 - 0.15], [TABLE.x1 - 0.15, TABLE.z1 - 0.15]].map(([x, z]) =>
        box([0.12, TABLE.y - 0.12, 0.12], [x, (TABLE.y - 0.12) / 2, z]),
      ),
    ]
    const len = BELT.end - BELT.start + 1.0, mid = (BELT.start + BELT.end) / 2
    solids.push(
      box([len, 0.4, 1.3], [mid, BELT.y - 0.28, BELT.z]),
      box([len + 0.1, 0.14, 0.08], [mid, BELT.y, BELT.z - 0.7]),
      box([len + 0.1, 0.14, 0.08], [mid, BELT.y, BELT.z + 0.7]),
      ...[BELT.start + 0.4, BELT.end - 0.4].flatMap((x) => [0.95, 2.25].map((dz) => box([0.12, BELT.y - 0.48, 0.12], [x, (BELT.y - 0.48) / 2, BELT.z - 1.6 + dz]))),
    )
    const rollers = [BELT.start - 0.5, BELT.end + 0.5].map((x) => {
      const g = new CylinderGeometry(0.24, 0.24, 1.34, 20)
      g.rotateX(Math.PI / 2)
      g.translate(x, BELT.y - 0.24, BELT.z)
      return g
    })
    solids.push(...rollers)
    solids.push(cyl(0.85, 0.95, 0.34, [ARM.x, 0.17, ARM.z], 36))
    solids.push(box([BOARD.x1 - BOARD.x0, 0.12, BOARD.z1 - BOARD.z0], [(BOARD.x0 + BOARD.x1) / 2, BOARD.y - 0.06, (BOARD.z0 + BOARD.z1) / 2]))
    for (const [x, z] of [[BOARD.x0 + 0.3, BOARD.z0 + 0.3], [BOARD.x1 - 0.3, BOARD.z0 + 0.3], [BOARD.x0 + 0.3, BOARD.z1 - 0.3], [BOARD.x1 - 0.3, BOARD.z1 - 0.3]])
      solids.push(cyl(0.1, 0.1, BOARD.y - 0.12, [x, (BOARD.y - 0.12) / 2, z], 12))
    const edgeGeos = solids.map((g) => new EdgesGeometry(g, 18) as BufferGeometry)
    const fills = mergeGeometries(solids)!
    const lines: number[] = []
    const y = BOARD.y + 0.004
    lines.push(...rectPts(PAGE_AREA.x0, PAGE_AREA.z0, PAGE_AREA.x1, PAGE_AREA.z1, y))
    for (let b = 1; b < BANDS.length; b++) lines.push(PAGE_AREA.x0, y, bandZ(b), PAGE_AREA.x1, y, bandZ(b))
    for (const s of Object.values(SOCKET)) lines.push(...rectPts(s.x - s.w / 2 - 0.08, s.z - s.d / 2 - 0.08, s.x + s.w / 2 + 0.08, s.z + s.d / 2 + 0.08, y))
    lines.push(...rectPts(FEATURE_BAY.x - 0.8, FEATURE_BAY.z0 - 0.05, FEATURE_BAY.x + 0.8, FEATURE_BAY.z0 + FEATURE_BAY.dz * FEATURE_BAY.rows + 0.05, y))
    lines.push(...rectPts(COMPONENT_BAY.x0 - 0.05, COMPONENT_BAY.z0 - 0.05, COMPONENT_BAY.x1 + 0.05, COMPONENT_BAY.z1 + 0.05, y))
    const sheet = [[-11.6, -5.6], [13.6, -5.6], [13.6, 5.3], [-11.6, 5.3]]
    for (let k = 0; k < 4; k++) {
      const a = sheet[k], b = sheet[(k + 1) % 4]
      lines.push(a[0], 0.01, a[1], b[0], 0.01, b[1])
    }
    for (let k = 0; k < PAD.cols * PAD.rows; k++) {
      const p = padPos(k)
      lines.push(...rectPts(p.x - PAD.w / 2, p.z - PAD.d / 2, p.x + PAD.w / 2, p.z + PAD.d / 2, TABLE.y + 0.004))
    }
    const extra = new BufferGeometry()
    extra.setAttribute('position', new Float32BufferAttribute(lines, 3))
    const edges = mergeGeometries([...edgeGeos, extra])!
    solids.forEach((g) => g.dispose())
    edgeGeos.forEach((g) => g.dispose())
    return { fills, edges }
  }, [aisles])
  useEffect(() => () => { fills.dispose(); edges.dispose() }, [fills, edges])
  const reach = useMemo(() => {
    const pts: number[] = []
    const n = 40
    for (let k = 0; k < n; k++) {
      const a0 = -1.1 + (k / n) * 2.4, a1 = -1.1 + ((k + 1) / n) * 2.4
      pts.push(ARM.x + Math.cos(a0) * 8.6, 0.02, ARM.z + Math.sin(a0) * 8.6, ARM.x + Math.cos(a1) * 8.6, 0.02, ARM.z + Math.sin(a1) * 8.6)
    }
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(pts, 3))
    return g
  }, [])
  const dashed = useRef<LineSegments>(null)
  useEffect(() => { dashed.current?.computeLineDistances() }, [reach])
  return (
    <group>
      <Grid renderOrder={-1} position={[0, -0.002, 0]} args={[160, 160]} cellSize={0.5} cellThickness={0.6} cellColor={c.grid} sectionSize={2.5} sectionThickness={1} sectionColor={c.gridSection} fadeDistance={110} fadeStrength={1.4} infiniteGrid />
      <mesh geometry={fills}>
        <meshBasicMaterial color={c.bg} />
      </mesh>
      <lineSegments geometry={edges}>
        <lineBasicMaterial color={c.edge} />
      </lineSegments>
      <lineSegments ref={dashed} geometry={reach}>
        <lineDashedMaterial color={c.edge} dashSize={0.25} gapSize={0.18} transparent opacity={0.5} />
      </lineSegments>
    </group>
  )
}

/** The drawing's title block on the floor, a text texture mounted after the first frame. */
export function TitleBlock({ c }: { c: Look }) {
  const fonts = useFontsReady()
  const title = useMemo(
    () =>
      textTexture(2048, 768, (ctx) => {
        ctx.scale(2, 2)
        ctx.strokeStyle = c.edge
        ctx.fillStyle = c.edge
        ctx.lineWidth = 4
        ctx.strokeRect(4, 4, 1016, 376)
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(4, 130); ctx.lineTo(1020, 130); ctx.moveTo(520, 130); ctx.lineTo(520, 380); ctx.moveTo(4, 255); ctx.lineTo(1020, 255)
        ctx.stroke()
        ctx.font = `600 62px ${FONT}`
        ctx.fillText('PAYLOAD TOOLKIT', 34, 90)
        ctx.font = `500 34px ${FONT}`
        const rows = [['TITLE', 'ASSEMBLY CELL · WORKSPACE'], ['DWG NO.', 'PT-004 · REV D'], ['SCALE', '1 : 50'], ['SHEET', '1 OF 1']]
        rows.forEach(([k, v], i) => {
          const x = i % 2 ? 546 : 30, y = 170 + Math.floor(i / 2) * 125
          ctx.globalAlpha = 0.6
          ctx.font = `500 24px ${FONT}`
          ctx.fillText(k, x, y)
          ctx.globalAlpha = 1
          ctx.font = `500 34px ${FONT}`
          ctx.fillText(v, x, y + 44)
        })
      }),
    [c, fonts],
  )
  useEffect(() => () => title.dispose(), [title])
  return (
    <mesh renderOrder={1} position={[-2.9, 0.015, 3.9]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[5.0, 1.875]} />
      <meshBasicMaterial map={title} transparent toneMapped={false} depthWrite={false} />
    </mesh>
  )
}

const CAP = 720
const LINE_CAP = 48000
const dummy = new Object3D()
const v3 = new Vector3()
const colA = new Color()
/** Scratch matrices for the arm chain, so a frame allocates nothing. */
const M = Array.from({ length: 8 }, () => new Matrix4())
const SIDEWAYS = new Matrix4().makeRotationX(Math.PI / 2)
/** Instances move all over the cell, so the sphere three.js would cache on first raycast must cover it all. */
const CELL_SPHERE = new Sphere(new Vector3(0, 2, 0), 40)

export type Dyn = {
  sim: Sim
  lab: Lab
  c: Look
  aisles: readonly Aisle[]
  active: number
  matches: number[] | null
  pageParts: readonly Part[]
  tip: Tip
  guard: Guard
  hover: Hover
  onDrawer: (i: number) => void
  onPart: (p: Part) => void
  onSocket: (key: keyof typeof SOCKET) => void
}

/**
 * Every box that moves, in two draw calls: one instanced fill mesh and one
 * hairline buffer. Drawers, the arm, parts, sockets and the probe pod are
 * written each frame, so hover and selection are colours, not re-renders.
 */
const RING = 20
const CYL_CAP = 8
const cylGeometry = new CylinderGeometry(0.5, 0.5, 1, RING)

export function Dynamic(props: Dyn) {
  const { sim, lab, c, aisles, active, matches, pageParts, tip, guard, hover, onDrawer, onPart, onSocket } = props
  const invalidate = useThree((s) => s.invalidate)
  const boxes = useRef<InstancedMesh>(null)
  const cyls = useRef<InstancedMesh>(null)
  const lines = useRef<LineSegments>(null)
  const ids = useRef<Pick[]>([])
  useLayoutEffect(() => {
    if (boxes.current) boxes.current.boundingSphere = CELL_SPHERE
  }, [])
  const buffers = useMemo(() => ({ pos: new Float32Array(LINE_CAP * 3), col: new Float32Array(LINE_CAP * 3) }), [])
  const geometry = useMemo(() => {
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(buffers.pos, 3).setUsage(DynamicDrawUsage))
    g.setAttribute('color', new BufferAttribute(buffers.col, 3).setUsage(DynamicDrawUsage))
    return g
  }, [buffers])
  const colors = useMemo(
    () => ({ bg: new Color(c.bg), edge: new Color(c.edge), dim: new Color(c.dim), accent: new Color(c.accent), fg: new Color(c.fg), muted: new Color(c.muted) }),
    [c],
  )
  const hueColors = useMemo(() => new Map<number, Color>(), [c])
  const agentColor = useMemo(() => new Color(AGENT_COLOR[lab.setup.agent] || c.accent), [lab.setup.agent, c])
  const hueOf = (hue: number) => {
    let col = hueColors.get(hue)
    if (!col) hueColors.set(hue, (col = new Color(tint(hue, c))))
    return col
  }
  const query = lab.focus.query.trim()

  useFrame(() => {
    const mesh = boxes.current, seg = lines.current, cylMesh = cyls.current
    if (!mesh || !seg || !cylMesh) return
    let i = 0, v = 0, ci = 0
    const { pos, col } = buffers
    const line = (a: Vector3 | V3, b: Vector3 | V3, color: Color) => {
      if (v + 2 > LINE_CAP) return
      const ax = Array.isArray(a) ? a[0] : a.x, ay = Array.isArray(a) ? a[1] : a.y, az = Array.isArray(a) ? a[2] : a.z
      const bx = Array.isArray(b) ? b[0] : b.x, by = Array.isArray(b) ? b[1] : b.y, bz = Array.isArray(b) ? b[2] : b.z
      pos[v * 3] = ax; pos[v * 3 + 1] = ay; pos[v * 3 + 2] = az
      col[v * 3] = color.r; col[v * 3 + 1] = color.g; col[v * 3 + 2] = color.b
      v++
      pos[v * 3] = bx; pos[v * 3 + 1] = by; pos[v * 3 + 2] = bz
      col[v * 3] = color.r; col[v * 3 + 1] = color.g; col[v * 3 + 2] = color.b
      v++
    }
    const put = (matrix: Matrix4, fill: Color, edge: Color, pick: Pick) => {
      if (i >= CAP) return
      mesh.setMatrixAt(i, matrix)
      mesh.setColorAt(i, fill)
      ids.current[i] = pick
      i++
      if (v + 24 > LINE_CAP) return
      for (const [a, b] of EDGES) {
        const ca = CORNERS[a], cb = CORNERS[b]
        v3.set(ca[0], ca[1], ca[2]).applyMatrix4(matrix)
        pos[v * 3] = v3.x; pos[v * 3 + 1] = v3.y; pos[v * 3 + 2] = v3.z
        col[v * 3] = edge.r; col[v * 3 + 1] = edge.g; col[v * 3 + 2] = edge.b
        v++
        v3.set(cb[0], cb[1], cb[2]).applyMatrix4(matrix)
        pos[v * 3] = v3.x; pos[v * 3 + 1] = v3.y; pos[v * 3 + 2] = v3.z
        col[v * 3] = edge.r; col[v * 3 + 1] = edge.g; col[v * 3 + 2] = edge.b
        v++
      }
    }
    const putCyl = (matrix: Matrix4, radius: number, length: number, fill: Color, edge: Color) => {
      if (ci >= CYL_CAP || v + RING * 4 > LINE_CAP) return
      dummy.position.set(0, 0, 0)
      dummy.rotation.set(0, 0, 0)
      dummy.scale.set(radius * 2, length, radius * 2)
      dummy.updateMatrix()
      const m = M[7].copy(matrix).multiply(dummy.matrix)
      cylMesh.setMatrixAt(ci, m)
      cylMesh.setColorAt(ci, fill)
      ci++
      for (const yy of [-0.5, 0.5]) {
        for (let k = 0; k < RING; k++) {
          const a0 = (k / RING) * Math.PI * 2, a1 = ((k + 1) / RING) * Math.PI * 2
          v3.set(Math.cos(a0) * 0.5, yy, Math.sin(a0) * 0.5).applyMatrix4(m)
          pos[v * 3] = v3.x; pos[v * 3 + 1] = v3.y; pos[v * 3 + 2] = v3.z
          col[v * 3] = edge.r; col[v * 3 + 1] = edge.g; col[v * 3 + 2] = edge.b
          v++
          v3.set(Math.cos(a1) * 0.5, yy, Math.sin(a1) * 0.5).applyMatrix4(m)
          pos[v * 3] = v3.x; pos[v * 3 + 1] = v3.y; pos[v * 3 + 2] = v3.z
          col[v * 3] = edge.r; col[v * 3 + 1] = edge.g; col[v * 3 + 2] = edge.b
          v++
        }
      }
    }
    const putBox = (x: number, y: number, z: number, size: V3, scale: number, rotY: number, rotX: number, fill: Color, edge: Color, pick: Pick) => {
      dummy.position.set(x, y, z)
      dummy.rotation.set(rotX, rotY, 0)
      dummy.scale.set(size[0] * scale, size[1] * scale, size[2] * scale)
      dummy.updateMatrix()
      put(dummy.matrix, fill, edge, pick)
    }

    aisles.forEach((aisle, k) => {
      const at = drawerPos(k, v3)
      const none = matches && !matches[k]
      const hovered = hover.ref === `drawer:${aisle.id}`
      putBox(at.x, at.y, CAB.front - CAB.d / 2 + sim.drawers[k], [CAB.w, CAB.h, CAB.d], 1, 0, 0, colors.bg, k === active || hovered ? colors.accent : none ? colors.dim : colors.edge, { t: 'drawer', i: k })
    })

    pageParts.forEach((p, k) => {
      const at = padPos(k, v3)
      const away = p.mode !== 'home' || !!p.fly
      const edge = away ? colors.accent : colors.dim
      const y = TABLE.y + 0.006
      line([at.x - PAD.w / 2, y, at.z - PAD.d / 2], [at.x + PAD.w / 2, y, at.z - PAD.d / 2], edge)
      line([at.x + PAD.w / 2, y, at.z - PAD.d / 2], [at.x + PAD.w / 2, y, at.z + PAD.d / 2], edge)
      line([at.x + PAD.w / 2, y, at.z + PAD.d / 2], [at.x - PAD.w / 2, y, at.z + PAD.d / 2], edge)
      line([at.x - PAD.w / 2, y, at.z + PAD.d / 2], [at.x - PAD.w / 2, y, at.z - PAD.d / 2], edge)
      if (away && p.mode === 'board') {
        line([at.x - 0.12, y, at.z], [at.x + 0.12, y, at.z], colors.accent)
        line([at.x, y, at.z - 0.12], [at.x, y, at.z + 0.12], colors.accent)
      }
    })

    const w = sim.arm.pos
    const dx = w.x - ARM.x, dz = w.z - ARM.z
    const yaw = Math.atan2(-dz, dx)
    const r = Math.max(Math.hypot(dx, dz), 0.001)
    const h = w.y - ARM.h0
    const d = Math.min(Math.max(Math.hypot(r, h), Math.abs(ARM.l1 - ARM.l2) + 0.05), ARM.l1 + ARM.l2 - 0.01)
    const phi = Math.atan2(h, r)
    const a = Math.acos(Math.min(1, Math.max(-1, (ARM.l1 * ARM.l1 + d * d - ARM.l2 * ARM.l2) / (2 * ARM.l1 * d))))
    const t1 = phi + a
    const t2 = Math.atan2(h - ARM.l1 * Math.sin(t1), r - ARM.l1 * Math.cos(t1))
    const armEdge = sim.arm.holding ? colors.accent : colors.edge
    const [turret, shoulder, elbow, wrist, mA, mB] = M
    turret.makeTranslation(ARM.x, 0, ARM.z).multiply(mA.makeRotationY(yaw))
    shoulder.copy(turret).multiply(mA.makeTranslation(0, ARM.h0, 0)).multiply(mB.makeRotationZ(t1))
    elbow.copy(shoulder).multiply(mA.makeTranslation(ARM.l1, 0, 0)).multiply(mB.makeRotationZ(t2 - t1))
    wrist.copy(elbow).multiply(mA.makeTranslation(ARM.l2, 0, 0)).multiply(mB.makeRotationZ(-t2))
    const local = (base: Matrix4, size: V3, at: V3, fill: Color, edge: Color) => {
      dummy.position.set(0, 0, 0)
      dummy.rotation.set(0, 0, 0)
      dummy.scale.set(size[0], size[1], size[2])
      dummy.updateMatrix()
      put(mA.copy(base).multiply(mB.makeTranslation(at[0], at[1], at[2])).multiply(dummy.matrix), fill, edge, null)
    }
    putCyl(mA.copy(turret).multiply(mB.makeTranslation(0, (ARM.h0 + 0.34) / 2, 0)), 0.42, ARM.h0 - 0.34, colors.bg, colors.edge)
    putCyl(mA.copy(shoulder).multiply(SIDEWAYS), 0.42, 0.96, colors.bg, colors.edge)
    local(shoulder, [ARM.l1, 0.28, 0.26], [ARM.l1 / 2, 0, 0.3], colors.bg, colors.edge)
    local(shoulder, [ARM.l1, 0.28, 0.26], [ARM.l1 / 2, 0, -0.3], colors.bg, colors.edge)
    putCyl(mA.copy(elbow).multiply(SIDEWAYS), 0.36, 0.9, colors.bg, colors.edge)
    local(elbow, [ARM.l2, 0.32, 0.32], [ARM.l2 / 2, 0, 0], colors.bg, colors.edge)
    putCyl(mA.copy(wrist).multiply(SIDEWAYS), 0.24, 0.6, colors.bg, colors.edge)
    local(wrist, [0.5, 0.28, 0.86], [0, -0.32, 0], colors.bg, armEdge)
    const openF = 0.36 - sim.arm.grip * 0.1
    local(wrist, [0.36, 0.38, 0.06], [0, -0.62, openF], colors.bg, armEdge)
    local(wrist, [0.36, 0.38, 0.06], [0, -0.62, -openF], colors.bg, armEdge)

    for (const p of sim.live) {
      if (!p.visible) continue
      const hovered = hover.ref === p.item.ref
      const match = !!query && p.mode === 'board' && (p.item.title + p.item.label + p.item.ref).toLowerCase().includes(query.toLowerCase())
      const dimmed = !!query && p.mode === 'board' && !match
      const lift = hovered && (p.mode === 'home' || p.mode === 'board') ? 0.12 : 0
      const edge = p.flash > 0 ? colA.copy(colors.edge).lerp(agentColor, Math.min(1, p.flash * 1.4)) : hovered || p.mode === 'held' || p.mode === 'queued' || match ? colors.accent : dimmed ? colors.dim : colors.edge
      const fill = dimmed ? colors.bg : hueOf(p.item.hue)
      putBox(p.pos.x, p.pos.y + lift, p.pos.z, p.size, p.scale, p.spin, p.spin * 0.3, fill, edge, { t: 'part', p })
      if (p.mode === 'board' && p.item.kind === 'block' && p.scale > 0.3) {
        const hw = (p.size[0] * p.scale) / 2, hd = (p.size[2] * p.scale) / 2, y = BOARD.y + 0.01, n = 5
        for (let k = 0; k < n; k++) {
          const u = -hw + ((k + 0.5) / n) * hw * 2
          line([p.pos.x + u, y, p.pos.z - hd], [p.pos.x + u, y, p.pos.z - hd - 0.09], edge)
          line([p.pos.x + u, y, p.pos.z + hd], [p.pos.x + u, y, p.pos.z + hd + 0.09], edge)
        }
      }
    }

    for (const key of Object.keys(SOCKET) as (keyof typeof SOCKET)[]) {
      const s = SOCKET[key]
      const bump = Math.sin(sim.drops[key] * Math.PI) * 0.5
      const hovered = hover.ref === `socket:${key}`
      putBox(s.x, BOARD.y + s.h / 2 + bump, s.z, [s.w, s.h, s.d], 1, 0, 0, colors.bg, hovered ? colors.accent : colors.edge, { t: 'socket', key })
    }
    if (lab.setup.agent !== 'none') {
      const bump = Math.sin(sim.drops.pod * Math.PI) * 0.5
      const agent = agentColor
      putBox(POD.x, POD.y + bump, POD.z, [POD.w, POD.h, POD.d], 1, 0, 0, colors.bg, hover.ref === 'pod' ? colors.accent : agent, { t: 'pod' })
      putBox(POD.x + POD.w / 2 - 0.12, POD.y + POD.h / 2 + bump + 0.02, POD.z - POD.d / 2 + 0.12, [0.08, 0.04, 0.08], 1, 0, 0, sim.probe && Math.sin(sim.time * 18) > 0 ? colors.fg : agent, agent, null)
      const j = SOCKET.j1
      line([j.x, BOARD.y + j.h + 0.05, j.z], [j.x, BOARD.y + j.h + 0.45, j.z + 0.5], agent)
      line([j.x, BOARD.y + j.h + 0.45, j.z + 0.5], [POD.x, POD.y + bump + POD.h / 2, POD.z - POD.d / 2], agent)
    }
    if (active >= 0 && aisles[active]?.id.startsWith('block:')) {
      const b = BANDS.findIndex((band) => band.groups.includes(aisles[active].id.slice(6)))
      const bb = b === -1 ? BANDS.length - 1 : b
      const y = BOARD.y + 0.006
      const x0 = PAGE_AREA.x0 + 0.02, x1 = PAGE_AREA.x1 - 0.02, z0 = bandZ(bb) + 0.02, z1 = bandZ(bb) + BAND_D - 0.02
      line([x0, y, z0], [x1, y, z0], colors.accent)
      line([x1, y, z0], [x1, y, z1], colors.accent)
      line([x1, y, z1], [x0, y, z1], colors.accent)
      line([x0, y, z1], [x0, y, z0], colors.accent)
    }

    mesh.count = i
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    cylMesh.count = ci
    cylMesh.instanceMatrix.needsUpdate = true
    if (cylMesh.instanceColor) cylMesh.instanceColor.needsUpdate = true
    geometry.setDrawRange(0, v)
    ;(geometry.getAttribute('position') as BufferAttribute).needsUpdate = true
    ;(geometry.getAttribute('color') as BufferAttribute).needsUpdate = true
  })

  const pickAt = (id: number | undefined) => (id === undefined ? null : (ids.current[id] ?? null))
  const describe = (pick: Pick): [string, string, string?] | null => {
    if (!pick) return null
    if (pick.t === 'drawer') {
      const a = aisles[pick.i]
      return [a.label, `Aisle ${String(a.no).padStart(2, '0')} · ${a.count} parts · click to open`]
    }
    if (pick.t === 'part') {
      const p = pick.p
      const image = lab.theme === 'dark' ? (p.item.imageDark ?? p.item.image) : p.item.image
      const verb = p.mode === 'board' ? 'on the board · click for details' : p.mode === 'home' ? 'click to add to the build' : 'on its way'
      return [p.item.title, `${p.item.label} · ${p.code} · ${verb}`, image]
    }
    if (pick.t === 'socket') {
      const s = lab.setup
      const value = { cpu: frameworks.find((f) => f.value === s.framework)!.label, mem: databases.find((d) => d.value === s.database)!.label, pwr: packageManagers.find((m) => m.value === s.packageManager)!.label, j1: agents.find((a) => a.value === s.agent)!.label }[pick.key]
      const name = { cpu: 'Framework', mem: 'Database', pwr: 'Package manager', j1: 'Agent' }[pick.key]
      return [`${name} · ${value}`, 'click to swap']
    }
    return [`${agents.find((a) => a.value === lab.setup.agent)!.label} probe`, 'flashes each new part · click to swap agent']
  }
  const keyOf = (pick: Pick) => (!pick ? null : pick.t === 'drawer' ? `drawer:${aisles[pick.i].id}` : pick.t === 'part' ? pick.p.item.ref : pick.t === 'socket' ? `socket:${pick.key}` : 'pod')
  return (
    <group>
      <instancedMesh
        ref={boxes}
        args={[undefined, undefined, CAP]}
        frustumCulled={false}
        onPointerDown={(e) => {
          const pick = pickAt(e.instanceId)
          hover.pressed = pick?.t === 'part' ? pick.p : null
        }}
        onPointerMove={(e) => {
          e.stopPropagation()
          const pick = pickAt(e.instanceId)
          const key = keyOf(pick)
          hover.picking = !!pick && (pick.t === 'drawer' || (pick.t === 'part' && pick.p.mode === 'home'))
          if (key !== hover.ref) {
            hover.ref = key
            const text = describe(pick)
            if (text) tip.show(e.nativeEvent, text[0], text[1], text[2])
            else tip.hide()
            invalidate()
          }
          tip.move(e.nativeEvent)
        }}
        onPointerOut={() => {
          hover.ref = null
          hover.picking = false
          tip.hide()
          invalidate()
        }}
        onClick={(e) => {
          e.stopPropagation()
          if (guard.moved) return
          const pick = pickAt(e.instanceId)
          if (!pick) return
          if (pick.t === 'drawer') onDrawer(pick.i)
          else if (pick.t === 'part') onPart(pick.p)
          else if (pick.t === 'socket') onSocket(pick.key)
          else onSocket('j1')
        }}
      >
        <boxGeometry />
        <meshBasicMaterial />
      </instancedMesh>
      <instancedMesh ref={cyls} args={[cylGeometry, undefined, CYL_CAP]} frustumCulled={false} raycast={() => null}>
        <meshBasicMaterial />
      </instancedMesh>
      <lineSegments ref={lines} geometry={geometry} frustumCulled={false}>
        <lineBasicMaterial vertexColors />
      </lineSegments>
    </group>
  )
}

/** One atlas texture and one quad mesh for every drawer label; quads ride their drawer each frame. */
export function DrawerLabels({ aisles, active, matches, c, sim }: { aisles: readonly Aisle[]; active: number; matches: number[] | null; c: Look; sim: Sim }) {
  const n = aisles.length
  const CW = 640, CH = 112
  const fonts = useFontsReady()
  const atlas = useMemo(
    () =>
      textTexture(CW * CAB.cols, CH * cabinetRows(n), (ctx) => {
        aisles.forEach((aisle, k) => {
          const x = (k % CAB.cols) * CW, y = Math.floor(k / CAB.cols) * CH
          const none = matches && !matches[k]
          ctx.globalAlpha = none ? 0.35 : 1
          ctx.fillStyle = tint(aisle.hue, c)
          ctx.fillRect(x + 20, y + 26, 12, 60)
          ctx.fillStyle = k === active ? c.accent : c.fg
          ctx.font = `500 56px ${FONT}`
          ctx.textAlign = 'left'
          ctx.fillText(fitText(ctx, aisle.label, 420), x + 50, y + 76)
          ctx.fillStyle = matches && matches[k] ? c.accent : c.muted
          ctx.font = `400 44px ${FONT}`
          ctx.textAlign = 'right'
          ctx.fillText(matches ? `${matches[k]}/${aisle.count}` : String(aisle.count), x + CW - 26, y + 76)
        })
      }),
    [aisles, active, matches, c, n, fonts],
  )
  useEffect(() => () => atlas.dispose(), [atlas])
  const geometry = useMemo(() => {
    const g = new BufferGeometry()
    const pos = new Float32Array(n * 4 * 3)
    const uv = new Float32Array(n * 4 * 2)
    const index: number[] = []
    const rows = cabinetRows(n)
    for (let k = 0; k < n; k++) {
      const cx = k % CAB.cols, cy = Math.floor(k / CAB.cols)
      const u0 = cx / CAB.cols, u1 = (cx + 1) / CAB.cols, v1 = 1 - cy / rows, v0 = 1 - (cy + 1) / rows
      uv.set([u0, v0, u1, v0, u1, v1, u0, v1], k * 8)
      index.push(k * 4, k * 4 + 1, k * 4 + 2, k * 4, k * 4 + 2, k * 4 + 3)
    }
    g.setAttribute('position', new BufferAttribute(pos, 3).setUsage(DynamicDrawUsage))
    g.setAttribute('uv', new BufferAttribute(uv, 2))
    g.setIndex(index)
    return g
  }, [n])
  useFrame(() => {
    const pos = geometry.getAttribute('position') as BufferAttribute
    for (let k = 0; k < n; k++) {
      const at = drawerPos(k, v3)
      const z = CAB.front + sim.drawers[k] + 0.003
      const x0 = at.x - CAB.w / 2 + 0.05, x1 = at.x + CAB.w / 2 - 0.05, y0 = at.y - CAB.h / 2 + 0.03, y1 = at.y + CAB.h / 2 - 0.03
      pos.set([x0, y0, z, x1, y0, z, x1, y1, z, x0, y1, z], k * 12)
    }
    pos.needsUpdate = true
  })
  return (
    <mesh geometry={geometry} frustumCulled={false} renderOrder={1}>
      <meshBasicMaterial map={atlas} transparent toneMapped={false} depthWrite={false} />
    </mesh>
  )
}

/** The bay strip at the tray's front edge: label, page count, paging arrows. Clicking a half pages. */
export function TrayStrip({ c, label, pages, page, setPage, tip, guard }: { c: Look; label: string; pages: number; page: number; setPage: (n: number) => void; tip: Tip; guard: Guard }) {
  const fonts = useFontsReady()
  const strip = useMemo(
    () =>
      textTexture(1024, 96, (ctx) => {
        ctx.fillStyle = c.bg
        ctx.fillRect(0, 0, 1024, 96)
        ctx.fillStyle = c.muted
        ctx.font = `500 38px ${FONT}`
        ctx.fillText(fitText(ctx, label, 720), 110, 62)
        ctx.textAlign = 'right'
        ctx.fillStyle = c.fg
        ctx.fillText(`${page + 1} / ${pages}`, 910, 62)
        ctx.strokeStyle = pages > 1 ? c.fg : c.dim
        ctx.lineWidth = 4
        ctx.beginPath()
        ctx.moveTo(60, 28); ctx.lineTo(36, 48); ctx.lineTo(60, 68)
        ctx.moveTo(964, 28); ctx.lineTo(988, 48); ctx.lineTo(964, 68)
        ctx.stroke()
      }),
    [c, label, page, pages, fonts],
  )
  useEffect(() => () => strip.dispose(), [strip])
  const cx = (TABLE.x0 + TABLE.x1) / 2, w = TABLE.x1 - TABLE.x0
  return (
    <mesh
      position={[cx, TABLE.y + 0.005, TABLE.z1 - 0.3]}
      rotation={[-Math.PI / 2, 0, 0]}
      onClick={(e) => {
        e.stopPropagation()
        if (guard.moved || pages < 2) return
        setPage((page + (e.point.x - cx < 0 ? pages - 1 : 1)) % pages)
      }}
      onPointerOver={(e) => { e.stopPropagation(); tip.show(e.nativeEvent, 'Pick tray', pages > 1 ? 'Click a half to turn the page' : 'One page') }}
      onPointerMove={(e) => tip.move(e.nativeEvent)}
      onPointerOut={() => tip.hide()}
    >
      <planeGeometry args={[w - 0.3, (w - 0.3) * (96 / 1024)]} />
      <meshBasicMaterial map={strip} toneMapped={false} />
    </mesh>
  )
}

/** Empty pads call their part back: the removal affordance beside the add one. */
export function TrayPads({ pageParts, lab, guard, tip }: { pageParts: readonly Part[]; lab: Lab; guard: Guard; tip: Tip }) {
  const padAt = (x: number, z: number) => {
    const i = Math.round((x - PAD.x0) / PAD.dx), j = Math.round((z - PAD.z0) / PAD.dz)
    if (i < 0 || i >= PAD.cols || j < 0 || j >= PAD.rows) return null
    const p = pageParts[j * PAD.cols + i] ?? null
    return p && (p.mode === 'board' || p.mode === 'held' || p.mode === 'toss' || p.mode === 'belt' || (p.fly && p.mode !== 'queued')) ? p : null
  }
  return (
    <mesh
      position={[(TABLE.x0 + TABLE.x1) / 2, TABLE.y + 0.002, (PAD.z0 + PAD.z0 + (PAD.rows - 1) * PAD.dz) / 2]}
      rotation={[-Math.PI / 2, 0, 0]}
      visible={false}
      onClick={(e) => {
        e.stopPropagation()
        if (guard.moved) return
        const p = padAt(e.point.x, e.point.z)
        if (p) lab.toggle(p.item.ref)
      }}
      onPointerMove={(e) => {
        const p = padAt(e.point.x, e.point.z)
        if (p) tip.show(e.nativeEvent, p.item.title, p.mode === 'board' ? 'on the board · click to send it back' : 'on its way · click to call it back')
        else tip.hide()
      }}
      onPointerOut={() => tip.hide()}
    >
      <planeGeometry args={[TABLE.x1 - TABLE.x0, PAD.rows * PAD.dz]} />
    </mesh>
  )
}

/** Belt slats, turning while the cell is awake and resting otherwise, so an idle scene draws nothing new. */
export function Belt({ c, sim, motion }: { c: Look; sim: Sim; motion: Motion }) {
  const ref = useRef<InstancedMesh>(null)
  const len = BELT.end - BELT.start + 1.0
  const n = 20
  const run = useRef(0)
  useFrame((_, dt) => {
    const m = ref.current
    if (!m) return
    if (idleLoops(sim, motion.current)) run.current = (run.current + Math.min(dt, 0.1) * BELT.speed) % (len / n)
    const offset = run.current
    for (let i = 0; i < n; i++) {
      dummy.position.set(BELT.start - 0.5 + (((i * len) / n + offset) % len), BELT.y - 0.07, BELT.z)
      dummy.rotation.set(0, 0, 0)
      dummy.scale.set(1, 1, 1)
      dummy.updateMatrix()
      m.setMatrixAt(i, dummy.matrix)
    }
    m.instanceMatrix.needsUpdate = true
  })
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, n]} frustumCulled={false}>
      <boxGeometry args={[0.02, 0.012, 1.2]} />
      <meshBasicMaterial color={c.edge} />
    </instancedMesh>
  )
}

const socketTitle = { cpu: 'FRAMEWORK', mem: 'DATABASE', pwr: 'PACKAGES', j1: 'AGENT' } as const

/** Silkscreen: page band names and socket captions, one texture over the board. */
export function Silk({ setup, c, activeBand }: { setup: Setup; c: Look; activeBand: number }) {
  const W = 2048, H = Math.round((W * (BOARD.z1 - BOARD.z0)) / (BOARD.x1 - BOARD.x0))
  const PX = W / (BOARD.x1 - BOARD.x0)
  const fonts = useFontsReady()
  const silk = useMemo(
    () =>
      textTexture(W, H, (ctx) => {
        const text = (s: string, x: number, z: number, size: number, weight = 500, color = c.muted, align: CanvasTextAlign = 'left', font = MONO) => {
          ctx.fillStyle = color
          ctx.font = `${weight} ${size * PX}px ${font}`
          ctx.textAlign = align
          ctx.fillText(s, (x - BOARD.x0) * PX, (z - BOARD.z0) * PX)
        }
        BANDS.forEach((band, b) => {
          const on = b === activeBand
          text(String(b + 1).padStart(2, '0'), PAGE_AREA.x0 + 0.08, bandZ(b) + 0.32, 0.24, 600, on ? c.accent : c.muted)
          text(band.label, PAGE_AREA.x0 + 0.08, bandZ(b) + 0.56, 0.19, 600, on ? c.accent : c.muted)
        })
        for (const key of ['cpu', 'mem', 'pwr', 'j1'] as const) {
          const s = SOCKET[key]
          text(socketTitle[key], s.x - s.w / 2 - 0.08, s.z - s.d / 2 - 0.13, 0.13, 600, c.muted)
        }
        text('FEATURES', FEATURE_BAY.x - 0.8, FEATURE_BAY.z0 - 0.13, 0.13, 600, c.muted)
        text('COMPONENTS', COMPONENT_BAY.x0 - 0.05, COMPONENT_BAY.z0 - 0.13, 0.13, 600, c.muted)
        text('PAGE · TOP TO BOTTOM', PAGE_AREA.x0, PAGE_AREA.z0 - 0.14, 0.14, 600, c.muted)
        text(setup.target === 'new' ? `${setup.name || 'my-payload-app'} · init` : 'payload-toolkit add', BOARD.x1 - 0.3, BOARD.z1 - 0.18, 0.2, 600, c.muted, 'right')
        text('PAYLOAD/APP · REV 4', BOARD.x0 + 0.3, BOARD.z1 - 0.18, 0.2, 600, c.muted)
      }),
    [setup.target, setup.name, c, activeBand, H, PX, fonts],
  )
  useEffect(() => () => silk.dispose(), [silk])
  return (
    <mesh renderOrder={1} position={[(BOARD.x0 + BOARD.x1) / 2, BOARD.y + 0.003, (BOARD.z0 + BOARD.z1) / 2]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[BOARD.x1 - BOARD.x0, BOARD.z1 - BOARD.z0]} />
      <meshBasicMaterial map={silk} transparent toneMapped={false} depthWrite={false} />
    </mesh>
  )
}

/** The value each socket holds, as its chip marking, riding the socket's swap bump. */
export function SocketArt({ setup, c, sim }: { setup: Setup; c: Look; sim: Sim }) {
  const values = {
    cpu: frameworks.find((f) => f.value === setup.framework)!.label,
    mem: databases.find((d) => d.value === setup.database)!.label,
    pwr: packageManagers.find((m) => m.value === setup.packageManager)!.label,
    j1: agents.find((a) => a.value === setup.agent)!.label,
  }
  return (
    <>
      {(['cpu', 'mem', 'pwr', 'j1'] as const).map((key) => (
        <SocketTop key={key} id={key} value={values[key]} c={c} sim={sim} />
      ))}
    </>
  )
}

function SocketTop({ id, value, c, sim }: { id: keyof typeof SOCKET; value: string; c: Look; sim: Sim }) {
  const s = SOCKET[id]
  const ref = useRef<Mesh>(null)
  const W = 512, H = Math.round((W * s.d) / s.w)
  const fonts = useFontsReady()
  const art = useMemo(
    () =>
      textTexture(W, H, (ctx) => {
        ctx.fillStyle = c.bg
        ctx.fillRect(0, 0, W, H)
        ctx.strokeStyle = c.dim
        ctx.lineWidth = 3
        ctx.strokeRect(14, 14, W - 28, H - 28)
        if (id === 'cpu') {
          ctx.beginPath()
          ctx.arc(44, 44, 9, 0, Math.PI * 2)
          ctx.stroke()
        }
        ctx.fillStyle = c.fg
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        const size = Math.min(H * 0.42, 76)
        ctx.font = `600 ${size}px ${FONT}`
        ctx.fillText(fitText(ctx, value, W - 60), W / 2, H / 2 + 2)
      }),
    [value, c, id, H, fonts],
  )
  useEffect(() => () => art.dispose(), [art])
  useFrame(() => {
    if (ref.current) ref.current.position.y = BOARD.y + s.h + 0.004 + Math.sin(sim.drops[id] * Math.PI) * 0.5
  })
  return (
    <mesh ref={ref} position={[s.x, BOARD.y + s.h + 0.004, s.z]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
      <planeGeometry args={[s.w * 0.96, s.d * 0.96]} />
      <meshBasicMaterial map={art} toneMapped={false} />
    </mesh>
  )
}

const TRACE_CAP = 12000
const PULSES = 48

/** Lit traces for seated parts, drawn in as they seat, the probe's flash route, and the sim's pulses riding them. */
export function Traces({ sim, lab, c }: { sim: Sim; lab: Lab; c: Look }) {
  const seg = useRef<LineSegments>(null)
  const points = useRef<Points>(null)
  const buffers = useMemo(() => ({ pos: new Float32Array(TRACE_CAP * 3), col: new Float32Array(TRACE_CAP * 3), dots: new Float32Array(PULSES * 3) }), [])
  const geometry = useMemo(() => {
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(buffers.pos, 3).setUsage(DynamicDrawUsage))
    g.setAttribute('color', new BufferAttribute(buffers.col, 3).setUsage(DynamicDrawUsage))
    return g
  }, [buffers])
  const dots = useMemo(() => {
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(buffers.dots, 3).setUsage(DynamicDrawUsage))
    return g
  }, [buffers])
  const accent = useMemo(() => new Color(c.accent), [c])
  useFrame(() => {
    const { pos, col } = buffers
    let v = 0
    const emit = (a: Vector3, b: Vector3, color: Color) => {
      if (v + 2 > TRACE_CAP) return
      pos[v * 3] = a.x; pos[v * 3 + 1] = a.y; pos[v * 3 + 2] = a.z
      col[v * 3] = color.r; col[v * 3 + 1] = color.g; col[v * 3 + 2] = color.b
      v++
      pos[v * 3] = b.x; pos[v * 3 + 1] = b.y; pos[v * 3 + 2] = b.z
      col[v * 3] = color.r; col[v * 3 + 1] = color.g; col[v * 3 + 2] = color.b
      v++
    }
    const drawRoute = (route: Vector3[], fraction: number, color: Color) => {
      let left = fraction * routeLength(route)
      for (let k = 1; k < route.length && left > 0; k++) {
        const a = route[k - 1], b = route[k]
        const len = a.distanceTo(b)
        if (left >= len) emit(a, b, color)
        else emit(a, v3.lerpVectors(a, b, left / len), color)
        left -= len
      }
    }
    for (const p of sim.live) if (p.mode === 'board' && p.route && p.drawn > 0) drawRoute(p.route, p.drawn, accent)
    const probe = sim.probe
    if (probe && probe.t > 0 && probe.part.slot) {
      colA.set(AGENT_COLOR[lab.setup.agent] || c.accent)
      drawRoute(probeRoute(probe.part.slot, probe.part.size), probe.t, colA)
    }
    geometry.setDrawRange(0, v)
    ;(geometry.getAttribute('position') as BufferAttribute).needsUpdate = true
    ;(geometry.getAttribute('color') as BufferAttribute).needsUpdate = true

    let w = 0
    for (const pulse of sim.pulses) {
      if (pulse.t < 0 || pulse.t > 1 || w >= PULSES) continue
      sampleRoute(pulse.route, pulse.t, v3)
      buffers.dots[w * 3] = v3.x; buffers.dots[w * 3 + 1] = v3.y + 0.02; buffers.dots[w * 3 + 2] = v3.z
      w++
    }
    dots.setDrawRange(0, w)
    ;(dots.getAttribute('position') as BufferAttribute).needsUpdate = true
  })
  return (
    <>
      <lineSegments ref={seg} geometry={geometry} frustumCulled={false}>
        <lineBasicMaterial vertexColors />
      </lineSegments>
      <points ref={points} geometry={dots} frustumCulled={false}>
        <pointsMaterial color={c.accent} size={5} sizeAttenuation={false} toneMapped={false} />
      </points>
    </>
  )
}

const loader = new TextureLoader()
const cache = new Map<string, { texture: Texture | null; waiting: ((t: Texture) => void)[] }>()
function screenshot(url: string, onLoad: (t: Texture) => void) {
  const hit = cache.get(url)
  if (hit?.texture) return onLoad(hit.texture)
  if (hit) return void hit.waiting.push(onLoad)
  const entry = { texture: null as Texture | null, waiting: [onLoad] }
  cache.set(url, entry)
  loader.load(url, (t) => {
    t.colorSpace = SRGBColorSpace
    t.anisotropy = 8
    const img = t.image as HTMLImageElement
    const aspect = img.height / img.width
    const want = 0.72 / 0.96
    if (aspect > want) {
      t.repeat.set(1, want / aspect)
      t.offset.set(0, 1 - want / aspect)
    }
    entry.texture = t
    entry.waiting.forEach((fn) => fn(t))
    entry.waiting = []
  })
}

function Lid({ p, lab, hover }: { p: Part; lab: Lab; hover: Hover }) {
  const ref = useRef<Mesh>(null)
  const [texture, setTexture] = useState<Texture | null>(null)
  const image = lab.theme === 'dark' ? (p.item.imageDark ?? p.item.image) : p.item.image
  useEffect(() => {
    let live = true
    setTexture(null)
    if (image) screenshot(image, (t) => live && setTexture(t))
    return () => { live = false }
  }, [image])
  useFrame(() => {
    const m = ref.current
    if (!m) return
    m.visible = p.visible && !!texture && p.scale > 0.25
    if (!m.visible) return
    const lift = hover.ref === p.item.ref && (p.mode === 'home' || p.mode === 'board') ? 0.12 : 0
    m.position.set(p.pos.x, p.pos.y + lift, p.pos.z)
    m.rotation.set(p.spin * 0.3, p.spin, 0)
    m.scale.setScalar(p.scale)
  })
  return (
    <mesh ref={ref} visible={false} raycast={() => null}>
      <boxGeometry args={[p.size[0] * 0.98, p.size[1] + 0.004, p.size[2] * 0.98]} />
      {[0, 1, 3, 4, 5].map((k) => <meshBasicMaterial key={k} attach={`material-${k}`} visible={false} />)}
      <meshBasicMaterial attach="material-2" map={texture} toneMapped={false} transparent />
    </mesh>
  )
}

/** A screenshot face for every live block, loaded once per URL the first time it is shown; the cache goes with the scene. */
export function Lids({ sim, lab, hover }: { sim: Sim; lab: Lab; hover: Hover }) {
  const [, force] = useState(0)
  const seen = useRef(-1)
  useEffect(
    () => () => {
      for (const entry of cache.values()) entry.texture?.dispose()
      cache.clear()
    },
    [],
  )
  useFrame(() => {
    if (sim.liveVersion !== seen.current) {
      seen.current = sim.liveVersion
      force((n) => n + 1)
    }
  })
  return <>{[...sim.live].filter((p) => p.item.image).map((p) => <Lid key={p.item.ref} p={p} lab={lab} hover={hover} />)}</>
}

