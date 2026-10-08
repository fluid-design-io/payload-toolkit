import { test } from 'bun:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { chmod, mkdtemp, mkdir, readdir, rename, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  acquireLease,
  canonicalTarget,
  detectPackageManager,
  requireClean,
  requireExpectedChanges,
  requireUnchanged,
  snapshot,
} from './project.js'

test('Git baseline preserves staged and working identities and rejects dirty targets', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'toolkit-git-test-'))
  try {
    execFileSync('git', ['init', '--initial-branch=main', '--quiet', directory])
    await Bun.write(path.join(directory, 'tracked.txt'), 'staged', { createPath: false })
    execFileSync('git', ['-C', directory, 'add', 'tracked.txt'])
    await Bun.write(path.join(directory, 'tracked.txt'), 'working', { createPath: false })
    await Bun.write(path.join(directory, 'untracked.txt'), 'untracked', { createPath: false })
    const index = await Bun.file(path.join(directory, '.git', 'index')).bytes()
    const objects = (
      await readdir(path.join(directory, '.git', 'objects'), { recursive: true })
    ).toSorted()
    const before = await snapshot(directory)
    assert.ok(before.git?.indexSha256)
    assert.match(before.git?.indexEntries || '', /tracked\.txt/)
    assert.deepEqual(await Bun.file(path.join(directory, '.git', 'index')).bytes(), index)
    assert.deepEqual(
      (await readdir(path.join(directory, '.git', 'objects'), { recursive: true })).toSorted(),
      objects,
    )
    assert.equal(before.files.length, 2)
    assert.throws(() => requireClean(before, false), /staged, unstaged or untracked/)
    requireClean(before, true)
    await Bun.write(path.join(directory, 'tracked.txt'), 'later', { createPath: false })
    await assert.rejects(requireUnchanged(directory, before), /changed since preflight/)
    const after = await snapshot(directory)
    requireExpectedChanges(before.root, before, after, ['tracked.txt'])
    assert.throws(
      () => requireExpectedChanges(before.root, before, after, ['unrelated.txt']),
      /Unexpected source/,
    )
    assert.deepEqual(await Bun.file(path.join(directory, '.git', 'index')).bytes(), index)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('canonical absent target and exclusive lease protect concurrent toolkit writers', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'toolkit-lease-test-'))
  const old = process.env.PAYLOAD_TOOLKIT_STATE_DIR
  process.env.PAYLOAD_TOOLKIT_STATE_DIR = path.join(directory, 'state')
  try {
    const target = await canonicalTarget(path.join(directory, 'new'))
    const release = await acquireLease(target, 'first')
    await assert.rejects(acquireLease(target, 'second'), /Another toolkit attempt/)
    await release()
    await (
      await acquireLease(target, 'third')
    )()
  } finally {
    if (old) process.env.PAYLOAD_TOOLKIT_STATE_DIR = old
    else delete process.env.PAYLOAD_TOOLKIT_STATE_DIR
    await rm(directory, { recursive: true, force: true })
  }
})

