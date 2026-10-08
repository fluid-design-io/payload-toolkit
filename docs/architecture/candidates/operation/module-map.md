# Module map

This branch can replace the old application tree. Main retains v3. The design builds one published CLI artifact and no application runtime package.

## Repository layout

```text
package.json                         private pnpm workspace; portable contributor scripts
pnpm-lock.yaml                       repository dependency lock
pnpm-workspace.yaml
packages/
  cli/                               package name payload-toolkit
    src/bin.ts                       parse terminal input, select init/add, render results
    src/intent.ts                    flags, prompts, mutual exclusion, noninteractive errors
    src/render.ts                    text/JSON event rendering and exit projection
    package.json                     bin only; bundled private operations code
  operations/                        private @payload-toolkit/operations
    src/index.ts                     public types, init/add, fixed operation logic
    src/private/project.ts           target capability, Git policy, package manager, lease
    src/private/registry.ts          shadcn public contract, metadata, installed-file facts
    src/private/bootstrap.ts         pinned generator binary, base postconditions/codegen
    src/private/handoff.ts           installed guide prompt and Codex/Claude invocation
    src/private/attempts.ts          durable journal bytes; operation owns their meaning
    test/                            private adapter qualification and failure seams
    package.json                     exports only "."; no export wildcard
catalog/
  bootstrap.json                     candidate official tuple and template correspondence
  registry.json                      canonical shadcn catalog index
  forms/
    item.json                        universal registry:item; explicit ~/ root targets
    plugin.ts                        normal exported Payload form-builder wrapper
    example.tsx                      portable React form; real persisted response handling
    guide.md                         versioned Next/TanStack integration and access guidance
  release-evidence.json               generated compatibility admissions, never hand edited
acceptance/
  feature-map.ts                     executable predicates; catalog coverage must agree
  forms.ts                           persistence, access, browser behavior and notification
  native-admin.ts                    native auth/admin acceptance
fixtures/
  locks/                             tested resolutions per framework/database/manager
  existing/                          representative Blog/Lexical and Pages/layout hosts
  integrations/                      concrete fixture code, no host-wiring language
tooling/
  cli.ts                             setup, doctor, verify, evidence, cleanup commands
  fixtures.ts                        project/service/port leases and run lifecycle
  verify.ts                          readiness and acceptance execution
  evidence.ts                        allowlisted proof encoding and immutable attempts
  catalog-build.ts                    public shadcn build, hashes and coverage admission
  package.ts                         CLI bundle, assets, pack/install smoke assertions
  trusted-report.ts                  reporter parser, default-branch code only
.github/workflows/
  install.yml                        clean repository and packed CLI installation
  registry.yml                       schemas, immutable closure, item/guide identity
  static.yml                         lint, typecheck, build
  runtime.yml                        fixture matrix, no paid credentials
  agent-contract.yml                 fake agent executables and outcome semantics
  proof-report.yml                   trusted workflow_run reporting
  renovate.json                      grouped v4 updates, tested PRs, manual merge
docs/                               contributor protocol and installed-guide authoring rules
```

`catalog-build` uses the pinned public shadcn build or item loading API. It does not implement graph resolution. The build packages fully materialized item JSON under the CLI's `assets/registry/`, with guide/source content and SHA-256 identities. The same JSON can later be hosted without changing the installation contract. The first Forms item has no registry dependencies. Any later registry dependency must have an immutable packaged or remote reference and appear in the upstream-resolved closure. Dependency declarations remain shadcn-owned.

The canonical catalog names the items. The acceptance map names executable functions for those items. Build fails if the sets differ or a compatibility cell lacks required predicates. This is an enforced agreement between different owners, not two silently synchronized discovery lists. Release eligibility derives from revision-bound fixture evidence for the exact tuple and source/guide/package identities. Draft qualification records cannot advertise runtime verification.

## Ownership and imports

