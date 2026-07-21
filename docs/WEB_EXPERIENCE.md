# Web-experience candidate contract

## Status and authority

Issue #21 received all-owner proposal approval and is labeled
`status:approved`. This document and
`@foodseyo/contracts/web-experience` define the exact candidate contract for
the dedicated contract PR.

The candidate version is `web-experience/0.1.0` with status `candidate`.
It is deliberately separate from the frozen U1 `1.0.0` registry. No feature
may consume it until the exact contract PR receives all three owner approvals,
merges to `main`, and Issue #21 moves to `status:merged`.

## Sensitive intake request

`SubmissionIntakeRequest` contains exactly:

- `contractVersion`;
- zero or one `userSuppliedLink`;
- zero or more unique opaque `uploadedPhotoHandles`; and
- UTC `requestedAt`.

At least one input must exist across the link and photo-handle collection.
Link-only, photo-only, and combined requests are valid; an empty request is
invalid.

The request contains no correlation ID. `PortInvocationContext.correlationId`
remains the sole invocation correlation source. The raw link and opaque handles
are sensitive request-only values. They must not enter logs, public errors,
observability payload content, canonical storage, cache keys, progress events,
or UI response payloads.

The schema rejects additional image bytes, Base64, filenames, provider
references or responses, credentials, source bodies, and extracted menu
meaning. Exact URL validation, SSRF handling, upload transport, and upload
limits remain YTW-owned server implementation decisions and are not added to
this semantic contract.

## UI-safe progress

`UiWorkflowProgress` contains exactly:

- `contractVersion`;
- literal stage `source_acquisition`;
- phase `official_source_lookup` or `web_search_fallback`; and
- state `in_progress` or phase-local `complete`.

Phase-local `complete` says only that the named acquisition phase finished.
It does not claim canonical validation, explanation, publication, overall
workflow success, or permission to present final menu meaning.

The schema rejects confirmation or user-action meaning, failure or timeout
meaning, terminal success, raw URLs or images, source bodies, menu text,
content handles, source fingerprints, extracted claims, provider details,
credentials, database rows, and ORM types.

Restaurant confirmation continues through
`RestaurantResolution.requiresUserConfirmation` and the existing
`PublicOutcome` members. Failures remain existing `PublicOutcome` or
`PublicErrorEnvelope` values. Retry is a new invocation, cancellation uses
`PortInvocationContext.signal`, and timeout remains `UPSTREAM_TIMEOUT`.

## Port and compatibility impact

The existing `UiOperationalEventPort` accepts `UiWorkflowProgress` as one
additional UI-safe event member. Existing frozen restaurant resolution,
outcome, error, invocation, and application-result meanings are not
reinterpreted. The event carries its own candidate version token.

An exhaustive consumer of `UiSafeOperationalEvent` must add the progress
branch before it consumes the merged candidate. That compatibility work belongs
in later feature PRs after this contract PR merges.

The candidate adds no public error or outcome, environment name, persistence
shape, cache meaning, migration, provider permission, Preview or Production
change, or deployment behavior.

## Deterministic validation

Network-free fixtures cover:

- link-only, photo-only, and combined intake;
- official-source and Web Search phases in both allowed states;
- empty input, duplicate correlation, duplicate or malformed handles, and
  invalid time;
- sensitive intake field leakage;
- raw or semantic progress leakage; and
- progress values that impersonate confirmation, failure, timeout, canonical
  work, publication, or final success.

Every invalid fixture declares the exact stable issue code and path required
from the runtime schema. `pnpm validate:web-experience` executes those
fixtures and verifies that validation errors never include the sensitive raw
link or content handle.
