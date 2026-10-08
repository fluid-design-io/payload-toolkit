import {
  Checkbox,
  CheckboxGroup,
  SearchField,
  ToggleButton,
  ToggleButtonGroup,
} from '@heroui/react'
import type { PropsWithChildren } from 'react'
import { filters } from './workspace.constants'
import { useWorkspace } from './workspace.context'
import type { Filter } from './workspace.types'

function WorkspaceRegistryToolbar({ children }: PropsWithChildren) {
  return <div className="flex flex-wrap items-center gap-3 pt-2 pb-4">{children}</div>
}

function WorkspaceRegistrySearch() {
  const { state, actions, meta } = useWorkspace()

  return (
    <SearchField
      aria-label="Search registry"
      value={state.query}
      onChange={actions.setQuery}
      className="w-full sm:w-72"
    >
      <SearchField.Group>
        <SearchField.SearchIcon />
        <SearchField.Input placeholder={`Search ${meta.catalog.length} items`} />
        <SearchField.ClearButton />
      </SearchField.Group>
    </SearchField>
  )
}

function WorkspaceRegistryFilter() {
  const { state, actions, meta } = useWorkspace()

  return (
    <ToggleButtonGroup
      aria-label="Filter registry"
      isDetached
      size="sm"
      selectionMode="single"
      disallowEmptySelection
      selectedKeys={[state.filter]}
      onSelectionChange={(keys) => {
        const [filter] = keys
        if (filter) actions.setFilter(filter as Filter)
      }}
      className="flex-wrap justify-start"
    >
      {filters.map((option) => (
        <ToggleButton key={option.value} id={option.value}>
          {option.label}
          {option.value === 'selected' && (
            <span className="font-mono text-xs tabular-nums opacity-70">
              {meta.counts.selected}
            </span>
          )}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  )
}

function WorkspaceRegistryCount() {
  const { state, meta } = useWorkspace()

  return (
    <p className="pb-3 font-mono text-xs text-muted tabular-nums" aria-live="polite">
      {state.visible.length} of {meta.catalog.length}
    </p>
  )
}

/**
 * One controlled group over the visible cards. Its value is the whole
 * selection, so items hidden by the filter or the search stay selected.
 */
function WorkspaceRegistryGrid() {
  const { state, actions } = useWorkspace()

  return (
    <CheckboxGroup
      aria-label="Registry items"
      value={[...state.setup.items]}
      onChange={actions.setItems}
      className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3"
    >
      {state.visible.map((item) => (
        <Checkbox key={item.ref} value={item.ref} className="group/card mt-0 h-full">
          <Checkbox.Content className="flex h-full w-full items-start gap-3 rounded-xl border border-separator p-3 transition-colors hover:border-border group-data-[selected=true]/card:border-foreground">
            <Checkbox.Control className="mt-0.5">
              <Checkbox.Indicator />
            </Checkbox.Control>
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="flex items-baseline justify-between gap-2">
                <span className="truncate text-sm font-medium">{item.title}</span>
                <span className="shrink-0 font-mono text-[11px] font-normal text-muted">
                  {item.kind}
                </span>
              </span>
              <span className="truncate font-mono text-xs font-normal text-muted">{item.ref}</span>
              <span className="line-clamp-2 text-xs font-normal text-muted">
                {item.description}
              </span>
            </span>
          </Checkbox.Content>
        </Checkbox>
      ))}
    </CheckboxGroup>
  )
}

export const WorkspaceRegistry = {
  Toolbar: WorkspaceRegistryToolbar,
  Search: WorkspaceRegistrySearch,
  Filter: WorkspaceRegistryFilter,
  Count: WorkspaceRegistryCount,
  Grid: WorkspaceRegistryGrid,
}
