/**
 * The fab line's slot contract. A line is a row of stations along +x:
 * cabinet and pick table share one frame, then the transport, then the board
 * with the rail arm and its integrator. Each slot is a registry of variants
 * (stations/<slot>/index.ts, chip/, themes/, fx/); the Director and the URL
 * pick one per slot, and `layoutLine` reflows the line from their footprints.
 *
 * Frames: a station draws in its own frame, which is the world frame shifted
 * along x by the offset the layout gives it (`sim.at`). The board also has a
 * local frame scaled by `origin.s`; slots, routes and integrators use it.
 * Colors come from `Tokens` only.
 */
import type { ComponentType } from 'react'
import type { Vector3 } from 'three'

import type { Agent, CatalogItem, Setup } from '@/routes/workspace/-workspace/workspace.types'
import type { Lab } from '@/routes/lab/-lab/lab.types'
import type { Aisle } from '@/routes/lab/-lab/warehouse'
import type { Spec } from './spec'

export type V3 = [number, number, number]
/** An extent along x. */
export type Span = { x0: number; x1: number }
/** A station's body box on the floor: x and z extents and its height. The layout butts stations together by x. */
export type Footprint = Span & { z0: number; z1: number; h: number }
export type Mode = Lab['theme']

/** Every color a station may paint with. Themes supply one set per light and dark mode. */
export type Tokens = {
  /** CSS background behind the canvas; may be a gradient. */
  bg: string
  surface: string
  fg: string
  muted: string
  edge: string
  dim: string
  accent: string
  floor: string
  floorEdge: string
  /** Unlit materials (Blueprint) or lit standard materials (Cleanroom). */
  flat: boolean
  rough: number
  /** Contact shadow opacity; 0 disables it. */
  shadow: number
  /** Saturation and lightness for hue tints such as `hsl(hue, s%, l%)`. */
  s: number
  l: number
  board: string
  boardEdge: string
  silk: string
  trace: string
  /** The live signal: routed traces, pulses, the open footprint. */
  lit: string
  body: string
  bodyEdge: string
  ink: string
  pin: string
  sub: string
  ghost: string
  /** Bond wires, header pins and other plated metal. */
  gold: string
  /** A die's substrate under its art. */
  die: string
  led: string
  ledBusy: string
  ledOff: string
  /** Hot white of a moving trace head or a spark. */
  spark: string
  claude: string
  claudeEdge: string
  claudeInk: string
  claudeCable: string
  codex: string
  codexInk: string
  codexCable: string
}

/** Hover card and click guard every pickable mesh shares. */
export type Tip = { show: (e: PointerEvent, title: string, sub: string, image?: string) => void; move: (e: PointerEvent) => void; hide: () => void }
export type Guard = { moved: boolean }

type Variant = { id: string; label: string }

/** What every station on the line declares, in its own frame. */
export type Station = Variant & {
  footprint: Footprint
  /** Points the camera frames for this station's stop. */
  frame: readonly V3[]
  /** Elevation of this station's stop in degrees; defaults to the theme lens. */
  el?: number
}

export type CabinetProps = {
  sim: Sim
  aisles: readonly Aisle[]
  /** The aisle whose parts are on the table. */
  active: number
  /** Matches per aisle while a search runs, else null. */
  matches: number[] | null
  onOpen: (aisle: number) => void
  c: Tokens
  tip: Tip
  guard: Guard
}
/** Inventory. Shares the pick table's frame. */
export type CabinetVariant = Station & {
  /** Where aisle `aisle`'s off-table parts rest, hidden at scale 0.2. */
  drawer: (aisle: number, out: Vector3) => Vector3
  Component: ComponentType<CabinetProps>
}

export type TableProps = {
  sim: Sim
  c: Tokens
  /** Pockets in use on this page, holes included. */
  slots: number
  label: string
  pages: number
  page: number
  setPage: (page: number) => void
  tip: Tip
  guard: Guard
}
/** The pick table. A page is `bays` warehouse bays (20 bins each), pocket i = bay * 20 + level * 4 + slot. */
export type TableVariant = Station & {
  bays: number
  /** Columns for the keyboard grid. */
  cols: number
  /** Bottom centre of a part in pocket `index`. */
  pocket: (index: number, out: Vector3) => Vector3
  /** A part on a pocket draws at min(max, size / its widest footprint). */
  fit: { max: number; size: number }
  Component: ComponentType<TableProps>
}

