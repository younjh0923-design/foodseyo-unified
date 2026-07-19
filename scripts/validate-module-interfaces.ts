import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

import {
  BOUNDARY_DTO_SCHEMAS,
  CONTRACT_STATUS,
  CONTRACT_VERSIONS,
  MODULE_INTERFACE_VERSION,
  isPublicationEligibleAnalysis,
  type AnalysisApplicationResult,
  type CanonicalMenuAnalysis,
  type CompactMenuExtraction,
  type ConstrainedExplanation,
  type DeterministicFakePlan,
  type DishCandidate,
  type DishKnowledgeResult,
  type EffectiveProfileMergeResult,
  type MenuSourceInput,
  type PortInvocationContext,
  type PortResult,
  type PublicationReceipt,
  type PublicErrorEnvelope,
  type PublicOutcome,
  type RestaurantCandidate,
  type RestaurantResolution,
  type SafeObservabilityEvent,
} from "../packages/contracts/src/index.js";
import { FakeAnalysisPublicationPort } from "../packages/database/src/index.js";
import { FakeDishKnowledgePort } from "../packages/dish-knowledge/src/index.js";
import {
  FakeAnalysisWorkflowPort,
  FakeCanonicalMenuValidationPort,
  FakeCompactMenuExtractionPort,
  FakeConstrainedExplanationPort,
} from "../packages/menu-analysis/src/index.js";
import { FakeEffectiveProfileMergePort } from "../packages/merge-policy/src/index.js";
import { FakeSafeObservabilityPort } from "../packages/observability/src/index.js";
import {
  FakeRestaurantResolutionPort,
  FakeUiOperationalEventPort,
} from "../packages/restaurant-resolution/src/index.js";
import { FakeMenuSourceAcquisitionPort } from "../packages/source-acquisition/src/index.js";

type JsonObject = Record<string, unknown>;
type InvalidFixture = {
  readonly case: string;
  readonly expectedIssue: {
    readonly code: string;
    readonly path: readonly (string | number)[];
  };
};

const isRecord = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readJson = async (path: string): Promise<unknown> =>
  JSON.parse(await readFile(resolve(path), "utf8")) as unknown;

const boundaryFixtures = await readJson(
  "packages/contracts/fixtures/boundary-dtos.valid.json",
);
const moduleFixtures = await readJson(
  "packages/contracts/fixtures/module-interfaces.valid.json",
);
const invalidFixtures = await readJson(
  "packages/contracts/fixtures/module-interfaces.invalid.json",
);

assert(isRecord(boundaryFixtures));
assert(isRecord(moduleFixtures));
assert(Array.isArray(invalidFixtures));
assert.equal(CONTRACT_STATUS, "draft");
assert.equal(MODULE_INTERFACE_VERSION, "module-interfaces/0.1.0");

const parseBoundaryFixture = <T>(
  schemaName: keyof typeof BOUNDARY_DTO_SCHEMAS,
  fixtureName: string,
): T => {
  const result = BOUNDARY_DTO_SCHEMAS[schemaName].safeParse(
    boundaryFixtures[fixtureName],
  );
  assert.equal(
    result.success,
    true,
    `${fixtureName} must satisfy ${schemaName}`,
  );
  return result.data as T;
};

const restaurantCandidate = parseBoundaryFixture<RestaurantCandidate>(
  "RestaurantCandidate",
  "restaurantCandidate",
);
const restaurantResolution = parseBoundaryFixture<RestaurantResolution>(
  "RestaurantResolution",
  "restaurantResolution",
);
const menuSourceInput = parseBoundaryFixture<MenuSourceInput>(
  "MenuSourceInput",
  "menuSourceInput",
);
const compactExtraction = parseBoundaryFixture<CompactMenuExtraction>(
  "CompactMenuExtraction",
  "compactMenuExtraction",
);
const canonicalAnalysis = parseBoundaryFixture<CanonicalMenuAnalysis>(
  "CanonicalMenuAnalysis",
  "canonicalMenuAnalysis",
);
const publicOutcome = parseBoundaryFixture<PublicOutcome>(
  "PublicOutcome",
  "publicOutcome",
);
const publicError = parseBoundaryFixture<PublicErrorEnvelope>(
  "PublicErrorEnvelope",
  "publicErrorEnvelope",
);

assert(isRecord(moduleFixtures.invocationContext));
assert(isRecord(moduleFixtures.explanation));
assert(isRecord(moduleFixtures.publicationReceipt));
assert(isRecord(moduleFixtures.observabilityEvent));

