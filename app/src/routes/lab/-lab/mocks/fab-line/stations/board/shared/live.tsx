import { useFrame, useThree } from '@react-three/fiber'
import { useRef, useState } from 'react'
import { Float32BufferAttribute } from 'three'
import type { BufferAttribute, LineSegments as ThreeLineSegments, Matrix4, MeshBasicMaterial } from 'three'

import type { CatalogItem, CategoryId } from '@/routes/workspace/-workspace/workspace.types'
import type { BoardProps, ChipVariant, Ghost, Part, Sim, Statics, Tokens, V3 } from '../../../core/contract'
import type { BatchEntry, BatchLook } from '../../../core/batch'
import { ChipBatch } from '../../../core/parts'
import { TraceLine } from '../../../core/scene'
import { reducedMotion } from '../../../core/three'
import { BANDS } from './pack'
import { Cpu, Memory, Power } from './sockets'

/** The catalog-shaped stand-in for a block the existing app already owns. */
const ghostItem = (g: Ghost): CatalogItem => {
  const group = BANDS[g.band].groups[0]
  return {
    ref: `your-app/${g.title.replace(/ /g, '-')}`, name: g.title, title: `existing ${g.title}`, description: 'Already in your app; the toolkit leaves it untouched.',
    kind: 'block', source: 'your-app', category: `block:${group}` as CategoryId, label: BANDS[g.band].label.toLowerCase(), hue: 210,
  }
}

/**
 * `value` as of plan `version`. The sim swaps plans and edits parts in place, so the version is an
 * argument: a compiled cache keyed only on the object would miss replans.
 */
export function atVersion<T>(value: T, version: number): T {
  void version
  return value
}

/** An existing app's blocks, dropped in as see-through, owned packages, one after another. */
export function Ghosts({ sim, c, chip, version }: { sim: Sim; c: Tokens; chip: ChipVariant; version: number }) {
  const clock = useThree((s) => s.clock)
  const born = useRef(new Map<string, number>())
  const ghosts = atVersion(sim.plan.ghosts, version)
  const entries = ghosts.map((g, i): BatchEntry => ({ key: `${g.title}${i}`, item: ghostItem(g), code: 'OWNED', spec: g.spec }))
  const look: BatchLook = { flat: c.flat, opacity: 0.7, body: c.ghost, pin: c.pin, edge: c.edge, edgeOpacity: 0.6 }
  const print = { body: c.ghost, ink: c.muted }
  const pose = (i: number, out: Matrix4) => {
    const g = ghosts[i]
    const now = clock.elapsedTime
    let t0 = born.current.get(g.title)
    if (t0 === undefined) born.current.set(g.title, (t0 = now + i * 0.12))
    const t = Math.min(1, Math.max(0, (now - t0) / 0.6))
    out.makeScale(g.slot.s, g.slot.s, g.slot.s).setPosition(g.slot.x, g.slot.y + (1 - t * t) * 2.5, g.slot.z)
    return true
  }
  return <ChipBatch chip={chip} entries={entries} look={look} print={print} pose={pose} />
}

/**
 * Parts routed in plan `version`. Routes are written onto parts in place, so the version is
 * an argument: a compiled cache keyed only on `sim.list` would never see new traces.
 */
function routedIn(list: readonly Part[], version: number) {
  void version
  return list.filter((p) => p.route)
}

/** Each placed part's trace, drawn as it seats. `colorOf` tints a trace per part; the dots on it are the board's `signals`. */
export function Routes({ sim, c, version, colorOf, width = 1.7 }: { sim: Sim; c: Tokens; version: number; colorOf?: (p: Part) => string; width?: number }) {
  const list = routedIn(sim.list, version)
  return (
    <>
      {list.map((p) => (
        <TraceLine key={`${p.item.ref}-${p.route!.len.toFixed(3)}-${p.route!.pts.length}`} route={p.route!} color={colorOf ? colorOf(p) : c.lit} width={width} progress={() => (p.mode === 'seated' ? p.drawn : 0)} />
      ))}
    </>
  )
}

/**
 * What every board draws over its own art: ghosts, traces, the CPU at `cpu`, memory and power moved by their offsets,
 * the dots along the traces and `statics`, and the footprints. Without `statics` the board draws traces and dots itself.
 */
export function BoardLive({ lab, sim, c, version, chip, cycle, swap, signals, tip, guard, statics, lift = 0.02, cpu, memory, power, colorOf, width }: BoardProps & {
  statics?: Statics; lift?: number; cpu: V3; memory?: V3; power?: V3; colorOf?: (p: Part) => string; width?: number
}) {
  const { target, framework, database, packageManager } = lab.setup
  const Signals = signals.Component
  return (
    <>
      <Ghosts key={target} sim={sim} c={c} chip={chip} version={version} />
      {statics && <Routes sim={sim} c={c} version={version} colorOf={colorOf} width={width} />}
      <Cpu framework={framework} at={cpu} c={c} swap={swap} onClick={cycle.framework} tip={tip} guard={guard} />
      <Memory database={database} offset={memory} c={c} swap={swap} onClick={cycle.database} tip={tip} guard={guard} />
      <Power pm={packageManager} offset={power} c={c} swap={swap} onClick={cycle.pm} tip={tip} guard={guard} />
      {statics && <Signals sim={sim} c={c} version={version} statics={statics} lift={lift} colorOf={colorOf} />}
      <Footprints sim={sim} c={c} />
    </>
  )
}

/** Corner marks on the footprint a travelling chip is heading for. */
const FOOT_MAX = 48
const CORNERS = [[-1, -1, 1, 1], [1, -1, -1, 1], [1, 1, -1, -1], [-1, 1, 1, -1]] as const
export function Footprints({ sim, c }: { sim: Sim; c: Tokens }) {
  const ref = useRef<ThreeLineSegments>(null)
  const [buffer] = useState(() => new Float32BufferAttribute(new Float32Array(FOOT_MAX * 4 * 12), 3))
  useFrame(({ clock }) => {
    const seg = ref.current
    if (!seg) return
    const attr = seg.geometry.getAttribute('position') as BufferAttribute
    const arr = attr.array as Float32Array
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
    attr.needsUpdate = n > 0
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
