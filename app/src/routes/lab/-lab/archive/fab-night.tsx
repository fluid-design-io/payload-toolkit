/**
 * Fab night shift: the combined line (cabinet, belt, arm, chip board) as a
 * cinematic showpiece. Two worlds (Night shift, Cleanroom fab), a shot-list
 * camera per journey stage, Trailer mode with letterbox and slate, and a
 * first-run power-up that plays once on an empty build and skips on any input.
 * Frames are drawn on demand: the scene goes fully still once nothing moves.
 */
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Vector3 } from 'three'
import type { Group, PerspectiveCamera } from 'three'

import { FocusRing, Mirror, announce, sceneFocusClass, useSceneKeys } from '../kit/a11y'
import { useViewport } from '../kit/mobile'
import { dprRange } from '../kit/perf'
import { hum, play, useSound } from '../kit/sound'
import type { SoundName } from '../kit/sound'
import { useSceneGestures } from '../kit/touch'
import type { Lab, MockProps } from '../lab.types'
import { Board } from './fab-night/kit/board'
import { REDUCED_MOTION, createEnergy, isPhone } from './fab-night/kit/contract'
import type { WorldId } from './fab-night/kit/contract'
import { Arm, Belt, Cabinet, Drone, Parts, Static, Table, useBoardPaging } from './fab-night/kit/factory'
import type { Tip } from './fab-night/kit/factory'
import { MIRROR_SKIP } from './fab-night/kit/lamps'
import { driveDimmer, drivePowerUp, powerLabel } from './fab-night/kit/power'
import type { PowerUp } from './fab-night/kit/power'
import { camPending, createCam, hudText, runCamera } from './fab-night/kit/shots'
import type { Cam, Follow, Inset, Rig } from './fab-night/kit/shots'
import { PAD_COLS, createSim, isBusy, step, wake } from './fab-night/kit/sim'
import type { Part, Sim, SimEvent } from './fab-night/kit/sim'
import { WORLDS, WorldStage, lookOf } from './fab-night/kit/worlds'

const params = new URLSearchParams(location.search)
const DEFAULT = {
  world: (params.get('world') ?? 'night') as WorldId,
  rig: (params.get('rig') ?? 'iso') as Rig,
  follow: (params.get('follow') ?? 'shots') as Follow,
  power: params.get('power') !== 'off',
}
const RIGS: readonly { value: Rig; label: string }[] = [
  { value: 'iso', label: 'Iso' },
  { value: 'trailer', label: 'Trailer' },
]
const FOLLOWS: readonly { value: Follow; label: string }[] = [
  { value: 'off', label: 'Off' },
  { value: 'shots', label: 'Shot list' },
]
const BASE_WRIST = [2.6, 3.6, 0.6] as const
const TAGLINES = ['IN A WORLD', 'THIS SEASON', 'ONE BLOCK', 'AGAINST ALL ODDS', 'NO COMPROMISES', 'COMING SOON', 'ONE MORE THING']
/** Phones and tablets render at most 1.5x for battery; the loop lowers it further when busy frames sag. */
const DPR_CAP = Math.min(devicePixelRatio || 1, dprRange()[1])
/** The workspace's Install bar floats about 110px tall at the bottom centre of the embedded panel. */
const BAR_CLEAR = 120
/** Phones get the power-up as a three second sting instead of eight. */
const PHONE_POWER_SPEED = 2.6
/** The voice for each thing the sim reports. Camera moves and shot cuts stay silent. */
const VOICE: Record<SimEvent['kind'], SoundName> = { pick: 'pick', seat: 'seat', return: 'toss', probe: 'zap', job: 'servo' }
const FOCUS_STYLE = 'focus-visible:outline-2 focus-visible:outline-accent'

type PinTip = Tip & { pin: (x: number, y: number, title: string, sub: string) => void }

