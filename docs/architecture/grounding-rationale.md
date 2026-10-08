# Grounding and rationale

Ground snapshot: October 7, 2026. Development branch `codex/payload-toolkit-v4`, starting application commit `2883d2b`. This document explains the reasons behind the agreed scope in [progress.md](./progress.md). It does not authorize a repository rename, publication, merge, or deployment.

## Decisions from this conversation

The user chose a Payload v4 toolkit with `init` and `add`, official minimal scaffolding, Next.js and TanStack Start, and MongoDB and PostgreSQL. Forms is the first feature. Payload's built-in admin authentication remains; optional Better Auth waits for demonstrated v4 compatibility. Current v3 application code remains on main while this branch develops the toolkit.

The toolkit installs developer-owned source through shadcn's public registry contract and APIs. Guides describe integration into actual application code. Optional installed Codex/Claude agents perform that integration using their existing accounts and project rules. Without an agent flag, the toolkit prints a handoff prompt. Installation, agent invocation, and verification have separate outcomes. Installation success controls the default exit code, with an optional strict agent-invocation mode.

The user also chose independent remote verification and revision-bound PR evidence. Contributors may use local or cloud agents. CI requires no paid-model credentials. Standard public GitHub Actions runners are the starting point; evaluate alternatives after the fixture workloads exist. Maintainers retain merge and release authority.

## Observed source and history

| Evidence | Observation | Consequence |
| --- | --- | --- |
| Root `package.json`, `src/payload.config.ts`, `docker-compose.yml` | The current project is a Payload v3/Next application with PostgreSQL, Better Auth integration, email/storage services and broad UI dependencies. | Turning this application into every selected output would require removing interconnected owners. Start v4 minimal with upstream templates instead. |
| `extra/blocks/form/component.tsx` | Uses Next search parameters and a simulated delayed submission; real HTTP submission is commented out. | Existing forms are source to port, not proof of working optional installation. |
| `extra/plugins/form-plugin/index.ts`, `before-email.tsx` | Depend on custom fields/access/UI and branded email rendering; the recipient is hardcoded. | Trace complete dependency closure and replace brand/provider assumptions. Console notifications are the agreed initial behavior. |
| Commit `27385f5` | Replaced React Hook Form with TanStack Form and Radix with Base UI across forms and application components. | Preserve the useful forms behavior deliberately; do not reintroduce the former libraries through an unrelated provider default. |
| Commit `cbb05fb`, current `src/tests/helper/run.ts` | Tests moved to HTTP against a real Next server to avoid importing the server-only Payload/Lexical graph into the test process. Current helpers assume Bun, a named PostgreSQL container/database and port 3456. | Preserve the HTTP boundary, replace shared application/container assumptions with per-fixture identity and host adapters. |
| Commit `6c819ba` | The historical storage CI generated Next types before checking a fresh checkout. | Fixtures must include framework-generated types before static checks. A developer's warm `.next` directory is not reproducible evidence. |
| Commit `262ce53` | Deleted the storage integration test, its workflow, documentation and test-only dependencies. Current `.github` has templates but no workflows. | Do not claim that prior PR validation remains an executable current gate. Add independent v4 checks in their own scope. |

