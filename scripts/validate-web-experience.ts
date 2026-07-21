import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  CANDIDATE_CONTRACT_VERSIONS,
  UiSafeOperationalEventSchema,
  type RuntimeContractSchema,
} from "@foodseyo/contracts";
import {
  UI_WORKFLOW_STAGE,
  UI_WORKFLOW_PHASES,
  UI_WORKFLOW_PROGRESS_STATES,
  WEB_EXPERIENCE_CONTRACT_STATUS,
  WEB_EXPERIENCE_SCHEMAS,
  WEB_EXPERIENCE_VERSION,
  WebExperienceUiSafeOperationalEventSchema,
  type WebExperienceSchemaName,
} from "@foodseyo/contracts/web-experience";

type JsonObject = Record<string, unknown>;
type Mutation = {
  readonly operation: "add" | "replace" | "delete";
  readonly path: readonly (string | number)[];
  readonly value?: unknown;
};
type ExpectedIssue = {
  readonly code: string;
  readonly path: readonly (string | number)[];
};
type InvalidFixtureCase = {
  readonly case: string;
  readonly schema: WebExperienceSchemaName;
  readonly fixture: string;
  readonly mutations: readonly Mutation[];
  readonly expectedIssues: readonly ExpectedIssue[];
};

const isRecord = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readJson = async (path: string): Promise<unknown> =>
  JSON.parse(await readFile(resolve(path), "utf8")) as unknown;

assert.equal(WEB_EXPERIENCE_CONTRACT_STATUS, "candidate");
assert.equal(WEB_EXPERIENCE_VERSION, "web-experience/0.1.0");
assert.equal(
  CANDIDATE_CONTRACT_VERSIONS.webExperience,
  WEB_EXPERIENCE_VERSION,
);
assert.equal(UI_WORKFLOW_STAGE, "source_acquisition");
assert.deepEqual(UI_WORKFLOW_PHASES, [
  "official_source_lookup",
  "web_search_fallback",
]);
assert.deepEqual(UI_WORKFLOW_PROGRESS_STATES, [
  "in_progress",
  "complete",
]);
assert.deepEqual(Object.keys(WEB_EXPERIENCE_SCHEMAS), [
  "SubmissionIntakeRequest",
  "UiWorkflowProgress",
]);

const validFixtures = await readJson(
  "packages/contracts/fixtures/web-experience.valid.json",
);
const invalidFixtures = await readJson(
  "packages/contracts/fixtures/web-experience.invalid.json",
);
assert(isRecord(validFixtures), "valid web-experience fixture must be an object");
assert(
  Array.isArray(invalidFixtures),
  "invalid web-experience fixture must be an array",
);

const validFixtureToSchema = {
  intakeLinkOnly: "SubmissionIntakeRequest",
  intakePhotoOnly: "SubmissionIntakeRequest",
  intakeCombined: "SubmissionIntakeRequest",
  progressOfficialInProgress: "UiWorkflowProgress",
  progressOfficialComplete: "UiWorkflowProgress",
  progressWebSearchInProgress: "UiWorkflowProgress",
  progressWebSearchComplete: "UiWorkflowProgress",
} as const satisfies Readonly<Record<string, WebExperienceSchemaName>>;

for (const [fixtureName, schemaName] of Object.entries(validFixtureToSchema)) {
  const schema: RuntimeContractSchema<unknown> =
    WEB_EXPERIENCE_SCHEMAS[schemaName];
  const result = schema.safeParse(validFixtures[fixtureName]);
  assert.equal(
    result.success,
    true,
    `${schemaName} valid fixture failed: ${
      result.success ? "" : JSON.stringify(result.issues)
    }`,
  );
  if (schemaName === "UiWorkflowProgress") {
    WebExperienceUiSafeOperationalEventSchema.parse(
      validFixtures[fixtureName],
    );
    assert.equal(
      UiSafeOperationalEventSchema.safeParse(validFixtures[fixtureName]).success,
      false,
      "frozen module-interfaces/1.0.0 must reject candidate progress",
    );
  }
}

