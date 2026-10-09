import { useSyncExternalStore } from 'react'

function subscribe(onChange: () => void) {
  addEventListener('resize', onChange)
  return () => removeEventListener('resize', onChange)
}

/**
 * The window size, for morph targets that must fit it. The server and
 * hydration see `fallback`; the snapshot is a string so it stays stable.
 */
export function useViewport(fallback: { width: number; height: number }) {
  const size = useSyncExternalStore(
    subscribe,
    () => `${innerWidth}x${innerHeight}`,
    () => `${fallback.width}x${fallback.height}`,
  )
  const [width, height] = size.split('x').map(Number)
  return { width, height }
}
