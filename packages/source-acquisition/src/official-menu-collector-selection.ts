import {
  PUBLIC_ERROR_REGISTRY,
  PortInvocationContextSchema,
  PublicErrorEnvelopeSchema,
  type PortInvocationContext,
  type PortResult,
  type PublicErrorEnvelope,
} from "@foodseyo/contracts";

import {
  OFFICIAL_MENU_SOURCE_KINDS,
  type OfficialMenuSourceCandidate,
} from "./official-menu-source-discovery.js";

export enum OfficialMenuCollectorKind {
  HTML_MENU_PAGE = "HTML_MENU_PAGE",
  PDF_MENU = "PDF_MENU",
  ORDER_PAGE = "ORDER_PAGE",
}

export interface OfficialMenuCollectorSelection {
  readonly candidate: OfficialMenuSourceCandidate;
  readonly collectorKind: OfficialMenuCollectorKind;
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

const validCandidate = (
  value: unknown,
): value is OfficialMenuSourceCandidate => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  if (!("sourceId" in value) || !("kind" in value) || !("locator" in value)) {
    return false;
  }
  return (
    Object.keys(value).length === 3 &&
    typeof value.sourceId === "string" &&
    value.sourceId.trim().length > 0 &&
    typeof value.kind === "string" &&
    OFFICIAL_MENU_SOURCE_KINDS.some((kind) => kind === value.kind) &&
    typeof value.locator === "string" &&
    value.locator.trim().length > 0
  );
};

const collectorKindFor = (
  candidate: OfficialMenuSourceCandidate,
): OfficialMenuCollectorKind => {
  switch (candidate.kind) {
    case "official_menu_page":
      return OfficialMenuCollectorKind.HTML_MENU_PAGE;
    case "official_pdf":
      return OfficialMenuCollectorKind.PDF_MENU;
    case "official_order_page":
      return OfficialMenuCollectorKind.ORDER_PAGE;
  }
};

export const selectOfficialMenuCollector = (
  candidate: OfficialMenuSourceCandidate,
  context: PortInvocationContext,
): PortResult<OfficialMenuCollectorSelection> => {
  PortInvocationContextSchema.parse(context);
  if (!validCandidate(candidate)) {
    return { status: "error", error: invalidUpstreamResult(context) };
  }
  return {
    status: "success",
    value: {
      candidate: { ...candidate },
      collectorKind: collectorKindFor(candidate),
    },
  };
};

export const selectOfficialMenuCollectors = (
  candidates: readonly OfficialMenuSourceCandidate[],
  context: PortInvocationContext,
): PortResult<readonly OfficialMenuCollectorSelection[]> => {
  PortInvocationContextSchema.parse(context);
  if (!Array.isArray(candidates)) {
    return { status: "error", error: invalidUpstreamResult(context) };
  }

  const selections: OfficialMenuCollectorSelection[] = [];
  for (const candidate of candidates) {
    const selection = selectOfficialMenuCollector(candidate, context);
    if (selection.status !== "success") {
      return selection;
    }
    selections.push({
      candidate: { ...selection.value.candidate },
      collectorKind: selection.value.collectorKind,
    });
  }
  return { status: "success", value: selections };
};
