import assert from "node:assert/strict";

import {
  CONTRACT_VERSIONS,
  MODULE_INTERFACE_VERSION,
  MenuSourceAcquisitionRequestSchema,
  MenuSourceInputSchema,
  PUBLIC_ERROR_REGISTRY,
  PublicErrorEnvelopeSchema,
  type PortInvocationContext,
  type PortResult,
  type TransientMenuContent,
} from "@foodseyo/contracts";

import type {
  TransientContentIdentity,
  TransientContentIdentityPort,
} from "../src/foundation.js";
import {
  FakeHtmlMenuPageCollector,
  FakeOrderPageCollector,
  FakePdfMenuCollector,
  OfficialMenuCollectorService,
} from "../src/official-menu-collector.js";
import {
  OfficialMenuCollectorKind,
  verifyOfficialMenuCollectorSelection,
} from "../src/official-menu-collector-selection.js";
import {
  OfficialMenuSourceAcquisitionOrchestrator,
  type CollectedOfficialMenuSourceAssembler,
  type OfficialMenuSourceAcquisitionOrchestrationInput,
} from "../src/official-menu-source-acquisition-orchestrator.js";
import { assembleCollectedOfficialMenuSourceInput } from "../src/official-menu-source-input-assembler.js";
import {
  FakeOfficialMenuSourceDiscovery,
  OfficialMenuSourceDiscoveryService,
  type OfficialMenuSourceCandidate,
  type OfficialMenuSourceDiscoveryRequest,
} from "../src/official-menu-source-discovery.js";
import * as publicPackageSurface from "../src/index.js";

const context: PortInvocationContext = {
  contractVersion: MODULE_INTERFACE_VERSION,
  correlationId: "official_menu_source_acquisition_orchestrator",
  timeoutMs: 5_000,
  signal: new AbortController().signal,
};
const requestedAt = "2026-07-21T14:00:00.000Z";
const collectedAt = "2026-07-21T14:00:09.000Z";
const candidateId = "f2000000-0000-4000-8000-000000000001";
const restaurantId = "f1000000-0000-4000-8000-000000000001";
const googlePlaceId = "google_place_request_scoped_orchestration";
const sourceRef = "f0000000-0000-4000-8000-000000000001";
const sourceFingerprint = "a".repeat(64);

const request = MenuSourceAcquisitionRequestSchema.parse({
  restaurantResolution: {
    contractVersion: CONTRACT_VERSIONS.restaurantResolution,
    state: "user_confirmed",
    candidates: [
      {
        contractVersion: CONTRACT_VERSIONS.restaurantResolution,
        candidateId,
        googlePlaceId,
        displayName: "Fixture Official Restaurant",
        fullAddress: "1 Fixture Street, New York, NY",
        shortAddress: "1 Fixture Street",
        location: { latitude: 40.7128, longitude: -74.006 },
        matchSignals: ["name", "address"],
        rank: 1,
        officialWebsiteUrl: null,
        localeEvidence: null,
      },
    ],
    selectedCandidateId: candidateId,
    restaurantId,
    confirmationEvidence: {
      kind: "user_action",
      actionRef: "action:official-source-orchestration",
      recordedAt: "2026-07-21T13:59:00.000Z",
    },
    requiresUserConfirmation: false,
    canContinueMenuOnly: true,
    resolvedAt: "2026-07-21T13:59:00.000Z",
  },
  menuScope: "dinner",
  submissionContent: [
    {
      kind: "image_collection",
      contentHandle: "content:original-upload",
      sensitivity: "sensitive_transient",
      byteCount: 2_048,
      pageCount: null,
    },
  ],
  requestedAt,
});
const selection = {
  candidate: {
    sourceId: "candidate-explicit-orchestration",
    kind: "official_menu_page" as const,
    locator: "locator:explicit-orchestration",
  },
  collectorKind: OfficialMenuCollectorKind.HTML_MENU_PAGE,
};
const discoveryRequest = {
  googlePlaceId,
  restaurantId,
  menuScope: request.menuScope,
};
const discover = (
  discoveryInput: OfficialMenuSourceDiscoveryRequest,
  candidates: readonly OfficialMenuSourceCandidate[] = [selection.candidate],
) =>
  new OfficialMenuSourceDiscoveryService(
    new FakeOfficialMenuSourceDiscovery({
      status: "success",
      value: candidates,
    }),
  ).discoverVerified(discoveryInput, context);
