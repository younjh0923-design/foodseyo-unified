import {
  PUBLIC_ERROR_REGISTRY,
  SERVER_ENV_NAMES,
  PortInvocationContextSchema,
  PublicErrorEnvelopeSchema,
  PublicOutcomeSchema,
  isTimeoutAbortSignal,
  type PortInvocationContext,
  type PortResult,
  type PublicErrorCode,
  type PublicErrorEnvelope,
  type PublicOutcome,
  type RestaurantMatchSignal,
} from "@foodseyo/contracts";

import type {
  GooglePlacesCandidateAdapter,
  NormalizedServerRestaurantClues,
} from "./foundation.js";

const GOOGLE_PLACES_TEXT_SEARCH_ENDPOINT =
  "https://places.googleapis.com/v1/places:searchText";
const GOOGLE_PLACES_TEXT_SEARCH_FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.location",
].join(",");
const MAX_CANDIDATES = 10;
const LOCATION_BIAS_RADIUS_METERS = 5_000;

type TimeoutHandle = ReturnType<typeof setTimeout>;

interface GooglePlacesAdapterDependencies {
  readonly fetchImplementation: typeof fetch;
  readonly candidateIdFactory: (
    placeId: string,
    rank: number,
    correlationId: string,
  ) => string;
  readonly scheduleTimeout: (
    callback: () => void,
    timeoutMs: number,
  ) => TimeoutHandle;
  readonly clearScheduledTimeout: (handle: TimeoutHandle) => void;
}

interface ProviderCandidateRecord {
  readonly requestCandidateId: string;
  readonly placeId: string;
  readonly primaryText: string;
  readonly formattedAddress: string | null;
  readonly shortLocation: null;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly signals: readonly RestaurantMatchSignal[];
  readonly providerRank: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const publicOutcome = (
  context: PortInvocationContext,
): PublicOutcome =>
  PublicOutcomeSchema.parse({
    code: "RESTAURANT_NOT_RESOLVED",
    stage: "restaurant_resolution",
    correlationId: context.correlationId,
    retryable: true,
    canContinueMenuOnly: true,
  });

const publicError = (
  code: PublicErrorCode,
  context: PortInvocationContext,
): PublicErrorEnvelope => {
  const definition = PUBLIC_ERROR_REGISTRY[code];
  return PublicErrorEnvelopeSchema.parse({
    error: {
      code,
      message: definition.message,
      correlationId: context.correlationId,
      retryable: definition.retryable,
    },
    httpStatus: definition.httpStatus,
  });
};

const interruptedResult = (
  context: PortInvocationContext,
): PortResult<readonly unknown[]> =>
  isTimeoutAbortSignal(context.signal)
    ? { status: "error", error: publicError("UPSTREAM_TIMEOUT", context) }
    : { status: "outcome", outcome: publicOutcome(context) };

const timeoutResult = (
  context: PortInvocationContext,
): PortResult<readonly unknown[]> => ({
  status: "error",
  error: publicError("UPSTREAM_TIMEOUT", context),
});

const assertServerRuntime = (): void => {
  if (typeof window !== "undefined") {
    throw new Error("Google Places restaurant resolution is server-only.");
  }
};

const buildSearchSignals = (
  clues: NormalizedServerRestaurantClues,
): readonly RestaurantMatchSignal[] => {
  const signals: RestaurantMatchSignal[] = [];
  if (clues.name !== null) {
    signals.push("name");
  }
  if (clues.address !== null) {
    signals.push("address");
  }
  if (clues.location !== null) {
    signals.push("location");
  }
  if (clues.visualText !== null) {
    signals.push("visual_text");
  }
  return signals;
};

const buildTextQuery = (
  clues: NormalizedServerRestaurantClues,
): string | null => {
  const values = [clues.name, clues.address, clues.visualText].filter(
    (value): value is string => value !== null,
  );
  const seen = new Set<string>();
  const unique = values.filter((value) => {
    const key = value.toLowerCase();
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
  return unique.length === 0 ? null : unique.join(" ");
};

const mapProviderPlace = (
  value: unknown,
  rank: number,
  signals: readonly RestaurantMatchSignal[],
  context: PortInvocationContext,
  candidateIdFactory: GooglePlacesAdapterDependencies["candidateIdFactory"],
): ProviderCandidateRecord | null => {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    !isRecord(value.displayName) ||
    typeof value.displayName.text !== "string" ||
    (value.formattedAddress !== undefined &&
      typeof value.formattedAddress !== "string")
  ) {
    return null;
  }

  let latitude: number | null = null;
  let longitude: number | null = null;
  if (value.location !== undefined) {
    if (
      !isRecord(value.location) ||
      typeof value.location.latitude !== "number" ||
      !Number.isFinite(value.location.latitude) ||
      typeof value.location.longitude !== "number" ||
      !Number.isFinite(value.location.longitude)
    ) {
      return null;
    }
    latitude = value.location.latitude;
    longitude = value.location.longitude;
  }

  return {
    requestCandidateId: candidateIdFactory(
      value.id,
      rank,
      context.correlationId,
    ),
    placeId: value.id,
    primaryText: value.displayName.text,
    formattedAddress: value.formattedAddress ?? null,
    shortLocation: null,
    latitude,
    longitude,
    signals,
    providerRank: rank,
  };
};

export class GooglePlacesTextSearchAdapter
  implements GooglePlacesCandidateAdapter
{
  readonly #apiKey: string;
  readonly #dependencies: GooglePlacesAdapterDependencies;

  constructor(
    apiKey: string,
    dependencies: Partial<GooglePlacesAdapterDependencies> = {},
  ) {
    assertServerRuntime();
    const normalizedApiKey = apiKey.trim();
    if (normalizedApiKey.length === 0) {
      throw new Error("Google Places server configuration is unavailable.");
    }
    this.#apiKey = normalizedApiKey;
    this.#dependencies = {
      fetchImplementation:
        dependencies.fetchImplementation ?? globalThis.fetch.bind(globalThis),
      candidateIdFactory:
        dependencies.candidateIdFactory ?? (() => globalThis.crypto.randomUUID()),
      scheduleTimeout:
        dependencies.scheduleTimeout ??
        ((callback, timeoutMs) => setTimeout(callback, timeoutMs)),
      clearScheduledTimeout:
        dependencies.clearScheduledTimeout ??
        ((handle) => clearTimeout(handle)),
    };
  }

  async search(
    clues: NormalizedServerRestaurantClues,
    context: PortInvocationContext,
  ): Promise<PortResult<readonly unknown[]>> {
    PortInvocationContextSchema.parse(context);
    if (context.signal.aborted) {
      return interruptedResult(context);
    }

    const textQuery = buildTextQuery(clues);
    const signals = buildSearchSignals(clues);
    if (textQuery === null || signals.length === 0) {
      return { status: "success", value: [] };
    }

    const providerController = new AbortController();
    let deadlineExpired = false;
    let resolveInterruption!: (
      result: PortResult<readonly unknown[]>,
    ) => void;
    const interruption = new Promise<PortResult<readonly unknown[]>>(
      (resolve) => {
        resolveInterruption = resolve;
      },
    );
    const cancelProvider = (): void => {
      providerController.abort(context.signal.reason);
      resolveInterruption(interruptedResult(context));
    };
    context.signal.addEventListener("abort", cancelProvider, { once: true });
    const timeoutHandle = this.#dependencies.scheduleTimeout(() => {
      deadlineExpired = true;
      providerController.abort(
        new DOMException("provider deadline exceeded", "TimeoutError"),
      );
      resolveInterruption(timeoutResult(context));
    }, context.timeoutMs);

