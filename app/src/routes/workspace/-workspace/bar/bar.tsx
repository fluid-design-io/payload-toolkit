import { Toolbar } from '@heroui/react'
import { AnimatePresence, LazyMotion, domAnimation, useReducedMotion } from 'motion/react'
import * as m from 'motion/react-m'
import type { JSX, PropsWithChildren } from 'react'
import { useEffect, useRef } from 'react'
import { morph, morphContentDelay } from '../workspace.constants'
import { useWorkspace, useWorkspaceSelector } from '../workspace.context'
import type { Panel } from '../workspace.types'
import { useViewport } from '../workspace.viewport'
import { BarBuild, BuildView } from './bar.build'
import type { CardEntry } from './bar.card'
import { CardSheet } from './bar.card'
import { BarInstall, InstallView } from './bar.install'

const views: Record<Exclude<Panel, null>, { title: string; View: () => JSX.Element }> = {
  install: { title: 'Install', View: InstallView },
  build: { title: 'Your build', View: BuildView },
}

/** The risen card is one size for every view and option; it shrinks only to fit the viewport. */
const card = { width: 448, height: 576 }
const rail = 240

function useCardSize() {
  const viewport = useViewport(card)
  const column = viewport.width > 768 ? viewport.width - rail : viewport.width
  return {
    width: Math.min(card.width, column - 32),
    height: Math.min(card.height, viewport.height - 48),
  }
}

/**
 * The floating bar, black in both themes. Its glass is the card: opening a
 * view morphs the pill into a fixed-size card that keeps the bar row as its
 * footer, and closing morphs it back. The row is the only part in normal
 * flow, so the closed glass sizes to it with `auto`. The wrapper centers it
 * on the main column, past the 240px rail. Escape and the scrim close the
 * card; if focus was inside, it returns to the row's call to action.
 */
function BarRoot({ children }: PropsWithChildren) {
  const { actions } = useWorkspace()
  const panel = useWorkspaceSelector((state) => state.panel)
  const size = useCardSize()
  const isReduced = useReducedMotion() ?? false
  const shell = useRef<HTMLDivElement>(null)
  const shown = useRef<Panel>(null)
  const isOpen = panel !== null
  const entry: CardEntry = { delay: shown.current === null ? morphContentDelay : 0, isReduced }
  useEffect(() => {
    shown.current = panel
  }, [panel])

  const close = () => {
    if (!panel) return
    const hadFocus = shell.current?.querySelector('section')?.contains(document.activeElement)
    actions.closePanel(panel)
    if (hadFocus) shell.current?.querySelector<HTMLElement>('[data-bar-cta]')?.focus()
  }

  useEffect(() => {
    if (!isOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    addEventListener('keydown', onKeyDown)
    return () => removeEventListener('keydown', onKeyDown)
  })

  const view = panel ? views[panel] : null
  return (
    <LazyMotion features={domAnimation}>
      <div
        aria-hidden="true"
        data-open={isOpen}
        onClick={close}
        className="pointer-events-none fixed inset-0 z-40 bg-black/20 opacity-0 transition-opacity duration-300 data-[open=true]:pointer-events-auto data-[open=true]:opacity-100"
      />
      <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4 min-[769px]:left-[240px]">
        <m.div
          ref={shell}
          initial={{ opacity: 0, y: 8 }}
          animate={{
            opacity: 1,
            y: 0,
            width: isOpen ? size.width : 'auto',
            height: isOpen ? size.height : 'auto',
            '--bar-glass-factor': isOpen ? 1.5 : 1,
          }}
          transition={isReduced ? { duration: 0 } : morph[isOpen ? 'open' : 'close']}
          className="pointer-events-auto relative flex flex-col justify-end overflow-hidden rounded-[1.875rem] glass text-white ring-1 ring-white/10"
        >
          <AnimatePresence mode="wait" custom={entry}>
            {view && (
              <CardSheet key={panel} title={view.title} entry={entry} onClose={close}>
                <view.View />
              </CardSheet>
            )}
          </AnimatePresence>
          <Toolbar
            aria-label="Build actions"
            className="flex w-full items-center justify-between gap-1 p-2"
          >
            {children}
          </Toolbar>
        </m.div>
      </div>
    </LazyMotion>
  )
}

export const Bar = Object.assign(BarRoot, {
  Build: BarBuild,
  Install: BarInstall,
})
