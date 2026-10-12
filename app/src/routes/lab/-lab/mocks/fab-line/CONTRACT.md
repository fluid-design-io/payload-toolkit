# Fab line contract

The fab line is a row of stations along +x. Each station slot is a registry of
variants. World settings and the URL pick one variant per slot, and the
layout reflows the line from the variants' footprints. This file is the
reference for anyone adding a variant or changing the line. The types live in
`core/contract.ts`; when this file and the types disagree, the types win and
the disagreement is a bug to fix in whichever is wrong.

## Ownership

| Folder | Slot | URL param | Default |
| --- | --- | --- | --- |
| `stations/cabinet/` | Inventory behind the table | `cabinet` | `drawers` |
| `stations/table/` | Pick table | `table` | first entry of `TABLES` |
| `stations/transport/` | Table to arm | `transport` | `belt` (`none` also ships) |
| `stations/integrator/` | Finishes seated chips | `integrator` | `probe` (placeholder) |
| `stations/board/` | App board | `board` | `pcb` |
| `stations/board/shared/swap/` | How the board's sockets swap parts | `swap` | `mix` |
| `stations/board/shared/signals/` | The accent dots that run along seated traces | `signals` | `heartbeat` (Classic also ships) |
| `chip/` | Part rendering and the close-up | `chip` | `package` |
| `themes/` | Tokens, lights, floor, walls | `theme` (`world` still read) | `blueprint` (`cleanroom` also ships) |
| `fx/` | Scene-wide effects and shared spark/glow primitives | `fx` | `none` |
| `layouts/` | How the stations are arranged | `layout` | `line` |
| `world/` | The slot table (`slots.ts`), the saved world store (picks, mods, merged lists) and the World settings sheet | `follow` | `chase` |
| `mods/` | Mod bundles, share links, code mods, World settings' Mods page | (none) | (none) |

`core/` holds what every slot shares: the contract types, the sim, the layout
helpers, the camera director, the toolbar, the call sheet and the inspector.
`../fab-line.tsx` is the entry that wires them together. A variant lives in its
slot's folder and touches nothing else; a change to `core/` or the entry is an
ordinary change, reviewed for every slot it affects. `REQUESTS.md` is the log of
the phase-2 build, kept for history.

## Adding a variant

1. Write the variant's data in `<name>.data.ts` in your folder as a value of
   the slot's type, and its component in `<name>.tsx`, loaded with
   `lazyComponent` from `core/lazy.tsx`:
   `export const hexapod: IntegratorVariant = { id: 'hexapod', label: 'Hexapod', ..., Component: lazyComponent(() => import('./hexapod').then((m) => m.Hexapod)) }`.
   The data module keeps everything the layout, the sim and World settings
   read (footprint, frame, tokens, the slot's functions) and never imports a
   component module, so the line ships only the components it shows. The entry
   loads a variant's components before it shows it, so a pick never blanks
   the scene.
2. Add it to your folder's `index.ts` registry array. The first entry is the
   default; reorder only when you mean to change the default.
3. Nothing else. World settings' World page shows every registry entry as a
   card in its slot's strip (the slot's category appears once it has two entries),
   `?<slot>=<id>` selects it, the layout reads its footprint, and the camera's
   stops come from its `frame`.

Every slot is one row of `SLOTS` in `world/slots.ts`: its label and icon, its
built-ins, whether World settings picks one variant or every variant is on,
older URL names, and the fields a mod's variant must carry. The store, World
settings, the URL, the Mods page, adoption and the entry iterate that table,
so a new slot is a new row there and a new type in the contract.

`id` is the URL value and must be stable: lowercase letters, digits and dashes. `label` is the card's caption; keep it
under about 14 characters. `thumbnail` is optional: an image URL the card shows
in place of its swatch (a 4:3 crop; themes otherwise draw their own tokens,
other slots an icon on a hue). Every variant type carries it.

## Frames and units

- World units are roughly metres. The floor is y = 0. +x runs along the line,
  left to right on screen; +z comes toward the default camera.
- A station draws in its own frame: the world frame moved by the `Place`
  (`{ x, y, z }`) the layout gives it. The built-in `line` layout only moves
  frames along x: the pick frame (cabinet and table) anchors the line at 0;
  the transport and board offsets follow from footprints. Other layouts may
  lift or move whole frames. Placements ease when they change, so the line
  slides.
- The board has a second, local frame inside its station frame: translate by
  `origin.x, origin.z`, scale by `origin.s`. Slots, routes, the dock and the
  integrator all use board-local units.
