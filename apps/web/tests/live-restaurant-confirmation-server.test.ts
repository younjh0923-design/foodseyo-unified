import assert from "node:assert/strict";

import {
  CONTRACT_VERSIONS,
  CompactMenuExtractionSchema,
  PUBLIC_ERROR_REGISTRY,
  RestaurantCandidateSchema,
  type MenuSourceInput,
  type PublicErrorCode,
} from "@foodseyo/contracts";
import {
  DeterministicMvpAnalysisRepository,
  type MvpAnalysisRepository,
} from "@foodseyo/database";

import { LiveRestaurantConfirmationService } from "../src/live-restaurant-confirmation-server.js";

const inner = new DeterministicMvpAnalysisRepository();
const repository: MvpAnalysisRepository & {
  findActiveRestaurantMenuVersion: (
    restaurantId: string,
    menuScope: "default" | "breakfast" | "brunch" | "lunch" | "dinner" | "late_night" | "drinks" | "dessert",
  ) => Promise<null>;
} = {
  acquireAnalysisOwner: (request) => inner.acquireAnalysisOwner(request),
  findActiveRestaurantMenuVersion: async () => null,
  findRestaurantByExternalReference: (googlePlaceId) =>
    inner.findRestaurantByExternalReference(googlePlaceId),
  findPublishedCanonicalAnalysisByGooglePlaceId: (
    identity,
    googlePlaceId,
    observedAt,
  ) =>
    inner.findPublishedCanonicalAnalysisByGooglePlaceId(
      identity,
      googlePlaceId,
      observedAt,
    ),
  findReusableCanonicalAnalysis: (identity, observedAt) =>
    inner.findReusableCanonicalAnalysis(identity, observedAt),
  markAnalysisFailure: (request) => inner.markAnalysisFailure(request),
  persistAnalysisOnly: (request) => inner.persistAnalysisOnly(request),
  publishEligibleAnalysis: (request) => inner.publishEligibleAnalysis(request),
  resolveExactIdentity: (request) => inner.resolveExactIdentity(request),
  waitForReusableCanonicalAnalysis: (identity, policy, observedAt, scheduler) =>
    inner.waitForReusableCanonicalAnalysis(identity, policy, observedAt, scheduler),
  waitForPublishedCanonicalAnalysisByGooglePlaceId: (
    identity,
    googlePlaceId,
    policy,
    observedAt,
    scheduler,
  ) => inner.waitForPublishedCanonicalAnalysisByGooglePlaceId(
    identity,
    googlePlaceId,
    policy,
    observedAt,
    scheduler,
  ),
};

const candidate = RestaurantCandidateSchema.parse({
  contractVersion: CONTRACT_VERSIONS.restaurantResolution,
  candidateId: "11111111-1111-4111-8111-111111111111",
  googlePlaceId: "test-place-branch-a",
  displayName: "Test Noodle House",
  fullAddress: "18 Test Street, Boston, MA",
  shortAddress: "18 Test Street",
  location: { latitude: 42.3601, longitude: -71.0589 },
  matchSignals: ["name", "address"],
  rank: 1,
});

const extractionFor = (source: MenuSourceInput) =>
  CompactMenuExtractionSchema.parse({
    contractVersion: CONTRACT_VERSIONS.compactExtraction,
    extractionState: "unvalidated",
    source: source.source,
    restaurantContext: null,
    menuScope: source.menuScope,
    sections: [
      {
        sectionIndex: 0,
        name: "Mains",
        items: [
          {
            itemIndex: 0,
            name: "Test Noodle Bowl",
            description: "Noodles with vegetables",
            price: { amountMinor: 1250, currency: "USD" },
            optionTexts: [],
            sourceEvidence: [
              { kind: "menu_source", sourceRef: source.source.sourceRef, sourceIndexes: [0] },
            ],
          },
        ],
      },
    ],
    warningCodes: [],
    completedAt: "2026-07-21T18:00:00.000Z",
  });

