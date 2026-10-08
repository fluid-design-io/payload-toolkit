import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
test('Renovate discovers and updates the complete source Payload tuple without changing the template SHA', async () => {
  const config = JSON.parse(await fs.readFile(path.join(root, 'renovate.json'), 'utf8'))
  const sources: Record<string, string> = Object.fromEntries(
    await Promise.all(
      ['catalog/bootstrap.json', 'registry/registry.json', 'registry/forms/GUIDE.md'].map(
        async (name) => [name, await fs.readFile(path.join(root, name), 'utf8')],
      ),
    ),
  )
  const extracted: { file: string; depName: string; version: string }[] = []
  const replacement = '4.0.0-canary.99999'
  for (const manager of config.customManagers) {
    assert.equal(manager.customType, 'regex')
    assert.equal(manager.datasourceTemplate, 'npm')
    assert.equal(manager.versioningTemplate, 'npm')
    assert.ok(
      manager.managerFilePatterns.every(
        (pattern: string) => !new RegExp(pattern.slice(1, -1)).test('package.json'),
      ),
    )
    for (const [file, content] of Object.entries(sources)) {
      if (
        !manager.managerFilePatterns.some((pattern: string) =>
          new RegExp(pattern.slice(1, -1)).test(file),
        )
      )
        continue
      for (const expression of manager.matchStrings) {
        const matches = [...content.matchAll(new RegExp(expression, 'g'))]
        for (const match of matches) {
          const groups = match.groups!
          extracted.push({
            file,
            depName: groups.depName ?? manager.depNameTemplate,
            version: groups.currentValue,
          })
          sources[file] = sources[file].replace(
            match[0],
            match[0].replace(groups.currentValue, replacement),
          )
        }
      }
    }
  }
  const originalBootstrap = JSON.parse(
    await fs.readFile(path.join(root, 'catalog/bootstrap.json'), 'utf8'),
  )
  const registry = JSON.parse(await fs.readFile(path.join(root, 'registry/registry.json'), 'utf8'))
  assert.equal(
    extracted.length,
    2 + registry.items.length * 3,
    'Each current feature has a versioned dependency, exact compatibility pin and declared guide target',
  )
  assert.ok(extracted.every((entry) => entry.version === originalBootstrap.payload))
  assert.ok(extracted.some((entry) => entry.depName === 'create-payload-app'))
  assert.ok(extracted.some((entry) => entry.depName === '@payloadcms/plugin-form-builder'))
  const updatedBootstrap = JSON.parse(sources['catalog/bootstrap.json'])
  assert.equal(updatedBootstrap.generator, `create-payload-app@${replacement}`)
  assert.equal(updatedBootstrap.payload, replacement)
  assert.equal(updatedBootstrap.templateCommit, originalBootstrap.templateCommit)
  for (const item of JSON.parse(sources['registry/registry.json']).items) {
    assert.deepEqual(item.meta.payloadToolkit.payloadVersions, [replacement])
    assert.ok(
      item.dependencies.every((dependency: string) => dependency.endsWith(`@${replacement}`)),
    )
  }
  assert.match(
    sources['registry/forms/GUIDE.md'],
    new RegExp(`This item targets Payload ${replacement.replaceAll('.', '\\.')}[,]`),
  )
  const rule = config.packageRules.find(
    (entry: { groupName: string }) => entry.groupName === 'Payload v4 tuple',
  )
  assert.equal(rule.ignoreUnstable, false)
  assert.equal(rule.respectLatest, false)
  assert.equal(config.automerge, false)
})
