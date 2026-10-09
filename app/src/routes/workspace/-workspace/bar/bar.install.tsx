import { Segment } from '@heroui-pro/react'
import {
  Button,
  Description,
  FieldError,
  Input,
  Label,
  ScrollShadow,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@heroui/react'
import {
  RiCheckLine,
  RiFileCopyLine,
  RiInstallLine,
  RiSparkling2Line,
  RiTerminalBoxLine,
} from '@remixicon/react'
import { Fragment, useEffect, useId, useState } from 'react'
import {
  agents,
  databases,
  frameworks,
  outputs,
  packageManagers,
  targets,
} from '../workspace.constants'
import { useWorkspace, useWorkspaceSelector } from '../workspace.context'
import type { Agent, Option, Output } from '../workspace.types'
import { directoryError, installError, outputText } from '../workspace.utils'
import { CardSection } from './bar.card'

const outputIcons: Record<Output, typeof RiTerminalBoxLine> = {
  command: RiTerminalBoxLine,
  prompt: RiSparkling2Line,
}

function InstallTarget() {
  const { actions } = useWorkspace()
  const target = useWorkspaceSelector((state) => state.setup.target)
  return (
    <Segment
      aria-label="Install target"
      selectedKey={target}
      onSelectionChange={(key) => actions.setTarget(key === 'new' ? 'new' : 'existing')}
      className="w-full"
    >
      {targets.map((option) => (
        <Segment.Item key={option.value} id={option.value}>
          {option.label}
        </Segment.Item>
      ))}
    </Segment>
  )
}

function ProjectName() {
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
      <Input className="font-mono" placeholder="my-payload-app" spellCheck={false} />
      <FieldError>{error}</FieldError>
    </TextField>
  )
}

function ProjectChoice<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: readonly Option<T>[]
  value: T
  onChange: (value: T) => void
}) {
  const labelId = useId()
  return (
    <div className="flex flex-col gap-1.5">
      <Label elementType="span" id={labelId}>
        {label}
      </Label>
      <ToggleButtonGroup
        aria-labelledby={labelId}
        isDetached
        size="sm"
        selectionMode="single"
        disallowEmptySelection
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
    </div>
  )
}

/** `add` resolves everything from the project it runs in, so only a new project asks for these. */
function InstallProject() {
  const { actions } = useWorkspace()
  const isNew = useWorkspaceSelector((state) => state.setup.target === 'new')
  const framework = useWorkspaceSelector((state) => state.setup.framework)
  const database = useWorkspaceSelector((state) => state.setup.database)
  const packageManager = useWorkspaceSelector((state) => state.setup.packageManager)
  if (!isNew) return null

  return (
    <div className="flex flex-col gap-4">
      <ProjectName />
      <ProjectChoice
        label="Framework"
        options={frameworks}
        value={framework}
        onChange={actions.setFramework}
      />
      <ProjectChoice
        label="Database"
        options={databases}
        value={database}
        onChange={actions.setDatabase}
      />
      <ProjectChoice
        label="Package manager"
        options={packageManagers}
        value={packageManager}
        onChange={actions.setPackageManager}
      />
    </div>
  )
}

function InstallOutput() {
  const { actions } = useWorkspace()
  const output = useWorkspaceSelector((state) => state.output)
  return (
    <Segment
      aria-label="Run with"
      selectedKey={output}
      onSelectionChange={(key) => actions.setOutput(key === 'prompt' ? 'prompt' : 'command')}
      className="w-full"
    >
      {outputs.map((option) => {
        const Icon = outputIcons[option.value]
        return (
          <Segment.Item key={option.value} id={option.value}>
            <Icon size={16} aria-hidden="true" />
            {option.label}
          </Segment.Item>
        )
      })}
    </Segment>
  )
}

/**
 * A terminal option: the CLI hands off to Claude Code or Codex after
 * installing. The switch remembers the last agent, so turning it back on
 * restores that choice. The CLI only hands off when an item is selected.
 */
function InstallAgent() {
  const { actions } = useWorkspace()
  const isCommand = useWorkspaceSelector((state) => state.output === 'command')
  const agent = useWorkspaceSelector((state) => state.setup.agent)
  const isDisabled = useWorkspaceSelector((state) => state.setup.items.length === 0)
  const [last, setLast] = useState<Exclude<Agent, 'none'>>(agent === 'none' ? 'claude' : agent)
  if (!isCommand) return null
  const isOn = agent !== 'none' && !isDisabled

  return (
    <div className="ms-2 flex flex-col gap-3 border-s-2 border-border ps-4">
      <Switch
        isSelected={isOn}
        isDisabled={isDisabled}
        onChange={(selected) => actions.setAgent(selected ? last : 'none')}
        className="w-full flex-row items-start justify-between gap-4"
      >
        <Switch.Content className="flex-1 flex-col items-start gap-1">
          <Label>Have an agent finish the install</Label>
          <Description>
            {isDisabled
              ? 'Add an item to enable.'
              : "After the files land, the agent follows each item's guide to wire it into your project, fixing imports, registering blocks and regenerating types, then runs your checks and reports what it found. It never touches your Git history."}
          </Description>
        </Switch.Content>
        <Switch.Control className="mt-0.5 shrink-0">
          <Switch.Thumb />
        </Switch.Control>
      </Switch>
      {isOn && (
        <Segment
          aria-label="Agent"
          size="sm"
          selectedKey={agent}
          onSelectionChange={(key) => {
            const next = key === 'codex' ? 'codex' : 'claude'
            setLast(next)
            actions.setAgent(next)
          }}
          className="self-start"
        >
          {agents
            .filter((option) => option.value !== 'none')
            .map((option) => (
              <Segment.Item key={option.value} id={option.value}>
                {option.label}
              </Segment.Item>
            ))}
        </Segment>
      )}
    </div>
  )
}

