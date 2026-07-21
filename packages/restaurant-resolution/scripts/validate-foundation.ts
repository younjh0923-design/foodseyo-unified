import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  MODULE_INTERFACE_VERSION,
  RestaurantCandidateSchema,
  RestaurantResolutionSchema,
  type PortInvocationContext,
  type RestaurantCandidate,
  type RestaurantResolution,
  type RestaurantResolutionRequest,
} from "@foodseyo/contracts";
import {
  DeterministicFakeGooglePlacesAdapter,
  GooglePlacesCandidateFinder,
  normalizeServerRestaurantClues,
  type GooglePlacesCandidateAdapter,
  type ServerRestaurantClues,
} from "../src/foundation.js";
import {
  FakeUiOperationalEventPort,
  FoundationRestaurantResolutionPort,
  RestaurantResolutionService,
  RestaurantResolutionCoordinator,
  createConfirmedRestaurantResolution,
  rankRestaurantCandidates,
  validateRestaurantCandidateSelection,
} from "../src/index.js";

type JsonRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const fixtures = JSON.parse(
  await readFile("fixtures/resolution-foundation.json", "utf8"),
) as unknown;
assert(isRecord(fixtures));
assert(isRecord(fixtures.providerRecords));
assert(Array.isArray(fixtures.cases));

const providerRecords = fixtures.providerRecords;
const record = (
  name: string,
  requestCorrelationId = "u2_3_fixture",
): unknown => {
  assert(Object.hasOwn(providerRecords, name), `missing record ${name}`);
  const value = providerRecords[name];
  assert(isRecord(value), `provider record ${name} must be an object`);
  assert.equal(typeof value.requestCorrelationId, "string");
  return { ...value, requestCorrelationId };
};

const context = (name: string): PortInvocationContext => ({
  contractVersion: MODULE_INTERFACE_VERSION,
  correlationId: `u2_3_${name}`,
  timeoutMs: 5000,
  signal: new AbortController().signal,
});

const timedOutContext = (name: string): PortInvocationContext => {
  const controller = new AbortController();
  controller.abort(new DOMException("deadline exceeded", "TimeoutError"));
  return {
    contractVersion: MODULE_INTERFACE_VERSION,
    correlationId: `u2_3_${name}`,
    timeoutMs: 5000,
    signal: controller.signal,
  };
};

const inFlightTimedOutContext = (
  name: string,
): {
  readonly context: PortInvocationContext;
  readonly abortAsTimedOut: () => void;
} => {
  const controller = new AbortController();
  return {
    context: {
      contractVersion: MODULE_INTERFACE_VERSION,
      correlationId: `u2_3_${name}`,
      timeoutMs: 5000,
      signal: controller.signal,
    },
    abortAsTimedOut: () => {
      controller.abort(new DOMException("deadline exceeded", "TimeoutError"));
    },
  };
};

const inFlightCancelledContext = (
  name: string,
): {
  readonly context: PortInvocationContext;
  readonly abortAsCancelled: () => void;
} => {
  const controller = new AbortController();
  return {
    context: {
      contractVersion: MODULE_INTERFACE_VERSION,
      correlationId: `u2_3_${name}`,
      timeoutMs: 5000,
      signal: controller.signal,
    },
    abortAsCancelled: () => {
      controller.abort(new DOMException("cancelled", "AbortError"));
    },
  };
};

const deferred = <T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T | PromiseLike<T>) => void;
  readonly reject: (reason?: unknown) => void;
} => {
  let resolvePromise!: (value: T | PromiseLike<T>) => void;
  let rejectPromise!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return { promise, resolve: resolvePromise, reject: rejectPromise };
};

class InFlightTimeoutGooglePlacesAdapter
  implements GooglePlacesCandidateAdapter
{
  callCount = 0;

  constructor(private readonly abortAsTimedOut: () => void) {}

  async search(): Promise<never> {
    this.callCount += 1;
    await Promise.resolve();
    this.abortAsTimedOut();
    throw new Error("deterministic in-flight Places timeout rejection");
  }
}

class InFlightAbortSuccessGooglePlacesAdapter
  implements GooglePlacesCandidateAdapter
{
  callCount = 0;

  constructor(
    private readonly records: readonly unknown[],
    private readonly abortInFlight: () => void,
  ) {}

  async search(): Promise<{
    readonly status: "success";
    readonly value: readonly unknown[];
  }> {
    this.callCount += 1;
    await Promise.resolve();
    this.abortInFlight();
    return { status: "success", value: [...this.records] };
  }
}

class RejectingGooglePlacesAdapter implements GooglePlacesCandidateAdapter {
  callCount = 0;

  async search(): Promise<never> {
    this.callCount += 1;
    throw new Error("deterministic provider rejection");
  }
}

const clues = (overrides: Partial<ServerRestaurantClues> = {}): ServerRestaurantClues => ({
  name: "Fixture Alpha",
  address: null,
  visualText: "Fixture Alpha",
  linkFingerprint: "link:fixture-alpha",
  location: { latitude: 40.743, longitude: -73.949 },
  ...overrides,
});

