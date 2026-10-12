import { cn, Kbd, Separator, ToggleButton, ToggleButtonGroup, Tooltip } from '@heroui/react'
import { RiFocus3Line, RiFullscreenLine, RiMoreLine, RiSettings3Line } from '@remixicon/react'
import { useRef, useState } from 'react'
import type { Ref } from 'react'

import { SLOTS } from '../world/slots'
import type { Slot } from '../world/slots'
import type { LineLayout } from './contract'
import { hasVariants, MAX_TOOLS, ToolIcon, ToolMenu } from './tools'
import type { ToolEntry } from './tools'

/** A stop shows its station's slot icon. */
const iconOf = (id: string) => (SLOTS as Readonly<Record<string, Slot | undefined>>)[id]?.Icon ?? RiFocus3Line

/**
 * Camera jumps as icons: the whole line (0), then one per station in line
 * order (1..N), then the installed mods' tools (views join the stops and
 * continue the numbering; the fourth tool on sits behind More), and the World
 * settings toggle last. A free camera selects nothing; pressing the selected stop again frames it again. The icons
 * stack in a column at the scene's bottom left.
 */
export function Strip({ line, tools, order, active, onGo, onToggle, settings, onSettings, settingsRef }: {
  line: LineLayout
  tools: readonly ToolEntry[]
  /** What the number keys pick: `overview`, the stops, then every view tool, including those behind More. */
  order: readonly string[]
  /** `overview`, a stop id, a view tool's id, or `free`. */
  active: string
  /** `variant` is given when a view tool's variant was picked. */
  onGo: (to: string, variant?: string | null) => void
  onToggle: (id: string, on: boolean, variant: string | null) => void
  settings: boolean
  onSettings: (open: boolean) => void
  settingsRef: Ref<HTMLButtonElement>
}) {
  const shown = tools.slice(0, MAX_TOOLS)
  const more = tools.slice(MAX_TOOLS)
  const stops = [
    { id: 'overview', label: 'Whole line', Icon: RiFullscreenLine, tool: undefined },
    ...line.stops.map((s) => ({ id: s.id, label: s.label, Icon: iconOf(s.id), tool: undefined })),
    ...shown.filter((t) => t.kind === 'view').map((t) => ({ id: t.id, label: t.label, Icon: RiFullscreenLine, tool: t })),
  ]
  const selected = stops.some((s) => s.id === active) ? [active] : []
  // One popover at a time, beside the button that opened it: a tool's id, `more`, or null.
  const [menu, setMenu] = useState<string | null>(null)
  const anchor = useRef<HTMLElement | null>(null)
  const buttons = useRef(new Map<string, HTMLElement>())
  const open = (id: string) => {
    anchor.current = buttons.current.get(id) ?? null
    setMenu(id)
  }
  const keep = (id: string) => (el: HTMLElement | null) => {
    if (el) buttons.current.set(id, el)
    else buttons.current.delete(id)
  }
  const press = (t: ToolEntry) => {
    if (hasVariants(t)) open(t.id)
    else if (t.kind === 'view') onGo(t.id)
    else onToggle(t.id, !t.live, t.picked)
  }
  return (
    <nav
      aria-label="Camera stops"
      className="flex flex-col items-center gap-0.5 rounded-full border border-border bg-surface/85 p-1 shadow-overlay backdrop-blur"
      data-strip
    >
      <ToggleButtonGroup
        aria-label="Camera stop"
        size="sm"
        isDetached
        orientation="vertical"
        selectionMode="single"
        selectedKeys={selected}
        onSelectionChange={(keys) => {
          const [next] = keys as Set<string>
          const tool = shown.find((t) => t.id === (next ?? active))
          if (tool) press(tool)
          else onGo(next ?? active)
        }}
        className="gap-0.5"
      >
        {stops.map(({ id, label, Icon, tool }) => {
          const i = order.indexOf(id)
          return (
            <Tooltip key={id} delay={300} closeDelay={0} isDisabled={menu === id}>
              <ToggleButton
                ref={tool && keep(id)}
                id={id}
                isIconOnly
                variant="ghost"
                aria-label={i < 10 ? `${label} (${i})` : label}
                aria-keyshortcuts={i < 10 ? String(i) : undefined}
                aria-haspopup={tool && hasVariants(tool) ? 'dialog' : undefined}
                className={cn(tool && 'relative')}
                data-stop={id}
              >
                {tool ? <ToolIcon tool={tool} /> : <Icon aria-hidden />}
              </ToggleButton>
              <Tooltip.Content placement="right" className="flex items-center gap-2">
                {label}
                {i < 10 && <Kbd>{i}</Kbd>}
              </Tooltip.Content>
            </Tooltip>
          )
        })}
      </ToggleButtonGroup>
      {shown.filter((t) => t.kind === 'toggle').map((t) => (
        <Tooltip key={t.id} delay={300} closeDelay={0} isDisabled={menu === t.id}>
          <ToggleButton
            ref={keep(t.id)}
            isIconOnly
            size="sm"
            variant="ghost"
            aria-label={t.label}
            aria-haspopup={hasVariants(t) ? 'dialog' : undefined}
            isSelected={t.live}
            onChange={() => press(t)}
            className="relative"
            data-tool={t.id}
          >
            <ToolIcon tool={t} />
          </ToggleButton>
          <Tooltip.Content placement="right">{t.label}</Tooltip.Content>
        </Tooltip>
      ))}
      {more.length > 0 && (
        <Tooltip delay={300} closeDelay={0} isDisabled={menu === 'more'}>
          <ToggleButton
            ref={keep('more')}
            isIconOnly
            size="sm"
            variant="ghost"
            aria-label={`More tools (${more.length})`}
            aria-haspopup="dialog"
            isSelected={more.some((t) => t.live)}
            onChange={() => open('more')}
            data-tool="more"
          >
            <RiMoreLine aria-hidden />
          </ToggleButton>
          <Tooltip.Content placement="right">More tools</Tooltip.Content>
        </Tooltip>
      )}
      <ToolMenu
        tools={menu === 'more' ? more : tools.filter((t) => t.id === menu)}
        anchor={anchor}
        label={menu === 'more' ? 'More tools' : (tools.find((t) => t.id === menu)?.label ?? '')}
        onClose={() => setMenu(null)}
        onGo={onGo}
        onToggle={onToggle}
      />
      <Separator orientation="horizontal" className="my-0.5 w-5" />
      <Tooltip delay={300} closeDelay={0} isDisabled={settings}>
        <ToggleButton ref={settingsRef} isIconOnly size="sm" variant="ghost" aria-label="World settings" isSelected={settings} onChange={onSettings} data-world-button>
          <RiSettings3Line aria-hidden />
        </ToggleButton>
        <Tooltip.Content placement="right">World settings</Tooltip.Content>
      </Tooltip>
    </nav>
  )
}
