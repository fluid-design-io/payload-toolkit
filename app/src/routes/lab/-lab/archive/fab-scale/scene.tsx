import { useFrame, useThree } from '@react-three/fiber'
import type { ThreeEvent } from '@react-three/fiber'
import { Grid, Line } from '@react-three/drei'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  BoxGeometry, BufferGeometry, Color, DynamicDrawUsage, Float32BufferAttribute, Group, InstancedBufferAttribute, InstancedMesh, LineBasicMaterial,
  Matrix4, Mesh, MeshBasicMaterial, Object3D, PlaneGeometry, SphereGeometry, Sphere, Vector3,
} from 'three'
import { Line as ThreeLine } from 'three'
import type { Texture } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import type { Lab } from '../../lab.types'
import { circle, instancedEdges, solidGeometry } from './kit/hairline'
import type { Shape } from './kit/hairline'
import { FONT, MONO, textTexture, tint } from './kit/look'
import type { Guard, Hover, Look, Tip } from './kit/look'
import { screenshot } from './kit/textures'
import { ARM, BELT, BELT_LENGTH, BELT_PATH, BOARD, CARD, DROP, RETURN, RUNWAY, WALL, beltAt, cabinetHeight, runwayX } from './layout'
import type { Sim, Part } from './sim'

type V3 = [number, number, number]
type Placed = { size: V3; at: V3 }
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
const noop = () => {}
/** three caches an instanced mesh's bounds on its first raycast; anything whose instances move gets these fixed bounds instead. */
export const WORLD = new Sphere(new Vector3(0, 0, 0), 400)

/** A rigid group of shapes in two draw calls: one merged fill, one merged hairline. `shapes` and `strokes` must be stable. */
function Solid({ shapes, strokes, c, edge }: { shapes: readonly Shape[]; strokes?: readonly (readonly number[])[]; c: Look; edge?: string }) {
  const geo = useMemo(() => solidGeometry(shapes, strokes), [shapes, strokes])
  const fill = useMemo(() => new MeshBasicMaterial({ color: c.surface }), [c.surface])
  const line = useMemo(() => new LineBasicMaterial({ color: edge ?? c.edge }), [edge, c.edge])
  useEffect(() => () => {
    geo.fill.dispose()
    geo.edges.dispose()
  }, [geo])
  useEffect(() => () => fill.dispose(), [fill])
  useEffect(() => () => line.dispose(), [line])
  return (
    <>
      <mesh geometry={geo.fill} material={fill} raycast={noop} />
      <lineSegments geometry={geo.edges} material={line} raycast={noop} />
    </>
  )
}

const boxes = (list: readonly Placed[]): Shape[] => list.map((b) => ({ box: b.size, at: b.at }))

function useLines(pts: readonly number[]) {
  const geo = useMemo(() => {
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(pts as number[], 3))
    return g
  }, [pts])
  useEffect(() => () => geo.dispose(), [geo])
  return geo
}

