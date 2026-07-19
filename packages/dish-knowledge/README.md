# `packages/dish-knowledge`

Owner: `younjh0923-design`

Dish candidates, aliases, reviewed and versioned culinary baselines, typed
claims, provenance, and review state. Broad implementation is post-submission.

U1.5 public surface: `DishKnowledgePort` and `FakeDishKnowledgePort`. This
boundary exists separately from merge policy so knowledge retrieval cannot
silently choose precedence or effective values. Only the deterministic fake is
implemented before U1.6.
