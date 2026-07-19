# U1.5 module interfaces

## Status and authority

This document defines the approved U1.5 interface boundary. Issue #14 and PR
#15 are merged and closed. The U1.6 compatibility candidate freezes the
interface as `module-interfaces/1.0.0`. Feature code may consume it only after
the exact final U1.6 PR HEAD receives all-owner approval, merges to `main`, and
U1.6 is recorded `DONE`.

U1.5 adds no provider, database, UI, transport, deployment, or feature
implementation. It wraps the existing U1.3 DTOs; it does not redefine them.

## Shared invocation and result discipline

Every server-side port receives `PortInvocationContext` with:

- `module-interfaces/1.0.0`;
- a safe correlation ID;
- a positive bounded timeout in milliseconds;
- an `AbortSignal`.

Every value-producing port returns `PortResult<T>` as one of:

- a successful frozen contract value;
- an existing U1.3 `PublicOutcome`;
- an existing U1.3 `PublicErrorEnvelope`.

Provider and database exceptions, raw responses, URLs, source bodies, content,
credentials, and environment values never cross this result boundary.

## Package boundaries

The package list follows the approved Issue #14 ownership and dependency
boundaries. A separate package exists only where it prevents one workstream
from importing another workstream's implementation.

| Package | Required boundary | Public U1.5 fake |
| --- | --- | --- |
| `@foodseyo/restaurant-resolution` | YTW-owned branch resolution plus the UI-safe operational lane | `FakeRestaurantResolutionPort`, `FakeUiOperationalEventPort` |
| `@foodseyo/source-acquisition` | YTW-owned official/Web Search source acquisition, isolated from restaurant ranking and extraction | `FakeMenuSourceAcquisitionPort` |
| `@foodseyo/menu-analysis` | the extraction → canonical validation → constrained explanation trust sequence and application orchestration | extraction, canonical-validation, explanation, and workflow fakes |
| `@foodseyo/dish-knowledge` | reviewed culinary-baseline lookup, separated from unreviewed knowledge and merge behavior | `FakeDishKnowledgePort` |
| `@foodseyo/merge-policy` | pure deterministic evidence precedence and effective-profile derivation | `FakeEffectiveProfileMergePort` |
| `@foodseyo/database` | publication side-effect boundary accepting only an eligible canonical analysis | `FakeAnalysisPublicationPort` |
| `@foodseyo/observability` | privacy-safe structural metadata sink shared by every workstream | `FakeSafeObservabilityPort` |

All seven packages depend only on `@foodseyo/contracts` in U1.5. They do not
depend on each other, so the graph has no cycle. The interface and DTO types
live only in `@foodseyo/contracts`; feature packages export deterministic fake
classes only.

## Trust sequence

```text
restaurant resolution
-> source acquisition
-> compact extraction (unvalidated)
-> canonical validation
-> reviewed Dish lookup and deterministic merge
-> constrained explanation
-> eligible-only publication
```

The direct YTW-to-Juhyung lane contains only `RestaurantResolution`,
`PublicOutcome`, or `PublicErrorEnvelope`. It never carries extracted menu
meaning. Explanation receives only `CanonicalMenuAnalysis`; publication
receives only `PublicationEligibleAnalysis`.

`isPublicationEligibleAnalysis` is the explicit guard between
`analysis_only` and publication. An analysis is eligible only when
`publicationState` is `eligible` and a `RestaurantMenuVersion` is present.
Application results additionally bind the explanation, menu-item explanation
blocks, and optional publication receipt to that same canonical analysis.
An `analysis_only` result cannot carry a publication receipt. Every non-null
receipt must match the eligible analysis ID and menu-version ID. The
publication fake enforces the same binding against its invocation input rather
than trusting a separately valid configured receipt.

## Deterministic fake contract

Each fake:

- implements the same public port as a later real adapter;
- validates every invocation context, request, configured result, and emitted
  event at runtime before treating TypeScript values as trusted;
- returns a configured success, an existing U1.3 cancellation-safe
  `PublicOutcome`, or an existing `UPSTREAM_TIMEOUT` error;
- increments a deterministic call count;
- performs no environment lookup, provider call, database work, transport,
  logging, retry, clock read, or random operation;
- records only approved UI-safe or observability events where recording is the
  fake's purpose.

Cancellation is represented by an aborted `AbortSignal`. A deadline-expired
invocation uses an aborted signal whose reason is a `TimeoutError`; the positive
bounded `timeoutMs` remains configuration metadata and never becomes zero.
Event sinks receive the same invocation context as value ports and do not record
events after cancellation or deadline expiry.

The network-free fixtures execute actual valid and invalid values through the
runtime schemas or port boundary. They lock success, cancellation, timeout,
invalid fake plans, publication-ineligible, explanation/analysis identity,
menu-item membership, receipt/analysis identity, receipt/menu-version identity,
unsafe-observability, and internal-import cases by exact issue code and path.

## Import rules

- Import DTOs and ports from `@foodseyo/contracts` or its reviewed public
  exports.
- Import a fake through its package root.
- Never import another package's `src/` path.
- Never duplicate a U1.3 DTO, port, public code, vocabulary, or version in a
  feature package.
- A later real adapter remains behind the same port and does not change this
  contract without the contract-change process.

## Deferred work

U1.5 does not choose provider SDKs, retry implementations, framework transport,
database schema, migrations, repositories, ORM rows, UI components, deployment
behavior, or exact production adapter construction. U1.6 is the active
compatibility review gate; all U2 feature work remains blocked until it merges
and is recorded `DONE`.