export function Floor({ c, slots, cabinets, ready }: { c: Look; slots: number; cabinets: number; ready: boolean }) {
  const { x0, x1 } = runwayX(cabinets)
  const block = useMemo(
    () =>
      ready
        ? textTexture(1024, 512, (ctx) => {
            ctx.strokeStyle = c.edge
            ctx.fillStyle = c.edge
            ctx.lineWidth = 4
            ctx.strokeRect(6, 6, 1012, 500)
            ctx.lineWidth = 2
            ctx.beginPath()
            for (const y of [150, 260, 370]) {
              ctx.moveTo(6, y)
              ctx.lineTo(1018, y)
            }
            ctx.moveTo(520, 150)
            ctx.lineTo(520, 506)
            ctx.stroke()
            ctx.font = `600 64px ${FONT}`
            ctx.fillText('PAYLOAD TOOLKIT', 36, 100)
            const rows = [['TITLE', 'STORAGE WALL + CELL A'], ['DWG NO.', 'PT-009 · REV A'], ['SCALE', '1 : 100'], ['DRAWN', 'FAB-SCALE'], ['DATE', '2026-10-09'], ['SHEET', '1 OF 1']]
            rows.forEach(([k, v], i) => {
              const x = i % 2 ? 546 : 30, y = 215 + Math.floor(i / 2) * 110
              ctx.globalAlpha = 0.6
              ctx.font = `500 26px ${FONT}`
              ctx.fillText(k, x, y - 26)
              ctx.globalAlpha = 1
              ctx.font = `500 38px ${FONT}`
              ctx.fillText(v, x, y + 22)
            })
          })
        : null,
    [c, ready],
  )
  useEffect(() => () => block?.dispose(), [block])
  const h = cabinetHeight(slots)
  const sheet = useMemo<V3[]>(() => [[x0 - 1, 0.01, WALL.z0 - 2.4], [x1 + 1, 0.01, WALL.z0 - 2.4], [x1 + 1, 0.01, 8.2], [x0 - 1, 0.01, 8.2], [x0 - 1, 0.01, WALL.z0 - 2.4]], [x0, x1])
  const mezz = useMemo<V3[]>(() => [[x0, 0.012, WALL.z0 - 0.4], [x1, 0.012, WALL.z0 - 0.4], [x1, 0.012, RUNWAY.zFront + 0.4], [x0, 0.012, RUNWAY.zFront + 0.4], [x0, 0.012, WALL.z0 - 0.4]], [x0, x1])
  const dims = useLines(
    useMemo(() => {
      const z = WALL.z1 + 0.6
      return [x0 - 0.4, 0, z, x0 - 0.4, h, z, x0 - 0.7, h, z, x0 - 0.1, h, z, x0 - 0.7, 0, z, x0 - 0.1, 0, z]
    }, [x0, h]),
  )
  return (
    <group>
      <Grid position={[0, 0, 0]} args={[160, 160]} cellSize={0.5} cellThickness={0.6} cellColor={c.grid} sectionSize={2.5} sectionThickness={1} sectionColor={c.gridMajor} fadeDistance={110} fadeStrength={1.4} infiniteGrid />
      <Line points={sheet} color={c.dim} lineWidth={1.4} />
      <Line points={mezz} color={c.dim} lineWidth={1} dashed dashSize={0.4} gapSize={0.25} />
      {block && (
        <mesh position={[-10.2, 0.02, 5.4]} rotation={[-Math.PI / 2, 0, 0]} raycast={noop}>
          <planeGeometry args={[7.6, 3.8]} />
          <meshBasicMaterial map={block} transparent toneMapped={false} depthWrite={false} />
        </mesh>
      )}
      <lineSegments geometry={dims} raycast={noop}>
        <lineBasicMaterial color={c.edge} />
      </lineSegments>
    </group>
  )
}

const BRIDGE = boxes([
  { size: [0.5, 0.36, RUNWAY.zFront - RUNWAY.zBack + 0.6], at: [0, RUNWAY.y + 0.42, (RUNWAY.zBack + RUNWAY.zFront) / 2] },
  { size: [0.9, 0.3, 0.6], at: [0, RUNWAY.y + 0.39, RUNWAY.zBack] },
  { size: [0.9, 0.3, 0.6], at: [0, RUNWAY.y + 0.39, RUNWAY.zFront] },
])
const TROLLEY = boxes([{ size: [0.7, 0.3, 0.7], at: [0, RUNWAY.y + 0.1, 0] }])
const HOOK = boxes([
  { size: [1.3, 0.1, 1.0], at: [0, -0.5, 0] },
  { size: [0.08, 0.5, 0.08], at: [0, -0.2, 0] },
  { size: [1.3, 0.3, 0.04], at: [0, -0.33, -0.5] },
  { size: [1.3, 0.3, 0.04], at: [0, -0.33, 0.5] },
])