| Owner | Owns | Allowed callers |
| --- | --- | --- |
| CLI | Terminal input, JSON/text rendering, exit policy | Binary entry |
| Operations public entry | Init/add decisions, semantic attempt state and outcome | CLI and contributor tooling |
| Private project module | Canonical target identity, Git baseline, writable capability, package manager, toolkit lease | Operations entry |
| Private registry adapter | Upstream schema/resolution/install calls, small metadata decoder, expected/install artifact facts | Operations entry |
| Private bootstrap adapter | Exact executable/template/runtime correspondence, generated base facts | Operations entry |
| Private handoff adapter | Guide prompt, installed-agent syntax and observed invocation result | Operations entry, after successful installation |
| Private attempts module | Append/flush/read of validated journal storage | Operations entry |
| Fixture owner | Isolated projects, services, ports and cleanup capabilities | Contributor CLI and acceptance runner |
| Acceptance scripts | Pass/fail predicates for actual behavior | Verifier |
| Evidence owner | Versioned proof encoding, identity bindings, attempt preservation | Verifier and trusted reporter reader |

The operations package exports only `init`, `add` and their domain types. CLI and tooling import its package name, never a file path. Separate composite TypeScript projects reject cross-package source imports outside their roots. ESLint rules reject deep package imports and relative crossings, including scripts and tests. Within operations, only the entry and colocated owner tests can import a private adapter. The build runs these rules. The packed CLI must contain its bundled operations code, registry JSON and guidance; its generated publication manifest contains no unpublished workspace dependency.

Traces stay short. `bin.ts -> operations/index.ts -> private/registry.ts` completes an add installation. `bin.ts -> operations/index.ts -> private/bootstrap.ts` explains base generation. `operations/index.ts -> private/handoff.ts` explains invocation. Event stages describe what happened; they do not create modules called load, validate, transform or save.

## Installation policy

The operation opens an attempt before mutation, resolves the canonical target and obtains a toolkit lease. It checks Git at the existing root or nearest parent repository for a fresh target. Non-Git projects remain valid. Clean is the default. `allow-dirty` records HEAD, branch, index identity, porcelain status and hashes of relevant starting files. It never stashes, resets, stages or commits. Generator `--no-git --no-agent` preserves that ownership. The operation does not initialize Git implicitly.

For `init`, the destination must be absent. Bootstrap runs in an owned, clean temporary parent outside the user project, because upstream detects existing framework markers in its working directory. It selects the fixed `blank` or `blank-tanstack` template, exact source SHA, Payload version and package manager. Configure-later uses an explicit development placeholder, never `--db-accept-recommended`. Provided connection values travel through a private secret holder and redacted process records. The upstream adapter records actual manifest, adapter, installed-package and generated-artifact facts. It runs missing required codegen with the template's verified commands. If a postcondition fails, initialization is partial or failed even after generator exit zero.

Custom installs features into that same owned staging project through shadcn. Minimal uses the inspected upstream README as installed base guidance. Publishing reserves the destination with an exclusive create and copies without overwrite. It records publication progress. Node directory rename is not treated as a portable no-clobber transaction. A crash can leave a partial destination, and a repeated `init` refuses it with the old attempt path for review. It never silently deletes the destination or staging output.

For `add`, the operation inspects the actual installed Payload tuple and framework markers. It refuses ambiguous package-manager markers and ineligible compatibility cells. It fetches packaged items with `getRegistryItems`, validates every item through the upstream schema, then decodes `meta.payloadToolkit`. It uses `resolveRegistryItems` for the installation closure, whose aggregate does not retain item metadata. This first catalog admits universal files with explicit root targets such as `~/payload-toolkit/forms/plugin.ts` and `~/docs/payload-toolkit/forms/guide.md`. The adapter converts these to project-relative expected paths and rejects traversal or symlink escape. The qualified root syntax prevents shadcn's ordinary targets moving under `src` in one host layout and losing that prefix in another. Neither a `components.json` file nor Tailwind initialization is required. It loads project registry configuration and calls `addRegistryItems` with the supported options only.

