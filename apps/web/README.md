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
`19.2.7` platform boundary. The submission integration route now accepts one
transient menu image, calls server-only analysis, renders UI-safe restaurant
candidates, requires an explicit user selection, and calls the server confirm
and atomic publication path. Browser modules never import provider or database
packages. The former fixture banner, state-preview toolbar, hard-coded
candidates, and browser-only confirmation simulation were removed. See
`FOUNDATION_REQUIREMENTS.md`.

The two App Router handlers are the only web-to-server composition boundary:
`POST /api/analyze/menu-images` and `POST /api/restaurant/confirm`. They return
only frozen public errors and approved view models; raw image bytes and private
Google identifiers are never returned by the restaurant screen.

Server-bound photo/link intake and UI-safe official-source/Web Search progress
are defined by `@foodseyo/contracts/web-experience`. Issue #21's exact PR #30
merged to `main`, so this boundary is available to the next dependent feature
slice. Official-source and Web Search progress remain separate gated work.