/**
 * The preview is exactly what the bar's Copy writes, so nothing reaches the
 * clipboard unseen. A command wraps only between arguments, never inside a flag.
 */
function InstallPreview() {
  const { meta } = useWorkspace()
  const output = useWorkspaceSelector((state) => state.output)
  const target = useWorkspaceSelector((state) => state.setup.target)
  const error = useWorkspaceSelector((state) => installError(state.setup))
  const text = useWorkspaceSelector((state) =>
    outputText(state.setup, state.output, meta.catalog.items),
  )
  const isCommand = error === null && output === 'command'
  const hint =
    output === 'prompt'
      ? 'Paste into Claude Code, Codex, Cursor or any coding agent.'
      : target === 'new'
        ? 'Run from the folder that will hold the project.'
        : 'Run from your project root.'

  return (
    <div className="flex flex-col gap-3">
      <ScrollShadow className="max-h-48 overflow-y-auto rounded-2xl bg-surface-secondary">
        <pre
          data-command={isCommand}
          data-error={error !== null}
          className="whitespace-pre-wrap break-words p-3 font-sans text-xs leading-relaxed data-[command=true]:font-mono data-[error=true]:text-muted"
        >
          {isCommand
            ? text.split(' ').map((token, index) => (
                <Fragment key={index}>
                  {index ? ' ' : ''}
                  <span className="whitespace-nowrap">{token}</span>
                </Fragment>
              ))
            : text}
        </pre>
      </ScrollShadow>
      <Typography type="body-xs" color="muted">
        {hint}
      </Typography>
    </div>
  )
}

export function InstallView() {
  return (
    <>
      <CardSection>
        <InstallTarget />
      </CardSection>
      <CardSection className="min-h-0 flex-1">
        <ScrollShadow className="-me-3 flex h-full flex-col gap-5 overflow-y-auto pe-3 pb-1">
          <InstallProject />
          <InstallOutput />
          <InstallAgent />
          <InstallPreview />
        </ScrollShadow>
      </CardSection>
    </>
  )
}

function useCopied() {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(timer)
  }, [copied])
  return [copied, () => setCopied(true)] as const
}

/** Plain white on the black bar, without the theme's primary border, raised shadow and sheen. */
const whiteButton =
  'border-0 text-black shadow-none before:hidden [--button-bg:white] [--button-bg-hover:rgb(235_235_235)] [--button-bg-pressed:rgb(225_225_225)] [--button-fg:black]'

/** The labels share one grid cell, so swapping them never changes the button's width. */
function CtaLabel({ label }: { label: 'install' | 'copy' | 'copied' }) {
  const cell =
    'col-start-1 row-start-1 inline-flex items-center justify-center gap-2 transition-[opacity,translate] duration-300 data-[shown=false]:pointer-events-none data-[shown=false]:translate-y-2 data-[shown=false]:opacity-0'
  return (
    <span className="grid">
      <span data-shown={label === 'install'} className={cell}>
        <RiInstallLine size={18} aria-hidden="true" />
        Install
      </span>
      <span data-shown={label === 'copy'} className={cell}>
        <RiFileCopyLine size={18} aria-hidden="true" />
        Copy
      </span>
      <span data-shown={label === 'copied'} className={cell}>
        <RiCheckLine size={18} aria-hidden="true" />
        Copied
      </span>
    </span>
  )
}

/**
 * The bar's call to action. From the bar or the build view it opens the
 * install view; inside the install view it becomes Copy, reading the store
 * when pressed. It is disabled while the setup has an error, which the
 * preview shows.
 */
export function BarInstall() {
  const { store, actions, meta } = useWorkspace()
  const isOpen = useWorkspaceSelector((state) => state.panel === 'install')
  const hasError = useWorkspaceSelector((state) => installError(state.setup) !== null)
  const [copied, onCopied] = useCopied()
  const label = !isOpen ? 'install' : copied ? 'copied' : 'copy'

  return (
    <>
      <Button
        size="lg"
        data-bar-cta
        isDisabled={isOpen && hasError}
        aria-label={isOpen ? 'Copy to clipboard' : 'Install'}
        className={`w-32 ${whiteButton}`}
        onPress={async () => {
          if (!isOpen) return actions.openPanel('install')
          const { setup, output } = store.state
          try {
            await navigator.clipboard.writeText(outputText(setup, output, meta.catalog.items))
            onCopied()
          } catch {}
        }}
      >
        <CtaLabel label={label} />
      </Button>
      <span className="sr-only" aria-live="polite">
        {copied ? 'Copied to clipboard' : ''}
      </span>
    </>
  )
}