const find = async (
  names: readonly string[],
  clueInput: ServerRestaurantClues,
  invocation = context("find"),
) => {
  const adapter = new DeterministicFakeGooglePlacesAdapter(
    names.map((name) => record(name, invocation.correlationId)),
  );
  const finder = new GooglePlacesCandidateFinder(adapter);
  return {
    adapter,
    result: await finder.findCandidates(clueInput, invocation),
  };
};

const normalized = normalizeServerRestaurantClues(
  clues({ name: "  Cap’t   Loui  ", visualText: "  CAP’T  LOUI  " }),
);
assert(normalized !== null);
assert.equal(normalized.name, "Cap't Loui");
assert.equal(normalized.visualText, "CAP'T LOUI");
assert.equal("rawUrl" in normalized, false);
assert.equal("photoHandle" in normalized, false);

const candidateDiscovery = await find(["alpha"], clues(), context("candidate"));
assert.equal(candidateDiscovery.result.status, "success");
assert.equal(candidateDiscovery.adapter.callCount, 1);
if (candidateDiscovery.result.status !== "success") {
  throw new Error("candidate fixture did not succeed");
}
const [alpha] = candidateDiscovery.result.value;
assert(alpha !== undefined);
RestaurantCandidateSchema.parse(alpha);

const missingCorrelationInvocation = context("missing-correlation");
const missingCorrelationRecord = record(
  "alpha",
  missingCorrelationInvocation.correlationId,
);
assert(isRecord(missingCorrelationRecord));
delete missingCorrelationRecord.requestCorrelationId;
const missingCorrelation = await new GooglePlacesCandidateFinder(
  new DeterministicFakeGooglePlacesAdapter([missingCorrelationRecord]),
).findCandidates(clues(), missingCorrelationInvocation);
assert.equal(missingCorrelation.status, "error");
if (missingCorrelation.status === "error") {
  assert.equal(missingCorrelation.error.error.code, "INVALID_UPSTREAM_RESULT");
}

const mismatchedCorrelationInvocation = context("mismatched-correlation");
const mismatchedCorrelation = await new GooglePlacesCandidateFinder(
  new DeterministicFakeGooglePlacesAdapter([
    record("alpha", "u2_3_different_request"),
  ]),
).findCandidates(clues(), mismatchedCorrelationInvocation);
assert.equal(mismatchedCorrelation.status, "error");
if (mismatchedCorrelation.status === "error") {
  assert.equal(mismatchedCorrelation.error.error.code, "INVALID_UPSTREAM_RESULT");
}
const rankingInput: readonly RestaurantCandidate[] = [
  {
    ...alpha,
    candidateId: "10000000-0000-4000-8000-000000000001",
    googlePlaceId: "place_exact_far",
    displayName: "Fixture Alpha",
    location: { latitude: 40.76, longitude: -73.949 },
    rank: 4,
  },
  {
    ...alpha,
    candidateId: "10000000-0000-4000-8000-000000000002",
    googlePlaceId: "place_partial",
    displayName: "Fixture Alpha Downtown Kitchen",
    location: { latitude: 40.743, longitude: -73.949 },
    rank: 1,
  },
  {
    ...alpha,
    candidateId: "10000000-0000-4000-8000-000000000003",
    googlePlaceId: "place_exact_near",
    displayName: "Fixture Alpha",
    location: { latitude: 40.744, longitude: -73.949 },
    rank: 3,
  },
  {
    ...alpha,
    candidateId: "10000000-0000-4000-8000-000000000004",
    googlePlaceId: "place_exact_near",
    displayName: "Fixture Alpha Branch",
    location: { latitude: 40.745, longitude: -73.949 },
    rank: 2,
  },
];
const rankingSnapshot = structuredClone(rankingInput);
const ranked = rankRestaurantCandidates(
  rankingInput,
  { name: "Fixture Alpha", location: clues().location },
);
assert.deepEqual(
  ranked.map((candidate) => candidate.googlePlaceId),
  ["place_exact_near", "place_exact_far", "place_partial"],
);
assert.deepEqual(
  ranked.map((candidate) => candidate.rank),
  [1, 2, 3],
);
assert.deepEqual(rankingInput, rankingSnapshot);
assert.notEqual(ranked[0], rankingInput[2]);

const sameNameBranches = rankRestaurantCandidates(
  [
    { ...alpha, googlePlaceId: "place_branch_b", rank: 1 },
    { ...alpha, googlePlaceId: "place_branch_a", rank: 1 },
  ],
  { name: alpha.displayName, location: null },
);
assert.deepEqual(
  sameNameBranches.map((candidate) => candidate.googlePlaceId),
  ["place_branch_a", "place_branch_b"],
);

const providerOrderWithoutLocation = rankRestaurantCandidates(
  [
    {
      ...alpha,
      googlePlaceId: "place_provider_second",
      displayName: "Unrelated Name",
      location: null,
      rank: 2,
    },
    {
      ...alpha,
      googlePlaceId: "place_provider_first",
      displayName: "Unrelated Name",
      location: null,
      rank: 1,
    },
  ],
  { name: "No Match", location: null },
);
assert.deepEqual(
  providerOrderWithoutLocation.map((candidate) => candidate.googlePlaceId),
  ["place_provider_first", "place_provider_second"],
);

