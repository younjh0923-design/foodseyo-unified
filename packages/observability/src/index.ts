import {
  type SafeObservabilityEvent,
  type SafeObservabilityPort,
} from "@foodseyo/contracts";

export class FakeSafeObservabilityPort implements SafeObservabilityPort {
  #callCount = 0;
  readonly #events: SafeObservabilityEvent[] = [];

  get callCount(): number {
    return this.#callCount;
  }

  get events(): readonly SafeObservabilityEvent[] {
    return [...this.#events];
  }

  emit(event: SafeObservabilityEvent): Promise<void> {
    this.#callCount += 1;
    this.#events.push(event);
    return Promise.resolve();
  }
}