test('manager markers must agree; nearest markers determine dispatch', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'toolkit-manager-test-'))
  try {
    await Bun.write(
      path.join(directory, 'package.json'),
      JSON.stringify({ packageManager: 'pnpm@10.34.6' }),
      { createPath: false },
    )
    const project = path.join(directory, 'app')
    await mkdir(project)
    assert.equal(await detectPackageManager(project), 'pnpm')
    await Bun.write(path.join(project, 'package-lock.json'), '{}', { createPath: false })
    assert.equal(await detectPackageManager(project), 'npm')
    await Bun.write(path.join(project, 'bun.lock'), '', { createPath: false })
    await assert.rejects(detectPackageManager(project), /Conflicting/)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('a removed Git repository is a failed identity boundary, not a new source root', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'toolkit-git-disappearance-'))
  try {
    const project = path.join(directory, 'project')
    await mkdir(project)
    execFileSync('git', ['init', '--initial-branch=main', '--quiet', project])
    await Bun.write(path.join(project, 'source.txt'), 'source', { createPath: false })
    const before = await snapshot(project)
    await rename(path.join(project, '.git'), path.join(directory, 'removed-git'))
    const after = await snapshot(before.root)
    assert.ok(before.git)
    assert.equal(after.git, null)
    assert.throws(
      () => requireExpectedChanges(before.root, before, after, 'project'),
      /Git HEAD or staged changes moved/,
    )
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('an uncertain process tree retains a lease even after its parent is gone', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'toolkit-uncertain-lease-'))
  const oldState = process.env.PAYLOAD_TOOLKIT_STATE_DIR
  process.env.PAYLOAD_TOOLKIT_STATE_DIR = path.join(directory, 'state')
  try {
    const target = path.join(directory, 'project')
    const release = await acquireLease(target, 'uncertain-owner')
    await release('taskkill failed to confirm owned tree termination')
    const leases = path.join(directory, 'state', 'leases')
    const filename = path.join(leases, (await readdir(leases))[0]!)
    const record = JSON.parse(await Bun.file(filename).text()) as {
      pid: number
      recoveryRequired: boolean
    }
    assert.equal(record.recoveryRequired, true)
    record.pid = 2147483647
    await Bun.write(filename, JSON.stringify(record), { createPath: false })
    await assert.rejects(
      acquireLease(target, 'next-owner'),
      /could not confirm process-tree termination/,
    )
    assert.deepEqual(await readdir(leases), [path.basename(filename)])
  } finally {
    if (oldState) process.env.PAYLOAD_TOOLKIT_STATE_DIR = oldState
    else delete process.env.PAYLOAD_TOOLKIT_STATE_DIR
    await rm(directory, { recursive: true, force: true })
  }
})

test('an existing normal lease remains blocked after its recorded parent exits', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'toolkit-dead-lease-'))
  const oldState = process.env.PAYLOAD_TOOLKIT_STATE_DIR
  process.env.PAYLOAD_TOOLKIT_STATE_DIR = path.join(directory, 'state')
  try {
    const target = path.join(directory, 'project')
    await acquireLease(target, 'previous-owner')
    const leases = path.join(directory, 'state', 'leases')
    const filename = path.join(leases, (await readdir(leases))[0]!)
    const record = JSON.parse(await Bun.file(filename).text()) as { pid: number }
    record.pid = 2147483647
    const original = JSON.stringify(record)
    await Bun.write(filename, original, { createPath: false })
    await assert.rejects(
      acquireLease(target, 'next-owner'),
      /Review ownership and any surviving child processes/,
    )
    assert.equal(await Bun.file(filename).text(), original)
  } finally {
    if (oldState) process.env.PAYLOAD_TOOLKIT_STATE_DIR = oldState
    else delete process.env.PAYLOAD_TOOLKIT_STATE_DIR
    await rm(directory, { recursive: true, force: true })
  }
})

test.skipIf(process.platform === 'win32')(
  'Git observation failures and an unavailable Git executable block preflight',
  async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'toolkit-git-failure-test-'))
    const oldPath = process.env.PATH
    const executable = execFileSync('which', ['git'], { encoding: 'utf8' }).trim()
    try {
      execFileSync(executable, ['init', '--initial-branch=main', '--quiet', directory])
      await Bun.write(path.join(directory, 'dirty.txt'), 'untracked developer work', {
        createPath: false,
      })
      const shimDirectory = path.join(directory, 'shim')
      await mkdir(shimDirectory)
      const shim = path.join(shimDirectory, 'git')
      await Bun.write(
        shim,
        `#!${process.execPath}\nconst args=process.argv.slice(2);if(args.includes('status')){console.error('fatal: status observation refused');process.exit(128)}const result=require('child_process').spawnSync(${JSON.stringify(executable)},args,{encoding:'utf8'});process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'');process.exit(result.status??1);\n`,
        { createPath: false },
      )
      await chmod(shim, 0o700)
      process.env.PATH = shimDirectory + path.delimiter + oldPath
      await assert.rejects(snapshot(directory), {
        code: 'git-unavailable',
        message: /status observation refused/,
      })
      await rename(shim, shim + '.disabled')
      process.env.PATH = shimDirectory
      await assert.rejects(snapshot(directory), {
        code: 'git-unavailable',
        message: /Could not inspect Git/,
      })
      assert.equal(
        await Bun.file(path.join(directory, 'dirty.txt')).text(),
        'untracked developer work',
      )
    } finally {
      process.env.PATH = oldPath
      await rm(directory, { recursive: true, force: true })
    }
  },
)