const moreThanSix = Array.from({ length: 7 }, (_, index) => ({
  ...alpha,
  candidateId: `20000000-0000-4000-8000-${(index + 1)
    .toString()
    .padStart(12, "0")}`,
  googlePlaceId: `place_limit_${index + 1}`,
  rank: index + 1,
}));
assert.equal(
  rankRestaurantCandidates(
    moreThanSix,
    { name: alpha.displayName, location: null },
  ).length,
  6,
);

const confirmationEvidence = {
  kind: "user_action",
  actionRef: "action:fixture-confirmation",
  recordedAt: "2026-07-18T20:10:00.000Z",
} as const;
const confirmationCandidates = [alpha] as const;
const confirmationCandidateSnapshot = structuredClone(alpha);
const confirmationCandidatesSnapshot = structuredClone(confirmationCandidates);
const confirmationRequest = {
  candidates: confirmationCandidates,
  priorResolution: null,
  selectedCandidateId: alpha.candidateId,
  confirmationEvidence,
} as const;

const validSelection = validateRestaurantCandidateSelection(
  confirmationRequest,
  context("confirmation-selection"),
);
assert.equal(validSelection.status, "success");
if (validSelection.status !== "success") {
  throw new Error("Expected a valid candidate selection");
}
assert.equal(validSelection.value.candidateId, alpha.candidateId);

const confirmedResolution = createConfirmedRestaurantResolution(
  confirmationRequest,
  "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  context("confirmation-resolution"),
);
assert.equal(confirmedResolution.status, "success");
if (confirmedResolution.status !== "success") {
  throw new Error("Expected a confirmed restaurant resolution");
}
assert.equal(confirmedResolution.value.state, "user_confirmed");
assert.equal(confirmedResolution.value.selectedCandidateId, alpha.candidateId);
assert.equal(
  confirmedResolution.value.restaurantId,
  "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
);
assert.equal(confirmedResolution.value.requiresUserConfirmation, false);
assert.equal(confirmedResolution.value.canContinueMenuOnly, true);
assert.equal(
  confirmedResolution.value.candidates.find(
    (candidate) => candidate.candidateId === alpha.candidateId,
  )?.googlePlaceId,
  alpha.googlePlaceId,
);

const missingSelection = validateRestaurantCandidateSelection(
  {
    ...confirmationRequest,
    selectedCandidateId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  },
  context("confirmation-missing"),
);
assert.equal(missingSelection.status, "error");
if (missingSelection.status !== "error") {
  throw new Error("Expected a missing candidate error");
}
assert.equal(missingSelection.error.error.code, "INVALID_INPUT");

const emptySelection = validateRestaurantCandidateSelection(
  { ...confirmationRequest, candidates: [] },
  context("confirmation-empty"),
);
assert.equal(emptySelection.status, "error");
if (emptySelection.status !== "error") {
  throw new Error("Expected an empty candidate list error");
}
assert.equal(emptySelection.error.error.code, "INVALID_INPUT");

const duplicateSelection = validateRestaurantCandidateSelection(
  {
    ...confirmationRequest,
    candidates: [
      alpha,
      {
        ...alpha,
        googlePlaceId: "fixture_duplicate_candidate_place",
        rank: alpha.rank + 1,
      },
    ],
  },
  context("confirmation-duplicate"),
);
assert.equal(duplicateSelection.status, "error");
if (duplicateSelection.status !== "error") {
  throw new Error("Expected a duplicate candidate error");
}
assert.equal(duplicateSelection.error.error.code, "INVALID_INPUT");

const unselectedDuplicateRequest = {
  ...confirmationRequest,
  candidates: [
    alpha,
    {
      ...alpha,
      candidateId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      googlePlaceId: "fixture_unselected_duplicate_one",
      rank: alpha.rank + 1,
    },
    {
      ...alpha,
      candidateId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      googlePlaceId: "fixture_unselected_duplicate_two",
      rank: alpha.rank + 2,
    },
  ],
} as const;
const unselectedDuplicateSelection = validateRestaurantCandidateSelection(
  unselectedDuplicateRequest,
  context("confirmation-unselected-duplicate"),
);
assert.equal(unselectedDuplicateSelection.status, "error");
if (unselectedDuplicateSelection.status !== "error") {
  throw new Error("Expected an unselected duplicate candidate error");
}
assert.equal(
  unselectedDuplicateSelection.error.error.code,
  "INVALID_INPUT",
);
assert.deepEqual(alpha, confirmationCandidateSnapshot);
assert.deepEqual(confirmationCandidates, confirmationCandidatesSnapshot);

const internalRestaurantId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
let duplicateCandidateIdentityCalls = 0;
const duplicateCandidateResolutionPort = new FoundationRestaurantResolutionPort(
  () => {
    duplicateCandidateIdentityCalls += 1;
    return Promise.resolve(internalRestaurantId);
  },
);
const duplicateCandidateResolution = await duplicateCandidateResolutionPort.resolve(
  unselectedDuplicateRequest,
  context("confirmation-unselected-duplicate-port"),
);
assert.equal(duplicateCandidateResolution.status, "error");
if (duplicateCandidateResolution.status !== "error") {
  throw new Error("Expected duplicate candidate resolution to fail");
}
assert.equal(duplicateCandidateResolution.error.error.code, "INVALID_INPUT");
assert.equal(duplicateCandidateIdentityCalls, 0);

