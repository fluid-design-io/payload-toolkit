import { createContext, use, useMemo, useReducer } from 'react'
import type { PropsWithChildren } from 'react'
import { catalog } from './workspace.catalog'
import { defaultSetup } from './workspace.constants'
import type {
  Filter,
  WorkspaceAction,
  WorkspaceContextValue,
  WorkspaceState,
} from './workspace.types'
import { directoryError, toCommand, toPrompt, visibleItems } from './workspace.utils'

const initialState: WorkspaceState = {
  setup: defaultSetup,
  query: '',
  filter: 'all',
  output: 'command',
}

function reducer(state: WorkspaceState, action: WorkspaceAction): WorkspaceState {
  const setup = state.setup
  switch (action.type) {
    case 'setName':
      return { ...state, setup: { ...setup, name: action.name } }
    case 'setFramework':
      return { ...state, setup: { ...setup, framework: action.framework } }
    case 'setDatabase':
      return { ...state, setup: { ...setup, database: action.database } }
    case 'setPackageManager':
      return { ...state, setup: { ...setup, packageManager: action.packageManager } }
    case 'setAgent':
      return { ...state, setup: { ...setup, agent: action.agent } }
    case 'setItems':
      return { ...state, setup: { ...setup, items: action.items } }
    case 'removeItem':
      return {
        ...state,
        setup: { ...setup, items: setup.items.filter((ref) => ref !== action.ref) },
      }
    case 'setQuery':
      return { ...state, query: action.query }
    case 'setFilter':
      return { ...state, filter: action.filter }
    case 'setOutput':
      return { ...state, output: action.output }
  }
}

const kindCounts: Record<Exclude<Filter, 'selected'>, number> = {
  all: catalog.length,
  feature: catalog.filter((item) => item.kind === 'feature').length,
  block: catalog.filter((item) => item.kind === 'block').length,
  component: catalog.filter((item) => item.kind === 'component').length,
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null)

export function WorkspaceProvider({ children }: PropsWithChildren) {
  const [state, dispatch] = useReducer(reducer, initialState)
  const { setup, query, filter, output } = state

  const actions = useMemo<WorkspaceContextValue['actions']>(
    () => ({
      setName: (name) => dispatch({ type: 'setName', name }),
      setFramework: (framework) => dispatch({ type: 'setFramework', framework }),
      setDatabase: (database) => dispatch({ type: 'setDatabase', database }),
      setPackageManager: (packageManager) =>
        dispatch({ type: 'setPackageManager', packageManager }),
      setAgent: (agent) => dispatch({ type: 'setAgent', agent }),
      setItems: (items) => dispatch({ type: 'setItems', items }),
      removeItem: (ref) => dispatch({ type: 'removeItem', ref }),
      setQuery: (query) => dispatch({ type: 'setQuery', query }),
      setFilter: (filter) => dispatch({ type: 'setFilter', filter }),
      setOutput: (output) => dispatch({ type: 'setOutput', output }),
    }),
    [],
  )

  const visible = useMemo(
    () => visibleItems(catalog, query, filter, setup.items),
    [query, filter, setup.items],
  )
  const derived = useMemo(() => {
    const error = directoryError(setup.name)
    const command = toCommand(setup, catalog)
    const prompt = toPrompt(setup, catalog)
    const refs = new Set(setup.items)
    return {
      selected: catalog.filter((item) => refs.has(item.ref)),
      command,
      prompt,
      directoryError: error,
      text: error ?? (output === 'command' ? command : prompt),
    }
  }, [setup, output])

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      state: { ...state, ...derived, visible },
      actions,
      meta: { catalog, counts: { ...kindCounts, selected: setup.items.length } },
    }),
    [state, derived, visible, actions, setup.items.length],
  )

  return <WorkspaceContext value={value}>{children}</WorkspaceContext>
}

export function useWorkspace(): WorkspaceContextValue {
  const value = use(WorkspaceContext)
  if (!value) throw new Error('useWorkspace must be used inside <Workspace>')
  return value
}
