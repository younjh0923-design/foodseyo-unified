# Foodseyo U1.3 boundary DTO contract

## Status and authority

This document describes the approved U1.3 boundary contract. Its executable
source is `packages/contracts/src/boundary-dtos.ts`. U1.6 froze it as
`boundary-dtos/1.0.0` after exact-HEAD all-owner approval; U2 feature code may
consume it from the completed U1.6 baseline.

The runtime schemas and paired TypeScript types are authoritative. The JSON
fixtures and `scripts/validate-boundary-dtos.ts` lock valid, invalid, relational,
provenance, and public-error behavior without a provider or database call.

This checkpoint defines data boundaries only. It does not implement a provider
adapter, Dish matcher, merge service, database row, migration, UI, deployment,
or a real OpenAI or Google request.

## Trust lanes

The shared DTOs preserve three different lanes:

1. `RestaurantCandidate`, `RestaurantResolution`, `PublicOutcome`, and
   `PublicErrorEnvelope` are UI-safe operational data.
2. `MenuSourceInput` is sensitive, transient server data. Its
   `contentHandle` is opaque, is never logged or persisted, and is not a URL.
3. `CompactMenuExtraction` is provider-neutral but explicitly
   `unvalidated`. Only `CanonicalMenuAnalysis` may cross into constrained
   explanation, publication, or persistence.

Provider responses, provider-specific DTOs, raw URLs, source bodies, opaque
photo references, database rows, and ORM types are not fields in these
contracts.

## Common identities and values

- Foodseyo internal identities are UUIDs.
- Google Place ID appears only as a restaurant external reference.
- `SafeSourceReference` carries a Foodseyo source UUID, approved source type,
  deterministic opaque fingerprint, and collection time. It never contains a
  raw URL.
- API timestamps are UTC ISO 8601 values.
- `Money` is an integer minor-unit amount and uppercase ISO 4217 currency.
  Unknown price is `null`, never zero.
- Contract fields reject unexpected keys. Adding a field requires an explicit
  contract change rather than silently forwarding provider data.

## Restaurant boundary

### `RestaurantCandidate`

A candidate is a UI-safe possible real restaurant branch. It contains:

- request-scoped candidate identity;
- Google Place ID as an external reference;
- display name and optional public address/location;
- explicit match signals and rank.

It contains no raw Google response or opaque photo reference. Rank alone never
confirms a restaurant.

### `RestaurantResolution`

The state uses the frozen restaurant-resolution vocabulary:

- `candidate` and `conflicting` require user confirmation and cannot contain a
  selected restaurant;
- `user_confirmed` requires recorded user-action evidence;
- `externally_verified` requires recorded external evidence;
- `rejected` does not claim a selected restaurant.

Every state permits safe menu-only analysis when a restaurant cannot be
confirmed. An unconfirmed analysis cannot publish a `RestaurantMenuVersion`.

## Source and extraction boundary

### `MenuSourceInput`

The input contains a safe source reference, optional confirmed restaurant
context, menu scope, transient content handle, content kind, and structural
counts. It does not contain raw URLs, filenames, bytes, menu text, or provider
responses in the shared envelope. The owning adapter resolves the handle only
inside its server trust boundary.

### `CompactMenuExtraction`

Extraction preserves section/item order, optional descriptions and prices,
option text, source indexes, warning codes, scope, and restaurant context. It
is always marked `unvalidated`; it is not canonical truth and cannot be sent
directly to final explanation, UI result rendering, or persistence.

## Canonical menu and Dish semantics

The U1.3 contract applies the all-owner direction approved in Issue #10:

- `RestaurantMenuVersion` is one restaurant branch's menu for one scope and
  validity/version period;
- `MenuItem` is one restaurant-specific sold item and owns price, description,
  options, and menu-source evidence;
- `DishCandidate` proposes a reusable general Dish identity and never owns a
  restaurant price, portion, availability, or safety fact;
- `MenuItemDishMatch` is the evidence-bearing many-to-many relationship.
  `matched` requires a Dish identity plus a human-reviewed or versioned
  deterministic decision. Candidate rank is not a decision;
- combo items may retain multiple justified matches;
- `MenuItemClaim` contains current source-stated or source-inferred meaning;
- `DishClaim` contains typed, versioned culinary-baseline knowledge with
  origin, review state, and knowledge-source provenance;
- `EffectiveDishProfile` is a versioned derived result, not an independent fact
  source.

The initial typed claim families are basic taste, flavor note, texture, heat,
richness, heat adjustability, and ingredient role. There is no unrestricted
EAV/JSON claim escape hatch. A new claim family requires a contract change.

Allergen and dietary certification are deliberately absent from this candidate
DTO. Ingredient and perceptual descriptors do not establish allergen- or
dietary-safety. Until a dedicated reviewed contract exists, those conclusions
remain unknown and the UI must not invent them.

## Deterministic effective profile

Every effective field is either:

- `known`, with a typed value, evidence basis, contributing claim IDs, and
  matching provenance; or
- `unknown`, with no value, claim, or provenance.

The field-level precedence is:

```text
source_stated
> inferred_from_source
> reviewed culinary_baseline
> unknown
```

