import type { Catalog, CategoryId, Setup } from '../../workspace/-workspace/workspace.types'
import type { Warehouse } from './warehouse'

/** The rail's category and the search query; a scene flies to and highlights what they name. */
export type Focus = { category: CategoryId; query: string }

/** Everything a mock needs. Selection lives in `setup.items`, in catalog order. */
export type Lab = {
  catalog: Catalog
  warehouse: Warehouse
  /** `viral` swaps in about 2,400 synthetic items to test organization at scale. */
  scale: 'real' | 'viral'
  setup: Setup
  selected: ReadonlySet<string>
  toggle: (ref: string) => void
  clear: () => void
  set: <K extends Exclude<keyof Setup, 'items'>>(key: K, value: Setup[K]) => void
  command: string
  theme: 'light' | 'dark'
  /**
   * `full` in /lab: the scene draws its own search, setup controls and
   * command. `embedded` inside /workspace: the rail, search and floating
   * Install bar already provide those, so the scene shows only itself, its
   * camera toolbar and World settings, and follows `focus`.
   */
  chrome: 'full' | 'embedded'
  focus: Focus
  setFocus: (focus: Partial<Focus>) => void
  /** Opens the workspace's detail card where one exists. */
  inspect?: (ref: string) => void
  /**
   * Called when the scene's own settings sheet opens or closes, so the host
   * can move its bottom chrome (the workspace's Install bar) out of the way.
   */
  onSheetChange?: (open: boolean) => void
}

export type MockProps = { lab: Lab }
