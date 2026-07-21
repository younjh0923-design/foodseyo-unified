import assert from "node:assert/strict";

import {
  CONTRACT_VERSIONS,
  MODULE_INTERFACE_VERSION,
  MenuSourceAcquisitionRequestSchema,
  MenuSourceInputSchema,
  type MenuSourceAcquisitionRequest,
  type PortInvocationContext,
  type TransientMenuContent,
} from "@foodseyo/contracts";

import {
  assembleCollectedOfficialMenuSourceInput,
  type CollectedOfficialMenuSourceAssemblyInput,
} from "../src/official-menu-source-input-assembler.js";
import {
  OfficialMenuCollectorKind,
  type OfficialMenuCollectorSelection,
} from "../src/official-menu-collector-selection.js";

const context: PortInvocationContext = {
  contractVersion: MODULE_INTERFACE_VERSION,
  correlationId: "official_menu_source_input_assembler",
  timeoutMs: 5_000,
  signal: new AbortController().signal,
};
const requestedAt = "2026-07-21T12:00:00.000Z";
const collectedAt = "2026-07-21T12:00:05.000Z";
const candidateId = "e1000000-0000-4000-8000-000000000001";
const restaurantId = "e0000000-0000-4000-8000-000000000001";
const googlePlaceId = "google_place_request_scoped_assembly";

