import type { PropsWithChildren } from 'react'
import { useWorkspace } from './workspace.context'

/** The grid, while the search and filter leave at least one item. */
export function WorkspaceResults({ children }: PropsWithChildren) {
  const { state } = useWorkspace()
  if (!state.visible.length) return null

  return <>{children}</>
}

/** Replaces the grid when nothing matches. Selections behind it are kept. */
export function WorkspaceNoMatch() {
  const { state } = useWorkspace()
  if (state.visible.length) return null

  return (
    <p className="py-12 text-sm text-muted">
      {state.query.trim() ? `No items match "${state.query.trim()}".` : 'No items selected.'}
    </p>
  )
}
