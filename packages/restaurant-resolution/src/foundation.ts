import {
  CONTRACT_VERSIONS,
  PUBLIC_ERROR_REGISTRY,
  RESTAURANT_MATCH_SIGNALS,
  PortInvocationContextSchema,
  PublicErrorEnvelopeSchema,
  PublicOutcomeSchema,
  RestaurantCandidateSchema,
  RestaurantResolutionRequestSchema,
  RestaurantResolutionSchema,
  isTimeoutAbortSignal,
  type GeoPoint,
  type PortInvocationContext,
  type PortResult,
  type PublicErrorCode,
  type PublicErrorEnvelope,
  type PublicOutcome,
  type RestaurantCandidate,
  type RestaurantConfirmationEvidence,
  type RestaurantMatchSignal,
  type RestaurantResolution,
  type RestaurantResolutionPort,
  type RestaurantResolutionRequest,
  type UiOperationalEventPort,
} from "@foodseyo/contracts";

const SAFE_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,255}$/u;

const publicOutcome = (
  code: "RESTAURANT_CONFIRMATION_REQUIRED" | "RESTAURANT_NOT_RESOLVED",
  context: PortInvocationContext,
): PublicOutcome =>
  PublicOutcomeSchema.parse({
    code,
    stage: "restaurant_resolution",
    correlationId: context.correlationId,
    retryable: code === "RESTAURANT_NOT_RESOLVED",
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

const normalizeText = (value: string | null, maximum: number): string | null => {
  if (value === null) {
    return null;
  }
  const normalized = value
    .normalize("NFKC")
    .replace(/[’‘]/gu, "'")
    .replace(/\s+/gu, " ")
    .trim();
  return normalized.length > 0 && normalized.length <= maximum
    ? normalized
    : null;
};

const validLocation = (value: GeoPoint | null): boolean =>
  value === null ||
  (Number.isFinite(value.latitude) &&
    value.latitude >= -90 &&
    value.latitude <= 90 &&
    Number.isFinite(value.longitude) &&
    value.longitude >= -180 &&
    value.longitude <= 180);

/**
 * Server-internal clues supplied only after sensitive photo/link intake has
 * been handled elsewhere. A raw URL, upload handle, filename, image byte, or
 * provider response is intentionally not representable here.
 */
export interface ServerRestaurantClues {
  readonly name: string | null;
  readonly address: string | null;
  readonly visualText: string | null;
  readonly linkFingerprint: string | null;
  readonly location: GeoPoint | null;
}

export type NormalizedServerRestaurantClues = ServerRestaurantClues;

export const normalizeServerRestaurantClues = (
  clues: ServerRestaurantClues,
): NormalizedServerRestaurantClues | null => {
  const name = normalizeText(clues.name, 200);
  const address = normalizeText(clues.address, 400);
  const visualText = normalizeText(clues.visualText, 200);
  const linkFingerprint = normalizeText(clues.linkFingerprint, 256);
  if (
    !validLocation(clues.location) ||
    (clues.linkFingerprint !== null &&
      (linkFingerprint === null ||
        !SAFE_TOKEN.test(linkFingerprint) ||
        linkFingerprint.includes("://")))
  ) {
    return null;
  }
  if (
    name === null &&
    address === null &&
    visualText === null &&
    linkFingerprint === null
  ) {
    return null;
  }
  return {
    name,
    address,
    visualText,
    linkFingerprint,
    location: clues.location,
  };
};

/** Package-local provider adapter. Raw Google responses never cross it. */
export interface GooglePlacesCandidateAdapter {
  search(
    clues: NormalizedServerRestaurantClues,
    context: PortInvocationContext,
  ): Promise<PortResult<readonly unknown[]>>;
}

/**
 * Deterministic, network-free Google Places fake. Its configured records use
 * a strict provider-normalized shape and are validated by the candidate
 * finder before any shared DTO is created.
 */
export class DeterministicFakeGooglePlacesAdapter
  implements GooglePlacesCandidateAdapter
{
  #callCount = 0;

  constructor(private readonly records: readonly unknown[]) {}

  get callCount(): number {
    return this.#callCount;
  }

  search(
    _clues: NormalizedServerRestaurantClues,
    context: PortInvocationContext,
  ): Promise<PortResult<readonly unknown[]>> {
    this.#callCount += 1;
    PortInvocationContextSchema.parse(context);
    if (context.signal.aborted) {
      return Promise.resolve(
        isTimeoutAbortSignal(context.signal)
          ? {
              status: "error",
              error: publicError("UPSTREAM_TIMEOUT", context),
            }
          : {
              status: "outcome",
              outcome: publicOutcome("RESTAURANT_NOT_RESOLVED", context),
            },
      );
    }
    return Promise.resolve({ status: "success", value: [...this.records] });
  }
}

const PROVIDER_RECORD_KEYS = new Set([
  "requestCandidateId",
  "placeId",
  "primaryText",
  "formattedAddress",
  "shortLocation",
  "latitude",
  "longitude",
  "signals",
  "providerRank",
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseProviderRecord = (value: unknown): RestaurantCandidate | null => {
  if (
    !isRecord(value) ||
    Object.keys(value).some((key) => !PROVIDER_RECORD_KEYS.has(key)) ||
    typeof value.requestCandidateId !== "string" ||
    typeof value.placeId !== "string" ||
    typeof value.primaryText !== "string" ||
    (value.formattedAddress !== null &&
      typeof value.formattedAddress !== "string") ||
    (value.shortLocation !== null && typeof value.shortLocation !== "string") ||
    (value.latitude !== null && typeof value.latitude !== "number") ||
    (value.longitude !== null && typeof value.longitude !== "number") ||
    !Array.isArray(value.signals) ||
    !Number.isInteger(value.providerRank)
  ) {
    return null;
  }
  if (
    (value.latitude === null) !== (value.longitude === null) ||
    !value.signals.every(
      (signal) =>
        typeof signal === "string" &&
        RESTAURANT_MATCH_SIGNALS.includes(signal as RestaurantMatchSignal),
    )
  ) {
    return null;
  }
  const displayName = normalizeText(value.primaryText, 200);
  const fullAddress = normalizeText(value.formattedAddress, 400);
  const shortAddress = normalizeText(value.shortLocation, 200);
  const location =
    value.latitude === null || value.longitude === null
      ? null
      : { latitude: value.latitude, longitude: value.longitude };
  if (displayName === null || !validLocation(location)) {
    return null;
  }
  const result = RestaurantCandidateSchema.safeParse({
    contractVersion: CONTRACT_VERSIONS.restaurantResolution,
    candidateId: value.requestCandidateId,
    googlePlaceId: value.placeId,
    displayName,
    fullAddress,
    shortAddress,
    location,
    matchSignals: value.signals,
    rank: value.providerRank,
  });
  return result.success ? result.data : null;
};

/** Package-local candidate creation service used by the fake foundation. */
export class GooglePlacesCandidateFinder {
  constructor(private readonly adapter: GooglePlacesCandidateAdapter) {}

  async findCandidates(
    clues: ServerRestaurantClues,
    context: PortInvocationContext,
  ): Promise<PortResult<readonly RestaurantCandidate[]>> {
    PortInvocationContextSchema.parse(context);
    if (context.signal.aborted) {
      return isTimeoutAbortSignal(context.signal)
        ? { status: "error", error: publicError("UPSTREAM_TIMEOUT", context) }
        : {
            status: "outcome",
            outcome: publicOutcome("RESTAURANT_NOT_RESOLVED", context),
          };
    }
    const normalized = normalizeServerRestaurantClues(clues);
    if (normalized === null) {
      return clues.name === null &&
        clues.address === null &&
        clues.visualText === null &&
        clues.linkFingerprint === null
        ? {
            status: "outcome",
            outcome: publicOutcome("RESTAURANT_NOT_RESOLVED", context),
          }
        : { status: "error", error: publicError("INVALID_INPUT", context) };
    }
    let providerResult: PortResult<readonly unknown[]>;
    try {
      providerResult = await this.adapter.search(normalized, context);
    } catch {
      return isTimeoutAbortSignal(context.signal)
        ? { status: "error", error: publicError("UPSTREAM_TIMEOUT", context) }
        : {
            status: "error",
            error: publicError("UPSTREAM_UNAVAILABLE", context),
          };
    }
    if (context.signal.aborted) {
      return isTimeoutAbortSignal(context.signal)
        ? { status: "error", error: publicError("UPSTREAM_TIMEOUT", context) }
        : {
            status: "outcome",
            outcome: publicOutcome("RESTAURANT_NOT_RESOLVED", context),
          };
    }
    if (providerResult.status !== "success") {
      return providerResult;
    }
    if (!Array.isArray(providerResult.value)) {
      return {
        status: "error",
        error: publicError("INVALID_UPSTREAM_RESULT", context),
      };
    }
    const candidates = providerResult.value.map(parseProviderRecord);
    if (candidates.some((candidate) => candidate === null)) {
      return {
        status: "error",
        error: publicError("INVALID_UPSTREAM_RESULT", context),
      };
    }
    const validCandidates = candidates as RestaurantCandidate[];
    const candidateIds = new Set(validCandidates.map((item) => item.candidateId));
    const placeIds = new Set(validCandidates.map((item) => item.googlePlaceId));
    const ranks = new Set(validCandidates.map((item) => item.rank));
    if (
      candidateIds.size !== validCandidates.length ||
      placeIds.size !== validCandidates.length ||
      ranks.size !== validCandidates.length
    ) {
      return {
        status: "error",
        error: publicError("INVALID_UPSTREAM_RESULT", context),
      };
    }
    const bounded = [...validCandidates]
      .sort((left, right) => left.rank - right.rank)
      .slice(0, 10);
    if (bounded.length === 0) {
      return {
        status: "outcome",
        outcome: publicOutcome("RESTAURANT_NOT_RESOLVED", context),
      };
    }
    return { status: "success", value: bounded };
  }
}

export type RestaurantIdentityAssigner = (
  candidate: RestaurantCandidate,
  evidence: RestaurantConfirmationEvidence,
  context: PortInvocationContext,
) => Promise<string | null>;

const noRestaurantIdentity: RestaurantIdentityAssigner = () =>
  Promise.resolve(null);

export class FoundationRestaurantResolutionPort
  implements RestaurantResolutionPort
{
  #callCount = 0;

  constructor(
    private readonly assignRestaurantIdentity: RestaurantIdentityAssigner =
      noRestaurantIdentity,
  ) {}

  get callCount(): number {
    return this.#callCount;
  }

  async resolve(
    request: RestaurantResolutionRequest,
    context: PortInvocationContext,
  ): Promise<PortResult<RestaurantResolution>> {
    this.#callCount += 1;
    PortInvocationContextSchema.parse(context);
    const parsedRequest = RestaurantResolutionRequestSchema.safeParse(request);
    if (!parsedRequest.success) {
      return { status: "error", error: publicError("INVALID_INPUT", context) };
    }
    if (context.signal.aborted) {
      return isTimeoutAbortSignal(context.signal)
        ? { status: "error", error: publicError("UPSTREAM_TIMEOUT", context) }
        : {
            status: "outcome",
            outcome: publicOutcome("RESTAURANT_NOT_RESOLVED", context),
          };
    }

    const value = parsedRequest.data;
    const candidates = [...value.candidates].sort(
      (left, right) => left.rank - right.rank,
    );

    if (
      value.priorResolution !== null &&
      value.selectedCandidateId === null &&
      value.confirmationEvidence === null
    ) {
      return { status: "success", value: value.priorResolution };
    }

    if (value.selectedCandidateId !== null) {
      const selected = candidates.find(
        (candidate) => candidate.candidateId === value.selectedCandidateId,
      );
      if (selected === undefined || value.confirmationEvidence === null) {
        return {
          status: "error",
          error: publicError("INVALID_INPUT", context),
        };
      }
      let restaurantId: string | null;
      try {
        restaurantId = await this.assignRestaurantIdentity(
          selected,
          value.confirmationEvidence,
          context,
        );
      } catch {
        if (context.signal.aborted) {
          return isTimeoutAbortSignal(context.signal)
            ? {
                status: "error",
                error: publicError("UPSTREAM_TIMEOUT", context),
              }
            : {
                status: "outcome",
                outcome: publicOutcome("RESTAURANT_NOT_RESOLVED", context),
              };
        }
        return { status: "error", error: publicError("INTERNAL_ERROR", context) };
      }
      if (context.signal.aborted) {
        return isTimeoutAbortSignal(context.signal)
          ? { status: "error", error: publicError("UPSTREAM_TIMEOUT", context) }
          : {
              status: "outcome",
              outcome: publicOutcome("RESTAURANT_NOT_RESOLVED", context),
            };
      }
      return this.success({
        state:
          value.confirmationEvidence.kind === "user_action"
            ? "user_confirmed"
            : "externally_verified",
        candidates,
        selectedCandidateId: selected.candidateId,
        restaurantId,
        confirmationEvidence: value.confirmationEvidence,
        requiresUserConfirmation: false,
        resolvedAt: value.confirmationEvidence.recordedAt,
      }, context);
    }

    if (value.confirmationEvidence !== null) {
      return { status: "error", error: publicError("INVALID_INPUT", context) };
    }
    if (candidates.length === 0) {
      return {
        status: "outcome",
        outcome: publicOutcome("RESTAURANT_NOT_RESOLVED", context),
      };
    }
    return this.success({
      state: candidates.length === 1 ? "candidate" : "conflicting",
      candidates,
      selectedCandidateId: null,
      restaurantId: null,
      confirmationEvidence: null,
      requiresUserConfirmation: true,
      resolvedAt: null,
    }, context);
  }

  private success(
    value: Omit<RestaurantResolution, "contractVersion" | "canContinueMenuOnly">,
    context: PortInvocationContext,
  ): PortResult<RestaurantResolution> {
    const parsed = RestaurantResolutionSchema.safeParse({
      contractVersion: CONTRACT_VERSIONS.restaurantResolution,
      ...value,
      canContinueMenuOnly: true,
    });
    return parsed.success
      ? { status: "success", value: parsed.data }
      : {
          status: "error",
          error: publicError("INVALID_UPSTREAM_RESULT", context),
        };
  }
}

/** Emits only values accepted by the frozen UI-safe operational event port. */
export class RestaurantResolutionCoordinator {
  constructor(
    private readonly resolution: RestaurantResolutionPort,
    private readonly events: UiOperationalEventPort,
  ) {}

  async resolve(
    request: RestaurantResolutionRequest,
    context: PortInvocationContext,
  ): Promise<PortResult<RestaurantResolution>> {
    const result = await this.resolution.resolve(request, context);
    if (result.status === "success") {
      await this.events.emit(result.value, context);
      if (result.value.requiresUserConfirmation) {
        await this.events.emit(
          publicOutcome("RESTAURANT_CONFIRMATION_REQUIRED", context),
          context,
        );
      }
    } else if (result.status === "outcome") {
      await this.events.emit(result.outcome, context);
    } else {
      await this.events.emit(result.error, context);
    }
    return result;
  }
}
