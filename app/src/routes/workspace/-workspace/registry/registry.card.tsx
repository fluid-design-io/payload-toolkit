import { ToggleButton, Tooltip, Typography } from '@heroui/react'
import { RiAddLine, RiCheckLine } from '@remixicon/react'
import { memo, useId, useRef } from 'react'
import { Button as AriaButton } from 'react-aria-components'
import { useWorkspace, useWorkspaceSelector } from '../workspace.context'
import type { CatalogItem } from '../workspace.types'
import { flyToBar, shake, stamp } from './registry.flight'
import { RegistryMat } from './registry.mat'

/**
 * The mat is a button that opens the item's detail card, which morphs out of
 * it; only the plus toggles the item in the build. Selecting stamps the page
 * down, rings the mat and flies a copy of the page into the bar; removing
 * shakes the mat. Hovering the mat lifts its page, hovering the card rolls
 * the group label up into the description, and hovering the plus fills it
 * and turns the plus a quarter. The mat hides while its detail card is open,
 * so the detail reads as this card lifted out. Each card subscribes to its
 * own selection only, so a toggle re-renders that card and nothing else in
 * the grid.
 */
export const RegistryCard = memo(function RegistryCard({ item }: { item: CatalogItem }) {
  const { actions, meta } = useWorkspace()
  const isSelected = useWorkspaceSelector((state) => state.setup.items.includes(item.ref))
  const isDetailOpen = useWorkspaceSelector((state) => state.detail === item.ref)
  const descriptionId = useId()
  const mat = useRef<HTMLSpanElement>(null)
  const action = isSelected ? 'Remove from build' : 'Add to build'

  return (
    <div className="group/item flex min-w-0 flex-col gap-3">
      <AriaButton
        aria-label={`View details for ${item.title}`}
        aria-describedby={descriptionId}
        aria-haspopup="dialog"
        onPress={() => actions.openDetail(item.ref)}
        className="group/mat block w-full rounded-2xl text-left outline-none"
      >
        <RegistryMat
          ref={mat}
          item={item}
          size="card"
          anchor={item.ref}
          className={`aspect-[4/3] w-full rounded-2xl ring-offset-2 ring-offset-background transition-[box-shadow,background-color] duration-300 group-data-[focus-visible=true]/mat:status-focused! data-[hidden=true]:invisible ${isSelected ? 'ring-2 ring-foreground' : ''}`}
          isHidden={isDetailOpen}
        />
      </AriaButton>
      <span className="flex w-full min-w-0 items-center gap-3 px-1">
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <Typography render={(props) => <span {...props} />} type="body-sm" weight="medium" truncate>
            {item.title}
          </Typography>
          <span aria-hidden="true" className="block h-4 overflow-hidden text-xs leading-4 text-muted">
            <span className="flex flex-col transition-transform duration-300 ease-[cubic-bezier(.34,1.4,.5,1)] group-hover/item:-translate-y-1/2">
              <span className="truncate">{item.label}</span>
              <span id={descriptionId} className="truncate">
                {item.description}
              </span>
            </span>
          </span>
        </span>
        <Tooltip delay={400}>
          <ToggleButton
            isIconOnly
            size="sm"
            aria-label={`${action}: ${item.title}`}
            isSelected={isSelected}
            onChange={(selected) => {
              const page = mat.current?.querySelector<HTMLElement>('[data-registry-page]') ?? null
              if (selected) {
                stamp(page)
                flyToBar(page ?? mat.current, mat.current, meta.buildCount.current)
              } else shake(mat.current)
              actions.toggleItem(item.ref, selected)
            }}
            className="group/add size-8 shrink-0 rounded-full border border-border transition-[scale,background-color,border-color] duration-300 ease-[cubic-bezier(.34,1.6,.5,1)] [--toggle-button-bg-hover:var(--foreground)] [--toggle-button-bg-pressed:var(--foreground)] [--toggle-button-bg-selected-hover:color-mix(in_oklch,var(--foreground)_85%,var(--background))] [--toggle-button-bg-selected-pressed:color-mix(in_oklch,var(--foreground)_85%,var(--background))] [--toggle-button-bg-selected:var(--foreground)] [--toggle-button-bg:transparent] [--toggle-button-fg-selected:var(--background)] data-[hovered=true]:scale-110 data-[hovered=true]:border-transparent data-[hovered=true]:text-background data-[pressed=true]:scale-95 data-[selected=true]:border-transparent"
          >
            {isSelected ? (
              <RiCheckLine size={16} aria-hidden="true" />
            ) : (
              <RiAddLine
                size={16}
                aria-hidden="true"
                className="transition-transform duration-300 ease-[cubic-bezier(.34,1.6,.5,1)] group-data-[hovered=true]/add:rotate-90"
              />
            )}
          </ToggleButton>
          <Tooltip.Content>{action}</Tooltip.Content>
        </Tooltip>
      </span>
    </div>
  )
})
