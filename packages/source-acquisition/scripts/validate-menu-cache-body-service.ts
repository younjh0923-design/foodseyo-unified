import assert from "node:assert/strict";

import {
  CONTRACT_VERSIONS,
  MODULE_INTERFACE_VERSION,
  PUBLIC_ERROR_REGISTRY,
  PublicErrorEnvelopeSchema,
  RestaurantResolutionSchema,
  type PortInvocationContext,
} from "@foodseyo/contracts";

import {
  InMemoryMenuCacheBodyRepository,
  InMemoryMenuCacheRepository,
  MenuCacheBodyService,
  MenuCacheService,
  type MenuCacheBody,
  type MenuCacheBodyRepository,
  type MenuCacheCandidate,
} from "../src/index.js";

const restaurantId = "90000000-0000-4000-8000-000000000001";
const candidateId = "91000000-0000-4000-8000-000000000001";
const menuVersionId = "92000000-0000-4000-8000-000000000001";
const googlePlaceId = "google_place_cache_body_branch";
const resolution = RestaurantResolutionSchema.parse({
  contractVersion: CONTRACT_VERSIONS.restaurantResolution,
  state: "user_confirmed",
  candidates: [
    {
      contractVersion: CONTRACT_VERSIONS.restaurantResolution,
      candidateId,
      googlePlaceId,
      displayName: "Fixture Cache Body",
      fullAddress: "1 Cache Body Avenue, New York, NY",
      shortAddress: "Cache Body Avenue",
      location: { latitude: 40.743, longitude: -73.949 },
      matchSignals: ["name", "address"],
      rank: 1,
      officialWebsiteUrl: null,
      localeEvidence: {
        countryCode: "US",
        countryBasis: "source_stated",
        currencyCode: "USD",
        currencyBasis: "source_stated",
      },
    },
  ],
  selectedCandidateId: candidateId,
  restaurantId,
  confirmationEvidence: {
    kind: "user_action",
    actionRef: "action:menu-cache-body",
    recordedAt: "2026-07-19T12:00:00.000Z",
  },
  requiresUserConfirmation: false,
  canContinueMenuOnly: true,
  resolvedAt: "2026-07-19T12:00:00.000Z",
});
const now = "2026-07-20T12:00:00.000Z";
const context = (name: string): PortInvocationContext => ({
  contractVersion: MODULE_INTERFACE_VERSION,
  correlationId: `menu_cache_body_${name}`,
  timeoutMs: 5_000,
  signal: new AbortController().signal,
});
const cacheCandidate = (
  overrides: Partial<MenuCacheCandidate> = {},
): MenuCacheCandidate => ({
  googlePlaceId,
  menuVersion: {
    menuVersionId,
    restaurantId,
    menuScope: "dinner",
    state: "active",
    versionOrdinal: 1,
    sourceRefs: ["93000000-0000-4000-8000-000000000001"],
    collectedAt: "2026-07-19T11:00:00.000Z",
    validFrom: "2026-07-19T11:00:00.000Z",
    validUntil: "2026-07-21T12:00:00.000Z",
    supersedesMenuVersionId: null,
  },
  publicationState: "eligible",
  coverage: "full_menu",
  localeEvidence: {
    countryCode: "US",
    countryBasis: "source_stated",
    currencyCode: "USD",
    currencyBasis: "source_stated",
  },
  ...overrides,
});
const body = (overrides: Partial<MenuCacheBody> = {}): MenuCacheBody => ({
  menuVersionId,
  menuScope: "dinner",
  coverage: "full_menu",
  menuItems: [
    {
      menuItemId: "94000000-0000-4000-8000-000000000001",
      menuVersionId,
      sectionIndex: 0,
      itemIndex: 0,
      name: "Fixture Dish",
      description: null,
      price: { amountMinor: 1500, currency: "USD" },
      optionTexts: ["Spicy"],
      sourceEvidence: [
        {
          kind: "menu_source",
          sourceRef: "95000000-0000-4000-8000-000000000001",
          sourceIndexes: [0],
        },
      ],
    },
  ],
  ...overrides,
});
const freshCacheService = (candidate = cacheCandidate()) =>
  new MenuCacheService(new InMemoryMenuCacheRepository([candidate]));

const matchingBodyRepository = new InMemoryMenuCacheBodyRepository([body()]);
const matching = await new MenuCacheBodyService(
  freshCacheService(),
  matchingBodyRepository,
).lookup(
  resolution,
  "dinner",
  "full_menu",
  now,
  context("matching"),
);
assert.equal(matching.status, "success");
if (matching.status !== "success") throw new Error("matching body failed");
assert.equal(matching.value.kind, "fresh_hit");
if (matching.value.kind !== "fresh_hit") {
  throw new Error("matching body was not a fresh hit");
}
assert.equal(matching.value.body.menuVersionId, menuVersionId);
assert.equal(matching.value.body.coverage, "full_menu");

const missingBody = await new MenuCacheBodyService(
  freshCacheService(),
  new InMemoryMenuCacheBodyRepository([]),
).lookup(
  resolution,
  "dinner",
  "full_menu",
  now,
  context("missing"),
);
assert.equal(missingBody.status, "error");
if (missingBody.status !== "error") throw new Error("missing body must fail");
assert.equal(missingBody.error.error.code, "INVALID_UPSTREAM_RESULT");

