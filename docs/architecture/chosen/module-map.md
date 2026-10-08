# Module map

```text
package.json                         payload-toolkit; Bun owns repo installation/checks; Bun runs CLI; Node supports official Payload tooling
src/cli.ts                           arguments, prompts, output and exit projection
src/operations/index.ts              init/add and all operation state decisions
src/operations/model.ts              schema-derived domain requests and outcomes
src/operations/private/project.ts    target, Git/filesystem baseline, manager and lease
src/operations/private/official.ts   pinned executable, source-only bootstrap, codegen
src/operations/private/registry.ts   upstream schemas/APIs, compatibility and artifacts
src/operations/private/agents.ts     installed guide prompt and installed agent invocation
src/operations/private/attempts.ts   attempt storage and redacted process records
registry/registry.json               canonical catalog list
registry/forms/                      plugin, example, GUIDE and item declaration
catalog/bootstrap.json               exact official tuple and template mapping
assets/registry/                     generated bundled/public registry item JSON
scripts/registry-build.ts            public registry build and artifact identities
scripts/check-boundaries.ts          imports and catalog/acceptance coverage gate
scripts/agent.ts                     setup, doctor, verify, evidence, cleanup entry
scripts/fixtures/                    owned fixtures, known integrations and acceptance
scripts/trusted-report.mjs           bounded reporter used only from trusted revision
.agents/skills/verify-payload-toolkit/ portable verified workflow and feature map
.github/workflows/                   deterministic unprivileged checks and trusted report
renovate.json                        grouped dependency PRs, manual merges
```

Only the binary and colocated operation tests import the operations entry. Only the operations owner imports mutation adapters. A schema-only model module carries requests/results; shadcn config/wire types stay inside the registry owner. Fixture scripts invoke the built or packed binary and never use a second product installation path. No published export wildcard exposes implementation modules.

Registry names derive from the single shadcn catalog. Acceptance requirements must cover the catalog exactly, with a build check. Every feature has a versioned guide, normal source exports and an executable acceptance recipe. Add no second list for CLI prompts. Generated assets and checks derive from the authored catalog; no authored copy of an official template exists.

Attempts and evidence have separate unique directories outside project Git. The target lease lasts through installation and an explicitly selected agent invocation. Initial snapshots distinguish pre-existing staged, unstaged and untracked changes from later observations. No automatic stash, reset, stage or commit. New-project publication uses exclusive destination creation and source-only copy; final-path install avoids pnpm relocation assumptions.

Required verification covers four framework/database cells, package-manager installation, native admin, Forms submission/persistence/access/console notification, public registry collisions/repeats, and mock agent outcomes. Readiness requires a database-backed operation. Missing services/browser capabilities produce blocked evidence. Docker resources have unique names/ports/ownership labels; supplied test URLs are explicitly disposable and remain borrowed unless the fixture created them. Cleanup removes only owned resources and retains all evidence.

CI has no paid-model keys. A separate trusted reporter checks platform run/PR/head/job identities and parses bounded evidence as data. It does not execute contributed files under a comment token. Its comments distinguish actual CI conclusions from contributor evidence. Maintainers merge and release. Standard public GitHub runners are the first platform; benchmarking other runners follows measured fixtures.
