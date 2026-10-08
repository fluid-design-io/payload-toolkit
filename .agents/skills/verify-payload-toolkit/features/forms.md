# Forms

## Sub-features

Official initialization, registry installation, native admin, persisted submissions, restricted reads, field validation, visible confirmation/error behavior and console notifications.

## How to get to it (user POV)

Initialize a supported official app, add `forms`, integrate its installed guide, open `/toolkit-forms` and submit Name, Email and Message. Admins inspect Form Submissions.

## Driving it with the contributor harness

Run `bun run agent:verify --feature forms --framework next --database postgres`. Repeat each Next/TanStack and Postgres/Mongo pair. The harness drives the packed CLI, known guide integration, real REST and browser paths. A saved record must contain the exact submitted values; anonymous reads must fail; rejected invalid input must leave zero records; the visible confirmation requires a real saved row and a console entry containing that row's identity. Admin screenshots show the collection. A controlled failed HTTP response must show an alert without success.

## Gotchas

Only the documented example has its finite strict field contract. A console entry proves invocation, not email delivery. Known fixture wiring does not prove an agent can adapt every existing application. Supplied service URLs require `TOOLKIT_TEST_DISPOSABLE=yes` and are borrowed, never dropped. Missing Docker, service, browser or a broken prerelease produces non-green evidence.

The `forms-ssr-hydration-guard` check observes the server-rendered Send button in a real JavaScript-disabled browser and requires it to remain disabled. The normal browser then relies on the enabled control after hydration before clicking. Browser console messages, page errors, failed requests and HTTP errors are retained in `browser.log`; failed browser attempts also retain screenshots. Next fixtures use the advertised localhost development origin, while TanStack uses its explicitly bound 127.0.0.1 origin.
