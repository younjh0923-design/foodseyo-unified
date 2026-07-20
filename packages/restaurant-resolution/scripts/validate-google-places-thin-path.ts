import assert from "node:assert/strict";

import {
  MODULE_INTERFACE_VERSION,
  SERVER_ENV_NAMES,
  type PortInvocationContext,
} from "@foodseyo/contracts";
import {
  FoundationRestaurantResolutionPort,
  GooglePlacesTextSearchAdapter,
  createGooglePlacesTextSearchAdapterFromEnvironment,
} from "../src/index.js";
import {
  GooglePlacesCandidateFinder,
  normalizeServerRestaurantClues,
  type NormalizedServerRestaurantClues,
  type ServerRestaurantClues,
} from "../src/foundation.js";

const FIXTURE_CONFIGURATION_VALUE = "fixture-value";
const PLACE_ALPHA = "fixture_place_alpha";
const PLACE_BETA = "fixture_place_beta";
const CANDIDATE_IDS = [
  "10000000-0000-4000-8000-000000000001",
  "10000000-0000-4000-8000-000000000002",
] as const;

const cases: string[] = [];
const test = async (name: string, run: () => Promise<void>): Promise<void> => {
  await run();
  cases.push(name);
};

const context = (
  name: string,
  controller = new AbortController(),
): PortInvocationContext => ({
  contractVersion: MODULE_INTERFACE_VERSION,
  correlationId: `s1_1_${name}`,
  timeoutMs: 5_000,
  signal: controller.signal,
});

const clues = (
  overrides: Partial<ServerRestaurantClues> = {},
): ServerRestaurantClues => ({
  name: "Fixture Alpha",
  address: "10 Alpha Street, New York, NY",
  visualText: "Fixture Alpha",
  linkFingerprint: null,
  location: { latitude: 40.743, longitude: -73.949 },
  ...overrides,
});

const normalizedClues = (
  overrides: Partial<ServerRestaurantClues> = {},
): NormalizedServerRestaurantClues => {
  const value = normalizeServerRestaurantClues(clues(overrides));
  assert(value !== null);
  return value;
};

const place = (
  id: string,
  name: string,
  address: string,
): Record<string, unknown> => ({
  id,
  displayName: { text: name, languageCode: "en" },
  formattedAddress: address,
  location: { latitude: 40.743, longitude: -73.949 },
  businessStatus: "OPERATIONAL",
  rating: 4.9,
  reviews: [{ text: "provider-internal fixture" }],
  photos: [{ name: "provider-photo-reference" }],
  priceLevel: "PRICE_LEVEL_EXPENSIVE",
  providerTrace: "provider-internal-trace",
});

const response = (places?: readonly unknown[]): Response =>
  new Response(JSON.stringify(places === undefined ? {} : { places }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

const fakeFetch = (
  implementation: (
    input: RequestInfo | URL,
    init: RequestInit | undefined,
  ) => Promise<Response>,
): typeof fetch => implementation as typeof fetch;

const candidateIdFactory = (
  _placeId: string,
  rank: number,
): string => {
  const candidateId = CANDIDATE_IDS[rank - 1];
  assert(candidateId !== undefined);
  return candidateId;
};

const adapterWith = (
  fetchImplementation: typeof fetch,
  dependencies: Record<string, unknown> = {},
): GooglePlacesTextSearchAdapter =>
  new GooglePlacesTextSearchAdapter(FIXTURE_CONFIGURATION_VALUE, {
    fetchImplementation,
    candidateIdFactory,
    ...dependencies,
  });

const findWithPayload = async (
  providerPlaces: readonly unknown[] | undefined,
  invocation: PortInvocationContext,
  clueInput: ServerRestaurantClues = clues(),
) => {
  const adapter = adapterWith(
    fakeFetch(() => Promise.resolve(response(providerPlaces))),
  );
  return new GooglePlacesCandidateFinder(adapter).findCandidates(
    clueInput,
    invocation,
  );
};

const deferred = <T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
  readonly reject: (reason: unknown) => void;
} => {
  let resolvePromise!: (value: T) => void;
  let rejectPromise!: (reason: unknown) => void;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return { promise, resolve: resolvePromise, reject: rejectPromise };
};

class ManualTimeoutScheduler {
  #callback: (() => void) | null = null;

  readonly scheduleTimeout = (
    callback: () => void,
    _timeoutMs: number,
  ): ReturnType<typeof setTimeout> => {
    this.#callback = callback;
    return 1 as ReturnType<typeof setTimeout>;
  };

  readonly clearScheduledTimeout = (
    _handle: ReturnType<typeof setTimeout>,
  ): void => {};

  expire(): void {
    const callback = this.#callback;
    assert(callback !== null, "provider timeout was not scheduled");
    callback();
  }
}

const runInterruptedProvider = async (
  name: string,
  interruption: "timeout" | "cancellation",
  lateSettlement: "none" | "success" | "rejection",
) => {
  const providerResponse = deferred<Response>();
  let fetchCallCount = 0;
  const controller = new AbortController();
  const scheduler = new ManualTimeoutScheduler();
  const adapter = adapterWith(
    fakeFetch(() => {
      fetchCallCount += 1;
      return providerResponse.promise;
    }),
    interruption === "timeout"
      ? {
          scheduleTimeout: scheduler.scheduleTimeout,
          clearScheduledTimeout: scheduler.clearScheduledTimeout,
        }
      : {},
  );
  const pending = adapter.search(normalizedClues(), context(name, controller));
  assert.equal(fetchCallCount, 1);

  if (interruption === "timeout") {
    scheduler.expire();
  } else {
    controller.abort(new DOMException("cancelled", "AbortError"));
  }

  const result = await pending;
  if (interruption === "timeout") {
    assert.equal(result.status, "error");
    if (result.status === "error") {
      assert.equal(result.error.error.code, "UPSTREAM_TIMEOUT");
    }
  } else {
    assert.equal(result.status, "outcome");
    if (result.status === "outcome") {
      assert.equal(result.outcome.code, "RESTAURANT_NOT_RESOLVED");
      assert.equal(result.outcome.canContinueMenuOnly, true);
    }
  }

  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes(PLACE_ALPHA), false);
  assert.equal(serialized.includes(CANDIDATE_IDS[0]), false);
  assert.equal(serialized.includes("provider-internal-trace"), false);

  if (lateSettlement === "success") {
    providerResponse.resolve(
      response([
        place(
          PLACE_ALPHA,
          "Fixture Alpha",
          "10 Alpha Street, New York, NY",
        ),
      ]),
    );
  } else if (lateSettlement === "rejection") {
    providerResponse.reject(new Error("deterministic late provider rejection"));
  }
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(JSON.stringify(result), serialized);
};

