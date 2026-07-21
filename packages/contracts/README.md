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
rows, migrations, UI models with provider internals, or secrets. The selected
contracts and this package manifest are `1.0.0`/`frozen`; U2 feature packages
may consume them from the completed U1.6 baseline. Later feature consumption
must preserve these frozen boundaries.

Issue #21 adds the separately versioned `web-experience/0.1.0` candidate at
`@foodseyo/contracts/web-experience`. It defines sensitive intake and UI-safe
non-terminal acquisition progress without promoting or reinterpreting the
frozen U1 registry. The candidate cannot be consumed by feature code before
its exact contract PR receives all-owner approval and merges.
