import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { add, init } from './index.js'

test('identical installed feature is repeatable and agent failure only changes strict status', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'toolkit-operation-test-'))
  const project = path.join(root, 'app')
  const oldState = process.env.PAYLOAD_TOOLKIT_STATE_DIR
  const oldPath = process.env.PATH
  process.env.PAYLOAD_TOOLKIT_STATE_DIR = path.join(root, 'state')
  process.env.PATH = root + path.delimiter + oldPath
  try {
    const gitExecutable = execFileSync(
      process.platform === 'win32' ? 'where.exe' : 'which',
      ['git'],
      { encoding: 'utf8' },
    )
      .trim()
      .split(/\r?\n/)[0]!
    await symlink(gitExecutable, path.join(root, 'git'))
    await mkdir(project)
    const item = JSON.parse(
      await readFile(new URL('../../assets/registry/forms.json', import.meta.url), 'utf8'),
    ) as { files: { target: string; content: string }[] }
    const catalog = JSON.parse(
      await readFile(new URL('../../assets/registry/catalog.json', import.meta.url), 'utf8'),
    ) as { items: { name: string; files: { path: string; sha256: string }[] }[] }
    // Use the actual qualified item bytes and fail if transformations need a fixture.
    for (const file of item.files) {
      const target = path.join(project, file.target.slice(2))
      await mkdir(path.dirname(target), { recursive: true })
      await writeFile(target, file.content)
    }
    await writeFile(
      path.join(project, 'package.json'),
      JSON.stringify({
        name: 'fixture',
        type: 'module',
        packageManager: 'npm@10.9.2',
        dependencies: {
          payload: '4.0.0-canary.38',
          next: '16.4.0',
          '@payloadcms/db-postgres': '4.0.0-canary.38',
          '@payloadcms/plugin-form-builder': '4.0.0-canary.38',
        },
      }),
    )
    const installed = path.join(project, 'node_modules/@payloadcms/plugin-form-builder')
    await mkdir(installed, { recursive: true })
    await writeFile(
      path.join(installed, 'package.json'),
      JSON.stringify({
        name: '@payloadcms/plugin-form-builder',
        version: '4.0.0-canary.38',
        main: 'index.js',
      }),
    )
    await writeFile(path.join(installed, 'index.js'), '')
    await writeFile(path.join(root, 'codex'), `#!${process.execPath}\nprocess.exit(7)\n`)
    await chmod(path.join(root, 'codex'), 0o700)
    const request = {
      directory: project,
      features: ['forms'],
      allowDirty: false,
      agent: 'none' as const,
      requireAgentSuccess: false,
    }
    const manual = await add(request)
    assert.equal(manual.installation.status, 'complete')
    if (manual.installation.status === 'complete')
      assert.equal(manual.installation.disposition, 'already-present')
    assert.equal(manual.agent.status, 'not-requested')
    if (manual.agent.status === 'not-requested')
      assert.match(manual.agent.prompt || '', /GUIDE\.md.*SHA-256/)
    assert.equal(manual.verification.status, 'not-run')
    const failed = await add({ ...request, agent: 'codex' })
    assert.equal(failed.installation.status, 'complete')
    assert.equal(failed.agent.status, 'failed')
    assert.equal(failed.exitCode, 0)
    const strict = await add({ ...request, agent: 'codex', requireAgentSuccess: true })
    assert.equal(strict.exitCode, 1)
    await rm(path.join(root, 'codex'))
    process.env.PATH = root // Explicitly exclude any real installed paid agent.
    const missing = await add({ ...request, agent: 'codex', requireAgentSuccess: true })
    assert.equal(missing.installation.status, 'complete')
    assert.equal(missing.agent.status, 'not-started')
    assert.equal(missing.exitCode, 1)
    if (missing.agent.status === 'not-started')
      assert.match(missing.agent.prompt || '', /GUIDE\.md/)
    const capturedClaude = path.join(root, 'claude-input.json')
    await writeFile(
      path.join(root, 'claude'),
      `#!${process.execPath}\nlet input='';process.stdin.on('data',x=>input+=x);process.stdin.on('end',()=>{require('fs').writeFileSync(${JSON.stringify(capturedClaude)},JSON.stringify({args:process.argv.slice(2),input})); console.log(JSON.stringify({type:'result',subtype:'success',is_error:false,permission_denials:[]}));});\n`,
    )
    await chmod(path.join(root, 'claude'), 0o700)
    const claude = await add({ ...request, agent: 'claude', requireAgentSuccess: true })
    assert.equal(claude.agent.status, 'completed')
    assert.equal(claude.exitCode, 0)
    const invocation = JSON.parse(await readFile(capturedClaude, 'utf8')) as {
      args: string[]
      input: string
    }
    assert.deepEqual(invocation.args, ['--print', '--verbose', '--output-format', 'stream-json'])
    assert.match(invocation.input, /GUIDE\.md.*SHA-256/)
    await writeFile(
      path.join(root, 'claude'),
      `#!${process.execPath}\nprocess.stdin.resume();process.stdin.on('end',()=>console.log(JSON.stringify({type:'result',subtype:'success',is_error:true,permission_denials:[{tool_name:'Edit',tool_input:{secret:'do-not-journal-this'}}]})));\n`,
    )
    const denied = await add({ ...request, agent: 'claude', requireAgentSuccess: true })
    assert.equal(denied.installation.status, 'complete')
    assert.equal(denied.agent.status, 'failed')
    assert.equal(denied.exitCode, 1)
    assert.equal(
      (await readFile(path.join(path.dirname(denied.receipt), 'journal.jsonl'), 'utf8')).includes(
        'do-not-journal-this',
      ),
      false,
    )
    await writeFile(
      path.join(root, 'codex'),
      `#!${process.execPath}\nconsole.log(JSON.stringify({type:'turn.failed',error:{message:'private-failure-message'}}));\n`,
    )
    await chmod(path.join(root, 'codex'), 0o700)
    const terminalFailure = await add({ ...request, agent: 'codex', requireAgentSuccess: true })
    assert.equal(terminalFailure.agent.status, 'failed')
    assert.equal(terminalFailure.exitCode, 1)
    assert.equal(
      (
        await readFile(path.join(path.dirname(terminalFailure.receipt), 'journal.jsonl'), 'utf8')
      ).includes('private-failure-message'),
      false,
    )
    for (const selectedAgent of ['codex', 'claude'] as const) {
      const childPid = path.join(root, selectedAgent + '-child.pid')
      await writeFile(
        path.join(root, selectedAgent),
        `#!${process.execPath}\nrequire('fs').writeFileSync(${JSON.stringify(childPid)},String(process.pid));process.stdin.resume();setInterval(()=>{},1000);\n`,
      )
      await chmod(path.join(root, selectedAgent), 0o700)
      const controller = new AbortController()
      const cancelled = await add(
        { ...request, agent: selectedAgent, requireAgentSuccess: true },
        {
          signal: controller.signal,
          onEvent(event) {
            if (event.stage === 'agent' && event.status === 'started')
              setTimeout(() => controller.abort(), 100)
          },
        },
      )
      assert.equal(cancelled.installation.status, 'complete')
      assert.equal(cancelled.agent.status, 'interrupted')
      assert.equal(cancelled.verification.status, 'not-run')
      assert.equal(cancelled.exitCode, 1)
      if (cancelled.agent.status === 'interrupted')
        assert.match(cancelled.agent.prompt, /GUIDE\.md/)
      const recordedPid = Number(await readFile(childPid, 'utf8'))
      assert.throws(() => process.kill(recordedPid, 0))
    }
    const beforeUnknown = await readFile(path.join(project, 'package.json'), 'utf8')
    const unknown = await add({ ...request, features: ['unknown'] })
    assert.equal(unknown.installation.status, 'blocked')
    assert.equal(await readFile(path.join(project, 'package.json'), 'utf8'), beforeUnknown)
    const manifestValue = JSON.parse(beforeUnknown) as { dependencies: Record<string, string> }
    manifestValue.dependencies.payload = '3.90.2'
    await writeFile(path.join(project, 'package.json'), JSON.stringify(manifestValue))
    const incompatible = await add(request)
    assert.equal(incompatible.installation.status, 'blocked')
    assert.equal(
      JSON.parse(await readFile(path.join(project, 'package.json'), 'utf8')).dependencies.payload,
      '3.90.2',
    )
    await writeFile(path.join(project, 'package.json'), beforeUnknown)
    execFileSync(gitExecutable, ['init', '--initial-branch=main', '--quiet', project])
    execFileSync(gitExecutable, ['-C', project, 'add', 'package.json'])
    await writeFile(path.join(project, 'package.json'), beforeUnknown + '\n')
    await writeFile(
      path.join(root, 'codex'),
      `#!${process.execPath}\nrequire('child_process').execFileSync(${JSON.stringify(gitExecutable)},['add','docs/payload-toolkit/forms/GUIDE.md'],{cwd:process.cwd()});console.log(JSON.stringify({type:'turn.completed'}));\n`,
    )
    const stagedByInvocation = await add({
      ...request,
      allowDirty: true,
      agent: 'codex',
      requireAgentSuccess: true,
    })
    assert.equal(stagedByInvocation.installation.status, 'complete')
    assert.equal(stagedByInvocation.agent.status, 'failed')
    assert.equal(stagedByInvocation.exitCode, 1)
    if (stagedByInvocation.agent.status === 'failed') {
      assert.match(stagedByInvocation.agent.reason, /staged index changed during invocation/)
      assert.match(stagedByInvocation.agent.prompt, /GUIDE\.md/)
    }
    assert.equal(
      execFileSync(gitExecutable, ['-C', project, 'show', ':package.json'], { encoding: 'utf8' }),
      beforeUnknown,
    )
    assert.equal(stagedByInvocation.verification.status, 'not-run')
    const guide = catalog.items
      .find((entry) => entry.name === 'forms')!
      .files.find((file) => file.path.endsWith('GUIDE.md'))!
    await writeFile(path.join(project, guide.path), 'developer edit')
    const collision = await add({ ...request, allowDirty: true })
    assert.equal(collision.installation.status, 'blocked')
    assert.equal(await readFile(path.join(project, guide.path), 'utf8'), 'developer edit')
  } finally {
    if (oldState) process.env.PAYLOAD_TOOLKIT_STATE_DIR = oldState
    else delete process.env.PAYLOAD_TOOLKIT_STATE_DIR
    process.env.PATH = oldPath
    await rm(root, { recursive: true, force: true })
  }
})

test('init refuses an existing target without modifying its source', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'toolkit-existing-test-'))
  const oldState = process.env.PAYLOAD_TOOLKIT_STATE_DIR
  process.env.PAYLOAD_TOOLKIT_STATE_DIR = path.join(root, 'state')
  try {
    const target = path.join(root, 'app')
    await mkdir(target)
    await writeFile(path.join(target, 'owned.txt'), 'developer')
    const result = await init({
      directory: target,
      framework: 'next',
      database: 'postgres',
      template: 'minimal',
      packageManager: 'npm',
      features: [],
      allowDirty: false,
      agent: 'none',
      requireAgentSuccess: false,
    })
    assert.equal(result.installation.status, 'blocked')
    assert.equal(await readFile(path.join(target, 'owned.txt'), 'utf8'), 'developer')
  } finally {
    if (oldState) process.env.PAYLOAD_TOOLKIT_STATE_DIR = oldState
    else delete process.env.PAYLOAD_TOOLKIT_STATE_DIR
    await rm(root, { recursive: true, force: true })
  }
})
