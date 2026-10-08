import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
async function find(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const children = await Promise.all(
    entries.map((entry) =>
      entry.isDirectory()
        ? find(join(directory, entry.name))
        : entry.name.endsWith('.test.ts')
          ? [join(directory, entry.name)]
          : [],
    ),
  )
  return children.flat()
}
const files = (await Promise.all(['src', 'tests', 'scripts/fixtures'].map(find))).flat().toSorted()
if (files.length === 0) throw new Error('No behavior tests found')
const child = spawn(process.execPath, ['--import', 'tsx', '--test', ...files], { stdio: 'inherit' })
child.on('error', (error) => {
  process.stderr.write(`${error.message}\n`)
  process.exitCode = 1
})
child.on('exit', (code, signal) => {
  process.exitCode = signal ? 1 : (code ?? 1)
})
