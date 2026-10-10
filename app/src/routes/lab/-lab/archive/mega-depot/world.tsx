import { useFrame, useThree } from '@react-three/fiber'
import type { ThreeEvent } from '@react-three/fiber'
import { Edges, Line } from '@react-three/drei'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  BoxGeometry, BufferAttribute, BufferGeometry, CanvasTexture, Color, DoubleSide, EdgesGeometry, Group, InstancedBufferAttribute,
  InstancedBufferGeometry, InstancedMesh, LineSegments, Mesh, MeshBasicMaterial, Plane, Points, Raycaster, ShaderMaterial, Texture,
  Vector2, Vector3,
} from 'three'

import type { Lab } from '../../lab.types'
import { Cell } from './cell'
import { ACCENT, FONT, palette, textTexture, thumb, tint } from './kit'
import type { Colors } from './kit'
import { BASE_H, BIN, LEVEL_H, RACK_D, ROAD, stopOf } from './layout'
import type { Layout, Way } from './layout'
import { basis, elFor, fit, levelOf, lod, offset, ss } from './rt'
import type { RT } from './rt'
import { busy } from './sim'
import type { Part } from './sim'

const v3 = new Vector3()
const ground = new Plane(new Vector3(0, 1, 0), 0)
const ray = new Raycaster()
const ndc = new Vector2()

function groundAt(camera: THREE_Camera, x: number, y: number, out: Vector3) {
  ndc.set(x, y)
  ray.setFromCamera(ndc, camera)
  return ray.ray.intersectPlane(ground, out)
}
type THREE_Camera = Parameters<Raycaster['setFromCamera']>[1]

export function camStep(rt: RT, dt: number) {
  const cam = rt.cam
  const sim = rt.sim
  const isBusy = busy(sim)
  if (rt.knobs.follow && isBusy && !cam.override) {
    cam.following = true
    const pk = sim.picker
    if (pk.state === 'go' || pk.state === 'pick') {
      const next = pk.path[0]
      const leg = next ? Math.abs(next.x - pk.pos.x) + Math.abs(next.z - pk.pos.z) : 0
      v3.copy(pk.pos)
      if (next && leg > 0.1) v3.add(new Vector3(next.x - pk.pos.x, 0, next.z - pk.pos.z).normalize().multiplyScalar(Math.min(4, leg)))
      cam.wantPpu = pk.state === 'pick' ? 20 : leg > 24 ? 14 : 18
      cam.want.copy(offset(v3, rt.size, cam.wantPpu))
    } else {
      cam.wantPpu = Math.min(34, (rt.size.w - rt.size.panel) / 30)
      cam.want.copy(offset(v3.copy(sim.cell).add(new Vector3(4.2, 0, 0)), rt.size, cam.wantPpu))
    }
    cam.rate = 2.4
  } else if (cam.following && !isBusy) {
    cam.following = false
    if (!cam.override) {
      cam.want.copy(cam.home.target)
      cam.wantPpu = cam.home.ppu
      cam.rate = 2
    }
  }
  if (!isBusy) cam.override = false
  const k = 1 - Math.exp(-dt * cam.rate)
  cam.target.lerp(cam.want, k)
  cam.ppu = Math.exp(Math.log(cam.ppu) + (Math.log(cam.wantPpu) - Math.log(cam.ppu)) * k)
}

export function CameraRig({ rt }: { rt: RT }) {
  const { camera, gl, size } = useThree()
  useLayoutEffect(() => {
    rt.size.w = size.width
    rt.size.h = size.height
    rt.size.panel = rt.lab.chrome === 'full' && size.width >= 768 ? 340 : 0
    rt.size.bottom = rt.lab.chrome === 'full' && size.width < 768 ? size.height * 0.42 : 0
    const L = rt.L
    const home = fit(homePoints(L), rt.size)
    rt.cam.home = home
    if (!rt.cam.following) {
      rt.cam.want.copy(home.target)
      rt.cam.wantPpu = home.ppu
      if (rt.cam.ppu === 0) {
        rt.cam.target.copy(home.target)
        rt.cam.ppu = home.ppu
      }
    }
  }, [size.width, size.height, rt, rt.L])

  useEffect(() => {
    const el = gl.domElement
    let drag: { x: number; y: number; moved: boolean } | null = null
    const down = (e: PointerEvent) => {
      drag = { x: e.clientX, y: e.clientY, moved: false }
    }
    const move = (e: PointerEvent) => {
      if (!drag) return
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y
      if (!drag.moved && Math.hypot(dx, dy) < 4) return
      drag.moved = true
      drag.x = e.clientX
      drag.y = e.clientY
      const cam = rt.cam
      const elv = elFor(cam.ppu)
      const { right, fwd } = basis(elv)
      const shift = v3.set(0, 0, 0).addScaledVector(right, -dx / cam.ppu).addScaledVector(fwd, dy / cam.ppu / Math.sin(elv))
      cam.target.add(shift)
      cam.want.copy(cam.target)
      cam.wantPpu = cam.ppu
      if (busy(rt.sim)) cam.override = true
    }
    const up = () => {
      drag = null
    }
    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      const cam = rt.cam
      const rect = el.getBoundingClientRect()
      const p = groundAt(camera, ((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1, new Vector3())
      const from = cam.wantPpu
      const to = Math.min(130, Math.max(2.2, from * Math.exp(-e.deltaY * 0.0016)))
      if (p) cam.want.sub(p).multiplyScalar(from / to).add(p)
      cam.wantPpu = to
      cam.rate = 9
      if (busy(rt.sim)) cam.override = true
    }
    el.addEventListener('pointerdown', down)
    addEventListener('pointermove', move)
    addEventListener('pointerup', up)
    el.addEventListener('wheel', wheel, { passive: false })
    return () => {
      el.removeEventListener('pointerdown', down)
      removeEventListener('pointermove', move)
      removeEventListener('pointerup', up)
      el.removeEventListener('wheel', wheel)
    }
  }, [gl, camera, rt])

  useFrame((_, delta) => {
    camStep(rt, Math.min(delta, 0.12))
    const cam = rt.cam
    const el = elFor(cam.ppu)
    const { dir } = basis(el)
    camera.position.copy(cam.target).addScaledVector(dir, 400)
    camera.up.set(0, 1, 0)
    camera.lookAt(cam.target)
    camera.zoom = cam.ppu
    camera.updateProjectionMatrix()
    camera.updateMatrixWorld()
    const corners: [number, number][] = [[-1, 1], [1, 1], [1, -1], [-1, -1]]
    corners.forEach(([x, y], i) => {
      const p = groundAt(camera, x, y, v3)
      if (p) rt.corners.set([p.x, p.z], i * 2)
    })
    rt.level = levelOf(cam.ppu)
  })
  return null
}

export const homePoints = (L: Layout) => {
  const { x0, x1, z0, z1 } = L.bounds
  return [[x0, 0, z0], [x1, 0, z0], [x0, 0, z1], [x1, 0, z1], [x0, 6, z0], [x1, 6, z0]] as const
}

/** Bakes a fixed light into per-face vertex colours so instanced boxes can use an unlit material. */
function shaded(g: BoxGeometry) {
  const shade = [0.84, 0.84, 1, 0.7, 0.93, 0.78]
  const out = new Float32Array(g.getAttribute('position').count * 3)
  for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) out.set([shade[f], shade[f], shade[f]], (f * 4 + v) * 3)
  g.setAttribute('color', new BufferAttribute(out, 3))
  return g
}

