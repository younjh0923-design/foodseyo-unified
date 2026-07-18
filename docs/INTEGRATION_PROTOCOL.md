# Integration protocol

## Branching

Use short-lived branches from current `main`:

```text
contracts/<task>
restaurant/<task>
sources/<task>
analysis/<task>
data/<task>
ui/<task>
release/<task>
```

Do not maintain three permanent personal branches. They drift and create a
large final merge. Integrate small reviewed slices into `main` continuously.

## Pull request size and order

1. Contract PR.
2. Fake adapter and deterministic fixture PR.
3. Implementation PR behind a server-side feature flag.
4. Cross-package integration PR.
5. release-enablement PR after the validation gate.

One PR should change one contract or one vertical behavior. A PR must state:

- task ID from `TASK_MASTER.md`;
- owner and reviewer;
- contracts consumed or changed;
- environment names added or removed;
- tests and fixtures;
- network, database, and deployment effects;
- rollback or disable path.

## Required checks

Every PR:

- installs from the lockfile;
- runs `pnpm verify`;
- contains no secret value;
- does not redefine shared vocabulary;
- does not make a real provider call in CI.

Feature PRs additionally test success, invalid input, provider failure,
timeout, and safe fallback. Database PRs additionally test rollback,
constraints, permissions, idempotency, and concurrent behavior against
Development PostgreSQL.

## Codex task handoff

Every Codex task starts by reading:

1. `AGENTS.md`
2. `docs/TECH_STACK.md`
3. `docs/PRODUCT_FLOW.md`
4. `docs/SHARED_CONTRACTS.md`
5. the assigned task in `docs/TASK_MASTER.md`
6. the owning package README and tests

The task prompt must name:

- branch;
- task ID;
- exact scope;
- acceptance criteria;
- prohibited actions;
- whether network, provider, database, Preview, or Production access is
  authorized.

The final report records commit SHA, files changed, validation, contract
versions, environment names only, and any remaining gate.

## Integration cadence before submission

- Merge contract bootstrap first.
- Treat the agreed photo/link -> Places -> official menu -> Web Search fallback
  -> explanation -> canonical validation -> database -> mobile path as one
  mandatory release chain.
- Integrate thin cross-workstream slices early; do not wait for three completed
  owner branches before testing the shared flow.
- Integrate at least twice per day.
- Run one shared mobile walkthrough after each integration window.
- Feature freeze: 2026-07-20 20:00 EDT.
- Code freeze: 2026-07-21 12:00 EDT.
- Submission package target: 2026-07-21 17:00 EDT.
- Official deadline: 2026-07-21 20:00 EDT.

After feature freeze, only defects that block the working demo, repository
setup, security, or submission requirements may merge.

Feature freeze may reduce optional source breadth, advanced Dish coverage, and
nonessential polish. It may not reclassify official menu acquisition, Web
Search fallback, constrained explanation, canonical consistency, or database
integration as post-submission work.

## Release boundary

Development is the only automatic environment. Preview requires a staged
checkpoint. Production requires an explicit go/no-go review. No feature branch
may deploy itself or run a migration against Preview or Production.
