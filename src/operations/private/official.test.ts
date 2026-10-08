import { test } from 'bun:test'
import assert from 'node:assert/strict'
import { chmod, lstat, mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { publishOfficialSource, requireNode } from './official.js'

test('source publication reserves destination once and excludes dependency/Git trees', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'toolkit-publish-test-'))
  try {
    const source = path.join(directory, 'source')
    await mkdir(path.join(source, 'node_modules'), { recursive: true })
    await mkdir(path.join(source, '.git'))
    await Bun.write(path.join(source, 'package.json'), '{"name":"sample"}', { createPath: false })
    const destination = path.join(directory, 'destination')
    const results = await Promise.allSettled([
      publishOfficialSource(source, destination),
      publishOfficialSource(source, destination),
    ])
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1)
    assert.equal(await Bun.file(path.join(destination, 'package.json')).text(), '{"name":"sample"}')
    await assert.rejects(lstat(path.join(destination, 'node_modules')), { code: 'ENOENT' })
    await assert.rejects(lstat(path.join(destination, '.git')), { code: 'ENOENT' })
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test.skipIf(process.platform === 'win32')(
  'Payload prerequisite checks the installed Node binary instead of Bun compatibility metadata',
  async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'toolkit-node-prerequisite-'))
    const previousPath = process.env.PATH
    try {
      process.env.PATH = directory
      assert.throws(requireNode, { code: 'node-version', message: /unavailable/ })
      const executable = path.join(directory, 'node')
      for (const version of ['22.0.0', 'invalid', '24.21.0']) {
        await Bun.write(
          executable,
          `#!${process.execPath}\nconsole.log(${JSON.stringify(version)})\n`,
          { createPath: false },
        )
        await chmod(executable, 0o755)
        if (version === '24.21.0') assert.doesNotThrow(requireNode)
        else assert.throws(requireNode, { code: 'node-version' })
      }
    } finally {
      process.env.PATH = previousPath
      await rm(directory, { recursive: true, force: true })
    }
  },
)
