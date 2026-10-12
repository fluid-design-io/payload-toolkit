import { githubStarsQuery } from '@/components/github-stars'
import { createFileRoute } from '@tanstack/react-router'
import { LandingScreen } from './-landing'

export const Route = createFileRoute('/')({
  loader: ({ context }) => context.queryClient.ensureQueryData(githubStarsQuery),
  component: LandingScreen,
})
