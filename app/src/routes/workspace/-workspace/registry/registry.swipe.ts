import type { Transition } from 'motion/react'
import { animate, useMotionValue } from 'motion/react'
import type { PointerEvent } from 'react'
import { useRef } from 'react'

/** Downward travel before a press becomes a swipe, so taps still land. */
const slop = 6
/** Release speed, in px/s, that dismisses however short the swipe. */
const flick = 600
const springBack: Transition = { type: 'spring', bounce: 0.2, duration: 0.35 }

type Press = { id: number; y: number; isSwiping: boolean }

/**
 * Swipe down to dismiss, for touch and pen only. The swipe captures the
 * pointer once it passes the slop, which cancels any press on a button
 * beneath it. Upward pulls resist. Releasing past a quarter of the card or
 * with a flick dismisses; anything else springs back to rest.
 */
export function useSwipeDismiss({
  height,
  isDisabled,
  onDismiss,
}: {
  height: number
  isDisabled: boolean
  onDismiss: () => void
}) {
  const y = useMotionValue(0)
  const press = useRef<Press | null>(null)

  const onPointerDown = (event: PointerEvent<HTMLElement>) => {
    if (isDisabled || event.pointerType === 'mouse' || !event.isPrimary) return
    press.current = { id: event.pointerId, y: event.clientY, isSwiping: false }
  }

  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    const current = press.current
    if (!current || current.id !== event.pointerId) return
    const delta = event.clientY - current.y
    if (!current.isSwiping) {
      if (delta < slop) return
      current.isSwiping = true
      current.y = event.clientY
      event.currentTarget.setPointerCapture(event.pointerId)
      return
    }
    y.set(delta > 0 ? delta : delta / 5)
  }

  const onPointerEnd = (event: PointerEvent<HTMLElement>) => {
    const current = press.current
    if (!current || current.id !== event.pointerId) return
    press.current = null
    if (!current.isSwiping) return
    const isDismissed = event.type === 'pointerup' && (y.get() > height / 4 || y.getVelocity() > flick)
    if (isDismissed) onDismiss()
    else animate(y, 0, springBack)
  }

  return {
    y,
    swipeProps: { onPointerDown, onPointerMove, onPointerUp: onPointerEnd, onPointerCancel: onPointerEnd },
  }
}
