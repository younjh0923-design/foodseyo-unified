# Foodseyo unified task master

## How to use this file

This is the execution source of truth. Every branch, Codex task, PR, and handoff
names exactly one task ID. A task is complete only when its acceptance criteria
pass and its status is updated here.

Status values:

- `READY`: dependencies are complete;
- `IN PROGRESS`: one owner is actively working;
- `REVIEW`: implementation is complete and checks are green;
- `BLOCKED`: a named dependency or account-holder action is required;
- `DONE`: merged into `main`;
- `DEFERRED`: outside the submission cut and never used for a required flow
  capability.

## Non-negotiable program rules

- No implementation before U1 shared contracts are approved.
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
- **Status:** REVIEW
- **Outputs:** `@foodseyo/contracts` vocabulary, environment names, version
  tokens, validation script.
- **Acceptance:** typecheck and contract validation pass; sensory axes and
  evidence precedence remain separate.

## Milestone U1 - Freeze the team compatibility contract

All U1 tasks land in one contract PR before feature branches begin.

### U1.1 Approve product and evidence invariants

- **Owner:** all three
- **Dependency:** U0.2
- **Status:** READY
- **Decide:** restaurant/menu/Dish boundaries, evidence precedence, unknown
  semantics, source/general labeling, raw-image retention.
- **Acceptance:** all three approve `PRODUCT_FLOW.md`; unresolved items are
  explicitly marked rather than inferred.

### U1.2 Freeze shared vocabulary

- **Owner:** Youn
- **Reviewers:** all three
- **Dependency:** U1.1
- **Status:** READY
- **Decide:** allowed sensory values, ingredient roles, restaurant states,
  menu scopes, menu lifecycle, Dish match states, knowledge review states.
- **Acceptance:** no ambiguous `taste` field; heat/richness cannot mix; contract
  tests pass; selected version becomes `1.0.0`.

### U1.3 Freeze boundary DTOs

- **Owner:** Youn
- **Inputs:** Juhyung source needs, YTW UI needs
- **Dependency:** U1.2
- **Status:** READY
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

### U1.4 Freeze environment and feature-flag registry

- **Owner:** Youn
- **Reviewers:** all three
- **Dependency:** U1.1
- **Status:** READY
- **Acceptance:** every variable has owner, secret classification, runtime
  scope, Development/Preview/Production policy, and no printed value.
  Migration credentials remain outside application runtime;
  `TECH_STACK.md`, environment examples, and TypeScript environment names agree;
  no Supabase or legacy model alias is approved.

### U1.5 Freeze module interfaces

- **Owner:** all three
- **Dependency:** U1.3
- **Status:** READY
- **Acceptance:** each package publishes an interface and fake adapter; no
  feature package imports another package's internals.

## Milestone U2 - Parallel greenfield foundations

U2 starts only after U1 is merged. U2.1, U2.2, and U2.3 run in parallel.

### U2.1 Data and pipeline foundation

- **Owner:** Youn
- **Branch:** `data/pipeline-foundation`
- **Dependency:** U1
- **Status:** BLOCKED
- **Scope:** application service interfaces, canonical validator, deterministic
  merge-policy skeleton, fake repositories, transaction boundary.
- **No:** Neon migration or connection, live database, provider call, UI.
- **Acceptance:** network-free tests prove source precedence, unknown handling,
  rollback semantics through fakes, and stable public errors.

### U2.2 Source acquisition foundation

- **Owner:** Juhyung
- **Branch:** `sources/acquisition-foundation`
- **Dependency:** U1
- **Status:** BLOCKED
- **Scope:** uploaded-menu adapter and interface-only adapters for official web,
  PDF, ordering page, and Web Search discovery; source classification and
  normalized `MenuSourceInput`.
- **No:** unrestricted crawling, provider call in tests, source-body logging,
  canonical persistence.
- **Acceptance:** deterministic fixtures cover supported, unsupported,
  duplicate, conflicting, timeout, and no-source cases.

### U2.3 Restaurant and web foundation

- **Owner:** YTW
- **Branch:** `restaurant/web-foundation`
- **Dependency:** U1
- **Status:** BLOCKED
- **Scope:** mobile shell, upload/review UI, restaurant candidate/confirmation
  UI, fake Google Places adapter, result source/general separation.
- **No:** real Places call in tests, restaurant auto-confirmation, persistent
  image storage, fake success claims.
- **Acceptance:** accessible mobile flow works end-to-end with deterministic
  fixtures and no horizontal overflow.

### U2.4 Continuous integration

- **Owner:** Youn
- **Dependency:** U1
- **Status:** READY after U1
- **Scope:** lockfile install, lint, typecheck, unit/integration tests, build,
  secret-pattern validation.
- **Acceptance:** required checks run on every PR; provider network is denied in
  tests.

## Milestone S1 - Submission vertical slice

### S1.1 Restaurant resolution

- **Owner:** YTW
- **Reviewer:** Youn
- **Dependency:** U2.3
- **Scope:** photo/context plus restaurant/map/official-link intake, server-side
  Google Places adapter, bounded candidates, user confirmation,
  evidence-backed status, and official website/source clues.
