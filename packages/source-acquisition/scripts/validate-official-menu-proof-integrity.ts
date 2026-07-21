import assert from "node:assert/strict";

import {
  CONTRACT_VERSIONS,
  MODULE_INTERFACE_VERSION,
  MenuSourceAcquisitionRequestSchema,
  type PortInvocationContext,
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
  isVerifiedOfficialMenuCollectorSelection,
  verifyOfficialMenuCollectorSelection,
  type VerifiedOfficialMenuCollectorSelection,
} from "../src/official-menu-collector-selection.js";
import { OfficialMenuSourceAcquisitionOrchestrator } from "../src/official-menu-source-acquisition-orchestrator.js";
import {
  FakeOfficialMenuSourceDiscovery,
  OfficialMenuSourceDiscoveryService,
  isVerifiedOfficialMenuSourceDiscovery,
  type OfficialMenuSourceCandidate,
  type VerifiedOfficialMenuSourceDiscovery,
} from "../src/official-menu-source-discovery.js";
import * as publicPackageSurface from "../src/index.js";

const context: PortInvocationContext = {
  contractVersion: MODULE_INTERFACE_VERSION,
  correlationId: "official_menu_proof_integrity",
  timeoutMs: 5_000,
  signal: new AbortController().signal,
};
const candidateId = "f2000000-0000-4000-8000-000000000001";
const restaurantId = "f1000000-0000-4000-8000-000000000001";
const googlePlaceId = "google_place_proof_integrity";
const candidate: OfficialMenuSourceCandidate = {
  sourceId: "official-source-proof-integrity",
  kind: "official_menu_page",
  locator: "https://restaurant.example/menu",
};
const discoveryRequest = {
  googlePlaceId,
  restaurantId,
  menuScope: "dinner" as const,
};

const discovery = await new OfficialMenuSourceDiscoveryService(
  new FakeOfficialMenuSourceDiscovery({
    status: "success",
    value: [candidate],
  }),
).discoverVerified(discoveryRequest, context);
assert.equal(discovery.status, "success");
if (discovery.status !== "success") throw new Error("discovery failed");
assert.equal(isVerifiedOfficialMenuSourceDiscovery(discovery.value), true);

const selection = {
  candidate,
  collectorKind: OfficialMenuCollectorKind.HTML_MENU_PAGE,
};
const verifiedSelection = verifyOfficialMenuCollectorSelection(
  discovery.value,
  selection,
  context,
);
assert.equal(verifiedSelection.status, "success");
if (verifiedSelection.status !== "success") {
  throw new Error("selection verification failed");
}
assert.equal(
  isVerifiedOfficialMenuCollectorSelection(verifiedSelection.value),
  true,
);

const copySymbolProperties = (source: object, target: object): void => {
  const symbols = Object.getOwnPropertySymbols(source);
  assert.ok(symbols.length > 0);
  for (const symbol of symbols) {
    const descriptor = Object.getOwnPropertyDescriptor(source, symbol);
    assert.ok(descriptor);
    Object.defineProperty(target, symbol, descriptor);
  }
};

const deepFreeze = <T>(value: T): T => {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
};

const forgedCandidate = Object.freeze({
  sourceId: "forged-source-restaurant-b",
  kind: "official_menu_page" as const,
  locator: "https://restaurant-b.example/menu",
});
const forgedDiscoveryRecord = {
  request: Object.freeze({
    googlePlaceId: "google_place_restaurant_b",
    restaurantId: "f1000000-0000-4000-8000-000000000099",
    menuScope: "dinner" as const,
  }),
  candidates: Object.freeze([forgedCandidate]),
  correlationId: context.correlationId,
};
copySymbolProperties(discovery.value, forgedDiscoveryRecord);
const forgedDiscovery = Object.freeze(
  forgedDiscoveryRecord,
) as unknown as VerifiedOfficialMenuSourceDiscovery;
assert.equal(isVerifiedOfficialMenuSourceDiscovery(forgedDiscovery), false);
const forgedDiscoverySelection = verifyOfficialMenuCollectorSelection(
  forgedDiscovery,
  {
    candidate: forgedCandidate,
    collectorKind: OfficialMenuCollectorKind.HTML_MENU_PAGE,
  },
  context,
);
assert.equal(forgedDiscoverySelection.status, "error");

