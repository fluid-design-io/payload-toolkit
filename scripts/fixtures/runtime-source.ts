import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { files, hash, type Evidence } from './support.js'

export async function sourceSnapshot(project: string) {
  const entries: Record<string, string> = {}
  for (const name of await files(project))
    entries[name] = hash(await fs.readFile(path.join(project, name)))
  return entries
}
export function validateRuntimeChanges(
  before: Record<string, string>,
  after: Record<string, string>,
  generated: Record<string, string>,
) {
  const changed = [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((name) => before[name] !== after[name])
    .toSorted()
  for (const name of changed) {
    assert.ok(Object.hasOwn(generated, name), `Unexpected runtime source change: ${name}`)
    assert.equal(
      after[name],
      generated[name],
      `Runtime output differs from its exact expected content: ${name}`,
    )
  }
  return changed
}
export async function verifyRuntimeSource(
  project: string,
  framework: string,
  before: Record<string, string>,
  previous: { agents: string | null; nextEnv: string | null },
  directory: string,
  evidence: Evidence,
) {
  const after = await sourceSnapshot(project)
  const generated: Record<string, string> = {}
  if (framework === 'next') {
    if (before['AGENTS.md'] !== after['AGENTS.md']) {
      const generator = path.join(
        project,
        'node_modules/next/dist/server/lib/generate-agent-files.js',
      )
      evidence.identities.runtimeAgentRulesGenerator = hash(await fs.readFile(generator))
      const reference = await fs.mkdtemp(path.join(directory, 'next-generated-reference-'))
      try {
        if (previous.agents !== null)
          await fs.writeFile(path.join(reference, 'AGENTS.md'), previous.agents)
        // Test-only use of the installed pinned Next generator produces an exact
        // reference. Arbitrary additions outside its managed block cannot pass.
        const module = await import(pathToFileURL(generator).href)
        const writeAgentFiles = module.writeAgentFiles ?? module.default?.writeAgentFiles
        assert.equal(typeof writeAgentFiles, 'function')
        await writeAgentFiles(reference)
        generated['AGENTS.md'] = hash(await fs.readFile(path.join(reference, 'AGENTS.md')))
      } finally {
        await fs.rm(reference, { recursive: true, force: true })
      }
    }
    if (before['next-env.d.ts'] !== after['next-env.d.ts']) {
      assert.notEqual(
        previous.nextEnv,
        null,
        'The official Next fixture has generated declarations before dev',
      )
      const expected = previous
        .nextEnv!.replace(
          'import "./.next/types/routes.d.ts";',
          'import "./.next/dev/types/routes.d.ts";',
        )
        .replace(
          'import "./.next/types/root-params.d.ts";',
          'import "./.next/dev/types/root-params.d.ts";',
        )
      generated['next-env.d.ts'] = hash(expected)
    }
  }
  const changed = [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((name) => before[name] !== after[name])
    .toSorted()
  await fs.writeFile(
    path.join(directory, 'runtime-source-changes.json'),
    JSON.stringify(
      {
        before,
        after,
        generatedChanges: changed.map((name) => ({
          name,
          before: before[name] ?? null,
          after: after[name],
          owner: Object.hasOwn(generated, name)
            ? 'installed Next development generator'
            : 'unrecognized source change',
        })),
      },
      null,
      2,
    ),
  )
  validateRuntimeChanges(before, after, generated)
  evidence.checks.push({ name: 'fixture-runtime-source-integrity', status: 'passed' })
}
