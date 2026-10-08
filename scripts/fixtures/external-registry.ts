import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { chromium, expect } from '@playwright/test'
import { Blocked, type Evidence, hash, sanitize, waitUntil } from './support.js'

export const heroSplitURL = 'https://www.payload-components.xyz/r/hero-split.json'
export const heroSplitNamespace = '@payload-components/hero-split'
const blockFiles = [
  'src/blocks/shared/heroFields.ts',
  'src/blocks/HeroSplit/config.ts',
  'src/blocks/HeroSplit/Component.tsx',
]

export async function heroSplitIdentities(project: string): Promise<Record<string, string>> {
  return Object.fromEntries(
    await Promise.all(
      blockFiles.map(
        async (file) => [file, hash(await Bun.file(path.join(project, file)).bytes())] as const,
      ),
    ),
  )
}

export async function integrateHeroSplit(project: string, evidence: Evidence) {
  const installed = await heroSplitIdentities(project)
  const configPath = path.join(project, 'src/payload.config.ts')
  const config = await Bun.file(configPath).text()
  assert.equal(
    (config.match(/collections: \[Users, Media, Folders, Tags\]/g) ?? []).length,
    1,
    'The pinned official blank fixture changed. Update its known integration explicitly.',
  )
  assert.match(
    await Bun.file(path.join(project, 'src/collections/Media.ts')).text(),
    /upload: true/,
  )
  assert.match(
    await Bun.file(path.join(project, blockFiles[1]!)).text(),
    /interfaceName: 'HeroSplitBlock'/,
  )
  const files: Record<string, string> = {
    'src/fields/linkGroup.ts': `import type { ArrayField } from 'payload'
export const linkGroup = ({ overrides = {} }: { overrides?: Partial<ArrayField> } = {}): ArrayField => ({
  name: 'links', type: 'array', fields: [{ name: 'link', type: 'group', fields: [
    { name: 'label', type: 'text', required: true },
    { name: 'url', type: 'text', required: true },
    { name: 'newTab', type: 'checkbox' },
    { name: 'appearance', type: 'select', defaultValue: 'default', options: ['default', 'outline'] },
  ] }], ...overrides,
})
`,
    'src/components/Link/index.tsx': `type Props = { label?: string | null; url?: string | null; newTab?: boolean | null; appearance?: 'default' | 'outline' | null }
export function CMSLink({ label, url, newTab }: Props) {
  return <a href={url || '/'} target={newTab ? '_blank' : undefined} rel={newTab ? 'noopener noreferrer' : undefined}>{label}</a>
}
`,
    'src/components/Media/index.tsx': `import type { Media as MediaData } from '@/payload-types'
type Props = { resource?: MediaData | number | string | null; imgClassName?: string }
export function Media({ resource, imgClassName }: Props) {
  if (!resource || typeof resource !== 'object' || !resource.url) return null
  return <img src={resource.url} alt={resource.alt} width={resource.width || 640} height={resource.height || 480} className={imgClassName} />
}
`,
    'src/lib/utils.ts': `export function cn(...inputs: (string | false | null | undefined | Record<string, boolean>)[]) {
  return inputs.flatMap((input) => typeof input === 'string' ? [input] : input && typeof input === 'object' ? Object.keys(input).filter((key) => input[key]) : []).join(' ')
}
`,
    'src/utilities/ui.ts': `export { cn } from '@/lib/utils'\n`,
    'src/collections/Pages.ts': `import type { CollectionConfig } from 'payload'
import { HeroSplit } from '@/blocks/HeroSplit/config'
export const Pages: CollectionConfig = {
  slug: 'pages', admin: { useAsTitle: 'title' }, access: { read: () => true },
  fields: [
    { name: 'title', type: 'text', required: true },
    { name: 'layout', type: 'blocks', required: true, blocks: [HeroSplit] },
  ],
}
`,
    'src/app/(frontend)/toolkit-external/page.tsx': `import { getPayload } from 'payload'
import config from '@payload-config'
import { HeroSplitBlock } from '@/blocks/HeroSplit/Component'
import './fixture.css'
export const dynamic = 'force-dynamic'
export default async function ExternalPage() {
  const payload = await getPayload({ config })
  const pages = await payload.find({ collection: 'pages', depth: 1, limit: 1, sort: '-createdAt' })
  return <main className="external-fixture">{pages.docs[0]?.layout?.map((block, index) => <HeroSplitBlock key={block.id || index} {...block} id={block.id ?? undefined} />)}</main>
}
`,
    'src/app/(frontend)/toolkit-external/fixture.css': `.external-fixture{max-width:1100px;margin:80px auto;padding:32px;color:#14232b;background:#edf2ee;border-radius:24px;font-family:system-ui,sans-serif}.external-fixture section>div{padding:40px}.external-fixture section>div>div{display:grid;grid-template-columns:1.2fr 1fr;gap:48px;align-items:center}.external-fixture h2{font-size:48px;line-height:1.1;margin:24px 0}.external-fixture p{font-size:19px;line-height:1.6}.external-fixture a{display:inline-block;background:#174d40;color:white;border-radius:8px;padding:12px 20px;text-decoration:none}.external-fixture img{display:block;width:100%;height:300px;object-fit:cover;border-radius:16px;background:#c4d9d1}.external-fixture ul{padding-left:20px;line-height:2}@media(max-width:700px){.external-fixture{margin:20px auto;padding:8px}.external-fixture section>div>div{grid-template-columns:1fr}.external-fixture h2{font-size:36px}}
`,
  }
  for (const [file, content] of Object.entries(files)) {
    const filename = path.join(project, file)
    assert.equal(await Bun.file(filename).exists(), false, `Fixture must not overwrite ${file}`)
    await fs.mkdir(path.dirname(filename), { recursive: true })
    await Bun.write(filename, content, { createPath: false })
  }
  await Bun.write(
    configPath,
    `import { Pages } from './collections/Pages'\n` +
      config.replace(
        'collections: [Users, Media, Folders, Tags]',
        'collections: [Users, Media, Folders, Tags, Pages]',
      ),
    { createPath: false },
  )
  assert.deepEqual(
    await heroSplitIdentities(project),
    installed,
    'Fixture leaves installed upstream block source unchanged',
  )
  evidence.identities.fixtureIntegration = hash(JSON.stringify(files))
  evidence.checks.push({
    name: 'external-known-host-integration',
    status: 'passed',
    detail:
      'Explicit fixture primitives and Pages registration. No general host-wiring engine or model.',
  })
}

