# Foodseyo unified task master

## How to use this file

This is the execution source of truth. Every branch, Codex task, PR, and handoff
names exactly one task ID. A task is complete only when its acceptance criteria
pass and its status is updated here. Any new shared field, state, outcome,
error, environment name, version, or interface follows
`CONTRACT_CHANGE_GUIDE.md` before dependent implementation starts.

Status values:

- `READY`: dependencies are complete;
- `IN PROGRESS`: one owner is actively working;
- `REVIEW`: implementation is complete and checks are green;
- `BLOCKED`: a named dependency or account-holder action is required;
- `DONE`: merged into `main`;
- `DEFERRED`: outside the submission cut and never used for a required flow
  capability.

A task whose dependency is not `DONE` remains `BLOCKED`. `REVIEW` means the
current output is ready for its required reviewers; `DONE` means the approved
output is merged into `main`. An ordered U1 task does not unblock its successor
until it is `DONE`.

## Non-negotiable program rules

- No implementation before U1.6 freezes the selected shared contracts at
  `1.0.0`.
- No local copy of shared vocabulary, environment names, or version tokens.
- No real OpenAI call in automated validation.
- No Preview or Production migration or deployment without its release task.
- No raw image, source body, menu text, provider response, credential, or
  database value in logs or Git.
- The required submission chain is photo/link intake -> Places restaurant
  resolution -> official menu acquisition -> Web Search fallback -> extraction
  -> canonical validation -> explanation -> database -> mobile experience.
- Required chain capabilities may not be deferred or silently disabled to
  protect the deadline. Reduce optional breadth and polish first.
- Google Places supplies branch identity and official-source clues; it is not
  treated as a full menu-item API.

## Official timing

- Official deadline: **2026-07-21 17:00 PDT / 20:00 EDT**.
- Feature freeze: **2026-07-20 20:00 EDT**.
- Code freeze: **2026-07-21 12:00 EDT**.
- Submission package target: **2026-07-21 17:00 EDT**.

## Milestone U0 - Repository bootstrap

### U0.1 Greenfield repository and governance

- **Owner:** Youn
- **Status:** DONE
- **Outputs:** monorepo root, AGENTS, environment examples, CODEOWNERS, PR
  template, decision log.
- **Acceptance:** repository contains no inherited code, secret, deployment, or
  migration.

### U0.2 Common contract draft

- **Owner:** Youn
- **Reviewers:** Juhyung, YTW
- **Status:** DONE
- **Outputs:** `@foodseyo/contracts` vocabulary, environment names, version
  tokens, validation script.
- **Acceptance:** typecheck and contract validation pass; sensory axes and
  evidence precedence remain separate.
- **Clarification:** `DONE` means the validated `0.1.0` draft is merged. It does
  not mean the U1 `1.0.0` contract has been approved.

## Milestone U1 - Freeze the team compatibility contract

U1 lands through small, ordered, contract-only PRs. U1.1 through U1.5 remain
`0.1.0`/`draft`; U1.6 promotes the selected compatibility unit to
`1.0.0`/`frozen`. Feature branches begin only after all-owner exact-HEAD
approval, merge to `main`, and recorded U1.6 completion.

Execution order:

1. U1.1 approves product, evidence, ownership, and trust-boundary invariants.
2. U1.2 and U1.4 may proceed after U1.1.
3. U1.3 proceeds after U1.2.
4. U1.5 proceeds after U1.3.
5. U1.6 verifies the complete compatibility contract and promotes it to
   `1.0.0`.
6. U1 proposals may be registered in parallel without approval. Contract PRs
   obey task dependencies and the approval tier in
   `CONTRACT_CHANGE_QUEUE.md`; U1 cross-cutting decisions and the final freeze
   receive all-owner review.

### U1.1 Approve product, evidence, ownership, and trust invariants

- **Owner:** all three
- **Dependency:** U0.2
- **Status:** DONE
- **Decide:** restaurant/menu/Dish boundaries, evidence precedence, unknown
  semantics, source/general labeling, raw-image retention, minimum submission
  Dish boundary versus advanced P3 scope, workstream ownership, and guarded
  semantic handoffs.
- **Acceptance:** all three approve `PRODUCT_FLOW.md` and
  `TEAM_OWNERSHIP.md`; direct YTW-to-Juhyung data is limited to UI-safe
  operational fields; unresolved items are explicitly marked rather than
  inferred.
