# Architecture judgment

Choose the operation candidate as the base, then flatten its repository into one publishable CLI package. Preserve its `init` and `add` ownership. Adapt the plan candidate's file-identity and fixture evidence rules without introducing a separate planner or executor.

This is an independent cross-judge reading of all six final candidate files, the shared brief, grounding, upstream report, rubric and Architect references. No runtime checks or new research were performed. The configured runners and judge inherit the parent model. This review does not provide model-family diversity or cross-family verification.

## Independent scores

Scores assess the submitted candidates before the recommended changes. Parent scores remain for the parent to record separately; none are invented here.

| Criterion | Operation | Plan |
| --- | --- | --- |
| Ownership | 5 | 5 |
| Interface depth | 5 | 4 |
| Agent extensibility | 4 | 4 |
| Execution correctness | 4 | 3 |
| Verification | 5 | 5 |
| Initial scope | 2 | 1 |
| Total | 25/30 | 22/30 |

1. Ownership. Both delegate base generation to the pinned executable, registry installation to public shadcn APIs, integration to installed guides and the selected developer agent, and reporting to trusted CI code. Both reject toolkit application runtime dependencies and custom registry resolution. Operation gives installed receipts a narrow admission role. Plan keeps its plans private and never loads them as execution authority.
2. Interface depth. Operation exposes two complete domain verbs and keeps exit projection in the CLI. Plan also gives callers one complete operation, but its domain request carries strict CLI status policy and its result returns an exit code. Its private `run`, `planInstallation` and `Workspace.execute` split is additional structure without a demonstrated second caller requiring it. Plan is not a generic workflow DSL, so that accusation would be incorrect.
3. Agent extensibility. Both derive catalog identities and enforce agreement with executable acceptance mappings. Both specify export and source-import checks instead of trusting folder names. Operation's domain folders are easier to discover than Plan's broader `policy`, `model` and `system` owners. Neither deserves full marks until those checks exist and a second feature demonstrates the extension path.
4. Execution correctness. Operation specifies divergent-file refusal, partial repeats, no-clobber publication, uncertain lease ownership, cancellation and installation-only versus strict invocation status. Plan covers most of the same behavior but requires `DATABASE_URI` for unattended init, lacks cancellation in its public signature, and describes absent-target checks without Operation's explicit exclusive reservation. Plan also overstates attribution of agent-period writes despite allowing external editors. Both propose publishing installed staging directories, which needs the correction below.
5. Verification. Both require actual packed-CLI, static, database, browser, access and mock-agent checks; preserve failed attempts; bind evidence to tested identities; and separate protected reporting from contributed execution. Both keep source-supported tuples in qualification status. Plan more explicitly binds verification to post-integration source and records cleanup. These are verification designs, not evidence that fixtures passed.
6. Initial scope. Both overbuild a first CLI. Operation creates a workspace and two packages; Plan creates three packages, a separate acceptance command package, private plan identities and qualified output-profile records. One root package can enforce the same ownership with import checks. Plan also adds a form library without establishing that the first example needs it. The brief requires a real portable form, not that dependency.

## Base and grafts

Use Operation's resolved requests, discriminated installation outcome, installed-receipt handoff admission, default configure-later connection choice and exclusive publication policy. Noninteractive installation can be complete without provisioning a database. Qualify placeholder-based codegen; if required installation postconditions cannot pass, report a partial installation instead of silently demanding infrastructure or claiming success.

Use one root `payload-toolkit` package with `src/cli/`, `src/operations/index.ts` and private domain owners for project policy, registry, official bootstrap, handoff and attempts. Keep catalog assets, acceptance predicates and contributor tooling outside the shipped application code. Ship a binary without a public SDK. The CLI and contributor tools may import only the operations entry; tests may import only their assigned owner. Run source-import rules and publication checks in the build. Folder flattening must preserve these rules.

Adapt these Plan details:

- Distinguish item identity, raw source identity, qualified installer output and observed installed bytes. The narrow upstream smoke found byte-preserved plain TypeScript and Markdown. Use that verified profile first; qualify transformations when an item actually needs them. Keep guide bytes exact. Do not implement shadcn's transformations locally.
- Bind runtime evidence to the post-integration source digest and reject source drift during checks. Keep installation, agent invocation and verification receipts distinct.
- Exercise contributor fixtures through the packed CLI. Private adapter tests remain useful for controlled failure seams, but do not replace delivered-artifact checks.
- Record cleanup results and retain failures from every attempt.

## Required execution correction

The parent supplied a new grounding observation: installed pnpm `node_modules/.bin/payload` embeds absolute staging paths in `NODE_PATH`. Copying or moving an installed staging project cannot establish dependency relocation correctness. This observation was supplied by the parent and was not re-executed by this judge.

Generate source in a clean owned staging parent with the pinned executable and `--no-deps --no-git --no-agent`. Exclusively reserve the absent destination and publish source only. Then install with the requested package manager and run official codegen commands at the final path through the official adapter. Inspect dependency and generated-artifact postconditions there. Retain a destination and attempt record when install or codegen fails. Do not copy `node_modules`, claim rollback or add a public stage API. Ground explicitly allows `--no-deps` when the toolkit owns the subsequent installation and codegen.

## Rejections and red-flag screen

Reject both workspace layouts, a separately published operations SDK, a generic plan/apply executor, serialized replay authority, and duplicate mutation paths. Plan's closed private expected-installation data can become an ordinary internal record when needed; it does not need its own class or execution service.

Reject required infrastructure configuration as an unconditional unattended-init prerequisite. Reject broad output-profile machinery until qualified transformations require it. Reject an additional form dependency unless its behavior is needed by the agreed example. Reject agent-period source attribution as proof that the child caused every change; record observations during that interval.

Neither candidate introduces temporal load/validate/save modules, public transport types or an upstream resolver clone. Both address split write ownership and hand-synchronized catalog lists with explicit build gates. The main red flags are unnecessary package and executor layers, potential bypass through unenforced private imports, and duplicate catalog/acceptance lists if the promised coverage gate is omitted. Flattening addresses package overhead, not those enforcement requirements.

Start implementation with one packed `add forms` slice against an isolated existing fixture. Prove metadata rejection, literal root targets, identical repeats, divergent collisions, partial dependency failure and receipt-gated handoff before adding init or paid-agent execution.
