# Adding features

```sh
payload-toolkit add forms --cwd ../existing-payload-project
payload-toolkit add https://www.payload-components.xyz/r/hero-split.json
payload-toolkit add @payload-components/hero-split
```

`add` installs into the current directory, or `--cwd`. It accepts bundled feature names, registry item URLs and shadcn namespace references. Namespaces resolve through shadcn's directory and the project's `components.json`. `registries` lists community registries for discovery; a listing is not a compatibility claim.

## Bundled features

`forms` installs the official form-builder plugin wrapper, a React submission example and a versioned `GUIDE.md` for wiring it into the real config and routes. Bundled features are checked against the exact pinned Payload version.

## External items

External items install through shadcn's public CLI and need no toolkit metadata or guide. Their compatibility claims are advisory, so a v3 claim does not block installation. Invalid registry data, unsafe destinations and changed existing files still stop the write.

Supported: source files, blocks, UI, CSS and CSS variables. Alias paths must be local TypeScript or JavaScript paths without `extends`, with shadcn aliases starting `@/` or `./`. Base projects, fonts, environment writes and Tailwind config changes need manual setup. A project without `components.json` may get a minimal one plus a stylesheet; the integration prompt names any stylesheet to import. Installed source is not yet registered in Payload or proven to render.
