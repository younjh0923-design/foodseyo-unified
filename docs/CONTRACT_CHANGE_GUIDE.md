# Shared contract change guide

This guide is the operating procedure for changing Foodseyo shared contracts,
common variables, DTOs, public outcomes, environment names, version tokens, and
cross-package interfaces. It is written for both team members and Codex tasks.

The goal is not to prevent change. The goal is to make one reviewed change
before three workstreams implement three incompatible versions of the same
idea.

`CONTRACT_CHANGE_QUEUE.md` separates registration, approval, merge, and
implementation. Anyone may register a proposal immediately. The required
approval depends on impact rather than treating every change as an all-owner
blocker.

## Is this a shared contract change?

Treat a proposed item as shared when any of the following is true:

- two packages, the server and client, or two workstream owners exchange it;
- it crosses an API, provider, application-service, database, cache, or
  environment boundary;
- it changes user-visible meaning, evidence, safety, retry, or error behavior;
- it is persisted, included in cache identity, or interpreted after a version
  upgrade;
- it introduces a vocabulary value, status, public error code, feature flag,
  environment name, or version token.

Keep an item private to one package only when it is an implementation detail
that never crosses those boundaries and does not change persisted or
user-visible meaning.

Examples:

| Proposed item | Classification |
| --- | --- |
| A component-only animation state | `apps/web` private implementation |
| A private HTML parsing helper | `source-acquisition` private implementation |
| `RestaurantResolution` field or state | shared contract |
| A server outcome consumed by the UI | shared contract |
| A new public error code | shared contract |
| A new environment variable or feature flag | shared platform contract |
| A database index with no semantic effect | database implementation detail |
| A stored column or constraint that changes DTO meaning | contract plus database change |
| Explanation retry, deterministic fallback, or renderer semantic change | shared semantic and version contract |

When uncertain, stop the dependent implementation and submit a contract change
request. Do not create a temporary local enum, string, alias, or environment
name.

## Ownership

| Change | Accountable owner | Required review |
| --- | --- | --- |
| Package-private or non-semantic change | Owning workstream | Owning process or one non-author reviewer |
| Scoped shared vocabulary, DTO, state, or interface | Youn | Accountable owner plus all directly affected owners; at least two people |
| Server intake, restaurant resolution, source acquisition, compact extraction | YTW | Youn plus Juhyung only when their contracts or UI-visible states are affected |
| Canonical, evidence, safety, database, cache | Youn | Affected owners; all three for cross-cutting safety, persisted meaning, or cache identity |
| Constrained explanation or user workflow | Juhyung | Youn plus YTW only when canonical or upstream states change |
| Platform choice, environment trust boundary, breaking cross-workstream change | Youn | All three owners |
| Preview or Production behavior | Youn release owner | explicit release checkpoint |

Ownership permits implementation decisions inside an approved contract. It
does not permit unilateral shared-contract changes. A statement that an owner
"does not" perform another workstream's task prevents duplicate or bypassing
implementation; it does not prevent code review, integration testing, defect
reporting, or a separately approved ownership change.

## Required workflow

### 1. Register the need before implementing it

The person or Codex task that discovers the need opens a GitHub issue using the
contract-change form. Registration requires no approval and does not have to
wait for unrelated proposals. It must explain why the existing contract cannot
represent the requirement.

Do not add the new field or value to a feature package while waiting.

### 2. Classify the impact

The contract owner triages the issue, assigns its area and approval tier, names
the required reviewers, and determines whether the change affects:

- runtime schema and TypeScript types;
- API or application-service compatibility;
- public outcomes or errors;
- environment trust boundaries;
- persisted data or migrations;
- cache identity or invalidation;
- provider prompts or semantic output;
- security, privacy, evidence, or unknown handling;
- Preview, Production, deployment, or rollback.

Unresolved product meaning is recorded as unresolved. Codex must not guess it.
If the tier or affected-owner classification is disputed, raise the proposal by
one approval tier. Queue status never overrides task dependencies.

### 3. Change the contract first

Use a short-lived `contracts/<task>` branch and a contract-only PR. Update the
smallest complete set of artifacts:

- `@foodseyo/contracts` vocabulary, runtime schema, type, or version;
- valid examples and invalid fixtures;
- network-free contract tests;
- `SHARED_CONTRACTS.md` and any affected product or technical document;
- `TASK_MASTER.md` status and dependencies;
- `DECISION_LOG.md` when a durable decision changes;
- environment examples when an approved variable name changes.

Do not mix dependent feature implementation into the contract PR.

### 4. Review compatibility and versions

Every shared-contract PR answers:

- Can an existing producer still create a valid value?
- Can an existing consumer safely handle the new value?
- Does an exhaustive switch break when an enum value is added?
- Is a field optional because the concept is genuinely optional, or merely to
  avoid a migration?
- Does the change alter persisted meaning or cache reuse?
- Which contract version token must change?
- Is a database migration required later?
- What is the rollback or disable path?

An additive-looking change can still be breaking. Adding an enum value breaks a
consumer that assumes the old set is exhaustive.

### 5. Validate and obtain approval

Before review:

- run `pnpm verify`;
- run `git diff --check`;
- confirm tests made no real provider call;
- confirm no secret, raw image, source body, provider response, or database
  value is present;
- confirm the PR names its Task ID, owner, reviewers, changed contracts, and
  platform effects.

Required approvals follow `CONTRACT_CHANGE_QUEUE.md`:

- a scoped shared change receives the accountable contract owner's approval and
  approval from every directly affected producer or consumer owner, with at
  least two people total;
- evidence, provenance, unknown, culinary vocabulary, allergen or dietary
  safety, ownership/trust flow, public error semantics, persisted meaning,
  cache identity, environment trust, platform, or breaking cross-workstream
  changes receive all three approvals;
- U1.6 and irreversible release decisions receive all three approvals on the
  exact final HEAD.

Under the current private-repository plan, approval is recorded on the PR
because branch protection is not available. Silence is not approval.

### 6. Merge the contract before feature code

After a contract PR is approved and merged:

1. move the still-open proposal from `status:approved` to `status:merged` and
   then close it; never close it merely because the proposal direction was
   approved;
2. before U1.6, continue only the next ordered contract task;
3. after U1.6, dependent feature branches update from current `main`;
4. features import the shared contract rather than copying it;
5. each feature adds its own deterministic fixtures and implementation tests;
6. no compatibility alias is added for an unapproved legacy name.

## Change-type rules

### Vocabulary, status, and state

- Use one canonical name and meaning.
- Distinguish lifecycle state, UI state, typed non-error outcome, and public
  error; do not put all four into one enum.
- Preserve separate taste, flavor, texture, heat, and richness axes.
- Preserve `source_stated > inferred_from_source > culinary_baseline >
  unknown`.
- Never make `unknown` mean absent, false, allergen-safe, or dietary-safe.
- Never add a generic string escape hatch to avoid reviewing a new value.

### DTO and API boundary

- Define a runtime schema and derive or pair its TypeScript type.
- Separate provider DTO, canonical DTO, application view model, and database
  row.
- Preserve provenance and safe source references.
- Mark required versus optional fields from product meaning, not convenience.
- Include valid, missing, invalid, conflicting, and forward-compatibility
  fixtures.
- Never expose provider-internal fields or database rows directly to the UI.
- Keep restaurant photo bytes and opaque or short-lived Google photo/provider
  references in the provider DTO or application view model. They are not
  canonical data and are not permanently persisted unless a separately
  reviewed contract defines licensing, attribution, freshness/TTL, and storage
  behavior.
- Google Place ID is the explicit external-identity exception to that provider
  reference rule. It remains separate from Foodseyo internal identity.

### Public outcome and error

For every proposed outcome, decide whether it is:

1. a normal state requiring user action;
2. a successful result with warnings;
3. a typed no-result or unavailable outcome;
4. a public error.

Public errors use stable codes, a safe user message, safe correlation ID,
retryability, and HTTP behavior where relevant. They never expose source
content, provider responses, credentials, internal URLs, or database details.

A validated source reference used for provenance is not the same as the raw
discovered or ordering URL received from a user, provider, redirect, or search
result. Raw source URLs must never appear in logs or public-error payloads.
Use a safe source reference, correlation ID, or intentionally redacted URL
metadata instead.

### Environment variable and feature flag

A new environment name requires:

- purpose and accountable owner;
- secret classification;
- server, public, or operator trust boundary;
- Development, Preview, and Production scope;
- required/optional behavior and validation;
- `.env.example` or `.env.operator.example` name-only entry;
- `packages/contracts/src/environment.ts` update;
- `TECH_STACK.md`, contract tests, and relevant task update.

Never:

- put a secret behind `NEXT_PUBLIC_`;
- place `DATABASE_MIGRATION_URL` in application or Vercel runtime;
- commit or print a value;
- add a legacy alias to avoid adapting imported code.

### Version, persistence, and cache

Change the relevant version token when a prompt, schema, vocabulary, merge
rule, explanation renderer, or other semantic input can change the meaning of a
stored or cached result.

Record:

- old and new semantic interpretation;
- affected persisted records and cache keys;
- compatibility or invalidation behavior;
- migration need and rollback plan.

Do not reuse old cache entries under a new meaning.

Changing explanation retry behavior, deterministic-fallback behavior, or
explanation-renderer semantics is a shared semantic change. Review and advance
the relevant version token whenever that change can alter persisted, cached, or
user-visible meaning.

### Database and migration

A contract decision that affects persistence lands before the Drizzle or SQL
change. Database work then uses its assigned Development-only task.

The database PR must define constraints, permissions, transaction behavior,
idempotency, concurrency, rollback, and cleanup. Preview and Production remain
unchanged until their explicit release checkpoints.

### Platform or dependency

Do not infer a shared framework, provider model, package, database driver, or
hosting behavior from a legacy repository. A platform change updates
`TECH_STACK.md`, the decision log, security and rollout impact, and receives
all-owner review before dependent code is added.

## Before and after contract 1.0.0

Before U1.6, proposed values land through the ordered U1 contract-only PRs and
remain `0.1.0`/`draft`. Proposals may be queued in parallel, but their PRs obey
task dependencies and the impact-tier approval matrix. No feature
implementation begins until the all-owner U1.6 freeze promotes the selected
contracts to `1.0.0`.

After `1.0.0`, every semantic addition or modification uses a new dedicated
contract PR. A feature that discovers the need waits for that PR to merge and
then updates from `main`.

## Contract change request template

```text
[CONTRACT CHANGE REQUEST]

Requester:
GitHub account:
Task ID:
Affected workstream:
Proposed approval tier:
Required owner reviewers:

Proposed item:
Why the current contract is insufficient:
Producers:
Consumers:

Is it persisted:
Does it affect cache identity:
Does it affect an API or public error:
Does it add an environment name:
Does it require a later migration:
Security, privacy, evidence, or unknown impact:

Backward-compatibility analysis:
Proposed version impact:
Valid example:
Invalid or edge example:
Unresolved product decision:

No implementation has been added before contract approval: yes/no
```

## Codex prompt template

```text
Read AGENTS.md and every required document first, including
docs/CONTRACT_CHANGE_GUIDE.md and docs/CONTRACT_CHANGE_QUEUE.md.

Repository:
https://github.com/younjh0923-design/foodseyo-unified

Task ID:
Branch:
Requester:

Evaluate the attached CONTRACT CHANGE REQUEST.

First inspect the complete open GitHub contract-change queue. Deeply review
items assigned to this owner, in this workstream, or marked cross-workstream.
Report a conflicting or duplicate proposal before changing files.

First determine whether the proposal is:
- package-private implementation;
- shared vocabulary or DTO;
- typed outcome or public error;
- environment or platform contract;
- database/persistence contract;
- release behavior.

Report the current contract, the gap, producers, consumers, compatibility,
version, cache, persistence, environment, security, and rollout impact before
changing files.

If product meaning is unresolved, stop after the report.

If the change is fully specified and authorized, update only the contract,
runtime schema/type, fixtures, network-free tests, task master, decision log,
and directly affected documentation. Do not implement the dependent feature in
the same PR.

Never add a local duplicate enum, temporary environment alias, secret value,
real provider call, unapproved migration, Preview/Production change, or
deployment.

Run pnpm verify and git diff --check. Commit and push only to the named
short-lived contract branch. Open or update a draft PR and stop without
merging.
```

## Reviewer checklist

- [ ] The change is genuinely shared; package-private details remain private.
- [ ] Producers and consumers are named.
- [ ] State, non-error outcome, warning, and public error are not conflated.
- [ ] Runtime schema, TypeScript type, examples, and invalid fixtures agree.
- [ ] Evidence, provenance, unknown, dietary, and allergen rules remain safe.
- [ ] Raw source URLs are absent from logs and public errors; only safe source
      references, correlation IDs, or intentionally redacted metadata cross
      those boundaries.
- [ ] Restaurant photo bytes and opaque or short-lived provider references are
      not canonical or permanently persisted without a separately reviewed
      licensing, attribution, freshness/TTL, and storage contract.
- [ ] Environment trust boundaries contain no secret exposure.
- [ ] Version, persistence, migration, and cache effects are explicit.
- [ ] Task dependencies and durable decisions are updated.
- [ ] `pnpm verify` and `git diff --check` pass.
- [ ] No dependent feature implementation is hidden in the contract PR.
- [ ] Required owner approvals are recorded before merge.
- [ ] The proposal is registered once in the GitHub queue and has one status.
- [ ] The approval tier and affected owners match the actual impact.
