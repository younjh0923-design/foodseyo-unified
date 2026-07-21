import {
  AnalysisApplicationResultSchema,
  AnalysisWorkflowRequestSchema,
  CanonicalMenuAnalysisSchema,
  CanonicalValidationRequestSchema,
  CompactMenuExtractionSchema,
  ConstrainedExplanationSchema,
  MenuSourceInputSchema,
  PortInvocationContextSchema,
  PUBLIC_ERROR_REGISTRY,
  PublicErrorEnvelopeSchema,
  isPublicationEligibleAnalysis,
  isTimeoutAbortSignal,
  parseConstrainedExplanationForAnalysis,
  parseDeterministicFakePlan,
  selectDeterministicFakeResult,
  type AnalysisPublicationPort,
  type AnalysisApplicationResult,
  type AnalysisWorkflowPort,
  type AnalysisWorkflowRequest,
  type CanonicalMenuAnalysis,
  type CanonicalMenuValidationPort,
  type CanonicalValidationRequest,
  type CompactMenuExtraction,
  type CompactMenuExtractionPort,
  type ConstrainedExplanation,
  type ConstrainedExplanationPort,
  type DeterministicFakePlan,
  type MenuSourceInput,
  type PortInvocationContext,
  type PortResult,
  type PublicErrorCode,
  type PublicErrorEnvelope,
  type RestaurantResolution,
} from "@foodseyo/contracts";

export * from "./canonical-pipeline.js";
export {
  CompactMenuExtractionService,
} from "./compact-menu-extraction-service.js";

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
    typeof left === "object" ||
    typeof right === "object" ||
    left === null ||
    right === null
  ) {
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
  }
  return false;
};

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

