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

The package manifest is frozen at `1.0.0`. Real implementation starts only
after U1.6 merges to `main` and is recorded `DONE`.

U1.5 keeps extraction, canonical validation, constrained explanation, and
application orchestration in this single package because they form one ordered
analysis trust sequence rather than four independently deployable features.
It exposes the four approved ports and matching deterministic fakes.

The submission integration adds a server-only Responses API image adapter for
the existing `CompactMenuExtractionPort`. It uses one configured model request,
an exact structured-output schema, transient image resolution, source-index
binding, safe typed failures, and the approved
`OPENAI_MENU_EXTRACTION_MODEL` environment name. Network-free tests inject the
transport and prove request and response mapping without a provider call.

U2.1 adds `CanonicalMenuValidationService` and
`AnalysisApplicationService` behind those frozen ports. The validator accepts
an untrusted normalizer result, applies the exported
`CanonicalMenuAnalysisSchema`, and binds the canonical result back to the exact
extraction source, branch resolution, scope, menu-item facts, evidence, and
warnings. The application service preserves the extraction -> validation ->
explanation -> eligible-only publication order and never returns a partial
publication result. Both implementations return only frozen outcomes and
public errors. `buildCanonicalMenuAnalysis` supplies the deterministic minimal
canonical projection used by the submission composition; it creates no new
shared DTO and adds no inferred Dish or culinary claims.
