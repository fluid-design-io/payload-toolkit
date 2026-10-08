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
Form 1.33.5, Store 0.11.2 and Virtual 3.14.13 are exact dependencies.
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
Inter is loaded once by the root document. The root uses `mouve-light` and
`mouve-dark`; stored preferences and the embedded Hairline figure still use
`light` and `dark`.

The CSS export is authoritative for runtime values. The exported DESIGN.md
currently disagrees with CSS on some resolved values (including light
surface/field backgrounds and dark accent-soft opacity); retain the source
exports rather than guessing corrections. No custom fonts, assets, audience,
tone or additional brand rules are saved. Gravity is the saved icon preference,
but there is no application icon-library integration to map in this sync.
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

`/workspace` is the configurator (`src/routes/workspace/-workspace/`). The left
column holds a searchable, filterable grid of registry items. The right aside,
"Your setup", becomes a half-height bottom sheet below 1024px. One `Setup`
value drives every control. The CLI command and the agent prompt are pure
functions of it in `workspace.utils.ts`. The template is derived: no items means
`minimal`. The agent flag is emitted only with at least one item, because the
CLI rejects an agent with `minimal`. Option labels mirror the prompts in the root
`src/cli.ts`. Update `workspace.constants.ts` and `workspace.utils.ts` when CLI
flags change.

The grid reads `workspace.catalog.ts`, a generated snapshot. `bun run catalog:sync`
rebuilds it from `../registry/registry.json` and the shadcn index of each
registry in `../catalog/community-registries.json`. Bundled items become
features with their guide path. Community `registry:block` and
`registry:component` items become blocks and components; other types are
skipped and printed. The script validates both sources and throws on malformed
data. The app never reads the parent repository at build or run time, because
the Railway service root is `/app`. Rerun the sync and commit the snapshot when
the catalogs change.

The root shell sets `data-theme` before paint from `localStorage.theme`, or from
the system preference while nothing is stored. The workspace theme button
stores the choice. HeroUI styles follow `[data-theme]`.

```sh
bun run catalog:sync
bun run test
```

`bun run test` runs `bun:test` over `src`. It asserts the exact command and
prompt strings, including the README invocations.

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