const confirmedRequest = MenuSourceAcquisitionRequestSchema.parse({
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
      actionRef: "action:official-source-assembly",
      recordedAt: "2026-07-21T11:59:00.000Z",
    },
    requiresUserConfirmation: false,
    canContinueMenuOnly: true,
    resolvedAt: "2026-07-21T11:59:00.000Z",
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

const inputFor = (
  sourceKind: "official_menu_page" | "official_pdf" | "official_order_page",
  collectorKind: OfficialMenuCollectorKind,
  contentKind: "html" | "pdf",
  ordinal: string,
): CollectedOfficialMenuSourceAssemblyInput => {
  const selection: OfficialMenuCollectorSelection = {
    candidate: {
      sourceId: `candidate-source-${ordinal}`,
      kind: sourceKind,
      locator: `locator:official-${ordinal}`,
    },
    collectorKind,
  };
  const content: TransientMenuContent = {
    kind: contentKind,
    contentHandle: `content:official-${ordinal}`,
    sensitivity: "sensitive_transient",
    byteCount: 1_024,
    pageCount: contentKind === "pdf" ? 2 : null,
  };
  return {
    request: confirmedRequest,
    selection,
    content,
    contentIdentity: {
      sourceRef: `e2000000-0000-4000-8000-00000000000${ordinal}`,
      sourceFingerprint: ordinal.repeat(64),
    },
    collectedAt,
  };
};

const htmlInput = inputFor(
  "official_menu_page",
  OfficialMenuCollectorKind.HTML_MENU_PAGE,
  "html",
  "1",
);
const pdfInput = inputFor(
  "official_pdf",
  OfficialMenuCollectorKind.PDF_MENU,
  "pdf",
  "2",
);
const orderInput = inputFor(
  "official_order_page",
  OfficialMenuCollectorKind.ORDER_PAGE,
  "html",
  "3",
);

for (const [name, input, expectedSourceType] of [
  ["html", htmlInput, "official_website"],
  ["pdf", pdfInput, "official_pdf"],
  ["order", orderInput, "ordering_page"],
] as const) {
  const result = assembleCollectedOfficialMenuSourceInput(input, context);
  assert.equal(result.status, "success", name);
  if (result.status !== "success") throw new Error(`${name} assembly failed`);
  assert.equal(MenuSourceInputSchema.safeParse(result.value).success, true, name);
  assert.equal(result.value.contractVersion, CONTRACT_VERSIONS.menuSource, name);
  assert.equal(result.value.source.sourceRef, input.contentIdentity.sourceRef, name);
  assert.equal(
    result.value.source.sourceFingerprint,
    input.contentIdentity.sourceFingerprint,
    name,
  );
  assert.equal(result.value.source.sourceType, expectedSourceType, name);
  assert.equal(result.value.source.collectedAt, collectedAt, name);
  assert.equal(result.value.requestedAt, requestedAt, name);
  assert.notEqual(result.value.source.collectedAt, result.value.requestedAt, name);
  assert.equal(result.value.menuScope, confirmedRequest.menuScope, name);
  assert.deepEqual(result.value.content, input.content, name);
  assert.deepEqual(result.value.restaurantContext, {
    restaurantId,
    candidateId,
    googlePlaceId,
    resolutionState: "user_confirmed",
  });
}

const unconfirmedRequest = MenuSourceAcquisitionRequestSchema.parse({
  ...confirmedRequest,
  restaurantResolution: {
    ...confirmedRequest.restaurantResolution,
    state: "candidate",
    selectedCandidateId: null,
    restaurantId: null,
    confirmationEvidence: null,
    requiresUserConfirmation: true,
    canContinueMenuOnly: true,
    resolvedAt: null,
  },
});

for (const [name, malformed] of [
  [
    "selection",
    {
      ...htmlInput,
      selection: {
        ...htmlInput.selection,
        candidate: { ...htmlInput.selection.candidate, locator: "" },
      },
    },
  ],
  [
    "content",
    { ...htmlInput, content: { ...htmlInput.content, contentHandle: "" } },
  ],
  [
    "identity",
    {
      ...htmlInput,
      contentIdentity: { ...htmlInput.contentIdentity, sourceRef: "" },
    },
  ],
  ["collected-at", { ...htmlInput, collectedAt: "not-a-timestamp" }],
  ["unconfirmed", { ...htmlInput, request: unconfirmedRequest }],
] as const) {
  const result = assembleCollectedOfficialMenuSourceInput(
    malformed as CollectedOfficialMenuSourceAssemblyInput,
    context,
  );
  assert.equal(result.status, "error", name);
  if (result.status !== "error") throw new Error(`${name} must fail`);
  assert.equal(result.error.error.code, "INVALID_UPSTREAM_RESULT", name);
}

const incomplete = {
  ...htmlInput,
  contentIdentity: undefined,
} as unknown as CollectedOfficialMenuSourceAssemblyInput;
const incompleteResult = assembleCollectedOfficialMenuSourceInput(
  incomplete,
  context,
);
assert.equal(incompleteResult.status, "error");
if (incompleteResult.status !== "error") {
  throw new Error("incomplete input must fail");
}
assert.equal(incompleteResult.error.error.code, "INVALID_UPSTREAM_RESULT");

const immutableInput = structuredClone(htmlInput);
const inputSnapshot = structuredClone(immutableInput);
const first = assembleCollectedOfficialMenuSourceInput(immutableInput, context);
const second = assembleCollectedOfficialMenuSourceInput(immutableInput, context);
assert.equal(first.status, "success");
assert.equal(second.status, "success");
if (first.status !== "success" || second.status !== "success") {
  throw new Error("deterministic assembly failed");
}
assert.deepEqual(first.value, second.value);
assert.deepEqual(immutableInput, inputSnapshot);
assert.notEqual(first.value, second.value);
assert.notEqual(first.value.source, second.value.source);
assert.notEqual(first.value.content, second.value.content);

assert.notEqual(
  first.value.source.sourceRef,
  htmlInput.selection.candidate.sourceId,
);
assert.notEqual(
  first.value.source.sourceRef,
  htmlInput.selection.candidate.locator,
);
assert.notEqual(first.value.source.sourceRef, htmlInput.content.contentHandle);
for (const value of [first.value, first.value.source, first.value.content]) {
  for (const forbidden of [
    "candidateList",
    "matchSignals",
    "rawProviderPayload",
    "rawHtml",
    "imageBytes",
    "base64",
    "secrets",
    "persistence",
    "attribution",
    "ttl",
  ]) {
    assert.equal(forbidden in value, false, forbidden);
  }
}

console.log("Official menu source input assembler validation passed.");
