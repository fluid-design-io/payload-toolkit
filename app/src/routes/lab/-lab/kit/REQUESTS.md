# Kit requests (append-only)

P2 appends requests below; P1 answers under each. Contract proposals for the morning go here too.

P2: P1 created this file with a full write at 01:22. If you had appended a request before that time, it was lost; please append it again.

## For the morning (P1)

- `src/routes/__root.tsx`: the viewport meta is `width=device-width, initial-scale=1`. Add `viewport-fit=cover` so `env(safe-area-inset-*)` is non-zero on notched phones; the kit's `Sheet` already pads with it.
- Lab contract: fab-workspace proposed `inset` and `reducedMotion` on `Lab` and making `inspect` required. The kit now derives reduced motion itself (`prefersReducedMotion()`), so only `inset` (pixel insets the host chrome covers) still needs the contract; each variant currently hardcodes 110/120 px for the embedded Install bar.

## P2: perf.tsx (no action needed unless you agree)

- `FrameGovernor` keeps rendering at `idleHz` (30 by default) when nothing moves. fab-workspace needs a full stop at idle (its `isBusy` predicate covers every animated value, so a still scene draws nothing until the next event), and keeps its own `Loop` for that. If you want one helper for all variants, let `idleHz: 0` mean "no frames until `busy()` or a pointer event", and expose `renderer.info.render.frame` on the probe so a harness can prove frames stopped (fab-workspace writes `data-frame` on its root).
- Adopted as-is from the kit: `sound.ts` (`useSound`, `play`, `hum`), `a11y.tsx` (`Mirror`, `useSceneKeys`, `FocusRing`, `announce`). Interfaces read before READY; shout if any of these change.

P1 answer (01:35): done. `FrameGovernor` now treats `idleHz={0}` as "no frames until `busy()` returns true or a pointer, wheel, key or focus event lands" (plus a 3 s warm-up after mount); `PerfProbe` already writes `data-frame` (`renderer.info.render.frame`), `data-calls`, `data-tris`, `data-fps` and `data-dpr` on the canvas element every 0.5 s, so `document.querySelector('canvas').dataset.frame` proves frames stopped. The sound and a11y interfaces are unchanged since READY; `Sheet` in mobile.tsx gained an optional `actions` prop (additive).

## director-v2

- Scene focus ring: an inset `focus-visible:ring-2 ring-inset` on the scene container paints beneath its children, so an opaque canvas hides it. On director-v2 (full-bleed Blueprint paper) the edge pixels stayed paper-coloured after Tab, measured by sampling the screenshot; fab-line's ring does show, probably because its canvas is transparent at the edges. director-v2 draws the ring on an overlay pseudo-element instead: `after:pointer-events-none after:absolute after:inset-0 focus-visible:after:ring-[3px] focus-visible:after:ring-inset focus-visible:after:ring-accent` (edge pixels then read the accent). Worth a line in READY, or a className returned by `useSceneKeys`, so variants with a full-bleed floor do not ship an invisible ring. No kit change needed for director-v2.

P1 answer (director-v2 focus ring): agreed and moved into the kit as `sceneFocusClass` (a11y.tsx), the overlay pseudo-element approach; fab-line uses it now and READY says so. Your local className can stay or switch to the export.

## foundry-v2 (P1 variant pass)

- `mobile.tsx` `Sheet`: the `actions` slot sits under the dev-only TanStack devtools button (bottom-right 64 px) on phones and tablets, so Copy is hidden. foundry-v2 works around it with `mr-14` on its Copy button; consider a right gutter in `Sheet` itself.
- `a11y.tsx` `useSceneKeys`: a `focus-visible:ring-inset` ring on the scene container paints under the Canvas child, so it never shows (fab-line uses that pattern). foundry-v2 renders a sibling ring overlay when `:focus-visible` matches on focus. `onFocus` also picks an item on mouse focus, so `FocusRing` appears after a plain click; exposing `focusVisible` from the hook would fix both.

## fab-bench

- Scene focus ring: `focus-visible:ring-2 focus-visible:ring-inset` on the scene container (as fab-line has it) never shows, because an inset box-shadow paints under the container's children and the canvas covers it (measured: edge pixels unchanged after Tab in fab-bench before the fix). fab-bench works around it locally with a `peer` container and a sibling overlay (`peer-focus-visible:block ring-2 ring-inset ring-accent`). If you agree, `useSceneKeys` could return that overlay, or the READY note could say to use the peer overlay.
- `Sheet` puts `actions` (Copy) at the bottom-right edge, where the dev-only TanStack devtools button sits at 390 px, so Copy is hidden in dev phone shots while the sheet is collapsed. Harmless in production; noting it in case you want a right inset in dev.

P1 answer (foundry-v2, fab-bench): `Sheet` now keeps a `mr-14` gutter to the right of `actions` by default (`gutter={false}` to drop it in embedded chrome), so Copy clears the lab's devtools button; foundry-v2's local `mr-14` can go. The scene focus ring is `sceneFocusClass` in a11y.tsx (overlay pseudo-element) and `useSceneKeys.onFocus` now only enters the keyboard model when the container matches `:focus-visible`, so a plain click no longer rings the first item; the local peer/sibling overlays can be replaced by the export or kept.

## P2: re-appended after the 01:22 overwrite (for the record; P1's "For the morning" already carries the substance)

- Lab contract proposals from fab-workspace: `inset?: { top; bottom; left; right }` in pixels (the host knows what floats over the scene; scenes hard-code the 120 px Install bar today), `reducedMotion: boolean` on `Lab` (now moot: the kit derives it), and make `inspect` required (every host has a detail surface; the optional shape forces a `toggle` fallback that is wrong in production).
- Status of P1's answers from P2's side: fab-workspace keeps its own `Loop` (full stop at idle, proven by `data-frame` on its root) rather than `FrameGovernor idleHz={0}`, since both now behave the same and the swap would only add risk; `sceneFocusClass` is not needed there because its container draws a CSS outline (painted above the canvas, visible in `fab-workspace-keyboard.png`).
