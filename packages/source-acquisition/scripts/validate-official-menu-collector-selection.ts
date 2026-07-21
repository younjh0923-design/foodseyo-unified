import assert from "node:assert/strict";

import {
  MODULE_INTERFACE_VERSION,
  type PortInvocationContext,
} from "@foodseyo/contracts";

import {
  OfficialMenuCollectorKind,
  selectOfficialMenuCollector,
  selectOfficialMenuCollectors,
  type OfficialMenuSourceCandidate,
  type OfficialMenuSourceKind,
} from "../src/index.js";

const context: PortInvocationContext = {
  contractVersion: MODULE_INTERFACE_VERSION,
  correlationId: "official_menu_collector_selection",
  timeoutMs: 5_000,
  signal: new AbortController().signal,
};
const candidate = (
  sourceId: string,
  kind: OfficialMenuSourceKind,
  locator: string,
): OfficialMenuSourceCandidate => ({ sourceId, kind, locator });

const page = candidate(
  "collector-page",
  "official_menu_page",
  "locator:collector-page",
);
const pdf = candidate(
  "collector-pdf",
  "official_pdf",
  "locator:collector-pdf",
);
const order = candidate(
  "collector-order",
  "official_order_page",
  "locator:collector-order",
);

// A-C. Each existing source kind maps to exactly one collector kind.
for (const [source, expected] of [
  [page, OfficialMenuCollectorKind.HTML_MENU_PAGE],
  [pdf, OfficialMenuCollectorKind.PDF_MENU],
  [order, OfficialMenuCollectorKind.ORDER_PAGE],
] as const) {
  const result = selectOfficialMenuCollector(source, context);
  assert.equal(result.status, "success");
  if (result.status !== "success") throw new Error("valid selection failed");
  assert.equal(result.value.collectorKind, expected);
  assert.deepEqual(result.value.candidate, source);
}

// D. Array selection preserves provider order rather than re-sorting.
const orderedInput = [order, page, pdf] as const;
const ordered = selectOfficialMenuCollectors(orderedInput, context);
assert.equal(ordered.status, "success");
if (ordered.status !== "success") throw new Error("ordered selection failed");
assert.deepEqual(
  ordered.value.map((selection) => selection.collectorKind),
  [
    OfficialMenuCollectorKind.ORDER_PAGE,
    OfficialMenuCollectorKind.HTML_MENU_PAGE,
    OfficialMenuCollectorKind.PDF_MENU,
  ],
);
assert.deepEqual(
  ordered.value.map((selection) => selection.candidate.sourceId),
  orderedInput.map((source) => source.sourceId),
);

// E. Empty candidate sets are a successful no-op.
const empty = selectOfficialMenuCollectors([], context);
assert.equal(empty.status, "success");
if (empty.status !== "success") throw new Error("empty selection failed");
assert.deepEqual(empty.value, []);

// F-H. Malformed upstream candidates use the existing public error envelope.
for (const [name, malformed] of [
  [
    "kind",
    candidate(
      "malformed-kind",
      "official_menu_pdf" as OfficialMenuSourceKind,
      "locator:malformed-kind",
    ),
  ],
  ["sourceId", candidate("", "official_pdf", "locator:empty-id")],
  ["locator", candidate("empty-locator", "official_pdf", "   ")],
] as const) {
  const single = selectOfficialMenuCollector(malformed, context);
  assert.equal(single.status, "error", name);
  if (single.status !== "error") throw new Error(`${name} must fail`);
  assert.equal(single.error.error.code, "INVALID_UPSTREAM_RESULT", name);

  const multiple = selectOfficialMenuCollectors([page, malformed], context);
  assert.equal(multiple.status, "error", `${name} array`);
  if (multiple.status !== "error") throw new Error(`${name} array must fail`);
  assert.equal(multiple.error.error.code, "INVALID_UPSTREAM_RESULT", name);
}

// I/J. Neither selection mutates inputs or exposes their object references.
const immutableInput = [page, pdf, order] as const;
const immutableSnapshot = structuredClone(immutableInput);
const first = selectOfficialMenuCollectors(immutableInput, context);
assert.equal(first.status, "success");
if (first.status !== "success") throw new Error("defensive selection failed");
assert.notEqual(first.value, immutableInput);
for (const [index, selection] of first.value.entries()) {
  assert.notEqual(selection.candidate, immutableInput[index]);
}
Object.assign(first.value[0]?.candidate ?? {}, {
  locator: "locator:mutated",
});
assert.deepEqual(immutableInput, immutableSnapshot);

const second = selectOfficialMenuCollectors(immutableInput, context);
assert.equal(second.status, "success");
if (second.status !== "success") throw new Error("second selection failed");
assert.deepEqual(
  second.value.map((selection) => selection.candidate),
  immutableInput,
);
assert.notEqual(first.value[0]?.candidate, second.value[0]?.candidate);

// K. The same typed input and context produce the same value.
const deterministicAgain = selectOfficialMenuCollectors(
  immutableInput,
  context,
);
assert.equal(deterministicAgain.status, "success");
if (deterministicAgain.status !== "success") {
  throw new Error("deterministic selection failed");
}
assert.deepEqual(deterministicAgain.value, second.value);

// L. Selection is synchronous and has no provider or collector dependency.
const networkFree = selectOfficialMenuCollector(page, context);
assert.equal(networkFree instanceof Promise, false);
assert.equal(selectOfficialMenuCollector.length, 2);
assert.equal(selectOfficialMenuCollectors.length, 2);

// M. The new API adds no candidate evidence or persistence-policy fields.
if (second.value[0] === undefined) throw new Error("selection missing");
assert.deepEqual(Object.keys(second.value[0]).sort(), [
  "candidate",
  "collectorKind",
]);
for (const value of [second.value[0], second.value[0].candidate]) {
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

console.log("Official menu collector selection validation passed.");
