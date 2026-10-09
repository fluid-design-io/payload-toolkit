/**
 * Selection effects, run imperatively with the Web Animations API so a toggle
 * never re-renders the grid. Each one does nothing under reduced motion.
 */

const spring = 'cubic-bezier(.34,1.6,.5,1)'

function isReduced(): boolean {
  return matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** The page drops back onto its mat. */
export function stamp(page: Element | null) {
  if (!page || isReduced()) return
  page.animate([{ transform: 'translateY(-12px) scale(1.04)' }, { transform: 'none' }], {
    duration: 450,
    easing: spring,
  })
}

/** A small no, for a removed item. */
export function shake(mat: Element | null) {
  if (!mat || isReduced()) return
  mat.animate(
    [
      { transform: 'none' },
      { transform: 'translateX(-4px)' },
      { transform: 'translateX(3px)' },
      { transform: 'translateX(-2px)' },
      { transform: 'none' },
    ],
    { duration: 320 },
  )
}

/**
 * A copy of the page's visible part arcs into the bar's count, which bumps
 * when it lands. `clip` is the element that crops the page, so the copy
 * starts exactly as the page looks.
 */
export function flyToBar(page: HTMLElement | null, clip: Element | null, target: HTMLElement | null) {
  if (!page || !target || isReduced()) return
  const from = page.getBoundingClientRect()
  const bottom = Math.min(from.bottom, clip?.getBoundingClientRect().bottom ?? from.bottom)
  const to = target.getBoundingClientRect()
  const ghost = page.cloneNode(true) as HTMLElement
  ghost.setAttribute('aria-hidden', 'true')
  Object.assign(ghost.style, {
    position: 'fixed',
    left: `${from.left}px`,
    top: `${from.top}px`,
    width: `${from.width}px`,
    height: `${bottom - from.top}px`,
    margin: '0',
    zIndex: '100',
    pointerEvents: 'none',
    borderRadius: '0.75rem',
    transform: 'none',
    transition: 'none',
  })
  document.body.append(ghost)

  const dx = to.left + to.width / 2 - (from.left + from.width / 2)
  const dy = to.top + to.height / 2 - (from.top + (bottom - from.top) / 2)
  ghost
    .animate(
      [
        { transform: 'none', opacity: 1 },
        {
          transform: `translate(${dx * 0.45}px, ${dy * 0.45 - 120}px) scale(0.45) rotate(-10deg)`,
          opacity: 1,
          offset: 0.5,
        },
        { transform: `translate(${dx}px, ${dy}px) scale(0.06) rotate(6deg)`, opacity: 0.3 },
      ],
      { duration: 640, easing: 'cubic-bezier(.45,0,.3,1)' },
    )
    .finished.then(() => {
      ghost.remove()
      target.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.35)' }, { transform: 'scale(1)' }], {
        duration: 380,
        easing: spring,
      })
    })
    .catch(() => ghost.remove())
}