function linesGeometry(segments: number[]) {
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(segments), 3))
  return g
}

export function Ground({ rt, L, c }: { rt: RT; L: Layout; c: Colors }) {
  const roofs = useRef<(Mesh | null)[]>([])
  const roofLines = useRef<LineSegments>(null)
  const walls = useRef<LineSegments>(null)
  const { geo, wallGeo, spines } = useMemo(() => {
    const roof: number[] = []
    const wall: number[] = []
    const spines: [number, number, number][][] = []
    for (const b of L.buildings) {
      const { x0, x1, z0, z1, h } = b
      const rect = (y: number, out: number[]) => out.push(x0, y, z0, x1, y, z0, x1, y, z0, x1, y, z1, x1, y, z1, x0, y, z1, x0, y, z1, x0, y, z0)
      rect(h, roof)
      for (let x = x0 + 4; x < x1 - 2; x += 6) roof.push(x, h + 0.01, z0 + 1, x, h + 0.01, z1 - 1)
      rect(0.01, wall)
      rect(h, wall)
      for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) wall.push(x, 0, z, x, h, z)
      spines.push([[b.spine, 0.03, z0 + 1.2], [b.spine, 0.03, ROAD]])
    }
    return { geo: linesGeometry(roof), wallGeo: linesGeometry(wall), spines }
  }, [L])
  const labels = useMemo(
    () =>
      L.buildings.map((b) =>
        textTexture(1024, 300, (ctx) => {
          ctx.fillStyle = c.fg
          ctx.font = `500 132px ${FONT}`
          ctx.fillText(b.label.toUpperCase(), 24, 140)
          ctx.fillStyle = c.muted
          ctx.font = `400 64px ${FONT}`
          ctx.fillText(`${b.count.toLocaleString()} parts · ${b.aisles} aisle${b.aisles === 1 ? '' : 's'}`, 28, 244)
        }),
      ),
    [L, c],
  )
  useEffect(() => () => labels.forEach((t) => t.dispose()), [labels])
  useFrame(() => {
    const k = lod(rt.cam.ppu).roof
    roofs.current.forEach((m) => {
      if (!m) return
      m.visible = k > 0.01
      for (const child of [m, ...m.children]) ((child as Mesh).material as MeshBasicMaterial).opacity = (child === m ? 0.94 : 1) * k
    })
    if (roofLines.current) {
      roofLines.current.visible = k > 0.01
      ;(roofLines.current.material as MeshBasicMaterial).opacity = k
    }
    if (walls.current) (walls.current.material as MeshBasicMaterial).opacity = 0.35 + 0.65 * k
  })
  const { x0, x1, z0, z1 } = L.bounds
  const flyInto = (e: ThreeEvent<MouseEvent>, b: Layout['buildings'][number]) => {
    if (lod(rt.cam.ppu).roof < 0.3 || e.delta > 4) return
    e.stopPropagation()
    const target = fit([[b.x0, 0, b.z0], [b.x1, 0, b.z0], [b.x0, 0, b.z1], [b.x1, 0, b.z1]], rt.size)
    rt.cam.want.copy(target.target)
    rt.cam.wantPpu = Math.max(target.ppu, 7)
    rt.cam.rate = 3
  }
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[(x0 + x1) / 2, -0.02, (z0 + z1) / 2]}>
        <planeGeometry args={[x1 - x0 + 400, z1 - z0 + 400]} />
        <meshBasicMaterial color={c.floor} />
      </mesh>
      {L.buildings.map((b) => (
        <mesh key={b.key} rotation={[-Math.PI / 2, 0, 0]} position={[(b.x0 + b.x1) / 2, -0.005, (b.z0 + b.z1) / 2]}>
          <planeGeometry args={[b.x1 - b.x0, b.z1 - b.z0]} />
          <meshBasicMaterial color={c.slab} />
        </mesh>
      ))}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[(x0 + x1) / 2, -0.004, ROAD]}>
        <planeGeometry args={[x1 - x0, 3.4]} />
        <meshBasicMaterial color={c.slab} />
      </mesh>
      <Line points={[[x0, 0.02, ROAD], [x1, 0.02, ROAD]]} color={c.edge} lineWidth={1} dashed dashSize={0.8} gapSize={0.6} />
      {spines.map((points, i) => (
        <Line key={i} points={points} color={c.dim} lineWidth={1} dashed dashSize={0.5} gapSize={0.5} />
      ))}
      <lineSegments ref={walls} geometry={wallGeo}>
        <lineBasicMaterial color={c.edge} transparent />
      </lineSegments>
      <lineSegments ref={roofLines} geometry={geo}>
        <lineBasicMaterial color={c.edge} transparent />
      </lineSegments>
      {L.buildings.map((b, i) => {
        const w = b.x1 - b.x0, d = b.z1 - b.z0
        const lw = Math.min(w * 0.82, d * 2.6, 60)
        return (
          <mesh
            key={b.key}
            ref={(m) => { roofs.current[i] = m }}
            rotation={[-Math.PI / 2, 0, 0]}
            position={[(b.x0 + b.x1) / 2, b.h, (b.z0 + b.z1) / 2]}
            onClick={(e) => flyInto(e, b)}
            onPointerOver={(e) => { if (lod(rt.cam.ppu).roof > 0.3) { e.stopPropagation(); rt.tip.show(e.nativeEvent, b.label, `${b.count.toLocaleString()} parts · click to open the hall`) } }}
            onPointerMove={(e) => rt.tip.move(e.nativeEvent)}
            onPointerOut={() => rt.tip.hide()}
          >
            <planeGeometry args={[w, d]} />
            <meshBasicMaterial color={c.roof} transparent depthWrite={false} side={DoubleSide} />
            <mesh position={[0, 0, 0.02]}>
              <planeGeometry args={[lw, lw * 0.29]} />
              <meshBasicMaterial map={labels[i]} transparent depthWrite={false} toneMapped={false} />
            </mesh>
          </mesh>
        )
      })}
    </group>
  )
}

