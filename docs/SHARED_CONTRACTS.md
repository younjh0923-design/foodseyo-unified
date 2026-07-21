# Shared contracts and common variables

## Why these come first

Three people can work independently only when shared words mean the same thing.
The first source of truth is `@foodseyo/contracts`. Applications and feature
packages import from it; they do not create local copies.

U1.6 promoted the selected contracts to `1.0.0` and `frozen`. PR #18 received
all-owner approval at exact HEAD
`fe57602e0ded09c0899c5babf18d64e6d8d6e03e` and merged to `main` as
`e01a67306e319f9aec4b050477eacfbca99ffb31`. U2 feature code may consume these
frozen contracts; later shared changes still require the contract-change
process.

Platform choices are frozen separately in `TECH_STACK.md`. The unified
application uses Vercel with Neon Serverless Postgres. Supabase names, SDKs,
service-role credentials, migrations, Auth, and Storage are not approved
runtime dependencies.

## Contract groups

### Web-experience candidate

`WEB_EXPERIENCE.md` and
`@foodseyo/contracts/web-experience` define the approved-direction Issue #21
candidate at `web-experience/0.1.0`. It adds a sensitive request-only
`SubmissionIntakeRequest` and a UI-safe non-terminal `UiWorkflowProgress`.

The intake supports link-only, photo-only, or combined submissions while
rejecting empty input and keeping correlation exclusively in
`PortInvocationContext`. Progress is limited to official-source lookup or Web
Search fallback at `source_acquisition`, with `in_progress` or phase-local
`complete` only. It cannot carry confirmation, failure, terminal success, raw
input, provider detail, menu meaning, database data, or ORM types.

The candidate extends the UI-safe operational event union additively but does
not reinterpret the frozen restaurant, outcome, error, canonical, publication,
persistence, cache, environment, or provider contracts. It remains unavailable
to feature code until the exact contract PR receives all-owner approval and
merges to `main`.

### Module interfaces

`MODULE_INTERFACES.md` and
`@foodseyo/contracts/module-interfaces` define
`module-interfaces/1.0.0`: provider-neutral ports, the bounded invocation
context, typed results, eligible-publication guard, and deterministic fake
contract around the existing U1.3 DTOs.

Owning feature packages export fake classes through their package roots and
depend only on `@foodseyo/contracts` during U1.5. They do not redefine DTOs,
import another package's internal source, or implement providers, database
access, UI, transport, or deployment. The frozen module-interface contract is
available to U2 feature packages from the completed U1.6 baseline.

### Vocabulary

The shared package and `SENSORY_VOCABULARY.md` freeze:

- `sweet`, `salty`, `sour`, `bitter`, and `umami` as the five canonical basic
  tastes; `savory` and `savoury` are input aliases for `umami`, not canonical
  values;
- basic tastes, controlled flavor notes, controlled textures, ordered heat,
  and ordered richness as five separate axes;
- `known` or `unknown` as the value state outside the heat and richness
  scales;
- heat adjustability separately from observed or typical heat;
- ingredient roles;
- evidence bases and precedence;
- restaurant-resolution states;
- menu source types and menu scopes;
- menu-version and Dish-match states;
- knowledge origin separately from knowledge review state.

Do not add a generic `taste` string, unrestricted claim type, or polymorphic
JSON reference that bypasses type-specific integrity.

Flavor and texture labels are a versioned Foodseyo lexicon informed by sensory
standards, not a claim that Foodseyo performs a certified laboratory sensory
assessment. A descriptor such as `nutty`, `buttery`, `cheesy`, or `creamy`
describes perception and never proves an ingredient, allergen, or dietary
property.

`model_generated` is knowledge origin and never a review state. Knowledge may
be `unreviewed`, `reviewed`, `superseded`, or `retired`. Dish matching uses
`candidate`, `matched`, `rejected`, or `unresolved`; review belongs to the
knowledge claim, not the match.

### Minimum submission Dish contract

