/**
 * Fab line: cabinet, pick table, transport, rail arm and chip board as one
 * line along +x that the camera pans. Every station is a slot with a
 * registry of variants (fab-line/stations, chip, themes, fx; the contract is
 * fab-line/core/contract.ts and CONTRACT.md); World settings and the URL
 * (`?<slot>=<id>` for every slot in fab-line/world/slots.ts, plus installed mods' `<mod>.<variant>` ids) pick
 * one per slot and the line reflows. The picks and mods are saved per browser
 * (fab-line/world); URL picks win on load. A variant's component loads before
 * it is shown, so a pick never blanks the scene. The lab kit adds
 * sound, touch, a phone sheet, a DOM mirror with keyboard focus, and a demand
 * frame loop.
 */
import { cn } from '@heroui/react'
import { Canvas, useFrame } from '@react-three/fiber'
import { motion, useMotionValue, useMotionValueEvent, useTransform } from 'motion/react'
import { startTransition, useDeferredValue, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, WheelEvent as ReactWheelEvent } from 'react'
import { Vector3 } from 'three'

import { agents, databases, frameworks, packageManagers } from '../../../workspace/-workspace/workspace.constants'
import type { Setup } from '../../../workspace/-workspace/workspace.types'
import { FocusRing, Mirror, announce, parts, sceneFocusClass, useSceneKeys } from '../kit/a11y'
import { isTyping } from '../kit/env'
import { useViewport } from '../kit/mobile'
import { keepAnimating } from '../kit/busy'
import { FrameGovernor, PerfProbe, dprRange } from '../kit/perf'
import { hum, play, useSound } from '../kit/sound'
import { useSceneGestures } from '../kit/touch'
import type { Lab, MockProps } from '../lab.types'
import { Arm, Rail } from './fab-line/core/arm'
import { CallSheet } from './fab-line/core/call-sheet'
import { CameraDirector, createCam, goTo, orbitBy, panBy, panTo, zoomAt } from './fab-line/core/camera'
import type { View } from './fab-line/core/camera'
import type { ChipVariant, LineLayout, Part, PathLayout, Rig, SignalVariant, Sim, SwapVariant, Tip, Tokens } from './fab-line/core/contract'
import { DecapSync, Inspector, useFocus } from './fab-line/core/inspector'
import { frameInsets, useRoom } from './fab-line/core/insets'
import { preload } from './fab-line/core/lazy'
import { activeAisle, pagesOf } from './fab-line/core/pages'
import { Parts } from './fab-line/core/parts'
import { BoardFrame, StationFrame, useSimEvents } from './fab-line/core/scene'
import { applyPage, createSim, matchItem, setRig, simBusy, step } from './fab-line/core/sim'
import { Strip } from './fab-line/core/strip'
import { TipCard, useTip } from './fab-line/core/tip'
import { clamp, patch } from './fab-line/core/three'
import { TileFlip } from './fab-line/themes'
import { Slate, TransitionDriver, useThemeTransition } from './fab-line/themes/transition'
import { WorldSheet } from './fab-line/world/sheet'
import { BUILTIN, PICKED, SLOTS, componentsOf, pick, resolve, toolPick } from './fab-line/world/slots'
import type { Contribution, Lists, Picks, SlotKey } from './fab-line/world/slots'
import { useWorld } from './fab-line/world/store'

/** The names the address bar may give a slot's pick: its key, then older names still read so old links open as sent. */
const namesOf = (k: SlotKey) => [k, ...(SLOTS[k].aliases ?? [])]
/**
 * What the address bar names. It wins over the saved world, so a share link
 * opens as sent, and mirrors every pick made here because picks write the URL.
 */
function fromUrl(): { picks: Picks; own?: Picks | null } {
  const params = new URLSearchParams(location.search)
  const picks: Record<string, string> = {}
  for (const k of PICKED) {
    const id = namesOf(k).map((n) => params.get(n)).find(Boolean)
    if (id) picks[k] = id
  }
  return { picks }
}
const routed = (line: LineLayout): line is PathLayout => line.path !== null
/** Loads the components of every variant `picks` shows. */
const loadAll = (lists: Lists, picks: Picks) => {
  const chosen = resolve(lists, picks)
  return Promise.all(PICKED.map((k) => preload(chosen[k], componentsOf(k))))
}

