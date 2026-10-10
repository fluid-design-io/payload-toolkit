import { Sidebar } from '@heroui-pro/react'

import type { PropsWithChildren } from 'react'
import { Bar } from './bar/bar'
import { Factory } from './factory/factory'
import { Registry } from './registry/registry'
import { WorkspaceProvider, useWorkspaceSelector } from './workspace.context'
import { WorkspaceRail } from './workspace.rail'
import {
  WorkspaceFactoryView,
  WorkspaceGridView,
  WorkspaceNoMatch,
  WorkspaceResults,
} from './workspace.states'
import { WorkspaceViewSwitch } from './workspace.view-switch'

function WorkspaceRoot({ children }: PropsWithChildren) {
  return (
    <WorkspaceProvider>
      <div className="min-h-svh text-foreground">{children}</div>
    </WorkspaceProvider>
  )
}

/**
 * Bottom padding keeps the last row of cards clear of the floating bar. The
 * factory instead holds the column to the viewport, so its scene fills what
 * the toolbar leaves and the bar floats over it.
 */
function WorkspaceMain({ children }: PropsWithChildren) {
  const view = useWorkspaceSelector((state) => state.view)

  return (
    <Sidebar.Main
      data-view={view}
      className="pb-32 px-6 pt-6 flex flex-col gap-5 data-[view=factory]:h-[calc(100svh-1rem)] data-[view=factory]:pb-6"
    >
      {children}
    </Sidebar.Main>
  )
}

/**
 * At 768px and below, where the rail is a sheet, a slim row stuck to the top
 * that leads the column. Above that it is a plain row at the top of the
 * column that scrolls with the grid: the search, then the view switch at its
 * end.
 */
function WorkspaceToolbar({ children }: PropsWithChildren) {
  return (
    <div className="sticky top-0 z-10 order-first -mx-6 flex items-center gap-2 bg-surface px-4 py-2 md:-mx-8 md:px-8 min-[769px]:static min-[769px]:m-0 min-[769px]:bg-transparent min-[769px]:p-0">
      {children}
    </div>
  )
}

export const Workspace = Object.assign(WorkspaceRoot, {
  Rail: WorkspaceRail,
  Main: WorkspaceMain,
  Toolbar: WorkspaceToolbar,
  Registry,
  ViewSwitch: WorkspaceViewSwitch,
  GridView: WorkspaceGridView,
  FactoryView: WorkspaceFactoryView,
  Results: WorkspaceResults,
  NoMatch: WorkspaceNoMatch,
  Factory,
  Bar,
})
