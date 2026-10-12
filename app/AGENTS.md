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


## Registry web bootstrap

This is the repository web app, an independent Bun project at `app/` inside
Payload Toolkit. Keep the toolkit CLI, its canonical catalog, and its package
publication unchanged. The app has two routes, a landing page and the
configurator, described under "Configurator" below. Development tools remain
in development.

### Scaffold and guidance

The exact requested command was run from the repository root with CLI 0.71.1:

```sh
npx @tanstack/cli@latest create my-tanstack-app --agent --package-manager bun --tailwind --deployment railway --add-ons tanstack-query
```

The CLI deprecated and ignored `--tailwind` (standard scaffolds already use v4).
It generated examples despite the requested blank starter. Its shipped
`create-app-scaffold` skill says `--blank` cannot be combined with `--tailwind`.
A second scaffold was therefore generated in `.scratch/web-bootstrap/` using the
installed CLI:

```sh
../../my-tanstack-app/node_modules/.bin/tanstack create my-tanstack-app --blank --agent --package-manager bun --deployment railway --add-ons tanstack-query --intent --no-git --no-install
```

Its minimal root shell was merged into this app. Demo routes, header, footer,
theme toggle and example CSS were removed. The blank root route is retained.
Tailwind v4 Vite integration, Query SSR integration and the generated Vite,
TypeScript, Nitro, route generation and development-tool structure are preserved.
The scaffold-created nested Git repository was removed so this directory belongs
to the parent repository. This is not a Bun workspace; install from this directory.

The directory was renamed from `my-tanstack-app/` to `app/` after scaffolding.
The commands above record the original generation and keep their historical names.
The private package is `payload-toolkit-web`; `.cta.json` uses the current
directory name. The root package remains the published toolkit CLI. No Turbo
or workspace layer is needed while the app has no shared package build graph.

Follow-up commands were run from this directory:

```sh
npx @tanstack/intent@latest install
npx @tanstack/intent@latest list
npx @tanstack/intent@latest load '@tanstack/react-start#react-start'
npx @tanstack/intent@latest load '@tanstack/start-client-core#start-core/deployment'
npx @tanstack/intent@latest load '@tanstack/cli#create-app-scaffold'
```

Intent install initially failed in noninteractive mode because permissions were
not configured. Interactive install subsequently succeeded. Intent and CLI are
local exact development dependencies; use `bun run intent:list` and the installed
Intent for future work. The generated `intent` binary collides with the binary
from `@tanstack/devtools`. Both Intent scripts invoke the installed Intent entry
directly so dependency installation cannot select the wrong command. Intent found no shipped Form, Store, Query or Virtual
skills in these releases; installed package source/types and official docs were
consulted. Intent warns about devtools-event-client 0.5.0 and Form's private
0.4.4; these remain isolated versions rather than forced overrides.

### Stack and checks

Use Node 24.21.0 and Bun 1.4.2. React 19, TanStack Start and file Router run on
Vite 8/TypeScript 6 with Tailwind v4. QueryClient remains scoped to each router
factory invocation; preserve the generated SSR dehydration integration.
Form 1.33.5 and Store 0.11.2 are exact dependencies. Virtual was removed when
the workspace grid stopped needing it. `@remixicon/react` 4.9.0 is pinned
exactly and supplies every workspace icon. Import icons by name, as in
`import { RiStackLine } from '@remixicon/react'`, so the build keeps only the
icons in use; do not hand-draw inline SVGs.
`scripts/verify-stack.tsx` demonstrates their React SSR APIs plus Query caching
without adding product UI. Store 0.11 uses `useSelector`; `useStore` is deprecated.
Do not create a module-level application store or QueryClient shared across SSR
requests. The script's isolated instances are for that command only.

