import {
  RestaurantResolutionRequestSchema,
  RestaurantResolutionSchema,
  UiSafeOperationalEventSchema,
  canRecordDeterministicEvent,
  parseDeterministicFakePlan,
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

export {
  FoundationRestaurantResolutionPort,
  RestaurantResolutionCoordinator,
} from "./foundation.js";
export { GooglePlacesTextSearchAdapter } from "./google-places-adapter.js";
export {
  rankRestaurantCandidates,
  type RestaurantCandidateRankingClues,
  type RestaurantCandidateRankingOptions,
} from "./candidate-ranking.js";
export {
  createConfirmedRestaurantResolution,
  validateRestaurantCandidateSelection,
} from "./confirmation.js";
export { RestaurantResolutionService } from "./resolution-service.js";

export class FakeRestaurantResolutionPort
  implements RestaurantResolutionPort
{
  #callCount = 0;
  private readonly plan: DeterministicFakePlan<RestaurantResolution>;

  constructor(
    plan: DeterministicFakePlan<RestaurantResolution>,
  ) {
    this.plan = parseDeterministicFakePlan(
      plan,
      RestaurantResolutionSchema,
    );
  }

  get callCount(): number {
    return this.#callCount;
  }

  resolve(
    request: RestaurantResolutionRequest,
    context: PortInvocationContext,
  ): Promise<PortResult<RestaurantResolution>> {
    this.#callCount += 1;
    RestaurantResolutionRequestSchema.parse(request);
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
    context: PortInvocationContext,
  ): Promise<void> {
    this.#callCount += 1;
    UiSafeOperationalEventSchema.parse(event);
    if (canRecordDeterministicEvent(context)) {
      this.#events.push(event);
    }
    return Promise.resolve();
  }
}
