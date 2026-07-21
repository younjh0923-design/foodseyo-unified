import {
  MenuSourceAcquisitionRequestSchema,
  PUBLIC_ERROR_REGISTRY,
  PortInvocationContextSchema,
  PublicErrorEnvelopeSchema,
  type MenuSourceAcquisitionRequest,
  type MenuSourceInput,
  type PortInvocationContext,
  type PortResult,
  type PublicErrorCode,
  type PublicErrorEnvelope,
} from "@foodseyo/contracts";

import {
  restaurantContextFromMenuSourceRequest,
  type TransientContentIdentity,
  type TransientContentIdentityPort,
} from "./foundation.js";
import { OfficialMenuCollectorService } from "./official-menu-collector.js";
import {
  isVerifiedOfficialMenuCollectorSelection,
  type VerifiedOfficialMenuCollectorSelection,
} from "./official-menu-collector-selection.js";
import {
  assembleCollectedOfficialMenuSourceInput,
  type CollectedOfficialMenuSourceAssemblyInput,
} from "./official-menu-source-input-assembler.js";

export interface OfficialMenuSourceAcquisitionOrchestrationInput {
  readonly request: MenuSourceAcquisitionRequest;
  readonly verifiedSelection: VerifiedOfficialMenuCollectorSelection;
}

export type CollectedOfficialMenuSourceAssembler = (
  input: CollectedOfficialMenuSourceAssemblyInput,
  context: PortInvocationContext,
) => PortResult<MenuSourceInput>;

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

const systemCollectionClock = (): string => new Date().toISOString();

/**
 * Collects one selected official source and projects only request-scoped,
 * transient identity into the frozen canonical pipeline input.
 */
export class OfficialMenuSourceAcquisitionOrchestrator {
  constructor(
    private readonly collector: OfficialMenuCollectorService,
    private readonly identities: TransientContentIdentityPort,
    private readonly collectionClock: () => string = systemCollectionClock,
    private readonly assemble: CollectedOfficialMenuSourceAssembler =
      assembleCollectedOfficialMenuSourceInput,
  ) {}

  async acquire(
    input: OfficialMenuSourceAcquisitionOrchestrationInput,
    context: PortInvocationContext,
  ): Promise<PortResult<MenuSourceInput>> {
    PortInvocationContextSchema.parse(context);
    if (
      typeof input !== "object" ||
      input === null ||
      Array.isArray(input) ||
      Object.keys(input).length !== 2 ||
      !("request" in input) ||
      !("verifiedSelection" in input)
    ) {
      return { status: "error", error: publicError("INVALID_INPUT", context) };
    }
    const requestResult = MenuSourceAcquisitionRequestSchema.safeParse(
      input.request,
    );
    const restaurantContext = requestResult.success
      ? restaurantContextFromMenuSourceRequest(requestResult.data)
      : null;
    if (
      !requestResult.success ||
      restaurantContext === null ||
      !isVerifiedOfficialMenuCollectorSelection(input.verifiedSelection) ||
      input.verifiedSelection.discoveryRequest.googlePlaceId !==
        restaurantContext.googlePlaceId ||
      input.verifiedSelection.discoveryRequest.restaurantId !==
        restaurantContext.restaurantId ||
      input.verifiedSelection.discoveryRequest.menuScope !==
        requestResult.data.menuScope ||
      input.verifiedSelection.discoveryCorrelationId !== context.correlationId
    ) {
      return { status: "error", error: publicError("INVALID_INPUT", context) };
    }

    const selection = input.verifiedSelection.selection;
    const collected = await this.collector.collect(selection, context);
    if (collected.status !== "success") {
      return collected;
    }

    let collectedAt: string;
    try {
      collectedAt = this.collectionClock();
    } catch {
      return {
        status: "error",
        error: publicError("INTERNAL_ERROR", context),
      };
    }

    let contentIdentity: TransientContentIdentity | null;
    try {
      contentIdentity = await this.identities.identify(
        { ...collected.value },
        context,
      );
    } catch {
      return {
        status: "error",
        error: publicError("UPSTREAM_UNAVAILABLE", context),
      };
    }
    if (contentIdentity === null) {
      return {
        status: "error",
        error: publicError("INVALID_UPSTREAM_RESULT", context),
      };
    }

    return this.assemble(
      {
        request: requestResult.data,
        selection: {
          candidate: { ...selection.candidate },
          collectorKind: selection.collectorKind,
        },
        content: { ...collected.value },
        contentIdentity: { ...contentIdentity },
        collectedAt,
      },
      context,
    );
  }
}