If any current-menu claim exists for a field, a culinary baseline cannot supply
that field. A baseline can be used only when its `DishClaim` is `reviewed`, its
Dish identity matches the confirmed match, and no current-menu claim exists.
The effective profile records the merge-policy version, Dish-knowledge
version, exact input claims, and derivation time.

Every `known` field must cite the complete ordered set of eligible claims at
the selected highest-precedence tier. Its basis, typed value, and provenance
are derived from and must exactly match those claims. Scalar claims at the
same selected tier must agree; otherwise canonical validation reports a
conflict instead of choosing one silently. Multi-valued and ingredient fields
use the deterministic, de-duplicated union of that complete selected claim
set. Foodseyo does not treat an omitted value inside an already present list
as permission to append a lower-priority baseline value.

## Publication boundary

`CanonicalMenuAnalysis` has two publication states:

- `eligible`: restaurant confirmation and a versioned restaurant menu are
  present; later persistence still needs its atomic transaction gate;
- `analysis_only`: the restaurant is unconfirmed and no
  `RestaurantMenuVersion` may be included.

U1.3 carries one canonical `SafeSourceReference` per analysis. An eligible
`RestaurantMenuVersion.sourceRefs` list must therefore contain exactly that
source reference. Every menu-source evidence entry on a `MenuItem`,
`DishCandidate`, `MenuItemDishMatch`, or `MenuItemClaim` must resolve inside
the same allowed source set. Adding multi-source canonical analysis requires a
separate reviewed contract change rather than accepting an unrelated source
reference.

Canonical validation checks unique identities and positions, relationship
references, menu-version restaurant ownership, match identity, claim
ownership, reviewed-baseline eligibility, field/claim kind agreement, evidence
precedence, selected-claim completeness, exact derived value and provenance,
source-set membership, and versioned derivation inputs. It rejects an inferred
value when source-stated evidence exists and rejects `unknown` when eligible
current-menu or reviewed-baseline evidence exists.

## Outcomes and public errors

Normal no-result or user-action outcomes remain separate from public errors.
The initial normal outcome codes are:

- `RESTAURANT_CONFIRMATION_REQUIRED`;
- `RESTAURANT_NOT_RESOLVED`;
- `MENU_SOURCE_NOT_FOUND`;
- `MENU_SOURCE_CONFLICT`;
- `MENU_PARTIAL`.

`PublicErrorEnvelope` contains only a stable code, registry-owned safe message,
safe correlation ID, retryability, and HTTP status. The executable registry
freezes:

| Code | HTTP | Retryable |
| --- | ---: | --- |
| `INVALID_INPUT` | 400 | no |
| `UNSAFE_SOURCE` | 400 | no |
| `PAYLOAD_TOO_LARGE` | 413 | no |
| `UPSTREAM_TIMEOUT` | 504 | yes |
| `UPSTREAM_UNAVAILABLE` | 503 | yes |
| `INVALID_UPSTREAM_RESULT` | 502 | yes |
| `ANALYSIS_TEMPORARILY_UNAVAILABLE` | 503 | yes |
| `INTERNAL_ERROR` | 500 | yes |

Callers cannot substitute arbitrary messages. Raw source URLs, menu content,
provider details, database details, secrets, and credentials cannot enter the
public envelope.

## Fixture coverage

The valid fixture proves:

- two MenuItems from different Restaurant branches and different menu versions
  share one general Dish while retaining separate prices, menu sources, heat,
  ingredients, and restaurant-menu identities;
- every eligible same-tier claim is retained in the effective value,
  provenance, field claim IDs, and profile input claim IDs;
- an unresolved item retains multiple candidates without auto-confirmation;
- a combo item retains multiple justified matched Dishes;
- source-stated heat overrides a contradictory reviewed baseline;
- a reviewed baseline fills a missing richness field with explicit labeling;
- a missing field with no eligible evidence stays `unknown`;
- effective profiles retain claim, provenance, policy, and knowledge versions.

The invalid fixture rejects provider leakage, raw URLs, rank-only matching,
restaurant-specific fields on Dish, unreviewed baseline use, baseline override,
inference overriding a source statement, ignored available evidence, duplicate
identities, menu-version restaurant mismatch, unknown-with-value, unrestricted
JSON/EAV claims, unversioned effective profiles, unconfirmed menu publication,
unsafe public-error copy, invented effective values or provenance, omitted
same-tier claims, sources outside the analysis/menu-version source set, and
cross-branch menu-version or menu-evidence reuse. Every invalid fixture declares
the stable issue code and path that must be produced, so an incidental failure
cannot hide a missing semantic guard.

## Deferred implementation choices

U1.3 does not decide:

- provider-specific request and response DTOs;
- service method signatures and fake adapters, which belong to U1.5;
- the internal scoring algorithm for Dish candidates;
- persistence/materialization of effective profiles;
- physical tables, indexes, retention, cache identity, or migrations;
- framework-specific request loading;
- final allergen or dietary claim vocabularies.

Those choices must use the contract-change queue and may not weaken this
checkpoint's evidence, unknown, safety, or trust boundaries.
