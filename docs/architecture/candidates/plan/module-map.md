# Candidate B module map

## Repository shape

This branch replaces the old root application. It does not embed a second copy of v3. The remote name, main branch and package publication remain unchanged during implementation.

```text
package.json                         private pnpm workspace and contributor commands
pnpm-workspace.yaml
pnpm-lock.yaml
packages/
  cli/                               publishable payload-toolkit package
    src/main.ts                      parse init/add, prompt, render domain events
    src/arguments.ts                 mutually exclusive agent flags, required inputs
    package.json                     bin only, bundled workspace implementation
  workspace/                         private @payload-toolkit/workspace
    src/workspace.ts                 exported run, sole target and attempt owner
    src/model.ts                     requests, plans, results, receipts
    src/policy.ts                    pure compatibility, collision, exit decisions
    src/catalog.ts                   qualified tuple/item selection
    src/receipts.ts                  private serialization and observation rules
    src/adapters/
      official.ts                   pinned executable, output checks and codegen
      registry.ts                   public shadcn schema, resolution and installation
      agents.ts                     Codex/Claude invocation and outcome parsing
      system.ts                     process groups, paths, Git, hashing, target lease
    generated/catalog.json           generated item/profile identities
    generated/registry/forms.json    same item emitted for the public registry
    package.json                     exports only ./dist/workspace.js
  acceptance/                        private @payload-toolkit/acceptance
    src/main.ts                      setup, doctor, verify, evidence, cleanup
    src/fixtures.ts                  isolated projects and owned resources
    src/feature-map.ts               executable feature requirements
    src/checks/                      committed predicates and browser/HTTP tests
    src/integrations/next.ts         deterministic guide implementation for fixtures
    src/integrations/tanstack.ts     deterministic guide implementation for fixtures
    src/evidence.ts                  result validation and static report generation
    package.json                     exports only contributor command
registry/
  registry.json                      single authored list of registry items
  forms/
    item.json                        upstream schema with small Payload meta
    plugin.ts                        upstream formBuilderPlugin and notification hook
    example-form.tsx                  portable TanStack Form example
    guide.md                         versioned host integration instructions
catalog/
  compatibility.ts                   researched tuple and its qualification state
scripts/
  build-registry.ts                  pinned public shadcn build, package public artifacts
  check-boundaries.ts                reject forbidden package and adapter imports
skills/contributing/SKILL.md          portable commands and evidence rules
docs/contributing.md                 same command entry points, usable without a skill
.github/workflows/
  checks.yml                         independent unprivileged jobs
  report.yml                         trusted completion-event reporting
renovate.json                         v4 grouped tested PRs, manual merging
```

The registry build derives names and file hashes from `registry.json` and its items. It emits both bundled installation JSON and public registry output. Acceptance refers to item names from that generated catalog. The feature map owns behavior requirements, which cannot be derived from source filenames; a check rejects catalog items without mapped tests and stale feature-map entries.

Repository dependencies are TypeScript, a small CLI argument/prompt library, the pinned shadcn public package and one schema validator for toolkit metadata and evidence. Node APIs cover filesystem, hashing and child processes. pnpm owns repository installation and CI. Vitest and Playwright are development dependencies. Exact versions are selected and locked during implementation. Payload, framework packages and database adapters belong to generated fixtures. Forms installs its exact qualified Payload plugin and TanStack Form dependency through shadcn. Apps never import `payload-toolkit`.

Use NodeNext package resolution, composite project references, package `exports`, and boundary checks. A named import such as `@payload-toolkit/workspace/src/adapters/registry` fails resolution. Relative cross-package source imports fail the repository boundary check and build gate. Only `workspace.ts` imports mutation adapters; adapters cannot import one another. Avoid a public testing export. Tests inside the workspace package can exercise its private policy with fake process/file ports; acceptance tests invoke the packed CLI.

## Owner and data flow

The principal trace is CLI entry to workspace owner to the relevant adapter. Receipt helpers belong to the owner rather than forming a second orchestration layer. Event names express execution stages, but modules group knowledge rather than becoming `load`, `validate`, `apply` and `save` wrappers.

| Knowledge | Owner | Why the boundary earns its place |
| --- | --- | --- |
| Prompt defaults and output mode | CLI | Converts terminal inputs into a complete request without exposing command syntax downstream |
| Compatibility, dirty policy, collision policy, run outcome | Workspace | Coordinates every target writer and gives callers one complete operation |
| Official template mapping and generator quirks | Official adapter | Converts a pinned tuple into arguments and verifies actual generated outputs |
| Registry wire schemas and installation API | Registry adapter | Parses unknown data and delegates transforms/dependencies to shadcn |
| Agent executable behavior | Agent adapter | Preserves user settings and reports process outcomes without claiming integration success |
| Behavioral pass/fail and resource lifecycle | Acceptance | Produces independent fixture evidence from committed checks |
| PR comment authority | Trusted workflow | Accepts bounded evidence for a verified revision without running contributed code |

