/**
 * Drives /workspace through the Grid/Factory switch in headless Chromium with
 * software WebGL against a running server, asserting that the selection, the
 * URL and the chrome carry across views, and screenshots each state.
 *
 *   bun scripts/workspace-views.ts <outDir> [--base http://localhost:3000]
 */
import { chromium } from '@playwright/test'
import type { Browser, Page } from '@playwright/test'

const [out = '.', ...rest] = process.argv.slice(2)
const at = rest.indexOf('--base')
const base = at === -1 ? 'http://localhost:3000' : rest[at + 1]
const failures: string[] = []

function check(ok: boolean, label: string, detail?: unknown) {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail === undefined ? '' : ` (${JSON.stringify(detail)})`}`)
  if (!ok) failures.push(label)
}

async function open(browser: Browser, path: string, theme: 'light' | 'dark', size = { width: 1440, height: 900 }, touch = false) {
  const context = await browser.newContext({ viewport: size, colorScheme: theme, hasTouch: touch, isMobile: touch })
  await context.addInitScript((value) => localStorage.setItem('theme', value), theme)
  const page = await context.newPage()
  const errors: string[] = []
  const scripts: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`)
  })
  page.on('request', (request) => {
    if (request.resourceType() === 'script') scripts.push(request.url())
  })
  await page.goto(`${base}${path}`, { waitUntil: 'load', timeout: 60_000 })
  await page.waitForTimeout(1500)
  return { page, errors, scripts }
}

const buildCount = async (page: Page) =>
  Number((await page.getByRole('button', { name: /^Your build, / }).getAttribute('aria-label'))?.match(/\d+/)?.[0])
const search = (page: Page) => new URL(page.url()).searchParams
const shot = async (page: Page, name: string) => {
  const path = `${out}/${name}.png`
  await page.screenshot({ path })
  console.log(`shot ${path}`)
}
const waitForCanvas = (page: Page) => page.locator('main canvas').first().waitFor({ timeout: 30_000 })
const loadsThree = (scripts: string[]) => scripts.some((url) => /three|assembly-line|@react-three/.test(url))

const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
})

const ssr = await (await fetch(`${base}/workspace?view=factory`)).text()
check(ssr.includes('Starting the factory') && !ssr.includes('<canvas'), 'server renders the placeholder, not a canvas')

for (const theme of ['light', 'dark'] as const) {
  const { page, errors, scripts } = await open(browser, '/workspace', theme)
  check(!loadsThree(scripts), `${theme}: the grid loads no three.js or scene module`)
  await shot(page, `grid-${theme}`)

  await page.getByRole('button', { name: /^Add to build: / }).first().click()
  await page.waitForTimeout(400)
  check((await buildCount(page)) === 1, `${theme}: adding in the grid counts 1`, await buildCount(page))

  await page.getByRole('radio', { name: 'Factory' }).click()
  await waitForCanvas(page)
  await page.waitForTimeout(2500)
  check(search(page).get('view') === 'factory', `${theme}: the URL gains view=factory`, page.url())
  check((await buildCount(page)) === 1, `${theme}: the factory keeps the selection`, await buildCount(page))
  check(loadsThree(scripts), `${theme}: the factory loads the scene module on demand`)
  await shot(page, `factory-${theme}`)

  await page.getByRole('searchbox', { name: 'Search registry' }).fill('zzzz-no-match')
  await page.waitForTimeout(300)
  check(!(await page.getByText('No items match').isVisible()), `${theme}: NoMatch stays off the scene`)
  check(await page.locator('main canvas').first().isVisible(), `${theme}: the scene stays with an empty query`)
  await page.getByRole('searchbox', { name: 'Search registry' }).fill('')

  await page.getByRole('row', { name: 'Hero', exact: true }).click()
  await page.waitForTimeout(300)
  check(search(page).get('view') === 'factory', `${theme}: a rail category keeps the factory`)

  await page.getByRole('button', { name: /^Your build, / }).click()
  await page.waitForTimeout(1200)
  check(await page.getByRole('button', { name: 'Clear' }).isVisible(), `${theme}: the bar's build opens over the factory`)
  await shot(page, `factory-build-${theme}`)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(800)

  await page.getByRole('radio', { name: 'Factory' }).focus()
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('Space')
  await page.waitForTimeout(500)
  check(search(page).get('view') === null, `${theme}: the keyboard returns to the grid and drops view from the URL`, page.url())
  check((await buildCount(page)) === 1, `${theme}: the grid keeps the selection`)
  check(errors.length === 0, `${theme}: no page errors`, errors)
  await page.context().close()
}

