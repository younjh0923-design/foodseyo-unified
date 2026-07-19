import {
  SafeObservabilityEventSchema,
  canRecordDeterministicEvent,
  type PortInvocationContext,
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

  emit(
    event: SafeObservabilityEvent,
    context: PortInvocationContext,
  ): Promise<void> {
    this.#callCount += 1;
    SafeObservabilityEventSchema.parse(event);
    if (canRecordDeterministicEvent(context)) {
      this.#events.push(event);
    }
    return Promise.resolve();
  }
}