Collision admission compares expected bytes with present bytes before mutation. Missing files may install; identical files may remain; a different existing guide or source blocks the item. `overwrite` stays false. Dirty permission never grants overwrite permission. After installation, hashes, declared package specs, installed dependency versions and package-manager state must match the resolved item. An upstream success that skipped a required file is insufficient. Same-byte repeated installation may become `verified-existing` without rerunning the installer. A partial repeat can fill absent files only when all present expected files match. Dependency failures remain partial, with file observations preserved.

The lease protects toolkit writers, including a selected agent launched by this invocation. It is not a claim that arbitrary editors or unrelated agents obey it. Preflight and mutation-boundary fingerprints detect relevant external drift. Unexpected changes stop further writes or handoff and produce a partial/conflicted record. Changes that happen during an external process cannot be undone safely. The record attributes observations to the process interval, without claiming every filesystem change came from that process.

Each attempt uses its own directory in OS user state, keyed by canonical project identity and an opaque attempt ID. Receipts do not dirty the project. Journals flush mutation-start before invoking an upstream writer, then append observed facts. Interrupted attempts cannot masquerade as successful receipts. Live leases refuse a second writer. Stale lease recovery requires recorded owner death on this host; uncertain or remote owners block rather than being guessed dead. Abort terminates owned child processes, records the attempt and retains files. A signal or crash never schedules an agent retry.

## Handoff and status

The operation checks installed guide/source identities before creating a prompt. Manual mode returns that copyable prompt, guide paths and commands. Agent mode uses the user's explicit installed Codex or Claude selection, project directory and rules. It sets no model, account, approval bypass, sandbox bypass or permission override. Claude print-mode trust behavior belongs in adapter documentation and invocation tests. Spawn, exit, interruption and available structured permission facts determine the invocation outcome. Agent prose cannot populate verification results.

An installed outcome and a failed agent invocation can coexist. Default CLI exit depends on installation. Strict-agent also requires the selected invocation to finish successfully. It never depends on database readiness. JSON exposes installation, integration and verification separately, with journal paths and redacted diagnostics. Observers receive monotonic attempt-local events; an observer failure cannot rewrite installation facts.

## Portable verification and evidence

```sh
pnpm install --frozen-lockfile
pnpm toolkit:setup --agent codex
pnpm toolkit:doctor --services docker
pnpm toolkit:verify --feature forms --framework next --database postgres --services docker
pnpm toolkit:verify --matrix --services supplied
pnpm toolkit:evidence --run <run-id>
pnpm toolkit:cleanup --run <run-id>
```

The setup command checks an explicitly chosen installed agent and prints portable contributor instructions. It does not run a paid session or change user accounts. Doctor checks the pinned full Node 24.21 runtime, pnpm, built artifact, package-manager availability and service capabilities. HTTP success alone is not readiness. The fixture readiness predicate checks the expected Payload route/schema and a database-backed native-admin operation.

Docker provisioning gives each run unique resources, database identity, labels and ports. Supplied services must allocate an isolated fixture database or provide an explicitly designated empty test database. Supplied URLs are secret inputs, not public proof fields. Cleanup uses a recorded ownership capability, never a database suffix or a guessed container name. Borrowed test databases are retained by default. Cleanup is idempotent for resources the run owns. It preserves attempt evidence and reports resources it could not remove.

Committed fixture integration code edits only known fixture hosts, based on the installed guide and item identity. It is test code, not a language for editing arbitrary applications. Release qualification covers Next/Mongo, Next/Postgres, TanStack/Mongo and TanStack/Postgres; clean project installation exercises npm, pnpm and Bun. Existing-host fixtures cover different config/rendering ownership. Fixture lockfiles record the graph that prerelease template ranges actually resolved.

