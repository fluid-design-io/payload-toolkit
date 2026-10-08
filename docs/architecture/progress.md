# Payload Toolkit v4 architecture and implementation

Current repository: `fluid-design-io/payload-starter`, default branch `main`.

Development originated on `codex/payload-toolkit-v4` in the v3 repository. The initial design and grounding documents below preserve that historical context. The maintainer authorized a separate public repository and the v4 push on October 7, 2026.

## Architect phases

- [x] Ground: trace existing ownership, upstream integration contracts, and historical constraints.
- [x] Sketch: compare two structurally distinct usage-first designs and an independent judge.
- [x] Agree: synthesize against the decisions already confirmed in this conversation.
- [x] Implement: replace the chosen sketch with executable code and verification.
- [x] Scrap: audit implementation friction; the chosen ownership and two-verb contract absorbed the observed constraints without a new public abstraction.

## Arena phases

- [x] Frame the shared brief and task-specific rubric.
- [x] Fan out isolated candidate designs.
- [x] Cross-judge completed candidates.
- [x] Pick a base after reading both candidates.
- [x] Graft useful ideas and record rejected alternatives.
- [x] Verify the synthesized design against runnable acceptance checks.

## Completed verification

The final `pnpm check` passed registry qualification, build, typecheck, lint, module boundaries and 40 tests. Formatting and whitespace checks passed. Four framework/database runtime fixtures and two additional package-manager installation fixtures passed against identical packed CLI bytes. The [qualification record](verification-results.md) links retained receipts and states their limits. Independent review reproduced ownership failures, verified their fixes and reviewed the scoped hydration lint exception.

All listed fixture workspaces, owned database containers and recorded servers were removed. Actual Windows/GitHub execution and real paid-agent wiring remain unrun locally. The workflows and trusted reporter are prepared, with activation requiring their installation on the default branch.

Main still points to `2883d2bfdb9e468939c844bd27e5497905cb4bbf`. The branch includes the separately committed shared pstack installation at `1aa6214ec38d45bf60bd04125ba037efb306e425`; Toolkit implementation remains uncommitted. No package publication, remote rename, PR comment, merge or paid-agent invocation was performed.

## Agreed scope

Build `payload-toolkit` in the `payload-starter` repository on `main`. The separate `payload-better-auth-starter` repository retains the Payload v3 application and its existing main branch. Repository creation and the initial v4 push are authorized; subsequent publishing still requires maintainer authorization.

The CLI supports `init` and `add`. Minimal delegates a verified pinned official Payload generator/template/version tuple. Custom starts with that same base. Verified combinations cover Next.js and TanStack Start with MongoDB or PostgreSQL. Native Payload authentication remains available; Better Auth is unavailable until its v4 support is proven. Forms is the first catalog item, with persistence, admin access, a working example and console notifications. Additional blocks, upgrades, discovery and skills commands are future directions.

Use shadcn's public registry format and APIs with small Payload compatibility metadata. Registry installation owns source and dependency installation. Versioned guides describe integration into the user's actual project rather than a hardcoded wiring language. Generated source belongs to the developer.

Agent handoff uses installed Codex or Claude through mutually exclusive flags, preserving existing accounts, permissions and project rules. Without a flag, print a prompt referencing the installed guide. Check Git before mutation; an explicit dirty override records the starting state. Do not automatically stash, reset, stage or commit. Default status reflects installation; report agent and verification separately, with an optional strict agent-invocation flag.

Create portable agent setup, doctor, verification, evidence and cleanup commands. Use isolated fixture projects and disposable databases, with Docker or supplied test service URLs. Maintain an executable feature map. Evidence binds results to source and guide/item identities and preserves failed attempts.

Independent GitHub Actions checks run installation, registry, lint, typecheck, builds, runtime fixtures and mock agent outcomes, without paid-model credentials. Local or cloud contributors use their own agent accounts. A trusted reporter publishes revision-bound proof summaries without executing untrusted artifacts. Maintainers retain merge/release authority, with focused reruns where needed. Standard public GitHub runners are the initial baseline; benchmark Blacksmith only after fixtures exist. Renovate applies to v4, with grouped tested PRs and manual merging.

## Research provenance

Architect, how, why and arena are reviewed from `cursor/plugins`, pstack revision `d0ef80d86795816da932a153458c5dbe192d294e`. The user's supplied Architect workflow controls this task. Cursor-specific model defaults are unavailable in this executor; available supported models will supply the independent candidate perspectives and that limitation will be recorded.

The same pinned pstack sources were installed into the repository during grounding, with local compatibility and model-role configuration. Those files are now untracked personal tooling; this records their use during design rather than a contributor prerequisite. The shared verification skill remains tracked and self-contained.
