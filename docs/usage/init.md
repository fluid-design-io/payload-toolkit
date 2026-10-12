# Creating a project

```sh
payload-toolkit init acme --framework next --database postgres --package-manager pnpm
payload-toolkit init acme --framework tanstack --database mongodb --features forms --package-manager pnpm
```

Run `init` without all choices in a terminal for prompts. For unattended execution, supply the directory, framework, database and package manager. The terminal flow asks for optional features; leaving the selection empty creates a plain Payload app. `--json` returns one result and disables prompts. PostgreSQL uses Payload's Drizzle adapter. MongoDB is the other initial database choice. Generated projects support npm, pnpm and Bun.

Without features, `init` pulls the official Payload blank starter. With `--features`, it pulls the same base and installs the selected features on top. `--features` accepts the same references as `add`, separated by commas. `--codex` and `--claude` integrate feature guides, so they require at least one feature.

The toolkit pins the official generator version, template commit and Payload version in `catalog/bootstrap.json`. It does not maintain a cloned blank template. The initial tuple is a v4 canary; compatibility checks and runtime evidence apply to that tuple, not every v4 prerelease.

Database setup belongs to the application developer. Supply `--database-url` or `DATABASE_URI` for an existing connection. Without one, the generated environment contains a local configure-later placeholder. Installation does not provision services or prove that deployment infrastructure is ready.
