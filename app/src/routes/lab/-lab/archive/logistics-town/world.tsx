import { useFrame, useThree } from '@react-three/fiber'
import { Edges, Line, OrbitControls } from '@react-three/drei'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import type { ReactNode } from 'react'
import {
  BoxGeometry, BufferAttribute, BufferGeometry, Color, DynamicDrawUsage, Group, InstancedMesh, LineSegments, Matrix4, Mesh,
  MeshBasicMaterial, Object3D, PerspectiveCamera, Quaternion, Vector2, Vector3,
} from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'

import type { Lab } from '../../lab.types'
import { ACCENT, Box, FONT, cycleDatabase, cycleFramework, textTexture, tint } from './factory'
import type { Colors, Tip } from './factory'
import { CHIPS, inFlight } from './sim'
import type { Sim, Vehicle } from './sim'
import { BIN, FH, LOT, LOTS_X, LOTS_Z, P, PAD, ROADS_X, ROADS_Z, SLAB, UTILITIES, toWorld } from './town'
import type { Town } from './town'

export const AZ = 0.62
export const EL = 0.72

/** Everything the director panel controls. */
export type Knobs = {
  rig: 'tilt' | 'chase' | 'street'
  follow: boolean
  carrier: 'truck' | 'drone'
  time: 'theme' | 'day' | 'dusk' | 'night' | 'cycle'
  traffic: 'quiet' | 'busy' | 'rush'
  lens: boolean
}
export type Highlight = { matches: Set<number> | null; floor: number | null; building: number | null; drawer: { building: number; floor: number } | null }
export type Env = { night: number }

const dummy = new Object3D()
const v3 = new Vector3()

function segs(): { pos: number[]; push: (a: number[], b: number[]) => void; rect: (x0: number, z0: number, x1: number, z1: number, y: number) => void } {
  const pos: number[] = []
  const push = (a: number[], b: number[]) => pos.push(...a, ...b)
  const rect = (x0: number, z0: number, x1: number, z1: number, y: number) => {
    push([x0, y, z0], [x1, y, z0]); push([x1, y, z0], [x1, y, z1]); push([x1, y, z1], [x0, y, z1]); push([x0, y, z1], [x0, y, z0])
  }
  return { pos, push, rect }
}

function LineSet({ pos, color, opacity = 1 }: { pos: number[]; color: string; opacity?: number }) {
  const geo = useMemo(() => {
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
    return g
  }, [pos])
  return (
    <lineSegments geometry={geo}>
      <lineBasicMaterial color={color} transparent={opacity < 1} opacity={opacity} />
    </lineSegments>
  )
}

/** The diorama board: a thick base, lot curbs that read as roads between them, dashed center lines. */
export function Ground({ c }: { c: Colors }) {
  const { curbs, dashes } = useMemo(() => {
    const curbs = segs(), dashes = segs()
    for (const a of LOTS_X) for (const b of LOTS_Z) curbs.rect(a * P - LOT / 2, b * P - LOT / 2, a * P + LOT / 2, b * P + LOT / 2, 0.081)
    const zs = [ROADS_Z[0], ROADS_Z[ROADS_Z.length - 1]]
    for (const x of ROADS_X)
      for (let z = zs[0] + 1.6; z < zs[1] - 1; z += 1.4) {
        if (ROADS_Z.some((r) => Math.abs(r - z) < 1.6)) continue
        dashes.push([x, 0.02, z], [x, 0.02, z + 0.6])
      }
    const xs = [ROADS_X[0], ROADS_X[ROADS_X.length - 1]]
    for (const z of ROADS_Z)
      for (let x = xs[0] + 1.6; x < xs[1] - 1; x += 1.4) {
        if (ROADS_X.some((r) => Math.abs(r - x) < 1.6)) continue
        dashes.push([x, 0.02, z], [x + 0.6, 0.02, z])
      }
    return { curbs: curbs.pos, dashes: dashes.pos }
  }, [])
  const W = ROADS_X[ROADS_X.length - 1] * 2 + 6, D = ROADS_Z[ROADS_Z.length - 1] * 2 + 6
  return (
    <group>
      <Box size={[W, 1.6, D]} position={[0, -0.8, 0]} color={c.base} edge={c.edge} />
      {LOTS_X.flatMap((a) => LOTS_Z.map((b) => (
        <mesh key={`${a},${b}`} position={[a * P, 0.04, b * P]}>
          <boxGeometry args={[LOT, 0.08, LOT]} />
          <meshStandardMaterial color={c.lot} roughness={1} />
        </mesh>
      )))}
      <LineSet pos={curbs} color={c.edge} />
      <LineSet pos={dashes} color={c.faint} />
    </group>
  )
}

function shadedBox(w: number, h: number, d: number) {
  const g = new BoxGeometry(w, h, d).toNonIndexed()
  const n = g.getAttribute('normal')
  const col = new Float32Array(n.count * 3)
  for (let i = 0; i < n.count; i++) {
    const k = n.getY(i) > 0.5 ? 1 : n.getZ(i) > 0.5 ? 0.84 : n.getX(i) > 0.5 ? 0.72 : 0.66
    col.set([k, k, k], i * 3)
  }
  g.setAttribute('color', new BufferAttribute(col, 3))
  return g
}

/**
 * Every warehouse at once: one instanced mesh of bins (all 2,400 at viral
 * scale), one of floor slabs, one line set of frames with per-vertex color
 * for search and focus. Drawers slide one floor out to the street.
 */
