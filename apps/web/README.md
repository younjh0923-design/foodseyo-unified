# `apps/web`

Owner: `juhyungbaek0621`

Mobile-first Foodseyo application. Juhyung owns photo/link input, upload
review, restaurant candidate and confirmation presentation, progress and
fallback states, constrained explanation presentation, results, retry, input
preservation, accessibility, and navigation.

It consumes `@foodseyo/contracts` plus approved application services and view
models. It must not call Google/OpenAI providers directly, import database rows
or provider DTOs, or present unvalidated extraction as final analysis.

Implementation starts only after U1.6.