export function Crane({ sim, c, cabinets }: { sim: Sim; c: Look; cabinets: number }) {
  const { x0, x1 } = runwayX(cabinets)
  const bridge = useRef<Group>(null)
  const trolley = useRef<Group>(null)
  const hook = useRef<Group>(null)
  const cable = useMemo(() => {
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(new Float32Array(6), 3))
    const l = new ThreeLine(g, new LineBasicMaterial({ color: c.edge }))
    l.frustumCulled = false
    l.raycast = noop
    return l
  }, [c.edge])
  useEffect(() => () => {
    cable.geometry.dispose()
    ;(cable.material as LineBasicMaterial).dispose()
  }, [cable])
  const statics = useMemo(() => {
    const posts: Placed[] = []
    const bays = Math.max(2, Math.round((x1 - x0) / 9))
    for (let k = 0; k <= bays; k++)
      for (const z of [RUNWAY.zBack, RUNWAY.zFront]) posts.push({ size: [0.16, RUNWAY.y, 0.16], at: [x0 + ((x1 - x0) * k) / bays, RUNWAY.y / 2, z] })
    return boxes([
      ...posts,
      { size: [x1 - x0 + 0.4, 0.24, 0.3], at: [(x0 + x1) / 2, RUNWAY.y + 0.12, RUNWAY.zBack] },
      { size: [x1 - x0 + 0.4, 0.24, 0.3], at: [(x0 + x1) / 2, RUNWAY.y + 0.12, RUNWAY.zFront] },
    ])
  }, [x0, x1])
  useFrame(() => {
    const p = sim.crane.pos
    bridge.current!.position.x = p.x
    trolley.current!.position.set(p.x, 0, p.z)
    hook.current!.position.copy(p)
    const arr = cable.geometry.getAttribute('position')
    arr.setXYZ(0, p.x, RUNWAY.y + 0.1, p.z)
    arr.setXYZ(1, p.x, p.y + 0.1, p.z)
    arr.needsUpdate = true
  })
  return (
    <group>
      <Solid shapes={statics} c={c} />
      <group ref={bridge}>
        <Solid shapes={BRIDGE} c={c} />
      </group>
      <group ref={trolley}>
        <Solid shapes={TROLLEY} c={c} />
      </group>
      <primitive object={cable} />
      <group ref={hook}>
        <Solid shapes={HOOK} c={c} />
      </group>
    </group>
  )
}

const SLATS = 44
const BELT_FRAME = (() => {
  const out: Placed[] = []
  const run = (x0: number, z0: number, x1: number, z1: number, along: 'x' | 'z') => {
    const len = Math.hypot(x1 - x0, z1 - z0) + 0.4
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2
    const size = (l: number, w: number, h: number): V3 => (along === 'x' ? [l, h, w] : [w, h, l])
    const off = (d: number): V3 => (along === 'x' ? [cx, BELT.y, cz + d] : [cx + d, BELT.y, cz])
    out.push({ size: size(len, BELT.width + 0.1, 0.42), at: [cx, BELT.y - 0.29, cz] })
    out.push({ size: size(len + 0.1, 0.08, 0.16), at: off(-BELT.width / 2 - 0.05) })
    out.push({ size: size(len + 0.1, 0.08, 0.16), at: off(BELT.width / 2 + 0.05) })
  }
  run(BELT_PATH[0].x, BELT_PATH[0].z + 0.2, BELT_PATH[1].x, BELT_PATH[1].z - 0.6, 'z')
  run(BELT_PATH[1].x + 0.6, BELT_PATH[1].z, BELT_PATH[2].x, BELT_PATH[2].z, 'x')
  for (const [x, z] of [[BELT_PATH[0].x - 0.5, BELT_PATH[0].z + 0.6], [BELT_PATH[0].x + 0.5, BELT_PATH[0].z + 0.6], [BELT_PATH[2].x - 0.5, BELT_PATH[2].z - 0.5], [BELT_PATH[2].x - 0.5, BELT_PATH[2].z + 0.5], [BELT_PATH[1].x - 0.5, BELT_PATH[1].z - 1.3], [BELT_PATH[1].x + 1.2, BELT_PATH[1].z + 0.5]])
    out.push({ size: [0.12, BELT.y - 0.5, 0.12], at: [x, (BELT.y - 0.5) / 2, z] })
  out.push({ size: [0.9, 0.1, 0.9], at: [RETURN.x, RETURN.y - 0.05, RETURN.z] })
  out.push({ size: [0.1, RETURN.y - 0.1, 0.1], at: [RETURN.x, (RETURN.y - 0.1) / 2, RETURN.z] })
  out.push({ size: [1.3, 0.05, 1.1], at: [RETURN.x, RETURN.y, RETURN.z] })
  const shapes: Shape[] = [...boxes(out), { cyl: [0.72, 0.72, 0.4], at: [BELT_PATH[1].x, BELT.y - 0.25, BELT_PATH[1].z], axis: 'z', bare: true }]
  return { shapes, strokes: [circle(BELT_PATH[1].x, BELT.y - 0.05, BELT_PATH[1].z, 0.72)] }
})()