function useTip() {
  const ref = useRef<HTMLDivElement>(null)
  const api = useMemo<PinTip>(() => {
    let pinned = 0
    const place = (x: number, y: number) => {
      const el = ref.current
      if (!el) return
      el.style.transform = `translate(${Math.max(8, Math.min(x + 14, innerWidth - el.offsetWidth - 8))}px, ${Math.max(8, Math.min(y + 14, innerHeight - el.offsetHeight - 8))}px)`
    }
    const fill = (title: string, sub: string) => {
      const el = ref.current
      if (!el) return
      el.children[0].textContent = title
      el.children[1].textContent = sub
      el.style.opacity = '1'
    }
    return {
      show: (e, title, sub) => {
        if (e.pointerType === 'touch') return
        clearTimeout(pinned)
        fill(title, sub)
        document.body.style.cursor = 'pointer'
        place(e.clientX, e.clientY)
      },
      move: (e) => {
        if (e.pointerType !== 'touch') place(e.clientX, e.clientY)
      },
      hide: () => {
        if (ref.current) ref.current.style.opacity = '0'
        document.body.style.cursor = ''
      },
      pin: (x, y, title, sub) => {
        fill(title, sub)
        place(x, y - 90)
        clearTimeout(pinned)
        pinned = window.setTimeout(() => {
          if (ref.current) ref.current.style.opacity = '0'
        }, 2600)
      },
    }
  }, [])
  return [ref, api] as const
}

type LoopProps = {
  sim: Sim
  cam: Cam
  lab: { current: Lab }
  root: { current: HTMLDivElement | null }
  hud: { current: HTMLDivElement | null }
  overlay: { current: HTMLDivElement | null }
  status: { current: HTMLSpanElement | null }
  onEvent: { current: (event: SimEvent) => void }
  kick: { current: () => void }
  /** The keyboard-focused part, whose ring pulses while focus stays. */
  focus: { current: string | null }
  onFirstFrame: () => void
  onSwap: () => void
  onEnd: () => void
  onPowered: () => void
  onCut: (name: string, lens: string) => void
  onAdd: (p: Part) => void
}

const screen = new Vector3()

/**
 * The one per-frame driver, ahead of every scene callback: it steps the sim,
 * the power-up and the dimmer, moves the camera, hands the sim's events on,
 * then asks for another frame only while something still moves, so an idle
 * scene costs nothing. Render fps counts busy frames only and lowers the
 * pixel ratio when they sag.
 */
function Loop({ sim, cam, lab, root, hud, overlay, status, onEvent, kick, focus, onFirstFrame, onSwap, onEnd, onPowered, onCut, onAdd }: LoopProps) {
  const gl = useThree((s) => s.gl)
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  const invalidate = useThree((s) => s.invalidate)
  const setDpr = useThree((s) => s.setDpr)
  const m = useRef({ n: 0, t: 0, fps: 0, dpr: DPR_CAP, calm: 0, tail: 2, first: -1, mounted: performance.now() })
  useEffect(() => {
    gl.info.autoReset = false
    setDpr(DPR_CAP)
    kick.current = () => {
      wake(sim)
      invalidate()
    }
    return () => {
      gl.info.autoReset = true
    }
  }, [gl, setDpr, kick, sim, invalidate])
  useEffect(() => {
    cam.settled = false
    invalidate()
  }, [size, cam, invalidate])
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1)
    const L = lab.current
    step(sim, L, dt)
    const powering = sim.power.active
    if (drivePowerUp(sim.power, sim.energy, dt)) play('swap')
    if (powering && !sim.power.active) onPowered()
    driveDimmer(sim.dimmer, sim.energy, dt, onSwap, onEnd)
    if (overlay.current) overlay.current.style.opacity = String((1 - sim.energy.all) * 0.7)
    if (status.current && sim.power.active) {
      const text = powerLabel(sim.power)
      if (status.current.textContent !== text) status.current.textContent = text
    }
    runCamera(cam, sim, L, size, camera as PerspectiveCamera, rawDt, onCut, onAdd)
    for (const event of sim.events) onEvent.current(event)
    sim.events.length = 0
    hum(Math.min(1, (sim.feed.length + sim.belt.length) / 4))

    const f = m.current
    const busy = isBusy(sim) || !cam.settled || camPending(cam, sim) || (!!focus.current && !REDUCED_MOTION)
    if (busy) f.tail = 2
    if (f.tail > 0) {
      f.tail--
      invalidate()
    }
    const calls = gl.info.render.calls
    const frame = gl.info.render.frame
    gl.info.reset()
    if (f.first < 0) {
      f.first = Math.round(performance.now() - f.mounted)
      onFirstFrame()
    }
    if (busy && rawDt < 0.25) {
      f.n++
      f.t += rawDt
    }
    if (f.t >= 1) {
      f.fps = Math.round(f.n / f.t)
      f.n = 0
      f.t = 0
      if (f.fps < 40 && f.dpr > 1) {
        f.dpr = Math.max(1, f.dpr - 0.25)
        f.calm = 0
        setDpr(f.dpr)
      } else if (f.fps > 56 && f.dpr < DPR_CAP && ++f.calm >= 3) {
        f.dpr = Math.min(DPR_CAP, f.dpr + 0.25)
        f.calm = 0
        setDpr(f.dpr)
      }
    }
    const el = root.current
    if (el) {
      let seated = 0, held = 0
      for (const p of sim.live) {
        if (p.mode === 'board') seated++
        else if (p.mode === 'held') held++
      }
      let latest = ''
      if (sim.latest?.visible) {
        camera.updateMatrixWorld()
        screen.copy(sim.latest.pos).project(camera)
        latest = `${Math.round(((screen.x + 1) / 2) * size.width)},${Math.round(((1 - screen.y) / 2) * size.height)}`
      }
      const d = el.dataset
      d.calls = String(calls)
      d.fps = String(f.fps)
      d.dpr = String(f.dpr)
      d.busy = busy ? '1' : '0'
      d.frame = String(frame)
      d.firstFrame = String(f.first)
      d.seated = String(seated)
      d.held = String(held)
      d.latest = latest
      d.shot = cam.mode
      d.zoom = cam.orbit.zoom.toFixed(2)
    }
    if (hud.current) {
      const text = hudText(cam)
      if (hud.current.textContent !== text) hud.current.textContent = text
    }
  }, -20)
  return null
}

