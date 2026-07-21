import {
  CONTRACT_VERSIONS,
  MenuSourceAcquisitionRequestSchema,
  MenuSourceInputSchema,
  PUBLIC_ERROR_REGISTRY,
  PortInvocationContextSchema,
  PublicErrorEnvelopeSchema,
  PublicOutcomeSchema,
  type MenuSourceAcquisitionRequest,
  type MenuSourceAcquisitionPort,
  type MenuSourceInput,
  type PortInvocationContext,
  type PortResult,
  type PublicErrorEnvelope,
  type PublicOutcome,
} from "@foodseyo/contracts";

import { restaurantContextFromMenuSourceRequest } from "./foundation.js";

export interface WebSearchMenuSourceCandidate {
  readonly sourceId: string;
  readonly locator: string;
  readonly title: string | null;
  readonly providerOrdinal: number;
  readonly rank: number;
}

export interface WebSearchMenuSourceDiscoveryPort {
  discover(
    request: MenuSourceAcquisitionRequest,
    context: PortInvocationContext,
  ): Promise<PortResult<readonly WebSearchMenuSourceCandidate[]>>;
}

export type WebSearchCandidateCollectionResult =
  | { readonly status: "success"; readonly value: MenuSourceInput }
  | { readonly status: "unusable" }
  | { readonly status: "outcome"; readonly outcome: PublicOutcome }
  | { readonly status: "error"; readonly error: PublicErrorEnvelope };

export interface WebSearchMenuSourceCollectorPort {
  collect(
    candidate: WebSearchMenuSourceCandidate,
    request: MenuSourceAcquisitionRequest,
    context: PortInvocationContext,
  ): Promise<WebSearchCandidateCollectionResult>;
}

export type MenuSourceFallbackState =
  | {
      readonly state: "official_source";
      readonly provenance: "official";
      readonly menuSource: MenuSourceInput;
    }
  | {
      readonly state: "fallback_source";
      readonly provenance: "fallback";
      readonly menuSource: MenuSourceInput;
    }
  | {
      readonly state: "menu_only";
      readonly provenance: "submission_only";
      readonly menuSource: null;
      readonly sourceLimitation: "no_usable_official_or_web_source";
      readonly restaurantFactsAllowed: false;
    };

