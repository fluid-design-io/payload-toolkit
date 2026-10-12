# Payload Toolkit

![Payload Toolkit](https://raw.githubusercontent.com/fluid-design-io/payload-toolkit/main/app/public/payload-toolkit-og.png)

Start a Payload v4 project from the official starter, then add features whose source code you own. The toolkit can also hand each feature to Codex or Claude Code to wire into your app.

> Alpha: Payload Toolkit targets a pinned Payload v4 canary. For Payload v3, use [payload-better-auth-starter](https://github.com/fluid-design-io/payload-better-auth-starter).

## Quick start

Requires Bun 1.4.2+ and Node 24.15+.

```sh
bunx --bun payload-toolkit@alpha init my-app
```

Answer the prompts to pick a framework (Next.js or TanStack Start), a database (PostgreSQL or MongoDB), a package manager and optional features.

To add a feature to an existing Payload project, run this from its directory:

```sh
bunx --bun payload-toolkit@alpha add forms
```

## Docs

The usage docs ship inside the package, so they always match the version you run. Point your coding agent at them, or read them yourself:

```sh
bunx --bun payload-toolkit@alpha docs
```

The same pages are in [docs/usage](docs/usage) on GitHub. Contributors can start with [contributing](docs/contributing.md), and the [community registries](docs/community-registries.md) list Payload-related component registries.
