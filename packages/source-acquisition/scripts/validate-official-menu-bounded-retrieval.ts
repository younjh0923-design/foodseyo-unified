import assert from "node:assert/strict";

import {
  CONTRACT_VERSIONS,
  MODULE_INTERFACE_VERSION,
  MenuSourceAcquisitionRequestSchema,
  type MenuSourceAcquisitionRequest,
  type PortInvocationContext,
  type PortResult,
  type TransientMenuContent,
} from "@foodseyo/contracts";

import {
  BoundedHtmlMenuPageCollector,
  BoundedOrderPageCollector,
  BoundedPdfMenuCollector,
  RequestScopedOfficialMenuContentStore,
  createBoundedOfficialMenuAcquisitionRuntime,
  retrieveBoundedOfficialMenu,
  type OfficialMenuContentStoreInput,
  type OfficialMenuDnsResolver,
  type OfficialMenuHttpTransport,
  type OfficialMenuRetrievalLimits,
  type OfficialMenuRetrievalFailureReason,
  type OfficialMenuRetrievalResult,
  type OfficialMenuTransientContentStore,
  type OfficialMenuTransportRequest,
  type OfficialMenuTransportResponse,
} from "../src/official-menu-bounded-retrieval.js";
import { OfficialMenuCollectorService } from "../src/official-menu-collector.js";
import {
  OfficialMenuCollectorKind,
  verifyOfficialMenuCollectorSelection,
  type OfficialMenuCollectorSelection,
} from "../src/official-menu-collector-selection.js";
import { OfficialMenuSourceAcquisitionOrchestrator } from "../src/official-menu-source-acquisition-orchestrator.js";
import {
  FakeOfficialMenuSourceDiscovery,
  OfficialMenuSourceDiscoveryService,
} from "../src/official-menu-source-discovery.js";
import * as publicPackageSurface from "../src/index.js";

const SAFE_IPV4 = "93.184.216.34";
const LIMITS: OfficialMenuRetrievalLimits = {
  maxRedirects: 3,
  maxResponseBytes: 32,
};
const HTML_BYTES = new TextEncoder().encode("<html>menu</html>");
const PDF_BYTES = new TextEncoder().encode("%PDF-1.7 menu");

const context = (name: string): PortInvocationContext => ({
  contractVersion: MODULE_INTERFACE_VERSION,
  correlationId: `bounded_official_${name}`,
  timeoutMs: 5_000,
  signal: new AbortController().signal,
});

const selection = (
  locator: string,
  collectorKind: OfficialMenuCollectorKind =
    OfficialMenuCollectorKind.HTML_MENU_PAGE,
): OfficialMenuCollectorSelection => ({
  candidate: {
    sourceId: `source-${collectorKind.toLowerCase()}`,
    kind:
      collectorKind === OfficialMenuCollectorKind.PDF_MENU
        ? "official_pdf"
        : collectorKind === OfficialMenuCollectorKind.ORDER_PAGE
          ? "official_order_page"
          : "official_menu_page",
    locator,
  },
  collectorKind,
});

async function* bodyFrom(...chunks: readonly Uint8Array[]) {
  for (const chunk of chunks) yield chunk.slice();
}

const response = (
  status: number,
  contentType: string | null,
  chunks: readonly Uint8Array[] = [],
  additionalHeaders: Readonly<Record<string, string>> = {},
  onCancel: () => void = () => undefined,
): OfficialMenuTransportResponse => {
  let cancelled = false;
  return {
    status,
    headers: {
      ...(contentType === null ? {} : { "Content-Type": contentType }),
      ...additionalHeaders,
    },
    body: chunks.length === 0 ? null : bodyFrom(...chunks),
    cancel: () => {
      if (!cancelled) {
        cancelled = true;
        onCancel();
      }
      return Promise.resolve();
    },
  };
};

class FixtureDnsResolver implements OfficialMenuDnsResolver {
  readonly calls: string[] = [];

  constructor(
    private readonly answers: Readonly<
      Record<string, readonly string[] | Error | Promise<readonly string[]>>
    >,
  ) {}

  resolve(hostname: string): Promise<readonly string[]> {
    this.calls.push(hostname);
    const answer = this.answers[hostname];
    if (answer instanceof Error) return Promise.reject(answer);
    if (answer instanceof Promise) return answer;
    return Promise.resolve(answer ?? [SAFE_IPV4]);
  }
}

