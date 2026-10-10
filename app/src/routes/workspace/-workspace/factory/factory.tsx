import { Typography } from '@heroui/react'
import { ClientOnly } from '@tanstack/react-router'
import { Suspense, lazy } from 'react'
import { mocks } from '@/routes/lab/-lab/lab.mocks'
import { factoryScene } from '../workspace.constants'
import { useFactoryLab } from './factory.lab'

/** Three.js arrives with the scene's own chunk, the first time the factory view opens. */
const Scene = lazy(() => {
  const mock = mocks.find((candidate) => candidate.id === factoryScene)
  if (!mock) throw new Error(`No /lab mock has the id "${factoryScene}"`)
  return mock.load()
})

const surface = 'relative min-h-0 flex-1 overflow-hidden rounded-2xl bg-background'

function FactoryPlaceholder() {
  return (
    <div className={`${surface} grid place-items-center`}>
      <Typography type="body-sm" color="muted">
        Starting the factory…
      </Typography>
    </div>
  )
}

function FactoryScene() {
  const lab = useFactoryLab()

  return (
    <div className={surface}>
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
