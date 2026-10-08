# Payload Toolkit web

React 19 / TanStack Start app, scaffolded with TanStack CLI and Bun. It turns
registry choices into a Payload Toolkit command or an agent prompt.

```sh
cd app
bun install --frozen-lockfile
bun run dev
```

Open http://localhost:3000. Generated development tools remain available in development.

## Routes

- `/` shows the interactive robot-arm Hairline figure and a "Start customizing" link.
- `/workspace` is the configurator. Search and filter the registry grid, toggle
  items, and set the project name, framework, database, package manager and agent.
  "Your setup" shows the live `payload-toolkit init` command or a paste-ready agent
  prompt with a copy button. Below 1024px it is a half-height bottom sheet.

The command follows the CLI rules. No items means `--template minimal`. Items add
`--template custom --features <refs>`. The agent flag needs at least one item.

## Catalog snapshot

`src/routes/workspace/-workspace/workspace.catalog.ts` is generated. Rebuild it
from `../registry/registry.json` and the community registries in
`../catalog/community-registries.json`:

```sh
bun run catalog:sync
```

The app never reads the parent repository at build or run time, so the Railway
service root can stay `/app`.

## Checks

```sh
bun run typecheck
bun run test
bun run verify:stack
bun run build
```

`test` runs `bun:test` over `src`. It checks the exact command and prompt strings.
The prompt mirrors the CLI's own agent prompt in the root `src/operations/private/agents.ts`.

`verify:stack` is a standalone React SSR demonstration of Query caching, Form,
Store updates/selectors and Virtual range calculation. It adds no app pages.
Start/Router are exercised by building and serving the root route.
CLI and Intent are installed locally (`bun run scaffold --help`,
`bun run intent:list`). Use Node 24.21.0 and Bun 1.4.2.

## HeroUI

HeroUI React and styles are pinned to 3.2.6 with their missing peers, following
the React Pro MCP quick-start and release guidance. Tailwind is imported first,
then HeroUI styles, in `src/styles.css`; the root route loads that stylesheet.
HeroUI v3 needs no provider. A blocking script in the root shell sets `data-theme`
from `localStorage.theme` or the system preference; HeroUI styles follow it.

No runtime secret is required. The supplied Pro installation token remains in
ignored `.env`; `.env.example` lists its name. Never expose it through `VITE_`.

## Railway

The scaffold's Nitro integration and production `start` script are retained;
`railway.json` provides build, start and health-check settings. Configure a future
Railway service with root `/app` and config file
`/app/railway.json`. Railway supplies `PORT`. No runtime environment
variables are required by the app. Nothing has been provisioned or deployed.

See [AGENTS.md](./AGENTS.md) for exact scaffold/Intent commands, design decisions,
known warnings, environment handling and next steps.

## Hairline figures

The landing embeds `public/figures/hairline-robot-arm.html` in a same-origin iframe.
It injects a style that hides the bench controls and mirrors the page theme. The
figure files are not edited. The other figures below are kept but not shown.

Each figure's source is `figures/<name>.js`; its self-contained page is served from
`public/figures/hairline-<name>.html` and embeds the fixed Hairline kernel and bench
unchanged. Rebuild instructions are in AGENTS.md.

- **claw-machine:** registries as a prize pit. The claw follows the pointer and dips
  for the capsule underneath; the read-out names the feature (`forms`, `auth`, …).
- **robot-arm:** the agent hand-off. A desk arm carries a feature block and reaches
  for the socket under the pointer (`forms`, `seo`, `blog`, `auth`).
- **pick-and-place:** a SCARA arm swings a feature chip over a circuit board and
  seats it on the footprint under the pointer (`forms`, `seo`, `auth`, `blog`).

The earlier tool tray (`figures/tool-tray.js`, `public/figures/hairline-tool-tray.html`)
is also kept but not shown.