let extractionCalls = 0;
let candidateCalls = 0;
let returnCandidates = true;
const extractedImageCounts: number[] = [];
const serverOnlySecret = "network-free-server-only-secret";
const service = new LiveRestaurantConfirmationService({
  environment: {
    OPENAI_API_KEY: serverOnlySecret,
    OPENAI_MENU_EXTRACTION_MODEL: "model:network-free-test",
  },
  now: () => new Date("2026-07-21T18:00:00.000Z"),
  generateId: () => crypto.randomUUID(),
  repository,
  extractMenu: async (source, images) => {
    extractionCalls += 1;
    extractedImageCounts.push(images.length);
    return {
      status: "success",
      value: {
        extraction: extractionFor(source),
        restaurantClues: {
          name: "Test Noodle House",
          address: "18 Test Street, Boston, MA",
          visualText: "Test Noodle House",
        },
      },
    };
  },
  findCandidates: async () => {
    candidateCalls += 1;
    return { status: "success", value: returnCandidates ? [candidate] : [] };
  },
  findCandidatesFromLink: async () => ({ status: "success", value: [candidate] }),
});

const analyzeResult = await service.analyze({
  bytes: new Uint8Array([1, 2, 3, 4]),
  mediaType: "image/jpeg",
  restaurantName: null,
  language: "en",
  signal: new AbortController().signal,
});
assert.equal(analyzeResult.status, "success");
assert.equal(extractionCalls, 1);
assert.equal(candidateCalls, 1);
assert.deepEqual(extractedImageCounts, [1]);
if (analyzeResult.status !== "success") throw new Error("analysis failed");
assert.equal(analyzeResult.value.restaurantScreen.requiresUserConfirmation, true);
assert.equal(analyzeResult.value.restaurantScreen.title, "Which restaurant is this?");
assert.equal(analyzeResult.value.restaurantScreen.candidates[0]?.isSelected, false);
assert.equal(analyzeResult.value.resultPreview.isMenuOnlyAnalysis, true);
assert.equal(
  JSON.stringify(analyzeResult.value.restaurantScreen).includes(candidate.googlePlaceId),
  false,
);
assert.equal(JSON.stringify(analyzeResult.value).includes(candidate.googlePlaceId), false);
assert.equal(JSON.stringify(analyzeResult.value).includes(serverOnlySecret), false);
assert.equal(inner.snapshotCounts().canonicalAnalyses, 0);

const twoImageResult = await service.analyze({
  images: [
    { bytes: new Uint8Array([1, 2]), mediaType: "image/jpeg" },
    { bytes: new Uint8Array([3, 4]), mediaType: "image/png" },
  ],
  restaurantName: null,
  language: "en",
  signal: new AbortController().signal,
});
assert.equal(twoImageResult.status, "success");
assert.deepEqual(extractedImageCounts, [1, 2]);
assert.equal(inner.snapshotCounts().canonicalAnalyses, 0);

const oversizedFailures: unknown[] = [];
const oversizedResult = await service.analyze({
  images: [
    {
      bytes: new Uint8Array(10 * 1024 * 1024 + 1),
      mediaType: "image/jpeg",
    },
  ],
  restaurantName: null,
  language: "en",
  signal: new AbortController().signal,
  correlationId: "55555555-5555-4555-8555-555555555555",
  observeSafeFailure: (failure) => oversizedFailures.push(failure),
});
assert.equal(oversizedResult.status, "error");
if (oversizedResult.status === "error") {
  assert.equal(oversizedResult.error.error.code, "PAYLOAD_TOO_LARGE");
}
assert.equal(
  (oversizedFailures[0] as { failedStage?: string } | undefined)?.failedStage,
  "image_decoding_size_validation",
);
assert.deepEqual(extractedImageCounts, [1, 2]);

