import { Kbd, SearchField } from '@heroui/react'
import { RiSearchLine } from '@remixicon/react'
import { shallow } from '@tanstack/react-store'
import { useEffect, useRef } from 'react'
import { useWorkspace, useWorkspaceSelector } from '../workspace.context'
import { visibleItems } from '../workspace.utils'
import { RegistryCard } from './registry.card'

/** Inputs that take no typed text, such as each card's checkbox, still let "/" through. */
const untypedInputs = new Set([
  'checkbox',
  'radio',
  'button',
  'submit',
  'reset',
  'range',
  'color',
  'file',
  'image',
])

function isTyping(target: EventTarget | null): boolean {
  if (target instanceof HTMLInputElement) return !untypedInputs.has(target.type)
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || target.matches('textarea, select'))
  )
}

/**
 * "/" focuses the field from anywhere except another text control, and is
 * not typed. Shift stays allowed because some layouts need it to produce "/".
 * The hint takes the clear button's place while the field is empty and hides
 * while it has focus.
 */
function RegistrySearch() {
  const { actions, meta } = useWorkspace()
  const query = useWorkspaceSelector((state) => state.query)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return
      if (event.isComposing || isTyping(event.target)) return
      event.preventDefault()
      inputRef.current?.focus()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <SearchField
      aria-label="Search registry"
      value={query}
      onChange={actions.setQuery}
      className="min-w-0 flex-1 basis-40 min-[769px]:w-full min-[769px]:max-w-sm min-[769px]:flex-none"
    >
      <SearchField.Group>
        <SearchField.SearchIcon>
          <RiSearchLine size={16} aria-hidden="true" />
        </SearchField.SearchIcon>
        <SearchField.Input
          ref={inputRef}
          aria-keyshortcuts="/"
          placeholder={`Search ${meta.catalog.items.length} items`}
        />
        {query ? (
          <SearchField.ClearButton />
        ) : (
          <Kbd aria-hidden="true" className="me-2 in-data-[focus-within=true]:hidden">
            /
          </Kbd>
        )}
      </SearchField.Group>
    </SearchField>
  )
}

/**
 * Standalone checkboxes in a labelled group rather than a CheckboxGroup: the
 * group's shared state would re-render every card on any toggle. The grid
 * itself re-renders only when the visible list changes, and items hidden by
 * the search or category stay selected.
 */
function RegistryGrid() {
  const { meta } = useWorkspace()
  const visible = useWorkspaceSelector(
    (state) => visibleItems(meta.catalog.items, state.query, state.category),
    shallow,
  )

  return (
    <div
      role="group"
      aria-label="Registry items"
      className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-5"
    >
      {visible.map((item) => (
        <RegistryCard key={item.ref} item={item} />
      ))}
    </div>
  )
}

export const Registry = {
  Search: RegistrySearch,
  Grid: RegistryGrid,
}
