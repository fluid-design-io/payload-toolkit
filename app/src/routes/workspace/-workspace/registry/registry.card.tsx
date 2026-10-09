import { Checkbox, cn, Typography } from '@heroui/react'
import { RiAddLine, RiCheckLine } from '@remixicon/react'
import { memo, useId } from 'react'
import { TextContext } from 'react-aria-components'
import { useWorkspace, useWorkspaceSelector } from '../workspace.context'
import type { CatalogItem } from '../workspace.types'
import { RegistryDetails } from './registry.details'
import { RegistryThumbnail } from './registry.thumbnail'

/**
 * The card body is a checkbox label; the details button is a sibling control. The
 * corner button is decoration over the thumbnail and never moves the layout.
 * The card, thumbnail and corner button share one corner center: each inner
 * radius is the outer radius minus its inset. The border is always 2px and
 * only changes color, so selecting a card never moves the thumbnail.
 * Each card subscribes to its own selection only, so toggling one card
 * re-renders that card and nothing else in the grid. The kind is hidden from
 * the label's text and referenced as the description, so the checkbox is
 * named by the title alone.
 */
export const RegistryCard = memo(function RegistryCard({ item }: { item: CatalogItem }) {
  const { actions } = useWorkspace()
  const isSelected = useWorkspaceSelector((state) => state.setup.items.includes(item.ref))
  const kindId = useId()

  return (
    <div className="group/item relative min-w-0">
      <Checkbox
        aria-describedby={kindId}
        isSelected={isSelected}
        onChange={(selected) => actions.toggleItem(item.ref, selected)}
        className="group/card w-full"
      >
        <Checkbox.Content
          className={cn(
            '[--card-border:2px] [--card-inset:calc(var(--card-pad)+var(--card-border))] [--card-pad:calc(var(--spacing)*1.5)] [--card-radius:var(--radius-xl)]',
            'w-full transition-all duration-150 rounded-(--card-radius) border-(length:--card-border) border-transparent p-(--card-pad)',
            'data-[focus-visible=true]:status-focused',
            'data-[hovered=true]:not-group-data-[selected=true]/card:border-border group-data-[selected=true]/card:border-accent',
          )}
        >
          <span title={item.description} className="flex w-full flex-col gap-2.5">
            <span className="relative block aspect-[16/10] w-full overflow-hidden rounded-(--thumb-radius) bg-surface-secondary [--thumb-radius:max(0px,calc(var(--card-radius)-var(--card-inset)))]">
              <RegistryThumbnail item={item} />
              <span
                aria-hidden="true"
                className="absolute top-2.5 right-2.5 grid size-5 place-items-center rounded-full bg-background/85 text-foreground shadow-surface backdrop-blur-sm group-data-[selected=true]/card:bg-accent group-data-[selected=true]/card:text-accent-foreground"
              >
                {isSelected ? <RiCheckLine size={14} /> : <RiAddLine size={14} />}
              </span>
            </span>
            <TextContext.Provider value={null}>
              <span className="flex w-full min-w-0 flex-col gap-0.5 px-1.5 pb-1 pr-12">
                <Typography
                  render={(props) => <span {...props} />}
                  type="body-sm"
                  weight="medium"
                  truncate
                >
                  {item.title}
                </Typography>
                <Typography
                  render={(props) => <span {...props} />}
                  type="body-xs"
                  color="muted"
                  id={kindId}
                  aria-hidden="true"
                  className="capitalize"
                >
                  {item.kind}
                </Typography>
              </span>
            </TextContext.Provider>
          </span>
        </Checkbox.Content>
      </Checkbox>
      <RegistryDetails item={item} />
    </div>
  )
})
