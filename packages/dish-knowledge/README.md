# `packages/dish-knowledge`

Owner: `younjh0923-design`

Dish candidates, aliases, reviewed and versioned culinary baselines, typed
claims, provenance, and review state. Broad implementation is post-submission.

The package manifest is frozen at `1.0.0`. Real implementation starts only
after U1.6 merges to `main` and is recorded `DONE`.

U1.5 public surface: `DishKnowledgePort` and `FakeDishKnowledgePort`. This
boundary exists separately from merge policy so knowledge retrieval cannot
silently choose precedence or effective values. Only the deterministic fake is
implemented before U1.6.
