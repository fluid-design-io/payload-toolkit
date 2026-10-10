import { forwardRef, useMemo } from 'react'
import { MeshBasicMaterial, MeshStandardMaterial } from 'three'
import type { BufferGeometry, Group, Material, Texture } from 'three'

import type { Tokens } from '../core/contract'
import { standoff } from '../core/spec'
import type { Spec } from '../core/spec'
import { lineMat } from '../core/three'
import { buildPieces, piecesOf } from './pieces'

const pkgCache = new Map<string, { fill: BufferGeometry; edges: BufferGeometry }>()
/** A whole package's body and leads as one vertex-colored geometry, plus its body hairlines. Cached, never disposed. */
export function packageGeometry(spec: Spec, body: string, pin: string) {
  const key = `${spec.pkg}-${spec.w}-${spec.d}-${body}-${pin}`
  let hit = pkgCache.get(key)
  if (!hit) {
    const g = buildPieces(piecesOf(spec, false), { body, pin, die: body }, () => true)
    hit = { fill: g.fill!, edges: g.edges! }
    pkgCache.set(key, hit)
  }
  return hit
}

const chipMats = new Map<string, Material>()
/** The shared vertex-colored package material, unlit on flat themes. */
export function chipMat(flat: boolean, ghost: boolean) {
  const key = `${flat}|${ghost}`
  let m = chipMats.get(key)
  if (!m) {
    m = flat
      ? new MeshBasicMaterial({ vertexColors: true, transparent: ghost, opacity: ghost ? 0.7 : 1 })
      : new MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.18, transparent: ghost, opacity: ghost ? 0.7 : 1 })
    chipMats.set(key, m)
  }
  return m
}

/** Lid print placement: on the mold top, or on the sub-chip of a module. */
export function lidOf(spec: Spec) {
  const module = spec.pkg === 'module'
  return {
    x: module ? spec.w * 0.12 : 0,
    y: module ? 0.682 : standoff(spec) + spec.h + 0.003,
    w: spec.w * (module ? 0.54 : 0.97),
    d: spec.d * (module ? 0.7 : 0.97),
  }
}

/** A closed package: body, leads and lid print as one vertex-colored mesh, its hairlines, and the print. */
export const ChipBody = forwardRef<Group, { spec: Spec; top: Texture | null; c: Tokens; ghost?: boolean }>(function ChipBody({ spec, top, c, ghost }, ref) {
  const body = ghost ? c.ghost : spec.pkg === 'passive' && spec.c <= 0.5 ? c.pin : c.body
  const geo = useMemo(() => packageGeometry(spec, body, c.pin), [spec, body, c.pin])
  const lid = lidOf(spec)
  return (
    <group ref={ref}>
      <mesh geometry={geo.fill} material={chipMat(c.flat, !!ghost)} />
      <lineSegments geometry={geo.edges} material={lineMat(ghost ? c.edge : c.bodyEdge, ghost ? 0.6 : 1)} />
      {top && spec.pkg !== 'passive' && (
        <mesh position={[lid.x, lid.y, 0]} rotation-x={-Math.PI / 2}>
          <planeGeometry args={[lid.w, lid.d]} />
          <meshBasicMaterial map={top} transparent toneMapped={false} />
        </mesh>
      )}
    </group>
  )
})