React Compiler 1.0 is on for the whole client build. `vite.config.ts` runs
`babel-plugin-react-compiler` through `@rolldown/plugin-babel` with plugin-react's
`reactCompilerPreset()`, in the default `infer` mode, client environment only.
Babel core 7.29.7 and the plugin versions are pinned exactly. Plugin-react's
Rust `compiler` option stays off while it is experimental. Write components
plainly and let the compiler memoize them: no new `useMemo`, `useCallback` or
`React.memo` for render cost or prop stability. Hold an identity that matters for
correctness in `useState(() => ...)` or `useRef`. That covers three.js objects
you dispose, mutable simulation state, subscriptions, and values that effects or
non-React code must see unchanged. Keep a `useMemo` only for expensive work the
compiler cannot see, with a comment saying why. A component that breaks the
Rules of React (reading a ref or mutating props, state or hook values during
render) is skipped silently and runs uncompiled. `bun run compiler:report` lists
every skipped function with the reason, plus the count of `"use no memo"`
directives. Run it after changing components. Code inside `useFrame` callbacks and refs is outside render and may
mutate freely. The compiler knows a ref by its name: a prop written through
`.current` in a `useFrame` callback must be called `ref` or end in `Ref` (the
fab line's `reportRef` and `powerRef`), or the whole component is skipped.

A compiled parent re-renders a child only when the child's props change. A
component that renders from an object edited in place, such as the fab line's
`sim`, must take what it reads as a prop or a version number (the line passes
`line` and `version`) rather than rely on its parent re-rendering. A kept
`useMemo` that builds several disposable three.js objects should make one
module-level call: the compiler may cache each object on its own inputs, and
the dispose effect would then free objects still in use. The report proves only
that a function compiles, so read the emitted cache keys of any component that
renders from mutable data.

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

The smoke probe proves SSR initialization and in-memory behavior, not browser
form interaction or scrolling. Do not claim runtime, browser, database or Railway
proof from static checks. No database is required by this application.

### HeroUI status and environment

The on-demand saved design system is Payload Toolkit
(`eb54f1e3-c413-45cc-9ec2-bbfe398d7baf`), synced at
`updatedAt=1791502589293`. Managed exports live in `DESIGN.md`,
`PRODUCT.md` and the marked section of `src/styles.css`. Fetch the manifest
and matching exports again for future syncs; preserve content outside markers.
The app pins `@heroui-pro/react@1.0.0-beta.10` for its public mouve theme
import and trusts that package's required authenticated postinstall. It must
install within this independent app, without relying on parent dependencies.
Timeless Grotesk is self-hosted as a variable WOFF2 (weights 300–800), preloaded
by the root document. The local font override outside the managed CSS export
sets sans typography and the normal/default weight to 450. The root uses `mouve-light` and
`mouve-dark`; stored preferences and the embedded Hairline figure still use
`light` and `dark`.

The CSS export is authoritative for runtime values. The exported DESIGN.md
currently disagrees with CSS on some resolved values (including light
surface/field backgrounds and dark accent-soft opacity); retain the source
exports rather than guessing corrections. No custom fonts, assets, audience,
tone or additional brand rules are saved. Gravity is the saved icon preference,
but there is no application icon-library integration to map in this sync. The
workspace later adopted Remix Icon at the user's request (see "Stack and checks").
Existing monospace code/command typography and Hairline artwork remain local.
The 2026-10-08 sync passed frozen install, route generation, typecheck, 10 app
tests, SSR stack probe and Node 24.21.0 production build. Production Chromium
checked desktop/mobile light/dark tokens, toggle persistence, one font link,
no horizontal overflow, figure mode mapping and no page errors; desktop light
and mobile dark screenshots were inspected. Evidence is under
`../.scratch/design-system-sync/`. Existing Nitro build warnings remain.
No database, paid agent evaluation or deployment was run.

HeroUI setup is complete. The React Pro MCP was queried directly using the
configured Codex MCP authentication header. Its quick-start, frameworks guide,
component listing, Button documentation, and v3.2.6 release guide were read before
implementation. The quick-start itself does not list exact versions; the latest
MCP release guide identifies 3.2.6 and the changed peer requirements.

Both `@heroui/react` and `@heroui/styles` are pinned to 3.2.6. Missing peers are
pinned: `react-aria` 3.52.1, `react-aria-components` 1.21.1,
`@internationalized/date` 3.12.4, `@react-aria/ssr` 3.10.1 and
`@react-aria/utils` 3.34.1. The first three come from the release guide;
SSR/utils were verified against the published 3.2.6 peer manifest because the
MCP guides omit those declarations. Existing React 19 and Tailwind v4 suffice.

`src/styles.css` imports Tailwind first, immediately followed by HeroUI styles.
The Pro `sidebar.css`, `sheet.css`, `action-bar.css` and `empty-state.css` component styles are
imported into the `components` layer, like the OSS ones, so utilities can adjust
them. `motion` 14.0.0 is pinned because Pro Sidebar, Sheet and ActionBar import
it as a peer; without it SSR resolved the parent repository's copy and a second React.
The root route already links this stylesheet. No provider is needed in v3.
The earlier Button smoke test and the four-figure home grid were replaced by the
configurator routes.

The supplied `HEROUI_AUTH_TOKEN` remains in ignored `.env` with mode 0600.
`.env.example` contains an empty placeholder. It is an installation credential,
not a runtime variable. Never prefix it with `VITE_`, import it into application
source, or commit it. OSS HeroUI installation needs no Pro package or credential.

### 3D scenes (React Three Fiber)

The `/lab` mocks and the workspace's factory view are React Three Fiber 9 scenes
on three 0.186 with drei, postprocessing and rapier installed. When you need
help with R3F, drei, shaders, performance or scene structure, you may use the
community R3F skills at https://github.com/EnzeD/r3f-skills. They are optional
personal tooling: install them in your own agent setup, not in this repository,
and the repository's code and `CONTRACT.md` files win where they disagree. The
fab line's slot contract is `src/routes/lab/-lab/mocks/fab-line/CONTRACT.md`.

Every fab line slot (stations, theme, effects, camera follow, swap style,
chip, mod tools) is one row of `SLOTS` in `fab-line/world/slots.ts`, which the
store, World settings, the URL, mod adoption and the entry iterate. Variant
components load in their own chunks (`fab-line/core/lazy.tsx`) and the entry
loads a pick's components before showing it. The fab line keeps its world (one
pick per slot and per mod tool, and the installed mods) in one zustand 5 store,
`fab-line/world/store.ts`, persisted to IndexedDB through `idb-keyval` (key
`fab-line:world`). Both are pinned direct dependencies. The gear at the end of
the camera-stop toolbar opens World settings, a non-modal bottom sheet
(`fab-line/world/sheet.tsx`) in both `/lab` and the workspace. Its header
holds a Pro `Segment` with two pages, World and Mods (with the installed
count), then Reset world, a mute toggle (`setMuted` from `kit/sound.ts`, the
fab line's only one in the workspace; `/lab`'s top bar keeps its own) and
close. Choosing World snaps the sheet to a third of the scene's height and
Mods to two thirds, straight from the segment's change; the handle still drags
between the two or closes it, and a drag is never undone. Escape closes the
sheet only from inside it, so Escape on a portaled toast stays with the toast.
The World page's row of categories (one per picked slot, `world/categories.ts`)
is a centred scroll picker: the category under the middle is selected, and
changing it only swaps the strip below. The Mods page is `mods/panel.tsx`,
which stays mounted on the World page and while closed. The strip's option cards pick on tap,
Enter or Space, never on scroll, and a pick renders in a React transition with
a spinner on the tapped card while its component loads and the scene rebuilds. A slot with one variant has no category until a
mod adds a second. Cards show a variant's `thumbnail` or a swatch: theme
tokens for themes, the registry's golden-angle hue mat for the rest. The
camera-stop toolbar is one vertical column at the scene's bottom left in both
views: it rests above the bottom chrome, rides 12px above the open sheet, and
where the sheet leaves it no room under the header (a phone at the Mods snap)
it stops there and fades out. The open sheet lifts the whole picture by 40 %
of its height with a lens shift (`setViewOffset`), never past the header, in
every camera mode; the camera itself does not move. While the sheet is open
`/lab` slides its search and call sheet away, and `Lab.onSheetChange` tells
the workspace, whose `sceneSheet` state sinks the Install bar. URL params win
on load and are not saved until changed. `world/__test__/store.test.ts`
round-trips the store through a fake async storage,
`world/__test__/categories.test.ts` covers hidden categories, card options and
the centred-item rule, and `world/__test__/slots.test.ts` covers the slot
table's mod checks, guard fallbacks, required routes and the tools slot. The Pro `Sheet` was not used: it always mounts a React
Aria modal, which hides the rest of the page from assistive technology and
locks scrolling. Compose conditional class names with `cn` from `@heroui/react`, never
template literals.

