# Existing application grounding

Read-only source audit on `codex/payload-toolkit-v4`, based on application HEAD `2883d2b`. Agreed product scope is in `docs/architecture/progress.md`. This document does not settle root package versus monorepo layout. No application, services or tests were executed. No applicable repository or ancestor `AGENTS.md` was found. The repository's `unslop` writing skill was read.

## Current entry points and ownership

The root is a private Next.js application, `acme-website`, described as Payload 3.0 in `package.json:2-5`. Payload packages currently declare `^3.89.0`, Next declares `^16.3.5`, and `payload-auth` declares `^3.0.0` at `package.json:55-64,79-83`. These declarations are evidence about the old application, not verified v4 contracts.

The app flow is:

1. Next reads `next.config.mjs:1-25`, applies `withPayload`, enables React Compiler and cache components, and configures application-specific image hosts.
2. `tsconfig.json:20-25` resolves `@/*` into `src` and `@payload-config` into `src/payload.config.ts`. It includes Bun globals. `tsconfig.json:37` excludes all of `extra` from checking.
3. `src/payload.config.ts:19-76` assembles the admin, collections, editor, email, database, plugins and globals. The only database implementation is `postgresAdapter` with UUID IDs at lines 65-70. There is no Mongo adapter selection or framework selection here.
4. `src/app/(payload)/api/[...slug]/route.ts:3-21` supplies Payload REST handlers from that config. `src/app/(payload)/layout.tsx:18-33` connects config, generated import map and server functions. `src/app/(payload)/admin/[[...segments]]/page.tsx:18-22` delegates the admin page and metadata to Payload. These files identify themselves as generated.
5. `src/payload.config.ts:62-64` owns generated `src/payload-types.ts`; `package.json:17-18` owns the generation commands. Admin paths such as `src/payload.config.ts:47-54` resolve through the import map. Source copying alone does not generate these artifacts.

## Native authentication and Better Auth boundary

`src/collections/users.ts:3-12` defines the native `users` collection with `auth: true`. `src/payload.config.ts:21,59` selects it for admin authentication and registers it. That is the small native-auth source shape worth retaining as a reference for official fixtures.

The running app also applies `betterAuthPlugin` unconditionally at `src/plugins/index.ts:9-15`. Its configuration, `src/lib/auth/options.ts:135-169`, uses the same `users` slug, introduces admin/user roles and account/session/verification collections, and connects extensive Better Auth options. `src/lib/payload/get-payload.ts:1-6` wraps config with `getPayloadAuth`; `src/app/api/auth/[...all]/route.ts:1-7` converts its `betterAuth` instance into Next handlers. This helper is not a neutral native Payload accessor.

`src/lib/auth/options.ts:54-79` requires email verification and updates an additional `verified` field via Payload. `src/access/admin.ts:6-21` assumes plugin-generated `user.role` and an ownership field `userId`; `src/access/authenticated.ts:6-7` only checks for a user. The extra forms plugin imports the role-based helper. A native-auth forms implementation cannot reuse that access helper without explicitly choosing a native admin rule and an actual ownership schema.

Avoid treating this application's Better Auth tests or generated role types as v4/native-auth proof. Agreed scope keeps Better Auth unavailable until independently verified.

## Forms source and missing integration

`extra` contains a form-builder extension, not a Sheet UI feature. The separate active Sheet component is `src/components/ui/sheet.tsx:3-16`, based on Base UI Dialog.

The intended forms flow can be traced, but it is inactive and incomplete:

1. `extra/plugins/form-plugin/index.ts:144-166` calls `formBuilderPlugin`, disables payments, customizes field blocks and declares `forms` and `form-submissions`. Lines 151-165 supply overrides, including update access; they do not explicitly establish the full create/read/delete access policy. Upstream defaults would need verification.
2. The plugin imports local slug and field overrides at lines 14-16. Those `@/` destinations do not exist in active `src`. `extra/fields/slug/index.ts:32-46` also introduces a hook and admin component path requiring an import-map refresh.
3. `extra/blocks/form/config.ts:5-37` defines a `formBlock` with a required relationship to `forms` and optional Lexical introduction content.
4. `extra/blocks/form/index.tsx:1-17,32-53` builds a TanStack React Form hook with Next dynamic imports, local form contexts and UI components. `extra/blocks/form/component.tsx:3-13,64-74` depends on Next search params, application RichText/toast/utils, and a generated `Form` type. `src/payload-types.ts` currently contains no `Form` interface.
5. On submission, `extra/blocks/form/component.tsx:78-105` transforms fields and reports success after a 2.5-second timer. The real POST to `/api/form-submissions` is commented out at lines 107-128. The handler does not await a persisted result. Confirmation rendering at lines 132-139 therefore cannot prove persistence or notification delivery.
6. `extra/plugins/form-plugin/before-email.tsx:6-19` renders emails using the application's `AcmeTemplate`; the plugin hardcodes a Cardware recipient at `extra/plugins/form-plugin/index.ts:149`. Agreed console notifications require a new explicit implementation, not copying this mail dependency chain.
7. `src/plugins/index.ts:5,12-13` comments out plugin integration. `src/components/payload/render-blocks.tsx:8-14` comments out the form renderer. `package.json:51-107` has no `@payloadcms/plugin-form-builder` dependency. The excluded folder has no current compilation guarantee.

