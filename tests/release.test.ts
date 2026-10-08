import assert from 'node:assert/strict'
import { test } from 'bun:test'
const {
  validateSource,
  validatePack,
  validateReceipts,
  validatePublished,
  validateEnvironment,
  validateAlpha,
} = await import(new URL('../scripts/release.mjs', import.meta.url).href)

const version = '0.1.0-alpha.1'
const sha = 'a'.repeat(40)
const artifact = 'b'.repeat(64)
const manifest = {
  name: 'payload-toolkit',
  version,
  publishConfig: { tag: 'alpha', access: 'public', registry: 'https://registry.npmjs.org/' },
  repository: { url: 'git+https://github.com/example/toolkit.git' },
}
const pack = {
  name: 'payload-toolkit',
  version,
  filename: `payload-toolkit-${version}.tgz`,
  files: [
    'dist/cli.js',
    'assets/registry/forms.json',
    'catalog/bootstrap.json',
    'package.json',
    'README.md',
    'LICENSE.md',
  ].map((path) => ({ path })),
}
const receipt = (
  mode: string,
  framework = 'next',
  database = 'postgres',
  packageManager = 'pnpm',
) => ({
  mode,
  framework,
  database,
  packageManager,
  status: 'passed',
  source: { revision: sha, dirty: false },
  identities: { packedPackage: artifact },
  cleanup: { status: 'complete' },
})
const receipts = [
  receipt('cli-only'),
  ...['next', 'tanstack'].flatMap((framework) =>
    ['postgres', 'mongodb'].map((database) => receipt('runtime', framework, database)),
  ),
  ...['npm', 'bun', 'pnpm', 'pnpm'].map((manager) =>
    receipt('installation-only', 'next', 'postgres', manager),
  ),
]

test('release policy requires an exact alpha version and matching publishing repository', () => {
  validateSource(manifest, version, 'example/toolkit')
  for (const rejected of [
    '0.1.0',
    '0.1.0-beta.1',
    '0.1.0-alpha.01',
    '0.1.0-alpha.2',
    '$(touch injected)',
  ])
    assert.throws(() => validateSource(manifest, rejected, 'example/toolkit'))
  assert.throws(() => validateSource(manifest, version, 'other/toolkit'))
  assert.throws(() =>
    validateSource(
      { ...manifest, publishConfig: { ...manifest.publishConfig, tag: 'latest' } },
      version,
      'example/toolkit',
    ),
  )
})

test('release package inspection rejects credentials, unrelated source and missing CLI', () => {
  validatePack(pack, version)
  for (const path of [
    '.env',
    '.npmrc',
    'src/cli.ts',
    'dist/../../secret.js',
    'screenshots/proof.png',
  ])
    assert.throws(() => validatePack({ ...pack, files: [...pack.files, { path }] }, version))
  assert.throws(() => validatePack({ ...pack, files: pack.files.slice(1) }, version))
})

test('release requires every matrix cell to qualify the exact clean source and artifact', () => {
  validateReceipts(receipts, sha, artifact)
  assert.throws(() => validateReceipts(receipts.slice(1), sha, artifact))
  for (const change of [
    { status: 'failed' },
    { source: { revision: sha, dirty: true } },
    { identities: { packedPackage: 'different' } },
    { cleanup: { status: 'failed' } },
  ])
    assert.throws(() =>
      validateReceipts([{ ...receipts[0], ...change }, ...receipts.slice(1)], sha, artifact),
    )
  assert.throws(() =>
    validateReceipts([receipts[0], receipts[1], receipts[1], ...receipts.slice(3)], sha, artifact),
  )
})

test('an already published version is resumable only with identical registry integrity', () => {
  validatePublished(
    { version, dist: { integrity: 'sha512-qualified' } },
    'sha512-qualified',
    version,
  )
  assert.throws(() =>
    validatePublished(
      { version, dist: { integrity: 'sha512-other' } },
      'sha512-qualified',
      version,
    ),
  )
})

