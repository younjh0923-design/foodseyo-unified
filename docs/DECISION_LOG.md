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
- **Status:** Accepted
- **Date:** 2026-07-18
