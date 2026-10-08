import path from 'node:path'
import { z } from 'zod'
import type { Agent, AgentOutcome, Feature } from '../model.js'
import { isExternal, ToolkitError } from '../model.js'
import { Attempt, digest, runProcess } from './attempts.js'
import { exists, snapshot } from './project.js'

const statusEvent = z.object({
  type: z.string(),
  subtype: z.string().optional(),
  is_error: z.boolean().optional(),
  permission_denials: z.array(z.unknown()).optional(),
})
const gitInstruction =
  'Preserve the existing Git HEAD, branch, staged index and unrelated developer work. Do not stash, reset, stage, commit, checkout, switch or otherwise mutate Git state.'
function observeAgentStatus(agent: 'codex' | 'claude') {
  let pending = ''
  let discarding = false
  const counts = {
    terminalEvents: 0,
    completedEvents: 0,
    errorEvents: 0,
    failureEvents: 0,
    permissionDenials: 0,
    malformedLines: 0,
    oversizedLines: 0,
  }
  const line = (value: string) => {
    if (!value.trim()) return
    let json: unknown
    try {
      json = JSON.parse(value)
    } catch {
      counts.malformedLines++
      return
    }
    const parsed = statusEvent.safeParse(json)
    if (!parsed.success) return
    const event = parsed.data
    if (agent === 'codex') {
      if (event.type === 'turn.completed' || event.type === 'turn.failed') counts.terminalEvents++
      if (event.type === 'turn.completed') counts.completedEvents++
      if (event.type === 'error') counts.errorEvents++
      if (event.type === 'turn.failed') counts.failureEvents++
    } else {
      if (event.type === 'result') {
        counts.terminalEvents++
        if (event.is_error || event.subtype?.startsWith('error')) counts.failureEvents++
        counts.permissionDenials += event.permission_denials?.length || 0
      }
      if (event.type === 'system' && event.subtype === 'permission_denied')
        counts.permissionDenials++
    }
  }
  return {
    counts,
    consume(chunk: string) {
      for (const part of chunk.split(/(?<=\n)/)) {
        if (!discarding) pending += part
        if (pending.length > 512 * 1024) {
          pending = ''
          discarding = true
          counts.oversizedLines++
        }
        if (part.endsWith('\n')) {
          if (!discarding) line(pending)
          pending = ''
          discarding = false
        }
      }
    },
    finish() {
      if (pending && !discarding) line(pending)
      pending = ''
    },
  }
}

export async function integrationPrompt(
  project: string,
  features: readonly Feature[],
): Promise<string | null> {
  if (!features.length) {
    const readme = path.join(project, 'README.md')
    if (!(await exists(readme))) return null
    return `Inspect this project's rules and the installed official README at ${readme} (SHA-256 ${digest(
      await Bun.file(readme).bytes(),
    )}). Finish configuring the generated Payload application. Preserve native admin authentication. ${gitInstruction} Infrastructure configuration remains the developer's responsibility. Run and report applicable checks; installation is not runtime verification.`
  }
  const guides: string[] = []
  for (const feature of features) {
    if (isExternal(feature)) {
      for (const qualifiedGuide of feature.files.filter((file) => file.role === 'guide')) {
        const full = path.join(project, qualifiedGuide.path)
        if (digest(await Bun.file(full).bytes()) !== qualifiedGuide.sha256)
          throw new ToolkitError(
            'collision',
            `Installed external guide differs from qualified source: ${qualifiedGuide.path}`,
          )
        guides.push(`${full} (SHA-256 ${qualifiedGuide.sha256})`)
      }
      guides.push(
        `External sources ${feature.provenance.references.join(', ')}. Frozen graph: ${feature.provenance.items.map((item) => `${item.name} SHA-256 ${item.sha256}`).join('; ')}. Actual host: Payload ${feature.provenance.host.payloadVersion}, ${feature.provenance.host.framework}, ${feature.provenance.host.database}. Installed files: ${feature.files.map((file) => `${file.path} SHA-256 ${file.sha256}`).join('; ')}. Advisories: ${feature.provenance.advisories.join(' ')}. Inspect missing prerequisites and imports, CMSLink/Media/linkGroup/cn or host equivalents, Pages block registration, renderer ownership, and generated Payload types. Preserve the current Payload, framework and React versions; do not downgrade the host. ${feature.provenance.stylesheet ? `Inspect/import frontend stylesheet ${feature.provenance.stylesheet}.` : ''}`,
      )
      continue
    }
    const file = feature.files.find(
      (candidate) => candidate.path === feature.guide && candidate.role === 'guide',
    )
    if (!file)
      throw new ToolkitError(
        'invalid-item',
        `Feature ${feature.name} has no qualified guide identity`,
      )
    const full = path.join(project, feature.guide)
    if (digest(await Bun.file(full).bytes()) !== file.sha256)
      throw new ToolkitError(
        'collision',
        `Installed guide differs from the qualified guide: ${feature.guide}`,
      )
    guides.push(`${full} (SHA-256 ${file.sha256})`)
  }
  return `Inspect this project's existing rules, Payload config, routes, native admin authentication and rendering ownership. Follow these installed feature guides:\n${guides.map((guide) => '- ' + guide).join('\n')}\nIntegrate their ordinary exports into this actual host. Preserve existing authorization and unrelated developer changes. ${gitInstruction} Do not provision infrastructure. Run applicable code generation, static and runtime checks and report their observed results. Agent completion alone does not verify runtime behavior.`
}

