import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  CanonicalMenuAnalysisSchema,
  CONTRACT_VERSIONS,
  RestaurantResolutionSchema,
} from "@foodseyo/contracts";

import {
  DeterministicMvpAnalysisRepository,
  PersistenceContractError,
  StaleAnalysisOwnerError,
  type ExactIdentityRequest,
  type SemanticVersionVector,
} from "../src/mvp-persistence.js";

type JsonRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const fixture = JSON.parse(
  await readFile(
    resolve("../menu-analysis/fixtures/u2.1-pipeline.valid.json"),
    "utf8",
  ),
) as unknown;
assert(isRecord(fixture));

const eligibleAnalysis = CanonicalMenuAnalysisSchema.parse(
  fixture.canonicalAnalysis,
);
const confirmedResolution = RestaurantResolutionSchema.parse(
  fixture.restaurantResolution,
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
const analysisOnly = CanonicalMenuAnalysisSchema.parse({
  ...eligibleAnalysis,
  analysisId: "44444444-4444-4444-8444-444444444445",
  menuItems: eligibleAnalysis.menuItems.map((item) => ({
    ...item,
    menuVersionId: null,
  })),
  menuVersion: null,
  publicationState: "analysis_only",
  restaurantResolution: unconfirmedResolution,
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

const identityRequest: ExactIdentityRequest = {
  analysisContractId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
  collectedAt: eligibleAnalysis.source.collectedAt,
  createdAt: "2026-07-21T18:00:00.000Z",
  evidenceIdentityVersion: "evidence-identity/1.0.0",
  evidenceSetId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1",
  sourceFingerprint: eligibleAnalysis.source.sourceFingerprint,
  sourceRef: eligibleAnalysis.source.sourceRef,
  sourceType: eligibleAnalysis.source.sourceType,
  versions,
};

const repository = new DeterministicMvpAnalysisRepository();
const identity = await repository.resolveExactIdentity(identityRequest);
const repeatedIdentity = await repository.resolveExactIdentity({
  ...identityRequest,
  analysisContractId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
  evidenceSetId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2",
});
assert.deepEqual(repeatedIdentity, identity, "exact identity must converge");

const [firstAcquisition, secondAcquisition] = await Promise.all([
  repository.acquireAnalysisOwner({
    identity,
    leaseExpiresAt: "2026-07-21T18:10:00.000Z",
    runId: "cccccccc-cccc-4ccc-8ccc-ccccccccccc1",
    startedAt: "2026-07-21T18:01:00.000Z",
  }),
  repository.acquireAnalysisOwner({
    identity,
    leaseExpiresAt: "2026-07-21T18:10:00.000Z",
    runId: "cccccccc-cccc-4ccc-8ccc-ccccccccccc2",
    startedAt: "2026-07-21T18:01:00.000Z",
  }),
]);
assert.deepEqual(
  [firstAcquisition.status, secondAcquisition.status].sort(),
  ["owner", "waiting"],
  "concurrent identical requests must elect one owner",
);
const ownerAcquisition =
  firstAcquisition.status === "owner" ? firstAcquisition : secondAcquisition;
assert.equal(ownerAcquisition.status, "owner");

const busy = await repository.waitForReusableCanonicalAnalysis(
  identity,
  { maxPolls: 2, pollIntervalMs: 0 },
  () => "2026-07-21T18:02:00.000Z",
  () => Promise.resolve(),
);
assert.deepEqual(busy, { status: "busy" });

await repository.persistAnalysisOnly({
  analysis: analysisOnly,
  expiresAt: "2026-07-21T19:00:00.000Z",
  identity,
  persistedAt: "2026-07-21T18:03:00.000Z",
  runId: ownerAcquisition.owner.runId,
});
const reusable = await repository.findReusableCanonicalAnalysis(
  identity,
  "2026-07-21T18:04:00.000Z",
);
assert.deepEqual(reusable, analysisOnly);
const menuOnlyCounts = repository.snapshotCounts();
assert.equal(menuOnlyCounts.analysisContracts, 1);
assert.equal(menuOnlyCounts.menuEvidenceSets, 1);
assert.equal(menuOnlyCounts.analysisRuns, 1);
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
  assert.equal(count, 0, "menu-only persistence must not create publication rows");
}

const eligibleRepository = new DeterministicMvpAnalysisRepository();
const eligibleIdentity = await eligibleRepository.resolveExactIdentity(
  identityRequest,
);
const eligibleOwner = await eligibleRepository.acquireAnalysisOwner({
  identity: eligibleIdentity,
  leaseExpiresAt: "2026-07-21T18:10:00.000Z",
  runId: "dddddddd-dddd-4ddd-8ddd-ddddddddddd1",
  startedAt: "2026-07-21T18:01:00.000Z",
});
assert.equal(eligibleOwner.status, "owner");
await assert.rejects(
  eligibleRepository.persistAnalysisOnly({
    analysis: eligibleAnalysis,
    expiresAt: "2026-07-21T19:00:00.000Z",
    identity: eligibleIdentity,
    persistedAt: "2026-07-21T18:03:00.000Z",
    runId:
      eligibleOwner.status === "owner" ? eligibleOwner.owner.runId : "unreachable",
  }),
  PersistenceContractError,
);
assert.equal(eligibleRepository.snapshotCounts().canonicalAnalyses, 0);

const leaseRepository = new DeterministicMvpAnalysisRepository();
const leaseIdentity = await leaseRepository.resolveExactIdentity(identityRequest);
const staleOwner = await leaseRepository.acquireAnalysisOwner({
  identity: leaseIdentity,
  leaseExpiresAt: "2026-07-21T18:02:00.000Z",
  runId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1",
  startedAt: "2026-07-21T18:01:00.000Z",
});
const replacementOwner = await leaseRepository.acquireAnalysisOwner({
  identity: leaseIdentity,
  leaseExpiresAt: "2026-07-21T18:10:00.000Z",
  runId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2",
  startedAt: "2026-07-21T18:03:00.000Z",
});
assert.equal(staleOwner.status, "owner");
assert.equal(replacementOwner.status, "owner");
if (staleOwner.status !== "owner") {
  assert.fail("expected initial owner");
}
await assert.rejects(
  leaseRepository.persistAnalysisOnly({
    analysis: analysisOnly,
    expiresAt: "2026-07-21T19:00:00.000Z",
    identity: leaseIdentity,
    persistedAt: "2026-07-21T18:01:30.000Z",
    runId: staleOwner.owner.runId,
  }),
  StaleAnalysisOwnerError,
);

const failureRepository = new DeterministicMvpAnalysisRepository();
const failureIdentity = await failureRepository.resolveExactIdentity(
  identityRequest,
);
const retryableOwner = await failureRepository.acquireAnalysisOwner({
  identity: failureIdentity,
  leaseExpiresAt: "2026-07-21T18:10:00.000Z",
  runId: "ffffffff-ffff-4fff-8fff-fffffffffff1",
  startedAt: "2026-07-21T18:01:00.000Z",
});
assert.equal(retryableOwner.status, "owner");
if (retryableOwner.status !== "owner") {
  assert.fail("expected retryable owner");
}
await failureRepository.markAnalysisFailure({
  finishedAt: "2026-07-21T18:02:00.000Z",
  identity: failureIdentity,
  kind: "retryable",
  runId: retryableOwner.owner.runId,
  safeErrorCode: "UPSTREAM_TIMEOUT",
});
const retryOwner = await failureRepository.acquireAnalysisOwner({
  identity: failureIdentity,
  leaseExpiresAt: "2026-07-21T18:12:00.000Z",
  runId: "ffffffff-ffff-4fff-8fff-fffffffffff2",
  startedAt: "2026-07-21T18:03:00.000Z",
});
assert.equal(retryOwner.status, "owner");
if (retryOwner.status !== "owner") {
  assert.fail("expected replacement owner");
}
assert.equal(retryOwner.owner.attemptNumber, 2);
await failureRepository.markAnalysisFailure({
  finishedAt: "2026-07-21T18:04:00.000Z",
  identity: failureIdentity,
  kind: "terminal",
  runId: retryOwner.owner.runId,
  safeErrorCode: "INVALID_UPSTREAM_RESULT",
});
const terminal = await failureRepository.acquireAnalysisOwner({
  identity: failureIdentity,
  leaseExpiresAt: "2026-07-21T18:15:00.000Z",
  runId: "ffffffff-ffff-4fff-8fff-fffffffffff3",
  startedAt: "2026-07-21T18:05:00.000Z",
});
assert.deepEqual(terminal, {
  safeErrorCode: "INVALID_UPSTREAM_RESULT",
  status: "terminal",
});

console.log("Foodseyo DB-3 exact cache and menu-only persistence tests passed.");
