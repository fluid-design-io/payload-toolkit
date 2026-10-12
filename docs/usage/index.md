# Payload Toolkit

Payload Toolkit pulls an official Payload v4 starter and installs features whose source the application owns. These pages ship with the package, so they describe the installed version. Print one with `payload-toolkit docs <page>`.

Alpha releases target the exact Payload v4 canary tuple pinned in the package's `catalog/bootstrap.json`. Run the CLI with Bun 1.4.2 or newer. Creating a project also requires Node 24.15 or newer for the official Payload generator.

```sh
payload-toolkit init acme --framework next --database postgres --package-manager pnpm
payload-toolkit add forms --codex
payload-toolkit registries --json
```

## Pages

- `init`: create a project from the official starter
- `add`: install bundled features, registry URLs and shadcn namespaces
- `agents`: hand an installation to Codex or Claude Code
- `recovery`: Git changes, interrupted attempts and target leases
