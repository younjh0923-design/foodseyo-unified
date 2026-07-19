import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  BOUNDARY_DTO_SCHEMAS,
  MODULE_INTERFACE_VERSION,
  MenuSourceInputSchema,
  type MenuSourceAcquisitionRequest,
  type MenuSourceType,
  type PortInvocationContext,
  type RestaurantResolution,
  type TransientMenuContent,
} from "../packages/contracts/src/index.js";
import {
  FoundationMenuSourceAcquisitionPort,
  OfficialPdfDiscoveryAdapter,
  OfficialWebsiteDiscoveryAdapter,
  OrderingPageDiscoveryAdapter,
  UploadedMenuSourceAdapter,
  WebSearchDiscoveryAdapter,
  isSafePublicHttpsSourceUrl,
  type MenuSourceDiscoveryPort,
  type TransientContentIdentity,
  type TransientContentIdentityPort,
  type TransientDiscoveredMenuSource,
} from "../packages/source-acquisition/src/index.js";

type JsonRecord = Record<string, unknown>;

interface ExpectedFixture {
  readonly status: "success" | "outcome" | "error";
  readonly sourceType?: MenuSourceType;
  readonly code?: string;
}

interface AcquisitionFixture {
  readonly case: string;
  readonly submissionHandles: readonly string[];
  readonly identities: Readonly<Record<string, TransientContentIdentity>>;
  readonly discoveries: Readonly<
    Partial<Record<Exclude<MenuSourceType, "uploaded_menu">, readonly TransientDiscoveredMenuSource[]>>
  >;
  readonly rejectedDiscoveries?: readonly Exclude<MenuSourceType, "uploaded_menu">[];
  readonly timedOut?: boolean;
  readonly expected: ExpectedFixture;
}

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const boundaryFixtures = JSON.parse(
  await readFile("packages/contracts/fixtures/boundary-dtos.valid.json", "utf8"),
) as unknown;
const acquisitionFixtures = JSON.parse(
  await readFile(
    "packages/source-acquisition/fixtures/acquisition-foundation.json",
    "utf8",
  ),
) as unknown;

assert(isRecord(boundaryFixtures));
assert(isRecord(acquisitionFixtures));
assert(Array.isArray(acquisitionFixtures.cases));

const restaurantResult = BOUNDARY_DTO_SCHEMAS.RestaurantResolution.safeParse(
  boundaryFixtures.restaurantResolution,
);
assert.equal(restaurantResult.success, true);
const restaurantResolution = restaurantResult.data as RestaurantResolution;

class FixtureIdentityPort implements TransientContentIdentityPort {
  callCount = 0;

  constructor(
    private readonly identities: Readonly<Record<string, TransientContentIdentity>>,
  ) {}

  identify(
    content: TransientMenuContent,
    _context: PortInvocationContext,
  ): Promise<TransientContentIdentity | null> {
    this.callCount += 1;
    return Promise.resolve(this.identities[content.contentHandle] ?? null);
  }
}

class FixtureDiscoveryPort implements MenuSourceDiscoveryPort {
  callCount = 0;

  constructor(
    private readonly discoveries: readonly TransientDiscoveredMenuSource[],
    private readonly rejects: boolean,
  ) {}

  discover(): Promise<readonly TransientDiscoveredMenuSource[]> {
    this.callCount += 1;
    if (this.rejects) {
      return Promise.reject(new Error("deterministic discovery failure"));
    }
    return Promise.resolve(this.discoveries);
  }
}

const makeContent = (contentHandle: string): TransientMenuContent => ({
  kind: "image_collection",
  contentHandle,
  sensitivity: "sensitive_transient",
  byteCount: 1024,
  pageCount: null,
});

const makeContext = (
  fixtureName: string,
  timedOut: boolean,
): PortInvocationContext => {
  const controller = new AbortController();
  if (timedOut) {
    controller.abort(new DOMException("deadline exceeded", "TimeoutError"));
  }
  return {
    contractVersion: MODULE_INTERFACE_VERSION,
    correlationId: `u2_2_${fixtureName}`,
    timeoutMs: 5000,
    signal: controller.signal,
  };
};

