import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { chromium, type Page } from '@playwright/test'
import { hasSubmissionNotification } from './notification.js'
import { Blocked, type Evidence, exists, hash, sanitize, waitUntil } from './support.js'

export async function integrateForms(project: string, framework: string, evidence: Evidence) {
  const guide = path.join(project, 'docs/payload-toolkit/forms/GUIDE.md')
  const candidates = [
    guide,
    path.join(project, 'payload-toolkit/forms/GUIDE.md'),
    path.join(project, 'docs/payload-toolkit/forms/guide.md'),
  ]
  const actualGuide = (
    await Promise.all(candidates.map(async (file) => ((await exists(file)) ? file : null)))
  ).find(Boolean)
  if (!actualGuide) throw new Error('Installed forms guide is missing')
  const contents = await fs.readFile(actualGuide, 'utf8')
  assert.match(contents, /formsPlugin/)
  evidence.identities.guide = hash(contents)
  const config = path.join(project, 'src/payload.config.ts')
  const source = await fs.readFile(config, 'utf8')
  // This is a known official fixture host, not an arbitrary application transformation.
  assert.equal(
    (source.match(/plugins: \[mcpPlugin\(\{\}\)\]/g) ?? []).length,
    1,
    'Official fixture plugins changed; update known integration from the guide',
  )
  const wired =
    `import { formsPlugin } from '../payload-toolkit/forms/plugin'\n` +
    source.replace('plugins: [mcpPlugin({})]', 'plugins: [mcpPlugin({}), formsPlugin]')
  await fs.writeFile(config, wired)
  const route =
    framework === 'next'
      ? 'src/app/(frontend)/toolkit-forms/page.tsx'
      : 'src/app/_frontend/toolkit-forms.tsx'
  const filename = path.join(project, route)
  const imported = path
    .relative(path.dirname(filename), path.join(project, 'payload-toolkit/forms/example-form'))
    .split(path.sep)
    .join('/')
  await fs.mkdir(path.dirname(filename), { recursive: true })
  await fs.writeFile(
    filename,
    framework === 'next'
      ? `import { ExampleForm } from '${imported}'\nexport default async function Page({ searchParams }: { searchParams: Promise<{ formId?: string }> }) { const { formId = '' } = await searchParams; return <ExampleForm formId={formId} /> }\n`
      : `import { createFileRoute } from '@tanstack/react-router'\nimport { ExampleForm } from '${imported}'\nexport const Route = createFileRoute('/_frontend/toolkit-forms')({ validateSearch: (search: Record<string, unknown>) => ({ formId: String(search.formId ?? '') }), component: Page })\nfunction Page() { const { formId } = Route.useSearch(); return <ExampleForm formId={formId} /> }\n`,
  )
  evidence.identities.fixtureIntegration = hash(wired + (await fs.readFile(filename, 'utf8')))
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
  const body = await response.json().catch(() => null)
  return { status: response.status, body }
}
export async function verifyForms(
  base: string,
  evidence: Evidence,
  directory: string,
  serverLog: () => string,
) {
  const email = `fixture-${evidence.runId}@example.test`
  const password = 'fixture-password-123456'
  const user = await request(base, '/api/users/first-register', 'POST', { email, password })
  assert.equal(user.status, 200, 'Native first-user registration')
  const duplicate = await request(base, '/api/users/first-register', 'POST', {
    email: `second-${email}`,
    password,
  })
  assert.equal(duplicate.status, 403, 'Native first-user registration closes after initialization')
  const login = await request(base, '/api/users/login', 'POST', { email, password })
  assert.equal(login.status, 200, 'Native login')
  assert.equal(login.body.user.email, email)
  const token = login.body.token
  assert.equal(typeof token, 'string')
  evidence.checks.push({ name: 'native-admin-login', status: 'passed' })
  const form = await request(
    base,
    '/api/forms',
    'POST',
    {
      title: 'Toolkit fixture form',
      toolkitExample: true,
      fields: [
        { blockType: 'text', name: 'name', label: 'Name', required: true },
        { blockType: 'email', name: 'email', label: 'Email', required: true },
        { blockType: 'textarea', name: 'message', label: 'Message', required: true },
      ],
      confirmationType: 'message',
      confirmationMessage: {
        root: {
          type: 'root',
          version: 1,
          direction: null,
          format: '',
          indent: 0,
          children: [
            {
              type: 'paragraph',
              version: 1,
              direction: null,
              format: '',
              indent: 0,
              children: [
                {
                  type: 'text',
                  version: 1,
                  detail: 0,
                  format: 0,
                  mode: 'normal',
                  style: '',
                  text: 'Thank you. Your submission was saved.',
                },
              ],
            },
          ],
        },
      },
      emails: [],
    },
    token,
  )
  assert.equal(form.status, 201)
  const formId = form.body.doc.id
  const anonymous = await request(base, '/api/form-submissions')
  assert.ok(
    [401, 403].includes(anonymous.status),
    `Anonymous submission reads must be denied, got ${anonymous.status}`,
  )
  const bad = await request(base, '/api/form-submissions', 'POST', {
    submissionData: [{ field: 'name', value: 'Invalid' }],
  })
  assert.ok(bad.status >= 400 && bad.status < 500, 'Missing form is rejected')
  const invalid = await request(base, '/api/form-submissions', 'POST', {
    form: formId,
    submissionData: [
      { field: 'name', value: 'Invalid' },
      { field: 'email', value: 'not-an-email' },
      { field: 'message', value: 'Must reject' },
    ],
  })
  assert.ok(
    invalid.status >= 400 && invalid.status < 500,
    'Invalid example email is rejected by the server',
  )
  const before = await request(
    base,
    `/api/form-submissions?where[form][equals]=${encodeURIComponent(formId)}`,
    'GET',
    undefined,
    token,
  )
  assert.equal(before.status, 200)
  assert.equal(before.body.totalDocs, 0, 'Rejected writes did not persist')
  evidence.checks.push({ name: 'forms-access-and-validation', status: 'passed' })
  let browser
  try {
    browser = await chromium.launch({ headless: true })
  } catch (error) {
    throw new Blocked(`Browser unavailable: ${error instanceof Error ? error.message : error}`, {
      cause: error,
    })
  }
  const browserEvents: string[] = []
  const record = (kind: string, message: string) => {
    if (browserEvents.length < 1000)
      browserEvents.push(sanitize(`${kind}: ${message}`).slice(0, 4000))
  }
  const observe = (page: Page, label: string) => {
    page.on('console', (message) => record(`${label} console ${message.type()}`, message.text()))
    page.on('pageerror', (error) => record(`${label} pageerror`, error.stack ?? error.message))
    page.on('requestfailed', (failedRequest) =>
      record(
        `${label} requestfailed`,
        `${failedRequest.method()} ${failedRequest.url()} ${failedRequest.failure()?.errorText ?? 'unknown'}`,
      ),
    )
    page.on('response', (response) => {
      if (response.status() >= 400)
        record(`${label} response`, `${response.status()} ${response.url()}`)
    })
  }
  try {
    const noJavaScript = await browser.newContext({ javaScriptEnabled: false })
    const staticPage = await noJavaScript.newPage()
    observe(staticPage, 'no-javascript')
    await staticPage.goto(`${base}/toolkit-forms?formId=${encodeURIComponent(formId)}`)
    assert.equal(
      await staticPage.getByRole('button', { name: 'Send', exact: true }).isDisabled(),
      true,
      'SSR submit button remains disabled before JavaScript hydration',
    )
    await staticPage.screenshot({
      path: path.join(directory, 'forms-before-hydration.png'),
      fullPage: true,
    })
    evidence.checks.push({
      name: 'forms-ssr-hydration-guard',
      status: 'passed',
      detail:
        'A real JavaScript-disabled browser observes the server-rendered submit control as disabled',
    })
    await noJavaScript.close()
    const page = await browser.newPage()
    observe(page, 'form')
    await page.goto(`${base}/toolkit-forms?formId=${encodeURIComponent(formId)}`)
    await page.getByLabel('Name', { exact: true }).fill('Toolkit contributor')
    await page.getByLabel('Email', { exact: true }).fill('browser@example.test')
    await page.getByLabel('Message', { exact: true }).fill('Persist this browser submission')
    await page.getByRole('button', { name: 'Send', exact: true }).click()
    await page
      .getByRole('status')
      .filter({ hasText: 'Thank you. Your submission was saved.' })
      .waitFor()
    await page.screenshot({ path: path.join(directory, 'forms-success.png'), fullPage: true })
    const saved = await request(
      base,
      `/api/form-submissions?where[form][equals]=${encodeURIComponent(formId)}`,
      'GET',
      undefined,
      token,
    )
    assert.equal(saved.status, 200)
    assert.equal(saved.body.totalDocs, 1)
    const doc = saved.body.docs[0]
    assert.deepEqual(
      doc.submissionData.map((item: { field: string; value: string }) => ({
        field: item.field,
        value: item.value,
      })),
      [
        { field: 'name', value: 'Toolkit contributor' },
        { field: 'email', value: 'browser@example.test' },
        { field: 'message', value: 'Persist this browser submission' },
      ],
    )
    await waitUntil(
      'saved submission notification',
      async () => hasSubmissionNotification(serverLog(), doc.id),
      10_000,
    )
    evidence.identities.savedSubmission = String(doc.id)
    evidence.checks.push({ name: 'forms-browser-persistence-notification', status: 'passed' })
    await page.goto(`${base}/toolkit-forms?formId=${encodeURIComponent(formId)}`)
    await page.route('**/api/form-submissions', (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ errors: [{ message: 'Fixture server rejected submission' }] }),
      }),
    )
    await page.getByLabel('Name', { exact: true }).fill('Failed contributor')
    await page.getByLabel('Email', { exact: true }).fill('failure@example.test')
    await page.getByLabel('Message', { exact: true }).fill('This must not display success')
    await page.getByRole('button', { name: 'Send', exact: true }).click()
    await page.getByRole('alert').waitFor()
    assert.equal(
      await page
        .getByRole('status')
        .filter({ hasText: 'Thank you. Your submission was saved.' })
        .count(),
      0,
    )
    await page.screenshot({ path: path.join(directory, 'forms-error.png'), fullPage: true })
    evidence.checks.push({
      name: 'forms-browser-http-error',
      status: 'passed',
      detail:
        'Controlled HTTP response at the real network boundary; persistence tested separately against real database',
    })
    const admin = await browser.newContext()
    await admin.addCookies([{ name: 'payload-token', value: token, url: base }])
    const adminPage = await admin.newPage()
    observe(adminPage, 'admin')
    await adminPage.goto(base + '/admin/collections/form-submissions')
    await adminPage
      .getByRole('heading', { name: /Form Submissions/i })
      .first()
      .waitFor()
    await adminPage.goto(`${base}/admin/collections/form-submissions/${encodeURIComponent(doc.id)}`)
    await waitUntil(
      'admin saved submission fields',
      async () => {
        const values = await adminPage
          .locator('input, textarea')
          .evaluateAll((elements) => elements.map((element) => (element as HTMLInputElement).value))
        return [
          'Toolkit contributor',
          'browser@example.test',
          'Persist this browser submission',
        ].every((value) => values.includes(value))
      },
      30_000,
    )
    await adminPage.screenshot({ path: path.join(directory, 'forms-admin.png'), fullPage: true })
    evidence.checks.push({ name: 'forms-admin-browser', status: 'passed' })
    await admin.close()
  } catch (error) {
    record(
      'fixture failure',
      error instanceof Error ? (error.stack ?? error.message) : String(error),
    )
    let index = 0
    for (const context of browser.contexts())
      for (const page of context.pages()) {
        if (page.isClosed()) continue
        await page
          .screenshot({
            path: path.join(directory, `browser-failure-${index++}.png`),
            fullPage: true,
            timeout: 5000,
          })
          .catch((cause) => record('failure screenshot', String(cause)))
      }
    throw error
  } finally {
    await fs.writeFile(path.join(directory, 'browser.log'), browserEvents.join('\n') + '\n')
    await browser.close()
  }
}
