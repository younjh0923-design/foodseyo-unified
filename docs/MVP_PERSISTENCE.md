# Foodseyo MVP persistence contract

## Status and authority

This document is the DB-1 implementation contract for the one-day MVP
persistence vertical slice. It is implemented on `feat/mvp-persistence` through
DB-2, DB-3, and DB-4 in one Draft PR. DB-5 remains a separate owner gate for
any Neon Development migration or test-row mutation.

The frozen contracts in `@foodseyo/contracts` remain authoritative. In
particular, `module-interfaces/1.0.0` `PublicationReceipt` remains exactly:

- `contractVersion`;
- `analysisId`;
- `menuVersionId`;
- `status: "published"`;
- `publishedAt`.

Internal database rows may carry additional relational-integrity and operation
columns, but database rows and ORM types never cross the package boundary.

## Bounded scope

The physical schema contains exactly these eleven application tables:

1. `analysis_contracts`
2. `menu_evidence_sets`
3. `analysis_runs`
4. `canonical_analyses`
5. `restaurants`
6. `restaurant_external_references`
7. `restaurant_menu_versions`
8. `menu_items`
9. `dishes`
10. `menu_item_dish_matches`
11. `publication_receipts`

The slice intentionally excludes brand hierarchy, generalized identity merge,
`RestaurantConcept`, `PublicLookup`, `PublicationCandidate`,
`PublicationSnapshot`, generalized correction or withdrawal workflows, a full
evidence graph, event sourcing, a generalized job queue, a distributed-lock
framework, and a multi-provider identity platform.

PR #27 is not a dependency for this slice. Restaurant publication tests use
approved contract-shaped fixtures. The concrete Google Places adapter is
integrated only after PR #27 and this implementation share a common `main`.

## Physical conventions

- IDs are application-generated UUIDs. Database defaults do not create
  canonical, ownership, restaurant, menu, Dish, match, or operation identity.
- State and provider values use `text` plus closed PostgreSQL `CHECK`
  constraints.
- Times use `timestamptz` and API values remain UTC ISO 8601 strings.
- Non-null text is trimmed and nonblank; nullable text uses `NULL`, not an empty
  string, for unknown.
- Only `canonical_analyses.canonical_analysis_json` uses `jsonb`.
- Raw URLs, images, Base64, filenames, per-image hashes, source bodies, menu
  evidence bodies, and provider responses are never stored.
- No numeric confidence column exists.
- Foreign keys use restrictive update and delete actions. Runtime deletion and
  schema mutation are not part of this slice.

## Exact identity

An exact-cache identity is:

```text
menu evidence identity
+ complete semantic version vector
```

The evidence identity is the deterministic source fingerprint plus its exact
identity version. It retains one safe source UUID, approved source type, and
collection time, but no source payload.

The semantic vector is immutable and includes every meaning-bearing input used
by the MVP analysis:

- model version;
- prompt version;
- provider-schema version;
- menu-source version;
- restaurant-resolution version;
- compact-extraction version;
- analysis-snapshot version;
- consistency version;
- Dish-knowledge version;
- merge-policy version;
- explanation-renderer version;
- boundary-DTO version;
- module-interface version;
- exact-cache-key version.

Changing any vector member creates or resolves a different
`analysis_contracts` row and therefore cannot reuse an older exact result.

## Table contracts

### `analysis_contracts`

One immutable semantic version vector. It has an application UUID primary key,
the fourteen nonblank version columns above, a candidate key across the full
vector, and `created_at`. Rows are append-only.

### `menu_evidence_sets`

One immutable exact transient-source identity. It has an application UUID
primary key, unique safe `source_ref`, `source_type`, `source_fingerprint`,
`evidence_identity_version`, `collected_at`, and `created_at`. The candidate key
is `(source_fingerprint, evidence_identity_version)`. It contains no retained
source payload.

### `analysis_runs`

One append-only ownership attempt. It has:

- application UUID `id`, which is the owner token;
- evidence and analysis-contract foreign keys;
- `attempt_number` starting at one;
- status `processing`, `ready`, `failed_retryable`, or `failed_terminal`;
- lease, start, finish, creation, and update times;
- nullable allowlisted `safe_error_code`.

Candidate keys preserve `(evidence, contract, attempt_number)` and
`(id, evidence, contract)`. A partial unique index permits only one
`processing` attempt for an exact identity. State checks require:

- `processing`: future lease, no finish time, no safe error;
- `ready`: no lease, finish time, no safe error;
- failed state: no lease, finish time, nonblank safe error.

### `canonical_analyses`

One immutable validated canonical result. The canonical `analysisId` is the
application UUID primary key. The row references the matching evidence,
contract, and producing run through a composite foreign key. It stores:

- publication state `analysis_only` or `eligible`;
- optional internal `restaurant_id` and `restaurant_menu_version_id`;
- the sole JSONB column, `canonical_analysis_json`;
- validation, creation, access, expiry, and guarded invalidation times;
- paired nullable invalidation timestamp and safe invalidation code.

Database checks require the JSON root to be an object, the JSON `analysisId`
and `publicationState` to equal the relational columns, and the relational
`restaurant_id` to equal the immutable canonical restaurant identity for an
eligible analysis. `analysis_only` rows must have null restaurant and menu
version identities. Eligible rows must have both identities.

A partial unique index permits one active canonical result per exact evidence
and semantic contract. A reusable result must belong to a `ready` run, be
active and unexpired, and pass the frozen runtime schema and semantic
validation. An `eligible` row is reusable only with its matching published
receipt.

### `restaurants`

One physical branch or location. It has an application UUID primary key,
nonblank display name, and timestamps. It does not contain a provider ID. A
request-scoped `candidateId` is never used as this ID.

### `restaurant_external_references`

