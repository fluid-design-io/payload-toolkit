# Synthesized architecture

## Problem

The toolkit must install developer-owned Payload v4 source into new and established applications. Payload owns official templates, shadcn owns registry installation, and the selected developer or agent owns contextual wiring. Installation, agent invocation and runtime verification are separate facts. Main contains the v4 CLI. The separate `payload-better-auth-starter` repository retains the v3 application.

## Usage

```sh
payload-toolkit init acme --framework next --database postgres --package-manager pnpm
payload-toolkit init acme --framework tanstack --database mongodb --package-manager pnpm --features forms --codex
payload-toolkit add forms --cwd ./existing-app --claude
payload-toolkit add forms --cwd ./existing-app --allow-dirty --json
```

Missing choices prompt on a terminal. Unattended runs supply framework, database and package manager. Features are optional; an empty list yields the plain official starter, and an agent requires at least one feature. A database connection is optional; configure-later uses a clearly marked local placeholder without provisioning infrastructure. `--require-agent-success` requires `--codex` or `--claude`. Without an agent flag, installed feature guides produce a copyable prompt.

```ts
import { init, add } from './operations/index.js'
const result = await init(request, { signal, onEvent: render })
const existingResult = await add(addRequest, { signal, onEvent: render })
process.exitCode = existingResult.exitCode
```

Contributor verification invokes the packed CLI and committed fixture integrations. No paid model is needed to prove installer, runtime or agent-process contracts.

## Shape

One publishable root package contains the binary and a private operations owner. Its `init` and `add` entry hides Git policy, compatibility, upstream quirks, collision checks, receipts and optional agent handoff. Build checks prevent the CLI and contributor scripts importing private adapters. There is no public SDK or workflow executor.

The operation owns the target lease and attempt journal. Adapters own project observations, official generator semantics, public registry schemas and agent process syntax. Journals live outside the application. They record the starting Git index and filesystem hashes, writer boundaries, installed artifacts and later agent changes. An interrupted or incomplete attempt stays incomplete. Dirty permission never grants permission to overwrite divergent feature files.

Every existing target lease blocks a new invocation until its ownership is reviewed manually. Parent process death cannot establish that detached descendants have stopped, so the operation never automatically reclaims a lease. Normal completion removes only its own unchanged lease; failed process-tree termination marks it as requiring recovery. Recovery reviews the recorded attempt and surviving owned processes before manually removing that exact lease, preserving source and evidence.

Bootstrap runs the exact official generator/template/Payload tuple in clean staging with `--no-deps --no-git --no-agent`. It exclusively reserves an absent destination and publishes source only. The requested package manager installs dependencies at the final path, then official scripts generate artifacts there. This addresses the observed absolute staging paths in pnpm command scripts. Partial destinations survive failures for inspection.

The bundled shadcn item uses public registry format, root-anchored `~/` file targets and small `meta.payloadToolkit` compatibility data. Parse metadata from fetched items before aggregate resolution drops it. Shadcn installs files and dependencies. The toolkit verifies expected destinations, guide identity and installed dependencies. Bundled features use a small universal catalog with qualified installed bytes. External URLs and namespaces support source transformations and transitive registry dependencies under the [external registry contract](external-registries.md). Their compatibility claims are advisory, and their guides are optional. Source and installed hashes remain distinct facts.

The first Forms item wraps the official form-builder plugin and logs the saved submission ID. Its React example waits for a real response and displays errors. Its versioned guide maps ordinary exports into the host's actual config and routes. Generated applications have no toolkit runtime dependency. Native Payload authentication remains; Better Auth has no admitted v4 item.

## Synthesis decision

Candidate A is the base. The parent scores A 23/30 and B 22/30. The independent judge also favors A, with 25/30 versus 22/30. Both expose a small domain entry; A avoids an extra immutable plan identity and mandatory infrastructure input. Candidate B contributes separate raw item/source/qualified-output/observed hashes, post-integration source evidence, and packed-CLI fixture execution.

