# Community registries

This directory lists community registries for discovery. A listing does not certify compatibility with Payload v4.
The compatibility column records upstream claims. Payload v4 runtime compatibility for these registries is unverified.

| Registry | Namespace | Description | Upstream compatibility | Repository |
| --- | --- | --- | --- | --- |
| [Payload Components](<https://www.payload-components.xyz>) | @payload-components | Payload CMS blocks and components distributed through a shadcn registry. | Payload v3 with Next.js 15 or 16. [Upstream documentation](<https://www.payload-components.xyz/docs/installation>) | [Source](<https://github.com/Ducksss/payload-components>) |

## Installation policy

The directory is not an allowlist. Unlisted direct registry URLs remain installable.
Toolkit reuses shadcn namespace resolution and the registries configured in your project's `components.json`.
An entry here does not register a competing namespace resolver or require changes to the upstream registry.
Compatibility claims are advisory. An optional agent handoff can adapt installed source to the host application.
Agent completion and runtime verification are separate outcomes.

## Directory contributions

Contributors add entries to `catalog/community-registries.json` through pull requests.
Each entry contains a unique `namespace`, a unique display `name`, a `description`, a `homepage`, a `repository`, and a `url` template.
The namespace matches shadcn's existing namespace when one exists. Registry URL templates contain exactly one `{name}` placeholder.
Public URLs use HTTPS without credentials or fragments.
An optional `compatibility` object records an upstream claim in `upstream` and its source URL in `documentation`.
An optional `preview` object supplies `url` and/or `image` HTTPS templates with at most one `{name}` placeholder.
Use `preview.items` keyed by item name for per-item URL/image overrides, or `false` to disable both for that item.
For example: `"preview": { "url": "https://example.com/preview/{name}", "items": { "helper": false } }`.
The web catalog resolves each field from directory item overrides, upstream `meta.preview.url` / `meta.preview.image`, then registry defaults.
Existing upstream `meta.image` is also supported, before the default image. Upstream relative URLs resolve against the item's registry JSON URL.
Upstream `meta.preview: false` disables both fields unless a directory item override is supplied.
Upstream metadata must appear in the registry index consumed by `app/scripts/sync-catalog.ts`.
These are Toolkit display conventions, not standard shadcn preview fields or installation requirements.
The web app renders thumbnails directly: supplied images first, cached screenshots of preview URLs second, then placeholders.
From `app/`, run `bun run catalog:sync`, `bun run previews:build`, then `bun run catalog:sync` to capture and apply URL-only previews.
Capture uses the app's development-only Playwright dependency. Install Chromium with `bun x playwright install chromium`; optionally set `PLAYWRIGHT_CHANNEL=chrome` for installed Chrome.
Commit `app/public/registry-previews/` and the generated catalog so builds and visitors do not need a browser capture service.
Captures use a 1280 by 800 light viewport with reduced motion. Unchanged URLs reuse cached captures; `--refresh` recaptures them.
Capture failures exit nonzero and retain an existing matching capture, or leave the placeholder. Images that fail in the browser also fall back.
Preview pages are not embedded. Capture is an explicit contributor command, separate from builds and installation.
Directory entries do not require toolkit metadata, an integration guide, or an acceptance fixture.
Bundled toolkit features retain their own contribution and verification requirements.

`bun scripts/community-registry-build.ts` validates the directory and generates this page and `assets/registry/community-registries.json`.
`bun scripts/community-registry-build.ts --check` validates the directory and rejects an outdated generated page.
These commands make no network requests. Maintainers review directory contributions before merging them.
