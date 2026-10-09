import { Button, ScrollShadow, Tooltip, Typography } from '@heroui/react'
import { EmptyState } from '@heroui-pro/react'
import { RiCloseLine, RiStackLine } from '@remixicon/react'
import { shallow } from '@tanstack/react-store'
import type { CSSProperties } from 'react'
import { useWorkspace, useWorkspaceSelector } from '../workspace.context'
import { selectedItems } from '../workspace.utils'
import { CardSection } from './bar.card'

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
    <div className="flex h-full min-h-0 flex-col gap-1">
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
      <ScrollShadow className="min-h-0 flex-1 overflow-y-auto">
        <ul className="flex flex-col">
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
      </ScrollShadow>
    </div>
  )
}

export function BuildView() {
  return (
    <CardSection className="min-h-0 flex-1">
      <BuildItems />
    </CardSection>
  )
}

/** Light-on-black ghost styling for the bar row, with a lit state while its view is open. */
const barButton =
  'text-white [--button-bg-hover:rgb(255_255_255/0.14)] [--button-bg-pressed:rgb(255_255_255/0.2)] [--button-fg:white] data-[open=true]:[--button-bg:rgb(255_255_255/0.14)]'

/** The last three picks, fanned in their category tints; the stack icon while the build is empty. */
function BuildStack() {
  const { meta } = useWorkspace()
  const hues = useWorkspaceSelector(
    (state) => selectedItems(state.setup, meta.catalog.items).slice(-3).map((item) => item.hue),
    shallow,
  )
  if (!hues.length) return <RiStackLine size={18} aria-hidden="true" />

  return (
    <span aria-hidden="true" className="flex items-center ps-2">
      {hues.map((hue, index) => (
        <span
          key={index}
          style={{ '--hue': hue, rotate: `${(index - (hues.length - 1) / 2) * 9}deg` } as CSSProperties}
          className="-ms-2 h-3.5 w-5 rounded-[4px] border-[1.5px] border-black bg-[oklch(86%_0.08_var(--hue))]"
        />
      ))}
    </span>
  )
}

/**
 * Opens and closes the build view. The count sits inside as a pill, muted at
 * zero; the accessible name carries it. The pill is also where a selected
 * item's preview lands. The pill (`leading-6`) sits in an `h-11` button, so
 * `pe-2.5` gives its end the same inset as its top and bottom, keeping both
 * concentric.
 */
export function BarBuild() {
  const { actions, meta } = useWorkspace()
  const count = useWorkspaceSelector((state) => state.setup.items.length)
  const isOpen = useWorkspaceSelector((state) => state.panel === 'build')

  return (
    <Tooltip delay={400}>
      <Button
        size="lg"
        variant="ghost"
        aria-label={`Your build, ${count} ${count === 1 ? 'item' : 'items'}`}
        aria-expanded={isOpen}
        data-open={isOpen}
        className={`pe-2.5 ${barButton}`}
        onPress={() => (isOpen ? actions.closePanel('build') : actions.openPanel('build'))}
      >
        <BuildStack />
        <span
          ref={meta.buildCount}
          data-empty={count === 0}
          className="min-w-6 rounded-full bg-white px-2 text-center text-sm leading-6 font-semibold text-black tabular-nums data-[empty=true]:bg-white/15 data-[empty=true]:text-white/60"
        >
          {count}
        </span>
      </Button>
      <Tooltip.Content>Your build</Tooltip.Content>
    </Tooltip>
  )
}
