# Architecture selection rubric

Score each completed candidate 0–5 per criterion, then explain the relevant evidence. Candidates receive the shared brief and source references, not this picker rubric.

1. Ownership: official bootstrap, public shadcn APIs, toolkit policy, developer integration and CI reporting each have one owner. No duplicated runtime or transport contracts.
2. Interface depth: real CLI call sites map to a small domain API without callers coordinating internal stages or importing wire types.
3. Agent extensibility: a future contributor can add a catalog feature and acceptance recipe without synchronizing lists, inventing alternate pathways or bypassing module boundaries.
4. Execution correctness: clean/dirty Git, target paths, collisions, partial installs, prerequisites, cancellation and default versus strict status are explicit and observable.
5. Verification: executable CLI/runtime fixtures and revision-bound evidence can run locally or in isolated cloud CI with no paid agents. Test coverage remains honest when capabilities are unavailable.
6. Initial scope: root layout and dependencies fit the first CLI/catalog without a workflow engine, monorepo ceremony, compatibility shims or retained legacy app merely for convenience.

Screen all candidates against Architect's design-red-flags reference before choosing a base. Record parent scores, independent judge scores, deviations, grafts and rejected alternatives. Supported-model diversity here does not provide cross-family model review.
