import { Line } from '@react-three/drei'
import { RingGeometry } from 'three'
import type { Texture } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import type { Lab } from '@/routes/lab/-lab/lab.types'
import type { BoardProps, Sim, Statics, Tokens, V3 } from '../../../core/contract'
import { Body, TraceBundle } from '../../../core/scene'
import { box, cyl, fillMat, lineMat, rect, segs, useDisposable } from '../../../core/three'
import type { Piece } from '../../../core/three'
import { BoardLive, atVersion } from '../shared/live'
import { hatchSegs } from '../shared/paint'
import type { Frame } from '../shared/paint'
import { silkArt } from './art'
import { focusedBand } from '../shared/pack'
import { BANDS, BAND_DEPTH, BOARD, BY, CPU, HEADER, PAGE, bandZ, cpuHalf, staticRoutes } from './plan'

/** Standoffs at a slab's corners and two at `x` along its edges. */
export const postsOf = (slab: Frame, x: number): V3[] => [[slab.x0 + 0.35, 0, slab.z0 + 0.35], [slab.x1 - 0.35, 0, slab.z0 + 0.35], [slab.x0 + 0.35, 0, slab.z1 - 0.35], [slab.x1 - 0.35, 0, slab.z1 - 0.35], [x, 0, slab.z0 + 0.35], [x, 0, slab.z1 - 0.35]]

/** The focused page band's outline from `x0` to `x1` at height `y`; nothing when no band is focused. */
export function BandLine({ band, x0, x1, y, c }: { band: number; x0: number; x1: number; y: number; c: Tokens }) {
  if (band < 0) return null
  const z0 = bandZ(band) + 0.02, z1 = bandZ(band) + BAND_DEPTH - 0.02
  return <Line points={[[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], [x0, y, z0]]} color={c.lit} lineWidth={2} />
}

/**
 * The PCB's slab, posts, silk, core outlines, fixed buses and decoupling caps.
 * `page` adds the page area's band outlines, hatches and the focused band.
 */
export function CoreBoard({ lab, sim, c, statics, activeBand, version, silk, page, slab = BOARD }: { lab: Lab; sim: Sim; c: Tokens; statics: Statics; activeBand: number; version: number; silk: Texture; page: boolean; slab?: Frame }) {
  const y = BY + 0.003
  const outline = useDisposable(() => {
    const l: number[] = []
    if (page) {
      l.push(...rect(PAGE.x0, PAGE.z0, PAGE.x1, PAGE.z1, y))
      for (let b = 1; b < BANDS.length; b++) l.push(PAGE.x0, y, bandZ(b), PAGE.x1, y, bandZ(b))
      for (let b = 0; b < BANDS.length; b++) l.push(PAGE.chipX0 - 0.15, y, bandZ(b) + 0.3, PAGE.chipX0 - 0.15, y, bandZ(b + 1) - 0.08)
    }
    l.push(...rect(-7.7, -6.3, -2.5, -4.05, y))
    l.push(...rect(-7.8, -3.6, -6.55, 0.8, y))
    l.push(...rect(-7.7, 1.3, -4.3, 6.2, y))
    l.push(...rect(-3.85, 1.3, -1.25, 5.05, y))
    l.push(...rect(HEADER.x - 0.45, HEADER.z - 0.4, HEADER.x + 0.45, HEADER.z + 0.4, y))
    l.push(...rect(-1.15, -4.1, 0.35, 1.2, y))
    if (page) for (const hatch of atVersion(sim.plan.hatches, version)) l.push(...hatchSegs(hatch, y))
    return segs(l)
  }, [sim.plan.hatches, version, y, page])
  const posts = postsOf(slab, -0.4)
  const rings = useDisposable(() => mergeGeometries(posts.map(([x, , z]) => new RingGeometry(0.12, 0.2, 32).rotateX(-Math.PI / 2).translate(x, BY + 0.002, z)))!, [posts])
  const caps: Piece[] = []
  const h = cpuHalf(lab.setup.framework)
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * Math.PI * 2
    const x = CPU.x + Math.cos(a) * (h.w + 0.35), z = CPU.z + Math.sin(a) * (h.d + 0.35)
    if (x > CPU.x + h.w - 0.2 && Math.abs(z - CPU.z) < h.d) continue
    caps.push({ geo: box(0.18, 0.08, 0.1), at: [x, BY + 0.04, z] })
  }
  return (
    <group>
      <Body id={`slab-${slab.x1}`} c={c} fill={c.board} edge={c.boardEdge} pieces={[{ geo: box(slab.x1 - slab.x0, 0.16, slab.z1 - slab.z0), at: [(slab.x0 + slab.x1) / 2, BY - 0.08, (slab.z0 + slab.z1) / 2] }]} />
      <Body id={`posts-${slab.x1}`} c={c} fill={c.surface} edge={c.edge} pieces={posts.map(([x, , z]) => ({ geo: cyl(0.1, 0.1, BY - 0.16, 12), at: [x, (BY - 0.16) / 2, z], threshold: 30 }))} />
      <mesh geometry={rings} material={fillMat(c.pin, true)} />
      <lineSegments geometry={outline} material={lineMat(c.silk, 0.85)} />
      <BandLine band={page ? activeBand : -1} x0={PAGE.x0 + 0.02} x1={PAGE.x1 - 0.02} y={y + 0.002} c={c} />
      <mesh position={[(BOARD.x0 + BOARD.x1) / 2, BY + 0.004, (BOARD.z0 + BOARD.z1) / 2]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[BOARD.x1 - BOARD.x0, BOARD.z1 - BOARD.z0]} />
        <meshBasicMaterial map={silk} transparent toneMapped={false} depthWrite={false} />
      </mesh>
      <TraceBundle routes={statics.power} color={c.trace} width={4.5} />
      <TraceBundle routes={statics.memory} color={c.trace} width={1.6} />
      <Body id={`caps-${lab.setup.framework}`} c={c} fill={c.body} edge={c.bodyEdge} pieces={caps} />
    </group>
  )
}
/** The app board: slab, silk, sockets for the setup's CPU, memory and power stage, planned footprints, traces and pulses. */
export function Pcb(props: BoardProps) {
  const { lab, sim, c, version } = props
  const activeBand = focusedBand(lab)
  const { target, name, framework, database, packageManager, agent } = lab.setup
  const statics = staticRoutes(framework)
  const silk = useDisposable(() => silkArt({ target, name, framework, database, packageManager, agent }, c.silk, c.lit, activeBand), [target, name, framework, database, packageManager, agent, c.silk, c.lit, activeBand])
  return (
    <>
      <CoreBoard lab={lab} sim={sim} c={c} statics={statics} activeBand={activeBand} version={version} silk={silk} page />
      <BoardLive {...props} statics={statics} cpu={[CPU.x, BY, CPU.z]} />
    </>
  )
}
