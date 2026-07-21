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

Merged Issue #21 adds the separately versioned `web-experience/0.1.0` candidate at
`@foodseyo/contracts/web-experience`. It defines sensitive intake and UI-safe
non-terminal acquisition progress without promoting or reinterpreting the
frozen U1 registry. Its candidate-only UI-safe event union and port opt into
progress while the frozen `module-interfaces/1.0.0` event union, port, and
runtime schema remain unchanged. Exact PR #30 HEAD
`913458fcb2497bf424c3a330826e131101fcfc34` merged to `main` as
`c04305e421657863d3c0c06fdfe3f90192a1593f`; the candidate is now available
to dependent feature code through this public entry point.