test('release environment must require review and exactly the default branch', () => {
  const environment = {
    protection_rules: [{ type: 'required_reviewers', reviewers: [{ id: 1 }] }],
    deployment_branch_policy: { custom_branch_policies: true },
  }
  const policies = { branch_policies: [{ name: 'main', type: 'branch' }] }
  validateEnvironment(environment, policies, 'main')
  assert.throws(() =>
    validateEnvironment({ ...environment, protection_rules: [] }, policies, 'main'),
  )
  assert.throws(() => validateEnvironment(environment, { branch_policies: [] }, 'main'))
  assert.throws(() =>
    validateEnvironment(
      environment,
      { branch_policies: [...policies.branch_policies, { name: '*', type: 'branch' }] },
      'main',
    ),
  )
  assert.throws(() => validateEnvironment(environment, policies, 'other'))
  assert.throws(() =>
    validateEnvironment(environment, { branch_policies: [{ name: 'main', type: 'tag' }] }, 'main'),
  )
})

test('actual npm package allowlist includes the shipped source maps', async () => {
  const { execFileSync } = await import('node:child_process')
  const [actual] = JSON.parse(
    execFileSync('npm', ['pack', '--dry-run', '--ignore-scripts', '--json'], { encoding: 'utf8' }),
  )
  assert(actual.files.some((file: { path: string }) => file.path.endsWith('.js.map')))
  validatePack(actual, actual.version)
})

