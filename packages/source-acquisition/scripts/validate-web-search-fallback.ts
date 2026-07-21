import assert from "node:assert/strict";

import {
  CONTRACT_VERSIONS,
  MODULE_INTERFACE_VERSION,
  MenuSourceAcquisitionRequestSchema,
  MenuSourceInputSchema,
  PublicOutcomeSchema,
  type MenuSourceAcquisitionRequest,
  type MenuSourceAcquisitionPort,
  type MenuSourceInput,
  type PortInvocationContext,
  type PortResult,
} from "@foodseyo/contracts";

import { createBoundedWebSearchFallbackRuntime } from "../src/bounded-web-search-fallback.js";
import { OpenAIWebSearchMenuSourceDiscovery } from "../src/openai-web-search-server.js";
import type {
  OfficialMenuDnsResolver,
  OfficialMenuHttpTransport,
  OfficialMenuTransportRequest,
  OfficialMenuTransportResponse,
} from "../src/official-menu-bounded-retrieval.js";
import {
  WebSearchMenuFallbackService,
  type WebSearchMenuSourceCandidate,
  type WebSearchMenuSourceCollectorPort,
  type WebSearchMenuSourceDiscoveryPort,
} from "../src/web-search-fallback.js";
import * as publicPackageSurface from "../src/index.js";

const candidateId = "13000000-0000-4000-8000-000000000001";
const restaurantId = "13000000-0000-4000-8000-000000000002";
const requestedAt = "2026-07-21T16:00:00.000Z";
const collectedAt = "2026-07-21T16:00:01.000Z";
const context: PortInvocationContext = {
  contractVersion: MODULE_INTERFACE_VERSION,
  correlationId: "s1_3_web_search_fallback",
  timeoutMs: 5_000,
  signal: new AbortController().signal,
};

const request = MenuSourceAcquisitionRequestSchema.parse({
  restaurantResolution: {
    contractVersion: CONTRACT_VERSIONS.restaurantResolution,
    state: "user_confirmed",
    candidates: [
      {
        contractVersion: CONTRACT_VERSIONS.restaurantResolution,
        candidateId,
        googlePlaceId: "google_place_s1_3_confirmed",
        displayName: "Exact Fixture Bistro",
        fullAddress: "10 Main Street, Boston, MA",
        shortAddress: "10 Main Street",
        location: { latitude: 42.36, longitude: -71.06 },
        matchSignals: ["name", "address"],
        rank: 1,
      },
    ],
    selectedCandidateId: candidateId,
    restaurantId,
    confirmationEvidence: {
      kind: "user_action",
      actionRef: "action:s1-3-confirmation",
      recordedAt: "2026-07-21T15:59:00.000Z",
    },
    requiresUserConfirmation: false,
    canContinueMenuOnly: true,
    resolvedAt: "2026-07-21T15:59:00.000Z",
  },
  menuScope: "dinner",
  submissionContent: [
    {
      kind: "image_collection",
      contentHandle: "submission:s1-3-menu-image",
      sensitivity: "sensitive_transient",
      byteCount: 1_024,
      pageCount: null,
    },
  ],
  requestedAt,
});

const noOfficialSource: PortResult<MenuSourceInput> = {
  status: "outcome",
  outcome: PublicOutcomeSchema.parse({
    code: "MENU_SOURCE_NOT_FOUND",
    stage: "source_acquisition",
    correlationId: context.correlationId,
    retryable: true,
    canContinueMenuOnly: true,
  }),
};

const officialSource = MenuSourceInputSchema.parse({
  contractVersion: CONTRACT_VERSIONS.menuSource,
  source: {
    sourceRef: "13000000-0000-4000-8000-000000000003",
    sourceType: "official_website",
    sourceFingerprint: "a".repeat(64),
    collectedAt,
  },
  restaurantContext: {
    restaurantId,
    candidateId,
    googlePlaceId: "google_place_s1_3_confirmed",
    resolutionState: "user_confirmed",
  },
  menuScope: request.menuScope,
  content: {
    kind: "html",
    contentHandle: "official:s1-3-existing",
    sensitivity: "sensitive_transient",
    byteCount: 128,
    pageCount: null,
  },
  requestedAt,
});

class FakeDiscovery implements WebSearchMenuSourceDiscoveryPort {
  callCount = 0;

  constructor(
    private readonly result: PortResult<readonly WebSearchMenuSourceCandidate[]>,
  ) {}

  discover(): Promise<PortResult<readonly WebSearchMenuSourceCandidate[]>> {
    this.callCount += 1;
    return Promise.resolve(this.result);
  }
}

