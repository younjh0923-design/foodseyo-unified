import {
  selectDeterministicFakeResult,
  type AnalysisPublicationPort,
  type DeterministicFakePlan,
  type PortInvocationContext,
  type PortResult,
  type PublicationEligibleAnalysis,
  type PublicationReceipt,
} from "@foodseyo/contracts";

export class FakeAnalysisPublicationPort
  implements AnalysisPublicationPort
{
  #callCount = 0;

  constructor(
    private readonly plan: DeterministicFakePlan<PublicationReceipt>,
  ) {}

  get callCount(): number {
    return this.#callCount;
  }

  publish(
    _analysis: PublicationEligibleAnalysis,
    context: PortInvocationContext,
  ): Promise<PortResult<PublicationReceipt>> {
    this.#callCount += 1;
    return Promise.resolve(selectDeterministicFakeResult(context, this.plan));
  }
}