await test("one_candidate", async () => {
  const result = await findWithPayload(
    [place(PLACE_ALPHA, "Fixture Alpha", "10 Alpha Street, New York, NY")],
    context("one-candidate"),
  );
  assert.equal(result.status, "success");
  if (result.status === "success") {
    assert.equal(result.value.length, 1);
    assert.equal(result.value[0]?.googlePlaceId, PLACE_ALPHA);
  }
});

await test("multiple_candidates", async () => {
  const result = await findWithPayload(
    [
      place(PLACE_ALPHA, "Fixture Alpha", "10 Alpha Street, New York, NY"),
      place(PLACE_BETA, "Fixture Alpha", "20 Beta Street, New York, NY"),
    ],
    context("multiple-candidates"),
  );
  assert.equal(result.status, "success");
  if (result.status === "success") {
    assert.deepEqual(
      result.value.map((candidate) => candidate.rank),
      [1, 2],
    );
  }
});

await test("no_candidate", async () => {
  const result = await findWithPayload(undefined, context("no-candidate"));
  assert.equal(result.status, "outcome");
  if (result.status === "outcome") {
    assert.equal(result.outcome.code, "RESTAURANT_NOT_RESOLVED");
    assert.equal(result.outcome.canContinueMenuOnly, true);
  }
});

await test("conflicting_candidate_clues", async () => {
  const candidates = await findWithPayload(
    [
      place(PLACE_ALPHA, "Fixture Alpha", "10 Alpha Street, New York, NY"),
      place(PLACE_BETA, "Fixture Beta", "20 Beta Street, New York, NY"),
    ],
    context("conflicting-find"),
    clues({
      name: "Fixture Alpha",
      address: "20 Beta Street, New York, NY",
    }),
  );
  assert.equal(candidates.status, "success");
  if (candidates.status !== "success") {
    return;
  }
  const resolution = await new FoundationRestaurantResolutionPort().resolve(
    {
      candidates: candidates.value,
      priorResolution: null,
      selectedCandidateId: null,
      confirmationEvidence: null,
    },
    context("conflicting-resolution"),
  );
  assert.equal(resolution.status, "success");
  if (resolution.status === "success") {
    assert.equal(resolution.value.state, "conflicting");
    assert.equal(resolution.value.selectedCandidateId, null);
    assert.equal(resolution.value.requiresUserConfirmation, true);
  }
});

await test("ordinary_provider_failure", async () => {
  const adapter = adapterWith(
    fakeFetch(() => Promise.reject(new Error("deterministic provider failure"))),
  );
  const result = await new GooglePlacesCandidateFinder(adapter).findCandidates(
    clues(),
    context("provider-failure"),
  );
  assert.equal(result.status, "error");
  if (result.status === "error") {
    assert.equal(result.error.error.code, "UPSTREAM_UNAVAILABLE");
    assert.equal(result.error.error.correlationId, "s1_1_provider-failure");
  }
});

await test("provider_timeout_before_response", async () => {
  await runInterruptedProvider("timeout-before-response", "timeout", "none");
});

await test("ordinary_cancellation_before_response", async () => {
  await runInterruptedProvider(
    "cancellation-before-response",
    "cancellation",
    "none",
  );
});

await test("timeout_followed_by_late_success", async () => {
  await runInterruptedProvider("timeout-late-success", "timeout", "success");
});

await test("cancellation_followed_by_late_success", async () => {
  await runInterruptedProvider(
    "cancellation-late-success",
    "cancellation",
    "success",
  );
});

