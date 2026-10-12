/**
 * The fab line's slot contract. A line is a row of stations along +x:
 * cabinet and pick table share one frame, then the transport, then the board
 * with the rail arm and its integrator. Each slot is a registry of variants
 * (stations/<slot>/index.ts, chip/, themes/, fx/); World settings and the
 * URL pick one per slot, and `lineOf` reflows the line from their footprints.
 *
 * Frames: a station draws in its own frame, which is the world frame moved
 * by the placement the layout gives it (`sim.at`). The board also has a
 * local frame scaled by `origin.s`; slots, routes and integrators use it.
 * Colors come from `Tokens` only.
 */
import type { ComponentType } from 'react'
import type { Group, Object3D, Vector3 } from 'three'

import type { Agent, CatalogItem, Setup } from '@/routes/workspace/-workspace/workspace.types'
import type { Lab } from '@/routes/lab/-lab/lab.types'
import type { Guard } from '@/routes/lab/-lab/kit/touch'
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
export type { Guard }

type Variant = {
  id: string
  label: string
  /** An image URL for the variant's World settings card; without one the card shows a color swatch. */
  thumbnail?: string
}

/** A dimension line a drawing theme measures: from `from` to `to`, drawn offset by `off`, labelled with its length. */
export type Dim = { from: V3; to: V3; off: V3 }
/**
 * How a station is framed and annotated, in its own frame. The layout only moves frames; core places these into the
 * world as the station's camera stop (`LineLayout.stops`), and themes read the anchors without knowing the station.
 */
export type Framing = {
  /** Points the camera fits for the station's stop. */
  pts: readonly V3[]
  /** The stop's elevation in degrees; the theme lens's when unset. */
  el?: number
  /** The least width along x the stop frames: 13 when unset, so a narrow station keeps its neighbours in view; 0 frames it alone. */
  min?: number
  /** Breathing room around `pts`: 1.22 when unset, 1 is tight. */
  margin?: number
  /** A theme's label leader, from `at` on the body to the tag at `tag`. Over the footprint's centre when unset. */
  callout?: { at: V3; tag: V3 }
  /** Where a floor print's left end sits, `[x, z]`. In front of the footprint's middle when unset. */
  print?: readonly [number, number]
  /** What a drawing dimensions. The footprint's length along its front when unset; `[]` draws none. */
  dims?: readonly Dim[]
}

