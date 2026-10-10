import { Button, Link, Typography } from '@heroui/react'
import { RiAddLine, RiCheckLine, RiCloseLine, RiExternalLinkLine } from '@remixicon/react'
import type { Variants } from 'motion/react'
import { LazyMotion, domAnimation, useReducedMotion, useTransform } from 'motion/react'
import * as m from 'motion/react-m'
import { useRef, useState } from 'react'
import { Dialog, Heading, Modal, ModalOverlay } from 'react-aria-components'
import { morph, morphContentDelay, riseIn } from '../workspace.constants'
import { useWorkspace, useWorkspaceSelector } from '../workspace.context'
import type { CatalogItem } from '../workspace.types'
import { useViewport } from '../workspace.viewport'
import { flyToBar } from './registry.flight'
import { RegistryMat, hueStyle, matShape, matTint } from './registry.mat'
import type { MatShape } from './registry.mat'
import { RegistryPreview } from './registry.preview'
import { useSwipeDismiss } from './registry.swipe'

/** The card's box and corners, its own and its page's, as the morph animates them. */
type Shape = {
  left: number
  top: number
  width: number
  height: number
  borderRadius: number
  '--page-radius': string
}

const detail = { width: 880, height: 600 }
/** The preview pane's share of the open card, matching the `md` layout of the details beside it. */
const paneShare = { wide: { width: '58.333%', height: '100%' }, narrow: { width: '100%', height: '45%' } }
const wholeCard = { width: '100%', height: '100%' }
const openCorners = { borderRadius: 28, pageRadius: 24 }

function toShape(mat: MatShape | null, fallback: Shape): Shape {
  if (!mat) return fallback
  const { left, top, width, height } = mat.rect
  return { left, top, width, height, borderRadius: mat.radius, '--page-radius': `${mat.pageRadius}px` }
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
 * The preview pane rides the morph rather than fading: it fills the card at
 * the grid mat's size and narrows into its column as the card grows, so the
 * page never leaves the screen. Swiping the preview down closes from wherever
 * the finger lets go.
 */
function RegistryDetailCard({ item }: { item: CatalogItem }) {
  const { actions, meta } = useWorkspace()
  const isSelected = useWorkspaceSelector((state) => state.setup.items.includes(item.ref))
  const isReduced = useReducedMotion() ?? false
  const viewport = useViewport(detail)
  const pane = useRef<HTMLDivElement>(null)
  const width = Math.min(detail.width, viewport.width - 32)
  const height = Math.min(detail.height, viewport.height - 48)
  const center: Shape = {
    left: (viewport.width - width) / 2,
    top: (viewport.height - height) / 2,
    width,
    height,
    borderRadius: openCorners.borderRadius,
    '--page-radius': `${openCorners.pageRadius}px`,
  }
  const [origin] = useState(() => toShape(matShape(item.ref), center))
  const [closingTo, setClosingTo] = useState<Shape | null>(null)
  const isClosing = closingTo !== null
  const [isSettled, setIsSettled] = useState(false)
  const isLive = isSettled && !isClosing
  const morphTransition = isReduced ? { duration: 0 } : morph[isClosing ? 'close' : 'open']

  const close = () => {
    if (!isClosing) setClosingTo(toShape(matShape(item.ref), origin))
  }

  const { y, swipeProps } = useSwipeDismiss({ height, isDisabled: isClosing, onDismiss: close })
  const backdropOpacity = useTransform(y, [0, height], [1, 0.3])

  return (
    <ModalOverlay isOpen isDismissable onOpenChange={(open) => !open && close()} className="fixed inset-0 z-[60]">
      <m.div
        aria-hidden="true"
        className="absolute inset-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: isClosing ? 0 : 1 }}
        transition={{ duration: isReduced ? 0 : 0.3 }}
      >
        <m.div className="size-full bg-backdrop" style={{ opacity: backdropOpacity }} />
      </m.div>
      <Modal className="contents">
        <m.div
          style={{ ...hueStyle(item), y }}
          initial={origin}
          animate={{ ...(closingTo ?? center), ...(isClosing && { y: 0 }) }}
          transition={morphTransition}
          onAnimationComplete={() => (isClosing ? actions.closeDetail() : setIsSettled(true))}
          className={`fixed overflow-hidden ${matTint}`}
        >
          <Dialog aria-label={item.title} className="relative size-full outline-none">
            <m.div
              ref={pane}
              {...swipeProps}
              initial={wholeCard}
              animate={isClosing ? wholeCard : paneShare[viewport.width >= 768 ? 'wide' : 'narrow']}
              transition={morphTransition}
              className="absolute top-0 left-0 touch-none"
            >
              <m.div
                aria-hidden="true"
                initial={{ opacity: 0 }}
                animate={{ opacity: isLive ? 1 : 0 }}
                className="absolute inset-x-0 top-0 z-10 flex h-6 justify-center pt-2 md:hidden"
              >
                <span className="h-1 w-9 rounded-full bg-foreground/25" />
              </m.div>
              <RegistryMat item={item} size="detail" className="size-full">
                <RegistryPreview item={item} isLive={isLive} />
              </RegistryMat>
            </m.div>
            <m.div
              variants={content}
              custom={{ isReduced }}
              initial="hidden"
              animate={isClosing ? 'gone' : 'shown'}
              className="absolute right-0 bottom-0 flex flex-col gap-4 overflow-y-auto bg-surface p-6 max-md:left-0 max-md:top-[45%] md:top-0 md:left-[58.333%]"
            >
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