- Never read another station's constants. Use the anchor helpers in
  `core/line.ts` (`drawerWorld`, `pocketWorld`, `pathWorld`, `boardWorld`,
  `railNow`) when you need a world position.

## Shared shapes

- `Footprint`: `{ x0, x1, z0, z1, h }`, the station's body box on the floor in
  its own frame. The layout butts stations together by `x0`/`x1`; the Blueprint
  annotations, the station strip and the Cleanroom walls read the rest. Keep it
  honest: a footprint smaller than the body makes stations overlap.
- `frame` (`Framing`): how the station is framed and annotated, in its own
  frame. `pts` are the points the camera fits for the station's stop (keys
  1..N, the strip); `el` sets the stop's elevation in degrees, `min` the least
  width along x it frames (13 when unset, so a narrow station keeps its
  neighbours in view; 0 frames it alone) and `margin` its breathing room (1.22
  when unset, 1 is tight). The annotation anchors are `callout` (`{ at, tag }`,
  a label leader from the body to its tag; over the footprint's centre when
  unset), `print` (`[x, z]`, where a floor print's left end sits; in front of
  the footprint's middle when unset) and `dims` (`{ from, to, off }` lines a
  drawing measures; the footprint's length along its front when unset, `[]`
  for none). The cabinets share `cabinetFrame` (a close-up, a height
  dimension, the print right of the cabinet) and the tables `tableFrame` (a
  tight close-up of the pocket rows, so single chips are easy to hover).
- `Tokens`: every color a station may use. No hex literals in stations, chips or
  fx. If you need a color that is not a token, request it. Themes own the token
  values; a theme's Stage may keep its own room colors (glass, lamps) in a
  local table.
- `Tip` and `Guard`: the hover card and the drag guard. Every pickable mesh
  calls `tip.show/move/hide` and ignores clicks while `guard.moved`. `pickable()`
  in `core/scene.tsx` wires both.

## Slots

### Cabinet (`CabinetVariant`)
Shares the table's frame and sits behind it (keep z below the table's `z0`).
`drawer(aisle, out)` is where an aisle's off-table parts rest (hidden, scale
0.2); the sim flies parts in and out of it. The Component gets the aisles, the
active aisle, search match counts and `onOpen(aisle)`; opening a drawer sets the
lab focus category. An `InstancedMesh` whose instances move must be given a
fixed `boundingSphere` (three.js caches the first one it computes and then
misses clicks), as `drawers.tsx` does.

