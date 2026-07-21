import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

import {
  ContractValidationError,
  BOUNDARY_DTO_SCHEMAS,
  AnalysisApplicationResultSchema,
  CONTRACT_STATUS,
  CONTRACT_VERSIONS,
  MODULE_INTERFACE_VERSION,
  PortInvocationContextSchema,
  PublicationReceiptSchema,
  addContractIssue,
  createRuntimeSchema,
  isPublicationEligibleAnalysis,
  parseDeterministicFakePlan,
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
  readonly input: Readonly<Record<string, unknown>>;
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
assert.equal(CONTRACT_STATUS, "frozen");
assert.equal(MODULE_INTERFACE_VERSION, "module-interfaces/1.0.0");

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
abortedController.abort(new DOMException("cancelled", "AbortError"));
const abortedContext: PortInvocationContext = {
  ...context,
  signal: abortedController.signal,
};
const timedOutController = new AbortController();
timedOutController.abort(new DOMException("deadline exceeded", "TimeoutError"));
const timedOutContext: PortInvocationContext = {
  ...context,
  signal: timedOutController.signal,
};
PortInvocationContextSchema.parse(context);
PortInvocationContextSchema.parse(abortedContext);
PortInvocationContextSchema.parse(timedOutContext);

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
assertResultStatus(
  await restaurantFake.resolve(
    {
      candidates: [restaurantCandidate],
      priorResolution: restaurantResolution,
      selectedCandidateId: null,
      confirmationEvidence: null,
    },
    timedOutContext,
  ),
  "error",
);
assert.equal(restaurantFake.callCount, 3);

const uiEventFake = new FakeUiOperationalEventPort();
await uiEventFake.emit(restaurantResolution, context);
await uiEventFake.emit(publicOutcome, context);
await uiEventFake.emit(publicOutcome, abortedContext);
await uiEventFake.emit(publicOutcome, timedOutContext);
assert.equal(uiEventFake.callCount, 4);
assert.deepEqual(uiEventFake.events, [
  restaurantResolution,
  publicOutcome,
]);

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
assertResultStatus(
  await sourceFake.acquire(
    {
      restaurantResolution,
      menuScope: menuSourceInput.menuScope,
      submissionContent: [menuSourceInput.content],
      requestedAt: menuSourceInput.requestedAt,
    },
    abortedContext,
  ),
  "outcome",
);
assertResultStatus(
  await sourceFake.acquire(
    {
      restaurantResolution,
      menuScope: menuSourceInput.menuScope,
      submissionContent: [menuSourceInput.content],
      requestedAt: menuSourceInput.requestedAt,
    },
    timedOutContext,
  ),
  "error",
);

const extractionFake = new FakeCompactMenuExtractionPort(
  plan(compactExtraction),
);
assertResultStatus(
  await extractionFake.extract(menuSourceInput, context),
  "success",
);
assertResultStatus(
  await extractionFake.extract(menuSourceInput, abortedContext),
  "outcome",
);
assertResultStatus(
  await extractionFake.extract(menuSourceInput, timedOutContext),
  "error",
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
    abortedContext,
  ),
  "outcome",
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
assertResultStatus(
  await dishFake.findReviewedClaims(
    {
      candidates: canonicalAnalysis.dishCandidates as readonly DishCandidate[],
    },
    abortedContext,
  ),
  "outcome",
);
assertResultStatus(
  await dishFake.findReviewedClaims(
    {
      candidates: canonicalAnalysis.dishCandidates as readonly DishCandidate[],
    },
    timedOutContext,
  ),
  "error",
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
assertResultStatus(
  await mergeFake.merge(
    {
      matches: canonicalAnalysis.dishMatches,
      menuItemClaims: canonicalAnalysis.menuItemClaims,
      dishClaims: dishKnowledgeResult.claims,
    },
    abortedContext,
  ),
  "outcome",
);
assertResultStatus(
  await mergeFake.merge(
    {
      matches: canonicalAnalysis.dishMatches,
      menuItemClaims: canonicalAnalysis.menuItemClaims,
      dishClaims: dishKnowledgeResult.claims,
    },
    timedOutContext,
  ),
  "error",
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
assertResultStatus(
  await explanationFake.render(canonicalAnalysis, abortedContext),
  "outcome",
);
assertResultStatus(
  await explanationFake.render(canonicalAnalysis, timedOutContext),
  "error",
);

assert.equal(isPublicationEligibleAnalysis(canonicalAnalysis), true);
const analysisOnly = {
  ...canonicalAnalysis,
  publicationState: "analysis_only",
  menuVersion: null,
  menuItems: canonicalAnalysis.menuItems.map((menuItem) => ({
    ...menuItem,
    menuVersionId: null,
  })),
} as CanonicalMenuAnalysis;
assert.equal(isPublicationEligibleAnalysis(analysisOnly), false);
assert.equal(
  BOUNDARY_DTO_SCHEMAS.CanonicalMenuAnalysis.safeParse(analysisOnly).success,
  true,
);
AnalysisApplicationResultSchema.parse({
  analysis: analysisOnly,
  explanation,
  publication: null,
});

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
assertResultStatus(
  await publicationFake.publish(canonicalAnalysis, abortedContext),
  "outcome",
);
assertResultStatus(
  await publicationFake.publish(canonicalAnalysis, timedOutContext),
  "error",
);

const applicationResult: AnalysisApplicationResult = {
  analysis: canonicalAnalysis,
  explanation,
  publication: publicationReceipt,
};
const workflowFake = new FakeAnalysisWorkflowPort(plan(applicationResult));
const workflowSuccess = await workflowFake.run(
    { menuSource: menuSourceInput, restaurantResolution },
    context,
);
assertResultStatus(workflowSuccess, "success");
if (workflowSuccess.status === "success") {
  AnalysisApplicationResultSchema.parse(workflowSuccess.value);
}
assertResultStatus(
  await workflowFake.run(
    { menuSource: menuSourceInput, restaurantResolution },
    abortedContext,
  ),
  "outcome",
);
assertResultStatus(
  await workflowFake.run(
    { menuSource: menuSourceInput, restaurantResolution },
    timedOutContext,
  ),
  "error",
);

const observabilityEvent =
  moduleFixtures.observabilityEvent as unknown as SafeObservabilityEvent;
const observabilityFake = new FakeSafeObservabilityPort();
await observabilityFake.emit(observabilityEvent, context);
await observabilityFake.emit(observabilityEvent, abortedContext);
await observabilityFake.emit(observabilityEvent, timedOutContext);
assert.equal(observabilityFake.callCount, 3);
assert.deepEqual(observabilityFake.events, [observabilityEvent]);

const InternalPackageImportSchema = createRuntimeSchema<string>(
  "InternalPackageImport",
  (value, issues) => {
    if (typeof value !== "string" || /\/src\//u.test(value)) {
      addContractIssue(issues, "internal_package_import", ["specifier"]);
    }
  },
);

const expectContractIssue = async (
  fixture: InvalidFixture,
  exercise: () => unknown | Promise<unknown>,
) => {
  let actualIssues: ContractValidationError["issues"] | null = null;
  try {
    await exercise();
  } catch (error) {
    assert(
      error instanceof ContractValidationError,
      `${fixture.case} must fail with ContractValidationError`,
    );
    actualIssues = error.issues;
  }
  assert(actualIssues, `${fixture.case} must reject its invalid input`);
  assert(
    actualIssues.some(
      (issue) =>
        issue.code === fixture.expectedIssue.code &&
        JSON.stringify(issue.path) ===
          JSON.stringify(fixture.expectedIssue.path),
    ),
    `${fixture.case} must emit ${fixture.expectedIssue.code} at ${fixture.expectedIssue.path.join(".")}; actual ${JSON.stringify(actualIssues)}`,
  );
};

for (const fixture of invalidFixtures as InvalidFixture[]) {
  assert(isRecord(fixture.input), `${fixture.case} requires executable input`);
  if (fixture.case === "non_positive_timeout") {
    await expectContractIssue(fixture, () =>
      restaurantFake.resolve(
        {
          candidates: [restaurantCandidate],
          priorResolution: null,
          selectedCandidateId: restaurantCandidate.candidateId,
          confirmationEvidence: restaurantResolution.confirmationEvidence,
        },
        {
          ...context,
          timeoutMs: Number(fixture.input.timeoutMs),
        },
      ),
    );
    continue;
  }
  if (fixture.case === "analysis_only_publication") {
    await expectContractIssue(fixture, () =>
      publicationFake.publish(analysisOnly as never, context),
    );
    continue;
  }
  if (fixture.case === "unsafe_observability_field") {
    await expectContractIssue(fixture, () =>
      observabilityFake.emit(
        {
          ...observabilityEvent,
          ...fixture.input,
        } as never,
        context,
      ),
    );
    continue;
  }
  if (fixture.case === "internal_package_import") {
    await expectContractIssue(fixture, () =>
      InternalPackageImportSchema.parse(fixture.input.specifier),
    );
    continue;
  }
  if (fixture.case === "aborted_success_plan") {
    await expectContractIssue(fixture, () =>
      parseDeterministicFakePlan(
        {
          ...plan(publicationReceipt),
          abortedResult: {
            status: fixture.input.status,
            value: publicationReceipt,
          },
        },
        PublicationReceiptSchema,
      ),
    );
    continue;
  }
  if (fixture.case === "timed_out_success_plan") {
    await expectContractIssue(fixture, () =>
      parseDeterministicFakePlan(
        {
          ...plan(publicationReceipt),
          timedOutResult: {
            status: fixture.input.status,
            value: publicationReceipt,
          },
        },
        PublicationReceiptSchema,
      ),
    );
    continue;
  }
  if (fixture.case === "timed_out_non_timeout_error") {
    const nonTimeoutError: PublicErrorEnvelope = {
      error: {
        code: "UPSTREAM_UNAVAILABLE",
        message: "A required menu service is temporarily unavailable.",
        correlationId: publicError.error.correlationId,
        retryable: true,
      },
      httpStatus: 503,
    };
    await expectContractIssue(fixture, () =>
      parseDeterministicFakePlan(
        {
          ...plan(publicationReceipt),
          timedOutResult: {
            status: "error",
            error: nonTimeoutError,
          },
        },
        PublicationReceiptSchema,
      ),
    );
    continue;
  }
  if (fixture.case === "workflow_explanation_analysis_mismatch") {
    await expectContractIssue(fixture, () =>
      new FakeAnalysisWorkflowPort(
        plan({
          ...applicationResult,
          explanation: {
            ...explanation,
            analysisId: String(fixture.input.analysisId),
          },
        }),
      ),
    );
    continue;
  }
  if (fixture.case === "workflow_explanation_menu_item_missing") {
    await expectContractIssue(fixture, () =>
      new FakeAnalysisWorkflowPort(
        plan({
          ...applicationResult,
          explanation: {
            ...explanation,
            blocks: explanation.blocks.map((block, index) =>
              index === 1
                ? {
                    ...block,
                    menuItemId: String(fixture.input.menuItemId),
                  }
                : block,
            ),
          },
        }),
      ),
    );
    continue;
  }
  if (fixture.case === "workflow_analysis_only_with_publication") {
    await expectContractIssue(fixture, () =>
      new FakeAnalysisWorkflowPort(
        plan({
          analysis: analysisOnly,
          explanation,
          publication: publicationReceipt,
        }),
      ),
    );
    continue;
  }
  if (fixture.case === "workflow_publication_analysis_mismatch") {
    await expectContractIssue(fixture, () =>
      new FakeAnalysisWorkflowPort(
        plan({
          ...applicationResult,
          publication: {
            ...publicationReceipt,
            analysisId: String(fixture.input.analysisId),
          },
        }),
      ),
    );
    continue;
  }
  if (fixture.case === "workflow_publication_menu_version_mismatch") {
    await expectContractIssue(fixture, () =>
      new FakeAnalysisWorkflowPort(
        plan({
          ...applicationResult,
          publication: {
            ...publicationReceipt,
            menuVersionId: String(fixture.input.menuVersionId),
          },
        }),
      ),
    );
    continue;
  }
  if (fixture.case === "publication_port_receipt_analysis_mismatch") {
    const invalidPublicationFake = new FakeAnalysisPublicationPort(
      plan({
        ...publicationReceipt,
        analysisId: String(fixture.input.analysisId),
      }),
    );
    await expectContractIssue(fixture, () =>
      invalidPublicationFake.publish(canonicalAnalysis as never, context),
    );
    continue;
  }
  if (fixture.case === "publication_port_receipt_menu_version_mismatch") {
    const invalidPublicationFake = new FakeAnalysisPublicationPort(
      plan({
        ...publicationReceipt,
        menuVersionId: String(fixture.input.menuVersionId),
      }),
    );
    await expectContractIssue(fixture, () =>
      invalidPublicationFake.publish(canonicalAnalysis as never, context),
    );
    continue;
  }
  assert.fail(`Unhandled invalid fixture ${fixture.case}`);
}

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
  assert.equal(manifest.version, "1.0.0");
  assert.deepEqual(
    manifest.dependencies,
    packageName === "database"
      ? {
          "@foodseyo/contracts": "workspace:*",
          "drizzle-orm": "0.45.2",
          pg: "8.22.0",
        }
      : packageName === "menu-analysis"
        ? {
            "@foodseyo/contracts": "workspace:*",
            "@foodseyo/database": "workspace:*",
          }
      : {
          "@foodseyo/contracts": "workspace:*",
        },
  );

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
