/**
 * Tier 1: data-only mods. A bundle is one JSON document; its `theme` and
 * `transport` arrays are recipes on top of built-ins: a theme overrides a base
 * theme's tokens and lens and keeps its Stage, a transport is the conveyor on
 * a route written as [x, z] corners in named lanes. `code` (tier 2) is an ES
 * module source that only runs once trusted. Everything is parsed here, at the
 * boundary; the rest of the line trusts the result.
 */
import type { Lens, Site, ThemeVariant, Tokens, TransportVariant } from '../core/contract'
import { makeBelt } from '../stations/transport/belt.data'
import type { Lane } from '../stations/transport/belt.data'
import { THEMES } from '../themes'
import { fail, head, id, label, str } from './guard'

type ThemeRecipe = { id: string; label: string; thumbnail?: string; base: string; scene?: string; lens?: Partial<Lens>; tokens: { light: Partial<Tokens>; dark: Partial<Tokens> } }
type Expr = (env: Record<string, number>) => number
type TransportRecipe = { id: string; label: string; thumbnail?: string; via: [Expr, Expr][] }
export type Bundle = {
  fabmod: 1
  id: string
  name: string
  author?: string
  description?: string
  theme?: ThemeRecipe[]
  transport?: TransportRecipe[]
  /** Raw recipe JSON, kept so a bundle round-trips through storage and links unchanged. */
  raw: Record<string, unknown>
  code?: string
}

const SAMPLE_TOKENS = THEMES[0].tokens.light
function tokens(raw: unknown, what: string): Partial<Tokens> {
  if (raw === undefined) return {}
  if (!raw || typeof raw !== 'object') fail(`${what} must be an object of token values.`)
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(raw as object)) {
    if (!(k in SAMPLE_TOKENS)) fail(`${what}.${k} is not a token. Tokens: ${Object.keys(SAMPLE_TOKENS).join(', ')}.`)
    const want = typeof SAMPLE_TOKENS[k as keyof Tokens]
    if (typeof v !== want) fail(`${what}.${k} must be a ${want}.`)
    out[k] = v
  }
  return out as Partial<Tokens>
}

/** Site and lane names a route corner may use, e.g. `"board.x1 + 1.5"` or `"front"`. */
const NAMES = ['out', 'bay', 'front', 'back', 'far', 'z', ...['pick', 'board'].flatMap((b) => ['x0', 'x1', 'z0', 'z1'].map((k) => `${b}.${k}`)), 'rail.x0', 'rail.x1', 'rail.z']
/** `term (± term)*` where a term is a number or a name, parsed once into a function of the site. */
function expr(v: unknown, what: string): Expr {
  if (typeof v === 'number' && Number.isFinite(v)) return () => v
  const text = str(v, what).replace(/\s+/g, '')
  const terms = text.match(/[+-]?[^+-]+/g) ?? fail(`${what} is empty.`)
  const parts = terms.map((t) => {
    const sign = t.startsWith('-') ? -1 : 1
    const body = t.replace(/^[+-]/, '')
    const n = Number(body)
    if (Number.isFinite(n)) return () => sign * n
    if (!NAMES.includes(body)) fail(`${what}: unknown name "${body}". Names: ${NAMES.join(', ')}.`)
    return (env: Record<string, number>) => sign * env[body]
  })
  return (env) => parts.reduce((s, f) => s + f(env), 0)
}

