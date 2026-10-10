import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Float32BufferAttribute, Matrix4, Vector3 } from 'three'
import type { BufferAttribute, Group, InstancedMesh, LineSegments as ThreeLineSegments, MeshBasicMaterial, Points } from 'three'

import type { CatalogItem, CategoryId } from '@/routes/workspace/-workspace/workspace.types'
import type { ChipVariant, Ghost, Part, Route, Sim, Tokens } from '../../../core/contract'
import { sampleRoute } from '../../../core/route'
import { TraceLine } from '../../../core/scene'
import { reducedMotion } from '../../../core/three'
import { BANDS } from './pack'

/** The catalog-shaped stand-in for a block the existing app already owns. */
const ghostItem = (g: Ghost): CatalogItem => {
  const group = BANDS[g.band].groups[0]
  return {
    ref: `your-app/${g.title.replace(/ /g, '-')}`, name: g.title, title: `existing ${g.title}`, description: 'Already in your app; the toolkit leaves it untouched.',
    kind: 'block', source: 'your-app', category: `block:${group}` as CategoryId, label: BANDS[g.band].label.toLowerCase(), hue: 210,
  }
}

/** An existing app's blocks, dropped in as hatched, owned packages. */
export function Ghosts({ sim, c, chip, version }: { sim: Sim; c: Tokens; chip: ChipVariant; version: number }) {
  const groups = useRef<(Group | null)[]>([])
  const born = useRef(new Map<string, number>())
  const marks = useMemo(
    () => sim.plan.ghosts.map((g) => chip.marking(ghostItem(g), 'OWNED', g.spec, { body: c.ghost, ink: c.muted })),
    [version, c.ghost, c.muted, chip],
  )
  useEffect(() => () => marks.forEach((m) => m.dispose()), [marks])
  useFrame(({ clock }) => {
    sim.plan.ghosts.forEach((g, i) => {
      const grp = groups.current[i]
      if (!grp) return
      if (!born.current.has(g.title)) born.current.set(g.title, clock.elapsedTime + i * 0.12)
      const t = Math.min(1, Math.max(0, (clock.elapsedTime - born.current.get(g.title)!) / 0.6))
      grp.position.set(g.slot.x, g.slot.y + (1 - t * t) * 2.5, g.slot.z)
      grp.scale.setScalar(g.slot.s)
    })
  })
  const Package = chip.Package
  return (
    <>
      {sim.plan.ghosts.map((g, i) => (
        <group key={`${g.title}${i}`} ref={(r) => { groups.current[i] = r }}>
          <Package spec={g.spec} top={marks[i] ?? null} c={c} ghost />
        </group>
      ))}
    </>
  )
}

/** Each placed part's trace, drawn as it seats, with a hot head and its vias. `colorOf` tints a trace per part. */
export function Routes({ sim, c, version, colorOf, width = 1.7 }: { sim: Sim; c: Tokens; version: number; colorOf?: (p: Part) => string; width?: number }) {
  const list = useMemo(() => sim.list.filter((p) => p.route), [version, sim])
  const heads = useRef<InstancedMesh>(null)
  const vias = useRef<InstancedMesh>(null)
  const tmp = useMemo(() => ({ m: new Matrix4(), v: new Vector3(), s: new Vector3() }), [])
  useFrame(() => {
    let h = 0, v = 0
    for (const p of sim.list) {
      if (!p.route || p.mode !== 'seated') continue
      if (p.drawn < 1 && h < 6 && heads.current) {
        sampleRoute(p.route, p.drawn, tmp.v)
        heads.current.setMatrixAt(h++, tmp.m.makeScale(1, 1, 1).setPosition(tmp.v))
      }
      for (const via of p.route.vias) {
        if (!vias.current || v >= 400) break
        const k = p.route.pts.findIndex((q) => q.distanceToSquared(via) < 0.004)
        const on = p.drawn >= (k < 0 ? 1 : k / p.route.pts.length)
        vias.current.setMatrixAt(v++, tmp.m.makeTranslation(via.x, via.y + 0.003, via.z).scale(tmp.s.setScalar(on ? 1 : 0)))
      }
    }
    if (heads.current) {
      heads.current.count = h
      heads.current.instanceMatrix.needsUpdate = true
    }
    if (vias.current) {
      vias.current.count = v
      vias.current.instanceMatrix.needsUpdate = true
    }
  })
  return (
    <>
      {list.map((p) => (
        <TraceLine key={`${p.item.ref}-${p.route!.len.toFixed(3)}-${p.route!.pts.length}`} route={p.route!} color={colorOf ? colorOf(p) : c.lit} width={width} progress={() => (p.mode === 'seated' ? p.drawn : 0)} />
      ))}
      <instancedMesh ref={heads} args={[undefined, undefined, 6]} frustumCulled={false}>
        <sphereGeometry args={[0.07, 10, 10]} />
        <meshBasicMaterial color={c.spark} toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={vias} args={[undefined, undefined, 400]} frustumCulled={false}>
        <cylinderGeometry args={[0.07, 0.07, 0.006, 16]} />
        <meshBasicMaterial color={c.pin} />
      </instancedMesh>
    </>
  )
}

/** Fixed buses a board pulses along: `data` both ways, `power` outward. */
export type Statics = { power: Route[]; memory: Route[] }

