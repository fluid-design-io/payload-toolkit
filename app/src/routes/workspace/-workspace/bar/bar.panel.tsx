import { Sheet } from '@heroui-pro/react'
import { Button, Popover, Tooltip } from '@heroui/react'
import type { ReactNode } from 'react'
import { useSyncExternalStore } from 'react'
import { useWorkspace, useWorkspaceSelector } from '../workspace.context'
import type { Panel } from '../workspace.types'

const desktop = '(min-width: 768px)'

function subscribe(onChange: () => void) {
  const media = matchMedia(desktop)
  media.addEventListener('change', onChange)
  return () => media.removeEventListener('change', onChange)
}

/** The server renders the desktop popover; a phone switches to the sheet after hydration. */
function useIsDesktop(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => matchMedia(desktop).matches,
    () => true,
  )
}

/** Light-on-black ghost styling for buttons on the always-black bar. */
const barButton =
  'relative text-white [--button-bg-hover:rgb(255_255_255/0.14)] [--button-bg-pressed:rgb(255_255_255/0.2)] [--button-fg:white]'

type BarPanelProps = {
  panel: Exclude<Panel, null>
  title: string
  /** The trigger's accessible name, which may add state to the title. */
  label: string
  /** The trigger button's contents: an icon, plus any badge or dot. */
  trigger: ReactNode
  isIconOnly?: boolean
  /** Extra classes for the trigger button. */
  className?: string
  children: ReactNode
}

/**
 * A bar button that opens `panel` as a popover above it from md, or as a
 * bottom sheet below md. Only one of the two overlays is ever rendered. The
 * open state is the store's `panel`, so other actions can open it too. The
 * popover dialog alone owns the padding, so controls at its end edge, such as
 * the build's remove buttons, sit at that inset and inside its corner curve.
 */
export function BarPanel({
  panel,
  title,
  label,
  trigger,
  isIconOnly,
  className,
  children,
}: BarPanelProps) {
  const { actions } = useWorkspace()
  const isOpen = useWorkspaceSelector((state) => state.panel === panel)
  const isDesktop = useIsDesktop()
  const onOpenChange = (open: boolean) =>
    open ? actions.openPanel(panel) : actions.closePanel(panel)

  const button = (
    <Tooltip delay={400}>
      <Button
        isIconOnly={isIconOnly}
        variant="ghost"
        aria-label={label}
        className={className ? `${barButton} ${className}` : barButton}
        onPress={isDesktop ? undefined : () => actions.openPanel(panel)}
      >
        {trigger}
      </Button>
      <Tooltip.Content>{title}</Tooltip.Content>
    </Tooltip>
  )

  if (isDesktop)
    return (
      <Popover isOpen={isOpen} onOpenChange={onOpenChange}>
        {button}
        <Popover.Content
          placement="top"
          offset={14}
          className="w-[min(26rem,calc(100vw-2rem))]"
        >
          <Popover.Dialog className="flex max-h-[min(36rem,70svh)] flex-col gap-5 p-6">
            <Popover.Heading className="border-b border-border pb-4">
              {title}
            </Popover.Heading>
            {children}
          </Popover.Dialog>
        </Popover.Content>
      </Popover>
    )

  return (
    <>
      {button}
      <Sheet isOpen={isOpen} onOpenChange={onOpenChange} placement="bottom">
        <Sheet.Backdrop>
          <Sheet.Content>
            <Sheet.Dialog>
              <Sheet.Handle />
              <Sheet.Header>
                <Sheet.Heading>{title}</Sheet.Heading>
              </Sheet.Header>
              <Sheet.Body className="flex flex-col gap-3 pb-10">
                {children}
              </Sheet.Body>
            </Sheet.Dialog>
          </Sheet.Content>
        </Sheet.Backdrop>
      </Sheet>
    </>
  )
}