- **Completion evidence:** all three approved the exact PR #4 head
  `b4e13a8b85fd9a0247e047bb790d33d04164478c`; PR #4 merged to `main` as
  `144b190e68766aa68548bc1633f137d5f27b17aa`.

### U1.2 Freeze shared vocabulary

- **Owner:** Youn
- **Reviewers:** all three
- **Dependency:** U1.1
- **Status:** DONE
- **Decide:** allowed sensory values, ingredient roles, restaurant states,
  menu scopes, menu lifecycle, Dish match states, knowledge review states.
- **Acceptance:** no ambiguous `taste` field; heat/richness cannot mix; contract
  tests pass; the candidate vocabulary is complete but remains `0.1.0`/`draft`
  until U1.6.
- **Completion evidence:** issue #6 was approved by all three owners; all three
  approved the exact PR #8 head
  `b8447159b1132266af6ac9b17ece891c399e7bf1`; PR #8 merged to `main` as
  `7c537e19c133285b50bbc096f38510c63a063e56`.

### U1.3 Freeze boundary DTOs

- **Owner:** Youn
- **Inputs:** YTW upstream producer needs, Juhyung explanation/UI consumer
  needs
- **Dependency:** U1.2
- **Status:** DONE
- **Define:**
  - `RestaurantCandidate`
  - `RestaurantResolution`
  - `MenuSourceInput`
  - `CompactMenuExtraction`
  - `CanonicalMenuAnalysis`
  - `DishCandidate`
  - `EffectiveDishProfile`
  - safe public error envelope
- **Acceptance:** runtime schemas, TypeScript types, examples, invalid fixtures,
  and version tokens exist.
- **Completion evidence:** Issue #10 supplied the all-owner Dish semantic
  direction. YTW and Juhyung approved the exact PR #12 head
  `6c7c3d32029674405f111d93bb4cd9982830400d`; PR #12 merged to `main` as
  `8050bc44cff2880b97b08576282565e1f44ed27c`.

### U1.4 Freeze environment and feature-flag registry

- **Owner:** Youn
- **Reviewers:** all three
- **Dependency:** U1.1
- **Status:** DONE
- **Acceptance:** every variable has owner, secret classification, runtime
  scope, Development/Preview/Production policy, and no printed value.
  Migration credentials remain outside application runtime;
  `TECH_STACK.md`, environment examples, and TypeScript environment names agree;
  no Supabase or legacy model alias is approved.
- **Completion evidence:** issue #7 was approved by all three owners; all three
  approved the exact PR #9 head
  `982a5d52fdc9e18bad819a7602e58d15b0a03ae1`; PR #9 merged to `main` as
  `e1dac696da91d82d715ae70b513ebef757957980`.

### U1.5 Freeze module interfaces

- **Owner:** all three
- **Dependency:** U1.3
- **Status:** DONE
- **Acceptance:** each package publishes an interface and fake adapter; no
  feature package imports another package's internals; UI-safe operational data
  is distinct from semantic extraction; unvalidated menu meaning cannot reach
  explanation or final presentation.
- **Completion evidence:** Issue #14 received all-owner direction approval.
  YTW and Juhyung approved the exact PR #15 head
  `b77fcdbeb0a15948a0dd529ea1c4ef739483dccb`; PR #15 merged to `main` as
  `e732983d1b44d282907d85b6d0ea4132984cc3bb`. Issue #14 then moved to
  `status:merged` and closed.

### U1.6 Approve and publish compatibility contract 1.0.0

- **Owner:** all three
- **Branch:** `contracts/u1-6-compatibility-freeze`
- **Contract queue issue:** #17
- **Dependency:** U1.2, U1.3, U1.4, U1.5
- **Status:** DONE
- **Scope:** verify vocabulary, DTOs, outcomes, environment registry, versions,
  package interfaces, fixtures, invalid cases, and ownership handoffs as one
  compatible system.
- **Acceptance:** all three approve the exact final HEAD; selected contract and
  package versions are `1.0.0`; `pnpm verify` passes; the freeze is merged to
  `main`; only then may U2 feature branches begin.
- **Completion evidence:** Issue #17 received all-owner direction approval
  against `main` at `e6307d3f2b7bb59680575a5cbb9c99862b8642be`. YTW and
  Juhyung approved exact PR #18 HEAD
  `fe57602e0ded09c0899c5babf18d64e6d8d6e03e`; PR #18 merged to `main` as
  `e01a67306e319f9aec4b050477eacfbca99ffb31`. Issue #17 then moved to
  `status:merged` and closed.

