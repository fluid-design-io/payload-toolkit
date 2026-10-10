# Fab line requests

Append-only. One section per request: who you are (your folder), what you need
changed outside your folder (the exact type or file change), why, and how you
are working around it meanwhile. The owner of the target file answers under
your section. Never edit a file you do not own to make your own request land.

Package requests (new dependencies) go here too; nobody edits package.json.

## Phase 1 (core, entry) open items

- Tokens: no station needs a color beyond the current `Tokens` set. If a phase-2
  design does, request the token name and a light and dark value per theme.
- `Lab` contract proposals from round 4 (`inset`, required `inspect`) are still
  open in kit/REQUESTS.md; the entry keeps the hard-coded 120 px Install bar
  reserve in embedded chrome.

## Integrator (`stations/integrator/`, `fx/`)

1. Busy source for core (`core/sim.ts` `simBusy`, `core/contract.ts`). Want
   `IntegratorVariant.busy?: (sim: Sim) => boolean`, OR-ed into `simBusy`. Why:
   after the last job the drone flies home and lands, the hexapod walks back
   and crouches, and sparks, dust and smoke settle; at 30 Hz that motion
   stutters. Workaround: the machines call `invalidate()` from their own
   `useFrame` until they are settled (bounded: landed, rotors stopped, no live
   particles), so the frame governor's dpr adaptation does not see those frames.
2. `cam: ChipCam` on `IntegratorProps` (core). Why: lid etch marks must hide
   while the chip close-up lifts the lid. Workaround: marks skip a chip when
   the camera is within 2.6 footprints of it.
3. For `chip/`: the integrator draws the finish marks for every seated chip
   from `p.finish` (solder beads at each joint, one instanced draw; etched lid
   strokes, one hairline draw), so chip variants need not draw beads or etch
   from `finish`. Joint positions mirror `chip/package.tsx`'s lead layout
   (`n = max(3, floor(len / 0.1))`, foot at edge + 0.78 lead for QFP/SOIC);
   tell me here if that layout changes.
4. For `themes/`: `fx=bloom` mounts an `EffectComposer`. A theme that mounts
   its own composer would render twice; reuse `glowGain` from `fx/glow.ts`
   (raise it while your composer runs) instead, and say so here so the bloom
   fx can step aside.

## chip/ (phase 2): close-up depth

The chip close-up now peels in five stages (Package, Lid off, Section A–A,
Die, Circuit; `chip/depth.ts`). Scroll, pinch and +/− drive the depth while
the camera is on the focused chip, and Escape climbs one stage before it lets
the focus go. Requests for frozen files:

1. **core/camera.tsx `chipShot`, top-down offset.** `tmp.set(0.0001, h, 0.0001)`
   makes `lookAt` roll the view 45°, so the die and its print read as a
   diamond. Change it to `tmp.set(0, h, 0.0001)` so +x is screen right.
   Workaround: the die rises onto an inspection plate that yaws to the
   camera's screen-up each frame, so its text is upright either way.
2. **core/camera.tsx `chipShot`, portrait.** The push-in distance ignores
   aspect, so at 390x844 the package is cropped left and right. Use
   `Math.max(r, r / aspect)` for the shot radius when `cam.portrait`.
   Workaround: none in chip/; the plate itself sizes to the narrower side.
3. **Wheel and pinch while focused.** The kit gesture's wheel calls `zoomBy`,
   which sets `cam.manual` and drops the push-in. chip/ consumes wheel and
   two-finger pinch in a window capture listener only while the camera is
   within 12 chip radii of the focused seated chip, and lets everything else
   through. Cleaner: add `depth?: (delta: number) => boolean` to `ChipCam`,
   and have the entry's `onWheel`/`onZoom` call it first while `cam.focusRef`
   is set (true means consumed). chip/ would then drop its listeners.
4. **Inspector decap button.** chip/ writes `cam.decap` when depth crosses
   into the top-down stages, so the entry's `decap` React state (button label
   "Decap the die" / "Re-lid chip") goes stale. The depth gauge now covers the
   same action. Either drop that button, or read `cam.decap` in render. chip/
   honours an outside toggle meanwhile (true jumps to Die, false back to
   Package).
5. **Busy source.** Depth eases for about 0.8 s after the last wheel tick;
   past the governor's 700 ms wake it drops to 30 Hz for the tail. Add
   `busy?: boolean` to `ChipCam` and OR it into the entry's `busy()`; chip/
   would set it while `depth.value !== depth.target`.
6. **Director help text.** Add "Scroll or pinch a pushed-in chip to peel it
   open; + − step, Escape climbs out." The live region announces it on
   focus meanwhile.

## Theme (`themes/`)

1. Reply to integrator item 4. No theme mounts an `EffectComposer`. A theme's
   screen pass is `Grade` in `themes/grade.tsx`: an SVG filter on the canvas
   element (CSS `filter: url(#…)`), CSS layers over the canvas, an opaque
   `scene.background`, and `gl.toneMapping = NoToneMapping`. The Stage sets
   these on mount and restores them on unmount. They compose with `fx=bloom`:
   the filter runs on the composer's output. Riso, Phosphor (dark) and Manual
   ink use it.
2. Contract proposal for core (`core/contract.ts`, `../fab-line.tsx`): add
   `ThemeVariant.grade?: Record<Mode, Grade>`. The entry would then own the
   canvas filter, layers, clear color and tone mapping, instead of a Stage
   writing them onto the renderer and the canvas at runtime. That also lets
   the swap's black-out cover the grade change. Workaround: `<Screen grade />`
   inside each Stage, as above.
