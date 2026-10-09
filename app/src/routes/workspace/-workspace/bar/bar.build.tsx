import { Typography, Button, Tooltip } from '@heroui/react'
import { EmptyState } from '@heroui-pro/react'
import { RiCloseLine, RiStackLine } from '@remixicon/react'
import { shallow } from '@tanstack/react-store'
import { useWorkspace, useWorkspaceSelector } from '../workspace.context'
import { selectedItems } from '../workspace.utils'
import { BarPanel } from './bar.panel'

function BuildItems() {
  const { actions, meta } = useWorkspace()
  const items = useWorkspaceSelector(
    (state) => selectedItems(state.setup, meta.catalog.items),
    shallow,
  )

  if (!items.length)
    return (
      <EmptyState size="sm">
        <EmptyState.Header>
          <EmptyState.Media variant="icon">
            <RiStackLine aria-hidden="true" />
          </EmptyState.Media>
          <EmptyState.Title>No items yet</EmptyState.Title>
          <EmptyState.Description>
            The base Payload app installs on its own.
          </EmptyState.Description>
        </EmptyState.Header>
      </EmptyState>
    )

  return (
    <div className="flex min-h-0 flex-col gap-1">
      <div className="flex items-center justify-between">
        <Typography
          render={(props) => <span {...props} />}
          type="body-xs"
          color="muted"
          className="tabular-nums"
        >
          {items.length} {items.length === 1 ? 'item' : 'items'}
        </Typography>
        <Button size="sm" variant="ghost" onPress={actions.clearItems}>
          Clear
        </Button>
      </div>
      <ul className="flex max-h-48 flex-col overflow-y-auto">
        {items.map((item) => (
          <li key={item.ref} className="flex items-center gap-2 py-1">
            <span className="flex min-w-0 flex-1 flex-col">
              <Typography
                render={(props) => <span {...props} />}
                type="body-sm"
                truncate
              >
                {item.title}
              </Typography>
              <Typography
                render={(props) => <span {...props} />}
                type="body-xs"
                color="muted"
                truncate
                className="font-mono"
              >
                {item.ref}
              </Typography>
            </span>
            <Tooltip delay={400}>
              <Button
                isIconOnly
                size="sm"
                variant="ghost"
                aria-label={`Remove ${item.title}`}
                onPress={() => actions.toggleItem(item.ref, false)}
              >
                <RiCloseLine size={16} aria-hidden="true" />
              </Button>
              <Tooltip.Content>Remove</Tooltip.Content>
            </Tooltip>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * The count sits inside the trigger as a pill, muted at zero; the accessible
 * name carries it. The pill (`leading-5`) sits in an `h-9` button, so `pe-2`
 * gives its end the same inset as its top and bottom, keeping both concentric.
 */
export function BarBuild() {
  const count = useWorkspaceSelector((state) => state.setup.items.length)

  return (
    <BarPanel
      panel="build"
      title="Your build"
      label={`Your build, ${count} ${count === 1 ? 'item' : 'items'}`}
      className="pe-2"
      trigger={
        <>
          <RiStackLine size={16} aria-hidden="true" />
          <Typography
            render={(props) => <span {...props} />}
            type="body-xs"
            weight="semibold"
            align="center"
            data-empty={count === 0}
            className="min-w-5 rounded-full bg-white px-1.5 leading-5 text-black tabular-nums data-[empty=true]:bg-white/15 data-[empty=true]:text-white/60"
          >
            {count}
          </Typography>
        </>
      }
    >
      <BuildItems />
    </BarPanel>
  )
}