## Milestone U2 - Parallel greenfield foundations

U2 starts only after U1.6 is `DONE`. U2.1, U2.2, U2.3, and U2.4 then run in
parallel against the frozen interfaces and deterministic fakes.

U2 Core Integration is complete. U2.1 through U2.5 are merged into `main` and
marked `DONE`.

### U2.1 Data and pipeline foundation

- **Owner:** Youn
- **Branch:** `data/pipeline-foundation`
- **Dependency:** U1.6
- **Status:** DONE
- **Scope:** application service interfaces, canonical validator, deterministic
  merge-policy skeleton, fake repositories, transaction boundary.
- **No:** Neon migration or connection, live database, provider call, UI.
- **Acceptance:** network-free tests prove source precedence, unknown handling,
  rollback semantics through fakes, and stable public errors.
- **Evidence:** frozen `1.0.0` ports, schemas, publication guard,
  outcomes, and errors are consumed without a contracts-package change;
  `pnpm validate:u2-data-pipeline` covers canonical binding, precedence,
  conflict rejection, branch/source isolation, unknown preservation,
  eligible-only publication, transaction commit, and rollback.
- **Completion evidence:** PR #25 feature HEAD
  `7453b7f99f701c482ada7e4b7897fad71fa4306f` merged to `main` as
  `47c6a61e0a38397c5bc881e38872764e978013ed`.

### U2.2 Source acquisition foundation

- **Owner:** YTW
- **Branch:** `sources/acquisition-foundation`
- **Dependency:** U1.6
- **Status:** DONE
- **Scope:** uploaded-menu adapter and interface-only adapters for official web,
  PDF, ordering page, and Web Search discovery; source classification and
  normalized `MenuSourceInput`.
- **Evidence:** foundation adapters and coordinator live in
  `packages/source-acquisition`; deterministic network-free fixtures cover
  supported, unsupported, duplicate, conflict, timeout, unsafe, and no-source
  behavior. Real retrieval and provider adapters remain in S1.2/S1.3.
- **Completion evidence:** PR #22 feature HEAD
  `33ab501809652f85f2147f5a2652e2d8a495700f` merged to `main` as
  `1c89c121d0cd819889dc7b7c4bbd70f75eccaf0d`.
- **No:** unrestricted crawling, provider call in tests, source-body logging,
  canonical persistence.
- **Acceptance:** deterministic fixtures cover supported, unsupported,
  duplicate, conflicting, timeout, and no-source cases.

### U2.3 Restaurant-resolution foundation

- **Owner:** YTW
- **Branch:** `restaurant/resolution-foundation`
- **Dependency:** U1.6
- **Status:** DONE
- **Scope:** server-side intake contract, restaurant candidate and confirmation
  service, fake Google Places adapter, confirmation evidence, and UI-safe
  candidate/progress/action/outcome data.
- **No:** browser provider call, real Places call in tests, restaurant
  auto-confirmation, persistent image storage, canonical menu claims, or fake
  success.
- **Acceptance:** deterministic fixtures cover candidate, confirmed,
  conflicting, rejected, location-unavailable, and menu-only fallback cases;
  no UI-safe DTO contains provider internals or unvalidated menu meaning.
- **Evidence:** frozen-port resolution, confirmation evidence, strict fake
  Places normalization, typed outcomes, and network-free fixtures are ready in
  `packages/restaurant-resolution`. Proposed Issue #21 raw-intake and progress
  shapes were not consumed.
- **Completion evidence:** PR #23 feature HEAD
  `7de54ac08fbfb4f0e56f8cb5cf0cfdf02af4a454` merged to `main` as
  `0f47531a837ef6854e8831a570966b09dd207d81`.

### U2.4 Web and result-experience foundation

- **Owner:** Juhyung
- **Branch:** `ui/result-experience-foundation`
- **Dependency:** U1.6
- **Status:** DONE
- **Scope:** mobile shell, photo/link input, upload review, restaurant
  candidate and confirmation presentation, progress and retry states, plus
  result screens driven by frozen fake application view models.
- **No:** direct Google/OpenAI call from the browser, provider DTO, database
  row, unvalidated menu claim, or fake capability claim.
