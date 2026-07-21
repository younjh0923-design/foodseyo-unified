import assert from "node:assert/strict";

import {
  MODULE_INTERFACE_VERSION,
  PUBLIC_ERROR_REGISTRY,
  PublicErrorEnvelopeSchema,
  type PortInvocationContext,
} from "@foodseyo/contracts";

import {
  FakeOfficialMenuSourceDiscovery,
  MenuAcquisitionStrategyExecutionService,
  OfficialMenuSourceDiscoveryService,
  type MenuAcquisitionReuseOutcome,
  type MenuAcquisitionStrategyExecutionInput,
  type MenuCacheBody,
  type MenuCacheCandidate,
  type OfficialMenuSourceCandidate,
  type OfficialMenuSourceDiscoveryRequest,
  type UploadedImageReuseOutcome,
} from "../src/index.js";

const candidate: MenuCacheCandidate = {
  googlePlaceId: "google_place_strategy_execution",
  menuVersion: {
    menuVersionId: "d0000000-0000-4000-8000-000000000001",
    restaurantId: "d1000000-0000-4000-8000-000000000001",
    menuScope: "dinner",
    state: "active",
    versionOrdinal: 1,
    sourceRefs: ["d2000000-0000-4000-8000-000000000001"],
    collectedAt: "2026-07-20T10:00:00.000Z",
    validFrom: "2026-07-20T10:00:00.000Z",
    validUntil: "2026-07-21T10:00:00.000Z",
    supersedesMenuVersionId: null,
  },
  publicationState: "eligible",
  coverage: "full_menu",
  localeEvidence: null,
};
const body: MenuCacheBody = {
  menuVersionId: candidate.menuVersion.menuVersionId,
  menuScope: "dinner",
  coverage: "full_menu",
  menuItems: [],
};
const discoveryRequest: OfficialMenuSourceDiscoveryRequest = {
  googlePlaceId: candidate.googlePlaceId,
  restaurantId: candidate.menuVersion.restaurantId,
  menuScope: "dinner",
};
const source: OfficialMenuSourceCandidate = {
  sourceId: "official-menu-page",
  kind: "official_menu_page",
  locator: "locator:official-menu-page",
};
const context = (name: string): PortInvocationContext => ({
  contractVersion: MODULE_INTERFACE_VERSION,
  correlationId: `strategy_execution_${name}`,
  timeoutMs: 5_000,
  signal: new AbortController().signal,
});
const uploadedImage = (
  kind: UploadedImageReuseOutcome["kind"],
): UploadedImageReuseOutcome => ({ kind });
const stale = (
  kind: UploadedImageReuseOutcome["kind"] | null,
): MenuAcquisitionReuseOutcome => ({
  kind: "stale_cache",
  candidate,
  uploadedImage: kind === null ? null : uploadedImage(kind),
});
const miss = (
  kind: UploadedImageReuseOutcome["kind"] | null,
): MenuAcquisitionReuseOutcome => ({
  kind: "cache_miss",
  uploadedImage: kind === null ? null : uploadedImage(kind),
});
const input = (
  reuseOutcome: MenuAcquisitionReuseOutcome,
): MenuAcquisitionStrategyExecutionInput => ({
  reuseOutcome,
  discoveryRequest,
});
const fixture = (
  result: ConstructorParameters<typeof FakeOfficialMenuSourceDiscovery>[0],
) => {
  const fake = new FakeOfficialMenuSourceDiscovery(result);
  return {
    fake,
    service: new MenuAcquisitionStrategyExecutionService(
      new OfficialMenuSourceDiscoveryService(fake),
    ),
  };
};

// A-C/I. Non-discovery strategies never call the injected discovery boundary.
for (const [name, reuseOutcome, expectedKind] of [
  [
    "fresh",
    { kind: "fresh_cache", candidate, body },
    "use_cache",
  ],
  ["stale-full", stale("menu_full"), "reuse_uploaded_image"],
  ["miss-partial", miss("menu_partial"), "reuse_uploaded_image"],
  ["miss-null", miss(null), "wait_for_next_stage"],
] as const) {
  const scenario = fixture({ status: "success", value: [source] });
  const result = await scenario.service.execute(
    input(reuseOutcome),
    context(name),
  );
  assert.equal(result.status, "success", name);
  if (result.status !== "success") throw new Error(`${name} failed`);
  assert.equal(result.value.kind, expectedKind, name);
  assert.equal(scenario.fake.callCount, 0, name);
}

