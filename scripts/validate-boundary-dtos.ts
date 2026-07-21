import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  BOUNDARY_DTO_SCHEMAS,
  CANONICAL_PUBLICATION_STATES,
  CONTRACT_STATUS,
  CONTRACT_VERSIONS,
  CULINARY_CLAIM_KINDS,
  EXTRACTION_WARNING_CODES,
  MATCH_DECISION_KINDS,
  MENU_CONTENT_KINDS,
  PUBLIC_ERROR_CODES,
  PUBLIC_ERROR_REGISTRY,
  PUBLIC_OUTCOME_CODES,
  RESTAURANT_MATCH_SIGNALS,
  WORKFLOW_STAGES,
  type BoundaryDtoSchemaName,
  type RuntimeContractSchema,
} from "../packages/contracts/src/index.js";

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
  readonly schema: BoundaryDtoSchemaName;
  readonly fixture: string;
  readonly mutations: readonly Mutation[];
  readonly expectedIssues: readonly ExpectedIssue[];
};

const isRecord = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readJson = async (path: string): Promise<unknown> =>
  JSON.parse(await readFile(resolve(path), "utf8")) as unknown;

const assertExactValues = (
  actual: readonly string[],
  expected: readonly string[],
  label: string,
) => {
  assert.deepEqual(actual, expected, `${label} drifted`);
};

assert.equal(CONTRACT_STATUS, "frozen");
assert.equal(CONTRACT_VERSIONS.boundaryDtos, "boundary-dtos/1.1.0");
assert.deepEqual(Object.keys(BOUNDARY_DTO_SCHEMAS), [
  "RestaurantCandidate",
  "RestaurantResolution",
  "MenuSourceInput",
  "CompactMenuExtraction",
  "CanonicalMenuAnalysis",
  "DishCandidate",
  "EffectiveDishProfile",
  "PublicOutcome",
  "PublicErrorEnvelope",
]);
assertExactValues(RESTAURANT_MATCH_SIGNALS, [
  "name",
  "address",
  "location",
  "user_link",
  "visual_text",
], "RESTAURANT_MATCH_SIGNALS");
assertExactValues(MENU_CONTENT_KINDS, [
  "image_collection",
  "html",
  "pdf",
  "plain_text",
], "MENU_CONTENT_KINDS");
assertExactValues(EXTRACTION_WARNING_CODES, [
  "partial_menu",
  "uncertain_section",
  "uncertain_price",
  "unreadable_content",
], "EXTRACTION_WARNING_CODES");
assertExactValues(MATCH_DECISION_KINDS, [
  "human_reviewed",
  "deterministic_rule",
], "MATCH_DECISION_KINDS");
assertExactValues(CULINARY_CLAIM_KINDS, [
  "basic_tastes",
  "flavor_notes",
  "textures",
  "heat",
  "richness",
  "heat_adjustability",
  "ingredient",
], "CULINARY_CLAIM_KINDS");
assertExactValues(PUBLIC_OUTCOME_CODES, [
  "RESTAURANT_CONFIRMATION_REQUIRED",
  "RESTAURANT_NOT_RESOLVED",
  "MENU_SOURCE_NOT_FOUND",
  "MENU_SOURCE_CONFLICT",
  "MENU_PARTIAL",
], "PUBLIC_OUTCOME_CODES");
assertExactValues(WORKFLOW_STAGES, [
  "intake",
  "restaurant_resolution",
  "source_acquisition",
  "compact_extraction",
  "canonical_validation",
  "constrained_explanation",
  "persistence",
], "WORKFLOW_STAGES");
assertExactValues(CANONICAL_PUBLICATION_STATES, [
  "eligible",
  "analysis_only",
], "CANONICAL_PUBLICATION_STATES");
assertExactValues(PUBLIC_ERROR_CODES, [
  "INVALID_INPUT",
  "UNSAFE_SOURCE",
  "PAYLOAD_TOO_LARGE",
  "UPSTREAM_TIMEOUT",
  "UPSTREAM_UNAVAILABLE",
  "INVALID_UPSTREAM_RESULT",
  "ANALYSIS_TEMPORARILY_UNAVAILABLE",
  "INTERNAL_ERROR",
], "PUBLIC_ERROR_CODES");

for (const [code, definition] of Object.entries(PUBLIC_ERROR_REGISTRY)) {
  assert(PUBLIC_ERROR_CODES.includes(code as never));
  assert.equal(
    /https?:\/\//i.test(definition.message),
    false,
    `${code} contains a URL`,
  );
  assert.equal(
    /token|credential|database|provider response/i.test(definition.message),
    false,
    `${code} contains unsafe internal detail`,
  );
}

const validFixture = await readJson(
  "packages/contracts/fixtures/boundary-dtos.valid.json",
);
assert(isRecord(validFixture), "valid boundary fixture must be an object");

