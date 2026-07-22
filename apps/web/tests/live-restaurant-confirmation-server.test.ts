import assert from "node:assert/strict";

import {
  CONTRACT_VERSIONS,
  CompactMenuExtractionSchema,
  RestaurantCandidateSchema,
  type MenuSourceInput,
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
const service = new LiveRestaurantConfirmationService({
  environment: {
    OPENAI_API_KEY: "network-free-test-key",
    OPENAI_MENU_EXTRACTION_MODEL: "model:network-free-test",
  },
  now: () => new Date("2026-07-21T18:00:00.000Z"),
  generateId: () => crypto.randomUUID(),
  repository,
  extractMenu: async (source) => {
    extractionCalls += 1;
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
    return { status: "success", value: [candidate] };
  },
});

const analyzeResult = await service.analyze({
  bytes: new Uint8Array([1, 2, 3, 4]),
  mediaType: "image/jpeg",
  restaurantName: null,
  signal: new AbortController().signal,
});
assert.equal(analyzeResult.status, "success");
assert.equal(extractionCalls, 1);
assert.equal(candidateCalls, 1);
if (analyzeResult.status !== "success") throw new Error("analysis failed");
assert.equal(analyzeResult.value.restaurantScreen.requiresUserConfirmation, true);
assert.equal(analyzeResult.value.restaurantScreen.candidates[0]?.isSelected, false);
assert.equal(analyzeResult.value.resultPreview.isMenuOnlyAnalysis, true);
assert.equal(
  JSON.stringify(analyzeResult.value.restaurantScreen).includes(candidate.googlePlaceId),
  false,
);

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
assert.equal(extractionCalls, 1, "confirm must not trigger a second provider extraction");

console.log("Foodseyo live 분석·확인·원자 저장 서비스 검증을 통과했습니다.");
