# `packages/observability`

Owner: `younjh0923-design`

Privacy-safe event names, correlation IDs, durations, byte counts, status
codes, stage codes, and structural issue counts. No menu or provider content.

All workstreams emit only fields approved by this package. It does not accept
raw source URLs, filenames, menu text, provider responses, canonical analyses,
credentials, or database values.

Implementation starts only after U1.6.

U1.5 public surface: `SafeObservabilityPort` and
`FakeSafeObservabilityPort`. This shared sink is separate so every workstream
uses one privacy-safe metadata boundary without depending on provider,
analysis, database, or UI implementation. Only the deterministic recorder fake
is implemented.