export function Belt({ sim, c }: { sim: Sim; c: Look }) {
  const slats = useRef<InstancedMesh>(null)
  const m4 = useMemo(() => new Matrix4(), [])
  const v = useMemo(() => new Vector3(), [])
  const a = BELT_PATH[0].distanceTo(BELT_PATH[1])
  const drawn = useRef(-1)
  useFrame(() => {
    if (drawn.current === sim.beltPhase) return
    drawn.current = sim.beltPhase
    const m = slats.current!
    const offset = sim.beltPhase % (BELT_LENGTH / SLATS)
    for (let i = 0; i < SLATS; i++) {
      const s = ((i * BELT_LENGTH) / SLATS + offset) % BELT_LENGTH
      beltAt(s, v)
      m4.makeRotationY(s < a ? Math.PI / 2 : 0).setPosition(v.x, BELT.y - 0.07, v.z)
      m.setMatrixAt(i, m4)
    }
    m.instanceMatrix.needsUpdate = true
  })
  return (
    <group>
      <Solid shapes={BELT_FRAME.shapes} strokes={BELT_FRAME.strokes} c={c} />
      <instancedMesh ref={slats} args={[undefined, undefined, SLATS]} frustumCulled={false} raycast={noop}>
        <boxGeometry args={[0.02, 0.01, BELT.width]} />
        <meshBasicMaterial color={c.edge} />
      </instancedMesh>
    </group>
  )
}

const { h0: H0, l1: L1, l2: L2 } = ARM
const ARM_BASE: Shape[] = [{ cyl: [0.9, 1.0, 0.36], at: [0, 0.18, 0] }]
const ARM_TURRET: Shape[] = [{ cyl: [0.38, 0.5, H0 - 0.36], at: [0, (H0 + 0.36) / 2, 0], bare: true }]
const ARM_TURRET_LINES = [[0.38, H0, 0, 0.5, 0.36, 0, -0.38, H0, 0, -0.5, 0.36, 0]]
const ARM_SHOULDER: Shape[] = [{ cyl: [0.42, 0.42, 0.9], at: [0, 0, 0], axis: 'z' }, { box: [L1, 0.3, 0.3], at: [L1 / 2, 0, 0.3] }, { box: [L1, 0.3, 0.3], at: [L1 / 2, 0, -0.3] }]
const ARM_ELBOW: Shape[] = [{ cyl: [0.36, 0.36, 0.95], at: [0, 0, 0], axis: 'z' }, { box: [L2, 0.34, 0.34], at: [L2 / 2, 0, 0] }]
const ARM_WRIST: Shape[] = [{ cyl: [0.24, 0.24, 0.6], at: [0, 0, 0], axis: 'z' }, { box: [0.5, 0.3, 0.86], at: [0, -0.32, 0] }]
const ARM_FINGER: Shape[] = [{ box: [0.36, 0.38, 0.06], at: [0, -0.62, 0] }]