const resolutionPort = new FoundationRestaurantResolutionPort(() =>
  Promise.resolve(internalRestaurantId),
);
const events = new FakeUiOperationalEventPort();
const coordinator = new RestaurantResolutionCoordinator(resolutionPort, events);

const orchestrationInvocation = context("orchestration");
const orchestrationAlphaRecord = record(
  "alpha",
  orchestrationInvocation.correlationId,
);
assert(isRecord(orchestrationAlphaRecord));
assert.equal(typeof orchestrationAlphaRecord.placeId, "string");
const orchestrationProviderInput = [
  { ...orchestrationAlphaRecord, providerRank: 1 },
  {
    ...orchestrationAlphaRecord,
    requestCandidateId: "30000000-0000-4000-8000-000000000002",
    providerRank: 2,
  },
  {
    ...orchestrationAlphaRecord,
    requestCandidateId: "30000000-0000-4000-8000-000000000003",
    placeId: "fixture_place_alpha_branch",
    formattedAddress: "2 Fixture Branch Avenue, New York, NY",
    shortLocation: "Fixture Branch Avenue",
    providerRank: 3,
  },
] as const;
const orchestrationProviderSnapshot = structuredClone(
  orchestrationProviderInput,
);
const orchestrationAdapter = new DeterministicFakeGooglePlacesAdapter(
  orchestrationProviderInput,
);
let orchestrationIdentityCalls = 0;
let orchestrationSelectedPlaceId: string | null = null;
const orchestrationResolutionPort = new FoundationRestaurantResolutionPort(
  (candidate) => {
    orchestrationIdentityCalls += 1;
    orchestrationSelectedPlaceId = candidate.googlePlaceId;
    return Promise.resolve("eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee");
  },
);
const orchestrationService = new RestaurantResolutionService(
  new GooglePlacesCandidateFinder(orchestrationAdapter),
  orchestrationResolutionPort,
);
const orchestrationInitialRequest: RestaurantResolutionRequest = {
  candidates: [],
  priorResolution: null,
  selectedCandidateId: null,
  confirmationEvidence: null,
};
const orchestrationInitialSnapshot = structuredClone(
  orchestrationInitialRequest,
);
const orchestrationInitial = await orchestrationService.resolve(
  clues(),
  orchestrationInitialRequest,
  orchestrationInvocation,
);
assert.equal(orchestrationInitial.status, "success");
if (orchestrationInitial.status !== "success") {
  throw new Error("Expected orchestration candidate discovery to succeed");
}
assert.equal(orchestrationInitial.value.state, "conflicting");
assert.equal(orchestrationInitial.value.selectedCandidateId, null);
assert.equal(orchestrationInitial.value.requiresUserConfirmation, true);
assert.equal(orchestrationInitial.value.candidates.length, 2);
assert.deepEqual(
  orchestrationInitial.value.candidates.map(
    (candidate) => candidate.googlePlaceId,
  ),
  [orchestrationAlphaRecord.placeId, "fixture_place_alpha_branch"],
);
assert.equal(
  new Set(
    orchestrationInitial.value.candidates.map(
      (candidate) => candidate.googlePlaceId,
    ),
  ).size,
  2,
);
assert.equal(
  orchestrationInitial.value.candidates.every(
    (candidate) =>
      candidate.displayName ===
      orchestrationInitial.value.candidates[0]?.displayName,
  ),
  true,
);
assert.deepEqual(orchestrationProviderInput, orchestrationProviderSnapshot);
assert.deepEqual(orchestrationInitialRequest, orchestrationInitialSnapshot);

const orchestrationRepeated = await orchestrationService.resolve(
  clues(),
  orchestrationInitialRequest,
  orchestrationInvocation,
);
assert.equal(orchestrationRepeated.status, "success");
if (orchestrationRepeated.status !== "success") {
  throw new Error("Expected deterministic orchestration result");
}
assert.deepEqual(
  orchestrationRepeated.value.candidates,
  orchestrationInitial.value.candidates,
);

const orchestrationSelectedCandidate =
  orchestrationInitial.value.candidates[1];
assert(orchestrationSelectedCandidate !== undefined);
const orchestrationEvidence = {
  kind: "user_action" as const,
  actionRef: "action:orchestration-confirm",
  recordedAt: "2026-07-19T16:00:00.000Z",
};
const orchestrationConfirmed = await orchestrationService.resolve(
  clues(),
  {
    candidates: [],
    priorResolution: orchestrationInitial.value,
    selectedCandidateId: orchestrationSelectedCandidate.candidateId,
    confirmationEvidence: orchestrationEvidence,
  },
  context("orchestration-confirmed"),
);
assert.equal(orchestrationConfirmed.status, "success");
if (orchestrationConfirmed.status !== "success") {
  throw new Error("Expected orchestration confirmation to succeed");
}
assert.equal(orchestrationConfirmed.value.state, "user_confirmed");
assert.equal(
  orchestrationConfirmed.value.selectedCandidateId,
  orchestrationSelectedCandidate.candidateId,
);
assert.equal(
  orchestrationSelectedPlaceId,
  orchestrationSelectedCandidate.googlePlaceId,
);
assert.equal(orchestrationIdentityCalls, 1);
assert.equal(orchestrationAdapter.callCount, 2);

