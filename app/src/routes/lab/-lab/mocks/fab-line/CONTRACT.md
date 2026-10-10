# Fab line contract

The fab line is a row of stations along +x. Each station slot is a registry of
variants. The Director panel and the URL pick one variant per slot, and the
layout reflows the line from the variants' footprints. This file is the
contract phase-2 agents build against. The types live in `core/contract.ts`;
when this file and the types disagree, the types win and the disagreement is a
bug to report in `REQUESTS.md`.

## Ownership

| Folder | Slot | URL param | Default |
| --- | --- | --- | --- |
| `stations/cabinet/` | Inventory behind the table | `cabinet` | `drawers` |
| `stations/table/` | Pick table | `table` | first entry of `TABLES` |
| `stations/transport/` | Table to arm | `transport` | `belt` (`none` also ships) |
| `stations/integrator/` | Finishes seated chips | `integrator` | `probe` (placeholder) |
| `stations/board/` | App board | `board` | `pcb` |
| `chip/` | Part rendering and the close-up | `chip` | `package` |
| `themes/` | Tokens, lights, floor, walls | `theme` (`world` still read) | `blueprint` (`cleanroom` also ships) |
| `fx/` | Scene-wide effects and shared spark/glow primitives | `fx` | `none` |

`core/` and `../fab-line.tsx` belong to phase 1 and are frozen in phase 2. Edit
only your own folder. To change anything outside it, append a request to
`REQUESTS.md` (who, what, why, the exact type change you want) and work around
it in your folder until it lands.

## Adding a variant

1. Write the variant in your folder as a value of the slot's type, for example
   `export const hexapod: IntegratorVariant = { id: 'hexapod', label: 'Hexapod', ... }`.
2. Add it to your folder's `index.ts` registry array. The first entry is the
   default; reorder only when you mean to change the default.
3. Nothing else. The Director lists every registry entry (segmented control up
   to three entries, a select beyond that), `?<slot>=<id>` selects it, the
   layout reads its footprint, and the camera's stops come from its `frame`.

`id` is the URL value and must be stable. `label` is the Director text; keep it
under about 14 characters.

## Frames and units

- World units are roughly metres. The floor is y = 0. +x runs along the line,
  left to right on screen; +z comes toward the default camera.
- A station draws in its own frame: the world frame shifted along x by the
  offset the layout gives it. The pick frame (cabinet and table) anchors the
  line at offset 0; the transport and board offsets follow from footprints.
  Offsets ease when a variant changes width, so the line slides.
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
- `frame`: points the camera fits for the station's stop (keys 1..N, the strip).
  `el` optionally sets the stop's elevation in degrees.
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

### Board (`BoardVariant`)
`plan(parts, target)` returns board-local slots (plus ghosts and hatches for an
existing app); `route(parts, style, framework)` writes `route` on each placed
part (use `makeRoute` from `core/route.ts`). The sim re-plans when the
selection, target, routing style, framework or board variant changes, and bumps
`version`. `dock` is the board-local point an integrator connects to or parks
by. The Component gets `version`, the chosen `chip` (render ghosts with
`chip.Package` and `chip.marking`), and `cycle.framework/database/pm` for its
sockets. Seated parts are drawn by the chip variant, not the board.

### Integrator (`IntegratorVariant`)
Renders inside the board-local frame for every agent, including `none` (render
nothing or a parked machine). `workTime(agent, part)` is the seconds of work per
seated chip; 0 skips the queue. The sim queues each seated chip, runs one job at
a time as `sim.work.job = { part, t (0..1), dur }`, writes `part.finish`, and on
completion sets `part.flash = 1` and emits `done`. Jobs for chips that are
removed are dropped. `footprint`/`frame` (board station frame) extend the board
stop and the line's extent, for a machine parked past the board's end. Animate
travel to the chip inside the job's time; read `part.slot` (board-local) for
where it sits. `onCycle` clips on the next agent.

### Chip (`ChipVariant`)
`Part` draws one live part anywhere on the line: copy `p.pos`, `p.scale` and
`p.spin` onto your root group every frame. Clicks: seated parts call
`onFocus(ref)`, others `lab.toggle(ref)`, both behind `guard.moved`. The close-up
is the push-in (`cam.focusRef === ref`) and the decap (`cam.decap`); measure your
own closeness with `useThree().camera` to reveal guts progressively. `Package`
is a still package (ghosts). `marking` prints a lid texture the caller disposes.
`p.finish` and `p.flash` carry the integrator's progress for beads or etch
marks.

### Theme (`ThemeVariant`)
`tokens.light` and `tokens.dark`, a `lens` (overview fov, elevation, framing
margin), a slate `scene` line, and a `Stage` with the lights (dim them by
`power.current` during a swap), floor, walls and annotations. Size everything
from `line` (`extent`, `stops[].box`, `rail`); stations move when variants
change. Hide labels while `cam.closeUp`.

### Fx (`FxVariant`)
Mounted last inside the Canvas with tokens and the sim. Default `none`. Shared
primitives (sparks, glows, heat) may live in `fx/` as plain exports for the
integrator and chip folders to import.

## Sim and events

`core/sim.ts` owns the part state machine:
`home → queued → carried → held → seated → toss → home`. `Part` and `Sim` are
in the contract; treat them as read-only except the fields a slot owns
(`finish` is the sim's, write nothing). Events (`queue`, `load`, `servo`, `seat`,
`chirp`, `toss`, `work`, `done`) are kept with a sequence number; read them with
`useSimEvents(sim, fn)` from `core/scene.tsx`, which keeps your own cursor. The
entry already plays sounds and announces seats; do not play sounds for camera
moves.

The arm's step callbacks read `sim.wanted` and `sim.agent`, never a captured
`lab`, so a part removed mid-journey never seats. Keep that rule in any code
that runs later than the frame it was created in.

## Budgets and rules

- Draw calls: the whole line is 120 at real scale today; target < 150 real,
  < 250 viral. Merge static geometry with `Body` (one fill and one hairline draw
  per body), instance repeats, and avoid per-object outline meshes.
- No per-frame allocations in `useFrame`; dispose textures and geometries you
  create (`useEffect` cleanup).
- `reducedMotion` from `core/three.ts`: no idle loops, shorter tweens, no
  flashes above 3 Hz.
- Frames are on demand: full rate while `simBusy(sim)` is true (any part moving,
  any queue or integrator job), the camera eases, or within 700 ms of input;
  30 Hz otherwise (4 Hz under reduced motion). An idle hover still animates at
  30 Hz; motion that must be smooth belongs inside a job. If you need another
  busy source, request it in `REQUESTS.md`.

## Verify

From `app/`: `bunx tsc --noEmit 2>&1 | grep 'mocks/fab-line'` prints nothing,
and `bun run test` passes. Harness:
`bun shot.ts fab-line <out> --query '<slot>=<id>' ...` from
`/private/tmp/claude-502/-Users-oliverpan-Desktop-Tutorials-payload-toolkit/9fb32aa3-bd64-457d-89ef-9af8d30ff2b1/scratchpad/r5/tools`
(see its header for steps; `--path '/workspace?view=factory'` loads the
workspace's embedded view). Check both themes, real and viral scale, full and
embedded (1000x780), phone (390x844), and that `document.querySelector('[data-fab]').dataset.slots`
names your variant.