export function Racks({ L, c }: { L: Layout; c: Colors }) {
  const geo = useMemo(() => {
    const s: number[] = []
    const H = L.rackH
    const byRow = new Map<number, number[]>()
    for (const bay of L.bays) byRow.set(bay.row, [...(byRow.get(bay.row) ?? []), bay.x])
    for (const [r, xs] of byRow) {
      const row = L.rows[r]
      const zf = row.face, zb = row.face - RACK_D
      const edges = new Set<number>()
      for (const x of xs) {
        edges.add(Math.round((x - L.bayW / 2) * 100) / 100)
        edges.add(Math.round((x + L.bayW / 2) * 100) / 100)
      }
      for (const x of edges) s.push(x, 0, zf, x, H, zf, x, 0, zb, x, H, zb, x, H, zf, x, H, zb, x, 0.02, zf, x, 0.02, zb)
      const runs = [...edges].sort((a, b) => a - b)
      let start = runs[0]
      for (let k = 1; k <= runs.length; k++) {
        const end = runs[k - 1]
        if (k === runs.length || runs[k] - end > L.bayW + 0.05) {
          for (let lv = 0; lv <= L.levels; lv++) {
            const y = lv === 0 ? BASE_H : BASE_H + lv * LEVEL_H
            s.push(start, y, zf, end, y, zf)
            if (lv === L.levels) s.push(start, y, zb, end, y, zb)
          }
          s.push(start, 0.02, zf, end, 0.02, zf)
          if (k < runs.length) start = runs[k]
        }
      }
    }
    return linesGeometry(s)
  }, [L])
  useEffect(() => () => geo.dispose(), [geo])
  return (
    <lineSegments geometry={geo}>
      <lineBasicMaterial color={c.edge} />
    </lineSegments>
  )
}

export function Lanes({ L, c, on }: { L: Layout; c: Colors; on: boolean }) {
  const geo = useMemo(() => {
    const pos: number[] = []
    const col: number[] = []
    const color = new Color()
    for (const lane of L.lanes) {
      color.set(tint(lane.hue, c, c.dark ? 30 : 74, c.dark ? 40 : 60))
      if (lane.column) color.lerp(new Color(c.slab), 0.45)
      const y = lane.column ? 0.006 : 0.012
      pos.push(lane.x0, y, lane.z0, lane.x0, y, lane.z1, lane.x1, y, lane.z1, lane.x0, y, lane.z0, lane.x1, y, lane.z1, lane.x1, y, lane.z0)
      for (let k = 0; k < 6; k++) col.push(color.r, color.g, color.b)
    }
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
    g.setAttribute('color', new BufferAttribute(new Float32Array(col), 3))
    return g
  }, [L, c])
  useEffect(() => () => geo.dispose(), [geo])
  const tags = useMemo(
    () =>
      L.lanes.filter((lane) => lane.column).map((lane) => ({
        lane,
        map: textTexture(512, 96, (ctx) => {
          ctx.fillStyle = tint(lane.hue, c, c.dark ? 62 : 40, 50)
          ctx.font = `500 52px ${FONT}`
          ctx.fillText(lane.label.toUpperCase(), 8, 66)
        }),
      })),
    [L, c],
  )
  if (!on) return null
  return (
    <group>
      <mesh geometry={geo}>
        <meshBasicMaterial vertexColors side={DoubleSide} />
      </mesh>
      {tags.map(({ lane, map }, i) => {
        const w = Math.min(lane.x1 - lane.x0 - 0.4, 14)
        return (
          <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[lane.x0 + 0.2 + w / 2, 0.03, lane.z1 - 0.5]}>
            <planeGeometry args={[w, w * 0.1875]} />
            <meshBasicMaterial map={map} transparent toneMapped={false} />
          </mesh>
        )
      })}
    </group>
  )
}

const edgeShader = {
  vertexShader: `attribute vec3 offset; attribute float vis; void main() { vec3 p = position * vis + offset; gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }`,
  fragmentShader: `uniform vec3 color; uniform float opacity; void main() { gl_FragColor = vec4(color, opacity); }`,
}

