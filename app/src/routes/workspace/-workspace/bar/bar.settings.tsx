import {
  Description,
  FieldError,
  Input,
  Label,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
} from '@heroui/react'
import { RiSettings3Line } from '@remixicon/react'
import { useId } from 'react'
import {
  agents,
  databases,
  frameworks,
  packageManagers,
} from '../workspace.constants'
import { useWorkspace, useWorkspaceSelector } from '../workspace.context'
import type { Option } from '../workspace.types'
import { directoryError } from '../workspace.utils'
import { BarPanel } from './bar.panel'

function SettingsName() {
  const { actions } = useWorkspace()
  const name = useWorkspaceSelector((state) => state.setup.name)
  const error = directoryError(name)

  return (
    <TextField
      variant="secondary"
      value={name}
      onChange={actions.setName}
      isInvalid={error !== null}
      fullWidth
    >
      <Label>Project name</Label>
      <Input
        className="font-mono"
        placeholder="my-payload-app"
        spellCheck={false}
      />
      <FieldError>{error}</FieldError>
    </TextField>
  )
}

function SettingsChoice<T extends string>({
  label,
  options,
  value,
  onChange,
  isDisabled,
  description,
}: {
  label: string
  options: readonly Option<T>[]
  value: T
  onChange: (value: T) => void
  isDisabled?: boolean
  description?: string
}) {
  const labelId = useId()
  const descriptionId = useId()

  return (
    <div className="flex flex-col gap-1.5">
      <Label elementType="span" id={labelId} isDisabled={isDisabled}>
        {label}
      </Label>
      <ToggleButtonGroup
        aria-labelledby={labelId}
        aria-describedby={description ? descriptionId : undefined}
        isDetached
        size="sm"
        selectionMode="single"
        disallowEmptySelection
        isDisabled={isDisabled}
        selectedKeys={[value]}
        onSelectionChange={(keys) => {
          const [next] = keys
          if (next) onChange(next as T)
        }}
        className="flex-wrap justify-start"
      >
        {options.map((option) => (
          <ToggleButton key={option.value} id={option.value}>
            {option.label}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
      {description && (
        <Description id={descriptionId}>{description}</Description>
      )}
    </div>
  )
}

function SettingsFramework() {
  const { actions } = useWorkspace()
  const value = useWorkspaceSelector((state) => state.setup.framework)
  return (
    <SettingsChoice
      label="Framework"
      options={frameworks}
      value={value}
      onChange={actions.setFramework}
    />
  )
}

function SettingsDatabase() {
  const { actions } = useWorkspace()
  const value = useWorkspaceSelector((state) => state.setup.database)
  return (
    <SettingsChoice
      label="Database"
      options={databases}
      value={value}
      onChange={actions.setDatabase}
    />
  )
}

function SettingsPackageManager() {
  const { actions } = useWorkspace()
  const value = useWorkspaceSelector((state) => state.setup.packageManager)
  return (
    <SettingsChoice
      label="Package manager"
      options={packageManagers}
      value={value}
      onChange={actions.setPackageManager}
    />
  )
}

/**
 * The CLI hands off to an agent only when there is something to integrate.
 * After installing, it runs `codex exec` or `claude --print` with the
 * integration prompt. Both states use the one description line.
 */
function SettingsAgent() {
  const { actions } = useWorkspace()
  const value = useWorkspaceSelector((state) => state.setup.agent)
  const isDisabled = useWorkspaceSelector(
    (state) => state.setup.items.length === 0,
  )
  return (
    <SettingsChoice
      label="Agent"
      options={agents}
      value={value}
      onChange={actions.setAgent}
      isDisabled={isDisabled}
      description={
        isDisabled
          ? 'Add an item to enable.'
          : 'Runs Codex or Claude Code after install to wire in your items.'
      }
    />
  )
}

/** The cog carries a danger dot while the name is invalid, since Copy then opens this panel. */
export function BarSettings() {
  const isInvalid = useWorkspaceSelector(
    (state) => directoryError(state.setup.name) !== null,
  )

  return (
    <BarPanel
      panel="settings"
      title="Project settings"
      label={
        isInvalid
          ? 'Project settings, project name needs attention'
          : 'Project settings'
      }
      isIconOnly
      trigger={
        <>
          <RiSettings3Line size={16} aria-hidden="true" />
          {isInvalid && (
            <span className="pointer-events-none absolute top-1.5 right-1.5 size-2 rounded-full bg-danger ring-2 ring-black" />
          )}
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <SettingsName />
        <SettingsFramework />
        <SettingsDatabase />
        <SettingsPackageManager />
        <SettingsAgent />
      </div>
    </BarPanel>
  )
}