const interruptedResult = <T>(
  context: PortInvocationContext,
): PortResult<T> | null => {
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

const restaurantContextMatchesResolution = (
  restaurantContext: MenuSourceInput["restaurantContext"],
  resolution: RestaurantResolution,
): boolean => {
  if (restaurantContext === null) {
    return (
      resolution.state !== "user_confirmed" &&
      resolution.state !== "externally_verified"
    );
  }
  const selectedCandidate = resolution.candidates.find(
    (candidate) => candidate.candidateId === restaurantContext.candidateId,
  );
  return (
    restaurantContext.restaurantId === resolution.restaurantId &&
    restaurantContext.candidateId === resolution.selectedCandidateId &&
    restaurantContext.resolutionState === resolution.state &&
    selectedCandidate?.googlePlaceId === restaurantContext.googlePlaceId
  );
};

const sourceMatchesResolution = (
  source: MenuSourceInput,
  resolution: RestaurantResolution,
): boolean =>
  restaurantContextMatchesResolution(source.restaurantContext, resolution);

const extractionMatchesSource = (
  extraction: CompactMenuExtraction,
  source: MenuSourceInput,
): boolean =>
  contractValuesEqual(extraction.source, source.source) &&
  contractValuesEqual(extraction.restaurantContext, source.restaurantContext) &&
  extraction.menuScope === source.menuScope;

const analysisMatchesValidationRequest = (
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
    )
  ) {
    return false;
  }

  const extractedItems = request.extraction.sections.flatMap((section) =>
    section.items.map((item) => ({
      sectionIndex: section.sectionIndex,
      itemIndex: item.itemIndex,
      name: item.name,
      description: item.description,
      price: item.price,
      optionTexts: item.optionTexts,
      sourceEvidence: item.sourceEvidence,
    })),
  );
  if (
    analysis.menuItems.length !== extractedItems.length ||
    analysis.menuItems.some((item) => {
      const extracted = extractedItems.find(
        (candidate) =>
          candidate.sectionIndex === item.sectionIndex &&
          candidate.itemIndex === item.itemIndex,
      );
      return (
        extracted === undefined ||
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

  if (analysis.menuVersion === null) {
    return restaurantContextMatchesResolution(
      request.extraction.restaurantContext,
      request.restaurantResolution,
    );
  }
  const restaurantContext = request.extraction.restaurantContext;
  return (
    restaurantContext !== null &&
    restaurantContextMatchesResolution(
      restaurantContext,
      request.restaurantResolution,
    ) &&
    analysis.menuVersion.restaurantId === restaurantContext.restaurantId &&
    analysis.menuVersion.menuScope === request.extraction.menuScope &&
    analysis.menuVersion.collectedAt === request.extraction.source.collectedAt
  );
};

export class FakeCompactMenuExtractionPort
  implements CompactMenuExtractionPort
{
  #callCount = 0;
  private readonly plan: DeterministicFakePlan<CompactMenuExtraction>;

  constructor(
    plan: DeterministicFakePlan<CompactMenuExtraction>,
  ) {
    this.plan = parseDeterministicFakePlan(
      plan,
      CompactMenuExtractionSchema,
    );
  }

  get callCount(): number {
    return this.#callCount;
  }

  extract(
    input: MenuSourceInput,
    context: PortInvocationContext,
  ): Promise<PortResult<CompactMenuExtraction>> {
    this.#callCount += 1;
    MenuSourceInputSchema.parse(input);
    return Promise.resolve(selectDeterministicFakeResult(context, this.plan));
  }
}

export class FakeCanonicalMenuValidationPort
  implements CanonicalMenuValidationPort
{
  #callCount = 0;
  private readonly plan: DeterministicFakePlan<CanonicalMenuAnalysis>;

  constructor(
    plan: DeterministicFakePlan<CanonicalMenuAnalysis>,
  ) {
    this.plan = parseDeterministicFakePlan(
      plan,
      CanonicalMenuAnalysisSchema,
    );
  }

  get callCount(): number {
    return this.#callCount;
  }

  validate(
    request: CanonicalValidationRequest,
    context: PortInvocationContext,
  ): Promise<PortResult<CanonicalMenuAnalysis>> {
    this.#callCount += 1;
    CanonicalValidationRequestSchema.parse(request);
    return Promise.resolve(selectDeterministicFakeResult(context, this.plan));
  }
}

export class FakeConstrainedExplanationPort
  implements ConstrainedExplanationPort
{
  #callCount = 0;
  private readonly plan: DeterministicFakePlan<ConstrainedExplanation>;

  constructor(
    plan: DeterministicFakePlan<ConstrainedExplanation>,
  ) {
    this.plan = parseDeterministicFakePlan(
      plan,
      ConstrainedExplanationSchema,
    );
  }

  get callCount(): number {
    return this.#callCount;
  }

  render(
    analysis: CanonicalMenuAnalysis,
    context: PortInvocationContext,
  ): Promise<PortResult<ConstrainedExplanation>> {
    this.#callCount += 1;
    const parsedAnalysis = CanonicalMenuAnalysisSchema.parse(analysis);
    const result = selectDeterministicFakeResult(context, this.plan);
    if (result.status === "success") {
      return Promise.resolve({
        ...result,
        value: parseConstrainedExplanationForAnalysis(
          parsedAnalysis,
          result.value,
        ),
      });
    }
    return Promise.resolve(result);
  }
}

export class FakeAnalysisWorkflowPort implements AnalysisWorkflowPort {
  #callCount = 0;
  private readonly plan: DeterministicFakePlan<AnalysisApplicationResult>;

  constructor(
    plan: DeterministicFakePlan<AnalysisApplicationResult>,
  ) {
    this.plan = parseDeterministicFakePlan(
      plan,
      AnalysisApplicationResultSchema,
    );
  }

  get callCount(): number {
    return this.#callCount;
  }

  run(
    request: AnalysisWorkflowRequest,
    context: PortInvocationContext,
  ): Promise<PortResult<AnalysisApplicationResult>> {
    this.#callCount += 1;
    AnalysisWorkflowRequestSchema.parse(request);
    return Promise.resolve(selectDeterministicFakeResult(context, this.plan));
  }
}

export class CanonicalMenuValidationService
  implements CanonicalMenuValidationPort
{
  #callCount = 0;

  constructor(
    private readonly normalize: (
      request: CanonicalValidationRequest,
    ) => unknown | Promise<unknown>,
  ) {}

  get callCount(): number {
    return this.#callCount;
  }

  async validate(
    request: CanonicalValidationRequest,
    context: PortInvocationContext,
  ): Promise<PortResult<CanonicalMenuAnalysis>> {
    this.#callCount += 1;
    PortInvocationContextSchema.parse(context);
    const interrupted = interruptedResult<CanonicalMenuAnalysis>(context);
    if (interrupted !== null) {
      return interrupted;
    }

    const requestResult = CanonicalValidationRequestSchema.safeParse(request);
    if (!requestResult.success) {
      return {
        status: "error",
        error: publicError("INVALID_INPUT", context),
      };
    }

    try {
      const candidate = await this.normalize(requestResult.data);
      const interruptedAfterNormalize =
        interruptedResult<CanonicalMenuAnalysis>(context);
      if (interruptedAfterNormalize !== null) {
        return interruptedAfterNormalize;
      }
      const analysisResult = CanonicalMenuAnalysisSchema.safeParse(candidate);
      if (
        !analysisResult.success ||
        !analysisMatchesValidationRequest(
          analysisResult.data,
          requestResult.data,
        )
      ) {
        return {
          status: "error",
          error: publicError("INVALID_UPSTREAM_RESULT", context),
        };
      }
      return {
        status: "success",
        value: analysisResult.data,
      };
    } catch {
      const interruptedAfterNormalizeFailure =
        interruptedResult<CanonicalMenuAnalysis>(context);
      if (interruptedAfterNormalizeFailure !== null) {
        return interruptedAfterNormalizeFailure;
      }
      return {
        status: "error",
        error: publicError("INVALID_UPSTREAM_RESULT", context),
      };
    }
  }
}

export class AnalysisApplicationService implements AnalysisWorkflowPort {
  #callCount = 0;

  constructor(
    private readonly extractionPort: CompactMenuExtractionPort,
    private readonly canonicalValidationPort: CanonicalMenuValidationPort,
    private readonly explanationPort: ConstrainedExplanationPort,
    private readonly publicationPort: AnalysisPublicationPort,
  ) {}

  get callCount(): number {
    return this.#callCount;
  }

  async run(
    request: AnalysisWorkflowRequest,
    context: PortInvocationContext,
  ): Promise<PortResult<AnalysisApplicationResult>> {
    this.#callCount += 1;
    PortInvocationContextSchema.parse(context);
    const interrupted = interruptedResult<AnalysisApplicationResult>(context);
    if (interrupted !== null) {
      return interrupted;
    }

    const requestResult = AnalysisWorkflowRequestSchema.safeParse(request);
    if (
      !requestResult.success ||
      !sourceMatchesResolution(
        requestResult.data.menuSource,
        requestResult.data.restaurantResolution,
      )
    ) {
      return {
        status: "error",
        error: publicError("INVALID_INPUT", context),
      };
    }

    const extractionResult = await this.extractionPort.extract(
      requestResult.data.menuSource,
      context,
    );
    if (extractionResult.status !== "success") {
      return extractionResult;
    }
    const extraction = CompactMenuExtractionSchema.safeParse(
      extractionResult.value,
    );
    if (
      !extraction.success ||
      !extractionMatchesSource(
        extraction.data,
        requestResult.data.menuSource,
      )
    ) {
      return {
        status: "error",
        error: publicError("INVALID_UPSTREAM_RESULT", context),
      };
    }

    const analysisResult = await this.canonicalValidationPort.validate(
      {
        extraction: extraction.data,
        restaurantResolution: requestResult.data.restaurantResolution,
      },
      context,
    );
    if (analysisResult.status !== "success") {
      return analysisResult;
    }
    const analysis = CanonicalMenuAnalysisSchema.safeParse(
      analysisResult.value,
    );
    if (!analysis.success) {
      return {
        status: "error",
        error: publicError("INVALID_UPSTREAM_RESULT", context),
      };
    }

    const explanationResult = await this.explanationPort.render(
      analysis.data,
      context,
    );
    if (explanationResult.status !== "success") {
      return explanationResult;
    }
    let explanation: ConstrainedExplanation;
    try {
      explanation = parseConstrainedExplanationForAnalysis(
        analysis.data,
        explanationResult.value,
      );
    } catch {
      return {
        status: "error",
        error: publicError("INVALID_UPSTREAM_RESULT", context),
      };
    }

    let publication = null;
    if (isPublicationEligibleAnalysis(analysis.data)) {
      const publicationResult = await this.publicationPort.publish(
        analysis.data,
        context,
      );
      if (publicationResult.status !== "success") {
        return publicationResult;
      }
      publication = publicationResult.value;
    }

    const result = AnalysisApplicationResultSchema.safeParse({
      analysis: analysis.data,
      explanation,
      publication,
    });
    if (!result.success) {
      return {
        status: "error",
        error: publicError("INTERNAL_ERROR", context),
      };
    }
    return {
      status: "success",
      value: result.data,
    };
  }
}