{
  const { page, errors } = await open(browser, '/workspace?view=factory&items=forms', 'light')
  await waitForCanvas(page)
  await page.waitForTimeout(2500)
  check(
    (await page.getByRole('radio', { name: 'Factory' }).getAttribute('aria-checked')) === 'true',
    'a deep link opens the factory',
  )
  check((await buildCount(page)) === 1, 'a deep link restores the selection')
  await shot(page, 'factory-deeplink')
  check(errors.length === 0, 'deep link: no page errors', errors)
  await page.context().close()
}

for (const theme of ['light', 'dark'] as const) {
  const { page, errors } = await open(browser, '/workspace', theme, { width: 390, height: 844 }, true)
  await shot(page, `phone-grid-${theme}`)
  await page.getByRole('radio', { name: 'Factory' }).click()
  await waitForCanvas(page)
  await page.waitForTimeout(2500)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  check(overflow <= 0, `phone ${theme}: no horizontal overflow`, overflow)
  const searchWidth = await page
    .getByRole('searchbox', { name: 'Search registry' })
    .evaluate((el) => Math.round(el.getBoundingClientRect().width))
  check(searchWidth >= 150, `phone ${theme}: the search keeps at least 150px beside the view switch`, searchWidth)
  const bar = await page.getByRole('button', { name: /^Your build, / }).boundingBox()
  const covered = await page.evaluate((bar) => {
    if (!bar) return ['no bar']
    const hits = (b: DOMRect) => b.width > 0 && b.x < bar.x + bar.width && b.x + b.width > bar.x && b.y < bar.y + bar.height && b.y + b.height > bar.y
    return [...document.querySelectorAll<HTMLElement>('[data-fab] *')]
      .filter((el) => getComputedStyle(el).pointerEvents !== 'none' && el.tagName !== 'CANVAS' && hits(el.getBoundingClientRect()))
      .filter((el) => !el.closest('.sr-only') && getComputedStyle(el).visibility !== 'hidden')
      .map((el) => el.getAttribute('aria-label') ?? el.tagName.toLowerCase())
  }, bar)
  check(covered.length === 0, `phone ${theme}: no scene control sits under the Install bar`, covered.slice(0, 4))
  await shot(page, `phone-factory-${theme}`)

  await page.locator('[role=application]').focus()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(400)
  check((await buildCount(page)) === 1, `phone ${theme}: the keyboard adds a part through the scene`, await buildCount(page))
  check(
    (await page.locator('[data-live]').textContent())?.includes('added') === true,
    `phone ${theme}: the live region announces the add`,
    await page.locator('[data-live]').textContent(),
  )
  await page.keyboard.press('Escape')

  const cdp = await page.context().newCDPSession(page)
  let pressed = ''
  const area = await page.locator('canvas').boundingBox()
  const probes = area
    ? Array.from({ length: 48 }, (_, i) => [area.x + area.width * (((i % 6) + 0.5) / 6), area.y + area.height * ((Math.floor(i / 6) + 0.5) / 8)])
    : []
  for (const [x, y] of probes) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
    await page.waitForTimeout(700)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await page.waitForTimeout(400)
    pressed = (await page.locator('[data-fab]').getAttribute('data-pressed')) ?? ''
    if (pressed) break
  }
  check(pressed !== '', `phone ${theme}: a long press resolves to a part`, pressed)
  const dialog = page.getByRole('dialog')
  const opened = (await dialog.count()) > 0 && (await dialog.first().isVisible())
  check(opened, `phone ${theme}: a long press on a part opens its detail card`, opened ? await dialog.first().getAttribute('aria-label') : 'no dialog')
  check((await buildCount(page)) === 1, `phone ${theme}: the long press did not toggle the part`, await buildCount(page))
  await shot(page, `phone-factory-detail-${theme}`)
  await page.keyboard.press('Escape')
  check(errors.length === 0, `phone ${theme}: no page errors`, errors)
  await page.context().close()
}

await browser.close()
console.log(failures.length ? `${failures.length} failed` : 'all checks passed')
process.exit(failures.length ? 1 : 0)
