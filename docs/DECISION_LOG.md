# Decision log

## U-001 - Greenfield unified repository

- **Decision:** Build the final team project in a new repository with new
  module boundaries, common variables, and Git history.
- **Reason:** The three legacy implementations contain useful ideas but
  incompatible contracts, persistence choices, dependency states, and scope.
- **Impact:** Legacy repositories are fixed references only. No wholesale merge
  or credential transfer is allowed.
- **Status:** Accepted
- **Date:** 2026-07-18

## U-002 - Contract-first monorepo

- **Decision:** Use one pnpm monorepo and one `@foodseyo/contracts` package as
  the only source of shared vocabulary, environment names, and versions.
- **Reason:** Three parallel Codex workstreams require compile-time and
  review-time compatibility.
- **Impact:** Contract changes land before feature changes and require all-owner
  review.
- **Governance status:** The universal approval detail is superseded by U-009;
  contract-first sequencing remains accepted.
- **Status:** Accepted
- **Date:** 2026-07-18

## U-003 - Submission cut versus target architecture

- **Decision:** Preserve the complete agreed flow as the target but prioritize
  one working menu-image vertical slice before the Build Week deadline.
- **Reason:** The official deadline is 2026-07-21 17:00 PDT; a complete
  greenfield implementation of every acquisition, Dish, cache, and publication
  layer would endanger a coherent working submission.
- **Impact:** Official-source crawling, Web Search fallback, durable restaurant
  publication, and broad Dish reuse may not enter the submission branch until
  the core slice is green.
- **Status:** Superseded by U-004
- **Date:** 2026-07-18

## U-004 - Final submission flow is non-optional

- **Decision:** The submission must support photo and link intake, Google
  Places restaurant/branch resolution, bounded official menu-source
  acquisition, OpenAI Web Search fallback when official acquisition fails,
  Youn-owned canonical culinary consistency, Juhyung-owned menu/dish
  explanation from validated structure, and Youn-owned database persistence
  and reuse.
- **Technical clarification:** Google Places is used for branch identity and
  official-source discovery. It is not modeled as a full menu-item API.
- **Reason:** The three owners agreed that this is the minimum differentiated
  Foodseyo experience required for judging, rather than a post-submission
  architecture aspiration.
- **Impact:** The official-source path, Web Search fallback, explanation
  boundary, canonical consistency layer, and database integration move onto the
  submission critical path. Release is blocked if any required path is not
  green. Source breadth, advanced Dish coverage, and nonessential polish may be
  reduced to protect the deadline.
- **Original ownership:** YTW owned Places resolution and the mobile
  experience; Juhyung owned source acquisition, Web Search, provider adapters,
  and menu/dish explanation; Youn owned contracts, normalization, merge/safety
  validation, database, integration, and release gates.
- **Ownership status:** Superseded by U-008 without changing the required
  product flow.
- **Status:** Accepted
- **Date:** 2026-07-18

## U-005 - Unified platform source of truth

- **Decision:** Vercel is the application host and Neon Serverless Postgres is
  the database platform. Drizzle owns the future PostgreSQL schema and reviewed
  migrations. Runtime uses environment-scoped pooled `DATABASE_URL`; direct
  `DATABASE_MIGRATION_URL` remains outside application runtime.
- **Reason:** The three legacy repositories and integration notes used
  incompatible Supabase, PostgreSQL, environment-name, folder, and deployment
  assumptions. The unified repository needs one explicit platform contract.
- **Impact:** Supabase database, Auth, Storage, SDK, service-role credentials,
  and migrations are not approved. Legacy OpenAI model variable names are not
  aliases. Development, Preview, and Production use isolated Neon branches and
  keep explicit release gates.
- **Pending:** Framework versions, Postgres driver, exact model values, upload
  limits, and cache lifetime remain frozen only by their named tasks; they must
  not be guessed from a legacy repository.
- **Status:** Accepted
- **Date:** 2026-07-18

