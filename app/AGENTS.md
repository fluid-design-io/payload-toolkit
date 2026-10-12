<!-- intent-skills:start -->
## Skill Loading

Use the repository’s installed Intent. If it is unavailable, report the missing dependency instead of downloading a replacement.
Before editing files for a substantial task:
- Run `bun run intent:list` from this directory to see available local skills.
- If a listed skill matches the task, run `bun ./node_modules/@tanstack/intent/dist/cli.mjs load <package>#<skill>` before changing files.
- Use the loaded `SKILL.md` guidance while making the change.
- Monorepos: when working across packages, run the skill check from the workspace root and prefer the local skill for the package being changed.
- Multiple matches: prefer the most specific local skill for the package or concern you are changing; load additional skills only when the task spans multiple packages or concerns.
<!-- intent-skills:end -->


## Registry web app

This is the repository web app, the private package `payload-toolkit-web`: an
independent Bun project inside Payload Toolkit, not a workspace. Install and run
everything from this directory. Keep the toolkit CLI, its canonical catalog and
its package publication unchanged. Routes: `/` (landing), `/workspace` (the
configurator) and `/lab` (client-only React Three Fiber mocks). Development
tools stay in development.

Intent and the TanStack CLI are exact local dev dependencies; use
`bun run intent:list` and the installed Intent. Intent's `intent` binary
collides with `@tanstack/devtools`'s, so both Intent scripts call the installed
entry directly. Intent ships no Form, Store or Query skills in these releases:
read the installed package source/types and official docs. Its warnings about
devtools-event-client 0.5.0 and Form's private 0.4.4 are accepted; do not force
overrides.

### Stack and checks

Use Node 24.21.0 and Bun 1.4.3. React 19, TanStack Start and file Router run on
Vite 8/TypeScript 6 with Tailwind v4. Form 1.33.5 and Store 0.11.2 are exact
dependencies; Store 0.11 uses `useSelector` (`useStore` is deprecated). Keep the
generated Query SSR dehydration integration and scope each QueryClient to a
router factory call. Never create a module-level application store or
QueryClient shared across SSR requests; the isolated instances in
`scripts/verify-stack.tsx` are for that command only.

Icons come from `@remixicon/react` (pinned 4.9.0). Import them by name, as in
`import { RiStackLine } from '@remixicon/react'`, so the build keeps only the
icons in use; do not hand-draw inline SVGs. Compose conditional class names with
`cn` from `@heroui/react`, never template literals.

React Compiler 1.0 is on for the whole client build: `vite.config.ts` runs
`babel-plugin-react-compiler` through `@rolldown/plugin-babel` with
plugin-react's `reactCompilerPreset()`, `infer` mode, client environment only.
Babel core and the plugins are pinned exactly; keep plugin-react's experimental
Rust `compiler` option off.

- Write components plainly: no new `useMemo`, `useCallback` or `React.memo` for
  render cost or prop stability. Keep a `useMemo` only for expensive work the
  compiler cannot see, with a comment saying why.
- Hold identities that matter for correctness in `useState(() => ...)` or
  `useRef`: three.js objects you dispose, mutable simulation state,
  subscriptions, and values effects or non-React code must see unchanged.
- A component that breaks the Rules of React (reading a ref or mutating props,
  state or hook values during render) is skipped silently. Run
  `bun run compiler:report` after changing components; it lists skipped
  functions with reasons and counts `"use no memo"` directives.
- `useFrame` callbacks and refs are outside render and may mutate freely. The
  compiler recognises a ref by name: a prop written through `.current` in
  `useFrame` must be called `ref` or end in `Ref` (the fab line's `reportRef`,
  `powerRef`), or the whole component is skipped.
