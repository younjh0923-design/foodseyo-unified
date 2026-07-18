# Team ownership

## Ownership model

Each workstream has one accountable owner and named reviewers. Ownership means
deciding implementation details inside an approved contract, maintaining tests,
and updating the task master. It does not permit unilateral changes to shared
contracts or another owner's implementation.

A "does not own" boundary prevents duplicate implementation and trust bypass.
It does not prevent an owner from reviewing another area, reporting a defect,
contributing an approved fix, or participating in integration tests.

## Runtime trust flow

The workstreams develop against frozen fakes and interfaces in parallel after
U1.6. Runtime data does not fan out without regard to trust:

```text
Juhyung input UI
  -> approved application boundary
  -> YTW server intake, restaurant resolution, acquisition, extraction
       -> UI-safe candidate/progress/action/outcome data -> Juhyung UI
       -> extracted menu meaning and provenance -> Youn canonical validation
  -> Youn validated canonical application data
       -> Juhyung constrained explanation
       -> Youn persistence, cache, integration, and publication gate
       -> Juhyung final result UI
```

The direct YTW-to-Juhyung lane never carries raw provider output, source
bodies, unvalidated menu meaning, or claims presented as final analysis.

## Roles

### YTW (`ytw010629`) - upstream intake, restaurant resolution, acquisition, extraction

Primary ownership:

- server-side photo/link intake normalization;
- `packages/restaurant-resolution`;
- Google Places candidates, confirmation evidence, and safe fallback;
- `packages/source-acquisition`;
- official website, PDF, ordering-page, and Web Search acquisition;
- source classification, URL and provenance handling, and acquisition fixtures;
- compact menu extraction and its provider adapter in
  `packages/menu-analysis`;
- typed upstream no-result, timeout, invalid-source, and user-action outcomes;
- UI-safe candidate, progress, and confirmation data supplied through shared
  contracts.

YTW does not unilaterally:

- implement the mobile UI or decide final presentation;
- treat provider extraction as canonical fact;
- add culinary vocabulary, evidence precedence, or safety rules;
- write directly to the database or expose database rows;
- send raw provider responses, source bodies, or unvalidated menu claims to
  the UI;
- add a shared DTO, state, error, environment name, or version outside a
  contract PR;
- migrate, deploy, or change Preview or Production.

### Youn (`younjh0923-design`) - contracts, canonical truth, data, integration

Primary ownership:

- `packages/contracts`;
- canonical normalization and semantic validation in
  `packages/menu-analysis`;
- culinary vocabulary, separate sensory axes, evidence precedence, unknown,
  allergen, and dietary-safety rules;
- `packages/dish-knowledge`;
- `packages/merge-policy`;
- `packages/database`;
- Neon PostgreSQL, Drizzle, migrations, roles, repositories, transactions,
  exact cache, ownership, and restaurant-menu reuse;
- privacy-safe observability contracts;
- repository CI, security, cross-workstream integration, and release gates.

Youn does not unilaterally:

- implement Google Places, official-source, Web Search, or compact-extraction
  adapter internals;
- accept a provider DTO as the canonical or database contract;
- persist an unvalidated or partial menu structure;
- implement the mobile UI or decide Juhyung-owned explanation wording;
- expose ORM types or database rows to the web application;
- change YTW or Juhyung interfaces without the shared-contract process;
- modify Preview or Production without the explicit release checkpoint.

### Juhyung (`juhyungbaek0621`) - constrained explanation and user experience

Primary ownership:

- `apps/web`;
- mobile-first photo/link input and review experience;
- restaurant candidate, confirmation, progress, and fallback presentation;
- constrained menu and Dish explanation in `packages/menu-analysis`;
- explanation prompt, bounded retry, deterministic fallback, and renderer
  semantics;
- source-stated, inferred, culinary-baseline, and unknown presentation;
- overview, category disclosure, Dish Detail, safe error, retry, and input
  preservation flows;
- accessibility, mobile overflow, navigation, and end-to-end user experience.

Juhyung does not unilaterally:

- call Google Places, source-acquisition, Web Search, or extraction providers
  from the browser;
- present YTW's unvalidated extraction as final analysis;
- consume provider DTOs, provider responses, ORM types, or database rows;
- add facts, ingredients, sensory values, certainty, dietary claims, or
  allergen claims absent from validated canonical data;
- convert `unknown` into absence, false, dietary-safe, or allergen-safe;
- define a local shared state, error, vocabulary value, environment name, or
  version;
- write cache or persistence policy, migrate, deploy, or change Production.

## Shared responsibilities

- All three approve the U1.6 `@foodseyo/contracts` version `1.0.0` freeze.
- Every shared-contract PR receives all-owner review.
- Every feature PR has a reviewer from another affected workstream.
- YTW reviews upstream intake, restaurant, acquisition, and extraction changes.
- Youn reviews canonical, evidence, safety, privacy, database, cache, and
  release changes.
- Juhyung reviews constrained explanation and user-visible workflow changes.
- Every owner supplies deterministic fixtures and a short handoff that another
  Codex task can execute without private chat context.
- All owners participate in integrated adversarial validation and the final
  release decision.

## Directory ownership

```text
/packages/contracts/              Youn + all-owner approval
/packages/database/               Youn
/packages/dish-knowledge/         Youn
/packages/merge-policy/           Youn
/packages/observability/          Youn
/packages/source-acquisition/     YTW; Youn reviews security/provenance
/packages/restaurant-resolution/  YTW
/packages/menu-analysis/          YTW extraction; Youn canonical; Juhyung explanation
/apps/web/                         Juhyung
/docs/                             accountable owner + affected reviewers
/.github/                          Youn
```

## Avoiding integration conflicts

- Do not have two people edit the same shared contract in separate feature PRs.
- Land the ordered U1 contract PRs and the U1.6 freeze before feature work.
- Keep fixtures in the owning package, not a global unstructured folder.
- UI imports application view models from an approved boundary; it does not
  import provider DTOs or database rows.
- Database repositories accept and return contract DTOs; they do not leak ORM
  types.
- Provider adapters return provider DTOs that are normalized before becoming
  canonical types.
- A direct upstream-to-UI event contains only fields explicitly approved as
  UI-safe operational data.