const intakeFixtureNames = [
  "intakeLinkOnly",
  "intakePhotoOnly",
  "intakeCombined",
] as const;
for (const fixtureName of intakeFixtureNames) {
  const fixture = validFixtures[fixtureName];
  assert(isRecord(fixture));
  assert.equal("correlationId" in fixture, false);
  assert.deepEqual(
    Object.keys(fixture).sort(),
    [
      "contractVersion",
      "requestedAt",
      "uploadedPhotoHandles",
      "userSuppliedLink",
    ],
  );
}
for (const [fixtureName, schemaName] of Object.entries(validFixtureToSchema)) {
  if (schemaName !== "UiWorkflowProgress") {
    continue;
  }
  const fixture = validFixtures[fixtureName];
  assert(isRecord(fixture));
  assert.deepEqual(
    Object.keys(fixture).sort(),
    ["contractVersion", "phase", "stage", "state"],
  );
}

const mutateFixture = (
  source: unknown,
  mutations: readonly Mutation[],
): unknown => {
  const cloned = structuredClone(source);
  for (const mutation of mutations) {
    assert(mutation.path.length > 0, "mutation path must not be empty");
    let cursor: unknown = cloned;
    for (const segment of mutation.path.slice(0, -1)) {
      if (typeof segment === "number") {
        assert(Array.isArray(cursor), "numeric mutation segment requires array");
        cursor = cursor[segment];
      } else {
        assert(isRecord(cursor), "string mutation segment requires object");
        cursor = cursor[segment];
      }
    }
    const finalSegment = mutation.path.at(-1);
    assert(finalSegment !== undefined);
    if (typeof finalSegment === "number") {
      assert(Array.isArray(cursor), "numeric mutation target requires array");
      if (mutation.operation === "delete") {
        cursor.splice(finalSegment, 1);
      } else {
        cursor[finalSegment] = mutation.value;
      }
    } else {
      assert(isRecord(cursor), "string mutation target requires object");
      if (mutation.operation === "delete") {
        delete cursor[finalSegment];
      } else {
        cursor[finalSegment] = mutation.value;
      }
    }
  }
  return cloned;
};

for (const rawCase of invalidFixtures) {
  assert(isRecord(rawCase));
  const invalidCase = rawCase as unknown as InvalidFixtureCase;
  assert(invalidCase.schema in WEB_EXPERIENCE_SCHEMAS);
  assert(invalidCase.fixture in validFixtures);
  assert(
    Array.isArray(invalidCase.expectedIssues) &&
      invalidCase.expectedIssues.length > 0,
    `${invalidCase.case} must declare exact issue code/path pairs`,
  );

  const invalidValue = mutateFixture(
    validFixtures[invalidCase.fixture],
    invalidCase.mutations,
  );
  const schema: RuntimeContractSchema<unknown> =
    WEB_EXPERIENCE_SCHEMAS[invalidCase.schema];
  const result = schema.safeParse(invalidValue);
  assert.equal(
    result.success,
    false,
    `${invalidCase.case} unexpectedly passed ${invalidCase.schema}`,
  );
  assert.equal(result.success, false);
  const issueKeys = new Set(
    result.issues.map(
      (validationIssue) =>
        `${validationIssue.code}:${JSON.stringify(validationIssue.path)}`,
    ),
  );
  for (const expectedIssue of invalidCase.expectedIssues) {
    const expectedKey =
      `${expectedIssue.code}:${JSON.stringify(expectedIssue.path)}`;
    assert(
      issueKeys.has(expectedKey),
      `${invalidCase.case} missed ${expectedKey}; received ${JSON.stringify(
        result.issues,
      )}`,
    );
  }
}

const sensitiveFixture = validFixtures.intakeCombined;
assert(isRecord(sensitiveFixture));
const sensitiveInvalid = {
  ...sensitiveFixture,
  correlationId: "fixture-correlation",
};
let safeErrorText = "";
try {
  WEB_EXPERIENCE_SCHEMAS.SubmissionIntakeRequest.parse(sensitiveInvalid);
  assert.fail("sensitive invalid intake must reject");
} catch (error) {
  safeErrorText = String(error);
}
assert.equal(
  safeErrorText,
  "ContractValidationError: SubmissionIntakeRequest contract validation failed",
);
assert.equal(safeErrorText.includes(String(sensitiveFixture.userSuppliedLink)), false);
assert.equal(
  safeErrorText.includes(
    String(
      Array.isArray(sensitiveFixture.uploadedPhotoHandles)
        ? sensitiveFixture.uploadedPhotoHandles[0]
        : "",
    ),
  ),
  false,
);

console.log("Web-experience candidate contract validation passed.");
