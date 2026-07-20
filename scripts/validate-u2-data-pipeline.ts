import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  CanonicalMenuAnalysisSchema,
  CompactMenuExtractionSchema,
  ConstrainedExplanationSchema,
  CONTRACT_VERSIONS,
  EffectiveProfileMergeRequestSchema,
  MODULE_INTERFACE_VERSION,
  MenuSourceInputSchema,
  PortInvocationContextSchema,
  PUBLIC_ERROR_REGISTRY,
  PublicErrorEnvelopeSchema,
  PublicOutcomeSchema,
  RestaurantResolutionSchema,
  type CanonicalMenuAnalysis,
  type CompactMenuExtraction,
  type ConstrainedExplanation,
  type DeterministicFakePlan,
  type PortInvocationContext,
  type PortResult,
  type PublicErrorCode,
  type PublicErrorEnvelope,
  type PublicOutcome,
} from "@foodseyo/contracts";
import {
  DeterministicFakeAnalysisRepository,
  TransactionalAnalysisPublicationService,
} from "@foodseyo/database";
import {
  AnalysisApplicationService,
  CanonicalMenuValidationService,
  FakeCompactMenuExtractionPort,
  FakeConstrainedExplanationPort,
} from "@foodseyo/menu-analysis";
import { DeterministicEffectiveProfileMergeService } from "@foodseyo/merge-policy";

type JsonRecord = Record<string, unknown>;

const readJson = async (path: string): Promise<unknown> =>
  JSON.parse(await readFile(resolve(path), "utf8")) as unknown;

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const pipelineFixture = await readJson(
  "packages/menu-analysis/fixtures/u2.1-pipeline.valid.json",
);
const mergeFixture = await readJson(
  "packages/merge-policy/fixtures/u2.1-precedence.valid.json",
);
const transactionFixture = await readJson(
  "packages/database/fixtures/u2.1-transactions.valid.json",
);
assert(isRecord(pipelineFixture));
assert(isRecord(mergeFixture));
assert(isRecord(transactionFixture));

const restaurantResolution = RestaurantResolutionSchema.parse(
  pipelineFixture.restaurantResolution,
);
const menuSource = MenuSourceInputSchema.parse(pipelineFixture.menuSource);
const extraction = CompactMenuExtractionSchema.parse(
  pipelineFixture.extraction,
);
const canonicalAnalysis = CanonicalMenuAnalysisSchema.parse(
  pipelineFixture.canonicalAnalysis,
);
const explanation = ConstrainedExplanationSchema.parse(
  pipelineFixture.explanation,
);
const mergeRequest = EffectiveProfileMergeRequestSchema.parse(mergeFixture);
const publishedAt = String(transactionFixture.publishedAt);
const intermediateFailureWrite = Number(
  transactionFixture.intermediateFailureWrite,
);

const controller = new AbortController();
const context: PortInvocationContext = PortInvocationContextSchema.parse({
  contractVersion: MODULE_INTERFACE_VERSION,
  correlationId: "u2_pipeline_fixture",
  timeoutMs: 10_000,
  signal: controller.signal,
});

const publicOutcome: PublicOutcome = PublicOutcomeSchema.parse({
  code: "MENU_PARTIAL",
  stage: "canonical_validation",
  correlationId: context.correlationId,
  retryable: true,
  canContinueMenuOnly: true,
});
const timeoutError: PublicErrorEnvelope = PublicErrorEnvelopeSchema.parse({
  error: {
    code: "UPSTREAM_TIMEOUT",
    message: PUBLIC_ERROR_REGISTRY.UPSTREAM_TIMEOUT.message,
    correlationId: context.correlationId,
    retryable: PUBLIC_ERROR_REGISTRY.UPSTREAM_TIMEOUT.retryable,
  },
  httpStatus: PUBLIC_ERROR_REGISTRY.UPSTREAM_TIMEOUT.httpStatus,
});
const plan = <T>(value: T): DeterministicFakePlan<T> => ({
  defaultResult: { status: "success", value },
  abortedResult: { status: "outcome", outcome: publicOutcome },
  timedOutResult: { status: "error", error: timeoutError },
});
const deferred = <T>(): {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
} => {
  let resolvePromise!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromiseValue) => {
    resolvePromise = resolvePromiseValue;
  });
  return { promise, resolve: resolvePromise };
};
const contextForSignal = (signal: AbortSignal): PortInvocationContext =>
  PortInvocationContextSchema.parse({
    ...context,
    signal,
  });