There are multiple block registration owners. `src/fields/default-lexical.ts:47-50` configures global editor blocks; `src/collections/blog/index.ts:83-106` configures that collection's editor independently. `src/components/payload/rich-text/index.tsx:40-61` converts serialized Lexical blocks. `src/components/payload/render-blocks.tsx:8-40` handles a separate array-of-blocks rendering path. Registering a component in one map does not establish schema, editor or another rendering path. A forms guide must name the actual host route/collection/editor it integrates into and avoid assuming all projects share this application layout.

## Current verification and service infrastructure

The useful testing boundary is HTTP against a running application, documented and implemented in `src/tests/helper/run.ts:1-23,93-112` and `src/tests/helper/http.ts:48-77`. This avoids loading server-only config into the test process. Preserve that separation in fixture tests.

The implementation itself is tightly coupled to this app:

- `package.json:13,46-49` requires Bun, dotenv and Docker. `src/tests/helper/run.ts:89-97` always launches all compose services, creates a fixed database, and starts Next dev on fixed port 3456. Even with `TEST_DATABASE_URI`, `run.ts:52-60` truncates the hardcoded `acme-postgres` container and `acme-website_test` database. An arbitrary supplied URL is therefore not a supported portable service mode today.
- `src/tests/helper/test-db-uri.ts:1-15` accepts an explicit test URI or derives an `_test` suffix. `src/tests/helper/db.ts:10-15` checks that suffix and uses Bun SQL; lines 26-32 directly update a Postgres `users.email_verified` column. This bypasses email delivery and the verification-link lifecycle.
- `src/tests/helper/wait-for-server.ts:15-17` accepts 404/405 as ready. That proves an HTTP server answered, not that the expected Payload route and schema are usable.
- `src/tests/smoke.test.ts:12-23` checks blog listing and anonymous Better Auth session. `src/tests/auth.test.ts:13-40` checks selected Better Auth email/password behavior. There are no native admin, forms persistence/access/notification, Mongo, TanStack Start, Playwright, CLI installation or agent outcome tests in the current suite.
- `run.ts:110-112` stops the application but leaves services running. There is no result identity, structured evidence artifact or fixture cleanup owner.
- `docker-compose.yml:44-55` supplies Postgres 17 with a fixed container, credentials and host port, and no health check. Inbucket uses `latest` at lines 2-19. SeaweedFS is digest pinned with health checks at lines 21-42, but requires S3 environment values. A forms-only DB test currently starts unrelated mail/storage services too.
- `src/lib/email-adapter.ts:4-32` chooses localhost SMTP versus Resend by a public URL substring. `package.json:36` references missing `src/scripts/test-email.ts`. Console notification fixtures should not inherit this selection rule.
- `.github` currently contains issue templates, with no workflows. History confirms commit `262ce53` removed the storage workflow and storage integration suite; no inference about why is necessary.

## Constraints for the sketches

Preserve native Payload ownership of configuration, route handlers, generated types and admin import maps. Preserve generated-source ownership by the developer and use isolated HTTP/runtime fixtures for proof. Main remains the v3 application per the agreed scope.

Change the branch's fixed app bootstrap into the agreed CLI and catalog without making these legacy paths mandatory destinations. Start from the pinned official generator tuple, then install registry source and its versioned guide. Forms must establish real persistence, explicit submission/admin access, an example and console notification behavior. Next-specific imports must not leak into the TanStack variant.

Avoid claiming the `extra` implementation is ready to publish, copying its role-based access policy, carrying Cardware/Acme addresses or S3/mail services into minimum fixtures, or using green root typechecking as forms proof. Avoid deleting or mutating a user's supplied database based on a naming suffix. Disposable DB identity and resource ownership must be explicit before cleanup.

The greenfield candidates may replace the old app structure on this branch or place the toolkit separately. Neither choice follows from the old file layout. Both must explain where CLI code, registry source/guides, isolated fixtures and verification commands live, and how tested fixture identities bind to emitted source and guide versions.

## Files and records read

`docs/architecture/progress.md`; `.agents/skills/unslop/SKILL.md`; `package.json`; `tsconfig.json`; `next.config.mjs`; `docker-compose.yml`; `src/payload.config.ts`; `src/collections/users.ts`; `src/collections/blog/index.ts`; `src/plugins/index.ts`; `src/plugins/s3-storage-plugin.ts`; `src/lib/auth/options.ts`; `src/lib/payload/get-payload.ts`; `src/lib/email-adapter.ts`; `src/access/admin.ts`; `src/access/authenticated.ts`; `src/app/api/auth/[...all]/route.ts`; `src/app/(payload)/api/[...slug]/route.ts`; `src/app/(payload)/layout.tsx`; `src/app/(payload)/admin/[[...segments]]/page.tsx`; `src/fields/default-lexical.ts`; `src/components/payload/rich-text/index.tsx`; `src/components/payload/render-blocks.tsx`; `src/components/ui/sheet.tsx`; `extra/plugins/form-plugin/index.ts`; `extra/plugins/form-plugin/before-email.tsx`; `extra/blocks/form/config.ts`; `extra/blocks/form/component.tsx`; `extra/blocks/form/index.tsx`; `extra/blocks/form/fields-config.ts`; `extra/blocks/form/Email/index.tsx`; `extra/components/form/index.tsx`; `extra/fields/slug/index.ts`; `src/tests/smoke.test.ts`; `src/tests/auth.test.ts`; all five `src/tests/helper/*.ts` files. Searched generated `src/payload-types.ts` for form and role declarations; inventoried `src`, `extra`, `.github`, lockfiles and test configurations; inspected current branch/status and `git show --stat 262ce53`.
