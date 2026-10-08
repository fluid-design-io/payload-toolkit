import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'

const publicUrl = z.string().refine((value) => {
  try {
    const url = new URL(value)
    return (
      url.protocol === 'https:' && !url.username && !url.password && !url.hash && !/\s/.test(value)
    )
  } catch {
    return false
  }
}, 'Expected a public HTTPS URL without credentials or a fragment')

const registryUrl = publicUrl.refine(
  (value) => value.split('{name}').length === 2 && !/[{}]/.test(value.replace('{name}', 'item')),
  'Registry URL must contain exactly one {name} placeholder and no other placeholders',
)

const directorySchema = z.strictObject({
  schemaVersion: z.literal(1),
  registries: z.array(
    z.strictObject({
      namespace: z.string().regex(/^@[a-z0-9]+(?:-[a-z0-9]+)*$/),
      name: z.string().trim().min(1),
      description: z.string().trim().min(1),
      homepage: publicUrl,
      repository: publicUrl,
      url: registryUrl,
      compatibility: z
        .strictObject({
          upstream: z.string().trim().min(1),
          documentation: publicUrl,
        })
        .optional(),
    }),
  ),
})

export type CommunityDirectory = z.infer<typeof directorySchema>

export function parseCommunityDirectory(value: unknown): CommunityDirectory {
  const directory = directorySchema.parse(value)
  const namespaces = new Set<string>()
  const names = new Set<string>()
  for (const registry of directory.registries) {
    if (namespaces.has(registry.namespace))
      throw new Error(`Duplicate registry namespace: ${registry.namespace}`)
    const name = registry.name.toLocaleLowerCase('en-US')
    if (names.has(name)) throw new Error(`Duplicate registry name: ${registry.name}`)
    namespaces.add(registry.namespace)
    names.add(name)
  }
  return directory
}

function markdown(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('|', '&#124;')
    .replaceAll('\\', '&#92;')
    .replaceAll('`', '&#96;')
    .replaceAll('[', '&#91;')
    .replaceAll(']', '&#93;')
    .replaceAll('*', '&#42;')
    .replaceAll('_', '&#95;')
    .replace(/[\r\n]+/g, ' ')
}

function link(label: string, url: string): string {
  return `[${markdown(label)}](<${url.replaceAll('<', '%3C').replaceAll('>', '%3E')}>)`
}

export function renderCommunityDirectory(directory: CommunityDirectory): string {
  const rows = directory.registries.map((registry) => {
    const compatibility = registry.compatibility
      ? `${markdown(registry.compatibility.upstream)} ${link('Upstream documentation', registry.compatibility.documentation)}`
      : 'Not declared upstream.'
    return `| ${link(registry.name, registry.homepage)} | ${markdown(registry.namespace)} | ${markdown(registry.description)} | ${compatibility} | ${link('Source', registry.repository)} |`
  })
  return `# Community registries

This directory lists community registries for discovery. A listing does not certify compatibility with Payload v4.
The compatibility column records upstream claims. Payload v4 runtime compatibility for these registries is unverified.

| Registry | Namespace | Description | Upstream compatibility | Repository |
| --- | --- | --- | --- | --- |
${rows.join('\n')}

## Installation policy

The directory is not an allowlist. Unlisted direct registry URLs remain installable.
Toolkit reuses shadcn namespace resolution and the registries configured in your project's \`components.json\`.
An entry here does not register a competing namespace resolver or require changes to the upstream registry.
Compatibility claims are advisory. An optional agent handoff can adapt installed source to the host application.
Agent completion and runtime verification are separate outcomes.

## Directory contributions

Contributors add entries to \`catalog/community-registries.json\` through pull requests.
Each entry contains a unique \`namespace\`, a unique display \`name\`, a \`description\`, a \`homepage\`, a \`repository\`, and a \`url\` template.
The namespace matches shadcn's existing namespace when one exists. Registry URL templates contain exactly one \`{name}\` placeholder.
Public URLs use HTTPS without credentials or fragments.
An optional \`compatibility\` object records an upstream claim in \`upstream\` and its source URL in \`documentation\`.
Directory entries do not require toolkit metadata, an integration guide, or an acceptance fixture.
Bundled toolkit features retain their own contribution and verification requirements.

\`bun scripts/community-registry-build.ts\` validates the directory and generates this page and \`assets/registry/community-registries.json\`.
\`bun scripts/community-registry-build.ts --check\` validates the directory and rejects an outdated generated page.
These commands make no network requests. Maintainers review directory contributions before merging them.
`
}

export function assertCommunityListingCurrent(actual: string | null, expected: string): void {
  if (actual !== expected)
    throw new Error(
      'Community registry listing is outdated. Run bun scripts/community-registry-build.ts',
    )
}

if (import.meta.main) {
  const flags = process.argv.slice(2)
  if (flags.some((argument) => argument !== '--check') || flags.length > 1)
    throw new Error('Usage: bun scripts/community-registry-build.ts [--check]')
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const directory = parseCommunityDirectory(
    await Bun.file(join(root, 'catalog/community-registries.json')).json(),
  )
  const listing = renderCommunityDirectory(directory)
  const page = Bun.file(join(root, 'docs/community-registries.md'))
  if (flags.includes('--check')) {
    assertCommunityListingCurrent((await page.exists()) ? await page.text() : null, listing)
    console.log(
      `Validated ${directory.registries.length} community registry entries and generated listing`,
    )
  } else {
    await Bun.write(page, listing)
    await Bun.write(
      join(root, 'assets/registry/community-registries.json'),
      `${JSON.stringify(directory, null, 2)}\n`,
    )
    console.log(`Generated ${directory.registries.length} community registry entries and listing`)
  }
}