- A compiled parent re-renders a child only when its props change. A component
  rendering from an object edited in place (the fab line's `sim`) must take what
  it reads as a prop or a version number (the line passes `line` and `version`).
- A kept `useMemo` that builds several disposable three.js objects should make
  one module-level call; otherwise the compiler may cache each object on its own
  inputs and the dispose effect frees objects still in use. The report only
  proves a function compiles, so read the emitted cache keys of any component
  that renders from mutable data.

```sh
bun install --frozen-lockfile
bun run generate-routes
bun run typecheck
bun run test
bun run compiler:report
bun run verify:stack
bun run build
bun run dev
```

`bun run test` type checks, then runs `bun:test` over `src` and `scripts`.
`verify:stack` proves SSR initialisation and in-memory behaviour only, not
browser interaction; do not claim runtime, browser or deployment proof from
static checks. The app needs no database. The Nitro/Rolldown build's `use client`
directive warnings and chunk naming notice are known and harmless.

### HeroUI and environment

The saved design system is Payload Toolkit
(`eb54f1e3-c413-45cc-9ec2-bbfe398d7baf`, last synced at
`updatedAt=1791502589293`). Its managed exports are `DESIGN.md`, `PRODUCT.md`
and the marked section of `src/styles.css`. For a sync, fetch the manifest and
matching exports again and preserve content outside the markers. The CSS export
is authoritative for runtime values; `DESIGN.md` disagrees on some resolved
values, so keep the source exports rather than guessing corrections. Monospace
code typography and the Hairline artwork stay local.

`@heroui/react` and `@heroui/styles` are pinned to 3.2.6 with peers
`react-aria` 3.52.1, `react-aria-components` 1.21.1, `@internationalized/date`
3.12.4, `@react-aria/ssr` 3.10.1 and `@react-aria/utils` 3.34.1 (the last two
come from the published peer manifest; the MCP guides omit them). HeroUI v3
needs no provider. `@heroui-pro/react@1.0.0-beta.10` supplies the mouve theme
and runs a trusted, authenticated postinstall; it must install inside this app
without relying on parent dependencies.

`src/styles.css` imports Tailwind first, then HeroUI styles. Pro component CSS
(`sidebar.css`, `sheet.css`, `action-bar.css`, `empty-state.css`) is imported
into the `components` layer so utilities can override it. `motion` 14.0.0 is
pinned because Pro Sidebar, Sheet and ActionBar import it as a peer; without it
SSR resolves the parent repository's copy and a second React.

Timeless Grotesk is self-hosted; a local override outside the managed CSS sets
sans and the default weight to 450. The root uses `mouve-light`/`mouve-dark`; stored preferences and
the embedded Hairline figure use `light`/`dark`. The root shell sets
`data-theme` before paint from `localStorage.theme`, else the system preference.

`HEROUI_AUTH_TOKEN` lives only in ignored `.env` (mode 0600); `.env.example`
holds an empty placeholder. It is an install/build credential, not a runtime
variable: never prefix it with `VITE_`, import it into app source, or commit it.
OSS HeroUI needs no credential. The app has no runtime secrets.

### 3D scenes (React Three Fiber)

`/lab` and the workspace's factory view are React Three Fiber 9 scenes on three
0.186 with drei, postprocessing and rapier. The optional community R3F skills
(https://github.com/EnzeD/r3f-skills) are personal tooling: install them in
your own agent setup, not here; this repository's code and `CONTRACT.md` files
win where they disagree. The fab line's slot contract is
`src/routes/lab/-lab/mocks/fab-line/CONTRACT.md`; paths below are relative to
`fab-line/`.

- Every slot (stations, theme, effects, camera follow, swap style, chip, mod
  tools) is one row of `SLOTS` in `world/slots.ts`; the store, World settings,
  the URL, mod adoption and the entry all iterate it. Variant components load in
  their own chunks (`core/lazy.tsx`), and the entry loads a pick's components
  before showing it.
- The world (one pick per slot and per mod tool, plus installed mods) is one
  zustand store, `world/store.ts`, persisted to IndexedDB via `idb-keyval` (key
  `fab-line:world`). URL params win on load and are not saved until changed.
- World settings is a non-modal bottom sheet (`world/sheet.tsx`) opened from the
  gear at the end of the camera-stop toolbar. A Pro `Segment` switches World and
  Mods pages (snapping to one and two thirds of the scene height); the Mods page
  (`mods/panel.tsx`) stays mounted. Do not use the Pro `Sheet` here: it always
  mounts a React Aria modal, which hides the page from assistive technology and
  locks scrolling. Escape closes the sheet only from inside it, so Escape on a
  portaled toast stays with the toast. The mute toggle uses `setMuted` from
  `kit/sound.ts`.
- The category row (`world/categories.ts`) is a centred scroll picker. Option
  cards pick on tap, Enter or Space, never on scroll.
- The open sheet lifts the picture with a lens shift (`setViewOffset`), not a
  camera move. `Lab.onSheetChange` tells the workspace, whose `sceneSheet`
  state hides the Install bar. Tests live in `world/__test__/`.

### Vercel

The site deploys from the Vercel project `image-vision/payload-toolkit` with
root directory `app`. `vercel.json` skips the build when nothing under `app/`
changed since the last successful deployment; the root CLI workflow skips
app-only changes in turn. The build reads `VERCEL_PROJECT_PRODUCTION_URL` for
absolute Open Graph URLs; set `VITE_SITE_URL` to override it with a custom domain.

### Configurator

`/` (`src/routes/-landing/`) shows the robot-arm Hairline figure and a "Start
customizing" link to `/workspace`. The figure is a same-origin iframe of
`/figures/hairline-robot-arm.html`; on load the landing injects a style that
hides the bench controls, rules and tag, and mirrors the page `data-theme` into
it. Do not edit the figure files for this; the iframe stays transparent until
the style is in place. The root shell links `public/favicon.svg`, so no route
requests `/favicon.ico`.

`/workspace` (`src/routes/workspace/-workspace/`) has no header.

- Rail: the HeroUI Pro `Sidebar` (`workspace.rail.tsx`) with All, Features,
  Components and one Blocks entry per group, plus a footer with the home link
  and theme toggle (`workspace.theme.tsx`). `toCatalog` in `workspace.utils.ts`
  groups by the item name's first hyphen segment, folds groups under three items
  into Other and sorts by count, then label; `blockLabels` in
  `workspace.constants.ts` fixes labels Title Case gets wrong.
- At 768px and below HeroUI renders the rail in `Sidebar.Mobile`. The toolbar's
  trigger calls `setMobileOpen(true)` because `collapsible="none"` makes
  `toggleSidebar` a no-op. Keep the default `closeMobileOnAction`. The theme
  tooltip portals into `mobileOverlayContainer` inside the sheet.
- `layouts` in `workspace.tsx` sets per-view classes for the column and toolbar.
  In the factory view the toolbar floats over the scene and ignores pointer
  events so the scene stays draggable; `factory.tsx` masks only the canvas,
  never the overlays. Chrome over a scene carries `data-scene-chrome`, which the
  fab line measures (`fab-line/core/insets.ts`) to frame shots and place its
  controls, with no breakpoints.
- Each card is a standalone `Checkbox` inside `role="group"`; a controlled
  `CheckboxGroup` would re-render every card on each toggle. The accessible name
  is the title; the kind is referenced with `aria-describedby`. The details
  button is a sibling of the checkbox label so it never toggles selection; it
  opens a right Pro Sheet (`registry/registry.details.tsx`) whose local state
  never touches the URL. Thumbnails: `registry/registry.thumbnail.tsx`.
- The floating bar (`bar/`) is the Pro `ActionBar`, always open. Project
  settings and Your build are popovers from 768px and Pro bottom Sheets below.
  Copy with an invalid name opens settings instead. ActionBar's fixed outer
  layer takes no className, so a wrapper offsets it by the 240px rail above
  768px.

State is a TanStack Store created per provider instance in
`workspace.context.tsx`, never at module level. The context value (`store`,
`actions`, `meta`) is stable; leaves read slices with
`useWorkspaceSelector(selector, compare?)`, using `shallow` for arrays. Derived
values (visible and selected items, command, prompt, name error) are pure
functions in `workspace.utils.ts`, never stored.

Only `setup` is mirrored in the URL (`workspace.params.ts`:
`parseWorkspaceSearch` as `validateSearch`, `setupFromSearch`,
`searchFromSetup`, which omits defaults). The router merges the validator result
over raw params, so return invalid values as `undefined` rather than omitting
them. The provider seeds the store once from `router.state.location.search`
without subscribing, then writes each change back with a replacing navigation
and `resetScroll: false`; it never reads the URL again, so the write-back cannot
loop. Query, category, output and the open panel stay out of the URL.

The command and prompt are pure functions of `Setup`. No items means a plain
Payload app; items add `--features`. The agent stays in the URL without items,
but the command omits it until an item is selected, because the CLI requires a
feature for `--codex` and `--claude`. Option labels mirror the prompts in the
root `src/cli.ts`, and the prompt mirrors `integrationPrompt` and
`gitInstruction` in `../src/operations/private/agents.ts` (without post-install
paths and SHA-256 values). Update `workspace.constants.ts`, `workspace.utils.ts`
and the tests when CLI flags or wording change.

### Catalog and previews

`workspace.catalog.ts` is a generated snapshot. `bun run catalog:sync` rebuilds
it from `../registry/registry.json` and the shadcn index of each registry in
`../catalog/community-registries.json` (contract:
`../docs/community-registries.md`). Bundled items become features with their
guide path; community `registry:block` and `registry:component` items become
blocks and components, other types are skipped and printed. The script throws
on malformed data. The app never reads the parent repository at build or run
time, because the Vercel root directory is `app`: rerun the sync and commit the
snapshot when the catalogs change.

Preview fields resolve from directory item overrides, then upstream
`meta.preview` (then `meta.image`), then directory defaults. Directory
`preview.url`/`preview.image` templates support `{name}`; images are a URL or
`{ light, dark }`, each variant optional. `preview.items` overrides per item or
disables with `false`; upstream `meta.preview: false` disables both unless an
item override exists. URLs must be HTTPS without credentials or fragments;
relative upstream values resolve against the item's registry URL. `embed: true`
(default false) allows a live iframe in the details Sheet; never mutate
cross-origin documents.

For URL thumbnails run `bun run catalog:sync`, `bun run previews:build`, then
`bun run catalog:sync` again, and commit `public/registry-previews/` with the
catalog. Capture needs `bun x playwright install chromium` or
`PLAYWRIGHT_CHANNEL=chrome`; unchanged URLs reuse cached WebP captures and
`--refresh` recaptures. Failed captures exit nonzero.

### Hairline figures

Kept figures: `robot-arm` (the only one shown, on the landing),
`pick-and-place`, `claw-machine` and `tool-tray`. Sources are
`figures/<name>.js`; served pages are `public/figures/hairline-<name>.html`.
Serving and building the app need no personal skill, but changing a figure
requires the personal Hairline skill. From the repository root:

```sh
node .agents/skills/hairline-create/build.mjs app/figures/<name>.js app/public/figures/hairline-<name>.html
node .agents/skills/hairline-create/validate.mjs app/public/figures/hairline-<name>.html
```
