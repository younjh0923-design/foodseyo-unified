import {
  CanonicalMenuAnalysisSchema,
  PUBLIC_ERROR_REGISTRY,
  PublicErrorEnvelopeSchema,
  type CanonicalMenuAnalysis,
  type CompactMenuExtraction,
  type PublicErrorCode,
  type PublicErrorEnvelope,
  type RestaurantResolution,
} from "@foodseyo/contracts/boundary-dtos";
import {
  CanonicalValidationRequestSchema,
  PortInvocationContextSchema,
  PublicationEligibleAnalysisSchema,
  isTimeoutAbortSignal,
  parsePublicationReceiptForAnalysis,
  type CanonicalMenuValidationPort,
  type CanonicalValidationRequest,
  type PortInvocationContext,
  type PortResult,
  type PublicationEligibleAnalysis,
} from "@foodseyo/contracts/module-interfaces";
import type {
  ExactAnalysisIdentity,
  MvpAnalysisRepository,
} from "@foodseyo/database";

export interface CanonicalPipelinePersistenceOptions {
  readonly identity: ExactAnalysisIdentity;
  readonly runId: string;
  readonly persistedAt: string;
  readonly expiresAt: string;
  readonly generateId: () => string;
}

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
): PortResult<CanonicalMenuAnalysis> | null => {
  if (!context.signal.aborted) {
    return null;
  }
  return {
    status: "error",
    error: publicError(
      isTimeoutAbortSignal(context.signal)
        ? "UPSTREAM_TIMEOUT"
        : "ANALYSIS_TEMPORARILY_UNAVAILABLE",
      context,
    ),
  };
};

const contractValuesEqual = (left: unknown, right: unknown): boolean => {
  if (Object.is(left, right)) {
    return true;
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((item, index) => contractValuesEqual(item, right[index]))
    );
  }
  if (
    typeof left !== "object" ||
    typeof right !== "object" ||
    left === null ||
    right === null
  ) {
    return false;
  }
  const leftRecord = left as Readonly<Record<string, unknown>>;
  const rightRecord = right as Readonly<Record<string, unknown>>;
  const leftKeys = Object.keys(leftRecord).sort();
  const rightKeys = Object.keys(rightRecord).sort();
  return (
    contractValuesEqual(leftKeys, rightKeys) &&
    leftKeys.every((key) =>
      contractValuesEqual(leftRecord[key], rightRecord[key]),
    )
  );
};

const restaurantContextMatchesResolution = (
  extraction: CompactMenuExtraction,
  resolution: RestaurantResolution,
): boolean => {
  const restaurantContext = extraction.restaurantContext;
  if (restaurantContext === null) {
    return (
      resolution.state !== "user_confirmed" &&
      resolution.state !== "externally_verified"
    );
  }
  if (
    restaurantContext.restaurantId === null ||
    (resolution.state !== "user_confirmed" &&
      resolution.state !== "externally_verified")
  ) {
    return false;
  }
  const selectedCandidate = resolution.candidates.find(
    (candidate) => candidate.candidateId === restaurantContext.candidateId,
  );
  return (
    resolution.restaurantId === restaurantContext.restaurantId &&
    resolution.selectedCandidateId === restaurantContext.candidateId &&
    resolution.state === restaurantContext.resolutionState &&
    selectedCandidate?.googlePlaceId === restaurantContext.googlePlaceId
  );
};

const requestBindingsAreValid = (
  request: CanonicalValidationRequest,
  identity: ExactAnalysisIdentity,
): boolean =>
  request.extraction.source.sourceRef.length > 0 &&
  identity.sourceRef === request.extraction.source.sourceRef &&
  request.extraction.sections.every((section) =>
    section.items.every((item) =>
      item.sourceEvidence.every(
        (evidence) =>
          evidence.sourceRef === request.extraction.source.sourceRef,
      ),
    ),
  ) &&
  restaurantContextMatchesResolution(
    request.extraction,
    request.restaurantResolution,
  );

const canonicalMatchesRequest = (
  analysis: CanonicalMenuAnalysis,
  request: CanonicalValidationRequest,
): boolean => {
  if (
    !contractValuesEqual(analysis.source, request.extraction.source) ||
    !contractValuesEqual(
      analysis.restaurantResolution,
      request.restaurantResolution,
    ) ||
    !contractValuesEqual(
      analysis.warningCodes,
      request.extraction.warningCodes,
    ) ||
    analysis.dishCandidates.length !== 0 ||
    analysis.dishMatches.length !== 0 ||
    analysis.menuItemClaims.length !== 0 ||
    analysis.dishClaims.length !== 0 ||
    analysis.effectiveProfiles.length !== 0
  ) {
    return false;
  }

  const extractedItems = request.extraction.sections.flatMap((section) =>
    section.items.map((item) => ({
      ...item,
      sectionIndex: section.sectionIndex,
    })),
  );
  if (
    analysis.menuItems.length !== extractedItems.length ||
    analysis.menuItems.some((item, index) => {
      const extracted = extractedItems[index];
      return (
        extracted === undefined ||
        item.sectionIndex !== extracted.sectionIndex ||
        item.itemIndex !== extracted.itemIndex ||
        item.name !== extracted.name ||
        item.description !== extracted.description ||
        !contractValuesEqual(item.price, extracted.price) ||
        !contractValuesEqual(item.optionTexts, extracted.optionTexts) ||
        !contractValuesEqual(item.sourceEvidence, extracted.sourceEvidence)
      );
    })
  ) {
    return false;
  }

  const restaurantContext = request.extraction.restaurantContext;
  if (restaurantContext === null) {
    return (
      analysis.publicationState === "analysis_only" &&
      analysis.menuVersion === null &&
      analysis.menuItems.every((item) => item.menuVersionId === null)
    );
  }
  return (
    restaurantContext.restaurantId !== null &&
    analysis.publicationState === "eligible" &&
    analysis.menuVersion !== null &&
    analysis.menuVersion.restaurantId === restaurantContext.restaurantId &&
    analysis.menuVersion.menuScope === request.extraction.menuScope &&
    analysis.menuVersion.collectedAt === request.extraction.source.collectedAt &&
    contractValuesEqual(analysis.menuVersion.sourceRefs, [
      request.extraction.source.sourceRef,
    ]) &&
    analysis.menuItems.every(
      (item) => item.menuVersionId === analysis.menuVersion?.menuVersionId,
    )
  );
};