/** Every shelf bin as one instanced draw, re-shelved with a staggered arc whenever the layout changes. */
export function Bins({ rt, L, c, version }: { rt: RT; L: Layout; c: Colors; version: string }) {
  const mesh = useRef<InstancedMesh>(null)
  const lines = useRef<LineSegments>(null)
  const n = L.pos.length / 3
  const anim = useMemo(() => ({ from: new Float32Array(n * 3), t: new Float32Array(n).fill(1), delay: new Float32Array(n), active: false, first: true, seen: -1, layout: '' }), [n])
  const geometry = useMemo(() => shaded(new BoxGeometry(BIN.w, BIN.h, BIN.d)), [])
  const edges = useMemo(() => {
    const g = new InstancedBufferGeometry()
    const base = new EdgesGeometry(new BoxGeometry(BIN.w, BIN.h, BIN.d))
    g.setAttribute('position', base.getAttribute('position'))
    g.setAttribute('offset', new InstancedBufferAttribute(new Float32Array(n * 3), 3))
    g.setAttribute('vis', new InstancedBufferAttribute(new Float32Array(n), 1))
    g.instanceCount = n
    return g
  }, [n])
  const edgeMat = useMemo(() => new ShaderMaterial({ ...edgeShader, uniforms: { color: { value: new Color() }, opacity: { value: 1 } }, transparent: true }), [])
  const colors = useMemo(() => new Float32Array(n * 3), [n])
  const base = useMemo(() => {
    const out = new Float32Array(n * 3)
    const color = new Color()
    const bg = new Color(c.bg)
    rt.lab.catalog.items.forEach((item, i) => {
      color.set(tint(item.hue, c, c.dark ? 36 : 70, c.dark ? 24 : 44))
      if (rt.match && !rt.match[i]) color.lerp(bg, 0.82)
      else if (rt.match && rt.query) color.set(ACCENT)
      color.toArray(out, i * 3)
    })
    return out
  }, [n, c, version, rt])
  useLayoutEffect(() => {
    const m = mesh.current!
    m.instanceColor = new InstancedBufferAttribute(colors, 3)
  }, [colors])
  useEffect(() => {
    if (anim.layout === L.key) return
    if (anim.first) {
      rt.binPos.set(L.pos)
      anim.first = false
    } else {
      anim.from.set(rt.binPos)
      for (let i = 0; i < n; i++) {
        anim.t[i] = 0
        anim.delay[i] = L.groupOf[i] * 0.045 + ((i * 7919) % 97) / 97 * 0.5
      }
      anim.active = true
    }
    anim.layout = L.key
    anim.seen = -1
  }, [L, anim, n, rt])

  useFrame((_, delta) => {
    const m = mesh.current
    if (!m) return
    const dt = Math.min(delta, 1 / 20)
    const sim = rt.sim
    const k = lod(rt.cam.ppu).bins
    const show = anim.active ? 1 : k
    m.visible = show > 0.01
    const mat = m.material as MeshBasicMaterial
    mat.opacity = show
    mat.transparent = show < 0.99
    mat.depthWrite = show > 0.5
    const edgeK = anim.active ? 0 : ss(14, 19, rt.cam.ppu)
    edgeMat.uniforms.opacity.value = edgeK * (c.dark ? 0.55 : 0.7)
    if (lines.current) lines.current.visible = edgeK > 0.02
    ;(edgeMat.uniforms.color.value as Color).set(c.edge)
    const dirty = anim.active || anim.seen !== sim.version
    if (anim.active) {
      let running = false
      const pos = rt.binPos
      for (let i = 0; i < n; i++) {
        if (anim.t[i] >= 1) continue
        anim.delay[i] -= dt
        if (anim.delay[i] > 0) {
          running = true
          continue
        }
        anim.t[i] = Math.min(1, anim.t[i] + dt / 1.1)
        const t = anim.t[i]
        const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2
        const j = i * 3
        const dist = Math.abs(L.pos[j] - anim.from[j]) + Math.abs(L.pos[j + 2] - anim.from[j + 2])
        pos[j] = anim.from[j] + (L.pos[j] - anim.from[j]) * e
        pos[j + 1] = anim.from[j + 1] + (L.pos[j + 1] - anim.from[j + 1]) * e + Math.sin(Math.PI * t) * Math.min(14, 1.5 + dist * 0.14)
        pos[j + 2] = anim.from[j + 2] + (L.pos[j + 2] - anim.from[j + 2]) * e
        if (t < 1) running = true
      }
      anim.active = running
    }
    if (dirty) {
      anim.seen = sim.version
      const arr = m.instanceMatrix.array as Float32Array
      const off = edges.getAttribute('offset') as InstancedBufferAttribute
      const vis = edges.getAttribute('vis') as InstancedBufferAttribute
      const pos = rt.binPos
      for (let i = 0; i < n; i++) {
        const part = sim.parts.get(rt.lab.catalog.items[i].ref)
        const s = part && part.mode !== 'wait' ? 0 : 1
        const o = i * 16
        arr[o] = s; arr[o + 1] = 0; arr[o + 2] = 0; arr[o + 3] = 0
        arr[o + 4] = 0; arr[o + 5] = s; arr[o + 6] = 0; arr[o + 7] = 0
        arr[o + 8] = 0; arr[o + 9] = 0; arr[o + 10] = s; arr[o + 11] = 0
        arr[o + 12] = pos[i * 3]; arr[o + 13] = pos[i * 3 + 1]; arr[o + 14] = pos[i * 3 + 2]; arr[o + 15] = 1
        ;(off.array as Float32Array).set([pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]], i * 3)
        ;(vis.array as Float32Array)[i] = s * 1.002
      }
      m.instanceMatrix.needsUpdate = true
      off.needsUpdate = true
      vis.needsUpdate = true
      m.computeBoundingSphere()
    }
    colors.set(base)
    const blink = 0.5 + 0.5 * Math.sin(sim.time * 10)
    const accent = new Color(ACCENT)
    const hi = new Color(c.fg)
    for (const p of sim.parts.values()) if (p.mode === 'wait') accent.clone().lerp(hi, blink * 0.6).toArray(colors, p.i * 3)
    if (rt.hover >= 0) accent.toArray(colors, rt.hover * 3)
    if (m.instanceColor) m.instanceColor.needsUpdate = true
  })

  const pick = (e: ThreeEvent<PointerEvent | MouseEvent>) => {
    const i = e.instanceId
    if (i === undefined || lod(rt.cam.ppu).bins < 0.4) return -1
    return i
  }
  return (
    <group>
      <instancedMesh
        ref={mesh}
        args={[geometry, undefined, n]}
        frustumCulled={false}
        onPointerMove={(e) => {
          const i = pick(e)
          if (i < 0) return
          e.stopPropagation()
          if (rt.hover !== i) {
            rt.hover = i
            const item = rt.lab.catalog.items[i]
            const selected = rt.lab.selected.has(item.ref)
            rt.tip.show(e.nativeEvent, item.title, `${rt.L.codes[i]} · ${item.label} · ${item.sourceName ?? item.source} · ${selected ? 'click to return' : 'click to pick'}`)
          }
          rt.tip.move(e.nativeEvent)
        }}
        onPointerOut={() => {
          rt.hover = -1
          rt.tip.hide()
        }}
        onClick={(e) => {
          const i = pick(e)
          if (i < 0 || e.delta > 4) return
          e.stopPropagation()
          rt.lab.toggle(rt.lab.catalog.items[i].ref)
        }}
      >
        <meshBasicMaterial vertexColors />
      </instancedMesh>
      <lineSegments ref={lines} geometry={edges} material={edgeMat} frustumCulled={false} />
    </group>
  )
}