const orchestrationInvalidSelection = await orchestrationService.resolve(
  clues(),
  {
    candidates: [],
    priorResolution: orchestrationInitial.value,
    selectedCandidateId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
    confirmationEvidence: orchestrationEvidence,
  },
  context("orchestration-invalid-selection"),
);
assert.equal(orchestrationInvalidSelection.status, "error");
if (orchestrationInvalidSelection.status !== "error") {
  throw new Error("Expected invalid orchestration selection to fail");
}
assert.equal(
  orchestrationInvalidSelection.error.error.code,
  "INVALID_INPUT",
);
assert.equal(orchestrationIdentityCalls, 1);
assert.equal(orchestrationAdapter.callCount, 2);

const orchestrationOtherCandidate =
  orchestrationInitial.value.candidates[0];
assert(orchestrationOtherCandidate !== undefined);
const orchestrationDuplicateCandidates = [
  orchestrationSelectedCandidate,
  orchestrationOtherCandidate,
  {
    ...orchestrationOtherCandidate,
    googlePlaceId: "fixture_place_duplicate_candidate_id",
    rank: 3,
  },
] as const;
const orchestrationDuplicateSnapshot = structuredClone(
  orchestrationDuplicateCandidates,
);
const orchestrationDuplicate = await orchestrationService.resolve(
  clues(),
  {
    candidates: orchestrationDuplicateCandidates,
    priorResolution: null,
    selectedCandidateId: orchestrationSelectedCandidate.candidateId,
    confirmationEvidence: orchestrationEvidence,
  },
  context("orchestration-duplicate-candidate"),
);
assert.equal(orchestrationDuplicate.status, "error");
if (orchestrationDuplicate.status !== "error") {
  throw new Error("Expected duplicate orchestration candidates to fail");
}
assert.equal(orchestrationDuplicate.error.error.code, "INVALID_INPUT");
assert.equal(orchestrationIdentityCalls, 1);
assert.equal(orchestrationAdapter.callCount, 2);
assert.deepEqual(
  orchestrationDuplicateCandidates,
  orchestrationDuplicateSnapshot,
);

const emptyOrchestrationAdapter = new DeterministicFakeGooglePlacesAdapter([]);
const emptyOrchestration = await new RestaurantResolutionService(
  new GooglePlacesCandidateFinder(emptyOrchestrationAdapter),
  orchestrationResolutionPort,
).resolve(
  clues(),
  orchestrationInitialRequest,
  context("orchestration-empty-provider"),
);
assert.equal(emptyOrchestration.status, "outcome");
if (emptyOrchestration.status !== "outcome") {
  throw new Error("Expected empty orchestration provider outcome");
}
assert.equal(emptyOrchestration.outcome.code, "RESTAURANT_NOT_RESOLVED");
assert.equal(emptyOrchestrationAdapter.callCount, 1);

const initialRequest: RestaurantResolutionRequest = {
  candidates: [alpha],
  priorResolution: null,
  selectedCandidateId: null,
  confirmationEvidence: null,
};
const initial = await coordinator.resolve(initialRequest, context("initial"));
assert.equal(initial.status, "success");
if (initial.status !== "success") {
  throw new Error("initial resolution did not succeed");
}
assert.equal(initial.value.state, "candidate");
assert.equal(initial.value.selectedCandidateId, null);
assert.equal(initial.value.restaurantId, null);
assert.equal(initial.value.confirmationEvidence, null);
assert.equal(initial.value.requiresUserConfirmation, true);
assert.equal(events.events.length, 2);
assert.equal(events.events[1]?.code, "RESTAURANT_CONFIRMATION_REQUIRED");

const inactiveCandidate = await coordinator.resolve(
  {
    candidates: [alpha],
    priorResolution: initial.value,
    selectedCandidateId: null,
    confirmationEvidence: null,
  },
  context("inactive-candidate"),
);
assert.equal(inactiveCandidate.status, "success");
if (inactiveCandidate.status === "success") {
  assert.equal(inactiveCandidate.value.state, "candidate");
  assert.equal(inactiveCandidate.value.requiresUserConfirmation, true);
}
assert.equal(events.events.at(-1)?.code, "RESTAURANT_CONFIRMATION_REQUIRED");