Forms uses the upstream plugin's normal collections and a small console notification hook. Checks assert a valid browser submission reaches persistence, authenticated admin sees it, anonymous reads fail, invalid/missing-form submission produces the expected error, and the browser reports success only after the response. A log must name the saved submission to satisfy notification evidence. The example fields have explicit validation. These checks do not claim arbitrary dynamic-form validation or email delivery. Native-admin checks do not use the old Better Auth helpers or generated roles.

Evidence binds source SHA plus source archive hash when dirty, packed CLI hash, bootstrap tuple, item/guide/closure hashes, Node/package-manager versions, framework/database, fixture identity, exact acceptance command, attempt and CI run. Every retry receives a new attempt; a later pass never replaces a failure. Raw logs remain private run artifacts until an allowlisted/redacted export. A guide-bound deterministic integration proves the known fixture, not that a real agent successfully integrated any existing project. Real-agent runs are opt-in separate records.

Independent CI jobs have read-only repository permissions and no paid-model or reporting credentials. Runtime jobs upload versioned evidence whether they pass or fail. The trusted reporter runs default-branch parser code, validates bounded data, fetches actual workflow/run/head identities, checks required job conclusions and publishes a revision-bound summary without executing artifacts. A new PR head makes old proof stale. Modifications to acceptance predicates still require maintainer review. The reporter cannot turn contributed test code into a trust guarantee. Maintainers retain merge/release authority. Renovate groups v4 changes and requests tested PRs; it does not auto-merge. Standard GitHub runners come first; Blacksmith has no dependency until measured fixture workloads justify it.

## Dependencies and release admission

| Scope | Choice | Reason |
| --- | --- | --- |
| Repository | pnpm, pinned full Node 24.21 runtime | Locked reproducible contributor/CI environment; Payload requires Node >=24.15 |
| CLI | Node `util.parseArgs`, `readline`, `child_process`, `fs`, `crypto` | Intent, terminal questions, argument-array subprocesses and identities without extra framework dependencies |
| Operations runtime | exact `shadcn@4.21.4` | Public schema/resolution/install APIs; `@shadcn/registry@0.1.3` remains its pinned implementation dependency |
| Bootstrap execution | exact `create-payload-app@4.0.0-canary.38` binary | No generator internals or vendored template; tuple includes source SHA and exact Payload packages |
| Installed Forms source | exact `@payloadcms/plugin-form-builder@4.0.0-canary.38` | Official collections/admin/submission owner; must match the admitted host Payload tuple |
| Installed example | React supplied by the official host | Native form state/fetch needs no replacement form library or UI system; do not reintroduce React Hook Form/Radix |
| Development | TypeScript, ESLint, bundler, test runner, Playwright | Boundary enforcement, packed artifact verification, static checks and browser behavior |
| Fixture adapters | PostgreSQL/Mongo clients in dev tooling only | Isolated service allocation/readiness; no database client in the published installer |
| Renovation | Renovate configuration for the new package/catalog | Tested grouped update proposals with manual merge |

The initial exact generator tuple comes from Ground, not executed evidence. Public release admission fails until required fixture proofs match the source and delivered artifacts. Private colocated adapter tests can qualify a candidate tuple before that admission exists. Final delivered CLI/registry tests then run with its admitted tuple, and release packaging requires their identities too. There is no public `allow-unverified` flag. A missing or stale admission produces a compatibility error rather than an agent workaround. Better Auth has no selectable catalog item, peer dependency or fixture until v4 support is proven.

## Design screen

Callers never coordinate load/validate/save methods. Transport objects do not cross the operations entry. Only operations can mint writable project or installed-receipt capabilities. The registry builder does not duplicate shadcn resolution, and guides do not duplicate installer writes. Export maps plus source-boundary checks make internals fail the build when imported from another owner. Catalog/acceptance coverage is enforced. No generic workflow DSL, host-wiring language or app runtime dependency appears in the design.
