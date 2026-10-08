# Upstream contracts for Payload Toolkit v4

Inspected on 2026-10-07. This report records published package declarations and executable source, plus official source at the release commit. It does not claim that generated applications have passed installation, build, database or browser checks. Those checks belong to the implementation fixture matrix.

## Pinned generator and template tuple

The inspected candidate tuple is:

```json
{
  "generator": "create-payload-app@4.0.0-canary.38",
  "templateCommit": "a3e91f11d020907600ba27f199368869f1bb6daa",
  "payload": "4.0.0-canary.38",
  "nodeMinimum": "24.15.0"
}
```

Both the generator and Payload package declare Node `>=24.15.0`. The workspace's global Node is `22.14.0`, so it cannot serve as the supported fixture runtime. Use the task's pinned Node 24.21 runtime for execution and record its full version in evidence. Payload's npm `latest` remains `3.90.2`; v4 is a canary. Do not resolve `latest`, `canary` or `main` during an ordinary user initialization.

Primary metadata: [generator version](https://registry.npmjs.org/create-payload-app/4.0.0-canary.38), [Payload version](https://registry.npmjs.org/payload/4.0.0-canary.38). The [release tag object](https://api.github.com/repos/payloadcms/payload/git/tags/aea40e02320c2a798cfe68b8d78abd3166d0e3b7) resolves `v4.0.0-canary.38` to the full commit above. npm metadata did not provide `gitHead`; the tag is an upstream association, not a package provenance attestation.

| Framework | Official template | Database CLI value | Adapter |
| --- | --- | --- | --- |
| Next.js | `blank` | `mongodb` | `@payloadcms/db-mongodb` |
| Next.js | `blank` | `postgres` | `@payloadcms/db-postgres` |
| TanStack Start | `blank-tanstack` | `mongodb` | `@payloadcms/db-mongodb` |
| TanStack Start | `blank-tanstack` | `postgres` | `@payloadcms/db-postgres` |

These combinations are source-supported candidates, not yet a runtime-verified compatibility promise. PostgreSQL uses Payload's Drizzle-based adapter; the user-facing choice should name PostgreSQL rather than present Drizzle as a database.

The pinned [Next manifest](https://github.com/payloadcms/payload/blob/a3e91f11d020907600ba27f199368869f1bb6daa/templates/blank/package.json) specifies Next `16.4.0`, React/React DOM `19.3.0` and workspace Payload packages. The [TanStack manifest](https://github.com/payloadcms/payload/blob/a3e91f11d020907600ba27f199368869f1bb6daa/templates/blank-tanstack/package.json) includes `@tanstack/react-start:^1.168.60`, `@tanstack/react-router:^1.120.0`, Vite `8.3.0` and React `19.3.0`. Some non-Payload dependencies remain ranges. A template SHA and Payload version do not freeze their complete dependency graph; fixture lockfiles must record the tested resolution.

## Delegate the executable generator

Invoke the pinned package's binary. Do not vendor the blank template or import generator internals. The published generator's export map points at `src` files, while its tarball contains `dist` and `bin`; those advertised imports are not a usable published contract in this version.

An illustrative noninteractive new-project invocation is:

```sh
npm exec --yes --package=create-payload-app@4.0.0-canary.38 -- \
  create-payload-app \
  --name fixture-next-mongo \
  --template blank \
  --db mongodb \
  --db-connection-string mongodb://127.0.0.1:27017/fixture_next_mongo \
  --branch a3e91f11d020907600ba27f199368869f1bb6daa \
  --payload-version 4.0.0-canary.38 \
  --use-pnpm --no-git --no-agent
```

Change `--template` to `blank-tanstack`, `--db` to `postgres`, and the connection string as needed. Pass arguments as a subprocess argument array in product code. The shell example is documentation, not a suggestion to concatenate user inputs into shell code.

The [published binary tarball](https://registry.npmjs.org/create-payload-app/-/create-payload-app-4.0.0-canary.38.tgz) and pinned [main source](https://github.com/payloadcms/payload/blob/a3e91f11d020907600ba27f199368869f1bb6daa/packages/create-payload-app/src/main.ts) establish these flags:

- `--name`, `--template`, `--db`, and `--db-connection-string` supply the inputs otherwise prompted for during new-project creation.
- `--branch` replaces the template reference. [Download source](https://github.com/payloadcms/payload/blob/a3e91f11d020907600ba27f199368869f1bb6daa/packages/create-payload-app/src/lib/download-template.ts) fetches an upstream codeload archive and extracts the selected template directory. A full commit is accepted as the reference by this code path.
- `--payload-version` selects an exact package version. [Project creation](https://github.com/payloadcms/payload/blob/a3e91f11d020907600ba27f199368869f1bb6daa/packages/create-payload-app/src/lib/create-project.ts) replaces dependency values beginning `workspace:` and dependencies named `payload` or beginning `@payloadcms` with the resolved Payload version.
- `--no-git` skips upstream repository initialization and its initial commit.
- `--no-agent` skips upstream generated agent configuration files. It does not disable an agent process; the generator does not invoke the user's Codex or Claude.
- `--no-deps` skips dependency installation and the subsequent generated import map/types. Use it only if the toolkit deliberately owns that later installation and codegen step.
- `--use-pnpm`, `--use-npm`, and `--use-bun` choose the installer for a fresh destination. The current upstream detection combines flags and existing lockfiles in priority order, so conflicting project markers need a preflight check.

Framework choice is the template name, not a `--framework` flag. Database selection configures both the adapter dependency and `payload.config.ts`. Do not use `--db-accept-recommended` together with an explicit URI: the recommended flag takes precedence. Its PostgreSQL default contains a password placeholder.

Run new-project generation from a clean staging parent without Next/TanStack project markers. Upstream detects existing applications in the process working directory before it creates a new project. Existing-application integration can prompt, and it is a separate route from these new-project flags.

Exit status alone is insufficient proof. This canary catches some failures, logs warnings and continues. Dependency failure and failed codegen can leave a directory without a working application. Verify expected manifest/config files, exact package tuple, requested adapter, installed dependencies and codegen/build outcomes before reporting successful initialization.

## Public shadcn registry contract

Pin `shadcn@4.21.4`, which publishes `shadcn/registry` and `shadcn/schema` and pins `@shadcn/registry@0.1.3`. Both packages declare Node `>=20.18.1`, below the Payload toolchain floor. This inspection read the actual npm tarballs, not only repository HEAD.

Primary package metadata: [shadcn 4.21.4](https://registry.npmjs.org/shadcn/4.21.4), [registry 0.1.3](https://registry.npmjs.org/@shadcn/registry/0.1.3). The [public API documentation](https://ui.shadcn.com/docs/registry/api-reference#addregistryitems) identifies documented subpath APIs as stable and excludes CLI command internals. Its declaration is present in the published package:

```ts
import { addRegistryItems, getRegistriesConfig } from 'shadcn/registry'
import { registryItemSchema } from 'shadcn/schema'

const config = await getRegistriesConfig(projectDir)
await addRegistryItems([pinnedItemReference], {
  cwd: projectDir,
  config,
  overwrite: false,
  silent: true,
})
```

The actual `addRegistryItems` options are `cwd`, `config`, `overwrite`, `overwriteCssVars`, `silent`, `skipFonts`, and `path`. The function returns `Promise<void>`, throws errors, and installs files and dependencies without prompting. It has no public package-manager override, `skipInstall`, `dryRun`, changed-file receipt or agent integration result. Do not invent those options or depend on unexported chunks.

For an application without `components.json`, use a universal `registry:item` containing `registry:file` entries with explicit relative `target` paths. Every transitive item must also qualify as universal. This permits a portable server feature and its guide without bootstrapping Tailwind/shadcn UI. Alias targets and UI items require a full resolved project config. `addRegistryItems` does not read that config by itself; load and pass it.

A proposed guide target is `docs/payload-toolkit/forms/guide.md`. It is an ordinary installed registry file, alongside portable source such as `src/payload-toolkit/forms/plugin.ts`. Its location is our convention, not an upstream requirement. The guide maps those files into actual framework routes and existing Payload configuration. It must not assume the source location of an established user's `payload.config.ts`.

Use registry `meta` for a small Payload compatibility declaration and validate it with a toolkit schema after the upstream schema passes. Keep `dependencies` and `registryDependencies` upstream-owned. Exact Payload plugin dependencies must match the inspected Payload tuple. Registry dependencies need their own immutable references; pinning the root item alone does not freeze them.

The installer detects the package manager from project metadata/lockfiles. Record and validate that choice before invocation. For fresh scaffolds, the official generator creates the selected package-manager state. For an existing application, reject conflicting markers or request a deliberate supported resolution; a nonexistent public override is not a solution.

Default overwrite false skips existing files. A resolved item therefore does not imply that the requested new guide/source was actually written. Inspect/hash expected installed artifacts before handing the agent an integration prompt. Any preview must use public resolution APIs or the actual pinned CLI, rather than a speculative programmatic dry-run option.

## Forms ownership and portable first item

`@payloadcms/plugin-form-builder@4.0.0-canary.38` is published with a callable `formBuilderPlugin(options)` export. Use that upstream plugin for Forms/Form Submissions collections, admin integration, relationship validation and submissions. Source is available in the [pinned plugin directory](https://github.com/payloadcms/payload/tree/a3e91f11d020907600ba27f199368869f1bb6daa/packages/plugin-form-builder). The current workspace `extra` feature is a v3 reference, not a drop-in v4 compatibility claim.

The published [plugin tarball](https://registry.npmjs.org/@payloadcms/plugin-form-builder/-/plugin-form-builder-4.0.0-canary.38.tgz) declares the public function and supports `formSubmissionOverrides.hooks.afterChange`. A proposed portable wrapper can append a create-only console notification hook:

```ts
import { formBuilderPlugin } from '@payloadcms/plugin-form-builder'

export const formsPlugin = formBuilderPlugin({
  fields: { payment: false, upload: false },
  formSubmissionOverrides: {
    hooks: {
      afterChange: [({ doc, operation, req }) => {
        if (operation === 'create') {
          req.payload.logger.info({
            msg: 'Form submission received',
            submissionId: doc.id,
          })
        }
        return doc
      }],
    },
  },
})
```

This snippet is proposed integration code and has not yet been typechecked against a generated fixture. It adds a console notification without requiring an email provider. The upstream hook already calls `payload.sendEmail` when the form contains configured emails; notification logging should not replace an established application's email adapter. If a console email demonstration is wanted, Payload's published `EmailAdapter` is a function receiving `{ payload }` and returning `{ name, defaultFromAddress, defaultFromName, sendEmail }`. A demo-only adapter can log delivery metadata and return a resolved promise. It proves invocation, not email delivery.

Upstream submission defaults permit public create and restrict read to the configured admin-user collection. The plugin's generic non-upload submission values have limited field-specific server validation in this inspected source. The guide and acceptance checks must verify the intended example fields rather than promise arbitrary dynamic form validation.

Use the existing REST endpoint `/api/form-submissions` for portable client submission where that API is mounted; the [official website form](https://github.com/payloadcms/payload/blob/a3e91f11d020907600ba27f199368869f1bb6daa/templates/website/src/blocks/Form/Component.tsx) demonstrates it. A simple React example can work in either framework, with route placement and data loading described in framework-specific guide sections. Do not ship the entire website template or presume its Next-specific helpers also work in TanStack.

Actual upstream test references exist at the same pinned commit:

- [Plugin config](https://github.com/payloadcms/payload/blob/a3e91f11d020907600ba27f199368869f1bb6daa/test/plugin-form-builder/config.ts) demonstrates plugin options, overrides and seeded admin users.
- [Integration tests](https://github.com/payloadcms/payload/blob/a3e91f11d020907600ba27f199368869f1bb6daa/test/plugin-form-builder/int.spec.ts) cover collection registration, admin-only reads, submission persistence, missing-form rejection and serialization behavior.
- [Browser tests](https://github.com/payloadcms/payload/blob/a3e91f11d020907600ba27f199368869f1bb6daa/test/plugin-form-builder/e2e.spec.ts) cover Forms/Form Submissions administration and creating/displaying submissions.

Reading these tests supplies patterns. It does not establish that their suite passed here or that all four toolkit fixture combinations work.

## Proof still required

For each framework/database pair, generate with the pinned executable under Node 24.21 and assert no `.git` initialization or upstream agent-file generation. Install with the selected manager, verify exact Payload package versions and adapter/config correspondence, then run codegen, typecheck and build. Use disposable MongoDB/PostgreSQL services to start the application and test native admin access.

For Forms, install the universal registry item through the pinned public API into both fresh and representative existing applications. Verify source/guide hashes, dependency version, collision behavior and package-manager detection. Integrate the proposed plugin and actual example route, submit the example in a browser, assert persistence and admin visibility, reject unauthorized submission reads, and capture a console notification tied to the saved submission. Preserve failures and cleanup proof. Paid-agent sessions are not necessary for these deterministic upstream contract checks.

## Local qualification after source inspection

The public shadcn API was exercised with Node 24.21.0 and the pinned package. Local universal items work without `components.json`. Fetch preserves metadata but the resolved aggregate drops it, so compatibility parsing must use fetched items. Plain TS and Markdown were byte-preserved in the narrow smoke. Root-anchored `~/` targets preserve literal destinations; ordinary paths move under `src` when it exists. Existing modified files were silently skipped with overwrite false. Package-manager conflicts and ancestor markers affected dispatch. Controlled fake installers proved npm/pnpm/Bun dispatch only, not successful dependency installation. The full qualification evidence remains under `.scratch/architect/shadcn-smoke`.

The pinned official generator also created a Next/PostgreSQL project from the pinned SHA with explicit flags and `--no-deps`, `--no-git`, `--no-agent`. The generated adapter/config and exact Payload package versions match the request. This is template-generation proof only. No dependencies, build or database runtime were exercised by that smoke.

The generated Next/PostgreSQL fixture installed successfully with pnpm 10.34.6 under Node 24.21.0. Its `node_modules/.bin/payload` includes absolute staging paths in `NODE_PATH`. Therefore publishing already installed staging cannot establish relocatable dependencies. The synthesized bootstrap should generate source with `--no-deps`, publish source into the exclusively reserved final destination, and run the selected dependency installer and official codegen commands there. A failure leaves a clearly reported partial destination. The install produced one upstream TypeScript peer warning from `tsconfck`; this warning is not itself a runtime failure or proof of compatibility.