const testError = (code: PublicErrorCode, correlationId: string) => {
  const definition = PUBLIC_ERROR_REGISTRY[code];
  return {
    error: {
      code,
      message: definition.message,
      correlationId,
      retryable: definition.retryable,
    },
    httpStatus: definition.httpStatus,
  };
};

// The service reports provider, Google Places, and canonical failures at
// separate safe stages without exposing images or provider payloads.
{
  const failures: unknown[] = [];
  const providerFailureService = new LiveRestaurantConfirmationService({
    environment: {
      OPENAI_API_KEY: serverOnlySecret,
      OPENAI_MENU_EXTRACTION_MODEL: "model:network-free-test",
    },
    now: () => new Date("2026-07-21T18:00:00.000Z"),
    generateId: () => crypto.randomUUID(),
    repository,
    extractMenu: async (_source, _images, context) => ({
      status: "error",
      error: testError("UPSTREAM_UNAVAILABLE", context.correlationId),
    }),
    findCandidates: async () => ({ status: "success", value: [] }),
  });
  const result = await providerFailureService.analyze({
    bytes: new Uint8Array([1]),
    mediaType: "image/jpeg",
    restaurantName: null,
    language: "en",
    signal: new AbortController().signal,
    observeSafeFailure: (failure) => failures.push(failure),
  });
  assert.equal(result.status, "error");
  assert.equal(
    (failures[0] as { failedStage?: string } | undefined)?.failedStage,
    "openai_request",
  );
}

{
  const failures: unknown[] = [];
  const placesFailureService = new LiveRestaurantConfirmationService({
    environment: {
      OPENAI_API_KEY: serverOnlySecret,
      OPENAI_MENU_EXTRACTION_MODEL: "model:network-free-test",
    },
    now: () => new Date("2026-07-21T18:00:00.000Z"),
    generateId: () => crypto.randomUUID(),
    repository,
    extractMenu: async (source) => ({
      status: "success",
      value: {
        extraction: extractionFor(source),
        restaurantClues: { name: null, address: null, visualText: null },
      },
    }),
    findCandidates: async (_clues, context) => ({
      status: "error",
      error: testError("UPSTREAM_UNAVAILABLE", context.correlationId),
    }),
  });
  const result = await placesFailureService.analyze({
    bytes: new Uint8Array([1]),
    mediaType: "image/jpeg",
    restaurantName: null,
    language: "en",
    signal: new AbortController().signal,
    observeSafeFailure: (failure) => failures.push(failure),
  });
  assert.equal(result.status, "error");
  assert.equal(
    (failures[0] as { failedStage?: string } | undefined)?.failedStage,
    "google_places_resolution",
  );
}

{
  const failures: unknown[] = [];
  const canonicalFailureService = new LiveRestaurantConfirmationService({
    environment: {
      OPENAI_API_KEY: serverOnlySecret,
      OPENAI_MENU_EXTRACTION_MODEL: "model:network-free-test",
    },
    now: () => new Date("2026-07-21T18:00:00.000Z"),
    generateId: () => crypto.randomUUID(),
    repository,
    extractMenu: async (source) => ({
      status: "success",
      value: {
        extraction: {
          ...extractionFor(source),
          menuScope: "not-a-menu-scope",
        } as ReturnType<typeof extractionFor>,
        restaurantClues: { name: null, address: null, visualText: null },
      },
    }),
    findCandidates: async () => ({ status: "success", value: [] }),
  });
  const result = await canonicalFailureService.analyze({
    bytes: new Uint8Array([1]),
    mediaType: "image/jpeg",
    restaurantName: null,
    language: "en",
    signal: new AbortController().signal,
    observeSafeFailure: (failure) => failures.push(failure),
  });
  assert.equal(result.status, "error");
  assert.equal(
    (failures[0] as { failedStage?: string } | undefined)?.failedStage,
    "canonical_conversion",
  );
}

