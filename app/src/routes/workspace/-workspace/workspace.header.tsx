import { Button } from '@heroui/react'
import { Link } from '@tanstack/react-router'
import { useSyncExternalStore } from 'react'

type Theme = 'light' | 'dark'

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, { attributeFilter: ['data-theme'] })
  return () => observer.disconnect()
}

function currentTheme(): Theme {
  return document.documentElement.dataset.theme === 'mouve-dark' ? 'dark' : 'light'
}

/** The label names the theme a press switches to. Storing it stops the root script following the system. */
function WorkspaceThemeToggle() {
  const theme = useSyncExternalStore(subscribe, currentTheme, () => 'light' as const)
  const next: Theme = theme === 'dark' ? 'light' : 'dark'

  return (
    <Button
      variant="ghost"
      size="sm"
      className="font-mono"
      aria-label={`Switch to ${next} theme`}
      onPress={() => {
        document.documentElement.dataset.theme = `mouve-${next}`
        try {
          localStorage.setItem('theme', next)
        } catch {}
      }}
    >
      {next}
    </Button>
  )
}

export function WorkspaceHeader() {
  return (
    <header className="flex h-14 items-center justify-between">
      <Link
        to="/"
        className="font-mono text-sm text-foreground no-underline outline-none hover:text-muted focus-visible:underline"
      >
        payload-toolkit
      </Link>
      <WorkspaceThemeToggle />
    </header>
  )
}