const assertError = <T>(
  result: PortResult<T>,
  code: PublicErrorCode,
): void => {
  assert.equal(result.status, "error");
  if (result.status !== "error") {
    return;
  }
  assert.equal(result.error.error.code, code);
  assert.equal(
    result.error.error.message,
    PUBLIC_ERROR_REGISTRY[code].message,
  );
  assert.equal(
    result.error.error.retryable,
    PUBLIC_ERROR_REGISTRY[code].retryable,
  );
  assert.equal(result.error.httpStatus, PUBLIC_ERROR_REGISTRY[code].httpStatus);
  assert.equal(result.error.error.correlationId, context.correlationId);
};

const canonicalService = new CanonicalMenuValidationService(
  () => canonicalAnalysis,
);
const canonicalResult = await canonicalService.validate(
  { extraction, restaurantResolution },
  context,
);
assert.equal(canonicalResult.status, "success");
assert.equal(canonicalService.callCount, 1);

const unvalidatedPromotion = new CanonicalMenuValidationService(
  () => extraction,
);
assertError(
  await unvalidatedPromotion.validate(
    { extraction, restaurantResolution },
    context,
  ),
  "INVALID_UPSTREAM_RESULT",
);

const crossRestaurantCandidate = structuredClone(
  canonicalAnalysis,
) as unknown as {
  restaurantResolution: { restaurantId: string };
  menuVersion: { restaurantId: string };
};
crossRestaurantCandidate.restaurantResolution.restaurantId =
  "22222222-2222-4222-8222-222222222229";
crossRestaurantCandidate.menuVersion.restaurantId =
  "22222222-2222-4222-8222-222222222229";
assert.equal(
  CanonicalMenuAnalysisSchema.safeParse(crossRestaurantCandidate).success,
  true,
);
const crossRestaurantService = new CanonicalMenuValidationService(
  () => crossRestaurantCandidate,
);
const crossRestaurantResult = await crossRestaurantService.validate(
  { extraction, restaurantResolution },
  context,
);
assertError(crossRestaurantResult, "INVALID_UPSTREAM_RESULT");
assert.equal(
  JSON.stringify(
    crossRestaurantResult.status === "error"
      ? crossRestaurantResult.error
      : null,
  ).includes("Fixture Branch"),
  false,
);

const crossBranchPriceCandidate = structuredClone(
  canonicalAnalysis,
) as unknown as {
  menuItems: [{ price: { amountMinor: number; currency: string } }];
};
crossBranchPriceCandidate.menuItems[0].price.amountMinor = 9900;
assert.equal(
  CanonicalMenuAnalysisSchema.safeParse(crossBranchPriceCandidate).success,
  true,
);
const crossBranchPriceService = new CanonicalMenuValidationService(
  () => crossBranchPriceCandidate,
);
assertError(
  await crossBranchPriceService.validate(
    { extraction, restaurantResolution },
    context,
  ),
  "INVALID_UPSTREAM_RESULT",
);

