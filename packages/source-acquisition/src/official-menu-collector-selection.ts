import {
  PUBLIC_ERROR_REGISTRY,
  PortInvocationContextSchema,
  PublicErrorEnvelopeSchema,
  type PortInvocationContext,
  type PortResult,
  type PublicErrorEnvelope,
} from "@foodseyo/contracts";

import {
  isOfficialMenuSourceCandidate,
  isVerifiedOfficialMenuSourceDiscovery,
  type OfficialMenuSourceCandidate,
  type OfficialMenuSourceDiscoveryRequest,
  type VerifiedOfficialMenuSourceDiscovery,
} from "./official-menu-source-discovery.js";

const VERIFIED_SELECTION = Symbol("verifiedOfficialMenuCollectorSelection");

export enum OfficialMenuCollectorKind {
  HTML_MENU_PAGE = "HTML_MENU_PAGE",
  PDF_MENU = "PDF_MENU",
  ORDER_PAGE = "ORDER_PAGE",
}

export interface OfficialMenuCollectorSelection {
  readonly candidate: OfficialMenuSourceCandidate;
  readonly collectorKind: OfficialMenuCollectorKind;
}

export interface VerifiedOfficialMenuCollectorSelection {
  readonly discoveryRequest: OfficialMenuSourceDiscoveryRequest;
  readonly discoveredCandidates: readonly OfficialMenuSourceCandidate[];
  readonly discoveryCorrelationId: string;
  readonly selection: OfficialMenuCollectorSelection;
  readonly [VERIFIED_SELECTION]: true;
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
): value is OfficialMenuSourceCandidate =>
  isOfficialMenuSourceCandidate(value);

const sameCandidate = (
  left: OfficialMenuSourceCandidate,
  right: OfficialMenuSourceCandidate,
): boolean =>
  left.sourceId === right.sourceId &&
  left.kind === right.kind &&
  left.locator === right.locator;

const cloneCandidate = (
  candidate: OfficialMenuSourceCandidate,
): OfficialMenuSourceCandidate => Object.freeze({ ...candidate });

const cloneDiscoveryRequest = (
  request: OfficialMenuSourceDiscoveryRequest,
): OfficialMenuSourceDiscoveryRequest => Object.freeze({ ...request });

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

/**
 * Binds one exact candidate snapshot to the discovery request that produced
 * it. The private symbol prevents callers from fabricating this proof object.
 */
export const verifyOfficialMenuCollectorSelection = (
  discovery: VerifiedOfficialMenuSourceDiscovery,
  selection: OfficialMenuCollectorSelection,
  context: PortInvocationContext,
): PortResult<VerifiedOfficialMenuCollectorSelection> => {
  PortInvocationContextSchema.parse(context);
  if (
    !isVerifiedOfficialMenuSourceDiscovery(discovery) ||
    discovery.correlationId !== context.correlationId ||
    typeof selection !== "object" ||
    selection === null ||
    Array.isArray(selection) ||
    Object.keys(selection).length !== 2 ||
    !("candidate" in selection) ||
    !("collectorKind" in selection)
  ) {
    return { status: "error", error: invalidUpstreamResult(context) };
  }

  const selected = selectOfficialMenuCollector(selection.candidate, context);
  if (
    selected.status !== "success" ||
    selected.value.collectorKind !== selection.collectorKind ||
    !discovery.candidates.every(validCandidate)
  ) {
    return { status: "error", error: invalidUpstreamResult(context) };
  }

  const sourceIds = new Set<string>();
  const locators = new Set<string>();
  let exactMatches = 0;
  for (const candidate of discovery.candidates) {
    if (sourceIds.has(candidate.sourceId) || locators.has(candidate.locator)) {
      return { status: "error", error: invalidUpstreamResult(context) };
    }
    sourceIds.add(candidate.sourceId);
    locators.add(candidate.locator);
    if (sameCandidate(candidate, selected.value.candidate)) exactMatches += 1;
  }
  if (exactMatches !== 1) {
    return { status: "error", error: invalidUpstreamResult(context) };
  }

  const candidates = Object.freeze(discovery.candidates.map(cloneCandidate));
  const verified = {
    discoveryRequest: cloneDiscoveryRequest(discovery.request),
    discoveredCandidates: candidates,
    discoveryCorrelationId: discovery.correlationId,
    selection: Object.freeze({
      candidate: cloneCandidate(selected.value.candidate),
      collectorKind: selected.value.collectorKind,
    }),
  } as Omit<VerifiedOfficialMenuCollectorSelection, typeof VERIFIED_SELECTION> &
    Partial<Pick<VerifiedOfficialMenuCollectorSelection, typeof VERIFIED_SELECTION>>;
  Object.defineProperty(verified, VERIFIED_SELECTION, {
    value: true,
    enumerable: false,
    configurable: false,
    writable: false,
  });
  return {
    status: "success",
    value: Object.freeze(verified) as VerifiedOfficialMenuCollectorSelection,
  };
};

export const isVerifiedOfficialMenuCollectorSelection = (
  value: unknown,
): value is VerifiedOfficialMenuCollectorSelection =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  Object.hasOwn(value, VERIFIED_SELECTION) &&
  Object.isFrozen(value) &&
  Reflect.get(value, VERIFIED_SELECTION) === true;
