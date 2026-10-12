import type { CatalogItem, Setup } from '@/routes/workspace/-workspace/workspace.types'
import { groupOf } from '../core/spec'

/**
 * What a registry item is made of, drawn as the circuit on its die: the
 * source files it installs, the functional units (schema, fields, render,
 * hooks, stores), the pads that carry its exports and inputs off the die,
 * and the nets a signal follows through it. Derived from the catalog entry,
 * so every item gets a plausible, stable floorplan.
 */
export type UnitKind = 'schema' | 'field' | 'media' | 'list' | 'action' | 'motion' | 'render' | 'hook' | 'store'
export type Unit = { id: string; label: string; sub: string; kind: UnitKind; weight: number }
/** `in` feeds the die, `out` is an export, `pwr` is a supply pad that fills the ring. */
export type Pad = { label: string; dir: 'in' | 'out' | 'pwr'; unit: string | null }
export type Guts = { name: string; files: string[]; units: Unit[]; pads: Pad[]; nets: [string, string][] }
export type GutsEnv = Pick<Setup, 'framework' | 'database'>

type Field = Omit<Unit, 'id'>
const f = (label: string, sub: string, kind: UnitKind, weight: number): Field => ({ label, sub, kind, weight })

/** Words in an item's name, title or description, and the field they imply. First match per label wins. */
const LEXICON: readonly [RegExp, Field][] = [
  [/\bvideo/, f('VIDEO', 'upload · mp4', 'media', 2.6)],
  [/poster|reduced-motion/, f('POSTER', 'upload · fallback', 'media', 1.3)],
  [/\bavatar/, f('AVATAR', 'upload', 'media', 1.2)],
  [/\bimage|visual|\bmedia|photo|screenshot/, f('MEDIA', 'upload', 'media', 2.2)],
  [/\blogo/, f('LOGOS', 'upload[]', 'list', 2)],
  [/\bplan|pricing|\bprice|\btier/, f('PLANS', 'array · price', 'list', 2.4)],
  [/highlight/, f('FEATURED', 'checkbox', 'field', 0.9)],
  [/\bfaq|question|accordion/, f('ITEMS', 'array · q/a', 'list', 2)],
  [/testimonial|\bquote/, f('QUOTE', 'richText', 'field', 1.5)],
  [/rating|\bstars?\b/, f('RATING', 'number · 1–5', 'field', 1)],
  [/\bstats?\b|\bmetric/, f('STATS', 'array · value', 'list', 1.8)],
  [/\bteam|member|roster|\bbios?\b/, f('MEMBERS', 'array', 'list', 2)],
  [/author|byline/, f('AUTHOR', 'relationship', 'field', 1.2)],
  [/categor/, f('CATEGORIES', 'relationship[]', 'field', 1.1)],
  [/\bdate/, f('DATE', 'date', 'field', 0.8)],
  [/inquiry|signup|newsletter|endpoint|\bform\b|submission/, f('FORM', 'endpoint', 'action', 1.7)],
  [/channel/, f('CHANNELS', 'array', 'list', 1.4)],
  [/quer(y|ies)|collection|related/, f('QUERY', 'Posts · where', 'store', 2)],
  [/integration|connect|orbit|cluster/, f('INTEGRATIONS', 'array', 'list', 2)],
  [/compar|\btable\b|matrix/, f('MATRIX', 'array · rows', 'list', 2.2)],
  [/\bsteps?\b/, f('STEPS', 'array', 'list', 1.6)],
  [/\bicons?\b/, f('ICONS', 'select', 'field', 1)],
  [/\bcards\b/, f('CARDS', 'array', 'list', 2)],
  [/marquee|\btilt|kinetic|aurora|motion|animat|scroll/, f('MOTION', 'css · rAF', 'motion', 1.4)],
  [/\btitle|heading|headline|header/, f('HEADING', 'text', 'field', 1.2)],
  [/summary|description|\bcopy\b|biograph|\btext\b|editorial/, f('COPY', 'richText', 'field', 1.4)],
  [/call to action|call-to-action|\bcta\b|button|\blinks?\b/, f('CTA', 'link[]', 'action', 1.2)],
  [/\bgrid|bento|columns|\brows\b|split|layout/, f('LAYOUT', 'select', 'field', 0.9)],
]
const LABELS = new Map(LEXICON.map(([, field]) => [field.label, field]))
/** Fields a group always has, so a terse description still gets a full die. */
const GROUP: Record<string, readonly string[]> = {
  hero: ['HEADING', 'COPY', 'CTA', 'MEDIA'],
  feature: ['HEADING', 'CARDS', 'ICONS'],
  content: ['HEADING', 'COPY', 'MEDIA'],
  integration: ['HEADING', 'INTEGRATIONS'],
  logo: ['HEADING', 'LOGOS'],
  pricing: ['HEADING', 'PLANS', 'CTA'],
  faq: ['HEADING', 'ITEMS'],
  testimonials: ['QUOTE', 'AUTHOR'],
  stats: ['HEADING', 'STATS'],
  call: ['HEADING', 'COPY', 'CTA'],
  team: ['HEADING', 'MEMBERS'],
  contact: ['HEADING', 'FORM', 'CHANNELS'],
  comparator: ['HEADING', 'MATRIX'],
  footer: ['CTA', 'COPY', 'LAYOUT'],
}
const MAX_FIELDS = 6
const MIN_FIELDS = 3

