import { createHash } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { chromium } from '@playwright/test'
import { catalog } from '../src/routes/workspace/-workspace/workspace.catalog'

const directory = new URL('../public/registry-previews/', import.meta.url)
const manifestFile = Bun.file(new URL('manifest.json', directory))
type Capture = { url: string; image: string }
const previous: Record<string, Capture> = (await manifestFile.exists())
  ? await manifestFile.json()
  : {}
const captures: Record<string, Capture> = {}
const refresh = process.argv.includes('--refresh')
if (process.argv.slice(2).some((arg) => arg !== '--refresh'))
  throw new Error('Usage: bun run previews:build [--refresh]')
await mkdir(directory, { recursive: true })
const pending = catalog.filter(
  (item) => item.previewUrl && (!item.image || item.image.startsWith('/registry-previews/')),
)
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL, headless: true })
let failed = 0
try {
  await Promise.all(
    Array.from({ length: 3 }, async () => {
      while (pending.length) {
        const item = pending.pop()!
        const url = item.previewUrl!
        const filename = `${createHash('sha256').update(item.ref).digest('hex')}.png`
        const image = `/registry-previews/${filename}`
        const file = new URL(filename, directory)
        const cached = previous[item.ref]
        if (
          !refresh &&
          cached?.url === url &&
          cached.image === image &&
          (await Bun.file(file).exists())
        ) {
          captures[item.ref] = cached
          console.log(`Cached ${item.ref}`)
          continue
        }
        const context = await browser.newContext({
          viewport: { width: 1280, height: 800 },
          deviceScaleFactor: 1,
          reducedMotion: 'reduce',
          colorScheme: 'light',
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
          await page.screenshot({ path: file.pathname, animations: 'disabled', timeout: 10000 })
          captures[item.ref] = { url, image }
          console.log(`Captured ${item.ref}`)
        } catch (error) {
          failed++
          if (cached?.url === url && cached.image === image && (await Bun.file(file).exists()))
            captures[item.ref] = cached
          console.error(`Failed ${item.ref}: ${String(error)}`)
        } finally {
          await context.close()
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
console.log(
  `${Object.keys(captures).length} thumbnails retained; ${failed} captures failed. Run bun run catalog:sync to use them.`,
)
if (failed) process.exitCode = 1
