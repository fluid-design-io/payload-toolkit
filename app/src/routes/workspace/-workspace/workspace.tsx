import type { PropsWithChildren } from 'react'
import { WorkspaceProvider } from './workspace.context'
import { WorkspaceHeader } from './workspace.header'
import { WorkspaceRegistry } from './workspace.registry'
import { WorkspaceSetup } from './workspace.setup'
import { WorkspaceNoMatch, WorkspaceResults } from './workspace.states'

function WorkspaceRoot({ children }: PropsWithChildren) {
  return (
    <WorkspaceProvider>
      <div className="group/workspace min-h-svh bg-background text-foreground lg:flex lg:h-svh">
        {children}
      </div>
    </WorkspaceProvider>
  )
}

/** Scrolls on its own from lg; below lg it clears the fixed sheet, expanded or peeking. */
function WorkspaceMain({ children }: PropsWithChildren) {
  return (
    <main className="min-w-0 flex-1 px-4 pb-[calc(50svh+24px)] max-lg:group-has-[aside[data-collapsed=true]]/workspace:pb-72 lg:overflow-y-auto lg:px-8 lg:pb-8">
      {children}
    </main>
  )
}

export const Workspace = Object.assign(WorkspaceRoot, {
  Main: WorkspaceMain,
  Header: WorkspaceHeader,
  Registry: WorkspaceRegistry,
  Results: WorkspaceResults,
  NoMatch: WorkspaceNoMatch,
  Setup: WorkspaceSetup,
})
