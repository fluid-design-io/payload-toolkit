# Creating a project

```sh
payload-toolkit init acme --framework next --database postgres --package-manager pnpm
payload-toolkit init acme --framework tanstack --database mongodb --features forms --package-manager pnpm
```

In a terminal, missing choices are prompted. Unattended runs must pass the directory, `--framework` (`next`, `tanstack`), `--database` (`postgres`, `mongodb`) and `--package-manager` (`npm`, `pnpm`, `bun`). `--json` prints one result and disables prompts.

`init` runs the pinned official generator and template, then installs any `--features`, a comma-separated list of the references `add` accepts. Without features it is the plain official starter. `--codex` and `--claude` need at least one feature.

The generator writes `AGENTS.md` pointing at the skill in the installed `payload` package; `init` appends a section naming `payload-toolkit@<version> docs` for the version that created the project.

Pass `--database-url` or set `DATABASE_URI` to use an existing database. Otherwise the environment gets a local placeholder to configure later. The toolkit never provisions services.
