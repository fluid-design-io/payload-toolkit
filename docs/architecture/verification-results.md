# Local qualification record

On October 7, 2026, the packed CLI passed the following fixtures on macOS with Node 24.21.0. Runtime cells used pnpm 10.34.6, owned PostgreSQL 17.7 or MongoDB 8.0.16 containers, and real Chromium. Each runtime cell passed 12 checks. npm 10.9.2 and Bun 1.4.2 passed four installation checks each.

The final root `pnpm check` passed registry qualification, compilation, typecheck, lint, import boundaries and all 40 tests. Formatting and `git diff --check` passed. Tests include actual public shadcn installation, npm pin preservation, divergent-file refusal, Git/index preservation, process cancellation, CLI input policy, mock agent outcomes and trusted reporter validation.

| Framework | Database | Mode | Package manager | Evidence |
| --- | --- | --- | --- | --- |
| Next.js | MongoDB | Runtime | pnpm | [1791410527300-1a24059d](../../.scratch/verification/1791410527300-1a24059d/evidence.json) |
| TanStack Start | MongoDB | Runtime | pnpm | [1791410589711-f282c35e](../../.scratch/verification/1791410589711-f282c35e/evidence.json) |
| Next.js | PostgreSQL | Runtime | pnpm | [1791410724426-27f405aa](../../.scratch/verification/1791410724426-27f405aa/evidence.json) |
| TanStack Start | PostgreSQL | Runtime | pnpm | [1791410768376-48ae8092](../../.scratch/verification/1791410768376-48ae8092/evidence.json) |
| Next.js | PostgreSQL | Installation only | npm | [1791410548862-74cc62ec](../../.scratch/verification/1791410548862-74cc62ec/evidence.json) |
| Next.js | PostgreSQL | Installation only | Bun | [1791410632499-9aede472](../../.scratch/verification/1791410632499-9aede472/evidence.json) |

All six runs used the same package SHA-256:

```text
4b44fda37fdc0956389cbf8d39ada62e9031a1bca0b8d9a3b267188a09059e22
```

The tested dirty source digest and source-at-pack digest were both:

```text
db85aa18c951f1a4570d9c556713a5c90178d07c2aa497333daec3c498c86095
```

The recorded Git revision was `1aa6214ec38d45bf60bd04125ba037efb306e425`. Toolkit changes were uncommitted. Final documentation and the scoped lint configuration were added after those fixture snapshots. They do not enter the published package. A final repack confirmed byte-for-byte equality with all six qualified artifacts and is retained in `.scratch/final-package-179141-check/`. The receipts identify the tested snapshot rather than claiming the later documentation has the same source digest.

The official tuple is `create-payload-app@4.0.0-canary.38`, Payload `4.0.0-canary.38`, and official template revision `a3e91f11d020907600ba27f199368869f1bb6daa`. The raw Forms registry item is `1f09f7f91457a34a80ef2fe08d1a5aefb8c45197f7f2461edf0973ff39df7f69`. Its installed guide matches source identity `eade31543e679f86f1fa558869399d793166735bac14fdfad02d40e7935ceac0`. Each receipt also records its lockfile, resolved dependencies, database image and integrated source.

Runtime checks exercise native first-administrator registration/login, anonymous access restrictions, server field validation, disabled server-rendered submission, real browser persistence, console notification tied to the saved ID, controlled HTTP failure, and saved values visible through the native admin. Builds and typechecks run separately. Screenshots and sanitized command/browser/server logs remain beside each receipt. Every listed run completed cleanup; owned workspaces and database containers were independently confirmed absent.

Earlier failures remain in `.scratch/verification`. These include fixture assumptions about first-user registration, submission before hydration, and npm's caret save policy. Corrections led to fresh run IDs. No retry rewrote an earlier failure into a pass.

This matrix does not prove every framework/database/package-manager combination. npm and Bun qualification covers installation only. Local tests do not prove Windows behavior, remote runner execution, arbitrary host wiring by a real model, external email delivery, production deployments or load capacity. Mock agents and reporter network tests exercise protocol boundaries without using paid accounts or posting GitHub comments. The trusted reporter must reach the default branch before it can run there.

The evidence directory is ignored local output. Reproduce portable checks through [verification commands](../verification.md); GitHub Actions publishes its own artifacts when the workflows are activated.