/** What every station on the line declares, in its own frame. */
export type Station = Variant & {
  footprint: Footprint
  frame: Framing
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

/** `line` is the layout the station draws against; it is a new object whenever the layout or a station changes. */
export type TransportProps<D = unknown> = { sim: Sim; line: PathLayout<D>; c: Tokens; tip: Tip; guard: Guard }
/** The rest of the line in the transport's own frame, for a path that wraps around it. */
export type Site = { pick: Footprint; board: Footprint; rail: { x0: number; x1: number; z: number } }
/**
 * What `wrap` hands the layout: the route as a polyline, how many times
 * faster than `speed` a part moves at distance `s` along it (values below 1
 * read as 1, so `speed` is the slowest a part goes and `gap` stays a minimum
 * spacing), and whatever the transport planned with it, which comes back to
 * its Component as `line.path.data`.
 */
export type Wrapped<D = undefined> = { pts: Vector3[]; pace?: (s: number) => number; data: D }
/**
 * A transport's live path in its own frame: `at(u)` for 0 <= u <= `length`,
 * where `u` is the sim's steady distance; `along(u)` is the distance along
 * `pts` a part has reached (they differ when the route has a pace). `pts`
 * and `data` come from `wrap`.
 */
export type Path<D = unknown> = {
  length: number
  at: (u: number, out: Vector3) => Vector3
  along: (u: number) => number
  pts: readonly Vector3[]
  data: D
}
/** A queue along a curve, entered with a hop from the pocket and picked by the arm at its end. `D` is what its `wrap` plans for its Component. */
export type PathTransport<D = undefined> = Station & {
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
  /** Level of the belt's roller patter while parts move, 0..1; 0 (the default) keeps it silent. */
  hum?: number
  /**
   * The route itself, in this frame from `at(0)` to `at(length)`, which may
   * take the long way round the rest of the line. The layout samples it into
   * `line.path`, and its points widen the overview.
   */
  wrap: (site: Site) => Wrapped<D>
  Component: ComponentType<TransportProps<D>>
}
/**
 * How parts get from the table to the arm. `path`: see `PathTransport`.
 * `none`: the arm picks queued parts straight from their pocket or drawer.
 * The registry holds transports with different plans, so it forgets `D`;
 * declare each one as `PathTransport<YourPlan>` so its own wrap and
 * Component are checked against each other.
 */
export type TransportVariant = PathTransport<any> | (Station & { kind: 'none' })

export type BoardProps = {
  lab: Lab
  sim: Sim
  c: Tokens
  /** Bumps when the plan changes (selection, target, framework, board). */
  version: number
  chip: ChipVariant
  /** Setup swaps the board's sockets offer. */
  cycle: { framework: () => void; database: () => void; pm: () => void }
  /** How the sockets swap their parts; pass it to `Cpu`, `Memory` and `Power`. */
  swap: SwapVariant
  /** The dots along the traces; `BoardLive` draws them. */
  signals: SignalVariant
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
  route: (parts: readonly Routed[], framework: Setup['framework']) => void
  /** Board-local point an integrator connects to or parks beside. */
  dock: V3
  Component: ComponentType<BoardProps>
}

/** The board's three sockets: framework CPU, database memory and package-manager power stage. */
export type SocketKind = 'cpu' | 'memory' | 'power'
/** A socket part's resting box in the socket's frame: bottom centre and half extents (`h` is the full height). */
export type SwapBox = { x: number; y: number; z: number; w: number; d: number; h: number }
/**
 * One socket's swap clock, read-only to a rig. `from` and `to` are setup values (`next`, `tanstack`,
 * `postgres`, `mongodb`, `pnpm`, `npm`, `bun`); `from` and `fromBox` are null between swaps.
 */
export type SwapClock = {
  active: boolean
  /** Progress 0..1 this frame and the frame before; fire one-shot beats with `crossed(clock, beat)`. */
  u: number
  prev: number
  /** Seconds this swap takes (a chained swap runs faster than the act's `duration`). */
  dur: number
  from: string | null
  to: string
  fromBox: SwapBox | null
  toBox: SwapBox
}
/**
 * What an act builds for one socket and one set of tokens; it is rebuilt when either changes.
 * `frame` runs every frame. While `clock.active` it writes the whole transform and `visible` of `old`
 * (the leaving part) and `next` (the arriving one); each group pivots on its box's bottom centre at
 * rest, and the socket puts both at rest when the swap ends. Return true to keep frames coming after
 * the swap, while sparks still fall. `root` holds the rig's own props under the socket's frame; make
 * them ignore the pointer (`o.raycast = () => {}`), since three raycasts hidden objects too.
 */
export type SwapRig = {
  root?: Object3D
  frame: (clock: SwapClock, old: Group, next: Group, dt: number) => boolean | void
  dispose?: () => void
}
/**
 * One socket kind's swap. `arrive` (0..1) is when the new part first shows: a click before it only
 * changes which part arrives; a click after it waits for the landing and chains one faster swap.
 */
export type SwapAct = {
  /** Seconds for a full swap. */
  duration: number
  arrive: number
  rig: (c: Tokens, kind: SocketKind) => SwapRig
}
/**
 * How the board's sockets swap parts: a table of acts by socket kind, so a style can borrow another
 * style's act for one socket. Under reduced motion every style plays the stock calm glide instead.
 */
export type SwapVariant = Variant & { acts: Record<SocketKind, SwapAct> }

/** A polyline in board-local units with cumulative lengths for sampling. */
export type Route = { pts: Vector3[]; vias: Vector3[]; len: number; cum: number[] }

/** A board's fixed buses: `memory` carries data both ways, `power` runs outward from the power stage. */
export type Statics = { power: Route[]; memory: Route[] }

/**
 * What a board's signal treatment draws over its traces, in the board-local frame: the drawing head, the vias and the
 * traffic. It reads the sim (seats, `drawn`, `flash`, events), the plan `version`, the buses, the height above a trace
 * and an optional per-part trace color.
 */
export type SignalProps = { sim: Sim; c: Tokens; version: number; statics: Statics; lift: number; colorOf?: (p: Part) => string }
/** How a board's accent dots read signal flow along its traces. */
export type SignalVariant = Variant & { Component: ComponentType<SignalProps> }

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
  /**
   * What the integrator parks beside `board`, such as a machine's pad past
   * the board's end, in the board's station frame. Transports route around
   * it with the board, and the board's stop frames it.
   */
  footprint?: (board: BoardVariant) => Footprint
  Component: ComponentType<IntegratorProps>
}

