# Contract change queue

GitHub Issues are the operational queue for proposed Foodseyo contract changes.
The queue separates proposing work from approving it and from implementing it.
Anyone may register a proposal without waiting for another proposal to finish.

```text
PROPOSED -> TRIAGED -> REVIEW READY -> APPROVED -> MERGED -> IMPLEMENTED
                      \-> BLOCKED
```

Registration is not approval. Approval is not implementation. A queued proposal
does not change the active contract, unblock a task dependency, or authorize a
feature branch to consume the proposed shape.

## GitHub labels

Every contract-change issue uses:

```text
type:contract-change
status:proposed
status:triaged
status:review-ready
status:approved
status:merged
status:implemented
status:blocked

area:upstream
area:canonical
area:ui
area:data
area:platform
area:cross-workstream

review:youn
review:ytw
review:juhyung
```

Use exactly one `status:*` label and at least one `area:*` label. Apply every
`review:*` label required by the approval tier. If repository labels have not
yet been created, use the issue title prefix `[CONTRACT CHANGE]` and record the
intended labels in the issue body; a missing label must not hide the proposal.

## Approval tiers

| Tier | Change | Required approval |
| --- | --- | --- |
| `private` | Package-private implementation detail with no boundary, persisted, cached, security, or user-visible semantic effect | Owning workstream process; no contract issue required |
| `non-semantic` | Typo, formatting, link repair, or wording cleanup that cannot change behavior or meaning | One non-author reviewer |
| `scoped-shared` | Backward-compatible contract used by a bounded set of workstreams | Accountable contract owner plus every directly affected producer or consumer owner; at least two people total |
| `cross-cutting` | Evidence, provenance, unknown, culinary vocabulary, allergen or dietary safety, ownership/trust flow, public error semantics, persisted meaning, cache identity, environment trust boundary, platform choice, or breaking cross-workstream change | All three owners |
| `final-freeze` | U1.6 `1.0.0` compatibility freeze or an irreversible release decision | All three owners approving the exact final HEAD |

Silence is never approval. When the tier or affected owners are disputed, raise
the proposal by one tier. A third owner who is not a required approver remains
notified and may request escalation before merge.

## Codex startup queue check

Every team Codex task performs this read-only check before selecting or
continuing repository work:

1. read `AGENTS.md` and the required documents;
2. refresh GitHub issue and pull-request state through the connected GitHub
   app, then official `gh` CLI or API fallback if browser integration fails;
3. list open `type:contract-change` issues, or search open issue titles for
   `[CONTRACT CHANGE]` when labels are unavailable;
4. scan the complete open queue for a conflict with the current task;
5. deeply review only issues in the task's owned area, carrying its
   `review:*` label, or marked `area:cross-workstream`;
6. report new, changed, blocking, or assigned proposals before implementation;
7. never implement a `proposed`, `triaged`, `review-ready`, or `blocked` shape;
8. consume a changed contract only after its PR is merged and the task branch
   is updated from the resulting `main`.

Failure to access GitHub is not evidence that the queue is empty. Use the
official fallback, and ask the account holder only when login, MFA, or
repository authorization is genuinely required.

## Concurrency rules

- Independent proposals may be registered and reviewed in parallel.
- Only one active PR may modify the same contract group at a time.
- A later proposal links the earlier issue instead of creating a competing
  temporary enum, field, environment name, or interface.
- Research, compatibility analysis, examples, and invalid cases may be prepared
  while queued; dependent product code may not.
- Queue status does not override `TASK_MASTER.md` dependencies.
- Review the queue in two short team windows per day before submission, while
  urgent cross-cutting safety findings are reviewed immediately.

## Required issue contents

Use the repository contract-change issue form. Every proposal identifies:

- requester, task ID, area, producers, and consumers;
- proposed item and why the current contract is insufficient;
- approval tier and required reviewers;
- compatibility and version impact;
- persistence, cache, API, public error, environment, migration, security,
  privacy, evidence, and unknown impact;
- one valid example and one invalid or edge example;
- unresolved product decisions;
- confirmation that dependent implementation has not been added.
