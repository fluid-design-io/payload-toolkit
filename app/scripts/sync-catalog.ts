import type { ItemKind, RegistryItem } from '../src/routes/workspace/-workspace/workspace.types'

const root = new URL('../../', import.meta.url)
const target = new URL('../src/routes/workspace/-workspace/workspace.catalog.ts', import.meta.url)
const kinds: Record<string, ItemKind> = {
  'registry:block': 'block',
  'registry:component': 'component',
}
// Refs are emitted into a shell command unquoted, so the charset is enforced here.
const refPattern = /^(@[a-z0-9-]+\/)?[a-z0-9][a-z0-9._-]*$/

type Json = Record<string, unknown>

function record(value: unknown, where: string): Json {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error(`${where} must be an object`)
  return value as Json
}
function list(value: unknown, where: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${where} must be an array`)
  return value
}
function text(value: unknown, where: string): string {
  if (typeof value !== 'string' || !value.trim())
    throw new Error(`${where} must be a non-empty string`)
  return value
}
/**
 * The shadcn registry-item schema has no image field, so an optional
 * `meta.image` carries one. A relative value resolves against the item's own
 * registry URL; the result must be https.
 */
export function imageUrl(value: unknown, where: string, base?: string): string | undefined {
  if (value === undefined) return undefined
  const raw = text(value, where)
  let url: URL
  try {
    url = new URL(raw, base)
  } catch {
    throw new Error(`${where} is not a valid URL: ${raw}`)
  }
  if (url.protocol !== 'https:') throw new Error(`${where} must be an https URL: ${raw}`)
  return url.href
}

function ref(value: string, where: string): string {
  if (!refPattern.test(value))
    throw new Error(`${where} is not a valid feature reference: ${value}`)
  return value
}

async function readJson(url: URL | string): Promise<unknown> {
  if (url instanceof URL && url.protocol === 'file:') return Bun.file(url).json()
  const response = await fetch(url)
  if (!response.ok) throw new Error(`GET ${url} returned ${response.status}`)
  return response.json()
}

async function bundled(): Promise<RegistryItem[]> {
  const where = 'registry/registry.json'
  const registry = record(await readJson(new URL(where, root)), where)
  return list(registry.items, `${where} items`).map((raw, index) => {
    const at = `${where} items[${index}]`
    const item = record(raw, at)
    const name = text(item.name, `${at}.name`)
    const meta = record(item.meta, `${at}.meta`)
    const toolkit = record(meta.payloadToolkit, `${at}.meta.payloadToolkit`)
    const picture = imageUrl(meta.image, `${at}.meta.image`)
    return {
      ref: ref(name, `${at}.name`),
      name,
      title: text(item.title, `${at}.title`),
      description: text(item.description, `${at}.description`),
      kind: 'feature',
      source: 'payload-toolkit',
      guide: text(toolkit.guide, `${at}.meta.payloadToolkit.guide`),
      ...(picture && { image: picture }),
    }
  })
}

async function community(): Promise<RegistryItem[]> {
  const where = 'catalog/community-registries.json'
  const directory = record(await readJson(new URL(where, root)), where)
  const items: RegistryItem[] = []
  for (const [index, raw] of list(directory.registries, `${where} registries`).entries()) {
    const at = `${where} registries[${index}]`
    const entry = record(raw, at)
    const namespace = text(entry.namespace, `${at}.namespace`)
    const template = text(entry.url, `${at}.url`)
    if (!template.includes('{name}')) throw new Error(`${at}.url has no {name} placeholder`)
    const url = template.replace('{name}', 'registry')
    const registry = record(await readJson(url), url)
    const skipped: string[] = []
    for (const [position, rawItem] of list(registry.items, `${url} items`).entries()) {
      const itemAt = `${url} items[${position}]`
      const item = record(rawItem, itemAt)
      const name = text(item.name, `${itemAt}.name`)
      const kind = kinds[text(item.type, `${itemAt}.type`)]
      if (!kind) {
        skipped.push(`${name} (${String(item.type)})`)
        continue
      }
      const meta = item.meta === undefined ? {} : record(item.meta, `${itemAt}.meta`)
      const picture = imageUrl(meta.image, `${itemAt}.meta.image`, template.replace('{name}', name))
      items.push({
        ref: ref(`${namespace}/${name}`, `${itemAt}.name`),
        name,
        title: text(item.title, `${itemAt}.title`),
        description: text(item.description, `${itemAt}.description`),
        kind,
        source: namespace,
        ...(picture && { image: picture }),
      })
    }
    console.log(
      `${namespace}: ${items.filter((item) => item.source === namespace).length} items from ${url}`,
    )
    if (skipped.length) console.log(`${namespace}: skipped ${skipped.join(', ')}`)
  }
  return items
}

async function sync() {
  const catalog = [...(await bundled()), ...(await community())]
  const refs = new Set<string>()
  for (const item of catalog) {
    if (refs.has(item.ref)) throw new Error(`Duplicate feature reference: ${item.ref}`)
    refs.add(item.ref)
  }

  await Bun.write(
    target,
    `// Generated by \`bun run catalog:sync\` from registry/registry.json and catalog/community-registries.json.
import type { RegistryItem } from './workspace.types'

export const catalog: readonly RegistryItem[] = ${JSON.stringify(catalog, null, 2)}
`,
  )
  console.log(`Wrote ${catalog.length} items to ${target.pathname}`)
}

if (import.meta.main) await sync()
