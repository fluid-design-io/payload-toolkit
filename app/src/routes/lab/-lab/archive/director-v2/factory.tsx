import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import { BoxGeometry, BufferAttribute, BufferGeometry, Color, CylinderGeometry, Euler, Group, InstancedMesh, Matrix4, Object3D, Quaternion, SRGBColorSpace, Sphere, Texture, TextureLoader, Vector3 } from 'three'

import { databases, frameworks } from '../../../../workspace/-workspace/workspace.constants'
import { play } from '../../kit/sound'
import type { Lab } from '../../lab.types'
import type { Aisle } from '../../warehouse'
import { Dynamic, FONT, Fill, Lines, Surf, textTexture, useFills, useLines, useWriter } from './lines'
import { tint } from './look'
import type { Look } from './look'
import { ARM, BASE, BELT, BOARD, CHIP, CHIPS, DRAWER, REDUCED, SLOTS, TABLE, TABLE_Y, TRACES, TRACE_LEN, drawerPos, matchItem, padPos } from './sim'
import type { Part, Sim } from './sim'

export type Tip = { show: (e: PointerEvent, title: string, sub: string) => void; move: (e: PointerEvent) => void; hide: () => void }
export type Guard = { moved: boolean }
export const BRAND = { claude: '#D97757', codex: '#2EC4E6', bead: '#E8A15A' }

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
const box = (w: number, h: number, d: number, x: number, y: number, z: number) => new BoxGeometry(w, h, d).translate(x, y, z)
const cyl = (r0: number, r1: number, h: number, x: number, y: number, z: number, n = 32, rot?: [number, number, number]) => {
  const g = new CylinderGeometry(r0, r1, h, n)
  if (rot) g.rotateX(rot[0]).rotateY(rot[1]).rotateZ(rot[2])
  return g.translate(x, y, z)
}
const dummy = new Object3D()
/** Instances move every frame, so give the raycaster one sphere that covers the whole cell. */
const cell = (mesh: InstancedMesh | null) => { if (mesh) mesh.boundingSphere = new Sphere(new Vector3(2, 2, 0), 40) }
const m4 = new Matrix4()
const v3 = new Vector3()
const at = new Vector3()
const CORNERS = [-1, -1, 1, -1, 1, 1, -1, 1]
const CHIP_KEYS = ['framework', 'database'] as const
const q = new Quaternion()
const ACCENT = new Color()
const EDGE = new Color()
const CODEX = new Color(BRAND.codex)

/** A box whose +Y face is its own draw group, so a textured top costs two calls, not six. */
function topBox(w: number, h: number, d: number) {
  const g = new BoxGeometry(w, h, d)
  const index = g.getIndex()!.array as Uint16Array
  const py = index.slice(12, 18)
  const rest = [...index.slice(0, 12), ...index.slice(18)]
  g.setIndex(new BufferAttribute(new Uint16Array([...py, ...rest]), 1))
  g.clearGroups()
  g.addGroup(0, 6, 1)
  g.addGroup(6, 30, 0)
  return g
}

