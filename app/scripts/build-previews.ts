import { createHash } from 'node:crypto'
import { mkdir, readdir, rm } from 'node:fs/promises'
import { chromium } from '@playwright/test'
import { catalog } from '../src/routes/workspace/-workspace/workspace.catalog'

const directory = new URL('../public/registry-previews/', import.meta.url)
/** The browser window, and the most of the full page a capture keeps below it. */
const viewport = { width: 1280, height: 800 }
const maxHeight = 1600
const manifestFile = Bun.file(new URL('manifest.json', directory))
type Capture = { url: string; image?: string; imageDark?: string }
const previous: Record<string, Capture> = (await manifestFile.exists())
  ? await manifestFile.json()
  : {}
const captures: Record<string, Capture> = {}
const refresh = process.argv.includes('--refresh')
if (process.argv.slice(2).some((arg) => arg !== '--refresh'))
  throw new Error('Usage: bun run previews:build [--refresh]')
await mkdir(directory, { recursive: true })
const pending = catalog.flatMap((item) => {
  if (!item.previewUrl) return []
  return (item.previewThemes ?? (['light', 'dark'] as const))
    .filter((theme) => {
      const image =
        theme === 'dark' ? (item.imageDark ?? item.image) : (item.image ?? item.imageDark)
      return !image || image.startsWith('/registry-previews/')
    })
    .map((theme) => ({ item, theme }))
})
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL, headless: true })
let failed = 0
try {
  await Promise.all(
    Array.from({ length: 3 }, async () => {
      while (pending.length) {
        const { item, theme } = pending.pop()!
        const url = item.previewUrl!
        const field = theme === 'dark' ? 'imageDark' : 'image'
        const filename = `${createHash('sha256').update(item.ref).digest('hex')}-${theme}.webp`
        const image = `/registry-previews/${filename}`
        const file = new URL(filename, directory)
        const cached = previous[item.ref]?.url === url ? previous[item.ref]?.[field] : undefined
        const safeCache =
          cached &&
          /^\/registry-previews\/[a-f0-9]{64}(?:-(?:light|dark)\.webp|\.png)$/.test(cached)
        function retain(value: string) {
          captures[item.ref] ??= { url }
          captures[item.ref][field] = value
        }
        try {
          if (!refresh && safeCache) {
            const source = Bun.file(new URL(cached.slice('/registry-previews/'.length), directory))
            if (await source.exists()) {
              if (cached !== image) await source.image().webp({ quality: 85 }).write(file)
              retain(image)
              console.log(`${cached === image ? 'Cached' : 'Converted'} ${item.ref} (${theme})`)
              continue
            }
          }
          const context = await browser.newContext({
            viewport,
            deviceScaleFactor: 1,
            reducedMotion: 'reduce',
            colorScheme: theme,
            serviceWorkers: 'block',
          })
          try {
            const page = await context.newPage()
            const response = await page.goto(url, { waitUntil: 'load', timeout: 25000 })
            if (!response?.ok()) throw new Error(`HTTP ${response?.status()}`)
            await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {})
            await page.evaluate(() =>
              Promise.race([
                document.fonts.ready,
                new Promise((resolve) => setTimeout(resolve, 3000)),
              ]),
            )
            const height = await page.evaluate(() => document.documentElement.scrollHeight)
            await page.screenshot({
              path: file.pathname,
              fullPage: true,
              clip: { x: 0, y: 0, width: viewport.width, height: Math.min(Math.max(height, viewport.height), maxHeight) },
              type: 'webp',
              quality: 85,
              animations: 'disabled',
              timeout: 10000,
            })
            retain(image)
            console.log(`Captured ${item.ref} (${theme})`)
          } finally {
            await context.close()
          }
        } catch (error) {
          failed++
          if (
            safeCache &&
            cached.endsWith('.webp') &&
            (await Bun.file(
              new URL(cached.slice('/registry-previews/'.length), directory),
            ).exists())
          )
            retain(cached)
          console.error(`Failed ${item.ref} (${theme}): ${String(error)}`)
        }
      }
    }),
  )
} finally {
  await browser.close()
  await Bun.write(
    manifestFile,
    `${JSON.stringify(Object.fromEntries(Object.entries(captures).sort(([a], [b]) => a.localeCompare(b))), null, 2)}\n`,
  )
}
const retained = new Set(
  Object.values(captures).flatMap(({ image, imageDark }) => [image, imageDark]),
)
for (const filename of await readdir(directory))
  if (/\.(webp|png)$/.test(filename) && !retained.has(`/registry-previews/${filename}`))
    await rm(new URL(filename, directory))
console.log(
  `${Object.keys(captures).length} preview pairs retained; ${failed} captures failed. Run bun run catalog:sync to use them.`,
)
if (failed) process.exitCode = 1
