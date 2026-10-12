import { Sidebar } from '@heroui-pro/react'
import { cn } from '@heroui/react'

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
import type { View } from './workspace.types'
import { WorkspaceViewSwitch } from './workspace.view-switch'

function WorkspaceRoot({ children }: PropsWithChildren) {
  return (
    <WorkspaceProvider>
      <div className="min-h-svh text-foreground">{children}</div>
    </WorkspaceProvider>
  )
}

/**
 * The column and its toolbar for each view. The grid pads the column, keeps
 * its last row clear of the floating bar and, at 768px and below where the
 * rail is a sheet, sticks the toolbar to the top as a slim row; above that the
 * toolbar scrolls with the grid. The factory holds the column to the viewport
 * with no padding, so the scene fills it edge to edge, and floats the toolbar
 * over the scene's top at the grid's insets so switching views keeps the
 * search in place. The scene stays draggable between the toolbar's controls.
 */
const layouts = {
  grid: {
    main: 'gap-5 max-[769px]:px-4 px-6 pt-6 pb-32',
    toolbar:
      'sticky top-0 order-first max-[769px]:-mx-4 -mx-6 bg-surface px-4 py-2 md:-mx-8 md:px-8 min-[769px]:static min-[769px]:m-0 min-[769px]:bg-transparent min-[769px]:p-0',
  },
  factory: {
    main: 'relative h-[calc(100svh-1rem)] overflow-hidden',
    toolbar:
      'pointer-events-none absolute inset-x-0 top-0 px-4 pt-3 *:pointer-events-auto min-[769px]:px-6 min-[769px]:pt-6',
  },
} satisfies Record<View, { main: string; toolbar: string }>

function WorkspaceMain({ children }: PropsWithChildren) {
  const view = useWorkspaceSelector((state) => state.view)

  // HeroUI's inset main drops its start margin for the rail beside it, which is a sheet at 768px and below.
  return (
    <Sidebar.Main className={cn('flex flex-col max-[769px]:m-1', layouts[view].main)}>
      {children}
    </Sidebar.Main>
  )
}

function WorkspaceToolbar({ children }: PropsWithChildren) {
  const view = useWorkspaceSelector((state) => state.view)

  return (
    <div className={cn('z-10 flex items-center gap-2', layouts[view].toolbar)} data-scene-chrome>
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
