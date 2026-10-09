import { Typography } from '@heroui/react'
import { Sidebar } from '@heroui-pro/react'
import type { PropsWithChildren } from 'react'
import { Bar } from './bar/bar'
import { Registry } from './registry/registry'
import { WorkspaceProvider } from './workspace.context'
import { WorkspaceRail } from './workspace.rail'
import { WorkspaceNoMatch, WorkspaceResults } from './workspace.states'

function WorkspaceRoot({ children }: PropsWithChildren) {
  return (
    <WorkspaceProvider>
      <div className="min-h-svh text-foreground">{children}</div>
    </WorkspaceProvider>
  )
}

/** Bottom padding keeps the last row of cards clear of the floating bar. */
function WorkspaceMain({ children }: PropsWithChildren) {
  return (
    <Sidebar.Main className="pb-32 px-5 pt-5 flex flex-col gap-5">
      {children}
    </Sidebar.Main>
  )
}

function WorkspaceIntro() {
  return (
    <div className="flex flex-col gap-1">
      <Typography type="h1">Add blocks to your project</Typography>
    </div>
  )
}

/**
 * At 768px and below, where the rail is a sheet, a slim row stuck to the top
 * that leads the column. Above that it adds no box, so the search sits under
 * the intro as a plain column child. The DOM keeps the desktop order, so the
 * heading still comes first for assistive technology.
 */
function WorkspaceToolbar({ children }: PropsWithChildren) {
  return (
    <div className="sticky top-0 z-10 order-first -mx-4 flex items-center gap-2 bg-background px-4 py-2 md:-mx-8 md:px-8 min-[769px]:contents">
      {children}
    </div>
  )
}

export const Workspace = Object.assign(WorkspaceRoot, {
  Rail: WorkspaceRail,
  Main: WorkspaceMain,
  Intro: WorkspaceIntro,
  Toolbar: WorkspaceToolbar,
  Registry,
  Results: WorkspaceResults,
  NoMatch: WorkspaceNoMatch,
  Bar,
})