const crossSourceClaimCandidate = structuredClone(
  canonicalAnalysis,
) as unknown as {
  menuItemClaims: unknown[];
};
crossSourceClaimCandidate.menuItemClaims.push({
  claimId: "12121212-1212-4212-8212-121212121212",
  menuItemId: canonicalAnalysis.menuItems[0]?.menuItemId,
  claim: { kind: "heat", value: "hot" },
  basis: "source_stated",
  provenance: [
    {
      kind: "menu_source",
      sourceRef: "13131313-1313-4313-8313-131313131313",
      sourceIndexes: [0],
    },
  ],
  recordedAt: "2026-07-19T18:02:30.000Z",
});
assert.equal(
  CanonicalMenuAnalysisSchema.safeParse(crossSourceClaimCandidate).success,
  false,
);
const crossSourceService = new CanonicalMenuValidationService(
  () => crossSourceClaimCandidate,
);
assertError(
  await crossSourceService.validate(
    { extraction, restaurantResolution },
    context,
  ),
  "INVALID_UPSTREAM_RESULT",
);

const mergeService = new DeterministicEffectiveProfileMergeService(
  "2026-07-19T19:05:00.000Z",
);
const mergeResult = await mergeService.merge(mergeRequest, context);
assert.equal(mergeResult.status, "success");
if (mergeResult.status !== "success") {
  assert.fail("deterministic merge must succeed");
}
assert.equal(mergeResult.value.profiles.length, 2);
const firstProfile = mergeResult.value.profiles.find(
  (profile) =>
    profile.menuItemId === "88888888-8888-4888-8888-888888888881",
);
const secondProfile = mergeResult.value.profiles.find(
  (profile) =>
    profile.menuItemId === "88888888-8888-4888-8888-888888888882",
);
assert(firstProfile);
assert(secondProfile);
assert.deepEqual(firstProfile.fields.heat, {
  state: "known",
  value: "medium",
  basis: "source_stated",
  claimIds: ["cccccccc-cccc-4ccc-8ccc-ccccccccccc1"],
  provenance: [
    {
      kind: "menu_source",
      sourceRef: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1",
      sourceIndexes: [1],
    },
  ],
});
assert.equal(secondProfile.fields.heat.state, "known");
if (secondProfile.fields.heat.state === "known") {
  assert.equal(secondProfile.fields.heat.value, "mild");
}
assert.equal(firstProfile.fields.richness.state, "known");
assert.equal(secondProfile.fields.richness.state, "known");
if (
  firstProfile.fields.richness.state === "known" &&
  secondProfile.fields.richness.state === "known"
) {
  assert.equal(firstProfile.fields.richness.basis, "culinary_baseline");
  assert.equal(secondProfile.fields.richness.basis, "culinary_baseline");
  assert.equal(firstProfile.fields.richness.value, "rich");
  assert.equal(secondProfile.fields.richness.value, "rich");
}
assert.equal(firstProfile.fields.heatAdjustability.state, "unknown");
assert.equal("value" in firstProfile.fields.heatAdjustability, false);
assert.deepEqual(firstProfile.fields.heatAdjustability.claimIds, []);
assert.deepEqual(firstProfile.fields.heatAdjustability.provenance, []);
assert.equal(firstProfile.fields.ingredients.state, "known");
assert.equal(secondProfile.fields.ingredients.state, "known");
if (
  firstProfile.fields.ingredients.state === "known" &&
  secondProfile.fields.ingredients.state === "known"
) {
  assert.deepEqual(
    firstProfile.fields.ingredients.value.map(
      (ingredient) => ingredient.ingredientName,
    ),
    ["Synthetic chili"],
  );
  assert.deepEqual(
    secondProfile.fields.ingredients.value.map(
      (ingredient) => ingredient.ingredientName,
    ),
    ["Synthetic tofu"],
  );
}

const conflictingMergeRequest = {
  ...mergeRequest,
  menuItemClaims: [
    ...mergeRequest.menuItemClaims,
    {
      claimId: "cccccccc-cccc-4ccc-8ccc-ccccccccccc6",
      menuItemId: "88888888-8888-4888-8888-888888888881",
      claim: { kind: "heat", value: "very_hot" },
      basis: "source_stated",
      provenance: [
        {
          kind: "menu_source",
          sourceRef: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1",
          sourceIndexes: [4],
        },
      ],
      recordedAt: "2026-07-19T19:01:05.000Z",
    },
  ],
} as const;
assertError(
  await mergeService.merge(conflictingMergeRequest, context),
  "INVALID_UPSTREAM_RESULT",
);

