# `@foodseyo/contracts`

Owner: `younjh0923-design`

This package is the executable source for Foodseyo shared vocabulary,
environment metadata, version tokens, runtime boundary schemas, TypeScript
types, public outcomes, and safe errors.

U1.3 boundary schemas are exported from `@foodseyo/contracts/boundary-dtos`.
Each schema provides `parse` and `safeParse` without logging or including the
rejected payload in an error. Valid and invalid JSON fixtures are network-free.

U1.5 provider-neutral ports, common invocation/result types, and the
eligible-publication guard are exported from
`@foodseyo/contracts/module-interfaces`. Owning feature packages implement
these ports without redefining the U1.3 DTOs.

The package does not contain provider adapters, feature behavior, database
rows, migrations, UI models with provider internals, or secrets. All contracts
remain `0.1.0`/`draft` and unavailable to feature code until U1.6.
