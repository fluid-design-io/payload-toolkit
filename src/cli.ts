#!/usr/bin/env bun

import { resolve } from 'node:path'
import { Command, CommanderError, Option } from 'commander'
import { cancel, multiselect, select, text } from '@clack/prompts'
import { satisfies } from 'semver'
import { z } from 'zod'
import { add, describeFeatures, init } from './operations/index.js'
import type { Event, Result } from './operations/model.js'

const optionsSchema = z.object({
  cwd: z.string().optional(),
  framework: z.enum(['next', 'tanstack']).optional(),
  database: z.enum(['postgres', 'mongodb']).optional(),
  template: z.enum(['minimal', 'custom']).optional(),
  packageManager: z.enum(['npm', 'pnpm', 'bun']).optional(),
  features: z.string().optional(),
  databaseUrl: z.string().optional(),
  allowDirty: z.boolean().optional(),
  codex: z.boolean().optional(),
  claude: z.boolean().optional(),
  requireAgentSuccess: z.boolean().optional(),
  json: z.boolean().optional(),
})
type Options = z.infer<typeof optionsSchema>
const rawArgv = process.argv.slice(2)
const jsonMode = rawArgv.includes('--json')
const controller = new AbortController()
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => controller.abort())

function agentChoice(options: Options): 'none' | 'codex' | 'claude' {
  if (options.codex && options.claude) throw new Error('Choose either --codex or --claude')
  if (options.requireAgentSuccess && !options.codex && !options.claude) {
    throw new Error('--require-agent-success requires --codex or --claude')
  }
  return options.codex ? 'codex' : options.claude ? 'claude' : 'none'
}
function interactive(options: Options) {
  return !options.json && Boolean(process.stdin.isTTY && process.stderr.isTTY)
}
function answer<T extends string | string[]>(value: T | symbol): T {
  if (typeof value === 'symbol') {
    cancel('Canceled')
    throw new Error('Canceled before installation')
  }
  return value
}
function renderEvent(event: Event, options: Options) {
  if (!options.json) process.stderr.write(`${event.stage}: ${event.message}\n`)
}
function renderResult(result: Result, options: Options) {
  if (options.json) process.stdout.write(`${JSON.stringify(result)}\n`)
  else {
    process.stdout.write(`Installation: ${result.installation.status}\n`)
    if (result.installation.status === 'complete')
      process.stdout.write(`Project: ${result.installation.project}\n`)
    else process.stdout.write(`${result.installation.reason}\n`)
    process.stdout.write(
      `Agent: ${result.agent.status}\nVerification: ${result.verification.status}\nReceipt: ${result.receipt}\n`,
    )
    if ('prompt' in result.agent && result.agent.prompt)
      process.stdout.write(`\n${result.agent.prompt}\n`)
  }
  process.exitCode = result.exitCode
}
function common(command: Command) {
  return command
    .option('--cwd <directory>', 'Resolve the target from this directory')
    .addOption(
      new Option('--framework <framework>', 'Host framework').choices(['next', 'tanstack']),
    )
    .addOption(
      new Option('--database <database>', 'Payload database adapter').choices([
        'postgres',
        'mongodb',
      ]),
    )
    .option('--codex', 'Ask the installed Codex CLI to integrate the installed guide')
    .option('--claude', 'Ask the installed Claude CLI to integrate the installed guide')
    .option('--require-agent-success', 'Require successful agent invocation for exit zero')
    .option(
      '--allow-dirty',
      'Record the current Git state and permit installation with existing changes',
    )
    .option('--json', 'Return one JSON result and do not prompt')
}