const successfulRepository = new DeterministicFakeAnalysisRepository();
const publicationService = new TransactionalAnalysisPublicationService(
  successfulRepository,
  publishedAt,
);
const publicationResult = await publicationService.publish(
  canonicalAnalysis as never,
  context,
);
assert.equal(publicationResult.status, "success");
assert.equal(successfulRepository.transactionCount, 1);
assert.equal(successfulRepository.commitCount, 1);
assert.equal(successfulRepository.rollbackCount, 0);
assert.equal(successfulRepository.analyses.length, 1);
assert.equal(successfulRepository.menuVersions.length, 1);
assert.equal(
  successfulRepository.menuItems.length,
  canonicalAnalysis.menuItems.length,
);
assert.equal(successfulRepository.receipts.length, 1);

const failingRepository = new DeterministicFakeAnalysisRepository(
  intermediateFailureWrite,
);
const failingPublicationService = new TransactionalAnalysisPublicationService(
  failingRepository,
  publishedAt,
);
assertError(
  await failingPublicationService.publish(canonicalAnalysis as never, context),
  "INTERNAL_ERROR",
);
assert.equal(failingRepository.transactionCount, 1);
assert.equal(failingRepository.commitCount, 0);
assert.equal(failingRepository.rollbackCount, 1);
assert.equal(failingRepository.analyses.length, 0);
assert.equal(failingRepository.menuVersions.length, 0);
assert.equal(failingRepository.menuItems.length, 0);
assert.equal(failingRepository.effectiveProfiles.length, 0);
assert.equal(failingRepository.receipts.length, 0);

const unconfirmedResolution = RestaurantResolutionSchema.parse({
  ...restaurantResolution,
  state: "candidate",
  selectedCandidateId: null,
  restaurantId: null,
  confirmationEvidence: null,
  requiresUserConfirmation: true,
  resolvedAt: null,
});
const menuOnlySource = MenuSourceInputSchema.parse({
  ...menuSource,
  restaurantContext: null,
});
const menuOnlyExtraction = CompactMenuExtractionSchema.parse({
  ...extraction,
  restaurantContext: null,
});
const analysisOnly = CanonicalMenuAnalysisSchema.parse({
  ...canonicalAnalysis,
  restaurantResolution: unconfirmedResolution,
  publicationState: "analysis_only",
  menuVersion: null,
  menuItems: canonicalAnalysis.menuItems.map((item) => ({
    ...item,
    menuVersionId: null,
  })),
});
const eligibilityRepository = new DeterministicFakeAnalysisRepository();
const eligibilityPublicationService =
  new TransactionalAnalysisPublicationService(
    eligibilityRepository,
    publishedAt,
  );
assertError(
  await eligibilityPublicationService.publish(analysisOnly as never, context),
  "INVALID_UPSTREAM_RESULT",
);
assert.equal(eligibilityRepository.transactionCount, 0);

const workflowRepository = new DeterministicFakeAnalysisRepository();
const workflowPublicationService = new TransactionalAnalysisPublicationService(
  workflowRepository,
  publishedAt,
);
const workflowExtractionPort = new FakeCompactMenuExtractionPort(
  plan(extraction),
);
const workflowCanonicalService = new CanonicalMenuValidationService(
  () => canonicalAnalysis,
);
const workflowExplanationPort = new FakeConstrainedExplanationPort(
  plan(explanation),
);
const workflow = new AnalysisApplicationService(
  workflowExtractionPort,
  workflowCanonicalService,
  workflowExplanationPort,
  workflowPublicationService,
);
const workflowResult = await workflow.run(
  { menuSource, restaurantResolution },
  context,
);
assert.equal(workflowResult.status, "success");
if (workflowResult.status === "success") {
  assert.equal(workflowResult.value.publication?.status, "published");
}
assert.equal(workflowExtractionPort.callCount, 1);
assert.equal(workflowCanonicalService.callCount, 1);
assert.equal(workflowExplanationPort.callCount, 1);
assert.equal(workflowPublicationService.callCount, 1);
assert.equal(workflowRepository.commitCount, 1);