## U-006 - Canonical validation precedes explanation

- **Decision:** Compact extraction is normalized and validated before any
  user-facing menu or Dish explanation is rendered. The submission freezes a
  minimum typed Dish boundary in U1; the complete Dish knowledge lifecycle
  remains post-submission P3 scope.
- **Reason:** An explanation may not add or amplify provider output that has
  not passed canonical vocabulary, evidence, unknown, and safety checks.
- **Impact:** README, integration sequencing, task dependencies, and provider
  interfaces use `extraction -> canonical validation -> explanation ->
  persistence`. Until U1 freezes the minimum Dish boundary, no implementation
  assumes that a reviewed baseline exists.
- **Approval evidence:** All-owner review and merge of PR #3.
- **Status:** Accepted
- **Date:** 2026-07-18

## U-011 - Value-free environment and feature-flag registry

- **Decision:** Every approved environment name has one accountable owner,
  secret classification, server-runtime or operator-only boundary,
  Development/Preview/Production/test policy, requirement condition, and safe
  validation-rule identifier. The registry never stores a value.
- **Security:** `DATABASE_URL` is an environment-scoped pooled runtime
  credential. `DATABASE_MIGRATION_URL` is direct and operator-only. Provider
  and database secrets are forbidden in network-free tests. No public browser
  environment variable is approved, and all values are excluded from logs.
- **Feature flags:** Feature flags are optional and fail closed. Only exact
  lowercase `true` enables a feature; absent or malformed input is disabled.
- **Scope:** Exact model values and framework-specific environment-loading
  mechanics remain outside U1.4. No provider call, database connection,
  migration, deployment, or feature behavior is authorized.
- **Version impact:** The registry receives `environment-registry/0.1.0`; all
  contracts remain `0.1.0`/`draft` until U1.6.
- **Approval evidence:** all three owners approved issue #7 and the exact PR #9
  head `982a5d52fdc9e18bad819a7602e58d15b0a03ae1`; PR #9 merged to `main` as
  `e1dac696da91d82d715ae70b513ebef757957980`.
- **Status:** Accepted
- **Date:** 2026-07-18

## U-007 - Manual PR enforcement on the current private plan

- **Decision:** Use short-lived branches and recorded pull-request reviews as
  the enforcement mechanism while branch protection is unavailable for the
  private repository on the current plan.
- **Reason:** `CODEOWNERS` is present, but the current GitHub plan does not
  expose branch protection for this private repository.
- **Impact:** No feature or contract change is pushed directly to `main`.
  Feature PRs require a non-author owner review; shared-contract PRs require all
  three owner approvals. U2.5 revisits automated checks and protection when
  supported. This decision does not authorize billing or repository-visibility
  changes.
- **Governance status:** The universal shared-contract approval detail is
  superseded by U-009; recorded PR review and no-direct-main-push rules remain.
- **Approval evidence:** All-owner review and merge of PR #3.
- **Status:** Accepted
- **Date:** 2026-07-18

## U-008 - Parallel workstreams with guarded semantic handoffs

- **Decision:** YTW owns the upstream server path from normalized input through
  restaurant resolution, menu-source acquisition, Web Search fallback, and
  compact extraction. Youn owns canonical normalization, culinary and safety
  contracts, persistence, cache, integration validation, and release gates.
  Juhyung owns constrained explanation and the mobile-first user experience.
- **Trust boundary:** YTW may send UI-safe candidates, progress, confirmation
  requests, user-action states, and typed outcomes directly to Juhyung.
  Extracted menu meaning and provenance go to Youn; Juhyung receives them for
  explanation or final result presentation only after canonical validation.
- **Parallelism:** After U1.6 freezes the selected contracts at `1.0.0`, all
  three workstreams implement concurrently against shared interfaces and
  deterministic fakes. Parallel development does not bypass the runtime trust
  order.
- **Meaning of exclusions:** A "does not own" list prevents duplicate or
  bypassing implementation. It does not prohibit review, defect reporting,
  integration testing, or a separately approved contract change.