async function request(
  base: string,
  route: string,
  method = 'GET',
  data?: unknown,
  token?: string,
) {
  const response = await fetch(base + route, {
    method,
    signal: AbortSignal.timeout(30_000),
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `JWT ${token}` } : {}),
    },
    ...(data ? { body: JSON.stringify(data) } : {}),
  })
  return { status: response.status, body: await response.json() }
}

export async function verifyHeroSplit(base: string, evidence: Evidence, directory: string) {
  const email = `external-${evidence.runId}@example.test`
  const password = 'fixture-password-123456'
  const registered = await request(base, '/api/users/first-register', 'POST', { email, password })
  assert.equal(registered.status, 200, 'Native first-admin registration')
  const duplicate = await request(base, '/api/users/first-register', 'POST', {
    email: `second-${email}`,
    password,
  })
  assert.equal(duplicate.status, 403, 'Native first-admin registration closes')
  const login = await request(base, '/api/users/login', 'POST', { email, password })
  assert.equal(login.status, 200)
  assert.equal(login.body.user.email, email)
  const token = login.body.token
  assert.equal(typeof token, 'string')
  evidence.checks.push({ name: 'external-native-authentication', status: 'passed' })
  const anonymous = await request(base, '/api/pages', 'POST', { title: 'Denied', layout: [] })
  assert.ok([401, 403].includes(anonymous.status), 'Anonymous page writes remain denied')
  const upload = new FormData()
  upload.set('_payload', JSON.stringify({ alt: 'Hero Split fixture image' }))
  upload.set(
    'file',
    new Blob(
      [
        Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNo2bEEAAOkAeFgjzyRAAAAAElFTkSuQmCC',
          'base64',
        ),
      ],
      { type: 'image/png' },
    ),
    'fixture.png',
  )
  const uploaded = await fetch(base + '/api/media', {
    method: 'POST',
    body: upload,
    headers: { Authorization: `JWT ${token}` },
    signal: AbortSignal.timeout(30_000),
  })
  const media = await uploaded.json()
  assert.equal(uploaded.status, 201, `Real Payload media upload: ${JSON.stringify(media)}`)
  const title = 'Community blocks on Payload v4'
  const saved = await request(
    base,
    '/api/pages',
    'POST',
    {
      title: 'External registry acceptance',
      layout: [
        {
          blockType: 'heroSplit',
          title,
          eyebrow: 'Community registry',
          description: 'Installed upstream source rendered with persisted Payload content.',
          image: media.doc.id,
          imagePosition: 'right',
          links: [
            {
              link: {
                label: 'Read integration notes',
                url: '/toolkit-external#integration',
                appearance: 'default',
              },
            },
          ],
          highlights: [{ label: 'Source belongs to the application' }],
        },
      ],
    },
    token,
  )
  assert.equal(
    saved.status,
    201,
    `Page with upstream block persists: ${JSON.stringify(saved.body)}`,
  )
  const persisted = await request(
    base,
    `/api/pages/${saved.body.doc.id}?depth=1`,
    'GET',
    undefined,
    token,
  )
  assert.equal(persisted.status, 200)
  const block = persisted.body.layout[0]
  assert.equal(block.blockType, 'heroSplit')
  assert.equal(block.title, title)
  assert.equal(String(block.image.id), String(media.doc.id))
  evidence.identities.savedPage = String(saved.body.doc.id)
  evidence.identities.uploadedMedia = String(media.doc.id)
  evidence.checks.push({ name: 'external-block-database-persistence', status: 'passed' })
  let browser
  try {
    browser = await chromium.launch({ headless: true })
  } catch (error) {
    throw new Blocked(`Chromium unavailable: ${String(error)}`)
  }
  const events: string[] = []
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    page.on('pageerror', (error) => events.push(sanitize(error.message)))
    await page.goto(base + '/toolkit-external')
    await expect(page.getByRole('heading', { name: title })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Read integration notes' })).toHaveAttribute(
      'href',
      '/toolkit-external#integration',
    )
    await expect(page.getByText('Source belongs to the application')).toBeVisible()
    const image = page.getByRole('img', { name: 'Hero Split fixture image' })
    await expect(image).toBeVisible()
    assert.equal(
      await image.evaluate(
        (element) =>
          (element as HTMLImageElement).complete && (element as HTMLImageElement).naturalWidth > 0,
      ),
      true,
      'Persisted media is loaded',
    )
    await page.screenshot({ path: path.join(directory, 'external-hero-split.png'), fullPage: true })
    assert.equal(events.length, 0, 'Upstream block renders without browser errors')
    evidence.checks.push({
      name: 'external-block-browser-rendering',
      status: 'passed',
      detail:
        'Heading, CTA, highlight, and uploaded media from a real persisted Page. Screenshot captured; visual inspection is separate.',
    })
    const admin = await browser.newContext()
    await admin.addCookies([{ name: 'payload-token', value: token, url: base }])
    const editor = await admin.newPage()
    editor.on('pageerror', (error) => events.push(sanitize(error.message)))
    await editor.goto(`${base}/admin/collections/pages/${saved.body.doc.id}`)
    await expect(editor.locator('#field-title')).toHaveValue('External registry acceptance')
    await expect(editor.getByText('Hero Split', { exact: true }).first()).toBeVisible()
    await editor.getByRole('button', { name: /Link 01.*Toggle block/ }).click()
    await waitUntil(
      'Persisted Hero Split fields in native admin',
      async () => {
        const values = await editor
          .locator('input, textarea')
          .evaluateAll((elements) => elements.map((element) => (element as HTMLInputElement).value))
        return [
          title,
          'Installed upstream source rendered with persisted Payload content.',
          'Read integration notes',
        ].every((value) => values.includes(value))
      },
      30_000,
    )
    await editor.screenshot({
      path: path.join(directory, 'external-admin-page.png'),
      fullPage: true,
    })
    evidence.checks.push({
      name: 'external-block-admin-browser',
      status: 'passed',
      detail:
        'Existing persisted Page opens with the upstream Hero Split title, description, and CTA fields in native admin. Creation was through authenticated REST, not admin UI.',
    })
    await admin.close()
  } catch (error) {
    events.push(sanitize(error instanceof Error ? error.message : String(error)))
    let index = 0
    for (const context of browser.contexts()) {
      for (const page of context.pages()) {
        if (page.isClosed()) continue
        await page
          .screenshot({
            path: path.join(directory, `external-browser-failure-${index++}.png`),
            fullPage: true,
            timeout: 5000,
          })
          .catch((cause) => events.push(sanitize(String(cause))))
      }
    }
    throw error
  } finally {
    await Bun.write(path.join(directory, 'external-browser.log'), events.join('\n'), {
      createPath: false,
    })
    await browser.close()
  }
}
