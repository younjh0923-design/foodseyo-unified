# U2.5 continuous integration foundation

## Scope and status

U2.5 adds one pull-request validation job for changes targeting `main`. It
installs the approved pnpm `11.9.0` dependency graph from the frozen lockfile,
runs the repository-owned `pnpm verify` command without provider or database
network access, and fails when validation produces a dirty worktree.

The workflow contains no deployment, migration, provider, database, Preview,
or Production job. Its GitHub token has read-only repository contents
permission and it consumes no repository secret or environment.

## Existing validation reused

The root scripts name the existing assertion-driven checks without changing
their frozen meaning:

- `test:unit` runs the shared vocabulary, environment, contract, runtime-schema,
  and valid/invalid boundary-fixture validators;
- `test:integration` runs the deterministic module-interface and fake-adapter
  validator;
- `test:workspace` runs every currently supported package-level `test` command;
- `test` runs the two baseline groups and supported workspace tests;
- `verify` continues to own typecheck, all executable tests and fixtures, and
  repository security validation.

U2.5 extends `verify` with:

- workspace and lockfile-importer integrity;
- public package-entry-point and declared-dependency enforcement;
- circular workspace-dependency rejection;
- duplicate shared-contract declaration rejection outside
  `packages/contracts`;
- rejection of an unwired package-level `validate:*` command;
- dependency-free workflow syntax and policy validation;
- executable provider/database network-denial probes;
- representative synthetic secret-pattern rejection.

The CI workflow is JSON-compatible YAML so the repository validator can parse
its complete syntax with the platform runtime and no new YAML dependency.

## Network and secret boundary

Dependency installation is the only repository command allowed to use the
package registry. The verification process preloads `scripts/deny-network.cjs`
into every Node child process. The preload blocks Node TCP, TLS, HTTP, HTTPS,
HTTP/2, UDP, `fetch`, and WebSocket entry points before tests execute.

CI also supplies empty values for every provider model/key and database
credential name. The network-boundary validator fails if any such value is
configured and proves that representative TCP, HTTPS, and `fetch` attempts are
rejected without reaching a network.

The security validator scans repository text and rejects environment files,
OpenAI-style keys, GitHub tokens, Google keys, AWS access keys, private keys,
and credential-bearing PostgreSQL URLs. Synthetic values are assembled only
in memory to prove each detector; no real or syntactically complete fixture
credential is stored.

## Explicitly deferred checks

- **Lint:** no repository lint command or approved lint dependency exists on
  the U1.6 baseline. CI reports this as deferred and does not label it passing.
- **Production build:** no application package or approved build command
  exists. The web framework remains a proposed U2.4 platform change in Issue
  #20, so U2.5 does not invent a framework or a placeholder build.

The CI validator requires any future root `lint` or `build` script to be added
to `pnpm verify`; otherwise verification fails instead of silently skipping the
new supported command.

## Repository settings

This code change does not alter branch protection, required checks, repository
secrets, environments, or deployment configuration. After this PR is reviewed,
the repository owner should make the `Repository validation` job required for
pull requests to `main` if the private-repository plan exposes that setting.