const linkResult = await service.analyzeLink({
  link: "https://restaurant.example/menu",
  language: "en",
  signal: new AbortController().signal,
});
assert.equal(linkResult.status, "success");
if (linkResult.status !== "success") throw new Error("link analysis failed");
assert.equal(linkResult.value.restaurantScreen.requiresUserConfirmation, true);
assert.equal(linkResult.value.restaurantScreen.resolutionState, "candidate");
assert.equal(linkResult.value.restaurantScreen.candidates[0]?.isSelected, false);
assert.equal(JSON.stringify(linkResult.value).includes(candidate.googlePlaceId), false);
assert.equal(JSON.stringify(linkResult.value).includes(serverOnlySecret), false);
assert.equal(inner.snapshotCounts().canonicalAnalyses, 0);

const invalidMenuOnlyWithCandidate = await service.confirm({
  analysisToken: analyzeResult.value.analysisToken,
  selectedCandidateId: null,
  signal: new AbortController().signal,
});
assert.equal(invalidMenuOnlyWithCandidate.status, "error");
assert.equal(inner.snapshotCounts().canonicalAnalyses, 0);

const invalidSelection = await service.confirm({
  analysisToken: analyzeResult.value.analysisToken,
  selectedCandidateId: "22222222-2222-4222-8222-222222222222",
  signal: new AbortController().signal,
});
assert.equal(invalidSelection.status, "error");
if (invalidSelection.status === "error") {
  assert.equal(invalidSelection.error.error.code, "INVALID_INPUT");
}
assert.equal(inner.snapshotCounts().canonicalAnalyses, 0);

const confirmed = await service.confirm({
  analysisToken: analyzeResult.value.analysisToken,
  selectedCandidateId: candidate.candidateId,
  signal: new AbortController().signal,
});
assert.equal(confirmed.status, "success");
if (confirmed.status !== "success") throw new Error("confirmation failed");
assert.equal(confirmed.value.publicationStatus, "published");
assert.equal(confirmed.value.result.restaurantName, candidate.displayName);
assert.equal(confirmed.value.result.menuItems[0]?.name, "Test Noodle Bowl");
assert.equal(confirmed.value.result.isMenuOnlyAnalysis, false);
assert.equal(confirmed.value.result.title, "Test Noodle House menu");
assert.equal(JSON.stringify(confirmed.value).includes(candidate.googlePlaceId), false);
assert.equal(JSON.stringify(confirmed.value).includes(serverOnlySecret), false);
assert.deepEqual(inner.snapshotCounts(), {
  analysisContracts: 1,
  analysisRuns: 1,
  canonicalAnalyses: 1,
  dishes: 0,
  menuEvidenceSets: 3,
  menuItemDishMatches: 0,
  menuItems: 1,
  publicationReceipts: 1,
  restaurantExternalReferences: 1,
  restaurantMenuVersions: 1,
  restaurants: 1,
});

const repeated = await service.confirm({
  analysisToken: analyzeResult.value.analysisToken,
  selectedCandidateId: candidate.candidateId,
  signal: new AbortController().signal,
});
assert.equal(repeated.status, "success");
assert.equal(inner.snapshotCounts().publicationReceipts, 1);
assert.equal(extractionCalls, 2, "confirm must not trigger another provider extraction");

returnCandidates = false;
const fiveImageResult = await service.analyze({
  images: Array.from({ length: 5 }, (_, index) => ({
    bytes: new Uint8Array([index + 1, index + 2]),
    mediaType: "image/jpeg" as const,
  })),
  restaurantName: null,
  language: "en",
  signal: new AbortController().signal,
});
assert.equal(fiveImageResult.status, "success");
if (fiveImageResult.status !== "success") throw new Error("five-image analysis failed");
assert.deepEqual(extractedImageCounts, [1, 2, 5]);
assert.equal(fiveImageResult.value.restaurantScreen.candidates.length, 0);
assert.equal(fiveImageResult.value.restaurantScreen.canContinueMenuOnly, true);
const beforeMenuOnly = inner.snapshotCounts();