/** The camera state a chip reads to decide how much of itself to show. */
export type ChipCam = { focusRef: string | null; decap: boolean; hovered: string | null; pressed: string | null }
/** One box of a package at scale 1, centred at `at` in package units (bottom centre at the origin). `edge` draws its hairlines. */
export type ChipBox = { size: V3; at: V3; paint: 'body' | 'pin'; edge: boolean }
/** Where the lid print lies on the package top: centre `x`, height `y`, and its extent along x (`w`) and z (`d`). */
export type ChipLid = { x: number; y: number; w: number; d: number }
/**
 * Paints a lid print over (0, 0)–(`w`, `h`) of `ctx`, whose aspect is the lid's. The atlas has already scaled the
 * context to the print's cell, so paint in these logical units and never reset the transform.
 */
export type ChipMarking = (ctx: CanvasRenderingContext2D, w: number, h: number, item: CatalogItem, code: string, spec: Spec, colors: { body: string; ink: string }) => void
/** The focused seated chip's close-up, mounted in the part's frame. Write `hideRef.current` true while it replaces the package. */
export type CloseUpProps = { p: Part; lab: Lab; c: Tokens; cam: ChipCam; code: string; hideRef: { current: boolean } }
/**
 * Chip rendering as data: the line draws every live part (and every ghost) from `boxes` and `lid` in one instanced
 * fill, one hairline and one print draw, with prints painted by `marking` into a shared atlas. Only the focused
 * chip mounts `CloseUp`.
 */
