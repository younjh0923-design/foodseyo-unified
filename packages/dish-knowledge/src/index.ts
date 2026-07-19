import {
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

  constructor(
    private readonly plan: DeterministicFakePlan<DishKnowledgeResult>,
  ) {}

  get callCount(): number {
    return this.#callCount;
  }

  findReviewedClaims(
    _request: DishKnowledgeRequest,
    context: PortInvocationContext,
  ): Promise<PortResult<DishKnowledgeResult>> {
    this.#callCount += 1;
    return Promise.resolve(selectDeterministicFakeResult(context, this.plan));
  }
}
