/**
 * Screenshots a /lab mock in headless Chromium with software WebGL, printing
 * page errors. Steps run in order; each `shot` writes `<out>/<mock>-<name>.png`.
 *
 *   bun scripts/lab-shot.ts <mock> <outDir> [--theme dark] [--size 1440x900] [--query 'scale=viral&chrome=embedded']
 *     [--steps '[{"wait":1500},{"shot":"idle"},{"click":[700,400]},{"drag":[[700,400],[400,400]]},{"key":"Enter"},{"move":[600,300]},{"scroll":400},{"shot":"after"}]']
 */
import { chromium } from '@playwright/test'

type Step =
  | { wait: number }
  | { shot: string }
  | { click: [number, number] }
  | { move: [number, number] }
  | { drag: [[number, number], [number, number]] }
  | { key: string }
  | { scroll: number }
  | { eval: string }

const [mock, out = '.', ...rest] = process.argv.slice(2)
const flag = (name: string) => {
  const at = rest.indexOf(`--${name}`)
  return at === -1 ? undefined : rest[at + 1]
}
const theme = flag('theme') ?? 'light'
const [width, height] = (flag('size') ?? '1440x900').split('x').map(Number)
const steps: Step[] = JSON.parse(flag('steps') ?? '[{"wait":2500},{"shot":"idle"}]')
const base = flag('base') ?? 'http://localhost:3000'
const extra = (flag('query') ?? '').replace(/^&?/, '&')

const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
})
const context = await browser.newContext({ viewport: { width, height }, colorScheme: theme as 'light' | 'dark' })
await context.addInitScript((value) => localStorage.setItem('theme', value), theme)
const page = await context.newPage()
const errors: string[] = []
page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(`console: ${message.text()}`)
})

await page.goto(`${base}/lab?mock=${mock}${extra === '&' ? '' : extra}`, { waitUntil: 'load', timeout: 60_000 })
for (const step of steps) {
  if ('wait' in step) await page.waitForTimeout(step.wait)
  else if ('shot' in step) {
    const path = `${out}/${mock}-${step.shot}.png`
    await page.screenshot({ path })
    console.log(`shot ${path}`)
  } else if ('click' in step) await page.mouse.click(...step.click)
  else if ('move' in step) await page.mouse.move(...step.move, { steps: 8 })
  else if ('drag' in step) {
    await page.mouse.move(...step.drag[0])
    await page.mouse.down()
    await page.mouse.move(...step.drag[1], { steps: 16 })
    await page.mouse.up()
  } else if ('key' in step) await page.keyboard.press(step.key)
  else if ('scroll' in step) await page.mouse.wheel(0, step.scroll)
  else if ('eval' in step) console.log('eval', JSON.stringify(await page.evaluate(step.eval)))
}
const canvas = await page.evaluate(() => {
  const box = document.querySelector('canvas')?.getBoundingClientRect()
  return box ? [Math.round(box.width), Math.round(box.height)] : null
})
if (!canvas) errors.push('no canvas rendered')
else if (canvas[1] < height * 0.5) errors.push(`canvas collapsed: ${canvas[0]}x${canvas[1]} in a ${width}x${height} viewport`)
console.log(errors.length ? errors.join('\n') : 'no page errors')
await browser.close()