// D-H. Every strategy-selected discovery path invokes exactly once.
for (const [name, reuseOutcome] of [
  ["stale-storefront", stale("storefront")],
  ["stale-unknown", stale("unknown")],
  ["stale-null", stale(null)],
  ["miss-storefront", miss("storefront")],
  ["miss-unknown", miss("unknown")],
] as const) {
  const scenario = fixture({ status: "success", value: [source] });
  const result = await scenario.service.execute(
    input(reuseOutcome),
    context(name),
  );
  assert.equal(result.status, "success", name);
  if (result.status !== "success") throw new Error(`${name} failed`);
  assert.equal(result.value.kind, "official_sources", name);
  if (result.value.kind !== "official_sources") {
    throw new Error(`${name} sources lost`);
  }
  assert.deepEqual(result.value.sources, [source], name);
  assert.equal(scenario.fake.callCount, 1, name);
}

// J. An empty discovery remains a successful official_sources outcome.
const emptyFixture = fixture({ status: "success", value: [] });
const empty = await emptyFixture.service.execute(
  input(stale(null)),
  context("empty"),
);
assert.equal(empty.status, "success");
if (empty.status !== "success" || empty.value.kind !== "official_sources") {
  throw new Error("empty discovery failed");
}
assert.deepEqual(empty.value.sources, []);
assert.equal(emptyFixture.fake.callCount, 1);

// K. A typed discovery failure is returned without replacement.
const failureDefinition = PUBLIC_ERROR_REGISTRY.UPSTREAM_UNAVAILABLE;
const discoveryFailure = PublicErrorEnvelopeSchema.parse({
  error: {
    code: "UPSTREAM_UNAVAILABLE",
    message: failureDefinition.message,
    correlationId: "strategy_execution_discovery_failure",
    retryable: failureDefinition.retryable,
  },
  httpStatus: failureDefinition.httpStatus,
});
const failureFixture = fixture({
  status: "error",
  error: discoveryFailure,
});
const failure = await failureFixture.service.execute(
  input(stale("storefront")),
  context("failure"),
);
assert.equal(failure.status, "error");
if (failure.status !== "error") throw new Error("failure was lost");
assert.equal(failure.error, discoveryFailure);
assert.equal(failureFixture.fake.callCount, 1);

// L. Execution passes only the existing minimal request projection.
const projectionFixture = fixture({ status: "success", value: [] });
await projectionFixture.service.execute(
  input(stale(null)),
  context("projection"),
);
assert.deepEqual(projectionFixture.fake.lastRequest, discoveryRequest);
assert.deepEqual(
  Object.keys(projectionFixture.fake.lastRequest ?? {}).sort(),
  ["googlePlaceId", "menuScope", "restaurantId"],
);

// M-O. Sources are copied, inputs remain unchanged, and results are deterministic.
const immutableInput = input(stale("unknown"));
const immutableSnapshot = structuredClone(immutableInput);
const deterministicFixture = fixture({ status: "success", value: [source] });
const first = await deterministicFixture.service.execute(
  immutableInput,
  context("deterministic-first"),
);
assert.equal(first.status, "success");
if (first.status !== "success" || first.value.kind !== "official_sources") {
  throw new Error("first deterministic execution failed");
}
Object.assign(first.value.sources[0] ?? {}, { locator: "locator:mutated" });

const second = await deterministicFixture.service.execute(
  immutableInput,
  context("deterministic-second"),
);
assert.equal(second.status, "success");
if (second.status !== "success" || second.value.kind !== "official_sources") {
  throw new Error("second deterministic execution failed");
}
assert.deepEqual(second.value.sources, [source]);
assert.notEqual(first.value.sources, second.value.sources);
assert.notEqual(first.value.sources[0], second.value.sources[0]);
assert.deepEqual(immutableInput, immutableSnapshot);

const third = await deterministicFixture.service.execute(
  immutableInput,
  context("deterministic-third"),
);
assert.equal(third.status, "success");
if (third.status !== "success") throw new Error("third execution failed");
assert.deepEqual(third.value, second.value);

// P. The new boundary adds no Google candidate or persistence-policy fields.
assert.deepEqual(Object.keys(immutableInput).sort(), [
  "discoveryRequest",
  "reuseOutcome",
]);
for (const value of [immutableInput, source, second.value]) {
  for (const forbidden of [
    "candidateId",
    "candidateList",
    "matchSignals",
    "coordinates",
    "location",
    "rank",
    "rawGooglePayload",
    "persistence",
    "attribution",
  ]) {
    assert.equal(forbidden in value, false, forbidden);
  }
}

console.log("Menu acquisition strategy execution validation passed.");
