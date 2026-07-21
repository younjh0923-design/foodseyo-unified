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
  FakeUploadedImageClassifier,
  InMemoryMenuCacheBodyRepository,
  InMemoryMenuCacheRepository,
  MenuAcquisitionReuseService,
  MenuCacheBodyService,
  MenuCacheService,
  UploadedImageReuseService,
  type MenuCacheBody,
  type MenuCacheCandidate,
  type MenuCacheRepository,
  type UploadedImageObservation,
  type UploadedImageReference,
} from "../src/index.js";

const restaurantId = "a0000000-0000-4000-8000-000000000001";
const candidateId = "a1000000-0000-4000-8000-000000000001";
const menuVersionId = "a2000000-0000-4000-8000-000000000001";
const googlePlaceId = "google_place_acquisition_reuse";
const now = "2026-07-20T12:00:00.000Z";
const resolution = RestaurantResolutionSchema.parse({
  contractVersion: CONTRACT_VERSIONS.restaurantResolution,
  state: "user_confirmed",
  candidates: [
    {
      contractVersion: CONTRACT_VERSIONS.restaurantResolution,
      candidateId,
      googlePlaceId,
      displayName: "Reuse Fixture",
      fullAddress: "1 Reuse Avenue, New York, NY",
      shortAddress: "Reuse Avenue",
      location: { latitude: 40.743, longitude: -73.949 },
      matchSignals: ["name", "address"],
      rank: 1,
      officialWebsiteUrl: null,
      localeEvidence: null,
    },
  ],
  selectedCandidateId: candidateId,
  restaurantId,
  confirmationEvidence: {
    kind: "user_action",
    actionRef: "action:menu-acquisition-reuse",
    recordedAt: "2026-07-19T12:00:00.000Z",
  },
  requiresUserConfirmation: false,
  canContinueMenuOnly: true,
  resolvedAt: "2026-07-19T12:00:00.000Z",
});
const reference: UploadedImageReference = {
  kind: "image_collection",
  contentHandle: "content:menu-acquisition-reuse",
  sensitivity: "sensitive_transient",
  byteCount: 2_048,
  pageCount: null,
};
const context = (name: string): PortInvocationContext => ({
  contractVersion: MODULE_INTERFACE_VERSION,
  correlationId: `menu_acquisition_reuse_${name}`,
  timeoutMs: 5_000,
  signal: new AbortController().signal,
});
const candidate = (
  overrides: Partial<MenuCacheCandidate> = {},
): MenuCacheCandidate => ({
  googlePlaceId,
  menuVersion: {
    menuVersionId,
    restaurantId,
    menuScope: "dinner",
    state: "active",
    versionOrdinal: 1,
    sourceRefs: ["a3000000-0000-4000-8000-000000000001"],
    collectedAt: "2026-07-19T11:00:00.000Z",
    validFrom: "2026-07-19T11:00:00.000Z",
    validUntil: "2026-07-21T12:00:00.000Z",
    supersedesMenuVersionId: null,
  },
  publicationState: "eligible",
  coverage: "full_menu",
  localeEvidence: null,
  ...overrides,
});
const body = (): MenuCacheBody => ({
  menuVersionId,
  menuScope: "dinner",
  coverage: "full_menu",
  menuItems: [
    {
      menuItemId: "a4000000-0000-4000-8000-000000000001",
      menuVersionId,
      sectionIndex: 0,
      itemIndex: 0,
      name: "Reuse Dish",
      description: null,
      price: null,
      optionTexts: [],
      sourceEvidence: [
        {
          kind: "menu_source",
          sourceRef: "a5000000-0000-4000-8000-000000000001",
          sourceIndexes: [0],
        },
      ],
    },
  ],
});
const observation = (
  overrides: Partial<UploadedImageObservation> = {},
): UploadedImageObservation => ({
  imageReadable: true,
  menuTextDetected: false,
  dishNamesDetected: false,
  pricesDetected: false,
  multipleMenuSectionsDetected: false,
  fullMenuScopeDetected: false,
  storefrontSignDetected: false,
  restaurantNameDetected: false,
  cropCompleteness: "unknown",
  confidence: 0.9,
  ...overrides,
});