export type TransportProps = { sim: Sim; c: Tokens; tip: Tip; guard: Guard }
/**
 * How parts get from the table to the arm. `path`: a queue along a curve,
 * entered with a hop from the pocket and picked by the arm at its end.
 * `none`: the arm picks queued parts straight from their pocket or drawer.
 */
export type TransportVariant =
  | (Station & {
      kind: 'path'
      /** Path length in world units. */
      length: number
      speed: number
      /** Minimum spacing between queued parts along the path. */
      gap: number
      /** Bottom centre of a part `u` units along the path. */
      at: (u: number, out: Vector3) => Vector3
      /** The hop from a pocket onto the path start. */
      load: { dur: number; h: number }
      Component: ComponentType<TransportProps>
    })
  | (Station & { kind: 'none' })

export type BoardProps = {
  lab: Lab
  sim: Sim
  c: Tokens
  routing: RouteStyle
  /** Bumps when the plan changes (selection, target, routing, framework). */
  version: number
  chip: ChipVariant
  /** Setup swaps the board's sockets offer. */
  cycle: { framework: () => void; database: () => void; pm: () => void }
  tip: Tip
  guard: Guard
}
/** One planned slot on the board, board-local. `s` scales the package. */
export type Slot = { x: number; y: number; z: number; s: number }
export type Ghost = { spec: Spec; band: number; slot: Slot; title: string }
export type Hatch = { x0: number; x1: number; z0: number; z1: number }
export type Plan = { slots: Map<string, Slot>; ghosts: Ghost[]; hatches: Hatch[] }
/** What the board's planner and router read and write on each part. */
export type Routed = { item: CatalogItem; spec: Spec; slot: Slot | null; route: Route | null }
/** The app board. Its frame is shifted by the layout; `origin` places its scaled local frame inside it. */
export type BoardVariant = Station & {
  origin: { x: number; z: number; s: number }
  /** Slots for the wanted parts, in seat order. */
  plan: (parts: readonly Routed[], target: Setup['target']) => Plan
  /** Writes `route` on every placed part. */
  route: (parts: readonly Routed[], style: RouteStyle, framework: Setup['framework']) => void
  /** Board-local point an integrator connects to or parks beside. */
  dock: V3
  Component: ComponentType<BoardProps>
}

export type RouteStyle = 'manhattan' | 'diagonal' | 'organic'
/** A polyline in board-local units with cumulative lengths for sampling. */
export type Route = { pts: Vector3[]; vias: Vector3[]; len: number; cum: number[] }

export type IntegratorProps = {
  agent: Agent
  sim: Sim
  board: BoardVariant
  c: Tokens
  /** Clip on the next agent. */
  onCycle: () => void
  tip: Tip
  guard: Guard
}
/**
 * Who finishes seated chips. Renders inside the board's local frame for
 * every agent, including `none`. The sim queues each seated chip for
 * `workTime` seconds and exposes the running job as `sim.work.job`.
 */
export type IntegratorVariant = Variant & {
  /** Seconds of work per chip; 0 skips the queue. */
  workTime: (agent: Agent, part: Part) => number
  /** Extra extent in the board's station frame, such as a machine parked past the board's end. */
  footprint?: Footprint
  frame?: readonly V3[]
  Component: ComponentType<IntegratorProps>
}

/** The camera state a chip reads to decide how much of itself to show. */
export type ChipCam = { focusRef: string | null; decap: boolean; hovered: string | null; pressed: string | null }
export type ChipPartProps = {
  p: Part
  lab: Lab
  c: Tokens
  tip: Tip
  guard: Guard
  cam: ChipCam
  codeOf: (ref: string) => string
  onFocus: (ref: string) => void
}
export type PackageProps = { spec: Spec; c: Tokens; top: import('three').Texture | null; ghost?: boolean }
/** Chip rendering: a live part anywhere on the line, and a still package for ghosts. */
export type ChipVariant = Variant & {
  Part: ComponentType<ChipPartProps>
  Package: ComponentType<PackageProps>
  /** The print on a package's lid in the given body and ink colors. The caller disposes it. */
  marking: (item: CatalogItem, code: string, spec: Spec, colors: { body: string; ink: string }) => import('three').Texture
}

