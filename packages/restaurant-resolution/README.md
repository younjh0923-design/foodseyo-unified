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
candidate, conflicting, user-confirmed, externally-verified, and rejected
resolution plus a coordinator that emits only frozen UI-safe operational
values. Package-local, network-free fixtures exercise a strict fake Places
adapter and provider-to-candidate normalization.
The original deterministic fake remains available for parallel consumers.

Raw photo/link intake and new progress events are not implemented here. They
require the still-proposed contract in Issue #21; this package does not create
a temporary intake DTO or progress enum while that proposal is unmerged.
Server-internal clue fixtures contain no raw URL, upload bytes, filename,
provider response, or menu meaning. A first-ranked candidate always remains
unconfirmed until user-action or valid external evidence is supplied.
