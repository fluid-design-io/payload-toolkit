import { SRGBColorSpace, TextureLoader } from 'three'
import type { Texture } from 'three'

const loader = new TextureLoader()
const cache = new Map<string, Texture | null>()

/**
 * The block screenshot for `url`, cropped from the top to a card face of
 * `aspect` (width over depth), or null until it loads. The wall's close-up
 * pool and the live parts share one copy; `onLoad` asks for a frame because
 * the scene renders on demand.
 */
export function screenshot(url: string | undefined, aspect: number, onLoad: () => void): Texture | null {
  if (!url) return null
  const key = `${url}|${aspect.toFixed(3)}`
  const hit = cache.get(key)
  if (hit !== undefined) return hit
  cache.set(key, null)
  loader.load(url, (t) => {
    if (!cache.has(key)) {
      t.dispose()
      return
    }
    t.colorSpace = SRGBColorSpace
    t.anisotropy = 4
    const image = t.image as HTMLImageElement
    const have = image.height / image.width
    const want = 1 / aspect
    if (have > want) {
      t.repeat.set(1, want / have)
      t.offset.set(0, 1 - want / have)
    }
    cache.set(key, t)
    onLoad()
  })
  return null
}

export function clearScreenshots() {
  for (const t of cache.values()) t?.dispose()
  cache.clear()
}