const serviceFixture = (
  cacheCandidates: readonly MenuCacheCandidate[],
  bodies: readonly MenuCacheBody[],
  classifierResult: ConstructorParameters<typeof FakeUploadedImageClassifier>[0],
) => {
  const classifier = new FakeUploadedImageClassifier(classifierResult);
  return {
    classifier,
    service: new MenuAcquisitionReuseService(
      new MenuCacheBodyService(
        new MenuCacheService(
          new InMemoryMenuCacheRepository(cacheCandidates),
        ),
        new InMemoryMenuCacheBodyRepository(bodies),
      ),
      new UploadedImageReuseService(classifier),
    ),
  };
};
const input = (uploadedImageReference: UploadedImageReference | null) => ({
  resolution,
  menuScope: "dinner" as const,
  requestedCoverage: "full_menu" as const,
  now,
  uploadedImageReference,
});
const fullObservation = observation({
  menuTextDetected: true,
  dishNamesDetected: true,
  pricesDetected: true,
  multipleMenuSectionsDetected: true,
  cropCompleteness: "complete",
});
const staleCandidate = candidate({
  menuVersion: {
    ...candidate().menuVersion,
    validUntil: "2026-07-20T11:59:59.000Z",
  },
});

// A. A fresh body short-circuits image classification.
const freshFixture = serviceFixture(
  [candidate()],
  [body()],
  { status: "success", value: fullObservation },
);
const fresh = await freshFixture.service.resolve(
  input(reference),
  context("fresh"),
);
assert.equal(fresh.status, "success");
if (fresh.status !== "success") throw new Error("fresh reuse failed");
assert.equal(fresh.value.kind, "fresh_cache");
assert.equal(freshFixture.classifier.callCount, 0);
if (fresh.value.kind !== "fresh_cache") throw new Error("fresh kind lost");
assert.deepEqual(fresh.value.candidate, candidate());
assert.deepEqual(fresh.value.body, body());

// B/C. Stale candidates are preserved with optional image classification.
const staleWithImageFixture = serviceFixture(
  [staleCandidate],
  [],
  { status: "success", value: fullObservation },
);
const staleWithImage = await staleWithImageFixture.service.resolve(
  input(reference),
  context("stale-image"),
);
assert.equal(staleWithImage.status, "success");
if (staleWithImage.status !== "success") throw new Error("stale failed");
assert.equal(staleWithImage.value.kind, "stale_cache");
if (staleWithImage.value.kind !== "stale_cache") {
  throw new Error("stale candidate lost");
}
assert.deepEqual(staleWithImage.value.candidate, staleCandidate);
assert.equal(staleWithImage.value.uploadedImage?.kind, "menu_full");
assert.equal(staleWithImageFixture.classifier.callCount, 1);

const staleWithoutImageFixture = serviceFixture(
  [staleCandidate],
  [],
  { status: "success", value: fullObservation },
);
const staleWithoutImage = await staleWithoutImageFixture.service.resolve(
  input(null),
  context("stale-no-image"),
);
assert.equal(staleWithoutImage.status, "success");
if (
  staleWithoutImage.status !== "success" ||
  staleWithoutImage.value.kind !== "stale_cache"
) {
  throw new Error("stale without image failed");
}
assert.equal(staleWithoutImage.value.uploadedImage, null);
assert.equal(staleWithoutImageFixture.classifier.callCount, 0);

// D/E. A miss never invents a candidate and classifies only when referenced.
const missWithImageFixture = serviceFixture(
  [],
  [],
  { status: "success", value: fullObservation },
);
const missWithImage = await missWithImageFixture.service.resolve(
  input(reference),
  context("miss-image"),
);
assert.equal(missWithImage.status, "success");
if (missWithImage.status !== "success") throw new Error("miss failed");
assert.deepEqual(missWithImage.value, {
  kind: "cache_miss",
  uploadedImage: { kind: "menu_full" },
});
assert.equal(missWithImageFixture.classifier.callCount, 1);

const missWithoutImageFixture = serviceFixture(
  [],
  [],
  { status: "success", value: fullObservation },
);
const missWithoutImage = await missWithoutImageFixture.service.resolve(
  input(null),
  context("miss-no-image"),
);
assert.equal(missWithoutImage.status, "success");
if (missWithoutImage.status !== "success") {
  throw new Error("miss without image failed");
}
assert.deepEqual(missWithoutImage.value, {
  kind: "cache_miss",
  uploadedImage: null,
});
assert.equal(missWithoutImageFixture.classifier.callCount, 0);