`InstallPlan` has two variants. Init records its official base and feature items. Add records its observed supported host and feature items. Both record the target snapshot and catalog identities. There is no list of generic commands, plugin registry or configurable stage order. `minimal` selects no features; `custom` starts with the same official base and adds the chosen items. Better Auth is rejected by catalog compatibility before mutation.

Plans are deeply readonly, runtime-frozen values made inside `Workspace.run`. They are never loaded from disk as executable instructions. A redacted summary can appear in JSON events. The durable record is an observation receipt, not a future command. This keeps a future agent from treating yesterday's plan as authority to modify today's project.

## Bootstrap and registry boundaries

The researched tuple is `create-payload-app@4.0.0-canary.38`, template commit `a3e91f11d020907600ba27f199368869f1bb6daa`, Payload `4.0.0-canary.38`, tested under the pinned Node 24.21 runtime. Next selects `blank`; TanStack selects `blank-tanstack`. MongoDB and PostgreSQL map to the upstream database flags and adapters. Its source-supported status becomes releasable only after fixtures pass. Released users cannot select an unqualified tuple or moving version.

The official adapter runs the pinned executable from a private staging parent without host application markers. It passes an argument array with template commit, Payload version, database choice, secret URI, requested package-manager flag, `--no-git` and `--no-agent`. Secret arguments are redacted in evidence. It allows the generator to install dependencies and generate artifacts. It then verifies manifests, adapters, installed package versions and required generated files; missing/failed codegen remains a failed installation. It never imports the generator's broken published source exports. Publishing the staged project to the requested absent destination requires an unchanged parent and absent target. Failed staging remains discoverable in the attempt receipt for explicit cleanup. It never merges a failed fresh project into an occupied destination.

Registry files are bundled build artifacts, so `addRegistryItems` receives a verified absolute local JSON path. The same bytes can later be served as a public registry. This avoids requiring a hosted registry or fake URL during development. The adapter loads project registry configuration, validates the item's upstream schema, parses its small `meta.payloadToolkit`, and delegates resolution and installation to public shadcn APIs. [The public API contract](https://ui.shadcn.com/docs/registry/api-reference) establishes `getRegistryItems`, `resolveRegistryItems`, `getRegistriesConfig` and `addRegistryItems`; no private CLI command module is imported.

The first forms item is universal. Use `~/payload-toolkit/forms/plugin.ts`, `~/payload-toolkit/forms/example-form.tsx` and `~/docs/payload-toolkit/forms/guide.md` as `registry:file` targets. The root prefix matters: the parent's actual pinned-API smoke found that plain targets move under an existing `src` directory, while `~/` targets retain their location in both layouts. Source can be relocated during contextual integration if the host compiler requires it. The item has no registry dependencies, alias imports, CSS, font or environment mutations. Npm dependencies stay in the upstream `dependencies` field. Toolkit metadata contains feature/version identity, compatible Payload versions/frameworks, native-auth requirement and guide target. Parse it from fetched items before public resolution aggregates them and drops item metadata. It contains no edit recipes. A future transitive item requires immutable references and public shadcn resolution; v1 rejects unsupported closure rather than implementing a resolver.

Each qualified installation profile binds the exact shadcn version and universal configuration to expected output hashes. The item digest and raw file digest remain separate from the expected installed digest because upstream transforms TypeScript. A guide must retain its original bytes. Qualification installs the item through the actual API in representative configured and unconfigured hosts, verifies executable behavior, and records output hashes for review. Runtime compares observed files to that profile. Unexpected differences fail with file paths and safe hashes; they are not silently normalized by toolkit code. If qualification cannot make this small universal profile stable, redesign this receipt comparison before release.

For add, package-manager state comes from the existing host. Conflicting lockfiles or manifest markers fail preflight. The installer has no invented package-manager override, dry-run or changed-file receipt. For init, the selected official installer establishes the markers. `overwrite` stays false. The owner checks expected targets before calling shadcn and inspects all expected outputs and dependency resolution afterward. A successful call that skipped an old file cannot produce a complete receipt.

## Git, retries and interruptions

The owner checks the enclosing Git repository before mutation. It records HEAD, status, index identity and relevant tracked/untracked source hashes. A dirty tree fails unless `--allow-dirty` explicitly selects `record-dirty`. A directory outside Git records that fact and a filesystem baseline. Init checks its parent and records an absent destination. No automatic Git initialization, staging, stashing, reset or commit occurs.

An exclusive lease covers the canonical target path. It stops two toolkit processes from mutating one target; it cannot block an editor. Recheck the relevant baseline immediately before each mutating adapter call. Drift stops the operation and leaves all completed changes. Lease recovery verifies that the owning process is gone before another run can acquire it. Do not delete a lease based on elapsed time alone.