const invocationFixture = moduleFixtures.invocationContext;
assert.equal(invocationFixture.contractVersion, MODULE_INTERFACE_VERSION);
assert.equal(
  Number.isSafeInteger(invocationFixture.timeoutMs) &&
    Number(invocationFixture.timeoutMs) > 0,
  true,
);

const controller = new AbortController();
const context: PortInvocationContext = {
  contractVersion: MODULE_INTERFACE_VERSION,
  correlationId: String(invocationFixture.correlationId),
  timeoutMs: Number(invocationFixture.timeoutMs),
  signal: controller.signal,
};
const abortedController = new AbortController();
abortedController.abort();
const abortedContext: PortInvocationContext = {
  ...context,
  signal: abortedController.signal,
};
const timedOutContext: PortInvocationContext = {
  ...context,
  timeoutMs: 0,
};

const plan = <T>(value: T): DeterministicFakePlan<T> => ({
  defaultResult: { status: "success", value },
  abortedResult: { status: "outcome", outcome: publicOutcome },
  timedOutResult: { status: "error", error: publicError },
});

const assertResultStatus = <T>(
  result: PortResult<T>,
  status: PortResult<T>["status"],
) => assert.equal(result.status, status);

const restaurantFake = new FakeRestaurantResolutionPort(
  plan(restaurantResolution),
);
assertResultStatus(
  await restaurantFake.resolve(
    {
      candidates: [restaurantCandidate],
      priorResolution: null,
      selectedCandidateId: restaurantCandidate.candidateId,
      confirmationEvidence: restaurantResolution.confirmationEvidence,
    },
    context,
  ),
  "success",
);
assertResultStatus(
  await restaurantFake.resolve(
    {
      candidates: [restaurantCandidate],
      priorResolution: restaurantResolution,
      selectedCandidateId: null,
      confirmationEvidence: null,
    },
    abortedContext,
  ),
  "outcome",
);
assert.equal(restaurantFake.callCount, 2);

const uiEventFake = new FakeUiOperationalEventPort();
await uiEventFake.emit(restaurantResolution, context);
await uiEventFake.emit(publicOutcome, context);
assert.equal(uiEventFake.callCount, 2);
assert.deepEqual(uiEventFake.events, [restaurantResolution, publicOutcome]);

const sourceFake = new FakeMenuSourceAcquisitionPort(plan(menuSourceInput));
assertResultStatus(
  await sourceFake.acquire(
    {
      restaurantResolution,
      menuScope: menuSourceInput.menuScope,
      submissionContent: [menuSourceInput.content],
      requestedAt: menuSourceInput.requestedAt,
    },
    context,
  ),
  "success",
);

const extractionFake = new FakeCompactMenuExtractionPort(
  plan(compactExtraction),
);
assertResultStatus(
  await extractionFake.extract(menuSourceInput, context),
  "success",
);

const canonicalFake = new FakeCanonicalMenuValidationPort(
  plan(canonicalAnalysis),
);
assertResultStatus(
  await canonicalFake.validate(
    { extraction: compactExtraction, restaurantResolution },
    context,
  ),
  "success",
);
assertResultStatus(
  await canonicalFake.validate(
    { extraction: compactExtraction, restaurantResolution },
    timedOutContext,
  ),
  "error",
);

const reviewedClaims = canonicalAnalysis.dishClaims.filter(
  (claim) => claim.reviewState === "reviewed",
);
const dishKnowledgeResult = {
  claims: reviewedClaims,
} as DishKnowledgeResult;
const dishFake = new FakeDishKnowledgePort(plan(dishKnowledgeResult));
assertResultStatus(
  await dishFake.findReviewedClaims(
    {
      candidates: canonicalAnalysis.dishCandidates as readonly DishCandidate[],
    },
    context,
  ),
  "success",
);
assert(
  dishKnowledgeResult.claims.every(
    (claim) => claim.reviewState === "reviewed",
  ),
);

const mergeResult: EffectiveProfileMergeResult = {
  profiles: canonicalAnalysis.effectiveProfiles,
};
const mergeFake = new FakeEffectiveProfileMergePort(plan(mergeResult));
assertResultStatus(
  await mergeFake.merge(
    {
      matches: canonicalAnalysis.dishMatches,
      menuItemClaims: canonicalAnalysis.menuItemClaims,
      dishClaims: dishKnowledgeResult.claims,
    },
    context,
  ),
  "success",
);

const explanation =
  moduleFixtures.explanation as unknown as ConstrainedExplanation;
