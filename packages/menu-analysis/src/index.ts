import {
  AnalysisApplicationResultSchema,
  AnalysisWorkflowRequestSchema,
  CanonicalMenuAnalysisSchema,
  CanonicalValidationRequestSchema,
  CompactMenuExtractionSchema,
  ConstrainedExplanationSchema,
  MenuSourceInputSchema,
  parseDeterministicFakePlan,
  selectDeterministicFakeResult,
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
} from "@foodseyo/contracts";

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
    CanonicalMenuAnalysisSchema.parse(analysis);
    return Promise.resolve(selectDeterministicFakeResult(context, this.plan));
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
