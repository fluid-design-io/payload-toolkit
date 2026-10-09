import { TanStackDevtools } from '@tanstack/react-devtools'
import { HeadContent, Scripts, createRootRouteWithContext } from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'

import TanStackQueryDevtools from '../integrations/tanstack-query/devtools'

import appCss from '../styles.css?url'

import type { QueryClient } from '@tanstack/react-query'

interface MyRouterContext {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        title: 'Payload Toolkit',
      },
    ],
    links: [
      {
        rel: 'preload',
        href: '/fonts/TimelessGroteskVF.woff2',
        as: 'font',
        type: 'font/woff2',
        crossOrigin: 'anonymous',
      },
      {
        rel: 'stylesheet',
        href: appCss,
      },
      { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
    ],
  }),
  shellComponent: RootDocument,
})

// Runs before paint so the stored or system theme applies without a flash.
const themeScript = `(() => {
  const root = document.documentElement
  const media = matchMedia('(prefers-color-scheme: dark)')
  const stored = () => {
    try {
      const theme = localStorage.getItem('theme')
      return theme === 'light' || theme === 'dark' ? theme : null
    } catch {
      return null
    }
  }
  const apply = () => {
    root.dataset.theme = 'mouve-' + (stored() ?? (media.matches ? 'dark' : 'light'))
  }
  apply()
  media.addEventListener('change', () => {
    if (!stored()) apply()
  })
})()`

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <HeadContent />
      </head>
      <body className="flex min-h-svh flex-col">
        {children}
        <TanStackDevtools
          config={{
            position: 'bottom-right',
          }}
          plugins={[
            {
              name: 'Tanstack Router',
              render: <TanStackRouterDevtoolsPanel />,
            },
            TanStackQueryDevtools,
          ]}
        />
        <Scripts />
      </body>
    </html>
  )
}
