import { ToggleButton, ToggleButtonGroup } from '@heroui/react'
import { RiBox3Line, RiLayoutGridLine } from '@remixicon/react'
import { views } from './workspace.constants'
import { useWorkspace, useWorkspaceSelector } from './workspace.context'
import type { View } from './workspace.types'

const icons = { grid: RiLayoutGridLine, factory: RiBox3Line } satisfies Record<View, unknown>

/**
 * Grid or Factory, one radio group that arrow keys move through. Both views
 * read and write the same store, so switching keeps the build. On phones the
 * labels hide and the icons carry the toolbar row; the names stay for
 * assistive technology.
 */
export function WorkspaceViewSwitch() {
  const { actions } = useWorkspace()
  const view = useWorkspaceSelector((state) => state.view)

  return (
    <ToggleButtonGroup
      aria-label="View"
      size="sm"
      selectionMode="single"
      disallowEmptySelection
      selectedKeys={[view]}
      onSelectionChange={(keys) => {
        const [next] = keys as Set<View>
        if (next) actions.setView(next)
      }}
      className="ms-auto shrink-0"
    >
      {views.map(({ value, label }) => {
        const Icon = icons[value]
        return (
          <ToggleButton key={value} id={value} aria-label={label}>
            <Icon size={16} aria-hidden="true" />
            <span className="max-[768px]:sr-only">{label}</span>
          </ToggleButton>
        )
      })}
    </ToggleButtonGroup>
  )
}