### Table (`TableVariant`)
A page is `bays` warehouse bays of 20 bins. Pocket `i` = bay-in-page × 20 +
index within the bay (level × 4 + slot), so a pick code like `B07-03-2C` names
a physical pocket. Search results fill pockets in order. `pocket(i, out)` is a
resting part's bottom centre; `fit` sets its scale (`min(max, size / widest
footprint)`). `cols` is the keyboard grid width. The Component gets `slots`
(pockets in use, holes included), the page label, and `setPage`; PageUp and
PageDown also page.

### Transport (`TransportVariant`)
`kind: 'path'`: a queue along a curve. `at(u, out)` is a part's bottom centre
`u` units along it (0 = entry, `length` = where the arm picks). Parts enter with
a `load` hop from their pocket, advance at `speed` and keep `gap` between them.
The Component reads `sim.carried` (each part's `u` and `pos`) to animate
machinery. `kind: 'none'`: no station; the arm picks queued parts straight from
their pocket or drawer, and the board moves up to the table. Changing the
transport sends carried parts back to the feed, so they re-enter the new one.

We chose a path queue over a per-part `route(from, to)` curve because spacing,
queueing and catch-up need positions along one shared path.

`wrap(site)` is the route itself, required for every path transport: a
polyline of two or more points in the transport's frame from `at(0)` to
`at(length)`, which may take the long way round. `site` gives the pick
footprint, the board footprint (with the integrator's) and the rail in that
frame, so the route can run around them. It returns `Wrapped<D>`:

```ts
type Wrapped<D> = { pts: Vector3[]; pace?: (s: number) => number; data: D }
type Path<D> = { length: number; at(u, out): Vector3; along(u): number; pts: readonly Vector3[]; data: D }
```

`pts` is the polyline. `pace(s)` is how many times faster than `speed` a part
moves at distance `s` along `pts`; values below 1 read as 1, so `speed` is the
slowest a part goes and `gap` stays a minimum spacing. `data` is whatever the
transport planned with the route (a course, its posts, its cue points). The
layout samples the route into `line.path`, folds the pace in, and hands
`data` back unchanged as `line.path.data`. `line.path.at(u)` is a part's
position at the sim's steady distance `u`; `line.path.along(u)` is the
distance along `pts` it has reached, so cue points kept in `data` as
distances along `pts` compare directly. The sim and `pathWorld` read
`sim.line.path`, the Component its `line` prop, never `at` directly; render
from the prop so a layout change re-renders it. The overview adds the route's
points. Keep nothing about the route in module state: everything the Component
needs travels in `data`. Declare a transport as `PathTransport<YourPlan>`, so
its `wrap` and its Component (`TransportProps<YourPlan>`) are checked against
each other; the registry forgets the plan type. A transport without a plan is a
`PathTransport` whose `wrap` returns `data: undefined`. The Component mounts
only with a path, so `line.path` is never null there; a layout that replaces
`line.path` keeps the transport's `data`. `at` and `length` describe the
straight run the layout butts against the table and the arm's bay.

The Conveyor wraps: it leaves the table, runs along the front of the campus,
rounds the board's far end and the integrator's parked machine, returns behind
the rail and enters the arm's bay where its footprint ends, so the layout is
unchanged.

`hum` (0..1, default 0) is how loud the belt's roller patter plays while parts
move. The Conveyor (and data mods built on it) sets 1 and the monorail 0.4,
for its wheels and chain lift; the tube, AGV and maglev stay silent between
their own event sounds.

A transport's own motion after the sim goes idle calls `keepAnimating()`
from its frame loop every frame while carriers run home, lids swing or effects
fade, and stops once everything has settled (see Budgets). Motion that never
settles, such as belt slats or a chain lift, never calls it and runs at the
idle rate. `Fleet.moving` (in `stations/transport/fleet.ts`) is false once
every carrier is docked.

### Board (`BoardVariant`)
`plan(parts, target)` returns board-local slots (plus ghosts and hatches for an
existing app); `route(parts, framework)` writes `route` on each placed
part (use `makeRoute` from `core/route.ts`: 45° chamfered corners, or square
ones). The sim re-plans when the selection, target, framework or board variant
changes, and bumps `version`. Board variants are declared in
`stations/board/index.ts` with `boardVariant`, which derives the origin,
footprint, stop frame and dock from the slab. Board components draw their own
art and hand the rest to `BoardLive` in `stations/board/shared/live.tsx`. `dock` is the board-local point an integrator connects to or parks
by. The Component gets `version`, the chosen `chip` (`BoardLive` draws the
ghosts with it as one `ChipBatch`), and `cycle.framework/database/pm` and the
chosen `swap` for its sockets (`Cpu`, `Memory` and `Power` in
`stations/board/shared/sockets.tsx`) and the chosen `signals` treatment,
which `BoardLive` renders over the seated traces (`host.core` exposes
`sampleRoute` and `viaDistances` for mod treatments). Seated parts are drawn by the chip
variant, not the board.

### Swap (`SwapVariant`)
How a socket trades its part when a click changes the framework, database or
package manager. A style is a table of acts by socket kind:

```ts
type SwapVariant = { id; label; thumbnail?; acts: Record<'cpu' | 'memory' | 'power', SwapAct> }
type SwapAct = { duration: number; arrive: number; rig: (c: Tokens, kind: SocketKind) => SwapRig }
type SwapRig = { root?: Object3D; frame(clock, old, next, dt): boolean | void; dispose?(): void }
```

The socket owns the swap: its machine (`swap/machine.ts`) takes the clicks,
keeps the clock and holds the leaving part in `old` and the arriving one in
`next`, each a group that pivots on its box's bottom centre. A click before
`arrive` (0..1) only changes which part arrives; a click after it waits for
the landing and chains one faster swap, latest click wins. The socket builds
the act's rig once per socket and token set, adds `root` under its frame,
calls `frame` every frame and `dispose` when either changes. While
`clock.active`, `frame` writes the whole transform and `visible` of both
parts from `clock.u`; the socket puts both at rest when the swap ends.
Return true to keep frames coming after the swap while effects linger.
`clock.from`/`to` are setup values and `fromBox`/`toBox` their resting boxes.
Fire one-shot beats with `crossed(clock, beat)`; `swap/kit.ts` has the
easing and window helpers. Make props ignore the pointer, since the socket
keeps an undrawn hit box over both footprints while it swaps.

Acts are values, so a style composes others: the default Mix is
`{ cpu: bench.acts.cpu, memory: slapstick.acts.memory, power: slapstick.acts.power }`.
`every(act)` puts one act on all three sockets. Under reduced motion every
style plays the stock calm glide (0.55 s, no props, no shake) instead of its
own acts. Built-ins: Mix, Slapstick, Bench tech, Arcade and Drop
(the calm baseline).

### Integrator (`IntegratorVariant`)
Renders inside the board-local frame for every agent, including `none` (render
nothing or a parked machine). `workTime(agent, part)` is the seconds of work per
seated chip; 0 skips the queue. The sim queues each seated chip, runs one job at
a time as `sim.work.job = { part, t (0..1), dur }`, writes `part.finish`, and on
completion sets `part.flash = 1` and emits `done`. Jobs for chips that are
removed are dropped. `footprint(board)` is what the integrator parks beside
the board, in the board's station frame: the layout adds it to `site.board`,
so transports route round it, adds its corners to the board's stop and widens
the line's extent. The machines integrator parks its pad past the board's far
end at the front corner, so every board's routes keep the front lane. Animate
travel to the chip inside the job's time; read `part.slot` (board-local) for
where it sits. `onCycle` clips on the next agent. The machines keep the line
animating as a transport does while the drone flies home or the hexapod walks
back, sparks, dust or smoke are in the air, or the last marks are still
cooling (4.5 s after `done`).

### Chip (`ChipVariant`)
A chip variant is data, so the line draws every live part, and every ghost,
in a few draws whatever their number:

```ts
type ChipBox = { size: V3; at: V3; paint: 'body' | 'pin'; edge: boolean }
type ChipLid = { x: number; y: number; w: number; d: number }
type ChipVariant = { id; label; thumbnail?
  boxes(spec): readonly ChipBox[]  // the package at scale 1, bottom centre at the origin
  lid(spec): ChipLid | null         // where the print lies on top, or none
  marking(ctx, w, h, item, code, spec, { body, ink }): void
  CloseUp: ComponentType<CloseUpProps>
}
```

`ChipBatch` (`core/parts.tsx`) turns `boxes` into one vertex template per
spec, packs the templates of a batch's entries end to end and draws them in
one fill and one hairline call; each vertex carries its entry's index and the
vertex shader moves it by that entry's row in a small float texture of poses,
written every frame. Body and metal colors are uniforms from the tokens, so a
theme change repacks nothing. `marking` paints a print over `w` × `h` logical
units (512 wide, the lid's aspect) on a context the atlas has already scaled
to one 256 × 128 cell of a shared texture (`core/atlas.ts`); never reset its
transform. Prints paint a few per frame (4 ms) and copy into their cell with
a sub-image upload; until its print lands a part shows a bare lid. Cells are
kept least recently used first, so paging back to a page reuses its prints,
and a cell on screen is never evicted.

`Parts` (`core/parts.tsx`) is the live batch: it poses each part from `p.pos`,
`p.scale` and `p.spin`, outlines held, queued, hovered, focused, flashing and
search-matched parts with one line draw, and picks parts through one undrawn
instanced footprint box per part. Clicks: seated parts call `onFocus(ref)`,
others `lab.toggle(ref)`, both behind `guard.moved`. The close-up is the
push-in (`cam.focusRef === ref`) and the decap (`cam.decap`): `Parts` mounts
the variant's `CloseUp` in the focused seated part's frame, and the close-up
writes `hideRef.current` true while its own meshes replace the package.
Measure closeness with `useThree().camera` to reveal guts progressively.
`p.finish` and `p.flash` carry the integrator's progress for beads or etch
marks.

### Theme (`ThemeVariant`)
`tokens.light` and `tokens.dark`, a `lens` (overview fov, elevation, framing
margin), a slate `scene` line, and a `Stage` with the lights (dim them by
`power.current` during a swap), floor, walls and annotations. Size everything
from `line` (`extent`, `stops[].box`, `rail`); stations move when variants
change. Hang labels, leaders, floor prints and dimension lines from each stop's
`callouts`, `print` and `dims` (world units), never from its id. Hide labels
while `cam.closeUp`.

### Layout (`LayoutVariant`)
`place(rig)` returns the `Placement`: where the pick, transport and board
frames sit. A layout only moves frames. The built-in `line` is `placeLine`
from `core/line.ts`, which butts them along x; a layout usually starts from it
and adjusts (the Tower sample lifts the pick frame by 4.3 m). Core's `lineOf`
derives the rest of the `LineLayout` from the placement: the rail, the
transport's live path, every station's framing placed into the world as a
stop, the overview points and the extent. Stops are keyed by the station's
slot (`cabinet`, `table`, `transport`, `board`) and carry the frame they move
with; the board's stop also frames what parks beside it, the integrator's
machine and the rail arm, which is a framed station of its own (its callout,
its rail's dimension) in the board's frame.
`Scenery` is optional, mounted after the theme's Stage in world units, and
should follow `sim.at` so it slides with the frames. The arm and its rail stay
on the floor and follow the board frame's x and z, so keep the board at y = 0
and keep the transport's end within the arm's reach.

### Fx (`FxVariant`)
Mounted last inside the Canvas with tokens and the sim. Default `none`. Shared
primitives (sparks, glows, heat) may live in `fx/` as plain exports for the
integrator and chip folders to import. An effect that spans the line sizes
itself from `sim.line` (`extent`, `stops`, `all`) in its frame loop: World
settings replace that object when a layout, transport or board changes, so
compare it by identity rather than measuring once. The Disco sample
(`mods/samples/disco/`) does this.

## Mods

The slot lists live in one zustand store, `world/store.ts`. World settings and
the URL read the built-ins first, then every enabled mod's variants, namespaced
`<mod>.<variant>` (`?theme=vaporwave.mall`); a mod variant's card names its
mod in its accessible label and title. The camera's follow mode (`chase`,
`ride`, `off`) is a slot like the others, which mods cannot add to. The store persists through zustand's `persist` middleware into
IndexedDB (idb-keyval's default database, key `fab-line:world`, version 1):

```ts
type Saved = {
  // A slot's pick by slot key, and each mod tool's variant by its id (`<mod>.<tool>`).
  // A missing entry, or an id no list holds yet, means the first variant.
  picks: Record<string, string>
  mods: { source: string; enabled: boolean; trust: string | null }[] // source is the bundle JSON
}
```

Worlds saved before follow and the tools' variants were picks (with `follow`
and `tools` fields) load with both folded into `picks`.

Storage is read asynchronously, so the entry renders nothing until the store
has hydrated and every saved mod has settled (mods get 1.5 s); the first
frame is already the saved world. URL params win on load and are not saved
until the user picks something, so a share link never overwrites the visitor's
world. Picks still write the URL; Reset world clears the saved picks (tool
variants included) and the slot params and keeps mods. Embedded chrome
reads and saves the world and shows the same sheet, but writes no URL. Mods from the old localStorage key
`fab-line:mods:v1` move into IndexedDB once.

A mod is one JSON bundle, which is also how it is stored and shared (`#fabmod=` plus deflate-raw base64url, so the
mod never reaches a server). Import accepts a `.fabmod.json` file, pasted JSON,
a lone `.js` module, or a folder with `fabmod.json` whose `main` names the
module (inlined as `code` on import). Fields:

- `fabmod: 1`, `id` (lowercase, digits, dashes), `name`, optional `author` and
  `description`. Every variant id, a recipe's or one a code mod returns, keeps
  to the same rule (`mods/guard.ts` checks both), so ids never break a
  `<mod>.<variant>` namespace or a URL; labels are cut to 24 characters.
- `theme`: data recipes `{ id, label, thumbnail?, base, scene?, lens?, tokens: { light?, dark? } }`.
  Tokens override the base theme's; the base theme's Stage stays, including
  its own room colors. Unknown token names are refused by name.
- `transport`: conveyor recipes `{ id, label, thumbnail?, via: [[x, z], …] }`. Corners
  run between leaving the belt's lane at `out` and re-entering it at `bay`.
  Each coordinate is a number or `name ± number`, with the names `out`, `bay`,
  `front`, `back`, `far`, `z`, `pick.x0|x1|z0|z1`, `board.x0|x1|z0|z1` and
  `rail.x0|x1|z`. Keep corners at least 2.2 apart (two belt radii): a shorter
  leg turns the belt tighter than it is wide.
- `thumbnail` (any recipe, or any variant a code mod returns): an image for the
  variant's World settings card. Data recipes accept only `data:image/` URLs,
  because data mods travel in share links and a remote image would tell its host
  when a viewer opens the sheet. Code mods are already trusted with the page, so
  a variant they return may use any URL; it loads with no referrer.
