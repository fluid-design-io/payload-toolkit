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

```sh
bun install --frozen-lockfile
bun run generate-routes
bun run typecheck
bun run test
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
left sheet over a blurred backdrop. `Workspace.Toolbar` is then a slim sticky
row at the top of the main column: `WorkspaceRail.Trigger` (`Sidebar.Trigger`
with `RiMenuLine`, "Open categories"), the current category's label and the
one search field. Above 768px the toolbar is `display: contents`, so the search
sits under the intro as before. The trigger calls `setMobileOpen(true)` because
`collapsible="none"` makes the default `toggleSidebar` a no-op. Menu items keep
the default `closeMobileOnAction`, so picking a category closes the sheet. The
theme tooltip portals into `mobileOverlayContainer` inside the sheet. The sheet
and its backdrop (z-index 50, portalled after the bar) cover the ActionBar while
open. The main column holds the heading, search and card grid (`registry/`).
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
registry in `../catalog/community-registries.json`. An optional `meta.image`
on either source becomes the card image: https only, with a relative community
value resolved against that item's registry URL (`imageUrl`). Bundled items become
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