- **Acceptance:** accessible deterministic flows cover input, user
  confirmation, official-source progress, fallback progress, safe errors,
  source/general/unknown presentation, input preservation, and no horizontal
  overflow.
- **Current slice:** framework-neutral local input preservation, frozen-contract
  presentation projections, evidence/unknown labeling, safe outcome/error
  handling, accessibility requirements, and deterministic fake-port tests are
  implemented on `ui/result-experience-foundation`.
- **Current blockers:** Issue #21 exact contract PR #30 is merged to `main`;
  its reviewed `web-experience/0.1.0` baseline is available to dependent feature
  code. Issue #20 exact platform PR #31 is merged to `main`; its reviewed
  Next.js/React platform baseline is available to dependent feature code.
  Remaining S1 implementation dependencies are tracked in the S1 tasks below.
- **Completion evidence:** PR #24 feature HEAD
  `65223f0b97ce3f4d58a1eb042d0ec390e6c5a82b` merged to `main` as
  `952b357fba526068a11597f490eea61fcccbba58`.

### U2.5 Continuous integration

- **Owner:** Youn
- **Branch:** `ci/u2-validation-foundation`
- **Dependency:** U1.6
- **Status:** DONE
- **Scope:** lockfile install, lint, typecheck, unit/integration tests, build,
  secret-pattern validation, and repository review-enforcement reevaluation.
- **Acceptance:** required checks run on every PR; provider network is denied in
  tests.
- **Review evidence:** one least-privilege pull-request workflow reuses
  `pnpm verify`; workspace, package-boundary, cycle, duplicate-contract,
  fixture, security, workflow, and network-denial checks are executable.
  Lint and Production build remain explicitly deferred because the repository
  has no approved command for either on the U1.6 baseline.
- **Completion evidence:** PR #26 feature HEAD
  `e0a0ed6fae816e373efbc3afdb09f7ac4b79fc1b` merged to `main` as
  `da66876fa5026db80921f50b50987361f7040fed`.

## Milestone S1 - Submission vertical slice

### S1.1 Restaurant resolution

- **Owner:** YTW
- **Reviewer:** Youn
- **Dependency:** U2.3
- **Status:** READY
- **Scope:** photo/context plus restaurant/map/official-link intake, server-side
  Google Places adapter, bounded candidates, user confirmation,
  evidence-backed status, and official website/source clues.
- **Feature flag:** `FEATURE_RESTAURANT_RESOLUTION`
- **Acceptance:** first candidate is never automatically confirmed; external
  Place ID remains separate from internal ID; supplied links remain provenance;
  safe fallback permits photo-only analysis without inventing restaurant
  confirmation.

### S1.2 Official menu-source acquisition

- **Owner:** YTW
- **Reviewer:** Youn
- **Dependency:** U2.2
- **Status:** REVIEW
- **Scope:** bounded retrieval from the confirmed restaurant's official
  website, menu page, PDF, or ordering page; URL normalization, SSRF defense,
  redirect revalidation, content/type/size limits, provenance, and typed
  no-source outcomes.
- **Acceptance:** Places is used only for restaurant identity and source clues;
  every accepted source produces a validated `MenuSourceInput`; unsafe,
  conflicting, oversized, unsupported, timeout, and missing-source cases fail
  safely without logging content.
- **Review evidence:** one injected bounded retrieval boundary validates every
  DNS answer and redirect hop, requires address-pinned manual-redirect
  transport, enforces invocation timeout and streaming byte limits, validates
  HTML/PDF/text MIME, and keeps bytes plus URL evidence in a request-scoped
  transient store. Network-free validators cover safe retrieval, SSRF,
  redirect, timeout, MIME, size, no-source, provenance, and orchestration.

### S1.3 OpenAI Web Search menu fallback

- **Owner:** YTW
- **Reviewer:** Youn
- **Dependency:** S1.2
- **Status:** BLOCKED
- **Blocked by:** S1.2
- **Feature flag:** `FEATURE_WEB_SEARCH_DISCOVERY`
- **Scope:** bounded OpenAI Web Search only after official acquisition returns
  a typed no-valid-source outcome; cited source discovery, URL/source
  validation, cost and timeout bounds.
- **Acceptance:** a search answer is discovery evidence rather than a canonical
  menu; discovered sources pass the same acquisition contract; automated tests
  make zero OpenAI calls; no valid result returns typed no-source rather than
  fabricated menu content.

### S1.4 Compact menu extraction

