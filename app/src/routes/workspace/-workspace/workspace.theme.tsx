import { Button, Tooltip } from '@heroui/react'
import { useSidebar } from '@heroui-pro/react'
import { RiMoonLine, RiSunLine } from '@remixicon/react'
import { useSyncExternalStore } from 'react'

type Theme = 'light' | 'dark'

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, {
    attributeFilter: ['data-theme'],
  })
  return () => observer.disconnect()
}

function currentTheme(): Theme {
  return document.documentElement.dataset.theme === 'mouve-dark' ? 'dark' : 'light'
}

export function useWorkspaceTheme(): Theme {
  return useSyncExternalStore(subscribe, currentTheme, () => 'light' as const)
}

/**
 * The icon and label name the theme a press switches to. Storing the choice
 * stops the root script following the system preference. Inside the mobile
 * rail sheet the tooltip portals into the sheet, which keeps it on screen
 * while Safari fixes the body.
 */
export function WorkspaceTheme() {
  const { mobileOverlayContainer } = useSidebar()
  const theme = useWorkspaceTheme()
  const next: Theme = theme === 'dark' ? 'light' : 'dark'
  const label = `Switch to ${next} theme`
  const Icon = next === 'light' ? RiSunLine : RiMoonLine

  return (
    <Tooltip delay={400}>
      <Button
        isIconOnly
        size="sm"
        variant="ghost"
        aria-label={label}
        className="shrink-0"
        onPress={() => {
          document.documentElement.dataset.theme = `mouve-${next}`
          try {
            localStorage.setItem('theme', next)
          } catch {}
        }}
      >
        <Icon size={16} aria-hidden="true" />
      </Button>
      <Tooltip.Content UNSTABLE_portalContainer={mobileOverlayContainer ?? undefined}>
        {label}
      </Tooltip.Content>
    </Tooltip>
  )
}
