# Evidence and cleanup

## Sub-features

Run identity, command/check records, failed-attempt preservation, artifact identities and owned-resource removal.

## How to get to it (user POV)

After verification, inspect its printed run ID with `agent:evidence` and clean resources with `agent:cleanup`.

## Driving it with the contributor harness

Run `bun run agent:evidence`, then `bun run agent:cleanup`, then `bun run agent:evidence` again. The same run and check records must remain, with cleanup complete. Screenshots/logs remain under the printed evidence directory. Cleanup accepts `--run` for an older recorded run and checks Docker labels before removing anything.

## Gotchas

Evidence status is not overwritten by a later successful run. Borrowed databases are never deleted. Process IDs from an old run may have been reused; inspect actual ownership before manual termination after a force-kill. Trusted CI reporting parses bounded evidence as data and distinguishes those claims from platform job conclusions.