export function Warehouses({ town, sim, lab, c, tip, hl, env, onPick }: {
  town: Town; sim: Sim; lab: Lab; c: Colors; tip: Tip; hl: Highlight; env: Env
  onPick: (building: number, floor: number | null) => void
}) {
  const bins = useRef<InstancedMesh>(null)
  const slabs = useRef<InstancedMesh>(null)
  const frames = useRef<LineSegments>(null)
  const hover = useRef<Mesh>(null)
  const hovered = useRef(-1)
  const drawerT = useRef(new Map<string, number>())
  const binGeo = useMemo(() => shadedBox(BIN.w, BIN.h, BIN.d), [])
  const binMat = useMemo(() => new MeshBasicMaterial({ vertexColors: true, toneMapped: false }), [])
  const slabIndex = useMemo(() => new Map(town.slabs.map((s, i) => [`${s.building}:${s.floor}`, i])), [town])

  const frame = useMemo(() => {
    const s = segs()
    const ranges: [number, number][] = []
    for (const b of town.buildings) {
      const start = s.pos.length / 3
      const x0 = b.cx - b.w / 2, x1 = b.cx + b.w / 2, z0 = b.cz - b.d / 2, z1 = b.cz + b.d / 2, H = b.floors * FH + SLAB
      for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) s.push([x, 0, z], [x, H, z])
      for (let f = 0; f <= b.floors; f++) s.rect(x0, z0, x1, z1, f * FH + SLAB)
      s.push([b.cx - 0.45, 0, z1 + 0.01], [b.cx - 0.45, 0.52, z1 + 0.01]); s.push([b.cx - 0.45, 0.52, z1 + 0.01], [b.cx + 0.45, 0.52, z1 + 0.01]); s.push([b.cx + 0.45, 0.52, z1 + 0.01], [b.cx + 0.45, 0, z1 + 0.01])
      ranges.push([start, s.pos.length / 3])
    }
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(new Float32Array(s.pos), 3))
    g.setAttribute('color', new BufferAttribute(new Float32Array(s.pos.length), 3))
    return { geo: g, ranges }
  }, [town])

  const shades = useMemo(() => {
    const out = new Map<number, Color>()
    for (const bin of town.bins) if (!out.has(bin.item.hue)) out.set(bin.item.hue, new Color(tint(bin.item.hue, c)))
    return out
  }, [town, c])
  const faded = useMemo(() => new Color(c.faint), [c])
  const lit = useMemo(() => new Color(ACCENT), [])
  const empty = useMemo(() => new Color(c.dark ? '#1D262B' : '#E1E7EA'), [c])

  const binVisible = (i: number) => {
    const bin = town.bins[i]
    if (hl.matches && !hl.matches.has(i)) return 'dim'
    if (hl.floor !== null && bin.floor !== hl.floor) return 'dim'
    if (hl.building !== null && hl.building !== bin.building && hl.matches === null && hl.floor === null) return 'dim'
    return hl.matches ? 'hi' : 'on'
  }
  const writeBin = (i: number) => {
    const bin = town.bins[i]
    const out = sim.parts.has(bin.item.ref)
    const slide = drawerT.current.get(`${bin.building}:${bin.floor}`) ?? 0
    dummy.position.copy(bin.pos)
    dummy.position.z += slide * town.buildings[bin.building].d * 0.95
    dummy.scale.set(1, out ? 0.12 : 1, 1)
    dummy.position.y -= out ? BIN.h * 0.44 : 0
    dummy.updateMatrix()
    bins.current!.setMatrixAt(i, dummy.matrix)
    const state = binVisible(i)
    const color = out ? empty : state === 'dim' ? faded : state === 'hi' ? v3c.copy(shades.get(bin.item.hue)!).lerp(lit, 0.7) : shades.get(bin.item.hue)!
    bins.current!.setColorAt(i, color)
  }
  const writeSlab = (i: number) => {
    const s = town.slabs[i]
    const b = town.buildings[s.building]
    const slide = drawerT.current.get(`${s.building}:${s.floor}`) ?? 0
    dummy.position.set(b.cx, s.floor * FH + SLAB / 2, b.cz + slide * b.d * 0.95)
    dummy.scale.set(b.w, SLAB, b.d)
    dummy.updateMatrix()
    slabs.current!.setMatrixAt(i, dummy.matrix)
  }

  useLayoutEffect(() => {
    for (let i = 0; i < town.bins.length; i++) writeBin(i)
    bins.current!.instanceMatrix.needsUpdate = true
    if (bins.current!.instanceColor) bins.current!.instanceColor.needsUpdate = true
    bins.current!.computeBoundingSphere()
    for (let i = 0; i < town.slabs.length; i++) writeSlab(i)
    slabs.current!.instanceMatrix.needsUpdate = true
    slabs.current!.computeBoundingSphere()
    const colors = frame.geo.getAttribute('color') as BufferAttribute
    const edge = new Color(c.edge), dim = new Color(c.faint)
    frame.ranges.forEach(([a, z], b) => {
      const has = hl.matches ? town.buildings[b].bins.some((i) => hl.matches!.has(i)) : null
      const focus = hl.building === b
      const col = focus || has ? lit : has === false || (hl.building !== null && !focus) ? dim : edge
      for (let i = a; i < z; i++) colors.setXYZ(i, col.r, col.g, col.b)
    })
    colors.needsUpdate = true
  })

  useFrame((_, dt) => {
    const mesh = bins.current!
    let touched = false
    if (sim.binsDirty.size) {
      for (const i of sim.binsDirty) writeBin(i)
      sim.binsDirty.clear()
      touched = true
    }
    const want = hl.drawer ? `${hl.drawer.building}:${hl.drawer.floor}` : null
    if (want && !drawerT.current.has(want)) drawerT.current.set(want, 0)
    for (const [key, t] of drawerT.current) {
      const goal = key === want ? 1 : 0
      const next = t + (goal - t) * (1 - Math.exp(-dt * 7))
      const done = Math.abs(goal - next) < 0.002
      drawerT.current.set(key, done ? goal : next)
      if (done && goal === 0) drawerT.current.delete(key)
      if (t === goal && done) continue
      const [b, f] = key.split(':').map(Number)
      for (const i of town.buildings[b].bins) if (town.bins[i].floor === f) writeBin(i)
      const si = slabIndex.get(key)
      if (si !== undefined) writeSlab(si)
      touched = true
      slabs.current!.instanceMatrix.needsUpdate = true
    }
    if (touched) {
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    }
    const k = 1 + env.night * (c.dark ? 0.5 : 0.35)
    binMat.color.setRGB(k, k * (1 - env.night * 0.06), k * (1 - env.night * 0.16))
    const h = hover.current!
    h.visible = hovered.current >= 0
    if (h.visible) {
      mesh.getMatrixAt(hovered.current, m4)
      m4.decompose(h.position, q4, v3)
    }
  })

  const binTip = (e: { nativeEvent: PointerEvent; instanceId?: number }) => {
    const i = e.instanceId ?? -1
    if (i < 0) return
    hovered.current = i
    const bin = town.bins[i]
    const b = town.buildings[bin.building]
    const on = lab.selected.has(bin.item.ref)
    tip.show(e.nativeEvent, bin.item.title, `${b.name} · floor ${bin.floor} ${town.floors[bin.floor].label} · ${on ? 'out for delivery, click to recall' : 'click to dispatch'}`, (lab.theme === 'dark' ? bin.item.imageDark : undefined) ?? bin.item.image)
  }
  return (
    <group>
      <instancedMesh
        ref={bins}
        args={[binGeo, binMat, town.bins.length]}
        onPointerMove={(e) => { e.stopPropagation(); binTip(e) }}
        onPointerOut={() => { hovered.current = -1; tip.hide() }}
        onClick={(e) => {
          e.stopPropagation()
          const i = e.instanceId ?? -1
          if (i < 0) return
          lab.toggle(town.bins[i].item.ref)
          tip.hide()
        }}
      />
      <instancedMesh
        ref={slabs}
        args={[undefined, undefined, town.slabs.length]}
        onClick={(e) => {
          e.stopPropagation()
          const s = town.slabs[e.instanceId ?? 0]
          const b = town.buildings[s.building]
          onPick(s.building, s.floor < b.floors && b.stocked.some((f) => f.floor === s.floor) ? s.floor : null)
        }}
        onPointerMove={(e) => {
          e.stopPropagation()
          const s = town.slabs[e.instanceId ?? 0]
          const b = town.buildings[s.building]
          const f = b.stocked.find((x) => x.floor === s.floor)
          tip.show(e.nativeEvent, b.name, f ? `Floor ${f.floor} · ${f.category.label} · ${f.count} in stock · click to pull out` : `${b.count.toLocaleString()} items · ${b.stocked.length} floors · click to visit`)
        }}
        onPointerOut={() => tip.hide()}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color={c.surface} roughness={1} />
      </instancedMesh>
      <lineSegments ref={frames} geometry={frame.geo}>
        <lineBasicMaterial vertexColors />
      </lineSegments>
      <mesh ref={hover} visible={false}>
        <boxGeometry args={[BIN.w + 0.08, BIN.h + 0.08, BIN.d + 0.08]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        <Edges color={ACCENT} />
      </mesh>
      <FloorBand town={town} floor={hl.floor} />
    </group>
  )
}
const v3c = new Color()
const m4 = new Matrix4()
const q4 = new Quaternion()