const sixImageResult = await service.analyze({
  images: Array.from({ length: 6 }, (_, index) => ({
    bytes: new Uint8Array([index + 1]),
    mediaType: "image/png" as const,
  })),
  restaurantName: null,
  language: "en",
  signal: new AbortController().signal,
});
assert.equal(sixImageResult.status, "error");
if (sixImageResult.status === "error") {
  assert.equal(sixImageResult.error.error.code, "INVALID_INPUT");
}
assert.deepEqual(extractedImageCounts, [1, 2, 5]);
assert.deepEqual(inner.snapshotCounts(), beforeMenuOnly);

const menuOnly = await service.confirm({
  analysisToken: fiveImageResult.value.analysisToken,
  selectedCandidateId: null,
  signal: new AbortController().signal,
});
assert.equal(menuOnly.status, "success");
if (menuOnly.status !== "success") throw new Error("menu-only continuation failed");
assert.equal(menuOnly.value.publicationStatus, "analysis_only_saved");
assert.equal(menuOnly.value.menuVersionId, null);
assert.equal(menuOnly.value.result.isMenuOnlyAnalysis, true);
const afterMenuOnly = inner.snapshotCounts();
assert.equal(afterMenuOnly.canonicalAnalyses, beforeMenuOnly.canonicalAnalyses + 1);
assert.equal(afterMenuOnly.restaurants, beforeMenuOnly.restaurants);
assert.equal(
  afterMenuOnly.restaurantMenuVersions,
  beforeMenuOnly.restaurantMenuVersions,
);
assert.equal(afterMenuOnly.publicationReceipts, beforeMenuOnly.publicationReceipts);

