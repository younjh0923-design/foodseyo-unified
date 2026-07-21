import assert from "node:assert/strict";

import {
  CONTRACT_VERSIONS,
  MODULE_INTERFACE_VERSION,
  RestaurantResolutionSchema,
  type PortInvocationContext,
  type RestaurantResolution,
} from "@foodseyo/contracts";

import {
  evaluateMenuCacheCandidates,
  type MenuCacheCandidate,
} from "../src/index.js";

const restaurantId = "10000000-0000-4000-8000-000000000001";
const placeId = "google_place_fixture_alpha";
const localeEvidence = {
  countryCode: "US",
  countryBasis: "source_stated" as const,
  currencyCode: "USD",
  currencyBasis: "source_stated" as const,
};
const resolution = RestaurantResolutionSchema.parse({
  contractVersion: CONTRACT_VERSIONS.restaurantResolution,
  state: "user_confirmed",
  candidates: [
    {
      contractVersion: CONTRACT_VERSIONS.restaurantResolution,
      candidateId: "20000000-0000-4000-8000-000000000001",
      googlePlaceId: placeId,
      displayName: "Fixture Alpha",
      fullAddress: "1 Fixture Avenue, New York, NY",
      shortAddress: "Fixture Avenue",
      location: { latitude: 40.743, longitude: -73.949 },
      matchSignals: ["name", "address", "location"],
      rank: 1,
      officialWebsiteUrl: null,
      localeEvidence,
    },
  ],
  selectedCandidateId: "20000000-0000-4000-8000-000000000001",
  restaurantId,
  confirmationEvidence: {
    kind: "user_action",
    actionRef: "action:menu-cache-validation",
    recordedAt: "2026-07-19T12:00:00.000Z",
  },
  requiresUserConfirmation: false,
  canContinueMenuOnly: true,
  resolvedAt: "2026-07-19T12:00:00.000Z",
});
const now = "2026-07-20T12:00:00.000Z";
const context = (name: string): PortInvocationContext => ({
  contractVersion: MODULE_INTERFACE_VERSION,
  correlationId: `menu_cache_${name}`,
  timeoutMs: 5_000,
  signal: new AbortController().signal,
});
const cacheCandidate = (
  overrides: Partial<MenuCacheCandidate> = {},
): MenuCacheCandidate => ({
  googlePlaceId: placeId,
  menuVersion: {
    menuVersionId: "30000000-0000-4000-8000-000000000001",
    restaurantId,
    menuScope: "dinner",
    state: "active",
    versionOrdinal: 1,
    sourceRefs: ["40000000-0000-4000-8000-000000000001"],
    collectedAt: "2026-07-19T11:00:00.000Z",
    validFrom: "2026-07-19T11:00:00.000Z",
    validUntil: "2026-07-21T12:00:00.000Z",
    supersedesMenuVersionId: null,
  },
  publicationState: "eligible",
  coverage: "full_menu",
  localeEvidence,
  ...overrides,
});

const fresh = evaluateMenuCacheCandidates(
  resolution,
  "dinner",
  "full_menu",
  [cacheCandidate()],
  now,
  context("fresh"),
);
assert.equal(fresh.status, "success");
if (fresh.status !== "success") throw new Error("fresh lookup failed");
assert.equal(fresh.value.kind, "fresh_hit");
assert.equal(fresh.value.candidate?.coverage, "full_menu");

const expired = evaluateMenuCacheCandidates(
  resolution,
  "dinner",
  "full_menu",
  [
    cacheCandidate({
      menuVersion: {
        ...cacheCandidate().menuVersion,
        validUntil: "2026-07-20T11:59:59.000Z",
      },
    }),
  ],
  now,
  context("expired"),
);
assert.equal(expired.status, "success");
if (expired.status !== "success") throw new Error("expired lookup failed");
assert.equal(expired.value.kind, "stale");

const otherPlace = evaluateMenuCacheCandidates(
  resolution,
  "dinner",
  "full_menu",
  [
    cacheCandidate({
      googlePlaceId: "google_place_other",
      menuVersion: {
        ...cacheCandidate().menuVersion,
        restaurantId: "10000000-0000-4000-8000-000000000002",
      },
    }),
  ],
  now,
  context("other-place"),
);
assert.equal(otherPlace.status, "success");
if (otherPlace.status !== "success") throw new Error("other place lookup failed");
assert.equal(otherPlace.value.kind, "cache_miss");

const sameBrandOtherBranch = evaluateMenuCacheCandidates(
  resolution,
  "dinner",
  "full_menu",
  [cacheCandidate({ googlePlaceId: "google_place_same_brand_branch" })],
  now,
  context("same-brand-branch"),
);
assert.equal(sameBrandOtherBranch.status, "success");
if (sameBrandOtherBranch.status !== "success") {
  throw new Error("same brand branch lookup failed");
}
assert.equal(sameBrandOtherBranch.value.kind, "cache_miss");

