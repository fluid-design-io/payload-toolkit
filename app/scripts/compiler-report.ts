import { readdir, readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { transformAsync } from '@babel/core'
import reactCompiler from 'babel-plugin-react-compiler'

type Location = { start: { line: number } } | null | undefined
type Detail = { reason: string; description?: string | null; primaryLocation(): Location }
type Event =
  | { kind: 'CompileSuccess'; fnLoc: Location }
  | { kind: 'CompileError'; fnLoc: Location; detail: Detail }
  | { kind: 'CompileSkip'; fnLoc: Location; reason: string }
  | { kind: 'PipelineError'; fnLoc: Location; data: string }
  | { kind: string; fnLoc?: Location }

const app = new URL('..', import.meta.url).pathname
const roots = process.argv.slice(2)
const explicit = roots.length > 0
const skipped = /__test__|\.test\.|routeTree\.gen\.ts$/

async function* sources(path: string): AsyncGenerator<string> {
  const entries = await readdir(path, { withFileTypes: true }).catch(() => null)
  if (!entries) {
    if (/\.tsx?$/.test(path)) yield path
    return
  }
  for (const entry of entries) {
    const child = join(path, entry.name)
    if (entry.isDirectory()) yield* sources(child)
    else if (/\.tsx?$/.test(entry.name) && (explicit || !skipped.test(child))) yield child
  }
}

const line = (loc: Location) => loc?.start.line ?? '?'
const skips = new Map<string, Set<string>>()
const skip = (file: string, fn: Location, reason: string) => {
  const key = `${file}:${line(fn)}`
  skips.set(key, (skips.get(key) ?? new Set()).add(reason))
}
let compiled = 0
let optOuts = 0

for (const root of explicit ? roots : ['src']) {
  for await (const file of sources(join(app, root))) {
    const code = await readFile(file, 'utf8')
    const name = relative(app, file)
    optOuts += code.match(/['"]use no memo['"]/g)?.length ?? 0
    await transformAsync(code, {
      filename: file,
      babelrc: false,
      configFile: false,
      code: false,
      parserOpts: { plugins: ['jsx', 'typescript'] },
      plugins: [
        [
          reactCompiler,
          {
            logger: {
              logEvent(_: string | null, event: Event) {
                if (event.kind === 'CompileSuccess') compiled++
                else if (event.kind === 'CompileError' && 'detail' in event)
                  skip(name, event.fnLoc, `line ${line(event.detail.primaryLocation())}: ${event.detail.reason}`)
                else if (event.kind === 'CompileSkip' && 'reason' in event)
                  skip(name, event.fnLoc, event.reason)
                else if (event.kind === 'PipelineError' && 'data' in event)
                  skip(name, event.fnLoc, `pipeline error: ${event.data}`)
              },
            },
          },
        ],
      ],
    })
  }
}

for (const [where, reasons] of skips) console.log(`${where}\n${[...reasons].map((reason) => `  ${reason}`).join('\n')}`)
console.log(`\n${compiled} functions compiled, ${skips.size} skipped, ${optOuts} "use no memo" directives`)
