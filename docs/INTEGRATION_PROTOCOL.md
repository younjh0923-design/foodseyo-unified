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

## Current GitHub enforcement

The current private-repository plan does not expose branch protection for this
repository. `CODEOWNERS` therefore documents review ownership but is not a
technical lock on `main`.

Until branch protection is available:

- no owner pushes feature or contract changes directly to `main`;
- every change uses a short-lived branch and pull request;
- each feature PR records approval from a non-author workstream owner;
- each scoped shared-contract PR records approval from the accountable contract
  owner and every directly affected owner, with at least two people total;
- each cross-cutting contract, U1.6 freeze, and irreversible release decision
  records all three owner approvals;
- Youn verifies the review record and `pnpm verify` result before merge.

U2.5 must revisit automated checks and branch protection when supported.
Nothing in this fallback authorizes a billing change or making the repository
public.

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
5. `docs/SENSORY_VOCABULARY.md`
6. `docs/BOUNDARY_DTOS.md`
7. `docs/MODULE_INTERFACES.md`
8. `docs/CONTRACT_CHANGE_GUIDE.md`
9. `docs/CONTRACT_CHANGE_QUEUE.md`
10. the assigned task in `docs/TASK_MASTER.md`
11. `docs/TEAM_OWNERSHIP.md`
12. the owning package README and tests

Before implementation, every Codex task refreshes GitHub state and scans the
complete open contract-change queue. It then deeply reviews only proposals in
its owned area, assigned to its owner, or marked cross-workstream. A proposed or
blocked issue is not an active contract. When the GitHub browser integration
fails, use the connected GitHub app, official `gh` CLI, or API fallback; ask the
account holder only for login, MFA, or repository authorization.

The task prompt must name:

- branch;
- task ID;
- exact scope;
- acceptance criteria;
- prohibited actions;
- whether network, provider, database, Preview, or Production access is
  authorized.

Any task that discovers a new cross-package field, state, error, environment
name, version, or interface follows `CONTRACT_CHANGE_GUIDE.md` before adding
the dependent implementation.

The final report records commit SHA, files changed, validation, contract
versions, environment names only, and any remaining gate.

## Parallel work and runtime handoffs

After U1.6, YTW, Youn, and Juhyung build their frozen interfaces in parallel
with deterministic fakes. Runtime trust remains ordered:

- YTW may send UI-safe candidates, progress, user-action states, and typed
  outcomes directly to Juhyung.
- YTW sends extracted menu meaning and provenance to Youn-owned canonical
  validation.
- Juhyung receives menu meaning for explanation and result-view preparation
  only after that validation.
- Youn owns persistence, cache publication, integration verification, and
  release gates; final result presentation waits for the publication gate or
  an explicitly frozen safe fallback.

No owner creates a long-lived personal integration branch or imports another
package's internal types to bypass these handoffs.

## Integration cadence before submission

- Review newly registered contract proposals in two short windows per day.
- Registration never waits for an unrelated proposal, while implementation
  waits for the required contract PR to merge.
- Merge the ordered U1 contract-only slices first and complete the U1.6
  `1.0.0` freeze before feature implementation.
- Treat the agreed photo/link -> Places -> official menu -> Web Search fallback
  -> compact extraction -> canonical validation -> explanation -> database
  -> mobile path as one mandatory release chain.
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
