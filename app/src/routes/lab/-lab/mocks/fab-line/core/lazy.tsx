/**
 * A variant's component in its own chunk. The registry keeps a variant's data (footprint, frame, tokens, its
 * functions) in the main chunk and its component behind `load`, so the line ships only what it shows. The entry
 * preloads a variant before picking it, so a switch renders the loaded component straight away; the Suspense
 * boundary only shows while something renders a variant nobody preloaded, and then only that station is missing.
 */
import { Suspense, use } from 'react'
import type { ComponentType } from 'react'

export type Lazy<P> = ComponentType<P> & { preload: () => Promise<unknown> }

export function lazyComponent<P extends object>(load: () => Promise<ComponentType<P>>): Lazy<P> {
  let loaded: ComponentType<P> | undefined
  let pending: Promise<ComponentType<P>> | undefined
  const preload = () => (pending ??= load().then((C) => (loaded = C)))
  function Loaded(props: P) {
    const C = loaded ?? use(preload())
    return <C {...props} />
  }
  function Deferred(props: P) {
    return (
      <Suspense fallback={null}>
        <Loaded {...props} />
      </Suspense>
    )
  }
  return Object.assign(Deferred, { preload })
}

/** Loads every lazy component `v` holds under `keys`. */
export const preload = (v: object, keys: readonly string[]) =>
  Promise.all(keys.map((k) => (v as Record<string, Partial<Lazy<object>> | null | undefined>)[k]?.preload?.()))
