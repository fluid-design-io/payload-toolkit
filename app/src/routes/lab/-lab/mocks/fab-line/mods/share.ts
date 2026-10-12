/**
 * Share links: a bundle deflated and base64url-encoded into the hash,
 * `#fabmod=<…>`, so it never reaches a server log. The picks ride along as the
 * usual query params. Native CompressionStream; no dependency.
 */
import { parseBundle, serialize } from './data'
import type { Bundle } from './data'

const HASH = 'fabmod='

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream) {
  return new Uint8Array(await new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream)).arrayBuffer())
}
const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const unb64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))

export async function shareUrl(bundle: Bundle, base = location.href) {
  const packed = b64url(await pipe(new TextEncoder().encode(serialize(bundle)), new CompressionStream('deflate-raw')))
  const url = new URL(base)
  url.hash = HASH + packed
  return url.toString()
}

/** The bundle in this page's hash, or null. Throws with a readable message when the link is damaged. */
export async function bundleFromHash(hash = location.hash): Promise<Bundle | null> {
  const at = hash.indexOf(HASH)
  if (at < 0) return null
  let text: string
  try {
    text = new TextDecoder().decode(await pipe(unb64url(hash.slice(at + HASH.length)), new DecompressionStream('deflate-raw')))
  } catch {
    throw new Error('This mod link is damaged or cut short.')
  }
  return parseBundle(text)
}

export function clearHash() {
  const url = new URL(location.href)
  url.hash = ''
  history.replaceState(history.state, '', url)
}
