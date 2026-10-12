import { shallow } from '@tanstack/react-store'
import type { Lab } from '@/routes/lab/-lab/lab.types'
import { toWarehouse } from '@/routes/lab/-lab/warehouse'
import { useWorkspace, useWorkspaceSelector } from '../workspace.context'
import { useWorkspaceTheme } from '../workspace.theme'
import type { Setup, WorkspaceActions } from '../workspace.types'
import { toCommand } from '../workspace.utils'

type Field = Exclude<keyof Setup, 'items'>

function setters(actions: WorkspaceActions): { [K in Field]: (value: Setup[K]) => void } {
  return {
    target: actions.setTarget,
    name: actions.setName,
    framework: actions.setFramework,
    database: actions.setDatabase,
    packageManager: actions.setPackageManager,
    agent: actions.setAgent,
  }
}

/**
 * The workspace store as the `Lab` a factory scene takes. The scene
 * re-renders only when the setup, the rail's category, the query or the theme
 * changes; panels, the detail card and the output choice leave it alone. Its
 * callbacks write the same store the grid does, so switching views keeps the
 * build, and the rail and search steer the scene through `focus`.
 */
export function useFactoryLab(): Lab {
  const { store, actions, meta } = useWorkspace()
  const setup = useWorkspaceSelector((state) => state.setup)
  const focus = useWorkspaceSelector(
    (state) => ({ category: state.category, query: state.query }),
    shallow,
  )
  const theme = useWorkspaceTheme()
  const set = setters(actions)

  return {
    toggle: (ref) => actions.toggleItem(ref, !store.state.setup.items.includes(ref)),
    clear: actions.clearItems,
    set: (key, value) => set[key](value),
    setFocus: ({ category, query }) => {
      if (category !== undefined) actions.setCategory(category)
      if (query !== undefined) actions.setQuery(query)
    },
    inspect: actions.openDetail,
    onSheetChange: actions.setSceneSheet,
    catalog: meta.catalog,
    warehouse: toWarehouse(meta.catalog),
    scale: 'real',
    setup,
    selected: new Set(setup.items),
    command: toCommand(setup, meta.catalog.items),
    theme,
    chrome: 'embedded',
    focus,
  }
}
