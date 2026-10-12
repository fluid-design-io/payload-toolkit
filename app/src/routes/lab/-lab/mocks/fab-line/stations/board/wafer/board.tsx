import { Line } from '@react-three/drei'
import { ExtrudeGeometry, Shape } from 'three'

import type { BoardProps, V3 } from '../../../core/contract'
import { Body, TraceBundle } from '../../../core/scene'
import { box, cyl, lineMat, segs, useDisposable } from '../../../core/three'
import { BY } from '../shared/dims'
import { BoardLive, atVersion } from '../shared/live'
import { focusedBand } from '../shared/pack'
import { hatchSegs } from '../shared/paint'
import { postsOf } from '../pcb/board'
import { DISC, FLAT, deckSilk, waferArt } from './art'
import { DECK, R, R0, SECTOR, WY, grid, polar, staticRoutes, streetOf } from './plan'

const THICK = 0.06

/** A disc with its flat cut toward the camera, lying in the floor plane with its top at y = 0. */
function waferGeometry() {
  const s = new Shape()
  const a = Math.acos(FLAT / R)
  s.absarc(0, 0, R, Math.PI / 2 + a, Math.PI * 2 + Math.PI / 2 - a, false)
  s.closePath()
  return new ExtrudeGeometry(s, { depth: THICK, bevelEnabled: false, curveSegments: 72 }).rotateX(Math.PI / 2)
}

/** The outline of sector `b` at height `y`, for the focused band. */
function sectorOutline(b: number, y: number): V3[] {
  const a0 = b * SECTOR, a1 = (b + 1) * SECTOR
  const inset = (a: number, r: number, side: number, k: number) => {
    const p = polar(a, r), n = { x: Math.cos(a), z: Math.sin(a) }
    return [p.x + n.x * side * streetOf(k), y, p.z + n.z * side * streetOf(k)] as V3
  }
  const pts: V3[] = []
  for (let i = 0; i <= 24; i++) {
    const a = a0 + ((a1 - a0) * i) / 24
    const p = polar(a, R - 0.42)
    pts.push([p.x, y, p.z])
  }
  pts.push(inset(a1, R0, -1, (b + 1) % 8))
  for (let i = 24; i >= 0; i--) {
    const a = a0 + ((a1 - a0) * i) / 24
    const p = polar(a, R0)
    pts.push([p.x, y, p.z])
  }
  pts.push(inset(a0, R0, 1, b), pts[0])
  return pts
}

/**
 * A wafer on a prober stage. The core die is the framework CPU; the page's
 * bands are its eight sectors, read clockwise from twelve o'clock, and each
 * package's trace drops onto its sector's spoke and runs it into the core.
 */
export function Wafer(props: BoardProps) {
  const { lab, sim, c, version } = props
  const activeBand = focusedBand(lab)
  const { target, name, framework, database, packageManager, agent } = lab.setup
  const statics = staticRoutes(framework)
  const face = useDisposable(
    () => waferArt({ target, name, framework }, c.silk, c.lit, activeBand, atVersion(grid, version).pitch),
    [target, name, framework, c.silk, c.lit, activeBand, version],
  )
  const deck = useDisposable(() => deckSilk({ database, packageManager, agent }, c.silk), [database, packageManager, agent, c.silk])
  const wafer = useDisposable(waferGeometry, [])
  const hatches = useDisposable(() => segs(atVersion(sim.plan.hatches, version).flatMap((h) => hatchSegs(h, WY + 0.008))), [sim.plan.hatches, version])
  const posts = postsOf(DECK, -7.0)
  const cx = (DECK.x0 + DECK.x1) / 2, cz = (DECK.z0 + DECK.z1) / 2
  return (
    <>
      <Body id="deck" c={c} fill={c.surface} edge={c.edge} pieces={[{ geo: box(DECK.x1 - DECK.x0, 0.16, DECK.z1 - DECK.z0), at: [cx, BY - 0.08, cz] }]} />
      <Body id="deck-posts" c={c} fill={c.surface} edge={c.edge} pieces={posts.map(([x, , z]) => ({ geo: cyl(0.1, 0.1, BY - 0.16, 12), at: [x, (BY - 0.16) / 2, z], threshold: 30 }))} />
      <mesh position={[cx, BY + 0.004, cz]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[DECK.x1 - DECK.x0, DECK.z1 - DECK.z0]} />
        <meshBasicMaterial map={deck} transparent toneMapped={false} depthWrite={false} />
      </mesh>
      <Body id="chuck" c={c} fill={c.sub} edge={c.bodyEdge} pieces={[{ geo: cyl(R + 0.22, R + 0.28, WY - THICK - BY, 96), at: [0, (BY + WY - THICK) / 2, 0], threshold: 20 }]} />
      <Body id="wafer" c={c} fill={c.board} edge={c.boardEdge} metal={0.4} pieces={[{ geo: wafer, at: [0, WY, 0], threshold: 20 }]} />
      <mesh position={[0, WY + 0.003, 0]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[DISC.x1 - DISC.x0, DISC.z1 - DISC.z0]} />
        <meshBasicMaterial map={face} transparent toneMapped={false} depthWrite={false} />
      </mesh>
      <lineSegments geometry={hatches} material={lineMat(c.silk, 0.85)} />
      {activeBand >= 0 && <Line points={sectorOutline(activeBand, WY + 0.012)} color={c.lit} lineWidth={2} />}
      <TraceBundle routes={statics.power} color={c.trace} width={4.5} />
      <TraceBundle routes={statics.memory} color={c.trace} width={1.6} />
      <BoardLive {...props} statics={statics} cpu={[0, WY, 0]} memory={[-4.1, 0, -0.4]} power={[-4.6, 0, 0]} />
    </>
  )
}