    if (context.signal.aborted) {
      cancelProvider();
    }

    const providerResult = this.requestCandidates(
      clues,
      textQuery,
      signals,
      context,
      providerController.signal,
    );
    const result = await Promise.race([providerResult, interruption]);

    context.signal.removeEventListener("abort", cancelProvider);
    this.#dependencies.clearScheduledTimeout(timeoutHandle);

    if (deadlineExpired) {
      return timeoutResult(context);
    }
    if (context.signal.aborted) {
      return interruptedResult(context);
    }
    return result;
  }

  private async requestCandidates(
    clues: NormalizedServerRestaurantClues,
    textQuery: string,
    signals: readonly RestaurantMatchSignal[],
    context: PortInvocationContext,
    signal: AbortSignal,
  ): Promise<PortResult<readonly unknown[]>> {
    const body = {
      textQuery,
      includedType: "restaurant",
      strictTypeFiltering: true,
      maxResultCount: MAX_CANDIDATES,
      ...(clues.location === null
        ? {}
        : {
            locationBias: {
              circle: {
                center: clues.location,
                radius: LOCATION_BIAS_RADIUS_METERS,
              },
            },
          }),
    };

    let response: Response;
    try {
      response = await this.#dependencies.fetchImplementation(
        GOOGLE_PLACES_TEXT_SEARCH_ENDPOINT,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": this.#apiKey,
            "X-Goog-FieldMask": GOOGLE_PLACES_TEXT_SEARCH_FIELD_MASK,
          },
          body: JSON.stringify(body),
          signal,
        },
      );
    } catch {
      return {
        status: "error",
        error: publicError("UPSTREAM_UNAVAILABLE", context),
      };
    }

    if (!response.ok) {
      return {
        status: "error",
        error: publicError("UPSTREAM_UNAVAILABLE", context),
      };
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      return {
        status: "error",
        error: publicError("INVALID_UPSTREAM_RESULT", context),
      };
    }
    if (!isRecord(payload)) {
      return {
        status: "error",
        error: publicError("INVALID_UPSTREAM_RESULT", context),
      };
    }
    if (payload.places === undefined) {
      return { status: "success", value: [] };
    }
    if (!Array.isArray(payload.places)) {
      return {
        status: "error",
        error: publicError("INVALID_UPSTREAM_RESULT", context),
      };
    }

    const records = payload.places
      .slice(0, MAX_CANDIDATES)
      .map((place, index) =>
        mapProviderPlace(
          place,
          index + 1,
          signals,
          context,
          this.#dependencies.candidateIdFactory,
        ),
      );
    if (records.some((record) => record === null)) {
      return {
        status: "error",
        error: publicError("INVALID_UPSTREAM_RESULT", context),
      };
    }
    return {
      status: "success",
      value: records as readonly ProviderCandidateRecord[],
    };
  }
}

export const createGooglePlacesTextSearchAdapterFromEnvironment = (
  environment: Readonly<Record<string, string | undefined>>,
  dependencies: Partial<GooglePlacesAdapterDependencies> = {},
): GooglePlacesTextSearchAdapter | null => {
  assertServerRuntime();
  const apiKey = environment[SERVER_ENV_NAMES.googlePlacesApiKey];
  return typeof apiKey === "string" && apiKey.trim().length > 0
    ? new GooglePlacesTextSearchAdapter(apiKey, dependencies)
    : null;
};
