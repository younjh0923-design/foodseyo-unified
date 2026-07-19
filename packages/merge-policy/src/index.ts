import {
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

  constructor(
    private readonly plan: DeterministicFakePlan<EffectiveProfileMergeResult>,
  ) {}

  get callCount(): number {
    return this.#callCount;
  }

  merge(
    _request: EffectiveProfileMergeRequest,
    context: PortInvocationContext,
  ): Promise<PortResult<EffectiveProfileMergeResult>> {
    this.#callCount += 1;
    return Promise.resolve(selectDeterministicFakeResult(context, this.plan));
  }
}
