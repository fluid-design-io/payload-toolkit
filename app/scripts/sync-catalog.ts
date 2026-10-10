import type { ItemKind, RegistryItem } from '../src/routes/workspace/-workspace/workspace.types'

const root = new URL('../../', import.meta.url)
const target = new URL('../src/routes/workspace/-workspace/workspace.catalog.ts', import.meta.url)
const previewDirectory = new URL('../public/registry-previews/', import.meta.url)
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
  if (url.username || url.password || url.hash)
    throw new Error(`${where} must not contain credentials or a fragment`)
  if (url.protocol !== 'https:') throw new Error(`${where} must be an https URL: ${raw}`)
  return url.href
}

export function previewFields(meta: Json, configured: unknown, name: string, base: string) {
  const defaults = configured === undefined ? {} : record(configured, 'preview')
  const overrides = defaults.items === undefined ? {} : record(defaults.items, 'preview.items')
  const override = Object.hasOwn(overrides, name) ? overrides[name] : undefined
  if (override === false || (override === undefined && meta.preview === false)) return {}
  const item = override === undefined ? {} : record(override, `preview.items.${name}`)
  const upstream =
    meta.preview === undefined || meta.preview === false ? {} : record(meta.preview, 'meta.preview')
  function template(value: unknown): unknown {
    if (value === undefined) return undefined
    const raw = text(value, 'preview template')
    if (raw.split('{name}').length > 2 || /[{}]/.test(raw.replace('{name}', 'item')))
      throw new Error('Preview template may contain only one {name} placeholder')
    return raw.replace('{name}', encodeURIComponent(name))
  }
  const url = imageUrl(
    template(item.url) ?? upstream.url ?? template(defaults.url),
    'preview.url',
    base,
  )
  function themeImage(value: unknown, theme: 'light' | 'dark') {
    if (value === undefined || typeof value === 'string') return value
    return record(value, 'preview.image')[theme]
  }
  const images = (['light', 'dark'] as const).map((theme) =>
    imageUrl(
      template(themeImage(item.image, theme)) ??
        themeImage(upstream.image, theme) ??
        themeImage(meta.image, theme) ??
        template(themeImage(defaults.image, theme)),
      `preview.image.${theme}`,
      base,
    ),
  )
  const image = images[0] ?? images[1]
  const imageDark = images[1]
  const embed = item.embed ?? upstream.embed ?? defaults.embed
  if (embed !== undefined && typeof embed !== 'boolean')
    throw new Error('preview.embed must be a boolean')
  const themes = item.themes ?? upstream.themes ?? defaults.themes
  if (
    themes !== undefined &&
    (!Array.isArray(themes) ||
      !themes.length ||
      new Set(themes).size !== themes.length ||
      themes.some((theme) => theme !== 'light' && theme !== 'dark'))
  )
    throw new Error('preview.themes must list light and/or dark once each')
  return {
    ...(url && { previewUrl: url }),
    ...(image && { image }),
    ...(imageDark && imageDark !== image && { imageDark }),
    ...(embed !== undefined && { previewEmbed: embed }),
    ...(url && themes?.length === 1 && { previewThemes: themes as ['light' | 'dark'] }),
  }
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
    const preview = previewFields(
      meta,
      undefined,
      name,
      text(registry.homepage, `${where}.homepage`),
    )
    return {
      ref: ref(name, `${at}.name`),
      name,
      title: text(item.title, `${at}.title`),
      description: text(item.description, `${at}.description`),
      kind: 'feature',
      source: 'payload-toolkit',
      sourceName: 'Payload Toolkit',
      sourceHomepage: text(registry.homepage, `${where}.homepage`),
      itemUrl: `${text(registry.homepage, `${where}.homepage`)}/blob/main/registry/${encodeURIComponent(name)}/GUIDE.md`,
      guide: text(toolkit.guide, `${at}.meta.payloadToolkit.guide`),
      ...preview,
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
      const preview = previewFields(
        meta,
        entry.preview,
        name,
        template.replace('{name}', encodeURIComponent(name)),
      )
      items.push({
        ref: ref(`${namespace}/${name}`, `${itemAt}.name`),
        name,
        title: text(item.title, `${itemAt}.title`),
        description: text(item.description, `${itemAt}.description`),
        kind,
        source: namespace,
        sourceName: text(entry.name, `${at}.name`),
        sourceHomepage: text(entry.homepage, `${at}.homepage`),
        itemUrl: template.replace('{name}', encodeURIComponent(name)),
        ...preview,
      })
    }
    console.log(
      `${namespace}: ${items.filter((item) => item.source === namespace).length} items from ${url}`,
    )
    if (skipped.length) console.log(`${namespace}: skipped ${skipped.join(', ')}`)
  }
  return items
}

export function capturedImage(
  item: RegistryItem,
  captures: Json,
  theme: 'light' | 'dark' = 'light',
): string | undefined {
  const explicit =
    theme === 'dark' ? (item.imageDark ?? item.image) : (item.image ?? item.imageDark)
  if (explicit || !item.previewUrl) return explicit
  const raw = captures[item.ref]
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const capture = raw as Json
  const image =
    theme === 'dark' ? (capture.imageDark ?? capture.image) : (capture.image ?? capture.imageDark)
  if (
    capture.url !== item.previewUrl ||
    typeof image !== 'string' ||
    !/^\/registry-previews\/[a-f0-9]{64}-(light|dark)\.webp$/.test(image)
  )
    return undefined
  return image
}

async function sync() {
  const catalog = [...(await bundled()), ...(await community())]
  const manifest = Bun.file(new URL('manifest.json', previewDirectory))
  const captures = (await manifest.exists())
    ? record(await manifest.json(), 'preview manifest')
    : {}
  for (const item of catalog) {
    const light = capturedImage(item, captures, 'light')
    const dark = capturedImage(item, captures, 'dark')
    for (const [field, image] of [
      ['image', light],
      ['imageDark', dark === light ? undefined : dark],
    ] as const) {
      if (
        image &&
        (!image.startsWith('/registry-previews/') ||
          (await Bun.file(
            new URL(image.slice('/registry-previews/'.length), previewDirectory),
          ).exists()))
      )
        item[field] = image
    }
  }
  const refs = new Set<string>()
  for (const item of catalog) {
    if (refs.has(item.ref)) throw new Error(`Duplicate feature reference: ${item.ref}`)
    refs.add(item.ref)
  }

  await Bun.write(
    target,
    `// Generated by \`bun run catalog:sync\` from registry/registry.json, catalog/community-registries.json and public/registry-previews/manifest.json.
import type { RegistryItem } from './workspace.types'

export const catalog: readonly RegistryItem[] = ${JSON.stringify(catalog, null, 2)}
`,
  )
  console.log(`Wrote ${catalog.length} items to ${target.pathname}`)
}

if (import.meta.main) await sync()