const cancellationNormalizerStarted = deferred<void>();
const cancellationNormalizerResult = deferred<CanonicalMenuAnalysis>();
const cancellationController = new AbortController();
const cancellationExplanationPort = new FakeConstrainedExplanationPort(
  plan(explanation),
);
const cancellationRepository = new DeterministicFakeAnalysisRepository();
const cancellationPublicationService =
  new TransactionalAnalysisPublicationService(
    cancellationRepository,
    publishedAt,
  );
const cancellationWorkflow = new AnalysisApplicationService(
  new FakeCompactMenuExtractionPort(plan(extraction)),
  new CanonicalMenuValidationService(async () => {
    cancellationNormalizerStarted.resolve();
    return cancellationNormalizerResult.promise;
  }),
  cancellationExplanationPort,
  cancellationPublicationService,
);
const cancellationWorkflowResult = cancellationWorkflow.run(
  { menuSource, restaurantResolution },
  contextForSignal(cancellationController.signal),
);
await cancellationNormalizerStarted.promise;
cancellationController.abort(
  new DOMException("synthetic cancellation", "AbortError"),
);
cancellationNormalizerResult.resolve(canonicalAnalysis);
assertError(
  await cancellationWorkflowResult,
  "ANALYSIS_TEMPORARILY_UNAVAILABLE",
);
assert.equal(cancellationExplanationPort.callCount, 0);
assert.equal(cancellationPublicationService.callCount, 0);
assert.equal(cancellationRepository.transactionCount, 0);

const timeoutNormalizerStarted = deferred<void>();
const timeoutNormalizerResult = deferred<CanonicalMenuAnalysis>();
const timeoutController = new AbortController();
const timeoutExplanationPort = new FakeConstrainedExplanationPort(
  plan(explanation),
);
const timeoutRepository = new DeterministicFakeAnalysisRepository();
const timeoutPublicationService = new TransactionalAnalysisPublicationService(
  timeoutRepository,
  publishedAt,
);
const timeoutWorkflow = new AnalysisApplicationService(
  new FakeCompactMenuExtractionPort(plan(extraction)),
  new CanonicalMenuValidationService(async () => {
    timeoutNormalizerStarted.resolve();
    return timeoutNormalizerResult.promise;
  }),
  timeoutExplanationPort,
  timeoutPublicationService,
);
const timeoutWorkflowResult = timeoutWorkflow.run(
  { menuSource, restaurantResolution },
  contextForSignal(timeoutController.signal),
);
await timeoutNormalizerStarted.promise;
timeoutController.abort(new DOMException("synthetic timeout", "TimeoutError"));
timeoutNormalizerResult.resolve(canonicalAnalysis);
assertError(await timeoutWorkflowResult, "UPSTREAM_TIMEOUT");
assert.equal(timeoutExplanationPort.callCount, 0);
assert.equal(timeoutPublicationService.callCount, 0);
assert.equal(timeoutRepository.transactionCount, 0);

const providerFailureExplanationPort = new FakeConstrainedExplanationPort(
  plan(explanation),
);
const providerFailureRepository = new DeterministicFakeAnalysisRepository();
const providerFailurePublicationService =
  new TransactionalAnalysisPublicationService(
    providerFailureRepository,
    publishedAt,
  );