- **Owner:** YTW
- **Reviewers:** Youn for canonical/provenance boundary; Juhyung for
  downstream consumption
- **Dependency:** S1.2, S1.3
- **Status:** BLOCKED
- **Blocked by:** S1.2 and S1.3
- **Scope:** one bounded configured menu-extraction request, strict schema,
  page/section/item/price/options/source indexes, compact output from uploaded
  or acquired menu evidence. The exact model value remains a separately frozen
  configuration choice.
- **Acceptance:** invalid, incomplete, timeout, refusal, and oversized cases
  have typed safe outcomes; automated tests make zero OpenAI calls.
- **Submission integration evidence:** the uploaded-image subset now has a
  server-only Responses API adapter behind the existing compact extraction
  port. Its exact structured-output mapping, transient image handling, and safe
  failure behavior are covered by a network-free injected-transport test. The
  branch accepts one to five ordered images and also extracts acquired
  official HTML/PDF or bounded Web Search sources into the same frozen compact
  extraction contract. Full checkpoint status remains gated on review.

### S1.5 Canonical normalization and validation

- **Owner:** Youn
- **Reviewers:** YTW for extraction/provenance input; Juhyung for
  explanation/UI consumption
- **Dependency:** U2.1, S1.4
- **Status:** BLOCKED
- **Blocked by:** U2.1 and S1.4
- **Scope:** provider DTO to canonical DTO, separate sensory axes, ingredient
  basis, source/general separation, semantic issue detection.
- **Acceptance:** provider strings cannot bypass vocabulary; unknown and safety
  rules hold; every source-stated claim has source indexes.
- **Fixture integration evidence:** the provider-independent minimum canonical
  publication pipeline validates source and restaurant bindings, preserves
  extracted menu facts, and persists only after frozen canonical validation.
  It uses the PR #33 public repository for menu-only or atomic confirmed
  publication. The submission integration now composes the uploaded-image S1.4
  adapter through this pipeline without changing a shared contract or schema.

### S1.6 Juhyung menu and dish explanation

- **Owner:** Juhyung
- **Reviewers:** Youn for canonical/safety contracts; YTW for upstream outcome
  compatibility
- **Dependency:** S1.5
- **Status:** BLOCKED
- **Blocked by:** S1.5
- **Scope:** adapt Juhyung's menu/dish explanation implementation to consume
  only validated canonical structure; bounded provider prompt and deterministic
  fallback; multilingual user-facing wording.
- **Acceptance:** explanation adds no new fact, ingredient, safety claim, or
  certainty; separate sensory axes and source/general labels remain visible;
  deterministic fallback always exists; Youn's canonical and evidence rules
  remain authoritative.
- **Submission integration evidence:** an app-private source-bound guidance
  model projects controlled taste, texture, heat, richness, ingredient basis,
  and an ordering tip onto the saved canonical menu. It does not persist new
  claims or bypass the gated canonical claim merge. The ordering copilot sees
  only this confirmed result and may return only item IDs in that menu.

### S1.7 Integrated mobile experience

- **Owner:** Juhyung
- **Reviewers:** Youn, YTW
- **Dependency:** U2.4, S1.1, S1.2, S1.3, S1.5, S1.6
- **Status:** BLOCKED
- **Blocked by:** U2.4, S1.1, S1.2, S1.3, S1.5, and S1.6
- **Scope:** photo and link intake, restaurant confirmation, source-acquisition
  progress/fallback state, overview, category disclosures, Dish Detail,
  source/general labels, safety notice, and retry-safe errors.
- **Acceptance:** one coherent walkthrough exercises the official-source route
  and one exercises the Web Search fallback; no dead control; error recovery
  does not lose selected inputs unless privacy policy requires it.
- **Submission integration evidence:** `submission-team-integration` now has
  upload and link intake, Google Maps/general-link restaurant lookup, UI-safe
  candidate confirmation, official-site-first collection, bounded Web Search
  fallback, canonical validation and atomic publication, grouped results,
  Dish Detail, and a confirmed-menu-only ordering copilot. Fixture and
  state-preview controls are absent. The full checkpoint remains `BLOCKED`
  until required review and real-environment walkthrough evidence are recorded.

## Milestone S2 - Required database persistence and reuse