### Railway

The generated Nitro integration and Node production entry are preserved.
`railway.json` selects Railpack, `bun run build`, `bun run start`, and `/` health
checking. For a future deployment, set service root directory to
`/app` and config path to `/app/railway.json` in this
repository. Railpack should use the committed Bun lockfile and packageManager.
Set `RAILPACK_NODE_VERSION=24.21.0` if the builder needs an explicit Node pin.
Railway supplies `PORT`; Nitro listens on it. No runtime secret is required yet.
HeroUI credentials, if needed later, belong only in the install/build environment.
No Railway project, service, paid infrastructure or deployment was created.

### Configurator

`/` is the landing route (`src/routes/-landing/`). It shows the robot-arm Hairline
figure and one "Start customizing" link to `/workspace`. The figure is a
same-origin iframe of `/figures/hairline-robot-arm.html`. On load, the landing
injects a style into the iframe document that hides the bench controls, rules
and tag. It also mirrors the page `data-theme` into the iframe. The figure files
are untouched; the iframe stays transparent until the style is in place.

`/workspace` is the configurator (`src/routes/workspace/-workspace/`). It has
no header. The left rail is the HeroUI Pro `Sidebar` (`workspace.rail.tsx`):
All, Features and Components, then a Blocks section with one entry per block
group, and a `Sidebar.Footer` with the `payload-toolkit` home link and the
icon-only theme toggle (`workspace.theme.tsx`). Groups and counts come from
`toCatalog` in `workspace.utils.ts` at runtime: the group is the first hyphen
segment of the item name, groups under three items fold into a final Other,
and the rest sort by count, then label. `blockLabels` in
`workspace.constants.ts` overrides labels that Title Case gets wrong. HeroUI
hides the aside at 768px and below and renders the same rail body (categories
with counts, footer with home link and theme toggle) in `Sidebar.Mobile`, a
left sheet over a blurred backdrop. `Workspace.Toolbar` holds
`WorkspaceRail.Trigger` (`Sidebar.Trigger` with `RiMenuLine`, "Open
categories") and the current category's label, both shown only at 768px and
below (the label also shows in the factory view's floating header on every
width), then the one search field and the Grid/Factory view switch, which sits
on a `backdrop-blur-md` wrapper so it reads over the scene. The trigger
calls `setMobileOpen(true)` because
`collapsible="none"` makes the default `toggleSidebar` a no-op. Menu items keep
the default `closeMobileOnAction`, so picking a category closes the sheet. The
theme tooltip portals into `mobileOverlayContainer` inside the sheet. The sheet
and its backdrop (z-index 50, portalled after the bar) cover the ActionBar while
open. The main column holds the toolbar, then the card grid (`registry/`) or
the factory scene (`factory/`).

`layouts` in `workspace.tsx` gives the column and the toolbar their classes per
view, composed with `cn` from `@heroui/react`. In the grid view the column is
padded (`pb-32` clears the bar); the toolbar is a slim sticky row with a
surface background at 768px and below and a plain row that scrolls with the
grid above that. In the factory view the column is held to the viewport with no
padding and clips to the inset card's radius, and the scene fills it edge to
edge. The toolbar floats over the scene's top (absolute, at the grid's
`px-6 pt-6` insets above 768px so the search does not move when the view
switches); it ignores pointer events itself, so the scene stays draggable
between its controls. `factory.tsx` masks only the scene's canvas with
Tailwind mask utilities: it fades to transparent at the top down to the
scene's `--scene-fade` (the measured toolbar plus 48px), 3rem at the bottom
under the bar and 1.5rem at the sides, into the scene's own background. The
scene's overlays are not masked. The toolbar and the bar's row carry
`data-scene-chrome`, as /lab's bar and the scene's own strip, search and call
sheet do: the fab line measures them (`fab-line/core/insets.ts`), frames its
shots clear of them, rests its camera-stop strip above whatever sits in its
column and places its inspector under the header, with no breakpoints.
The search filters the grid in
place; "/" focuses it from anywhere except a text field (text input, textarea,
select or contenteditable) and is ignored with Cmd, Ctrl or Alt. A `Kbd` hint
sits at the field's end while it is empty and unfocused; typed text swaps it for
the clear button. Each card is one standalone `Checkbox` inside a
`role="group"`; a controlled `CheckboxGroup` would re-render every card on each
toggle. A card's accessible name is its title; the kind is hidden from the
label text and referenced with `aria-describedby`. Cards show `image` when
present, else a wireframe per block group or a kind icon
(`registry/registry.thumbnail.tsx`). The floating bar (`bar/`) is the HeroUI
Pro `ActionBar`, always open, styled as a black pill in both themes. Its
content slot holds Project settings (a cog with a danger dot while the name is
invalid) and Your build (a stack icon with a count pill, muted at zero), each a
popover anchored to its button from 768px and a Pro bottom `Sheet` below. The
popover dialog alone owns the padding (`p-4`). The build panel lists the items
with remove buttons and Clear, or a Pro `EmptyState` (`RiStackLine` icon) with
no items; it shows no command preview. The Agent choice has one `Description`
line referenced by `aria-describedby`: "Runs Codex or Claude Code after install
to wire in your items." with items, and "Add an item to enable." while it is
disabled. The suffix slot holds the white Copy split button, whose menu picks
Command or Prompt and describes each. Copy with an invalid name opens settings
instead. ActionBar's fixed outer layer takes no className, so a wrapper offsets
it by the 240px rail above 768px to center the pill on the main column.