/** Asks for a frame after any React update inside the scene, since lab changes reach the sim through the next step. */
function Wake() {
  const invalidate = useThree((s) => s.invalidate)
  useEffect(() => invalidate())
  return null
}

/** Keeps its children out of the floor's mirror pass, so the focus ring costs one draw call, not two. */
function MirrorSkip({ children }: { children: ReactNode }) {
  const group = useRef<Group>(null)
  useLayoutEffect(() => group.current?.traverse((o) => o.layers.set(MIRROR_SKIP)), [])
  return <group ref={group}>{children}</group>
}

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: readonly { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="grid gap-0.5 rounded-lg border border-border p-0.5" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`truncate rounded-md px-1.5 py-1 text-[11px] transition-colors ${FOCUS_STYLE} ${o.value === value ? 'bg-accent text-accent-foreground' : 'text-foreground/70 hover:text-foreground'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export default function FabNight({ lab }: MockProps) {
  const labRef = useRef(lab)
  labRef.current = lab
  const view = useViewport()
  const phone = isPhone(view.width, view.height)
  const embedded = lab.chrome === 'embedded'
  const firstRun = DEFAULT.power && lab.setup.items.length === 0
  const [sim] = useState(() => {
    const power: PowerUp = { t: 0, active: firstRun, speed: isPhone(innerWidth, innerHeight) ? PHONE_POWER_SPEED : 1 }
    return createSim(lab, createEnergy(!firstRun), power)
  })
  const [cam] = useState(createCam)
  const [powering, setPowering] = useState(sim.power.active)
  const [world, setWorld] = useState<WorldId>(DEFAULT.world)
  const [shown, setShown] = useState<WorldId>(DEFAULT.world)
  const pending = useRef<WorldId>(DEFAULT.world)
  const [rig, setRig] = useState<Rig>(DEFAULT.rig)
  const [follow, setFollow] = useState<Follow>(DEFAULT.follow)
  const [open, setOpen] = useState(() => !embedded && !isPhone(innerWidth, innerHeight) && innerWidth >= 900)
  const [manual, setManual] = useState(false)
  const [ready, setReady] = useState(false)
  const [slate, setSlate] = useState<{ key: number; scene: string; label: string } | null>(null)
  const [cut, setCut] = useState<{ key: number; name: string; lens: string } | null>(null)
  const [title, setTitle] = useState<{ key: number; line: string; name: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const [tipRef, tip] = useTip()
  const { muted, setMuted } = useSound(lab)
  /** The part under the last press, for long press. */
  const pressed = useRef<Part | null>(null)
  const overlay = useRef<HTMLDivElement>(null)
  const status = useRef<HTMLSpanElement>(null)
  const hud = useRef<HTMLDivElement>(null)
  const root = useRef<HTMLDivElement>(null)
  const kick = useRef<() => void>(() => {})
  const wrist = useRef(new Vector3(BASE_WRIST[0], BASE_WRIST[1], BASE_WRIST[2]))
  const droneAt = useRef(new Vector3(10, 3.5, 0))
  const beltHead = useRef(new Vector3(1.7, 1.25, 1.6))
  const anchors = useRef<Vector3[]>([wrist.current, droneAt.current, beltHead.current])
  const look = lookOf(shown, lab.theme)
  cam.rig = rig
  cam.follow = follow
  cam.world = shown
  const inset: Inset = embedded
    ? { top: 64, bottom: BAR_CLEAR, left: 16, right: 16 }
    : phone
      ? view.landscape
        ? { top: 64, bottom: 60, left: 12, right: 12 }
        : { top: 116, bottom: 76, left: 12, right: 12 }
      : { top: 76, bottom: 150, left: open ? 264 : 24, right: 24 }
  cam.inset = inset

  const paging = useBoardPaging(lab, sim)
  const { aisles, active, matches, pages, page, setPage } = paging
  const turn = (n: number) => {
    play('page')
    setPage(n)
  }

  /** Every sim event sounds its voice; a seat is also announced, since the Mirror only announces adds and removes. */
  const onEvent = useRef((event: SimEvent) => {
    play(VOICE[event.kind])
    if (event.kind !== 'seat') return
    const n = labRef.current.setup.items.length
    announce(`${event.part.item.title} seated on the board, ${n} ${n === 1 ? 'part' : 'parts'}`)
  })

  const pageParts = pages[page].parts
  const keyItems = useRef<string[]>([])
  keyItems.current = useMemo(() => {
    const onPage = pageParts.map((p) => p.item.ref)
    const shownRefs = new Set(onPage)
    return [...onPage, ...lab.setup.items.filter((ref) => !shownRefs.has(ref))]
  }, [pageParts, lab.setup.items])
  const keys = useSceneKeys({
    lab,
    label: 'Night shift factory floor',
    items: () => keyItems.current,
    cols: PAD_COLS,
    onFocusItem: () => {
      play('tick')
      kick.current()
    },
  })
  const locate = (ref: string, out: Vector3) => {
    const p = sim.parts.get(ref)
    if (!p?.visible) return 0
    out.set(p.pos.x, p.pos.y - (p.size[1] * p.scale) / 2 + 0.02, p.pos.z)
    return Math.max(p.size[0], p.size[2]) * p.scale * 0.8
  }

  useEffect(() => {
    if (lab.focus.category !== 'all') cam.focusUntil = sim.time + 2.8
  }, [lab.focus.category, cam, sim])

  const skipPower = () => {
    if (!sim.power.active) return
    sim.power.t = 1e3
  }
  const changeWorld = (next: WorldId) => {
    setWorld(next)
    pending.current = next
    const dimmer = sim.dimmer
    if (dimmer.active && !dimmer.swapped) return
    dimmer.t = 0
    dimmer.active = true
    dimmer.swapped = false
    const index = WORLDS.findIndex((w) => w.id === next)
    setSlate({ key: Date.now(), scene: `SCENE ${String(index + 1).padStart(2, '0')}`, label: `${WORLDS[index].scene} · ${WORLDS[index].label.toUpperCase()}` })
  }
  useEffect(() => {
    if (!title) return
    const id = setTimeout(() => setTitle(null), 2000)
    return () => clearTimeout(id)
  }, [title])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.metaKey || e.ctrlKey) return
      skipPower()
      kick.current()
      const cycle = <T,>(list: readonly T[], v: T) => list[(list.indexOf(v) + 1) % list.length]
      if (e.key === 'w') changeWorld(cycle(WORLDS.map((w) => w.id), world))
      if (e.key === 'c') setRig(cycle(RIGS.map((r) => r.value), rig))
      if (e.key === 'f') setFollow(cycle(FOLLOWS.map((f) => f.value), follow))
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  })

  const takeCamera = () => {
    if (!cam.manual) {
      cam.manual = true
      setManual(true)
    }
  }
  const reset = () => {
    cam.orbit = { az: 0, el: 0, zoom: 1 }
    cam.manual = false
    setManual(false)
    kick.current()
  }
  const { guard, props: gestures } = useSceneGestures({
    onInteract: () => {
      cam.lastPick = sim.time
      skipPower()
      kick.current()
    },
    onOrbit: (dx, dy) => {
      cam.orbit.az -= dx * 0.005
      cam.orbit.el = Math.min(0.9, Math.max(-0.4, cam.orbit.el + dy * 0.004))
      takeCamera()
    },
    onZoom: (factor) => {
      cam.orbit.zoom = Math.min(2.2, Math.max(0.35, cam.orbit.zoom / factor))
      takeCamera()
    },
    onLongPress: (x, y) => {
      const p = pressed.current
      if (!p) return
      if (lab.inspect) lab.inspect(p.item.ref)
      else tip.pin(x, y, p.item.title, `${p.item.label} · ${p.code} · ${lab.selected.has(p.item.ref) ? 'in the build' : 'tap to build'}`)
    },
    onReset: reset,
  })
  const replay = () => {
    sim.energy.rows.fill(0)
    sim.energy.belt = sim.energy.machines = sim.energy.board = 0
    sim.power.t = 0
    sim.power.active = true
    cam.manual = false
    setManual(false)
    setPowering(true)
  }
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(lab.command)
    } catch {}
    play('copy')
    setCopied(true)
    setTimeout(() => setCopied(false), 1400)
  }
  const setChip: Lab['set'] = (key, value) => {
    play('swap')
    lab.set(key, value)
  }

  const count = lab.setup.items.length
  const letterbox = rig === 'trailer' && !powering

  const search = (
    <>
      <span className="text-xs text-foreground/70">⌕</span>
      <input
        value={lab.focus.query}
        onChange={(e) => lab.setFocus({ query: e.target.value })}
        placeholder={`Search ${lab.catalog.items.length.toLocaleString()} parts`}
        aria-label="Search parts"
        className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted"
      />
      {lab.focus.category !== 'all' && (
        <button type="button" onClick={() => lab.setFocus({ category: 'all' })} className={`shrink-0 rounded-full bg-background px-2 py-0.5 text-[11px] text-foreground/70 hover:text-foreground ${FOCUS_STYLE}`}>
          {aisles[active].label} ×
        </button>
      )}
    </>
  )

  return (
    <div
      ref={root}
      className="relative h-full w-full select-none overflow-hidden"
      style={{ background: look.bg }}
      data-fab-night
      data-count={count}
      data-world={shown}
      data-rig={rig}
      data-follow={follow}
      data-powering={powering}
      data-motion={REDUCED_MOTION ? 'reduced' : 'full'}
    >
      <div
        {...keys.props}
        {...gestures}
        onPointerDownCapture={() => {
          pressed.current = null
        }}
        onPointerMove={(e) => {
          kick.current()
          gestures.onPointerMove(e)
        }}
        className={`relative h-full w-full ${sceneFocusClass}`}
      >
        <Canvas
          frameloop="demand"
          dpr={DPR_CAP}
          camera={{ fov: 22, near: 0.2, far: 600, position: [30, 20, 30] }}
          onPointerMissed={() => tip.hide()}
          onCreated={({ camera }) => camera.layers.enable(1)}
          gl={{ antialias: true, powerPreference: 'high-performance' }}
        >
          <Loop
            sim={sim}
            cam={cam}
            lab={labRef}
            root={root}
            hud={hud}
            overlay={overlay}
            status={status}
            onEvent={onEvent}
            kick={kick}
            focus={keys.focusRef}
            onFirstFrame={() => setReady(true)}
            onSwap={() => {
              play('swap')
              setShown(pending.current)
            }}
            onEnd={() => setSlate(null)}
            onPowered={() => setPowering(false)}
            onCut={(name, lens) => setCut({ key: Date.now(), name, lens })}
            onAdd={(p) => {
              setManual(false)
              if (cam.rig === 'trailer') setTitle({ key: Date.now(), line: TAGLINES[sim.addSeq % TAGLINES.length], name: p.item.title.toUpperCase() })
            }}
          />
          <Wake />
          <MirrorSkip>
            <FocusRing focus={keys.focusRef} locate={locate} color={look.accent} />
          </MirrorSkip>
          <WorldStage key={shown} world={shown} look={look} energy={sim.energy} sim={sim} anchors={anchors} ready={ready} />
          <Static c={look} aisles={aisles.length} />
          <Cabinet
            aisles={aisles}
            active={active}
            matches={matches}
            onOpen={(i) => {
              play('drawer')
              lab.setFocus({ category: aisles[i].id })
            }}
            c={look}
            tip={tip}
            guard={guard}
            sim={sim}
            ready={ready}
            bare={phone}
          />
          <Table c={look} count={pageParts.length} label={pages[page].label} pages={pages.length} page={page} setPage={turn} tip={tip} guard={guard} ready={ready} bare={phone} />
          <Belt c={look} sim={sim} />
          <Arm sim={sim} c={look} wrist={wrist} />
          <Board look={look} setup={lab.setup} set={setChip} sim={sim} ready={ready} bare={phone} tip={tip} guard={guard} />
          <Parts sim={sim} lab={lab} c={look} tip={tip} guard={guard} pressed={pressed} focus={keys.focusRef} ready={ready} onPart={(p) => lab.toggle(p.item.ref)} />
          <Drone sim={sim} lab={lab} c={look} anchor={droneAt} ready={ready} />
        </Canvas>
      </div>

      <div ref={overlay} className="pointer-events-none absolute inset-0 bg-black opacity-0" />

      {letterbox && (
        <div className="pointer-events-none absolute inset-0">
          <motion.div initial={{ height: 0 }} animate={{ height: '9%' }} className="absolute inset-x-0 top-0 bg-black" />
          <motion.div initial={{ height: 0 }} animate={{ height: '9%' }} className="absolute inset-x-0 bottom-0 bg-black" />
          <AnimatePresence>
            {cut && (
              <motion.div
                key={cut.key}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                className="absolute bottom-[calc(9%+12px)] left-6 font-mono text-[11px] tracking-[0.2em] text-white/90 [text-shadow:0_1px_3px_rgba(0,0,0,0.7)]"
              >
                {cut.name} · {cut.lens}
              </motion.div>
            )}
          </AnimatePresence>
          <AnimatePresence>
            {title && (
              <motion.div
                key={title.key}
                initial={{ opacity: 0, scale: 1.08 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.5 }}
                className="absolute inset-x-0 top-[30%] px-4 text-center text-white [text-shadow:0_2px_24px_rgba(0,0,0,0.85)]"
              >
                <div className="text-xs tracking-[0.5em] opacity-80">{title.line}</div>
                <div className="mt-2 text-2xl font-medium tracking-[0.18em] sm:text-4xl">{title.name}</div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      <AnimatePresence>
        {powering && (
          <motion.div
            key="power"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.6 } }}
            className="pointer-events-none absolute left-1/2 flex -translate-x-1/2 flex-col items-center gap-1.5 whitespace-nowrap font-mono text-[11px] tracking-[0.2em] text-white/90 [text-shadow:0_1px_3px_rgba(0,0,0,0.8)]"
            style={embedded ? { top: 72 } : { bottom: phone ? 'calc(72px + env(safe-area-inset-bottom, 0px))' : 32 }}
            data-powerup
          >
            <div className="flex items-center gap-3">
              <span className="size-2 rounded-full bg-[#FF3B30] shadow-[0_0_8px_#FF3B30]" />
              <span ref={status}>MAINS · STANDBY</span>
            </div>
            <span className="text-[10px] opacity-60">{view.touch ? 'TAP TO SKIP' : 'CLICK OR ANY KEY TO SKIP'}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {slate && (
          <motion.div
            key={slate.key}
            initial={{ opacity: 0, y: 30, rotate: -4 }}
            animate={{ opacity: 1, y: 0, rotate: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={REDUCED_MOTION ? { duration: 0.15 } : { type: 'spring', stiffness: 260, damping: 22 }}
            className="pointer-events-none absolute left-1/2 top-1/2 w-[300px] max-w-[calc(100%-32px)] -translate-x-1/2 -translate-y-1/2 font-mono text-white"
          >
            <motion.div
              initial={{ rotate: REDUCED_MOTION ? 0 : -22 }}
              animate={{ rotate: 0 }}
              transition={{ delay: 0.25, duration: 0.12, ease: 'easeIn' }}
              style={{ transformOrigin: '0% 100%', background: 'repeating-linear-gradient(115deg, #111 0 18px, #F4F4F4 18px 36px)' }}
              className="h-7 rounded-t-sm border border-white/80"
            />
            <div className="rounded-b-sm border border-white/80 bg-[#111] px-4 py-3">
              <div className="flex justify-between text-[10px] tracking-[0.25em] text-white/60">
                <span>PAYLOAD TOOLKIT</span>
                <span>TAKE 1</span>
              </div>
              <div className="mt-2 text-2xl tracking-[0.1em]">{slate.scene}</div>
              <div className="mt-1 text-xs tracking-[0.18em] text-white/80">{slate.label}</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div
        className={`pointer-events-auto absolute z-20 rounded-2xl border border-border bg-surface/90 text-foreground shadow-lg backdrop-blur ${embedded ? 'right-3 top-[64px]' : phone ? 'left-3 top-[68px]' : 'left-4 top-[72px]'} ${open ? 'max-h-[calc(100%-140px)] w-[232px] max-w-[calc(100%-24px)] overflow-y-auto p-3' : 'px-3 py-2'}`}
        data-director
      >
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className={`flex w-full items-center justify-between gap-3 rounded-lg ${FOCUS_STYLE}`}>
          <span className="flex items-center gap-2 text-xs tracking-[0.18em] text-foreground/70">
            <span className={`size-2 rounded-full ${REDUCED_MOTION ? 'bg-muted' : 'bg-[#FF3B30] shadow-[0_0_8px_#FF3B30]'}`} />
            DIRECTOR
          </span>
          <span className="text-xs text-foreground/70">{open ? '–' : '+'}</span>
        </button>
        {open && (
          <div className="mt-3 space-y-2.5">
            <div>
              <div className="mb-1 flex justify-between text-[10px] tracking-[0.16em] text-foreground/70">
                <span>WORLD</span>
                <span>W</span>
              </div>
              <Segmented value={world} options={WORLDS.map((w) => ({ value: w.id, label: w.label }))} onChange={(v) => v !== world && changeWorld(v)} />
            </div>
            <div>
              <div className="mb-1 flex justify-between text-[10px] tracking-[0.16em] text-foreground/70">
                <span>CAMERA RIG</span>
                <span>C</span>
              </div>
              <Segmented value={rig} options={RIGS} onChange={(v) => { setRig(v); reset() }} />
            </div>
            <div>
              <div className="mb-1 flex justify-between text-[10px] tracking-[0.16em] text-foreground/70">
                <span>FOLLOW THE PART{REDUCED_MOTION ? ' · REDUCED MOTION' : ''}</span>
                <span>F</span>
              </div>
              <Segmented value={follow} options={FOLLOWS} onChange={setFollow} />
            </div>
            <button
              type="button"
              aria-pressed={!muted}
              onClick={() => setMuted(!muted)}
              className={`flex w-full items-center justify-between rounded-lg border border-border px-2 py-1 text-[10px] tracking-[0.16em] text-foreground/70 hover:text-foreground ${FOCUS_STYLE}`}
              data-sound-toggle
            >
              <span>SOUND</span>
              <span className={`flex items-center gap-1.5 ${muted ? '' : 'text-foreground'}`}>
                {!muted && <span className="size-1.5 rounded-full bg-accent" />}
                {muted ? 'OFF' : 'ON'}
              </span>
            </button>
            <div className="flex items-center justify-between gap-2 rounded-lg bg-background px-2 py-1.5 font-mono text-[10px] tracking-wider">
              <div ref={hud} className="truncate text-foreground" data-hud />
              {manual && (
                <button type="button" onClick={reset} className={`shrink-0 rounded text-accent ${FOCUS_STYLE}`}>
                  resume
                </button>
              )}
            </div>
            <div className="flex items-center justify-between text-[10px] leading-snug text-foreground/70">
              <span>{view.touch ? 'Drag orbits, pinch zooms, hold for details, double-tap hands back.' : 'Drag orbits, wheel zooms, double-click hands back.'}</span>
              <button type="button" onClick={replay} disabled={powering} className={`shrink-0 rounded-md border border-border px-1.5 py-0.5 text-[10px] text-foreground/70 hover:text-foreground disabled:opacity-40 ${FOCUS_STYLE}`} data-replay>
                Power up
              </button>
            </div>
          </div>
        )}
      </div>

      {!embedded && !phone && (
        <>
          <div className="pointer-events-auto absolute bottom-4 left-4 z-20 flex w-[300px] items-center gap-2 rounded-full border border-border bg-surface/90 px-3 py-1.5 shadow-lg backdrop-blur focus-within:outline-2 focus-within:outline-accent">{search}</div>
          <div className="pointer-events-auto absolute bottom-4 right-20 z-20 w-[360px] min-w-[280px] max-w-[calc(100%-416px)] rounded-2xl border border-border bg-surface/90 p-3 shadow-lg backdrop-blur">
            <div className="flex items-center justify-between">
              <span className="text-[10px] tracking-[0.18em] text-foreground/70">CALL SHEET</span>
              <span className="rounded-md bg-background px-2 py-0.5 font-mono text-xs tabular-nums" data-count={count}>
                {String(count).padStart(2, '0')} parts
              </span>
            </div>
            <div className="mt-2 max-h-[4.5em] overflow-hidden font-mono text-[11px] leading-[1.5] text-foreground [overflow-wrap:anywhere]">
              <span className="text-accent">$ </span>
              {lab.command}
            </div>
            <div className="mt-2.5 flex items-center gap-2">
              <Segmented
                value={lab.setup.agent}
                options={[{ value: 'none', label: 'no agent' }, { value: 'claude', label: 'claude' }, { value: 'codex', label: 'codex' }] as const}
                onChange={(v) => lab.set('agent', v)}
              />
              <button type="button" onClick={copy} className="ml-auto rounded-lg bg-accent px-3 py-1 text-xs text-accent-foreground focus-visible:outline-2 focus-visible:outline-foreground active:scale-[0.98]">
                {copied ? 'Copied' : 'Copy'}
              </button>
              <button type="button" onClick={() => lab.clear()} disabled={!count} className={`rounded-lg border border-border px-2.5 py-1 text-xs text-foreground/70 hover:text-foreground disabled:opacity-40 ${FOCUS_STYLE}`}>
                Wrap
              </button>
            </div>
          </div>
        </>
      )}
      {phone && (
        <div className={`pointer-events-auto absolute top-[68px] z-20 flex items-center rounded-full border border-border bg-surface/90 font-mono text-[11px] tracking-wider text-foreground shadow-lg backdrop-blur ${embedded ? 'left-3' : 'right-3'}`} data-bay>
          {pages.length > 1 && (
            <button type="button" onClick={() => turn((page + pages.length - 1) % pages.length)} aria-label="Previous bay" className={`rounded-full px-3 py-2 text-foreground/70 active:text-foreground ${FOCUS_STYLE}`}>
              ‹
            </button>
          )}
          <span className={`max-w-[150px] truncate py-2 ${pages.length > 1 ? '' : 'px-3'}`}>
            {aisles[active].label.toUpperCase()}
            {pages.length > 1 ? ` · ${page + 1}/${pages.length}` : ''}
          </span>
          {pages.length > 1 && (
            <button type="button" onClick={() => turn((page + 1) % pages.length)} aria-label="Next bay" className={`rounded-full px-3 py-2 text-foreground/70 active:text-foreground ${FOCUS_STYLE}`}>
              ›
            </button>
          )}
        </div>
      )}
      {!embedded && phone && (
        <div className="pointer-events-auto absolute left-3 right-[76px] z-20 flex items-center gap-2" style={{ bottom: 'calc(12px + env(safe-area-inset-bottom, 0px))' }} data-chips>
          <label className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-border bg-surface/90 px-3 py-2 shadow-lg backdrop-blur focus-within:outline-2 focus-within:outline-accent">{search}</label>
          <span className="shrink-0 rounded-full border border-border bg-surface/90 px-3 py-2 font-mono text-xs tabular-nums text-foreground shadow-lg backdrop-blur" aria-label={`${count} parts in the build`} data-count={count}>
            {String(count).padStart(2, '0')}
          </span>
          <button type="button" onClick={copy} className="shrink-0 rounded-full bg-accent px-3 py-2 text-xs text-accent-foreground shadow-lg focus-visible:outline-2 focus-visible:outline-foreground active:scale-[0.98]">
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      )}
      <div ref={tipRef} className="pointer-events-none fixed left-0 top-0 z-40 max-w-72 rounded-lg border border-border bg-surface px-2.5 py-1.5 opacity-0 shadow-lg transition-opacity">
        <div className="text-sm text-foreground" />
        <div className="text-xs text-foreground/70" />
      </div>
      <Mirror lab={lab} title={embedded ? 'Factory' : 'Fab night shift'} />
    </div>
  )
}
