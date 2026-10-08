import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, readdir, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const directory = path.resolve('.scratch/release')
const registry = 'https://registry.npmjs.org'
const digest = (bytes, algorithm, encoding = 'hex') =>
  createHash(algorithm).update(bytes).digest(encoding)
const json = async (file) => JSON.parse(await readFile(file, 'utf8'))
const save = (name, value) =>
  writeFile(path.join(directory, name), `${JSON.stringify(value, null, 2)}\n`)

function command(executable, args, cwd = process.cwd(), expected = 0) {
  const result = spawnSync(executable, args, {
    cwd,
    encoding: 'utf8',
    timeout: 180_000,
    maxBuffer: 10 * 1024 * 1024,
  })
  if (result.error) throw result.error
  assert.equal(result.status, expected, `${executable} ${args.join(' ')} failed: ${result.stderr}`)
  return result.stdout.trim()
}

export function validateSource(manifest, version, repository) {
  assert.match(version, /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)-alpha\.(0|[1-9]\d*)$/)
  assert.equal(manifest.name, 'payload-toolkit')
  assert.equal(manifest.version, version, 'Commit the requested version before dispatching')
  assert.equal(manifest.publishConfig?.tag, 'alpha')
  assert.equal(manifest.publishConfig?.access, 'public')
  assert.equal(manifest.publishConfig?.registry?.replace(/\/$/, ''), registry)
  assert.equal(
    manifest.repository?.url?.replace(/^git\+/, '').replace(/\.git$/, ''),
    `https://github.com/${repository}`,
    'package.json repository.url must match the repository publishing through OIDC',
  )
}

export function validatePack(pack, version) {
  assert.equal(pack.name, 'payload-toolkit')
  assert.equal(pack.version, version)
  assert.equal(pack.filename, `payload-toolkit-${version}.tgz`)
  const files = pack.files.map((file) => file.path)
  for (const file of files) {
    assert(!file.split('/').includes('..'), `Unsafe packed path: ${file}`)
    assert.match(
      file,
      /^(dist\/[\w./-]+\.(?:js(?:\.map)?|json)|assets\/registry\/[\w-]+\.json|catalog\/bootstrap\.json|package\.json|README\.md|LICENSE\.md)$/,
      `Unexpected packed file: ${file}`,
    )
  }
  for (const file of [
    'dist/cli.js',
    'assets/registry/forms.json',
    'catalog/bootstrap.json',
    'package.json',
    'README.md',
    'LICENSE.md',
  ])
    assert(files.includes(file), `Missing packed file: ${file}`)
}

export function validateReceipts(receipts, sha, artifact) {
  assert.equal(receipts.length, 9, 'Require CLI, four runtime and four installer receipts')
  for (const receipt of receipts) {
    assert.equal(receipt.status, 'passed')
    assert.equal(receipt.source.revision, sha)
    assert.equal(receipt.source.dirty, false)
    // Windows/macOS prove the same committed source; platform packing can differ.
    if (!(receipt.mode === 'installation-only' && receipt.packageManager === 'pnpm'))
      assert.equal(
        receipt.identities.packedPackage,
        artifact,
        'Release tarball differs from the Ubuntu matrix-qualified artifact',
      )
    assert.equal(receipt.cleanup.status, 'complete')
  }
  assert.equal(receipts.filter((receipt) => receipt.mode === 'cli-only').length, 1)
  const runtime = receipts.filter((receipt) => receipt.mode === 'runtime')
  assert.deepEqual(
    runtime.map((receipt) => `${receipt.framework}/${receipt.database}`).toSorted(),
    ['next/mongodb', 'next/postgres', 'tanstack/mongodb', 'tanstack/postgres'],
  )
  const installation = receipts.filter((receipt) => receipt.mode === 'installation-only')
  assert.deepEqual(installation.map((receipt) => receipt.packageManager).toSorted(), [
    'bun',
    'npm',
    'pnpm',
    'pnpm',
  ])
}

export function validateEnvironment(environment, policies, branch) {
  assert(
    environment.protection_rules?.some(
      (rule) => rule.type === 'required_reviewers' && rule.reviewers?.length > 0,
    ),
    'npm-release needs at least one required maintainer reviewer',
  )
  assert.equal(
    environment.deployment_branch_policy?.custom_branch_policies,
    true,
    'npm-release must use a custom default-branch-only deployment policy',
  )
  assert.equal(policies.branch_policies.length, 1)
  assert.equal(policies.branch_policies[0].name, branch)
  assert.equal(policies.branch_policies[0].type ?? 'branch', 'branch')
}

async function checkEnvironment(identity) {
  const environment = await github(identity.repository, 'environments/npm-release')
  const policies = await github(
    identity.repository,
    'environments/npm-release/deployment-branch-policies',
  )
  validateEnvironment(environment, policies, process.env.RELEASE_DEFAULT_BRANCH)
}