- **Impact:** `TEAM_OWNERSHIP.md`, `TASK_MASTER.md`, package boundaries,
  `CODEOWNERS`, Codex instructions, and validation must use this allocation.
  No feature implementation is authorized by this decision before U1.6.
- **Approval evidence:** all three owners approved the exact PR #4 head
  `b4e13a8b85fd9a0247e047bb790d33d04164478c`; PR #4 merged to `main` as
  `144b190e68766aa68548bc1633f137d5f27b17aa`.
- **Status:** Accepted
- **Date:** 2026-07-18

## U-009 - Queued proposals and impact-tier contract approval

- **Decision:** GitHub Issues hold a non-blocking queue of proposed contract
  changes. Registration requires no approval. A scoped shared contract receives
  approval from its accountable owner and every directly affected producer or
  consumer owner, with at least two people total. Cross-cutting semantic,
  evidence, safety, persistence/cache, environment/platform, ownership/trust,
  breaking, and final-freeze changes require all three owners.
- **Reason:** Requiring all three owners before even recording or progressing an
  unrelated proposal serializes three Codex workstreams and encourages private
  assumptions. Removing approval entirely would allow incompatible contracts
  and unsafe semantic bypasses.
- **Codex startup rule:** Every Codex task scans the complete open queue, then
  deeply reviews proposals in its owned area, assigned to its owner, or marked
  cross-workstream. Proposed shapes are never implemented before their contract
  PR merges.
- **Impact:** Proposal discovery and research may run in parallel. Related
  contract PRs remain serialized by contract group and task dependency. Silence
  is not approval, and a disputed tier escalates by one level.
- **Approval evidence:** all three owners approved the exact PR #4 head
  `b4e13a8b85fd9a0247e047bb790d33d04164478c`; PR #4 merged to `main` as
  `144b190e68766aa68548bc1633f137d5f27b17aa`.
- **Status:** Accepted
- **Date:** 2026-07-18

## U-010 - Standards-informed sensory vocabulary boundaries

- **Decision:** Foodseyo keeps five distinct sensory axes: basic taste, flavor
  note, texture, heat, and richness. Canonical basic tastes are `sweet`,
  `salty`, `sour`, `bitter`, and `umami`; `savory` and `savoury` normalize to
  `umami`. Flavor and texture use controlled, defined, versioned Foodseyo
  lexicons. Heat and richness use separate ordered scales.
- **Unknown and safety:** `unknown` is a value state outside ordered scales.
  It never means zero, absence, allergen-safe, or dietary-safe. Heat
  adjustability is recorded independently from observed or typical heat.
- **Knowledge lifecycle:** `model_generated`, `human_authored`, and `imported`
  are origin kinds. `unreviewed`, `reviewed`, `superseded`, and `retired` are
  review states. Dish-match state does not double as knowledge review.
- **Standards boundary:** ISO sensory vocabulary, descriptor-selection,
  sensory-profile, texture-profile, and response-scale standards inform the
  design. The controlled Foodseyo lexicons are not represented as universal
  ISO descriptor lists or a certified laboratory assessment.
- **Descriptor safety:** Perceptual labels such as `nutty`, `buttery`,
  `cheesy`, and `creamy` do not prove ingredients, allergens, or dietary
  properties.
- **Version impact:** The candidate vocabulary receives
  `shared-vocabulary/0.1.0`; all contracts remain `0.1.0`/`draft` until U1.6.
- **Approval evidence:** all three owners approved issue #6 and the exact PR #8
  head `b8447159b1132266af6ac9b17ece891c399e7bf1`; PR #8 merged to `main` as
  `7c537e19c133285b50bbc096f38510c63a063e56`.
- **Status:** Accepted
- **Date:** 2026-07-18

## U-012 - Typed boundary DTOs and derived Dish profiles

