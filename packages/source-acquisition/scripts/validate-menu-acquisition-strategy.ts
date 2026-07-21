import assert from "node:assert/strict";

import {
  MenuAcquisitionStrategy,
  decideMenuAcquisitionStrategy,
  type MenuAcquisitionReuseOutcome,
  type MenuCacheBody,
  type MenuCacheCandidate,
  type UploadedImageReuseOutcome,
} from "../src/index.js";

const candidate: MenuCacheCandidate = {
  googlePlaceId: "google_place_strategy",
  menuVersion: {
    menuVersionId: "b0000000-0000-4000-8000-000000000001",
    restaurantId: "b1000000-0000-4000-8000-000000000001",
    menuScope: "dinner",
    state: "active",
    versionOrdinal: 1,
    sourceRefs: ["b2000000-0000-4000-8000-000000000001"],
    collectedAt: "2026-07-20T10:00:00.000Z",
    validFrom: "2026-07-20T10:00:00.000Z",
    validUntil: "2026-07-21T10:00:00.000Z",
    supersedesMenuVersionId: null,
  },
  publicationState: "eligible",
  coverage: "full_menu",
  localeEvidence: null,
};
const body: MenuCacheBody = {
  menuVersionId: candidate.menuVersion.menuVersionId,
  menuScope: "dinner",
  coverage: "full_menu",
  menuItems: [],
};
const uploadedImage = (
  kind: UploadedImageReuseOutcome["kind"],
): UploadedImageReuseOutcome => ({ kind });
const stale = (
  kind: UploadedImageReuseOutcome["kind"] | null,
): MenuAcquisitionReuseOutcome => ({
  kind: "stale_cache",
  candidate,
  uploadedImage: kind === null ? null : uploadedImage(kind),
});
const miss = (
  kind: UploadedImageReuseOutcome["kind"] | null,
): MenuAcquisitionReuseOutcome => ({
  kind: "cache_miss",
  uploadedImage: kind === null ? null : uploadedImage(kind),
});

const scenarios: readonly [
  string,
  MenuAcquisitionReuseOutcome,
  MenuAcquisitionStrategy,
][] = [
  [
    "fresh cache",
    { kind: "fresh_cache", candidate, body },
    MenuAcquisitionStrategy.USE_CACHE,
  ],
  [
    "stale full image",
    stale("menu_full"),
    MenuAcquisitionStrategy.REUSE_UPLOADED_IMAGE,
  ],
  [
    "stale partial image",
    stale("menu_partial"),
    MenuAcquisitionStrategy.REUSE_UPLOADED_IMAGE,
  ],
  [
    "stale storefront",
    stale("storefront"),
    MenuAcquisitionStrategy.DISCOVER_OFFICIAL_SOURCE,
  ],
  [
    "stale unknown",
    stale("unknown"),
    MenuAcquisitionStrategy.DISCOVER_OFFICIAL_SOURCE,
  ],
  [
    "stale without image",
    stale(null),
    MenuAcquisitionStrategy.DISCOVER_OFFICIAL_SOURCE,
  ],
  [
    "miss full image",
    miss("menu_full"),
    MenuAcquisitionStrategy.REUSE_UPLOADED_IMAGE,
  ],
  [
    "miss partial image",
    miss("menu_partial"),
    MenuAcquisitionStrategy.REUSE_UPLOADED_IMAGE,
  ],
  [
    "miss storefront",
    miss("storefront"),
    MenuAcquisitionStrategy.DISCOVER_OFFICIAL_SOURCE,
  ],
  [
    "miss unknown",
    miss("unknown"),
    MenuAcquisitionStrategy.DISCOVER_OFFICIAL_SOURCE,
  ],
  [
    "miss without image",
    miss(null),
    MenuAcquisitionStrategy.WAIT_FOR_NEXT_STAGE,
  ],
];

for (const [name, outcome, expected] of scenarios) {
  const snapshot = structuredClone(outcome);
  const first = decideMenuAcquisitionStrategy(outcome);
  const second = decideMenuAcquisitionStrategy(outcome);
  assert.equal(first, expected, name);
  assert.equal(second, expected, `${name} deterministic`);
  assert.deepEqual(outcome, snapshot, `${name} immutable`);
}

console.log("Menu acquisition strategy validation passed.");