const sourceTypes = [
  "official_website",
  "official_pdf",
  "ordering_page",
  "web_search_discovery",
] as const;

for (const rawFixture of acquisitionFixtures.cases) {
  assert(isRecord(rawFixture));
  const fixture = rawFixture as unknown as AcquisitionFixture;
  const identityPort = new FixtureIdentityPort(fixture.identities);
  const discoveryPorts = Object.fromEntries(
    sourceTypes.map((sourceType) => [
      sourceType,
      new FixtureDiscoveryPort(
        fixture.discoveries[sourceType] ?? [],
        fixture.rejectedDiscoveries?.includes(sourceType) === true,
      ),
    ]),
  ) as Record<(typeof sourceTypes)[number], FixtureDiscoveryPort>;
  const acquisition = new FoundationMenuSourceAcquisitionPort({
    uploaded: new UploadedMenuSourceAdapter(identityPort),
    official: [
      new OfficialWebsiteDiscoveryAdapter(discoveryPorts.official_website),
      new OfficialPdfDiscoveryAdapter(discoveryPorts.official_pdf),
      new OrderingPageDiscoveryAdapter(discoveryPorts.ordering_page),
    ],
    webSearch: new WebSearchDiscoveryAdapter(
      discoveryPorts.web_search_discovery,
    ),
  });
  const request: MenuSourceAcquisitionRequest = {
    restaurantResolution,
    menuScope: "dinner",
    submissionContent: fixture.submissionHandles.map(makeContent),
    requestedAt: "2026-07-19T12:00:00.000Z",
  };

  const result = await acquisition.acquire(
    request,
    makeContext(fixture.case, fixture.timedOut === true),
  );
  assert.equal(
    result.status,
    fixture.expected.status,
    `${fixture.case}: ${JSON.stringify(result)}`,
  );
  if (result.status === "success") {
    assert.equal(result.value.source.sourceType, fixture.expected.sourceType);
    MenuSourceInputSchema.parse(result.value);
  } else if (result.status === "outcome") {
    assert.equal(result.outcome.code, fixture.expected.code, fixture.case);
  } else {
    assert.equal(result.error.error.code, fixture.expected.code, fixture.case);
  }
  assert.equal(acquisition.callCount, 1, fixture.case);

  const serializedResult = JSON.stringify(result);
  for (const sources of Object.values(fixture.discoveries)) {
    for (const source of sources ?? []) {
      assert.equal(serializedResult.includes(source.rawUrl), false, fixture.case);
    }
  }

  if (fixture.timedOut === true) {
    assert.equal(identityPort.callCount, 0, fixture.case);
    assert.equal(
      Object.values(discoveryPorts).every((port) => port.callCount === 0),
      true,
      fixture.case,
    );
  }
  if (fixture.case === "supported_upload") {
    assert.equal(
      Object.values(discoveryPorts).every((port) => port.callCount === 0),
      true,
      "a supported upload must short-circuit interface-only discovery",
    );
  }
  if (fixture.case === "supported_web_search_fallback") {
    assert.equal(discoveryPorts.official_website.callCount, 1);
    assert.equal(discoveryPorts.official_pdf.callCount, 1);
    assert.equal(discoveryPorts.ordering_page.callCount, 1);
    assert.equal(discoveryPorts.web_search_discovery.callCount, 1);
  }
}

assert.equal(isSafePublicHttpsSourceUrl("https://menu.fixture.example/menu"), true);
assert.equal(isSafePublicHttpsSourceUrl("http://menu.fixture.example/menu"), false);
assert.equal(isSafePublicHttpsSourceUrl("https://user:pass@menu.fixture.example/menu"), false);
assert.equal(isSafePublicHttpsSourceUrl("https://127.0.0.1/menu"), false);
assert.equal(isSafePublicHttpsSourceUrl("https://restaurant.local/menu"), false);

console.log("Source acquisition foundation fixtures passed.");