const validFixtureToSchema = {
  restaurantCandidate: "RestaurantCandidate",
  restaurantResolution: "RestaurantResolution",
  menuSourceInput: "MenuSourceInput",
  compactMenuExtraction: "CompactMenuExtraction",
  canonicalMenuAnalysis: "CanonicalMenuAnalysis",
  canonicalMenuAnalysisSecondRestaurant: "CanonicalMenuAnalysis",
  dishCandidate: "DishCandidate",
  effectiveDishProfile: "EffectiveDishProfile",
  publicOutcome: "PublicOutcome",
  publicErrorEnvelope: "PublicErrorEnvelope",
} as const satisfies Readonly<Record<string, BoundaryDtoSchemaName>>;

for (const [fixtureName, schemaName] of Object.entries(validFixtureToSchema)) {
  const schema: RuntimeContractSchema<unknown> = BOUNDARY_DTO_SCHEMAS[schemaName];
  const result = schema.safeParse(validFixture[fixtureName]);
  assert.equal(
    result.success,
    true,
    `${schemaName} valid fixture failed: ${
      result.success ? "" : JSON.stringify(result.issues)
    }`,
  );
}

const restaurantCandidate = validFixture.restaurantCandidate;
assert(isRecord(restaurantCandidate));
assert.equal(
  restaurantCandidate.officialWebsiteUrl,
  "https://fixture.example/restaurant",
);
assert(isRecord(restaurantCandidate.localeEvidence));
assert.equal(restaurantCandidate.localeEvidence.countryCode, "US");
assert.equal(restaurantCandidate.localeEvidence.countryBasis, "source_stated");
assert.equal(restaurantCandidate.localeEvidence.currencyCode, "USD");
assert.equal(
  restaurantCandidate.localeEvidence.currencyBasis,
  "inferred_from_source",
);
assert.equal(
  BOUNDARY_DTO_SCHEMAS.RestaurantCandidate.safeParse({
    ...restaurantCandidate,
    officialWebsiteUrl: null,
    localeEvidence: null,
  }).success,
  true,
  "restaurant candidate nullable metadata must remain valid",
);

const canonical = validFixture.canonicalMenuAnalysis;
assert(isRecord(canonical));
assert(Array.isArray(canonical.menuItems));
assert(Array.isArray(canonical.dishMatches));
assert(Array.isArray(canonical.menuItemClaims));
assert(Array.isArray(canonical.effectiveProfiles));
const menuItems = canonical.menuItems.filter(isRecord);
const matches = canonical.dishMatches.filter(isRecord);
const firstClaims = canonical.menuItemClaims.filter(isRecord);
const profiles = canonical.effectiveProfiles.filter(isRecord);

assert.equal(
  menuItems[0]?.price &&
    isRecord(menuItems[0].price) &&
    menuItems[0].price.amountMinor,
  1250,
);
assert.equal(
  menuItems[1]?.price &&
    isRecord(menuItems[1].price) &&
    menuItems[1].price.amountMinor,
  1450,
);
assert.equal(matches[0]?.dishId, matches[1]?.dishId);
assert.equal(
  matches.filter(
    (match) =>
      match.menuItemId === "10101010-1010-4010-8010-101010101010" &&
      match.state === "unresolved",
  ).length,
  2,
);
assert.equal(
  matches.filter(
    (match) =>
      match.menuItemId === "20202020-2020-4020-8020-202020202020" &&
      match.state === "matched",
  ).length,
  2,
);
const firstProfileFields =
  profiles[0] && isRecord(profiles[0].fields) ? profiles[0].fields : null;
assert(firstProfileFields);
assert(
  isRecord(firstProfileFields.heat) &&
    firstProfileFields.heat.basis === "source_stated" &&
    firstProfileFields.heat.value === "mild",
);
assert(
  isRecord(firstProfileFields.richness) &&
    firstProfileFields.richness.basis === "culinary_baseline" &&
    firstProfileFields.richness.value === "moderate",
);
assert(
  isRecord(firstProfileFields.basicTastes) &&
    firstProfileFields.basicTastes.state === "unknown" &&
    !("value" in firstProfileFields.basicTastes),
);
assert.equal(profiles[0]?.mergePolicyVersion, CONTRACT_VERSIONS.mergePolicy);
assert.equal(
  profiles[0]?.dishKnowledgeVersion,
  CONTRACT_VERSIONS.dishKnowledge,
);

const secondCanonical = validFixture.canonicalMenuAnalysisSecondRestaurant;
assert(isRecord(secondCanonical));
assert(isRecord(canonical.restaurantResolution));
assert(isRecord(secondCanonical.restaurantResolution));
assert(isRecord(canonical.menuVersion));
assert(isRecord(secondCanonical.menuVersion));
assert(Array.isArray(secondCanonical.menuItems));
assert(Array.isArray(secondCanonical.dishMatches));
assert(Array.isArray(secondCanonical.menuItemClaims));
const secondMenuItems = secondCanonical.menuItems.filter(isRecord);
const secondMatches = secondCanonical.dishMatches.filter(isRecord);
const secondClaims = secondCanonical.menuItemClaims.filter(isRecord);