/** The entry after `v` in `list`, wrapping; the first entry when `v` is not in it. */
const cycle = <T,>(list: readonly T[], v: T) => list[(list.indexOf(v) + 1) % list.length]

/** Substeps so a slow frame still advances the line in real time, up to a 0.3 s catch-up. Plays the line's events and announces seats. */
function Simulator({ sim, lab, root }: { sim: Sim; lab: { current: Lab }; root: { current: HTMLDivElement | null } }) {
  useFrame((_, dt) => {
    const total = Math.min(dt, 0.3)
    const n = Math.max(1, Math.ceil(total / 0.05))
    for (let i = 0; i < n; i++) step(sim, lab.current, total / n)
    if (simBusy(sim)) keepAnimating()
    const { transport } = sim.rig
    const level = (transport.kind === 'path' ? transport.hum ?? 0 : 0) * Math.min(1, (sim.carried.length + sim.feed.length + (sim.arm.holding ? 1 : 0)) / 3)
    hum(level)
    const shown = level.toFixed(2)
    if (root.current && root.current.dataset.hum !== shown) root.current.dataset.hum = shown
  })
  useSimEvents(sim, (e) => {
    if (e.kind === 'queue') play('pick')
    else if (e.kind === 'toss') play('toss')
    else if (e.kind === 'servo') play('servo')
    else if (e.kind === 'chirp') play('chirp')
    else if (e.kind === 'done') play('zap')
    else if (e.kind === 'seat') {
      play('seat')
      let seated = 0
      for (const p of sim.live) if (p.mode === 'seated') seated++
      announce(`${e.part.item.title} seated on the board, ${parts(seated)}`)
      if (root.current) root.current.dataset.seats = String(Number(root.current.dataset.seats ?? 0) + 1)
    }
  })
  return null
}

/** The board and its integrator, re-rendered from inside the Canvas whenever the sim's plan version moves. */
function Board({ lab, sim, c, rig, chip, swap, signals, cycle, tip, guard }: {
  lab: Lab; sim: Sim; c: Tokens; rig: Rig; chip: ChipVariant; swap: SwapVariant; signals: SignalVariant; cycle: { framework: () => void; database: () => void; pm: () => void; agent: () => void }; tip: Tip; guard: { moved: boolean }
}) {
  const [version, setVersion] = useState(sim.version)
  useFrame(() => { if (sim.version !== version) setVersion(sim.version) })
  const B = rig.board.Component
  const I = rig.integrator.Component
  return (
    <BoardFrame sim={sim}>
      <B key={rig.board.id} lab={lab} sim={sim} c={c} version={version} chip={chip} swap={swap} signals={signals} cycle={cycle} tip={tip} guard={guard} />
      <I key={rig.integrator.id} agent={lab.setup.agent} sim={sim} board={rig.board} c={c} onCycle={cycle.agent} tip={tip} guard={guard} />
    </BoardFrame>
  )
}

/**
 * Waits for the saved world, for its mods to load and for the components it
 * shows, before the line mounts, so the first frame is the browser's world
 * rather than the defaults. Once the world has loaded, a mod that never
 * settles holds the line 1.5 s at most. The defaults load from the start, in
 * case a picked mod goes away.
 */
export default function FabLine(props: MockProps) {
  const hydrated = useWorld((s) => s.hydrated)
  const settled = useWorld((s) => s.hydrated && s.mods.every((m) => m.status !== 'loading'))
  const [ready, setReady] = useState(false)
  useEffect(() => {
    void loadAll(BUILTIN, {})
  }, [])
  useEffect(() => {
    if (!hydrated) return
    let live = true
    const start = () => {
      const { lists, picks } = useWorld.getState()
      void loadAll(lists, { ...picks, ...fromUrl().picks }).finally(() => live && setReady(true))
    }
    if (settled) start()
    const id = setTimeout(start, 1500)
    return () => {
      live = false
      clearTimeout(id)
    }
  }, [hydrated, settled])
  return ready ? <Line {...props} /> : <div className="h-full w-full" data-fab-waiting />
}