// F/G. Typed dependency failures retain their original envelopes.
const failureDefinition = PUBLIC_ERROR_REGISTRY.UPSTREAM_UNAVAILABLE;
const cacheFailure = PublicErrorEnvelopeSchema.parse({
  error: {
    code: "UPSTREAM_UNAVAILABLE",
    message: failureDefinition.message,
    correlationId: "menu_acquisition_reuse_cache_failure",
    retryable: failureDefinition.retryable,
  },
  httpStatus: failureDefinition.httpStatus,
});
const failingRepository: MenuCacheRepository = {
  findCandidates: () =>
    Promise.resolve({ status: "error", error: cacheFailure }),
};
const cacheFailureClassifier = new FakeUploadedImageClassifier({
  status: "success",
  value: fullObservation,
});
const cacheFailureResult = await new MenuAcquisitionReuseService(
  new MenuCacheBodyService(
    new MenuCacheService(failingRepository),
    new InMemoryMenuCacheBodyRepository([]),
  ),
  new UploadedImageReuseService(cacheFailureClassifier),
).resolve(input(reference), context("cache-failure"));
assert.equal(cacheFailureResult.status, "error");
if (cacheFailureResult.status !== "error") {
  throw new Error("cache failure was lost");
}
assert.equal(cacheFailureResult.error, cacheFailure);
assert.equal(cacheFailureClassifier.callCount, 0);

const classifierFailure = PublicErrorEnvelopeSchema.parse({
  error: {
    code: "UPSTREAM_UNAVAILABLE",
    message: failureDefinition.message,
    correlationId: "menu_acquisition_reuse_classifier_failure",
    retryable: failureDefinition.retryable,
  },
  httpStatus: failureDefinition.httpStatus,
});
const classifierFailureFixture = serviceFixture(
  [],
  [],
  { status: "error", error: classifierFailure },
);
const classifierFailureResult = await classifierFailureFixture.service.resolve(
  input(reference),
  context("classifier-failure"),
);
assert.equal(classifierFailureResult.status, "error");
if (classifierFailureResult.status !== "error") {
  throw new Error("classifier failure was lost");
}
assert.equal(classifierFailureResult.error, classifierFailure);

// H/I. Existing partial, storefront, and unknown meanings pass through unchanged.
for (const [name, observed, expected] of [
  [
    "partial",
    observation({
      menuTextDetected: true,
      pricesDetected: true,
      cropCompleteness: "partial",
    }),
    "menu_partial",
  ],
  [
    "storefront",
    observation({ storefrontSignDetected: true, restaurantNameDetected: true }),
    "storefront",
  ],
  ["unknown", observation({ imageReadable: false, confidence: 0.2 }), "unknown"],
] as const) {
  const fixture = serviceFixture([], [], { status: "success", value: observed });
  const result = await fixture.service.resolve(input(reference), context(name));
  assert.equal(result.status, "success");
  if (result.status !== "success" || result.value.kind !== "cache_miss") {
    throw new Error(`${name} classification failed`);
  }
  assert.equal(result.value.uploadedImage?.kind, expected);
}

// J/K. Inputs and configured dependency values remain unchanged and repeat deterministically.
const immutableInput = input(reference);
const immutableInputSnapshot = structuredClone(immutableInput);
const immutableCandidates = [staleCandidate] as const;
const immutableCandidatesSnapshot = structuredClone(immutableCandidates);
const immutableObservation = observation({
  menuTextDetected: true,
  pricesDetected: true,
  cropCompleteness: "partial",
});
const immutableObservationSnapshot = structuredClone(immutableObservation);
const deterministicFixture = serviceFixture(
  immutableCandidates,
  [],
  { status: "success", value: immutableObservation },
);
const deterministicFirst = await deterministicFixture.service.resolve(
  immutableInput,
  context("deterministic-first"),
);
const deterministicSecond = await deterministicFixture.service.resolve(
  immutableInput,
  context("deterministic-second"),
);
assert.equal(deterministicFirst.status, "success");
assert.equal(deterministicSecond.status, "success");
if (
  deterministicFirst.status !== "success" ||
  deterministicSecond.status !== "success"
) {
  throw new Error("deterministic reuse failed");
}
assert.deepEqual(deterministicSecond.value, deterministicFirst.value);
assert.deepEqual(immutableInput, immutableInputSnapshot);
assert.deepEqual(immutableCandidates, immutableCandidatesSnapshot);
assert.deepEqual(immutableObservation, immutableObservationSnapshot);

// L. The orchestration adds no candidate evidence or persistence fields.
assert.deepEqual(Object.keys(immutableInput).sort(), [
  "menuScope",
  "now",
  "requestedCoverage",
  "resolution",
  "uploadedImageReference",
]);
assert.deepEqual(Object.keys(deterministicFirst.value).sort(), [
  "candidate",
  "kind",
  "uploadedImage",
]);
assert.equal("matchSignals" in deterministicFirst.value, false);
assert.equal("googleCandidate" in deterministicFirst.value, false);
assert.equal("persistence" in deterministicFirst.value, false);

console.log("Menu acquisition reuse service validation passed.");
