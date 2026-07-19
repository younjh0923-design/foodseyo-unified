# Foodseyo Unified repository guide

Read these files before making changes:

1. `docs/TECH_STACK.md`
2. `docs/PRODUCT_FLOW.md`
3. `docs/SHARED_CONTRACTS.md`
4. `docs/SENSORY_VOCABULARY.md`
5. `docs/BOUNDARY_DTOS.md`
6. `docs/CONTRACT_CHANGE_GUIDE.md`
7. `docs/CONTRACT_CHANGE_QUEUE.md`
8. `docs/TASK_MASTER.md`
9. `docs/TEAM_OWNERSHIP.md`
10. `docs/INTEGRATION_PROTOCOL.md`

## Product boundary

Foodseyo is a menu-understanding and ordering-decision product. Restaurant
identity is supporting context, not the primary product. Preserve the evidence
precedence:

`source_stated > inferred_from_source > culinary_baseline > unknown`

Never convert `unknown` into absence, false, allergen-safe, or dietary-safe.

## Workstream and trust boundaries

- YTW owns the upstream server-side path from normalized photo/link input
  through restaurant resolution, menu-source acquisition, Web Search fallback,
  and compact extraction.
- Youn owns canonical normalization, culinary and safety rules, persistence,
  cache, integration validation, and release gates.
- Juhyung owns constrained explanation and the mobile-first user experience.
- YTW may send only UI-safe candidates, progress, user-action states, and typed
  outcomes directly to Juhyung. Extracted menu meaning and provenance must pass
  through Youn-owned canonical validation before Juhyung may explain or prepare
  them for result presentation; final publication remains behind Youn's
  persistence and integration gate.
- These boundaries prohibit unilateral implementation in another owner's area;
  they do not prohibit review, integration testing, or an approved contract
  change.

## Contract-first development

- Import shared vocabulary, environment names, and version tokens only from
  `@foodseyo/contracts`.
- Treat `docs/TECH_STACK.md` as the only source of approved platform choices.
  A legacy repository or team note cannot introduce Supabase, a new runtime,
  a new environment name, or automatic deployment behavior.
- Do not redefine shared enums or status strings inside an app or feature
  package.
- Follow `docs/CONTRACT_CHANGE_GUIDE.md` whenever a task discovers a new shared
  field, state, outcome, error, environment name, version, or interface.
- Register proposed shared changes in the GitHub contract-change queue before
  implementation. Registration requires no approval and does not change the
  active contract.
- Contract changes require a dedicated contract PR and the impact-tier approval
  defined in `docs/CONTRACT_CHANGE_QUEUE.md`. Cross-cutting or final-freeze
  changes still require all three owners.
- No feature implementation begins until the final U1 compatibility freeze is
  merged and the selected contracts are `1.0.0`.
- Do not weaken source provenance, restaurant confirmation, cache identity,
  ownership, transaction, or safety rules to make a feature easier.

## Autonomy and safety

Perform routine repository, CLI, API, test, and Development-only platform work
autonomously. Ask the account holder only for login, MFA, account registration,
legal acceptance, billing, secret entry that cannot remain inside an
authenticated tool session, or an unapproved irreversible Production action.
Use official CLI/API fallbacks when browser automation fails.

## Session startup queue check

Before selecting or continuing repository work, inspect every open GitHub
contract-change proposal, then deeply review items in the current workstream,
assigned to the current owner, or marked cross-workstream. Report relevant new
or blocking proposals before implementation. If labels are unavailable, search
open issue titles for `[CONTRACT CHANGE]`. Never treat unavailable GitHub access
as an empty queue or consume an unmerged proposed shape.

Never:

- commit secrets, credentials, raw menu images, Base64 payloads, or provider
  responses;
- print secret values or database connection strings;
- make a real OpenAI request unless the active checkpoint explicitly authorizes
  that exact request;
- migrate Preview or Production, deploy, or delete shared data without an
  explicit release checkpoint;
- add demo behavior that claims an unavailable capability works.

## Delivery

- Work on a short-lived branch named for the task.
- Stage only intended files.
- Run `pnpm verify` before requesting review.
- Update the task master and relevant contract documentation in the same PR.
- Keep `main` runnable; incomplete work stays behind server-side feature flags.
