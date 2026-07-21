import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  CanonicalMenuAnalysisSchema,
  CONTRACT_VERSIONS,
  PublicationEligibleAnalysisSchema,
  RestaurantResolutionSchema,
} from "@foodseyo/contracts";

import {
  DeterministicMvpAnalysisRepository,
  InjectedPublicationFailure,
  PersistenceContractError,
  StaleAnalysisOwnerError,
  type ExactIdentityRequest,
  type SemanticVersionVector,
  type PublicationFaultPoint,
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

const buildEligibleAnalysis = (restaurantId: string) =>
  PublicationEligibleAnalysisSchema.parse({
    ...eligibleAnalysis,
    dishCandidates: [
      {
        aliases: [],
        candidateId: "77777777-7777-4777-8777-777777777777",
        contractVersion: CONTRACT_VERSIONS.dishKnowledge,
        dishId: "88888888-8888-4888-8888-888888888888",
        displayName: "Synthetic Bowl",
        normalizedName: "synthetic bowl",
        sourceEvidence: eligibleAnalysis.menuItems[0]?.sourceEvidence ?? [],
      },
    ],
    dishMatches: [
      {
        decision: {
          decidedAt: "2026-07-21T18:03:00.000Z",
          kind: "deterministic_rule",
          reviewerRef: null,
          ruleVersion: "dish-match-rule/1.0.0",
        },
        dishCandidateId: "77777777-7777-4777-8777-777777777777",
        dishId: "88888888-8888-4888-8888-888888888888",
        matchId: "99999999-9999-4999-8999-999999999999",
        menuItemId: eligibleAnalysis.menuItems[0]?.menuItemId,
        sourceEvidence: eligibleAnalysis.menuItems[0]?.sourceEvidence ?? [],
        state: "matched",
      },
    ],
    menuVersion: {
      ...eligibleAnalysis.menuVersion,
      restaurantId,
    },
    restaurantResolution: {
      ...eligibleAnalysis.restaurantResolution,
      restaurantId,
    },
  });

const acquirePublicationOwner = async (
  publicationRepository: DeterministicMvpAnalysisRepository,
  runId: string,
) => {
  const publicationIdentity = await publicationRepository.resolveExactIdentity(
    identityRequest,
  );
  const acquisition = await publicationRepository.acquireAnalysisOwner({
    identity: publicationIdentity,
    leaseExpiresAt: "2026-07-21T18:20:00.000Z",
    runId,
    startedAt: "2026-07-21T18:01:00.000Z",
  });
  assert.equal(acquisition.status, "owner");
  if (acquisition.status !== "owner") {
    assert.fail("expected publication owner");
  }
  return { identity: publicationIdentity, owner: acquisition.owner };
};

const publicationRequest = (
  publicationIdentity: typeof identity,
  runId: string,
  faultPoint?: PublicationFaultPoint,
) => ({
  buildAnalysis: buildEligibleAnalysis,
  expiresAt: "2026-07-21T20:00:00.000Z",
  externalReferenceId: "10101010-1010-4010-8010-101010101010",
  faultPoint,
  googlePlaceId: "fixture_place_branch_a",
  identity: publicationIdentity,
  operationId: "20202020-2020-4020-8020-202020202020",
  persistedAt: "2026-07-21T18:05:00.000Z",
  reservedRestaurantId: "22222222-2222-4222-8222-222222222222",
  restaurantDisplayName: "Fixture Branch A",
  runId,
});

const publicationRepository = new DeterministicMvpAnalysisRepository();
const publicationOwner = await acquirePublicationOwner(
  publicationRepository,
  "30303030-3030-4030-8030-303030303030",
);
const receipt = await publicationRepository.publishEligibleAnalysis(
  publicationRequest(publicationOwner.identity, publicationOwner.owner.runId),
);
assert.deepEqual(Object.keys(receipt).sort(), [
  "analysisId",
  "contractVersion",
  "menuVersionId",
  "publishedAt",
  "status",
]);
assert.equal(receipt.contractVersion, CONTRACT_VERSIONS.moduleInterfaces);
const publicationCounts = publicationRepository.snapshotCounts();
assert.equal(publicationCounts.restaurants, 1);
assert.equal(publicationCounts.restaurantExternalReferences, 1);
assert.equal(publicationCounts.restaurantMenuVersions, 1);
assert.equal(publicationCounts.menuItems, 1);
assert.equal(publicationCounts.dishes, 1);
assert.equal(publicationCounts.menuItemDishMatches, 1);
assert.equal(publicationCounts.canonicalAnalyses, 1);
assert.equal(publicationCounts.publicationReceipts, 1);
assert.equal(
  await publicationRepository.findRestaurantByExternalReference(
    "fixture_place_branch_a",
  ),
  "22222222-2222-4222-8222-222222222222",
);
const duplicateReceipt = await publicationRepository.publishEligibleAnalysis(
  publicationRequest(publicationOwner.identity, publicationOwner.owner.runId),
);
assert.deepEqual(duplicateReceipt, receipt);
assert.deepEqual(publicationRepository.snapshotCounts(), publicationCounts);

for (const faultPoint of [
  "before_canonical_analysis",
  "while_writing_menu_items",
  "before_receipt",
] as const) {
  const faultRepository = new DeterministicMvpAnalysisRepository();
  const faultOwner = await acquirePublicationOwner(
    faultRepository,
    faultPoint === "before_canonical_analysis"
      ? "40404040-4040-4040-8040-404040404040"
      : faultPoint === "while_writing_menu_items"
        ? "50505050-5050-4050-8050-505050505050"
        : "60606060-6060-4060-8060-606060606060",
  );
  await assert.rejects(
    faultRepository.publishEligibleAnalysis(
      publicationRequest(faultOwner.identity, faultOwner.owner.runId, faultPoint),
    ),
    InjectedPublicationFailure,
  );
  const counts = faultRepository.snapshotCounts();
  assert.equal(counts.canonicalAnalyses, 0);
  assert.equal(counts.restaurants, 0);
  assert.equal(counts.restaurantExternalReferences, 0);
  assert.equal(counts.restaurantMenuVersions, 0);
  assert.equal(counts.menuItems, 0);
  assert.equal(counts.dishes, 0);
  assert.equal(counts.menuItemDishMatches, 0);
  assert.equal(counts.publicationReceipts, 0);
}

const uncertainRepository = new DeterministicMvpAnalysisRepository();
const uncertainOwner = await acquirePublicationOwner(
  uncertainRepository,
  "70707070-7070-4070-8070-707070707070",
);
const recoveredReceipt = await uncertainRepository.publishEligibleAnalysis(
  publicationRequest(
    uncertainOwner.identity,
    uncertainOwner.owner.runId,
    "after_commit_response_loss",
  ),
);
const retryReceipt = await uncertainRepository.publishEligibleAnalysis(
  publicationRequest(uncertainOwner.identity, uncertainOwner.owner.runId),
);
assert.deepEqual(retryReceipt, recoveredReceipt);
assert.equal(uncertainRepository.snapshotCounts().publicationReceipts, 1);

const concurrentRestaurantId = "23232323-2323-4323-8323-232323232323";
const convergenceRepository = new DeterministicMvpAnalysisRepository({
  googlePlaceId: "fixture_place_branch_a",
  restaurantDisplayName: "Concurrent Fixture Branch",
  restaurantId: concurrentRestaurantId,
});
const convergenceOwner = await acquirePublicationOwner(
  convergenceRepository,
  "80808080-8080-4080-8080-808080808080",
);
const builtRestaurantIds: string[] = [];
await convergenceRepository.publishEligibleAnalysis({
  ...publicationRequest(
    convergenceOwner.identity,
    convergenceOwner.owner.runId,
  ),
  buildAnalysis: (restaurantId) => {
    builtRestaurantIds.push(restaurantId);
    return buildEligibleAnalysis(restaurantId);
  },
});
assert.deepEqual(builtRestaurantIds, [
  "22222222-2222-4222-8222-222222222222",
  concurrentRestaurantId,
]);
assert.equal(
  await convergenceRepository.findRestaurantByExternalReference(
    "fixture_place_branch_a",
  ),
  concurrentRestaurantId,
);
assert.equal(convergenceRepository.snapshotCounts().restaurants, 1);
const convergedAnalysis = await convergenceRepository.findReusableCanonicalAnalysis(
  convergenceOwner.identity,
  "2026-07-21T18:06:00.000Z",
);
assert.equal(
  convergedAnalysis?.restaurantResolution.restaurantId,
  concurrentRestaurantId,
);

await assert.rejects(
  leaseRepository.publishEligibleAnalysis(
    publicationRequest(leaseIdentity, staleOwner.owner.runId),
  ),
  StaleAnalysisOwnerError,
);
assert.equal(leaseRepository.snapshotCounts().publicationReceipts, 0);
assert.equal(leaseRepository.snapshotCounts().restaurants, 0);

console.log("Foodseyo DB-3/DB-4 persistence integration tests passed.");
