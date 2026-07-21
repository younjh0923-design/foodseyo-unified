import {
  CONTRACT_VERSIONS,
  MenuSourceAcquisitionRequestSchema,
  MenuSourceInputSchema,
  PUBLIC_ERROR_REGISTRY,
  PortInvocationContextSchema,
  PublicErrorEnvelopeSchema,
  TransientMenuContentSchema,
  type MenuSourceAcquisitionRequest,
  type MenuSourceInput,
  type MenuSourceType,
  type PortInvocationContext,
  type PortResult,
  type PublicErrorEnvelope,
  type SafeSourceReference,
  type TransientMenuContent,
} from "@foodseyo/contracts";

import {
  restaurantContextFromMenuSourceRequest,
  type TransientContentIdentity,
} from "./foundation.js";
import {
  selectOfficialMenuCollector,
  type OfficialMenuCollectorSelection,
} from "./official-menu-collector-selection.js";

export interface CollectedOfficialMenuSourceAssemblyInput {
  readonly request: MenuSourceAcquisitionRequest;
  readonly selection: OfficialMenuCollectorSelection;
  readonly content: TransientMenuContent;
  readonly contentIdentity: TransientContentIdentity;
  readonly collectedAt: string;
}

const invalidUpstreamResult = (
  context: PortInvocationContext,
): PublicErrorEnvelope => {
  const definition = PUBLIC_ERROR_REGISTRY.INVALID_UPSTREAM_RESULT;
  return PublicErrorEnvelopeSchema.parse({
    error: {
      code: "INVALID_UPSTREAM_RESULT",
      message: definition.message,
      correlationId: context.correlationId,
      retryable: definition.retryable,
    },
    httpStatus: definition.httpStatus,
  });
};

const validIdentity = (
  value: unknown,
): value is TransientContentIdentity => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  if (!("sourceRef" in value) || !("sourceFingerprint" in value)) {
    return false;
  }
  return (
    Object.keys(value).length === 2 &&
    typeof value.sourceRef === "string" &&
    value.sourceRef.trim().length > 0 &&
    typeof value.sourceFingerprint === "string" &&
    value.sourceFingerprint.trim().length > 0
  );
};

const expectedSourceType = (
  selection: OfficialMenuCollectorSelection,
): MenuSourceType => {
  switch (selection.candidate.kind) {
    case "official_menu_page":
      return "official_website";
    case "official_pdf":
      return "official_pdf";
    case "official_order_page":
      return "ordering_page";
  }
};

const supportsContent = (
  sourceType: MenuSourceType,
  content: TransientMenuContent,
): boolean => {
  switch (sourceType) {
    case "official_website":
    case "ordering_page":
      return content.kind === "html" || content.kind === "plain_text";
    case "official_pdf":
      return content.kind === "pdf";
    case "uploaded_menu":
    case "web_search_discovery":
      return false;
  }
};

const cloneRestaurantContext = (
  context: MenuSourceInput["restaurantContext"],
): MenuSourceInput["restaurantContext"] =>
  context === null ? null : { ...context };

/** Projects approved request-scoped identity into the frozen MenuSourceInput. */
export const assembleCollectedOfficialMenuSourceInput = (
  input: CollectedOfficialMenuSourceAssemblyInput,
  context: PortInvocationContext,
): PortResult<MenuSourceInput> => {
  PortInvocationContextSchema.parse(context);
  if (
    typeof input !== "object" ||
    input === null ||
    Array.isArray(input) ||
    Object.keys(input).length !== 5 ||
    !("request" in input) ||
    !("selection" in input) ||
    !("content" in input) ||
    !("contentIdentity" in input) ||
    !("collectedAt" in input)
  ) {
    return { status: "error", error: invalidUpstreamResult(context) };
  }

  if (
    typeof input.selection !== "object" ||
    input.selection === null ||
    Array.isArray(input.selection) ||
    Object.keys(input.selection).length !== 2 ||
    !("candidate" in input.selection) ||
    !("collectorKind" in input.selection)
  ) {
    return { status: "error", error: invalidUpstreamResult(context) };
  }

  const requestResult = MenuSourceAcquisitionRequestSchema.safeParse(
    input.request,
  );
  const selectionResult = selectOfficialMenuCollector(
    input.selection.candidate,
    context,
  );
  const contentResult = TransientMenuContentSchema.safeParse(input.content);
  if (
    !requestResult.success ||
    selectionResult.status !== "success" ||
    selectionResult.value.collectorKind !== input.selection.collectorKind ||
    !contentResult.success ||
    !validIdentity(input.contentIdentity) ||
    typeof input.collectedAt !== "string"
  ) {
    return { status: "error", error: invalidUpstreamResult(context) };
  }

  const restaurantContext = restaurantContextFromMenuSourceRequest(
    requestResult.data,
  );
  const sourceType = expectedSourceType(selectionResult.value);
  if (
    restaurantContext === null ||
    !supportsContent(sourceType, contentResult.data)
  ) {
    return { status: "error", error: invalidUpstreamResult(context) };
  }

  const source: SafeSourceReference = {
    sourceRef: input.contentIdentity.sourceRef,
    sourceType,
    sourceFingerprint: input.contentIdentity.sourceFingerprint,
    collectedAt: input.collectedAt,
  };
  const assembled = MenuSourceInputSchema.safeParse({
    contractVersion: CONTRACT_VERSIONS.menuSource,
    source,
    restaurantContext,
    menuScope: requestResult.data.menuScope,
    content: { ...contentResult.data },
    requestedAt: requestResult.data.requestedAt,
  });
  if (!assembled.success) {
    return { status: "error", error: invalidUpstreamResult(context) };
  }

  return {
    status: "success",
    value: {
      ...assembled.data,
      source: { ...assembled.data.source },
      restaurantContext: cloneRestaurantContext(
        assembled.data.restaurantContext,
      ),
      content: { ...assembled.data.content },
    },
  };
};
