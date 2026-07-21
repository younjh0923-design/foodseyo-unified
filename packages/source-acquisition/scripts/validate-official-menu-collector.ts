import assert from "node:assert/strict";

import {
  MODULE_INTERFACE_VERSION,
  PUBLIC_ERROR_REGISTRY,
  PublicErrorEnvelopeSchema,
  type PortInvocationContext,
  type TransientMenuContent,
} from "@foodseyo/contracts";

import {
  FakeHtmlMenuPageCollector,
  FakeOrderPageCollector,
  FakePdfMenuCollector,
  OfficialMenuCollectorKind,
  OfficialMenuCollectorService,
  type OfficialMenuCollectorSelection,
  type OfficialMenuSourceCandidate,
} from "../src/index.js";

const context = (name: string): PortInvocationContext => ({
  contractVersion: MODULE_INTERFACE_VERSION,
  correlationId: `official_menu_collector_${name}`,
  timeoutMs: 5_000,
  signal: new AbortController().signal,
});
const candidate = (
  sourceId: string,
  kind: OfficialMenuSourceCandidate["kind"],
  locator: string,
): OfficialMenuSourceCandidate => ({ sourceId, kind, locator });
const selection = (
  candidateValue: OfficialMenuSourceCandidate,
  collectorKind: OfficialMenuCollectorKind,
): OfficialMenuCollectorSelection => ({
  candidate: candidateValue,
  collectorKind,
});
const pageSelection = selection(
  candidate("collector-page", "official_menu_page", "locator:page"),
  OfficialMenuCollectorKind.HTML_MENU_PAGE,
);
const pdfSelection = selection(
  candidate("collector-pdf", "official_pdf", "locator:pdf"),
  OfficialMenuCollectorKind.PDF_MENU,
);
const orderSelection = selection(
  candidate("collector-order", "official_order_page", "locator:order"),
  OfficialMenuCollectorKind.ORDER_PAGE,
);
const htmlContent: TransientMenuContent = {
  kind: "html",
  contentHandle: "content:official-html",
  sensitivity: "sensitive_transient",
  byteCount: 1_024,
  pageCount: null,
};
const pdfContent: TransientMenuContent = {
  kind: "pdf",
  contentHandle: "content:official-pdf",
  sensitivity: "sensitive_transient",
  byteCount: 2_048,
  pageCount: 2,
};
const orderContent: TransientMenuContent = {
  kind: "html",
  contentHandle: "content:official-order",
  sensitivity: "sensitive_transient",
  byteCount: 3_072,
  pageCount: null,
};
const successFixture = () => {
  const html = new FakeHtmlMenuPageCollector({
    status: "success",
    value: htmlContent,
  });
  const pdf = new FakePdfMenuCollector({
    status: "success",
    value: pdfContent,
  });
  const order = new FakeOrderPageCollector({
    status: "success",
    value: orderContent,
  });
  return {
    html,
    pdf,
    order,
    service: new OfficialMenuCollectorService(html, pdf, order),
  };
};

// A-E. Each selection invokes only its matching collector exactly once.
for (const [name, selected, expectedContent, selectedKey] of [
  ["html", pageSelection, htmlContent, "html"],
  ["pdf", pdfSelection, pdfContent, "pdf"],
  ["order", orderSelection, orderContent, "order"],
] as const) {
  const fixture = successFixture();
  const result = await fixture.service.collect(selected, context(name));
  assert.equal(result.status, "success", name);
  if (result.status !== "success") throw new Error(`${name} failed`);
  assert.deepEqual(result.value, expectedContent, name);
  assert.equal(fixture[selectedKey].callCount, 1, name);
  for (const key of ["html", "pdf", "order"] as const) {
    if (key !== selectedKey) assert.equal(fixture[key].callCount, 0, key);
  }
}