export function HeatMap({ rt, L, c, version }: { rt: RT; L: Layout; c: Colors; version: string }) {
  const mesh = useRef<InstancedMesh>(null)
  const n = L.bays.length
  const geometry = useMemo(() => shaded(new BoxGeometry(L.bayW - 0.12, L.rackH, RACK_D)), [L.bayW, L.rackH])
  useLayoutEffect(() => {
    const m = mesh.current!
    const arr = m.instanceMatrix.array as Float32Array
    L.bays.forEach((bay, k) => {
      const o = k * 16
      arr.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, bay.x, L.rackH / 2, L.rows[bay.row].face - RACK_D / 2, 1], o)
    })
    m.instanceMatrix.needsUpdate = true
    m.computeBoundingSphere()
    const heat = rt.knobs.heat
    const query = !!rt.match
    const vals = L.bays.map((bay) => {
      if (!bay.items.length) return 0
      if (query) return bay.items.filter((i) => rt.match![i]).length / bay.items.length
      if (heat === 'selection') return bay.items.filter((i) => rt.lab.selected.has(rt.lab.catalog.items[i].ref)).length / bay.items.length
      return bay.items.reduce((s, i) => s + Math.log10(10 + rt.facts.installs[i]), 0) / bay.items.length
    })
    let lo = 0, hi = 1
    if (query || heat === 'selection') hi = Math.max(0.05, ...vals)
    else {
      const sorted = [...vals].sort((a, b) => a - b)
      const rank = new Map(sorted.map((v, k) => [v, k / Math.max(1, sorted.length - 1)]))
      vals.forEach((v, k) => (vals[k] = rank.get(v) ?? 0))
    }
    const cold = new Color(c.dark ? '#1C252A' : '#F3F5F6')
    const warm = query || heat === 'selection' ? [new Color(c.dark ? '#2B4A5A' : '#BBD3DF'), new Color(ACCENT)] : [new Color(c.dark ? '#5A3A22' : '#F2C79B'), new Color(c.dark ? '#E0743A' : '#D9622B')]
    const color = new Color()
    vals.forEach((v, k) => {
      const t = Math.max(0, Math.min(1, (v - lo) / Math.max(1e-6, hi - lo)))
      if (t < 0.5) color.copy(cold).lerp(warm[0], t * 2)
      else color.copy(warm[0]).lerp(warm[1], (t - 0.5) * 2)
      if (heat === 'off' && !query) color.copy(cold)
      m.setColorAt(k, color)
    })
    if (m.instanceColor) m.instanceColor.needsUpdate = true
  }, [L, c, version, rt, n])
  useFrame(() => {
    const m = mesh.current
    if (!m) return
    const k = lod(rt.cam.ppu).heat * (rt.knobs.heat === 'off' && !rt.match ? 0.6 : 1)
    m.visible = k > 0.01
    const mat = m.material as MeshBasicMaterial
    mat.opacity = k
    mat.transparent = k < 0.98
    mat.depthWrite = k >= 0.98
  })
  return (
    <instancedMesh
      ref={mesh}
      key={n}
      args={[geometry, undefined, n]}
      onClick={(e) => {
        if (lod(rt.cam.ppu).heat < 0.4 || e.instanceId === undefined || e.delta > 4) return
        e.stopPropagation()
        const bay = L.bays[e.instanceId]
        rt.cam.want.copy(offset(new Vector3(bay.x, 0, L.rows[bay.row].face + 1), rt.size, 20))
        rt.cam.wantPpu = 20
        rt.cam.rate = 3
      }}
      onPointerMove={(e) => {
        if (lod(rt.cam.ppu).heat < 0.4 || e.instanceId === undefined) return
        e.stopPropagation()
        const bay = L.bays[e.instanceId]
        const first = bay.items[0]
        const sec = L.groups[L.groupOf[first]]
        rt.tip.show(e.nativeEvent, `${sec.label} · bay ${L.codes[first]?.split('-')[1] ?? ''}`, `${bay.items.length} parts · click to walk the aisle`)
        rt.tip.move(e.nativeEvent)
      }}
      onPointerOut={() => rt.tip.hide()}
    >
      <meshBasicMaterial vertexColors transparent depthWrite={false} />
    </instancedMesh>
  )
}

export function Beacons({ rt, L, version }: { rt: RT; L: Layout; version: string }) {
  const points = useRef<Points>(null)
  const geo = useMemo(() => {
    const out: number[] = []
    if (rt.match && rt.query) rt.match.forEach((m, i) => m && out.push(L.pos[i * 3], L.rackH + 0.7, L.pos[i * 3 + 2]))
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(new Float32Array(out), 3))
    return g
  }, [L, version, rt])
  useEffect(() => () => geo.dispose(), [geo])
  useFrame(({ clock }) => {
    const p = points.current
    if (!p) return
    const fade = 1 - Math.min(1, Math.max(0, (rt.cam.ppu - 16) / 10))
    p.visible = rt.query && fade > 0.02
    const mat = p.material as MeshBasicMaterial & { size: number }
    mat.size = 5 + 2 * Math.sin(clock.elapsedTime * 5)
    mat.opacity = fade
  })
  return (
    <points ref={points} geometry={geo} frustumCulled={false} renderOrder={5}>
      <pointsMaterial color={ACCENT} size={6} sizeAttenuation={false} transparent depthTest={false} toneMapped={false} />
    </points>
  )
}

