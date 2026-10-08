// Run this only from the default branch's trusted workflow_run checkout.

import { inflateRawSync } from 'node:zlib'

const marker = '<!-- payload-toolkit-proof -->'
const token = process.env.GITHUB_TOKEN
const repository = process.env.GITHUB_REPOSITORY
if (!token || !repository || !/^[\w.-]+\/[\w.-]+$/.test(repository))
  throw new Error('Trusted GitHub context is required')
const event = JSON.parse(await Bun.file(process.env.GITHUB_EVENT_PATH).text())
const id = event.workflow_run?.id
if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Missing workflow run identity')
async function api(endpoint, options = {}) {
  const response = await fetch(`https://api.github.com${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...options.headers,
    },
    signal: AbortSignal.timeout(30_000),
  })
  if (!response.ok) throw new Error(`GitHub request failed: ${response.status}`)
  return response.json()
}
const prefix = `/repos/${repository}`
const run = await api(`${prefix}/actions/runs/${id}`)
const workflow = await api(`${prefix}/actions/workflows/${run.workflow_id}`)
if (
  workflow.path !== '.github/workflows/verify.yml' ||
  run.repository.full_name !== repository ||
  run.status !== 'completed' ||
  run.event !== 'pull_request'
)
  throw new Error('Run is outside the admitted verification workflow')
if (!/^[a-f0-9]{40}$/.test(run.head_sha)) throw new Error('Invalid tested revision')
let candidates = run.pull_requests ?? []
if (!candidates.length) candidates = await api(`${prefix}/commits/${run.head_sha}/pulls`)
const pulls = await Promise.all(candidates.map((pr) => api(`${prefix}/pulls/${pr.number}`)))
const matching = pulls.filter((pr) => pr.base.repo.full_name === repository && pr.state === 'open')
if (matching.length !== 1) throw new Error('Run does not identify exactly one open pull request')
const pr = matching[0]
if (!/^[a-f0-9]{40}$/.test(pr.base.sha)) throw new Error('Invalid comparison revision')
const stale = pr.head.sha !== run.head_sha
const jobs = await api(`${prefix}/actions/runs/${id}/jobs?filter=latest&per_page=100`)
if (jobs.total_count > 100) throw new Error('Job list exceeds reporter bound')
const expected = [
  ['Checks and packed CLI', 'checks', 'toolkit-cli-evidence'],
  ['Next / Postgres', 'runtime (next, postgres)', 'toolkit-evidence-next-postgres'],
  ['Next / MongoDB', 'runtime (next, mongodb)', 'toolkit-evidence-next-mongodb'],
  ['TanStack / Postgres', 'runtime (tanstack, postgres)', 'toolkit-evidence-tanstack-postgres'],
  ['TanStack / MongoDB', 'runtime (tanstack, mongodb)', 'toolkit-evidence-tanstack-mongodb'],
  ['Install / Windows', 'cli (windows-latest)', 'toolkit-installation-windows-latest'],
  ['Install / macOS', 'cli (macos-latest)', 'toolkit-installation-macos-latest'],
  ['Install / npm', 'installation (npm)', 'toolkit-installation-npm'],
  ['Install / Bun', 'installation (bun)', 'toolkit-installation-bun'],
]
const byName = new Map(jobs.jobs.map((job) => [job.name, job]))
const artifacts = await api(`${prefix}/actions/runs/${id}/artifacts?per_page=100`)
if (artifacts.total_count > 100) throw new Error('Artifact list exceeds reporter bound')
const admittedArtifacts = new Map(
  artifacts.artifacts
    .filter((artifact) => expected.some(([, , name]) => name === artifact.name))
    .map((artifact) => [artifact.name, artifact]),
)
function usableArtifact(artifact) {
  return (
    Number.isSafeInteger(artifact.id) &&
    artifact.id > 0 &&
    artifact.expired === false &&
    !expiredArtifact(artifact)
  )
}
function expiredArtifact(artifact) {
  const expiry = artifactExpiry(artifact)
  return artifact.expired === true || (Number.isFinite(expiry) && expiry <= Date.now())
}
function artifactExpiry(artifact) {
  return typeof artifact.expires_at === 'string' ? Date.parse(artifact.expires_at) : NaN
}

// Parse only a bounded JSON file from the ZIP. Never extract paths or execute artifacts.
function evidenceFromZip(buffer) {
  if (buffer.length > 20_000_000) throw new Error('Compressed artifact exceeds limit')
  let end = -1
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i--)
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      end = i
      break
    }
  if (end < 0) throw new Error('ZIP end record missing')
  const count = buffer.readUInt16LE(end + 10)
  let cursor = buffer.readUInt32LE(end + 16)
  if (count > 1000) throw new Error('ZIP entries exceed limit')
  const found = []
  for (let index = 0; index < count; index++) {
    if (buffer.readUInt32LE(cursor) !== 0x02014b50) throw new Error('Invalid ZIP directory')
    const compression = buffer.readUInt16LE(cursor + 10)
    const compressed = buffer.readUInt32LE(cursor + 20)
    const size = buffer.readUInt32LE(cursor + 24)
    const length = buffer.readUInt16LE(cursor + 28)
    const extra = buffer.readUInt16LE(cursor + 30)
    const comment = buffer.readUInt16LE(cursor + 32)
    const local = buffer.readUInt32LE(cursor + 42)
    const name = buffer.subarray(cursor + 46, cursor + 46 + length).toString('utf8')
    cursor += 46 + length + extra + comment
    if (!name.endsWith('/evidence.json') && name !== 'evidence.json') continue
    if (name.includes('..') || name.startsWith('/') || size > 250_000 || found.length >= 4)
      throw new Error('Evidence entry exceeds admission policy')
    if (buffer.readUInt32LE(local) !== 0x04034b50) throw new Error('Invalid ZIP local header')
    const start = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28)
    const data = buffer.subarray(start, start + compressed)
    const plain =
      compression === 0
        ? data
        : compression === 8
          ? inflateRawSync(data, { maxOutputLength: 250_000 })
          : null
    if (!plain || plain.length !== size) throw new Error('Unsupported or invalid ZIP compression')
    found.push(JSON.parse(plain.toString('utf8')))
  }
  return found
}
const receipts = new Map()
for (const artifact of admittedArtifacts.values()) {
  if (!usableArtifact(artifact) || artifact.name === 'toolkit-cli-evidence') continue
  if (artifact.size_in_bytes > 20_000_000) continue
  try {
    const response = await fetch(
      `https://api.github.com${prefix}/actions/artifacts/${artifact.id}/zip`,
      { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30_000) },
    )
    if (!response.ok || Number(response.headers.get('content-length')) > 20_000_000)
      throw new Error('Artifact download rejected')
    const reader = response.body.getReader()
    const chunks = []
    let length = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      length += value.length
      if (length > 20_000_000) {
        await reader.cancel()
        throw new Error('Artifact download exceeds limit')
      }
      chunks.push(Buffer.from(value))
    }
    for (const receipt of evidenceFromZip(Buffer.concat(chunks))) {
      if (
        receipt.schemaVersion !== 1 ||
        receipt.source?.revision !== run.head_sha ||
        !['passed', 'failed', 'blocked'].includes(receipt.status) ||
        !Array.isArray(receipt.checks) ||
        receipt.checks.length > 100 ||
        receipt.cleanup?.status !== 'complete'
      )
        continue
      let cell
      if (receipt.mode === 'runtime') {
        if (
          !['next', 'tanstack'].includes(receipt.framework) ||
          !['postgres', 'mongodb'].includes(receipt.database)
        )
          continue
        cell = `${receipt.framework}-${receipt.database}`
        if (artifact.name !== `toolkit-evidence-${cell}`) continue
      } else if (receipt.mode === 'installation-only') {
        const selector = artifact.name.replace('toolkit-installation-', '')
        if (!['npm', 'bun', 'windows-latest', 'macos-latest'].includes(selector)) continue
        if (
          ['npm', 'bun'].includes(selector)
            ? receipt.packageManager !== selector
            : receipt.packageManager !== 'pnpm'
        )
          continue
        cell = `installation-only ${selector}`
      } else continue
      const claims = receipts.get(artifact.name) ?? new Set()
      claims.add(receipt.status)
      receipts.set(artifact.name, claims)
    }
  } catch {
    receipts.set(artifact.name, new Set(['unreadable']))
  }
}
const runUrl = `https://github.com/${repository}/actions/runs/${id}`
function jobResult(job) {
  if (!job) return 'Missing'
  if (job.conclusion === 'success') return '✅ Passed'
  if (job.conclusion === 'failure') return '❌ Failed'
  return (
    new Map([
      ['cancelled', 'Cancelled'],
      ['timed_out', 'Timed out'],
      ['action_required', 'Action required'],
      ['neutral', 'Neutral'],
      ['skipped', 'Skipped'],
      ['stale', 'Stale'],
    ]).get(job.conclusion) ?? 'Unknown'
  )
}
function artifactEvidence(name, label) {
  const artifact = admittedArtifacts.get(name)
  if (!artifact) return `${label}: unavailable`
  if (expiredArtifact(artifact)) return `${label}: expired`
  if (!usableArtifact(artifact)) return `${label}: unavailable`
  return `[${label}](${runUrl}/artifacts/${artifact.id})`
}
const groups = [
  ['Checks', expected.slice(0, 1)],
  ['Installation', expected.slice(5)],
  ['Forms runtime', expected.slice(1, 5)],
]
const rows = groups.map(([group, cells]) => {
  const passed = cells.filter(([, job]) => byName.get(job)?.conclusion === 'success').length
  const incomplete = cells
    .filter(([, job]) => byName.get(job)?.conclusion !== 'success')
    .map(([area, job]) => `${area}: ${jobResult(byName.get(job))}`)
  const result = `${passed === cells.length ? '✅ ' : ''}${passed}/${cells.length} passed${incomplete.length ? `; ${incomplete.join('; ')}` : ''}`
  return `| ${group} | ${result} | ${cells.map(([area, , artifact]) => artifactEvidence(artifact, area)).join(' · ')} |`
})
const claimCounts = new Map()
for (const [name, statuses] of receipts) {
  const mode = name.startsWith('toolkit-installation-') ? 'installation-only' : 'runtime'
  const counts = claimCounts.get(mode) ?? new Map()
  for (const status of statuses) counts.set(status, (counts.get(status) ?? 0) + 1)
  claimCounts.set(mode, counts)
}
const claims = claimCounts.size
  ? [...claimCounts]
      .toSorted()
      .map(
        ([mode, counts]) =>
          `${mode}: ${[...counts]
            .toSorted()
            .map(([status, count]) => `${count} ${status}`)
            .join(', ')}`,
      )
      .join('; ')
  : 'no admitted evidence'
