import { useFrame, useThree } from '@react-three/fiber'
import type { ThreeEvent } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Color, Euler, Quaternion, Vector3 } from 'three'
import type { Group, Matrix4 } from 'three'

import { keepAnimating } from '@/routes/lab/-lab/kit/busy'
import type { Lab } from '@/routes/lab/-lab/lab.types'
import { ChipBatchGpu } from './batch'
import type { BatchEntry, BatchLook } from './batch'
import type { ChipCam, ChipVariant, Part, Sim, Tip, Tokens } from './contract'
import { matchItem } from './sim'
import { patch } from './three'

/** Milliseconds a frame may spend painting new lid prints; the rest paint on the following frames. */
const PAINT_BUDGET = 4

type PickEvent = ThreeEvent<PointerEvent> | ThreeEvent<MouseEvent>
/** Pointer handlers by entry index; the batch resolves `instanceId` to the entry. */
type BatchPick = {
  over: (i: number, e: ThreeEvent<PointerEvent>) => void
  move: (e: ThreeEvent<PointerEvent>) => void
  out: () => void
  down: (i: number) => void
  click: (i: number, e: ThreeEvent<MouseEvent>) => void
}

/**
 * Packages drawn by a chip variant in one fill, one hairline and one print draw, plus one outline draw while any
 * `ringOf` color is set. `pose` places entry `i` each frame (false hides it); `pick` makes the footprints pickable.
 */
export function ChipBatch({ chip, entries, look, print, pose, ringOf, pick }: {
  chip: ChipVariant
  entries: readonly BatchEntry[]
  look: BatchLook
  print: { body: string; ink: string }
  pose: (i: number, out: Matrix4) => boolean
  ringOf?: (i: number, out: Color) => boolean
  pick?: BatchPick
}) {
  const gl = useThree((s) => s.gl)
  const [gpu] = useState(() => new ChipBatchGpu())
  useEffect(() => () => gpu.dispose(), [gpu])
  useLayoutEffect(() => gpu.setLook(look), [gpu, look])
  useLayoutEffect(() => gpu.setEntries(chip, entries, print, gl.capabilities.maxTextureSize), [gpu, chip, entries, print, gl])
  useFrame(() => {
    if (gpu.frame(gl, pose, PAINT_BUDGET, ringOf)) keepAnimating()
  })
  const at = (e: PickEvent) => (e.instanceId !== undefined && e.instanceId < gpu.count ? e.instanceId : null)
  return (
    <>
      <primitive object={gpu.root} />
      {pick && (
        <primitive
          object={gpu.hit}
          onClick={(e: ThreeEvent<MouseEvent>) => {
            const i = at(e)
            if (i !== null) pick.click(i, e)
          }}
          onPointerDown={(e: ThreeEvent<PointerEvent>) => {
            const i = at(e)
            if (i !== null) pick.down(i)
          }}
          onPointerOver={(e: ThreeEvent<PointerEvent>) => {
            const i = at(e)
            if (i !== null) pick.over(i, e)
          }}
          onPointerMove={pick.move}
          onPointerOut={pick.out}
        />
      )}
    </>
  )
}

const scratch = { q: new Quaternion(), e: new Euler(), s: new Vector3() }
/** A live part's pose: at `pos`, tumbling by `spin`, scaled by `scale`. */
function posePart(p: Part, out: Matrix4) {
  scratch.e.set(p.spin * 0.35, p.spin, 0)
  return out.compose(p.pos, scratch.q.setFromEuler(scratch.e), scratch.s.setScalar(Math.max(0.001, p.scale)))
}

const ringInks = new WeakMap<Tokens, { codex: Color; claude: Color; accent: Color }>()
/** The ring's colors as three.js colors, parsed once per token set instead of every frame. */
function ringInk(c: Tokens) {
  let ink = ringInks.get(c)
  if (!ink) {
    ink = { codex: new Color(c.codexInk), claude: new Color(c.claude), accent: new Color(c.accent) }
    ringInks.set(c, ink)
  }
  return ink
}

type PartsProps = {
  sim: Sim
  chip: ChipVariant
  lab: Lab
  c: Tokens
  tip: Tip
  guard: { moved: boolean }
  cam: ChipCam
  codeOf: (ref: string) => string
  onFocus: (ref: string) => void
}