Attempts live outside the target in the platform user-state directory with restricted permissions. A journal starts before the first write and records writer boundaries, local process identity, snapshots and file observations. Each append is flushed at the boundary. A killed process can leave a pending journal; the next run classifies it as interrupted and observes the real target. No hidden retry executes it.

Repeated `add forms` with all expected source/guide files and required installed dependencies produces `already-present` plus a new receipt. Missing files with otherwise matching content may be installed through shadcn in a new attempt. Any conflicting existing file stops before mutation, including an intentionally edited old feature. A dependency failure after file creation records partial installation and retains that source. Reruns never erase failed attempts. Fresh init refuses occupied destinations even when an earlier attempt created them. Its report directs the developer to inspect that target or choose another name.

The workspace owner releases the target lease after agent invocation and a final snapshot. Agent writes are attributable to the selected child invocation, with before/after digests. A successful agent exit never certifies them. No agent flag means no model launch and a handoff prompt containing only the observed guide path and supported instructions. `--codex` and `--claude` conflict; `--strict-agent` requires one. The adapter passes no permission bypass, settings replacement, model override or account credentials.

## Evidence and contributor execution

An installation receipt proves which item and guide reached which paths at the installation boundary. The optional agent receipt proves invocation details and observed resulting changes. A verification receipt proves the committed checks that ran against a specific post-integration source digest. None proves production service readiness or email delivery. Console notifications prove a log event associated with a persisted submission ID.

Each receipt records toolkit Git revision and source digest, packed CLI hash, bootstrap tuple, registry item and guide identities, observed source digest, Node/package-manager versions and lockfile digest. Verification adds test revision, fixture ID, service ownership IDs, command, attempt ID, output artifact digests, failed assertions and cleanup result. A rerun gets a new attempt ID and predecessor reference; reports retain earlier failures.

`setup` installs locked repository dependencies and creates or connects isolated fixtures. Docker mode allocates containers, database names and ports per fixture. Supplied-service mode receives an explicitly provisioned disposable database and ownership declaration; lacking database-creation rights is a doctor error, not permission to empty an existing database. Cleanup may stop owned processes and remove owned containers/databases/directories. It must preserve externally owned services and evidence. Cleanup authorization derives from the recorded resource creation identity, never a database-name suffix.

`doctor` checks the actual Node/tool versions, package-manager markers, database connectivity and application/schema readiness. HTTP 404 or 405 is insufficient. `verify` runs committed setup/integration recipes and predicates against fresh packed-CLI output. The executable feature map requires:

- Four framework/database combinations, native admin login, exact Payload tuple and adapter, fresh codegen, typecheck and build.
- npm, pnpm and Bun generated-project installation checks, with pnpm for repository CI.
- Fresh and representative existing-project forms installation, configured and unconfigured registry hosts, repeated/colliding/interrupted installation, dirty-policy and no-Git cases.
- Browser submission with real success and failure states, persisted values, authorized admin visibility, denied anonymous reads and a matching console notification.
- Explicit server validation for the example's declared fields. The plugin's limited generic dynamic-field validation must not become a broader claim.
- Mock agent success, failure, missing executable, denied permission and signal interruption, including default versus strict exit behavior.

Framework integration fixtures deliberately exercise the installed guide's steps with committed code. They do not pretend to prove arbitrary agent judgment. Real-agent runs use contributor accounts, opt in separately, and are labeled with the executable/version and the actual later verification result. The forms source preserves native admin ownership, uses the upstream form-builder plugin, disables unsupported upload/payment examples and logs no submitted personal values. Guides locate real Payload config, route mount, admin collection, import-map/types commands and example route rather than prescribing legacy Acme destinations.

CI separates registry/package installation, lint, typecheck, build, runtime/browser fixtures and mock-agent checks. Each job has no paid-model credentials and no reporting token. The trusted completion workflow uses its own protected code, checks run/repository/PR/head identities, validates bounded JSON, and links artifacts with their digests. It never executes artifact contents or checks out the contributed revision under reporting credentials. It labels stale revision evidence and preserves maintainer merge/release authority. Public GitHub runners are the baseline; Blacksmith comparison waits for measured fixture workloads. Renovate groups v4 changes into tested PRs with manual merging.

## Design screen and implementation boundary

There is one target writer, one request entry point, one upstream installation path and one catalog source list. Public callers do not assemble plans or coordinate phase methods. Adapters hide actual protocol differences. The plan is a typed value inside the owner, not another public service. Module dependencies have a build gate, and no generated app needs a toolkit runtime.

Ground is complete from the supplied reports. This package completes one Sketch candidate. Agree, Implement and any later Scrap decision belong to the parent architecture workflow. These files make no installation, test, service, publication or release claim.
