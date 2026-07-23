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
  findReusableCanonicalAnalysis: (identity, observedAt) =>
    inner.findReusableCanonicalAnalysis(identity, observedAt),
  markAnalysisFailure: (request) => inner.markAnalysisFailure(request),
  persistAnalysisOnly: (request) => inner.persistAnalysisOnly(request),
  publishEligibleAnalysis: (request) => inner.publishEligibleAnalysis(request),
  resolveExactIdentity: (request) => inner.resolveExactIdentity(request),
  waitForReusableCanonicalAnalysis: (identity, policy, observedAt, scheduler) =>
    inner.waitForReusableCanonicalAnalysis(identity, policy, observedAt, scheduler),
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
  menuEvidenceSets: 1,
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

console.log("Foodseyo live 분석·확인·원자 저장 서비스 검증을 통과했습니다.");
