# `packages/restaurant-resolution`

Owner: `ytw010629`

Restaurant candidates, Google Places adapter interfaces, confirmation evidence,
safe menu-only fallback, and frozen UI-safe candidate/action/outcome values. A
ranking result is never automatic confirmation.

This package does not own the browser UI, canonical menu facts, database
persistence, or final explanation. Provider internals and unvalidated menu
meaning never enter the direct UI-safe outcome lane.

The package manifest and shared interfaces are frozen at `1.0.0`.

U1.5 public surface: `RestaurantResolutionPort`,
`UiOperationalEventPort`, `FakeRestaurantResolutionPort`, and
`FakeUiOperationalEventPort`. U2.3 adds a frozen-port implementation for
candidate, conflicting, user-confirmed, and externally-verified resolution,
and preserves an already typed state without interpreting missing user input as
rejection. A coordinator emits only frozen UI-safe operational values.
Package-local, network-free fixtures exercise a strict fake Places adapter and
provider-to-candidate normalization.
The original deterministic fake remains available for parallel consumers.

Raw photo/link intake and new progress events are not implemented here. They
are now defined by merged Issue #21 at
`@foodseyo/contracts/web-experience`; dependent implementation must consume
that reviewed public entry point. This package still does not create a local
intake DTO or progress enum.
Server-internal clue fixtures contain no raw URL, upload bytes, filename,
provider response, or menu meaning. A first-ranked candidate always remains
unconfirmed until user-action or valid external evidence is supplied.

## S1.1 Google Places thin path

`GooglePlacesTextSearchAdapter` is a server-only, injected implementation of
the existing package-local `GooglePlacesCandidateAdapter`. Server composition
uses `createGooglePlacesTextSearchAdapterFromEnvironment`, which reads only the
frozen `SERVER_ENV_NAMES.googlePlacesApiKey` (`GOOGLE_PLACES_API_KEY`) entry and
fails closed when it is absent. The key is never read by browser code, returned,
or logged.

The adapter follows Google Places API (New)
[Text Search](https://developers.google.com/maps/documentation/places/web-service/text-search):
an HTTP `POST` to `places:searchText`, an API-key header, and an explicit field
mask. It requests only `places.id`, `places.displayName`,
`places.formattedAddress`, and `places.location`. Search location is a bias,
not confirmation. Place ID remains `googlePlaceId`; request-scoped candidate
UUIDs remain separate, and neither provider rank nor proximity supplies user
confirmation or external-verification evidence.

The existing finder maps the provider-normalized records through the frozen
`RestaurantCandidate` runtime schema and bounds results to ten. Missing results
preserve `RESTAURANT_NOT_RESOLVED` with menu-only continuation. Provider
failures use the frozen public error registry. The invocation signal and
bounded timeout race the whole provider response/parsing operation, so a late
success or rejection after cancellation/deadline cannot expose candidate
identity.

The Google adapter and its normalized provider records are package-internal
server composition details, not public persistence or publication contracts.
Only the finder's frozen `RestaurantCandidate` projection is UI-safe:
`candidateId` is request-scoped, while `googlePlaceId` is only a Google external
reference. Neither value, candidate creation, nor provider rank establishes a
canonical restaurant identity. Confirmation remains independent of persistence
and may validly produce a confirmed resolution with `restaurantId: null`.

Any approved UI composition that displays these projected Google candidates is
responsible for presenting the attribution required by Google Places policies.
It must consume only the UI-safe projection and must not receive the adapter's
normalized records or raw Google response. This package does not create a
durable Google candidate, persistence, publication, database, cache, or UI
contract.

`validate-google-places-thin-path.ts` is network-free. It injects deterministic
fetch, ID, timeout, success, failure, late-settlement, and provider-internal
field fixtures; no automated test calls Google. No provider response is cached,
persisted, or logged.
