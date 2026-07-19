import {
  PublicationEligibleAnalysisSchema,
  PublicationReceiptSchema,
  parseDeterministicFakePlan,
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
  private readonly plan: DeterministicFakePlan<PublicationReceipt>;

  constructor(
    plan: DeterministicFakePlan<PublicationReceipt>,
  ) {
    this.plan = parseDeterministicFakePlan(
      plan,
      PublicationReceiptSchema,
    );
  }

  get callCount(): number {
    return this.#callCount;
  }

  publish(
    analysis: PublicationEligibleAnalysis,
    context: PortInvocationContext,
  ): Promise<PortResult<PublicationReceipt>> {
    this.#callCount += 1;
    PublicationEligibleAnalysisSchema.parse(analysis);
    return Promise.resolve(selectDeterministicFakeResult(context, this.plan));
  }
}
