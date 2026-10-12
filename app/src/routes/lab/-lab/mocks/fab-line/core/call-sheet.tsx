/**
 * /lab's bottom chrome: the parts search and the call sheet (the build command and its setup), as floating panels on
 * a desktop and a peek sheet on a phone. The workspace has its own search and Install bar, so it never shows this.
 */
import { Button, Input, ScrollShadow, SearchField, TextField } from '@heroui/react'
import { Widget } from '@heroui-pro/react'
import { RiCheckLine, RiCloseLine, RiFileCopyLine, RiSearchLine } from '@remixicon/react'
import { motion } from 'motion/react'
import { useState } from 'react'
import type { ReactNode } from 'react'

import { useCopied } from '@/routes/workspace/-workspace/bar/bar.install'
import { Sheet } from '../../../kit/mobile'
import { play } from '../../../kit/sound'
import type { Lab } from '../../../lab.types'
import { Choice } from './controls'
import { reducedMotion } from './three'

/** Slides away while World settings is open and returns when it closes. */
function Aside({ hidden, children }: { hidden: boolean; children: ReactNode }) {
  return (
    <motion.div
      className="pointer-events-none absolute inset-0 z-20"
      initial={false}
      animate={hidden ? { opacity: 0, y: 24 } : { opacity: 1, y: 0 }}
      transition={reducedMotion ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 36 }}
      inert={hidden}
      data-aside={hidden ? 'hidden' : 'shown'}
    >
      {children}
    </motion.div>
  )
}

export function CallSheet({ lab, phone, hidden, aisle }: {
  lab: Lab
  phone: boolean
  /** World settings is open. */
  hidden: boolean
  /** The label of the aisle on the table, for the search's category chip. */
  aisle: string
}) {
  const [copied, markCopied] = useCopied(1400)
  const [open, setOpen] = useState(false)
  const count = lab.setup.items.length
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(lab.command)
    } catch {}
    play('copy')
    markCopied()
  }

  const copyButton = (
    <Button size="sm" onPress={copy}>
      {copied ? <RiCheckLine aria-hidden /> : <RiFileCopyLine aria-hidden />}
      {copied ? 'Copied' : 'Copy'}
    </Button>
  )
  const setupRow = (
    <div className="flex w-full flex-col gap-2">
      <div className="flex items-center gap-2">
        <Choice
          label="Target"
          value={lab.setup.target}
          options={[{ value: 'existing', label: 'Existing board' }, { value: 'new', label: 'New board' }] as const}
          onChange={(v) => lab.set('target', v)}
          className="flex-1"
        />
        {lab.setup.target === 'new' && (
          <TextField aria-label="Directory name" value={lab.setup.name} onChange={(v) => lab.set('name', v)} className="w-32 shrink-0">
            <Input variant="secondary" className="h-8 font-mono text-xs" spellCheck={false} />
          </TextField>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Choice
          label="Agent"
          value={lab.setup.agent}
          options={[{ value: 'none', label: 'No agent' }, { value: 'claude', label: 'Claude' }, { value: 'codex', label: 'Codex' }] as const}
          onChange={(v) => lab.set('agent', v)}
          className="flex-1"
        />
        {!phone && copyButton}
        <Button size="sm" variant="outline" isDisabled={!count} onPress={() => lab.clear()}>
          Wrap
        </Button>
      </div>
    </div>
  )
  const search = (
    <SearchField aria-label="Search parts" value={lab.focus.query} onChange={(query) => lab.setFocus({ query })} fullWidth>
      <SearchField.Group>
        <SearchField.SearchIcon>
          <RiSearchLine size={16} aria-hidden />
        </SearchField.SearchIcon>
        <SearchField.Input placeholder={`Search ${lab.catalog.items.length.toLocaleString()} parts`} />
        {lab.focus.query && <SearchField.ClearButton />}
        {lab.focus.category !== 'all' && (
          <Button size="sm" variant="secondary" onPress={() => lab.setFocus({ category: 'all' })} aria-label={`${aisle}, show all categories`} className="me-1 h-7 shrink-0 gap-1 rounded-full px-2.5 text-xs">
            {aisle}
            <RiCloseLine aria-hidden className="size-3.5" />
          </Button>
        )}
      </SearchField.Group>
    </SearchField>
  )
  const command = (
    <pre className="whitespace-pre-wrap p-3 font-mono text-[11px] leading-relaxed text-foreground [overflow-wrap:anywhere]">
      <span className="text-accent">$ </span>
      {lab.command}
    </pre>
  )
  const partsChip = (
    <span className="shrink-0 rounded-full bg-default px-2 py-0.5 font-mono text-xs tabular-nums text-foreground" data-count={count}>
      {String(count).padStart(2, '0')} parts
    </span>
  )

  return (
    <Aside hidden={hidden}>
      {phone ? (
        <Sheet
          label="Call sheet"
          open={open}
          onToggle={() => { play('tick'); setOpen(!open) }}
          peek={
            <>
              {partsChip}
              <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted">
                <span className="text-accent">$ </span>
                {lab.command}
              </span>
            </>
          }
          actions={copyButton}
        >
          <div className="flex flex-col gap-4">
            {search}
            <div className="overflow-hidden rounded-2xl bg-default">{command}</div>
            {setupRow}
          </div>
        </Sheet>
      ) : (
        <>
          <div className="pointer-events-auto absolute bottom-4 left-4 z-20 w-[300px] rounded-3xl shadow-overlay" data-scene-chrome>{search}</div>
          <Widget className="pointer-events-auto absolute bottom-4 right-20 z-20 w-[400px] border border-border bg-surface-secondary/90 shadow-overlay backdrop-blur" data-call-sheet data-scene-chrome>
            <Widget.Header className="min-h-11">
              <Widget.Title>Call sheet</Widget.Title>
              {partsChip}
            </Widget.Header>
            <Widget.Content className="bg-default p-0">
              <ScrollShadow className="max-h-[5.5em] overflow-y-auto">{command}</ScrollShadow>
            </Widget.Content>
            <Widget.Footer className="pt-1">{setupRow}</Widget.Footer>
          </Widget>
        </>
      )}
    </Aside>
  )
}