const shallowDiscoveryClone = Object.freeze({ ...discovery.value });
assert.equal(
  isVerifiedOfficialMenuSourceDiscovery(shallowDiscoveryClone),
  false,
);
const deepDiscoveryClone = deepFreeze(structuredClone(discovery.value));
assert.equal(isVerifiedOfficialMenuSourceDiscovery(deepDiscoveryClone), false);

const forgedSelectionRecord = {
  discoveryRequest: Object.freeze({ ...discoveryRequest }),
  discoveredCandidates: Object.freeze([
    Object.freeze({ ...candidate }),
  ]),
  discoveryCorrelationId: context.correlationId,
  selection: Object.freeze({
    candidate: Object.freeze({ ...candidate }),
    collectorKind: OfficialMenuCollectorKind.HTML_MENU_PAGE,
  }),
};
copySymbolProperties(verifiedSelection.value, forgedSelectionRecord);
const forgedVerifiedSelection = Object.freeze(
  forgedSelectionRecord,
) as unknown as VerifiedOfficialMenuCollectorSelection;
assert.equal(
  isVerifiedOfficialMenuCollectorSelection(forgedVerifiedSelection),
  false,
);
const shallowSelectionClone = Object.freeze({ ...verifiedSelection.value });
assert.equal(
  isVerifiedOfficialMenuCollectorSelection(shallowSelectionClone),
  false,
);
const deepSelectionClone = deepFreeze(structuredClone(verifiedSelection.value));
assert.equal(
  isVerifiedOfficialMenuCollectorSelection(deepSelectionClone),
  false,
);

const request = MenuSourceAcquisitionRequestSchema.parse({
  restaurantResolution: {
    contractVersion: CONTRACT_VERSIONS.restaurantResolution,
    state: "user_confirmed",
    candidates: [
      {
        contractVersion: CONTRACT_VERSIONS.restaurantResolution,
        candidateId,
        googlePlaceId,
        displayName: "Proof Integrity Restaurant",
        fullAddress: "1 Integrity Street, New York, NY",
        shortAddress: "1 Integrity Street",
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
      actionRef: "action:proof-integrity",
      recordedAt: "2026-07-21T13:59:00.000Z",
    },
    requiresUserConfirmation: false,
    canContinueMenuOnly: true,
    resolvedAt: "2026-07-21T13:59:00.000Z",
  },
  menuScope: discoveryRequest.menuScope,
  submissionContent: [
    {
      kind: "image_collection",
      contentHandle: "content:proof-integrity-upload",
      sensitivity: "sensitive_transient",
      byteCount: 2_048,
      pageCount: null,
    },
  ],
  requestedAt: "2026-07-21T14:00:00.000Z",
});
const collectedContent: TransientMenuContent = {
  kind: "html",
  contentHandle: "content:proof-integrity-collected",
  sensitivity: "sensitive_transient",
  byteCount: 1_024,
  pageCount: null,
};
const html = new FakeHtmlMenuPageCollector({
  status: "success",
  value: collectedContent,
});
const pdf = new FakePdfMenuCollector({
  status: "success",
  value: { ...collectedContent, kind: "pdf", pageCount: 1 },
});
const orderPage = new FakeOrderPageCollector({
  status: "success",
  value: collectedContent,
});
const identities: TransientContentIdentityPort = {
  identify: (): Promise<TransientContentIdentity> =>
    Promise.resolve({
      sourceRef: "f0000000-0000-4000-8000-000000000001",
      sourceFingerprint: "a".repeat(64),
    }),
};
const orchestrator = new OfficialMenuSourceAcquisitionOrchestrator(
  new OfficialMenuCollectorService(html, pdf, orderPage),
  identities,
  () => "2026-07-21T14:00:09.000Z",
);

const forgedOrchestration = await orchestrator.acquire(
  { request, verifiedSelection: forgedVerifiedSelection },
  context,
);
assert.equal(forgedOrchestration.status, "error");
assert.equal(html.callCount, 0);

const legitimateOrchestration = await orchestrator.acquire(
  { request, verifiedSelection: verifiedSelection.value },
  context,
);
assert.equal(legitimateOrchestration.status, "success");
assert.equal(html.callCount, 1);

for (const forbiddenRegistry of [
  "issuedVerifiedDiscoveries",
  "issuedVerifiedSelections",
]) {
  assert.equal(forbiddenRegistry in publicPackageSurface, false);
}

console.log("Official menu proof integrity validation passed.");