- `code`: an ES module whose default export is `(host) => ({ <slot>: [variants] })`,
  sync or async. It runs from a blob URL inside this page, so it must use
  `host.React`, `host.THREE`, `host.fiber` and `host.drei`, never its own
  copies. `host.drei` holds `Grid`, `Html` and `Line`, the helpers the line
  already loads, so a code mod never pulls in the whole of drei. `host.html` is htm bound to createElement, `host.core` is the line's
  kit (`Body`, `pickable`, `useSimEvents`, `fillMat`, `placeLine`,
  `pathWorld`, `makeBelt`, …), `host.builtins` are the stock registries,
  `host.swap` is the swap style kit (below), `host.keepAnimating` keeps frames
  at full rate (see Budgets) and `host.rapier()` loads rapier. Code runs with this site's origin, so it runs
  only after the user ticks "Run its code"; the trust is pinned to the
  source's SHA-256 and an edited mod asks again.

A code mod's transport follows the same contract: it is a path transport
whose `wrap` returns `{ pts, pace?, data }`, as the Tower sample's Pachinko
does.

A code mod adds socket swap styles under `swap`. `host.swap` holds what a
style needs: `every`, `crossed`, `span`, `easeIn`, `easeOut`, `easeInOut`,
`easeBack`, `wobble`, `rest` (puts a part at rest on its box), `kick(amount, hz?)`
for the scene's jolt, and `play(name)` with the names in `host.swap.sounds`
(others are ignored). Borrow a built-in's acts from `host.builtins.swap`. A
minimal style that blinks the new part in:

```js
export default ({ swap }) => ({
  swap: [{
    id: 'blink',
    label: 'Blink',
    acts: swap.every({
      duration: 0.8,
      arrive: 0.5,
      rig: () => ({
        frame(clock, old, next) {
          if (!clock.active) return
          swap.rest(old, clock.fromBox)
          swap.rest(next, clock.toBox)
          old.visible = clock.u < 0.5
          next.visible = clock.u >= 0.5
          if (swap.crossed(clock, 0.5)) swap.play('chirp')
        },
      }),
    }),
  }],
})
```

To change one socket only, spread a built-in: `acts: { ...host.builtins.swap[0].acts, power: myAct }`.
Every socket needs an act with a `rig` function, a `duration` of up to 10 s
and an `arrive` between 0 and 1, or the mod is refused with a message naming
the act. The Teleporter sample (`mods/samples/teleporter/`) is a fuller
template with its own props.

A code mod adds toolbar buttons under `tools`, the one slot whose variants are
all on at once: nothing picks one per world. Every enabled mod's tools get a
button in the camera-stop toolbar after the stations, in install order. The host draws the
button, its popover, its tooltip and its key; the mod never renders toolbar
React, so every tool looks, reads and answers keys the same way.

```ts
type Tool = {
  id: string; label: string; description?: string
  icon?: string // SVG path data on a 24 × 24 grid; a video camera (view) or tools (toggle) when unset
  variants?: { id: string; label: string; description?: string; thumbnail?: string }[]
  Overlay?: ComponentType<{ sim; c; mode; top; variant }> // HTML over the canvas while the tool is live
  Scenery?: ComponentType<{ sim; c; mode; line; live; variant }> // in the scene while the mod is on
} & (
  | { kind: 'view'; shot(ctx: { sim; t; dt; aspect; variant }, out: { pos: Vector3; look: Vector3; fov: number }): boolean | void }
  | { kind: 'toggle' }
)
```

A `view` joins the camera stops: one of them is the camera at a time, its
key continues the stops' numbering (0 is the whole line; views behind More
keep theirs), pressing it again starts it over, and a drag or zoom frees the
camera. While it is picked the director calls `shot` every frame with `t`,
the seconds since it was picked, and eases toward the pose it writes;
returning true cuts there instead. The view owns the camera: follow shots and
the aisle focus wait until the user leaves it, and only a chip close-up takes
over (its Overlay steps aside meanwhile). `out` holds the last pose on entry.
A `toggle` is an independent layer, on or off for the visit, whatever the
camera does: its Overlay shows and its Scenery's `live` is true while it is on.

A tool with two or more `variants` shows a corner mark, and its button opens
a popover beside the toolbar listing them, with thumbnails when given. Picking
a view's variant picks the view with it (again, if it is live); picking a
toggle's turns it on with it, and pressing its live variant turns it off. The
pick is saved in the world's picks under the tool's id (`<mod>.<tool>`),
restored on load and cleared by Reset world; `variant` is that
pick, or the first variant when the saved one is gone, or null for a tool
without variants. The toolbar shows three mod tools; the rest sit behind a
More button that opens the same popover with a section per tool, so the
column fits a phone.

