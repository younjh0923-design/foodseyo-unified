import {
  MENU_SCOPES,
  PUBLIC_ERROR_REGISTRY,
  PortInvocationContextSchema,
  PublicErrorEnvelopeSchema,
  type MenuScope,
  type PortInvocationContext,
  type PortResult,
  type PublicErrorCode,
  type PublicErrorEnvelope,
} from "@foodseyo/contracts";

export const OFFICIAL_MENU_SOURCE_KINDS = [
  "official_menu_page",
  "official_pdf",
  "official_order_page",
] as const;

export type OfficialMenuSourceKind =
  (typeof OFFICIAL_MENU_SOURCE_KINDS)[number];

export interface OfficialMenuSourceDiscoveryRequest {
  readonly googlePlaceId: string;
  readonly restaurantId: string;
  readonly menuScope: MenuScope;
}

export interface OfficialMenuSourceCandidate {
  readonly sourceId: string;
  readonly kind: OfficialMenuSourceKind;
  readonly locator: string;
}

export interface OfficialMenuSourceDiscovery {
  discover(
    request: OfficialMenuSourceDiscoveryRequest,
    context: PortInvocationContext,
  ): Promise<PortResult<readonly OfficialMenuSourceCandidate[]>>;
}

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

const cloneRequest = (
  request: OfficialMenuSourceDiscoveryRequest,
): OfficialMenuSourceDiscoveryRequest => ({ ...request });

const cloneCandidate = (
  candidate: OfficialMenuSourceCandidate,
): OfficialMenuSourceCandidate => ({ ...candidate });

const validRequest = (
  value: unknown,
): value is OfficialMenuSourceDiscoveryRequest => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  if (
    !("googlePlaceId" in value) ||
    !("restaurantId" in value) ||
    !("menuScope" in value)
  ) {
    return false;
  }
  return (
    Object.keys(value).length === 3 &&
    typeof value.googlePlaceId === "string" &&
    value.googlePlaceId.trim().length > 0 &&
    typeof value.restaurantId === "string" &&
    value.restaurantId.trim().length > 0 &&
    typeof value.menuScope === "string" &&
    MENU_SCOPES.some((menuScope) => menuScope === value.menuScope)
  );
};

const validCandidate = (
  value: OfficialMenuSourceCandidate,
): boolean =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  Object.keys(value).length === 3 &&
  Object.hasOwn(value, "sourceId") &&
  Object.hasOwn(value, "kind") &&
  Object.hasOwn(value, "locator") &&
  typeof value.sourceId === "string" &&
  value.sourceId.trim().length > 0 &&
  OFFICIAL_MENU_SOURCE_KINDS.includes(value.kind) &&
  typeof value.locator === "string" &&
  value.locator.trim().length > 0;

const KIND_PRIORITY: Readonly<Record<OfficialMenuSourceKind, number>> = {
  official_menu_page: 0,
  official_pdf: 1,
  official_order_page: 2,
};

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const compareCandidates = (
  left: OfficialMenuSourceCandidate,
  right: OfficialMenuSourceCandidate,
): number => {
  const kindOrder = KIND_PRIORITY[left.kind] - KIND_PRIORITY[right.kind];
  if (kindOrder !== 0) return kindOrder;
  const sourceOrder = compareText(left.sourceId, right.sourceId);
  return sourceOrder !== 0
    ? sourceOrder
    : compareText(left.locator, right.locator);
};

/** Deterministic fake that retains no caller-owned request or candidate objects. */
export class FakeOfficialMenuSourceDiscovery
  implements OfficialMenuSourceDiscovery
{
  #callCount = 0;
  #lastRequest: OfficialMenuSourceDiscoveryRequest | null = null;
  readonly #result: PortResult<readonly OfficialMenuSourceCandidate[]>;

  constructor(result: PortResult<readonly OfficialMenuSourceCandidate[]>) {
    this.#result =
      result.status === "success"
        ? { status: "success", value: result.value.map(cloneCandidate) }
        : result;
  }

  get callCount(): number {
    return this.#callCount;
  }

  get lastRequest(): OfficialMenuSourceDiscoveryRequest | null {
    return this.#lastRequest === null ? null : cloneRequest(this.#lastRequest);
  }

  discover(
    request: OfficialMenuSourceDiscoveryRequest,
    context: PortInvocationContext,
  ): Promise<PortResult<readonly OfficialMenuSourceCandidate[]>> {
    this.#callCount += 1;
    PortInvocationContextSchema.parse(context);
    this.#lastRequest = cloneRequest(request);
    return Promise.resolve(
      this.#result.status === "success"
        ? {
            status: "success",
            value: this.#result.value.map(cloneCandidate),
          }
        : this.#result,
    );
  }
}

export class OfficialMenuSourceDiscoveryService {
  constructor(private readonly discovery: OfficialMenuSourceDiscovery) {}

  async discover(
    request: OfficialMenuSourceDiscoveryRequest,
    context: PortInvocationContext,
  ): Promise<PortResult<readonly OfficialMenuSourceCandidate[]>> {
    PortInvocationContextSchema.parse(context);
    if (!validRequest(request)) {
      return { status: "error", error: publicError("INVALID_INPUT", context) };
    }

    let result: PortResult<readonly OfficialMenuSourceCandidate[]>;
    try {
      result = await this.discovery.discover(cloneRequest(request), context);
    } catch {
      return {
        status: "error",
        error: publicError("UPSTREAM_UNAVAILABLE", context),
      };
    }
    if (result.status !== "success") {
      return result;
    }
    if (!Array.isArray(result.value) || !result.value.every(validCandidate)) {
      return {
        status: "error",
        error: publicError("INVALID_UPSTREAM_RESULT", context),
      };
    }

    const ordered = result.value.map(cloneCandidate).sort(compareCandidates);
    const sourceIds = new Set<string>();
    const locators = new Set<string>();
    const unique: OfficialMenuSourceCandidate[] = [];
    for (const candidate of ordered) {
      if (
        sourceIds.has(candidate.sourceId) ||
        locators.has(candidate.locator)
      ) {
        continue;
      }
      sourceIds.add(candidate.sourceId);
      locators.add(candidate.locator);
      unique.push(cloneCandidate(candidate));
    }

    return { status: "success", value: unique };
  }
}
