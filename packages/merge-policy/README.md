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
publication side effect. Only the deterministic fake is implemented.