`top` is the pixels of the scene's top that the page's header covers, so
overlay text can sit under it. Overlays are above the canvas and below the
toolbar and sheets, so a `backdrop-filter` grades the picture alone. Share
state between `shot` and the components through the mod's closure. A tool
needs a `kind`, a view a `shot` function, a string icon of path commands,
variants with distinct string ids and labels, and components for `Overlay` and
`Scenery`, or the mod is refused with a message naming the tool. The CCTV
sample (`mods/samples/cctv/`) is the template: poles with cameras as its
Scenery, a cutting feed as its shot, a monitor grade as its Overlay, and Auto
cycle, Follow part and CAM 01..06 as its variants.

Every variant a mod contributes is checked against its slot's `fields` in
`SLOTS` and guarded (`mods/guard.ts`): each component renders inside an error
boundary, and each function (`place`, `drawer`, `pocket`, `at`, `wrap`, `plan`,
`route`, `workTime`, `footprint`, `boxes`, `lid`, `marking`) runs inside
try/catch and returns what the slot default's returns. The first throw marks
the mod `error` and drops it out of the lists, so the slot falls back to its
default, and from then on its guards stop calling it. A transport's `wrap`
that returns fewer than two points counts as a throw. A swap style's `rig`,
`frame` and `dispose` are guarded the same way: the running swap lands the new
part at rest, and the sockets switch to the default style. A view tool's
`shot` runs on a scratch pose: a throw, or a pose that is not finite, has its
eye on its look point or a fov outside 1..150, marks the mod `error`; the
camera holds the last good pose until the toolbar drops the view, then
returns to the overview, as it does when a mod with the picked view is
switched off or removed; a gone toggle is off. Samples live in `mods/samples/`.

## Camera

The director (`core/camera.tsx`) frames the overview, the stops, the
follow shots and the installed mods' view tools (see Mods). Every way to point
the camera is a shot provider in `SHOTS`, asked in priority order each frame;
the first whose `claims(ctx)` holds takes the frame:

```ts
type ShotProvider = { id: string; claims(ctx): boolean; shot(ctx, out): boolean | void; closeUp?: boolean; hold?: boolean; rate?: number }
```

