# U2.4 web foundation

## Implemented in this slice

This slice provides only framework-neutral, network-free foundations:

- a browser-local photo/link draft that preserves user input across every
  prepared screen model and never stores filenames, bytes, Base64, provider
  references, or credentials;
- upload review controls with generated photo labels;
- restaurant-candidate projection from the frozen `RestaurantResolution`
  schema, excluding Google/provider identifiers from the presentation model;
- safe normal-outcome and public-error presentation with retry and menu-only
  continuation kept separate;
- Overview and Dish Detail data projected only from a runtime-validated
  `CanonicalMenuAnalysis`;
- distinct user labels for `source_stated`, `inferred_from_source`,
  `culinary_baseline`, and `unknown`;
- unresolved Dish matching that leaves the menu item visible instead of
  failing the entire result;
- app-private accessibility requirements for 320px narrow screens, 44px
  targets, visible focus, native keyboard activation, text-labeled image input,
  status announcements, and no horizontal overflow;
- deterministic tests driven by the frozen shared fixtures and
  `FakeAnalysisWorkflowPort`.

The app-private models in `src/foundation.ts` are presentation projections.
They are not shared DTOs, transport contracts, provider DTOs, canonical data,
database rows, or cache shapes.

## Platform and integration status

Issue #20 / PR #31 merged the exact Next.js App Router `16.2.10`, React
`19.2.7`, and React DOM `19.2.7` platform boundary. Rendered components and
routes may now use that approved boundary.

The frozen U1 registry does not contain the initial sensitive browser-to-server
photo/link intake request or UI-safe official-source/Web Search progress event.
Those boundaries are now available through the separately versioned, merged
Issue #21 `@foodseyo/contracts/web-experience` entry point. This completed
foundation slice did not invent or implement a local progress enum, request DTO,
or fake success state.

Restaurant matching remains fixture-driven until PR #27 merges. The UI may
render frozen `RestaurantResolution` projections, but it must not import PR #27
internals, claim server confirmation, or call Google, OpenAI, a database, or a
server-only package from the browser. Browser visual QA covers the local states;
actual adapter integration and end-to-end confirmation are deferred.

## Trust boundary

- Direct upstream UI data remains limited to frozen UI-safe operational values.
- Final menu meaning is accepted only after `CanonicalMenuAnalysisSchema`
  validation.
- Arbitrary explanation text is not copied into the foundation result model;
  the canonical structure supplies all displayed menu meaning until S1.6.
- General culinary guidance is labeled as general and never presented as a
  current restaurant fact.
- `unknown` is displayed as “Not confirmed” and never as absent, false,
  allergen-safe, or dietary-safe.
- No provider, database, migration, Preview, Production, or deployment work is
  part of this slice.
