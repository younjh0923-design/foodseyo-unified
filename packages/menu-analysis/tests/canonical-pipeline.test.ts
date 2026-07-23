import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  CanonicalMenuAnalysisSchema,
  CompactMenuExtractionSchema,
  RestaurantResolutionSchema,
  type CanonicalMenuAnalysis,
} from "@foodseyo/contracts/boundary-dtos";
import {
  CanonicalValidationRequestSchema,
  MODULE_INTERFACE_VERSION,
  PortInvocationContextSchema,
  type PortInvocationContext,
  type PortResult,
} from "@foodseyo/contracts/module-interfaces";
import { CONTRACT_VERSIONS } from "@foodseyo/contracts/versions";
import {
  DeterministicMvpAnalysisRepository,
  type MvpAnalysisRepository,
  type PublicationFaultPoint,
  type SemanticVersionVector,
} from "@foodseyo/database";

import {
  CanonicalMenuValidationService,
  CanonicalPipelineApplicationService,
} from "../src/index.js";

type JsonRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const fixture = JSON.parse(
  await readFile(resolve("fixtures/u2.1-pipeline.valid.json"), "utf8"),
) as unknown;
assert(isRecord(fixture));

const confirmedResolution = RestaurantResolutionSchema.parse(
  fixture.restaurantResolution,
);
const confirmedExtraction = CompactMenuExtractionSchema.parse(
  fixture.extraction,
);
const confirmedAnalysis = CanonicalMenuAnalysisSchema.parse(
  fixture.canonicalAnalysis,
);
const unconfirmedResolution = RestaurantResolutionSchema.parse({
  ...confirmedResolution,
  confirmationEvidence: null,
  requiresUserConfirmation: true,
  resolvedAt: null,
  restaurantId: null,
  selectedCandidateId: null,
  state: "candidate",
});
const menuOnlyExtraction = CompactMenuExtractionSchema.parse({
  ...confirmedExtraction,
  restaurantContext: null,
});
const menuOnlyAnalysis = CanonicalMenuAnalysisSchema.parse({
  ...confirmedAnalysis,
  menuItems: confirmedAnalysis.menuItems.map((item) => ({
    ...item,
    menuVersionId: null,
  })),
  menuVersion: null,
  publicationState: "analysis_only",
  restaurantResolution: unconfirmedResolution,
});

const context: PortInvocationContext = PortInvocationContextSchema.parse({
  contractVersion: MODULE_INTERFACE_VERSION,
  correlationId: "s1_5_canonical_publication",
  signal: new AbortController().signal,
  timeoutMs: 10_000,
});

const versions: SemanticVersionVector = {
  analysisSnapshotVersion: CONTRACT_VERSIONS.analysisSnapshot,
  boundaryDtoVersion: CONTRACT_VERSIONS.boundaryDtos,
  compactExtractionVersion: CONTRACT_VERSIONS.compactExtraction,
  consistencyVersion: CONTRACT_VERSIONS.consistency,
  dishKnowledgeVersion: CONTRACT_VERSIONS.dishKnowledge,
  exactCacheKeyVersion: CONTRACT_VERSIONS.exactCacheKey,
  explanationRendererVersion: CONTRACT_VERSIONS.explanationRenderer,
  menuSourceVersion: CONTRACT_VERSIONS.menuSource,
  mergePolicyVersion: CONTRACT_VERSIONS.mergePolicy,
  modelVersion: "model:network-free-fixture",
  moduleInterfaceVersion: CONTRACT_VERSIONS.moduleInterfaces,
  promptVersion: "prompt:network-free-fixture",
  providerSchemaVersion: "provider-schema:network-free-fixture",
  restaurantResolutionVersion: CONTRACT_VERSIONS.restaurantResolution,
};

interface RecordingRepository {
  readonly repository: MvpAnalysisRepository;
  readonly persistAnalysisOnlyCalls: () => number;
  readonly publishEligibleAnalysisCalls: () => number;
}

const recordRepository = (
  inner: MvpAnalysisRepository,
  faultPoint?: PublicationFaultPoint,
): RecordingRepository => {
  let persistAnalysisOnlyCalls = 0;
  let publishEligibleAnalysisCalls = 0;
  const repository: MvpAnalysisRepository = {
    acquireAnalysisOwner: (request) => inner.acquireAnalysisOwner(request),
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
    persistAnalysisOnly: (request) => {
      persistAnalysisOnlyCalls += 1;
      return inner.persistAnalysisOnly(request);
    },
    publishEligibleAnalysis: (request) => {
      publishEligibleAnalysisCalls += 1;
      return inner.publishEligibleAnalysis({
        ...request,
        ...(faultPoint === undefined ? {} : { faultPoint }),
      });
    },
    resolveExactIdentity: (request) => inner.resolveExactIdentity(request),
    waitForReusableCanonicalAnalysis: (
      identity,
      policy,
      observedAt,
      scheduler,
    ) =>
      inner.waitForReusableCanonicalAnalysis(
        identity,
        policy,
        observedAt,
        scheduler,
      ),
    waitForPublishedCanonicalAnalysisByGooglePlaceId: (
      identity,
      googlePlaceId,
      policy,
      observedAt,
      scheduler,
    ) =>
      inner.waitForPublishedCanonicalAnalysisByGooglePlaceId(
        identity,
        googlePlaceId,
        policy,
        observedAt,
        scheduler,
      ),
  };
  return {
    persistAnalysisOnlyCalls: () => persistAnalysisOnlyCalls,
    publishEligibleAnalysisCalls: () => publishEligibleAnalysisCalls,
    repository,
  };
};