- **Decision:** Use exact runtime-validated DTOs for restaurant
  candidates and confirmation, transient menu-source input, unvalidated compact
  extraction, canonical analysis, typed Dish matching and claims, derived
  effective profiles, normal outcomes, and safe public errors.
- **Trust boundary:** UI-safe restaurant operations are separate from sensitive
  transient source content. Compact extraction is explicitly unvalidated.
  Provider DTOs, raw URLs, source bodies, database rows, and ORM types do not
  enter canonical or UI result contracts.
- **Dish semantics:** `RestaurantMenuVersion` and `MenuItem` own restaurant
  context and current-menu facts. Reusable Dish knowledge is typed,
  provenance-bearing, versioned, and separately reviewed. The many-to-many
  match requires evidence and an explicit decision; candidate rank is never
  confirmation.
- **Merge semantics:** An `EffectiveDishProfile` is derived, carries input,
  policy, and knowledge versions, and applies `source_stated >
  inferred_from_source > reviewed culinary_baseline > unknown` per field. A
  lower-priority baseline cannot append to or override a field with current
  menu evidence.
- **Safety:** Unknown has no value, claim, or provenance and cannot become
  zero, absence, false, confirmed, allergen-safe, or dietary-safe. The candidate
  U1.3 claim families do not create allergen or dietary certification.
- **Public boundary:** Normal no-result/user-action outcomes remain separate
  from public errors. Public messages are registry-owned safe copy with a
  correlation ID, retryability, and HTTP status; callers cannot include raw
  source or provider detail.
- **Version impact:** Introduces `boundary-dtos/0.1.0`. All contracts remain
  `0.1.0`/`draft` and unavailable to feature code until U1.6.
- **Approval evidence:** Issue #10 received all-owner direction approval. YTW
  and Juhyung approved the exact PR #12 head
  `6c7c3d32029674405f111d93bb4cd9982830400d`; PR #12 merged to `main` as
  `8050bc44cff2880b97b08576282565e1f44ed27c`.
- **Deferred:** Provider-specific DTOs, service ports and fakes, matcher scoring,
  effective-profile materialization, physical schema, migrations, cache
  identity, and final allergen/dietary claim vocabularies.
- **Status:** Accepted
- **Date:** 2026-07-19

## U-013 - Provider-neutral module ports and deterministic fakes

- **Decision:** Wrap the merged U1.3 DTOs in provider-neutral server-side ports
  with one bounded invocation context and one success/outcome/error result
  discipline. Each approved owning package exposes deterministic fakes through
  its public root; feature packages do not redefine DTOs or ports.
- **Package boundary:** Keep the seven Issue #14 responsibility boundaries:
  restaurant resolution, source acquisition, combined menu-analysis trust
  sequence, reviewed Dish knowledge, pure merge policy, database publication,
  and privacy-safe observability. Every package depends only on
  `@foodseyo/contracts` during U1.5, preventing cycles and internal-package
  coupling.
- **Trust boundary:** Compact extraction remains unvalidated. Explanation
  receives only canonical analysis. Publication accepts only an eligible
  canonical analysis with a menu version. The direct operational UI lane
  carries no extracted menu meaning.
- **Fake boundary:** Fakes return configured deterministic results and call
  counts, cover cancellation and timeout behavior, and perform no environment,
  provider, database, UI, transport, logging, clock, random, or deployment
  work.
- **Version impact:** Introduces `module-interfaces/0.1.0`. Every selected
  contract remains `0.1.0`/`draft` and unavailable to feature code until U1.6.
- **Approval evidence:** Issue #14 received all-owner direction approval. YTW
  and Juhyung approved the exact PR #15 head
  `b77fcdbeb0a15948a0dd529ea1c4ef739483dccb`; PR #15 merged to `main` as
  `e732983d1b44d282907d85b6d0ea4132984cc3bb`. Issue #14 then moved to
  `status:merged` and closed.
- **Status:** Accepted
- **Date:** 2026-07-19

