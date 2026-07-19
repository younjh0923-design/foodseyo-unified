import {
  PublicationEligibleAnalysisSchema,
  PublicationReceiptSchema,
  parseDeterministicFakePlan,
  parsePublicationReceiptForAnalysis,
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
    const parsedAnalysis = PublicationEligibleAnalysisSchema.parse(analysis);
    const result = selectDeterministicFakeResult(context, this.plan);
    if (result.status === "success") {
      return Promise.resolve({
        ...result,
        value: parsePublicationReceiptForAnalysis(
          parsedAnalysis,
          result.value,
        ),
      });
    }
    return Promise.resolve(result);
  }
}