const userEvidence = {
  kind: "user_action" as const,
  actionRef: "action:u2-3-confirm-alpha",
  recordedAt: "2026-07-19T15:00:00.000Z",
};
const confirmed = await coordinator.resolve(
  {
    candidates: [alpha],
    priorResolution: initial.value,
    selectedCandidateId: alpha.candidateId,
    confirmationEvidence: userEvidence,
  },
  context("confirmed"),
);
assert.equal(confirmed.status, "success");
if (confirmed.status !== "success") {
  throw new Error("confirmation fixture did not succeed");
}
assert.equal(confirmed.value.state, "user_confirmed");
assert.equal(confirmed.value.restaurantId, internalRestaurantId);
assert.notEqual(confirmed.value.restaurantId, alpha.googlePlaceId);
assert.deepEqual(confirmed.value.confirmationEvidence, userEvidence);
RestaurantResolutionSchema.parse(confirmed.value);

const runInterruptedAssignment = async (
  fixtureName: string,
  interruption: {
    readonly context: PortInvocationContext;
    readonly abort: () => void;
    readonly expectedStatus: "error" | "outcome";
    readonly expectedCode: "UPSTREAM_TIMEOUT" | "RESTAURANT_NOT_RESOLVED";
  },
  settlement: "resolve" | "reject",
) => {
  const started = deferred<void>();
  const assignment = deferred<string | null>();
  const interruptedPort = new FoundationRestaurantResolutionPort(async () => {
    started.resolve();
    return assignment.promise;
  });
  const pendingResult = interruptedPort.resolve(
    {
      candidates: [alpha],
      priorResolution: initial.value,
      selectedCandidateId: alpha.candidateId,
      confirmationEvidence: userEvidence,
    },
    interruption.context,
  );

  await started.promise;
  interruption.abort();
  if (settlement === "resolve") {
    assignment.resolve(internalRestaurantId);
  } else {
    assignment.reject(new Error("deterministic assignment rejection"));
  }

  const result = await pendingResult;
  assert.equal(result.status, interruption.expectedStatus, fixtureName);
  if (result.status === "error") {
    assert.equal(result.error.error.code, interruption.expectedCode, fixtureName);
  } else if (result.status === "outcome") {
    assert.equal(result.outcome.code, interruption.expectedCode, fixtureName);
  }
  const serialized = JSON.stringify(result);
  assert.equal("value" in result, false, fixtureName);
  assert.equal(serialized.includes(internalRestaurantId), false, fixtureName);
  assert.equal(serialized.includes(alpha.candidateId), false, fixtureName);
  assert.equal(serialized.includes("user_confirmed"), false, fixtureName);
  assert.equal(serialized.includes("confirmationEvidence"), false, fixtureName);
  await Promise.resolve();
  assert.equal(JSON.stringify(result), serialized, fixtureName);
};

const assignmentTimeoutResolve = inFlightTimedOutContext(
  "assignment-timeout-resolve",
);
await runInterruptedAssignment(
  "identity_assignment_timeout_success_discarded",
  {
    context: assignmentTimeoutResolve.context,
    abort: assignmentTimeoutResolve.abortAsTimedOut,
    expectedStatus: "error",
    expectedCode: "UPSTREAM_TIMEOUT",
  },
  "resolve",
);

const assignmentCancellationResolve = inFlightCancelledContext(
  "assignment-cancellation-resolve",
);
await runInterruptedAssignment(
  "identity_assignment_cancellation_success_discarded",
  {
    context: assignmentCancellationResolve.context,
    abort: assignmentCancellationResolve.abortAsCancelled,
    expectedStatus: "outcome",
    expectedCode: "RESTAURANT_NOT_RESOLVED",
  },
  "resolve",
);

const assignmentTimeoutReject = inFlightTimedOutContext(
  "assignment-timeout-reject",
);
await runInterruptedAssignment(
  "identity_assignment_timeout_rejection",
  {
    context: assignmentTimeoutReject.context,
    abort: assignmentTimeoutReject.abortAsTimedOut,
    expectedStatus: "error",
    expectedCode: "UPSTREAM_TIMEOUT",
  },
  "reject",
);

const assignmentCancellationReject = inFlightCancelledContext(
  "assignment-cancellation-reject",
);
await runInterruptedAssignment(
  "identity_assignment_cancellation_rejection",
  {
    context: assignmentCancellationReject.context,
    abort: assignmentCancellationReject.abortAsCancelled,
    expectedStatus: "outcome",
    expectedCode: "RESTAURANT_NOT_RESOLVED",
  },
  "reject",
);

const failedAssignment = await new FoundationRestaurantResolutionPort(
  async () => {
    throw new Error("deterministic assignment failure");
  },
).resolve(
  {
    candidates: [alpha],
    priorResolution: initial.value,
    selectedCandidateId: alpha.candidateId,
    confirmationEvidence: userEvidence,
  },
  context("assignment-failure"),
);
assert.equal(failedAssignment.status, "error");
if (failedAssignment.status === "error") {
  assert.equal(failedAssignment.error.error.code, "INTERNAL_ERROR");
}

const externallyVerified = await resolutionPort.resolve(
  {
    candidates: [alpha],
    priorResolution: initial.value,
    selectedCandidateId: alpha.candidateId,
    confirmationEvidence: {
      kind: "external_evidence",
      sourceRefs: ["bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"],
      recordedAt: "2026-07-19T15:01:00.000Z",
    },
  },
  context("external"),
);
assert.equal(externallyVerified.status, "success");
if (externallyVerified.status === "success") {
  assert.equal(externallyVerified.value.state, "externally_verified");
}

