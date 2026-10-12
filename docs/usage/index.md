# Payload Toolkit

Payload Toolkit creates Payload v4 projects from the official starter and installs features whose source the project owns. These pages ship with the package, so they match the installed version. Print one with `payload-toolkit docs <page>`.

Requires Bun 1.4.2+; `init` also needs Node 24.15+ for the official generator. Alpha releases target the exact Payload v4 canary pinned in the package's `catalog/bootstrap.json`.

```sh
payload-toolkit init acme --framework next --database postgres --package-manager pnpm
payload-toolkit add forms --codex
payload-toolkit registries --json
```

## Pages

- `init`: create a project
- `add`: install bundled features, registry URLs and shadcn namespaces
- `agents`: hand an installation to Codex or Claude Code
- `recovery`: Git changes, interrupted attempts and target leases