const providerFailureWorkflow = new AnalysisApplicationService(
  new FakeCompactMenuExtractionPort(plan(extraction)),
  new CanonicalMenuValidationService(async () => {
    throw new Error("synthetic provider failure");
  }),
  providerFailureExplanationPort,
  providerFailurePublicationService,
);
const providerFailureResult = await providerFailureWorkflow.run(
  { menuSource, restaurantResolution },
  context,
);
assertError(providerFailureResult, "INVALID_UPSTREAM_RESULT");
assert.equal(
  JSON.stringify(providerFailureResult).includes("synthetic provider failure"),
  false,
);
assert.equal(providerFailureExplanationPort.callCount, 0);
assert.equal(providerFailurePublicationService.callCount, 0);
assert.equal(providerFailureRepository.transactionCount, 0);

const partialRepository = new DeterministicFakeAnalysisRepository(
  intermediateFailureWrite,
);
const partialWorkflow = new AnalysisApplicationService(
  new FakeCompactMenuExtractionPort(plan(extraction)),
  new CanonicalMenuValidationService(() => canonicalAnalysis),
  new FakeConstrainedExplanationPort(plan(explanation)),
  new TransactionalAnalysisPublicationService(partialRepository, publishedAt),
);
assertError(
  await partialWorkflow.run({ menuSource, restaurantResolution }, context),
  "INTERNAL_ERROR",
);
assert.equal(partialRepository.commitCount, 0);
assert.equal(partialRepository.receipts.length, 0);
assert.equal(partialRepository.menuItems.length, 0);

const analysisOnlyExplanation: ConstrainedExplanation = {
  ...explanation,
  analysisId: analysisOnly.analysisId,
};
const analysisOnlyRepository = new DeterministicFakeAnalysisRepository();
const analysisOnlyPublicationService =
  new TransactionalAnalysisPublicationService(
    analysisOnlyRepository,
    publishedAt,
  );
const analysisOnlyWorkflow = new AnalysisApplicationService(
  new FakeCompactMenuExtractionPort(plan(menuOnlyExtraction)),
  new CanonicalMenuValidationService(() => analysisOnly),
  new FakeConstrainedExplanationPort(plan(analysisOnlyExplanation)),
  analysisOnlyPublicationService,
);
const analysisOnlyResult = await analysisOnlyWorkflow.run(
  {
    menuSource: menuOnlySource,
    restaurantResolution: unconfirmedResolution,
  },
  context,
);
assert.equal(analysisOnlyResult.status, "success");
if (analysisOnlyResult.status === "success") {
  assert.equal(analysisOnlyResult.value.publication, null);
}
assert.equal(analysisOnlyPublicationService.callCount, 0);
assert.equal(analysisOnlyRepository.transactionCount, 0);

const sourceFiles = [
  "packages/menu-analysis/src/index.ts",
  "packages/merge-policy/src/index.ts",
  "packages/database/src/index.ts",
] as const;
for (const sourceFile of sourceFiles) {
  const source = await readFile(resolve(sourceFile), "utf8");
  assert.equal(
    /\bfetch\s*\(|XMLHttpRequest|WebSocket|node:https?|node:net|from\s+["']openai["']|@neondatabase|drizzle|\bpg\b|process\.env/iu.test(
      source,
    ),
    false,
    `${sourceFile} must remain provider- and database-network-free`,
  );
  assert.equal(
    /from\s+["'][^"']+\/src\//u.test(source),
    false,
    `${sourceFile} must use package public entry points`,
  );
}

for (const packageName of ["menu-analysis", "merge-policy", "database"]) {
  const manifest = JSON.parse(
    await readFile(resolve(`packages/${packageName}/package.json`), "utf8"),
  ) as JsonRecord;
  assert.deepEqual(manifest.dependencies, {
    "@foodseyo/contracts": "workspace:*",
  });
}
assert.equal(CONTRACT_VERSIONS.boundaryDtos, "boundary-dtos/1.0.0");
assert.equal(CONTRACT_VERSIONS.mergePolicy, "merge-policy/1.0.0");

console.log("U2.1 data and pipeline foundation validation passed.");