const pascal = (name: string) => name.split(/[^a-z0-9]+/i).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join('')
const FRAMEWORK: Record<Setup['framework'], string> = { next: 'React · Next.js', tanstack: 'React · TanStack Start' }
const DATABASE: Record<Setup['database'], string> = { postgres: 'POSTGRES', mongodb: 'MONGODB' }

/** The fields an item's words imply, topped up from its group, in lexicon order. */
export function fieldsOf(item: Pick<CatalogItem, 'name' | 'title' | 'description' | 'category'>): Field[] {
  const text = `${item.name.replace(/-/g, ' ')} ${item.title} ${item.description}`.toLowerCase()
  const seen = new Set<string>()
  const out: Field[] = []
  const add = (field: Field | undefined) => {
    if (!field || seen.has(field.label) || out.length >= MAX_FIELDS) return
    seen.add(field.label)
    out.push(field)
  }
  for (const [re, field] of LEXICON) if (re.test(text)) add(field)
  for (const label of GROUP[groupOf(item.category)] ?? ['HEADING', 'COPY', 'CTA']) if (out.length < MIN_FIELDS || !seen.size) add(LABELS.get(label))
  return out
}

const id = (label: string) => label.toLowerCase()
const units = (list: Field[]): Unit[] => list.map((u) => ({ ...u, id: id(u.label) }))

/** The forms feature, from its real sources: registry/forms/plugin.ts and example-form.tsx. */
function formsGuts(env: GutsEnv): Guts {
  const db = DATABASE[env.database]
  return {
    name: 'forms',
    files: ['forms/plugin.ts', 'forms/example-form.tsx', 'forms/GUIDE.md'],
    units: units([
      f('PLUGIN', 'formBuilderPlugin', 'schema', 2.2),
      f('FORMS', 'collection', 'store', 1.6),
      f('EXAMPLE FORM', 'example-form.tsx', 'render', 2.4),
      f('NAME', 'text · 120', 'field', 1),
      f('EMAIL', 'email · 254', 'field', 1),
      f('MESSAGE', 'textarea · 5000', 'field', 1.3),
      f('SUBMISSIONS', 'form-submissions', 'store', 1.8),
      f('VALIDATE', 'beforeValidate hook', 'hook', 1.8),
      f('NOTIFY', 'console', 'action', 1),
      f(db, env.database === 'postgres' ? 'drizzle · sql' : 'mongoose', 'store', 2),
    ]),
    pads: [
      { label: 'payload.config', dir: 'in', unit: 'plugin' },
      { label: 'POST /api/form-submissions', dir: 'in', unit: 'submissions' },
      { label: 'formsPlugin', dir: 'out', unit: 'plugin' },
      { label: 'ExampleForm', dir: 'out', unit: 'example form' },
      { label: db, dir: 'out', unit: id(db) },
      { label: 'console.log', dir: 'out', unit: 'notify' },
    ],
    nets: [
      ['plugin', 'forms'], ['plugin', 'submissions'], ['forms', id(db)],
      ['example form', 'name'], ['example form', 'email'], ['example form', 'message'],
      ['name', 'submissions'], ['email', 'submissions'], ['message', 'submissions'],
      ['submissions', 'validate'], ['validate', id(db)], ['validate', 'notify'],
    ],
  }
}