assert.equal(explanation.contractVersion, MODULE_INTERFACE_VERSION);
assert.equal(explanation.analysisId, canonicalAnalysis.analysisId);
assert.equal(
  explanation.rendererVersion,
  CONTRACT_VERSIONS.explanationRenderer,
);
const explanationFake = new FakeConstrainedExplanationPort(plan(explanation));
assertResultStatus(
  await explanationFake.render(canonicalAnalysis, context),
  "success",
);

assert.equal(isPublicationEligibleAnalysis(canonicalAnalysis), true);
const analysisOnly = {
  ...canonicalAnalysis,
  publicationState: "analysis_only",
  menuVersion: null,
} as CanonicalMenuAnalysis;
assert.equal(isPublicationEligibleAnalysis(analysisOnly), false);

const publicationReceipt =
  moduleFixtures.publicationReceipt as unknown as PublicationReceipt;
assert.equal(publicationReceipt.contractVersion, MODULE_INTERFACE_VERSION);
assert.equal(publicationReceipt.analysisId, canonicalAnalysis.analysisId);
assert.equal(
  publicationReceipt.menuVersionId,
  canonicalAnalysis.menuVersion?.menuVersionId,
);
const publicationFake = new FakeAnalysisPublicationPort(
  plan(publicationReceipt),
);
assert(isPublicationEligibleAnalysis(canonicalAnalysis));
assertResultStatus(
  await publicationFake.publish(canonicalAnalysis, context),
  "success",
);

const applicationResult: AnalysisApplicationResult = {
  analysis: canonicalAnalysis,
  explanation,
  publication: publicationReceipt,
};
const workflowFake = new FakeAnalysisWorkflowPort(plan(applicationResult));
assertResultStatus(
  await workflowFake.run(
    { menuSource: menuSourceInput, restaurantResolution },
    context,
  ),
  "success",
);

const observabilityEvent =
  moduleFixtures.observabilityEvent as unknown as SafeObservabilityEvent;
const observabilityFake = new FakeSafeObservabilityPort();
await observabilityFake.emit(observabilityEvent);
assert.equal(observabilityFake.callCount, 1);
assert.deepEqual(observabilityFake.events, [observabilityEvent]);

const expectedInvalidIssues = new Map(
  (invalidFixtures as InvalidFixture[]).map((fixture) => [
    fixture.case,
    fixture.expectedIssue,
  ]),
);
assert.deepEqual(expectedInvalidIssues.get("non_positive_timeout"), {
  code: "invalid_invocation_timeout",
  path: ["invocationContext", "timeoutMs"],
});
assert.deepEqual(expectedInvalidIssues.get("analysis_only_publication"), {
  code: "publication_not_eligible",
  path: ["analysis", "publicationState"],
});
assert.deepEqual(expectedInvalidIssues.get("unsafe_observability_field"), {
  code: "unsafe_observability_field",
  path: ["observabilityEvent", "menuText"],
});
assert.deepEqual(expectedInvalidIssues.get("internal_package_import"), {
  code: "internal_package_import",
  path: ["specifier"],
});

const owningPackages = [
  "restaurant-resolution",
  "source-acquisition",
  "menu-analysis",
  "dish-knowledge",
  "merge-policy",
  "database",
  "observability",
] as const;
const packageNames = new Set(
  (
    await readdir(resolve("packages"), {
      withFileTypes: true,
    })
  )
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name),
);

for (const packageName of owningPackages) {
  assert(packageNames.has(packageName), `${packageName} package is missing`);
  const manifest = JSON.parse(
    await readFile(resolve(`packages/${packageName}/package.json`), "utf8"),
  ) as JsonObject;
  assert.equal(manifest.name, `@foodseyo/${packageName}`);
  assert.equal(manifest.version, "0.1.0");
  assert.deepEqual(manifest.dependencies, {
    "@foodseyo/contracts": "workspace:*",
  });

  const source = await readFile(
    resolve(`packages/${packageName}/src/index.ts`),
    "utf8",
  );
  assert.equal(
    /export\s+(?:interface|type)\s/u.test(source),
    false,
    `${packageName} duplicates a shared DTO or port`,
  );
  assert.equal(
    /from\s+["'][^"']+\/src\//u.test(source),
    false,
    `${packageName} imports another package's internals`,
  );
  assert.equal(
    /\b(?:fetch|XMLHttpRequest|WebSocket)\s*\(/u.test(source),
    false,
    `${packageName} fake performs network work`,
  );
  assert.equal(
    /\bprocess\.env\b|\bconsole\./u.test(source),
    false,
    `${packageName} fake reads environment values or logs content`,
  );
  assert.equal(
    /drizzle|postgres|neon|database_url|migration_url/iu.test(source),
    false,
    `${packageName} fake performs database work`,
  );
}

console.log("Module-interface contract validation passed.");