export function Signage({ rt, L, c, focus }: { rt: RT; L: Layout; c: Colors; focus: string }) {
  const signs = useRef<Group>(null)
  const banners = useRef<Group>(null)
  const { camera } = useThree()
  const stagger = useMemo(() => {
    const out: number[] = []
    const seen = new Map<number, number>()
    for (const sign of L.signs) {
      const narrow = L.signs.filter((o) => o.row === sign.row).length > 1
      const k = seen.get(sign.row) ?? 0
      seen.set(sign.row, k + 1)
      out.push(narrow ? k % 2 : -1)
    }
    return out
  }, [L])
  const textures = useMemo(() => {
    const signMaps = L.signs.map((s) => {
      const g = L.groups[s.group]
      const on = g.key === focus
      return textTexture(640, 112, (ctx) => {
        ctx.fillStyle = on ? ACCENT : c.surface
        ctx.strokeStyle = on ? ACCENT : c.edge
        ctx.lineWidth = 4
        ctx.beginPath()
        ctx.roundRect(4, 4, 632, 104, 16)
        ctx.fill()
        ctx.stroke()
        ctx.fillStyle = on ? '#FFFFFF' : c.fg
        ctx.font = `600 60px ${FONT}`
        ctx.fillText(String(g.no).padStart(2, '0'), 26, 78)
        ctx.fillStyle = tint(g.hue, c, c.dark ? 60 : 50, 60)
        ctx.fillRect(118, 26, 8, 60)
        ctx.fillStyle = on ? '#FFFFFF' : c.fg
        ctx.font = `500 ${g.label.length > 13 ? 44 : 54}px ${FONT}`
        const label = s.first ? g.label : `${g.label} cont.`
        ctx.fillText(label.length > 18 ? `${label.slice(0, 17)}…` : label, 144, 76)
        ctx.fillStyle = on ? '#E6F0F5' : c.muted
        ctx.font = `400 40px ${FONT}`
        ctx.textAlign = 'right'
        ctx.fillText(g.count.toLocaleString(), 612, 74)
      })
    })
    const bannerMaps = L.sections.map((s) =>
      textTexture(384, 72, (ctx) => {
        ctx.fillStyle = c.surface
        ctx.fillRect(0, 0, 384, 72)
        ctx.fillStyle = tint(s.hue, c, c.dark ? 55 : 52, 62)
        ctx.fillRect(0, 0, 14, 72)
        ctx.fillStyle = c.fg
        ctx.font = `500 34px ${FONT}`
        const label = s.first ? s.label : `${s.label} ›`
        ctx.fillText(label.length > 16 ? `${label.slice(0, 15)}…` : label, 28, 47)
        ctx.fillStyle = c.muted
        ctx.font = `400 28px ${FONT}`
        ctx.textAlign = 'right'
        ctx.fillText(String(s.count), 372, 47)
      }),
    )
    return { signMaps, bannerMaps }
  }, [L, c, focus])
  useEffect(() => () => [...textures.signMaps, ...textures.bannerMaps].forEach((t) => t.dispose()), [textures])
  useFrame(() => {
    const ppu = rt.cam.ppu
    const l = lod(ppu)
    const g = signs.current
    if (g) {
      g.visible = l.signs > 0.01
      const base = Math.min(4.2, Math.max(0.5, 24 / ppu))
      g.children.forEach((child, k) => {
        const sign = L.signs[k]
        const tier = stagger[k]
        const s = Math.max(0.5, Math.min(base, tier === -1 ? 9 : (sign.w / 4.6) * 2))
        child.quaternion.copy(camera.quaternion)
        child.scale.setScalar(s)
        child.position.x = L.signs[k].x + 2.4 * s
        child.position.y = L.rackH + 0.7 + 0.42 * s + Math.max(0, tier) * (0.84 * s + 0.25)
        ;((child as Mesh).material as MeshBasicMaterial).opacity = l.signs
      })
    }
    const b = banners.current
    if (b) {
      b.visible = l.labels > 0.01
      for (const child of b.children) {
        const mat = (child as Mesh).material as MeshBasicMaterial
        mat.opacity = l.labels
        mat.transparent = l.labels < 0.98
      }
    }
  })
  return (
    <group>
      <group ref={signs}>
        {L.signs.map((s, k) => (
          <mesh key={k} position={[s.x + 2.4, L.rackH + 1.6, L.rows[s.row].face - RACK_D / 2]} renderOrder={3}>
            <planeGeometry args={[4.8, 0.84]} />
            <meshBasicMaterial map={textures.signMaps[k]} transparent depthWrite={false} toneMapped={false} />
          </mesh>
        ))}
      </group>
      <group ref={banners}>
        {L.sections.map((s, k) => {
          const w = Math.min(s.x1 - s.x0 - 0.2, 3.2)
          return (
            <mesh key={k} position={[s.x0 + 0.1 + w / 2, L.rackH + 0.3, L.rows[s.row].face + 0.01]}>
              <planeGeometry args={[w, w * 0.1875]} />
              <meshBasicMaterial map={textures.bannerMaps[k]} transparent toneMapped={false} />
            </mesh>
          )
        })}
      </group>
    </group>
  )
}

export function Routes({ rt, query }: { rt: RT; query: Way[] | null }) {
  const [plan, setPlan] = useState<[number, number, number][] | null>(null)
  const seen = useRef(-1)
  const last = useRef(0)
  useFrame(({ clock }) => {
    const sim = rt.sim
    if (seen.current === sim.planVersion && clock.elapsedTime - last.current < 0.25) return
    if (seen.current === sim.planVersion && !(sim.picker.state === 'go')) return
    seen.current = sim.planVersion
    last.current = clock.elapsedTime
    setPlan(sim.plan.length > 1 && busy(sim) ? sim.plan.map(([x, z]) => [x, 0.08, z]) : null)
  })
  const qpts = useMemo(() => {
    if (!query?.length) return null
    const [x, z] = [rt.L.dock.x, rt.L.dock.z]
    return [[x, 0.05, z] as [number, number, number], ...query.map((w): [number, number, number] => [w.x, 0.05, w.z])]
  }, [query, rt.L])
  return (
    <group>
      {qpts && <Line points={qpts} color={ACCENT} lineWidth={1.6} dashed dashSize={0.6} gapSize={0.35} transparent opacity={plan ? 0.35 : 0.9} />}
      {plan && <Line points={plan} color={ACCENT} lineWidth={3} />}
    </group>
  )
}

