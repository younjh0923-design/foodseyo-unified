import {
  MODULE_INTERFACE_VERSION,
  PortInvocationContextSchema,
  PUBLIC_ERROR_REGISTRY,
  PublicationEligibleAnalysisSchema,
  PublicationReceiptSchema,
  PublicErrorEnvelopeSchema,
  isPublicationEligibleAnalysis,
  isTimeoutAbortSignal,
  parseDeterministicFakePlan,
  parsePublicationReceiptForAnalysis,
  selectDeterministicFakeResult,
  type AnalysisPublicationPort,
  type CanonicalMenuAnalysis,
  type DeterministicFakePlan,
  type EffectiveDishProfile,
  type MenuItem,
  type PortInvocationContext,
  type PortResult,
  type PublicationEligibleAnalysis,
  type PublicationReceipt,
  type PublicErrorCode,
  type PublicErrorEnvelope,
  type RestaurantMenuVersion,
} from "@foodseyo/contracts";

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

class SimulatedPersistenceFailure extends Error {
  constructor() {
    super("simulated persistence failure");
    this.name = "SimulatedPersistenceFailure";
  }
}

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

export class DeterministicFakeAnalysisRepository {
  #analyses: CanonicalMenuAnalysis[] = [];
  #menuVersions: RestaurantMenuVersion[] = [];
  #menuItems: MenuItem[] = [];
  #effectiveProfiles: EffectiveDishProfile[] = [];
  #receipts: PublicationReceipt[] = [];
  #transactionCount = 0;
  #commitCount = 0;
  #rollbackCount = 0;
  #writeAttemptCount = 0;

  constructor(private readonly failOnWrite: number | null = null) {
    if (
      failOnWrite !== null &&
      (!Number.isSafeInteger(failOnWrite) || failOnWrite <= 0)
    ) {
      throw new RangeError("failOnWrite must be a positive integer or null");
    }
  }

  get analyses(): readonly CanonicalMenuAnalysis[] {
    return [...this.#analyses];
  }

  get menuVersions(): readonly RestaurantMenuVersion[] {
    return [...this.#menuVersions];
  }

  get menuItems(): readonly MenuItem[] {
    return [...this.#menuItems];
  }

  get effectiveProfiles(): readonly EffectiveDishProfile[] {
    return [...this.#effectiveProfiles];
  }

  get receipts(): readonly PublicationReceipt[] {
    return [...this.#receipts];
  }

  get transactionCount(): number {
    return this.#transactionCount;
  }

  get commitCount(): number {
    return this.#commitCount;
  }

  get rollbackCount(): number {
    return this.#rollbackCount;
  }

  get writeAttemptCount(): number {
    return this.#writeAttemptCount;
  }

  publishAtomically(
    analysis: PublicationEligibleAnalysis,
    receipt: PublicationReceipt,
  ): void {
    this.#transactionCount += 1;
    const stagedAnalyses = [...this.#analyses];
    const stagedMenuVersions = [...this.#menuVersions];
    const stagedMenuItems = [...this.#menuItems];
    const stagedProfiles = [...this.#effectiveProfiles];
    const stagedReceipts = [...this.#receipts];
    let transactionWrite = 0;
    const write = (operation: () => void) => {
      transactionWrite += 1;
      this.#writeAttemptCount += 1;
      if (this.failOnWrite === transactionWrite) {
        throw new SimulatedPersistenceFailure();
      }
      operation();
    };

    try {
      write(() => stagedAnalyses.push(analysis));
      write(() => stagedMenuVersions.push(analysis.menuVersion));
      for (const item of analysis.menuItems) {
        write(() => stagedMenuItems.push(item));
      }
      for (const profile of analysis.effectiveProfiles) {
        write(() => stagedProfiles.push(profile));
      }
      write(() => stagedReceipts.push(receipt));
      this.#analyses = stagedAnalyses;
      this.#menuVersions = stagedMenuVersions;
      this.#menuItems = stagedMenuItems;
      this.#effectiveProfiles = stagedProfiles;
      this.#receipts = stagedReceipts;
      this.#commitCount += 1;
    } catch (error) {
      this.#rollbackCount += 1;
      throw error;
    }
  }
}

export class TransactionalAnalysisPublicationService
  implements AnalysisPublicationPort
{
  #callCount = 0;

  constructor(
    private readonly repository: DeterministicFakeAnalysisRepository,
    private readonly publishedAt: string,
  ) {}

  get callCount(): number {
    return this.#callCount;
  }

  publish(
    analysis: PublicationEligibleAnalysis,
    context: PortInvocationContext,
  ): Promise<PortResult<PublicationReceipt>> {
    this.#callCount += 1;
    PortInvocationContextSchema.parse(context);
    if (context.signal.aborted) {
      return Promise.resolve({
        status: "error",
        error: publicError(
          isTimeoutAbortSignal(context.signal)
            ? "UPSTREAM_TIMEOUT"
            : "ANALYSIS_TEMPORARILY_UNAVAILABLE",
          context,
        ),
      });
    }
    const analysisResult = PublicationEligibleAnalysisSchema.safeParse(analysis);
    if (
      !analysisResult.success ||
      !isPublicationEligibleAnalysis(analysisResult.data)
    ) {
      return Promise.resolve({
        status: "error",
        error: publicError("INVALID_UPSTREAM_RESULT", context),
      });
    }
    const receiptResult = PublicationReceiptSchema.safeParse({
      contractVersion: MODULE_INTERFACE_VERSION,
      analysisId: analysisResult.data.analysisId,
      menuVersionId: analysisResult.data.menuVersion.menuVersionId,
      status: "published",
      publishedAt: this.publishedAt,
    });
    if (!receiptResult.success) {
      return Promise.resolve({
        status: "error",
        error: publicError("INTERNAL_ERROR", context),
      });
    }

    try {
      const receipt = parsePublicationReceiptForAnalysis(
        analysisResult.data,
        receiptResult.data,
      );
      this.repository.publishAtomically(analysisResult.data, receipt);
      return Promise.resolve({ status: "success", value: receipt });
    } catch {
      return Promise.resolve({
        status: "error",
        error: publicError("INTERNAL_ERROR", context),
      });
    }
  }
}