assert.notEqual(
  canonical.restaurantResolution.restaurantId,
  secondCanonical.restaurantResolution.restaurantId,
  "cross-restaurant fixture must use distinct restaurant branches",
);
assert.notEqual(
  canonical.menuVersion.menuVersionId,
  secondCanonical.menuVersion.menuVersionId,
  "cross-restaurant fixture must use distinct menu versions",
);
assert.notEqual(
  canonical.source && isRecord(canonical.source)
    ? canonical.source.sourceRef
    : null,
  secondCanonical.source && isRecord(secondCanonical.source)
    ? secondCanonical.source.sourceRef
    : null,
  "cross-restaurant fixture must use distinct menu sources",
);
assert.notEqual(
  menuItems[0]?.menuItemId,
  secondMenuItems[0]?.menuItemId,
  "cross-restaurant fixture must use distinct restaurant menu items",
);
assert.notDeepEqual(
  menuItems[0]?.price,
  secondMenuItems[0]?.price,
  "restaurant-specific prices must remain separate",
);
assert.equal(
  matches[0]?.dishId,
  secondMatches[0]?.dishId,
  "distinct restaurant menu items must be able to share one general Dish",
);
assert.equal(
  firstClaims.some(
    (claim) =>
      isRecord(claim.claim) &&
      claim.claim.kind === "heat" &&
      claim.claim.value === "mild",
  ),
  true,
  "first restaurant must retain its own heat claim",
);
assert.equal(
  firstClaims.some(
    (claim) =>
      isRecord(claim.claim) &&
      claim.claim.kind === "ingredient" &&
      claim.claim.ingredientName === "fixture herb",
  ),
  true,
  "first restaurant must retain its own ingredient claim",
);
assert.equal(
  secondClaims.some(
    (claim) =>
      isRecord(claim.claim) &&
      claim.claim.kind === "heat" &&
      claim.claim.value === "very_hot",
  ),
  true,
  "second restaurant must retain its own heat claim",
);
assert.equal(
  secondClaims.some(
    (claim) =>
      isRecord(claim.claim) &&
      claim.claim.kind === "ingredient" &&
      claim.claim.ingredientName === "fixture pepper",
  ),
  true,
  "second restaurant must retain its own ingredient claim",
);
assert.equal(
  firstClaims.some(
    (claim) =>
      isRecord(claim.claim) &&
      claim.claim.kind === "heat" &&
      claim.claim.value === "very_hot",
  ),
  false,
  "second restaurant heat must not leak into the first branch",
);
assert.equal(
  secondClaims.some(
    (claim) =>
      isRecord(claim.claim) &&
      claim.claim.kind === "ingredient" &&
      claim.claim.ingredientName === "fixture herb",
  ),
  false,
  "first restaurant ingredient must not leak into the second branch",
);

const invalidFixture = await readJson(
  "packages/contracts/fixtures/boundary-dtos.invalid.json",
);
assert(Array.isArray(invalidFixture), "invalid boundary fixture must be an array");

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

for (const rawCase of invalidFixture) {
  assert(isRecord(rawCase));
  const invalidCase = rawCase as unknown as InvalidFixtureCase;
  assert(invalidCase.schema in BOUNDARY_DTO_SCHEMAS);
  assert(invalidCase.fixture in validFixture);
  assert(
    Array.isArray(invalidCase.expectedIssues) &&
      invalidCase.expectedIssues.length > 0,
    `${invalidCase.case} must declare stable expected issue code/path pairs`,
  );
  const invalidValue = mutateFixture(
    validFixture[invalidCase.fixture],
    invalidCase.mutations,
  );
  const schema: RuntimeContractSchema<unknown> =
    BOUNDARY_DTO_SCHEMAS[invalidCase.schema];
  const result = schema.safeParse(invalidValue);
  assert.equal(
    result.success,
    false,
    `${invalidCase.case} unexpectedly passed ${invalidCase.schema}`,
  );
  assert.equal(result.success, false);
  const issueKeys = new Set(
    result.issues.map(
      (issue) => `${issue.code}:${JSON.stringify(issue.path)}`,
    ),
  );
  for (const expectedIssue of invalidCase.expectedIssues) {
    const expectedKey = `${expectedIssue.code}:${JSON.stringify(
      expectedIssue.path,
    )}`;
    assert(
      issueKeys.has(expectedKey),
      `${invalidCase.case} missed expected issue ${expectedKey}; received ${JSON.stringify(
        result.issues,
      )}`,
    );
  }
}

console.log("Foodseyo U1.3 boundary DTO validation passed.");