export function Cabinet({ aisles, active, matches, onOpen, c, tip, guard }: {
  aisles: readonly Aisle[]; active: number; matches: number[] | null; onOpen: (i: number) => void; c: Look; tip: Tip; guard: Guard
}) {
  const n = aisles.length
  const width = DRAWER.gapX * 3 + 0.1
  const height = DRAWER.gapY * 6 + 0.1
  const cx = DRAWER.x0 + DRAWER.gapX, cz = DRAWER.front - DRAWER.d / 2 - 0.05
  const fills = useFills(() => [
    box(width, 0.12, DRAWER.d + 0.2, cx, DRAWER.base + height + 0.02, cz),
    box(width, DRAWER.base, DRAWER.d + 0.2, cx, DRAWER.base / 2, cz),
    box(width, height, 0.1, cx, DRAWER.base + height / 2, DRAWER.front - DRAWER.d - 0.1),
  ], [])
  const edges = useLines((pen) => {
    pen.box(cx, DRAWER.base + height + 0.02, cz, width, 0.12, DRAWER.d + 0.2)
    pen.box(cx, DRAWER.base / 2, cz, width, DRAWER.base, DRAWER.d + 0.2)
    pen.box(cx, DRAWER.base + height / 2, DRAWER.front - DRAWER.d - 0.1, width, height, 0.1)
  }, [])
  const atlas = useMemo(
    () =>
      textTexture(512, 128 * Math.max(1, n), (ctx) => {
        aisles.forEach((aisle, i) => {
          const y = i * 128
          const none = matches && !matches[i]
          ctx.globalAlpha = 1
          ctx.fillStyle = c.surface
          ctx.fillRect(0, y, 512, 128)
          ctx.globalAlpha = none ? 0.3 : 1
          ctx.fillStyle = tint(aisle.hue, c)
          ctx.fillRect(26, y + 38, 10, 52)
          ctx.fillStyle = c.fg
          ctx.font = `500 44px ${FONT}`
          ctx.letterSpacing = '0px'
          ctx.textAlign = 'left'
          ctx.fillText(aisle.label.length > 13 ? `${aisle.label.slice(0, 12)}…` : aisle.label, 58, y + 80)
          ctx.fillStyle = matches && matches[i] ? c.accent : c.muted
          ctx.font = `400 34px ${FONT}`
          ctx.textAlign = 'right'
          ctx.fillText(matches ? `${matches[i]}/${aisle.count}` : String(aisle.count), 486, y + 80)
        })
      }),
    [aisles, c, matches, n],
  )
  useEffect(() => () => atlas.dispose(), [atlas])
  const labels = useMemo(() => {
    const g = new BufferGeometry()
    const pos = new Float32Array(n * 12)
    const uv = new Float32Array(n * 8)
    const idx: number[] = []
    for (let i = 0; i < n; i++) {
      const v0 = 1 - (i + 1) / n, v1 = 1 - i / n
      uv.set([0, v0, 1, v0, 1, v1, 0, v1], i * 8)
      idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3)
    }
    g.setAttribute('position', new BufferAttribute(pos, 3))
    g.setAttribute('uv', new BufferAttribute(uv, 2))
    g.setIndex(idx)
    return g
  }, [n])
  useEffect(() => () => labels.dispose(), [labels])
  const inst = useRef<InstancedMesh>(null)
  const writer = useWriter(n * 12 + 4, c.edge)
  const zs = useMemo(() => new Float32Array(n).fill(DRAWER.front - DRAWER.d / 2), [n])
  useFrame((_, dt) => {
    const mesh = inst.current
    if (!mesh) return
    EDGE.set(c.edge)
    ACCENT.set(c.accent)
    const pos = labels.getAttribute('position') as BufferAttribute
    const arr = pos.array as Float32Array
    writer.begin()
    for (let i = 0; i < n; i++) {
      const want = DRAWER.front - DRAWER.d / 2 + (i === active ? 0.75 : 0)
      zs[i] += (want - zs[i]) * (1 - Math.exp(-dt * 10))
      drawerPos(i, at)
      dummy.position.set(at.x, at.y, zs[i])
      dummy.rotation.set(0, 0, 0)
      dummy.scale.set(1, 1, 1)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
      writer.box(dummy.matrix, DRAWER.w, DRAWER.h, DRAWER.d, i === active ? ACCENT : EDGE)
      const x0 = at.x - DRAWER.w / 2 + 0.01, x1 = at.x + DRAWER.w / 2 - 0.01, y0 = at.y - DRAWER.h / 2 + 0.01, y1 = at.y + DRAWER.h / 2 - 0.01, z = zs[i] + DRAWER.d / 2 + 0.002
      const k = i * 12
      arr[k] = x0; arr[k + 1] = y0; arr[k + 2] = z; arr[k + 3] = x1; arr[k + 4] = y0; arr[k + 5] = z
      arr[k + 6] = x1; arr[k + 7] = y1; arr[k + 8] = z; arr[k + 9] = x0; arr[k + 10] = y1; arr[k + 11] = z
    }
    writer.done()
    pos.needsUpdate = true
    mesh.instanceMatrix.needsUpdate = true
  })
  return (
    <group>
      <Fill geometry={fills} c={c} color={c.surface} />
      <Lines geometry={edges} color={c.edge} mirror={c.mirror} />
      <instancedMesh
        ref={(m) => { inst.current = m; cell(m) }}
        args={[undefined, undefined, n]}
        onClick={(e) => { e.stopPropagation(); if (!guard.moved && e.instanceId !== undefined) onOpen(e.instanceId) }}
        onPointerMove={(e) => {
          e.stopPropagation()
          const i = e.instanceId
          if (i === undefined) return
          const aisle = aisles[i]
          tip.show(e.nativeEvent, aisle.label, `Aisle ${String(aisle.no).padStart(2, '0')} · ${aisle.count} parts · ${aisle.racks.length} registries · click to open`)
        }}
        onPointerOut={() => tip.hide()}
      >
        <boxGeometry args={[DRAWER.w, DRAWER.h, DRAWER.d]} />
        <Surf c={c} color={c.surface} />
      </instancedMesh>
      <mesh geometry={labels}>
        <meshBasicMaterial map={atlas} toneMapped={false} />
      </mesh>
      <Dynamic writer={writer} mirror={c.mirror} />
    </group>
  )
}

