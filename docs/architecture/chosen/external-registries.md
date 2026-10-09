# External registry installation

## Installation and compatibility

Developers can install a bundled feature, a direct shadcn registry URL, or a shadcn namespace reference. `init --features` accepts the same references. Community directory membership does not grant installation permission. Unlisted URLs remain installable.

External compatibility is advisory. Upstream items can target Payload v3, omit toolkit metadata, or omit an integration guide. The toolkit records the available claims and provides an integration prompt. The developer or selected agent adapts the source to the host. Installation never silently downgrades the host to meet an upstream version claim.

Bundled features retain the exact checked Payload tuple, versioned guides, qualified installed bytes, and executable acceptance requirements. An external registry listing does not inherit those guarantees. Runtime evidence identifies an item, its observed source, and the tested host combination.

External installation supports source files, blocks, UI components, CSS and CSS variables. Base projects, fonts, registry inheritance, environment writes and Tailwind configuration changes require manual setup. Alias-based qualification currently requires local TypeScript or JavaScript paths without `extends`, and shadcn aliases that start with `@/` or `./`. Other alias contexts stop before installation because their destinations cannot be qualified safely. Root-anchored source files without shadcn configuration do not need host alias resolution.

## Ownership and provenance

The existing operation owner remains the base design. Its private registry adapter uses shadcn's public schemas, APIs, and CLI. The CLI imports only the operations entry. No private shadcn modules or host-wiring manifest language enter the product.

Registry resolution captures the root item and dependency graph before installation. All subsequent transformations and writes use that captured source, so a remote update cannot change an item between inspection and installation. Shadcn resolves namespaces using its directory and the host's `components.json` configuration. The community directory does not add another namespace resolver.

Shadcn owns source transformations and dependency interpretation. The toolkit runs transformations in isolation before writing to the host. A host without shadcn configuration can receive a minimal `components.json` and stylesheet. The handoff identifies a new stylesheet that needs a host import.

Receipts retain the original reference, resolved item identities, source hashes, expected installed hashes, and observed host files. Source bytes and transformed installed bytes remain distinct facts. These provenance records extend the same design used for bundled items rather than introducing a public plan/apply API.

## Write boundaries

External installation uses the same target lease, Git policy, and attempt journal as bundled installation. Each write checks its destination and starting contents. Unsafe destinations and divergent existing files stop the affected write. `--allow-dirty` permits unrelated starting changes without permitting destructive file replacement.

Registry dependencies receive the same checks as the root item. Repeated installs preserve already installed source. Partial attempts retain their files and evidence for inspection. The toolkit never stashes, resets, stages, or commits application changes.

## Integration handoff

An installed guide contributes item-specific instructions when present. Without a guide, the prompt identifies installed files and asks the developer or agent to inspect imports, upstream documentation, host configuration, and required checks. Payload block registration and renderer integration belong to this contextual step.

`--codex` and `--claude` remain optional. Without either flag, installation returns the same copyable integration prompt. Agent invocations use the contributor's existing account and permission settings. An agent's exit status is separate from source installation and observed runtime verification. Codex's trusted-directory rejection produces an actionable handoff failure while retaining the source. The toolkit does not initialize application repositories or bypass the agent's trust check.

## Community discovery

`catalog/community-registries.json` is the authored directory. Each entry names a registry, namespace, homepage, repository, URL template, and description. Optional compatibility data records the upstream claim and its documentation URL.

`bun run registries:build` validates this JSON and generates `docs/community-registries.md` and `assets/registry/community-registries.json`. The build runs after `registry:build`, which replaces the generated registry directory. `bun run check` checks Markdown drift before any generator can hide an outdated listing.

`payload-toolkit registries` exposes the packaged directory through the operations entry. `--json` returns the structured listing. Contributors submit directory entries through ordinary pull requests without adopting toolkit metadata, guides, or acceptance fixtures.

One structured directory supports documentation and CLI discovery. A handwritten Markdown directory would duplicate machine-readable discovery data. A directory allowlist would prevent developers from installing unlisted source without establishing compatibility.

## Verification

Controlled registries exercise external source installation, dependency graphs, namespace resolution, repeated installs, collisions, and guide-free agent prompts at the operation boundary. The live acceptance fixture checks the delivered packed CLI separately. Mock agents test invocation and result reporting without a paid model.

A live item installed into an isolated official Payload v4 project establishes only the checks recorded for that host. Database, browser, and real-agent results remain separate evidence. An unavailable capability is blocked, not a pass. Real-agent evaluation requires an explicit user request.

## Discovery previews

Optional directory `preview.url` and `preview.image` templates, with per-item
`preview.items` overrides or opt outs, supply display metadata for the independent
web app. Upstream `meta.preview` and legacy `meta.image` can supply item-specific
values. See [community registries](../../community-registries.md) for precedence
and URL rules. The web app renders direct images or cached screenshots from an explicit contributor
capture command; images fall back to placeholders on failure. These fields neither authorize installation nor change compatibility,
source qualification, or agent handoff. Preview pages are not embedded; builds and visitors do not run a capture service.