export function validateAlpha(current, requested) {
  if (current === undefined) return
  const expression = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)-alpha\.(0|[1-9]\d*)$/
  const before = expression.exec(current)
  const after = expression.exec(requested)
  assert(
    before && after,
    'Alpha channel must contain an explicit alpha version; review unexpected tags manually',
  )
  for (let index = 1; index <= 4; index++) {
    if (BigInt(after[index]) > BigInt(before[index])) return
    assert(
      BigInt(after[index]) >= BigInt(before[index]),
      'Refusing to downgrade an existing alpha channel',
    )
  }
}

export function validatePublished(metadata, integrity, version) {
  assert.equal(metadata.version, version)
  assert.equal(
    metadata.dist?.integrity,
    integrity,
    'Published version has different bytes; never overwrite or republish',
  )
}

async function source() {
  const version = process.env.RELEASE_VERSION ?? ''
  const sha = process.env.GITHUB_SHA ?? ''
  assert.match(sha, /^[a-f0-9]{40}$/)
  assert.equal(process.env.GITHUB_EVENT_NAME, 'workflow_dispatch')
  assert.equal(process.env.GITHUB_REF, `refs/heads/${process.env.RELEASE_DEFAULT_BRANCH}`)
  assert.equal(command('git', ['rev-parse', 'HEAD']), sha)
  assert.equal(command('git', ['status', '--porcelain']), '', 'Release source must be clean')
  const manifest = await json('package.json')
  validateSource(manifest, version, process.env.GITHUB_REPOSITORY)
  return { version, sha, name: manifest.name, repository: process.env.GITHUB_REPOSITORY }
}

async function filesBelow(root) {
  const entries = await readdir(root, { withFileTypes: true })
  return (
    await Promise.all(
      entries.map((entry) =>
        entry.isDirectory()
          ? filesBelow(path.join(root, entry.name))
          : [path.join(root, entry.name)],
      ),
    )
  ).flat()
}

async function smoke(specifier, label) {
  const consumer = await mkdtemp(path.join(tmpdir(), 'toolkit-release-'))
  try {
    await writeFile(
      path.join(consumer, 'package.json'),
      '{"name":"toolkit-release-consumer","private":true}',
    )
    const install = command(
      'npm',
      [
        'install',
        '--no-audit',
        '--no-fund',
        '--registry',
        registry,
        '--cache',
        path.join(consumer, 'cache'),
        specifier,
      ],
      consumer,
    )
    const cli = path.join(consumer, 'node_modules/payload-toolkit/dist/cli.js')
    const help = command(process.execPath, [cli, '--help'], consumer)
    assert.match(help, /init/)
    assert.match(help, /add/)
    command(process.execPath, [cli, 'unknown-command', '--json'], consumer, 2)
    const manifest = await json(path.join(consumer, 'node_modules/payload-toolkit/package.json'))
    assert.equal(manifest.version, process.env.RELEASE_VERSION)
    await save(`${label}.json`, {
      version: manifest.version,
      status: 'passed',
      install,
      help,
      invalidCommandExit: 2,
    })
  } finally {
    await rm(consumer, { recursive: true, force: true })
  }
}

async function prepare() {
  const identity = await source()
  await mkdir(directory, { recursive: true })
  const [pack] = JSON.parse(
    command('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', directory]),
  )
  await save('pack.json', pack)
  validatePack(pack, identity.version)
  const bytes = await readFile(path.join(directory, pack.filename))
  const sha256 = digest(bytes, 'sha256')
  const integrity = `sha512-${digest(bytes, 'sha512', 'base64')}`
  assert.equal(integrity, pack.integrity)
  const receiptPaths = (await filesBelow('.scratch/release-verification')).filter(
    (file) => path.basename(file) === 'evidence.json',
  )
  const receipts = await Promise.all(receiptPaths.map(json))
  validateReceipts(receipts, identity.sha, sha256)
  await save('verification.json', receipts)
  await save('artifact.json', { ...identity, filename: pack.filename, sha256, integrity })
  await smoke(path.join(directory, pack.filename), 'packed-consumer')
  await source()
}

async function request(url, options = {}, missing = false) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(15_000) })
  if (missing && response.status === 404) return null
  assert(response.ok, `Request failed (${response.status}): ${url}`)
  return response.json()
}

