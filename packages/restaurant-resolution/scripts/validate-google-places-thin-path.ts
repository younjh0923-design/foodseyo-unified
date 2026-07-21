import assert from "node:assert/strict";

import {
  MODULE_INTERFACE_VERSION,
  SERVER_ENV_NAMES,
  type PortInvocationContext,
} from "@foodseyo/contracts";
import {
  FoundationRestaurantResolutionPort,
} from "../src/index.js";
import * as publicPackageSurface from "../src/index.js";
import {
  GooglePlacesCandidateFinder,
  normalizeServerRestaurantClues,
  type NormalizedServerRestaurantClues,
  type ServerRestaurantClues,
} from "../src/foundation.js";
import {
  GooglePlacesTextSearchAdapter,
  createGooglePlacesTextSearchAdapterFromEnvironment,
} from "../src/google-places-server.js";

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

const environmentSnapshot = (name: string) => ({
  present: Object.hasOwn(process.env, name),
  value: process.env[name],
});

const assertEnvironmentRestored = (
  name: string,
  before: ReturnType<typeof environmentSnapshot>,
): void => {
  assert.equal(Object.hasOwn(process.env, name), before.present);
  assert.equal(process.env[name], before.value);
};

const withTemporaryEnvironmentValue = async <T>(
  name: string,
  value: string,
  run: () => Promise<T>,
): Promise<T> => {
  const before = environmentSnapshot(name);
  process.env[name] = value;
  try {
    return await run();
  } finally {
    if (before.present && before.value !== undefined) {
      process.env[name] = before.value;
    } else {
      delete process.env[name];
    }
  }
};

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

const assertInvalidProviderResult = (result: Awaited<ReturnType<typeof findWithPayload>>): void => {
  assert.equal(result.status, "error");
  if (result.status === "error") {
    assert.equal(result.error.error.code, "INVALID_UPSTREAM_RESULT");
    assert.equal("providerPayload" in result.error.error, false);
  }
};