const expiryDates = [
  ...new Set(
    [...admittedArtifacts.values()].filter(usableArtifact).map((artifact) => {
      const expiry = artifactExpiry(artifact)
      return Number.isFinite(expiry) ? new Date(expiry).toISOString().slice(0, 10) : 'unknown'
    }),
  ),
].toSorted()
const expiryNote = expiryDates.length ? ` Artifact expiry: ${expiryDates.join(', ')}.` : ''
const body = `${marker}\n[Run ${id}](${runUrl}) · tested [\`${run.head_sha.slice(0, 7)}\`](https://github.com/${repository}/commit/${run.head_sha}) · [Code changes](https://github.com/${repository}/compare/${pr.base.sha}...${run.head_sha})${stale ? '\n\nThis result is stale: the PR head has changed.' : ''}\n\n| Verification | GitHub result | Evidence |\n| --- | --- | --- |\n${rows.join('\n')}\n\nParsed receipts: ${claims}. These are contributed claims, separate from GitHub job conclusions.${expiryNote} Screenshots are in artifacts; visual review is not inferred.`
const comments = await api(`${prefix}/issues/${pr.number}/comments?per_page=100`)
const previous = comments.find(
  (comment) => comment.user.login === 'github-actions[bot]' && comment.body.startsWith(marker),
)
await api(
  previous ? `${prefix}/issues/comments/${previous.id}` : `${prefix}/issues/${pr.number}/comments`,
  { method: previous ? 'PATCH' : 'POST', body: JSON.stringify({ body }) },
)
