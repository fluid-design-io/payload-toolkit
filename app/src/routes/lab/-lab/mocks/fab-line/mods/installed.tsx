/**
 * The installed mods in a sheet nested over World settings. The list takes a
 * multi-selection; each row keeps its own switch and menu, and the action bar
 * enables, disables or removes the selection, or shares a single mod.
 */
import { ActionBar, ListView, Sheet } from '@heroui-pro/react'
import { Button, Chip, cn, Dropdown, Label, Separator, Spinner, Switch, Tooltip } from '@heroui/react'
import {
  RiCloseLine, RiCodeSSlashLine, RiDeleteBinLine, RiDownloadLine, RiLink, RiMoreFill, RiToggleFill, RiToggleLine,
} from '@remixicon/react'
import { useLayoutEffect, useState } from 'react'
import type { RefObject } from 'react'
import { flushSync } from 'react-dom'
import type { Selection } from 'react-aria-components'

import type { Mode } from '../core/contract'
import { useWorld } from '../world/store'
import type { Mod } from '../world/store'
import { artOf, KIND, ModArt, slotsOf, STATUS } from './art'

export type ModAction = 'link' | 'save' | 'trust' | 'remove'

/** Focuses an installed mod's row, else the open sheet itself; false when the sheet is closed. */
export function focusInstalled(id?: string) {
  const sheet = document.querySelector<HTMLElement>('[data-installed-sheet]')
  const target = (id && sheet?.querySelector<HTMLElement>(`[data-mod="${CSS.escape(id)}"]`)) || sheet
  target?.focus()
  return !!target && document.activeElement === target
}

