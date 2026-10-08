import {
  Button,
  Description,
  FieldError,
  Input,
  Label,
  Tag,
  TagGroup,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
} from '@heroui/react'
import { useEffect, useId, useState } from 'react'
import type { PropsWithChildren } from 'react'
import { agents, databases, frameworks, outputs, packageManagers } from './workspace.constants'
import { useWorkspace } from './workspace.context'
import type { Option } from './workspace.types'

/**
 * One aside for every viewport. From lg it is a persistent column; below lg
 * the same element is a fixed half-height sheet whose header collapses it to
 * a peek of the output, so the setup never exists twice in the DOM.
 */
function WorkspaceSetupRoot({ children }: PropsWithChildren) {
  const [expanded, setExpanded] = useState(true)

  return (
    <aside
      aria-label="Your setup"
      data-collapsed={!expanded}
      className="group/setup fixed inset-x-0 bottom-0 z-10 flex h-[50svh] flex-col rounded-t-2xl border-t border-separator bg-background shadow-overlay data-[collapsed=true]:h-auto lg:static lg:h-svh lg:w-[360px] lg:shrink-0 lg:rounded-none lg:border-t-0 lg:border-l lg:shadow-none lg:data-[collapsed=true]:h-svh"
    >
      <h2 className="shrink-0 text-sm font-medium">
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
          className="flex h-12 w-full items-center justify-between px-4 outline-none focus-visible:bg-default lg:hidden"
        >
          Your setup
          <span className="font-mono text-xs font-normal text-muted">
            {expanded ? 'hide' : 'show'}
          </span>
        </button>
        <span className="hidden h-14 items-center px-5 lg:flex">Your setup</span>
      </h2>
      {children}
    </aside>
  )
}

function WorkspaceSetupBody({ children }: PropsWithChildren) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 pb-5 group-data-[collapsed=true]/setup:hidden lg:px-5 lg:group-data-[collapsed=true]/setup:flex">
      {children}
    </div>
  )
}

function WorkspaceSetupName() {
  const { state, actions } = useWorkspace()

  return (
    <TextField
      value={state.setup.name}
      onChange={actions.setName}
      isInvalid={state.directoryError !== null}
      fullWidth
    >
      <Label>Project name</Label>
      <Input className="font-mono" placeholder="my-payload-app" spellCheck={false} />
      <FieldError>{state.directoryError}</FieldError>
    </TextField>
  )
}

function Choice<T extends string>({
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
      {description && <Description id={descriptionId}>{description}</Description>}
    </div>
  )
}

function WorkspaceSetupFramework() {
  const { state, actions } = useWorkspace()
  return (
    <Choice
      label="Framework"
      options={frameworks}
      value={state.setup.framework}
      onChange={actions.setFramework}
    />
  )
}

function WorkspaceSetupDatabase() {
  const { state, actions } = useWorkspace()
  return (
    <Choice
      label="Database"
      options={databases}
      value={state.setup.database}
      onChange={actions.setDatabase}
    />
  )
}

function WorkspaceSetupPackageManager() {
  const { state, actions } = useWorkspace()
  return (
    <Choice
      label="Package manager"
      options={packageManagers}
      value={state.setup.packageManager}
      onChange={actions.setPackageManager}
    />
  )
}

/** The CLI rejects an agent with the minimal template, so the agent needs an item. */
function WorkspaceSetupAgent() {
  const { state, actions } = useWorkspace()
  const isDisabled = state.selected.length === 0
  return (
    <Choice
      label="Agent"
      options={agents}
      value={state.setup.agent}
      onChange={actions.setAgent}
      isDisabled={isDisabled}
      description={isDisabled ? 'Requires at least one item.' : undefined}
    />
  )
}

function WorkspaceSetupItems() {
  const { state, actions } = useWorkspace()

  return (
    <TagGroup
      onRemove={(keys) => {
        for (const key of keys) actions.removeItem(String(key))
      }}
    >
      <Label>Items</Label>
      <TagGroup.List
        items={state.selected}
        renderEmptyState={() => <span className="text-xs text-muted">None. Template minimal.</span>}
      >
        {(item) => (
          <Tag id={item.ref} textValue={item.ref} className="font-mono">
            {item.ref}
          </Tag>
        )}
      </TagGroup.List>
    </TagGroup>
  )
}

/**
 * Short tokens never wrap, so --database or a feature ref is not split after a
 * hyphen. Lines break between tokens and after each comma of the features
 * list; a token longer than a line still wraps anywhere.
 * The text content stays exactly what Copy writes.
 */
function WorkspaceSetupOutput() {
  const { state, actions } = useWorkspace()
  const [copiedText, setCopiedText] = useState<string | null>(null)
  const copied = copiedText === state.text
  const hasError = state.directoryError !== null

  useEffect(() => {
    if (copiedText === null) return
    const timer = setTimeout(() => setCopiedText(null), 1500)
    return () => clearTimeout(timer)
  }, [copiedText])

  return (
    <div className="flex shrink-0 flex-col gap-3 border-t border-separator px-4 py-4 lg:px-5">
      <div className="flex items-center justify-between gap-3">
        <ToggleButtonGroup
          aria-label="Output"
          isDetached
          size="sm"
          selectionMode="single"
          disallowEmptySelection
          selectedKeys={[state.output]}
          onSelectionChange={(keys) => {
            const [output] = keys
            if (output === 'command' || output === 'prompt') actions.setOutput(output)
          }}
        >
          {outputs.map((option) => (
            <ToggleButton key={option.value} id={option.value}>
              {option.label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
        <Button
          variant="outline"
          size="sm"
          isDisabled={hasError}
          onPress={async () => {
            try {
              await navigator.clipboard.writeText(state.text)
              setCopiedText(state.text)
            } catch {}
          }}
        >
          {copied ? 'Copied' : 'Copy'}
        </Button>
        <span className="sr-only" aria-live="polite">
          {copied ? 'Copied' : ''}
        </span>
      </div>
      <pre
        aria-label={state.output === 'command' ? 'CLI command' : 'Agent prompt'}
        data-invalid={hasError}
        className="max-h-28 overflow-y-auto rounded-lg bg-surface-secondary p-3 font-mono text-xs leading-relaxed break-words whitespace-pre-wrap text-foreground [overflow-wrap:anywhere] data-[invalid=true]:text-danger lg:max-h-72"
      >
        {state.text
          .split(/(\s+)|(?<=,)/)
          .filter(Boolean)
          .map((part, index) =>
            part.length <= 32 && !/\s/.test(part) ? (
              <span key={index} className="whitespace-nowrap">
                {part}
              </span>
            ) : (
              part
            ),
          )}
      </pre>
    </div>
  )
}

export const WorkspaceSetup = Object.assign(WorkspaceSetupRoot, {
  Body: WorkspaceSetupBody,
  Name: WorkspaceSetupName,
  Framework: WorkspaceSetupFramework,
  Database: WorkspaceSetupDatabase,
  PackageManager: WorkspaceSetupPackageManager,
  Agent: WorkspaceSetupAgent,
  Items: WorkspaceSetupItems,
  Output: WorkspaceSetupOutput,
})
