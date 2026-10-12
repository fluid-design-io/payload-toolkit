# Adding features

```sh
payload-toolkit add forms --cwd ../existing-payload-project
payload-toolkit add https://www.payload-components.xyz/r/hero-split.json
payload-toolkit add @payload-components/hero-split
```

`add` installs into the current directory unless `--cwd` names another. It accepts bundled names, direct registry URLs, and shadcn namespace references. Namespace resolution uses shadcn's directory and the project's `components.json` registries. `registries` prints the community directory of Payload-related registries, and `registries --json` returns its structured data. Listings are for discovery and do not certify Payload v4 compatibility.

## Bundled features

Forms is the first feature. It installs the official form-builder plugin wrapper, a React submission example and a versioned `GUIDE.md`. The guide asks the developer or selected agent to inspect the real config, routes and native admin authentication before wiring it. Submissions persist in Payload and create a console notification. Better Auth is unavailable until its v4 support is proven.

Bundled features retain exact compatibility and qualified installed-byte checks.

## External registries

The toolkit uses shadcn's public registry format, APIs, and CLI. Applications own the installed code and have no toolkit runtime dependency.

External blocks and their registry dependencies install without directory approval or Payload v4 certification. Compatibility claims are advisory. A v3 claim or missing toolkit metadata does not block source installation. Invalid registry data, unsafe destinations, and divergent existing files still stop the affected write.

External installation supports source, blocks, UI, CSS and CSS variables. Alias-based installation currently requires local TypeScript or JavaScript paths without inheritance and shadcn aliases that start with `@/` or `./`. Base projects, fonts, environment writes and Tailwind configuration changes need manual setup.

When an external item needs shadcn transformations, the toolkit uses shadcn's public CLI in isolation. If the host has no `components.json`, installation can add a minimal config and a stylesheet. The integration prompt identifies any stylesheet that the host needs to import. Source installation does not establish that the block is registered in Payload or renders correctly.
