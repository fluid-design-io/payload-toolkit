import { Button, Typography } from '@heroui/react'
import { RiCloseLine } from '@remixicon/react'
import type { Variants } from 'motion/react'
import * as m from 'motion/react-m'
import type { PropsWithChildren } from 'react'
import { useEffect, useId, useRef } from 'react'
import { riseIn } from '../workspace.constants'

/** How the sheet enters: after the glass finishes rising, or at once when it swaps views. */
export type CardEntry = { delay: number; isReduced: boolean }

const sheet: Variants = {
  hidden: { opacity: 0, y: 14, scale: 0.97 },
  shown: ({ delay, isReduced }: CardEntry) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: isReduced
      ? { duration: 0 }
      : {
          type: 'spring',
          bounce: 0.3,
          duration: 0.45,
          delay,
          delayChildren: delay + 0.05,
          staggerChildren: 0.05,
        },
  }),
  gone: ({ isReduced }: CardEntry) => ({
    opacity: 0,
    transition: { duration: isReduced ? 0 : 0.12 },
  }),
}

/** One row of a card view. Rows rise in one after another once the sheet appears. */
export function CardSection({ className, children }: PropsWithChildren<{ className?: string }>) {
  return (
    <m.div variants={riseIn} className={className}>
      {children}
    </m.div>
  )
}

/**
 * The sheet is dark in both themes, like the glass under it. HeroUI derives
 * its soft, hover and segment tokens separately for `.light` and `.dark`, so
 * the scope needs `dark` beside `mouve-dark`; `bar-panel` (styles.css) then
 * clears the surfaces to show the glass and makes the controls white.
 */
const sheetTheme = 'dark mouve-dark bar-panel text-foreground'

type CardSheetProps = PropsWithChildren<{
  title: string
  /** A delayed entry is an open from the bar, which also moves focus into the sheet. */
  entry: CardEntry
  onClose: () => void
}>

/**
 * The sheet inside the risen glass. It is absolutely positioned above
 * the bar row, so the glass's `auto` size always measures the row alone and
 * the sheet never changes the card's fixed size.
 */
export function CardSheet({ title, entry, onClose, children }: CardSheetProps) {
  const headingId = useId()
  const ref = useRef<HTMLElement>(null)
  const autoFocus = entry.delay > 0
  useEffect(() => {
    if (autoFocus) ref.current?.focus({ preventScroll: true })
  }, [autoFocus])

  return (
    <m.section
      ref={ref}
      tabIndex={-1}
      aria-labelledby={headingId}
      variants={sheet}
      custom={entry}
      initial="hidden"
      animate="shown"
      exit="gone"
      className={`absolute inset-x-2 top-2 bottom-[3.75rem] flex origin-bottom flex-col gap-4 rounded-[1.375rem] p-5 outline-none ${sheetTheme}`}
    >
      <CardSection className="flex items-center justify-between gap-3">
        <Typography type="h6" render={(props) => <h2 id={headingId} {...props} />}>
          {title}
        </Typography>
        <Button isIconOnly size="sm" variant="tertiary" aria-label="Close" onPress={onClose}>
          <RiCloseLine size={16} aria-hidden="true" />
        </Button>
      </CardSection>
      {children}
    </m.section>
  )
}
