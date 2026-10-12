/**
 * Tier 2: code mods. A bundle's `code` is an ES module whose default export
 * is `(host) => ({ <slot>: [variants] })`, sync or async. It runs from a blob
 * URL in this page, so it shares the page's React, three and R3F through
 * `host` instead of importing its own (a second React breaks hooks). It also
 * shares the page's origin: storage, cookies, same-origin requests. That is
 * why the registry only calls this for code whose hash the user trusted.
 */
export async function runCode(code: string): Promise<unknown> {
  const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }))
  try {
    const [mod, { host }] = await Promise.all([import(/* @vite-ignore */ url), import('./host')])
    if (typeof mod.default !== 'function') throw new Error('The module must `export default (host) => ({ ... })`.')
    return await mod.default(host)
  } finally {
    URL.revokeObjectURL(url)
  }
}