export function InstalledSheet({ isOpen, onOpenChange, mode, anchor, onAction, onRemove }: {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  mode: Mode
  /** An element inside World settings; the sheet lines up with it, which matters where the scene does not span the window. */
  anchor: RefObject<HTMLElement | null>
  onAction: (mod: Mod, action: Exclude<ModAction, 'remove'>) => void
  /** Removes at once; the caller offers the undo. */
  onRemove: (ids: string[]) => void
}) {
  const mods = useWorld((s) => s.mods)
  const [selection, setSelection] = useState<Selection>(new Set())
  const chosen = selection === 'all' ? mods : mods.filter((m) => selection.has(m.bundle.id))
  const count = chosen.length
  const [frame, setFrame] = useState<{ left: number; width: number } | null>(null)

  // World settings shrinks about its centre while this sheet is open, so its unscaled box is rebuilt from its layout width.
  useLayoutEffect(() => {
    const sheet = anchor.current?.closest<HTMLElement>('[data-world-sheet]')
    if (!isOpen || !sheet) return
    const measure = () => {
      const r = sheet.getBoundingClientRect()
      setFrame({ left: r.left + r.width / 2 - sheet.offsetWidth / 2, width: sheet.offsetWidth })
    }
    measure()
    addEventListener('resize', measure)
    return () => removeEventListener('resize', measure)
  }, [isOpen, anchor])

  // The panel can close this sheet itself (Review code, a mod arriving), so the selection is dropped on any close, not just the sheet's own.
  const [shown, setShown] = useState(isOpen)
  if (shown !== isOpen) {
    setShown(isOpen)
    if (!isOpen) setSelection(new Set())
  }
  // Focus sits in a row's menu or the action bar, both gone with the remove, and their focus scopes only step in once
  // focus has fallen to the page. Committing now and focusing the neighbour first keeps Escape and arrows in the sheet.
  // The list is read from the store because a row's menu keeps the closure from when the row was cached.
  const remove = (ids: string[]) => {
    const all = useWorld.getState().mods
    const rest = all.filter((m) => !ids.includes(m.bundle.id))
    const next = rest[all.findIndex((m) => ids.includes(m.bundle.id))] ?? rest.at(-1)
    flushSync(() => {
      setSelection(new Set())
      onRemove(ids)
    })
    focusInstalled(next?.bundle.id)
  }
  const setAll = (enabled: boolean) => {
    for (const m of chosen) if (m.enabled !== enabled) useWorld.setEnabled(m.bundle.id, enabled)
  }
  const single = count === 1 ? chosen[0] : null

  return (
    <Sheet isNested isOpen={isOpen} onOpenChange={onOpenChange}>
      <Sheet.Backdrop>
        <Sheet.Content className="mx-auto max-w-[720px]" style={frame ? { left: frame.left, right: 'auto', width: frame.width } : undefined}>
          <Sheet.Dialog className="max-h-[min(78vh,640px)]" data-installed-sheet>
            <Sheet.Handle />
            <Sheet.CloseTrigger aria-label="Close installed mods" className="end-4 top-4" />
            <Sheet.Header className="flex-row items-center gap-2 ps-6 pe-14 pt-1">
              <Sheet.Heading className="text-base font-medium">Installed mods</Sheet.Heading>
              <span className="text-sm tabular-nums text-muted">{mods.length}</span>
              <Button size="sm" variant="ghost" className="ms-auto" isDisabled={!mods.length} onPress={() => setSelection(count && count === mods.length ? new Set() : 'all')}>
                {count && count === mods.length ? 'Deselect all' : 'Select all'}
              </Button>
            </Sheet.Header>
            <Sheet.Body className={cn('px-4 pt-1', count > 0 && 'pb-24')} style={count > 0 ? undefined : { paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
              <ListView
                aria-label="Installed mods"
                items={mods}
                selectionMode="multiple"
                selectedKeys={selection}
                onSelectionChange={setSelection}
                // Rows are cached by item, and a light/dark switch changes no item.
                dependencies={[mode]}
                renderEmptyState={() => <p className="py-8 text-center text-sm text-muted">Nothing installed.</p>}
              >
                {(m) => <Row mod={m} mode={mode} onAction={(action) => (action === 'remove' ? remove([m.bundle.id]) : onAction(m, action))} />}
              </ListView>
            </Sheet.Body>
            {/* The action bar is position: fixed; the transform makes this strip its containing block, so the bar floats over the list, not the window. */}
            <div className="absolute inset-x-0 bottom-0 [transform:translateZ(0)]" style={{ marginBottom: 'env(safe-area-inset-bottom)' }}>
              <ActionBar aria-label="Selected mods" isOpen={count > 0}>
                <ActionBar.Prefix>
                  <Chip size="sm" className="shrink-0 tabular-nums">
                    {count}
                    <span className="sr-only"> selected</span>
                  </Chip>
                </ActionBar.Prefix>
                <Separator orientation="vertical" />
                <ActionBar.Content>
                  <Button aria-label="Enable" size="sm" variant="ghost" isDisabled={chosen.every((m) => m.enabled)} onPress={() => setAll(true)}>
                    <RiToggleFill aria-hidden className="size-4" />
                    <span className="action-bar__label">Enable</span>
                  </Button>
                  <Button aria-label="Disable" size="sm" variant="ghost" isDisabled={chosen.every((m) => !m.enabled)} onPress={() => setAll(false)}>
                    <RiToggleLine aria-hidden className="size-4" />
                    <span className="action-bar__label">Disable</span>
                  </Button>
                  {single && (
                    <>
                      <Button aria-label="Copy link" size="sm" variant="ghost" onPress={() => onAction(single, 'link')}>
                        <RiLink aria-hidden className="size-4" />
                        <span className="action-bar__label">Copy link</span>
                      </Button>
                      <Button aria-label="Save file" size="sm" variant="ghost" onPress={() => onAction(single, 'save')}>
                        <RiDownloadLine aria-hidden className="size-4" />
                        <span className="action-bar__label">Save</span>
                      </Button>
                    </>
                  )}
                  <Separator orientation="vertical" />
                  <Button aria-label="Remove" size="sm" variant="ghost" className="bg-danger/10 text-danger" onPress={() => remove(chosen.map((m) => m.bundle.id))}>
                    <RiDeleteBinLine aria-hidden className="size-4" />
                    <span className="action-bar__label">Remove</span>
                  </Button>
                </ActionBar.Content>
                <Separator orientation="vertical" />
                <ActionBar.Suffix>
                  <Tooltip delay={400}>
                    <Button isIconOnly aria-label="Clear selection" size="sm" variant="ghost" onPress={() => setSelection(new Set())}>
                      <RiCloseLine aria-hidden className="size-4" />
                    </Button>
                    <Tooltip.Content>Clear selection</Tooltip.Content>
                  </Tooltip>
                </ActionBar.Suffix>
              </ActionBar>
            </div>
          </Sheet.Dialog>
        </Sheet.Content>
      </Sheet.Backdrop>
    </Sheet>
  )
}

function Row({ mod, mode, onAction }: { mod: Mod; mode: Mode; onAction: (action: ModAction) => void }) {
  const { bundle, status } = mod
  const note = STATUS[status]
  const adds = slotsOf(mod.adds).map((s) => (s.names.length > 1 ? `${s.label} ×${s.names.length}` : s.label))
  const detail = status === 'error' && mod.error ? `Stopped: ${mod.error}` : (note?.text ?? (adds.length ? adds.join(' · ') : 'Adds nothing yet'))
  return (
    <ListView.Item id={bundle.id} textValue={bundle.name} data-mod={bundle.id} data-status={status}>
      <ListView.ItemContent>
        <ModArt art={artOf(bundle, mod.adds, mode)} code={!!bundle.code} className={cn('size-10 rounded-xl', !mod.enabled && 'opacity-50 grayscale')} />
        <div className="flex min-w-0 flex-col">
          <ListView.Title>{bundle.name}</ListView.Title>
          <ListView.Description className={cn('flex items-center gap-1', note?.tone)} title={detail}>
            {status === 'loading' && <Spinner size="sm" color="current" className="size-3" />}
            <span className="truncate">
              {KIND(bundle)} · {detail}
            </span>
          </ListView.Description>
        </div>
      </ListView.ItemContent>
      <ListView.ItemAction className="flex items-center gap-1">
        <Switch size="sm" aria-label={`Enable ${bundle.name}`} isSelected={mod.enabled} onChange={(on) => useWorld.setEnabled(bundle.id, on)}>
          <Switch.Content>
            <Switch.Control>
              <Switch.Thumb />
            </Switch.Control>
          </Switch.Content>
        </Switch>
        <Dropdown>
          <Button isIconOnly size="sm" variant="ghost" aria-label={`More for ${bundle.name}`}>
            <RiMoreFill aria-hidden className="size-4" />
          </Button>
          <Dropdown.Popover placement="bottom end">
            <Dropdown.Menu aria-label={`${bundle.name} actions`} onAction={(key) => onAction(key as ModAction)}>
              {status === 'untrusted' ? (
                <Dropdown.Item id="trust" textValue="Review code">
                  <RiCodeSSlashLine aria-hidden className="size-4 shrink-0 text-muted" />
                  <Label>Review code…</Label>
                </Dropdown.Item>
              ) : null}
              <Dropdown.Item id="link" textValue="Copy link">
                <RiLink aria-hidden className="size-4 shrink-0 text-muted" />
                <Label>Copy link</Label>
              </Dropdown.Item>
              <Dropdown.Item id="save" textValue="Save file">
                <RiDownloadLine aria-hidden className="size-4 shrink-0 text-muted" />
                <Label>Save file</Label>
              </Dropdown.Item>
              <Dropdown.Item id="remove" textValue="Remove" variant="danger">
                <RiDeleteBinLine aria-hidden className="size-4 shrink-0 text-danger" />
                <Label>Remove</Label>
              </Dropdown.Item>
            </Dropdown.Menu>
          </Dropdown.Popover>
        </Dropdown>
      </ListView.ItemAction>
    </ListView.Item>
  )
}
