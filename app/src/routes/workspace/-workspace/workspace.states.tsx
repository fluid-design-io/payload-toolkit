import { Typography } from '@heroui/react'
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
  if (useWorkspaceSelector((state) => state.view) !== 'grid') return null

  return <>{children}</>
}

/** The factory scene in the grid's place. The rail, search, bar and detail card stay. */
export function WorkspaceFactoryView({ children }: PropsWithChildren) {
  if (useWorkspaceSelector((state) => state.view) !== 'factory') return null

  return <>{children}</>
}
