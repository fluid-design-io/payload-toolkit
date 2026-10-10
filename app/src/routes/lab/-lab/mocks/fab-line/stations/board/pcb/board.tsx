import { Line } from '@react-three/drei'
import { useEffect, useMemo } from 'react'
import { RingGeometry } from 'three'
import type { Texture } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import type { Lab } from '@/routes/lab/-lab/lab.types'
import type { BoardProps, Sim, Tokens, V3 } from '../../../core/contract'
import { Body, TraceBundle } from '../../../core/scene'
import { box, cyl, fillMat, lineMat, rect, segs } from '../../../core/three'
import type { Piece } from '../../../core/three'
import { Footprints, Ghosts, Pulses, Routes } from '../shared/live'
import { hatchSegs } from '../shared/paint'
import type { Frame } from '../shared/paint'
import type { Statics } from '../shared/live'
import { Cpu, Memory, Power } from '../shared/sockets'
import { silkArt } from './art'
import { BANDS, BAND_DEPTH, BOARD, BY, CPU, HEADER, PAGE, bandOf, bandZ, cpuHalf, staticRoutes } from './plan'

/**
 * The PCB's slab, posts, silk, core outlines, fixed buses and decoupling caps.
 * `page` adds the page area's band outlines, hatches and the focused band.
 */
export function CoreBoard({ lab, sim, c, statics, activeBand, version, silk, page, slab = BOARD }: { lab: Lab; sim: Sim; c: Tokens; statics: Statics; activeBand: number; version: number; silk: Texture; page: boolean; slab?: Frame }) {
  const y = BY + 0.003
  const outline = useMemo(() => {
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
    if (page) for (const hatch of sim.plan.hatches) l.push(...hatchSegs(hatch, y))
    return segs(l)
  }, [version, y, page])
  useEffect(() => () => outline.dispose(), [outline])
  const posts: V3[] = [[slab.x0 + 0.35, 0, slab.z0 + 0.35], [slab.x1 - 0.35, 0, slab.z0 + 0.35], [slab.x0 + 0.35, 0, slab.z1 - 0.35], [slab.x1 - 0.35, 0, slab.z1 - 0.35], [-0.4, 0, slab.z0 + 0.35], [-0.4, 0, slab.z1 - 0.35]]
  const rings = useMemo(() => mergeGeometries(posts.map(([x, , z]) => new RingGeometry(0.12, 0.2, 32).rotateX(-Math.PI / 2).translate(x, BY + 0.002, z)))!, [slab])
  useEffect(() => () => rings.dispose(), [rings])
  const caps = useMemo(() => {
    const out: Piece[] = []
    const h = cpuHalf(lab.setup.framework)
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2
      const x = CPU.x + Math.cos(a) * (h.w + 0.35), z = CPU.z + Math.sin(a) * (h.d + 0.35)
      if (x > CPU.x + h.w - 0.2 && Math.abs(z - CPU.z) < h.d) continue
      out.push({ geo: box(0.18, 0.08, 0.1), at: [x, BY + 0.04, z] })
    }
    return out
  }, [lab.setup.framework])
  return (
    <group>
      <Body id={`slab-${slab.x1}`} c={c} fill={c.board} edge={c.boardEdge} pieces={[{ geo: box(slab.x1 - slab.x0, 0.16, slab.z1 - slab.z0), at: [(slab.x0 + slab.x1) / 2, BY - 0.08, (slab.z0 + slab.z1) / 2] }]} />
      <Body id={`posts-${slab.x1}`} c={c} fill={c.surface} edge={c.edge} pieces={posts.map(([x, , z]) => ({ geo: cyl(0.1, 0.1, BY - 0.16, 12), at: [x, (BY - 0.16) / 2, z], threshold: 30 }))} />
      <mesh geometry={rings} material={fillMat(c.pin, true)} />
      <lineSegments geometry={outline} material={lineMat(c.silk, 0.85)} />
      {page && activeBand >= 0 && (
        <Line points={[[PAGE.x0 + 0.02, y + 0.002, bandZ(activeBand) + 0.02], [PAGE.x1 - 0.02, y + 0.002, bandZ(activeBand) + 0.02], [PAGE.x1 - 0.02, y + 0.002, bandZ(activeBand) + BAND_DEPTH - 0.02], [PAGE.x0 + 0.02, y + 0.002, bandZ(activeBand) + BAND_DEPTH - 0.02], [PAGE.x0 + 0.02, y + 0.002, bandZ(activeBand) + 0.02]]} color={c.lit} lineWidth={2} />
      )}
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
export function Pcb({ lab, sim, c, routing, version, chip, cycle, tip, guard }: BoardProps) {
  const activeBand = lab.focus.category.startsWith('block:') ? bandOf(lab.focus.category) : -1
  const statics = useMemo(() => staticRoutes(routing, lab.setup.framework), [routing, lab.setup.framework])
  const silk = useMemo(() => silkArt(lab.setup, c.silk, c.lit, activeBand), [lab.setup.target, lab.setup.name, lab.setup.framework, lab.setup.database, lab.setup.packageManager, lab.setup.agent, c.silk, c.lit, activeBand])
  useEffect(() => () => silk.dispose(), [silk])
  return (
    <>
      <CoreBoard lab={lab} sim={sim} c={c} statics={statics} activeBand={activeBand} version={version} silk={silk} page />
      <Ghosts key={lab.setup.target} sim={sim} c={c} chip={chip} version={version} />
      <Routes sim={sim} c={c} version={version} />
      <Cpu key={lab.setup.framework} framework={lab.setup.framework} at={[CPU.x, BY, CPU.z]} c={c} onClick={cycle.framework} tip={tip} guard={guard} />
      <Memory key={lab.setup.database} database={lab.setup.database} c={c} onClick={cycle.database} tip={tip} guard={guard} />
      <Power key={lab.setup.packageManager} pm={lab.setup.packageManager} c={c} onClick={cycle.pm} tip={tip} guard={guard} />
      <Pulses sim={sim} c={c} statics={statics} />
      <Footprints sim={sim} c={c} />
    </>
  )
}
