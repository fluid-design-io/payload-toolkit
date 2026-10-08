# Packed CLI

## Sub-features

Published artifact installation, command discovery and invalid-command rejection.

## How to get to it (user POV)

Install Payload Toolkit and invoke its binary to find `init` and `add`.

## Driving it with the contributor harness

Run `pnpm run agent:verify -- --cli-only`. It packs the build, installs that tarball into a new npm consumer, invokes its delivered `dist/cli.js --help`, asserts both commands are present, then invokes `unknown-command --json` and asserts a failing exit. Inspect the command transcripts and package digest through `agent:evidence`.

## Gotchas

This is real artifact CLI proof, not runtime Forms proof. It does not provision databases or call a model. The runtime command separately exercises official initialization and feature installation.

`pnpm run agent:verify -- --installation-only --package-manager npm` additionally runs real init/add and checks the lockfile and installed Payload/Forms packages. Use pnpm or Bun to qualify that installer. This mode does not claim database, browser, guide wiring, build or agent-integration proof.