test('publication gates precede writes and matching publication can resume safely', async () => {
  const { execFileSync } = await import('node:child_process')
  const { mkdtemp, mkdir, rm } = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const { createHash } = await import('node:crypto')
  const helper = new URL('../scripts/release.mjs', import.meta.url).href
  const scenarios = [
    'success',
    'ambiguous',
    'existing',
    'bad-environment',
    'bad-artifact',
    'bad-tag',
    'bad-registry',
    'changed-latest',
    'failed-consumer',
    'older-alpha',
  ]
  for (const scenario of scenarios) {
    const cwd = await mkdtemp(join(tmpdir(), 'toolkit-release-policy-'))
    try {
      const release = join(cwd, '.scratch/release')
      await mkdir(release, { recursive: true })
      await Bun.write(join(cwd, 'package.json'), JSON.stringify(manifest), { createPath: false })
      const bytes = Buffer.from('qualified-fixture-tarball')
      const sha256 = createHash('sha256').update(bytes).digest('hex')
      const integrity = `sha512-${createHash('sha512').update(bytes).digest('base64')}`
      await Bun.write(join(release, pack.filename), bytes, { createPath: false })
      await Bun.write(join(release, 'pack.json'), JSON.stringify(pack), { createPath: false })
      await Bun.write(
        join(release, 'artifact.json'),
        JSON.stringify({
          name: manifest.name,
          version,
          sha,
          repository: 'example/toolkit',
          sha256: scenario === 'bad-artifact' ? 'different' : sha256,
          integrity,
        }),
        { createPath: false },
      )
      await Bun.write(
        join(release, 'verification.json'),
        JSON.stringify(
          receipts.map((entry) => ({ ...entry, identities: { packedPackage: sha256 } })),
        ),
        { createPath: false },
      )
      const code = `
        import fs from 'node:fs';
        import path from 'node:path';
        import childProcess from 'node:child_process';
        const events = [];
        const scenario = ${JSON.stringify(scenario)};
        const sha = ${JSON.stringify(sha)};
        const version = ${JSON.stringify(version)};
        const integrity = ${JSON.stringify(integrity)};
        let published = ['existing', 'bad-registry'].includes(scenario);
        childProcess.spawnSync = (file, args, options) => {
          if (file === 'git') return { status: 0, stdout: args[0] === 'rev-parse' ? sha : '', stderr: '' };
          if (file === 'npm' && args[0] === 'publish') {
            events.push('publish'); published = true;
            return { status: scenario === 'ambiguous' ? 1 : 0, stdout: '', stderr: 'controlled response' };
          }
          if (file === 'npm' && args[0] === 'install') {
            events.push('consumer');
            if (scenario === 'failed-consumer') return { status: 1, stdout: '', stderr: 'controlled consumer failure' };
            const target = path.join(options.cwd, 'node_modules/payload-toolkit');
            fs.mkdirSync(target, { recursive: true });
            fs.writeFileSync(path.join(target, 'package.json'), JSON.stringify({ version }));
            return { status: 0, stdout: 'installed', stderr: '' };
          }
          return { status: args.includes('unknown-command') ? 2 : 0, stdout: 'init add', stderr: '' };
        };
        globalThis.fetch = async (url, options = {}) => {
          const method = options.method ?? 'GET';
          let status = 200; let body = {};
          if (url.endsWith('/environments/npm-release')) body = { protection_rules: scenario === 'bad-environment' ? [] : [{ type: 'required_reviewers', reviewers: [{ id: 1 }] }], deployment_branch_policy: { custom_branch_policies: true } };
          else if (url.endsWith('/deployment-branch-policies')) body = { branch_policies: [{ name: 'main', type: 'branch' }] };
          else if (url.includes('/git/ref/tags/')) { if (scenario === 'bad-tag') body = { object: { sha: 'wrong' } }; else status = 404; }
          else if (url.includes('/commits/')) body = { sha: 'wrong' };
          else if (url.includes('/releases/tags/')) status = 404;
          else if (url.endsWith('/dist-tags')) body = { alpha: scenario === 'older-alpha' ? '0.1.0-alpha.2' : version, latest: published && scenario === 'changed-latest' ? version : '0.0.1' };
          else if (url.startsWith('https://registry.npmjs.org/')) { if (!published) status = 404; else body = { version, dist: { integrity: scenario === 'bad-registry' ? 'wrong' : integrity } }; }
          else if (url.endsWith('/git/refs') && method === 'POST') events.push('tag');
          else if (url.endsWith('/releases/generate-notes')) { events.push('notes'); body = { body: 'Changes' }; }
          else if (url.endsWith('/releases') && method === 'POST') { events.push('release'); body = { html_url: 'https://github.com/example/toolkit/releases/tag/v' + version }; }
          else throw new Error('Unexpected URL ' + url);
          return { status, ok: status === 200, json: async () => body };
        };
        const { publish } = await import(${JSON.stringify(helper)});
        let error;
        try { await publish(); } catch (caught) { error = caught.message; }
        console.log(JSON.stringify({ events, error }));
      `
      const result = JSON.parse(
        execFileSync(process.execPath, ['--input-type=module', '--eval', code], {
          cwd,
          encoding: 'utf8',
          env: {
            ...process.env,
            RELEASE_VERSION: version,
            GITHUB_SHA: sha,
            GITHUB_REPOSITORY: 'example/toolkit',
            GITHUB_EVENT_NAME: 'workflow_dispatch',
            GITHUB_REF: 'refs/heads/main',
            RELEASE_DEFAULT_BRANCH: 'main',
            GH_TOKEN: 'controlled-test-token',
            GITHUB_STEP_SUMMARY: '',
          },
        }),
      )
      if (['success', 'ambiguous', 'existing'].includes(scenario)) {
        assert.equal(result.error, undefined, scenario)
        assert.deepEqual(
          result.events,
          [...(scenario === 'existing' ? [] : ['publish']), 'consumer', 'tag', 'notes', 'release'],
          scenario,
        )
      } else {
        assert(result.error, scenario)
        assert(!result.events.includes('tag'), scenario)
        assert(!result.events.includes('release'), scenario)
        if (!['changed-latest', 'failed-consumer'].includes(scenario))
          assert(!result.events.includes('publish'), scenario)
      }
    } finally {
      await rm(cwd, { recursive: true, force: true })
    }
  }
})

test('alpha channel cannot be downgraded before publication', () => {
  validateAlpha(undefined, version)
  validateAlpha(version, version)
  validateAlpha('0.1.0-alpha.0', version)
  validateAlpha('0.1.0-alpha.99', '0.2.0-alpha.0')
  assert.throws(() => validateAlpha('0.1.0-alpha.2', version))
  assert.throws(() => validateAlpha('1.0.0-alpha.0', version))
  assert.throws(() => validateAlpha('0.1.0', version))
})
