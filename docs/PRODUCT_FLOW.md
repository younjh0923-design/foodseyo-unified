# Foodseyo product flow

## Product definition

Foodseyo is not a restaurant search or ranking service. It helps a person who
has already encountered an unfamiliar restaurant or menu understand the food
and make an ordering decision.

The agreed target flow is:

```text
menu/sign photos plus a restaurant, map, or official-source link
-> restaurant candidate resolution
-> user or evidence-backed restaurant confirmation
-> Google Places details and official-source discovery
-> official website, PDF, or ordering-page menu acquisition
-> bounded OpenAI Web Search fallback when official acquisition fails
-> YTW-owned compact menu extraction
-> menu-item-to-dish candidate matching
-> reviewed dish baseline lookup
-> restaurant-specific claim extraction
-> evidence-priority merge
-> structured validation
-> Juhyung-owned constrained explanation rendering
-> atomic persistence and publication
-> reuse at the exact-analysis, restaurant-menu, and dish-knowledge layers
```

## Four distinct concepts

1. **Restaurant** is a real branch or location. Google Place ID is an external
   identifier; internal relations use a Foodseyo UUID.
2. **Restaurant menu version** is the menu used by one restaurant for one scope
   and time period. New menus supersede old versions instead of overwriting
   them.
3. **Menu item** is what a particular restaurant actually sells, including its
   source text, price, options, and restaurant-specific claims.
4. **Dish** is a reusable culinary concept shared by menu items across
   restaurants. It must never absorb restaurant-specific prices, recipes,
   portions, availability, or safety claims.

## Submission Dish boundary

The submission requires a minimum typed Dish boundary so extraction,
canonical validation, explanation, and presentation agree on Dish candidates,
match state, reviewed general guidance, and `unknown`. U1 must freeze the
minimum `DishCandidate` and `EffectiveDishProfile` fields before dependent
implementation starts.

This minimum boundary does not imply that the advanced Dish knowledge system is
already implemented or required in full for submission. Alias graphs, broad
cross-restaurant knowledge accumulation, claim-authoring workflows, and the
complete versioned review lifecycle remain post-submission P3 work. Until U1
freezes the minimum boundary, no implementation may assume that a reviewed
baseline exists. A missing reviewed baseline remains `unknown`.

## Evidence acquisition

The submission intake supports one or more menu, sign, or restaurant-context
photos and a restaurant, map, or official-source link. Photo-only analysis
remains a safe fallback when a useful link or confirmed restaurant cannot be
obtained; the application must never invent confirmation to continue.

Accepted evidence may include menu photos, signs, Google Maps screenshots,
restaurant web screenshots, Google Maps or restaurant links, official web
pages, PDFs, ordering pages, and sources discovered by OpenAI Web Search.

All acquisition paths normalize into one `MenuSourceInput` contract. Discovery
is not proof: a URL or search answer becomes usable only after the source,
content, collection time, and source classification pass validation.

Google Places helps identify the actual restaurant branch and discover official
sources such as the restaurant website. It is not treated as a full menu-item
API. The top candidate or search result is never automatically treated as
confirmed. Confirmation states remain explicit.

YTW owns the upstream server-side intake, restaurant resolution, official
source acquisition, Web Search fallback, and compact extraction behavior.
Juhyung owns the browser input experience, but the browser calls an approved
application boundary rather than calling Google or OpenAI providers directly.

The required menu-source sequence is:

1. resolve and, when possible, confirm the restaurant branch with Google
   Places;
2. attempt bounded retrieval from the confirmed restaurant's official website,
   PDF, or ordering page;
3. when no valid official menu can be acquired, use bounded OpenAI Web Search
   to discover menu evidence;
4. validate every discovered URL and source through the same SSRF, provenance,
   freshness, size, and content rules before extraction;
5. if neither route yields valid evidence, return a typed no-source outcome
   rather than fabricated menu data.

## Food knowledge and precedence

The system preserves independent sensory axes:

- basic tastes: sweet, salty, sour, bitter, and umami;
- controlled flavor notes;
- controlled textures;
- ordered pungent heat;
- ordered perceived richness.

The exact controlled values, aliases, definitions, and scale semantics live in
`SENSORY_VOCABULARY.md` and `@foodseyo/contracts`. Heat is a chemesthetic
burning or pungent sensation rather than a basic taste. Richness is a derived
user-facing perception summary, not a basic taste. `unknown` is a state outside
both ordered scales, and heat adjustability is separate from the observed or
typical heat level.

Dish knowledge is a variable culinary baseline, not a universal fact about
every preparation. Current menu evidence wins:

```text
source_stated
> inferred_from_source
> culinary_baseline
> unknown
```

Baseline information only fills missing context and is labeled as general.
Contradictory source evidence overrides it. `unknown` never means absent,
false, allergen-safe, or dietary-safe.

## Provider boundary

The provider may extract, classify, propose dish candidates, and render natural
language from already validated structure. It does not own:

- canonical identifiers;
- evidence precedence;
- restaurant confirmation;
- cache identity;
- safety decisions;
- database publication;
- final contract validation.

Large menus use YTW-owned compact extraction before enrichment. The application
validates provider output before persistence. Explanations may state only
information present in the validated structure. Invalid explanations fall back
to a bounded retry or deterministic renderer.

YTW may provide Juhyung with UI-safe restaurant candidates, progress states,
confirmation requests, and typed outcomes while upstream work continues. Raw
provider output, extracted menu meaning, source bodies, and unvalidated claims
do not use that direct lane.

Youn owns the canonical structure, culinary vocabulary, separate sensory axes,
evidence merge policy, semantic validation, database publication, and release
gate. Juhyung owns constrained menu/dish explanation and the mobile-first
experience that consumes validated application data. An explanation or UI
implementation may not override canonical contracts or add unsupported facts.

## Persistence and reuse

Persistence is atomic. Partial menu structures are never published. Publication
requires confirmed restaurant scope, preserved source evidence, valid menu
structure, completed analysis, and an explicit menu scope.

The target has three distinct reuse layers:

1. **Exact analysis cache:** same source and analysis contract.
2. **Restaurant menu cache:** same confirmed restaurant, menu scope, and fresh
   active menu version.
3. **Dish knowledge reuse:** different restaurant menu items may share only
   reviewed general dish knowledge.

## Submission commitment

The Build Week submission is not complete until the following coherent path is
green:

1. photo and link intake;
2. YTW-owned Google Places restaurant candidates and explicit branch
   confirmation;
3. YTW-owned bounded official website, PDF, or ordering-page menu acquisition;
4. YTW-owned bounded OpenAI Web Search fallback when official acquisition
   fails;
5. YTW-owned compact extraction and Youn-owned canonical source-specific
   structure;
6. separate taste, flavor, texture, heat, richness, and ingredient semantics;
7. evidence-priority merge and explicit unknown/safety handling;
8. Juhyung-owned, canonically constrained menu and dish explanations;
9. Youn-owned atomic database persistence and safe reuse;
10. one coherent Juhyung-owned mobile ordering-decision experience;
11. Development, Preview, and Production validation through explicit release
    gates.

The team may reduce source breadth, visual polish, or advanced Dish-knowledge
coverage to protect the deadline. It may not defer the official-source attempt,
Web Search fallback, explanation boundary, canonical consistency, or database
integration beyond submission. A required route that is not green is a release
blocker, not a silently disabled optional feature.
