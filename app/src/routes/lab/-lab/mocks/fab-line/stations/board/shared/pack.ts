import type { CategoryId, Setup } from '@/routes/workspace/-workspace/workspace.types'
import type { Routed } from '../../../core/contract'
import { PKG_BY_GROUP, groupOf, specOf } from '../../../core/spec'
import type { Pkg, Spec } from '../../../core/spec'

/** The page's regions, top to bottom, and the catalog groups each one holds. Every board keeps this order. */
export const BANDS: { label: string; groups: string[] }[] = [
  { label: 'HERO', groups: ['hero'] },
  { label: 'LOGOS', groups: ['logo'] },
  { label: 'FEATURES', groups: ['feature', 'integration'] },
  { label: 'CONTENT', groups: ['content', 'stats', 'comparator'] },
  { label: 'SOCIAL', groups: ['testimonials', 'team'] },
  { label: 'PRICING', groups: ['pricing', 'faq'] },
  { label: 'CONVERT', groups: ['call', 'contact'] },
  { label: 'FOOTER', groups: ['footer', 'other'] },
]
export function bandOf(category: CategoryId) {
  const g = groupOf(category)
  const at = BANDS.findIndex((band) => band.groups.includes(g))
  return at === -1 ? BANDS.length - 1 : at
}

/** Blocks an existing app already has, drawn as hatched, owned chips. */
export const GHOSTS: { band: number; pkg: Pkg; c: number; title: string }[] = [
  { band: 0, pkg: 'qfp', c: 0.7, title: 'site header' },
  { band: 3, pkg: 'soic', c: 0.4, title: 'rich text' },
  { band: 3, pkg: 'qfn', c: 0.2, title: 'media' },
  { band: 3, pkg: 'soic', c: 0.9, title: 'archive' },
  { band: 7, pkg: 'soic', c: 1, title: 'site footer' },
]
export const fakeSpec = (pkg: Pkg, c: number): Spec => {
  const group = Object.entries(PKG_BY_GROUP).find(([, p]) => p === pkg)![0]
  return specOf({ kind: 'block', category: `block:${group}` as CategoryId, description: 'x'.repeat(Math.round(c * 200)), title: '', ref: `ghost-${pkg}-${c}` })
}

export type Entry = { key: string; spec: Spec }
export const ghostKey = (i: number) => `ghost:${i}`
export const ghostIndex = (key: string) => (key.startsWith('ghost:') ? Number(key.slice(6)) : -1)

/** Splits the wanted parts by where they go: blocks by page band (ghosts first), components and features apart. */
export function sortParts(parts: readonly Routed[], target: Setup['target']) {
  const ghosts = target === 'existing' ? GHOSTS : []
  const bands: Entry[][] = BANDS.map(() => [])
  ghosts.forEach((g, i) => bands[g.band].push({ key: ghostKey(i), spec: fakeSpec(g.pkg, g.c) }))
  const comps: Entry[] = []
  const feats: Entry[] = []
  for (const p of parts) {
    const e = { key: p.item.ref, spec: p.spec }
    if (p.item.kind === 'component') comps.push(e)
    else if (p.item.kind === 'feature') feats.push(e)
    else bands[bandOf(p.item.category)].push(e)
  }
  return { ghosts, bands, comps, feats }
}

export type Area = { x0: number; x1: number; z0: number; z1: number }
export type Spot = { x: number; z: number; s: number }

/**
 * Packs entries left to right into rows inside `area`, shrinking every
 * package by the same factor until the rows fit. `snap` rounds each centre
 * to a pitch (a breadboard's holes).
 */
export function packRows(entries: Entry[], area: Area, opts: { gap?: number; rowGap?: number; snap?: number } = {}) {
  const out = new Map<string, Spot>()
  if (!entries.length) return out
  const W = area.x1 - area.x0
  const D = area.z1 - area.z0
  const g0 = opts.gap ?? 0.32, r0 = opts.rowGap ?? 0.1
  const snap = (v: number) => (opts.snap ? Math.round(v / opts.snap) * opts.snap : v)
  let s = 1
  for (let tries = 0; tries < 30; tries++) {
    const gap = g0 * s
    const rows: Entry[][] = [[]]
    let x = 0
    for (const e of entries) {
      const w = e.spec.fw * s
      if (x > 0 && x + w > W) { rows.push([]); x = 0 }
      rows[rows.length - 1].push(e)
      x += w + gap
    }
    const rowD = Math.max(...entries.map((e) => e.spec.fd)) * s
    const total = rows.length * rowD + (rows.length - 1) * r0 * s
    if (total <= D || s < 0.15) {
      rows.forEach((row, r) => {
        let cx = area.x0
        const cz = area.z0 + r * (rowD + r0 * s) + rowD / 2 + Math.max(0, (D - total) / 2) * 0.5
        for (const e of row) {
          const w = e.spec.fw * s
          out.set(e.key, { x: snap(cx + w / 2), z: cz, s })
          cx += w + gap
        }
      })
      return out
    }
    s *= 0.9
  }
  return out
}

/** A fixed-pitch grid inside `area`, shrunk until every key fits. */
export function packGrid(keys: Entry[], area: Area, pitchX: number, pitchZ: number) {
  const out = new Map<string, Spot>()
  const W = area.x1 - area.x0, D = area.z1 - area.z0
  let s = 1
  while (s > 0.12) {
    const cols = Math.max(1, Math.floor(W / (pitchX * s)))
    const rows = Math.ceil(keys.length / cols)
    if (rows * pitchZ * s <= D) {
      keys.forEach((e, i) => out.set(e.key, { x: area.x0 + ((i % cols) + 0.5) * pitchX * s, z: area.z0 + (Math.floor(i / cols) + 0.5) * pitchZ * s, s }))
      return out
    }
    s *= 0.88
  }
  return out
}