const conflictDiscovery = await find(
  ["beta", "alpha"],
  clues(),
  context("conflict-find"),
);
assert.equal(conflictDiscovery.result.status, "success");
if (conflictDiscovery.result.status !== "success") {
  throw new Error("conflict fixture did not produce candidates");
}
assert.deepEqual(
  conflictDiscovery.result.value.map((candidate) => candidate.rank),
  [1, 2],
);
const conflicting = await resolutionPort.resolve(
  {
    candidates: conflictDiscovery.result.value,
    priorResolution: null,
    selectedCandidateId: null,
    confirmationEvidence: null,
  },
  context("conflicting"),
);
assert.equal(conflicting.status, "success");
if (conflicting.status !== "success") {
  throw new Error("conflicting resolution did not succeed");
}
assert.equal(conflicting.value.state, "conflicting");
assert.equal(conflicting.value.requiresUserConfirmation, true);

const inactiveConflict = await resolutionPort.resolve(
  {
    candidates: conflictDiscovery.result.value,
    priorResolution: conflicting.value,
    selectedCandidateId: null,
    confirmationEvidence: null,
  },
  context("inactive-conflict"),
);
assert.equal(inactiveConflict.status, "success");
if (inactiveConflict.status === "success") {
  assert.equal(inactiveConflict.value.state, "conflicting");
  assert.equal(inactiveConflict.value.requiresUserConfirmation, true);
}

const noLocation = await find(
  ["withoutLocation"],
  clues({ location: null }),
  context("no-location"),
);
assert.equal(noLocation.result.status, "success");
if (noLocation.result.status === "success") {
  assert.equal(noLocation.result.value[0]?.location, null);
  assert.equal(
    noLocation.result.value[0]?.matchSignals.includes("location"),
    false,
  );
}

const insufficientAdapter = new DeterministicFakeGooglePlacesAdapter([]);
const insufficientFinder = new GooglePlacesCandidateFinder(insufficientAdapter);
const insufficient = await insufficientFinder.findCandidates(
  clues({
    name: null,
    address: null,
    visualText: null,
    linkFingerprint: null,
  }),
  context("insufficient"),
);
assert.equal(insufficient.status, "outcome");
if (insufficient.status === "outcome") {
  assert.equal(insufficient.outcome.code, "RESTAURANT_NOT_RESOLVED");
  assert.equal(insufficient.outcome.canContinueMenuOnly, true);
}
assert.equal(insufficientAdapter.callCount, 0);

const noCandidates = await find([], clues(), context("no-candidates"));
assert.equal(noCandidates.result.status, "outcome");
if (noCandidates.result.status === "outcome") {
  assert.equal(noCandidates.result.outcome.code, "RESTAURANT_NOT_RESOLVED");
  assert.equal(noCandidates.result.outcome.canContinueMenuOnly, true);
}

const menuOnly = await resolutionPort.resolve(
  {
    candidates: [],
    priorResolution: null,
    selectedCandidateId: null,
    confirmationEvidence: null,
  },
  context("menu-only"),
);
assert.equal(menuOnly.status, "outcome");
if (menuOnly.status === "outcome") {
  assert.equal(menuOnly.outcome.code, "RESTAURANT_NOT_RESOLVED");
  assert.equal(menuOnly.outcome.canContinueMenuOnly, true);
}

const leaked = await find(
  ["branchSemanticLeak"],
  clues(),
  context("semantic-leak"),
);
assert.equal(leaked.result.status, "error");
if (leaked.result.status === "error") {
  assert.equal(leaked.result.error.error.code, "INVALID_UPSTREAM_RESULT");
  const serialized = JSON.stringify(leaked.result.error);
  assert.equal(serialized.includes("menuVersionId"), false);
  assert.equal(serialized.includes("providerPayload"), false);
  assert.equal(serialized.includes("unvalidatedMenuMeaning"), false);
}

const crossBranchCandidate = RestaurantCandidateSchema.safeParse({
  ...alpha,
  menuVersionId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  price: { amountMinor: 1000, currency: "USD" },
  sourceEvidence: [],
});
assert.equal(crossBranchCandidate.success, false);
if (!crossBranchCandidate.success) {
  for (const path of ["menuVersionId", "price", "sourceEvidence"]) {
    assert.equal(
      crossBranchCandidate.issues.some(
        (issue) => issue.code === "unexpected_field" && issue.path[0] === path,
      ),
      true,
      `restaurant candidate must reject ${path}`,
    );
  }
}

const timeoutAdapter = new DeterministicFakeGooglePlacesAdapter([record("alpha")]);
const timeoutFinder = new GooglePlacesCandidateFinder(timeoutAdapter);
const timedOut = await timeoutFinder.findCandidates(
  clues(),
  timedOutContext("timeout"),
);
assert.equal(timedOut.status, "error");
if (timedOut.status === "error") {
  assert.equal(timedOut.error.error.code, "UPSTREAM_TIMEOUT");
}
assert.equal(timeoutAdapter.callCount, 0);

