# Payload Toolkit

A CLI for official Payload starters and developer-owned features. This repository builds the v4 experience on `main`. The existing v3 starter remains in [payload-better-auth-starter](https://github.com/fluid-design-io/payload-better-auth-starter).

The package and command name is `payload-toolkit`. Alpha releases use the `alpha` tag and target the exact Payload v4 canary tuple below. Use Bun 1.4.2 or newer to run the CLI. Creating a project also requires Node 24.15 or newer for the official Payload generator:

```sh
bunx --bun payload-toolkit@alpha --help
bunx --bun payload-toolkit@alpha init acme --framework next --database postgres --template minimal --package-manager pnpm
```

For source development, use Node 24.21.0 and Bun 1.4.2 to install and build. Bun runs the delivered CLI, while Node supports official Payload tooling. Generated projects support npm, pnpm and Bun:

```sh
bun install --frozen-lockfile
bun run build
bun dist/cli.js --help
bun dist/cli.js init acme --framework next --database postgres --template minimal --package-manager pnpm
bun dist/cli.js init acme --framework tanstack --database mongodb --template custom --features forms --package-manager pnpm
bun dist/cli.js add forms --cwd ../existing-payload-project --codex
bun dist/cli.js add https://www.payload-components.xyz/r/hero-split.json --cwd ../existing-payload-project
bun dist/cli.js add @payload-components/hero-split --cwd ../existing-payload-project --codex
bun dist/cli.js registries --json
```

Run `init` without all choices in a terminal for prompts. For unattended execution, supply the directory, framework, database, template and package manager. `--json` returns one result and disables prompts. PostgreSQL uses Payload's Drizzle adapter. MongoDB is the other initial database choice.

Minimal pulls the official Payload blank template. Custom pulls the same base and installs selected features. The toolkit pins the official generator version, template commit and Payload version in [catalog/bootstrap.json](catalog/bootstrap.json). It does not maintain a cloned blank template. The initial tuple is a v4 canary; compatibility checks and runtime evidence apply to that tuple, not every v4 prerelease.

`add` accepts bundled names, direct registry URLs, and shadcn namespace references. Custom initialization accepts the same references in `--features`, separated by commas. Namespace resolution uses shadcn's directory and your project's `components.json` registries. The [community directory](docs/community-registries.md) lists Payload-related registries. `registries` prints that directory, and `registries --json` returns its structured data. Listings are for discovery and do not certify Payload v4 compatibility.

Database setup belongs to the application developer. Supply `--database-url` or `DATABASE_URI` for an existing connection. Without one, the generated environment contains a local configure-later placeholder. Installation does not provision services or prove that deployment infrastructure is ready.

Forms is the first feature. It installs the official form-builder plugin wrapper, a React submission example and a versioned `GUIDE.md`. The guide asks the developer or selected agent to inspect the real config, routes and native admin authentication before wiring it. Submissions persist in Payload and create a console notification. Better Auth is unavailable until its v4 support is proven.

## Agent integration

`--codex` or `--claude` invokes the already installed agent CLI with an integration prompt. Bundled features include a versioned guide. External items can omit guides and toolkit metadata. Their prompt asks the agent to inspect the installed source, imports, upstream documentation, and actual host before adapting the integration. Both flags together are invalid. The toolkit uses the agent's existing account, model, project rules and permission settings. It does not install an agent, bypass permissions or retry a paid invocation.

Headless sessions can deny required edits or commands under the agent's existing policy. Configure the required permissions for the target project in that agent before invoking the flag. Installation may succeed while the agent step fails because permission was denied; the receipt reports those outcomes separately.

Without an agent flag, the result includes a copyable integration prompt. The default exit status reports installation. An agent can fail after installation succeeds. `--require-agent-success` also requires the selected invocation to finish successfully; it still does not prove that the resulting application works. JSON and receipts report installation, agent invocation and verification separately.

Existing Git changes stop installation by default. `--allow-dirty` permits those changes and records the actual starting index, working files and relevant untracked files. It does not permit overwriting edited feature files. The toolkit never stashes, resets, stages or commits. Attempts live outside the app in the user state directory. Interrupted and partial installs remain available for inspection; no automatic rollback deletes work.

An existing target lease always blocks another toolkit run, even when its recorded parent process has exited. Normal completion releases its own lease. After a crash or unconfirmed process termination, inspect the recorded attempt and verify that its owned child processes have stopped before manually removing the exact lease path reported by the error. Preserve application files and attempt evidence during recovery.

## Registry and source ownership

The toolkit uses shadcn's public registry format, APIs, and CLI. Bundled registry JSON makes local development work before a remote registry is published. Root-anchored targets keep bundled guide and source paths consistent across host layouts. Applications own the installed code and have no toolkit runtime dependency.

External blocks and their registry dependencies install without directory approval or Payload v4 certification. Compatibility claims are advisory. A v3 claim or missing toolkit metadata does not block source installation. Invalid registry data, unsafe destinations, and divergent existing files still stop the affected write. Bundled features retain exact compatibility and qualified installed-byte checks.

External installation supports source, blocks, UI, CSS and CSS variables. Alias-based installation currently requires local TypeScript or JavaScript paths without inheritance and shadcn aliases that start with `@/` or `./`. Base projects, fonts, environment writes and Tailwind configuration changes need manual setup. See the [external registry contract](docs/architecture/chosen/external-registries.md) for these boundaries.

When an external item needs shadcn transformations, the toolkit uses shadcn's public CLI in isolation. If the host has no `components.json`, installation can add a minimal config and a stylesheet. The integration prompt identifies any stylesheet that the host needs to import. Source installation does not establish that the block is registered in Payload or renders correctly.

Bundled contributions add an item, ordinary exports, a contextual guide, and an executable acceptance recipe. Build checks enforce catalog coverage and private module imports. Community contributors instead add directory entries to [catalog/community-registries.json](catalog/community-registries.json) and run `bun run registries:build`. They do not need a bundled feature or acceptance fixture to be listed. See the [external registry contract](docs/architecture/chosen/external-registries.md) for installation ownership and the [chosen architecture](docs/architecture/chosen/rationale.md) for the base design.

## Verification and contributions

Repository tests use `bun:test` through `bun run test`. Verification fixtures default to pnpm 10.34.6; install that separately for the default runtime checks, or select an available output installer with `--package-manager npm` or `--package-manager bun`.

```sh
bun run check
bun run agent:doctor
bun run agent:verify --cli-only
bun run agent:verify --feature forms --framework next --database postgres --package-manager pnpm
bun run agent:verify:external
bun run agent:verify:external --runtime
```

The external verifier downloads the live Hero Split item into an isolated official Next.js fixture and checks URL installation and namespace repeats. Its default mode requires network access and pnpm 10.34.6, but no database, browser, or paid model. `--runtime` also uses an owned PostgreSQL database and Chromium to exercise a known integration. These checks report this item and host combination separately from registry-wide compatibility.

The portable [contributor workflow](docs/contributing.md) and [verification skill](.agents/skills/verify-payload-toolkit/SKILL.md) describe isolated fixtures, proofs and cleanup. Contributors may use their own local or cloud agent accounts. Deterministic CI uses no paid-model credentials. Runtime checks require disposable databases and a browser. Missing capabilities produce blocked results, not passes. Evidence survives cleanup and records failed attempts.

CI starts on standard public GitHub runners. A separate trusted workflow reports actual run and tested-revision conclusions. Maintainers retain merge and release authority. Renovate proposes grouped dependency updates with tests and manual merging. The runner benchmark can follow once fixture costs are measurable.

The [release instructions](docs/releasing.md) describe preparing and publishing an alpha from the reviewed package tarball.
