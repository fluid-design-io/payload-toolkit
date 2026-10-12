# Payload Toolkit web

React 19 / TanStack Start app that turns registry choices into a Payload Toolkit
command or a paste-ready agent prompt. It is an independent Bun project; use
Node 24.21.0 and Bun 1.4.3.

```sh
cd app
bun install --frozen-lockfile
bun run dev
```

Open http://localhost:3000.

## Routes

- `/` shows the interactive robot-arm Hairline figure and a "Start customizing" link.
- `/workspace` is the configurator. A category rail and a search narrow a grid of
  registry cards; each card toggles one item. A floating bar holds project
  settings, the selected items and a Copy button for the `payload-toolkit init`
  command or the agent prompt. The setup is mirrored in the URL, so a shared
  link restores the same build.
- `/lab` hosts the React Three Fiber mocks, including the fab-line factory.

## Checks

```sh
bun run typecheck
bun run test
bun run verify:stack
bun run build
```

## Catalog snapshot

`src/routes/workspace/-workspace/workspace.catalog.ts` is generated from
`../registry/registry.json` and `../catalog/community-registries.json`. Rebuild
and commit it when either changes:

```sh
bun run catalog:sync
```

## Deployment

Vercel project `image-vision/payload-toolkit`, root directory `app`.

See [AGENTS.md](./AGENTS.md) for conventions, HeroUI and environment handling,
preview generation and Hairline figures.
