import { Button, Link, Typography } from '@heroui/react'
import { RiAddLine, RiCheckLine, RiCloseLine, RiExternalLinkLine } from '@remixicon/react'
import type { Variants } from 'motion/react'
import { LazyMotion, domAnimation, useReducedMotion } from 'motion/react'
import * as m from 'motion/react-m'
import { useRef, useState } from 'react'
import { Dialog, Heading, Modal, ModalOverlay } from 'react-aria-components'
import { morph, morphContentDelay, riseIn } from '../workspace.constants'
import { useWorkspace, useWorkspaceSelector } from '../workspace.context'
import type { CatalogItem } from '../workspace.types'
import { useViewport } from '../workspace.viewport'
import { flyToBar } from './registry.flight'
import { RegistryMat, hueStyle, matRect, matTint } from './registry.mat'
import { RegistryPreview } from './registry.preview'

type Rect = { left: number; top: number; width: number; height: number }

const detail = { width: 880, height: 600 }

function toRect(rect: DOMRect | null, fallback: Rect): Rect {
  if (!rect) return fallback
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
}

const content: Variants = {
  hidden: { opacity: 0 },
  shown: ({ isReduced }: { isReduced: boolean }) => ({
    opacity: 1,
    transition: isReduced
      ? { duration: 0 }
      : { duration: 0.2, delay: morphContentDelay, delayChildren: morphContentDelay + 0.05, staggerChildren: 0.05 },
  }),
  gone: { opacity: 0, transition: { duration: 0.12 } },
}

/**
 * The source is the detail's one link, and it opens this item's own page in
 * the registry: its preview page, else its registry entry or guide, else the
 * registry's homepage.
 */
function DetailSource({ item }: { item: CatalogItem }) {
  const href = item.previewUrl ?? item.itemUrl ?? item.sourceHomepage
  const sourceName = item.sourceName ?? item.source
  return (
    <m.div variants={riseIn} className="flex flex-col gap-1.5">
      <Typography type="body-xs" color="muted">
        From
      </Typography>
      {href ? (
        <Link
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`View ${item.title} on ${sourceName} (opens in a new tab)`}
          className="w-fit text-sm"
        >
          {sourceName}
          <Link.Icon>
            <RiExternalLinkLine size={14} aria-hidden="true" />
          </Link.Icon>
        </Link>
      ) : (
        <Typography type="body-sm" weight="medium">
          {sourceName}
        </Typography>
      )}
      <Typography type="body-xs" color="muted" className="font-mono break-all">
        {item.ref}
      </Typography>
    </m.div>
  )
}

/**
 * The open detail: the card's mat morphs to a centered card with the bar's
 * stretch-then-rise, its content rising in once the shape settles. Closing
 * re-measures the card and morphs back before the store forgets the item, so
 * the overlay stays open through the exit and the dialog then returns focus
 * to the expand button. Adding flies the preview into the bar as it closes.
 */
function RegistryDetailCard({ item }: { item: CatalogItem }) {
  const { actions, meta } = useWorkspace()
  const isSelected = useWorkspaceSelector((state) => state.setup.items.includes(item.ref))
  const isReduced = useReducedMotion() ?? false
  const viewport = useViewport(detail)
  const pane = useRef<HTMLDivElement>(null)
  const width = Math.min(detail.width, viewport.width - 32)
  const height = Math.min(detail.height, viewport.height - 48)
  const center: Rect = {
    left: (viewport.width - width) / 2,
    top: (viewport.height - height) / 2,
    width,
    height,
  }
  const [origin] = useState(() => toRect(matRect(item.ref), center))
  const [closingTo, setClosingTo] = useState<Rect | null>(null)
  const isClosing = closingTo !== null

  const close = () => {
    if (!isClosing) setClosingTo(toRect(matRect(item.ref), origin))
  }

  return (
    <ModalOverlay isOpen isDismissable onOpenChange={(open) => !open && close()} className="fixed inset-0 z-[60]">
      <m.div
        aria-hidden="true"
        className="absolute inset-0 bg-black/20"
        initial={{ opacity: 0 }}
        animate={{ opacity: isClosing ? 0 : 1 }}
        transition={{ duration: isReduced ? 0 : 0.3 }}
      />
      <Modal className="contents">
        <m.div
          style={hueStyle(item)}
          initial={{ ...origin, borderRadius: 16 }}
          animate={{ ...(closingTo ?? center), borderRadius: isClosing ? 16 : 28 }}
          transition={isReduced ? { duration: 0 } : morph[isClosing ? 'close' : 'open']}
          onAnimationComplete={() => isClosing && actions.closeDetail()}
          className={`fixed overflow-hidden ${matTint}`}
        >
          <Dialog aria-label={item.title} className="size-full outline-none">
            <m.div
              variants={content}
              custom={{ isReduced }}
              initial="hidden"
              animate={isClosing ? 'gone' : 'shown'}
              className="flex size-full flex-col md:grid md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]"
            >
              <div ref={pane} className="relative h-[45%] shrink-0 md:h-full">
                <RegistryMat item={item} size="detail" className="size-full">
                  <RegistryPreview item={item} />
                </RegistryMat>
              </div>
              <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto bg-surface p-6">
                <m.div variants={riseIn} className="flex items-start justify-between gap-3">
                  <Heading slot="title" className="text-lg font-semibold text-foreground">
                    {item.title}
                  </Heading>
                  <Button isIconOnly size="sm" variant="tertiary" aria-label="Close" onPress={close}>
                    <RiCloseLine size={16} aria-hidden="true" />
                  </Button>
                </m.div>
                <m.span
                  variants={riseIn}
                  style={hueStyle(item)}
                  className="w-fit rounded-full bg-[color-mix(in_oklch,oklch(72%_0.12_var(--hue))_22%,var(--surface))] px-2.5 py-0.5 text-xs font-medium text-[color-mix(in_oklch,oklch(55%_0.14_var(--hue))_70%,var(--foreground))]"
                >
                  {item.label}
                </m.span>
                <m.p variants={riseIn} className="text-sm text-muted">
                  {item.description}
                </m.p>
                <DetailSource item={item} />
                <m.div variants={riseIn} className="mt-auto pt-2">
                  <Button
                    fullWidth
                    variant={isSelected ? 'secondary' : 'primary'}
                    onPress={() => {
                      if (!isSelected) {
                        const page = pane.current?.querySelector<HTMLElement>('[data-registry-page]') ?? null
                        flyToBar(page, pane.current, meta.buildCount.current)
                      }
                      actions.toggleItem(item.ref, !isSelected)
                      close()
                    }}
                  >
                    {isSelected ? (
                      <RiCheckLine size={18} aria-hidden="true" />
                    ) : (
                      <RiAddLine size={18} aria-hidden="true" />
                    )}
                    {isSelected ? 'Remove from build' : 'Add to build'}
                  </Button>
                </m.div>
              </div>
            </m.div>
          </Dialog>
        </m.div>
      </Modal>
    </ModalOverlay>
  )
}

/** One detail card for the whole grid, keyed by the open item. */
export function RegistryDetail() {
  const { meta } = useWorkspace()
  const ref = useWorkspaceSelector((state) => state.detail)
  const item = ref ? meta.catalog.items.find((candidate) => candidate.ref === ref) : undefined
  if (!item) return null

  return (
    <LazyMotion features={domAnimation}>
      <RegistryDetailCard key={item.ref} item={item} />
    </LazyMotion>
  )
}
