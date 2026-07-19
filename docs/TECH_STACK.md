# Foodseyo Unified technology stack

This file is the source of truth for shared platform choices. A technology,
package, environment variable, or deployment behavior from a legacy repository
is not approved unless it appears here or is accepted by a later decision-log
entry and contract PR.

## Status meanings

- **CONFIRMED:** every workstream implements against this choice.
- **PENDING:** no workstream may assume a choice until the named task freezes
  it.
- **NOT APPROVED:** legacy or alternative technology that must not enter the
  unified runtime without a new all-owner decision.

## Confirmed platform choices

| Concern | Confirmed choice | Contract |
| --- | --- | --- |
| Repository | Greenfield pnpm monorepo | Legacy repositories are fixed references, not merge targets. |
| Application host | Vercel | Preview and Production changes require their explicit release checkpoints. Merging `main` alone is not authorization to deploy. |
| Database | Neon Serverless Postgres | Supabase is not part of the unified runtime. |
| Database structure | PostgreSQL with Drizzle-owned schema and reviewed migrations | No schema change outside an assigned migration task. |
| Runtime database credential | Environment-scoped pooled `DATABASE_URL` | Least-privilege application role only; never print or commit the value. |
| Migration credential | Direct `DATABASE_MIGRATION_URL` | Operator or dedicated migration CI only; never available to application runtime or Vercel builds. |
| Environment isolation | Separate Neon Development, Preview, and Production branches | Development first; Preview and Production require staged checkpoints. |
| AI provider | OpenAI server-side APIs | Tests are network-free; a real request requires an explicitly authorized smoke or release task. |
| Restaurant resolution | Google Places server-side API | Place ID is an external reference, never the internal restaurant primary key. |
| Package manager | pnpm `11.9.0` | Do not add npm, Yarn, or Bun lockfiles. |
| Node.js | `>=20.19.0` | Enforced by root `package.json`. |
| TypeScript | `5.9.3` | Shared contracts must typecheck before dependent work. |
| Uploaded images | Transient analysis input | No permanent image or Base64 storage in Git, logs, or the database. |
| User authentication | None in the submission scope | Neon Auth and Supabase Auth are not enabled by this repository. |

Neon is a Postgres-compatible serverless database with independent compute and
durable storage. The branch and pooled-connection terminology above follows the
[Neon architecture](https://neon.com/docs/introduction/architecture-overview)
and [connection pooling](https://neon.com/docs/connect/connection-pooling)
documentation.

## Approved environment names

Application runtime:

```text
FOODSEYO_RUNTIME_ENV
APP_BASE_URL
DATABASE_URL
OPENAI_API_KEY
OPENAI_MENU_EXTRACTION_MODEL
OPENAI_WEB_SEARCH_MODEL
OPENAI_EXPLANATION_MODEL
GOOGLE_PLACES_API_KEY
FEATURE_RESTAURANT_RESOLUTION
FEATURE_WEB_SEARCH_DISCOVERY
FEATURE_DISH_KNOWLEDGE_REUSE
LOG_LEVEL
```

Operator or dedicated migration CI only:

```text
DATABASE_MIGRATION_URL
```

The value-free owner, secret classification, trust boundary, environment
policy, conditional requirement, validation rule, and feature-flag default for
every approved name are frozen in `ENVIRONMENT_REGISTRY.md` and
`@foodseyo/contracts`. Exact values and framework-specific loading mechanics
are not part of U1.4.

Model values, database URLs, API keys, resource IDs, and other secrets are not
documented in Git. Model names are configuration values; their meaning is
versioned through the matching contract rather than a moving alias.

## Legacy names and technologies that are not approved

The following must not be introduced from a team member's earlier repository or
integration note:

- Supabase database, Auth, Storage, SDK, migration tooling, or service-role key;
- `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, or
  `SUPABASE_SERVICE_ROLE_KEY`;
- `OPENAI_DEFAULT_MODEL`, `OPENAI_VISION_MODEL`, `OPENAI_MENU_MODEL`, or a
  generic `OPENAI_MODEL`;
- public browser secrets, including any API or database credential with a
  `NEXT_PUBLIC_` prefix;
- automatic Production deployment merely because `main` changed;
- permanent raw menu-image storage;
- a long-lived shared `develop` branch or permanent personal branches;
- treating Google Place ID as a Foodseyo database primary key.

Legacy names are not compatibility aliases. If imported code expects one, the
code must be adapted to the approved boundary rather than adding both names.

## Pending choices

These choices are intentionally unresolved and must not be guessed:

| Choice | Freeze point |
| --- | --- |
| Web framework and exact React/framework versions | U1.5 module-interface freeze and U2.4 web-foundation PR |
| Neon/Postgres runtime driver and connection-pool implementation | S2.1 after the Vercel runtime shape is verified |
| Exact OpenAI model values | Authorized provider configuration task |
| Upload byte/count limits | U1 boundary contract, preserving the agreed product limits |
| Cache TTL and invalidation values | Database/cache contract task |
| Additional authentication or Food Passport | A later explicitly approved product checkpoint |

Until a pending choice is frozen, interfaces and deterministic fakes may be
built, but a team member must not commit a local assumption as a shared
dependency.

## Change protocol

1. Open a dedicated contract or platform PR.
2. Explain why the existing choice is insufficient.
3. Record environment, cache, migration, security, and rollout consequences.
4. Obtain review from all three workstream owners.
5. Update this file, `SHARED_CONTRACTS.md`, the decision log, tests, and
   environment examples together.
6. Merge the decision before dependent feature implementation.