State is a TanStack Store created per provider instance in
`workspace.context.tsx`, never at module level. The context value is stable
(`store`, `actions`, `meta`); leaves read slices with
`useWorkspaceSelector(selector, compare?)`, using `shallow` for arrays.
Derived values (visible and selected items, command, prompt, name error) are
pure functions in `workspace.utils.ts`, never stored. `setup` is mirrored in
the URL: `workspace.params.ts` provides `parseWorkspaceSearch` (the route's
`validateSearch`), `setupFromSearch` and `searchFromSetup`, which omits every
default. The router merges the validator result over the raw params, so
invalid values are returned as `undefined` rather than left out. The provider
seeds the store once from `router.state.location.search` without subscribing,
then writes each `setup` change back with a replacing navigation and
`resetScroll: false`, since router scroll restoration would otherwise jump to
the top; it never reads the URL again, so the write-back cannot loop or
re-render the provider. Query, category, output and the open panel stay out of the URL. The agent
stays in the URL when chosen without items; the command omits it until an item
is selected, because the CLI requires a feature for `--codex` and `--claude`.

The command and prompt are pure functions of `Setup`. No items means a plain
Payload app; items add `--features`. Option labels mirror the prompts in the
root `src/cli.ts`. Update `workspace.constants.ts` and `workspace.utils.ts`
when CLI flags change.

