# Payload Toolkit

A CLI for official Payload starters and developer-owned features. This repository builds the v4 experience on `main`. The existing v3 starter remains in [payload-better-auth-starter](https://github.com/fluid-design-io/payload-better-auth-starter).

The package and command name is `payload-toolkit`. Alpha releases use the `alpha` tag and target the exact Payload v4 canary tuple below. Use Node 24.15 or newer:

```sh
npx payload-toolkit@alpha --help
npx payload-toolkit@alpha init acme --framework next --database postgres --template minimal --package-manager pnpm
```

For source development, build and run the local binary with pnpm 10.34.6:

```sh
pnpm install --frozen-lockfile
pnpm build
node dist/cli.js --help
node dist/cli.js init acme --framework next --database postgres --template minimal --package-manager pnpm
node dist/cli.js init acme --framework tanstack --database mongodb --template custom --features forms --package-manager pnpm
node dist/cli.js add forms --cwd ../existing-payload-project --codex
```

Run `init` without all choices in a terminal for prompts. For unattended execution, supply the directory, framework, database, template and package manager. `--json` returns one result and disables prompts. PostgreSQL uses Payload's Drizzle adapter. MongoDB is the other initial database choice.

Minimal pulls the official Payload blank template. Custom pulls the same base and installs selected features. The toolkit pins the official generator version, template commit and Payload version in [catalog/bootstrap.json](catalog/bootstrap.json). It does not maintain a cloned blank template. The initial tuple is a v4 canary; compatibility checks and runtime evidence apply to that tuple, not every v4 prerelease.

Database setup belongs to the application developer. Supply `--database-url` or `DATABASE_URI` for an existing connection. Without one, the generated environment contains a local configure-later placeholder. Installation does not provision services or prove that deployment infrastructure is ready.

Forms is the first feature. It installs the official form-builder plugin wrapper, a React submission example and a versioned `GUIDE.md`. The guide asks the developer or selected agent to inspect the real config, routes and native admin authentication before wiring it. Submissions persist in Payload and create a console notification. Better Auth is unavailable until its v4 support is proven.

## Agent integration

`--codex` or `--claude` invokes the already installed agent CLI with the installed guide. Both flags together are invalid. The toolkit uses the agent's existing account, model, project rules and permission settings. It does not install an agent, bypass permissions or retry a paid invocation.

Headless sessions can deny required edits or commands under the agent's existing policy. Configure the required permissions for the target project in that agent before invoking the flag. Installation may succeed while the agent step fails because permission was denied; the receipt reports those outcomes separately.

Without an agent flag, the result includes a copyable integration prompt. The default exit status reports installation. An agent can fail after installation succeeds. `--require-agent-success` also requires the selected invocation to finish successfully; it still does not prove that the resulting application works. JSON and receipts report installation, agent invocation and verification separately.

Existing Git changes stop installation by default. `--allow-dirty` permits those changes and records the actual starting index, working files and relevant untracked files. It does not permit overwriting edited feature files. The toolkit never stashes, resets, stages or commits. Attempts live outside the app in the user state directory. Interrupted and partial installs remain available for inspection; no automatic rollback deletes work.

An existing target lease always blocks another toolkit run, even when its recorded parent process has exited. Normal completion releases its own lease. After a crash or unconfirmed process termination, inspect the recorded attempt and verify that its owned child processes have stopped before manually removing the exact lease path reported by the error. Preserve application files and attempt evidence during recovery.

## Registry and source ownership

The toolkit uses shadcn's public registry format and APIs. Bundled registry JSON makes local development work before a remote registry is published. Root-anchored targets keep installed guide and source paths consistent across host layouts. Compatibility metadata describes eligibility, not host edits. Applications own the installed code and have no toolkit runtime dependency.

Contributions add an item, ordinary exports, a contextual guide and an executable acceptance recipe. Build checks enforce catalog coverage and private module imports. The [chosen architecture](docs/architecture/chosen/rationale.md) records the candidate comparison and its tradeoffs.

## Verification and contributions

```sh
pnpm check
pnpm agent:doctor
pnpm agent:verify -- --cli-only
pnpm agent:verify -- --feature forms --framework next --database postgres --package-manager pnpm
```

The portable [contributor workflow](docs/contributing.md) and [verification skill](.agents/skills/verify-payload-toolkit/SKILL.md) describe isolated fixtures, proofs and cleanup. Contributors may use their own local or cloud agent accounts. Deterministic CI uses no paid-model credentials. Runtime checks require disposable databases and a browser. Missing capabilities produce blocked results, not passes. Evidence survives cleanup and records failed attempts.

CI starts on standard public GitHub runners. A separate trusted workflow reports actual run and tested-revision conclusions. Maintainers retain merge and release authority. Renovate proposes grouped dependency updates with tests and manual merging. The runner benchmark can follow once fixture costs are measurable.

The [release instructions](docs/releasing.md) describe preparing and publishing an alpha from the reviewed package tarball.

## Dependency choices

| Package                     | Purpose                                            | Initial use                              |
| --------------------------- | -------------------------------------------------- | ---------------------------------------- |
| `@clack/prompts`            | Terminal prompts, selection menus and cancellation | Interactive choices                      |
| `chalk`                     | Terminal text colors                               | Clack covers current presentation        |
| `chokidar`                  | Watch files and directories for changes            | No watch command yet                     |
| `commander`                 | Parse commands, flags and help                     | `init` and `add`                         |
| `diff`                      | Compute text/file differences                      | Future upgrade review                    |
| `semver`                    | Parse and compare versions/ranges                  | Runtime and compatibility checks         |
| `tempy`                     | Create temporary paths                             | Node's `mkdtemp` covers current staging  |
| `validate-npm-package-name` | Validate npm package names                         | New project names                        |
| `zod`                       | Parse external data into validated types           | Requests, registry metadata and evidence |

`shadcn` owns registry resolution, transformations and dependency/source installation. No private shadcn module is imported.
