/** The details card for one part, and the close-up it holds the camera on while it is open. */
import { Button, Card, CloseButton, cn, ToggleButton } from '@heroui/react'
import { useFrame } from '@react-three/fiber'
import { useState } from 'react'

import type { Lab } from '../../../lab.types'
import type { Cam } from './camera'
import type { Part } from './contract'
import type { Insets } from './insets'
import { PKG_NAME } from './spec'
import { patch } from './three'

/** The inspected part's ref, and whether its close-up has the lid off. */
export type Focus = { ref: string; decap: boolean }

/** The inspected part. Setting it moves the camera's close-up with it, in one place. */
export function useFocus(cam: Cam) {
  const [focus, setState] = useState<Focus | null>(null)
  const setFocus = (next: Focus | null) => {
    patch(cam, { focusRef: next?.ref ?? null, decap: next?.decap ?? false })
    setState(next)
  }
  return [focus, setFocus] as const
}

/** The close-up lifts and drops the lid itself as the user zooms; this hands its choice back to the card's toggle. */
export function DecapSync({ cam, focus, onChange }: { cam: Cam; focus: Focus | null; onChange: (focus: Focus) => void }) {
  useFrame(() => {
    if (focus && cam.focusRef === focus.ref && cam.decap !== focus.decap) onChange({ ...focus, decap: cam.decap })
  })
  return null
}

/** The card sits under the header at the scene's right, clear of the chrome; a phone spans it across. */
export function Inspector({ lab, focus, part, code, phone, chrome, onDecap, onClose }: {
  lab: Lab
  focus: Focus
  part: Part | undefined
  code: string
  phone: boolean
  /** The measured chrome over the scene. */
  chrome: Insets
  onDecap: () => void
  onClose: () => void
}) {
  const item = lab.catalog.items.find((i) => i.ref === focus.ref)
  if (!item) return null
  return (
    <Card
      className={cn(
        'pointer-events-auto absolute z-30 gap-3 border border-border bg-overlay/95 p-4 shadow-overlay backdrop-blur',
        phone ? 'left-3 right-3' : 'w-[300px]',
      )}
      style={{ top: chrome.top + 12, right: phone ? undefined : chrome.right + 16 }}
      data-inspector
      role="dialog"
      aria-label={`${item.title} details`}
    >
      <Card.Header className="flex-row items-start justify-between gap-2">
        <div className="min-w-0">
          <Card.Title className="truncate">{item.title}</Card.Title>
          <Card.Description className="font-mono text-xs">
            {code} · {part ? PKG_NAME[part.spec.pkg] : ''} · {item.label}
          </Card.Description>
        </div>
        <CloseButton aria-label="Close details" onPress={onClose} className="-me-1 -mt-1 shrink-0" />
      </Card.Header>
      <Card.Content>
        <p className="line-clamp-3 text-xs leading-relaxed text-muted">{item.description}</p>
      </Card.Content>
      <Card.Footer className="flex-wrap gap-2">
        {part?.mode === 'seated' ? (
          <>
            <ToggleButton size="sm" isSelected={focus.decap} onChange={onDecap}>
              {focus.decap ? 'Re-lid chip' : 'Decap the die'}
            </ToggleButton>
            <Button size="sm" variant="outline" onPress={() => { lab.toggle(item.ref); onClose() }}>
              Desolder
            </Button>
          </>
        ) : (
          <Button size="sm" onPress={() => { lab.toggle(item.ref); onClose() }}>
            {lab.selected.has(item.ref) ? 'Send it back' : 'Build it'}
          </Button>
        )}
        {lab.inspect && (
          <Button size="sm" variant="ghost" onPress={() => lab.inspect?.(item.ref)}>
            Details
          </Button>
        )}
      </Card.Footer>
    </Card>
  )
}
