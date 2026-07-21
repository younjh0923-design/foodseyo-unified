import assert from "node:assert/strict";

import {
  MODULE_INTERFACE_VERSION,
  PUBLIC_ERROR_REGISTRY,
  PublicErrorEnvelopeSchema,
  type PortInvocationContext,
} from "@foodseyo/contracts";

import {
  FakeOfficialMenuSourceDiscovery,
  OfficialMenuSourceDiscoveryService,
  type OfficialMenuSourceCandidate,
  type OfficialMenuSourceDiscoveryRequest,
  type OfficialMenuSourceKind,
} from "../src/index.js";

const request: OfficialMenuSourceDiscoveryRequest = {
  googlePlaceId: "google_place_official_discovery",
  restaurantId: "c0000000-0000-4000-8000-000000000001",
  menuScope: "dinner",
};
const context = (name: string): PortInvocationContext => ({
  contractVersion: MODULE_INTERFACE_VERSION,
  correlationId: `official_menu_discovery_${name}`,
  timeoutMs: 5_000,
  signal: new AbortController().signal,
});
const candidate = (
  sourceId: string,
  kind: OfficialMenuSourceKind,
  locator: string,
): OfficialMenuSourceCandidate => ({ sourceId, kind, locator });
const discover = (
  candidates: readonly OfficialMenuSourceCandidate[],
) => {
  const fake = new FakeOfficialMenuSourceDiscovery({
    status: "success",
    value: candidates,
  });
  return {
    fake,
    service: new OfficialMenuSourceDiscoveryService(fake),
  };
};

// A. A valid official menu page passes through the boundary.
const page = candidate(
  "official-page",
  "official_menu_page",
  "locator:official-page",
);
const pageFixture = discover([page]);
const pageResult = await pageFixture.service.discover(
  request,
  context("page"),
);
assert.equal(pageResult.status, "success");
if (pageResult.status !== "success") throw new Error("page discovery failed");
assert.deepEqual(pageResult.value, [page]);

// B. Source kinds follow the documented deterministic priority.
const pdf = candidate("official-pdf", "official_pdf", "locator:pdf");
const order = candidate(
  "official-order",
  "official_order_page",
  "locator:order",
);
const orderedResult = await discover([order, pdf, page]).service.discover(
  request,
  context("ordering"),
);
assert.equal(orderedResult.status, "success");
if (orderedResult.status !== "success") {
  throw new Error("ordered discovery failed");
}
assert.deepEqual(
  orderedResult.value.map((value) => value.kind),
  ["official_menu_page", "official_pdf", "official_order_page"],
);

// C. No candidates is a successful empty discovery.
const empty = await discover([]).service.discover(request, context("empty"));
assert.equal(empty.status, "success");
if (empty.status !== "success") throw new Error("empty discovery failed");
assert.deepEqual(empty.value, []);

// D. Typed discovery errors retain their exact envelope.
const failureDefinition = PUBLIC_ERROR_REGISTRY.UPSTREAM_UNAVAILABLE;
const discoveryFailure = PublicErrorEnvelopeSchema.parse({
  error: {
    code: "UPSTREAM_UNAVAILABLE",
    message: failureDefinition.message,
    correlationId: "official_menu_discovery_failure",
    retryable: failureDefinition.retryable,
  },
  httpStatus: failureDefinition.httpStatus,
});
const failingFake = new FakeOfficialMenuSourceDiscovery({
  status: "error",
  error: discoveryFailure,
});
const failed = await new OfficialMenuSourceDiscoveryService(
  failingFake,
).discover(request, context("failure"));
assert.equal(failed.status, "error");
if (failed.status !== "error") throw new Error("typed failure was lost");
assert.equal(failed.error, discoveryFailure);

// E/F. Malformed provider candidates are rejected before selection.
const malformedKind = candidate(
  "malformed-kind",
  "unsupported_kind" as OfficialMenuSourceKind,
  "locator:malformed-kind",
);
for (const [name, malformed] of [
  ["kind", malformedKind],
  ["source-id", candidate("", "official_pdf", "locator:empty-id")],
  ["locator", candidate("empty-locator", "official_pdf", "   ")],
] as const) {
  const result = await discover([malformed]).service.discover(
    request,
    context(`malformed-${name}`),
  );
  assert.equal(result.status, "error");
  if (result.status !== "error") throw new Error(`${name} must fail`);
  assert.equal(result.error.error.code, "INVALID_UPSTREAM_RESULT");
}