export function Arm({ sim, c }: { sim: Sim; c: Look }) {
  const turret = useRef<Group>(null)
  const shoulder = useRef<Group>(null)
  const elbow = useRef<Group>(null)
  const wrist = useRef<Group>(null)
  const fingers = useRef<(Group | null)[]>([])
  const [busy, setBusy] = useState(false)
  const base = ARM.base
  useFrame(() => {
    const w = sim.arm.pos
    const dx = w.x - base.x, dz = w.z - base.z
    const yaw = Math.atan2(-dz, dx)
    const r = Math.max(Math.hypot(dx, dz), 0.001)
    const h = w.y - H0
    const d = clamp(Math.hypot(r, h), Math.abs(L1 - L2) + 0.05, L1 + L2 - 0.01)
    const phi = Math.atan2(h, r)
    const a = Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1))
    const t1 = phi + a
    const t2 = Math.atan2(h - L1 * Math.sin(t1), r - L1 * Math.cos(t1))
    turret.current!.rotation.y = yaw
    shoulder.current!.rotation.z = t1
    elbow.current!.rotation.z = t2 - t1
    wrist.current!.rotation.z = -t2
    const open = 0.36 - sim.arm.grip * 0.1
    const [f0, f1] = fingers.current
    if (f0) f0.position.z = -open
    if (f1) f1.position.z = open
    const holding = !!sim.arm.holding
    if (holding !== busy) setBusy(holding)
  })
  const hi = busy ? c.accent : c.edge
  return (
    <group position={[base.x, 0, base.z]}>
      <Solid shapes={ARM_BASE} c={c} />
      <group ref={turret}>
        <Solid shapes={ARM_TURRET} strokes={ARM_TURRET_LINES} c={c} />
        <group ref={shoulder} position={[0, H0, 0]}>
          <Solid shapes={ARM_SHOULDER} c={c} />
          <group ref={elbow} position={[L1, 0, 0]}>
            <Solid shapes={ARM_ELBOW} c={c} />
            <group ref={wrist} position={[L2, 0, 0]}>
              <Solid shapes={ARM_WRIST} c={c} edge={hi} />
              {[0, 1].map((i) => (
                <group key={i} ref={(g) => { fingers.current[i] = g }}>
                  <Solid shapes={ARM_FINGER} c={c} edge={hi} />
                </group>
              ))}
            </group>
          </group>
        </group>
      </group>
    </group>
  )
}

/** Unit card parts: a full box for sides and picking, its top as an overlay so a lighter tint or a screenshot sits on it. */
const BODY = new BoxGeometry(1, 1, 1)
const TOP = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0.5, 0)
const dummy = new Object3D()
const dirty = (attr: InstancedBufferAttribute, n: number) => {
  attr.clearUpdateRanges()
  attr.addUpdateRange(0, Math.max(1, n))
  attr.needsUpdate = true
}

/**
 * Every live part (in the tote, on the belt, held, seated, returning) in a
 * fixed number of draw calls: instanced bodies, tops and edges, plus one
 * textured face per part whose screenshot has loaded.
 */