function FloorBand({ town, floor }: { town: Town; floor: number | null }) {
  const pos = useMemo(() => {
    if (floor === null) return null
    const s = segs()
    for (const b of town.buildings) {
      if (b.floors <= floor) continue
      const x0 = b.cx - b.w / 2 - 0.06, x1 = b.cx + b.w / 2 + 0.06, z0 = b.cz - b.d / 2 - 0.06, z1 = b.cz + b.d / 2 + 0.06
      s.rect(x0, z0, x1, z1, floor * FH + SLAB)
      s.rect(x0, z0, x1, z1, (floor + 1) * FH)
      for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) s.push([x, floor * FH + SLAB, z], [x, (floor + 1) * FH, z])
    }
    return s.pos
  }, [town, floor])
  return pos ? <LineSet pos={pos} color={ACCENT} /> : null
}

/** Sign posts on every roof; the sign faces are DOM labels placed by `Projector`. */
export function SignPosts({ town, c, hl }: { town: Town; c: Colors; hl: Highlight }) {
  const pos = useMemo(() => town.buildings.flatMap((b) => [b.cx, b.floors * FH + SLAB, b.cz, b.cx, b.floors * FH + SLAB + 1.1, b.cz]), [town])
  return <LineSet pos={pos} color={hl.matches ? ACCENT : c.edge} />
}

export type Anchors = Map<string, { pos: Vector3; el: HTMLElement | null }>

/** Places DOM labels over 3D anchors each frame: crisp text with no extra React roots. */
export function Projector({ anchors }: { anchors: Anchors }) {
  const { camera, size } = useThree()
  const p = useMemo(() => new Vector3(), [])
  useFrame(() => {
    for (const a of anchors.values()) {
      if (!a.el) continue
      p.copy(a.pos).project(camera)
      const show = p.z < 1 && Math.abs(p.x) < 1.3 && Math.abs(p.y) < 1.3
      a.el.style.visibility = show ? '' : 'hidden'
      if (show) a.el.style.transform = `translate(${((p.x + 1) / 2) * size.width}px, ${((1 - p.y) / 2) * size.height}px)`
    }
  })
  return null
}