await test("timeout_followed_by_rejection", async () => {
  await runInterruptedProvider("timeout-late-rejection", "timeout", "rejection");
});

await test("cancellation_followed_by_rejection", async () => {
  await runInterruptedProvider(
    "cancellation-late-rejection",
    "cancellation",
    "rejection",
  );
});

await test("rank_one_candidate_remains_unconfirmed", async () => {
  const candidates = await findWithPayload(
    [place(PLACE_ALPHA, "Fixture Alpha", "10 Alpha Street, New York, NY")],
    context("rank-one-find"),
  );
  assert.equal(candidates.status, "success");
  if (candidates.status !== "success") {
    return;
  }
  const result = await new FoundationRestaurantResolutionPort().resolve(
    {
      candidates: candidates.value,
      priorResolution: null,
      selectedCandidateId: null,
      confirmationEvidence: null,
    },
    context("rank-one-resolution"),
  );
  assert.equal(result.status, "success");
  if (result.status === "success") {
    assert.equal(result.value.state, "candidate");
    assert.equal(result.value.selectedCandidateId, null);
    assert.equal(result.value.restaurantId, null);
    assert.equal(result.value.confirmationEvidence, null);
    assert.equal(result.value.requiresUserConfirmation, true);
  }
});

await test("provider_internal_fields_excluded", async () => {
  let capturedInit: RequestInit | undefined;
  const adapter = adapterWith(
    fakeFetch((_input, init) => {
      capturedInit = init;
      return Promise.resolve(
        response([
          place(
            PLACE_ALPHA,
            "Fixture Alpha",
            "10 Alpha Street, New York, NY",
          ),
        ]),
      );
    }),
  );
  const result = await new GooglePlacesCandidateFinder(adapter).findCandidates(
    clues(),
    context("provider-internals"),
  );
  assert.equal(result.status, "success");
  const serialized = JSON.stringify(result);
  for (const forbidden of [
    "businessStatus",
    "rating",
    "reviews",
    "photos",
    "priceLevel",
    "providerTrace",
  ]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
  const headers = new Headers(capturedInit?.headers);
  assert.equal(
    headers.get("X-Goog-FieldMask"),
    "places.id,places.displayName,places.formattedAddress,places.location",
  );
});

await test("no_secret_or_raw_provider_payload_logged", async () => {
  const calls: unknown[][] = [];
  const original = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error,
    debug: console.debug,
  };
  const capture = (...values: unknown[]): void => {
    calls.push(values);
  };
  console.log = capture;
  console.info = capture;
  console.warn = capture;
  console.error = capture;
  console.debug = capture;
  try {
    const missing = createGooglePlacesTextSearchAdapterFromEnvironment(
      {},
      {
        fetchImplementation: fakeFetch(() => Promise.resolve(response([]))),
        candidateIdFactory,
      },
    );
    assert.equal(missing, null);
    const configured = createGooglePlacesTextSearchAdapterFromEnvironment(
      { [SERVER_ENV_NAMES.googlePlacesApiKey]: FIXTURE_CONFIGURATION_VALUE },
      {
        fetchImplementation: fakeFetch(() =>
          Promise.resolve(
            response([
              place(
                PLACE_ALPHA,
                "Fixture Alpha",
                "10 Alpha Street, New York, NY",
              ),
            ]),
          ),
        ),
        candidateIdFactory,
      },
    );
    assert(configured !== null);
    const result = await configured.search(
      normalizedClues(),
      context("no-logging"),
    );
    const serialized = JSON.stringify(result);
    assert.equal(serialized.includes(FIXTURE_CONFIGURATION_VALUE), false);
    assert.equal(serialized.includes("provider-internal-trace"), false);
  } finally {
    console.log = original.log;
    console.info = original.info;
    console.warn = original.warn;
    console.error = original.error;
    console.debug = original.debug;
  }
  assert.deepEqual(calls, []);
});

await test("menu_only_continuation_remains_available", async () => {
  const result = await new FoundationRestaurantResolutionPort().resolve(
    {
      candidates: [],
      priorResolution: null,
      selectedCandidateId: null,
      confirmationEvidence: null,
    },
    context("menu-only"),
  );
  assert.equal(result.status, "outcome");
  if (result.status === "outcome") {
    assert.equal(result.outcome.code, "RESTAURANT_NOT_RESOLVED");
    assert.equal(result.outcome.canContinueMenuOnly, true);
  }
});

assert.deepEqual(cases, [
  "one_candidate",
  "multiple_candidates",
  "no_candidate",
  "conflicting_candidate_clues",
  "ordinary_provider_failure",
  "provider_timeout_before_response",
  "ordinary_cancellation_before_response",
  "timeout_followed_by_late_success",
  "cancellation_followed_by_late_success",
  "timeout_followed_by_rejection",
  "cancellation_followed_by_rejection",
  "rank_one_candidate_remains_unconfirmed",
  "provider_internal_fields_excluded",
  "no_secret_or_raw_provider_payload_logged",
  "menu_only_continuation_remains_available",
]);

console.log("Google Places S1.1 thin-path fixtures passed.");
