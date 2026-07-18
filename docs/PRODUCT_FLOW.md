# Foodseyo product flow

## Product definition

Foodseyo is not a restaurant search or ranking service. It helps a person who
has already encountered an unfamiliar restaurant or menu understand the food
and make an ordering decision.

The agreed target flow is:

```text
user evidence
-> restaurant candidate resolution
-> user or evidence-backed restaurant confirmation
-> fresh restaurant menu lookup
-> menu source acquisition when needed
-> compact menu extraction
-> menu-item-to-dish candidate matching
-> reviewed dish baseline lookup
-> restaurant-specific claim extraction
-> evidence-priority merge
-> structured validation
-> constrained explanation rendering
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

## Evidence acquisition

Accepted evidence may include menu photos, signs, Google Maps screenshots,
restaurant web screenshots, official web pages, PDFs, ordering pages, and
sources discovered by OpenAI Web Search.

All acquisition paths normalize into one `MenuSourceInput` contract. Discovery
is not proof: a URL or search answer becomes usable only after the source,
content, collection time, and source classification pass validation.

Google Places helps identify the actual restaurant branch and discover official
sources. The top search result is never automatically treated as confirmed.
Confirmation states remain explicit.

## Food knowledge and precedence

The system preserves independent sensory axes:

- basic tastes;
- flavor notes;
- textures;
- heat;
- richness.

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

Large menus use compact extraction before enrichment. The application validates
provider output before persistence. Explanations may state only information
present in the validated structure. Invalid explanations fall back to a
bounded retry or deterministic renderer.

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

## Submission cut

The complete target architecture is larger than the remaining Build Week
window. The submission vertical slice therefore proves the same contracts with
the smallest coherent path:

1. menu-image evidence;
2. restaurant candidates and explicit confirmation when available;
3. compact extraction;
4. source-specific versus general guidance separation;
5. structured taste, texture, heat, richness, and ingredient basis;
6. validated explanation;
7. Development-only persistence if the database gate is green;
8. one coherent mobile experience.

Official-site crawling, PDF acquisition, Web Search fallback, durable restaurant
menu publication, and broad Dish knowledge reuse remain sequenced tasks. They
must not destabilize the working submission slice.