const publicError = (
  code:
    | "INVALID_INPUT"
    | "INVALID_UPSTREAM_RESULT"
    | "UPSTREAM_UNAVAILABLE",
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

const cloneMenuSource = (source: MenuSourceInput): MenuSourceInput => ({
  ...source,
  source: { ...source.source },
  restaurantContext:
    source.restaurantContext === null ? null : { ...source.restaurantContext },
  content: { ...source.content },
});

const isOfficialSource = (source: MenuSourceInput): boolean =>
  source.source.sourceType === "official_website" ||
  source.source.sourceType === "official_pdf" ||
  source.source.sourceType === "ordering_page";

const validFallbackSource = (
  source: MenuSourceInput,
  request: MenuSourceAcquisitionRequest,
): boolean => {
  const expectedRestaurant = restaurantContextFromMenuSourceRequest(request);
  const actualRestaurant = source.restaurantContext;
  return (
    source.source.sourceType === "web_search_discovery" &&
    source.contractVersion === CONTRACT_VERSIONS.menuSource &&
    source.menuScope === request.menuScope &&
    source.requestedAt === request.requestedAt &&
    expectedRestaurant !== null &&
    actualRestaurant !== null &&
    actualRestaurant.restaurantId === expectedRestaurant.restaurantId &&
    actualRestaurant.candidateId === expectedRestaurant.candidateId &&
    actualRestaurant.googlePlaceId === expectedRestaurant.googlePlaceId &&
    actualRestaurant.resolutionState === expectedRestaurant.resolutionState
  );
};

const validSourceForRequest = (
  source: MenuSourceInput,
  request: MenuSourceAcquisitionRequest,
): boolean => {
  const expectedRestaurant = restaurantContextFromMenuSourceRequest(request);
  const actualRestaurant = source.restaurantContext;
  return (
    source.menuScope === request.menuScope &&
    source.requestedAt === request.requestedAt &&
    expectedRestaurant !== null &&
    actualRestaurant !== null &&
    actualRestaurant.restaurantId === expectedRestaurant.restaurantId &&
    actualRestaurant.candidateId === expectedRestaurant.candidateId &&
    actualRestaurant.googlePlaceId === expectedRestaurant.googlePlaceId &&
    actualRestaurant.resolutionState === expectedRestaurant.resolutionState
  );
};

const validCandidate = (candidate: WebSearchMenuSourceCandidate): boolean =>
  typeof candidate.sourceId === "string" &&
  candidate.sourceId.trim().length > 0 &&
  typeof candidate.locator === "string" &&
  candidate.locator.trim().length > 0 &&
  (candidate.title === null || typeof candidate.title === "string") &&
  Number.isInteger(candidate.providerOrdinal) &&
  candidate.providerOrdinal >= 1 &&
  Number.isInteger(candidate.rank) &&
  candidate.rank >= 1;

/**
 * Runs fallback discovery only for the exact typed no-source result from S1.2.
 * It never interprets search prose as menu content and never auto-identifies a restaurant.
 */
export class WebSearchMenuFallbackService {
  constructor(
    private readonly officialAcquisition: MenuSourceAcquisitionPort,
    private readonly discovery: WebSearchMenuSourceDiscoveryPort,
    private readonly collector: WebSearchMenuSourceCollectorPort,
  ) {}

  async resolve(
    input: MenuSourceAcquisitionRequest,
    context: PortInvocationContext,
  ): Promise<PortResult<MenuSourceFallbackState>> {
    PortInvocationContextSchema.parse(context);
    const requestResult = MenuSourceAcquisitionRequestSchema.safeParse(
      input,
    );
    if (
      !requestResult.success ||
      restaurantContextFromMenuSourceRequest(requestResult.data) === null
    ) {
      return { status: "error", error: publicError("INVALID_INPUT", context) };
    }
    const request = requestResult.data;
    let official: PortResult<MenuSourceInput>;
    try {
      official = await this.officialAcquisition.acquire(request, context);
    } catch {
      return {
        status: "error",
        error: publicError("UPSTREAM_UNAVAILABLE", context),
      };
    }

    if (official.status === "success") {
      const parsed = MenuSourceInputSchema.safeParse(official.value);
      if (
        !parsed.success ||
        !isOfficialSource(parsed.data) ||
        !validSourceForRequest(parsed.data, request)
      ) {
        return {
          status: "error",
          error: publicError("INVALID_UPSTREAM_RESULT", context),
        };
      }
      return {
        status: "success",
        value: {
          state: "official_source",
          provenance: "official",
          menuSource: cloneMenuSource(parsed.data),
        },
      };
    }
    if (official.status === "error") return official;
    const officialOutcome = PublicOutcomeSchema.safeParse(official.outcome);
    if (
      !officialOutcome.success ||
      officialOutcome.data.correlationId !== context.correlationId ||
      officialOutcome.data.stage !== "source_acquisition"
    ) {
      return {
        status: "error",
        error: publicError("INVALID_UPSTREAM_RESULT", context),
      };
    }
    if (officialOutcome.data.code !== "MENU_SOURCE_NOT_FOUND") {
      return { status: "outcome", outcome: officialOutcome.data };
    }

    const discovered = await this.discovery.discover(request, context);
    if (discovered.status !== "success") return discovered;
    if (
      !Array.isArray(discovered.value) ||
      discovered.value.length > 6 ||
      discovered.value.some((candidate) => !validCandidate(candidate))
    ) {
      return {
        status: "error",
        error: publicError("INVALID_UPSTREAM_RESULT", context),
      };
    }

    for (const candidate of discovered.value) {
      const collected = await this.collector.collect(
        { ...candidate },
        request,
        context,
      );
      if (collected.status === "unusable") continue;
      if (collected.status === "error") {
        return { status: "error", error: collected.error };
      }
      if (collected.status === "outcome") {
        return { status: "outcome", outcome: collected.outcome };
      }
      const parsed = MenuSourceInputSchema.safeParse(collected.value);
      if (!parsed.success || !validFallbackSource(parsed.data, request)) {
        return {
          status: "error",
          error: publicError("INVALID_UPSTREAM_RESULT", context),
        };
      }
      return {
        status: "success",
        value: {
          state: "fallback_source",
          provenance: "fallback",
          menuSource: cloneMenuSource(parsed.data),
        },
      };
    }

    return {
      status: "success",
      value: {
        state: "menu_only",
        provenance: "submission_only",
        menuSource: null,
        sourceLimitation: "no_usable_official_or_web_source",
        restaurantFactsAllowed: false,
      },
    };
  }
}
