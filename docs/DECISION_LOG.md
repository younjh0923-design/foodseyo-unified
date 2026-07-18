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
  Juhyung-owned menu/dish explanation, Youn-owned canonical culinary
  consistency, and Youn-owned database persistence and reuse.
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