const rebindEligibleRestaurant = (
  analysis: PublicationEligibleAnalysis,
  restaurantId: string,
): PublicationEligibleAnalysis =>
  PublicationEligibleAnalysisSchema.parse({
    ...analysis,
    restaurantResolution: {
      ...analysis.restaurantResolution,
      restaurantId,
    },
    menuVersion: {
      ...analysis.menuVersion,
      restaurantId,
    },
  });

export class CanonicalPipelineApplicationService {
  #callCount = 0;

  constructor(
    private readonly canonicalValidationPort: CanonicalMenuValidationPort,
    private readonly repository: MvpAnalysisRepository,
    private readonly persistence: CanonicalPipelinePersistenceOptions,
  ) {}

  get callCount(): number {
    return this.#callCount;
  }

  async run(
    request: CanonicalValidationRequest,
    context: PortInvocationContext,
  ): Promise<PortResult<CanonicalMenuAnalysis>> {
    this.#callCount += 1;
    PortInvocationContextSchema.parse(context);
    const interrupted = interruptedResult(context);
    if (interrupted !== null) {
      return interrupted;
    }

    const requestResult = CanonicalValidationRequestSchema.safeParse(request);
    if (
      !requestResult.success ||
      !requestBindingsAreValid(requestResult.data, this.persistence.identity)
    ) {
      return { status: "error", error: publicError("INVALID_INPUT", context) };
    }

    let validationResult: PortResult<CanonicalMenuAnalysis>;
    try {
      validationResult = await this.canonicalValidationPort.validate(
        requestResult.data,
        context,
      );
    } catch {
      return {
        status: "error",
        error: publicError("INVALID_UPSTREAM_RESULT", context),
      };
    }
    if (validationResult.status !== "success") {
      return validationResult;
    }
    const interruptedAfterValidation = interruptedResult(context);
    if (interruptedAfterValidation !== null) {
      return interruptedAfterValidation;
    }

    const validated = CanonicalMenuAnalysisSchema.safeParse(
      validationResult.value,
    );
    if (
      !validated.success ||
      !canonicalMatchesRequest(validated.data, requestResult.data)
    ) {
      return {
        status: "error",
        error: publicError("INVALID_UPSTREAM_RESULT", context),
      };
    }

    let canonical: CanonicalMenuAnalysis;
    try {
      canonical = CanonicalMenuAnalysisSchema.parse({
        ...validated.data,
        analysisId: this.persistence.generateId(),
      });
    } catch {
      return { status: "error", error: publicError("INTERNAL_ERROR", context) };
    }

    try {
      if (canonical.publicationState === "analysis_only") {
        const persisted = await this.repository.persistAnalysisOnly({
          analysis: canonical,
          expiresAt: this.persistence.expiresAt,
          identity: this.persistence.identity,
          persistedAt: this.persistence.persistedAt,
          runId: this.persistence.runId,
        });
        const parsedPersisted = CanonicalMenuAnalysisSchema.parse(persisted);
        if (
          parsedPersisted.publicationState !== "analysis_only" ||
          parsedPersisted.menuVersion !== null ||
          !contractValuesEqual(parsedPersisted, canonical)
        ) {
          throw new Error("persistence state mismatch");
        }
        return { status: "success", value: parsedPersisted };
      }

      const eligible = PublicationEligibleAnalysisSchema.parse(canonical);
      const restaurantContext = requestResult.data.extraction.restaurantContext;
      const selectedCandidate = requestResult.data.restaurantResolution.candidates.find(
        (candidate) =>
          candidate.candidateId ===
          requestResult.data.restaurantResolution.selectedCandidateId,
      );
      if (
        restaurantContext?.restaurantId === null ||
        restaurantContext === null ||
        selectedCandidate === undefined
      ) {
        throw new Error("eligible publication lacks confirmed restaurant");
      }

      let publishedAnalysis: PublicationEligibleAnalysis | null = null;
      const receipt = await this.repository.publishEligibleAnalysis({
        buildAnalysis: (restaurantId) => {
          publishedAnalysis = rebindEligibleRestaurant(eligible, restaurantId);
          return publishedAnalysis;
        },
        expiresAt: this.persistence.expiresAt,
        externalReferenceId: this.persistence.generateId(),
        googlePlaceId: restaurantContext.googlePlaceId,
        identity: this.persistence.identity,
        operationId: this.persistence.generateId(),
        persistedAt: this.persistence.persistedAt,
        reservedRestaurantId: restaurantContext.restaurantId,
        restaurantDisplayName: selectedCandidate.displayName,
        runId: this.persistence.runId,
      });
      const finalAnalysis = publishedAnalysis;
      if (finalAnalysis === null) {
        throw new Error("publication did not build canonical analysis");
      }
      parsePublicationReceiptForAnalysis(finalAnalysis, receipt);
      return {
        status: "success",
        value: CanonicalMenuAnalysisSchema.parse(finalAnalysis),
      };
    } catch {
      return { status: "error", error: publicError("INTERNAL_ERROR", context) };
    }
  }
}