async function github(repository, suffix, method = 'GET', body, missing = false) {
  assert(process.env.GH_TOKEN, 'GitHub release token is required')
  return request(
    `https://api.github.com/repos/${repository}/${suffix}`,
    {
      method,
      headers: {
        Authorization: `Bearer ${process.env.GH_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    },
    missing,
  )
}

async function tagState(identity) {
  const tag = `v${identity.version}`
  const ref = await github(identity.repository, `git/ref/tags/${tag}`, 'GET', undefined, true)
  if (ref) {
    const commit = await github(identity.repository, `commits/${tag}`)
    assert.equal(commit.sha, identity.sha, 'Existing release tag points at different source')
  }
  const release = await github(identity.repository, `releases/tags/${tag}`, 'GET', undefined, true)
  if (release) {
    assert(ref, 'Existing release must have its immutable tag')
    assert.equal(release.prerelease, true, 'Existing release is not a prerelease')
    assert.equal(release.draft, false, 'Existing release is a draft; review it manually')
  }
  return { tag, ref, release }
}

export async function publish() {
  const identity = await source()
  const artifact = await json(path.join(directory, 'artifact.json'))
  for (const key of ['version', 'sha', 'name', 'repository'])
    assert.equal(artifact[key], identity[key])
  validatePack(await json(path.join(directory, 'pack.json')), identity.version)
  const tarball = path.join(directory, `payload-toolkit-${identity.version}.tgz`)
  const bytes = await readFile(tarball)
  assert.equal(digest(bytes, 'sha256'), artifact.sha256)
  assert.equal(`sha512-${digest(bytes, 'sha512', 'base64')}`, artifact.integrity)
  validateReceipts(
    await json(path.join(directory, 'verification.json')),
    identity.sha,
    artifact.sha256,
  )
  await checkEnvironment(identity)
  await tagState(identity)
  const url = `${registry}/${identity.name}/${identity.version}`
  const before = await request(`${registry}/-/package/${identity.name}/dist-tags`)
  validateAlpha(before.alpha, identity.version)
  const existing = await request(url, {}, true)
  if (existing) validatePublished(existing, artifact.integrity, identity.version)
  await save('publication-attempt.json', {
    ...identity,
    integrity: artifact.integrity,
    tagsBefore: before,
    alreadyPublished: !!existing,
  })
  if (!existing) {
    try {
      command('npm', [
        'publish',
        tarball,
        '--ignore-scripts',
        '--tag',
        'alpha',
        '--access',
        'public',
        '--registry',
        registry,
      ])
    } catch (error) {
      // An ambiguous response never triggers a second publication attempt.
      await save('publication-command.json', {
        status: 'failed-or-ambiguous',
        message: error.message,
      })
    }
  }
  let metadata
  for (let attempt = 0; attempt < 12; attempt++) {
    metadata = await request(url, {}, true)
    if (metadata) break
    await new Promise((resolve) => setTimeout(resolve, 10_000))
  }
  assert(
    metadata,
    'Version is not public yet. Resolve npm staging/processing and rerun; do not republish blindly',
  )
  validatePublished(metadata, artifact.integrity, identity.version)
  const after = await request(`${registry}/-/package/${identity.name}/dist-tags`)
  await save('registry.json', { metadata, tagsBefore: before, tagsAfter: after })
  assert.equal(
    after.alpha,
    identity.version,
    'Alpha tag does not match; review manually without downgrading a newer alpha',
  )
  assert.equal(
    after.latest,
    before.latest,
    'npm changed latest; inspect manually, never rewrite it automatically',
  )
  await smoke(`${identity.name}@${identity.version}`, 'registry-consumer')
  const { tag, ref, release } = await tagState(identity)
  if (!ref)
    await github(identity.repository, 'git/refs', 'POST', {
      ref: `refs/tags/${tag}`,
      sha: identity.sha,
    })
  let publishedRelease = release
  if (!release) {
    const notes = await github(identity.repository, 'releases/generate-notes', 'POST', {
      tag_name: tag,
      target_commitish: identity.sha,
      configuration_file_path: '.github/release.yml',
    })
    publishedRelease = await github(identity.repository, 'releases', 'POST', {
      tag_name: tag,
      target_commitish: identity.sha,
      name: tag,
      body: notes.body,
      prerelease: true,
      draft: false,
      make_latest: 'false',
    })
  }
  await save('result.json', {
    ...identity,
    integrity: artifact.integrity,
    status: 'published',
    release: publishedRelease.html_url,
  })
  if (process.env.GITHUB_STEP_SUMMARY)
    await writeFile(
      process.env.GITHUB_STEP_SUMMARY,
      `Published ${identity.name}@${identity.version} under alpha.\n\nSource: ${identity.sha}\n\nSHA-256: ${artifact.sha256}\n\n[GitHub prerelease](${publishedRelease.html_url})\n`,
    )
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const mode = process.argv[2]
  assert(['source', 'prepare', 'publish'].includes(mode), 'Use source, prepare or publish')
  if (mode === 'source') await checkEnvironment(await source())
  else await { prepare, publish }[mode]()
}
