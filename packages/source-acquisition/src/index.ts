import {
  selectDeterministicFakeResult,
  type DeterministicFakePlan,
  type MenuSourceAcquisitionPort,
  type MenuSourceAcquisitionRequest,
  type MenuSourceInput,
  type PortInvocationContext,
  type PortResult,
} from "@foodseyo/contracts";

export class FakeMenuSourceAcquisitionPort
  implements MenuSourceAcquisitionPort
{
  #callCount = 0;

  constructor(
    private readonly plan: DeterministicFakePlan<MenuSourceInput>,
  ) {}

  get callCount(): number {
    return this.#callCount;
  }

  acquire(
    _request: MenuSourceAcquisitionRequest,
    context: PortInvocationContext,
  ): Promise<PortResult<MenuSourceInput>> {
    this.#callCount += 1;
    return Promise.resolve(selectDeterministicFakeResult(context, this.plan));
  }
}
