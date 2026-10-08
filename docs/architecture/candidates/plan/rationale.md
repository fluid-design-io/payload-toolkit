# Candidate B: an installation plan owned by one workspace

## Problem

Payload owns the base application, shadcn owns source installation, and the developer or selected agent owns contextual integration. A successful subprocess cannot establish that the intended files reached the application. This design makes an immutable installation plan the common identity for intent, mutation and receipts. It preserves the agreed CLI and native authentication, while replacing this branch's old application with a toolkit repository. Main retains v3. The [grounding reports](../../grounding-upstream.md) remain constraints, including the unqualified status of the researched v4 tuple.

## Usage

```sh
payload-toolkit init acme --framework next --database postgres --template minimal --package-manager pnpm
payload-toolkit init acme --framework tanstack --database mongodb --template custom --features forms --codex
payload-toolkit add forms --cwd ./existing-app --allow-dirty --json
```

Interactive runs fill missing inputs. Unattended init supplies every choice and `DATABASE_URI`. JSON mode never prompts. An agent flag selects installed Codex or Claude; neither flag produces a copyable prompt. These internal call sites implement that experience:

```ts
import { run } from '@payload-toolkit/workspace'

const result = await run(request, renderEvent) // CLI request has already been parsed.
process.exitCode = result.exitCode

const retry = await run(addFormsRequest, writeJsonEvent)
// Matching installed artifacts produce a fresh observation receipt without rewriting them.
```

```sh
pnpm setup -- --run forms-next-postgres
pnpm doctor -- --run forms-next-postgres
pnpm verify -- --run forms-next-postgres
pnpm evidence -- --run forms-next-postgres
pnpm cleanup -- --run forms-next-postgres
```

Contributor commands use the same packed CLI as users. They run committed integration recipes and acceptance predicates. Default CI substitutes mock agent executables.

## Shape

`InstallPlan` is a closed union of init and add records, created from validated intent, a qualified catalog and a target snapshot. It contains facts and expected artifacts, never executable steps. `Workspace.run` plans and executes within one invocation. It alone records attempts and authorizes target writes through the official generator, public shadcn installer and selected agent. No public plan parser, plan editor, resume command or generic workflow language is needed, per interface-depth and boundary-discipline. The caller sees one request, typed events and three outcomes.

Before mutation, the owner records Git status and hashes relevant starting files. Each installed-file receipt binds the item digest, source digest, qualified shadcn output digest and observed digest. An exact guide match is mandatory before handoff. Shadcn may transform TypeScript, so source equality is not assumed. Qualification records its expected output; unexpected differences stop handoff. Plans and attempts have separate IDs. A rerun creates a new plan after observing current files, per make-operations-idempotent. No receipt promises rollback or hidden resumption.

The owner holds one target lease because arbitrary application edits cannot be merged safely. Fixture workers use separate projects, databases and evidence directories, per separate-before-serializing-shared-state. Package exports and import checks restrict access to the workspace entry point. Registry wire objects stay within its adapter, per boundary-discipline. A source-only forms item and guide install no toolkit runtime library.

## Synthesis decision

Pending the independent comparison. This candidate proposes the private immutable plan and workspace owner as the base; it has not read the other candidate.

## Tradeoffs accepted

- We accept private plan and receipt types in exchange for binding intended content to actual mutation without making callers coordinate stages.
- We accept qualification of shadcn output hashes in exchange for detecting skipped files without duplicating its transforms.
- We accept stopping on modified feature files in exchange for preserving developer changes. Upgrade and merge policies remain future work.
- We accept three repository packages in exchange for enforceable boundaries between the shipped CLI, workspace policy and contributor verification.

## Alternatives considered

- A command service that executes directly and records only resulting files has the same small caller interface and less internal data. It loses the common immutable comparison point for retries, collisions and source-bound proof. Adding those checks later recreates a plan across unrelated functions.
- An application plugin that installs runtime extensions hides more host wiring. It makes every generated app depend on toolkit lifecycle and weakens developer ownership of copied source. It also cannot replace native configuration and route differences with a single safe API.
- A public plan/apply SDK exposes policy timing, serialization and stale-plan recovery to every caller. It hides less work behind a larger interface than `run`; current callers do not need it.

## Open questions and risks

- Does pinned shadcn produce the same qualified source bytes with the chosen universal configuration in both configured and unconfigured hosts? The first contract fixture must answer this before release.
- Which researched v4 combinations pass the complete fixture suite under Node 24.21? Source inspection alone cannot enable them in a released catalog.

## Next implementation step

Build one disposable `add forms` contract fixture around the public pinned shadcn API, proving target handling, guide identity, transformed-source expectations, collision detection and a receipt without launching an agent.
