# `packages/restaurant-resolution`

Owner: `ytw010629`

Restaurant candidates, Google Places adapter interfaces, confirmation evidence,
safe menu-only fallback, and UI-safe candidate/progress/action outcomes. A
ranking result is never automatic confirmation.

This package does not own the browser UI, canonical menu facts, database
persistence, or final explanation. Provider internals and unvalidated menu
meaning never enter the direct UI-safe outcome lane.

The package manifest is frozen at `1.0.0`. Real implementation starts only
after U1.6 merges to `main` and is recorded `DONE`.

U1.5 public surface: `RestaurantResolutionPort`,
`UiOperationalEventPort`, `FakeRestaurantResolutionPort`, and
`FakeUiOperationalEventPort`. This package exists separately because the
UI-safe confirmation lane has different trust and ownership from source
acquisition and canonical menu meaning. The U1.5 classes are deterministic
fakes only.
