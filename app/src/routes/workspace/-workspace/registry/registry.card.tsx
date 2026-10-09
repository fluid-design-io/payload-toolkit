import { Button, Checkbox, Tooltip, Typography } from '@heroui/react'
import { RiAddLine, RiCheckLine, RiExpandDiagonalLine } from '@remixicon/react'
import { memo, useId, useRef } from 'react'
import { TextContext } from 'react-aria-components'
import { useWorkspace, useWorkspaceSelector } from '../workspace.context'
import type { CatalogItem } from '../workspace.types'
import { flyToBar, shake, stamp } from './registry.flight'
import { RegistryMat } from './registry.mat'

/** Opens the item's detail card, which morphs out of this card's mat. */
function RegistryCardExpand({ item }: { item: CatalogItem }) {
  const { actions } = useWorkspace()
  return (
    <Tooltip delay={400}>
      <Button
        isIconOnly
        size="sm"
        aria-label={`View details for ${item.title}`}
        aria-haspopup="dialog"
        onPress={() => actions.openDetail(item.ref)}
        className="absolute top-2.5 right-2.5 z-10 scale-90 border-0 text-white opacity-0 shadow-none transition-[opacity,scale] duration-300 ease-[cubic-bezier(.34,1.6,.5,1)] before:hidden [--button-bg-hover:rgb(0_0_0/0.75)] [--button-bg-pressed:rgb(0_0_0/0.8)] [--button-bg:rgb(0_0_0/0.6)] pointer-events-none group-hover/item:pointer-events-auto group-hover/item:scale-100 group-hover/item:opacity-100 group-focus-within/item:pointer-events-auto group-focus-within/item:scale-100 group-focus-within/item:opacity-100"
      >
        <RiExpandDiagonalLine size={16} aria-hidden="true" />
      </Button>
      <Tooltip.Content>View details</Tooltip.Content>
    </Tooltip>
  )
}

/**
 * The whole card is one checkbox label; the expand button is a sibling
 * control over the mat. Selecting stamps the page down, rings the mat and
 * flies a copy of the page into the bar; removing shakes the mat. Hovering
 * lifts the page and rolls the group label up into the description, which
 * the checkbox also reads as its description. The mat hides while its detail
 * card is open, so the detail reads as this card lifted out. Each card
 * subscribes to its own selection only, so a toggle re-renders that card and
 * nothing else in the grid.
 */
export const RegistryCard = memo(function RegistryCard({ item }: { item: CatalogItem }) {
  const { actions, meta } = useWorkspace()
  const isSelected = useWorkspaceSelector((state) => state.setup.items.includes(item.ref))
  const isDetailOpen = useWorkspaceSelector((state) => state.detail === item.ref)
  const descriptionId = useId()
  const mat = useRef<HTMLSpanElement>(null)

  return (
    <div className="group/item relative min-w-0">
      <Checkbox
        aria-describedby={descriptionId}
        isSelected={isSelected}
        onChange={(selected) => {
          const page = mat.current?.querySelector<HTMLElement>('[data-registry-page]') ?? null
          if (selected) {
            stamp(page)
            flyToBar(page ?? mat.current, mat.current, meta.buildCount.current)
          } else shake(mat.current)
          actions.toggleItem(item.ref, selected)
        }}
        className="group/card w-full"
      >
        <Checkbox.Content className="group/content flex w-full flex-col items-stretch gap-3 outline-none">
          <RegistryMat
            ref={mat}
            item={item}
            size="card"
            anchor={item.ref}
            className="aspect-[4/3] w-full rounded-2xl ring-offset-2 ring-offset-background transition-[box-shadow,background-color] duration-300 group-data-[focus-visible=true]/content:status-focused! group-data-[selected=true]/card:ring-2 group-data-[selected=true]/card:ring-foreground data-[hidden=true]:invisible"
            isHidden={isDetailOpen}
          />
          <TextContext.Provider value={null}>
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
              <span
                aria-hidden="true"
                className="grid size-7 shrink-0 place-items-center rounded-full border border-border text-foreground transition-colors group-data-[selected=true]/card:border-transparent group-data-[selected=true]/card:bg-foreground group-data-[selected=true]/card:text-background"
              >
                {isSelected ? <RiCheckLine size={14} /> : <RiAddLine size={14} />}
              </span>
            </span>
          </TextContext.Provider>
        </Checkbox.Content>
      </Checkbox>
      <RegistryCardExpand item={item} />
    </div>
  )
})