export function Table({ c, count, label, pages, page, setPage, tip, guard }: {
  c: Look; count: number; label: string; pages: number; page: number; setPage: (n: number) => void; tip: Tip; guard: Guard
}) {
  const cx = (TABLE.x0 + TABLE.x1) / 2, cz = (TABLE.z0 + TABLE.z1) / 2, w = TABLE.x1 - TABLE.x0, d = TABLE.z1 - TABLE.z0
  const legs: [number, number][] = [[TABLE.x0 + 0.15, TABLE.z0 + 0.15], [TABLE.x1 - 0.15, TABLE.z0 + 0.15], [TABLE.x0 + 0.15, TABLE.z1 - 0.15], [TABLE.x1 - 0.15, TABLE.z1 - 0.15]]
  const fills = useFills(() => [box(w, 0.12, d, cx, TABLE_Y - 0.06, cz), ...legs.map(([x, z]) => box(0.12, TABLE_Y - 0.12, 0.12, x, (TABLE_Y - 0.12) / 2, z))], [])
  const edges = useLines((pen) => {
    pen.box(cx, TABLE_Y - 0.06, cz, w, 0.12, d)
    for (const [x, z] of legs) pen.box(x, (TABLE_Y - 0.12) / 2, z, 0.12, TABLE_Y - 0.12, 0.12)
  }, [])
  const pads = useLines((pen) => {
    for (let i = 0; i < count; i++) {
      const p = padPos(i)
      pen.rect(p.x, TABLE_Y + 0.004, p.z, 1.04, 0.8)
    }
  }, [count])
  const strip = useMemo(
    () =>
      textTexture(1024, 96, (ctx) => {
        ctx.fillStyle = c.surface
        ctx.fillRect(0, 0, 1024, 96)
        ctx.fillStyle = c.muted
        ctx.font = `500 30px ${FONT}`
        ctx.letterSpacing = '3px'
        ctx.fillText(label, 110, 60)
        ctx.textAlign = 'right'
        ctx.fillStyle = c.fg
        ctx.fillText(`${page + 1} / ${pages}`, 910, 60)
        ctx.strokeStyle = pages > 1 ? c.fg : c.dim
        ctx.lineWidth = 4
        ctx.beginPath()
        ctx.moveTo(60, 28); ctx.lineTo(36, 48); ctx.lineTo(60, 68)
        ctx.moveTo(964, 28); ctx.lineTo(988, 48); ctx.lineTo(964, 68)
        ctx.stroke()
      }),
    [c, label, page, pages],
  )
  useEffect(() => () => strip.dispose(), [strip])
  return (
    <group>
      <Fill geometry={fills} c={c} color={c.surface} />
      <Lines geometry={edges} color={c.edge} mirror={c.mirror} />
      <Lines geometry={pads} color={c.edge} dashed={[0.08, 0.06]} />
      <mesh
        position={[cx, TABLE_Y + 0.005, TABLE.z1 - 0.38]}
        rotation={[-Math.PI / 2, 0, 0]}
        onClick={(e) => {
          e.stopPropagation()
          if (guard.moved || pages < 2) return
          setPage((page + (e.point.x - cx < 0 ? pages - 1 : 1)) % pages)
        }}
        onPointerOver={(e) => { e.stopPropagation(); tip.show(e.nativeEvent, 'Pick tray', pages > 1 ? 'Click left or right half to change bay' : 'One bay') }}
        onPointerMove={(e) => tip.move(e.nativeEvent)}
        onPointerOut={() => tip.hide()}
      >
        <planeGeometry args={[w - 0.3, (w - 0.3) * (96 / 1024)]} />
        <meshBasicMaterial map={strip} toneMapped={false} />
      </mesh>
    </group>
  )
}

