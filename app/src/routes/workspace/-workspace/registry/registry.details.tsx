import { Sheet } from '@heroui-pro/react'
import { Button, Link, Tooltip } from '@heroui/react'
import { RiAddLine, RiCheckLine, RiExpandDiagonalLine, RiExternalLinkLine } from '@remixicon/react'
import { useState } from 'react'
import { useWorkspace, useWorkspaceSelector } from '../workspace.context'
import type { CatalogItem } from '../workspace.types'
import { RegistryThumbnail } from './registry.thumbnail'

export function RegistryDetails({ item }: { item: CatalogItem }) {
  const [isOpen, setIsOpen] = useState(false)
  const { actions } = useWorkspace()
  const isSelected = useWorkspaceSelector((state) => state.setup.items.includes(item.ref))
  const itemUrl = item.previewUrl ?? item.itemUrl
  const sourceName = item.sourceName ?? item.source

  return (
    <>
      <Tooltip delay={400}>
        <Button
          isIconOnly
          size="sm"
          variant="ghost"
          aria-label={`View details for ${item.title}`}
          aria-haspopup="dialog"
          aria-expanded={isOpen}
          onPress={() => setIsOpen(true)}
          className="absolute right-3 bottom-3 pointer-events-none opacity-0 group-hover/item:pointer-events-auto group-hover/item:opacity-100 group-focus-within/item:pointer-events-auto group-focus-within/item:opacity-100"
        >
          <RiExpandDiagonalLine size={16} aria-hidden="true" />
        </Button>
        <Tooltip.Content>View details</Tooltip.Content>
      </Tooltip>
      <Sheet placement="right" isOpen={isOpen} onOpenChange={setIsOpen} shouldAutoFocus>
        <Sheet.Backdrop variant="blur">
          <Sheet.Content className="w-[min(52rem,100vw)] max-w-full">
            <Sheet.Dialog className="h-full">
              <Sheet.CloseTrigger aria-label="Close item details" />
              <Sheet.Header className="pr-14">
                <Sheet.Heading>{item.title}</Sheet.Heading>
                <p className="text-sm text-muted capitalize">{item.kind}</p>
              </Sheet.Header>
              <Sheet.Body className="flex flex-col gap-6">
                <div className="aspect-[16/10] w-full shrink-0 overflow-hidden rounded-2xl bg-surface-secondary">
                  <RegistryThumbnail item={item} />
                </div>
                <p className="text-sm text-muted">{item.description}</p>
                <div className="flex flex-col gap-2">
                  <p className="text-xs text-muted">From</p>
                  {item.sourceHomepage ? (
                    <Link
                      href={item.sourceHomepage}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-fit"
                    >
                      {sourceName}
                      <Link.Icon>
                        <RiExternalLinkLine size={14} aria-hidden="true" />
                      </Link.Icon>
                    </Link>
                  ) : (
                    <p className="text-sm font-medium">{sourceName}</p>
                  )}
                  <p className="text-xs text-muted break-all">{item.source}</p>
                  {itemUrl && (
                    <Link
                      href={itemUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`View ${item.title} on ${sourceName} (opens in a new tab)`}
                      className="mt-2 w-fit text-sm"
                    >
                      {item.kind === 'feature'
                        ? 'View guide'
                        : item.previewUrl
                          ? 'View component'
                          : 'View registry item'}
                      <Link.Icon>
                        <RiExternalLinkLine size={14} aria-hidden="true" />
                      </Link.Icon>
                    </Link>
                  )}
                </div>
              </Sheet.Body>
              <Sheet.Footer>
                <Button
                  variant={isSelected ? 'secondary' : 'primary'}
                  onPress={() => actions.toggleItem(item.ref, !isSelected)}
                  className="w-full"
                >
                  {isSelected ? (
                    <RiCheckLine size={18} aria-hidden="true" />
                  ) : (
                    <RiAddLine size={18} aria-hidden="true" />
                  )}
                  {isSelected ? 'Remove from project' : 'Add to project'}
                </Button>
              </Sheet.Footer>
            </Sheet.Dialog>
          </Sheet.Content>
        </Sheet.Backdrop>
      </Sheet>
    </>
  )
}
