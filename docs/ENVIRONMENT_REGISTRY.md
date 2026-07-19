# Environment and feature-flag registry

## Contract status

This document specifies U1.4 metadata for the approved environment names. The
U1.6 compatibility candidate freezes it as `environment-registry/1.0.0`.
Feature code may consume it only after the exact final U1.6 PR HEAD receives
all-owner approval, merges to `main`, and U1.6 is recorded `DONE`.

The executable source is `ENVIRONMENT_REGISTRY` in `@foodseyo/contracts`. The
registry contains no environment values, credentials, URLs, model values, or
tokens.

## Policy legend

- **R**: required in that environment;
- **C**: conditionally required by the named capability or operator action;
- **O**: optional and governed by its documented default;
- **F**: forbidden.

Development, Preview, and Production refer to their isolated platform
environments. Test means the network-free automated test process.

## Approved server-runtime variables

| Name | Owner | Class | Dev | Preview | Prod | Test | Requirement / validation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `FOODSEYO_RUNTIME_ENV` | Youn | non-secret | R | R | R | R | always / approved runtime environment |
| `APP_BASE_URL` | Juhyung | non-secret | R | R | R | O | application runs / absolute HTTP(S) URL |
| `DATABASE_URL` | Youn | secret | C | C | C | F | persistence enabled / pooled PostgreSQL URL |
| `OPENAI_API_KEY` | Youn | secret | C | C | C | F | any OpenAI stage enabled / non-empty secret |
| `OPENAI_MENU_EXTRACTION_MODEL` | YTW | non-secret | C | C | C | F | extraction enabled / non-empty model identifier |
| `OPENAI_WEB_SEARCH_MODEL` | YTW | non-secret | C | C | C | F | Web Search enabled / non-empty model identifier |
| `OPENAI_EXPLANATION_MODEL` | Juhyung | non-secret | C | C | C | F | explanation enabled / non-empty model identifier |
| `GOOGLE_PLACES_API_KEY` | YTW | secret | C | C | C | F | restaurant resolution enabled / non-empty secret |
| `FEATURE_RESTAURANT_RESOLUTION` | YTW | non-secret | O | O | O | O | optional control / strict boolean |
| `FEATURE_WEB_SEARCH_DISCOVERY` | YTW | non-secret | O | O | O | O | optional control / strict boolean |
| `FEATURE_DISH_KNOWLEDGE_REUSE` | Youn | non-secret | O | O | O | O | optional control / strict boolean |
| `LOG_LEVEL` | Youn | non-secret | O | O | O | O | optional control / approved log level |

All values are server-side. `APP_BASE_URL`, model identifiers, flags, and log
level are non-secret, but their values still do not belong in logs or public
error payloads.

## Operator-only variable

| Name | Owner | Class | Dev | Preview | Prod | Test | Requirement / validation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `DATABASE_MIGRATION_URL` | Youn | secret | C | C | C | F | explicit operator migration command / direct PostgreSQL URL |

`DATABASE_MIGRATION_URL` never enters application runtime, Vercel application
or build variables, browser code, application tests, fixtures, documentation
values, or logs. A future migration checkpoint supplies it only through a
dedicated operator or migration-CI environment.

## Feature-flag semantics

Only the exact lowercase string `true` enables a feature. `false`, missing
input, empty input, different casing, and malformed input all evaluate to
disabled. This fail-closed rule prevents accidental activation and does not
authorize any feature before its task and release gates are complete.

Flags control containment and rollback. They do not make an incomplete
submission requirement optional.

## Rejected names and boundaries

- no `NEXT_PUBLIC_*` environment name is approved;
- no `SUPABASE_*` name is approved;
- `OPENAI_MODEL`, `OPENAI_DEFAULT_MODEL`, `OPENAI_VISION_MODEL`, and
  `OPENAI_MENU_MODEL` are rejected legacy aliases;
- application runtime cannot read the operator registry;
- exact OpenAI model values remain pending their authorized configuration
  task;
- framework-specific loading and startup validation remain U2 work.

Adding or changing a name, owner, class, policy, requirement, validation rule,
or default is a shared environment contract change and follows
`CONTRACT_CHANGE_GUIDE.md`.
