import { Segment } from '@heroui-pro/react'
import { RiBox3Line, RiLayoutGridLine } from '@remixicon/react'
import { views } from './workspace.constants'
import { useWorkspace, useWorkspaceSelector } from './workspace.context'
import type { View } from './workspace.types'

const icons = { grid: RiLayoutGridLine, factory: RiBox3Line } satisfies Record<View, unknown>

/**
 * Grid or Factory, one segmented control that arrow keys move through. Both views
 * read and write the same store, so switching keeps the build. On phones the
 * labels hide and the icons carry the toolbar row; the names stay for
 * assistive technology. A blurred backing keeps it legible over the factory
 * scene in either theme.
 */
export function WorkspaceViewSwitch() {
  const { actions } = useWorkspace()
  const view = useWorkspaceSelector((state) => state.view)

  return (
    <div className="ms-auto shrink-0 rounded-3xl backdrop-blur-md" data-view-switch>
      <Segment
        aria-label="View"
        size="sm"
        selectedKey={view}
        onSelectionChange={(key) => actions.setView(key as View)}
      >
        {views.map(({ value, label }) => {
          const Icon = icons[value]
          return (
            <Segment.Item key={value} id={value} aria-label={label}>
              <Icon size={16} aria-hidden="true" />
              <span className="max-[768px]:sr-only">{label}</span>
            </Segment.Item>
          )
        })}
      </Segment>
    </div>
  )
}
