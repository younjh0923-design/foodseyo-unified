import {
  DishKnowledgeRequestSchema,
  DishKnowledgeResultSchema,
  parseDeterministicFakePlan,
  selectDeterministicFakeResult,
  type DeterministicFakePlan,
  type DishKnowledgePort,
  type DishKnowledgeRequest,
  type DishKnowledgeResult,
  type PortInvocationContext,
  type PortResult,
} from "@foodseyo/contracts";

export class FakeDishKnowledgePort implements DishKnowledgePort {
  #callCount = 0;
  private readonly plan: DeterministicFakePlan<DishKnowledgeResult>;

  constructor(
    plan: DeterministicFakePlan<DishKnowledgeResult>,
  ) {
    this.plan = parseDeterministicFakePlan(
      plan,
      DishKnowledgeResultSchema,
    );
  }

  get callCount(): number {
    return this.#callCount;
  }

  findReviewedClaims(
    request: DishKnowledgeRequest,
    context: PortInvocationContext,
  ): Promise<PortResult<DishKnowledgeResult>> {
    this.#callCount += 1;
    DishKnowledgeRequestSchema.parse(request);
    return Promise.resolve(selectDeterministicFakeResult(context, this.plan));
  }
}