U1 freezes a minimum typed Dish boundary for `DishCandidate`,
`MenuItemDishMatch`, typed `MenuItemClaim` and `DishClaim`, and
`EffectiveDishProfile`. `RestaurantMenuVersion` owns menu scope and lifecycle;
`MenuItem` owns restaurant-specific price, description, options, and evidence;
`Dish` remains reusable general culinary meaning. The effective profile must
preserve source-specific menu facts, distinguish reviewed general guidance,
and return `unknown` when no reviewed baseline is available.

The minimum contract is not the complete post-submission Dish knowledge model.
Alias graphs, broad knowledge accumulation, authoring and review workflows, and
the complete versioned claim lifecycle remain P3 scope. The candidate U1.3
fields, runtime schemas, examples, invalid cases, and deferred choices are
defined in `BOUNDARY_DTOS.md`. U2 feature code may consume this frozen contract,
but it must not infer an unapproved baseline source.

### Submission input and acquisition sequence

The shared boundary supports one or more menu/sign/context photos and a
restaurant, map, or official-source link. It preserves whether each input was
user supplied, Places discovered, official-source acquired, or Web Search
discovered.

The submission sequence is contractually ordered:

1. Google Places resolves restaurant candidates and official-source clues;
2. the confirmed official website, PDF, or ordering page is attempted;
3. bounded OpenAI Web Search runs only when official acquisition does not yield
   a valid menu source;
4. both acquisition routes produce the same validated `MenuSourceInput`;
5. no-source, timeout, conflicting-source, unsafe-URL, and invalid-content
   outcomes remain typed and never become fabricated success.

Google Place ID identifies an external restaurant branch. It does not identify
a menu version and Places is not modeled as a full menu-item provider.

### Environment variable names

Environment variables are split by trust boundary.
`ENVIRONMENT_REGISTRY.md` and `ENVIRONMENT_REGISTRY` define the value-free
metadata for every approved name.

**Application runtime**

- `FOODSEYO_RUNTIME_ENV`
- `APP_BASE_URL`
- `DATABASE_URL` - environment-scoped pooled Neon runtime connection
- `OPENAI_API_KEY`
- `OPENAI_MENU_EXTRACTION_MODEL`
- `OPENAI_WEB_SEARCH_MODEL`
- `OPENAI_EXPLANATION_MODEL`
- `GOOGLE_PLACES_API_KEY`
- `FEATURE_RESTAURANT_RESOLUTION`
- `FEATURE_WEB_SEARCH_DISCOVERY`
- `FEATURE_DISH_KNOWLEDGE_REUSE`
- `LOG_LEVEL`

**Operator or dedicated migration CI only**

- `DATABASE_MIGRATION_URL` - direct Neon migrator connection

There are no approved public browser environment variables. A key must not use
the `NEXT_PUBLIC_` prefix. The `DATABASE_MIGRATION_URL` value must never enter
application runtime, Vercel build variables, logs, docs, or test fixtures.

There are no approved `SUPABASE_*` variables or legacy OpenAI model aliases.
Imported code must use the names above rather than adding compatibility
duplicates.

Feature flags are optional operational controls and fail closed. Only the exact
lowercase value `true` enables a feature; missing, malformed, or differently
cased values evaluate to disabled. Network-free tests forbid database and
provider secrets and do not require model values. Exact model values remain
outside U1.4.

### Version variables

Every persisted or cacheable result records the relevant contract versions:

- menu source;
- restaurant resolution;
- compact extraction;
- analysis snapshot;
- consistency;
- Dish knowledge;
- merge policy;
- explanation renderer;
- exact-cache key.

A prompt or schema change that can change meaning must change the corresponding
version token. Moving branch names and model aliases are not version evidence.

### Identifier rules

- Internal database identity: UUID generated by application or database policy.
- Restaurant external identity: Google Place ID in a unique external-reference
  relation, never as the primary key.
- Exact source identity: deterministic source fingerprint.
- Analysis identity: source fingerprint plus every semantic contract version.
- Menu item and Dish are many-to-many through an explicit match relation.
- Combo items may match multiple Dish concepts.

### Time and money

- Timestamps are UTC ISO 8601 at API boundaries and `timestamptz` in Postgres.
- Money is an integer minor-unit amount plus ISO 4217 currency.
- Unknown price is `null`, never zero.
- Source collection, menu validity, and knowledge review time are different
  fields.

## Workstream handoffs