// Production regression: an analysis-only save may be followed by a fresh
// candidate UUID for the same source. Equality is the stable Google Place ID,
// the prior extraction is reused before OpenAI, and the old snapshot is kept.
{
  const regressionInner = new DeterministicMvpAnalysisRepository();
  const regressionRepository: typeof repository = {
    acquireAnalysisOwner: (request) => regressionInner.acquireAnalysisOwner(request),
    findActiveRestaurantMenuVersion: async () => null,
    findRestaurantByExternalReference: (googlePlaceId) =>
      regressionInner.findRestaurantByExternalReference(googlePlaceId),
    findPublishedCanonicalAnalysisByGooglePlaceId: (identity, placeId, observedAt) =>
      regressionInner.findPublishedCanonicalAnalysisByGooglePlaceId(
        identity,
        placeId,
        observedAt,
      ),
    findReusableCanonicalAnalysis: (identity, observedAt) =>
      regressionInner.findReusableCanonicalAnalysis(identity, observedAt),
    markAnalysisFailure: (request) => regressionInner.markAnalysisFailure(request),
    persistAnalysisOnly: (request) => regressionInner.persistAnalysisOnly(request),
    publishEligibleAnalysis: (request) =>
      regressionInner.publishEligibleAnalysis(request),
    resolveExactIdentity: (request) => regressionInner.resolveExactIdentity(request),
    waitForPublishedCanonicalAnalysisByGooglePlaceId: (
      identity,
      placeId,
      policy,
      observedAt,
      scheduler,
    ) => regressionInner.waitForPublishedCanonicalAnalysisByGooglePlaceId(
      identity,
      placeId,
      policy,
      observedAt,
      scheduler,
    ),
    waitForReusableCanonicalAnalysis: (identity, policy, observedAt, scheduler) =>
      regressionInner.waitForReusableCanonicalAnalysis(
        identity,
        policy,
        observedAt,
        scheduler,
      ),
  };
  let regressionExtractionCalls = 0;
  let regressionPreparationCalls = 0;
  const regressionCandidateHints: Array<string | null> = [];
  const regressionService = new LiveRestaurantConfirmationService({
    environment: {
      OPENAI_API_KEY: serverOnlySecret,
      OPENAI_MENU_EXTRACTION_MODEL: "model:network-free-test",
    },
    now: () => new Date("2026-07-21T18:00:00.000Z"),
    generateId: () => crypto.randomUUID(),
    repository: regressionRepository,
    prepareImagesForProvider: async (images) => {
      regressionPreparationCalls += 1;
      return {
        images,
        originalDimensions: images.map(() => ({ width: 4_032, height: 3_024 })),
        providerDimensions: images.map(() => ({ width: 2_048, height: 1_536 })),
      };
    },
    extractMenu: async (source) => {
      regressionExtractionCalls += 1;
      return {
        status: "success",
        value: {
          extraction: extractionFor(source),
          restaurantClues: { name: null, address: null, visualText: null },
        },
      };
    },
    findCandidates: async (clues) => {
      regressionCandidateHints.push(clues.name);
      if (clues.name === null) return { status: "success", value: [] };
      const other = clues.name.includes("Other");
      return {
        status: "success",
        value: [RestaurantCandidateSchema.parse({
          ...candidate,
          candidateId: crypto.randomUUID(),
          googlePlaceId: other ? "test-place-branch-b" : candidate.googlePlaceId,
          displayName: other ? "Other Test Restaurant" : candidate.displayName,
          matchSignals: ["name"],
        })],
      };
    },
  });
  const sameImage = new Uint8Array([91, 92, 93, 94]);
  const first = await regressionService.analyze({
    bytes: sameImage,
    mediaType: "image/jpeg",
    restaurantName: null,
    language: "en",
    signal: new AbortController().signal,
  });
  assert.equal(first.status, "success");
  if (first.status !== "success") assert.fail("first regression analysis failed");
  assert.equal(first.value.restaurantScreen.candidates.length, 0);
  assert.equal(regressionPreparationCalls, 1);
  assert.deepEqual(regressionCandidateHints, [null]);
  const firstSave = await regressionService.confirm({
    analysisToken: first.value.analysisToken,
    selectedCandidateId: null,
    signal: new AbortController().signal,
  });
  assert.equal(firstSave.status, "success");

  const second = await regressionService.analyze({
    bytes: sameImage,
    mediaType: "image/jpeg",
    restaurantName: "Test Noodle House",
    language: "en",
    signal: new AbortController().signal,
  });
  assert.equal(second.status, "success");
  if (second.status !== "success") assert.fail("second regression analysis failed");
  assert.equal(regressionExtractionCalls, 1, "same exact image must skip OpenAI");
  assert.equal(
    regressionPreparationCalls,
    1,
    "an exact-cache hit must skip provider image conversion",
  );
  assert.equal(regressionCandidateHints.at(-1), "Test Noodle House");
  const secondCandidateId = second.value.restaurantScreen.candidates[0]?.candidateId;
  assert.ok(secondCandidateId);
  const linked = await regressionService.confirm({
    analysisToken: second.value.analysisToken,
    selectedCandidateId: secondCandidateId,
    signal: new AbortController().signal,
  });
  assert.equal(linked.status, "success");
  if (linked.status !== "success") assert.fail("restaurant linking failed");
  assert.equal(regressionInner.snapshotCounts().canonicalAnalyses, 2);
  assert.equal(regressionInner.snapshotCounts().publicationReceipts, 1);

  const repeatedAnalyze = await regressionService.analyze({
    bytes: sameImage,
    mediaType: "image/jpeg",
    restaurantName: "Test Noodle House",
    language: "en",
    signal: new AbortController().signal,
  });
  assert.equal(repeatedAnalyze.status, "success");
  if (repeatedAnalyze.status !== "success") assert.fail("repeat analysis failed");
  const freshCandidateId = repeatedAnalyze.value.restaurantScreen.candidates[0]?.candidateId;
  assert.ok(freshCandidateId);
  assert.notEqual(freshCandidateId, secondCandidateId);
  assert.equal(regressionPreparationCalls, 1);
  assert.equal(regressionCandidateHints.at(-1), "Test Noodle House");
  const repeatedConfirm = await regressionService.confirm({
    analysisToken: repeatedAnalyze.value.analysisToken,
    selectedCandidateId: freshCandidateId,
    signal: new AbortController().signal,
  });
  assert.equal(repeatedConfirm.status, "success");
  if (repeatedConfirm.status !== "success") assert.fail("repeat confirm failed");
  assert.equal(repeatedConfirm.value.analysisId, linked.value.analysisId);
  assert.equal(regressionInner.snapshotCounts().canonicalAnalyses, 2);
  assert.equal(regressionInner.snapshotCounts().publicationReceipts, 1);

  const noHintRepeat = await regressionService.analyze({
    bytes: sameImage,
    mediaType: "image/jpeg",
    restaurantName: null,
    language: "en",
    signal: new AbortController().signal,
  });
  assert.equal(noHintRepeat.status, "success");
  if (noHintRepeat.status !== "success") assert.fail("no-hint repeat failed");
  assert.equal(noHintRepeat.value.restaurantScreen.candidates.length, 0);
  assert.equal(regressionExtractionCalls, 1);
  assert.equal(regressionPreparationCalls, 1);
  assert.equal(
    regressionCandidateHints.at(-1),
    null,
    "a new no-hint request must not inherit the prior user hint",
  );

  const different = await regressionService.analyze({
    bytes: sameImage,
    mediaType: "image/jpeg",
    restaurantName: "Other Test Restaurant",
    language: "en",
    signal: new AbortController().signal,
  });
  assert.equal(different.status, "success");
  if (different.status !== "success") assert.fail("different-place analysis failed");
  const differentCandidateId = different.value.restaurantScreen.candidates[0]?.candidateId;
  assert.ok(differentCandidateId);
  const differentConfirm = await regressionService.confirm({
    analysisToken: different.value.analysisToken,
    selectedCandidateId: differentCandidateId,
    signal: new AbortController().signal,
  });
  assert.equal(differentConfirm.status, "success");
  assert.equal(regressionInner.snapshotCounts().canonicalAnalyses, 3);
  assert.equal(regressionInner.snapshotCounts().publicationReceipts, 2);
  assert.equal(regressionExtractionCalls, 1);
  assert.equal(regressionPreparationCalls, 1);

  const orderedImages = [
    { bytes: new Uint8Array([11, 12]), mediaType: "image/jpeg" as const },
    { bytes: new Uint8Array([21, 22]), mediaType: "image/png" as const },
  ];
  const ordered = await regressionService.analyze({
    images: orderedImages,
    restaurantName: null,
    language: "en",
    signal: new AbortController().signal,
  });
  assert.equal(ordered.status, "success");
  if (ordered.status !== "success") assert.fail("ordered analysis failed");
  await regressionService.confirm({
    analysisToken: ordered.value.analysisToken,
    selectedCandidateId: null,
    signal: new AbortController().signal,
  });
  assert.equal(regressionExtractionCalls, 2);
  assert.equal(regressionPreparationCalls, 2);
  await regressionService.analyze({
    images: orderedImages,
    restaurantName: null,
    language: "en",
    signal: new AbortController().signal,
  });
  assert.equal(regressionExtractionCalls, 2, "same image order must hit exact cache");
  assert.equal(regressionPreparationCalls, 2);
  await regressionService.analyze({
    images: [...orderedImages].reverse(),
    restaurantName: null,
    language: "en",
    signal: new AbortController().signal,
  });
  assert.equal(regressionExtractionCalls, 3, "reversed image order must miss exact cache");
  assert.equal(regressionPreparationCalls, 3);

  let changedModelExtractionCalls = 0;
  const changedModelService = new LiveRestaurantConfirmationService({
    environment: {
      OPENAI_API_KEY: serverOnlySecret,
      OPENAI_MENU_EXTRACTION_MODEL: "model:network-free-test-v2",
    },
    now: () => new Date("2026-07-21T18:00:00.000Z"),
    generateId: () => crypto.randomUUID(),
    repository: regressionRepository,
    extractMenu: async (source) => {
      changedModelExtractionCalls += 1;
      return {
        status: "success",
        value: {
          extraction: extractionFor(source),
          restaurantClues: { name: null, address: null, visualText: null },
        },
      };
    },
    findCandidates: async () => ({ status: "success", value: [] }),
  });
  const changedModel = await changedModelService.analyze({
    bytes: sameImage,
    mediaType: "image/jpeg",
    restaurantName: null,
    language: "en",
    signal: new AbortController().signal,
  });
  assert.equal(changedModel.status, "success");
  assert.equal(
    changedModelExtractionCalls,
    1,
    "a model version change must miss the exact cache",
  );
}

