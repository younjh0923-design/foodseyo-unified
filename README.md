# Foodseyo Unified

Foodseyo helps travelers and people exploring unfamiliar cuisines understand
menu dishes and decide what to order. It is not a restaurant-ranking product.

This repository is a greenfield team implementation. The three legacy
repositories are evidence and design references only; no legacy repository is
merged wholesale and no legacy module is treated as the new source of truth.

## Submission must-have flow

The submission must complete one coherent path:

```text
menu/sign photos plus a restaurant, map, or official-source link
-> Google Places restaurant and branch resolution
-> official menu-source discovery and acquisition
-> OpenAI Web Search fallback when official acquisition fails
-> compact menu extraction
-> Juhyung-owned menu and dish explanation
-> Youn-owned canonical normalization, culinary consistency, and safety checks
-> Youn-owned database persistence and reuse
-> mobile ordering-decision experience
```

Google Places identifies the restaurant branch and supplies official-source
clues such as its website. It is not treated as a full menu-item API. Every
acquired menu must pass the shared source, provenance, canonical, and safety
contracts before explanation or persistence.

These capabilities are submission requirements, not post-submission
aspirations. `docs/TASK_MASTER.md` is the execution source of truth for their
owners, dependencies, and release gates.

## Start here

1. [Product flow](docs/PRODUCT_FLOW.md)
2. [Shared contracts](docs/SHARED_CONTRACTS.md)
3. [Task master](docs/TASK_MASTER.md)
4. [Team ownership](docs/TEAM_OWNERSHIP.md)
5. [Integration protocol](docs/INTEGRATION_PROTOCOL.md)
6. [Legacy reference map](docs/LEGACY_REFERENCE_MAP.md)

## First gate

All three team members must approve the `@foodseyo/contracts` vocabulary,
environment registry, version registry, and module boundaries before feature
implementation begins. Until that approval, contract versions remain `0.1.0`.

## Local validation

```powershell
pnpm install
pnpm verify
```

No real provider request, database migration, or deployment is part of the
repository bootstrap. The statements above describe the required submission
scope; a capability is complete only after its task acceptance criteria and
release gates pass.
