# Dependency ownership

The CLI uses Clack prompts, Commander arguments, Semver runtime checks,
validate-npm-package-name for new project names and Zod boundary schemas.
Shadcn 4.21.4 owns public registry fetch, resolution, transforms and installation.
The CLI delegates the exact Payload generator binary; generated apps install
their own Payload/framework/plugin dependencies.

Chalk overlaps current prompt presentation. Chokidar needs a watch command.
Diff belongs to a future reviewed upgrade command. Tempy overlaps Node's owned
temporary directories. None is a direct dependency without a current caller.

The repo pins TypeScript 6.0.3 because its public compiler API drives the module
import checks, matching the official template compiler. TypeScript 7.0.2 moves
that API behind unstable imports. Keep upgrades tied to compatibility tests,
not a assumption that a newer version exposes the same API.

Registry and runtime proof have different boundaries. Building embedded JSON
qualifies first-party file transforms. It does not prove dependency installation,
Payload hooks, persistence, admin behavior or a contributor agent's judgment.
The independent fixture suite supplies those observations.