The grid reads `workspace.catalog.ts`, a generated snapshot. `bun run catalog:sync`
rebuilds it from `../registry/registry.json` and the shadcn index of each
registry in `../catalog/community-registries.json`. Optional directory `preview.url` and `preview.image` templates support `{name}`.
`preview.image` accepts a single URL or `{ light, dark }` URLs; upstream
`meta.preview.image` and `meta.image` accept the same shape. Either variant may be
omitted. Per-theme fallback resolves overrides independently. `preview.items`
supplies per-item overrides or `false` to disable previews. Optional `embed: true`
(in directory or `meta.preview`) enables a live iframe in the details Sheet only
when the provider permits cross-origin embedding; default is false.
Each field resolves from directory item overrides, upstream `meta.preview`, then
directory defaults; `meta.image` remains supported before the default image.
Upstream `meta.preview: false` disables both unless a directory item override exists.
URLs must use HTTPS without credentials or fragments; relative upstream values
resolve against the item's registry URL. `RegistryThumbnail` renders direct images first, cached preview screenshots second,
and placeholders for missing or failed images. Run `bun run catalog:sync`,
`bun run previews:build`, then `bun run catalog:sync` to generate URL thumbnails.
Both grid thumbnails and larger image previews follow the app theme, falling
back to the other supplied variant, then the placeholder if images fail.
Install the development browser with `bun x playwright install chromium`, or set
`PLAYWRIGHT_CHANNEL=chrome` to use installed Chrome. Commit `public/registry-previews/`
and the catalog. Capture uses a 1280 by 800 viewport, reduced motion and light/dark color preferences;
unchanged URLs reuse cached captures. `--refresh` recaptures; failed captures exit
nonzero and retain only matching cached images. This is separate from app builds;
visitors receive WebP quality-85 static images for thumbnails. Existing PNG caches
are converted with Bun; new captures use Playwright WebP directly. A color
preference does not force upstream pages to implement a dark design.
The larger preview uses an iframe only with `preview.embed: true` and offers a
Show image action. `registry.preview.tsx` sets `data-theme` and `color-scheme` on
the iframe; remote pages must support the inherited preference. We do not mutate
cross-origin documents. Payload Components currently blocks embedding and uses images.
Each card has a separate details button beside its title/kind that opens a right
HeroUI Pro Sheet (`registry/registry.details.tsx`). The Sheet shows a larger
thumbnail, description, registry name/namespace, registry homepage and an external
link to the exact preview page (or registry item JSON when no preview is declared).
Bundled features link to their source guide. `sourceName`, `sourceHomepage` and
`itemUrl` are generated provenance fields, with no provider-specific UI branches.
The Sheet's add/remove button uses the same per-item selection as the card and
keeps the Sheet open. Its local open state does not alter the workspace URL.
The details trigger is a sibling of the checkbox label, so opening it never toggles
selection. It is visually hidden until the card is hovered or contains focus;
keyboard users can still tab to it. Escape, backdrop and the close button dismiss
it and restore focus.
See `../docs/community-registries.md` for the contribution contract. Bundled items become
features with their guide path. Community `registry:block` and
`registry:component` items become blocks and components; other types are
skipped and printed. The script validates both sources and throws on malformed
data. The app never reads the parent repository at build or run time, because
the Railway service root is `/app`. Rerun the sync and commit the snapshot when
the catalogs change.

