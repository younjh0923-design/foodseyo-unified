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

The package manifest is frozen at `1.0.0`. Real implementation starts only
after U1.6 merges to `main` and is recorded `DONE`, and it requires a
Development database checkpoint.

U1.5 public surface: `AnalysisPublicationPort` and
`FakeAnalysisPublicationPort`. This package exists as the sole publication
side-effect boundary; it accepts only publication-eligible canonical analysis
and prevents database rows or ORM types from coupling other workstreams. No
database implementation is present in U1.5; the exported class is a
deterministic fake only.
