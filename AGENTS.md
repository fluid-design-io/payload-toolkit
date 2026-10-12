# Payload Toolkit v4

A Bun CLI that pulls Payload's official v4 starter and installs developer-owned
features through shadcn registries. `main` holds the v4 CLI; the v3 app lives in
fluid-design-io/payload-better-auth-starter. Do not restore it here or apply these
pipelines there.

## Setup and checks

Use Node 24.21.0 and Bun 1.4.3. Run `bun install --frozen-lockfile`,
`bun run check` and `bun run agent:doctor`. Tests use `bun:test`. Typecheck with
`bun --check`: at the root `bun check` runs the `check` script, and `tsc` only
emits the build. Run the CLI from source with `bun src/cli.ts` or the build with
`bun dist/cli.js`. Generated projects install with npm, pnpm or Bun; fixtures
default to pnpm 10.34.6.

For behavior or runtime changes, follow
`.agents/skills/verify-payload-toolkit/SKILL.md`. Report static, installer,
agent-process, database and browser proof separately. An unavailable capability
is blocked, not a pass. Default checks never launch a paid model; real agent
evaluation needs an explicit request. That skill is the only shared one; other
skills, pstack configuration, `.claude` and `.cursor` are personal and ignored.
`CLAUDE.md` points here.

## Ownership

`src/cli.ts` calls only `src/operations/index.ts`, never `operations/private/*`;
`scripts/check-boundaries.ts` enforces this. The operation owns the target lease,
Git policy, stage results and agent handoff. Payload's pinned official generator
(`catalog/bootstrap.json`) owns base source, including its `AGENTS.md`; `init`
appends a section pinning `payload-toolkit@<version> docs`. shadcn's public APIs
own registry installation. Never import shadcn internals or add a host-wiring
manifest language. Preserve installed source ownership and native authentication.

Leases are never reclaimed automatically: a dead parent cannot prove its
descendants stopped. Divergent existing files stop a write, even with
`--allow-dirty`. Partial installs are kept for inspection, never rolled back.

## Registry contributions

The canonical catalog is `registry/registry.json`; the build derives CLI choices
and registry artifacts from it. A bundled feature needs ordinary source exports,
a versioned `GUIDE.md`, compatibility metadata and an executable entry in
`scripts/fixtures/feature-map.ts`. External URLs and shadcn namespaces install
without toolkit metadata or guides; their compatibility claims are advisory.

Community listings live in `catalog/community-registries.json`. Run
`bun run registries:build` and commit the JSON with the generated
`docs/community-registries.md`. Listing is for discovery, not installation
permission.

## Docs and dependencies

Usage docs in `docs/usage` ship in the package and `payload-toolkit docs` prints
them; update them in the same change as CLI behavior. The README stays a short
landing page. Do not add design-history docs; git history keeps decisions.

Add a direct dependency only with a current caller. TypeScript stays at 6.0.3
because the boundary check uses its compiler API, which 7.x moves behind unstable
imports. Use `Bun.file()` and `Bun.write()` for plain file I/O; keep
`node:fs/promises` for directories, exclusive creation, permissions and fsync.
Renovate groups the Payload pins in `catalog/bootstrap.json`,
`registry/registry.json` and the Forms guide; requalify the four runtime cells
before merging, and choose the template commit deliberately.

## Web app

`app/` is an independent Bun project deployed on Vercel. Run its commands from
that directory and read `app/AGENTS.md`. Keep web dependencies out of the CLI.
CI skips CLI checks for app-only changes, and Vercel skips builds without app
changes.

## Limits

Do not stash, reset, stage or commit users' application changes from the toolkit.
Do not infer runtime verification from an agent's exit status. Do not post proof
comments, merge, publish or provision paid infrastructure unless the user has
authorized that action. Releases follow `docs/releasing.md`; maintainers retain
merge and release authority.