// Cache/database lookup failure is fail-open for analysis and never exposes
// database details through the public result.
{
  const failOpenInner = new DeterministicMvpAnalysisRepository();
  let failOpenExtractionCalls = 0;
  const failOpenService = new LiveRestaurantConfirmationService({
    environment: {
      OPENAI_API_KEY: serverOnlySecret,
      OPENAI_MENU_EXTRACTION_MODEL: "model:network-free-test",
    },
    now: () => new Date("2026-07-21T18:00:00.000Z"),
    generateId: () => crypto.randomUUID(),
    repository: {
      acquireAnalysisOwner: (request) => failOpenInner.acquireAnalysisOwner(request),
      findActiveRestaurantMenuVersion: async () => null,
      findRestaurantByExternalReference: (placeId) =>
        failOpenInner.findRestaurantByExternalReference(placeId),
      findPublishedCanonicalAnalysisByGooglePlaceId: (identity, placeId, observedAt) =>
        failOpenInner.findPublishedCanonicalAnalysisByGooglePlaceId(
          identity,
          placeId,
          observedAt,
        ),
      findReusableCanonicalAnalysis: async () => {
        throw new Error("synthetic database outage");
      },
      markAnalysisFailure: (request) => failOpenInner.markAnalysisFailure(request),
      persistAnalysisOnly: (request) => failOpenInner.persistAnalysisOnly(request),
      publishEligibleAnalysis: (request) => failOpenInner.publishEligibleAnalysis(request),
      resolveExactIdentity: (request) => failOpenInner.resolveExactIdentity(request),
      waitForPublishedCanonicalAnalysisByGooglePlaceId: (
        identity,
        placeId,
        policy,
        observedAt,
        scheduler,
      ) => failOpenInner.waitForPublishedCanonicalAnalysisByGooglePlaceId(
        identity,
        placeId,
        policy,
        observedAt,
        scheduler,
      ),
      waitForReusableCanonicalAnalysis: (identity, policy, observedAt, scheduler) =>
        failOpenInner.waitForReusableCanonicalAnalysis(
          identity,
          policy,
          observedAt,
          scheduler,
        ),
    },
    extractMenu: async (source) => {
      failOpenExtractionCalls += 1;
      return {
        status: "success",
        value: {
          extraction: extractionFor(source),
          restaurantClues: { name: null, address: null, visualText: null },
        },
      };
    },
    findCandidates: async () => ({ status: "success", value: [] }),
  });
  const result = await failOpenService.analyze({
    bytes: new Uint8Array([61, 62, 63]),
    mediaType: "image/jpeg",
    restaurantName: null,
    language: "en",
    signal: new AbortController().signal,
  });
  assert.equal(result.status, "success");
  assert.equal(failOpenExtractionCalls, 1);
  assert.equal(JSON.stringify(result).includes("synthetic database outage"), false);
}

console.log("Foodseyo live 분석·확인·원자 저장 서비스 검증을 통과했습니다.");
