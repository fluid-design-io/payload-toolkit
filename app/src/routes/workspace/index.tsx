import { createFileRoute } from '@tanstack/react-router'
import { WorkspaceScreen } from './-workspace'

export const Route = createFileRoute('/workspace/')({ component: WorkspaceScreen })