// G/H. Sorting first makes both deduplication keys independent of input order.
const duplicateSourceResult = await discover([
  candidate("duplicate-id", "official_pdf", "locator:duplicate-pdf"),
  candidate("duplicate-id", "official_menu_page", "locator:duplicate-page"),
]).service.discover(request, context("duplicate-source"));
assert.equal(duplicateSourceResult.status, "success");
if (duplicateSourceResult.status !== "success") {
  throw new Error("source-id dedup failed");
}
assert.deepEqual(duplicateSourceResult.value, [
  candidate("duplicate-id", "official_menu_page", "locator:duplicate-page"),
]);

const duplicateLocatorResult = await discover([
  candidate("locator-pdf", "official_pdf", "locator:shared"),
  candidate("locator-page", "official_menu_page", "locator:shared"),
]).service.discover(request, context("duplicate-locator"));
assert.equal(duplicateLocatorResult.status, "success");
if (duplicateLocatorResult.status !== "success") {
  throw new Error("locator dedup failed");
}
assert.deepEqual(duplicateLocatorResult.value, [
  candidate("locator-page", "official_menu_page", "locator:shared"),
]);

// I. Strict request validation blocks extra fields before calling discovery.
const strictFake = new FakeOfficialMenuSourceDiscovery({
  status: "success",
  value: [],
});
const requestWithExtraField: OfficialMenuSourceDiscoveryRequest & {
  readonly rank: number;
} = { ...request, rank: 1 };
const strictResult = await new OfficialMenuSourceDiscoveryService(
  strictFake,
).discover(requestWithExtraField, context("strict-request"));
assert.equal(strictResult.status, "error");
if (strictResult.status !== "error") {
  throw new Error("extra request field must fail");
}
assert.equal(strictResult.error.error.code, "INVALID_INPUT");
assert.equal(strictFake.callCount, 0);

const projectionFake = new FakeOfficialMenuSourceDiscovery({
  status: "success",
  value: [],
});
await new OfficialMenuSourceDiscoveryService(projectionFake).discover(
  request,
  context("projection"),
);
assert.deepEqual(projectionFake.lastRequest, request);
assert.deepEqual(Object.keys(projectionFake.lastRequest ?? {}).sort(), [
  "googlePlaceId",
  "menuScope",
  "restaurantId",
]);

// J/K. Fake storage, requests, and returned candidates are defensively copied.
const storedCandidates = [page, pdf] as const;
const storedSnapshot = structuredClone(storedCandidates);
const defensiveFixture = discover(storedCandidates);
const first = await defensiveFixture.service.discover(
  request,
  context("defensive-first"),
);
assert.equal(first.status, "success");
if (first.status !== "success") throw new Error("defensive read failed");
Object.assign(first.value[0] ?? {}, { locator: "locator:mutated" });
const exposedRequest = defensiveFixture.fake.lastRequest;
Object.assign(exposedRequest ?? {}, { restaurantId: "mutated" });

const second = await defensiveFixture.service.discover(
  request,
  context("defensive-second"),
);
assert.equal(second.status, "success");
if (second.status !== "success") throw new Error("second read failed");
assert.deepEqual(second.value, [page, pdf]);
assert.deepEqual(storedCandidates, storedSnapshot);
assert.deepEqual(defensiveFixture.fake.lastRequest, request);
assert.notEqual(first.value, second.value);
assert.notEqual(first.value[0], second.value[0]);

const deterministicAgain = await discover([order, page, pdf]).service.discover(
  request,
  context("deterministic"),
);
assert.equal(deterministicAgain.status, "success");
if (deterministicAgain.status !== "success") {
  throw new Error("deterministic discovery failed");
}
assert.deepEqual(deterministicAgain.value, orderedResult.value);

// L. Neither projection exposes candidate evidence or persistence policy.
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
  assert.equal(forbidden in request, false, forbidden);
  assert.equal(forbidden in page, false, forbidden);
}

console.log("Official menu source discovery validation passed.");
