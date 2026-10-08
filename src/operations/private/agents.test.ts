import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { Feature } from '../model.js'
import { integrationPrompt } from './agents.js'

test('handoff pins installed guidance and instructs preservation of existing Git state', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'toolkit-guide-test-'))
  try {
    const guide = 'GUIDE.md'
    await writeFile(path.join(directory, guide), 'Qualified guide bytes')
    const sha256 = createHash('sha256')
      .update(await readFile(path.join(directory, guide)))
      .digest('hex')
    const feature: Feature = {
      name: 'forms',
      version: '1',
      itemPath: 'fixture.json',
      itemSha256: sha256,
      dependencies: {},
      guide,
      files: [{ path: guide, sha256, sourceSha256: sha256, role: 'guide' }],
    }
    const prompt = await integrationPrompt(directory, [feature])
    assert.match(prompt || '', new RegExp(sha256))
    assert.ok(prompt?.includes(path.join(directory, guide)))
    assert.match(prompt || '', /Do not stash, reset, stage, commit/)
    await writeFile(path.join(directory, guide), 'Developer changed guidance')
    await assert.rejects(integrationPrompt(directory, [feature]), /Installed guide differs/)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
