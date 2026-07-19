import {
  selectDeterministicFakeResult,
  type DeterministicFakePlan,
  type PortInvocationContext,
  type PortResult,
  type RestaurantResolution,
  type RestaurantResolutionPort,
  type RestaurantResolutionRequest,
  type UiOperationalEventPort,
  type UiSafeOperationalEvent,
} from "@foodseyo/contracts";

export class FakeRestaurantResolutionPort
  implements RestaurantResolutionPort
{
  #callCount = 0;

  constructor(
    private readonly plan: DeterministicFakePlan<RestaurantResolution>,
  ) {}

  get callCount(): number {
    return this.#callCount;
  }

  resolve(
    _request: RestaurantResolutionRequest,
    context: PortInvocationContext,
  ): Promise<PortResult<RestaurantResolution>> {
    this.#callCount += 1;
    return Promise.resolve(selectDeterministicFakeResult(context, this.plan));
  }
}

export class FakeUiOperationalEventPort
  implements UiOperationalEventPort
{
  #callCount = 0;
  readonly #events: UiSafeOperationalEvent[] = [];

  get callCount(): number {
    return this.#callCount;
  }

  get events(): readonly UiSafeOperationalEvent[] {
    return [...this.#events];
  }

  emit(
    event: UiSafeOperationalEvent,
    _context: PortInvocationContext,
  ): Promise<void> {
    this.#callCount += 1;
    this.#events.push(event);
    return Promise.resolve();
  }
}
