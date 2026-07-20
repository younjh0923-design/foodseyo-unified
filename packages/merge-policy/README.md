# `packages/merge-policy`

Owner: `younjh0923-design`

Deterministic evidence precedence, contradiction handling, unknown semantics,
and effective profiles. It must not call a provider or database.

It does not acquire sources, render UI, persist rows, or call a provider.

The package manifest is frozen at `1.0.0`. Real implementation starts only
after U1.6 merges to `main` and is recorded `DONE`.

U1.5 public surface: `EffectiveProfileMergePort` and
`FakeEffectiveProfileMergePort`. The package remains separate because merging
must stay a pure, deterministic policy with no Dish lookup, provider, or
publication side effect. The U1.5 deterministic fake remains available for
configured contract-boundary tests.

U2.1 adds `DeterministicEffectiveProfileMergeService` behind the frozen port.
It preserves the frozen field-level order
`source_stated > inferred_from_source > reviewed culinary_baseline > unknown`,
rejects conflicting scalar claims at the selected tier, unions multi-valued
claims deterministically, and keeps menu-item facts isolated while allowing
only reviewed Dish baselines to fill missing context. Missing evidence remains
an explicit `unknown` field with no value, claims, or provenance.