async function main() {
  if (!satisfies(Bun.version, '>=1.4.2')) throw new Error('Payload Toolkit requires Bun >=1.4.2')
  const metadata = z
    .object({ version: z.string() })
    .parse(JSON.parse(await Bun.file(new URL('../package.json', import.meta.url)).text()))
  const program = new Command()
    .name('payload-toolkit')
    .description('Install Payload templates and developer-owned features')
    .version(metadata.version)
    .exitOverride()
    .showHelpAfterError()
  program.configureOutput({
    writeErr: (message) => {
      if (!jsonMode) process.stderr.write(message)
    },
  })
  common(
    program
      .command('init [directory]')
      .description('Pull an official Payload starter, then install optional features'),
  )
    .addOption(
      new Option(
        '--template <template>',
        'minimal pulls the official Payload starter; custom adds selected features',
      ).choices(['minimal', 'custom']),
    )
    .addOption(
      new Option('--package-manager <manager>', 'Installer for the new project').choices([
        'npm',
        'pnpm',
        'bun',
      ]),
    )
    .option('--features <names>', 'Comma-separated catalog items for custom')
    .option('--database-url <url>', 'Connection for codegen; alternatively set DATABASE_URI')
    .action(async (directory: string | undefined, raw: unknown) => {
      const options = optionsSchema.parse(raw)
      const agent = agentChoice(options)
      const canPrompt = interactive(options)
      const target =
        directory ||
        (canPrompt
          ? answer<string>(
              await text({
                message: 'Project directory',
                placeholder: 'my-payload-app',
                validate: (value) => (value ? undefined : 'Enter a directory'),
              }),
            )
          : undefined)
      const framework =
        options.framework ||
        (canPrompt
          ? answer<'next' | 'tanstack'>(
              await select({
                message: 'Framework',
                options: [
                  { value: 'next', label: 'Next.js' },
                  { value: 'tanstack', label: 'TanStack Start' },
                ],
              }),
            )
          : undefined)
      const database =
        options.database ||
        (canPrompt
          ? answer<'postgres' | 'mongodb'>(
              await select({
                message: 'Database',
                options: [
                  { value: 'postgres', label: 'PostgreSQL', hint: 'Payload Drizzle adapter' },
                  { value: 'mongodb', label: 'MongoDB' },
                ],
              }),
            )
          : undefined)
      const template =
        options.template ||
        (canPrompt
          ? answer<'minimal' | 'custom'>(
              await select({
                message: 'Template',
                options: [
                  {
                    value: 'minimal',
                    label: 'Minimal',
                    hint: 'Pulls the official Payload starter',
                  },
                  {
                    value: 'custom',
                    label: 'Custom',
                    hint: 'Official starter plus selected features',
                  },
                ],
              }),
            )
          : undefined)
      const packageManager =
        options.packageManager ||
        (canPrompt
          ? answer<'npm' | 'pnpm' | 'bun'>(
              await select({
                message: 'Package manager',
                options: [
                  { value: 'pnpm', label: 'pnpm' },
                  { value: 'npm', label: 'npm' },
                  { value: 'bun', label: 'Bun' },
                ],
              }),
            )
          : undefined)
      if (!target || !framework || !database || !template || !packageManager)
        throw new Error(
          'Unattended init requires directory, --framework, --database, --template and --package-manager',
        )
      let features =
        options.features
          ?.split(',')
          .map((name) => name.trim())
          .filter(Boolean) || []
      if (template === 'minimal' && features.length)
        throw new Error('--features requires --template custom')
      if (template === 'custom' && !features.length && canPrompt) {
        const choices = await describeFeatures()
        features = answer<string[]>(
          await multiselect({
            message: 'Features',
            required: true,
            options: choices.map((item) => ({
              value: item.name,
              label: item.name,
              hint: item.description,
            })),
          }),
        )
      }
      if (template === 'custom' && !features.length)
        throw new Error('Custom requires --features or an interactive selection')
      if (template === 'minimal' && agent !== 'none')
        throw new Error(
          'Minimal has no feature guide. Choose custom with features for agent integration',
        )
      const result = await init(
        {
          directory: resolve(options.cwd || process.cwd(), target),
          framework,
          database,
          template,
          packageManager,
          features,
          allowDirty: Boolean(options.allowDirty),
          agent,
          requireAgentSuccess: Boolean(options.requireAgentSuccess),
          databaseUrl: options.databaseUrl || process.env.DATABASE_URI,
        },
        { signal: controller.signal, onEvent: (event) => renderEvent(event, options) },
      )
      renderResult(result, options)
    })
  common(
    program
      .command('add <features...>')
      .description('Install catalog features into an existing Payload application'),
  ).action(async (features: string[], raw: unknown) => {
    const options = optionsSchema.parse(raw)
    const result = await add(
      {
        directory: resolve(options.cwd || process.cwd()),
        features,
        framework: options.framework,
        database: options.database,
        allowDirty: Boolean(options.allowDirty),
        agent: agentChoice(options),
        requireAgentSuccess: Boolean(options.requireAgentSuccess),
      },
      { signal: controller.signal, onEvent: (event) => renderEvent(event, options) },
    )
    renderResult(result, options)
  })
  await program.parseAsync(process.argv)
}
try {
  await main()
} catch (error) {
  if (error instanceof CommanderError && error.exitCode === 0) process.exitCode = 0
  else {
    const message = error instanceof Error ? error.message : 'Command failed'
    if (jsonMode)
      process.stdout.write(
        `${JSON.stringify({ schemaVersion: 1, attempt: '', receipt: '', installation: { status: 'blocked', reason: message, partial: false, retainedPaths: [] }, agent: { status: 'not-started', reason: 'invalid-arguments', prompt: null }, verification: { status: 'not-run' }, exitCode: 2 })}\n`,
      )
    else process.stderr.write(`${message}\n`)
    process.exitCode = 2
  }
}
