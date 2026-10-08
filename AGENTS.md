# Payload Toolkit v4

The shared verification skill lives in `.agents/skills/verify-payload-toolkit`.
Other agent skills, pstack configuration, `.claude` and `.cursor` folders are
personal tooling and are ignored. Contributor checks require no personal skill
installation. `CLAUDE.md` points to this file for the same repository guidance.

This repository contains the v4 CLI on main. The separate
fluid-design-io/payload-better-auth-starter repository retains the v3 app.
Do not restore the old app tree here or apply these v4 pipelines to that
repository. The architecture contract and decision record are under
`docs/architecture/chosen`.

Use Node 24.21.0 and pnpm 10.34.6 for reproducible contributor checks. Start with
`pnpm install --frozen-lockfile`, `pnpm check` and `pnpm agent:doctor`. For user
behavior and runtime work, read `.agents/skills/verify-payload-toolkit/SKILL.md`.
Run the mapped checks, retain failed evidence, and clean up only resources your
run owns. Report static, installer, agent-process, database and browser proof
separately. An unavailable capability is blocked, not a pass.

The CLI calls `src/operations/index.ts`. It must not import private adapters.
The operation owns target/Git policy, stage results and agent handoff. Payload's
pinned official generator owns base source; shadcn's public APIs own registry
installation. Preserve installed source ownership and native authentication.
Never import shadcn internals or add a host-wiring manifest language.

Registry contributions need ordinary source exports, versioned GUIDE.md,
compatibility metadata and an executable acceptance entry. Build derives CLI
choices and registry artifacts from the canonical catalog. Update the feature
map when behavior changes. Real agent evaluation uses contributor accounts and
must be requested explicitly; default checks never launch a paid model.

Do not stash, reset, stage or commit users' application changes from the toolkit.
Do not infer runtime verification from an agent's exit status. Do not post proof
comments, merge, publish or provision paid infrastructure unless the user has
authorized that action. Maintainers retain merge and release authority.