// F. Typed collector failures retain the exact public envelope.
const failureDefinition = PUBLIC_ERROR_REGISTRY.UPSTREAM_UNAVAILABLE;
const collectorFailure = PublicErrorEnvelopeSchema.parse({
  error: {
    code: "UPSTREAM_UNAVAILABLE",
    message: failureDefinition.message,
    correlationId: "official_menu_collector_failure",
    retryable: failureDefinition.retryable,
  },
  httpStatus: failureDefinition.httpStatus,
});
const failingHtml = new FakeHtmlMenuPageCollector({
  status: "error",
  error: collectorFailure,
});
const failurePdf = new FakePdfMenuCollector({
  status: "success",
  value: pdfContent,
});
const failureOrder = new FakeOrderPageCollector({
  status: "success",
  value: orderContent,
});
const failure = await new OfficialMenuCollectorService(
  failingHtml,
  failurePdf,
  failureOrder,
).collect(pageSelection, context("failure"));
assert.equal(failure.status, "error");
if (failure.status !== "error") throw new Error("typed failure was lost");
assert.equal(failure.error, collectorFailure);
assert.equal(failingHtml.callCount, 1);
assert.equal(failurePdf.callCount, 0);
assert.equal(failureOrder.callCount, 0);

// G/H. Malformed kind or candidate is rejected before any collector call.
const malformedKind: OfficialMenuCollectorSelection = {
  ...pageSelection,
  collectorKind: "UNKNOWN_COLLECTOR" as OfficialMenuCollectorKind,
};
const malformedCandidate: OfficialMenuCollectorSelection = {
  ...pdfSelection,
  candidate: { ...pdfSelection.candidate, sourceId: "" },
};
for (const [name, malformed] of [
  ["kind", malformedKind],
  ["candidate", malformedCandidate],
] as const) {
  const fixture = successFixture();
  const result = await fixture.service.collect(malformed, context(name));
  assert.equal(result.status, "error", name);
  if (result.status !== "error") throw new Error(`${name} must fail`);
  assert.equal(result.error.error.code, "INVALID_UPSTREAM_RESULT", name);
  assert.equal(fixture.html.callCount, 0, name);
  assert.equal(fixture.pdf.callCount, 0, name);
  assert.equal(fixture.order.callCount, 0, name);
}

// I-K. Inputs, configured fake values, and returned content are isolated copies.
const immutableSelection = structuredClone(pageSelection);
const selectionSnapshot = structuredClone(immutableSelection);
const configuredContent = structuredClone(htmlContent);
const configuredSnapshot = structuredClone(configuredContent);
const defensiveHtml = new FakeHtmlMenuPageCollector({
  status: "success",
  value: configuredContent,
});
Object.assign(configuredContent, { contentHandle: "content:mutated-config" });
const defensivePdf = new FakePdfMenuCollector({
  status: "success",
  value: pdfContent,
});
const defensiveOrder = new FakeOrderPageCollector({
  status: "success",
  value: orderContent,
});
const defensiveService = new OfficialMenuCollectorService(
  defensiveHtml,
  defensivePdf,
  defensiveOrder,
);
const first = await defensiveService.collect(
  immutableSelection,
  context("defensive-first"),
);
assert.equal(first.status, "success");
if (first.status !== "success") throw new Error("defensive collect failed");
assert.deepEqual(first.value, configuredSnapshot);
assert.deepEqual(immutableSelection, selectionSnapshot);
assert.deepEqual(defensiveHtml.lastSelection, pageSelection);
Object.assign(first.value, { contentHandle: "content:mutated-result" });

const second = await defensiveService.collect(
  immutableSelection,
  context("defensive-second"),
);
assert.equal(second.status, "success");
if (second.status !== "success") throw new Error("second collect failed");
assert.deepEqual(second.value, configuredSnapshot);
assert.notEqual(first.value, second.value);
assert.deepEqual(immutableSelection, selectionSnapshot);

// L. The same selection and fake configuration are deterministic.
const third = await defensiveService.collect(
  immutableSelection,
  context("deterministic"),
);
assert.equal(third.status, "success");
if (third.status !== "success") throw new Error("deterministic collect failed");
assert.deepEqual(third.value, second.value);

// M/N. Only fake ports run; no provider/parser or policy fields cross this API.
assert.equal(defensiveHtml.callCount, 3);
assert.deepEqual(Object.keys(pageSelection).sort(), [
  "candidate",
  "collectorKind",
]);
for (const value of [pageSelection, pageSelection.candidate, second.value]) {
  for (const forbidden of [
    "candidateList",
    "matchSignals",
    "name",
    "address",
    "coordinates",
    "rank",
    "rawGooglePayload",
    "persistence",
    "attribution",
    "ttl",
  ]) {
    assert.equal(forbidden in value, false, forbidden);
  }
}

console.log("Official menu collector validation passed.");
