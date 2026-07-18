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
-> Youn-owned canonical normalization, culinary consistency, and safety checks
-> Juhyung-owned menu and dish explanation from validated canonical structure
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

## Approved platform

- Application hosting and release target: **Vercel**
- Database platform: **Neon Serverless Postgres**
- Database schema and migration layer: **Drizzle**, after its assigned
  Development checkpoint
- AI provider: **OpenAI**, server-side only
- Restaurant resolution: **Google Places**, server-side only
- Package manager: **pnpm**

Supabase is a legacy-repository dependency and is not part of the unified
runtime. Exact approved, prohibited, and still-pending choices live in
`docs/TECH_STACK.md`; legacy environment names must not be copied into this
repository.

## Start here

1. [Approved technology stack](docs/TECH_STACK.md)
2. [Product flow](docs/PRODUCT_FLOW.md)
3. [Shared contracts](docs/SHARED_CONTRACTS.md)
4. [Task master](docs/TASK_MASTER.md)
5. [Team ownership](docs/TEAM_OWNERSHIP.md)
6. [Integration protocol](docs/INTEGRATION_PROTOCOL.md)
7. [Legacy reference map](docs/LEGACY_REFERENCE_MAP.md)

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