The root shell sets `data-theme` before paint from `localStorage.theme`, or from
the system preference while nothing is stored. The rail's theme button
stores the choice. HeroUI styles follow `[data-theme]`.

```sh
bun run catalog:sync
bun run test
```

`bun run test` runs `bun:test` over `src` and `scripts`. It asserts the exact
command and prompt strings, including the README invocations, the URL params,
the category grouping and catalog image parsing.

The prompt output mirrors `integrationPrompt` and `gitInstruction` in the root
`src/operations/private/agents.ts`, without file paths and SHA-256 values that
only exist after installation. Update both when the CLI wording changes.
`public/favicon.svg` is linked from the root shell, so no route requests the
missing `/favicon.ico`.

### Bootstrap verification (2026-10-08)

Parent frozen install, `bun run check` (74 tests) and `agent:doctor` passed.
Web frozen install, route generation, typecheck, SSR stack probe and production
build passed. Chromium loaded the production root with HTTP 200, the expected
title, an empty body, no product controls and no page errors. The runtime probe
also checked that server HTML did not contain the installation token. Local
runtime evidence and server log are under `.scratch/web-bootstrap/` in the parent
repository. Owned test server and browser were stopped. No database or paid
agent-process evaluation was run; Railway was not deployed. HeroUI was blocked at that point.
The scaffold's Nitro/Rolldown build emits `use client` directive warnings and
a chunk naming notice; the tested production page still passed.

