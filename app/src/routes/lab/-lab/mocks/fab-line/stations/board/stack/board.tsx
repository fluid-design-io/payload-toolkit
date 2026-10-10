import { useFrame, useThree } from '@react-three/fiber'
import { Line } from '@react-three/drei'
import { useEffect, useMemo, useRef } from 'react'
import { Box3, Matrix4, Ray, Raycaster, Vector3 } from 'three'
import type { Group } from 'three'

import type { BoardProps, Route, Sim, Tokens } from '../../../core/contract'
import { makeRoute } from '../../../core/route'
import { Body, TraceBundle, pickable } from '../../../core/scene'
import { box, cyl, lineMat, reducedMotion, segs } from '../../../core/three'
import type { Piece } from '../../../core/three'
import { BY } from '../shared/dims'
import { Footprints, Ghosts, Pulses, Routes } from '../shared/live'
import { BANDS, bandOf } from '../shared/pack'
import { atlasQuads, hatchSegs } from '../shared/paint'
import { Cpu, Memory, Power } from '../shared/sockets'
import { CoreBoard } from '../pcb/board'
import { BAND_DEPTH, CPU, PAGE, bandZ, staticRoutes } from '../pcb/plan'
import { ATLAS, baseSilk, layerSilk } from './art'
import { DROP_X, EXPLODE, LAYERS, SLAB, closed, layerOf, layerTop, layerZ } from './plan'

const span = (k: number) => ({ z0: layerZ(k) + 0.05, z1: layerZ(k + 1) - 0.05 })
const NAMES = Array.from({ length: LAYERS }, (_, k) => BANDS.filter((_, b) => layerOf(b) === k).map((b) => b.label).join(' + '))

/** The layers: slabs, standoffs, receptacles, flex conductors, silk and band rules, all at closed-stack heights. */
function Layers({ sim, c, version, activeBand, target }: { sim: Sim; c: Tokens; version: number; activeBand: number; target: 'existing' | 'new' }) {
  const silk = useMemo(() => layerSilk(target, c.silk, c.lit, activeBand), [target, c.silk, c.lit, activeBand])
  useEffect(() => () => silk.dispose(), [silk])
  const atlas = useMemo(() => atlasQuads(ATLAS, Array.from({ length: LAYERS }, (_, k) => ({ x0: PAGE.x0, x1: PAGE.x1, ...span(k), y: layerTop(k) + 0.004 }))), [])
  useEffect(() => () => atlas.dispose(), [atlas])
  const body = useMemo(() => {
    const slabs: Piece[] = [], posts: Piece[] = [], sockets: Piece[] = []
    for (let k = 0; k < LAYERS; k++) {
      const { z0, z1 } = span(k)
      const top = layerTop(k)
      slabs.push({ geo: box(PAGE.x1 - PAGE.x0, SLAB, z1 - z0), at: [(PAGE.x0 + PAGE.x1) / 2, top - SLAB / 2, (z0 + z1) / 2] })
      const h = top - SLAB - BY
      for (const x of [PAGE.x0 + 0.3, (PAGE.x0 + PAGE.x1) / 2, PAGE.x1 - 0.3]) for (const z of [z0 + 0.3, z1 - 0.3]) posts.push({ geo: cyl(0.08, 0.08, h, 12), at: [x, BY + h / 2, z], threshold: 30 })
      sockets.push({ geo: box(0.34, 0.2, z1 - z0 - 0.7), at: [DROP_X, BY + 0.1, (z0 + z1) / 2] })
    }
    return { slabs, posts, sockets }
  }, [])
  const flex = useMemo(() => {
    const out: Route[] = []
    for (let k = 0; k < LAYERS; k++) {
      const { z0, z1 } = span(k)
      const top = layerTop(k)
      for (let i = 0; i < 12; i++) {
        const z = z0 + 0.45 + (i / 11) * (z1 - z0 - 0.9)
        out.push(makeRoute([new Vector3(DROP_X + 0.3, top + 0.005, z), new Vector3(DROP_X, top - SLAB, z), new Vector3(DROP_X, BY + 0.2, z)], 'manhattan', []))
      }
    }
    return out
  }, [])
  const rules = useMemo(() => {
    const l: number[] = []
    BANDS.forEach((_, b) => {
      const y = layerTop(layerOf(b)) + 0.006
      if (b % 2) l.push(PAGE.x0, y, bandZ(b), PAGE.x1, y, bandZ(b))
      l.push(PAGE.chipX0 - 0.15, y, bandZ(b) + 0.3, PAGE.chipX0 - 0.15, y, bandZ(b + 1) - 0.08)
    })
    for (const hatch of sim.plan.hatches) l.push(...hatchSegs(hatch, layerTop(layerOf(Math.floor((hatch.z0 - PAGE.z0) / BAND_DEPTH))) + 0.006))
    return segs(l)
  }, [version])
  useEffect(() => () => rules.dispose(), [rules])
  const ay = activeBand >= 0 ? layerTop(layerOf(activeBand)) + 0.01 : 0
  return (
    <>
      <Body id="layer-slabs" c={c} fill={c.board} edge={c.boardEdge} pieces={body.slabs} />
      <Body id="layer-posts" c={c} fill={c.surface} edge={c.edge} pieces={[...body.posts, ...body.sockets]} />
      <TraceBundle routes={flex} color={c.trace} width={1.4} />
      <mesh geometry={atlas}>
        <meshBasicMaterial map={silk} transparent toneMapped={false} depthWrite={false} />
      </mesh>
      <lineSegments geometry={rules} material={lineMat(c.silk, 0.85)} />
      {activeBand >= 0 && (
        <Line points={[[PAGE.x0 + 0.02, ay, bandZ(activeBand) + 0.02], [PAGE.x1 - 0.02, ay, bandZ(activeBand) + 0.02], [PAGE.x1 - 0.02, ay, bandZ(activeBand) + BAND_DEPTH - 0.02], [PAGE.x0 + 0.02, ay, bandZ(activeBand) + BAND_DEPTH - 0.02], [PAGE.x0 + 0.02, ay, bandZ(activeBand) + 0.02]]} color={c.lit} lineWidth={2} />
      )}
    </>
  )
}

