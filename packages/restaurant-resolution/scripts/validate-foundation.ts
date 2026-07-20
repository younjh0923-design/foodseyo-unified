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
  RestaurantResolutionCoordinator,
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
const record = (name: string): unknown => {
  assert(Object.hasOwn(providerRecords, name), `missing record ${name}`);
  return providerRecords[name];
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
    names.map(record),
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

const internalRestaurantId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const resolutionPort = new FoundationRestaurantResolutionPort(() =>
  Promise.resolve(internalRestaurantId),
);
const events = new FakeUiOperationalEventPort();
const coordinator = new RestaurantResolutionCoordinator(resolutionPort, events);

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
