import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  AnalysisApplicationResultSchema,
  CanonicalMenuAnalysisSchema,
  MODULE_INTERFACE_VERSION,
  PublicErrorEnvelopeSchema,
  PublicOutcomeSchema,
  RestaurantResolutionSchema,
  type AnalysisWorkflowRequest,
  type PortInvocationContext,
  type PublicOutcome,
  type RestaurantResolution,
} from "@foodseyo/contracts";
import { FakeAnalysisWorkflowPort } from "@foodseyo/menu-analysis";
import {
  BLOCKED_UI_BINDINGS,
  MOBILE_ACCESSIBILITY_REQUIREMENTS,
  addLocalPhoto,
  buildApplicationResultScreen,
  buildErrorScreen,
  buildInputScreen,
  buildOutcomeScreen,
  buildRestaurantSelectionScreen,
  buildResultScreen,
  buildUploadReviewScreen,
  createLocalInputDraft,
  formatMenuItemPrice,
  preserveLinkInput,
  runDeterministicExperience,
} from "../src/index.js";

interface BoundaryFixtures {
  readonly restaurantResolution: unknown;
  readonly menuSourceInput: unknown;
  readonly canonicalMenuAnalysis: unknown;
  readonly publicOutcome: unknown;
  readonly publicErrorEnvelope: unknown;
}

interface ModuleFixtures {
  readonly explanation: unknown;
  readonly publicationReceipt: unknown;
}

interface WebFixture {
  readonly linkInput: string;
  readonly photos: readonly {
    readonly clientId: string;
    readonly byteCount: number;
  }[];
  readonly viewportWidths: readonly number[];
  readonly requiredEvidenceLabels: readonly string[];
  readonly restaurantResolutionStates: readonly {
    readonly state: RestaurantResolution["state"];
    readonly selectable: boolean;
    readonly controlIds: readonly string[];
  }[];
  readonly blockedContractIssues: readonly number[];
}

const readJson = async <T>(path: string): Promise<T> =>
  JSON.parse(await readFile(resolve(path), "utf8")) as T;

const boundary = await readJson<BoundaryFixtures>(
  "../../packages/contracts/fixtures/boundary-dtos.valid.json",
);
const moduleFixtures = await readJson<ModuleFixtures>(
  "../../packages/contracts/fixtures/module-interfaces.valid.json",
);
const webFixture = await readJson<WebFixture>(
  "fixtures/u2-4-foundation.valid.json",
);
const forbiddenKeys = await readJson<readonly string[]>(
  "fixtures/u2-4-foundation.invalid.json",
);

const resolution = RestaurantResolutionSchema.parse(
  boundary.restaurantResolution,
);
const analysis = CanonicalMenuAnalysisSchema.parse(
  boundary.canonicalMenuAnalysis,
);
const outcome = PublicOutcomeSchema.parse(boundary.publicOutcome);
const errorEnvelope = PublicErrorEnvelopeSchema.parse(
  boundary.publicErrorEnvelope,
);

let draft = createLocalInputDraft();
draft = preserveLinkInput(draft, webFixture.linkInput);
for (const photo of webFixture.photos) {
  draft = addLocalPhoto(draft, photo.clientId, photo.byteCount);
}

assert.equal(draft.linkInput, webFixture.linkInput);
assert.deepEqual(
  draft.photos.map((photo) => photo.displayLabel),
  ["Photo 1", "Photo 2"],
);

const inputScreen = buildInputScreen(draft);
const uploadScreen = buildUploadReviewScreen(draft);
const restaurantScreen = buildRestaurantSelectionScreen(draft, resolution);
const outcomeScreen = buildOutcomeScreen(draft, outcome);
const errorScreen = buildErrorScreen(draft, errorEnvelope);
const resultScreen = buildResultScreen(draft, analysis);

for (const screen of [
  inputScreen,
  uploadScreen,
  restaurantScreen,
  outcomeScreen,
  errorScreen,
  resultScreen,
]) {
  assert.equal(screen.draft.linkInput, webFixture.linkInput);
  assert.equal(screen.draft.photos.length, 2);
  assert(screen.controls.every((control) => control.label.length > 0));
  assert(screen.controls.every((control) => control.ariaLabel.length > 0));
  assert.equal(
    new Set(screen.controls.map((control) => control.id)).size,
    screen.controls.length,
  );
}

assert.equal(restaurantScreen.candidates.length, 1);
assert.equal(restaurantScreen.candidates[0]?.name, "Fixture Restaurant");
assert.equal("googlePlaceId" in (restaurantScreen.candidates[0] ?? {}), false);