export function Belt({ c }: { c: Look }) {
  const len = BELT.end - BELT.start + 1.0
  const mid = (BELT.start + BELT.end) / 2
  const n = 22
  const legs = [[BELT.start + 0.4, 0.95], [BELT.end - 0.4, 0.95], [BELT.start + 0.4, 2.25], [BELT.end - 0.4, 2.25]]
  const fills = useFills(() => [
    box(len, 0.42, 1.3, mid, BELT.y - 0.29, BELT.z),
    box(len + 0.1, 0.16, 0.08, mid, BELT.y, BELT.z - 0.7),
    box(len + 0.1, 0.16, 0.08, mid, BELT.y, BELT.z + 0.7),
    ...[BELT.start - 0.5, BELT.end + 0.5].map((x) => cyl(0.25, 0.25, 1.34, x, BELT.y - 0.25, BELT.z, 24, [Math.PI / 2, 0, 0])),
    ...legs.map(([x, z]) => box(0.12, BELT.y - 0.5, 0.12, x, (BELT.y - 0.5) / 2, z)),
  ], [])
  const edges = useLines((pen) => {
    pen.box(mid, BELT.y - 0.29, BELT.z, len, 0.42, 1.3)
    pen.box(mid, BELT.y, BELT.z - 0.7, len + 0.1, 0.16, 0.08)
    pen.box(mid, BELT.y, BELT.z + 0.7, len + 0.1, 0.16, 0.08)
    for (const x of [BELT.start - 0.5, BELT.end + 0.5]) for (const z of [-0.67, 0.67]) pen.circle(x, BELT.y - 0.25, BELT.z + z, 0.25, 'z', 24)
    for (const [x, z] of legs) pen.box(x, (BELT.y - 0.5) / 2, z, 0.12, BELT.y - 0.5, 0.12)
  }, [])
  const slats = useRef<InstancedMesh>(null)
  useFrame(({ clock }) => {
    const mesh = slats.current
    if (!mesh) return
    const offset = REDUCED ? 0 : (clock.elapsedTime * BELT.speed) % (len / n)
    for (let i = 0; i < n; i++) {
      dummy.position.set(BELT.start - 0.5 + ((i * len) / n + offset) % len, BELT.y - 0.07, BELT.z)
      dummy.rotation.set(0, 0, 0)
      dummy.scale.set(1, 1, 1)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  })
  return (
    <group>
      <Fill geometry={fills} c={c} color={c.surface} />
      <Lines geometry={edges} color={c.edge} mirror={c.mirror} />
      <instancedMesh ref={slats} args={[undefined, undefined, n]}>
        <boxGeometry args={[0.02, 0.01, 1.2]} />
        <meshBasicMaterial color={c.edge} toneMapped={false} />
      </instancedMesh>
    </group>
  )
}

type Piece = { kind: 'box' | 'cyl'; w: number; h: number; d: number; local: Matrix4; hot?: boolean }
const piece = (kind: Piece['kind'], w: number, h: number, d: number, x: number, y: number, z: number, rot?: [number, number, number], hot?: boolean): Piece => {
  const local = new Matrix4().compose(new Vector3(x, y, z), new Quaternion().setFromEuler(new Euler(...(rot ?? [0, 0, 0]))), new Vector3(1, 1, 1))
  return { kind, w, h, d, local, hot }
}

export function Arm({ sim, c }: { sim: Sim; c: Look }) {
  const root = useRef<Group>(null)
  const turret = useRef<Group>(null)
  const shoulder = useRef<Group>(null)
  const elbow = useRef<Group>(null)
  const wrist = useRef<Group>(null)
  const fingers = useRef<(Group | null)[]>([])
  const { h0, l1, l2 } = ARM
  const pieces = useMemo(() => ({
    root: [piece('cyl', 0.9, 0.36, 1.0, 0, 0.18, 0)],
    turret: [piece('cyl', 0.38, h0 - 0.36, 0.5, 0, (h0 + 0.36) / 2, 0)],
    shoulder: [piece('cyl', 0.42, 0.9, 0.42, 0, 0, 0, [Math.PI / 2, 0, 0]), piece('box', l1, 0.3, 0.3, l1 / 2, 0, 0.3), piece('box', l1, 0.3, 0.3, l1 / 2, 0, -0.3)],
    elbow: [piece('cyl', 0.36, 0.95, 0.36, 0, 0, 0, [Math.PI / 2, 0, 0]), piece('box', l2, 0.34, 0.34, l2 / 2, 0, 0)],
    wrist: [piece('cyl', 0.24, 0.6, 0.24, 0, 0, 0, [Math.PI / 2, 0, 0]), piece('box', 0.5, 0.3, 0.86, 0, -0.32, 0, undefined, true)],
    finger: [piece('box', 0.36, 0.38, 0.06, 0, -0.62, 0, undefined, true)],
  }), [h0, l1, l2])
  const geo = {
    root: useFills(() => [cyl(0.9, 1.0, 0.36, 0, 0.18, 0, 40)], []),
    turret: useFills(() => [cyl(0.38, 0.5, h0 - 0.36, 0, (h0 + 0.36) / 2, 0, 28)], []),
    shoulder: useFills(() => [cyl(0.42, 0.42, 0.9, 0, 0, 0, 28, [Math.PI / 2, 0, 0]), box(l1, 0.3, 0.3, l1 / 2, 0, 0.3), box(l1, 0.3, 0.3, l1 / 2, 0, -0.3)], []),
    elbow: useFills(() => [cyl(0.36, 0.36, 0.95, 0, 0, 0, 28, [Math.PI / 2, 0, 0]), box(l2, 0.34, 0.34, l2 / 2, 0, 0)], []),
    wrist: useFills(() => [cyl(0.24, 0.24, 0.6, 0, 0, 0, 24, [Math.PI / 2, 0, 0]), box(0.5, 0.3, 0.86, 0, -0.32, 0)], []),
    finger: useFills(() => [box(0.36, 0.38, 0.06, 0, -0.62, 0)], []),
  }
  const writer = useWriter(260, c.edge)
  const write = (g: Group | null, list: Piece[], hot: boolean) => {
    if (!g) return
    for (const p of list) {
      m4.multiplyMatrices(g.matrixWorld, p.local)
      const color = hot && p.hot ? ACCENT : EDGE
      if (p.kind === 'box') writer.box(m4, p.w, p.h, p.d, color)
      else {
        writer.circle(0, p.h / 2, 0, p.w, 'y', m4, color, 28)
        writer.circle(0, -p.h / 2, 0, p.d, 'y', m4, color, 28)
      }
    }
  }
  useFrame(() => {
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
    turret.current!.rotation.y = yaw
    shoulder.current!.rotation.z = t1
    elbow.current!.rotation.z = t2 - t1
    wrist.current!.rotation.z = -t2
    const open = 0.36 - sim.arm.grip * 0.1
    for (let i = 0; i < fingers.current.length; i++) {
      const f = fingers.current[i]
      if (f) f.position.z = (i ? 1 : -1) * open
    }
    root.current!.updateMatrixWorld(true)
    EDGE.set(c.edge)
    ACCENT.set(c.accent)
    const hot = !!sim.arm.holding
    writer.begin()
    write(root.current, pieces.root, hot)
    write(turret.current, pieces.turret, hot)
    write(shoulder.current, pieces.shoulder, hot)
    write(elbow.current, pieces.elbow, hot)
    write(wrist.current, pieces.wrist, hot)
    for (const f of fingers.current) write(f, pieces.finger, hot)
    writer.done()
  })
  return (
    <>
      <group ref={root} position={[BASE.x, 0, BASE.z]}>
        <Fill geometry={geo.root} c={c} color={c.surface} />
        <group ref={turret}>
          <Fill geometry={geo.turret} c={c} color={c.surface} />
          <group ref={shoulder} position={[0, h0, 0]}>
            <Fill geometry={geo.shoulder} c={c} color={c.surface} />
            <group ref={elbow} position={[l1, 0, 0]}>
              <Fill geometry={geo.elbow} c={c} color={c.surface} />
              <group ref={wrist} position={[l2, 0, 0]}>
                <Fill geometry={geo.wrist} c={c} color={c.surface} />
                {[0, 1].map((i) => (
                  <group key={i} ref={(g) => { fingers.current[i] = g }}>
                    <Fill geometry={geo.finger} c={c} color={c.surface} />
                  </group>
                ))}
              </group>
            </group>
          </group>
        </group>
      </group>
      <Dynamic writer={writer} mirror={c.mirror} />
    </>
  )
}

export function Board({ lab, sim, c, tip, guard }: { lab: Lab; sim: Sim; c: Look; tip: Tip; guard: Guard }) {
  const cx = (BOARD.x0 + BOARD.x1) / 2, cz = (BOARD.z0 + BOARD.z1) / 2, w = BOARD.x1 - BOARD.x0, d = BOARD.z1 - BOARD.z0
  const posts: [number, number][] = [[BOARD.x0 + 0.3, BOARD.z0 + 0.3], [BOARD.x1 - 0.3, BOARD.z0 + 0.3], [BOARD.x0 + 0.3, BOARD.z1 - 0.3], [BOARD.x1 - 0.3, BOARD.z1 - 0.3]]
  const fills = useFills(() => [box(w, 0.12, d, cx, BOARD.y - 0.06, cz), ...posts.map(([x, z]) => cyl(0.12, 0.12, BOARD.y - 0.12, x, (BOARD.y - 0.12) / 2, z, 16))], [])
  const edges = useLines((pen) => {
    pen.box(cx, BOARD.y - 0.06, cz, w, 0.12, d)
    for (const [x, z] of posts) pen.circle(x, 0.01, z, 0.12, 'y', 16)
    for (const key of ['framework', 'database'] as const) {
      const chip = CHIPS[key]
      const y = BOARD.y + 0.01, e = CHIP / 2
      for (let k = 0; k < 7; k++) {
        const o = -0.66 + k * 0.22
        pen.seg(chip.x + o, y, chip.z - e, chip.x + o, y, chip.z - e - 0.16)
        pen.seg(chip.x + o, y, chip.z + e, chip.x + o, y, chip.z + e + 0.16)
        pen.seg(chip.x - e, y, chip.z + o, chip.x - e - 0.16, y, chip.z + o)
        pen.seg(chip.x + e, y, chip.z + o, chip.x + e + 0.16, y, chip.z + o)
      }
    }
  }, [])
  const traces = useLines((pen) => {
    for (const path of TRACES) pen.line(path.map((p) => [p.x, p.y, p.z]))
    for (const s of SLOTS) pen.rect(s.x, BOARD.y + 0.014, s.z, 1.0, 0.76)
  }, [])
  const writer = useWriter(SLOTS.length * 3 + 24, c.accent)
  const pulses = useRef<InstancedMesh>(null)
  const chipRefs = useRef<Record<string, Group | null>>({})
  const bump = useRef<Record<string, number>>({ framework: 0, database: 0 })
  const geometry = useMemo(() => topBox(CHIP, 0.28, CHIP), [])
  useEffect(() => () => geometry.dispose(), [geometry])
  useFrame((_, dt) => {
    ACCENT.set(c.accent)
    EDGE.set(c.edge)
    writer.begin()
    for (let s = 0; s < sim.slots.length; s++) {
      const p = sim.slots[s]
      if (!p || p.mode !== 'board') continue
      const path = TRACES[s % TRACES.length]
      for (let k = 1; k < path.length; k++) writer.seg(path[k - 1].x, path[k - 1].y + 0.004, path[k - 1].z, path[k].x, path[k].y + 0.004, path[k].z, ACCENT)
    }
    for (const key of CHIP_KEYS) {
      bump.current[key] = Math.max(0, bump.current[key] - dt * 3)
      const g = chipRefs.current[key]
      if (!g) continue
      g.position.y = Math.sin(bump.current[key] * Math.PI) * 0.6
      g.updateMatrixWorld(true)
      m4.copy(g.matrixWorld).multiply(dummy.matrix.identity().setPosition(CHIPS[key].x, BOARD.y + 0.14, CHIPS[key].z))
      writer.box(m4, CHIP, 0.28, CHIP, EDGE)
    }
    writer.done()
    const mesh = pulses.current
    if (!mesh) return
    let i = 0
    for (const pulse of sim.pulses) {
      if (i >= 8) break
      const path = TRACES[pulse.slot % TRACES.length]
      let left = pulse.t * TRACE_LEN[pulse.slot % TRACES.length]
      for (let k = 1; k < path.length; k++) {
        const seg = path[k].distanceTo(path[k - 1])
        if (left <= seg || k === path.length - 1) {
          dummy.position.lerpVectors(path[k - 1], path[k], clamp(left / seg, 0, 1))
          break
        }
        left -= seg
      }
      dummy.rotation.set(0, 0, 0)
      dummy.scale.setScalar(1)
      dummy.updateMatrix()
      mesh.setMatrixAt(i++, dummy.matrix)
    }
    mesh.count = i
    mesh.instanceMatrix.needsUpdate = true
  })
  const chipTexture = useMemo(() => {
    const make = (title: string, value: string) =>
      textTexture(340, 340, (ctx) => {
        ctx.fillStyle = c.chip
        ctx.fillRect(0, 0, 340, 340)
        ctx.strokeStyle = c.accent
        ctx.lineWidth = 3
        ctx.strokeRect(18, 18, 304, 304)
        ctx.beginPath()
        ctx.arc(46, 46, 9, 0, Math.PI * 2)
        ctx.stroke()
        ctx.fillStyle = c.muted
        ctx.font = `500 24px ${FONT}`
        ctx.letterSpacing = '4px'
        ctx.fillText(title, 36, 140)
        ctx.fillStyle = c.chipFg
        ctx.letterSpacing = '0px'
        ctx.font = `500 ${value.length > 9 ? 38 : 50}px ${FONT}`
        ctx.fillText(value, 36, 200)
        ctx.fillStyle = c.muted
        ctx.font = `400 20px ${FONT}`
        ctx.fillText('click to swap ↻', 36, 290)
      })
    return {
      framework: make('FRAMEWORK', frameworks.find((f) => f.value === lab.setup.framework)!.label),
      database: make('DATABASE', databases.find((d) => d.value === lab.setup.database)!.label),
    }
  }, [lab.setup.framework, lab.setup.database, c])
  useEffect(() => () => { chipTexture.framework.dispose(); chipTexture.database.dispose() }, [chipTexture])
  const cycle = (key: 'framework' | 'database') => {
    play('swap')
    bump.current[key] = 1
    if (key === 'framework') lab.set('framework', lab.setup.framework === 'next' ? 'tanstack' : 'next')
    else lab.set('database', lab.setup.database === 'postgres' ? 'mongodb' : 'postgres')
  }
  return (
    <group>
      <Fill geometry={fills} c={c} color={c.board} />
      <Lines geometry={edges} color={c.edge} mirror={c.mirror} />
      <Lines geometry={traces} color={c.dim} />
      <Dynamic writer={writer} />
      {(['framework', 'database'] as const).map((key) => (
        <group key={key} ref={(g) => { chipRefs.current[key] = g }}>
          <mesh
            geometry={geometry}
            position={[CHIPS[key].x, BOARD.y + 0.14, CHIPS[key].z]}
            onClick={(e) => { e.stopPropagation(); if (!guard.moved) cycle(key) }}
            onPointerOver={(e) => { e.stopPropagation(); tip.show(e.nativeEvent, key === 'framework' ? 'Framework chip' : 'Database chip', 'Click to swap') }}
            onPointerMove={(e) => tip.move(e.nativeEvent)}
            onPointerOut={() => tip.hide()}
          >
            <Surf c={c} attach="material-0" color={c.chip} />
            <meshBasicMaterial attach="material-1" map={chipTexture[key]} toneMapped={false} />
          </mesh>
        </group>
      ))}
      <instancedMesh ref={pulses} args={[undefined, undefined, 8]} frustumCulled={false}>
        <sphereGeometry args={[0.09, 10, 10]} />
        <meshBasicMaterial color={c.accent} toneMapped={false} />
      </instancedMesh>
    </group>
  )
}

const loader = new TextureLoader()
const MAX_PARTS = 240

/** The screenshot face of one live part; the body is an instance in `Parts`. */
function Top({ p, lab, c, hover }: { p: Part; lab: Lab; c: Look; hover: { current: Part | null } }) {
  const group = useRef<Group>(null)
  const [texture, setTexture] = useState<Texture | null>(null)
  const requested = useRef(false)
  const image = lab.theme === 'dark' ? (p.item.imageDark ?? p.item.image) : p.item.image
  useEffect(() => {
    requested.current = false
    setTexture(null)
  }, [image])
  useEffect(() => () => texture?.dispose(), [texture])
  useFrame(() => {
    const g = group.current
    if (!g) return
    g.visible = p.visible
    g.position.copy(p.pos)
    if (hover.current === p && (p.mode === 'home' || p.mode === 'board')) g.position.y += 0.14
    g.scale.setScalar(p.scale)
    g.rotation.set(p.spin * 0.3, p.spin, 0)
    if (p.visible && image && !requested.current) {
      requested.current = true
      loader.load(image, (t) => {
        t.colorSpace = SRGBColorSpace
        t.anisotropy = 8
        const img = t.image as HTMLImageElement
        const aspect = img.height / img.width
        const want = p.size[2] / p.size[0]
        if (aspect > want) {
          t.repeat.set(1, want / aspect)
          t.offset.set(0, 1 - want / aspect)
        }
        setTexture(t)
      })
    }
  })
  return (
    <group ref={group} visible={false}>
      <mesh position={[0, p.size[1] / 2 + 0.003, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[p.size[0] - 0.02, p.size[2] - 0.02]} />
        {texture ? <meshBasicMaterial map={texture} toneMapped={false} /> : <Surf c={c} color={tint(p.item.hue, c, c.l + 12)} />}
      </mesh>
    </group>
  )
}

/** The live parts: one instanced body, one hairline writer, a textured top each. `onPress` records the part under a press for long-press details. */
export function Parts({ sim, lab, c, tip, guard, onPress }: { sim: Sim; lab: Lab; c: Look; tip: Tip; guard: Guard; onPress: (ref: string) => void }) {
  const [, force] = useState(0)
  const seen = useRef(-1)
  const inst = useRef<InstancedMesh>(null)
  const beads = useRef<InstancedMesh>(null)
  const hover = useRef<Part | null>(null)
  const order = useRef<Part[]>([])
  const writer = useWriter(MAX_PARTS * 16, c.edge)
  const query = lab.focus.query
  const colors = useMemo(() => new Map<Part, Color>(), [c])
  const matches = useMemo(() => new Map<Part, boolean>(), [query])
  useFrame(() => {
    if (sim.liveVersion !== seen.current) {
      seen.current = sim.liveVersion
      force((v) => v + 1)
    }
    const mesh = inst.current
    const dots = beads.current
    if (!mesh || !dots) return
    EDGE.set(c.edge)
    ACCENT.set(c.accent)
    writer.begin()
    let i = 0, b = 0
    order.current.length = 0
    for (const p of sim.live) {
      if (i >= MAX_PARTS) break
      if (!p.visible) continue
      order.current[i] = p
      dummy.position.copy(p.pos)
      if (hover.current === p && (p.mode === 'home' || p.mode === 'board')) dummy.position.y += 0.14
      dummy.rotation.set(p.spin * 0.3, p.spin, 0)
      dummy.scale.set(p.size[0] * p.scale, p.size[1] * p.scale, p.size[2] * p.scale)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
      let color = colors.get(p)
      if (!color) colors.set(p, (color = new Color(tint(p.item.hue, c))))
      mesh.setColorAt(i, color)
      let match = false
      if (query && p.mode === 'board') {
        const hit = matches.get(p)
        match = hit ?? matchItem(p.item, query)
        if (hit === undefined) matches.set(p, match)
      }
      const active = hover.current === p || p.mode === 'held' || p.mode === 'queued' || match
      m4.compose(dummy.position, q.setFromEuler(dummy.rotation), v3.set(p.scale, p.scale, p.scale))
      writer.box(m4, p.size[0], p.size[1], p.size[2], active ? ACCENT : EDGE)
      if (p.mode === 'board' && p.bond === 'etch') writer.rect(p.pos.x, BOARD.y + 0.02, p.pos.z, p.size[0] + 0.14, p.size[2] + 0.14, CODEX)
      if (p.mode === 'board' && p.bond === 'bead' && b < 60) {
        for (let k = 0; k < 8; k += 2) {
          dummy.position.set(p.pos.x + (CORNERS[k] * (p.size[0] + 0.06)) / 2, BOARD.y + 0.03, p.pos.z + (CORNERS[k + 1] * (p.size[2] + 0.06)) / 2)
          dummy.rotation.set(0, 0, 0)
          dummy.scale.setScalar(1)
          dummy.updateMatrix()
          dots.setMatrixAt(b++, dummy.matrix)
        }
      }
      i++
    }
    writer.done()
    mesh.count = i
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    dots.count = b
    dots.instanceMatrix.needsUpdate = true
  })
  const partAt = (e: { instanceId?: number }) => (e.instanceId === undefined ? null : order.current[e.instanceId] ?? null)
  return (
    <>
      <instancedMesh
        ref={(m) => { inst.current = m; cell(m) }}
        args={[undefined, undefined, MAX_PARTS]}
        frustumCulled={false}
        onClick={(e) => {
          e.stopPropagation()
          const p = partAt(e)
          if (guard.moved || !p) return
          hover.current = null
          tip.hide()
          lab.toggle(p.item.ref)
        }}
        onPointerDown={(e) => {
          const p = partAt(e)
          if (p) onPress(p.item.ref)
        }}
        onPointerMove={(e) => {
          e.stopPropagation()
          const p = partAt(e)
          if (!p) return
          if (hover.current !== p) {
            hover.current = p
            const selected = lab.selected.has(p.item.ref)
            tip.show(e.nativeEvent, p.item.title, `${p.item.label} · ${p.code} · ${selected ? 'click to send back' : 'click to build'}`)
          } else tip.move(e.nativeEvent)
        }}
        onPointerOut={() => { hover.current = null; tip.hide() }}
      >
        <boxGeometry args={[1, 1, 1]} />
        <Surf c={c} color="#FFFFFF" />
      </instancedMesh>
      <instancedMesh ref={beads} args={[undefined, undefined, 64]} frustumCulled={false}>
        <sphereGeometry args={[0.045, 8, 8]} />
        <meshBasicMaterial color={BRAND.bead} toneMapped={false} />
      </instancedMesh>
      <Dynamic writer={writer} mirror={c.mirror} />
      {[...sim.live].map((p) => (
        <Top key={p.item.ref} p={p} lab={lab} c={c} hover={hover} />
      ))}
    </>
  )
}
