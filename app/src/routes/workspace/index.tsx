import { githubStarsQuery } from '@/components/github-stars.tsx'
import { createFileRoute } from '@tanstack/react-router'
import { WorkspaceScreen, parseWorkspaceSearch } from './-workspace'

export const Route = createFileRoute('/workspace/')({
  validateSearch: parseWorkspaceSearch,
  loader: ({ context }) => context.queryClient.ensureQueryData(githubStarsQuery),
  component: WorkspaceScreen,
})
