# `packages/menu-analysis`

Owners by boundary:

- YTW (`ytw010629`): compact extraction, extraction provider adapter, source
  indexes, and upstream typed outcomes.
- Youn (`younjh0923-design`): provider-to-canonical normalization, culinary
  vocabulary, evidence, unknown, safety, and semantic validation.
- Juhyung (`juhyungbaek0621`): constrained explanation, bounded retry,
  deterministic fallback, and explanation-renderer semantics.

The three sub-boundaries exchange only U1-frozen interfaces. Extraction is not
canonical truth, and explanation receives validated canonical data only. This
package does not expose provider DTOs to the UI, persist database rows, invent
local shared fields, or make a real provider call in automated tests.

Implementation starts only after U1.6.
