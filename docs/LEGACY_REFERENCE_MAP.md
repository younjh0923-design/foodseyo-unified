# Legacy repository reference map

The new repository has no inherited source-of-truth code. Legacy work is
reviewed at fixed commits and reimplemented only when it satisfies the new
contracts.

| Repository | Frozen reference | Useful reference areas | Do not inherit |
| --- | --- | --- | --- |
| `younjh0923-design/foodseyo` | `2e55d8a0e9cb2724325e0e9598398edf72f983e8` | canonical contracts, source honesty, sensory vocabulary, PostgreSQL integrity, cache ownership, validation discipline | cumulative branch history, old environment names by default, unfinished rollout state |
| `juhyungbaek0621/travel-food-copilot` | `ea67f5daeaf4c0c3c50d7c052091baf0c1cfec87` | compact menu exploration, multilingual ideas, acquisition concepts | monolithic UI, in-memory cache, weak provider parsing, static claims, vulnerable dependency state |
| `ytw010629/BiteMatch` | `7685a2f2e74136d32caf0a2b4ede3ad000eca511` | restaurant confirmation, source references, source/general guidance separation, mobile flow | Supabase coupling, sensitive logging, unauthenticated provider routes, non-atomic cache and lease behavior |

## Reuse rule

- Copy no file wholesale.
- Record the fixed commit in any PR that reimplements an idea.
- Preserve attribution in the PR and decision log.
- Revalidate the idea against the new contracts and tests.
- Do not transfer credentials, environment values, database data, deployment
  configuration, or Git history.

The earlier `foodseyo-team-integration` repository remains a review artifact. It
is not the greenfield submission source of truth.