const verifiedDiscoveryResult = await discover(discoveryRequest);
assert.equal(verifiedDiscoveryResult.status, "success");
if (verifiedDiscoveryResult.status !== "success") {
  throw new Error("verified discovery failed");
}
const verifiedSelectionResult = verifyOfficialMenuCollectorSelection(
  verifiedDiscoveryResult.value,
  selection,
  context,
);
assert.equal(verifiedSelectionResult.status, "success");
if (verifiedSelectionResult.status !== "success") {
  throw new Error("selection proof failed");
}
const input: OfficialMenuSourceAcquisitionOrchestrationInput = {
  request,
  verifiedSelection: verifiedSelectionResult.value,
};
const collectedContent: TransientMenuContent = {
  kind: "html",
  contentHandle: "content:explicit-orchestration",
  sensitivity: "sensitive_transient",
  byteCount: 1_024,
  pageCount: null,
};

class FakeTransientContentIdentityPort
  implements TransientContentIdentityPort
{
  #callCount = 0;
  #lastContent: TransientMenuContent | null = null;
  #lastCorrelationId: string | null = null;

  constructor(
    private readonly result: TransientContentIdentity | null | Error,
  ) {}

  get callCount(): number {
    return this.#callCount;
  }

  get lastContent(): TransientMenuContent | null {
    return this.#lastContent === null ? null : { ...this.#lastContent };
  }

  get lastCorrelationId(): string | null {
    return this.#lastCorrelationId;
  }

  identify(
    content: TransientMenuContent,
    invocationContext: PortInvocationContext,
  ): Promise<TransientContentIdentity | null> {
    this.#callCount += 1;
    this.#lastContent = { ...content };
    this.#lastCorrelationId = invocationContext.correlationId;
    if (this.result instanceof Error) {
      return Promise.reject(this.result);
    }
    return Promise.resolve(
      this.result === null ? null : { ...this.result },
    );
  }
}

const collectorPorts = (
  htmlResult: PortResult<TransientMenuContent> = {
    status: "success",
    value: collectedContent,
  },
) => {
  const html = new FakeHtmlMenuPageCollector(htmlResult);
  const pdf = new FakePdfMenuCollector({
    status: "success",
    value: { ...collectedContent, kind: "pdf", pageCount: 1 },
  });
  const order = new FakeOrderPageCollector({
    status: "success",
    value: { ...collectedContent, contentHandle: "content:unused-order" },
  });
  return { html, pdf, order };
};
const collectorService = (ports: ReturnType<typeof collectorPorts>) =>
  new OfficialMenuCollectorService(ports.html, ports.pdf, ports.order);

const countingAssembler = () => {
  let callCount = 0;
  const assembler: CollectedOfficialMenuSourceAssembler = (
    assemblyInput,
    invocationContext,
  ) => {
    callCount += 1;
    return assembleCollectedOfficialMenuSourceInput(
      assemblyInput,
      invocationContext,
    );
  };
  return { assembler, callCount: () => callCount };
};
const countingClock = (value = collectedAt) => {
  let callCount = 0;
  return {
    now: () => {
      callCount += 1;
      return value;
    },
    callCount: () => callCount,
  };
};

const successPorts = collectorPorts();
const successIdentity = new FakeTransientContentIdentityPort({
  sourceRef,
  sourceFingerprint,
});
const successClock = countingClock();
const successAssembler = countingAssembler();
const successOrchestrator = new OfficialMenuSourceAcquisitionOrchestrator(
  collectorService(successPorts),
  successIdentity,
  successClock.now,
  successAssembler.assembler,
);
const inputSnapshot = structuredClone(input);
const success = await successOrchestrator.acquire(input, context);
assert.equal(success.status, "success");
if (success.status !== "success") throw new Error("orchestration failed");
assert.equal(MenuSourceInputSchema.safeParse(success.value).success, true);
assert.equal(successPorts.html.callCount, 1);
assert.equal(successPorts.pdf.callCount, 0);
assert.equal(successPorts.order.callCount, 0);
assert.equal(successIdentity.callCount, 1);
assert.deepEqual(successIdentity.lastContent, collectedContent);
assert.equal(successIdentity.lastCorrelationId, context.correlationId);
assert.equal(successClock.callCount(), 1);
assert.equal(successAssembler.callCount(), 1);
assert.equal(success.value.contractVersion, CONTRACT_VERSIONS.menuSource);
assert.equal(success.value.source.sourceRef, sourceRef);
assert.equal(success.value.source.sourceFingerprint, sourceFingerprint);
assert.equal(success.value.source.sourceType, "official_website");
assert.equal(success.value.source.collectedAt, collectedAt);
assert.equal(success.value.requestedAt, requestedAt);
assert.notEqual(success.value.source.collectedAt, success.value.requestedAt);
assert.deepEqual(success.value.restaurantContext, {
  restaurantId,
  candidateId,
  googlePlaceId,
  resolutionState: "user_confirmed",
});
assert.deepEqual(success.value.content, collectedContent);
assert.deepEqual(input, inputSnapshot);
assert.notEqual(success.value.content, collectedContent);

