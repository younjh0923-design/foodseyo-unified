# Foodseyo Unified repository guide

Read these files before making changes:

1. `docs/TECH_STACK.md`
2. `docs/PRODUCT_FLOW.md`
3. `docs/SHARED_CONTRACTS.md`
4. `docs/TASK_MASTER.md`
5. `docs/TEAM_OWNERSHIP.md`
6. `docs/INTEGRATION_PROTOCOL.md`

## Product boundary

Foodseyo is a menu-understanding and ordering-decision product. Restaurant
identity is supporting context, not the primary product. Preserve the evidence
precedence:

`source_stated > inferred_from_source > culinary_baseline > unknown`

Never convert `unknown` into absence, false, allergen-safe, or dietary-safe.

## Contract-first development

- Import shared vocabulary, environment names, and version tokens only from
  `@foodseyo/contracts`.
- Treat `docs/TECH_STACK.md` as the only source of approved platform choices.
  A legacy repository or team note cannot introduce Supabase, a new runtime,
  a new environment name, or automatic deployment behavior.
- Do not redefine shared enums or status strings inside an app or feature
  package.
- Contract changes require a dedicated contract PR and review from all three
  workstream owners before dependent implementation merges.
- Do not weaken source provenance, restaurant confirmation, cache identity,
  ownership, transaction, or safety rules to make a feature easier.

## Autonomy and safety

Perform routine repository, CLI, API, test, and Development-only platform work
autonomously. Ask the account holder only for login, MFA, account registration,
legal acceptance, billing, secret entry that cannot remain inside an
authenticated tool session, or an unapproved irreversible Production action.
Use official CLI/API fallbacks when browser automation fails.

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
