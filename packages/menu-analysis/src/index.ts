import {
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

  constructor(
    private readonly plan: DeterministicFakePlan<CompactMenuExtraction>,
  ) {}

  get callCount(): number {
    return this.#callCount;
  }

  extract(
    _input: MenuSourceInput,
    context: PortInvocationContext,
  ): Promise<PortResult<CompactMenuExtraction>> {
    this.#callCount += 1;
    return Promise.resolve(selectDeterministicFakeResult(context, this.plan));
  }
}

export class FakeCanonicalMenuValidationPort
  implements CanonicalMenuValidationPort
{
  #callCount = 0;

  constructor(
    private readonly plan: DeterministicFakePlan<CanonicalMenuAnalysis>,
  ) {}

  get callCount(): number {
    return this.#callCount;
  }

  validate(
    _request: CanonicalValidationRequest,
    context: PortInvocationContext,
  ): Promise<PortResult<CanonicalMenuAnalysis>> {
    this.#callCount += 1;
    return Promise.resolve(selectDeterministicFakeResult(context, this.plan));
  }
}

export class FakeConstrainedExplanationPort
  implements ConstrainedExplanationPort
{
  #callCount = 0;

  constructor(
    private readonly plan: DeterministicFakePlan<ConstrainedExplanation>,
  ) {}

  get callCount(): number {
    return this.#callCount;
  }

  render(
    _analysis: CanonicalMenuAnalysis,
    context: PortInvocationContext,
  ): Promise<PortResult<ConstrainedExplanation>> {
    this.#callCount += 1;
    return Promise.resolve(selectDeterministicFakeResult(context, this.plan));
  }
}

export class FakeAnalysisWorkflowPort implements AnalysisWorkflowPort {
  #callCount = 0;

  constructor(
    private readonly plan: DeterministicFakePlan<AnalysisApplicationResult>,
  ) {}

  get callCount(): number {
    return this.#callCount;
  }

  run(
    _request: AnalysisWorkflowRequest,
    context: PortInvocationContext,
  ): Promise<PortResult<AnalysisApplicationResult>> {
    this.#callCount += 1;
    return Promise.resolve(selectDeterministicFakeResult(context, this.plan));
  }
}