const prepareOwnedRepository = async (
  runId: string,
  faultPoint?: PublicationFaultPoint,
) => {
  const inner = new DeterministicMvpAnalysisRepository();
  const recording = recordRepository(inner, faultPoint);
  const identity = await recording.repository.resolveExactIdentity({
    analysisContractId: "41414141-4141-4414-8414-414141414141",
    collectedAt: confirmedExtraction.source.collectedAt,
    createdAt: "2026-07-21T18:00:00.000Z",
    evidenceIdentityVersion: "evidence-identity/1.0.0",
    evidenceSetId: "42424242-4242-4424-8424-424242424242",
    sourceFingerprint: confirmedExtraction.source.sourceFingerprint,
    sourceRef: confirmedExtraction.source.sourceRef,
    sourceType: confirmedExtraction.source.sourceType,
    versions,
  });
  const owner = await recording.repository.acquireAnalysisOwner({
    identity,
    leaseExpiresAt: "2026-07-21T19:00:00.000Z",
    runId,
    startedAt: "2026-07-21T18:00:00.000Z",
  });
  assert.equal(owner.status, "owner");
  return { identity, inner, recording };
};

const idGenerator = (ids: readonly string[]): (() => string) => {
  let index = 0;
  return () => {
    const id = ids[index];
    assert(id, "test id generator exhausted");
    index += 1;
    return id;
  };
};

const assertErrorCode = (
  result: PortResult<CanonicalMenuAnalysis>,
  code: string,
): void => {
  assert.equal(result.status, "error");
  if (result.status === "error") {
    assert.equal(result.error.error.code, code);
  }
};

const menuOnlyRun = await prepareOwnedRepository(
  "43434343-4343-4434-8434-434343434343",
);
const menuOnlyValidator = new CanonicalMenuValidationService(
  () => menuOnlyAnalysis,
);
const menuOnlyPipeline = new CanonicalPipelineApplicationService(
  menuOnlyValidator,
  menuOnlyRun.recording.repository,
  {
    expiresAt: "2026-07-21T20:00:00.000Z",
    generateId: idGenerator([
      "44444444-4444-4444-8444-444444444444",
    ]),
    identity: menuOnlyRun.identity,
    persistedAt: "2026-07-21T18:10:00.000Z",
    runId: "43434343-4343-4434-8434-434343434343",
  },
);
const menuOnlyResult = await menuOnlyPipeline.run(
  {
    extraction: menuOnlyExtraction,
    restaurantResolution: unconfirmedResolution,
  },
  context,
);
assert.equal(menuOnlyResult.status, "success");
if (menuOnlyResult.status === "success") {
  assert.equal(menuOnlyResult.value.publicationState, "analysis_only");
  assert.equal(menuOnlyResult.value.menuVersion, null);
}
assert.equal(menuOnlyValidator.callCount, 1);
assert.equal(menuOnlyRun.recording.persistAnalysisOnlyCalls(), 1);
assert.equal(menuOnlyRun.recording.publishEligibleAnalysisCalls(), 0);
const menuOnlyCounts = menuOnlyRun.inner.snapshotCounts();
assert.equal(menuOnlyCounts.canonicalAnalyses, 1);
for (const count of [
  menuOnlyCounts.restaurants,
  menuOnlyCounts.restaurantExternalReferences,
  menuOnlyCounts.restaurantMenuVersions,
  menuOnlyCounts.menuItems,
  menuOnlyCounts.dishes,
  menuOnlyCounts.menuItemDishMatches,
  menuOnlyCounts.publicationReceipts,
]) {
  assert.equal(count, 0, "menu-only flow must not publish relational rows");
}

