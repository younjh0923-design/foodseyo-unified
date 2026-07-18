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
- **Ownership:** YTW owns Places resolution and the mobile experience; Juhyung
  owns source acquisition, Web Search, provider adapters, and menu/dish
  explanation; Youn owns contracts, normalization, merge/safety validation,
  database, integration, and release gates.
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
- **Status:** Proposed - pending all-owner review
- **Date:** 2026-07-18

## U-007 - Manual PR enforcement on the current private plan

- **Decision:** Use short-lived branches and recorded pull-request reviews as
  the enforcement mechanism while branch protection is unavailable for the
  private repository on the current plan.
- **Reason:** `CODEOWNERS` is present, but the current GitHub plan does not
  expose branch protection for this private repository.
- **Impact:** No feature or contract change is pushed directly to `main`.
  Feature PRs require a non-author owner review; shared-contract PRs require all
  three owner approvals. U2.4 revisits automated checks and protection when
  supported. This decision does not authorize billing or repository-visibility
  changes.
- **Status:** Proposed - pending all-owner review
- **Date:** 2026-07-18
