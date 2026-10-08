import { readdir } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'
import ts from 'typescript'
import { z } from 'zod'
import { featureMap } from './fixtures/feature-map.js'

const root = process.cwd()
async function sources(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  return (
    await Promise.all(
      entries.map((entry) => {
        const path = resolve(directory, entry.name)
        return entry.isDirectory()
          ? sources(path)
          : /\.(?:ts|tsx|mjs)$/.test(entry.name)
            ? [path]
            : []
      }),
    )
  ).flat()
}
const violations: string[] = []
for (const file of (await Promise.all(['src', 'scripts', 'tests'].map(sources))).flat()) {
  const label = relative(root, file).replaceAll('\\', '/')
  const source = ts.createSourceFile(
    file,
    await Bun.file(file).text(),
    ts.ScriptTarget.Latest,
    true,
  )
  function inspect(node: ts.Node) {
    const module =
      ts.isImportDeclaration(node) || ts.isExportDeclaration(node)
        ? node.moduleSpecifier
        : ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword
          ? node.arguments[0]
          : undefined
    if (module && ts.isStringLiteral(module)) {
      const reference = module.text
      if (
        /^shadcn\/(?!registry$|schema$)/.test(reference) ||
        reference.startsWith('@shadcn/registry/')
      )
        violations.push(`${label}: private shadcn import ${reference}`)
      if (reference.startsWith('.')) {
        const target = relative(root, resolve(dirname(file), reference)).replaceAll('\\', '/')
        if (target.startsWith('src/operations/private/')) {
          const owner = label === 'src/operations/index.ts'
          const internal =
            label.startsWith('src/operations/private/') && !label.endsWith('.test.ts')
          const ownTest =
            label.endsWith('.test.ts') && target.replace(/\.js$/, '.test.ts') === label
          if (!owner && !internal && !ownTest)
            violations.push(`${label}: imports private adapter ${reference}`)
        }
        if (label.startsWith('scripts/') && target.startsWith('src/operations/'))
          violations.push(`${label}: contributor tools must invoke the delivered CLI`)
      }
      if (reference.startsWith('payload-toolkit/'))
        violations.push(`${label}: published implementation import ${reference}`)
    }
    ts.forEachChild(node, inspect)
  }
  inspect(source)
}
const registry = z
  .object({ items: z.array(z.object({ name: z.string() })) })
  .parse(JSON.parse(await Bun.file('registry/registry.json').text()))
const names = registry.items.map((item) => item.name).toSorted()
if (new Set(names).size !== names.length)
  violations.push('Registry contains duplicate feature names')
if (JSON.stringify(names) !== JSON.stringify(Object.keys(featureMap).toSorted()))
  violations.push('Catalog and executable acceptance map must cover exactly the same features')
if (violations.length) throw new Error(violations.join('\n'))
process.stdout.write(`Module boundaries and ${names.length} feature acceptance mapping passed\n`)
