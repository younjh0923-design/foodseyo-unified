# U2.4 framework-neutral web foundation

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

## Deliberately blocked

Issue #20 has all-owner proposal approval. Its contract-only candidate freezes
Next.js App Router `16.2.10`, React `19.2.7`, and React DOM `19.2.7` as exact
`apps/web` dependencies. No component, route, browser build, or rendered shell
is included until the exact contract PR is approved and merged.

The frozen contracts also lack the initial sensitive browser-to-server
photo/link intake request and an approved UI-safe official-source/Web Search
progress event. Issue #21 proposes those boundaries. This slice does not invent
a local progress enum, request DTO, or fake success state while that proposal is
unmerged.

Because those two contracts are pending, browser visual QA is not yet truthful
or executable. The next UI slice must consume the merged platform and
intake/progress contracts, render these projections, and then perform keyboard,
screen-reader, 320px overflow, and mobile-browser QA.

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
