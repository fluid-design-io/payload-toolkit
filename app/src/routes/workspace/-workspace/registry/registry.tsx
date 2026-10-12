import { Button, Kbd, SearchField, Tooltip, cn } from '@heroui/react'
import { RiSearchLine } from '@remixicon/react'
import { shallow } from '@tanstack/react-store'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode, Ref } from 'react'
import { isTyping } from '@/routes/lab/-lab/kit/env'
import { useWorkspace, useWorkspaceSelector } from '../workspace.context'
import { visibleItems } from '../workspace.utils'
import { RegistryCard } from './registry.card'
import { RegistryDetail } from './registry.detail'

/** "/" from anywhere except another text control, not typed. Shift stays allowed because some layouts need it to produce "/". */
function useSlash(onSlash: () => void) {
  const handler = useRef(onSlash)
  useLayoutEffect(() => {
    handler.current = onSlash
  })
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return
      if (event.isComposing || isTyping(event.target)) return
      event.preventDefault()
      handler.current()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])
}

/** The grid keeps a full field; the factory scene gets one that stays out of the picture until it is wanted. */
function RegistrySearch() {
  const factory = useWorkspaceSelector((state) => state.view === 'factory')
  return factory ? <FactorySearch /> : <GridSearch />
}

function SearchGroup({
  inputRef,
  placeholder,
  className,
  children,
}: {
  inputRef: Ref<HTMLInputElement>
  placeholder: string
  className?: string
  children: ReactNode
}) {
  return (
    <SearchField.Group className={className}>
      <SearchField.SearchIcon>
        <RiSearchLine size={16} aria-hidden="true" />
      </SearchField.SearchIcon>
      <SearchField.Input ref={inputRef} aria-keyshortcuts="/" placeholder={placeholder} />
      {children}
    </SearchField.Group>
  )
}

/**
 * "/" focuses the field. The hint takes the clear button's place while the
 * field is empty and hides while it has focus.
 */
function GridSearch() {
  const { actions, meta } = useWorkspace()
  const query = useWorkspaceSelector((state) => state.query)
  const inputRef = useRef<HTMLInputElement>(null)
  useSlash(() => inputRef.current?.focus())

  return (
    <SearchField
      aria-label="Search registry"
      value={query}
      onChange={actions.setQuery}
      className="min-w-0 flex-1 basis-40 min-[769px]:w-full min-[769px]:max-w-sm min-[769px]:flex-initial"
    >
      <SearchGroup inputRef={inputRef} placeholder={`Search ${meta.catalog.items.length} items`}>
        {query ? (
          <SearchField.ClearButton />
        ) : (
          <Kbd aria-hidden="true" className="me-2 in-data-[focus-within=true]:hidden">
            /
          </Kbd>
        )}
      </SearchGroup>
    </SearchField>
  )
}

/** Translucent and fully rounded, like the scene's other floating controls. */
const floating = 'rounded-full border border-border bg-surface/70 shadow-overlay backdrop-blur-md'

/**
 * Over the factory scene an empty search is a round icon button. Pressing it
 * or "/" grows it into the field, focused; leaving an empty field, or Escape
 * on one, folds it back and returns focus to the button. A query keeps it open.
 */
function FactorySearch() {
  const { actions, meta } = useWorkspace()
  const query = useWorkspaceSelector((state) => state.query)
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const refocus = useRef(false)
  const label = `Search ${meta.catalog.items.length} items`
  const shown = open || query !== ''
  useSlash(() => (shown ? inputRef.current?.focus() : setOpen(true)))

  useEffect(() => {
    if (shown || !refocus.current) return
    refocus.current = false
    buttonRef.current?.focus()
  }, [shown])

  if (!shown)
    return (
      <Tooltip delay={300} closeDelay={0}>
        <Button
          ref={buttonRef}
          isIconOnly
          size="sm"
          variant="ghost"
          aria-label={label}
          onPress={() => setOpen(true)}
          className={cn(floating, 'size-9 shrink-0 text-foreground')}
        >
          <RiSearchLine size={16} aria-hidden="true" />
        </Button>
        <Tooltip.Content placement="bottom" className="flex items-center gap-2">
          {label}
          <Kbd>/</Kbd>
        </Tooltip.Content>
      </Tooltip>
    )

  return (
    <SearchField
      aria-label="Search registry"
      value={query}
      onChange={actions.setQuery}
      autoFocus
      onBlur={() => {
        if (!query) setOpen(false)
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || query) return
        refocus.current = true
        setOpen(false)
      }}
      className="min-w-0 flex-1 basis-40 transition-[width] duration-200 ease-out starting:w-9 motion-reduce:transition-none min-[769px]:w-full min-[769px]:max-w-sm min-[769px]:flex-initial"
    >
      <SearchGroup inputRef={inputRef} placeholder={label} className={floating}>
        {query && <SearchField.ClearButton />}
      </SearchGroup>
    </SearchField>
  )
}

/**
 * Standalone checkboxes in a labelled group rather than a CheckboxGroup: the
 * group's shared state would re-render every card on any toggle. The grid
 * itself re-renders only when the visible list changes, and items hidden by
 * the search or category stay selected. Columns follow the grid's own width,
 * not the viewport: the `container` provider and the rail decide its room.
 */
function RegistryGrid() {
  const { meta } = useWorkspace()
  const visible = useWorkspaceSelector(
    (state) => visibleItems(meta.catalog.items, state.query, state.category),
    shallow,
  )

  return (
    <div className="@container">
      <div
        role="group"
        aria-label="Registry items"
        className="grid grid-cols-1 gap-x-5 gap-y-7 @md:grid-cols-2 @4xl:grid-cols-3 @6xl:grid-cols-4"
      >
        {visible.map((item) => (
          <RegistryCard key={item.ref} item={item} />
        ))}
      </div>
    </div>
  )
}

export const Registry = {
  Search: RegistrySearch,
  Grid: RegistryGrid,
  Detail: RegistryDetail,
}