## U-014 - U1 compatibility contract 1.0.0 freeze

- **Decision:** Promote the 13 selected shared contract tokens and the eight
  approved package manifests to `1.0.0`, with `CONTRACT_STATUS` set to
  `frozen`, as one compatibility unit.
- **Compatibility boundary:** The root private workspace remains `0.0.0`.
  Future data-carried `dish-match/0.1.0` and `dish-profile/0.1.0` tokens remain
  unchanged because they are outside the selected U1 contract registry.
- **Consumption gate:** No U2 or feature code may consume the frozen candidate
  until all three owners approve the exact final U1.6 PR HEAD, it merges to
  `main`, and U1.6 is recorded `DONE`.
- **Scope:** This freeze changes no vocabulary value, DTO field, outcome,
  public error, environment name, interface behavior, provider configuration,
  persistence shape, framework choice, or model value.
- **Approval evidence:** Issue #17 received all-owner proposal approval against
  `main` at `e6307d3f2b7bb59680575a5cbb9c99862b8642be`. YTW and Juhyung
  approved exact PR #18 HEAD
  `fe57602e0ded09c0899c5babf18d64e6d8d6e03e`; PR #18 merged to `main` as
  `e01a67306e319f9aec4b050477eacfbca99ffb31`. Issue #17 then moved to
  `status:merged` and closed.
- **Status:** Accepted
- **Date:** 2026-07-19

## U-015 - Sensitive intake and UI-safe acquisition progress candidate

- **Decision:** Add a dedicated `web-experience/0.1.0` candidate
  with `SubmissionIntakeRequest` and `UiWorkflowProgress`.
- **Sensitive boundary:** Intake permits a user link, opaque transient photo
  handles, or both, rejects empty input, and leaves correlation solely in
  `PortInvocationContext`. Raw input cannot enter logs, errors, persistence,
  cache identity, observability content, progress, or UI responses.
- **Progress boundary:** UI progress is limited to official-source lookup or
  Web Search fallback within `source_acquisition`, using only `in_progress`
  or phase-local `complete`. It cannot duplicate confirmation, failure,
  timeout, canonical success, publication, or final workflow result meaning.
- **Compatibility:** The dedicated public entry point adds a candidate-only
  UI-safe event union and port. Frozen `module-interfaces/1.0.0`
  `UiSafeOperationalEvent`, `UiOperationalEventPort`, and their runtime schema
  remain unchanged, as do frozen DTO, error, outcome, invocation, persistence,
  cache, environment, and provider meanings.
- **Operational scope:** Network-free schemas, fixtures, and fakes only. No
  provider, database, migration, Preview, Production, Vercel, or deployment
  action is authorized.
- **Approval evidence:** Youn, YTW, and Juhyung approved the complete revised
  Issue #21 direction and exact PR #30 HEAD
  `913458fcb2497bf424c3a330826e131101fcfc34`. PR #30 merged to `main` as
  `c04305e421657863d3c0c06fdfe3f90192a1593f`; Issue #21 then moved to
  `status:merged` and closed.
- **Status:** Accepted
- **Date:** 2026-07-21

## U-016 - Next.js web application platform candidate

- **Decision direction:** Freeze the `apps/web` application baseline as
  Next.js App Router `16.2.10`, React `19.2.7`, and React DOM `19.2.7`.
- **Package boundary:** Install those exact dependencies only in `apps/web`.
  The pnpm monorepo, Node `>=20.19.0`, TypeScript `5.9.3`, Vercel target, and
  framework-neutral shared/server packages remain unchanged.
- **Trust boundary:** Browser code consumes only approved UI-safe operational
  data and application view models derived from validated canonical contracts.
  Google, OpenAI, source acquisition, database access, provider DTOs, raw
  source content, credentials, database rows, and ORM types remain server-only.
- **Compatibility:** No shared DTO, vocabulary, state, outcome, public error,
  environment name, persistence/cache meaning, provider permission, migration,
  or deployment behavior changes.
