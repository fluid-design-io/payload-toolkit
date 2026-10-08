import { test } from 'bun:test'
import assert from 'node:assert/strict'
import { lstat, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { publishOfficialSource } from './official.js'

test('source publication reserves destination once and excludes dependency/Git trees', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'toolkit-publish-test-'))
  try {
    const source = path.join(directory, 'source')
    await mkdir(path.join(source, 'node_modules'), { recursive: true })
    await mkdir(path.join(source, '.git'))
    await writeFile(path.join(source, 'package.json'), '{"name":"sample"}')
    const destination = path.join(directory, 'destination')
    const results = await Promise.allSettled([
      publishOfficialSource(source, destination),
      publishOfficialSource(source, destination),
    ])
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1)
    assert.equal(
      await readFile(path.join(destination, 'package.json'), 'utf8'),
      '{"name":"sample"}',
    )
    await assert.rejects(lstat(path.join(destination, 'node_modules')), { code: 'ENOENT' })
    await assert.rejects(lstat(path.join(destination, '.git')), { code: 'ENOENT' })
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