/** Other people's apps: the small houses ambient trucks serve. */
export function Community({ town, c }: { town: Town; c: Colors }) {
  const trees = useMemo(() => {
    const out: [number, number, number][] = []
    town.communities.forEach((lot, k) => {
      for (let i = 0; i < 4; i++) out.push([lot.cx - 5 + ((i * 3.7 + k) % 10), 0.7 + ((i + k) % 3) * 0.25, lot.cz - 5.2 + (i % 2) * 9.6 - (i % 3) * 0.4])
    })
    for (let i = 0; i < 6; i++) out.push([-5.2 + (i % 3) * 2.2, 0.8, -P - 5.4 + Math.floor(i / 3) * 10.6])
    return out
  }, [town])
  const plots = useMemo(() => {
    const s = segs()
    for (const v of town.vacant) {
      const h = LOT / 2 - 0.9
      for (let t = -h; t < h; t += 0.9) {
        const e = Math.min(h, t + 0.5)
        s.push([v.cx + t, 0.09, v.cz - h], [v.cx + e, 0.09, v.cz - h]); s.push([v.cx + t, 0.09, v.cz + h], [v.cx + e, 0.09, v.cz + h])
        s.push([v.cx - h, 0.09, v.cz + t], [v.cx - h, 0.09, v.cz + e]); s.push([v.cx + h, 0.09, v.cz + t], [v.cx + h, 0.09, v.cz + e])
      }
      s.push([v.cx + 2.6, 0.09, v.cz + 2.2], [v.cx + 2.6, 1.3, v.cz + 2.2])
    }
    return s.pos
  }, [town])
  const lease = useMemo(
    () =>
      textTexture(512, 160, (ctx) => {
        ctx.fillStyle = c.surface
        ctx.fillRect(0, 0, 512, 160)
        ctx.strokeStyle = c.edge
        ctx.lineWidth = 4
        ctx.strokeRect(2, 2, 508, 156)
        ctx.fillStyle = c.muted
        ctx.font = `500 30px ${FONT}`
        ctx.fillText('PLOT AVAILABLE', 28, 58)
        ctx.fillStyle = c.fg
        ctx.font = `500 40px ${FONT}`
        ctx.fillText('Your registry here', 28, 118)
      }),
    [c],
  )
  return (
    <group>
      <LineSet pos={plots} color={c.edge} />
      {town.communities.map((lot) => (
        <mesh key={`g${lot.cx},${lot.cz}`} position={[lot.cx, 0.085, lot.cz]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[LOT - 0.6, LOT - 0.6]} />
          <meshStandardMaterial color={c.dark ? '#16211D' : '#EAF2EC'} roughness={1} />
        </mesh>
      ))}
      {town.vacant.map((v) => (
        <mesh key={`${v.cx},${v.cz}`} position={[v.cx + 2.6, 1.6, v.cz + 2.21]}>
          <planeGeometry args={[2.4, 0.75]} />
          <meshBasicMaterial map={lease} toneMapped={false} />
        </mesh>
      ))}
      {town.communities.flatMap((lot, k) =>
        lot.houses.map((h, i) => (
          <group key={`${k}-${i}`} position={[h.x, 0, h.z]}>
            <Box size={[h.w, h.h, h.d]} position={[0, h.h / 2 + 0.08, 0]} color={c.surface} edge={c.edge} />
            <mesh position={[0, h.h + 0.08 + 0.35, 0]} rotation={[0, 0, 0]} scale={[h.w / 2, 0.7, h.d / 1.7]}>
              <cylinderGeometry args={[0.001, 1, 1, 4, 1]} />
              <meshStandardMaterial color={c.surface} roughness={1} />
              <Edges color={c.edge} />
            </mesh>
          </group>
        )),
      )}
      {trees.map(([x, h, z], i) => (
        <group key={i} position={[x, 0.08, z]}>
          <mesh position={[0, h / 2 + 0.2, 0]}>
            <coneGeometry args={[0.42, h, 5]} />
            <meshStandardMaterial color={c.dark ? '#1D2A26' : '#E4EEE9'} roughness={1} />
            <Edges color={c.edge} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

function catenary(a: Vector3, b: Vector3, sag: number) {
  return Array.from({ length: 17 }, (_, i) => {
    const t = i / 16
    return a.clone().lerp(b, t).add(new Vector3(0, -sag * 4 * t * (1 - t), 0)).toArray() as [number, number, number]
  })
}

/** The factory district's utilities: framework is the power plant, database the water tower. Click either to rebuild it. */
export function Utilities({ lab, c, tip }: { lab: Lab; c: Colors; tip: Tip }) {
  const plant = new Vector3(UTILITIES.x - 3.2, 0, UTILITIES.z + 0.5)
  const tower = new Vector3(UTILITIES.x + 3.6, 0, UTILITIES.z + 0.5)
  const fw = toWorld(CHIPS.framework).setY(0.5)
  const db = toWorld(CHIPS.database).setY(0.5)
  const pylonA = new Vector3(plant.x + 1.2, 3.6, -7.2)
  const pylonB = new Vector3(fw.x, 3.2, -4.2)
  const pulses = useRef<(Mesh | null)[]>([])
  const cables = useMemo(() => [catenary(new Vector3(plant.x + 0.8, 3.2, plant.z + 1), pylonA, 0.5), catenary(pylonA, pylonB, 0.7), catenary(pylonB, fw, 0.5)].flat(), [])
  const pipe: [number, number, number][] = [[tower.x, 0.5, tower.z + 1.2], [tower.x, 0.5, -6.4], [db.x, 0.5, -6.4], [db.x, 0.5, db.z]]
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    pulses.current.forEach((m, i) => {
      if (!m) return
      const path = i === 0 ? cables : pipe
      const u = ((t * 0.35 + i * 0.5) % 1) * (path.length - 1)
      const k = Math.floor(u)
      const a = path[k], b = path[Math.min(path.length - 1, k + 1)]
      m.position.set(a[0] + (b[0] - a[0]) * (u - k), a[1] + (b[1] - a[1]) * (u - k), a[2] + (b[2] - a[2]) * (u - k))
    })
  })
  const label = (title: string, value: string) =>
    textTexture(520, 130, (ctx) => {
      ctx.fillStyle = c.surface
      ctx.fillRect(0, 0, 520, 130)
      ctx.strokeStyle = c.edge
      ctx.lineWidth = 4
      ctx.strokeRect(2, 2, 516, 126)
      ctx.fillStyle = c.muted
      ctx.font = `500 28px ${FONT}`
      ctx.fillText(title, 24, 46)
      ctx.fillStyle = c.fg
      ctx.font = `500 46px ${FONT}`
      ctx.fillText(value, 24, 102)
    })
  const fwTex = useMemo(() => label('POWER · FRAMEWORK', lab.setup.framework === 'next' ? 'Next.js' : 'TanStack Start'), [lab.setup.framework, c])
  const dbTex = useMemo(() => label('WATER · DATABASE', lab.setup.database === 'postgres' ? 'PostgreSQL' : 'MongoDB'), [lab.setup.database, c])
  const hit = (key: 'framework' | 'database') => ({
    onClick: (e: { stopPropagation: () => void }) => { e.stopPropagation(); if (key === 'framework') cycleFramework(lab); else cycleDatabase(lab) },
    onPointerOver: (e: { stopPropagation: () => void; nativeEvent: PointerEvent }) => {
      e.stopPropagation()
      tip.show(e.nativeEvent, key === 'framework' ? 'Power plant' : 'Water tower', key === 'framework' ? 'Powers the framework chip. Click to rebuild as the other framework' : 'Feeds the database chip. Click to rebuild as the other database')
    },
    onPointerMove: (e: { nativeEvent: PointerEvent }) => tip.move(e.nativeEvent),
    onPointerOut: () => tip.hide(),
  })
  return (
    <group>
      <group position={plant.toArray()} {...hit('framework')}>
        <Rebuild key={lab.setup.framework} size={[5, 6.5, 4]}>
          {lab.setup.framework === 'next' ? <CoolingTower c={c} /> : <TurbineStack c={c} />}
        </Rebuild>
        <mesh position={[0, 0.9, 2.6]}>
          <planeGeometry args={[3.6, 0.9]} />
          <meshBasicMaterial map={fwTex} toneMapped={false} />
        </mesh>
      </group>
      <group position={tower.toArray()} {...hit('database')}>
        <Rebuild key={lab.setup.database} size={[3, 7, 3]}>
          {lab.setup.database === 'postgres' ? <TankTower c={c} /> : <SphereTower c={c} />}
        </Rebuild>
        <mesh position={[0, 0.9, 2.2]}>
          <planeGeometry args={[3.6, 0.9]} />
          <meshBasicMaterial map={dbTex} toneMapped={false} />
        </mesh>
      </group>
      {[pylonA, pylonB].map((p, i) => (
        <Line key={i} points={[[p.x - 0.4, 0, p.z], [p.x, p.y + 0.3, p.z], [p.x + 0.4, 0, p.z], [p.x - 0.2, p.y * 0.5, p.z], [p.x + 0.2, p.y * 0.5, p.z], [p.x - 0.5, p.y, p.z], [p.x + 0.5, p.y, p.z]]} color={c.edge} lineWidth={1} />
      ))}
      <Line points={cables} color={c.edge} lineWidth={1} />
      <Line points={pipe} color={c.edge} lineWidth={2.4} />
      {[0, 1].map((i) => (
        <mesh key={i} ref={(m) => { pulses.current[i] = m }}>
          <sphereGeometry args={[0.13, 10, 10]} />
          <meshBasicMaterial color={i === 0 ? '#F2C14E' : ACCENT} toneMapped={false} />
        </mesh>
      ))}
    </group>
  )
}

/** Swapping a utility tears it down to scaffolding and grows the new one back. */
function Rebuild({ size, children }: { size: [number, number, number]; children: ReactNode }) {
  const g = useRef<Group>(null)
  const scaffold = useRef<Group>(null)
  const t = useRef(0)
  useFrame((_, dt) => {
    t.current = Math.min(1, t.current + dt / 1.4)
    const e = 1 - Math.pow(1 - t.current, 3)
    g.current!.scale.set(1, Math.max(0.001, e), 1)
    scaffold.current!.visible = t.current < 1
    scaffold.current!.scale.set(1, Math.min(1, t.current * 3), 1)
  })
  const pts = useMemo(() => {
    const s = segs()
    const [w, h, d] = size
    for (let y = 0; y <= h; y += 1) s.rect(-w / 2, -d / 2, w / 2, d / 2, y)
    for (const [x, z] of [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2]]) s.push([x, 0, z], [x, h, z])
    for (let y = 0; y < h; y += 1) s.push([-w / 2, y, d / 2], [w / 2, y + 1, d / 2])
    return s.pos
  }, [size])
  return (
    <>
      <group ref={g}>{children}</group>
      <group ref={scaffold}>
        <LineSet pos={pts} color={ACCENT} opacity={0.7} />
      </group>
      <mesh visible={false} position={[0, size[1] / 2, 0]}>
        <boxGeometry args={size} />
      </mesh>
    </>
  )
}

function CoolingTower({ c }: { c: Colors }) {
  const pts = useMemo(() => Array.from({ length: 9 }, (_, i) => {
    const y = (i / 8) * 6
    const r = 1.2 + 0.9 * Math.pow((y - 4.2) / 4.2, 2)
    return new Vector3(r, y, 0)
  }).map((p) => [p.x, p.y] as [number, number]), [])
  return (
    <group>
      <mesh position={[0.6, 0, 0]}>
        <latheGeometry args={[pts.map(([x, y]) => new Vector2(x, y)), 24]} />
        <meshStandardMaterial color={c.surface} roughness={1} />
        <Edges color={c.edge} threshold={8} />
      </mesh>
      <Box size={[1.8, 1.6, 2.4]} position={[-1.6, 0.8, 0.4]} color={c.surface} edge={c.edge} />
      <mesh position={[-1.6, 2.6, 0.4]}>
        <cylinderGeometry args={[0.18, 0.22, 2.2, 12]} />
        <meshStandardMaterial color={c.surface} roughness={1} />
        <Edges color={c.edge} threshold={20} />
      </mesh>
    </group>
  )
}

function TurbineStack({ c }: { c: Colors }) {
  return (
    <group>
      <Box size={[4.4, 1.8, 3]} position={[0, 0.9, 0]} color={c.surface} edge={c.edge} />
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i} position={[0.8, 2.1 + i * 0.75, 0]}>
          <cylinderGeometry args={[1.2 - i * 0.18, 1.25 - i * 0.18, 0.6, 28]} />
          <meshStandardMaterial color={c.surface} roughness={1} />
          <Edges color={i === 3 ? '#F2C14E' : c.edge} threshold={20} />
        </mesh>
      ))}
      <Box size={[0.5, 4.5, 0.5]} position={[-1.6, 2.25, -0.8]} color={c.surface} edge={c.edge} />
    </group>
  )
}

