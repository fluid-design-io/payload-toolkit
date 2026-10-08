# Contributing to Payload Toolkit

This repository develops the v4 toolkit on `main`. The separate `payload-better-auth-starter` repository retains the v3 starter. Use Node 24.21.0 and Bun 1.4.2, then run `bun run agent:setup` and `bun run agent:doctor`.

Repository guidance lives in `AGENTS.md`; `CLAUDE.md` points to it. The shared [verification skill](../.agents/skills/verify-payload-toolkit/SKILL.md) is tracked for contributors and cloud agents. Other agent skills, pstack configuration, `.claude`, `.cursor` and `skills-lock.json` are personal and ignored. The contributor workflow requires no personal skill installation.

Run `bun run check` and `bun run agent:verify --cli-only` for a CLI change. Runtime changes also require the applicable fixture cells described in [verification](./verification.md). CI uses GitHub's standard runners and no paid-agent secrets.

Repository tests use `bun:test` through `bun run test`. Bun runs the delivered CLI; Node is retained for official Payload tooling. Generated projects support npm, pnpm and Bun independently of the repository package manager; verification fixtures default to pnpm 10.34.6, which must be installed for those checks.

The bundled registry catalog is the feature list. A bundled item needs normal source exports, a versioned integration guide, compatibility metadata, an executable `feature-map.ts` acceptance entry, and a maintained verification skill document. Use the packed artifact in fixtures. Do not add a second installation path or import the product's private mutation adapters from contributor scripts.

To list a community registry, add an entry to `catalog/community-registries.json` and run `bun run registries:build`. Commit the JSON and generated `docs/community-registries.md` together. `bun run registries:check` rejects invalid entries and outdated Markdown before the main check rebuilds assets. See [community registries](community-registries.md) for the entry fields. Listings need no toolkit metadata, integration guide, or acceptance fixture. Directory review grants discovery, not installation permission or compatibility certification.

External registry changes require packed CLI coverage for URLs, namespaces, transitive dependencies, repeated installation, file collisions, and agent handoff without a guide. Record installation, agent-process behavior, and runtime checks separately. Compatibility claims remain advisory, and real agent evaluation requires an explicit request.

Local and cloud agents use their own installed account and permission settings. Deterministic checks use mock agent processes; actual agent integration results are separate evidence. Preserve unrelated files and failed attempts. Maintainers review, merge and release; a successful agent message or PR proof comment does not perform those actions.

Renovate targets `main`, groups Payload and shadcn contract changes and leaves merging manual. The pinned official tuple and fixture locks must be deliberately updated and requalified together.

Renovate reads root package dependencies and uses three scoped regex managers for the Payload pins in `catalog/bootstrap.json`, `registry/registry.json` and the Forms guide target sentence. Generator, Payload, feature dependency, exact compatibility and declared guide target versions are proposed together in the manual Payload v4 tuple PR. Canary discovery includes versions beyond npm's latest tag. The template commit stays a deliberate qualification choice: confirm that source commit against the proposed generator release, then run the four runtime cells before merging. A grouped update alone does not establish compatibility. The extraction test covers the current single-version compatibility contract; expanding that contract requires updating the extraction and checks together.

Bun runs repository scripts directly; `tsx` is unnecessary. Plain file I/O uses `Bun.file()` and `Bun.write()`. Keep `node:fs/promises` for directory operations, exclusive file creation, permissions and fsync; Bun implements these APIs. These choices follow [Bun's file I/O guidance](https://bun.sh/docs/runtime/file-io) and preserve toolkit ownership and recovery contracts.
