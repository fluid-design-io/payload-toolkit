# Alpha releases

Use Node 24.21.0 and pnpm 10.34.6. The package name is `payload-toolkit`; the initial version is `0.1.0-alpha.0`. Publish prereleases with the `alpha` tag. Package configuration also defaults publishing to public access and the alpha channel on the npm registry.

Run `pnpm install --frozen-lockfile`, `pnpm check` and `pnpm format`. Run the applicable packed CLI/runtime fixtures for behavior changes. Keep model invocation results separate from independent build/browser results. Review the package contents, release version and retained evidence before publishing.

Build once and pack without rerunning lifecycle scripts:

```sh
pnpm build
mkdir -p .scratch/releases/0.1.0-alpha.0
npm pack --ignore-scripts --json --pack-destination .scratch/releases/0.1.0-alpha.0
```

The package allowlist contains compiled CLI files, generated registry assets, bootstrap metadata, README and the MIT license. It must exclude environment files, credentials, test fixtures, local logs, screenshots and agent transcripts. Record the tarball SHA-256 and verify its binary from an isolated consumer.

Use your existing npm account. `npm whoami --registry=https://registry.npmjs.org/` confirms the CLI session. If authentication expired, `npm login --auth-type=web --registry=https://registry.npmjs.org/` opens the browser. Complete any password, passkey or two-factor step directly in that flow. Do not paste credentials into issues or agent transcripts.

Publish the inspected tarball, not a newly rebuilt folder:

```sh
npm publish ./.scratch/releases/0.1.0-alpha.0/payload-toolkit-0.1.0-alpha.0.tgz --tag alpha --access public --registry=https://registry.npmjs.org/
npm view payload-toolkit@alpha version dist.integrity dist-tags --json
npx --yes payload-toolkit@alpha --help
```

Confirm `alpha` points to the intended version and the published integrity matches the inspected artifact. Alpha publication must not move a stable `latest` tag. Test a fresh installation from the registry, including init/add when applicable. Preserve failed attempts and verification limits.

