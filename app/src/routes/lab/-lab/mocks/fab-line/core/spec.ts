import type { CatalogItem, CategoryId } from '@/routes/workspace/-workspace/workspace.types'

/**
 * The chip language: which package each catalog item becomes and its size.
 * The board packs by footprint, the sim lifts by `chipTop`, chips draw the body.
 */
export type Pkg = 'qfp' | 'qfn' | 'soic' | 'dip' | 'passive' | 'module'
/** Body size at scale 1, lead reach beyond the body, the footprint the layout reserves, and a 0..1 complexity. */
export type Spec = { pkg: Pkg; w: number; d: number; h: number; lead: number; fw: number; fd: number; c: number }

export const groupOf = (category: CategoryId) => (category.startsWith('block:') ? category.slice(6) : category)

export const PKG_BY_GROUP: Record<string, Pkg> = {
  hero: 'qfp', feature: 'qfp', pricing: 'qfp', comparator: 'qfp',
  content: 'soic', testimonials: 'soic', faq: 'soic', contact: 'soic', footer: 'soic',
  integration: 'qfn', logo: 'qfn', stats: 'qfn', call: 'qfn', team: 'qfn',
  other: 'dip',
}
export const PKG_NAME: Record<Pkg, string> = {
  qfp: 'LQFP', qfn: 'QFN', soic: 'SOIC', dip: 'PDIP', passive: '1206 SMD', module: 'Mezzanine',
}

const hash = (s: string) => {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return (h >>> 0) / 4294967295
}

export function specOf(item: Pick<CatalogItem, 'kind' | 'category' | 'description' | 'title' | 'ref'>): Spec {
  const c = Math.min(1, (item.description.length + item.title.length * 4) / 220) * 0.75 + hash(item.ref) * 0.25
  const q = (v: number) => Math.round(v * 20) / 20
  const make = (pkg: Pkg, w: number, d: number, h: number, lead: number, leadX: boolean, leadZ: boolean): Spec => ({
    pkg, w: q(w), d: q(d), h, lead, c,
    fw: q(w) + (leadX ? lead * 2 : 0), fd: q(d) + (leadZ ? lead * 2 : 0),
  })
  if (item.kind === 'feature') return make('module', 2.6, 1.3, 0.5, 0, false, false)
  if (item.kind === 'component') return make('passive', 0.62, 0.32, 0.2, 0, false, false)
  const pkg = PKG_BY_GROUP[groupOf(item.category)] ?? 'dip'
  if (pkg === 'qfp') { const s = 0.95 + 0.5 * c; return make(pkg, s, s, 0.13, 0.17, true, true) }
  if (pkg === 'qfn') { const s = 0.7 + 0.38 * c; return make(pkg, s, s, 0.09, 0.03, true, true) }
  if (pkg === 'soic') return make(pkg, 1.0 + 0.7 * c, 0.52, 0.15, 0.17, false, true)
  return make('dip', 1.15 + 0.6 * c, 0.58, 0.3, 0.1, false, true)
}
/** How far a package's body floats above the board on its leads. */
export const standoff = (spec: Spec) => (spec.pkg === 'qfp' || spec.pkg === 'soic' ? 0.03 : spec.pkg === 'dip' ? 0.06 : 0)
/** Height of the package's top above its bottom. */
export const chipTop = (spec: Spec) => (spec.pkg === 'module' ? 0.7 : standoff(spec) + spec.h)
const specs = new Map<string, Spec>()
export function specCache(item: CatalogItem) {
  let s = specs.get(item.ref)
  if (!s) specs.set(item.ref, (s = specOf(item)))
  return s
}