const failureDefinition = PUBLIC_ERROR_REGISTRY.UPSTREAM_UNAVAILABLE;
const collectorFailure = PublicErrorEnvelopeSchema.parse({
  error: {
    code: "UPSTREAM_UNAVAILABLE",
    message: failureDefinition.message,
    correlationId: "official_menu_source_orchestrator_failure",
    retryable: failureDefinition.retryable,
  },
  httpStatus: failureDefinition.httpStatus,
});
const failedPorts = collectorPorts({
  status: "error",
  error: collectorFailure,
});
const skippedIdentity = new FakeTransientContentIdentityPort({
  sourceRef,
  sourceFingerprint,
});
const skippedClock = countingClock();
const skippedAssembler = countingAssembler();
const collectorFailed = await new OfficialMenuSourceAcquisitionOrchestrator(
  collectorService(failedPorts),
  skippedIdentity,
  skippedClock.now,
  skippedAssembler.assembler,
).acquire(input, context);
assert.equal(collectorFailed.status, "error");
if (collectorFailed.status !== "error") {
  throw new Error("collector failure was lost");
}
assert.equal(collectorFailed.error, collectorFailure);
assert.equal(skippedIdentity.callCount, 0);
assert.equal(skippedClock.callCount(), 0);
assert.equal(skippedAssembler.callCount(), 0);

for (const [name, identity, expectedCode] of [
  ["missing", null, "INVALID_UPSTREAM_RESULT"],
  ["failure", new Error("identity unavailable"), "UPSTREAM_UNAVAILABLE"],
] as const) {
  const ports = collectorPorts();
  const fakeIdentity = new FakeTransientContentIdentityPort(identity);
  const clock = countingClock();
  const assembler = countingAssembler();
  const result = await new OfficialMenuSourceAcquisitionOrchestrator(
    collectorService(ports),
    fakeIdentity,
    clock.now,
    assembler.assembler,
  ).acquire(input, context);
  assert.equal(result.status, "error", name);
  if (result.status !== "error") throw new Error(`${name} identity must fail`);
  assert.equal(result.error.error.code, expectedCode, name);
  assert.equal(ports.html.callCount, 1, name);
  assert.equal(fakeIdentity.callCount, 1, name);
  assert.equal(clock.callCount(), 1, name);
  assert.equal(assembler.callCount(), 0, name);
}

const unconfirmedRequest = MenuSourceAcquisitionRequestSchema.parse({
  ...request,
  restaurantResolution: {
    ...request.restaurantResolution,
    state: "candidate",
    selectedCandidateId: null,
    restaurantId: null,
    confirmationEvidence: null,
    requiresUserConfirmation: true,
    canContinueMenuOnly: true,
    resolvedAt: null,
  },
});
const blockedPorts = collectorPorts();
const blockedIdentity = new FakeTransientContentIdentityPort({
  sourceRef,
  sourceFingerprint,
});
const blockedClock = countingClock();
const blocked = await new OfficialMenuSourceAcquisitionOrchestrator(
  collectorService(blockedPorts),
  blockedIdentity,
  blockedClock.now,
).acquire({ ...input, request: unconfirmedRequest }, context);
assert.equal(blocked.status, "error");
if (blocked.status !== "error") throw new Error("unconfirmed request must fail");
assert.equal(blocked.error.error.code, "INVALID_INPUT");
assert.equal(blockedPorts.html.callCount, 0);
assert.equal(blockedIdentity.callCount, 0);
assert.equal(blockedClock.callCount(), 0);

