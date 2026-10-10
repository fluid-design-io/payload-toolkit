import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import type { ReactNode } from 'react'
import { Color } from 'three'
import type { Group, Vector3 } from 'three'
import { Line2 } from 'three/examples/jsm/lines/Line2.js'
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js'
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js'

import type { Route, Sim, SimEvent, Tokens } from './contract'
import { fillMat, lineMat, mergeEdges, mergeFills } from './three'
import type { Piece } from './three'

type V3 = [number, number, number]

/** One rigid body: a fill mesh and a hairline mesh, each merged from its pieces. `id` keys the merge. */
export function Body({ pieces, fill, edge, c, position, rotation, opacity, metal, id, children }: {
  pieces: Piece[]; fill: string; edge: string; c: Tokens; position?: V3; rotation?: V3; opacity?: number; metal?: number; id: string; children?: ReactNode
}) {
  const geo = useMemo(() => ({ fill: mergeFills(pieces), edges: mergeEdges(pieces) }), [id])
  useEffect(() => () => { geo.fill.dispose(); geo.edges.dispose() }, [geo])
  const ghost = opacity !== undefined && opacity < 1
  return (
    <group position={position} rotation={rotation}>
      <mesh geometry={geo.fill} material={fillMat(fill, c.flat, c.rough, { transparent: ghost, opacity: opacity ?? 1, metal })} />
      <lineSegments geometry={geo.edges} material={lineMat(edge, ghost ? 0.6 : 1)} />
      {children}
    </group>
  )
}

/** A station's frame: children draw in station coordinates, shifted along x by the layout's eased offset. */
export function StationFrame({ sim, slot, children }: { sim: Sim; slot: keyof Sim['at']; children: ReactNode }) {
  const ref = useRef<Group>(null)
  useFrame(() => {
    if (ref.current) ref.current.position.x = sim.at[slot]
  })
  return <group ref={ref} position-x={sim.at[slot]}>{children}</group>
}

/** The board's scaled local frame inside its station frame. */
export function BoardFrame({ sim, children }: { sim: Sim; children: ReactNode }) {
  const o = sim.rig.board.origin
  return (
    <StationFrame sim={sim} slot="board">
      <group position={[o.x, 0, o.z]} scale={o.s}>{children}</group>
    </StationFrame>
  )
}

/** Calls `fn` once per new sim event, in order, from inside the frame loop. */
export function useSimEvents(sim: Sim, fn: (e: SimEvent) => void) {
  const seen = useRef(sim.eventSeq)
  const cb = useRef(fn)
  cb.current = fn
  useFrame(() => {
    if (seen.current === sim.eventSeq) return
    for (const e of sim.events) if (e.seq > seen.current) cb.current(e)
    seen.current = sim.eventSeq
  })
}

function useLine2(points: Vector3[], color: string, width: number, opacity = 1) {
  const { size } = useThree()
  const line = useMemo(() => {
    const geo = new LineGeometry()
    geo.setPositions(points.flatMap((p) => [p.x, p.y, p.z]))
    const mat = new LineMaterial({ color: new Color(color).getHex(), linewidth: width, transparent: opacity < 1, opacity })
    return new Line2(geo, mat)
  }, [points])
  useEffect(() => () => { line.geometry.dispose(); line.material.dispose() }, [line])
  useLayoutEffect(() => {
    line.material.color.set(color)
    line.material.linewidth = width
    line.material.opacity = opacity
    line.material.transparent = opacity < 1
  }, [line, color, width, opacity])
  useLayoutEffect(() => { line.material.resolution.set(size.width, size.height) }, [line, size.width, size.height])
  return line
}

/** A wide trace drawn up to `progress()` of its length. */
export function TraceLine({ route, color, width, progress, opacity }: { route: Route; color: string; width: number; progress?: () => number; opacity?: number }) {
  const line = useLine2(route.pts, color, width, opacity)
  const segs = route.pts.length - 1
  useFrame(() => {
    if (!progress) return
    const k = Math.floor(progress() * segs)
    line.visible = k > 0
    line.geometry.instanceCount = Math.max(1, k)
  })
  return <primitive object={line} />
}

/** Many fixed routes as one wide-line draw. */
export function TraceBundle({ routes, color, width }: { routes: Route[]; color: string; width: number }) {
  const { size } = useThree()
  const line = useMemo(() => {
    const pos: number[] = []
    for (const r of routes) for (let i = 1; i < r.pts.length; i++) pos.push(r.pts[i - 1].x, r.pts[i - 1].y, r.pts[i - 1].z, r.pts[i].x, r.pts[i].y, r.pts[i].z)
    const geo = new LineSegmentsGeometry()
    geo.setPositions(pos)
    return new LineSegments2(geo, new LineMaterial({ color: new Color(color).getHex(), linewidth: width }))
  }, [routes])
  useEffect(() => () => { line.geometry.dispose(); line.material.dispose() }, [line])
  useLayoutEffect(() => { line.material.color.set(color); line.material.linewidth = width }, [line, color, width])
  useLayoutEffect(() => { line.material.resolution.set(size.width, size.height) }, [line, size.width, size.height])
  return <primitive object={line} />
}

/** Click, hover and tooltip handlers for a pickable group. */
export function pickable(tip: { show: (e: PointerEvent, title: string, sub: string) => void; move: (e: PointerEvent) => void; hide: () => void }, guard: { moved: boolean }, title: string, sub: string, onClick: () => void) {
  return {
    onClick: (e: { stopPropagation: () => void }) => { e.stopPropagation(); if (!guard.moved) onClick() },
    onPointerOver: (e: { stopPropagation: () => void; nativeEvent: PointerEvent }) => { e.stopPropagation(); tip.show(e.nativeEvent, title, sub) },
    onPointerMove: (e: { nativeEvent: PointerEvent }) => tip.move(e.nativeEvent),
    onPointerOut: () => tip.hide(),
  }
}

/** A group that drops in from `start` units above and settles; set `drop.current` to bounce it again. */
export function useDrop(start: number, rate = 7) {
  const g = useRef<Group>(null)
  const drop = useRef(start)
  useFrame((_, dt) => {
    drop.current += (0 - drop.current) * (1 - Math.exp(-dt * rate))
    if (g.current) g.current.position.y = drop.current
  })
  return [g, drop] as const
}
