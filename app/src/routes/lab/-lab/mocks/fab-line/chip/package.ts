import { MeshBasicMaterial, MeshStandardMaterial } from 'three'
import type { Material } from 'three'

import type { ChipBox, ChipLid } from '../core/contract'
import { standoff } from '../core/spec'
import type { Spec } from '../core/spec'
import { piecesOf } from './pieces'

const boxCache = new WeakMap<Spec, readonly ChipBox[]>()
/** A closed package's boxes; a small passive is all plated metal. Cached per spec, which `specCache` keeps per item. */
export function packageBoxes(spec: Spec): readonly ChipBox[] {
  let boxes = boxCache.get(spec)
  if (!boxes) {
    const metal = spec.pkg === 'passive' && spec.c <= 0.5
    boxes = piecesOf(spec, false).map(({ size, at, paint, edge }) => ({ size, at, edge, paint: metal ? 'pin' : paint }))
    boxCache.set(spec, boxes)
  }
  return boxes
}

/** Lid print placement: on the mold top, or on the sub-chip of a module; passives carry no print. */
export function lidOf(spec: Spec): ChipLid | null {
  if (spec.pkg === 'passive') return null
  const module = spec.pkg === 'module'
  return {
    x: module ? spec.w * 0.12 : 0,
    y: module ? 0.682 : standoff(spec) + spec.h + 0.003,
    w: spec.w * (module ? 0.54 : 0.97),
    d: spec.d * (module ? 0.7 : 0.97),
  }
}

const chipMats = new Map<string, Material>()
/** The close-up's vertex-colored package material, unlit on flat themes. */
export function chipMat(flat: boolean) {
  const key = String(flat)
  let m = chipMats.get(key)
  if (!m) {
    m = flat ? new MeshBasicMaterial({ vertexColors: true }) : new MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.18 })
    chipMats.set(key, m)
  }
  return m
}