export type Lens = { fov: number; el: number; frame: number }
/** 0 while a theme swap blacks out, 1 when lit. */
export type Power = { current: number }
export type StageProps = { c: Tokens; mode: Mode; sim: Sim; power: Power; cam: { closeUp: boolean }; line: LineLayout }
export type ThemeVariant = Variant & {
  /** Slate line shown while it swaps in. */
  scene: string
  lens: Lens
  tokens: Record<Mode, Tokens>
  /** Lights, floor, walls and annotations, sized from the line's layout. */
  Stage: ComponentType<StageProps>
}

export type FxProps = { c: Tokens; mode: Mode; sim: Sim }
/** A scene-wide effect such as bloom, mounted last inside the Canvas. */
export type FxVariant = Variant & { Component: ComponentType<FxProps> | null }

/** The variant chosen for every slot. */
export type Rig = {
  cabinet: CabinetVariant
  table: TableVariant
  transport: TransportVariant
  board: BoardVariant
  integrator: IntegratorVariant
}

export type StopId = 'cabinet' | 'table' | 'transport' | 'board'
/** A camera stop: a station's frame points in world units. */
export type Stop = { id: StopId; label: string; span: Span; box: Footprint; pts: Vector3[]; el?: number }
/** Station offsets along x, the arm's rail and the camera's stops, all in world units. */
export type LineLayout = {
  /** Offsets of the pick frame (cabinet and table), the transport and the board. */
  at: { pick: number; transport: number; board: number }
  rail: { x0: number; x1: number; z: number }
  extent: Span
  stops: Stop[]
  /** Everything, for the overview. */
  all: Vector3[]
}

/**
 * A part's life: resting in a drawer or pocket (`home`), waiting
 * (`queued`), riding the transport (`carried`), in the gripper (`held`),
 * on the board (`seated`), or flying back (`toss`). `pos` is the package's
 * bottom centre in world units; `scale` multiplies its spec.
 */
export type PartMode = 'home' | 'queued' | 'carried' | 'held' | 'seated' | 'toss'
export type Fly = { from: Vector3; to: Vector3; t: number; dur: number; h: number; then: PartMode; s0: number; s1: number }
export type Part = {
  item: CatalogItem
  /** Aisle index. */
  cat: number
  code: string
  spec: Spec
  pos: Vector3
  scale: number
  spin: number
  mode: PartMode
  fly: Fly | null
  /** Distance along the transport path while carried. */
  u: number
  slot: Slot | null
  order: number
  seatedAt: number
  route: Route | null
  /** Trace drawn, 0..1, after seating. */
  drawn: number
  /** The integrator's progress on this chip, 0..1. */
  finish: number
  /** Decays from 1 when the integrator finishes. */
  flash: number
  visible: boolean
  onPage: boolean
  pad: number
  live: boolean
}

/**
 * What happened on the line, in order. Consumers keep their own cursor on
 * `seq` (see `useSimEvents`), so the sound, the live region and any station
 * can all read the same events.
 */
export type SimEventKind = 'queue' | 'load' | 'servo' | 'seat' | 'chirp' | 'toss' | 'work' | 'done'
export type SimEvent = { kind: SimEventKind; part: Part; seq: number }

export type ArmStep = { to: () => Vector3; slow?: boolean; arrive?: () => boolean | void }
export type Sim = {
  parts: Map<string, Part>
  list: Part[]
  feed: Part[]
  carried: Part[]
  removals: Part[]
  arm: { pos: Vector3; baseX: number; steps: ArmStep[]; holding: Part | null; grip: number; job: Part | null }
  work: { queue: Part[]; job: { part: Part; t: number; dur: number } | null }
  time: number
  order: number
  live: Set<Part>
  liveVersion: number
  latest: Part | null
  addSeq: number
  seat: { part: Part; t: number } | null
  lastSeat: Part | null
  lastSeatAt: number
  plan: Plan
  version: number
  /** Seconds left of the intake pulse, set while a part enters the transport. */
  intake: number
  events: SimEvent[]
  eventSeq: number
  /** The live selection and agent, read by the arm's step callbacks so a stale closure never seats a removed part. */
  wanted: ReadonlySet<string>
  agent: Agent
  rig: Rig
  line: LineLayout
  /** The layout's offsets, eased so the line slides when a variant changes width. */
  at: { pick: number; transport: number; board: number }
  /** What the plan was made from. */
  planned: { selected: ReadonlySet<string> | null; target: Setup['target'] | null; style: RouteStyle | null; framework: Setup['framework'] | null; board: BoardVariant | null }
}