### Directory rename verification (2026-10-08)

The web project now lives at `app/`. Frozen install, typecheck, the SSR stack
probe, Intent listing, and the production build passed after the move. The build
and production server used Node 24.21.0; package commands used Bun 1.4.2.
The HTTP and Chromium probe passed both before and after the rename with HTTP
200, the expected title, an empty body, no product controls, no page errors,
and no installation token in server HTML. Evidence is retained under
`.scratch/web-rename/` in the parent repository. Owned servers and browsers
were stopped. Existing Nitro build warnings remain. No new UI, database,
agent evaluation, Railway resources, or deployment was added.

### HeroUI verification (2026-10-08)

App frozen install, typecheck, SSR stack probe and Node 24.21.0 production build
passed. Chromium verified HTTP 200, a visible primary Button with nontransparent
accent background, 24px radius and 36px height, and the label change after pressing.
No page errors occurred; server HTML excluded the installation token. The screenshot
was inspected. Evidence is retained in `.scratch/heroui-setup/` in the parent repo.
Owned server/browser were stopped. Existing Nitro directive warnings remain.

### Hairline figures (2026-10-08)

The landing route embeds only `robot-arm` (see "Configurator"). Kept figures,
each built by a subagent with the personal Hairline skill: `robot-arm` (agent
hand-off; refined so the block seats into the socket, rest fill 40%),
`pick-and-place` (SCARA arm seating a feature chip on a circuit board, 44%),
`claw-machine` (registries as a prize pit, 34%) and the earlier `tool-tray`.
`cryptex` and `block-tower` were built, then removed at the user's request.
Sources are `figures/<name>.js`; served pages are `public/figures/hairline-<name>.html`.
The Hairline kernel and bench are unchanged. Figure changes require rebuilding with
the installed personal Hairline skill; serving/building the app needs no personal
skill or additional dependency.

From the repository root, regenerate and validate the artifact:

```sh
node .agents/skills/hairline-create/build.mjs app/figures/<name>.js app/public/figures/hairline-<name>.html
node .agents/skills/hairline-create/validate.mjs app/public/figures/hairline-<name>.html
```

The original blank-page assertions above are historical bootstrap proof. Each kept
figure passes the validator and look.mjs (frame, read-out, console, flicker), its
look sheet was inspected, and its `?play=1` tour was played headless with no
console errors.
No registry data, deployment or extra dependencies were added.

App frozen install, Node 24.21.0 typecheck/production build and Bun SSR stack probe
passed. Production Chromium confirmed HTTP 200, one centered figure on desktop
and mobile, no horizontal overflow, all tool/recess hover names, stable geometry,
intensity changes and the exact four-stop tour. The removed artifact returns 404.
The screenshots were visually inspected. No application/page errors occurred;
the existing missing `/favicon.ico` emits one console 404, recorded separately.
Owned test server and browser were stopped. No CLI, database, paid agent
verification or Railway deployment was run for this isolated visual change.

### Configurator verification (2026-10-08)