const confirmedRun = await prepareOwnedRepository(
  "45454545-4545-4454-8454-454545454545",
);
const confirmedValidator = new CanonicalMenuValidationService(
  () => confirmedAnalysis,
);
const confirmedPipeline = new CanonicalPipelineApplicationService(
  confirmedValidator,
  confirmedRun.recording.repository,
  {
    expiresAt: "2026-07-21T20:00:00.000Z",
    generateId: idGenerator([
      "46464646-4646-4464-8464-464646464646",
      "47474747-4747-4474-8474-474747474747",
      "48484848-4848-4484-8484-484848484848",
    ]),
    identity: confirmedRun.identity,
    persistedAt: "2026-07-21T18:10:00.000Z",
    runId: "45454545-4545-4454-8454-454545454545",
  },
);
const confirmedResult = await confirmedPipeline.run(
  {
    extraction: confirmedExtraction,
    restaurantResolution: confirmedResolution,
  },
  context,
);
assert.equal(confirmedResult.status, "success");
if (confirmedResult.status === "success") {
  assert.equal(confirmedResult.value.publicationState, "eligible");
  assert.deepEqual(
    confirmedResult.value.menuItems.map((item) => ({
      description: item.description,
      name: item.name,
      optionTexts: item.optionTexts,
      price: item.price,
      sourceEvidence: item.sourceEvidence,
    })),
    confirmedExtraction.sections.flatMap((section) =>
      section.items.map((item) => ({
        description: item.description,
        name: item.name,
        optionTexts: item.optionTexts,
        price: item.price,
        sourceEvidence: item.sourceEvidence,
      })),
    ),
  );
  assert.equal(confirmedResult.value.dishCandidates.length, 0);
  assert.equal(confirmedResult.value.dishClaims.length, 0);
  assert.equal(confirmedResult.value.menuItemClaims.length, 0);
}
assert.equal(confirmedValidator.callCount, 1);
assert.equal(confirmedRun.recording.persistAnalysisOnlyCalls(), 0);
assert.equal(confirmedRun.recording.publishEligibleAnalysisCalls(), 1);
const confirmedCounts = confirmedRun.inner.snapshotCounts();
assert.equal(confirmedCounts.restaurants, 1);
assert.equal(confirmedCounts.restaurantExternalReferences, 1);
assert.equal(confirmedCounts.restaurantMenuVersions, 1);
assert.equal(confirmedCounts.menuItems, confirmedAnalysis.menuItems.length);
assert.equal(confirmedCounts.publicationReceipts, 1);
assert.equal(confirmedCounts.dishes, 0);
assert.equal(confirmedCounts.menuItemDishMatches, 0);

const mismatchedExtraction = CompactMenuExtractionSchema.parse({
  ...confirmedExtraction,
  sections: confirmedExtraction.sections.map((section, sectionIndex) => ({
    ...section,
    items: section.items.map((item, itemIndex) => ({
      ...item,
      sourceEvidence:
        sectionIndex === 0 && itemIndex === 0
          ? item.sourceEvidence.map((evidence) => ({
              ...evidence,
              sourceRef: "49494949-4949-4494-8494-494949494949",
            }))
          : item.sourceEvidence,
    })),
  })),
});
CanonicalValidationRequestSchema.parse({
  extraction: mismatchedExtraction,
  restaurantResolution: confirmedResolution,
});
const mismatchRun = await prepareOwnedRepository(
  "50505050-5050-4505-8505-505050505050",
);
const mismatchValidator = new CanonicalMenuValidationService(
  () => confirmedAnalysis,
);
const mismatchPipeline = new CanonicalPipelineApplicationService(
  mismatchValidator,
  mismatchRun.recording.repository,
  {
    expiresAt: "2026-07-21T20:00:00.000Z",
    generateId: idGenerator([
      "51515151-5151-4515-8515-515151515151",
    ]),
    identity: mismatchRun.identity,
    persistedAt: "2026-07-21T18:10:00.000Z",
    runId: "50505050-5050-4505-8505-505050505050",
  },
);
const mismatchResult = await mismatchPipeline.run(
  {
    extraction: mismatchedExtraction,
    restaurantResolution: confirmedResolution,
  },
  context,
);
assertErrorCode(mismatchResult, "INVALID_INPUT");
assert.equal(mismatchValidator.callCount, 0);
assert.equal(mismatchRun.recording.persistAnalysisOnlyCalls(), 0);
assert.equal(mismatchRun.recording.publishEligibleAnalysisCalls(), 0);
assert.equal(mismatchRun.inner.snapshotCounts().canonicalAnalyses, 0);

const failingRun = await prepareOwnedRepository(
  "52525252-5252-4525-8525-525252525252",
  "before_receipt",
);
const failingPipeline = new CanonicalPipelineApplicationService(
  new CanonicalMenuValidationService(() => confirmedAnalysis),
  failingRun.recording.repository,
  {
    expiresAt: "2026-07-21T20:00:00.000Z",
    generateId: idGenerator([
      "53535353-5353-4535-8535-535353535353",
      "54545454-5454-4545-8545-545454545454",
      "55555555-5555-4555-8555-555555555555",
    ]),
    identity: failingRun.identity,
    persistedAt: "2026-07-21T18:10:00.000Z",
    runId: "52525252-5252-4525-8525-525252525252",
  },
);
const failingResult = await failingPipeline.run(
  {
    extraction: confirmedExtraction,
    restaurantResolution: confirmedResolution,
  },
  context,
);
assertErrorCode(failingResult, "INTERNAL_ERROR");
assert.equal(failingRun.recording.publishEligibleAnalysisCalls(), 1);
const failingCounts = failingRun.inner.snapshotCounts();
assert.equal(failingCounts.canonicalAnalyses, 0);
assert.equal(failingCounts.restaurants, 0);
assert.equal(failingCounts.restaurantMenuVersions, 0);
assert.equal(failingCounts.menuItems, 0);
assert.equal(failingCounts.publicationReceipts, 0);

console.log("Foodseyo S1.5 canonical publication pipeline tests passed.");
