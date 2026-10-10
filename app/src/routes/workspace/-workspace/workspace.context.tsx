import { createStore, useSelector } from '@tanstack/react-store'
import { getRouteApi, useRouter } from '@tanstack/react-router'
import { createContext, createRef, use, useEffect, useState } from 'react'
import type { PropsWithChildren } from 'react'
import { catalog as items } from './workspace.catalog'
import {
  parseWorkspaceSearch,
  searchFromState,
  setupFromSearch,
  viewFromSearch,
} from './workspace.params'
import type {
  Catalog,
  Setup,
  View,
  WorkspaceActions,
  WorkspaceContextValue,
  WorkspaceState,
} from './workspace.types'
import { toCatalog } from './workspace.utils'

const route = getRouteApi('/workspace/')
const catalog: Catalog = toCatalog(items)

function createWorkspaceStore(setup: Setup, view: View) {
  const initial: WorkspaceState = {
    setup,
    view,
    query: '',
    category: 'all',
    output: 'command',
    panel: null,
    detail: null,
  }
  return createStore(initial, ({ setState }): WorkspaceActions => {
    const patchSetup = (patch: Partial<Setup>) =>
      setState((state) => ({ ...state, setup: { ...state.setup, ...patch } }))
    return {
      setTarget: (target) => patchSetup({ target }),
      setName: (name) => patchSetup({ name }),
      setFramework: (framework) => patchSetup({ framework }),
      setDatabase: (database) => patchSetup({ database }),
      setPackageManager: (packageManager) => patchSetup({ packageManager }),
      setAgent: (agent) => patchSetup({ agent }),
      toggleItem: (ref, isSelected) =>
        setState((state) => {
          const refs = new Set(state.setup.items)
          if (isSelected) refs.add(ref)
          else refs.delete(ref)
          const ordered = catalog.items.filter((item) => refs.has(item.ref)).map((item) => item.ref)
          return { ...state, setup: { ...state.setup, items: ordered } }
        }),
      clearItems: () => patchSetup({ items: [] }),
      setView: (view) => setState((state) => ({ ...state, view })),
      setQuery: (query) => setState((state) => ({ ...state, query })),
      setCategory: (category) => setState((state) => ({ ...state, category })),
      setOutput: (output) => setState((state) => ({ ...state, output })),
      openPanel: (panel) => setState((state) => ({ ...state, panel })),
      closePanel: (panel) =>
        setState((state) => (state.panel === panel ? { ...state, panel: null } : state)),
      openDetail: (detail) => setState((state) => ({ ...state, detail })),
      closeDetail: () => setState((state) => ({ ...state, detail: null })),
    }
  })
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null)

/**
 * One store per mounted workspace, never per module, so server requests never
 * share state. The URL seeds `setup` and `view` once, read from the router state without
 * subscribing (the server and hydration both see the request URL); afterwards
 * the store owns them and mirrors every change back with a replacing navigation
 * that keeps the scroll position. The URL is never read again, so the
 * write-back cannot loop or re-render the provider, and nothing is written
 * until either one actually changes.
 */
export function WorkspaceProvider({ children }: PropsWithChildren) {
  const router = useRouter()
  const navigate = route.useNavigate()
  const [value] = useState<WorkspaceContextValue>(() => {
    const search = parseWorkspaceSearch(router.state.location.search)
    const store = createWorkspaceStore(setupFromSearch(search), viewFromSearch(search))
    return {
      store,
      actions: store.actions,
      meta: { catalog, buildCount: createRef<HTMLSpanElement>() },
    }
  })

  useEffect(() => {
    let mirrored = value.store.state
    const { unsubscribe } = value.store.subscribe((state) => {
      if (state.setup === mirrored.setup && state.view === mirrored.view) return
      mirrored = state
      void navigate({ to: '.', search: searchFromState(state), replace: true, resetScroll: false })
    })
    return unsubscribe
  }, [value, navigate])

  return <WorkspaceContext value={value}>{children}</WorkspaceContext>
}

export function useWorkspace(): WorkspaceContextValue {
  const value = use(WorkspaceContext)
  if (!value) throw new Error('useWorkspace must be used inside <Workspace>')
  return value
}

/**
 * Subscribes to one slice of the workspace. A leaf re-renders only when its
 * slice changes under `compare` (`Object.is` by default; pass `shallow` for
 * arrays and objects built by the selector).
 */
export function useWorkspaceSelector<T>(
  selector: (state: WorkspaceState) => T,
  compare?: (a: T, b: T) => boolean,
): T {
  const { store } = useWorkspace()
  return useSelector(store, selector, { compare })
}