One provider identity linked to one Foodseyo restaurant. Provider is closed to
`google_places` in this slice. `(provider, external_id)` is globally unique and
`(restaurant_id, provider)` permits at most one Google Place ID per restaurant.
The Google Place ID is never a Foodseyo primary key.

### `restaurant_menu_versions`

One immutable versioned menu for one physical restaurant and menu scope. It
uses the canonical application-generated `menuVersionId` as primary key and
stores restaurant, evidence set, scope, lifecycle, version ordinal,
collection/validity times, and an optional superseded predecessor.

Required keys include:

- `UNIQUE (id, restaurant_id)` for same-restaurant composite references;
- `UNIQUE (restaurant_id, menu_scope, version_ordinal)`;
- at most one `active` version for a restaurant and scope.

The predecessor composite foreign key proves that a superseded menu belongs to
the same restaurant. Validity and self-supersession checks apply.

### `menu_items`

One restaurant-specific sold item belonging to one menu version. The canonical
application-generated `menuItemId` is the primary key. A composite foreign key
`(restaurant_menu_version_id, restaurant_id)` proves branch ownership. The row
stores canonical order, name, optional description, nullable minor-unit price
and currency, and a validated text array of option labels. Unknown price is
null, never zero. Parent-scoped section/item position is unique.

### `dishes`

One reusable general culinary identity. The canonical application-generated
Dish UUID is the primary key. The row stores nonblank display and normalized
names plus timestamps. Names are indexed for lookup but are not a unique or
automatic identity-merge key. Restaurant-specific price, portion,
availability, recipe, and safety facts never enter this table.

### `menu_item_dish_matches`

One canonical MenuItem-to-Dish-candidate relationship. It stores the
application-generated match ID, item ID, request-scoped Dish candidate ID,
nullable Dish ID, frozen match state, decision kind and decision metadata, and
timestamps. `(menu_item_id, dish_candidate_id)` is unique.

Checks preserve the frozen contract:

- `matched` requires a Dish and a human-reviewed or deterministic decision;
- `rejected` requires a decision and no Dish;
- `candidate` and `unresolved` have neither Dish nor decision;
- human decisions have a reviewer and no rule version;
- deterministic decisions have a rule version and no reviewer.

### `publication_receipts`

One idempotent committed publication result. `analysis_id` is the primary key.
The internal row also stores `restaurant_id`,
`restaurant_menu_version_id`, application-generated `operation_id`, frozen
module-interface version, `published` status, `published_at`, and `created_at`.

Composite foreign keys prove that:

- the eligible canonical analysis carries the same restaurant and menu
  version;
- the menu version belongs to that restaurant.

Operation ID is unique. The adapter projects the exact frozen five-field
`PublicationReceipt`, parses it through `PublicationReceiptSchema`, and never
returns internal fields.

## Ownership and waiter behavior

Acquisition uses unique insert ownership and short transactions only. No lock
or transaction remains open during provider work.

1. Resolve evidence and semantic-contract identities.
2. Return a valid reusable canonical result when present.
3. Insert the caller's application-generated run ID as `processing`.
4. If the processing unique key loses, return the active owner and wait only
   within a caller-supplied bounded policy.
5. If the owner commits a reusable result, return it.
6. If the wait bound expires, return a retryable busy result without provider
   work.
7. Replace an expired owner only by atomically failing the stale row as
   retryable and inserting the next attempt.

Every ready, failed, and persistence transition is compare-and-swap guarded by
run ID, exact identity, current `processing` state, and lease. A stale or wrong
owner cannot persist canonical data, restaurant/menu rows, or a receipt.

Retryable failure permits a later attempt. Terminal failure is reusable as a
terminal no-provider outcome for the same exact identity until the semantic or
evidence identity changes or an explicit later policy invalidates it.

## DB-3 menu-only transaction

DB-3 may persist only a validated `analysis_only` canonical analysis. One
transaction verifies the live owner, inserts the canonical row, and moves that
run to `ready`. It creates no row in:

- `restaurants`;
- `restaurant_external_references`;
- `restaurant_menu_versions`;
- `menu_items`;
- `dishes`;
- `menu_item_dish_matches`;
- `publication_receipts`.

An `eligible` analysis is rejected by the menu-only API. It is not a complete
reusable result until DB-4 atomically creates the publication receipt.

## DB-4 eligible publication transaction

Google Place ID is resolved before the final eligible canonical analysis is
constructed whenever possible:

1. Reuse the Foodseyo restaurant ID already bound to the Place ID.
2. Otherwise reserve a new application UUID and attempt the external-reference
   insert.
3. If a concurrent transaction wins, roll back, read the committed restaurant
   ID, rebuild and revalidate the immutable canonical analysis, and retry.

The publication transaction then verifies the live owner and writes or
idempotently reuses the restaurant, external reference, menu version, eligible
canonical analysis, every menu item, required Dish identities, matches, and
receipt. It commits only after exact count and identity checks. The run becomes
`ready` in the same transaction.

Retries recover the exact committed receipt by analysis identity. A simulated
response loss after commit must return the same frozen receipt and create no
duplicate row.

Initial fault injection is mandatory:

1. before canonical-analysis persistence;
2. while writing menu items;
3. immediately before receipt insertion;
4. simulated response loss after commit.

The first three leave no eligible canonical or publication projection. The
last recovers the identical committed receipt.

## DB-5 gate

DB-1 through DB-4 may create code, migration files, deterministic fixtures,
network-free tests, checkpoint commits, and one Draft PR. They do not apply a
migration, create a Neon branch, pull credentials, or mutate Development,
Preview, or Production.

DB-5 begins only after an explicit owner instruction names the Development
target and authorizes migration and test-row mutation. Preview and Production
remain separately gated.