/**
 * The page as a terraced mezzanine stack over the PCB's core. Pointing at the
 * stack spreads its layers apart (tapping a layer pins the spread): the
 * layer group scales about the core's surface and every layer slot's height
 * follows, so seated chips, traces and the arm's next seat all ride it. The
 * pointer is tested against the stack's box rather than its meshes, because
 * seated chips sit on the layers and would otherwise steal the hover.
 */
export function Stack({ lab, sim, c, routing, version, chip, cycle, tip, guard }: BoardProps) {
  const activeBand = lab.focus.category.startsWith('block:') ? bandOf(lab.focus.category) : -1
  const statics = useMemo(() => staticRoutes(routing, lab.setup.framework), [routing, lab.setup.framework])
  const silk = useMemo(() => baseSilk(lab.setup, c.silk), [lab.setup.target, lab.setup.name, lab.setup.framework, lab.setup.database, lab.setup.packageManager, lab.setup.agent, c.silk])
  useEffect(() => () => silk.dispose(), [silk])
  const spread = useRef<Group>(null)
  const f = useRef(1)
  const pinned = useRef(false)
  const until = useRef(-1)
  const inCanvas = useRef(false)
  const gl = useThree((state) => state.gl)
  useEffect(() => {
    const el = gl.domElement
    const enter = () => { inCanvas.current = true }
    const leave = () => { inCanvas.current = false }
    el.addEventListener('pointermove', enter)
    el.addEventListener('pointerleave', leave)
    return () => { el.removeEventListener('pointermove', enter); el.removeEventListener('pointerleave', leave) }
  }, [gl])
  const probe = useMemo(() => ({
    caster: new Raycaster(),
    ray: new Ray(),
    inv: new Matrix4(),
    box: new Box3(new Vector3(PAGE.x0 - 0.2, BY, PAGE.z0 - 0.2), new Vector3(PAGE.x1 + 0.2, BY + (layerTop(0) - BY) * EXPLODE + 0.5, PAGE.z1 + 0.2)),
  }), [])
  useFrame((state, dt) => {
    const t = state.clock.elapsedTime
    const parent = spread.current?.parent
    if (parent && inCanvas.current) {
      probe.caster.setFromCamera(state.pointer, state.camera)
      probe.ray.copy(probe.caster.ray).applyMatrix4(probe.inv.copy(parent.matrixWorld).invert())
      if (probe.ray.intersectsBox(probe.box)) until.current = t + 0.6
    }
    const want = pinned.current || t < until.current ? EXPLODE : 1
    f.current += (want - f.current) * (1 - Math.exp(-dt * (reducedMotion ? 30 : 4.5)))
    if (Math.abs(want - f.current) < 1e-3) f.current = want
    const g = spread.current
    if (g) {
      g.position.y = BY * (1 - f.current)
      g.scale.y = f.current
    }
    const lift = (slot: { y: number }) => {
      const y0 = closed.get(slot as never)
      if (y0 !== undefined) slot.y = BY + (y0 - BY) * f.current
    }
    for (const slot of sim.plan.slots.values()) lift(slot)
    for (const g of sim.plan.ghosts) lift(g.slot)
  })
  const hover = pickable(tip, guard, 'Mezzanine stack', `${NAMES.join(' · ')} · point at it to spread the layers, tap to pin`, () => { pinned.current = !pinned.current })
  return (
    <>
      <CoreBoard lab={lab} sim={sim} c={c} statics={statics} activeBand={-1} version={version} silk={silk} page={false} />
      <group ref={spread}>
        <group {...hover}>
          <Layers sim={sim} c={c} version={version} activeBand={activeBand} target={lab.setup.target} />
        </group>
        <Routes sim={sim} c={c} version={version} />
        <Pulses sim={sim} c={c} statics={statics} />
      </group>
      <Ghosts key={lab.setup.target} sim={sim} c={c} chip={chip} version={version} />
      <Cpu key={lab.setup.framework} framework={lab.setup.framework} at={[CPU.x, BY, CPU.z]} c={c} onClick={cycle.framework} tip={tip} guard={guard} />
      <Memory key={lab.setup.database} database={lab.setup.database} c={c} onClick={cycle.database} tip={tip} guard={guard} />
      <Power key={lab.setup.packageManager} pm={lab.setup.packageManager} c={c} onClick={cycle.pm} tip={tip} guard={guard} />
      <Footprints sim={sim} c={c} />
    </>
  )
}