export async function invokeAgent(
  project: string,
  agent: Agent,
  prompt: string | null,
  attempt: Attempt,
  signal?: AbortSignal,
): Promise<AgentOutcome> {
  if (agent === 'none') return { status: 'not-requested', prompt }
  if (!prompt)
    return { status: 'not-started', reason: 'No installed guidance was available', prompt: null }
  let before: Awaited<ReturnType<typeof snapshot>>
  try {
    before = await snapshot(project)
  } catch (error) {
    return {
      status: 'not-started',
      reason: error instanceof Error ? error.message : String(error),
      prompt,
    }
  }
  await attempt.fact('agent-before', before)
  await attempt.event('agent', 'started', `Invoking installed ${agent}`)
  const observation = observeAgentStatus(agent)
  let stderrTail = ''
  let untrustedDirectory = false
  try {
    const args =
      agent === 'codex'
        ? ['exec', '-', '--cd', project, '--json']
        : ['--print', '--verbose', '--output-format', 'stream-json']
    await runProcess(agent, args, {
      cwd: project,
      input: prompt,
      signal,
      attempt,
      agentOutput: true,
      onStdout: observation.consume,
      onStderr(chunk) {
        if (agent !== 'codex') return
        stderrTail = (stderrTail + chunk).slice(-512)
        untrustedDirectory ||= stderrTail.includes(
          'Not inside a trusted directory and --skip-git-repo-check was not specified.',
        )
      },
    })
    observation.finish()
    await attempt.fact('agent-status-counts', observation.counts)
    if (
      observation.counts.failureEvents ||
      observation.counts.permissionDenials ||
      (observation.counts.errorEvents && !observation.counts.completedEvents)
    )
      throw new ToolkitError(
        'agent-reported-failure',
        `${agent} reported unsuccessful status events or permission denials; inspect its local session`,
      )
    const after = await snapshot(project)
    await attempt.fact('agent-after', after)
    if (
      Boolean(before.git) !== Boolean(after.git) ||
      (before.git &&
        after.git &&
        (before.git.head !== after.git.head ||
          before.git.branch !== after.git.branch ||
          before.git.indexSha256 !== after.git.indexSha256 ||
          before.git.indexEntriesSha256 !== after.git.indexEntriesSha256))
    )
      throw new ToolkitError(
        'agent-git-changed',
        'Git HEAD, branch or staged index changed during invocation; review the retained attempt before continuing',
      )
    await attempt.event(
      'agent',
      'complete',
      `${agent} invocation completed; verification remains not-run`,
    )
    return { status: 'completed', agent, before: before.sha256, after: after.sha256 }
  } catch (error) {
    observation.finish()
    await attempt.fact('agent-status-counts', observation.counts)
    try {
      await attempt.fact('agent-after', await snapshot(project))
    } catch (inspectionError) {
      await attempt.fact('agent-after-unavailable', {
        reason:
          inspectionError instanceof Error ? inspectionError.message : String(inspectionError),
      })
    }
    const interrupted =
      (signal?.aborted || (error instanceof ToolkitError && error.code === 'interrupted')) &&
      !(error instanceof ToolkitError && error.code === 'termination-unconfirmed')
    const reason =
      untrustedDirectory && error instanceof ToolkitError && error.code === 'process-failed'
        ? 'Codex refused this directory because it is not a trusted Git project. Initialize or select a Git repository that you trust, then rerun the command with --codex. Installed files are retained; toolkit does not change Git or Codex trust settings.'
        : error instanceof Error
          ? error.message
          : String(error)
    await attempt.event('agent', 'failed', reason)
    if (error instanceof ToolkitError && error.code === 'process-unavailable')
      return { status: 'not-started', reason, prompt }
    return { status: interrupted ? 'interrupted' : 'failed', agent, reason, prompt }
  }
}