Both candidates proposed more repository packages than current callers need. Flatten their ownership boundaries into one package and enforce private imports during checks. Reject a public plan/apply API, generic stage engine, runtime application plugin, broad transformation-profile machinery and an additional form library. Use a bounded qualified first-party item and ordinary React controls first.

The supported candidate models provided independent GPT-family perspectives. The requested Claude/Grok defaults were unavailable. This was not cross-family model review. The locally installed pstack configuration now inherits the parent model.

## Tradeoffs accepted

- A substantial private operation hides policy behind two verbs.
- Divergent files stop installation; automatic upgrades and merges need their own later policy.
- Source publication can leave a partial destination if final-path dependency installation fails. The receipt reports it and no rollback removes developer work.
- Fixed integration code belongs to known test fixtures. It proves those hosts, while real-agent judgment remains a separate opt-in result.
- Initial compatibility uses an exact canary tuple. CI evidence records the resolved lockfile graph and does not imply production infrastructure readiness.

## Alternatives considered

A private immutable plan offers stable intent identity but adds a second representation the current CLI never reviews or edits. A thin subprocess wrapper leaves Git, collisions and ambiguous upstream success to callers. A toolkit runtime plugin changes source ownership and cannot safely abstract differing host routes. Multiple private workspace packages enforce imports but add build and publication machinery for a single binary. The chosen entry retains their ownership rules without that packaging cost.

## Verification and remaining limits

All four Next.js/TanStack Start and MongoDB/PostgreSQL fixture cells passed installation, codegen, typecheck, build and real browser/runtime checks. npm and Bun separately passed installation checks. The registry build qualifies actual shadcn file transformations before accepting installed hashes. The [verification record](../verification-results.md) identifies the package bytes and individual runs.

Native Windows execution, actual GitHub workflow runs and paid-agent integration remain untested locally. Mock agent processes prove invocation, failure reporting and Git preservation. Known fixture wiring proves official template integrations. Neither proves agent judgment in an arbitrary host project.

## Implementation findings

TypeScript 7.0.2 exports its version at the default package entry and moves its compiler AST API under unstable imports. The import-boundary check needs the supported compiler API. Pin TypeScript 6.0.3, matching the official template compiler, rather than depending on unstable API paths or adding another parser.

The public shadcn npm installer respects npm's save policy and can write a caret even when given an exact package version. The registry worker sets save-exact only in its child environment. It preserves the caller's environment and project/global npm configuration. A regression uses the real public installer and a local package registry; final npm and Bun fixtures verify the installed dependency graph separately.

Payload's native first-user registration uses its first-register endpoint. The fixture must not weaken ordinary Users creation access to seed an administrator. The form-builder canary also requires a Lexical confirmation message. The fixture and installed guide supply it without changing plugin ownership.

A browser reached the server-rendered submit control before hydration and performed a native GET. The example now keeps that control disabled until the client effect runs. Tests cover both JavaScript-disabled server output and hydrated persistence. This uses React's documented [client mount readiness pattern](https://react.dev/reference/react/useEffect#displaying-different-content-on-the-server-and-the-client). The one-file lint exception for `react/set-state-in-effect` admits this deliberate extra render; other files retain the rule.

Next's development server writes official agent guidance and changes its generated type import. Runtime source integrity permits only the exact upstream-generated bytes and canonical import transition in the owned fixture. Other source drift fails verification.

Independent review found that parent process death cannot prove a detached writer stopped. Remove automatic stale-lease reclamation. Every existing lease now blocks installation until its owner and descendants are reviewed. Bounded process termination failures retain the lease and record recovery requirements.

These findings changed private adapter policy and fixture assumptions. The public `init`/`add` contract and source ownership remained sufficient. The scrap audit found no repeated need for caller escape hatches, a second workflow representation or a toolkit runtime in generated applications.