3. Phosphor is monochrome by filter, and Riso is two inks by filter, so any
   station color, chip art or fx color is folded into the theme's inks. Riso
   tokens are plate codes, not display colors: red-channel darkness is ink A
   and green-channel darkness is ink B in light mode, and red and green
   brightness carry them in dark mode. Stations need no change. A station
   that draws a raw hex instead of a token prints unpredictably in Riso.
4. For core: drei `ContactShadows` (via `LineShadow`) drew nothing on this
   line, even with `frames={120}`. Cleanroom's shadow was invisible in the
   phase-1 shots too. `LineShadow` now draws `FootShadows` (one baked blurred
   texture per station footprint, leaning toward +x +z), which costs no depth
   pass and follows the layout.

## cabinet (stations/cabinet/): per-station minimum stop width

- What: `core/camera.tsx` widens every stop to `MIN_STOP = 13` m along x, so a
  cabinet's own `frame` cannot bring the camera closer than about 80 px/m at
  1440x900. Proposed type change in `core/contract.ts`:
  `Station = Variant & { footprint; frame; el?; minSpan?: number }`, with
  `layoutLine` copying it onto `Stop` and `stopPts` using
  `stop.minSpan ?? MIN_STOP`.
- Why: the paternoster's tray lips and call panel, and the vending machine's
  price tags, are legible when zoomed but small at the stop. A cabinet stop of
  about 8 m would make them read without scrolling.
- Meanwhile: each variant carries one large in-world sign for the active aisle
  (paternoster crown, vending selection panel, pegboard's painted outline), so
  the stop reads at 13 m, and the tooltips name every unit.
- FYI, no change needed: cabinet mechanisms call `invalidate()` from their own
  `useFrame` only while they move (a tray turning, a coil vending), so their
  motion stays at full rate after the 700 ms input window without a new busy
  source in the entry.

## transport (stations/transport/)

1. **Belt hum plays for every transport.** `Simulator` in `../fab-line.tsx` calls
   `hum(...)` every frame whatever the transport, so the pneumatic tube, the
   monorail, the AGVs and the maglev all drone like a conveyor. Request: an
   optional `hum?: number` on the `path` variant of `TransportVariant` in
   `core/contract.ts` (gain multiplier, default 1), and the entry multiplying
   its `hum(level)` by `rig.transport.kind === 'path' ? (rig.transport.hum ?? 1) : 0`.
   Transport would set `hum: 0` on tube, AGV and maglev and `0.4` on the
   monorail. Meanwhile the hum stays on for all of them.
2. **Transport voices.** `kit/sound.ts` has fixed voices, so each transport's
   sound is a cadence of existing ones: tube `toss` on launch, `drawer` on
   arrival, `tick` as an empty capsule drops into the hopper stack; monorail
   `tick` per rail joint under each moving trolley, `servo` on hoist, `drawer`
   on the lowered drop; AGV `servo` on departure and every corner, `page` beep
   at the pickup; maglev `chirp` on lift-off, `tick` on settle. Request (kit
   owner): an exported `voice(name, { gap, play(ctx, out, at) })` registrar,
   or four named voices (`whoosh`, `clack`, `beep`, `glide`), so a transport
   can own a timbre without a second AudioContext. Workaround above is live.
3. **A transport busy source.** Carriers (capsules, trolleys, pucks, movers)
   keep moving for up to about 2 s after the arm takes the last part: an empty
   returning home. `simBusy` does not see them, so if the arm finishes first
   that return runs at the 30 Hz idle rate. Request: optional `busy?: () => boolean`
   on the `path` variant, OR-ed into the entry's `busy`. Each transport would
   return its fleet's `busy()`. Meanwhile returns mostly finish inside the
   arm's seat steps; when they don't, they ease at 30 Hz.

## board (`stations/board/`)

1. **FYI for chip/: ghost markings.** `chip.marking` now reads `item.category`;
   board Ghosts used to pass a partial item and crashed the canvas. Board now
   passes a full `CatalogItem` stand-in (kind `block`, the band's first group
   as category, source `your-app`). No change needed in chip/.
2. **FYI, fixed in board/: the PCB's power stage and MongoDB NAND were buried.**
   `useDrop` writes `position.y` on its ref group, and Power and the NAND put
   that ref on the group carrying `y = BY`, so both sat at y = 0 inside the
   slab since phase 1. `shared/sockets.tsx` now keeps the surface height on an
   outer group. Anything else using `useDrop` on a positioned group has the
   same trap; `core/scene.tsx` could add the drop to a base y instead.
3. **Tokens (themes/, optional): a lightness for hue-tinted lines.** The
   breadboard's jumpers are `tint(hue, max(s, 55), clamp(l, 42, 58))`,
   because `l` is tuned for fills (Blueprint light is 80, too pale for a
   wire). A `lineL` token per mode would let a theme art-direct it.
   Workaround above is live.
4. **Contract (core, optional): a board busy source.** The stack spreads its
   layers while the pointer is over it; after the 700 ms input window that
   ease runs at 30 Hz. `BoardVariant.busy?: () => boolean` OR-ed into the
   entry's busy would make it smooth. Meanwhile it eases at 30 Hz.
## Theme (`themes/`), continued

5. For `fx/` (bloom): with `fx=bloom` on a dark floor, the composer's closing
   `ToneMapping(ACES)` re-tone-maps themes that set `exact` (Riso, Phosphor,
   Manual ink). Riso dark still separates, but its aqua ink prints visibly weaker
   (by eye, not measured), as in shots/r5/theme/wip/bloom-riso-o.png. If the composer skipped the
   ACES pass when `gl.toneMapping === NoToneMapping`, those themes would keep
   their exact inks. Also, under the composer the HUD reads `1 calls`. A guess at the
   cause: each pass resets `renderer.info`, so draw-call reports with bloom
   on may need `info.autoReset = false` around the composer.
