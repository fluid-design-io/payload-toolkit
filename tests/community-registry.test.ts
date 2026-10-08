import assert from 'node:assert/strict'
import { test } from 'bun:test'
import {
  assertCommunityListingCurrent,
  parseCommunityDirectory,
  renderCommunityDirectory,
} from '../scripts/community-registry-build.js'

const registry = {
  namespace: '@community',
  name: 'Community',
  description: 'Payload blocks.',
  homepage: 'https://example.com',
  repository: 'https://github.com/example/blocks',
  url: 'https://example.com/r/{name}.json',
}
const directory = (registries: unknown[] = [registry]) => ({ schemaVersion: 1, registries })

test('community directory rejects duplicate namespaces and names', () => {
  assert.throws(
    () => parseCommunityDirectory(directory([registry, { ...registry, name: 'Other' }])),
    /Duplicate registry namespace/,
  )
  assert.throws(
    () =>
      parseCommunityDirectory(
        directory([registry, { ...registry, namespace: '@other', name: 'community' }]),
      ),
    /Duplicate registry name/,
  )
})

test('community directory rejects unsafe URLs and ambiguous templates', () => {
  for (const url of [
    'javascript:alert(1)',
    'http://example.com/r/{name}.json',
    'https://user:password@example.com/r/{name}.json',
    'https://example.com/r/{name}.json#fragment',
    'https://example.com/r/item.json',
    'https://example.com/r/{name}/{name}.json',
    'https://example.com/r/{name}/{other}.json',
    'https://example.com/r/ {name}.json',
  ])
    assert.throws(() => parseCommunityDirectory(directory([{ ...registry, url }])))
  assert.throws(() =>
    parseCommunityDirectory(directory([{ ...registry, homepage: 'javascript:alert(1)' }])),
  )
  assert.throws(() =>
    parseCommunityDirectory(directory([{ ...registry, namespace: '@invalid/namespace' }])),
  )
})

test('community directory accepts ordinary registries without toolkit integration metadata', () => {
  assert.deepEqual(parseCommunityDirectory(directory()).registries, [registry])
  assert.throws(() => parseCommunityDirectory(directory([{ ...registry, certified: true }])))
})

test('generated listing escapes contributed prose and preserves upstream claim attribution', () => {
  const output = renderCommunityDirectory(
    parseCommunityDirectory(
      directory([
        {
          ...registry,
          name: 'A [link] | <script>',
          description: '`code` *text*\nsecond line',
          compatibility: {
            upstream: 'Payload v3.',
            documentation: 'https://example.com/docs',
          },
        },
      ]),
    ),
  )
  assert.ok(output.includes('[A &#91;link&#93; &#124; &lt;script&gt;](<https://example.com>)'))
  assert.ok(output.includes('&#96;code&#96; &#42;text&#42; second line'))
  assert.ok(output.includes('Payload v3. [Upstream documentation](<https://example.com/docs>)'))
  assert.ok(output.includes('Payload v4 runtime compatibility for these registries is unverified.'))
})

test('generated listing check rejects drift and a missing document', () => {
  const expected = renderCommunityDirectory(parseCommunityDirectory(directory()))
  assert.doesNotThrow(() => assertCommunityListingCurrent(expected, expected))
  assert.throws(() => assertCommunityListingCurrent(`${expected}edited`, expected), /outdated/)
  assert.throws(() => assertCommunityListingCurrent(null, expected), /outdated/)
})