The team implements against frozen interfaces in parallel after U1.6. Parallel
development does not mean that the same untrusted payload is broadcast to
every workstream.

1. Juhyung's web input experience submits photos, links, and user actions
   through an approved application boundary.
2. YTW owns server-side intake normalization, restaurant resolution, official
   and Web Search acquisition, and compact extraction.
3. YTW may return only UI-safe candidates, progress, user-action states, and
   typed outcomes directly to Juhyung.
4. YTW sends structured extraction, safe source references, and provenance to
   Youn-owned canonical validation.
5. Youn sends only validated canonical application data to Juhyung for
   constrained explanation and result-view preparation.
6. Juhyung returns only contract-valid constrained explanation output through
   the application boundary.
7. Youn owns atomic persistence, cache publication, final integration
   validation, and the publication gate.
8. Juhyung presents the final analysis result only after that publication gate
   succeeds or an explicitly frozen safe fallback permits otherwise.

The approved DTO names and fields are frozen in
`BOUNDARY_DTOS.md` and `@foodseyo/contracts` at
`boundary-dtos/1.0.0`. U2 feature code may consume them from the completed U1.6
baseline. No package may invent a temporary local handoff shape.

## Package boundaries

```text
apps/web
  Juhyung owns the mobile-first input, progress, confirmation, explanation, and
  result experience; it consumes contracts and application services

packages/contracts
  Youn owns vocabulary, schemas, versions, public error codes, environment
  names, and cross-workstream interfaces with impact-tier review

packages/restaurant-resolution
  YTW owns Google Places candidates, confirmation evidence, and UI-safe
  restaurant-resolution outcomes

packages/source-acquisition
  YTW owns uploaded-menu intake plus official sources, PDFs, order pages, and
  Web Search discovery

packages/menu-analysis
  YTW owns compact extraction and its provider adapter; Youn owns canonical
  normalization and semantic validation; Juhyung owns constrained menu/dish
  explanation

packages/dish-knowledge
  Youn owns Dish candidates, reviewed baselines, and typed culinary claims

packages/merge-policy
  Youn owns evidence precedence and effective profiles

packages/database
  Youn owns Neon PostgreSQL integration, Drizzle schema, migrations, roles,
  repositories, transactions, cache, and ownership

packages/observability
  Youn owns privacy-safe event names and fields; all workstreams emit only
  approved fields
```

Feature packages depend on `contracts`, not on each other's internal files.
Cross-feature calls use an exported interface or application service.

## API rules

- Zod or an equivalent runtime schema validates every external boundary.
- Error responses use stable codes and safe correlation IDs.
- Raw menu text, image data, filenames, provider responses, and credentials are
  never logged.
- Raw discovered, redirect, and ordering URLs never appear in logs or public
  errors. Use validated safe source references, correlation IDs, or
  intentionally redacted URL metadata at those boundaries.
- Restaurant photo bytes and opaque or short-lived Google photo/provider
  references remain provider DTO or application-view-model data. They are not
  canonical or permanently persisted without a separately reviewed licensing,
  attribution, freshness/TTL, and storage contract. Google Place ID remains
  the explicit external-identity exception.
- Provider calls are server-only, bounded, abortable, and mockable.
- Network-free fixtures are the default test input.
- Explanation receives validated canonical structure only. It may not add a
  fact, ingredient, dietary/allergen claim, sensory value, or certainty that is
  absent from that structure.

## Contract-change protocol

1. Register the proposal in the GitHub contract-change queue without waiting
   for unrelated proposals.
2. Triage its area, affected owners, approval tier, dependencies, and duplicate
   or conflicting proposals.
3. Open a contract-only PR when its task dependency permits.
4. Explain semantic impact and migration/cache consequences.
5. Update contract tests and the decision log.
6. Obtain the impact-tier approvals defined in
   `CONTRACT_CHANGE_QUEUE.md`; cross-cutting changes and U1.6 require all three.
7. Merge the contract PR.
8. Before U1.6, continue only the next dependency-eligible contract task.
9. After U1.6 promotes the selected contracts to `1.0.0`, update feature
   branches from `main` and implement against the frozen version.

No feature PR may quietly modify a shared string or version.
