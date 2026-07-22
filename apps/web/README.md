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
to five transient menu images, calls server-only analysis, renders UI-safe restaurant
candidates, requires an explicit user selection, and calls the server confirm
and atomic publication path. Browser modules never import provider or database
packages. The former fixture banner, state-preview toolbar, hard-coded
candidates, and browser-only confirmation simulation were removed. See
`FOUNDATION_REQUIREMENTS.md`.

The root route presents a minimal photo-entry landing screen with a compact
English/한국어 switch in the top-right corner. Activating the photo card opens
the device's native camera/library/file chooser. After photos are selected,
the user reviews them and may add a restaurant name before starting the
analysis request. The same landing screen also includes a restaurant or menu
link field that sends validated HTTP/HTTPS links to the server. Google Maps
links use their embedded place reference or query; general links use bounded
OpenAI Web Search evidence before the existing Google Places confirmation
boundary. After confirmation, the server tries the confirmed Place's official
site first and only then the bounded Web Search menu-source fallback. The
dedicated Web Search model is preferred when configured; Preview may reuse the
approved menu-extraction model without introducing a legacy environment name.
If an uploaded menu yields no restaurant candidate, the user may continue with
an `analysis_only` menu result. That path persists only the canonical analysis
and does not create restaurant, external-reference, menu-version, or
publication-receipt rows. Link acquisition still requires an explicitly
confirmed restaurant because official-site collection is branch-bound. The
selected language is carried through the
analysis request and encrypted continuation token
so upload, restaurant confirmation, errors, and saved-result UI remain in the
selected language. Restaurant names, addresses, and menu content remain
source-honest and are not translated. This is an app-private presentation
setting; shared contracts and the database schema are unchanged.

The App Router handlers are the only browser-to-server composition boundary:
`POST /api/analyze/menu-images`, `POST /api/analyze/restaurant-link`,
`POST /api/restaurant/confirm`, and `POST /api/assistant`. They return
only frozen public errors and approved view models; raw image bytes and private
Google identifiers are never returned by the restaurant screen. Confirmed
results group menu items, open an app-private Dish Detail sheet, show
source-bound guidance with evidence labels, and offer an ordering copilot
constrained to the exact confirmed menu.
Safety-related assistant output is guarded after provider validation: an
allergen/dietary guarantee is replaced by the canonical ask-the-restaurant
caveat and cannot carry suggested menu IDs.

Server-bound photo/link intake and UI-safe official-source/Web Search progress
are defined by `@foodseyo/contracts/web-experience`. Issue #21's exact PR #30
merged to `main`, so this boundary is available to dependent feature slices.
The submission integration composes the bounded source-acquisition primitives
without changing a shared DTO or database schema.