function Line({ lab }: MockProps) {
  const labRef = useRef(lab)
  useLayoutEffect(() => {
    labRef.current = lab
  })
  const embedded = lab.chrome === 'embedded'
  const saved = useWorld((s) => s.picks)
  const lists = useWorld((s) => s.lists)
  // Toggle tools that are on, for this visit only; their picked variants are saved.
  const [toggled, setToggled] = useState<ReadonlySet<string>>(() => new Set())
  const [url, setUrl] = useState(fromUrl)
  const picks = { ...saved, ...url.picks }
  const chosen = resolve(lists, picks)
  const ids = Object.fromEntries(PICKED.map((k) => [k, chosen[k].id]))
  const follow = chosen.follow.id
  const picked: Rig = { layout: chosen.layout, cabinet: chosen.cabinet, table: chosen.table, transport: chosen.transport, board: chosen.board, integrator: chosen.integrator }
  const { chip, fx, swap, tools } = chosen
  const views = tools.filter((t) => t.kind === 'view')
  const transition = useThemeTransition(lists.theme, chosen.theme.id, lab.theme)
  const { theme, look } = transition
  const [sim] = useState(() => createSim(lab, picked))
  // The line follows the picks during render, so stations never draw against a stale layout. `sim.rig` and `sim.line`
  // change only when a picked entry does, which keys everything downstream; a list that grows (a mod loading) keeps both.
  setRig(sim, picked)
  const { rig, line } = sim
  const { table, transport } = rig
  const [cam] = useState(createCam)
  const vp = useViewport()
  const phone = vp.phone
  const [settings, setSettings] = useState(false)
  const sheetHeight = useMotionValue(0)
  const gear = useRef<HTMLButtonElement>(null)
  const [viewKey, setViewKey] = useState<string>('overview')
  const [focus, setFocus] = useFocus(cam)
  const [warm, setWarm] = useState(false)
  const [tipRef, tip] = useTip()
  const root = useRef<HTMLDivElement>(null)
  useSound()
  const toolbar = useRef<HTMLDivElement>(null)
  // The chrome over the scene, measured: the camera frames clear of it and the toolbar rests above what sits under it.
  const { chrome, rest } = useRoom(root, toolbar)
  const frame = frameInsets(chrome)
  // The camera lifts the picture by part of the open sheet's height, following the sheet's spring.
  useLayoutEffect(() => {
    patch(cam, { follow, lens: theme.lens, insets: frame, sheet: sheetHeight.get() })
  })
  useMotionValueEvent(sheetHeight, 'change', (h) => patch(cam, { sheet: h }))
  const toolbarBottom = useMotionValue(rest)
  const toolbarOpacity = useMotionValue(1)
  const toolbarEvents = useTransform(toolbarOpacity, (o) => (o > 0.5 ? 'auto' : 'none'))
  // The toolbar rides 12px above the open sheet. Where the sheet leaves it no room under the header (a phone at the Mods
  // snap) it stops at the header and fades out; the sheet keeps its own close button. It is placed after every commit,
  // since a pick can change its height, and whenever the sheet moves.
  const placeToolbar = () => {
    const room = Math.max(rest, (root.current?.clientHeight ?? Infinity) - chrome.top - (toolbar.current?.offsetHeight ?? 0))
    const want = Math.max(rest, sheetHeight.get() + 12)
    toolbarBottom.set(Math.min(want, room))
    toolbarOpacity.set(clamp(1 - (want - room) / 24, 0, 1))
  }
  useLayoutEffect(placeToolbar)
  useMotionValueEvent(sheetHeight, 'change', placeToolbar)
  const onSheetChange = lab.onSheetChange
  useEffect(() => {
    if (!onSheetChange) return
    onSheetChange(settings)
    return () => onSheetChange(false)
  }, [onSheetChange, settings])

  useEffect(() => {
    const id = requestAnimationFrame(() => setWarm(true))
    return () => cancelAnimationFrame(id)
  }, [])

  const applyMod = (adds: Contribution) => void choose(Object.fromEntries(PICKED.flatMap((k) => (adds[k]?.length ? [[k, adds[k][0].id]] : []))))
  const writeUrl = (edit: (params: URLSearchParams) => void) => {
    if (embedded) return
    const next = new URL(location.href)
    edit(next.searchParams)
    history.replaceState(history.state, '', next)
  }
  // A pick renders in a transition, and the store saves it once it commits, so the store's update cannot force the rebuild to render synchronously.
  // `own` holds the picks made here, as opposed to a share link's, which are shown but not saved; null is a reset. Saving in commit order keeps a reset after the picks before it.
  useEffect(() => {
    if (url.own === null) useWorld.reset()
    else for (const [slot, id] of Object.entries(url.own ?? {})) useWorld.setPick(slot, id)
  }, [url.own])
  // Picks load their variants' components first; the sheet's transition stays pending meanwhile, so its card spins.
  // The latest choice wins, whichever variant loads first.
  const latest = useRef(0)
  const choose = async (next: Picks) => {
    const run = ++latest.current
    const now = useWorld.getState().lists
    await Promise.all(Object.entries(next).map(([k, id]) => preload(pick<object & { id: string }>(now[k as SlotKey], id), componentsOf(k as SlotKey))))
    if (run !== latest.current) return
    startTransition(() => setUrl((u) => ({ ...u, picks: { ...u.picks, ...next }, own: { ...u.own, ...next } })))
    writeUrl((p) => {
      for (const [k, id] of Object.entries(next)) {
        namesOf(k as SlotKey).forEach((n) => p.delete(n))
        p.set(k, id)
      }
    })
  }
  const resetWorld = async () => {
    const run = ++latest.current
    await loadAll(lists, {})
    if (run !== latest.current) return
    startTransition(() => setUrl({ picks: {}, own: null }))
    writeUrl((p) => PICKED.flatMap(namesOf).forEach((n) => p.delete(n)))
  }

  const aisles = lab.warehouse.aisles
  // Matching filters every bin; the deferred query lets typing stay ahead of the re-paging table.
  const query = useDeferredValue(lab.focus.query).trim()
  const matches = query ? aisles.map((a) => a.racks.reduce((n, r) => n + r.bins.filter((b) => matchItem(b.item, query)).length, 0)) : null
  const active = activeAisle(aisles, lab.focus.category, matches)
  const pages = pagesOf(aisles[active], table, query, sim)
  const [pageState, setPage] = useState({ key: '', page: 0 })
  const pageKey = `${active}|${query}|${table.id}`
  const page = pageState.key === pageKey ? Math.min(pageState.page, pages.length - 1) : 0
  useLayoutEffect(() => applyPage(sim, pages[page].parts), [sim, pages, page])
  const turnPage = (n: number) => {
    if (pages.length < 2) return
    play('page')
    setPage({ key: pageKey, page: ((n % pages.length) + pages.length) % pages.length })
  }

  useEffect(() => {
    if (lab.focus.category !== 'all') patch(cam, { aisleUntil: sim.time + 2.8 })
  }, [lab.focus.category, cam, sim])

  const codeOf = (ref: string) => lab.warehouse.bins.get(ref)?.code ?? 'X00-00-0A'
  const closeFocus = () => setFocus(null)
  const onFocus = (ref: string) => {
    patch(cam, { manual: false })
    setFocus({ ref, decap: false })
  }
  const toggleDecap = () => {
    if (focus) setFocus({ ...focus, decap: !cam.decap })
  }
  useEffect(() => {
    if (focus && !lab.selected.has(focus.ref) && sim.parts.get(focus.ref)?.mode === 'seated') closeFocus()
  }, [lab.selected, focus, closeFocus, sim])

  const show = (to: string, view: View) => {
    goTo(cam, view)
    setViewKey(to)
  }
  const toOverview = () => show('overview', { kind: 'overview' })
  const go = (to: string, variant?: string | null) => {
    play('tick')
    closeFocus()
    const tool = views.find((t) => t.id === to)
    if (tool && variant) useWorld.setPick(to, variant)
    show(to, tool?.kind === 'view' ? { kind: 'mod', tool, variant: variant ?? toolPick(tool, picks), since: performance.now() } : to === 'overview' ? { kind: 'overview' } : { kind: 'stop', id: to })
  }
  const toggle = (id: string, on: boolean, variant: string | null) => {
    play('tick')
    if (on && variant) useWorld.setPick(id, variant)
    setToggled((s) => new Set([...s].filter((k) => k !== id).concat(on ? [id] : [])))
  }
  // A stop or view tool that is gone (a layout without the station, a mod switched off, removed or broken) falls back to
  // the overview, and a gone toggle is off; a mod that loaded again hands its fresh view to the camera.
  useEffect(() => {
    const v = cam.view
    const fresh = v.kind === 'mod' ? views.find((t) => t.id === v.tool.id) : undefined
    if (fresh?.kind === 'view' && v.kind === 'mod') patch(v, { tool: fresh })
    else if ((v.kind === 'stop' && !line.stops.some((s) => s.id === v.id)) || v.kind === 'mod') toOverview()
    setToggled((s) => ([...s].every((id) => tools.some((t) => t.id === id)) ? s : new Set([...s].filter((id) => tools.some((t) => t.id === id)))))
  }, [line, cam, views, tools])
  // Keys number the stops, then every view tool, including those behind More.
  const stopOrder = ['overview', ...line.stops.map((s) => s.id), ...views.map((v) => v.id)]
  const viewIndex = (v: View) => {
    if (v.kind === 'overview') return 0
    if (v.kind === 'stop') return Math.max(0, stopOrder.indexOf(v.id))
    if (v.kind === 'mod') return Math.max(0, stopOrder.indexOf(v.tool.id))
    const x = v.look.x
    let best = 1, d = Infinity
    line.stops.forEach((s, i) => {
      const m = Math.abs((s.span.x0 + s.span.x1) / 2 - x)
      if (m < d) { d = m; best = i + 1 }
    })
    return best
  }
  const freed = () => {
    if (cam.view.kind === 'free') setViewKey('free')
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === 'w') void choose({ theme: cycle(lists.theme.map((w) => w.id), chosen.theme.id) })
      if (e.key === 'f') void choose({ follow: cycle(lists.follow.map((f) => f.id), follow) })
      if (e.key === 'Escape') closeFocus()
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        const at = viewIndex(cam.view)
        const next = clamp(at + (e.key === 'ArrowRight' ? 1 : -1), 0, stopOrder.length - 1)
        if (next !== at || cam.view.kind === 'free') go(stopOrder[next])
      }
      if (/^[0-9]$/.test(e.key) && Number(e.key) < stopOrder.length) go(stopOrder[Number(e.key)])
      if (e.key === 'PageDown') turnPage(page + 1)
      if (e.key === 'PageUp') turnPage(page - 1)
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  })

  // Map controls: drag moves the campus, right-drag, Alt-drag, Shift-drag or two fingers orbit, wheel and pinch zoom toward the pointer.
  const { guard, props: gestures } = useSceneGestures({
    onInteract: () => patch(cam, { touched: sim.time }),
    onOrbit: (dx, dy, e) => {
      if (e.pointerType === 'mouse' && (e.buttons & 2 || e.altKey)) orbitBy(cam, dx, dy)
      else panBy(cam, sim, dx, dy)
      freed()
    },
    onPan: (dx, dy) => {
      orbitBy(cam, dx, dy)
      freed()
    },
    onZoom: (f, x, y) => {
      zoomAt(cam, sim, f, x, y)
      freed()
    },
    onLongPress: () => {
      const ref = cam.pressed ?? cam.hovered
      if (ref) {
        tip.hide()
        onFocus(ref)
      }
    },
    onReset: toOverview,
  })
  const onWheel = (e: ReactWheelEvent<HTMLDivElement>) => {
    const sideways = Math.abs(e.deltaX) > Math.abs(e.deltaY)
    if (!sideways && !e.shiftKey) return gestures.onWheel(e)
    patch(cam, { touched: sim.time })
    if (sideways) panBy(cam, sim, -e.deltaX, -e.deltaY)
    else panBy(cam, sim, -e.deltaY, 0)
    freed()
  }
  const keys = useSceneKeys({
    lab,
    label: 'Fab line scene',
    items: () => {
      const onTable = pages[page].parts.filter((p): p is Part => !!p).map((p) => p.item.ref)
      const seen = new Set(onTable)
      return [...onTable, ...lab.setup.items.filter((r) => !seen.has(r))]
    },
    cols: table.cols,
    onFocusItem: (ref) => {
      const p = sim.parts.get(ref)
      if (!p || !p.visible) return
      if (p.pos.x < cam.visible.x0 + 1 || p.pos.x > cam.visible.x1 - 1) {
        if (cam.view.kind === 'free') panTo(cam, sim, p.pos.x)
        else go(p.mode === 'seated' ? 'board' : 'table')
      }
    },
  })
  const onSceneKey = (e: ReactKeyboardEvent<HTMLElement>) => {
    if (e.key === 'i' && keys.focusRef.current) onFocus(keys.focusRef.current)
    keys.props.onKeyDown(e)
  }
  const locate = (ref: string, out: Vector3) => {
    const p = sim.parts.get(ref)
    if (!p || !p.visible) return 0
    out.copy(p.pos)
    out.y += 0.03
    return Math.max(p.spec.fw, p.spec.fd) * p.scale * 0.8 + 0.12
  }

  const nextSetup = <K extends 'framework' | 'database' | 'packageManager' | 'agent'>(key: K, options: readonly { value: Setup[K] }[]) => () => {
    play('swap')
    lab.set(key, cycle(options.map((o) => o.value), lab.setup[key]))
  }
  const cycleSetup = {
    framework: nextSetup('framework', frameworks),
    database: nextSetup('database', databases),
    pm: nextSetup('packageManager', packageManagers),
    agent: nextSetup('agent', agents),
  }
  const count = lab.setup.items.length
  const C = rig.cabinet.Component
  const T = rig.table.Component
  const Stage = theme.Stage
  const Fx = fx.Component
  const liveTool = (id: string, kind: 'view' | 'toggle') => (kind === 'view' ? id === viewKey : toggled.has(id))
  const entries = tools.map((t) => ({ ...t, picked: toolPick(t, picks), live: liveTool(t.id, t.kind) }))
  // A chip close-up takes the camera from a view tool, so its overlay steps aside too.
  const overlays = entries.filter((t) => t.Overlay && t.live && !(t.kind === 'view' && focus))

  return (
    <div
      ref={root}
      className="relative h-full w-full select-none overflow-hidden"
      style={{ background: look.bg, '--scene-fade': `${frame.top}px` } as CSSProperties}
      data-fab
      data-world={transition.shown}
      data-follow={follow}
      data-count={count}
      data-slots={PICKED.map((k) => `${k}=${ids[k]}`).join('&')}
      data-view={viewKey}
    >
      <div
        className={cn('absolute inset-0', sceneFocusClass)}
        {...gestures}
        onWheel={onWheel}
        onContextMenu={(e) => e.preventDefault()}
        {...keys.props}
        onKeyDown={onSceneKey}
      >
        <Canvas dpr={dprRange()} camera={{ fov: 20, near: 0.2, far: 600, position: [30, 20, 30] }} onPointerMissed={() => tip.hide()}>
          <FrameGovernor />
          <PerfProbe />
          <Simulator sim={sim} lab={labRef} root={root} />
          <CameraDirector sim={sim} cam={cam} root={root} onAdd={closeFocus} />
          <DecapSync cam={cam} focus={focus} onChange={setFocus} />
          <TransitionDriver trRef={transition.trRef} powerRef={transition.powerRef} overlayRef={transition.overlayRef} onSwap={transition.onSwap} onEnd={transition.onEnd} />
          <Stage key={transition.shown} c={look} mode={lab.theme} sim={sim} power={transition.powerRef} cam={cam} line={line} />
          {rig.layout.Scenery && <rig.layout.Scenery key={rig.layout.id} c={look} mode={lab.theme} sim={sim} line={line} cam={cam} />}
          <StationFrame sim={sim} slot="pick">
            <C key={rig.cabinet.id} sim={sim} aisles={aisles} active={active} matches={matches} onOpen={(i) => { play('drawer'); lab.setFocus({ category: aisles[i].id }) }} c={look} tip={tip} guard={guard} />
            <T key={rig.table.id} sim={sim} c={look} slots={pages[page].slots} label={pages[page].label} pages={pages.length} page={page} setPage={turnPage} tip={tip} guard={guard} />
          </StationFrame>
          {transport.kind === 'path' && routed(line) && (
            <StationFrame sim={sim} slot="transport">
              <transport.Component key={transport.id} sim={sim} line={line} c={look} tip={tip} guard={guard} />
            </StationFrame>
          )}
          <Rail sim={sim} line={line} c={look} />
          <Arm sim={sim} line={line} c={look} />
          <Board lab={lab} sim={sim} c={look} rig={rig} chip={chip} swap={swap} signals={chosen.signals} cycle={cycleSetup} tip={tip} guard={guard} />
          {warm && <Parts sim={sim} chip={chip} lab={lab} c={look} tip={tip} guard={guard} cam={cam} codeOf={codeOf} onFocus={onFocus} />}
          <FocusRing focus={keys.focusRef} locate={locate} color={look.accent} />
          <TileFlip tr={transition.trRef} line={line} />
          {Fx && <Fx key={fx.id} c={look} mode={lab.theme} sim={sim} />}
          {entries.map(({ id, Scenery, live, picked }) => Scenery && <Scenery key={id} c={look} mode={lab.theme} sim={sim} line={line} live={live} variant={picked} />)}
        </Canvas>
      </div>

      {overlays.map(({ id, Overlay, picked }) => Overlay && <Overlay key={id} sim={sim} c={look} mode={lab.theme} top={frame.top} variant={picked} />)}
      <Slate overlayRef={transition.overlayRef} slate={transition.slate} />

      <motion.div
        ref={toolbar}
        className={cn('absolute z-40', phone ? 'left-3' : 'left-4')}
        style={{ bottom: toolbarBottom, opacity: toolbarOpacity, pointerEvents: toolbarEvents }}
        data-scene-chrome
      >
        <Strip line={line} tools={entries} order={stopOrder} active={viewKey} onGo={go} onToggle={toggle} settings={settings} onSettings={setSettings} settingsRef={gear} />
      </motion.div>
      <WorldSheet
        open={settings}
        onOpenChange={setSettings}
        height={sheetHeight}
        mode={lab.theme}
        choices={ids}
        onChoose={(slot, id) => choose({ [slot]: id })}
        onReset={resetWorld}
        onApplyMod={applyMod}
        returnFocus={gear}
      />

      {focus && <Inspector lab={lab} focus={focus} part={sim.parts.get(focus.ref)} code={codeOf(focus.ref)} phone={phone} chrome={chrome} onDecap={toggleDecap} onClose={closeFocus} />}
      {!embedded && <CallSheet lab={lab} phone={phone} hidden={settings} aisle={aisles[active].label} />}
      <TipCard ref={tipRef} />
      <Mirror lab={lab} title="Fab line" />
    </div>
  )
}
