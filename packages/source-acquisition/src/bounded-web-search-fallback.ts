import {
  CONTRACT_VERSIONS,
  MenuSourceInputSchema,
  PUBLIC_ERROR_REGISTRY,
  PortInvocationContextSchema,
  PublicErrorEnvelopeSchema,
  PublicOutcomeSchema,
  type MenuSourceAcquisitionRequest,
  type MenuSourceAcquisitionPort,
  type MenuSourceInput,
  type PortInvocationContext,
  type PublicErrorCode,
  type PublicErrorEnvelope,
  type PublicOutcome,
} from "@foodseyo/contracts";

import { restaurantContextFromMenuSourceRequest } from "./foundation.js";
import {
  RequestScopedOfficialMenuContentStore,
  retrieveBoundedOfficialMenu,
  type BoundedOfficialMenuAcquisitionDependencies,
  type OfficialMenuRetrievalFailureReason,
} from "./official-menu-bounded-retrieval.js";
import {
  selectOfficialMenuCollector,
  type OfficialMenuCollectorSelection,
} from "./official-menu-collector-selection.js";
import type { OfficialMenuSourceKind } from "./official-menu-source-discovery.js";
import {
  WebSearchMenuFallbackService,
  type WebSearchCandidateCollectionResult,
  type WebSearchMenuSourceCandidate,
  type WebSearchMenuSourceCollectorPort,
  type WebSearchMenuSourceDiscoveryPort,
} from "./web-search-fallback.js";

type TimeoutHandle = ReturnType<typeof setTimeout>;

export interface BoundedWebSearchFallbackDependencies
  extends BoundedOfficialMenuAcquisitionDependencies {
  readonly officialAcquisition: MenuSourceAcquisitionPort;
  readonly discovery: WebSearchMenuSourceDiscoveryPort;
}

export interface BoundedWebSearchFallbackRuntime {
  readonly service: WebSearchMenuFallbackService;
  releaseScope(context: PortInvocationContext): void;
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

const noSource = (context: PortInvocationContext): PublicOutcome =>
  PublicOutcomeSchema.parse({
    code: "MENU_SOURCE_NOT_FOUND",
    stage: "source_acquisition",
    correlationId: context.correlationId,
    retryable: true,
    canContinueMenuOnly: true,
  });

const kindFor = (locator: string): OfficialMenuSourceKind => {
  const path = new URL(locator).pathname.toLocaleLowerCase("en-US");
  if (path.endsWith(".pdf")) return "official_pdf";
  if (/(?:^|\/)(?:order|ordering)(?:\/|$)/u.test(path)) {
    return "official_order_page";
  }
  return "official_menu_page";
};

const selectionFor = (
  candidate: WebSearchMenuSourceCandidate,
  context: PortInvocationContext,
): OfficialMenuCollectorSelection | null => {
  let kind: OfficialMenuSourceKind;
  try {
    kind = kindFor(candidate.locator);
  } catch {
    return null;
  }
  const selected = selectOfficialMenuCollector(
    {
      sourceId: candidate.sourceId,
      kind,
      locator: candidate.locator,
    },
    context,
  );
  return selected.status === "success" ? selected.value : null;
};

const interruptionResult = (
  reason: OfficialMenuRetrievalFailureReason,
  context: PortInvocationContext,
): WebSearchCandidateCollectionResult | null => {
  if (reason === "timeout") {
    return {
      status: "error",
      error: publicError("UPSTREAM_TIMEOUT", context),
    };
  }
  if (reason === "aborted") {
    return { status: "outcome", outcome: noSource(context) };
  }
  return null;
};

const cloneRestaurantContext = (
  value: MenuSourceInput["restaurantContext"],
): MenuSourceInput["restaurantContext"] =>
  value === null ? null : { ...value };

class BoundedWebSearchMenuSourceCollector
  implements WebSearchMenuSourceCollectorPort
{
  readonly #store: RequestScopedOfficialMenuContentStore;
  readonly #dependencies: {
    readonly dnsResolver: BoundedOfficialMenuAcquisitionDependencies["dnsResolver"];
    readonly transport: BoundedOfficialMenuAcquisitionDependencies["transport"];
    readonly limits: BoundedOfficialMenuAcquisitionDependencies["limits"];
    readonly scheduleTimeout: (
      callback: () => void,
      timeoutMs: number,
    ) => TimeoutHandle;
    readonly clearScheduledTimeout: (handle: TimeoutHandle) => void;
    readonly collectionClock: () => string;
  };

  constructor(
    store: RequestScopedOfficialMenuContentStore,
    dependencies: BoundedOfficialMenuAcquisitionDependencies,
  ) {
    this.#store = store;
    this.#dependencies = {
      dnsResolver: dependencies.dnsResolver,
      transport: dependencies.transport,
      limits: dependencies.limits,
      scheduleTimeout:
        dependencies.scheduleTimeout ??
        ((callback, timeoutMs) => setTimeout(callback, timeoutMs)),
      clearScheduledTimeout:
        dependencies.clearScheduledTimeout ?? ((handle) => clearTimeout(handle)),
      collectionClock:
        dependencies.collectionClock ?? (() => new Date().toISOString()),
    };
  }

  async collect(
    candidate: WebSearchMenuSourceCandidate,
    request: MenuSourceAcquisitionRequest,
    context: PortInvocationContext,
  ): Promise<WebSearchCandidateCollectionResult> {
    PortInvocationContextSchema.parse(context);
    const selection = selectionFor(candidate, context);
    if (selection === null) return { status: "unusable" };

    const retrieved = await retrieveBoundedOfficialMenu(
      selection,
      this.#dependencies.limits,
      this.#dependencies,
      context,
    );
    if (retrieved.status === "failure") {
      return (
        interruptionResult(retrieved.reason, context) ?? { status: "unusable" }
      );
    }

    const stored = await this.#store.store(
      { selection, ...retrieved.value },
      context,
    );
    if (stored.status !== "success") return stored;
    const identity = await this.#store.identify(stored.value, context);
    const restaurantContext = restaurantContextFromMenuSourceRequest(request);
    if (identity === null || restaurantContext === null) {
      return {
        status: "error",
        error: publicError("INVALID_UPSTREAM_RESULT", context),
      };
    }

    let collectedAt: string;
    try {
      collectedAt = this.#dependencies.collectionClock();
    } catch {
      return { status: "error", error: publicError("INTERNAL_ERROR", context) };
    }
    const assembled = MenuSourceInputSchema.safeParse({
      contractVersion: CONTRACT_VERSIONS.menuSource,
      source: {
        sourceRef: identity.sourceRef,
        sourceType: "web_search_discovery",
        sourceFingerprint: identity.sourceFingerprint,
        collectedAt,
      },
      restaurantContext,
      menuScope: request.menuScope,
      content: stored.value,
      requestedAt: request.requestedAt,
    });
    if (!assembled.success) {
      return {
        status: "error",
        error: publicError("INVALID_UPSTREAM_RESULT", context),
      };
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
  }
}

export const createBoundedWebSearchFallbackRuntime = (
  dependencies: BoundedWebSearchFallbackDependencies,
): BoundedWebSearchFallbackRuntime => {
  const store = new RequestScopedOfficialMenuContentStore();
  const collector = new BoundedWebSearchMenuSourceCollector(store, dependencies);
  return Object.freeze({
    service: new WebSearchMenuFallbackService(
      dependencies.officialAcquisition,
      dependencies.discovery,
      collector,
    ),
    releaseScope: (context: PortInvocationContext): void =>
      store.releaseScope(context),
  });
};