- **Feature flag:** `FEATURE_RESTAURANT_RESOLUTION`
- **Acceptance:** first candidate is never automatically confirmed; external
  Place ID remains separate from internal ID; supplied links remain provenance;
  safe fallback permits photo-only analysis without inventing restaurant
  confirmation.

### S1.2 Official menu-source acquisition

- **Owner:** Juhyung
- **Reviewer:** Youn
- **Dependency:** U2.2
- **Scope:** bounded retrieval from the confirmed restaurant's official
  website, menu page, PDF, or ordering page; URL normalization, SSRF defense,
  redirect revalidation, content/type/size limits, provenance, and typed
  no-source outcomes.
- **Acceptance:** Places is used only for restaurant identity and source clues;
  every accepted source produces a validated `MenuSourceInput`; unsafe,
  conflicting, oversized, unsupported, timeout, and missing-source cases fail
  safely without logging content.

### S1.3 OpenAI Web Search menu fallback

- **Owner:** Juhyung
- **Reviewer:** Youn
- **Dependency:** S1.2
- **Feature flag:** `FEATURE_WEB_SEARCH_DISCOVERY`
- **Scope:** bounded OpenAI Web Search only after official acquisition returns
  a typed no-valid-source outcome; cited source discovery, URL/source
  validation, cost and timeout bounds.
- **Acceptance:** a search answer is discovery evidence rather than a canonical
  menu; discovered sources pass the same acquisition contract; automated tests
  make zero OpenAI calls; no valid result returns typed no-source rather than
  fabricated menu content.

### S1.4 Compact menu extraction

- **Owner:** Juhyung
- **Reviewer:** Youn
- **Dependency:** S1.2, S1.3
- **Scope:** one bounded GPT-5.6 extraction request, strict schema, page/section/
  item/price/options/source indexes, compact output from uploaded or acquired
  menu evidence.
- **Acceptance:** invalid, incomplete, timeout, refusal, and oversized cases
  have typed safe outcomes; automated tests make zero OpenAI calls.

### S1.5 Canonical normalization and validation

- **Owner:** Youn
- **Reviewer:** Juhyung
- **Dependency:** U2.1, S1.4
- **Scope:** provider DTO to canonical DTO, separate sensory axes, ingredient
  basis, source/general separation, semantic issue detection.
- **Acceptance:** provider strings cannot bypass vocabulary; unknown and safety
  rules hold; every source-stated claim has source indexes.

### S1.6 Juhyung menu and dish explanation

- **Owner:** Juhyung
- **Reviewers:** Youn for canonical/safety contracts; YTW for presentation
- **Dependency:** S1.5
- **Scope:** adapt Juhyung's menu/dish explanation implementation to consume
  only validated canonical structure; bounded provider prompt and deterministic
  fallback; multilingual user-facing wording.
- **Acceptance:** explanation adds no new fact, ingredient, safety claim, or
  certainty; separate sensory axes and source/general labels remain visible;
  deterministic fallback always exists; Youn's canonical and evidence rules
  remain authoritative.

### S1.7 Integrated mobile experience

- **Owner:** YTW
- **Reviewers:** Youn, Juhyung
- **Dependency:** S1.1, S1.2, S1.3, S1.5, S1.6
- **Scope:** photo and link intake, restaurant confirmation, source-acquisition
  progress/fallback state, overview, category disclosures, Dish Detail,
  source/general labels, safety notice, and retry-safe errors.
- **Acceptance:** one coherent walkthrough exercises the official-source route
  and one exercises the Web Search fallback; no dead control; error recovery
  does not lose selected inputs unless privacy policy requires it.

## Milestone S2 - Required database persistence and reuse

### S2.1 Development database contract

- **Owner:** Youn
- **Dependency:** S1.5
- **Status:** BLOCKED by S1.5
- **Scope:** smallest Development schema needed for exact snapshot reuse and
  atomic structured menu persistence on an isolated Neon Development branch,
  using the Youn data contracts as the integration source of truth.
- **Acceptance:** Neon runtime shape and connection method verified; Drizzle/SQL
  reviewed before execution; pooled least-privilege runtime and direct migrator
  roles separate; Preview/Production unchanged; no Supabase dependency.

### S2.2 Exact cache and ownership

- **Owner:** Youn
- **Dependency:** S2.1
- **Status:** BLOCKED by S2.1
- **Scope:** version-complete key, one owner, bounded duplicate wait,
  owner-only persistence, expired lease recovery.
- **Acceptance:** real Development PostgreSQL concurrency tests produce one
  owner and leave no rows after cleanup.

### S2.3 Restaurant menu cache

- **Owner:** Youn
- **Reviewer:** YTW
- **Dependency:** S2.1, S1.1
- **Status:** BLOCKED by S2.1 and S1.1
- **Scope:** confirmed restaurant plus menu scope plus freshness.
- **Acceptance:** no unconfirmed restaurant publishes a shared menu; stale
  versions are retained and never silently overwritten; acquired official and
  Web Search sources retain provenance; this task is required for submission.

## Milestone S3 - Submission hardening

### S3.1 Integrated adversarial validation

- **Owner:** all three
- **Dependency:** S1.7, S2.3
- **Status:** BLOCKED
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

The next PR is **U1 - Freeze the team compatibility contract**. Do not start U2
feature code until all three owners approve U1 and the selected contract
versions are promoted from `0.1.0` to `1.0.0`.
