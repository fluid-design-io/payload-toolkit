import { createFileRoute } from '@tanstack/react-router'
import { WorkspaceScreen, parseWorkspaceSearch } from './-workspace'

export const Route = createFileRoute('/workspace/')({
  validateSearch: parseWorkspaceSearch,
  component: WorkspaceScreen,
})