function TankTower({ c }: { c: Colors }) {
  return (
    <group>
      {[[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]].map(([x, z]) => (
        <Line key={`${x}${z}`} points={[[x * 1.1, 0, z * 1.1], [x * 0.8, 4.2, z * 0.8]]} color={c.edge} lineWidth={1} />
      ))}
      <Line points={[[-0.95, 2, -0.95], [0.95, 2, 0.95], [0.95, 2, -0.95], [-0.95, 2, 0.95]]} segments color={c.edge} lineWidth={1} />
      <mesh position={[0, 5.1, 0]}>
        <cylinderGeometry args={[1.4, 1.4, 1.9, 32]} />
        <meshStandardMaterial color={c.surface} roughness={1} />
        <Edges color={c.edge} threshold={20} />
      </mesh>
      <mesh position={[0, 6.4, 0]}>
        <coneGeometry args={[1.5, 0.7, 32]} />
        <meshStandardMaterial color={c.surface} roughness={1} />
        <Edges color={ACCENT} threshold={20} />
      </mesh>
    </group>
  )
}

function SphereTower({ c }: { c: Colors }) {
  return (
    <group>
      <mesh position={[0, 2.2, 0]}>
        <cylinderGeometry args={[0.35, 0.5, 4.4, 16]} />
        <meshStandardMaterial color={c.surface} roughness={1} />
        <Edges color={c.edge} threshold={20} />
      </mesh>
      <mesh position={[0, 5.2, 0]} scale={[1, 1.15, 1]}>
        <sphereGeometry args={[1.5, 24, 12]} />
        <meshStandardMaterial color={c.surface} roughness={1} />
        <Edges color={'#6BAF6B'} threshold={14} />
      </mesh>
    </group>
  )
}