[Issue 14](https://github.com/fluid-design-io/payload-better-auth-starter/issues/14) contains the earlier optional-feature proposal. The owner suggested database/auth/content/UI/deployment choices. The contributor then identified a concrete mismatch: this starter uses Lexical blocks in `Blog.content`, while Payload Components expects a Pages `layout` field and `RenderBlocks` mapping. That is an observed integration boundary, not a naming difference. Existing-project agents must inspect the actual host before registering a feature.

[PR 16](https://github.com/fluid-design-io/payload-better-auth-starter/pull/16) explains the recent storage change: a failed MinIO distribution/startup path was replaced by pinned SeaweedFS while retaining the Payload S3 adapter boundary. It distinguishes local storage integration evidence from production durability and data migration, and records successful checks before their deliberate removal. Preserve that evidence discipline in the toolkit.

Historical statements above describe inspected commits and PR text. They do not claim tests were rerun during this Ground phase. Commit links: [forms migration](https://github.com/fluid-design-io/payload-better-auth-starter/commit/27385f5), [HTTP tests](https://github.com/fluid-design-io/payload-better-auth-starter/commit/cbb05fb), [fresh-checkout types](https://github.com/fluid-design-io/payload-better-auth-starter/commit/6c819ba), [test removal](https://github.com/fluid-design-io/payload-better-auth-starter/commit/262ce53).

## Upstream boundaries

Payload's v4 packages provide framework adapters, with an official `blank` and `blank-tanstack`. Their native Users collection uses `auth: true`; optional Better Auth must not remove admin authentication. The published `payload-auth@3.0.0` peer contract excludes Payload v4 and requires Next. Compatibility is an eligibility gate, not something an agent may waive to finish installation.

Official `create-payload-app@4.0.0-canary.38` was inspected. It defaults templates to moving `main` and Payload packages to `canary`; pinning the generator alone does not pin output. A verified tuple must include CLI version, source commit and runtime versions. The resolved source commit for upstream tag `v4.0.0-canary.38` is `a3e91f11d020907600ba27f199368869f1bb6daa`. This is a researched candidate tuple, not a runtime-approved implementation baseline.

Sources: [official template definitions](https://github.com/payloadcms/payload/blob/a3e91f11d020907600ba27f199368869f1bb6daa/packages/create-payload-app/src/lib/templates.ts), [creation pipeline](https://github.com/payloadcms/payload/blob/a3e91f11d020907600ba27f199368869f1bb6daa/packages/create-payload-app/src/lib/create-project.ts), [published auth peer contract](https://registry.npmjs.org/payload-auth/3.0.0).

shadcn installs files, dependencies, CSS and declared environment data. Its registry schema has no general Payload config registration/code-generation hook. Use its public APIs for installation; guides and actual feature exports describe domain integration. Do not force shadcn UI initialization into official minimal output merely to install explicitly targeted universal registry files. Sources: [registry schema](https://ui.shadcn.com/schema/registry-item.json), [public APIs](https://ui.shadcn.com/docs/registry/api-reference).

## Local agent invocation facts

Read-only help inspection found Codex CLI `0.159.3` and Claude Code `2.1.286`. No model session was launched.

Codex supports `exec`, a stdin prompt, `-C/--cd`, `--json` events and output-last-message. Claude supports `--print`, `--output-format` and explicit permission modes. Claude's help states that print mode skips the workspace trust dialog, and invalid settings can be silently ignored in that mode. An adapter must document these behaviors and require an explicit agent choice in the user's project.

Use argument arrays, the selected project directory and guide path. Preserve user settings, accounts and project rules. Do not add approval/sandbox bypasses, ignore-rules, safe-mode or model overrides by default. A noninteractive invocation may encounter denied permissions; retain a handoff and report the actual outcome. Help output establishes available syntax, not authenticated usability, runtime integration success or compatibility with every future CLI version.

## Design conclusions and evidence limits

The following are design inferences grounded in the observations above.

Preserve the v3 application and its unrelated changes. Preserve developer ownership of copied source, native admin auth and the HTTP/runtime testing boundary. Preserve useful forms functionality after removing its demo-only submission and brand assumptions.

Change the v4 delivery unit from one opinionated application clone to a small bootstrap/install toolkit and versioned feature sources/guides. An arbitrary existing host can differ in collection structure, routes, renderer ownership and auth policy. Agents own contextual edits; the installer owns compatibility checks and source/dependency installation. Ordinary exported feature plugins/components keep behavior executable without a universal wiring language.

Avoid storing provider-specific application assumptions in a supposedly generic registry item. Avoid interpreting model exit status or a positive final message as runtime proof. Avoid sharing mutable database names, ports, branches or evidence directories across fixture workers. Avoid rewriting v3 config to accommodate v4 during branch development.

Risks remain explicit. Upstream prerelease APIs can change. A guide may under-specify integration or an agent may change existing access policy. Dependency installation can invoke package scripts. Dirty-work overrides weaken the review boundary and must record starting state. Console email proves an attempted notification, not delivery. External block providers have their own framework/Payload compatibility contracts.

## Reproducible fixture protocol

Each fixture has an owned project directory, database/service identity, port allocation and evidence directory. Bind results to toolkit source SHA, official bootstrap tuple, registry item/guide content identities, package-manager and Node versions, framework/database choices and verification command. Keep failed attempts and distinguish reruns rather than replacing them with a later pass.

Verification runs clean installation, artifact generation, applicable static/build checks, database-backed HTTP checks, and browser checks where behavior requires them. Forms checks cover persisted valid submissions, authorized admin reads, denied anonymous reads, real confirmation/error behavior and independent notification evidence. Test the package/registry as delivered, not only repository imports.

Deterministic CI exercises installer outcomes and mock agent processes. Real-agent evaluation is a separate recorded run. Trusted PR reporting binds summaries to actual tested revision/run/artifacts and never executes untrusted report contents with its credentials. Preserve maintainer merge/release decisions without requiring the maintainer to reproduce every successful fixture locally.

## Coverage map

Consulted this conversation's agreed scope, local application/config/forms/test source, focused Git history, associated GitHub issue 14 and PR 16, upstream Payload/shadcn contracts, and installed CLI help/version output. Earlier research informed framework/auth compatibility and runner choices. No private conversations, mail, Drive documents or unrelated connector data were searched. No production/provider/device validation was performed, and no GitHub comment or remote mutation was made during Ground.
