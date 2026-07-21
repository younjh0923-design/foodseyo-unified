import assert from "node:assert/strict";

import {
  CONTRACT_VERSIONS,
  MODULE_INTERFACE_VERSION,
  PUBLIC_ERROR_REGISTRY,
  PublicErrorEnvelopeSchema,
  RestaurantResolutionSchema,
  type PortInvocationContext,
  type RestaurantResolution,
} from "@foodseyo/contracts";

import {
  InMemoryMenuCacheRepository,
  MenuCacheService,
  type MenuCacheCandidate,
  type MenuCacheRepository,
} from "../src/index.js";

const restaurantId = "50000000-0000-4000-8000-000000000001";
const googlePlaceId = "google_place_cache_service_branch";
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
      candidateId: "60000000-0000-4000-8000-000000000001",
      googlePlaceId,
      displayName: "Fixture Cache Service",
      fullAddress: "1 Cache Service Avenue, New York, NY",
      shortAddress: "Cache Service Avenue",
      location: { latitude: 40.743, longitude: -73.949 },
      matchSignals: ["name", "address", "location"],
      rank: 1,
      officialWebsiteUrl: null,
      localeEvidence,
    },
  ],
  selectedCandidateId: "60000000-0000-4000-8000-000000000001",
  restaurantId,
  confirmationEvidence: {
    kind: "user_action",
    actionRef: "action:menu-cache-service",
    recordedAt: "2026-07-19T12:00:00.000Z",
  },
  requiresUserConfirmation: false,
  canContinueMenuOnly: true,
  resolvedAt: "2026-07-19T12:00:00.000Z",
});
const now = "2026-07-20T12:00:00.000Z";
const context = (name: string): PortInvocationContext => ({
  contractVersion: MODULE_INTERFACE_VERSION,
  correlationId: `menu_cache_service_${name}`,
  timeoutMs: 5_000,
  signal: new AbortController().signal,
});
const candidate = (
  overrides: Partial<MenuCacheCandidate> = {},
): MenuCacheCandidate => ({
  googlePlaceId,
  menuVersion: {
    menuVersionId: "70000000-0000-4000-8000-000000000001",
    restaurantId,
    menuScope: "dinner",
    state: "active",
    versionOrdinal: 1,
    sourceRefs: ["80000000-0000-4000-8000-000000000001"],
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

const freshRepository = new InMemoryMenuCacheRepository([candidate()]);
const freshService = new MenuCacheService(freshRepository);
const fresh = await freshService.lookup(
  resolution,
  "dinner",
  "full_menu",
  now,
  context("fresh"),
);
assert.equal(fresh.status, "success");
if (fresh.status !== "success") throw new Error("fresh service lookup failed");
assert.equal(fresh.value.kind, "fresh_hit");
assert.equal(fresh.value.candidate?.coverage, "full_menu");

const expiredRepository = new InMemoryMenuCacheRepository([
  candidate({
    menuVersion: {
      ...candidate().menuVersion,
      validUntil: "2026-07-20T11:59:59.000Z",
    },
  }),
]);
const expired = await new MenuCacheService(expiredRepository).lookup(
  resolution,
  "dinner",
  "full_menu",
  now,
  context("expired"),
);
assert.equal(expired.status, "success");
if (expired.status !== "success") throw new Error("expired service lookup failed");
assert.equal(expired.value.kind, "stale");

const empty = await new MenuCacheService(
  new InMemoryMenuCacheRepository([]),
).lookup(
  resolution,
  "dinner",
  "full_menu",
  now,
  context("empty"),
);
assert.equal(empty.status, "success");
if (empty.status !== "success") throw new Error("empty service lookup failed");
assert.equal(empty.value.kind, "cache_miss");

const otherBranch = await new MenuCacheService(
  new InMemoryMenuCacheRepository([
    candidate({ googlePlaceId: "google_place_other_branch" }),
    candidate({
      menuVersion: {
        ...candidate().menuVersion,
        restaurantId: "50000000-0000-4000-8000-000000000002",
      },
    }),
  ]),
).lookup(
  resolution,
  "dinner",
  "full_menu",
  now,
  context("other-branch"),
);
assert.equal(otherBranch.status, "success");
if (otherBranch.status !== "success") {
  throw new Error("other branch service lookup failed");
}
assert.equal(otherBranch.value.kind, "cache_miss");

const partialRepository = new InMemoryMenuCacheRepository([
  candidate({ coverage: "partial_menu" }),
]);
const partialService = new MenuCacheService(partialRepository);
const partialHit = await partialService.lookup(
  resolution,
  "dinner",
  "partial_menu",
  now,
  context("partial-hit"),
);
assert.equal(partialHit.status, "success");
if (partialHit.status !== "success") throw new Error("partial lookup failed");
assert.equal(partialHit.value.kind, "fresh_hit");
assert.equal(partialHit.value.candidate?.coverage, "partial_menu");

const partialForFull = await partialService.lookup(
  resolution,
  "dinner",
  "full_menu",
  now,
  context("partial-for-full"),
);
assert.equal(partialForFull.status, "success");
if (partialForFull.status !== "success") {
  throw new Error("partial for full service lookup failed");
}
assert.equal(partialForFull.value.kind, "stale");
assert.equal(partialForFull.value.candidate?.coverage, "partial_menu");

const failureDefinition = PUBLIC_ERROR_REGISTRY.UPSTREAM_UNAVAILABLE;
const repositoryFailure = PublicErrorEnvelopeSchema.parse({
  error: {
    code: "UPSTREAM_UNAVAILABLE",
    message: failureDefinition.message,
    correlationId: "menu_cache_repository_failure",
    retryable: failureDefinition.retryable,
  },
  httpStatus: failureDefinition.httpStatus,
});
const failingRepository: MenuCacheRepository = {
  findCandidates: () =>
    Promise.resolve({ status: "error", error: repositoryFailure }),
};
const failure = await new MenuCacheService(failingRepository).lookup(
  resolution,
  "dinner",
  "full_menu",
  now,
  context("repository-failure"),
);
assert.equal(failure.status, "error");
if (failure.status !== "error") throw new Error("repository failure was lost");
assert.equal(failure.error, repositoryFailure);

const unconfirmedResolution: RestaurantResolution = {
  ...resolution,
  state: "candidate",
  selectedCandidateId: null,
  restaurantId: null,
  confirmationEvidence: null,
  requiresUserConfirmation: true,
  resolvedAt: null,
};
const unconfirmedRepository = new InMemoryMenuCacheRepository([candidate()]);
const unconfirmed = await new MenuCacheService(unconfirmedRepository).lookup(
  unconfirmedResolution,
  "dinner",
  "full_menu",
  now,
  context("unconfirmed"),
);
assert.equal(unconfirmed.status, "error");
if (unconfirmed.status !== "error") {
  throw new Error("unconfirmed resolution must fail before lookup");
}
assert.equal(unconfirmed.error.error.code, "INVALID_INPUT");
assert.equal(unconfirmedRepository.callCount, 0);

const storedInput = [candidate()] as const;
const storedInputSnapshot = structuredClone(storedInput);
const immutableRepository = new InMemoryMenuCacheRepository(storedInput);
const lookup = {
  googlePlaceId,
  restaurantId,
  menuScope: "dinner" as const,
};
const firstRead = await immutableRepository.findCandidates(
  lookup,
  context("immutable-first"),
);
const secondRead = await immutableRepository.findCandidates(
  lookup,
  context("immutable-second"),
);
assert.equal(firstRead.status, "success");
assert.equal(secondRead.status, "success");
if (firstRead.status !== "success" || secondRead.status !== "success") {
  throw new Error("immutable repository read failed");
}
assert.notEqual(firstRead.value, secondRead.value);
assert.notEqual(firstRead.value[0], secondRead.value[0]);
assert.notEqual(
  firstRead.value[0]?.menuVersion,
  secondRead.value[0]?.menuVersion,
);
assert.notEqual(
  firstRead.value[0]?.menuVersion.sourceRefs,
  secondRead.value[0]?.menuVersion.sourceRefs,
);
assert.deepEqual(firstRead.value, secondRead.value);
assert.deepEqual(storedInput, storedInputSnapshot);

const deterministicAgain = await freshService.lookup(
  resolution,
  "dinner",
  "full_menu",
  now,
  context("deterministic-again"),
);
assert.equal(deterministicAgain.status, "success");
if (deterministicAgain.status !== "success") {
  throw new Error("deterministic service lookup failed");
}
assert.deepEqual(deterministicAgain.value, fresh.value);

console.log("Menu cache repository/service validation passed.");