The owner-authorized one-day MVP persistence implementation runs on
`feat/mvp-persistence` in one Draft PR. DB-1 through DB-5 are checkpoint
commits/gates inside this implementation, not separate PRs. PR #27 is not a
dependency for the core database work: confirmed restaurant resolution uses
approved contract-shaped fixtures until the adapter and database work share a
common `main`.

Checkpoint state:

- **DB-1:** DONE - eleven-table persistence and physical contract;
- **DB-2:** DONE - Drizzle schema, reviewed migration, and static
  parity validation;
- **DB-3:** DONE - exact cache, ownership, bounded waiting, and
  `analysis_only` persistence;
- **DB-4:** DONE - Google Place convergence and atomic eligible
  publication;
- **DB-5:** BLOCKED by explicit owner authorization - Neon Development
  migration and real test-row mutation.

The implementation stops before DB-5. Preview and Production remain outside
this authorization.

### S2.1 Development database contract

- **Owner:** Youn
- **Dependency:** U2.1 and merged PR #31 platform gate
- **Status:** IN PROGRESS
- **Scope:** the approved eleven-table MVP schema needed for exact snapshot
  reuse, menu-only canonical persistence, restaurant convergence, and atomic
  eligible publication. Approved contract-shaped fixtures stand in for the
  unmerged PR #27 adapter.
- **Acceptance:** Neon runtime shape and connection method verified; Drizzle/SQL
  reviewed before execution; pooled least-privilege runtime and direct migrator
  roles separate; no Neon mutation before DB-5; Preview/Production unchanged;
  no Supabase dependency.

### S2.2 Exact cache and ownership

- **Owner:** Youn
- **Dependency:** S2.1
- **Status:** IN PROGRESS
- **Scope:** version-complete key, one owner, bounded duplicate wait,
  owner-only persistence, expired lease recovery.
- **Acceptance:** real Development PostgreSQL concurrency tests produce one
  owner and leave no rows after cleanup.

### S2.3 Restaurant menu cache

- **Owner:** Youn
- **Reviewer:** YTW
- **Dependency:** S2.1 and approved restaurant-resolution fixtures
- **Status:** IN PROGRESS
- **Scope:** confirmed restaurant plus menu scope plus freshness.
- **Acceptance:** no unconfirmed restaurant publishes a shared menu; stale
  versions are retained and never silently overwritten; acquired official and
  Web Search sources retain provenance; this task is required for submission.

## Milestone S3 - Submission hardening

### S3.1 Integrated adversarial validation

- **Owner:** all three
- **Dependency:** S1.7, S2.2, S2.3
- **Status:** BLOCKED
- **Blocked by:** S1.7, S2.2, and S2.3
- **Validate:** malformed images and links, conflicting restaurant candidates,
  unsafe/redirecting/unsupported official sources, official-source miss into
  Web Search fallback, no-source outcome, incomplete extraction, provider
  timeout, duplicate request, database rollback and reuse, source/general
  contradiction, unknown allergy/dietary state, mobile overflow, and
  refresh/navigation.
- **Acceptance:** full network-free suite and Production build pass.

### S3.2 Authorized smoke test

- **Owner:** Youn
- **Dependency:** S3.1
- **Status:** BLOCKED
- **Scope:** one rights-cleared ordinary menu and one dense multi-page menu in
  Preview, including the official-source path and Web Search fallback, with
  explicitly authorized provider calls.
- **Acceptance:** no secret or menu content in logs; observed behavior and cost
  recorded without provider response bodies.

### S3.3 Feature freeze and release review

- **Owner:** all three
- **Dependency:** S3.1, S3.2
- **Status:** BLOCKED
- **Decision:** ship only when every required chain capability is green. Flags
  provide rollback containment but may not hide a missing required submission
  capability.
- **Acceptance:** go/no-go matrix, rollback path, environment names/scopes,
  mobile QA, security, and repository setup are verified.

### S3.4 Submission package

- **Owner:** Youn
- **Contributors:** all three
- **Dependency:** S3.3
- **Status:** BLOCKED
- **Outputs:** judge-ready README, setup steps, sample data if needed, public
  demo URL, under-three-minute video, project description, Codex session ID,
  repository access for required judge accounts.
- **Acceptance:** completed before the internal 17:00 EDT target.

## Post-submission extensions

The required acquisition, explanation, consistency, and database path is
already in S1-S3. The items below extend its breadth after submission.

### P1 Broader source coverage

- additional country-specific ordering providers and document formats;
- broader source ranking and freshness monitoring;
- no unrestricted general web crawl.