type Pulse = { route: Route; t: number; speed: number }
/** Signal pulses: a burst down each new seat's trace, a trickle on live traces, and the board's fixed buses. */
export function Pulses({ sim, c, statics, lift = 0.02 }: { sim: Sim; c: Tokens; statics: Statics; lift?: number }) {
  const N = 600, P = 160
  const data = useRef<Points>(null)
  const power = useRef<Points>(null)
  const state = useMemo(() => ({ data: [] as Pulse[], power: [] as Pulse[], dataPos: new Float32Array(N * 3), powerPos: new Float32Array(P * 3) }), [])
  const seen = useRef(-1)
  const tmp = useMemo(() => new Vector3(), [])
  useFrame((_, dt) => {
    if (sim.lastSeatAt !== seen.current && sim.lastSeat?.route) {
      seen.current = sim.lastSeatAt
      for (let k = 0; k < 4; k++) state.data.push({ route: sim.lastSeat.route, t: -k * 0.12 - 0.6, speed: 1.1 })
    }
    if (!reducedMotion) {
      for (const p of sim.list) {
        if (p.mode !== 'seated' || !p.route || p.drawn < 1) continue
        if (Math.random() < dt * 0.55 && state.data.length < N) state.data.push({ route: p.route, t: 0, speed: 6 / p.route.len })
      }
      for (const r of statics.memory) if (Math.random() < dt * 1.4 && state.data.length < N) state.data.push({ route: r, t: 0, speed: Math.random() < 0.5 ? 1.6 : -1.6 })
      for (const r of statics.power) if (Math.random() < dt * 2 && state.power.length < P) state.power.push({ route: r, t: 0, speed: 0.9 })
    }
    const run = (list: Pulse[], arr: Float32Array, cap: number, pts: Points | null) => {
      let w = 0, keep = 0
      for (let i = 0; i < list.length; i++) {
        const pulse = list[i]
        pulse.t += pulse.speed * dt
        const t = pulse.speed < 0 ? 1 + pulse.t : pulse.t
        const alive = pulse.speed < 0 ? 1 + pulse.t >= 0 : pulse.t <= 1
        if (alive) list[keep++] = pulse
        if (t > 1 || (t < -0.0001 && pulse.speed < 0)) continue
        if (w < cap && t >= 0) {
          sampleRoute(pulse.route, t, tmp)
          arr[w * 3] = tmp.x; arr[w * 3 + 1] = tmp.y + lift; arr[w * 3 + 2] = tmp.z
          w++
        }
      }
      list.length = keep
      for (let i = w; i < cap; i++) arr[i * 3 + 1] = -99
      if (pts) (pts.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true
    }
    run(state.data, state.dataPos, N, data.current)
    run(state.power, state.powerPos, P, power.current)
  })
  return (
    <>
      <points ref={data} frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[state.dataPos, 3]} />
        </bufferGeometry>
        <pointsMaterial color={c.lit} size={5} sizeAttenuation={false} toneMapped={false} />
      </points>
      <points ref={power} frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[state.powerPos, 3]} />
        </bufferGeometry>
        <pointsMaterial color={c.lit} size={6} sizeAttenuation={false} toneMapped={false} transparent opacity={0.7} />
      </points>
    </>
  )
}

/** Corner marks on the footprint a travelling chip is heading for. */
const FOOT_MAX = 48
const CORNERS = [[-1, -1, 1, 1], [1, -1, -1, 1], [1, 1, -1, -1], [-1, 1, 1, -1]] as const
export function Footprints({ sim, c }: { sim: Sim; c: Tokens }) {
  const ref = useRef<ThreeLineSegments>(null)
  const buffer = useMemo(() => new Float32BufferAttribute(new Float32Array(FOOT_MAX * 4 * 12), 3), [])
  useFrame(({ clock }) => {
    const seg = ref.current
    if (!seg) return
    const arr = buffer.array as Float32Array
    let n = 0
    for (const p of sim.live) {
      if (n >= FOOT_MAX * 48 || !p.slot || p.mode === 'seated' || p.mode === 'toss' || p.mode === 'home' || !sim.wanted.has(p.item.ref)) continue
      const s = p.slot
      const w = (p.spec.fw * s.s) / 2 + 0.08, d = (p.spec.fd * s.s) / 2 + 0.08
      const y = s.y + 0.01
      const k = 0.18 * s.s + 0.06
      for (const [cx, cz, dx, dz] of CORNERS) {
        const x = cx * w, z = cz * d
        arr[n++] = s.x + x; arr[n++] = y; arr[n++] = s.z + z; arr[n++] = s.x + x + dx * k; arr[n++] = y; arr[n++] = s.z + z
        arr[n++] = s.x + x; arr[n++] = y; arr[n++] = s.z + z; arr[n++] = s.x + x; arr[n++] = y; arr[n++] = s.z + z + dz * k
      }
    }
    seg.geometry.setDrawRange(0, n / 3)
    buffer.needsUpdate = n > 0
    seg.visible = n > 0
    ;(seg.material as MeshBasicMaterial).opacity = reducedMotion ? 0.8 : 0.55 + Math.sin(clock.elapsedTime * 8) * 0.45
  })
  return (
    <lineSegments ref={ref} frustumCulled={false}>
      <bufferGeometry attributes-position={buffer} />
      <lineBasicMaterial color={c.lit} transparent />
    </lineSegments>
  )
}
