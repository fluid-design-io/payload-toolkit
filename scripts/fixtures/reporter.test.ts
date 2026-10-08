import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'bun:test'
import { validateRuntimeChanges } from './runtime-source.js'
import { hasSubmissionNotification } from './notification.js'
import { command, type Evidence, selectedSourceHash, stop } from './support.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const sha = 'a'.repeat(40)
function zip(name: string, data: string, declaredSize?: number) {
  const filename = Buffer.from(name)
  const content = Buffer.from(data)
  const local = Buffer.alloc(30)
  local.writeUInt32LE(0x04034b50)
  local.writeUInt32LE(content.length, 18)
  local.writeUInt32LE(content.length, 22)
  local.writeUInt16LE(filename.length, 26)
  const central = Buffer.alloc(46)
  central.writeUInt32LE(0x02014b50)
  central.writeUInt32LE(content.length, 20)
  central.writeUInt32LE(declaredSize ?? content.length, 24)
  central.writeUInt16LE(filename.length, 28)
  const offset = local.length + filename.length + content.length
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50)
  end.writeUInt16LE(1, 8)
  end.writeUInt16LE(1, 10)
  end.writeUInt32LE(central.length + filename.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([local, filename, content, central, filename, end]).toString('base64')
}
async function drive(
  options: {
    badWorkflow?: boolean
    stale?: boolean
    evidenceSha?: string
    filename?: string
    size?: number
    failedJob?: boolean
    missingInstallation?: boolean
    installation?: boolean
    cancelledJob?: boolean
    unknownConclusion?: string
    artifactId?: number | string
    artifactName?: string
    expired?: boolean
    expiresAt?: string
    baseSha?: string
  } = {},
) {
  const directory = await fs.mkdtemp(path.join(tmpdir(), 'toolkit-reporter-test-'))
  const artifact = {
    schemaVersion: 1,
    source: { revision: options.evidenceSha ?? sha },
    mode: options.installation ? 'installation-only' : 'runtime',
    packageManager: options.installation ? 'npm' : 'pnpm',
    framework: 'next',
    database: 'postgres',
    status: 'passed',
    checks: [],
    cleanup: { status: 'complete' },
  }
  const jobs = [
    'checks',
    'runtime (next, postgres)',
    'runtime (next, mongodb)',
    'runtime (tanstack, postgres)',
    'runtime (tanstack, mongodb)',
    'cli (windows-latest)',
    'cli (macos-latest)',
    'installation (npm)',
    'installation (bun)',
  ]
  const responses = {
    '/repos/fixture/toolkit/actions/runs/7': {
      workflow_id: 9,
      repository: { full_name: 'fixture/toolkit' },
      status: 'completed',
      event: 'pull_request',
      head_sha: sha,
      pull_requests: [{ number: 2 }],
      conclusion: 'success',
    },
    '/repos/fixture/toolkit/actions/workflows/9': {
      path: options.badWorkflow
        ? '.github/workflows/untrusted.yml'
        : '.github/workflows/verify.yml',
    },
    '/repos/fixture/toolkit/pulls/2': {
      number: 2,
      state: 'open',
      base: { repo: { full_name: 'fixture/toolkit' }, sha: options.baseSha ?? 'd'.repeat(40) },
      head: { sha: options.stale ? 'b'.repeat(40) : sha },
    },
    '/repos/fixture/toolkit/actions/runs/7/jobs': {
      total_count: options.missingInstallation ? 8 : 9,
      jobs: jobs
        .filter((name) => !options.missingInstallation || name !== 'installation (bun)')
        .map((name, index) => ({
          name,
          conclusion:
            options.failedJob && index === 1
              ? 'failure'
              : options.cancelledJob && index === 2
                ? 'cancelled'
                : index === 0 && options.unknownConclusion
                  ? options.unknownConclusion
                  : 'success',
        })),
    },
    '/repos/fixture/toolkit/actions/runs/7/artifacts': {
      total_count: 1,
      artifacts: [
        {
          id: options.artifactId ?? 1,
          name:
            options.artifactName ??
            (options.installation ? 'toolkit-installation-npm' : 'toolkit-evidence-next-postgres'),
          expired: options.expired ?? false,
          expires_at: options.expiresAt ?? '2099-10-21T00:00:00Z',
          archive_download_url: 'https://untrusted.example/steal-token',
          html_url: 'https://untrusted.example/[injected](url)',
          size_in_bytes: 1000,
        },
      ],
    },
    '/repos/fixture/toolkit/issues/2/comments': [
      {
        id: 42,
        user: { login: 'github-actions[bot]' },
        body: '<!-- payload-toolkit-proof --> previous',
      },
    ],
  }
  try {
    await Bun.write(
      path.join(directory, 'fixture.json'),
      JSON.stringify({
        responses,
        zip: zip(options.filename ?? 'proof/evidence.json', JSON.stringify(artifact), options.size),
      }),
      { createPath: false },
    )
    await Bun.write(
      path.join(directory, 'event.json'),
      JSON.stringify({ workflow_run: { id: 7 } }),
      { createPath: false },
    )
    const child = spawn(
      process.execPath,
      [
        '--preload',
        path.join(root, 'scripts/fixtures/mock-github.mjs'),
        path.join(root, 'scripts/trusted-report.mjs'),
      ],
      {
        env: {
          ...process.env,
          GITHUB_TOKEN: 'fixture-only-no-real-token',
          GITHUB_REPOSITORY: 'fixture/toolkit',
          GITHUB_EVENT_PATH: path.join(directory, 'event.json'),
          TOOLKIT_REPORT_FIXTURE: path.join(directory, 'fixture.json'),
          TOOLKIT_REPORT_OUTPUT: path.join(directory, 'comment.json'),
        },
        stdio: 'pipe',
      },
    )
    let stderr = ''
    child.stderr.on('data', (data) => {
      stderr += data.toString()
    })
    const code = await new Promise((resolve) => child.on('close', resolve))
    const output = await Bun.file(path.join(directory, 'comment.json'))
      .text()
      .then(JSON.parse, () => null)
    return { code, output, stderr }
  } finally {
    await fs.rm(directory, { recursive: true })
  }
}
test('trusted reporter consolidates platform conclusions and separate contributed claims', async () => {
  const result = await drive()
  assert.equal(result.code, 0)
  assert.match(result.output.body, /\| Checks \| ✅ 1\/1 passed \|/)
  assert.match(result.output.body, /\| Installation \| ✅ 4\/4 passed \|/)
  assert.match(result.output.body, /\| Forms runtime \| ✅ 4\/4 passed \|/)
  assert.equal(
    result.output.body.split('\n').filter((line: string) => line.startsWith('|')).length,
    5,
  )
  assert.match(result.output.body, /Parsed receipts: runtime: 1 passed/)
  assert.match(result.output.body, /contributed claims, separate from GitHub job conclusions/)
})
test('trusted reporter marks changed PR heads stale and platform failures unsuccessful', async () => {
  const result = await drive({ stale: true, failedJob: true })
  assert.equal(result.code, 0)
  assert.match(result.output.body, /result is stale/)
  assert.match(
    result.output.body,
    /\| Forms runtime \| 3\/4 passed; Next \/ Postgres: ❌ Failed \|/,
  )
})
test('trusted reporter refuses a different workflow without a write', async () => {
  const result = await drive({ badWorkflow: true })
  assert.equal(result.code, 1)
  assert.equal(result.output, null)
})
test('wrong-revision evidence is not admitted', async () => {
  const result = await drive({ evidenceSha: 'c'.repeat(40) })
  assert.equal(result.code, 0)
  assert.match(result.output.body, /no admitted evidence/)
})
test('traversing and oversized evidence entries cannot provide a passed claim', async () => {
  for (const options of [{ filename: '../evidence.json' }, { size: 250001 }]) {
    const result = await drive(options)
    assert.equal(result.code, 0)
    assert.match(result.output.body, /runtime: 1 unreadable/)
    assert.doesNotMatch(result.output.body, /runtime: 1 passed/)
  }
})
test('trusted reporter preserves failed, cancelled and missing cells within compact groups', async () => {
  const result = await drive({ failedJob: true, cancelledJob: true, missingInstallation: true })
  assert.equal(result.code, 0)
  assert.match(result.output.body, /Installation \| 3\/4 passed; Install \/ Bun: Missing/)
  assert.match(
    result.output.body,
    /Forms runtime \| 2\/4 passed; Next \/ Postgres: ❌ Failed; Next \/ MongoDB: Cancelled/,
  )
  assert.match(result.output.body, /Parsed receipts: runtime: 1 passed/)
  assert.doesNotMatch(result.output.body, /Forms runtime \| ✅/)
})
test('trusted reporter links the tested code and GitHub artifact with its expiration', async () => {
  const result = await drive({ stale: true })
  assert.equal(result.code, 0)
  assert.match(result.output.body, new RegExp(`compare/${'d'.repeat(40)}\\.\\.\\.${sha}`))
  assert.match(result.output.body, new RegExp(`commit/${sha}`))
  assert.match(
    result.output.body,
    /\[Next \/ Postgres\]\(https:\/\/github.com\/fixture\/toolkit\/actions\/runs\/7\/artifacts\/1\)/,
  )
  assert.match(result.output.body, /Artifact expiry: 2099-10-21/)
  assert.doesNotMatch(result.output.body, /untrusted\.example/)
  assert.doesNotMatch(result.output.body, new RegExp(`compare/[^\\s]*${'b'.repeat(40)}`))
})
test('expired, invalid and unrecognized artifacts never provide download links or claims', async () => {
  for (const options of [
    { expired: true },
    { expiresAt: '2000-01-01T00:00:00Z' },
    { artifactId: -1 },
    { artifactId: 0 },
    { artifactId: Number.MAX_SAFE_INTEGER + 1 },
    { artifactId: '1/../../injected' },
    { artifactName: 'toolkit-evidence-next-postgres | [injected](https://untrusted.example)' },
  ]) {
    const result = await drive(options)
    assert.equal(result.code, 0)
    assert.match(
      result.output.body,
      options.expired || 'expiresAt' in options
        ? /Next \/ Postgres: expired/
        : /Next \/ Postgres: unavailable/,
    )
    assert.match(result.output.body, /no admitted evidence/)
    assert.doesNotMatch(result.output.body, /\/artifacts\//)
    assert.doesNotMatch(result.output.body, /injected|untrusted\.example/)
  }
})
test('untrusted conclusion and expiry values cannot inject markdown', async () => {
  const result = await drive({
    unknownConclusion: 'success | [injected](https://untrusted.example)',
    expiresAt: '| [injected](url)',
  })
  assert.equal(result.code, 0)
  assert.match(result.output.body, /Checks \| 0\/1 passed; Checks and packed CLI: Unknown/)
  assert.doesNotMatch(result.output.body, /injected|untrusted\.example/)
})
test('an invalid comparison revision rejects the report before writing', async () => {
  const result = await drive({ baseSha: '[injected](url)' })
  assert.equal(result.code, 1)
  assert.equal(result.output, null)
})
test('notification correlates submission identity within the same real logger event', () => {
  assert.equal(
    hasSubmissionNotification(
      '[12:01:11] INFO: Form submission received\n    submissionId: 1\n',
      1,
    ),
    true,
  )
  assert.equal(
    hasSubmissionNotification('{"msg":"Form submission received","submissionId":"abc"}\n', 'abc'),
    true,
  )
  assert.equal(
    hasSubmissionNotification(
      '[12:01:11] INFO: Form submission received\n    submissionId: 2\n',
      1,
    ),
    false,
  )
  assert.equal(
    hasSubmissionNotification(
      '[12:01:11] INFO: Form submission received\n[12:01:12] INFO: unrelated\n    submissionId: 1\n',
      1,
    ),
    false,
  )
})
test('selected source hashes symlink identity without traversing its outside directory', async () => {
  const directory = await fs.mkdtemp(path.join(tmpdir(), 'toolkit-source-test-'))
  try {
    await fs.mkdir(path.join(directory, 'outside'))
    await Bun.write(path.join(directory, 'outside/private.txt'), 'first outside value', {
      createPath: false,
    })
    await fs.mkdir(path.join(directory, 'repository'))
    await fs.symlink(
      '../outside',
      path.join(directory, 'repository/link'),
      process.platform === 'win32' ? 'junction' : 'dir',
    )
    await Bun.write(path.join(directory, 'repository/source.ts'), 'export const value = 1\n', {
      createPath: false,
    })
    const original = await selectedSourceHash(path.join(directory, 'repository'), [
      'link',
      'source.ts',
      'deleted.ts',
    ])
    await Bun.write(path.join(directory, 'outside/private.txt'), 'changed outside value', {
      createPath: false,
    })
    assert.equal(
      await selectedSourceHash(path.join(directory, 'repository'), [
        'link',
        'source.ts',
        'deleted.ts',
      ]),
      original,
    )
    await Bun.write(path.join(directory, 'repository/source.ts'), 'export const value = 2\n', {
      createPath: false,
    })
    assert.notEqual(
      await selectedSourceHash(path.join(directory, 'repository'), [
        'link',
        'source.ts',
        'deleted.ts',
      ]),
      original,
    )
    await assert.rejects(selectedSourceHash(directory, ['outside']), /Unexpected directory/)
  } finally {
    await fs.rm(directory, { recursive: true })
  }
})

test.skipIf(process.platform === 'win32')(
  'timed-out command kills its TERM-resistant heartbeat grandchild and retains failure evidence',
  async () => {
    const directory = await fs.mkdtemp(path.join(tmpdir(), 'toolkit-command-test-'))
    const heartbeat = path.join(directory, 'heartbeat.txt')
    const pidFile = path.join(directory, 'grandchild.pid')
    const evidence = { commands: [] } as unknown as Evidence
    const grandchild = `const fs=require('node:fs'); process.on('SIGTERM',()=>{}); fs.writeFileSync(${JSON.stringify(pidFile)}, String(process.pid)); setInterval(()=>fs.appendFileSync(${JSON.stringify(heartbeat)}, 'beat\\n'),20);`
    const wrapper = `const {spawn}=require('node:child_process'); process.on('SIGTERM',()=>{}); spawn(process.execPath,['-e',${JSON.stringify(grandchild)}],{stdio:'inherit'}); setInterval(()=>{},1000);`
    try {
      await assert.rejects(
        command(process.execPath, ['-e', wrapper], {
          cwd: directory,
          directory,
          evidence,
          timeout: 1000,
        }),
        /failed \(timeout\)/,
      )
      assert.ok(Number(await Bun.file(pidFile).text()) > 0)
      const before = await Bun.file(heartbeat).text()
      assert.ok(before.length > 0, 'the real descendant produced a heartbeat before cancellation')
      await new Promise((resolve) => setTimeout(resolve, 150))
      assert.equal(
        await Bun.file(heartbeat).text(),
        before,
        'the descendant stopped writing after the timeout',
      )
      assert.equal(evidence.commands[0].termination, 'timeout')
      assert.notEqual(evidence.commands[0].exitCode, 0)
      assert.ok(await fs.stat(path.join(directory, evidence.commands[0].log)))
    } finally {
      // No delayed PID kill: cancellation owns the live group and this fixture only
      // checks the descendant's observable heartbeat, then removes its own files.
      await fs.rm(directory, { recursive: true, force: true })
    }
  },
)

test.skipIf(process.platform === 'win32')(
  'server stop kills the live owned group including a TERM-resistant grandchild',
  async () => {
    const directory = await fs.mkdtemp(path.join(tmpdir(), 'toolkit-server-stop-test-'))
    const heartbeat = path.join(directory, 'heartbeat.txt')
    const grandchild = `const fs=require('node:fs'); process.on('SIGTERM',()=>{}); setInterval(()=>fs.appendFileSync(${JSON.stringify(heartbeat)}, 'beat\\n'),20);`
    const wrapper = `require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(grandchild)}],{stdio:'inherit'}); setInterval(()=>{},1000);`
    const child = spawn(process.execPath, ['-e', wrapper], { detached: true, stdio: 'ignore' })
    try {
      for (let attempt = 0; attempt < 100; attempt++) {
        if (await fs.stat(heartbeat).catch(() => null)) break
        await new Promise((resolve) => setTimeout(resolve, 20))
      }
      assert.ok((await Bun.file(heartbeat).text()).length > 0)
      await stop(child)
      const before = await Bun.file(heartbeat).text()
      await new Promise((resolve) => setTimeout(resolve, 150))
      assert.equal(await Bun.file(heartbeat).text(), before)
      await assert.rejects(stop(child), /already exited/)
    } finally {
      if (child.exitCode === null && child.signalCode === null) await stop(child)
      await fs.rm(directory, { recursive: true, force: true })
    }
  },
)

test('trusted reporter requires every installation job and labels installation claims separately', async () => {
  const missing = await drive({ missingInstallation: true })
  assert.equal(missing.code, 0)
  assert.match(missing.output.body, /Installation \| 3\/4 passed; Install \/ Bun: Missing/)
  const installed = await drive({ installation: true })
  assert.equal(installed.code, 0)
  assert.match(installed.output.body, /Parsed receipts: installation-only: 1 passed/)
  assert.doesNotMatch(installed.output.body, /Parsed receipts: runtime/)
})

test('runtime source checking allows exact recorded generated outputs and rejects every other drift', () => {
  const before = { 'src/config.ts': 'stable', 'next-env.d.ts': 'build-types' }
  const after = {
    'src/config.ts': 'stable',
    'next-env.d.ts': 'dev-types',
    'AGENTS.md': 'canonical-next-block',
  }
  const expected = { 'next-env.d.ts': 'dev-types', 'AGENTS.md': 'canonical-next-block' }
  assert.deepEqual(validateRuntimeChanges(before, after, expected), ['AGENTS.md', 'next-env.d.ts'])
  assert.throws(
    () => validateRuntimeChanges(before, { ...after, 'src/config.ts': 'changed' }, expected),
    /Unexpected runtime source change/,
  )
  assert.throws(
    () =>
      validateRuntimeChanges(
        before,
        { ...after, 'AGENTS.md': 'canonical-next-block-plus-arbitrary-content' },
        expected,
      ),
    /differs from its exact expected content/,
  )
  assert.throws(
    () => validateRuntimeChanges(before, { 'src/config.ts': 'stable' }, expected),
    /differs from its exact expected content/,
  )
})