class FakeOfficialAcquisition implements MenuSourceAcquisitionPort {
  callCount = 0;

  constructor(private readonly result: PortResult<MenuSourceInput>) {}

  acquire(): Promise<PortResult<MenuSourceInput>> {
    this.callCount += 1;
    return Promise.resolve(this.result);
  }
}

class FailingCollector implements WebSearchMenuSourceCollectorPort {
  callCount = 0;

  collect(): Promise<{ readonly status: "unusable" }> {
    this.callCount += 1;
    return Promise.resolve({ status: "unusable" });
  }
}

// Official success is preserved and Web Search is never called.
{
  const discovery = new FakeDiscovery({ status: "success", value: [] });
  const collector = new FailingCollector();
  const official = new FakeOfficialAcquisition({
    status: "success",
    value: officialSource,
  });
  const service = new WebSearchMenuFallbackService(
    official,
    discovery,
    collector,
  );
  const result = await service.resolve(request, context);
  assert.equal(result.status, "success");
  if (result.status !== "success") throw new Error("success expected");
  assert.equal(result.value.state, "official_source");
  assert.equal(result.value.provenance, "official");
  assert.equal(discovery.callCount, 0);
  assert.equal(collector.callCount, 0);
  assert.equal(official.callCount, 1);
}

// Responses API source evidence is HTTPS-filtered, deduplicated, ranked, and bounded.
{
  let providerCalls = 0;
  let capturedBody = "";
  const payload = {
    id: "resp_s1_3_fixture",
    output: [
      {
        type: "web_search_call",
        action: {
          type: "search",
          sources: [
            { url: "https://weak.example/menu", title: "Menu" },
            {
              url: "https://exact.example/menus/dinner",
              title: "Exact Fixture Bistro Menu",
            },
            {
              url: "https://exact.example/menus/dinner#duplicate",
              title: "Exact Fixture Bistro Menu duplicate",
            },
            { url: "https://ignored.example/about", title: "About us" },
            { url: "http://unsafe.example/menu", title: "Menu" },
            { url: "https://three.example/menu", title: "Dinner menu" },
            { url: "https://four.example/menu", title: "Dinner menu" },
            { url: "https://five.example/menu", title: "Dinner menu" },
            { url: "https://six.example/menu", title: "Dinner menu" },
            { url: "https://seven.example/menu", title: "Dinner menu" },
          ],
        },
      },
      {
        type: "message",
        content: [{ type: "output_text", text: "Do not use as menu data." }],
      },
    ],
  };
  const discovery = new OpenAIWebSearchMenuSourceDiscovery(
    "test-key-not-a-secret",
    "test-web-search-model",
    {
      fetchImplementation: async (_input, init) => {
        providerCalls += 1;
        capturedBody = String(init?.body ?? "");
        return new Response(JSON.stringify(payload), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  );
  const first = await discovery.discover(request, context);
  const second = await discovery.discover(request, context);
  assert.equal(first.status, "success");
  assert.equal(second.status, "success");
  if (first.status !== "success" || second.status !== "success") {
    throw new Error("search success expected");
  }
  assert.equal(providerCalls, 2);
  assert.equal(first.value.length, 6);
  assert.equal(first.value[0]?.locator, "https://exact.example/menus/dinner");
  assert.equal(
    first.value.filter(
      (candidate) => candidate.locator === "https://exact.example/menus/dinner",
    ).length,
    1,
  );
  assert.deepEqual(first.value, second.value);
  assert.match(capturedBody, /"type":"web_search"/u);
  assert.match(capturedBody, /web_search_call\.action\.sources/u);
  assert.doesNotMatch(capturedBody, /google_place_s1_3_confirmed/u);
  assert.ok(
    first.value.every((candidate) => candidate.locator.startsWith("https://")),
  );
}

// The request deadline wins even when a provider transport ignores abort.
{
  const discovery = new OpenAIWebSearchMenuSourceDiscovery(
    "test-key-not-a-secret",
    "test-web-search-model",
    {
      fetchImplementation: () => new Promise<Response>(() => undefined),
      scheduleTimeout: (callback) => {
        queueMicrotask(callback);
        return setTimeout(() => undefined, 60_000);
      },
      clearScheduledTimeout: (handle) => clearTimeout(handle),
    },
  );
  const result = await discovery.discover(request, context);
  assert.equal(result.status, "error");
  if (result.status !== "error") throw new Error("timeout error expected");
  assert.equal(result.error.error.code, "UPSTREAM_TIMEOUT");
}

async function* htmlBody() {
  yield new TextEncoder().encode("<html><body>menu</body></html>");
}

class FixtureDns implements OfficialMenuDnsResolver {
  readonly calls: string[] = [];

  resolve(hostname: string): Promise<readonly string[]> {
    this.calls.push(hostname);
    return Promise.resolve(
      hostname === "private.example" ? ["127.0.0.1"] : ["93.184.216.34"],
    );
  }
}

class FixtureTransport implements OfficialMenuHttpTransport {
  readonly requests: OfficialMenuTransportRequest[] = [];

  request(
    value: OfficialMenuTransportRequest,
  ): Promise<OfficialMenuTransportResponse> {
    this.requests.push({
      ...value,
      approvedAddresses: [...value.approvedAddresses],
    });
    return Promise.resolve({
      status: 200,
      headers: { "Content-Type": "text/html" },
      body: htmlBody(),
      cancel: () => Promise.resolve(),
    });
  }
}

// Unsafe search results are rejected by the shared S1.2 boundary; the next safe
// result becomes fallback provenance without mixing restaurant evidence.
{
  const providerCandidates = [
    {
      sourceId: "web-search:fixture:1",
      locator: "https://private.example/menu",
      title: "Exact Fixture Bistro menu",
      providerOrdinal: 1,
      rank: 1,
    },
    {
      sourceId: "web-search:fixture:2",
      locator: "https://safe.example/menu",
      title: "Exact Fixture Bistro menu",
      providerOrdinal: 2,
      rank: 2,
    },
  ] as const;
  const dns = new FixtureDns();
  const transport = new FixtureTransport();
  const runtime = createBoundedWebSearchFallbackRuntime({
    officialAcquisition: new FakeOfficialAcquisition(noOfficialSource),
    discovery: new FakeDiscovery({
      status: "success",
      value: providerCandidates,
    }),
    dnsResolver: dns,
    transport,
    limits: { maxRedirects: 2, maxResponseBytes: 1_024 },
    collectionClock: () => collectedAt,
  });
  const before = JSON.stringify(request);
  const first = await runtime.service.resolve(request, context);
  assert.equal(first.status, "success");
  if (first.status !== "success") throw new Error("fallback success expected");
  assert.equal(first.value.state, "fallback_source");
  if (first.value.state !== "fallback_source") {
    throw new Error("fallback source expected");
  }
  assert.equal(first.value.provenance, "fallback");
  assert.equal(first.value.menuSource.source.sourceType, "web_search_discovery");
  assert.equal(
    first.value.menuSource.restaurantContext?.googlePlaceId,
    "google_place_s1_3_confirmed",
  );
  assert.equal(first.value.menuSource.requestedAt, requestedAt);
  assert.equal(first.value.menuSource.source.collectedAt, collectedAt);
  assert.deepEqual(dns.calls, ["private.example", "safe.example"]);
  assert.equal(transport.requests.length, 1);
  assert.equal(
    transport.requests[0]?.url,
    "https://safe.example/menu",
  );
  assert.equal(JSON.stringify(request), before);
  runtime.releaseScope(context);
}

// No search candidates produces an explicit, non-restaurant menu-only state.
{
  const discovery = new FakeDiscovery({ status: "success", value: [] });
  const collector = new FailingCollector();
  const official = new FakeOfficialAcquisition(noOfficialSource);
  const service = new WebSearchMenuFallbackService(
    official,
    discovery,
    collector,
  );
  const first = await service.resolve(request, context);
  const second = await service.resolve(request, context);
  assert.equal(first.status, "success");
  assert.deepEqual(first, second);
  if (first.status !== "success") throw new Error("menu-only expected");
  assert.deepEqual(first.value, {
    state: "menu_only",
    provenance: "submission_only",
    menuSource: null,
    sourceLimitation: "no_usable_official_or_web_source",
    restaurantFactsAllowed: false,
  });
  assert.equal(discovery.callCount, 2);
  assert.equal(collector.callCount, 0);
  assert.equal(official.callCount, 2);
}

assert.equal(
  typeof publicPackageSurface.WebSearchMenuFallbackService,
  "function",
);
assert.equal(
  typeof publicPackageSurface.createBoundedWebSearchFallbackRuntime,
  "function",
);
assert.equal(
  typeof publicPackageSurface.OpenAIWebSearchMenuSourceDiscovery,
  "function",
);
assert.equal("RequestScopedOfficialMenuContentStore" in publicPackageSurface, false);

console.log("S1.3 web search fallback validation passed.");