/** A registry truck or cargo drone on a delivery. The followed one wears the accent. */
export function Carrier({ v, sim, c, followed, env }: { v: Vehicle; sim: Sim; c: Colors; followed: boolean; env: Env }) {
  const g = useRef<Group>(null)
  const lights = useRef<Mesh>(null)
  const rotors = useRef<(Group | null)[]>([])
  useFrame((_, dt) => {
    const grp = g.current!
    grp.visible = sim.time >= v.depart
    grp.position.copy(v.pos)
    grp.rotation.y = v.yaw
    if (lights.current) lights.current.visible = env.night > 0.35
    rotors.current.forEach((r) => r && (r.rotation.y += dt * 40))
  })
  const edge = followed ? ACCENT : c.edge
  if (v.kind === 'drone')
    return (
      <group ref={g}>
        <Box size={[0.7, 0.18, 0.7]} color={c.surface} edge={edge} />
        {[[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]].map(([x, z], i) => (
          <group key={i} position={[x, 0.1, z]} ref={(r) => { rotors.current[i] = r }}>
            <Line points={[[-0.3, 0, 0], [0.3, 0, 0]]} color={edge} lineWidth={1.2} />
            <Line points={[[0, 0, -0.3], [0, 0, 0.3]]} color={edge} lineWidth={1.2} />
          </group>
        ))}
        <Line points={[[0, -0.09, 0], [0, -0.2, 0]]} color={edge} lineWidth={1} />
        <mesh ref={lights} position={[0, -0.12, 0]}>
          <sphereGeometry args={[0.08, 8, 8]} />
          <meshBasicMaterial color="#FFE2A8" toneMapped={false} />
        </mesh>
      </group>
    )
  return (
    <group ref={g}>
      <Box size={[0.42, 0.5, 0.56]} position={[0.5, 0.36, 0]} color={c.surface} edge={edge} />
      <Box size={[0.9, 0.12, 0.56]} position={[-0.18, 0.35, 0]} color={c.surface} edge={edge} />
      <Box size={[1.3, 0.1, 0.5]} position={[0.05, 0.2, 0]} color={c.surface} edge={c.edge} />
      {[[-0.4, 0.27], [-0.4, -0.27], [0.45, 0.27], [0.45, -0.27]].map(([x, z]) => (
        <mesh key={`${x}${z}`} position={[x, 0.13, z]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.13, 0.13, 0.06, 12]} />
          <meshStandardMaterial color={c.surface} roughness={1} />
          <Edges color={c.edge} threshold={30} />
        </mesh>
      ))}
      <mesh ref={lights} position={[0.75, 0.3, 0]}>
        <boxGeometry args={[0.05, 0.08, 0.44]} />
        <meshBasicMaterial color="#FFE2A8" toneMapped={false} />
      </mesh>
    </group>
  )
}

/** Community traffic: instanced fills plus one dynamic line set for every box edge. */
export function Traffic({ sim, c, env }: { sim: Sim; c: Colors; env: Env }) {
  const fills = useRef<InstancedMesh>(null)
  const heads = useRef<InstancedMesh>(null)
  const lines = useRef<LineSegments>(null)
  const MAX = 90
  const edgeGeo = useMemo(() => {
    const g = new BufferGeometry()
    const attr = new BufferAttribute(new Float32Array(MAX * 24 * 3), 3)
    attr.setUsage(DynamicDrawUsage)
    g.setAttribute('position', attr)
    g.setDrawRange(0, 0)
    return g
  }, [])
  const corners = useMemo(() => {
    const out: Vector3[] = []
    for (const x of [-0.5, 0.5]) for (const y of [0, 0.55]) for (const z of [-0.26, 0.26]) out.push(new Vector3(x, y, z))
    return out
  }, [])
  const hue = useMemo(() => new Color(), [])
  const pairs = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]]
  useLayoutEffect(() => {
    const f = fills.current!
    for (let i = 0; i < MAX; i++) f.setColorAt(i, hue.setHSL(((i * 137.5) % 360) / 360, c.dark ? 0.3 : 0.42, c.dark ? 0.42 : 0.72))
    f.instanceColor!.needsUpdate = true
  }, [c])
  useFrame(() => {
    const f = fills.current!, h = heads.current!
    const attr = edgeGeo.getAttribute('position') as BufferAttribute
    const n = Math.min(MAX, sim.ambient.length)
    const tmp = new Vector3()
    for (let i = 0; i < n; i++) {
      const a = sim.ambient[i]
      dummy.position.copy(a.pos)
      if (a.drone) dummy.position.y = a.pos.y
      dummy.rotation.set(0, a.yaw, 0)
      dummy.scale.set(a.drone ? 0.6 : 1, a.drone ? 0.35 : 1, a.drone ? 1.1 : 1)
      dummy.updateMatrix()
      f.setMatrixAt(i, dummy.matrix)
      const world = dummy.matrix
      pairs.forEach(([p, q], k) => {
        tmp.copy(corners[p]).applyMatrix4(world)
        attr.setXYZ(i * 24 + k * 2, tmp.x, tmp.y, tmp.z)
        tmp.copy(corners[q]).applyMatrix4(world)
        attr.setXYZ(i * 24 + k * 2 + 1, tmp.x, tmp.y, tmp.z)
      })
      dummy.position.set(0.52, 0.22, 0)
      dummy.rotation.set(0, 0, 0)
      dummy.scale.set(1, 1, 1)
      dummy.updateMatrix()
      dummy.matrix.premultiply(world)
      h.setMatrixAt(i, dummy.matrix)
    }
    f.count = n
    h.count = env.night > 0.35 ? n : 0
    f.instanceMatrix.needsUpdate = true
    h.instanceMatrix.needsUpdate = true
    attr.needsUpdate = true
    edgeGeo.setDrawRange(0, n * 24)
  })
  return (
    <group>
      <instancedMesh ref={fills} args={[undefined, undefined, MAX]} frustumCulled={false}>
        <boxGeometry args={[1, 0.55, 0.52]} />
        <meshStandardMaterial color="#ffffff" roughness={1} />
      </instancedMesh>
      <instancedMesh ref={heads} args={[undefined, undefined, MAX]} frustumCulled={false}>
        <boxGeometry args={[0.04, 0.08, 0.4]} />
        <meshBasicMaterial color="#FFE2A8" toneMapped={false} />
      </instancedMesh>
      <lineSegments ref={lines} geometry={edgeGeo} frustumCulled={false}>
        <lineBasicMaterial color={c.edge} />
      </lineSegments>
    </group>
  )
}