function themeRecipe(r: Record<string, unknown>, i: number): ThemeRecipe {
  const what = `theme[${i}]`
  const base = r.base === undefined ? THEMES[0].id : str(r.base, `${what}.base`)
  if (!THEMES.some((t) => t.id === base)) fail(`${what}.base "${base}" is not a built-in theme. Themes: ${THEMES.map((t) => t.id).join(', ')}.`)
  const lens = (r.lens ?? {}) as Record<string, unknown>
  for (const k of Object.keys(lens)) if (!['fov', 'el', 'frame'].includes(k) || typeof lens[k] !== 'number') fail(`${what}.lens.${k} must be fov, el or frame, as a number.`)
  const t = (r.tokens ?? {}) as Record<string, unknown>
  return {
    ...head(r, what, true), base,
    scene: r.scene === undefined ? undefined : str(r.scene, `${what}.scene`).slice(0, 40),
    lens: lens as Partial<Lens>,
    tokens: { light: tokens(t.light, `${what}.tokens.light`), dark: tokens(t.dark, `${what}.tokens.dark`) },
  }
}
function transportRecipe(r: Record<string, unknown>, i: number): TransportRecipe {
  const what = `transport[${i}]`
  if (!Array.isArray(r.via) || r.via.length < 1 || r.via.length > 64) fail(`${what}.via must be 1 to 64 [x, z] corners.`)
  const via = (r.via as unknown[]).map((c, j): [Expr, Expr] => {
    if (!Array.isArray(c) || c.length !== 2) fail(`${what}.via[${j}] must be an [x, z] pair.`)
    const pair = c as unknown[]
    return [expr(pair[0], `${what}.via[${j}][0]`), expr(pair[1], `${what}.via[${j}][1]`)]
  })
  return { ...head(r, what, true), via }
}

const list = (v: unknown, what: string) => (v === undefined ? [] : Array.isArray(v) ? (v as Record<string, unknown>[]) : fail(`${what} must be an array.`))

export function parseBundle(text: string): Bundle {
  let raw: Record<string, unknown>
  try {
    raw = JSON.parse(text)
  } catch {
    return fail('Not JSON. A mod is a .fabmod.json file, or a folder with fabmod.json.')
  }
  if (!raw || typeof raw !== 'object') fail('A mod must be a JSON object.')
  if (raw.fabmod !== 1) fail('Missing "fabmod": 1. This build reads version 1 mods.')
  if (raw.code !== undefined && typeof raw.code !== 'string') fail('"code" must be ES module source text.')
  return {
    fabmod: 1,
    id: id(raw.id, 'id'),
    name: label(raw.name, 'name'),
    author: raw.author === undefined ? undefined : str(raw.author, 'author').slice(0, 40),
    description: raw.description === undefined ? undefined : str(raw.description, 'description').slice(0, 280),
    theme: list(raw.theme, 'theme').map(themeRecipe),
    transport: list(raw.transport, 'transport').map(transportRecipe),
    code: raw.code as string | undefined,
    raw,
  }
}

const sources = new WeakMap<Bundle, string>()
/** The bundle as it is stored and shared. Cached: the store saves every mod's source on each change. */
export function serialize(b: Bundle) {
  let source = sources.get(b)
  if (source === undefined) sources.set(b, (source = JSON.stringify(b.raw)))
  return source
}

/** Live variants for a bundle's recipes, ids not yet namespaced. */
export function recipes(b: Bundle): { theme: ThemeVariant[]; transport: TransportVariant[] } {
  return {
    theme: (b.theme ?? []).map((r) => {
      const base = THEMES.find((t) => t.id === r.base)!
      const light = { ...base.tokens.light, ...r.tokens.light }
      const dark = { ...base.tokens.dark, ...r.tokens.dark }
      return { ...base, id: r.id, label: r.label, thumbnail: r.thumbnail, scene: r.scene ?? base.scene, lens: { ...base.lens, ...r.lens }, tokens: { light, dark } }
    }),
    transport: (b.transport ?? []).map((r) => ({
      ...makeBelt(r.id, r.label, (site: Site, lane: Lane) => {
        const env: Record<string, number> = { ...lane }
        for (const k of ['pick', 'board'] as const) for (const e of ['x0', 'x1', 'z0', 'z1'] as const) env[`${k}.${e}`] = site[k][e]
        env['rail.x0'] = site.rail.x0
        env['rail.x1'] = site.rail.x1
        env['rail.z'] = site.rail.z
        return r.via.map(([x, z]) => [x(env), z(env)] as const)
      }),
      thumbnail: r.thumbnail,
    })),
  }
}