export function PickerBot({ rt, c }: { rt: RT; c: Colors }) {
  const body = useRef<Group>(null)
  const arm = useRef<Mesh>(null)
  const lamp = useRef<MeshBasicMaterial>(null)
  const tag = useMemo(
    () =>
      textTexture(256, 72, (ctx) => {
        ctx.fillStyle = c.surface
        ctx.strokeStyle = ACCENT
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.roundRect(3, 6, 250, 60, 30)
        ctx.fill()
        ctx.stroke()
        ctx.fillStyle = c.fg
        ctx.font = `500 32px ${FONT}`
        ctx.fillText('PICKER 01', 34, 47)
      }),
    [c],
  )
  useFrame(({ clock }) => {
    const pk = rt.sim.picker
    const g = body.current!
    g.position.copy(pk.pos)
    g.rotation.y = pk.heading
    g.position.y = Math.abs(Math.sin(clock.elapsedTime * 18)) * 0.03 * Math.min(1, pk.v / 5)
    const a = arm.current!
    a.visible = pk.reach > 0.02
    const reach = 2.0 * pk.reach
    a.position.set(pk.pos.x, 1.15, pk.pos.z - reach / 2)
    a.scale.set(1, 1, Math.max(0.01, reach))
    if (lamp.current) lamp.current.color.set(pk.state === 'idle' ? c.dim : clock.elapsedTime % 0.6 < 0.3 ? ACCENT : c.fg)
    g.scale.setScalar(Math.min(4, Math.max(1.4, 18 / rt.cam.ppu)))
  })
  return (
    <>
      <group ref={body}>
        <mesh position={[0, 0.28, 0]}>
          <boxGeometry args={[1.25, 0.36, 1.5]} />
          <meshStandardMaterial color={c.surface} roughness={1} />
          <Edges color={ACCENT} />
        </mesh>
        {[[-0.5, -0.55], [0.5, -0.55], [-0.5, 0.55], [0.5, 0.55]].map(([x, z]) => (
          <mesh key={`${x}${z}`} position={[x, 0.12, z]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.12, 0.12, 0.12, 14]} />
            <meshStandardMaterial color={c.surface} roughness={1} />
            <Edges color={c.edge} threshold={20} />
          </mesh>
        ))}
        <mesh position={[0, 0.78, 0.05]}>
          <boxGeometry args={[1.15, 0.5, 1.15]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          <Edges color={c.edge} />
        </mesh>
        <mesh position={[0, 1.1, -0.7]}>
          <boxGeometry args={[0.14, 1.6, 0.14]} />
          <meshStandardMaterial color={c.surface} roughness={1} />
          <Edges color={c.edge} />
        </mesh>
        <mesh position={[0, 1.96, -0.7]}>
          <sphereGeometry args={[0.13, 12, 12]} />
          <meshBasicMaterial ref={lamp} color={ACCENT} toneMapped={false} />
        </mesh>
        <sprite position={[0, 2.7, -0.7]} scale={[2.1, 0.6, 1]}>
          <spriteMaterial map={tag} transparent depthTest={false} toneMapped={false} />
        </sprite>
      </group>
      <mesh ref={arm}>
        <boxGeometry args={[0.16, 0.08, 1]} />
        <meshBasicMaterial color={ACCENT} toneMapped={false} />
      </mesh>
    </>
  )
}

function useThumb(url: string | undefined, crop: number) {
  const [texture, setTexture] = useState<Texture | null>(null)
  useEffect(() => {
    if (!url) return
    let live = true
    const apply = (canvas: HTMLCanvasElement) => {
      if (!live) return
      const t = new CanvasTexture(canvas)
      t.colorSpace = 'srgb'
      t.repeat.set(1, crop)
      t.offset.set(0, 1 - crop)
      setTexture(t)
    }
    const hit = thumb(url)
    if (hit instanceof Promise) hit.then(apply)
    else apply(hit)
    return () => {
      live = false
    }
  }, [url, crop])
  useEffect(() => () => texture?.dispose(), [texture])
  return texture
}

function PartMesh({ p, rt, c }: { p: Part; rt: RT; c: Colors }) {
  const ref = useRef<Mesh>(null)
  const image = rt.lab.theme === 'dark' ? (p.item.imageDark ?? p.item.image) : p.item.image
  const texture = useThumb(image, Math.min(1, (p.size[2] / p.size[0]) / 0.75))
  const [edge, setEdge] = useState(false)
  useFrame(() => {
    const m = ref.current
    if (!m) return
    m.position.copy(p.pos)
    m.scale.setScalar(p.scale)
    m.rotation.set(p.spin * 0.3, p.spin, 0)
    const lit = p.mode === 'held' || p.mode === 'pick' || p.mode === 'drop'
    if (lit !== edge) setEdge(lit)
  })
  return (
    <mesh
      ref={ref}
      onClick={(e) => {
        if (e.delta > 4 || p.mode !== 'board') return
        e.stopPropagation()
        rt.tip.hide()
        rt.lab.toggle(p.ref)
      }}
      onPointerOver={(e) => {
        e.stopPropagation()
        rt.tip.show(e.nativeEvent, p.item.title, `${rt.L.codes[p.i]} · ${p.mode === 'board' ? 'seated · click to send back to its bin' : p.mode}`)
      }}
      onPointerMove={(e) => rt.tip.move(e.nativeEvent)}
      onPointerOut={() => rt.tip.hide()}
    >
      <boxGeometry args={p.size} />
      {[0, 1, 3, 4, 5].map((i) => (
        <meshStandardMaterial key={i} attach={`material-${i}`} color={tint(p.item.hue, c)} roughness={1} />
      ))}
      {texture ? <meshBasicMaterial attach="material-2" map={texture} toneMapped={false} /> : <meshStandardMaterial attach="material-2" color={tint(p.item.hue, c, c.l + 12)} roughness={1} />}
      <Edges color={edge ? ACCENT : c.edge} />
    </mesh>
  )
}

