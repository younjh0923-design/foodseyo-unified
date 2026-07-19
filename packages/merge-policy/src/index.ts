import {
  EffectiveProfileMergeRequestSchema,
  EffectiveProfileMergeResultSchema,
  parseDeterministicFakePlan,
  selectDeterministicFakeResult,
  type DeterministicFakePlan,
  type EffectiveProfileMergePort,
  type EffectiveProfileMergeRequest,
  type EffectiveProfileMergeResult,
  type PortInvocationContext,
  type PortResult,
} from "@foodseyo/contracts";

export class FakeEffectiveProfileMergePort
  implements EffectiveProfileMergePort
{
  #callCount = 0;
  private readonly plan: DeterministicFakePlan<EffectiveProfileMergeResult>;

  constructor(
    plan: DeterministicFakePlan<EffectiveProfileMergeResult>,
  ) {
    this.plan = parseDeterministicFakePlan(
      plan,
      EffectiveProfileMergeResultSchema,
    );
  }

  get callCount(): number {
    return this.#callCount;
  }

  merge(
    request: EffectiveProfileMergeRequest,
    context: PortInvocationContext,
  ): Promise<PortResult<EffectiveProfileMergeResult>> {
    this.#callCount += 1;
    EffectiveProfileMergeRequestSchema.parse(request);
    return Promise.resolve(selectDeterministicFakeResult(context, this.plan));
  }
}