const secondCandidate = {
  ...resolution.candidates[0]!,
  candidateId: "10101010-1010-4010-8010-101010101010",
  googlePlaceId: "fixture_google_place_002",
  displayName: "Second Fixture Restaurant",
  fullAddress: "2 Fixture Avenue",
  shortAddress: "Second Fixture Avenue",
  rank: 2,
};
const resolutionForState = (
  state: RestaurantResolution["state"],
): RestaurantResolution => {
  if (state === "user_confirmed") return resolution;
  if (state === "externally_verified") {
    return RestaurantResolutionSchema.parse({
      ...resolution,
      state,
      confirmationEvidence: {
        kind: "external_evidence",
        sourceRefs: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],
        recordedAt: resolution.resolvedAt,
      },
    });
  }
  return RestaurantResolutionSchema.parse({
    ...resolution,
    state,
    candidates:
      state === "conflicting"
        ? [...resolution.candidates, secondCandidate]
        : resolution.candidates,
    selectedCandidateId: null,
    restaurantId: null,
    confirmationEvidence: null,
    requiresUserConfirmation: state !== "rejected",
    resolvedAt: null,
  });
};

for (const expected of webFixture.restaurantResolutionStates) {
  const screen = buildRestaurantSelectionScreen(
    draft,
    resolutionForState(expected.state),
  );
  assert.equal(screen.resolutionState, expected.state);
  assert.deepEqual(
    screen.controls.map((control) => control.id),
    expected.controlIds,
  );
  assert(
    screen.candidates.every(
      (candidate) => candidate.canSelect === expected.selectable,
    ),
  );
  assert(
    screen.candidates.every(
      (candidate) =>
        (candidate.confirmLabel !== null) === expected.selectable &&
        (candidate.confirmAriaLabel !== null) === expected.selectable,
    ),
  );
  if (expected.state === "candidate" || expected.state === "conflicting") {
    assert(
      screen.candidates.every((candidate) => candidate.isSelected === false),
      "unconfirmed rank-one candidate must not be auto-selected",
    );
  }
  if (expected.state === "conflicting") {
    assert.match(screen.description, /different locations/i);
  }
  if (expected.state === "user_confirmed") {
    assert.match(screen.title, /confirmed/i);
    assert.equal(screen.candidates[0]?.isSelected, true);
  }
  if (expected.state === "externally_verified") {
    assert.match(screen.title, /verified/i);
    assert.equal(screen.candidates[0]?.isSelected, true);
  }
  if (expected.state === "rejected") {
    assert.match(screen.description, /menu-photo-only/i);
  }
}

const numericMeaning = (display: string): string => {
  const numeric = display.match(/[\d,]+(?:\.\d+)?/)?.[0];
  assert(numeric, `price has no numeric value: ${display}`);
  return `${display.includes("-") ? "-" : ""}${numeric.replaceAll(",", "")}`;
};
const fixtureMenuItem = analysis.menuItems[0]!;
const priceMeaning = (amountMinor: number, currency: string): string =>
  numericMeaning(
    formatMenuItemPrice({
      ...fixtureMenuItem,
      price: { amountMinor, currency },
    }),
  );

assert.equal(priceMeaning(1500, "JPY"), "1500");
assert.equal(priceMeaning(1234, "USD"), "12.34");
assert.equal(priceMeaning(1234, "KWD"), "1.234");
assert.equal(priceMeaning(-1234, "USD"), "-12.34");
assert.equal(priceMeaning(0, "KWD"), "0.000");
assert.equal(priceMeaning(Number.MAX_SAFE_INTEGER, "USD"), "90071992547409.91");
assert.equal(priceMeaning(1234, "NOT_A_CURRENCY"), "12.34");

const unresolvedRestaurantOutcome: PublicOutcome = {
  code: "RESTAURANT_NOT_RESOLVED",
  stage: "restaurant_resolution",
  correlationId: "fixture_corr_restaurant_unresolved",
  retryable: false,
  canContinueMenuOnly: true,
};
const unresolvedRestaurantScreen = buildOutcomeScreen(
  draft,
  unresolvedRestaurantOutcome,
);
assert.equal(unresolvedRestaurantScreen.isApplicationFailure, false);
assert.equal(unresolvedRestaurantScreen.canContinueMenuOnly, true);
assert(
  unresolvedRestaurantScreen.controls.some(
    (control) => control.id === "continue-menu-only",
  ),
);

assert.equal(resultScreen.menuItems.length, analysis.menuItems.length);
const unresolvedDish = resultScreen.menuItems.find(
  (item) => item.name === "Unresolved Fixture Item",
);
assert(unresolvedDish);
assert.equal(unresolvedDish.dishResolved, false);
assert.match(unresolvedDish.dishStatusMessage, /unresolved/i);