export function Parts({ rt, c }: { rt: RT; c: Colors }) {
  const [list, setList] = useState<Part[]>([])
  const seen = useRef(-1)
  useFrame(() => {
    if (seen.current === rt.sim.version) return
    seen.current = rt.sim.version
    setList([...rt.sim.parts.values()].filter((p) => p.mode !== 'wait'))
  })
  return (
    <>
      {list.map((p) => (
        <PartMesh key={p.ref} p={p} rt={rt} c={c} />
      ))}
    </>
  )
}

const codeMaps = new Map<string, CanvasTexture>()
function codeMap(key: string, code: string, title: string, c: Colors) {
  const hit = codeMaps.get(key)
  if (hit) return hit
  const t = textTexture(320, 64, (ctx) => {
    ctx.fillStyle = c.surface
    ctx.fillRect(0, 0, 320, 64)
    ctx.fillStyle = c.fg
    ctx.font = `600 26px ui-monospace, SFMono-Regular, Menlo, monospace`
    ctx.fillText(code, 10, 28)
    ctx.fillStyle = c.muted
    ctx.font = `400 22px ${FONT}`
    ctx.fillText(title.length > 24 ? `${title.slice(0, 23)}…` : title, 10, 56)
  })
  if (codeMaps.size > 400) {
    const first = codeMaps.keys().next().value!
    codeMaps.get(first)?.dispose()
    codeMaps.delete(first)
  }
  codeMaps.set(key, t)
  return t
}

function DetailBin({ i, rt, c }: { i: number; rt: RT; c: Colors }) {
  const item = rt.lab.catalog.items[i]
  const image = rt.lab.theme === 'dark' ? (item.imageDark ?? item.image) : item.image
  const texture = useThumb(image, (BIN.h / BIN.w) / 0.75)
  const group = useRef<Group>(null)
  const code = codeMap(`${rt.lab.theme}-${rt.L.key}-${i}`, rt.L.codes[i], item.title, c)
  useFrame(() => {
    const g = group.current
    if (!g) return
    const part = rt.sim.parts.get(item.ref)
    g.visible = !part || part.mode === 'wait'
    g.position.set(rt.binPos[i * 3], rt.binPos[i * 3 + 1], rt.binPos[i * 3 + 2])
  })
  const side = tint(item.hue, c, c.dark ? 36 : 70, c.dark ? 24 : 44)
  return (
    <group ref={group}>
      <mesh scale={1.015}>
        <boxGeometry args={[BIN.w, BIN.h, BIN.d]} />
        {[0, 1, 2, 3, 5].map((k) => (
          <meshStandardMaterial key={k} attach={`material-${k}`} color={side} roughness={1} />
        ))}
        {texture ? <meshBasicMaterial attach="material-4" map={texture} toneMapped={false} /> : <meshStandardMaterial attach="material-4" color={side} roughness={1} />}
        <Edges color={rt.match?.[i] ? ACCENT : c.edge} />
      </mesh>
      <mesh position={[0, -BIN.h / 2 - 0.045, BIN.d / 2 + 0.07]}>
        <planeGeometry args={[BIN.w, 0.16]} />
        <meshBasicMaterial map={code} toneMapped={false} />
      </mesh>
    </group>
  )
}

/** Closest LOD: real meshes with screenshots and pick codes for the bins nearest the view centre. */
export function DetailBins({ rt, c }: { rt: RT; c: Colors }) {
  const [list, setList] = useState<number[]>([])
  const last = useRef(0)
  const { camera } = useThree()
  useFrame(({ clock }) => {
    if (clock.elapsedTime - last.current < 0.3) return
    last.current = clock.elapsedTime
    if (rt.cam.ppu < 30) {
      if (list.length) setList([])
      return
    }
    const n = rt.binPos.length / 3
    const found: [number, number][] = []
    for (let i = 0; i < n; i++) {
      v3.set(rt.binPos[i * 3], rt.binPos[i * 3 + 1], rt.binPos[i * 3 + 2]).project(camera)
      if (Math.abs(v3.x) < 1.05 && Math.abs(v3.y) < 1.05) found.push([i, v3.x * v3.x + v3.y * v3.y])
    }
    found.sort((a, b) => a[1] - b[1])
    const next = found.slice(0, 64).map(([i]) => i).sort((a, b) => a - b)
    if (next.length !== list.length || next.some((v, k) => v !== list[k])) setList(next)
  })
  return (
    <>
      {list.map((i) => (
        <DetailBin key={i} i={i} rt={rt} c={c} />
      ))}
    </>
  )
}

export function World({ rt, lab, query, version, focus }: { rt: RT; lab: Lab; query: Way[] | null; version: string; focus: string }) {
  const c = palette(lab.theme)
  const L = rt.L
  useFrame((_, dt) => {
    rt.fps = rt.fps * 0.95 + (1 / Math.max(dt, 1e-3)) * 0.05
  })
  return (
    <>
      <CameraRig rt={rt} />
      <ambientLight intensity={lab.theme === 'dark' ? 0.9 : 1.6} />
      <directionalLight position={[6, 12, 8]} intensity={lab.theme === 'dark' ? 0.9 : 1.4} />
      <hemisphereLight args={[c.surface, c.bg, 0.5]} />
      <Ground rt={rt} L={L} c={c} />
      <Lanes L={L} c={c} on={rt.knobs.lanes} />
      <Racks L={L} c={c} />
      <HeatMap rt={rt} L={L} c={c} version={version} />
      <Bins rt={rt} L={L} c={c} version={version} />
      <Beacons rt={rt} L={L} version={version} />
      <Signage rt={rt} L={L} c={c} focus={focus} />
      <Routes rt={rt} query={query} />
      <PickerBot rt={rt} c={c} />
      <Cell lab={lab} sim={rt.sim} c={c} tip={rt.tip} />
      <Parts rt={rt} c={c} />
      <DetailBins rt={rt} c={c} />
    </>
  )
}

export const stopPoint = (L: Layout, i: number) => {
  const s = stopOf(L, i)
  return s.k === 'walk' ? [s.x, 0, s.zw] : [0, 0, 0]
}