class FixtureTransport implements OfficialMenuHttpTransport {
  readonly requests: OfficialMenuTransportRequest[] = [];

  constructor(
    private readonly handler: (
      request: OfficialMenuTransportRequest,
    ) => OfficialMenuTransportResponse | Promise<OfficialMenuTransportResponse>,
  ) {}

  request(
    requestValue: OfficialMenuTransportRequest,
  ): Promise<OfficialMenuTransportResponse> {
    this.requests.push({
      ...requestValue,
      approvedAddresses: [...requestValue.approvedAddresses],
    });
    return Promise.resolve(this.handler(requestValue));
  }
}

class RecordingStore implements OfficialMenuTransientContentStore {
  #lastInput: OfficialMenuContentStoreInput | null = null;

  constructor(
    private readonly delegate: OfficialMenuTransientContentStore,
  ) {}

  get lastInput(): OfficialMenuContentStoreInput | null {
    return this.#lastInput === null
      ? null
      : {
          ...this.#lastInput,
          selection: {
            candidate: { ...this.#lastInput.selection.candidate },
            collectorKind: this.#lastInput.selection.collectorKind,
          },
          bytes: this.#lastInput.bytes.slice(),
          redirectUrls: [...this.#lastInput.redirectUrls],
        };
  }

  store(
    input: OfficialMenuContentStoreInput,
    invocationContext: PortInvocationContext,
  ): Promise<PortResult<TransientMenuContent>> {
    this.#lastInput = {
      ...input,
      selection: {
        candidate: { ...input.selection.candidate },
        collectorKind: input.selection.collectorKind,
      },
      bytes: input.bytes.slice(),
      redirectUrls: [...input.redirectUrls],
    };
    return this.delegate.store(input, invocationContext);
  }

  identify(
    content: TransientMenuContent,
    invocationContext: PortInvocationContext,
  ) {
    return this.delegate.identify(content, invocationContext);
  }

  read(
    content: TransientMenuContent,
    invocationContext: PortInvocationContext,
  ) {
    return this.delegate.read(content, invocationContext);
  }

  releaseScope(invocationContext: PortInvocationContext): void {
    this.delegate.releaseScope(invocationContext);
  }
}

const normalScheduler = {
  scheduleTimeout: (callback: () => void, timeoutMs: number) =>
    setTimeout(callback, timeoutMs),
  clearScheduledTimeout: (handle: ReturnType<typeof setTimeout>) =>
    clearTimeout(handle),
};

const immediateTimeoutScheduler = {
  scheduleTimeout: (callback: () => void) => {
    callback();
    return setTimeout(() => undefined, 60_000);
  },
  clearScheduledTimeout: (handle: ReturnType<typeof setTimeout>) =>
    clearTimeout(handle),
};

const deferredTimeoutScheduler = {
  scheduleTimeout: (callback: () => void) => setTimeout(callback, 0),
  clearScheduledTimeout: (handle: ReturnType<typeof setTimeout>) =>
    clearTimeout(handle),
};

const retrieve = (
  name: string,
  selected: OfficialMenuCollectorSelection,
  dnsResolver: OfficialMenuDnsResolver,
  transport: OfficialMenuHttpTransport,
  limits: OfficialMenuRetrievalLimits = LIMITS,
  scheduler = normalScheduler,
): Promise<OfficialMenuRetrievalResult> =>
  retrieveBoundedOfficialMenu(
    selected,
    limits,
    { dnsResolver, transport, ...scheduler },
    context(name),
  );

const assertFailure = (
  result: OfficialMenuRetrievalResult,
  expectedReason: OfficialMenuRetrievalFailureReason,
): void => {
  assert.equal(result.status, "failure");
  if (result.status !== "failure") throw new Error("failure expected");
  assert.equal(result.reason, expectedReason);
};

// 1. Valid HTML is normalized and streamed through the shared boundary.
{
  let cancelCount = 0;
  const dns = new FixtureDnsResolver({ "menu.fixture.example": [SAFE_IPV4] });
  const transport = new FixtureTransport(() =>
    response(200, "Text/HTML; charset=utf-8", [HTML_BYTES], {
      "Content-Length": String(HTML_BYTES.byteLength),
    }, () => {
      cancelCount += 1;
    }),
  );
  const result = await retrieve(
    "valid_html",
    selection("HTTPS://Menu.Fixture.Example:443/a/../menu#section"),
    dns,
    transport,
  );
  assert.equal(result.status, "success");
  if (result.status !== "success") throw new Error("HTML retrieval failed");
  assert.equal(result.value.contentKind, "html");
  assert.equal(result.value.mimeType, "text/html");
  assert.equal(
    result.value.normalizedSourceUrl,
    "https://menu.fixture.example/menu",
  );
  assert.deepEqual(result.value.bytes, HTML_BYTES);
  assert.deepEqual(transport.requests[0]?.approvedAddresses, [SAFE_IPV4]);
  assert.equal(transport.requests[0]?.redirect, "manual");
  assert.equal(cancelCount, 0);
}

// 2. Valid PDF requires both an approved MIME and PDF signature.
{
  const result = await retrieve(
    "valid_pdf",
    selection(
      "https://menu.fixture.example/menu.pdf",
      OfficialMenuCollectorKind.PDF_MENU,
    ),
    new FixtureDnsResolver({}),
    new FixtureTransport(() =>
      response(200, "application/pdf", [PDF_BYTES]),
    ),
  );
  assert.equal(result.status, "success");
  if (result.status !== "success") throw new Error("PDF retrieval failed");
  assert.equal(result.value.contentKind, "pdf");
}

// 3. Relative redirects are resolved, revalidated, and retained as evidence.
{
  let cancelCount = 0;
  const dns = new FixtureDnsResolver({});
  const transport = new FixtureTransport((request) =>
    request.url.endsWith("/start")
      ? response(302, null, [], { Location: "/menus/dinner" }, () => {
          cancelCount += 1;
        })
      : response(200, "text/html", [HTML_BYTES], {}, () => {
          cancelCount += 1;
        }),
  );
  const result = await retrieve(
    "relative_redirect",
    selection("https://menu.fixture.example/start"),
    dns,
    transport,
  );
  assert.equal(result.status, "success");
  if (result.status !== "success") throw new Error("redirect failed");
  assert.equal(result.value.finalUrl, "https://menu.fixture.example/menus/dinner");
  assert.deepEqual(result.value.redirectUrls, [result.value.finalUrl]);
  assert.equal(dns.calls.length, 2);
  assert.equal(transport.requests.length, 2);
  assert.equal(cancelCount, 1);
}

// 4-12. URL and every resolved address must be publicly routable.
for (const [name, locator, answers, reason] of [
  ["malformed", "not a URL", {}, "malformed_url"],
  ["scheme", "http://menu.fixture.example/menu", {}, "unsupported_scheme"],
  [
    "credentials",
    "https://user:secret@menu.fixture.example/menu",
    {},
    "embedded_credentials",
  ],
  ["localhost", "https://localhost/menu", {}, "unsafe_destination"],
  ["private_ipv4", "https://127.0.0.1/menu", {}, "unsafe_ip"],
  ["blocked_ipv6", "https://[fd00::1]/menu", {}, "unsafe_ip"],
  ["deprecated_orchid", "https://[2001:10::1]/menu", {}, "unsafe_ip"],
  ["orchid_v2", "https://[2001:20::1]/menu", {}, "unsafe_ip"],
  ["documentation_ipv6", "https://[2001:db8::1]/menu", {}, "unsafe_ip"],
  ["link_local_ipv6", "https://[fe80::1]/menu", {}, "unsafe_ip"],
  [
    "mapped_ipv6",
    "https://[::ffff:127.0.0.1]/menu",
    {},
    "unsafe_ip",
  ],
  [
    "resolved_private",
    "https://menu.fixture.example/menu",
    { "menu.fixture.example": ["10.0.0.7"] },
    "unsafe_ip",
  ],
  [
    "mixed_addresses",
    "https://menu.fixture.example/menu",
    { "menu.fixture.example": [SAFE_IPV4, "169.254.169.254"] },
    "unsafe_ip",
  ],
  [
    "mixed_special_ipv6",
    "https://menu.fixture.example/menu",
    { "menu.fixture.example": ["2606:4700:4700::1111", "2001:20::1"] },
    "unsafe_ip",
  ],
] as const) {
  const transport = new FixtureTransport(() =>
    response(200, "text/html", [HTML_BYTES]),
  );
  const result = await retrieve(
    name,
    selection(locator),
    new FixtureDnsResolver(answers),
    transport,
  );
  assertFailure(result, reason);
  assert.equal(transport.requests.length, 0, name);
}

// A normal public IPv6 destination remains eligible.
{
  const transport = new FixtureTransport(() => response(404, null));
  const result = await retrieve(
    "public_ipv6",
    selection("https://[2606:4700:4700::1111]/menu"),
    new FixtureDnsResolver({}),
    transport,
  );
  assertFailure(result, "source_not_found");
  assert.equal(transport.requests.length, 1);
}

// 13. A safe origin cannot redirect into a different/private destination.
{
  let cancelCount = 0;
  const result = await retrieve(
    "redirect_escape",
    selection("https://menu.fixture.example/start"),
    new FixtureDnsResolver({}),
    new FixtureTransport(() =>
      response(302, null, [], { Location: "https://127.0.0.1/menu" }, () => {
        cancelCount += 1;
      }),
    ),
  );
  assertFailure(result, "redirect_escape");
  assert.equal(cancelCount, 1);
}

for (const [name, origin, target] of [
  [
    "public_suffix_parent_escape",
    "https://restaurant.github.io/menu",
    "https://github.io/menu",
  ],
  [
    "registrable_parent_escape",
    "https://menu.fixture.example/menu",
    "https://fixture.example/menu",
  ],
  [
    "unrelated_host_escape",
    "https://menu.fixture.example/menu",
    "https://unrelated.example/menu",
  ],
] as const) {
  let cancelCount = 0;
  const transport = new FixtureTransport(() =>
    response(302, null, [], { Location: target }, () => {
      cancelCount += 1;
    }),
  );
  const result = await retrieve(
    name,
    selection(origin),
    new FixtureDnsResolver({}),
    transport,
  );
  assertFailure(result, "redirect_escape");
  assert.equal(transport.requests.length, 1, name);
  assert.equal(cancelCount, 1, name);
}

// 14. Redirect loops are distinct from the bounded redirect limit.
{
  const transport = new FixtureTransport((request) =>
    response(302, null, [], {
      Location: request.url.endsWith("/one") ? "/two" : "/one",
    }),
  );
  const result = await retrieve(
    "redirect_loop",
    selection("https://menu.fixture.example/one"),
    new FixtureDnsResolver({}),
    transport,
  );
  assertFailure(result, "redirect_loop");
}

// 15. Redirects beyond the configured limit fail without another request.
{
  const transport = new FixtureTransport((request) => {
    const ordinal = Number(request.url.split("/").at(-1));
    return response(302, null, [], { Location: `/${ordinal + 1}` });
  });
  const result = await retrieve(
    "redirect_limit",
    selection("https://menu.fixture.example/1"),
    new FixtureDnsResolver({}),
    transport,
    { ...LIMITS, maxRedirects: 1 },
  );
  assertFailure(result, "redirect_limit");
  assert.equal(transport.requests.length, 2);
}

// 16. The invocation deadline wins even when an injected resolver never settles.
{
  const never = new Promise<readonly string[]>(() => undefined);
  const result = await retrieve(
    "timeout",
    selection("https://menu.fixture.example/menu"),
    new FixtureDnsResolver({ "menu.fixture.example": never }),
    new FixtureTransport(() =>
      response(200, "text/html", [HTML_BYTES]),
    ),
    LIMITS,
    immediateTimeoutScheduler,
  );
  assertFailure(result, "timeout");
}

// A timeout after response headers cancels the active body.
{
  let cancelCount = 0;
  const never = new Promise<IteratorResult<Uint8Array>>(() => undefined);
  const result = await retrieve(
    "body_timeout",
    selection("https://menu.fixture.example/menu"),
    new FixtureDnsResolver({}),
    new FixtureTransport(() => ({
      status: 200,
      headers: { "Content-Type": "text/html" },
      body: {
        [Symbol.asyncIterator]: () => ({ next: () => never }),
      },
      cancel: () => {
        cancelCount += 1;
        return Promise.resolve();
      },
    })),
    LIMITS,
    deferredTimeoutScheduler,
  );
  assertFailure(result, "timeout");
  assert.equal(cancelCount, 1);
}

// 17-18. Streaming limits apply even with a small or absent Content-Length.
for (const [name, headers] of [
  ["stream_limit_misleading_length", { "Content-Length": "2" }],
  ["stream_limit_without_length", {}],
] as const) {
  let cancelCount = 0;
  const result = await retrieve(
    name,
    selection("https://menu.fixture.example/menu"),
    new FixtureDnsResolver({}),
    new FixtureTransport(() =>
      response(
        200,
        "text/html",
        [new Uint8Array(24), new Uint8Array(16)],
        headers,
        () => {
          cancelCount += 1;
        },
      ),
    ),
  );
  assertFailure(result, "oversized_response");
  assert.equal(cancelCount, 1, name);
}

// An oversized declared length is rejected and its body is cancelled.
{
  let cancelCount = 0;
  const result = await retrieve(
    "declared_length_limit",
    selection("https://menu.fixture.example/menu"),
    new FixtureDnsResolver({}),
    new FixtureTransport(() =>
      response(
        200,
        "text/html",
        [HTML_BYTES],
        { "Content-Length": "33" },
        () => {
          cancelCount += 1;
        },
      ),
    ),
  );
  assertFailure(result, "oversized_response");
  assert.equal(cancelCount, 1);
}

// 19. MIME is authoritative; file extension alone never selects a collector.
{
  let cancelCount = 0;
  const result = await retrieve(
    "unsupported_mime",
    selection("https://menu.fixture.example/menu.pdf"),
    new FixtureDnsResolver({}),
    new FixtureTransport(() =>
      response(200, "image/png", [new Uint8Array([1, 2, 3])], {}, () => {
        cancelCount += 1;
      }),
    ),
  );
  assertFailure(result, "unsupported_mime");
  assert.equal(cancelCount, 1);
}

// Invalid response metadata is rejected after cancelling the active response.
{
  let cancelCount = 0;
  const result = await retrieve(
    "invalid_status",
    selection("https://menu.fixture.example/menu"),
    new FixtureDnsResolver({}),
    new FixtureTransport(() =>
      response(99, "text/html", [HTML_BYTES], {}, () => {
        cancelCount += 1;
      }),
    ),
  );
  assertFailure(result, "invalid_response");
  assert.equal(cancelCount, 1);
}

for (const [name, status, reason] of [
  ["unsupported_status", 403, "invalid_response"],
  ["gone_source", 410, "source_not_found"],
] as const) {
  let cancelCount = 0;
  const result = await retrieve(
    name,
    selection("https://menu.fixture.example/menu"),
    new FixtureDnsResolver({}),
    new FixtureTransport(() =>
      response(status, "text/html", [HTML_BYTES], {}, () => {
        cancelCount += 1;
      }),
    ),
  );
  assertFailure(result, reason);
  assert.equal(cancelCount, 1, name);
}

// A declared PDF without a PDF signature is an invalid upstream response.
{
  const result = await retrieve(
    "invalid_pdf",
    selection(
      "https://menu.fixture.example/menu.pdf",
      OfficialMenuCollectorKind.PDF_MENU,
    ),
    new FixtureDnsResolver({}),
    new FixtureTransport(() =>
      response(200, "application/pdf", [HTML_BYTES]),
    ),
  );
  assertFailure(result, "invalid_response");
}

// 20. Missing official sources remain a typed non-error outcome at the collector.
{
  const store = new RequestScopedOfficialMenuContentStore();
  let cancelCount = 0;
  const collector = new BoundedHtmlMenuPageCollector({
    dnsResolver: new FixtureDnsResolver({}),
    transport: new FixtureTransport(() =>
      response(404, "text/html", [], {}, () => {
        cancelCount += 1;
      }),
    ),
    contentStore: store,
    limits: LIMITS,
    ...normalScheduler,
  });
  const result = await collector.collect(
    selection("https://menu.fixture.example/missing"),
    context("not_found"),
  );
  assert.equal(result.status, "outcome");
  if (result.status !== "outcome") throw new Error("outcome expected");
  assert.equal(result.outcome.code, "MENU_SOURCE_NOT_FOUND");
  assert.equal(cancelCount, 1);
}

// 21. Transport and DNS failures remain retryable typed failures.
for (const [name, dns, transport] of [
  [
    "dns_failure",
    new FixtureDnsResolver({
      "menu.fixture.example": new Error("fixture DNS failure"),
    }),
    new FixtureTransport(() => response(200, "text/html", [HTML_BYTES])),
  ],
  [
    "transport_failure",
    new FixtureDnsResolver({}),
    new FixtureTransport(() => Promise.reject(new Error("fixture transport"))),
  ],
] as const) {
  const result = await retrieve(
    name,
    selection("https://menu.fixture.example/menu"),
    dns,
    transport,
  );
  assertFailure(result, name);
}

// Public error mapping preserves the frozen envelope without adding codes.
for (const [name, locator, expectedCode, fixtureResponse, limits, scheduler] of [
  [
    "unsafe",
    "https://127.0.0.1/menu",
    "UNSAFE_SOURCE",
    response(200, "text/html", [HTML_BYTES]),
    LIMITS,
    normalScheduler,
  ],
  [
    "oversized",
    "https://menu.fixture.example/menu",
    "PAYLOAD_TOO_LARGE",
    response(200, "text/html", [new Uint8Array(33)]),
    LIMITS,
    normalScheduler,
  ],
  [
    "mime",
    "https://menu.fixture.example/menu",
    "INVALID_UPSTREAM_RESULT",
    response(200, "image/png", [new Uint8Array([1])]),
    LIMITS,
    normalScheduler,
  ],
] as const) {
  const collector = new BoundedHtmlMenuPageCollector({
    dnsResolver: new FixtureDnsResolver({}),
    transport: new FixtureTransport(() => fixtureResponse),
    contentStore: new RequestScopedOfficialMenuContentStore(),
    limits,
    ...scheduler,
  });
  const result = await collector.collect(selection(locator), context(name));
  assert.equal(result.status, "error", name);
  if (result.status !== "error") throw new Error(`${name} error expected`);
  assert.equal(result.error.error.code, expectedCode, name);
  assert.equal(JSON.stringify(result).includes(locator), false, name);
}

for (const [name, dnsResolver, transport, scheduler, expectedCode] of [
  [
    "public_dns_failure",
    new FixtureDnsResolver({
      "menu.fixture.example": new Error("fixture DNS failure"),
    }),
    new FixtureTransport(() => response(200, "text/html", [HTML_BYTES])),
    normalScheduler,
    "UPSTREAM_UNAVAILABLE",
  ],
  [
    "public_transport_failure",
    new FixtureDnsResolver({}),
    new FixtureTransport(() => Promise.reject(new Error("fixture transport"))),
    normalScheduler,
    "UPSTREAM_UNAVAILABLE",
  ],
  [
    "public_timeout",
    new FixtureDnsResolver({
      "menu.fixture.example": new Promise<readonly string[]>(() => undefined),
    }),
    new FixtureTransport(() => response(200, "text/html", [HTML_BYTES])),
    immediateTimeoutScheduler,
    "UPSTREAM_TIMEOUT",
  ],
  [
    "public_redirect_loop",
    new FixtureDnsResolver({}),
    new FixtureTransport((request) =>
      response(302, null, [], {
        Location: request.url.endsWith("/one") ? "/two" : "/one",
      }),
    ),
    normalScheduler,
    "INVALID_UPSTREAM_RESULT",
  ],
] as const) {
  const collector = new BoundedHtmlMenuPageCollector({
    dnsResolver,
    transport,
    contentStore: new RequestScopedOfficialMenuContentStore(),
    limits: LIMITS,
    ...scheduler,
  });
  const locator = name.endsWith("redirect_loop")
    ? "https://menu.fixture.example/one"
    : "https://menu.fixture.example/menu";
  const result = await collector.collect(selection(locator), context(name));
  assert.equal(result.status, "error", name);
  if (result.status !== "error") throw new Error(`${name} error expected`);
  assert.equal(result.error.error.code, expectedCode, name);
  assert.equal(JSON.stringify(result).includes("fixture.example"), false, name);
}

// 22. Full collector/orchestrator integration preserves branch and URL provenance.
{
  const ids = [
    "a1000000-0000-4000-8000-000000000001",
    "a2000000-0000-4000-8000-000000000001",
  ];
  const contentStore = new RecordingStore(
    new RequestScopedOfficialMenuContentStore(() => {
      const value = ids.shift();
      if (value === undefined) throw new Error("fixture ID exhausted");
      return value;
    }),
  );
  const dns = new FixtureDnsResolver({});
  const transport = new FixtureTransport((request) =>
    request.url.endsWith("/start")
      ? response(302, null, [], { Location: "/menu" })
      : response(200, "text/html; charset=utf-8", [HTML_BYTES]),
  );
  const dependencies = {
    dnsResolver: dns,
    transport,
    contentStore,
    limits: LIMITS,
    ...normalScheduler,
  };
  const collectorService = new OfficialMenuCollectorService(
    new BoundedHtmlMenuPageCollector(dependencies),
    new BoundedPdfMenuCollector(dependencies),
    new BoundedOrderPageCollector(dependencies),
  );
  const candidateId = "a3000000-0000-4000-8000-000000000001";
  const restaurantId = "a4000000-0000-4000-8000-000000000001";
  const googlePlaceId = "official_menu_bounded_branch";
  const request: MenuSourceAcquisitionRequest =
    MenuSourceAcquisitionRequestSchema.parse({
      restaurantResolution: {
        contractVersion: CONTRACT_VERSIONS.restaurantResolution,
        state: "user_confirmed",
        candidates: [
          {
            contractVersion: CONTRACT_VERSIONS.restaurantResolution,
            candidateId,
            googlePlaceId,
            displayName: "Bounded Fixture Restaurant",
            fullAddress: "1 Fixture Street",
            shortAddress: "1 Fixture Street",
            location: { latitude: 40.7, longitude: -74 },
            matchSignals: ["name", "address"],
            rank: 1,
          },
        ],
        selectedCandidateId: candidateId,
        restaurantId,
        confirmationEvidence: {
          kind: "user_action",
          actionRef: "action:bounded-official-menu",
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
          contentHandle: "content:original-submission",
          sensitivity: "sensitive_transient",
          byteCount: 1,
          pageCount: null,
        },
      ],
      requestedAt: "2026-07-21T16:00:00.000Z",
    });
  const selected = selection("https://menu.fixture.example/start");
  const integrationContext = context("integration");
  const discovery = await new OfficialMenuSourceDiscoveryService(
    new FakeOfficialMenuSourceDiscovery({
      status: "success",
      value: [selected.candidate],
    }),
  ).discoverVerified(
    { googlePlaceId, restaurantId, menuScope: request.menuScope },
    integrationContext,
  );
  assert.equal(discovery.status, "success");
  if (discovery.status !== "success") throw new Error("discovery failed");
  const verified = verifyOfficialMenuCollectorSelection(
    discovery.value,
    selected,
    integrationContext,
  );
  assert.equal(verified.status, "success");
  if (verified.status !== "success") throw new Error("proof failed");
  const inputSnapshot = structuredClone({
    request,
    verifiedSelection: verified.value,
  });
  const result = await new OfficialMenuSourceAcquisitionOrchestrator(
    collectorService,
    contentStore,
    () => "2026-07-21T16:00:02.000Z",
  ).acquire(
    { request, verifiedSelection: verified.value },
    integrationContext,
  );
  assert.equal(result.status, "success");
  if (result.status !== "success") throw new Error("integration failed");
  assert.deepEqual(result.value.restaurantContext, {
    restaurantId,
    candidateId,
    googlePlaceId,
    resolutionState: "user_confirmed",
  });
  assert.equal(result.value.source.sourceType, "official_website");
  assert.equal(result.value.source.collectedAt, "2026-07-21T16:00:02.000Z");
  assert.equal(result.value.requestedAt, request.requestedAt);
  assert.equal(result.value.content.kind, "html");
  const firstRead = await contentStore.read(
    result.value.content,
    integrationContext,
  );
  assert.deepEqual(firstRead, HTML_BYTES);
  firstRead?.fill(0);
  assert.deepEqual(
    await contentStore.read(result.value.content, integrationContext),
    HTML_BYTES,
  );
  assert.equal(
    await contentStore.read(result.value.content, context("different-scope")),
    null,
  );
  assert.equal(
    contentStore.lastInput?.normalizedSourceUrl,
    "https://menu.fixture.example/start",
  );
  assert.equal(
    contentStore.lastInput?.finalUrl,
    "https://menu.fixture.example/menu",
  );
  assert.deepEqual(contentStore.lastInput?.redirectUrls, [
    "https://menu.fixture.example/menu",
  ]);
  assert.notEqual(result.value.source.sourceRef, selected.candidate.sourceId);
  assert.equal(JSON.stringify(result.value).includes("fixture.example"), false);
  assert.deepEqual(
    { request, verifiedSelection: verified.value },
    inputSnapshot,
  );
  assert.equal(transport.requests.length, 2);

  const publicRuntime = createBoundedOfficialMenuAcquisitionRuntime({
    dnsResolver: new FixtureDnsResolver({}),
    transport: new FixtureTransport((transportRequest) =>
      transportRequest.url.endsWith("/start")
        ? response(302, null, [], { Location: "/menu" })
        : response(200, "text/html", [HTML_BYTES]),
    ),
    limits: LIMITS,
    ...normalScheduler,
    collectionClock: () => "2026-07-21T16:00:02.000Z",
  });
  assert.deepEqual(Object.keys(publicRuntime).sort(), [
    "orchestrator",
    "releaseScope",
  ]);
  const publicResult = await publicRuntime.orchestrator.acquire(
    { request, verifiedSelection: verified.value },
    integrationContext,
  );
  assert.equal(publicResult.status, "success");
  publicRuntime.releaseScope(integrationContext);
}

// Request-scoped raw records cannot cross scopes and clean up independently.
{
  const generatedIds = [
    "a1000000-0000-4000-8000-000000000001",
    "a1000000-0000-4000-8000-000000000002",
    "b1000000-0000-4000-8000-000000000001",
    "b1000000-0000-4000-8000-000000000002",
  ];
  const store = new RequestScopedOfficialMenuContentStore(() => {
    const generated = generatedIds.shift();
    if (generated === undefined) throw new Error("fixture ID exhausted");
    return generated;
  });
  const scopeA = context("scope_a");
  const scopeB = context("scope_b");
  const storeFor = (
    selected: OfficialMenuCollectorSelection,
    bytes: Uint8Array,
    invocationContext: PortInvocationContext,
  ) =>
    store.store(
      {
        selection: selected,
        contentKind: "html",
        bytes,
        normalizedSourceUrl: selected.candidate.locator,
        finalUrl: selected.candidate.locator,
        redirectUrls: [],
        mimeType: "text/html",
      },
      invocationContext,
    );
  const storedA = await storeFor(
    selection("https://menu.fixture.example/a"),
    new Uint8Array([1, 2, 3]),
    scopeA,
  );
  const storedB = await storeFor(
    selection("https://menu.fixture.example/b"),
    new Uint8Array([4, 5, 6]),
    scopeB,
  );
  assert.equal(storedA.status, "success");
  assert.equal(storedB.status, "success");
  if (storedA.status !== "success" || storedB.status !== "success") {
    throw new Error("scope fixture store failed");
  }
  assert.deepEqual(
    Array.from((await store.read(storedA.value, scopeA)) ?? []),
    [1, 2, 3],
  );
  assert.equal(await store.read(storedA.value, scopeB), null);
  assert.equal(await store.identify(storedA.value, scopeB), null);
  assert.equal(
    await store.read(
      { ...storedA.value, contentHandle: "official:unknown-handle" },
      scopeA,
    ),
    null,
  );
  store.releaseScope(scopeA);
  assert.equal(await store.read(storedA.value, scopeA), null);
  assert.deepEqual(
    Array.from((await store.read(storedB.value, scopeB)) ?? []),
    [4, 5, 6],
  );
  store.releaseScope(scopeB);
  assert.equal(await store.read(storedB.value, scopeB), null);
}

for (const forbiddenPublicExport of [
  "RequestScopedOfficialMenuContentStore",
  "BoundedHtmlMenuPageCollector",
  "BoundedPdfMenuCollector",
  "BoundedOrderPageCollector",
]) {
  assert.equal(forbiddenPublicExport in publicPackageSurface, false);
}

console.log("Bounded official menu retrieval validation passed.");
