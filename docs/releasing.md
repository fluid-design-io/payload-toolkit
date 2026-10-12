# Alpha releases

Releases run through the manual **Release alpha** workflow (`.github/workflows/release.yml`). It never runs on a tag, pull request or merge, and publishing needs maintainer authorization.

## Each release

1. Commit a new `x.y.z-alpha.n` version in `package.json` with the source changes. Published versions are immutable; never reuse one for different bytes.
2. Open **Actions → Release alpha → Run workflow** on `main` and enter that exact version.
3. The workflow runs the full verification matrix, checks formatting, packs once, checks the package allowlist and tests an isolated tarball consumer. Every receipt must pass against the same clean commit, and the Ubuntu receipts must match the tarball SHA-256.
4. Review the results and the `alpha-release-package` artifact, then approve the `npm-release` deployment.
5. Publication uses npm trusted publishing (OIDC, no token), publishes under `alpha`, confirms registry integrity and a fresh consumer, then tags `v<version>` and creates a GitHub prerelease. Inspect the npm version, `alpha` tag and prerelease afterwards.

Release notes come from PR labels, in order: `breaking`; `feature` or `enhancement`; `fix` or `bug`; `dependencies`; `documentation` or `docs`; then the rest. Label PRs before merging.

## One-time setup

- `package.json` `repository.url` must match `fluid-design-io/payload-toolkit`; npm OIDC and the source gate reject a mismatch.
- GitHub **Settings → Environments → `npm-release`**: required reviewers, and deployment limited to exactly the `main` branch rule. The workflow fails before publishing if either is missing.
- npm **payload-toolkit → Settings → Trusted publishing**: GitHub Actions publisher, workflow `release.yml`, environment `npm-release`, direct publish enabled. See [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/).
- Create the release-note labels.

## Recovery

- An existing npm version is accepted only if its integrity matches the qualified tarball; matching bytes are not republished. Different bytes need a new version.
- A failed or ambiguous publish is followed by registry checks, never a retry. If npm processing outlasts the run, check `npm stage list payload-toolkit` before rerunning.
- If publishing succeeded but the tag or release failed, fix permissions and rerun the same version; it resumes at the missing GitHub step.
- The workflow never moves tags, downgrades `alpha`, edits releases or touches `latest`. npm assigned `latest` to `0.1.0-alpha.0` on first publication and rejects removing it; leave it.