- **Rollout:** This contract-only candidate adds the exact manifest and
  lockfile baseline while explicitly disabling the optional `sharp` install
  script. It authorizes no route, component, Preview, Production, Vercel
  configuration, or deployment before exact-HEAD approval and merge.
- **Approval evidence:** Youn, YTW, and Juhyung approved exact PR #31 HEAD
  `9ef6b510c1ad8ab4465b59044913723ff11d8742`. PR #31 merged to `main` as
  `045b42b0da419e96366488380e5a953f28c11b06`; Issue #20 then moved to
  `status:merged` and closed.
- **Status:** Accepted
- **Date:** 2026-07-21

## U-017 - Implement the bounded MVP persistence vertical slice

- **Decision:** Implement DB-1 through DB-4 in one Draft PR using exactly
  `analysis_contracts`, `menu_evidence_sets`, `analysis_runs`,
  `canonical_analyses`, `restaurants`, `restaurant_external_references`,
  `restaurant_menu_versions`, `menu_items`, `dishes`,
  `menu_item_dish_matches`, and `publication_receipts`.
- **Cache and ownership:** Exact identity combines the transient evidence
  identity with the complete semantic version vector. Unique-insert ownership,
  application-generated run IDs, leases, bounded waiting, guarded
  compare-and-swap transitions, retryable/terminal failure, and stale-owner
  rejection are required without a generalized queue or lock framework.
- **Persistence boundary:** DB-3 persists only `analysis_only` canonical
  results and creates no restaurant, menu, Dish, match, or receipt row. An
  `eligible` result becomes reusable only when DB-4 atomically writes its
  branch-confirmed relational projection and matching receipt.
- **Restaurant identity:** Restaurant means one physical branch. Google Place
  ID remains a unique external reference and never the Foodseyo primary key.
  Existing Place IDs reuse the committed restaurant UUID; a concurrent winner
  requires rollback, canonical rebuild/revalidation, and retry rather than a
  projection-only identity rewrite.
- **Receipt compatibility:** Frozen `module-interfaces/1.0.0`
  `PublicationReceipt` remains exactly `contractVersion`, `analysisId`,
  `menuVersionId`, `status`, and `publishedAt`. Internal receipt columns do not
  expand the public DTO.
- **Dependency correction:** PR #27 is not a prerequisite for core database
  implementation. Contract-shaped confirmed-restaurant fixtures are used until
  its adapter and this implementation share a common `main`.
- **Rollout:** DB-2 may generate but not apply the migration. DB-5 Neon
  Development migration and test-row mutation require a separate explicit
  owner instruction. Preview and Production remain unauthorized.
- **DB-2 evidence:** The Drizzle schema and generated migration contain exactly
  the eleven approved tables, one JSONB canonical payload, application-supplied
  UUIDs, closed text checks, the required menu-version composite uniqueness,
  both receipt integrity foreign keys, and an exact frozen receipt-version
  check. Static parity validation runs in the repository integration suite; the
  migration remains unapplied.
- **DB-3 evidence:** The provider-independent repository resolves exact
  identities, elects a single application-generated run owner, bounds duplicate
  waiting, replaces expired leases, records retryable or terminal outcomes, and
  rejects stale owner writes through guarded compare-and-swap. The menu-only
  operation accepts only a runtime-validated `analysis_only` canonical value and
  leaves all seven publication-side table counts at zero in deterministic tests.
- **DB-4 evidence:** The minimal publication API reuses an existing Google Place
  binding, reserves an application UUID otherwise, and rebuilds/revalidates the
  immutable canonical value if a concurrent transaction wins. Eligible
  canonical data, menu lifecycle, items, Dish identities, matches, and the
  internal receipt commit atomically. Three pre-commit fault points roll back
  completely; simulated response loss after commit recovers the identical
  runtime-validated frozen five-field receipt without duplicates.
- **Status:** Accepted implementation baseline
- **Date:** 2026-07-21
