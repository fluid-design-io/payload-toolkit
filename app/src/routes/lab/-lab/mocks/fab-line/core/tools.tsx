/**
 * What the camera-stop toolbar draws for mod tools: the icon, the corner mark of a tool with variants, and the popover
 * that lists variants beside the toolbar like a nested sidebar. Mods supply data only, so every tool looks, reads and
 * answers keys the same way.
 */
import { ListBox, Popover } from '@heroui/react'
import { RiToolsLine, RiVidiconLine } from '@remixicon/react'
import type { RefObject } from 'react'

import type { Tool } from './contract'

/** A mod tool as the toolbar sees it: its data, its picked variant (null without variants) and whether it is live. */
export type ToolEntry = Pick<Tool, 'id' | 'label' | 'icon' | 'kind' | 'variants' | 'description'> & { picked: string | null; live: boolean }
/** Toolbar buttons for mod tools before the rest move behind More, so the column fits a phone. */
export const MAX_TOOLS = 3
/** The item a tool without variants lists in the More popover. */
const SELF = '__tool'

export const hasVariants = (t: ToolEntry) => (t.variants?.length ?? 0) > 1

export function ToolIcon({ tool }: { tool: ToolEntry }) {
  const Fallback = tool.kind === 'view' ? RiVidiconLine : RiToolsLine
  return (
    <>
      {tool.icon ? (
        <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden>
          <path d={tool.icon} />
        </svg>
      ) : (
        <Fallback aria-hidden />
      )}
      {hasVariants(tool) && <span aria-hidden className="pointer-events-none absolute bottom-1 right-1 size-1.5 bg-current opacity-60 [clip-path:polygon(100%_0,100%_100%,0_100%)]" />}
    </>
  )
}

/**
 * The variants of one tool, or every tool behind More, beside the toolbar. Picking a view's variant picks the view
 * (again, if it is live); picking a toggle's turns it on with that variant, and pressing its live variant turns it off.
 */
export function ToolMenu({ tools, anchor, label, onClose, onGo, onToggle }: {
  /** Empty while closed. */
  tools: readonly ToolEntry[]
  anchor: RefObject<HTMLElement | null>
  label: string
  onClose: () => void
  onGo: (id: string, variant: string | null) => void
  onToggle: (id: string, on: boolean, variant: string | null) => void
}) {
  const pick = (tool: ToolEntry, key: string | undefined) => {
    const variant = key && key !== SELF ? key : tool.picked
    if (tool.kind === 'view') onGo(tool.id, variant)
    else onToggle(tool.id, key !== undefined, key !== undefined ? variant : null)
    onClose()
  }
  return (
    <Popover isOpen={tools.length > 0} onOpenChange={(open) => !open && onClose()}>
      <Popover.Content triggerRef={anchor} placement="right" offset={10} className="w-64 max-w-[calc(100vw-80px)]">
        <Popover.Dialog aria-label={label} className="flex max-h-[min(420px,70vh)] flex-col gap-3 overflow-y-auto p-2" data-tool-menu>
          {tools.map((tool) => {
            const items = hasVariants(tool) ? tool.variants! : [{ id: SELF, label: tool.label, description: tool.description, thumbnail: undefined }]
            const selected = tool.kind === 'view' ? (tool.picked && hasVariants(tool) ? [tool.picked] : tool.live ? [SELF] : []) : tool.live ? [tool.picked ?? SELF] : []
            return (
              <section key={tool.id} className="flex flex-col gap-1" data-tool-section={tool.id}>
                {hasVariants(tool) && (
                  <header className="px-2 pt-1">
                    <p className="text-sm font-medium text-foreground">{tool.label}</p>
                    {tool.description && <p className="text-xs text-muted">{tool.description}</p>}
                  </header>
                )}
                <ListBox
                  aria-label={tool.label}
                  selectionMode="single"
                  selectedKeys={selected}
                  onSelectionChange={(keys) => pick(tool, [...(keys as Set<string>)][0])}
                >
                  {items.map((v) => (
                    <ListBox.Item key={v.id} id={v.id} textValue={v.label} data-variant={v.id}>
                      {v.thumbnail && <img src={v.thumbnail} alt="" referrerPolicy="no-referrer" className="h-8 w-11 shrink-0 rounded-md object-cover ring-1 ring-black/10 dark:ring-white/10" />}
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-sm">{v.label}</span>
                        {v.description && <span className="truncate text-xs text-muted">{v.description}</span>}
                      </span>
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                  ))}
                </ListBox>
              </section>
            )
          })}
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  )
}
