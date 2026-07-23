# `packages/database`

Owner: `younjh0923-design`

The approved platform is Neon Serverless Postgres. This package owns the
Drizzle schema, reviewed PostgreSQL migrations, least-privilege runtime and
migrator roles, repositories, transactions, exact cache, and real concurrency
validation. ORM types do not cross the package boundary.

Application runtime receives an environment-scoped pooled `DATABASE_URL`.
Migration tooling receives a direct `DATABASE_MIGRATION_URL` only through an
operator or dedicated migration CI environment. No Supabase SDK, service-role
credential, migration, Auth, or Storage dependency belongs in this package.

Development, Preview, and Production use isolated Neon branches. Development
is always validated first; Preview and Production require their explicit
release checkpoints.

This package does not accept unvalidated provider DTOs, expose ORM types or
database rows to the UI, or implement provider and presentation behavior.

The DB-1 through DB-4 MVP persistence boundary is specified in
`docs/MVP_PERSISTENCE.md`. It contains exactly eleven tables, preserves the
frozen five-field `PublicationReceipt`, permits menu-only `analysis_only`
persistence, and requires eligible restaurant publication plus its receipt to
commit atomically. Migration files may be generated and reviewed locally, but
DB-5 explicit owner authorization is required before any Neon Development
migration or test-row mutation.

The package manifest remains `1.0.0`. DB-2 adds the exact eleven-table Drizzle
schema, generated SQL migration, and static schema/migration parity validator.
The migration is an unapplied artifact: no database connection or Neon
environment mutation occurs before the separate DB-5 gate.

U1.5 public surface: `AnalysisPublicationPort` and
`FakeAnalysisPublicationPort`. This package exists as the sole publication
side-effect boundary; it accepts only publication-eligible canonical analysis
and prevents database rows or ORM types from coupling other workstreams. The
U1.5 deterministic fake remains available for configured boundary tests.

The earlier U2.1 foundation adds `TransactionalAnalysisPublicationService` and
`DeterministicFakeAnalysisRepository`. The service reuses the frozen
publication guard and runtime schemas, creates only the frozen receipt, and
commits the canonical analysis, menu version, menu items, effective profiles,
and receipt as one fake transaction. Deterministic write-failure injection
proves rollback and prevents partial publication. DB-3 and DB-4 replace that
foundation with the authorized exact-cache and publication repository APIs;
runtime credentials and live database application remain gated by DB-5.

For the explicitly authorized submission rollout, `runtime.ts` composes the
existing repository with a small `pg` pool using only the environment-scoped
pooled `DATABASE_URL`. It rejects non-Postgres and non-pooler URLs, never reads
migrator credentials, and never creates or alters schema objects. No migration
is added or executed by this runtime adapter.

DB-3 adds `PostgresMvpAnalysisRepository` behind an injected transaction
runner and its network-free deterministic counterpart. The minimal API resolves
exact evidence plus semantic identities, elects one lease owner, provides a
bounded waiter, records retryable or terminal failure through guarded CAS, and
persists only runtime-validated `analysis_only` canonical results. The
menu-only transaction cannot create restaurant, menu, Dish, match, or receipt
rows, and stale owners are rejected before any canonical write.

DB-4 keeps the application surface narrow with
`findRestaurantByExternalReference` and `publishEligibleAnalysis`. Publication
resolves Google Place ID before canonical construction, retries by rebuilding
and revalidating the immutable canonical value when a concurrent restaurant
winner appears, and atomically writes the eligible canonical row, menu
lifecycle, items, reusable Dish identities, matches, and receipt. The adapter
projects internal receipt rows into the exact frozen five-field DTO and parses
that projection through `PublicationReceiptSchema`. Deterministic faults prove
pre-commit rollback and committed-but-uncertain identical receipt recovery.