For the first release, also inspect `latest` after registry processing. During the initial alpha publication npm assigned both tags despite the explicit alpha argument, then rejected `npm dist-tag rm payload-toolkit latest` with HTTP 400. This matches [npm's reported first-publication behavior](https://github.com/npm/cli/issues/8490). Both tags currently point to `0.1.0-alpha.0`; this does not make the version stable. Record that exception, continue publishing subsequent prereleases with the alpha tag, and preserve any future stable version's latest tag.

If npm reports that the package is being processed, a successful command confirms submission rather than public availability. Query the exact version until it becomes available; a temporary `0.0.0-stage` placeholder is not the alpha CLI. Check `npm stage list payload-toolkit` for any required review, and do not republish or change versions while the original submission is unresolved.

Published versions are immutable. If registry metadata already contains this exact version after an ambiguous publish response, verify its integrity before attempting anything else. A changed artifact requires a new prerelease version, such as `0.1.0-alpha.1`, followed by the same checks. Publishing requires maintainer authorization; successful CI does not grant it.

## GitHub alpha workflow

`.github/workflows/release.yml` adds a manual **Release alpha** action. It does not run on a tag, pull request or merge. It accepts only an exact committed version such as `0.1.0-alpha.1`, dispatched from the repository's default branch. The v4 repository is `fluid-design-io/payload-toolkit`, with `main` as its default branch. Keep these workflows out of the separate v3 repository.

The source gate checks the publishing repository identity and required approval configuration. It calls the existing verification workflow, including static checks, the four real database/browser combinations, Windows/macOS installation and npm/Bun installation. Preparation checks formatting, builds and packs once, inspects the file allowlist and tests an isolated tarball consumer. Every receipt must be passed, cleaned up and bound to the same clean commit. The seven Ubuntu receipts must match the release tarball SHA-256 exactly. Windows/macOS qualify the same committed source; their tarball hashes can differ because of platform packing and line endings.

The prepared artifact is retained for 30 days. The `npm-release` environment then requires a maintainer to approve that commit and artifact before the publication job starts. Publication uses GitHub-hosted Ubuntu and npm 12.2.0 with OIDC; it does not use an npm token or run paid models. It verifies the downloaded bytes again, publishes that tarball under `alpha`, confirms public registry integrity and a fresh exact-version consumer, and only then creates `v<version>` at the checked commit and a GitHub prerelease. One global release concurrency group prevents separate versions racing through this workflow.

The GitHub prerelease is not a stable release. `.github/release.yml` groups merged PRs by these labels, in order: `breaking`; `feature` or `enhancement`; `fix` or `bug`; `dependencies`; `documentation` or `docs`; then other changes. Apply labels before merging; categorization is label-driven, not a semantic analysis of the diff. This generates GitHub release notes, not a maintained `CHANGELOG.md`. Direct commits do not provide categorized PR entries. Labels must exist in the destination repository; creating them is a one-time maintainer task.

### One-time setup

1. Use the public `fluid-design-io/payload-toolkit` repository and its `main` branch. Keep `package.json` repository URL, homepage and bugs URL aligned with that identity when committing the next version. npm requires `repository.url` to match the repository publishing through OIDC. The source gate rejects a mismatch. Keep the old v3 repository in maintenance mode.
2. In the destination repository's **Settings → Environments**, create `npm-release`. Add at least one maintainer under **Required reviewers**. For a single maintainer, leave **Prevent self-review** off so you can approve your own manually dispatched release. Under **Deployment branches and tags**, choose selected branches/tags and add exactly the default branch as a **branch** rule. Do not add wildcard or tag rules. The workflow checks both the reviewer requirement and this exact branch policy and fails before publication if configuration is absent. Merely naming an environment in YAML does not enable protection. Configure repository/ruleset permissions so maintainers can approve the environment and its GitHub token can create release tags/releases.
3. In **npm → payload-toolkit → Settings → Trusted publishing**, add a GitHub Actions publisher for the final owner and repository, workflow filename `release.yml` (filename only), and environment `npm-release`. Enable direct **npm publish**; a stage-only publisher does not support this workflow. No `NPM_TOKEN` or `NODE_AUTH_TOKEN` secret is required. npm currently requires a new trusted publisher's first successful publish within two days; configure it when the next committed version is ready. Provenance is generated automatically for a public package published from a public repository. [npm trusted publishing documentation](https://docs.npmjs.com/trusted-publishers/)
4. Create the release-note labels listed above. Review repository Actions permissions and branch protection. The release job requires `contents: write` for its tag/prerelease, `id-token: write` for npm, and `actions: read` to inspect environment protection. Verification stays read-only. [GitHub environment configuration](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments), [generated release notes](https://docs.github.com/en/repositories/releasing-projects-on-github/automatically-generated-release-notes)

Browser interaction may be needed for npm account authentication/2FA and publisher setup. Complete credentials directly on npm. GitHub environment settings can be configured through its settings UI or authorized API access. Neither publishing setup nor a release is enabled merely by committing these files.

### Each release

1. Review upstream compatibility and the change scope. Commit a new alpha version in `package.json` and the lockfile if needed, with the source changes and applicable PR labels. Published versions are immutable; the already published `0.1.0-alpha.0` must not be reused for different source.
2. Open **Actions → Release alpha → Run workflow**, select the default branch and enter that exact version. Review all verification results and the `alpha-release-package` artifact before approving the `npm-release` deployment. The workflow checks formatting in addition to `pnpm check`.
3. After approval, inspect the public npm version, alpha tag, integrity and GitHub prerelease. Evidence is available in `alpha-release-package` and `alpha-release-result`. Ordinary verification artifacts retain their existing shorter lifetimes. Download evidence if it must outlive retention.

### Recovery

An existing npm version is accepted only when its integrity matches the newly qualified tarball. A matching version is not published again. A different artifact requires a new version and review. The workflow never automatically moves an existing tag, overwrites a mismatched npm version, downgrades an alpha tag, edits an existing release or rewrites/removes `latest`.

A failed or ambiguous publish command is followed by bounded public registry checks, without retrying publication. If npm processing/staging outlasts the run, inspect the package and npm stage state before rerunning. If publication completed but tag/release creation failed, rerun the same committed source/version after correcting permissions; matching bytes can resume at the missing GitHub step. Existing tags must resolve to the exact checked commit and existing releases must be published prereleases. The downloaded artifact must match the dispatched commit, an existing tag must resolve to that commit, and different npm bytes always fail. Registry integrity alone does not establish the original source commit when no tag exists yet.

The workflow snapshots `latest` and requires it to remain unchanged. It deliberately does not attempt the first-release tag deletion that npm previously rejected. If any tag changes unexpectedly, it stops before creating the GitHub release; review registry state manually. If a newer alpha is already active, an older rerun fails rather than moving the channel backwards. The first alpha was published manually, so its existing package bytes are not expected to match a new automation commit; release the next alpha instead.

Local validation covers helper policy and workflow syntax. Actual GitHub environment approval, the full hosted matrix, npm OIDC/provenance and tag/release creation still need their first run in the configured destination repository. A passing local check is not proof that external configuration works.
