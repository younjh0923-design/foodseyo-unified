# Team ownership

## Ownership model

Each workstream has one accountable owner and at least one reviewer. Ownership
means deciding implementation details inside an approved contract, maintaining
tests, and updating the task master. It does not permit unilateral changes to
shared contracts.

## Roles

### Youn (`younjh0923-design`) - architecture, contracts, data, integration

Primary ownership:

- `packages/contracts`
- `packages/database`
- `packages/merge-policy`
- repository CI, security, integration, and release gates
- final canonical validation and cross-workstream integration

Reference strengths:

- canonical data and evidence contracts;
- PostgreSQL integrity, transactions, exact cache, and ownership;
- network-free validation and rollout discipline.

### Juhyung (`juhyungbaek0621`) - menu acquisition, provider adapters, and explanation

Primary ownership:

- `packages/source-acquisition`
- official-site, PDF, ordering-page, and Web Search discovery adapters
- source classification, source normalization, and acquisition fixtures
- provider request construction and bounded source extraction
- menu and dish explanation implementation, provider prompt, and deterministic
  explanation fallback

Reference strengths:

- compact mobile exploration;
- multilingual menu handling;
- source acquisition, menu explanation, and progressive detail concepts.

### YTW (`ytw010629`) - restaurant resolution and product experience

Primary ownership:

- `packages/restaurant-resolution`
- Google Places candidate search and confirmation UX
- `apps/web`
- menu evidence versus general-guidance presentation
- mobile accessibility and end-to-end user flow

Reference strengths:

- restaurant context confirmation;
- source references and source/general knowledge separation;
- restaurant/menu-first mobile interaction.

## Shared responsibilities

- All three approve `@foodseyo/contracts` version `1.0.0`.
- Each feature PR has a reviewer from another workstream.
- Any database, safety, privacy, or Production change requires Youn review.
- Any source-acquisition or provider-boundary change requires Juhyung review.
- Any menu/dish explanation implementation change requires Juhyung review and
  Youn review for canonical, evidence, and safety compliance.
- Any restaurant-resolution or user-visible workflow change requires YTW
  review.
- Every owner supplies deterministic fixtures and a short handoff for another
  Codex task to continue the work.

## Directory ownership

```text
/packages/contracts/              Youn + all-owner approval
/packages/database/               Youn
/packages/merge-policy/           Youn
/packages/source-acquisition/     Juhyung
/packages/menu-analysis/          Juhyung for provider/explanation; Youn for canonical validation
/packages/restaurant-resolution/  YTW
/apps/web/                         YTW
/docs/                             owner of changed contract + one reviewer
/.github/                          Youn
```

## Avoiding integration conflicts

- Do not have two people edit the same shared contract in separate feature PRs.
- Land contract PRs before dependent feature work.
- Keep fixtures in the owning package, not a global unstructured folder.
- UI imports view models from an application boundary; it does not import
  database rows.
- Database repositories accept and return contract DTOs; they do not leak ORM
  types.
- Provider adapters return provider DTOs that are normalized before becoming
  canonical types.