for (const [name, mismatchedDiscovery] of [
  [
    "google_place",
    { ...discoveryRequest, googlePlaceId: "different_google_place" },
  ],
  [
    "restaurant",
    {
      ...discoveryRequest,
      restaurantId: "f1000000-0000-4000-8000-000000000099",
    },
  ],
  ["menu_scope", { ...discoveryRequest, menuScope: "lunch" as const }],
] as const) {
  const discovery = await discover(mismatchedDiscovery);
  assert.equal(discovery.status, "success", name);
  if (discovery.status !== "success") {
    throw new Error(`${name} discovery failed`);
  }
  const proof = verifyOfficialMenuCollectorSelection(
    discovery.value,
    selection,
    context,
  );
  assert.equal(proof.status, "success", name);
  if (proof.status !== "success") throw new Error(`${name} proof failed`);
  const ports = collectorPorts();
  const identity = new FakeTransientContentIdentityPort({
    sourceRef,
    sourceFingerprint,
  });
  const result = await new OfficialMenuSourceAcquisitionOrchestrator(
    collectorService(ports),
    identity,
  ).acquire({ request, verifiedSelection: proof.value }, context);
  assert.equal(result.status, "error", name);
  if (result.status !== "error") throw new Error(`${name} mismatch must fail`);
  assert.equal(result.error.error.code, "INVALID_INPUT", name);
  assert.equal(ports.html.callCount, 0, name);
  assert.equal(identity.callCount, 0, name);
}

const secondCandidate = {
  sourceId: "candidate-second-orchestration",
  kind: "official_menu_page" as const,
  locator: "locator:second-orchestration",
};
const combinedDiscovery = await discover(discoveryRequest, [
  selection.candidate,
  secondCandidate,
]);
assert.equal(combinedDiscovery.status, "success");
if (combinedDiscovery.status !== "success") {
  throw new Error("combined discovery failed");
}
const combinedEvidence = verifyOfficialMenuCollectorSelection(
  combinedDiscovery.value,
  {
    candidate: {
      sourceId: selection.candidate.sourceId,
      kind: selection.candidate.kind,
      locator: secondCandidate.locator,
    },
    collectorKind: OfficialMenuCollectorKind.HTML_MENU_PAGE,
  },
  context,
);
assert.equal(combinedEvidence.status, "error");
if (combinedEvidence.status !== "error") {
  throw new Error("cross-candidate evidence must fail");
}
assert.equal(combinedEvidence.error.error.code, "INVALID_UPSTREAM_RESULT");

const malformedPorts = collectorPorts();
const malformedIdentity = new FakeTransientContentIdentityPort({
  sourceRef,
  sourceFingerprint,
});
const malformed = await new OfficialMenuSourceAcquisitionOrchestrator(
  collectorService(malformedPorts),
  malformedIdentity,
  countingClock().now,
).acquire(
  { request, verifiedSelection: {} } as unknown as OfficialMenuSourceAcquisitionOrchestrationInput,
  context,
);
assert.equal(malformed.status, "error");
if (malformed.status !== "error") throw new Error("selection must fail");
assert.equal(malformed.error.error.code, "INVALID_INPUT");
assert.equal(malformedPorts.html.callCount, 0);
assert.equal(malformedIdentity.callCount, 0);

const invalidClockPorts = collectorPorts();
const invalidClockIdentity = new FakeTransientContentIdentityPort({
  sourceRef,
  sourceFingerprint,
});
const invalidClock = await new OfficialMenuSourceAcquisitionOrchestrator(
  collectorService(invalidClockPorts),
  invalidClockIdentity,
  countingClock("not-a-timestamp").now,
).acquire(input, context);
assert.equal(invalidClock.status, "error");
if (invalidClock.status !== "error") throw new Error("clock must fail");
assert.equal(invalidClock.error.error.code, "INVALID_UPSTREAM_RESULT");

const deterministic = await successOrchestrator.acquire(input, context);
assert.equal(deterministic.status, "success");
if (deterministic.status !== "success") {
  throw new Error("deterministic orchestration failed");
}
assert.deepEqual(deterministic.value, success.value);
assert.deepEqual(input, inputSnapshot);
assert.notEqual(deterministic.value, success.value);
assert.notEqual(deterministic.value.source, success.value.source);

assert.notEqual(success.value.source.sourceRef, selection.candidate.sourceId);
assert.notEqual(success.value.source.sourceRef, selection.candidate.locator);
assert.notEqual(success.value.source.sourceRef, collectedContent.contentHandle);
assert.equal(
  "OfficialMenuSourceAcquisitionOrchestrator" in publicPackageSurface,
  true,
);
for (const value of [success.value, success.value.source, success.value.content]) {
  for (const forbidden of [
    "rawProviderPayload",
    "rawHtml",
    "imageBytes",
    "base64",
    "secrets",
    "providerInternal",
    "durableIdentity",
    "publicationIdentity",
    "cacheIdentity",
  ]) {
    assert.equal(forbidden in value, false, forbidden);
  }
}

console.log("Official menu source acquisition orchestrator validation passed.");
