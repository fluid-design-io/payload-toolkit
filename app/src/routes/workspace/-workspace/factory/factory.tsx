import { Typography, cn } from '@heroui/react'
import { ClientOnly } from '@tanstack/react-router'
import { Suspense, lazy } from 'react'
import { useFactoryLab } from './factory.lab'

/** Three.js arrives with the scene's own chunk, the first time the factory view opens. */
const Scene = lazy(() => import('@/routes/lab/-lab/mocks/fab-line'))

/**
 * The scene fills the column. Its canvas fades out under the floating
 * toolbar and softly at the other edges, into the scene's own background, so
 * the controls read over it and the world has no hard frame. The top fade
 * ends at `--scene-fade`, which the scene sets from the toolbar it measures
 * and frames its shots below. Only the canvas is masked; the scene's own
 * overlays stay crisp.
 */
const surface = 'relative min-h-0 flex-1'
const fade =
  '[&_canvas]:mask-t-from-[calc(100%-var(--scene-fade,7rem))] [&_canvas]:mask-b-from-[calc(100%-3rem)] [&_canvas]:mask-x-from-[calc(100%-1.5rem)]'

function FactoryPlaceholder() {
  return (
    <div className={cn(surface, 'grid place-items-center')}>
      <Typography type="body-sm" color="muted">
        Starting the factory…
      </Typography>
    </div>
  )
}

function FactoryScene() {
  const lab = useFactoryLab()

  return (
    <div className={cn(surface, fade)}>
      <Scene lab={lab} />
    </div>
  )
}

/**
 * The 3D factory in the grid's place, filling the rest of the column. WebGL
 * has no server render, so the server and hydration draw the placeholder,
 * which also covers the scene's chunk loading.
 */
export function Factory() {
  return (
    <ClientOnly fallback={<FactoryPlaceholder />}>
      <Suspense fallback={<FactoryPlaceholder />}>
        <FactoryScene />
      </Suspense>
    </ClientOnly>
  )
}