/** Street lamps: dark by day, warm pools by night. */
export function Lamps({ env }: { env: Env }) {
  const ref = useRef<InstancedMesh>(null)
  const pts = useMemo(() => {
    const out: Vector3[] = []
    for (const x of ROADS_X) for (const z of ROADS_Z) out.push(new Vector3(x + 1.6, 1.4, z + 1.6), new Vector3(x - 1.6, 1.4, z - 1.6))
    return out
  }, [])
  useLayoutEffect(() => {
    pts.forEach((p, i) => {
      dummy.position.copy(p)
      dummy.rotation.set(0, 0, 0)
      dummy.scale.setScalar(1)
      dummy.updateMatrix()
      ref.current!.setMatrixAt(i, dummy.matrix)
    })
    ref.current!.instanceMatrix.needsUpdate = true
  }, [pts])
  useFrame(() => {
    ref.current!.visible = env.night > 0.3
  })
  const posts = useMemo(() => pts.flatMap((p) => [p.x, 0, p.z, p.x, p.y, p.z]), [pts])
  return (
    <group>
      <LineSet pos={posts} color="#8A9094" opacity={0.6} />
      <instancedMesh ref={ref} args={[undefined, undefined, pts.length]}>
        <sphereGeometry args={[0.16, 8, 8]} />
        <meshBasicMaterial color="#FFD58A" toneMapped={false} />
      </instancedMesh>
    </group>
  )
}

/** Sky and light: the time-of-day knob drives background, light and how much the windows glow. */
export function Sky({ knobs, c, env }: { knobs: Knobs; c: Colors; env: Env }) {
  const { scene } = useThree()
  const amb = useRef<{ intensity: number }>(null)
  const sun = useRef<{ intensity: number; position: Vector3 }>(null)
  const day = useMemo(() => new Color(c.bg), [c])
  const night = useMemo(() => new Color(c.dark ? '#04070A' : '#1B2731'), [c])
  const dusk = useMemo(() => new Color(c.dark ? '#1C1410' : '#E9CDB0'), [c])
  const bg = useMemo(() => new Color(), [])
  useFrame(({ clock }, dt) => {
    const goal =
      knobs.time === 'cycle' ? (1 - Math.cos((clock.elapsedTime / 36) * Math.PI * 2)) / 2
      : knobs.time === 'night' ? 1 : knobs.time === 'dusk' ? 0.5 : knobs.time === 'day' ? 0 : c.dark ? 0.85 : 0
    env.night += (goal - env.night) * (1 - Math.exp(-dt * (knobs.time === 'cycle' ? 20 : 3)))
    const n = env.night
    const warm = 4 * n * (1 - n)
    bg.copy(day).lerp(night, n).lerp(dusk, warm * 0.55)
    scene.background = bg
    if (amb.current) amb.current.intensity = (c.dark ? 0.9 : 1.6) * (1 - 0.6 * n)
    if (sun.current) {
      sun.current.intensity = (c.dark ? 0.9 : 1.4) * (1 - 0.7 * n)
      sun.current.position.set(20 - 40 * n, 30, 14)
    }
  })
  return (
    <>
      <ambientLight ref={amb as never} intensity={1.4} />
      <directionalLight ref={sun as never} position={[20, 30, 14]} intensity={1.4} />
      <hemisphereLight args={[c.surface, c.bg, 0.5]} />
    </>
  )
}

export type CamRequest = { seq: number; kind: 'overview' } | { seq: number; kind: 'pose'; target: Vector3; dist: number; az: number; el: number }

const OVERVIEW = new Vector3(0, 3, 0)
const dirOf = (az: number, el: number) => new Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el))

/**
 * One camera, three behaviors. Focus requests and the overview damp to a
 * pose then hand control back. Follow chases the newest delivery with the
 * chosen rig, frames the whole convoy when several are on the road, holds on
 * the board while the arm seats the part, then returns to the overview. Any
 * drag or wheel hands control to the user until the next dispatch.
 */