const staleBodyRepository = new InMemoryMenuCacheBodyRepository([body()]);
const stale = await new MenuCacheBodyService(
  freshCacheService(
    cacheCandidate({
      menuVersion: {
        ...cacheCandidate().menuVersion,
        validUntil: "2026-07-20T11:59:59.000Z",
      },
    }),
  ),
  staleBodyRepository,
).lookup(
  resolution,
  "dinner",
  "full_menu",
  now,
  context("stale"),
);
assert.equal(stale.status, "success");
if (stale.status !== "success") throw new Error("stale lookup failed");
assert.equal(stale.value.kind, "stale");
assert.equal(staleBodyRepository.callCount, 0);

const missBodyRepository = new InMemoryMenuCacheBodyRepository([body()]);
const miss = await new MenuCacheBodyService(
  new MenuCacheService(new InMemoryMenuCacheRepository([])),
  missBodyRepository,
).lookup(
  resolution,
  "dinner",
  "full_menu",
  now,
  context("miss"),
);
assert.equal(miss.status, "success");
if (miss.status !== "success") throw new Error("miss lookup failed");
assert.equal(miss.value.kind, "cache_miss");
assert.equal(missBodyRepository.callCount, 0);

const failureDefinition = PUBLIC_ERROR_REGISTRY.UPSTREAM_UNAVAILABLE;
const repositoryFailure = PublicErrorEnvelopeSchema.parse({
  error: {
    code: "UPSTREAM_UNAVAILABLE",
    message: failureDefinition.message,
    correlationId: "menu_cache_body_repository_failure",
    retryable: failureDefinition.retryable,
  },
  httpStatus: failureDefinition.httpStatus,
});
const failingBodyRepository: MenuCacheBodyRepository = {
  findByMenuVersionId: () =>
    Promise.resolve({ status: "error", error: repositoryFailure }),
};
const bodyFailure = await new MenuCacheBodyService(
  freshCacheService(),
  failingBodyRepository,
).lookup(
  resolution,
  "dinner",
  "full_menu",
  now,
  context("failure"),
);
assert.equal(bodyFailure.status, "error");
if (bodyFailure.status !== "error") {
  throw new Error("body repository failure was lost");
}
assert.equal(bodyFailure.error, repositoryFailure);

const wrongVersionBody = await new MenuCacheBodyService(
  freshCacheService(),
  new InMemoryMenuCacheBodyRepository([
    body({ menuVersionId: "92000000-0000-4000-8000-000000000002" }),
  ]),
).lookup(
  resolution,
  "dinner",
  "full_menu",
  now,
  context("wrong-version"),
);
assert.equal(wrongVersionBody.status, "error");
if (wrongVersionBody.status !== "error") {
  throw new Error("wrong version body must fail");
}
assert.equal(wrongVersionBody.error.error.code, "INVALID_UPSTREAM_RESULT");

const partialCandidate = cacheCandidate({ coverage: "partial_menu" });
const partialBody = body({ coverage: "partial_menu" });
const partial = await new MenuCacheBodyService(
  freshCacheService(partialCandidate),
  new InMemoryMenuCacheBodyRepository([partialBody]),
).lookup(
  resolution,
  "dinner",
  "partial_menu",
  now,
  context("partial"),
);
assert.equal(partial.status, "success");
if (partial.status !== "success" || partial.value.kind !== "fresh_hit") {
  throw new Error("partial body lookup failed");
}
assert.equal(partial.value.candidate.coverage, "partial_menu");
assert.equal(partial.value.body.coverage, "partial_menu");

const storedBodies = [body()] as const;
const storedBodiesSnapshot = structuredClone(storedBodies);
const immutableRepository = new InMemoryMenuCacheBodyRepository(storedBodies);
const firstRead = await immutableRepository.findByMenuVersionId(
  menuVersionId,
  context("immutable-first"),
);
const secondRead = await immutableRepository.findByMenuVersionId(
  menuVersionId,
  context("immutable-second"),
);
assert.equal(firstRead.status, "success");
assert.equal(secondRead.status, "success");
if (firstRead.status !== "success" || secondRead.status !== "success") {
  throw new Error("body defensive read failed");
}
assert.notEqual(firstRead.value, secondRead.value);
assert.notEqual(firstRead.value?.menuItems, secondRead.value?.menuItems);
assert.notEqual(firstRead.value?.menuItems[0], secondRead.value?.menuItems[0]);
assert.notEqual(
  firstRead.value?.menuItems[0]?.sourceEvidence,
  secondRead.value?.menuItems[0]?.sourceEvidence,
);
assert.deepEqual(firstRead.value, secondRead.value);
assert.deepEqual(storedBodies, storedBodiesSnapshot);

const deterministicAgain = await new MenuCacheBodyService(
  freshCacheService(),
  matchingBodyRepository,
).lookup(
  resolution,
  "dinner",
  "full_menu",
  now,
  context("deterministic"),
);
assert.equal(deterministicAgain.status, "success");
if (deterministicAgain.status !== "success") {
  throw new Error("deterministic body lookup failed");
}
assert.deepEqual(deterministicAgain.value, matching.value);

console.log("Menu cache body service validation passed.");
