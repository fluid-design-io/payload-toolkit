---
name: verify-payload-toolkit
description: Verify the packed Payload Toolkit CLI, Forms, and external registries through isolated official fixtures, real databases, browser behavior, and retained evidence. Use after changing toolkit installation, registry guides, fixtures, or reporting.
---

# Verify Payload Toolkit

Read the repository's `AGENTS.md`. Use Node 24.21.0 and Bun 1.4.2. Commands run from the repository root and use the installed contributor scripts, never private installer adapters. No personal skill installation or paid model account is needed. Bun runs the delivered CLI; Node is retained for official Payload tooling. Generated-project installation supports npm, pnpm and Bun independently; fixtures default to pnpm 10.34.6, which must be installed for the default checks.

## Launch

Run `bun run agent:setup`. This installs the frozen lockfile and builds the package. For browser checks run `bun x playwright install chromium`, or `bun x playwright install --with-deps chromium` on Linux. Runtime verification creates its own project, database and server; never point it at the developer's running app.

`bun run agent:verify --cli-only` builds, packs and installs the real artifact into an isolated consumer, then drives help and a failing command. `bun run agent:verify --installation-only --package-manager npm` drives real packed init and add, records the output lockfile and actual installed Payload/Forms versions, then stops before fixture wiring or runtime checks. Windows and macOS CI first run the source-only registry worker test, then the full packed installation. Worker startup and completion use explicit acknowledgements before either process closes IPC. The placeholder database URL is configuration only; this mode needs no database or browser. Use `bun` or `pnpm` for the other installers. Runtime launch is `bun run agent:verify --framework next --database postgres --feature forms`. The verifier starts its own app and requires a database-backed `/api/users/init` response, not an arbitrary responding port. It stops its owned server process group and removes owned Docker containers in a finally block. Timeout cancellation kills the whole owned group and retains failed command evidence. Unconfirmed process cleanup remains failed and retains the workspace for inspection.

## Doctor

Run `bun run agent:doctor --runtime` before runtime driving or after unexpected failures. It reports actual Node/Bun versions, the built binary, Chromium executable, Docker daemon and supplied-service availability. Missing required capabilities are blocked evidence and exit 2. They do not count as a pass.

## Drive

Read `features/README.md` and the selected feature file. Drive Forms with the runtime command above; repeat with `--framework tanstack` and `--database mongodb` for the other cells. `--package-manager npm` or `bun` tests that output installer when available. The default is pnpm.

The known fixture integration reads the installed guide, imports its exported plugin, mounts its real example in the generated host, regenerates types/import map, builds and typechecks. It creates a native admin via real REST, seeds the documented form, submits via Playwright's Name/Email/Message labels and Send button, checks saved fields and admin visibility, denies anonymous reads and ties a console notification to the saved ID. A controlled HTTP 500 tests the example's error handling separately from real persistence. Mock agent contracts use `bun:test` through `bun run test`; no model is invoked by this skill.

Run `bun run agent:verify:external` for packed live Hero Split URL and namespace installation. Add `--runtime` for the known Next.js and Postgres fixture, native authentication, media upload, Page persistence, and browser rendering. Read `features/external-registries.md` for the proof boundaries. These explicit commands use live upstream registries. Default checks do not run them or invoke a paid model.

## Evidence

Run `bun run agent:evidence` or `bun run agent:evidence --run <run-id>` using the run ID printed by verification. `.scratch/verification/<run-id>/evidence.json` retains source revision/dirty digest, packed artifact and bootstrap/catalog identities, package-manager/Node versions, fixture lock/source identities, checks, sanitized commands/log references and cleanup. Browser screenshots and server logs are adjacent. Preserve failed attempts. Installation success, browser behavior and model self-reports are different facts.

Select zero to two useful captures for a review summary. Changes without visible behavior need no image; use one representative screenshot for a visible feature or a before/after pair for a visible bug when useful. Keep other captures in the artifacts, without a per-file or per-test media dump. State which browser assertions passed and, separately, what you actually observed after inspecting the selected images. Capturing an image does not count as visual review. The trusted comment reports three groups of actual GitHub job results and links artifacts; it labels contributed receipt claims separately and marks stale revisions. Local verification never posts a comment.

## Cleanup

Run `bun run agent:cleanup` after a failure, or choose a recorded run with `--run`. It checks the exact Docker ownership label before removing a recorded owned container. It never drops supplied services and never deletes evidence. Do not kill processes by name or reset/stash/commit user work. Normal server teardown belongs to the verifier's finally block; if the verifier was force-killed, inspect its `server.json` and the actual process ownership before any manual stop.

## Helpers

`scripts/agent.ts` exposes setup, doctor, verify, evidence and cleanup. `scripts/fixtures/feature-map.ts` is the executable catalog coverage map. `scripts/fixtures/forms.ts` is the known-host integration and behavior recipe; `services.ts` owns disposable services. Add a catalog feature only with its map entry, real acceptance recipe and feature document. Update this skill and its feature documents when commands, selectors or expected behavior change.