const otherRestaurant = evaluateMenuCacheCandidates(
  resolution,
  "dinner",
  "full_menu",
  [
    cacheCandidate({
      menuVersion: {
        ...cacheCandidate().menuVersion,
        restaurantId: "10000000-0000-4000-8000-000000000003",
      },
    }),
  ],
  now,
  context("other-restaurant"),
);
assert.equal(otherRestaurant.status, "success");
if (otherRestaurant.status !== "success") {
  throw new Error("other restaurant lookup failed");
}
assert.equal(otherRestaurant.value.kind, "cache_miss");

const unpublished = evaluateMenuCacheCandidates(
  resolution,
  "dinner",
  "full_menu",
  [cacheCandidate({ publicationState: "analysis_only" })],
  now,
  context("unpublished"),
);
assert.equal(unpublished.status, "success");
if (unpublished.status !== "success") {
  throw new Error("unpublished lookup failed");
}
assert.equal(unpublished.value.kind, "cache_miss");

const partial = evaluateMenuCacheCandidates(
  resolution,
  "dinner",
  "partial_menu",
  [cacheCandidate({ coverage: "partial_menu" })],
  now,
  context("partial"),
);
assert.equal(partial.status, "success");
if (partial.status !== "success") throw new Error("partial lookup failed");
assert.equal(partial.value.kind, "fresh_hit");
assert.equal(partial.value.candidate?.coverage, "partial_menu");

const partialForFull = evaluateMenuCacheCandidates(
  resolution,
  "dinner",
  "full_menu",
  [cacheCandidate({ coverage: "partial_menu" })],
  now,
  context("partial-for-full"),
);
assert.equal(partialForFull.status, "success");
if (partialForFull.status !== "success") {
  throw new Error("partial for full lookup failed");
}
assert.equal(partialForFull.value.kind, "stale");
assert.equal(partialForFull.value.candidate?.coverage, "partial_menu");

const localeConflict = evaluateMenuCacheCandidates(
  resolution,
  "dinner",
  "full_menu",
  [
    cacheCandidate({
      localeEvidence: { ...localeEvidence, currencyCode: "CAD" },
    }),
  ],
  now,
  context("locale-conflict"),
);
assert.equal(localeConflict.status, "success");
if (localeConflict.status !== "success") {
  throw new Error("locale conflict lookup failed");
}
assert.equal(localeConflict.value.kind, "stale");

const unconfirmedResolution: RestaurantResolution = {
  ...resolution,
  state: "candidate",
  selectedCandidateId: null,
  restaurantId: null,
  confirmationEvidence: null,
  requiresUserConfirmation: true,
  resolvedAt: null,
};
const unconfirmed = evaluateMenuCacheCandidates(
  unconfirmedResolution,
  "dinner",
  "full_menu",
  [cacheCandidate()],
  now,
  context("unconfirmed"),
);
assert.equal(unconfirmed.status, "error");
if (unconfirmed.status !== "error") {
  throw new Error("unconfirmed resolution must fail");
}
assert.equal(unconfirmed.error.error.code, "INVALID_INPUT");

const newer = cacheCandidate({
  menuVersion: {
    ...cacheCandidate().menuVersion,
    menuVersionId: "30000000-0000-4000-8000-000000000002",
    versionOrdinal: 2,
    collectedAt: "2026-07-20T10:00:00.000Z",
  },
});
const cacheInput = [newer, cacheCandidate()] as const;
const cacheInputSnapshot = structuredClone(cacheInput);
const firstOrder = evaluateMenuCacheCandidates(
  resolution,
  "dinner",
  "full_menu",
  cacheInput,
  now,
  context("deterministic-first"),
);
const reverseOrder = evaluateMenuCacheCandidates(
  resolution,
  "dinner",
  "full_menu",
  [...cacheInput].reverse(),
  now,
  context("deterministic-reverse"),
);
assert.equal(firstOrder.status, "success");
assert.equal(reverseOrder.status, "success");
if (firstOrder.status !== "success" || reverseOrder.status !== "success") {
  throw new Error("deterministic lookup failed");
}
assert.equal(firstOrder.value.kind, "fresh_hit");
assert.equal(reverseOrder.value.kind, "fresh_hit");
assert.equal(
  firstOrder.value.candidate?.menuVersion.menuVersionId,
  "30000000-0000-4000-8000-000000000002",
);
assert.equal(
  reverseOrder.value.candidate?.menuVersion.menuVersionId,
  firstOrder.value.candidate?.menuVersion.menuVersionId,
);
assert.deepEqual(cacheInput, cacheInputSnapshot);

console.log("Menu cache decision validation passed.");
