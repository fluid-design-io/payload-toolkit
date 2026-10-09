import {
  Button,
  ButtonGroup,
  Description,
  Dropdown,
  Label,
} from '@heroui/react'
import { RiArrowDownSLine, RiCheckLine, RiFileCopyLine } from '@remixicon/react'
import { useEffect, useState } from 'react'
import { outputs } from '../workspace.constants'
import { useWorkspace, useWorkspaceSelector } from '../workspace.context'
import type { Output } from '../workspace.types'
import { directoryError, outputText } from '../workspace.utils'

/** Plain white on the black bar, without the theme's primary border, raised shadow and sheen. */
const whiteButton =
  'border-0 text-black shadow-none before:hidden [--button-bg:white] [--button-bg-hover:rgb(235_235_235)] [--button-bg-pressed:rgb(225_225_225)] [--button-fg:black]'

/** Every label shares one grid cell, so swapping them never changes the button's width. */
function CopyLabel({ output, copied }: { output: Output; copied: boolean }) {
  const cell = 'col-start-1 row-start-1 data-[hidden=true]:invisible'
  return (
    <span className="grid justify-items-center">
      <span data-hidden={copied || output !== 'command'} className={cell}>
        <span className="sm:hidden text-inherit">Copy</span>
        <span className="max-sm:hidden text-inherit">Copy command</span>
      </span>
      <span data-hidden={copied || output !== 'prompt'} className={cell}>
        <span className="sm:hidden text-inherit">Copy</span>
        <span className="max-sm:hidden text-inherit">Copy prompt</span>
      </span>
      <span data-hidden={!copied} className={cell}>
        Copied
      </span>
    </span>
  )
}

/**
 * Copy reads the store when pressed instead of subscribing to the setup, so
 * edits never re-render it. With an invalid name it opens the settings panel,
 * where the name field shows the error, instead of copying.
 */
export function BarCopy() {
  const { store, actions, meta } = useWorkspace()
  const output = useWorkspaceSelector((state) => state.output)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(timer)
  }, [copied])

  return (
    <>
      <ButtonGroup>
        <Button
          className={`ps-3.5 ${whiteButton}`}
          onPress={async () => {
            const { setup } = store.state
            if (directoryError(setup.name)) return actions.openPanel('settings')
            try {
              await navigator.clipboard.writeText(
                outputText(setup, output, meta.catalog.items),
              )
              setCopied(true)
            } catch {}
          }}
        >
          {copied ? (
            <RiCheckLine size={16} aria-hidden="true" />
          ) : (
            <RiFileCopyLine size={16} aria-hidden="true" />
          )}
          <CopyLabel output={output} copied={copied} />
        </Button>
        <Dropdown>
          <Button
            isIconOnly
            aria-label="Output format"
            className={`pe-1 ${whiteButton}`}
          >
            <ButtonGroup.Separator className="bg-black opacity-10" />
            <RiArrowDownSLine size={16} aria-hidden="true" />
          </Button>
          <Dropdown.Popover placement="top end" offset={14}>
            <Dropdown.Menu
              aria-label="Output format"
              selectionMode="single"
              disallowEmptySelection
              selectedKeys={[output]}
              onSelectionChange={(keys) => {
                const [next] = keys
                if (next === 'command' || next === 'prompt')
                  actions.setOutput(next)
              }}
            >
              {outputs.map((option) => (
                <Dropdown.Item
                  key={option.value}
                  id={option.value}
                  textValue={option.label}
                >
                  <span className="flex flex-col">
                    <Label>{option.label}</Label>
                    <Description>{option.description}</Description>
                  </span>
                  <Dropdown.ItemIndicator />
                </Dropdown.Item>
              ))}
            </Dropdown.Menu>
          </Dropdown.Popover>
        </Dropdown>
      </ButtonGroup>
      <span className="sr-only">{copied ? 'Copied to clipboard' : ''}</span>
    </>
  )
}
