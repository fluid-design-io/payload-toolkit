# Operation-owned candidate

## Problem

Payload Toolkit needs to turn a user's choices into installed, developer-owned v4 source without taking over their application. The official generator owns the base, shadcn owns registry transformations, and guides own host integration. Existing forms are incomplete v3 references. The researched v4 tuple is still awaiting runtime qualification. A generator exit code or an agent's final message cannot certify a working application.

## Usage (caller's view)

```sh
payload-toolkit init acme --framework next --database postgres --template minimal --package-manager pnpm
payload-toolkit init acme --framework tanstack --database mongodb --template custom --features forms --codex
payload-toolkit add forms --cwd ./existing-app --claude
payload-toolkit add forms --cwd ./existing-app --allow-dirty --json
```

Missing choices prompt only on a terminal. The shown noninteractive commands are complete. Database configuration defaults to configure-later unless a connection is explicitly supplied. No database is provisioned by `init`. `--codex` and `--claude` are mutually exclusive. Manual mode prints a prompt naming installed, hashed guidance. `--strict-agent` changes the invocation exit rule; it cannot make verification pass.

Three call sites define the internal contract:

```ts
// CLI, after resolving terminal input.
const outcome = await init(intent.request, { signal, onEvent: renderer.accept })
renderer.finish(outcome, intent.exitPolicy)

// Existing-project CLI branch. It does not coordinate upstream stages.
const outcome = await add(intent.request, { signal, onEvent: renderer.accept })

// Contributor tooling, after installation into an isolated fixture.
const proof = await verifyFixture({ fixture, installation: outcome.installation })
await writeEvidence(proof)
await cleanupFixture(fixture)
```

See [sketch.ts](./sketch.ts) for complete requests, result narrowing and contributor commands.

## Shape

The private operations package exposes `init` and `add`. Each call owns target/Git policy, compatibility admission, upstream installation, postconditions, a durable attempt receipt and optional agent handoff. The CLI supplies intent and renders events. It never obtains a writable target or calls an upstream adapter. This is a deep interface, per `interface-depth`: two verbs hide the decisions callers would otherwise repeat.

The main structures are a resolved request, an exclusive target capability, immutable item identities and a discriminated outcome. Only a successful installation contains an installed receipt; only that receipt admits handoff, per `encode-lessons-in-structure`. Private adapters translate generator arguments and shadcn data into domain facts, per `boundary-discipline`. Metadata describes compatibility and guidance, never Payload config edits. Upstream resolution remains upstream-owned. Packaged immutable registry JSON works before hosting or publication. The public [shadcn API](https://ui.shadcn.com/docs/registry/api-reference) supplies fetching, resolution and installation.

Attempt directories belong to individual invocations. Evidence directories and services belong to individual fixture runs, per `separate-before-serializing-shared-state`. The application directory really is shared, so an operation holds one toolkit lease through installation and requested agent invocation. External editors remain outside that lease; snapshots detect relevant drift and stop handoff. Interrupted writes remain visible. Matching installed bytes permit a verified repeat; divergent files block before mutation. There is no rollback, automatic resume or automatic paid-agent retry, per `make-operations-idempotent`.

The [module map](./module-map.md) assigns every invariant one owner and enforces package boundaries. Its executable feature map owns acceptance predicates. Source, guide, tuple, fixture, package and run identities bind proof. Installation, invocation and verification remain separate facts.

## Synthesis decision

Pending the orchestrator's comparison. This candidate recommends the operation-owned package as the base.

## Tradeoffs accepted

- We accept a substantial operation implementation in exchange for callers needing only two verbs.
- We accept refusing divergent collisions and retaining partial output in exchange for preserving developer edits without an invented rollback contract.
- We accept a long lease during an explicitly requested agent run in exchange for preventing a second toolkit writer from installing into that same application.
- We accept bundling a private workspace package into the CLI artifact in exchange for enforceable imports and one published package.
- We accept deterministic fixture integration plus separate optional real-agent evaluation in exchange for reproducible CI without paid-model credentials.

## Alternatives considered

- A public planner and executor would expose a typed installation plan, approval and execution methods. It hides process execution well, but exposes target capabilities, compatibility snapshots and stale-plan rules to every caller. That contract is worthwhile for a product that reviews or edits plans. This CLI asks for complete operations, so those extra coordination obligations lose on interface depth.
- A thin wrapper around generator and shadcn CLIs would hide command spelling. It leaves Git policy, ambiguous upstream success, receipts, collisions and guide admission in the shell and fixtures. Each new caller would need the same knowledge. It is simpler to build and shallower to use.
- Separate bootstrap and feature packages with public mutation APIs make each domain easy to find, but require callers to preserve a target lease and identity across both. Private adapters retain that discoverability without splitting write authority.

## Open questions and risks

- Will the pinned candidate tuple pass all four framework/database fixtures under the full Node 24.21 version before it becomes an admitted release tuple?
- Can each pinned official template run required artifact generation with configure-later database settings, or must installation return a partial result until the developer supplies a connection?
- Which existing-project fixtures best expose the Blog/Lexical versus Pages/layout mismatch, and can their browser checks show the guide's actual integration boundary?

## Next implementation step

Build the private registry adapter and an `add forms` vertical slice against one isolated existing fixture, proving metadata rejection, divergent-file refusal, matching repeats and a durable partial receipt with a mocked process, before adding bootstrap or real-agent invocation.
