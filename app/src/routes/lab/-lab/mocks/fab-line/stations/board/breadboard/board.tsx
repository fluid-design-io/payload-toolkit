import { Vector3 } from 'three'

import type { BoardProps, Part, Tokens } from '../../../core/contract'
import { Body, TraceBundle } from '../../../core/scene'
import { box, clamp, lineMat, segs, tint, useDisposable } from '../../../core/three'
import type { Piece } from '../../../core/three'
import { BY } from '../shared/dims'
import { BoardLive, atVersion } from '../shared/live'
import { BANDS, focusedBand } from '../shared/pack'
import { atlasQuads, hatchSegs } from '../shared/paint'
import { BandLine, CoreBoard } from '../pcb/board'
import { CPU, bandZ, staticRoutes } from '../pcb/plan'
import { ATLAS, devSilk, faceArt } from './art'
import { BB, DEV, STRIP, arc } from './plan'

const GROOVE = 0.12
const strips = () => {
  const out: { z0: number; z1: number }[] = [{ z0: ATLAS.z0, z1: bandZ(0) + STRIP.rail[0] - 0.02 }, { z0: bandZ(BANDS.length) + 0.02, z1: ATLAS.z1 }]
  BANDS.forEach((_, b) => {
    for (const [a, z] of [STRIP.rail, STRIP.top, STRIP.bottom]) out.push({ z0: bandZ(b) + a, z1: bandZ(b) + z })
  })
  return out
}

/** The plastic: a block with a raised strip per rail and terminal half, so the channels are real grooves. */
function Plastic({ c, activeBand }: { c: Tokens; activeBand: number }) {
  const face = useDisposable(() => faceArt(c, activeBand), [c, activeBand])
  const list = strips()
  const quads = useDisposable(() => atlasQuads(ATLAS, list.map((s) => ({ x0: BB.x0, x1: BB.x1, ...s, y: BY + 0.002 }))), [list])
  const w = BB.x1 - BB.x0, cx = (BB.x0 + BB.x1) / 2
  const base = BY - GROOVE
  const pieces: Piece[] = [
    { geo: box(w, base, ATLAS.z1 - ATLAS.z0), at: [cx, base / 2, (ATLAS.z0 + ATLAS.z1) / 2] },
    ...list.map((s): Piece => ({ geo: box(w, GROOVE, s.z1 - s.z0), at: [cx, base + GROOVE / 2, (s.z0 + s.z1) / 2] })),
  ]
  return (
    <>
      <Body id="plastic" c={c} fill={c.surface} edge={c.edge} pieces={pieces} />
      <mesh geometry={quads}>
        <meshBasicMaterial map={face} toneMapped={false} />
      </mesh>
    </>
  )
}

/** Feed wires from the power stage to every strip's + rail. */
function railFeeds() {
  return BANDS.map((_, b) => arc(new Vector3(-2.6, BY, -4.9 + b * 0.05), new Vector3(BB.x0 + 0.25, BY, bandZ(b) + 0.15), 0.3))
}

/**
 * A breadboard kit: the PCB's core as a dev board, a solderless breadboard
 * with one terminal strip per page band, and colored jumper wires, each in
 * its item's hue, from the hole above a package's first pin to a CPU pin.
 * Wire lightness is the theme's tint lightness held to a middle band, so a
 * jumper reads on both pale and dark plastic.
 */
export function Breadboard(props: BoardProps) {
  const { lab, sim, c, version } = props
  const activeBand = focusedBand(lab)
  const { target, name, framework, database, packageManager, agent } = lab.setup
  const statics = { memory: staticRoutes(framework).memory, power: railFeeds() }
  const silk = useDisposable(() => devSilk({ target, name, framework, database, packageManager, agent }, c.silk), [target, name, framework, database, packageManager, agent, c.silk])
  const hatches = useDisposable(() => segs(atVersion(sim.plan.hatches, version).flatMap((h) => hatchSegs(h, BY + 0.008))), [sim.plan.hatches, version])
  const wire = (p: Part) => (p.item.kind === 'block' ? tint(p.item.hue, Math.max(c.s, 55), clamp(c.l, 42, 58)) : c.lit)
  const y = BY + 0.012
  return (
    <>
      <CoreBoard lab={lab} sim={sim} c={c} statics={{ memory: statics.memory, power: [] }} activeBand={-1} version={version} silk={silk} page={false} slab={DEV} />
      <Plastic c={c} activeBand={activeBand} />
      <TraceBundle routes={statics.power} color={c.trace} width={1.6} />
      <lineSegments geometry={hatches} material={lineMat(c.silk, 0.85)} />
      <BandLine band={activeBand} x0={BB.x0 + 0.03} x1={BB.x1 - 0.03} y={y} c={c} />
      <BoardLive {...props} statics={statics} lift={0.03} cpu={[CPU.x, BY, CPU.z]} colorOf={wire} width={3.2} />
    </>
  )
}