export function Parts({ sim, lab, c, tip, guard, hover, matches, onInspect }: {
  sim: Sim; lab: Lab; c: Look; tip: Tip; guard: Guard; hover: Hover; matches: ReadonlySet<string> | null; onInspect?: (ref: string) => void
}) {
  const invalidate = useThree((s) => s.invalidate)
  const labRef = useRef(lab)
  labRef.current = lab
  const matchRef = useRef(matches)
  matchRef.current = matches
  const cap = sim.list.length
  const group = useRef<Group>(null)
  const order = useRef<Part[]>([])
  const faces = useRef(new Map<Part, { mesh: Mesh; seen: number }>())
  const frame = useRef(0)
  const mesh = useMemo(() => {
    const bodies = new InstancedMesh(BODY, new MeshBasicMaterial({ color: '#ffffff', toneMapped: false }), cap)
    bodies.instanceMatrix.setUsage(DynamicDrawUsage)
    bodies.instanceColor = new InstancedBufferAttribute(new Float32Array(cap * 3), 3).setUsage(DynamicDrawUsage)
    bodies.boundingSphere = WORLD
    bodies.frustumCulled = false
    bodies.count = 0
    const tops = new InstancedMesh(TOP, new MeshBasicMaterial({ color: '#ffffff', toneMapped: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }), cap)
    tops.instanceMatrix = bodies.instanceMatrix
    tops.instanceColor = new InstancedBufferAttribute(new Float32Array(cap * 3), 3).setUsage(DynamicDrawUsage)
    tops.frustumCulled = false
    tops.raycast = noop
    tops.count = 0
    const edgeColors = new InstancedBufferAttribute(new Float32Array(cap * 3), 3).setUsage(DynamicDrawUsage)
    const edges = instancedEdges(bodies, '#ffffff', 1, edgeColors)
    return { bodies, tops, edges, edgeColors }
  }, [cap])
  useEffect(() => {
    const live = faces.current
    return () => {
      mesh.bodies.material.dispose()
      mesh.tops.material.dispose()
      mesh.edges.geometry.dispose()
      ;(mesh.edges.material as LineBasicMaterial).dispose()
      for (const f of live.values()) (f.mesh.material as MeshBasicMaterial).dispose()
      live.clear()
    }
  }, [mesh])
  const palette = useMemo(() => ({ side: new Map<number, Color>(), top: new Map<number, Color>(), edge: new Color(c.edge), accent: new Color(c.accent) }), [c])

  const face = (p: Part, map: Texture, now: number) => {
    let f = faces.current.get(p)
    if (!f) {
      const m = new Mesh(TOP, new MeshBasicMaterial({ map, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }))
      m.matrixAutoUpdate = false
      m.raycast = noop
      m.frustumCulled = false
      group.current!.add(m)
      faces.current.set(p, (f = { mesh: m, seen: now }))
    }
    const mat = f.mesh.material as MeshBasicMaterial
    if (mat.map !== map) mat.map = map
    f.seen = now
    f.mesh.matrix.copy(dummy.matrix)
    f.mesh.matrixWorldNeedsUpdate = true
  }

  useFrame(() => {
    const L = labRef.current
    const hits = matchRef.current
    const { bodies, tops, edgeColors } = mesh
    const now = ++frame.current
    const list = order.current
    let i = 0
    for (const p of sim.live) {
      const [w, t, d] = p.size
      const a = (Math.PI / 2 - CARD.lean) * p.lean
      const lift = (d / 2) * Math.cos(a) * p.lean + (t / 2) * (1 - p.lean)
      const hovered = hover.part === p
      dummy.position.set(p.pos.x, p.pos.y + lift - t / 2 + (hovered && p.mode === 'board' ? 0.12 : 0), p.pos.z)
      dummy.rotation.set(a, p.spin, 0)
      dummy.scale.set(w * p.scale, t * p.scale, d * p.scale)
      dummy.updateMatrix()
      bodies.setMatrixAt(i, dummy.matrix)
      const hue = p.item.hue
      let side = palette.side.get(hue)
      if (!side) palette.side.set(hue, (side = new Color(tint(hue, c))))
      let top = palette.top.get(hue)
      if (!top) palette.top.set(hue, (top = new Color(tint(hue, c, c.l + 12))))
      bodies.setColorAt(i, side)
      tops.setColorAt(i, top)
      const active = hovered || p.mode === 'held' || p.mode === 'tote' || (!!hits && p.mode === 'board' && hits.has(p.item.ref))
      const e = active ? palette.accent : palette.edge
      edgeColors.setXYZ(i, e.r, e.g, e.b)
      const tex = screenshot(L.theme === 'dark' ? (p.item.imageDark ?? p.item.image) : p.item.image, w / d, invalidate)
      if (tex) face(p, tex, now)
      list[i++] = p
    }
    list.length = i
    bodies.count = i
    tops.count = i
    dirty(bodies.instanceMatrix, i * 16)
    dirty(bodies.instanceColor!, i * 3)
    dirty(tops.instanceColor!, i * 3)
    dirty(edgeColors, i * 3)
    for (const [p, f] of faces.current) {
      if (f.seen === now) continue
      f.mesh.removeFromParent()
      ;(f.mesh.material as MeshBasicMaterial).dispose()
      faces.current.delete(p)
    }
  })

  const partAt = (e: ThreeEvent<PointerEvent | MouseEvent>) => (e.instanceId === undefined ? undefined : order.current[e.instanceId])
  return (
    <group ref={group}>
      <primitive
        object={mesh.bodies}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation()
          const p = partAt(e)
          if (!p || guard.moved) return
          hover.part = null
          tip.hide()
          if (p.mode === 'board' && onInspect && e.nativeEvent.altKey) onInspect(p.item.ref)
          else lab.toggle(p.item.ref)
        }}
        onPointerDown={(e: ThreeEvent<PointerEvent>) => {
          const p = partAt(e)
          if (p) hover.pressed = p.item.ref
        }}
        onPointerMove={(e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation()
          const p = partAt(e)
          if (!p) return
          if (hover.part !== p) {
            hover.part = p
            tip.show(e.nativeEvent, p.item.title, `${p.item.label} · ${p.mode === 'board' ? 'seated · click to send back' : sim.wanted.has(p.item.ref) ? 'on its way' : 'returning'}`)
          }
          tip.move(e.nativeEvent)
        }}
        onPointerOut={() => {
          hover.part = null
          tip.hide()
        }}
      />
      <primitive object={mesh.tops} />
      <primitive object={mesh.edges} />
    </group>
  )
}