/**
 * Every live part as one chip batch, with hover and focus rings, tooltips, clicks, and the chosen variant's close-up
 * on the focused seated chip. `sim.live` is one Set edited in place, so the list is snapshotted into state on
 * `liveVersion`: a compiled render keyed on the Set itself would never see new parts.
 */
export function Parts({ sim, chip, lab, c, tip, guard, cam, codeOf, onFocus }: PartsProps) {
  const [live, setLive] = useState(() => ({ version: sim.liveVersion, parts: [...sim.live] }))
  const [closeUp, setCloseUp] = useState<Part | null>(null)
  const hideRef = useRef(false)
  useFrame(() => {
    if (sim.liveVersion !== live.version) setLive({ version: sim.liveVersion, parts: [...sim.live] })
    const focused = cam.focusRef ? sim.parts.get(cam.focusRef) : undefined
    const want = focused && focused.live && focused.mode === 'seated' ? focused : null
    if (want !== closeUp) setCloseUp(want)
  })
  useEffect(() => {
    hideRef.current = false
  }, [closeUp])

  const parts = live.parts
  // Only the live set moves the packing: a new entries array repacks every vertex.
  const entries = parts.map((p): BatchEntry => ({ key: p.item.ref, item: p.item, code: p.code, spec: p.spec }))
  const look: BatchLook = { flat: c.flat, opacity: 1, body: c.body, pin: c.pin, edge: c.bodyEdge, edgeOpacity: 1 }
  const print = { body: c.body, ink: c.ink }
  const query = lab.focus.query.trim()
  const found = new Set(query ? parts.filter((p) => matchItem(p.item, query)).map((p) => p.item.ref) : [])
  const agent = lab.setup.agent

  const pose = (i: number, out: Matrix4) => {
    const p = parts[i]
    if (p === closeUp && hideRef.current) return false
    posePart(p, out)
    return true
  }
  const ringOf = (i: number, out: Color) => {
    const p = parts[i]
    const ref = p.item.ref
    const close = p.mode === 'seated' && cam.focusRef === ref
    const hot = cam.hovered === ref || (cam.focusRef === ref && !close) || p.mode === 'held' || p.mode === 'queued'
    const match = p.mode === 'seated' && found.has(ref)
    if (!hot && !match && p.flash <= 0) return false
    const ink = ringInk(c)
    out.copy(p.flash > 0 ? (agent === 'codex' ? ink.codex : ink.claude) : ink.accent)
    return true
  }
  const pick: BatchPick = {
    click: (i, e) => {
      e.stopPropagation()
      if (guard.moved) return
      tip.hide()
      const p = parts[i]
      if (p === closeUp) return
      if (p.mode === 'seated') onFocus(p.item.ref)
      else lab.toggle(p.item.ref)
    },
    down: (i) => patch(cam, { pressed: parts[i].item.ref }),
    over: (i, e) => {
      e.stopPropagation()
      const p = parts[i]
      patch(cam, { hovered: p.item.ref })
      if (p === closeUp) return
      const image = lab.theme === 'dark' ? (p.item.imageDark ?? p.item.image) : p.item.image
      const hint = p.mode === 'seated' ? 'click to inspect' : lab.selected.has(p.item.ref) ? 'click to send back' : 'click to build'
      tip.show(e.nativeEvent, p.item.title, `${p.item.label} · ${codeOf(p.item.ref)} · ${hint}`, image)
    },
    move: (e) => tip.move(e.nativeEvent),
    out: () => {
      patch(cam, { hovered: null })
      tip.hide()
    },
  }

  const CloseUp = chip.CloseUp
  return (
    <>
      <ChipBatch chip={chip} entries={entries} look={look} print={print} pose={pose} ringOf={ringOf} pick={pick} />
      {closeUp && (
        <FollowPart p={closeUp}>
          <CloseUp key={closeUp.item.ref} p={closeUp} lab={lab} c={c} cam={cam} code={codeOf(closeUp.item.ref)} hideRef={hideRef} />
        </FollowPart>
      )}
    </>
  )
}

/** A group riding a live part's pose, for what the part shows in its own frame. */
function FollowPart({ p, children }: { p: Part; children: ReactNode }) {
  const g = useRef<Group>(null)
  useFrame(() => {
    if (g.current) posePart(p, g.current.matrix)
  })
  return <group ref={g} matrixAutoUpdate={false}>{children}</group>
}