/** Every item's guts. Bundled features with known sources get their own; the rest derive from kind and words. */
export function gutsOf(item: Pick<CatalogItem, 'kind' | 'name' | 'title' | 'description' | 'category'>, env: GutsEnv): Guts {
  if (item.kind === 'feature' && item.name === 'forms') return formsGuts(env)
  const P = pascal(item.name)
  const fields = units(fieldsOf(item))
  if (item.kind === 'feature') {
    const db = DATABASE[env.database]
    return {
      name: item.name,
      files: [`${item.name}/plugin.ts`, `${item.name}/GUIDE.md`],
      units: units([f('PLUGIN', `${P}Plugin`, 'schema', 2.2), f('COLLECTION', item.name, 'store', 1.8), f('HOOK', 'afterChange', 'hook', 1.4), f(db, 'adapter', 'store', 1.8)]).concat(fields.slice(0, 3)),
      pads: [{ label: 'payload.config', dir: 'in', unit: 'plugin' }, { label: `${P}Plugin`, dir: 'out', unit: 'plugin' }, { label: db, dir: 'out', unit: id(db) }],
      nets: [['plugin', 'collection'], ['collection', 'hook'], ['hook', id(db)], ...fields.slice(0, 3).map((u): [string, string] => ['collection', u.id])],
    }
  }
  if (item.kind === 'component') {
    const render = { id: 'render', label: `${P}.tsx`, sub: 'React component', kind: 'render' as const, weight: 2.6 }
    return {
      name: item.name,
      files: [`components/${P}.tsx`],
      units: [...fields, render],
      pads: [...fields.map((u): Pad => ({ label: u.label.toLowerCase(), dir: 'in', unit: u.id })), { label: P, dir: 'out', unit: 'render' }, { label: 'JSX', dir: 'out', unit: 'render' }],
      nets: fields.map((u): [string, string] => [u.id, 'render']),
    }
  }
  const schema = { id: 'schema', label: 'CONFIG.TS', sub: `Block · slug ${item.name}`, kind: 'schema' as const, weight: 2 }
  const render = { id: 'render', label: 'COMPONENT.TSX', sub: FRAMEWORK[env.framework], kind: 'render' as const, weight: 2.6 }
  return {
    name: item.name,
    files: [`blocks/${P}/config.ts`, `blocks/${P}/Component.tsx`],
    units: [schema, ...fields, render],
    pads: [
      { label: 'pages.layout', dir: 'in', unit: 'schema' },
      { label: 'admin', dir: 'in', unit: 'schema' },
      { label: `${P}Block`, dir: 'out', unit: 'schema' },
      { label: P, dir: 'out', unit: 'render' },
      { label: 'HTML', dir: 'out', unit: 'render' },
    ],
    nets: [...fields.map((u): [string, string] => ['schema', u.id]), ...fields.map((u): [string, string] => [u.id, 'render'])],
  }
}

/** The pad ring: signal pads in order with supply pads spread evenly between them, to a multiple of four so every side carries the same count. */
export function padRing(guts: Guts, min = 12): Pad[] {
  const n = Math.max(min, Math.ceil(guts.pads.length / 4) * 4)
  const k = n - guts.pads.length
  const signals = guts.pads[Symbol.iterator]()
  let supplies = 0
  return Array.from({ length: n }, (_, i): Pad => {
    if (Math.floor(((i + 1) * k) / n) > Math.floor((i * k) / n)) return { label: supplies++ % 2 ? 'GND' : 'VDD', dir: 'pwr', unit: null }
    return signals.next().value!
  })
}