export type ChipVariant = Variant & {
  /** The package's boxes for a spec. Called when the live set changes, so cache per spec. */
  boxes: (spec: Spec) => readonly ChipBox[]
  /** The lid print's rect, or null for a package without one. */
  lid: (spec: Spec) => ChipLid | null
  marking: ChipMarking
  CloseUp: ComponentType<CloseUpProps>
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

/** A camera pose in world units, written in place by a view tool's `shot`. */
export type Shot = { pos: Vector3; look: Vector3; fov: number }
/**
 * `t` is seconds since the view was picked (0 on its first frame), `dt` this frame's step, `aspect` the canvas's width
 * over height, `variant` the picked variant's id (null for a tool without variants).
 */
export type ShotContext = { sim: Sim; t: number; dt: number; aspect: number; variant: string | null }
/** `top` is how many pixels of the scene's top the page's header covers. */
export type ToolOverlayProps = { sim: Sim; c: Tokens; mode: Mode; top: number; variant: string | null }
/** `live` is true while the view is the camera or the toggle is on. */
export type ToolSceneryProps = { sim: Sim; c: Tokens; mode: Mode; line: LineLayout; live: boolean; variant: string | null }
/** One choice inside a tool, listed in its popover. `thumbnail` is an image URL (any URL from a code mod; it loads with no referrer). */
export type ToolVariant = { id: string; label: string; description?: string; thumbnail?: string }
type ToolBase = Variant & {
  /** SVG path data on a 24 × 24 grid, filled with the current color. */
  icon?: string
  description?: string
  /** Two or more turn the button into a popover of choices; the pick is saved per tool. */
  variants?: ToolVariant[]
  /** HTML over the canvas while the tool is live. */
  Overlay?: ComponentType<ToolOverlayProps>
  /** Mounted in the scene for as long as the mod is on. */
  Scenery?: ComponentType<ToolSceneryProps>
}
/**
 * A button a code mod adds to the camera-stop toolbar. The host draws the
 * button, its popover and its keyboard shortcut; the mod supplies data and
 * the functions behind it. A `view` joins the camera stops (one at a time):
 * while it is picked the director calls `shot` every frame and eases toward
 * the pose it writes, or jumps there when it returns true. A `toggle` is an
 * independent on/off layer that shows its Overlay and tells its Scenery.
 */
export type ViewTool = ToolBase & { kind: 'view'; shot: (ctx: ShotContext, out: Shot) => boolean | void }
export type ToggleTool = ToolBase & { kind: 'toggle' }
export type Tool = ViewTool | ToggleTool

/** Where a station frame sits in the world. The built-in line only moves frames along x. */
export type Place = { x: number; y: number; z: number }
export type FrameKey = 'pick' | 'transport' | 'board'
/** Where every station frame sits: the pick frame (cabinet and table), the transport and the board. */
export type Placement = Record<FrameKey, Place>
export type SceneryProps = { c: Tokens; mode: Mode; sim: Sim; line: LineLayout; cam: { closeUp: boolean } }
/**
 * How the stations are arranged. `place` moves the station frames; the
 * built-in `line` butts them along +x (`placeLine`), and a layout usually
 * starts from it. Core derives the rest of the `LineLayout` (rail, transport
 * path, stops, extent) from the placement. A layout may draw its own
 * `Scenery` (mezzanines, ramps) in world units.
 */
export type LayoutVariant = Variant & {
  place: (rig: Rig) => Placement
  Scenery?: ComponentType<SceneryProps>
}

/** The variant chosen for every slot. */
export type Rig = {
  layout: LayoutVariant
  cabinet: CabinetVariant
  table: TableVariant
  transport: TransportVariant
  board: BoardVariant
  integrator: IntegratorVariant
}

/** A label a theme hangs on a stop: `id` names what it labels (a slot key, or `arm`). */
export type Callout = { id: string; text: string; at: V3; tag: V3 }
/**
 * A camera stop in world units: a station's `Framing` placed by the layout,
 * with what parks beside it (the board's stop also frames the integrator's
 * parked machine and the rail arm). `id` is the station's slot key, `frame`
 * the placement it moves with, `box` the station's footprint (its `h` is the
 * top above the floor), `span` the x extent of `pts`.
 */
export type Stop = {
  id: string
  label: string
  frame: FrameKey
  pts: Vector3[]
  span: Span
  box: Footprint
  el?: number
  min: number
  margin: number
  callouts: Callout[]
  dims: Dim[]
  print: readonly [number, number]
}
/** The placements, the arm's rail and the camera's stops, all in world units. */
export type LineLayout<D = unknown> = {
  at: Placement
  rail: { x0: number; x1: number; z: number }
  /** The transport's live path in its frame, null without one. */
  path: Path<D> | null
  extent: Span
  stops: Stop[]
  /** Everything, for the overview. */
  all: Vector3[]
}
/** The layout a path transport draws against: one with its path. */
export type PathLayout<D = unknown> = LineLayout<D> & { path: Path<D> }

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
  /** The layout's placements, eased so the line slides when a variant changes width. */
  at: Record<FrameKey, Place>
  /** What the plan was made from. */
  planned: { selected: ReadonlySet<string> | null; target: Setup['target'] | null; framework: Setup['framework'] | null; board: BoardVariant | null }
}
