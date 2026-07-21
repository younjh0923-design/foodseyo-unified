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

The package manifest is frozen at `1.0.0`. Real implementation starts only
after U1.6 merges to `main` and is recorded `DONE`, and it requires a
Development database checkpoint.

U1.5 public surface: `AnalysisPublicationPort` and
`FakeAnalysisPublicationPort`. This package exists as the sole publication
side-effect boundary; it accepts only publication-eligible canonical analysis
and prevents database rows or ORM types from coupling other workstreams. The
U1.5 deterministic fake remains available for configured boundary tests.

U2.1 adds `TransactionalAnalysisPublicationService` and
`DeterministicFakeAnalysisRepository`. The service reuses the frozen
publication guard and runtime schemas, creates only the frozen receipt, and
commits the canonical analysis, menu version, menu items, effective profiles,
and receipt as one fake transaction. Deterministic write-failure injection
proves rollback and prevents partial publication. This foundation contains no
Drizzle schema, migration, credential, live adapter, or database connection;
those remain gated by S2.1.
