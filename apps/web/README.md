# `apps/web`

Owner: `juhyungbaek0621`

Mobile-first Foodseyo application. Juhyung owns photo/link input, upload
review, restaurant candidate and confirmation presentation, progress and
fallback states, constrained explanation presentation, results, retry, input
preservation, accessibility, and navigation.

It consumes `@foodseyo/contracts` plus approved application services and view
models. It must not call Google/OpenAI providers directly, import database rows
or provider DTOs, or present unvalidated extraction as final analysis.

U1.6 and the U2.4 framework-neutral foundation are `DONE`. Issue #20 / PR #31
merged the exact Next.js App Router `16.2.10`, React `19.2.7`, and React DOM
`19.2.7` platform boundary. The current slice renders restaurant confirmation
from frozen runtime-validated DTOs and local fixtures. See
`FOUNDATION_REQUIREMENTS.md`.

The route remains fixture-driven until PR #27 merges. It does not call Google,
OpenAI, a database, or any server-only package from the browser.

Server-bound photo/link intake and UI-safe official-source/Web Search progress
are defined by `@foodseyo/contracts/web-experience`. Issue #21's exact PR #30
merged to `main`, so this boundary is available to the next dependent feature
slice; this platform-contract PR adds no intake or progress implementation.
