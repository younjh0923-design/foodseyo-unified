# `apps/web`

Owner: `juhyungbaek0621`

Mobile-first Foodseyo application. Juhyung owns photo/link input, upload
review, restaurant candidate and confirmation presentation, progress and
fallback states, constrained explanation presentation, results, retry, input
preservation, accessibility, and navigation.

It consumes `@foodseyo/contracts` plus approved application services and view
models. It must not call Google/OpenAI providers directly, import database rows
or provider DTOs, or present unvalidated extraction as final analysis.

U1.6 is `DONE`, so U2.4 framework-neutral work has started. The current slice
contains app-private input preservation and presentation projections driven by
frozen runtime-validated DTOs plus deterministic network-free tests. See
`FOUNDATION_REQUIREMENTS.md`.

Issue #20 has all-owner proposal approval. Its contract-only candidate records
Next.js App Router `16.2.10`, React `19.2.7`, and React DOM `19.2.7` as exact
`apps/web` dependencies, but adds no route or rendered component. Dependent
framework implementation remains blocked until the exact contract PR is
approved and merged.

Server-bound photo/link intake and UI-safe official-source/Web Search progress
remain separately gated by Issue #21 and its exact contract PR.