const DOT = (() => {
  const g = new SphereGeometry(0.07, 8, 8)
  g.deleteAttribute('normal')
  g.deleteAttribute('uv')
  return g
})()

/** Blueprint callouts for the four stations: one line call, one dot call, a sprite each. */
export function Callouts({ c, slots, scale = 1 }: { c: Look; slots: number; scale?: number }) {
  const h = cabinetHeight(slots)
  const items = useMemo(
    () => [
      { letter: 'A', text: 'STORAGE WALL', at: [WALL.cx - 6, h, WALL.z1] as V3, to: [WALL.cx - 7.5, h + 2.6, WALL.z1 + 1] as V3 },
      { letter: 'B', text: 'BRIDGE CRANE', at: [WALL.cx + 8, RUNWAY.y + 0.3, RUNWAY.zFront] as V3, to: [WALL.cx + 9, RUNWAY.y + 2.4, RUNWAY.zFront + 1] as V3 },
      { letter: 'C', text: 'FEEDER + BELT', at: [DROP.x, BELT.y, 0] as V3, to: [DROP.x - 2.2, 3.4, 0.6] as V3 },
      { letter: 'D', text: 'APP BOARD', at: [BOARD.x1 - 0.4, BOARD.y, BOARD.z1 - 0.4] as V3, to: [BOARD.x1 + 0.6, 3.2, BOARD.z1 + 0.4] as V3 },
    ],
    [h],
  )
  const lines = useLines(useMemo(() => items.flatMap((i) => [...i.at, i.to[0], i.to[1] - 0.2, i.to[2]]), [items]))
  const dots = useMemo(() => mergeGeometries(items.map((i) => DOT.clone().translate(...i.at)))!, [items])
  useEffect(() => () => dots.dispose(), [dots])
  const maps = useMemo(
    () =>
      items.map((i) =>
        textTexture(720, 120, (ctx) => {
          ctx.strokeStyle = c.edge
          ctx.lineWidth = 4
          ctx.beginPath()
          ctx.arc(60, 60, 44, 0, Math.PI * 2)
          ctx.stroke()
          ctx.fillStyle = c.edge
          ctx.font = `600 50px ${FONT}`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText(i.letter, 60, 63)
          ctx.textAlign = 'left'
          ctx.fillStyle = c.fg
          ctx.font = `500 40px ${MONO}`
          ctx.fillText(i.text, 126, 64)
        }),
      ),
    [items, c],
  )
  useEffect(() => () => maps.forEach((m) => m.dispose()), [maps])
  return (
    <group>
      <lineSegments geometry={lines} raycast={noop}>
        <lineBasicMaterial color={c.edge} />
      </lineSegments>
      <mesh geometry={dots} raycast={noop}>
        <meshBasicMaterial color={c.edge} />
      </mesh>
      {items.map((i, k) => (
        <sprite key={i.letter} position={[i.to[0] + 1.3 * scale, i.to[1], i.to[2]]} scale={[3.3 * scale, 0.55 * scale, 1]} raycast={noop}>
          <spriteMaterial map={maps[k]} transparent toneMapped={false} depthWrite={false} />
        </sprite>
      ))}
    </group>
  )
}