const findWithRawResponse = async (
  providerResponse: Response,
  invocation: PortInvocationContext,
) => {
  const adapter = adapterWith(
    fakeFetch(() => Promise.resolve(providerResponse)),
  );
  return new GooglePlacesCandidateFinder(adapter).findCandidates(
    clues(),
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
  #clearCount = 0;
  #scheduleCount = 0;

  readonly scheduleTimeout = (
    callback: () => void,
    _timeoutMs: number,
  ): ReturnType<typeof setTimeout> => {
    this.#scheduleCount += 1;
    this.#callback = callback;
    return 1 as ReturnType<typeof setTimeout>;
  };

  readonly clearScheduledTimeout = (
    _handle: ReturnType<typeof setTimeout>,
  ): void => {
    this.#clearCount += 1;
    this.#callback = null;
  };

  get clearCount(): number {
    return this.#clearCount;
  }

  get scheduleCount(): number {
    return this.#scheduleCount;
  }

  expire(): void {
    const callback = this.#callback;
    assert(callback !== null, "provider timeout was not scheduled");
    this.#callback = null;
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
  let providerSignal: AbortSignal | undefined;
  const controller = new AbortController();
  const scheduler = new ManualTimeoutScheduler();
  const adapter = adapterWith(
    fakeFetch((_input, init) => {
      fetchCallCount += 1;
      providerSignal = init?.signal ?? undefined;
      return new Promise<Response>((resolve, reject) => {
        providerResponse.promise.then(resolve, reject);
        providerSignal?.addEventListener(
          "abort",
          () => reject(providerSignal?.reason),
          { once: true },
        );
      });
    }),
    {
      scheduleTimeout: scheduler.scheduleTimeout,
      clearScheduledTimeout: scheduler.clearScheduledTimeout,
    },
  );
  const pending = adapter.search(normalizedClues(), context(name, controller));
  assert.equal(fetchCallCount, 1);

  if (interruption === "timeout") {
    scheduler.expire();
  } else {
    controller.abort(new DOMException("cancelled", "AbortError"));
  }

  const result = await pending;
  assert.equal(providerSignal?.aborted, true);
  assert.equal(scheduler.scheduleCount, 1);
  assert.equal(scheduler.clearCount, 1);
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
  } else {
    providerResponse.resolve(response([]));
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

await test("successful_request_cleans_up_timeout_and_listener", async () => {
  const controller = new AbortController();
  const scheduler = new ManualTimeoutScheduler();
  let providerSignal: AbortSignal | undefined;
  const adapter = adapterWith(
    fakeFetch((_input, init) => {
      providerSignal = init?.signal ?? undefined;
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
    {
      scheduleTimeout: scheduler.scheduleTimeout,
      clearScheduledTimeout: scheduler.clearScheduledTimeout,
    },
  );
  const result = await adapter.search(
    normalizedClues(),
    context("success-cleanup", controller),
  );
  assert.equal(result.status, "success");
  assert.equal(scheduler.scheduleCount, 1);
  assert.equal(scheduler.clearCount, 1);
  assert.equal(providerSignal?.aborted, false);
  controller.abort(new DOMException("after completion", "AbortError"));
  assert.equal(providerSignal?.aborted, false);
});

await test("already_aborted_signal_prevents_fetch", async () => {
  let fetchCallCount = 0;
  const controller = new AbortController();
  controller.abort(new DOMException("cancelled", "AbortError"));
  const adapter = adapterWith(
    fakeFetch(() => {
      fetchCallCount += 1;
      return Promise.resolve(response([]));
    }),
  );
  const result = await adapter.search(
    normalizedClues(),
    context("already-aborted", controller),
  );
  assert.equal(fetchCallCount, 0);
  assert.equal(result.status, "outcome");
  if (result.status === "outcome") {
    assert.equal(result.outcome.code, "RESTAURANT_NOT_RESOLVED");
  }
});

await test("provider_adapter_is_not_a_public_package_boundary", async () => {
  assert.equal("GooglePlacesTextSearchAdapter" in publicPackageSurface, false);
  assert.equal(
    "createGooglePlacesTextSearchAdapterFromEnvironment" in publicPackageSurface,
    false,
  );
});

await test("candidate_identity_is_request_scoped", async () => {
  const fetchImplementation = fakeFetch(() =>
    Promise.resolve(
      response([
        place(PLACE_ALPHA, "Fixture Alpha", "10 Alpha Street, New York, NY"),
      ]),
    ),
  );
  const requestScopedIdFactory = (
    _placeId: string,
    _rank: number,
    correlationId: string,
  ): string =>
    correlationId === "s1_1_identity-first"
      ? CANDIDATE_IDS[0]
      : CANDIDATE_IDS[1];
  const finder = new GooglePlacesCandidateFinder(
    adapterWith(fetchImplementation, {
      candidateIdFactory: requestScopedIdFactory,
    }),
  );
  const first = await finder.findCandidates(clues(), context("identity-first"));
  const second = await finder.findCandidates(clues(), context("identity-second"));
  assert.equal(first.status, "success");
  assert.equal(second.status, "success");
  if (first.status === "success" && second.status === "success") {
    assert.notEqual(
      first.value[0]?.candidateId,
      second.value[0]?.candidateId,
    );
    assert.equal(first.value[0]?.googlePlaceId, PLACE_ALPHA);
    assert.equal(second.value[0]?.googlePlaceId, PLACE_ALPHA);
  }
});

await test("malformed_json_is_rejected", async () => {
  const result = await findWithRawResponse(
    new Response("{", {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
    context("malformed-json"),
  );
  assertInvalidProviderResult(result);
});

await test("invalid_top_level_shape_is_rejected", async () => {
  const result = await findWithRawResponse(
    new Response("[]", {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
    context("invalid-top-level"),
  );
  assertInvalidProviderResult(result);
});

await test("invalid_candidate_item_shape_is_rejected", async () => {
  const result = await findWithPayload(
    ["not-a-place"],
    context("invalid-candidate-item"),
  );
  assertInvalidProviderResult(result);
});

await test("missing_required_provider_fields_are_rejected", async () => {
  for (const field of ["id", "displayName", "formattedAddress", "location"]) {
    const invalid = place(
      PLACE_ALPHA,
      "Fixture Alpha",
      "10 Alpha Street, New York, NY",
    );
    delete invalid[field];
    const result = await findWithPayload(
      [invalid],
      context(`missing-${field}`),
    );
    assertInvalidProviderResult(result);
  }
});

await test("out_of_range_coordinates_are_rejected", async () => {
  for (const [name, location] of [
    ["latitude-below", { latitude: -90.000001, longitude: -73.949 }],
    ["latitude-above", { latitude: 90.000001, longitude: -73.949 }],
    ["longitude-below", { latitude: 40.743, longitude: -180.000001 }],
    ["longitude-above", { latitude: 40.743, longitude: 180.000001 }],
  ] as const) {
    const invalid = place(
      PLACE_ALPHA,
      "Fixture Alpha",
      "10 Alpha Street, New York, NY",
    );
    invalid.location = location;
    const result = await findWithPayload(
      [invalid],
      context(name),
    );
    assertInvalidProviderResult(result);
  }
});

await test("duplicate_place_ids_are_rejected", async () => {
  const result = await findWithPayload(
    [
      place(PLACE_ALPHA, "Fixture Alpha", "10 Alpha Street, New York, NY"),
      place(PLACE_ALPHA, "Fixture Beta", "20 Beta Street, New York, NY"),
    ],
    context("duplicate-place-id"),
  );
  assertInvalidProviderResult(result);
});

await test("request_result_mismatch_is_rejected", async () => {
  const staleRequestAdapter = adapterWith(
    fakeFetch(() =>
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
  );
  const result = await new GooglePlacesCandidateFinder({
    search: (normalized, _currentContext) =>
      staleRequestAdapter.search(normalized, context("stale-request")),
  }).findCandidates(clues(), context("current-request"));
  assertInvalidProviderResult(result);
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
      result.value.map((candidate) => ({
        candidateId: candidate.candidateId,
        googlePlaceId: candidate.googlePlaceId,
        matchSignals: candidate.matchSignals,
        rank: candidate.rank,
      })),
      [
        {
          candidateId: CANDIDATE_IDS[0],
          googlePlaceId: PLACE_ALPHA,
          matchSignals: ["name", "address", "location", "visual_text"],
          rank: 1,
        },
        {
          candidateId: CANDIDATE_IDS[1],
          googlePlaceId: PLACE_BETA,
          matchSignals: ["name", "location", "visual_text"],
          rank: 2,
        },
      ],
    );
  }
});

await test("request_evidence_is_not_reused_for_candidates", async () => {
  const result = await findWithPayload(
    [
      {
        id: PLACE_ALPHA,
        displayName: { text: "Unrelated Restaurant", languageCode: "en" },
        formattedAddress: "99 Unrelated Street, New York, NY",
        location: { latitude: 40.743, longitude: -73.949 },
      },
    ],
    context("candidate-specific-evidence"),
    clues({
      name: "Requested Restaurant",
      address: "10 Requested Street, New York, NY",
      visualText: "Requested Restaurant",
      location: null,
    }),
  );
  assert.equal(result.status, "outcome");
  if (result.status === "outcome") {
    assert.equal(result.outcome.code, "RESTAURANT_NOT_RESOLVED");
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
  assert.deepEqual(
    candidates.value.map((candidate) => ({
      googlePlaceId: candidate.googlePlaceId,
      matchSignals: candidate.matchSignals,
    })),
    [
      {
        googlePlaceId: PLACE_ALPHA,
        matchSignals: ["name", "location", "visual_text"],
      },
      {
        googlePlaceId: PLACE_BETA,
        matchSignals: ["address", "location"],
      },
    ],
  );
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
  const scheduler = new ManualTimeoutScheduler();
  const adapter = adapterWith(
    fakeFetch(() => Promise.reject(new Error("deterministic provider failure"))),
    {
      scheduleTimeout: scheduler.scheduleTimeout,
      clearScheduledTimeout: scheduler.clearScheduledTimeout,
    },
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
  assert.equal(scheduler.scheduleCount, 1);
  assert.equal(scheduler.clearCount, 1);
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

await test("confirmation_does_not_imply_persistence", async () => {
  const candidates = await findWithPayload(
    [place(PLACE_ALPHA, "Fixture Alpha", "10 Alpha Street, New York, NY")],
    context("confirmation-without-persistence-find"),
  );
  assert.equal(candidates.status, "success");
  if (candidates.status !== "success") {
    return;
  }
  const candidate = candidates.value[0];
  assert(candidate !== undefined);
  const result = await new FoundationRestaurantResolutionPort().resolve(
    {
      candidates: candidates.value,
      priorResolution: null,
      selectedCandidateId: candidate.candidateId,
      confirmationEvidence: {
        kind: "user_action",
        actionRef: "s1_1_confirmation_action",
        recordedAt: "2026-07-21T12:00:00.000Z",
      },
    },
    context("confirmation-without-persistence-resolution"),
  );
  assert.equal(result.status, "success");
  if (result.status === "success") {
    assert.equal(result.value.state, "user_confirmed");
    assert.equal(result.value.selectedCandidateId, candidate.candidateId);
    assert.equal(result.value.restaurantId, null);
    assert.equal(result.value.candidates[0]?.googlePlaceId, PLACE_ALPHA);
  }
});

await test("provider_internal_fields_excluded", async () => {
  let capturedInput: RequestInfo | URL | undefined;
  let capturedInit: RequestInit | undefined;
  const adapter = adapterWith(
    fakeFetch((input, init) => {
      capturedInput = input;
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
  if (result.status === "success") {
    assert.deepEqual(Object.keys(result.value[0] ?? {}).sort(), [
      "candidateId",
      "contractVersion",
      "displayName",
      "fullAddress",
      "googlePlaceId",
      "location",
      "matchSignals",
      "rank",
      "shortAddress",
    ]);
  }
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
    capturedInput,
    "https://places.googleapis.com/v1/places:searchText",
  );
  assert.equal(capturedInit?.method, "POST");
  assert.deepEqual(JSON.parse(String(capturedInit?.body)), {
    textQuery: "Fixture Alpha 10 Alpha Street, New York, NY",
    includedType: "restaurant",
    strictTypeFiltering: true,
    maxResultCount: 10,
    locationBias: {
      circle: {
        center: { latitude: 40.743, longitude: -73.949 },
        radius: 5_000,
      },
    },
  });
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

await test("environment_is_restored_after_success", async () => {
  const name = SERVER_ENV_NAMES.googlePlacesApiKey;
  const before = environmentSnapshot(name);
  await withTemporaryEnvironmentValue(
    name,
    FIXTURE_CONFIGURATION_VALUE,
    async () => {
      const configured = createGooglePlacesTextSearchAdapterFromEnvironment(
        process.env,
        {
          fetchImplementation: fakeFetch(() => Promise.resolve(response([]))),
          candidateIdFactory,
        },
      );
      assert(configured !== null);
    },
  );
  assertEnvironmentRestored(name, before);
});

await test("environment_is_restored_after_failure", async () => {
  const name = SERVER_ENV_NAMES.googlePlacesApiKey;
  const before = environmentSnapshot(name);
  await assert.rejects(
    withTemporaryEnvironmentValue(
      name,
      FIXTURE_CONFIGURATION_VALUE,
      async () => {
        throw new Error("deterministic validation failure");
      },
    ),
    /deterministic validation failure/u,
  );
  assertEnvironmentRestored(name, before);
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
  "successful_request_cleans_up_timeout_and_listener",
  "already_aborted_signal_prevents_fetch",
  "provider_adapter_is_not_a_public_package_boundary",
  "candidate_identity_is_request_scoped",
  "malformed_json_is_rejected",
  "invalid_top_level_shape_is_rejected",
  "invalid_candidate_item_shape_is_rejected",
  "missing_required_provider_fields_are_rejected",
  "out_of_range_coordinates_are_rejected",
  "duplicate_place_ids_are_rejected",
  "request_result_mismatch_is_rejected",
  "multiple_candidates",
  "request_evidence_is_not_reused_for_candidates",
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
  "confirmation_does_not_imply_persistence",
  "provider_internal_fields_excluded",
  "no_secret_or_raw_provider_payload_logged",
  "environment_is_restored_after_success",
  "environment_is_restored_after_failure",
  "menu_only_continuation_remains_available",
]);

console.log("Google Places S1.1 thin-path fixtures passed.");