### P2 Advanced restaurant menu lifecycle

- confirmed branch identity;
- menu scope, collection time, expiry, active/stale/superseded lifecycle;
- scheduled freshness checks and supersession tooling.

### P3 Advanced Dish knowledge model

- Dish concepts, aliases, many-to-many menu-item matches;
- reviewed, versioned, provenance-bearing culinary claims;
- typical value, min/max range, prevalence, variability, confidence, basis,
  review state, and profile version;
- no unrestricted EAV or unverifiable polymorphic claim targets.

### P4 Expanded menu-specific claims and merge policy

- source-stated and inferred restaurant-specific claims;
- type-safe evidence links;
- baseline fills only missing context;
- contradiction, unknown, allergy, and dietary safety tests.

### P5 Explanation versioning

- renderer version separate from structure version;
- regenerate wording without reanalyzing unchanged structured facts;
- validation and deterministic fallback.

### P6 Broader three-layer reuse

- exact analysis cache;
- restaurant menu cache;
- Dish knowledge reuse;
- separate invalidation and freshness rules for each layer.

### P7 Ongoing rollout hardening

- Development migration and real PostgreSQL validation;
- Preview migration and live QA;
- rollback rehearsal;
- Production go/no-go;
- monitored staged enablement.

## Immediate next action

Production reanalysis incident repair is active on
`fix/reanalysis-restaurant-linking-performance` from `origin/main`
`dda19ad88d7eed465e9e2ba736aabf11fe5fc6ce`. The repair separates raw-image
extraction identity, request-local restaurant resolution, and stable
Google-Place publication identity; moves exact-cache reuse before image/OpenAI
work; preserves an earlier `analysis_only` row when publishing a linked
successor; adds a bounded EXIF-corrected provider derivative; improves
full-image restaurant clue extraction; and isolates stale browser/Safari
state. It changes no shared DTO, public error, schema, migration, runtime role,
or Production deployment. Preview verification remains required before this
branch may be proposed for integration.

Submission integration is implemented on `submission-team-integration`: the
minimal bilingual landing screen accepts a restaurant/menu link or one to five
menu photos. Both routes converge on explicit Google Places branch
confirmation before official-site-first or uploaded-menu analysis, canonical
validation, and atomic publication. The result includes grouped menu items,
Dish Detail, evidence-labelled source-bound guidance, and a confirmed-menu-only
ordering copilot. The selected language remains preserved across review,
confirmation, errors, results, details, and assistant responses. No shared
contract, database schema, or migration was added.

Final integration audit continues on
`feat/acquisition-detail-assistant-integration`. Focused network-free coverage
now fixes one- and five-image acceptance, six-image rejection, bounded Google
Maps short-link redirects, localhost/private-address rejection, non-automatic
general-link candidates, official-source failure into Web Search fallback,
zero persistence before confirmation, image-only continuation when no
restaurant candidate exists, evidence-basis separation in Dish Detail,
assistant strict-schema compatibility, duplicate and malformed response
rejection, allergen-safety refusal, unsupported restaurant-recipe claim
normalization, and provider-ID/secret non-exposure. The
menu-only continuation persists an `analysis_only` canonical record without
restaurant publication rows. No Preview or Production migration is authorized
by this audit.

U2 Core Integration is complete. The Issue #21 contract action on
`contracts/issue-21-web-experience` is complete: PR #30 exact HEAD
`913458fcb2497bf424c3a330826e131101fcfc34` merged to canonical `main` as
`c04305e421657863d3c0c06fdfe3f90192a1593f`; Issue #21 then moved to
`status:merged` and closed. The approved `web-experience/0.1.0` candidate is
available to dependent feature code.

PR #28's docs-only S1.6 policy approval remains merged in canonical `main` at
`142330f5b0cb7b10f820614cd76a8d01a2643ffa`. It does not authorize UI code or
production explanation-renderer integration before the remaining contract and
canonical-fixture gates complete.

Issue #20 and PR #31 are merged. The current canonical `main` is
`045b42b0da419e96366488380e5a953f28c11b06`, containing approved exact PR #31
HEAD `9ef6b510c1ad8ab4465b59044913723ff11d8742`. The active Youn-owned action is
the one-Draft-PR DB-1 through DB-4 MVP persistence implementation on
`feat/mvp-persistence`; DB-5 Neon Development mutation remains explicitly
gated.