`shot` writes the pose it wants into `out` (and `out.framed`, the points a
framed shot fits, for the lift's cap); returning true cuts there instead of
easing at `rate` (2.4 when unset). `closeUp` hides the themes' labels and
`hold` keeps the lift's cap the shot was taken with. The order is `chip` (the
focused seated chip's push-in or die view), `view` (the picked mod view
tool's own `shot`, the same signature), `chase` and `ride` (the part last
added, on its way and still wanted), `seated` (that part while its trace
draws, the integrator works it or its finish flashes), `aisle` (every stop in
the pick frame, for 2.8 s after an aisle opens), `free`, `stop`, `portrait`
(the line's last two stops, top to bottom, on a canvas taller than wide) and
`overview`. Follow shots, the aisle and the close-up wait while the user holds
the camera (a drag or zoom, until the next add), and follow shots wait 1.4 s
after the last press, so picking parts keeps the table in view. `cam.mode`
reports the claiming provider's id.

The user's gestures are map controls on a free orbit (look point,
azimuth, elevation, distance): drag moves the campus under the pointer,
right-drag, Alt-drag, Shift-drag or two fingers orbit, and the wheel or a pinch
dollies toward the floor point under the pointer. The look point stays over the
campus (`line.extent` along x, the stops' depth along z).

A stop frames its points widened to its `min` width along x, with its
`margin` (both from the station's `Framing`). The page's chrome is measured:
the host marks what floats over the scene (/lab's bar, the workspace's
toolbar and Install bar) and the scene marks its own (the camera-stop strip,
/lab's search and call sheet) with `data-scene-chrome`, and `useRoom` in
`core/insets.ts` measures them against the scene's root from their layout
boxes (so chrome sliding away under the open sheet keeps its place). Each
piece counts against the one edge where it hides the least of the scene. A
framed shot keeps clear of the result plus 16px, and of the header's 48px
canvas fade at the top (`cam.insets`); the scene publishes that top as
`--scene-fade`, which the workspace's canvas mask reads. The strip rests its
left gutter above the chrome in its column, and the inspector sits under the
header at the right. A portrait canvas is one taller than it is wide.

The open World settings sheet lifts the whole picture by 40 % of its height,
following the sheet's spring, in every shot: a lens shift
(`PerspectiveCamera.setViewOffset`) applied after the shot, so no shot moves
or zooms. The lift stops where the framed shot's top, plus 40px for its labels
(a free, follow or close-up shot's look point), would pass under
`cam.insets.top`. That cap is measured on the shot the camera is heading for
and eases with the camera, so a cut never jumps the picture; a free shot
keeps the cap it was taken with, so the picture never slides under a drag or
zoom. Picking, `zoomAt` and `cam.visible` read the shifted projection, so they
stay aligned. The same view offset carries the scene-wide shake from
`core/jolt.ts` (`kick(amount, hz?)`), zero under reduced motion. The
director's stats (`data-stats` on the scene root) report `mode`, `lift`, `jolt` (the largest shake in pixels since the last report), the
pose as `eye` (position, look point, fov) and `view` (a stop or view tool id,
`overview` or `free`) for harnesses. Draw calls, triangles and fps are on the
canvas element's dataset, from `PerfProbe` in `kit/perf.tsx`.

## Sim and events

`core/sim.ts` owns the part state machine:
`home → queued → carried → held → seated → toss → home`. `Part` and `Sim` are
in the contract; treat them as read-only except the fields a slot owns
(`finish` is the sim's, write nothing). Events (`queue`, `load`, `servo`, `seat`,
`chirp`, `toss`, `work`, `done`) are kept with a sequence number; read them with
`useSimEvents(sim, fn)` from `core/scene.tsx`, which keeps your own cursor. The
entry already plays sounds and announces seats; do not play sounds for camera
moves. It drives the belt patter (`hum` in `kit/sound.ts`) at the transport's
`hum` level times how much is moving, and writes that level on the scene
root as `data-hum` for harnesses.

The arm's step callbacks read `sim.wanted` and `sim.agent`, never a captured
`lab`, so a part removed mid-journey never seats. Keep that rule in any code
that runs later than the frame it was created in.

## Budgets and rules

- Draw calls: the whole line is 120 at real scale today; target < 150 real,
  < 250 viral. Merge static geometry with `Body` (one fill and one hairline draw
  per body), instance repeats, and avoid per-object outline meshes.
- No per-frame allocations in `useFrame`; dispose textures and geometries you
  create (`useEffect` cleanup).
- `reducedMotion` from `core/three.ts` (read once from `kit/env.ts`): no idle
  loops, shorter tweens, no flashes above 3 Hz.
- Frames are on demand. `FrameGovernor` (`kit/perf.tsx`) renders at full rate
  while anything calls `keepAnimating()` (`kit/busy.ts`, `host.keepAnimating`
  for code mods), and at 20 Hz otherwise (4 Hz under reduced motion; the
  check allows 4 ms of frame jitter, so idle frames land every third display
  frame at 60 Hz and every sixth at 120 Hz). Call
  `keepAnimating()` from your frame loop on every frame you moved, or from an
  event that starts motion; `keepAnimating(seconds)` holds full rate for a
  stretch. Nothing registers: stop calling once you settle, and frames drop to
  the idle rate a frame later, also when you unmount. Today the sim (any part
  moving, any queue or integrator job), the camera's easing and the picture's
  lift, a ringing jolt, the theme change, transports, integrators, socket swaps
  and their lingering effects, cabinet units and the close-up's peel call it,
  and the governor holds full rate for its first 3 s and 700 ms after input. An idle hover still animates at
  20 Hz. Never call `invalidate()` to smooth your own motion: the governor
  would not see those frames, so it could neither drop to the idle rate nor
  adapt the pixel ratio.

## Verify

From `app/`: `bun check 2>&1 | grep 'mocks/fab-line'` prints nothing,
and `bun run test` passes. Harness:
`bun shot.ts fab-line <out> --query '<slot>=<id>' ...` from
`/private/tmp/claude-502/-Users-oliverpan-Desktop-Tutorials-payload-toolkit/9fb32aa3-bd64-457d-89ef-9af8d30ff2b1/scratchpad/r5/tools`
(see its header for steps; `--path '/workspace?view=factory'` loads the
workspace's embedded view). Check both themes, real and viral scale, full and
embedded (1000x780), phone (390x844), and that `document.querySelector('[data-fab]').dataset.slots`
names your variant.
