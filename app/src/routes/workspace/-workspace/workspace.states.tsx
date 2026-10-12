import { Typography } from '@heroui/react'
import { Activity, useLayoutEffect, useRef, useState } from 'react'
import type { PropsWithChildren } from 'react'
import { useWorkspace, useWorkspaceSelector } from './workspace.context'
import { visibleItems } from './workspace.utils'

function useHasResults(): boolean {
  const { meta } = useWorkspace()
  return useWorkspaceSelector(
    (state) =>
      visibleItems(meta.catalog.items, state.query, state.category).length > 0,
  )
}

/** The grid, while the search and category leave at least one item. */
export function WorkspaceResults({ children }: PropsWithChildren) {
  if (!useHasResults()) return null

  return <>{children}</>
}

/** Replaces the grid when the search matches nothing. Selections behind it are kept. */
export function WorkspaceNoMatch() {
  const hasResults = useHasResults()
  const query = useWorkspaceSelector((state) => state.query.trim())
  if (hasResults) return null

  return (
    <Typography type="body-sm" color="muted" className="py-12">
      No items match "{query}".
    </Typography>
  )
}

/** The grid and its empty state, while the grid view is chosen. */
export function WorkspaceGridView({ children }: PropsWithChildren) {
  const shown = useWorkspaceSelector((state) => state.view) === 'grid'
  // The grid scrolls the page and the factory pins it, so the page's own offset is lost on the way out: put it back.
  const scrollY = useRef(0)
  useLayoutEffect(() => {
    if (!shown) return
    scrollTo({ top: scrollY.current })
    const onScroll = () => {
      scrollY.current = window.scrollY
    }
    addEventListener('scroll', onScroll, { passive: true })
    return () => removeEventListener('scroll', onScroll)
  }, [shown])

  return <Activity mode={shown ? 'visible' : 'hidden'}>{children}</Activity>
}

/**
 * The factory scene in the grid's place. The rail, search, bar and detail card stay. It mounts on the first visit
 * and is only hidden after that, so coming back keeps the camera, the line mid-run and the GPU resources; while
 * hidden its frame loop and listeners are off, so it costs memory but no frames.
 */
export function WorkspaceFactoryView({ children }: PropsWithChildren) {
  const shown = useWorkspaceSelector((state) => state.view) === 'factory'
  const [visited, setVisited] = useState(shown)
  if (shown && !visited) setVisited(true)
  if (!visited) return null

  return <Activity mode={shown ? 'visible' : 'hidden'}>{children}</Activity>
}
