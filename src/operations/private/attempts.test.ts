import { test } from 'bun:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import {
  Attempt,
  redact,
  resolveWindowsCommand,
  runProcess,
  terminateWindowsTree,
} from './attempts.js'

test('failed process evidence keeps useful diagnostics while removing credentials', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'toolkit-attempt-test-'))
  const old = process.env.PAYLOAD_TOOLKIT_STATE_DIR
  process.env.PAYLOAD_TOOLKIT_STATE_DIR = path.join(directory, 'state')
  try {
    const secret = 'credential-for-owner-test'
    await Bun.write(path.join(directory, '.env'), `PAYLOAD_SECRET=${secret}\n`, {
      createPath: false,
    })
    const attempt = new Attempt()
    await attempt.start('add', directory)
    await assert.rejects(
      runProcess(
        process.execPath,
        ['-e', `console.error('codegen failed ${secret}'); process.exit(1)`],
        { cwd: directory, attempt },
      ),
      /codegen failed \[redacted\]/,
    )
    const journal = await Bun.file(path.join(attempt.directory, 'journal.jsonl')).text()
    assert.match(journal, /codegen failed/)
    assert.equal(journal.includes(secret), false)
    assert.equal(
      redact('postgresql://user:password@localhost/database').includes('password'),
      false,
    )
  } finally {
    if (old) process.env.PAYLOAD_TOOLKIT_STATE_DIR = old
    else delete process.env.PAYLOAD_TOOLKIT_STATE_DIR
    await rm(directory, { recursive: true, force: true })
  }
})

test('abort terminates an owned process and records interruption', async () => {
  const controller = new AbortController()
  const started = runProcess(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
    cwd: tmpdir(),
    signal: controller.signal,
  })
  setTimeout(() => controller.abort(), 50)
  await assert.rejects(started, /interrupted/)
})

test.skipIf(process.platform === 'win32')(
  'abort kills an ignoring grandchild even when its parent closes its pipes',
  async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'toolkit-tree-test-'))
    const pidFile = path.join(directory, 'grandchild.pid')
    const heartbeat = path.join(directory, 'heartbeat')
    let pid: number | undefined
    try {
      const grandchild = `const fs=require('fs');process.on('SIGTERM',()=>{});fs.writeFileSync(${JSON.stringify(pidFile)},String(process.pid));fs.appendFileSync(${JSON.stringify(heartbeat)},'.');setInterval(()=>fs.appendFileSync(${JSON.stringify(heartbeat)},'.'),10);`
      const parent = `process.on('SIGTERM',()=>process.exit(0));require('child_process').spawn(process.execPath,['-e',${JSON.stringify(grandchild)}],{stdio:'ignore'});setInterval(()=>{},1000);`
      const controller = new AbortController()
      const rejected = assert.rejects(
        runProcess(process.execPath, ['-e', parent], { cwd: directory, signal: controller.signal }),
        /interrupted/,
      )
      for (let tries = 0; tries < 250; tries++) {
        const recorded = await Bun.file(pidFile)
          .text()
          .catch(() => '')
        if (recorded) {
          pid = Number(recorded)
          break
        }
        await delay(20)
      }
      assert.ok(pid, 'grandchild started before cancellation')
      controller.abort()
      await rejected
      const stopped = await Bun.file(heartbeat).text()
      await delay(2250)
      assert.equal(await Bun.file(heartbeat).text(), stopped)
    } finally {
      if (pid) {
        try {
          process.kill(pid, 'SIGKILL')
        } catch {}
      }
      await rm(directory, { recursive: true, force: true })
    }
  },
)

test('Windows package manager wrappers resolve to JavaScript without shell argument parsing', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'toolkit-launcher-test-'))
  try {
    const cli = path.join(directory, 'node_modules/pnpm/bin/pnpm.cjs')
    await mkdir(path.dirname(cli), { recursive: true })
    await Bun.write(cli, '', { createPath: false })
    await Bun.write(
      path.join(directory, 'pnpm.cmd'),
      '@echo off\r\n"%dp0%\\node_modules\\pnpm\\bin\\pnpm.cjs" %*\r\n',
      { createPath: false },
    )
    const args = ['install', 'value & echo unsafe']
    assert.deepEqual(
      await resolveWindowsCommand(
        'pnpm',
        args,
        { PATH: directory },
        path.join(directory, 'node.exe'),
      ),
      { executable: path.join(directory, 'node.exe'), args: [cli, ...args] },
    )
    await assert.rejects(
      resolveWindowsCommand('npm', [], { PATH: directory }, path.join(directory, 'node.exe')),
      /Cannot locate/,
    )
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('Windows tree termination refuses both failed execution and a missing taskkill launcher', async () => {
  await assert.rejects(terminateWindowsTree(process.pid, process.execPath), {
    code: 'termination-unconfirmed',
    message: /Could not confirm termination/,
  })
  await assert.rejects(
    terminateWindowsTree(process.pid, path.join(tmpdir(), 'missing-toolkit-taskkill')),
    { code: 'termination-unconfirmed' },
  )
})