const allFacts = resultScreen.menuItems.flatMap((item) => item.facts);
const evidenceLabels = new Set(allFacts.map((fact) => fact.evidence.label));
for (const label of webFixture.requiredEvidenceLabels) {
  assert(evidenceLabels.has(label), `missing evidence label ${label}`);
}
const unknownFacts = allFacts.filter((fact) => fact.state === "unknown");
assert(unknownFacts.length > 0);
for (const fact of unknownFacts) {
  assert.equal(fact.value, "Not confirmed");
  assert.match(fact.evidence.description, /does not mean absent, false, or safe/i);
}
const baselineFacts = allFacts.filter(
  (fact) => fact.evidence.basis === "culinary_baseline",
);
assert(baselineFacts.length > 0);
assert(
  baselineFacts.every((fact) =>
    /not confirmed for this restaurant/i.test(fact.evidence.description),
  ),
);
assert.match(
  resultScreen.safetyNotice,
  /does not confirm allergen or dietary safety/i,
);

assert.equal(MOBILE_ACCESSIBILITY_REQUIREMENTS.minimumViewportWidthPx, 320);
assert.equal(MOBILE_ACCESSIBILITY_REQUIREMENTS.horizontalOverflowAllowed, false);
assert.equal(MOBILE_ACCESSIBILITY_REQUIREMENTS.minimumInteractiveTargetPx, 44);
assert(
  webFixture.viewportWidths.every(
    (width) => width >= MOBILE_ACCESSIBILITY_REQUIREMENTS.minimumViewportWidthPx,
  ),
);
assert.deepEqual(
  [
    BLOCKED_UI_BINDINGS.framework.issue,
    BLOCKED_UI_BINDINGS.intakeAndProgress.issue,
  ],
  webFixture.blockedContractIssues,
);

const applicationResult = AnalysisApplicationResultSchema.parse({
  analysis,
  explanation: moduleFixtures.explanation,
  publication: moduleFixtures.publicationReceipt,
});
const applicationScreen = buildApplicationResultScreen(draft, applicationResult);
assert.equal(applicationScreen.kind, "overview");
assert.equal(
  JSON.stringify(applicationScreen).includes("Synthetic contract fixture"),
  false,
);

const request: AnalysisWorkflowRequest = {
  menuSource: boundary.menuSourceInput as AnalysisWorkflowRequest["menuSource"],
  restaurantResolution: resolution,
};
const context: PortInvocationContext = {
  contractVersion: MODULE_INTERFACE_VERSION,
  correlationId: "fixture_corr_web_foundation",
  timeoutMs: 1000,
  signal: new AbortController().signal,
};
const successPort = new FakeAnalysisWorkflowPort({
  defaultResult: { status: "success", value: applicationResult },
  abortedResult: { status: "outcome", outcome },
  timedOutResult: { status: "error", error: errorEnvelope },
});
const deterministicScreen = await runDeterministicExperience(
  successPort,
  request,
  context,
  draft,
);
assert.equal(deterministicScreen.kind, "overview");
assert.equal(successPort.callCount, 1);

const timeoutPort = new FakeAnalysisWorkflowPort({
  defaultResult: { status: "error", error: errorEnvelope },
  abortedResult: { status: "outcome", outcome },
  timedOutResult: { status: "error", error: errorEnvelope },
});
const timeoutScreen = await runDeterministicExperience(
  timeoutPort,
  request,
  context,
  draft,
);
assert.equal(timeoutScreen.kind, "error");
if (timeoutScreen.kind === "error") {
  assert.equal(timeoutScreen.code, "UPSTREAM_TIMEOUT");
  assert.equal(timeoutScreen.retryable, true);
  assert(timeoutScreen.controls.some((control) => control.id === "retry"));
}

const safeOutput = JSON.stringify({
  inputScreen,
  uploadScreen,
  restaurantScreen,
  outcomeScreen,
  errorScreen,
  resultScreen,
});
for (const key of forbiddenKeys) {
  assert.equal(safeOutput.includes(`\"${key}\"`), false, `unsafe UI key ${key}`);
}

const providerLeak = structuredClone(
  boundary.canonicalMenuAnalysis,
) as Record<string, unknown>;
providerLeak.providerResponse = { unsafe: true };
assert.equal(CanonicalMenuAnalysisSchema.safeParse(providerLeak).success, false);

const databaseLeak = structuredClone(
  boundary.canonicalMenuAnalysis,
) as Record<string, unknown>;
databaseLeak.databaseRow = { unsafe: true };
assert.equal(CanonicalMenuAnalysisSchema.safeParse(databaseLeak).success, false);

const candidateLeak = structuredClone(
  boundary.restaurantResolution,
) as RestaurantResolution & {
  candidates: Array<Record<string, unknown>>;
};
candidateLeak.candidates[0]!.providerDto = { unsafe: true };
assert.equal(RestaurantResolutionSchema.safeParse(candidateLeak).success, false);

console.log("Foodseyo U2.4 framework-neutral web foundation validation passed.");