Catalog sync (84 items: 1 bundled feature, 79 blocks, 4 components), route
generation, typecheck, `bun run test` (10 tests) and a Node 24.21.0 production
build passed. A Playwright script drove Chrome against the production server on
port 3100 at 1440 × 900 and 390 × 844 in light and dark: 148 assertions passed.
It covered the centered landing figure with hidden bench chrome, synced theme
and pointer response, navigation to `/workspace`, search and filter counts, the
exact command after every input and toggle, clipboard contents for the command
and prompt, the right sidebar and the half-height bottom sheet, no horizontal
scroll, and no console, page or HTTP errors. Screenshots were inspected. The
owned server and browser were stopped. No CLI, database, agent process or
Railway deployment was run.

### Workspace redesign verification (2026-10-08)

The template flag was removed from the command, the reducer became a
per-provider TanStack Store with URL-mirrored setup, Virtual was removed, and
`motion` was added for the Pro Sidebar and Sheet. With Node 24.21.0 and Bun
1.4.2: install, frozen install, catalog sync (84 items, no images), route
generation, typecheck, `bun run test` (23 tests), the SSR stack probe and the
production build passed; the existing Nitro directive warnings remain. A
headless Chromium probe against the production server at 1440 x 900 and
375 x 812 checked card toggles and the URL, search, rail filtering, the build
popover and mobile sheet, clipboard contents, the Copied label, the prompt
switch, copy with an invalid name opening settings, URL restore with invalid
values falling back, a query-free default URL, agent gating and no horizontal
overflow, with no page errors. Temporary render counters, since removed,
showed a toggle re-rendering only that card and the build badge, and a search
keystroke never re-rendering the bar. The probe and screenshots stayed in the
agent scratchpad. No database, agent process or deployment was run.

The header was then removed, with its home link and theme toggle moved to the
rail footer (and the chip row on phones), icons moved to `@remixicon/react`
4.9.0, the bar moved to the Pro ActionBar, the build preview was dropped, "/"
now focuses search, and card checkboxes are named by title. With Node 24.21.0
and Bun 1.4.2: frozen install, route generation, typecheck, `bun run test`
(23 tests), the SSR stack probe and the production build passed; the Nitro
directive warnings remain. The client bundle contains 12 Remix icon
components, matching the icons used. A headless Chromium probe on the
production server (port 3200) passed 47 of 47 checks at 1440 x 900 and
375 x 812 in light and dark, with no page, console or HTTP errors. It covered
the footer link and toggle, a black pill centered on the main column (0.01px
off), each popover centered on its own trigger (0px), the inline count pill,
a borderless white Copy button, no preview in the panel or sheet, title-only
checkbox names with the kind as description in the accessibility tree, the "/"
shortcut, the Kbd hint, the invalid-name dot and redirect, Copied without
width change, the live announcement, the menu descriptions and no horizontal
overflow at 375px. Temporary render counters, since removed, showed a toggle
re-rendering only that card and the build button, and a search keystroke
re-rendering only the search and grid. Screenshots were inspected. No
database, agent process or deployment was run.

Concentric radii, Agent help and scroll fix (2026-10-08): card radius `--radius-xl` (24px), thumbnail 16.375px and corner button 22.5px at 5.125px measured concentric within 0.001px, unchanged on selection; Copy inset 5.625px and count pill 7.5px on all sides; the Agent help opened on hover, focus, Enter and tap in the popover and the sheet; selection and settings kept `scrollY` with no history entry, provider render or card remount; typecheck, 23 tests and the production build passed.

Mobile Sidebar sheet, Agent description and build empty state (2026-10-08): the chip row and the Agent info button were removed; typecheck, 23 tests and the production build passed; a Playwright probe on the production server (port 3200) passed 87 of 87 checks at 375 x 812 and 1440 x 900 in light and dark, covering the trigger, Escape and backdrop closing, category picks closing the sheet, the in-sheet theme toggle and tooltip container, the bar covered while the sheet is open and usable after, "/" on both widths, unchanged desktop rail entries, both Agent descriptions, the empty state and remove buttons at the 15px padding inside the 32px corner curve (0.775px clear), with no page, console or HTTP errors. Evidence is in `../.scratch/workspace-redesign/round3/`.
