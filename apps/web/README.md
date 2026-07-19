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

Rendered framework components remain blocked by platform proposal Issue #20.
Server-bound photo/link intake and UI-safe official-source/Web Search progress
remain blocked by boundary proposal Issue #21. Neither proposed shape is used
before its contract PR is approved and merged.
