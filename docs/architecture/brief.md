# Usage-first architecture brief

Design the agreed Payload v4 toolkit, using `progress.md` and the three grounding reports as constraints. Write usage before signatures. Existing v3 remains on main; the new branch can replace the application tree with a CLI-focused repository rather than duplicate a legacy application inside it.

## Callers

```sh
payload-toolkit init acme --framework next --database postgres --template minimal --package-manager pnpm
payload-toolkit init acme --framework tanstack --database mongodb --template custom --features forms --codex
payload-toolkit add forms --cwd ./existing-app --claude
payload-toolkit add forms --cwd ./existing-app --allow-dirty --json
```

Interactive invocations fill missing choices. Noninteractive invocations must supply required choices. `init` and `add` are the first commands. A flag selecting an agent requests automatic integration; no agent flag leaves a copyable integration prompt. The strict agent flag changes invocation status only, not infrastructure readiness. npm, pnpm and Bun install generated projects; Bun owns repository installation and CI; Bun runs the CLI; Node is retained for official Payload tooling.

A cloud contributor must be able to install locked dependencies, provision or connect isolated test services, check readiness, drive mapped behavior, preserve evidence, and clean up owned resources. Commands and skills must work outside Cursor as well as inside it. Do not launch paid agents in the default test suite.

## Ownership to preserve

The official Payload generator owns base templates. The toolkit owns verified compatibility, user intent, target/Git policy and stage reporting. Shadcn public APIs own registry installation and dependency/source transformations. Installed guides and the developer's selected agent own host-specific integration. The developer owns generated source and infrastructure configuration. Committed acceptance scripts own pass/fail predicates. The trusted CI reporter owns proof comments; contributed code has no reporting credentials.

## Required artifacts

Each candidate writes its own `rationale.md`, `module-map.md`, and `sketch.ts`. Follow the supplied Architect rationale template. The sketch uses explicit `not implemented` errors and pseudocode; it is design documentation, not production code. Include typed requests, installation/agent/verification outcomes, registry metadata parsing, upstream bootstrap adapter, stage events, and evidence boundaries. Explain repeated and interrupted installation handling without promising rollback. Include the package/repository layout and the smallest first implementation step.

Compare at least one genuinely different whole-system shape. Do not add a generic workflow DSL, a custom registry resolver, a host-wiring manifest language, or an application runtime dependency merely to make the diagram symmetric. Keep domains discoverable and dependencies enforceable so future agents cannot bypass ownership by importing internals.

## Sources

The original Architect runner prompt and rationale/red-flag references are downloaded under `.scratch/architect/pstack/skills/architect/`. Its source revision is recorded in `progress.md`. Candidate directories are independent writable outputs; all other paths are read-only during sketching.
