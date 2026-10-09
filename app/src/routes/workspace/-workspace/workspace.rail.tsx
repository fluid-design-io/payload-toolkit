import { LogoMark } from '@/components/logo.tsx'
import { Sheet, Sidebar, useSidebar } from '@heroui-pro/react'
import { Typography, buttonVariants } from '@heroui/react'
import { RiMenuLine } from '@remixicon/react'
import { Link } from '@tanstack/react-router'
import type { PropsWithChildren } from 'react'
import { useWorkspace, useWorkspaceSelector } from './workspace.context'
import { WorkspaceTheme } from './workspace.theme'
import type { Category } from './workspace.types'

function RailItem({ category }: { category: Category }) {
  const { actions } = useWorkspace()
  const isCurrent = useWorkspaceSelector((state) => state.category === category.id)

  return (
    <Sidebar.MenuItem
      id={category.id}
      textValue={category.label}
      isCurrent={isCurrent}
      onAction={() => actions.setCategory(category.id)}
    >
      <Sidebar.MenuItemContent className="in-data-[current=true]:bg-surface in-data-[current=true]:shadow-surface px-4">
        <Sidebar.MenuLabel>{category.label}</Sidebar.MenuLabel>
        <Sidebar.MenuChip className="tabular-nums">{category.count}</Sidebar.MenuChip>
      </Sidebar.MenuItemContent>
    </Sidebar.MenuItem>
  )
}

/**
 * The categories, then the home link and theme toggle in the footer. The
 * desktop aside and the mobile sheet both render this body. Picking a
 * category closes the sheet through the menu items' `closeMobileOnAction`.
 */
function RailBody() {
  const { meta } = useWorkspace()

  return (
    <>
      <Sidebar.Content className="py-5">
        <Sidebar.Group>
          <Sidebar.Menu aria-label="Kinds">
            {meta.catalog.kinds.map((category) => (
              <RailItem key={category.id} category={category} />
            ))}
          </Sidebar.Menu>
        </Sidebar.Group>
        <Sidebar.Group>
          <Sidebar.GroupLabel>Blocks</Sidebar.GroupLabel>
          <Sidebar.Menu aria-label="Blocks">
            {meta.catalog.blocks.map((category) => (
              <RailItem key={category.id} category={category} />
            ))}
          </Sidebar.Menu>
        </Sidebar.Group>
      </Sidebar.Content>
      <Sidebar.Footer className="flex-row items-center justify-between ps-5">
        <Link
          to="/"
          className={buttonVariants({ variant: 'ghost', isIconOnly: true, className: 'group' })}
        >
          <LogoMark className="h-5 w-auto" />
        </Link>
        <WorkspaceTheme />
      </Sidebar.Footer>
    </>
  )
}

function WorkspaceRailRoot({ children }: PropsWithChildren) {
  return (
    <Sidebar.Provider
      collapsible="icon"
      variant="inset"
      toggleShortcut={false}
      className="container mx-auto"
    >
      <Sidebar aria-label="Categories">
        <RailBody />
      </Sidebar>
      <Sidebar.Mobile>
        <Sheet.Heading className="sr-only">Categories</Sheet.Heading>
        <RailBody />
      </Sidebar.Mobile>
      {children}
    </Sidebar.Provider>
  )
}

function WorkspaceRailTrigger() {
  const { setMobileOpen } = useSidebar()

  return (
    <Sidebar.Trigger
      aria-label="Open categories"
      className="shrink-0 min-[769px]:hidden"
      onPress={() => setMobileOpen(true)}
    >
      <RiMenuLine size={16} aria-hidden="true" />
    </Sidebar.Trigger>
  )
}

/** The current category's label beside the trigger, so the closed rail still shows the filter. */
function WorkspaceRailCurrent() {
  const { meta } = useWorkspace()
  const label = useWorkspaceSelector(
    (state) =>
      [...meta.catalog.kinds, ...meta.catalog.blocks].find(
        (category) => category.id === state.category,
      )?.label,
  )

  return (
    <Typography
      render={(props) => <span {...props} />}
      type="body-sm"
      weight="medium"
      truncate
      className="min-w-0 shrink min-[769px]:hidden"
    >
      {label}
    </Typography>
  )
}

export const WorkspaceRail = Object.assign(WorkspaceRailRoot, {
  Trigger: WorkspaceRailTrigger,
  Current: WorkspaceRailCurrent,
})
