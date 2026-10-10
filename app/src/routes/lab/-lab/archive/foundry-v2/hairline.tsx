import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo } from 'react'
import { BoxGeometry, BufferGeometry, Color, CylinderGeometry, EdgesGeometry, Float32BufferAttribute, TorusGeometry } from 'three'
import { Line2 } from 'three/examples/jsm/lines/Line2.js'
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js'
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import type { Route } from './model'

export type Prim =
  | { box: [number, number, number]; at: [number, number, number]; color: string; rot?: [number, number, number]; edge?: boolean }
  | { cyl: [number, number, number, number]; at: [number, number, number]; color: string; rot?: [number, number, number]; edge?: boolean }
  | { torus: [number, number]; at: [number, number, number]; color: string; rot?: [number, number, number]; edge?: boolean }

/** One mesh and one edge set for a whole assembly, so a power stage costs two draw calls instead of forty. */
export function buildAssembly(prims: Prim[]) {
  const fills: BufferGeometry[] = []
  const edges: BufferGeometry[] = []
  const color = new Color()
  for (const p of prims) {
    let g: BufferGeometry
    let threshold = 1
    if ('box' in p) g = new BoxGeometry(...p.box)
    else if ('cyl' in p) { g = new CylinderGeometry(p.cyl[0], p.cyl[1], p.cyl[2], p.cyl[3]); threshold = 30 }
    else { g = new TorusGeometry(p.torus[0], p.torus[1], 10, 32); threshold = 40 }
    if (p.rot) g.rotateX(p.rot[0]).rotateY(p.rot[1]).rotateZ(p.rot[2])
    g.translate(...p.at)
    const n = g.getAttribute('position').count
    const colors = new Float32Array(n * 3)
    color.set(p.color)
    for (let i = 0; i < n; i++) { colors[i * 3] = color.r; colors[i * 3 + 1] = color.g; colors[i * 3 + 2] = color.b }
    g.setAttribute('color', new Float32BufferAttribute(colors, 3))
    if (p.edge !== false) edges.push(new EdgesGeometry(g, threshold))
    fills.push(g)
  }
  const geometry = mergeGeometries(fills)!
  const edgeGeometry = edges.length ? mergeGeometries(edges)! : new BufferGeometry()
  fills.forEach((g) => g.dispose())
  edges.forEach((g) => g.dispose())
  return { geometry, edgeGeometry }
}

export function Assembly({ prims, edge, opacity = 1, position, metal = 0 }: { prims: Prim[]; edge: string; opacity?: number; position?: [number, number, number]; metal?: number }) {
  const built = useMemo(() => buildAssembly(prims), [prims])
  useEffect(() => () => { built.geometry.dispose(); built.edgeGeometry.dispose() }, [built])
  return (
    <group position={position}>
      <mesh geometry={built.geometry}>
        <meshStandardMaterial vertexColors roughness={0.85} metalness={metal} transparent={opacity < 1} opacity={opacity} />
      </mesh>
      <lineSegments geometry={built.edgeGeometry}>
        <lineBasicMaterial color={edge} transparent={opacity < 1} opacity={opacity} />
      </lineSegments>
    </group>
  )
}

export function useLine2(points: { x: number; y: number; z: number }[], color: string, width: number, opacity = 1) {
  const { size } = useThree()
  const line = useMemo(() => {
    const geo = new LineGeometry()
    geo.setPositions(points.flatMap((p) => [p.x, p.y, p.z]))
    const mat = new LineMaterial({ color: new Color(color).getHex(), linewidth: width, transparent: true, opacity })
    return new Line2(geo, mat)
  }, [points])
  useEffect(() => () => { line.geometry.dispose(); line.material.dispose() }, [line])
  useLayoutEffect(() => {
    line.material.color.set(color)
    line.material.linewidth = width
    line.material.opacity = opacity
  }, [line, color, width, opacity])
  useLayoutEffect(() => { line.material.resolution.set(size.width, size.height) }, [line, size.width, size.height])
  return line
}

export function TraceLine({ route, color, width, progress, opacity }: { route: Route; color: string; width: number; progress?: () => number; opacity?: number | (() => number) }) {
  const line = useLine2(route.pts, color, width, typeof opacity === 'number' ? opacity : 1)
  const segs = route.pts.length - 1
  useFrame(() => {
    if (typeof opacity === 'function') line.material.opacity = opacity()
    if (!progress) return
    const k = Math.floor(progress() * segs)
    line.visible = k > 0
    line.geometry.instanceCount = Math.max(1, k)
  })
  return <primitive object={line} />
}

/** Every finished route in one draw call. Rebuilt only when the set of route keys changes. */
export function TraceBundle({ routes, color, width, opacity = 1 }: { routes: Route[]; color: string; width: number; opacity?: number | (() => number) }) {
  const { size } = useThree()
  const key = routes.map((r) => r.key).join('|')
  const line = useMemo(() => {
    const pos: number[] = []
    for (const r of routes) for (let i = 1; i < r.pts.length; i++) pos.push(r.pts[i - 1].x, r.pts[i - 1].y, r.pts[i - 1].z, r.pts[i].x, r.pts[i].y, r.pts[i].z)
    const geo = new LineSegmentsGeometry()
    geo.setPositions(pos.length ? pos : [0, -99, 0, 0, -99, 0])
    const mat = new LineMaterial({ color: new Color(color).getHex(), linewidth: width, transparent: true, opacity: typeof opacity === 'number' ? opacity : 1 })
    const l = new LineSegments2(geo, mat)
    l.frustumCulled = false
    return l
  }, [key])
  useEffect(() => () => { line.geometry.dispose(); line.material.dispose() }, [line])
  useLayoutEffect(() => {
    line.material.color.set(color)
    line.material.linewidth = width
    line.material.resolution.set(size.width, size.height)
  }, [line, color, width, size.width, size.height])
  useFrame(() => { if (typeof opacity === 'function') line.material.opacity = opacity() })
  return <primitive object={line} />
}