export function CameraRig({ sim, knobs, request, lab, onMode, inset }: { sim: Sim; knobs: Knobs; request: CamRequest; lab: Lab; onMode: (m: string) => void; inset: number }) {
  const controls = useRef<OrbitControlsImpl>(null)
  const { camera, size } = useThree()
  const mode = useRef<'free' | 'pose' | 'follow'>('pose')
  const goalPos = useRef(new Vector3())
  const goalTarget = useRef(new Vector3())
  const lambda = useRef(2)
  const seenSeq = useRef(sim.followSeq)
  const seenReq = useRef(-1)
  const reported = useRef('')
  const tans = () => {
    const vf = 24 * (Math.PI / 180)
    const tanV = Math.tan(vf / 2)
    return { tanV, tanH: tanV * ((size.width - inset) / size.height) }
  }
  const overviewDist = () => {
    const { tanV, tanH } = tans()
    const dir = dirOf(AZ, EL)
    const right = new Vector3(Math.cos(AZ), 0, -Math.sin(AZ))
    const up = new Vector3().crossVectors(right, dir).normalize()
    let need = 0
    for (const x of [-34, 34]) for (const y of [0, 15]) for (const z of [-27, 25]) {
      const p = new Vector3(x, y, z).sub(OVERVIEW)
      need = Math.max(need, Math.abs(p.dot(right)) / tanH + p.dot(dir), Math.abs(p.dot(up)) / tanV + p.dot(dir))
    }
    return need * 0.98
  }
  const setPose = (target: Vector3, dist: number, az = AZ, el = EL) => {
    goalTarget.current.copy(target)
    goalPos.current.copy(target).addScaledVector(dirOf(az, el), dist)
  }
  const overview = () => setPose(OVERVIEW, overviewDist())

  useEffect(() => {
    if (request.seq === seenReq.current) return
    const first = seenReq.current === -1
    seenReq.current = request.seq
    if (request.kind === 'overview') overview()
    else setPose(request.target, request.dist, request.az, request.el)
    lambda.current = 2.2
    mode.current = 'pose'
    if (first) {
      camera.position.copy(goalPos.current).addScaledVector(dirOf(AZ, EL), overviewDist() * 0.6)
      controls.current?.target.copy(goalTarget.current)
    }
  }, [request])

  useFrame((_, dt) => {
    const ctl = controls.current
    if (!ctl) return
    let fov = 24
    const cam = camera as PerspectiveCamera
    const aspect = (size.width + inset) / size.height
    if (Math.abs(cam.aspect - aspect) > 1e-4 || (cam.view?.offsetX ?? 0) !== inset) {
      cam.aspect = aspect
      if (inset > 0) cam.setViewOffset(size.width + inset, size.height, inset, 0, size.width, size.height)
      else cam.clearViewOffset()
      cam.updateProjectionMatrix()
    }
    if (sim.followSeq !== seenSeq.current) {
      seenSeq.current = sim.followSeq
      if (knobs.follow) mode.current = 'follow'
    }
    if (mode.current === 'follow') {
      const part = sim.follow
      const flying = inFlight(sim)
      if (!knobs.follow || !part || !sim.parts.has(part.ref)) {
        overview()
        lambda.current = 1.6
        mode.current = flying.length ? 'follow' : 'pose'
        if (flying.length) sim.follow = flying[flying.length - 1].cargo
      } else if (flying.length >= 2) {
        const center = new Vector3()
        for (const v of flying) center.add(v.pos)
        center.add(PAD).divideScalar(flying.length + 1)
        let spread = 0
        for (const v of flying) spread = Math.max(spread, v.pos.distanceTo(center))
        setPose(center, Math.min(overviewDist(), spread * 2.4 + 22), AZ, 0.7)
        lambda.current = 1.5
      } else if (part.where === 'truck' && part.vehicle) {
        const v = part.vehicle
        const fwd = v3.set(Math.cos(v.yaw), 0, -Math.sin(v.yaw))
        if (sim.time < v.depart) {
          setPose(sim.town.buildings[v.building].door, 40)
          lambda.current = 2
        } else if (knobs.rig === 'chase') {
          const side = new Vector3(-fwd.z, 0, fwd.x)
          goalTarget.current.copy(v.pos).addScaledVector(fwd, 3).add(new Vector3(0, 0.3, 0))
          goalPos.current.copy(v.pos).addScaledVector(fwd, -11).addScaledVector(side, -5).add(new Vector3(0, 14, 0))
          lambda.current = 3.2
        } else if (knobs.rig === 'street') {
          goalTarget.current.copy(v.pos).addScaledVector(fwd, 10).setY(v.kind === 'drone' ? v.pos.y - 0.4 : 0.45)
          goalPos.current.copy(v.pos).addScaledVector(fwd, -3.4).add(new Vector3(0, 1.15, 0))
          fov = 58
          lambda.current = 4.5
        } else {
          setPose(v.pos, 48)
          lambda.current = 2.4
        }
      } else if (part.where === 'board' && lab.selected.has(part.ref) && sim.time - part.seatedAt > 1.8) {
        overview()
        lambda.current = 1.4
        mode.current = 'pose'
      } else {
        setPose(v3.copy(part.pos).lerp(toWorld(new Vector3(6, 0, 0)), 0.5), 30, AZ - 0.15, 0.85)
        lambda.current = 2.2
      }
    }
    if (Math.abs(cam.fov - fov) > 0.05) {
      cam.fov += (fov - cam.fov) * (1 - Math.exp(-dt * 3))
      cam.updateProjectionMatrix()
    }
    if (mode.current !== 'free') {
      const k = 1 - Math.exp(-dt * lambda.current)
      const far = camera.position.distanceTo(goalPos.current)
      camera.position.lerp(v3.copy(goalPos.current).setY(goalPos.current.y + Math.min(18, Math.max(0, far - 4) * 0.4)), k)
      ctl.target.lerp(goalTarget.current, k)
      if (mode.current === 'pose' && far < 0.08) mode.current = 'free'
    }
    const label = mode.current === 'follow' ? (inFlight(sim).length >= 2 ? 'convoy' : knobs.rig) : mode.current === 'pose' ? 'gliding' : 'free'
    if (label !== reported.current) {
      reported.current = label
      onMode(label)
    }
  })
  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      dampingFactor={0.12}
      minDistance={2}
      maxDistance={420}
      maxPolarAngle={1.5}
      onStart={() => { mode.current = 'free' }}
    />
  )
}