const inFlightInvocation = inFlightTimedOutContext("in-flight-timeout");
const inFlightTimeoutAdapter = new InFlightTimeoutGooglePlacesAdapter(
  inFlightInvocation.abortAsTimedOut,
);
const inFlightTimeoutFinder = new GooglePlacesCandidateFinder(
  inFlightTimeoutAdapter,
);
const inFlightTimedOut = await inFlightTimeoutFinder.findCandidates(
  clues(),
  inFlightInvocation.context,
);
assert.equal(inFlightTimedOut.status, "error");
if (inFlightTimedOut.status === "error") {
  assert.equal(inFlightTimedOut.error.error.code, "UPSTREAM_TIMEOUT");
}
assert.equal(inFlightTimeoutAdapter.callCount, 1);

const timeoutSuccessInvocation = inFlightTimedOutContext(
  "in-flight-timeout-success",
);
const timeoutSuccessAdapter = new InFlightAbortSuccessGooglePlacesAdapter(
  [record("alpha")],
  timeoutSuccessInvocation.abortAsTimedOut,
);
const timeoutSuccessResult = await new GooglePlacesCandidateFinder(
  timeoutSuccessAdapter,
).findCandidates(clues(), timeoutSuccessInvocation.context);
assert.equal(timeoutSuccessResult.status, "error");
if (timeoutSuccessResult.status === "error") {
  assert.equal(timeoutSuccessResult.error.error.code, "UPSTREAM_TIMEOUT");
}
assert.equal(timeoutSuccessAdapter.callCount, 1);
assert.equal("value" in timeoutSuccessResult, false);
assert.equal(
  JSON.stringify(timeoutSuccessResult).includes("fixture_place_alpha"),
  false,
);

const cancellationSuccessInvocation = inFlightCancelledContext(
  "in-flight-cancellation-success",
);
const cancellationSuccessAdapter = new InFlightAbortSuccessGooglePlacesAdapter(
  [record("alpha")],
  cancellationSuccessInvocation.abortAsCancelled,
);
const cancellationSuccessResult = await new GooglePlacesCandidateFinder(
  cancellationSuccessAdapter,
).findCandidates(clues(), cancellationSuccessInvocation.context);
assert.equal(cancellationSuccessResult.status, "outcome");
if (cancellationSuccessResult.status === "outcome") {
  assert.equal(
    cancellationSuccessResult.outcome.code,
    "RESTAURANT_NOT_RESOLVED",
  );
}
assert.equal(cancellationSuccessAdapter.callCount, 1);
assert.equal("value" in cancellationSuccessResult, false);
assert.equal(
  JSON.stringify(cancellationSuccessResult).includes("fixture_place_alpha"),
  false,
);

const rejectionAdapter = new RejectingGooglePlacesAdapter();
const rejectionResult = await new GooglePlacesCandidateFinder(
  rejectionAdapter,
).findCandidates(clues(), context("provider-rejection"));
assert.equal(rejectionResult.status, "error");
if (rejectionResult.status === "error") {
  assert.equal(rejectionResult.error.error.code, "UPSTREAM_UNAVAILABLE");
}
assert.equal(rejectionAdapter.callCount, 1);

const invalidLinkAdapter = new DeterministicFakeGooglePlacesAdapter([]);
const invalidLinkFinder = new GooglePlacesCandidateFinder(invalidLinkAdapter);
const invalidLink = await invalidLinkFinder.findCandidates(
  clues({ linkFingerprint: "https://maps.example.invalid/raw" }),
  context("invalid-link"),
);
assert.equal(invalidLink.status, "error");
if (invalidLink.status === "error") {
  assert.equal(invalidLink.error.error.code, "INVALID_INPUT");
}
assert.equal(invalidLinkAdapter.callCount, 0);

const uiSafeJson = JSON.stringify([
  alpha,
  initial.value,
  confirmed.value,
  ...events.events,
]);
for (const forbidden of [
  "providerPayload",
  "unvalidatedMenuMeaning",
  "menuVersionId",
  "sourceEvidence",
  "rawUrl",
]) {
  assert.equal(uiSafeJson.includes(forbidden), false, forbidden);
}

for (const fixtureCase of fixtures.cases) {
  assert(isRecord(fixtureCase));
  assert.equal(typeof fixtureCase.case, "string");
  assert(Array.isArray(fixtureCase.records));
  assert.equal(typeof fixtureCase.expected, "string");
}
assert.deepEqual(
  fixtures.cases.map((fixtureCase) => fixtureCase.case),
  [
    "candidate",
    "user_confirmation",
    "external_verification",
    "conflicting",
    "inactivity_preserves_conflicting",
    "location_unavailable",
    "insufficient_clues",
    "no_candidates",
    "menu_only_fallback",
    "cross_branch_semantic_leak",
    "in_flight_timeout",
    "in_flight_timeout_success_discarded",
    "in_flight_cancellation_success_discarded",
    "provider_rejection",
    "identity_assignment_timeout_success_discarded",
    "identity_assignment_cancellation_success_discarded",
    "identity_assignment_timeout_rejection",
    "identity_assignment_cancellation_rejection",
    "identity_assignment_failure",
  ],
);

console.log("Restaurant resolution foundation fixtures passed.");
