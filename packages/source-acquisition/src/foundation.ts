import {
  CONTRACT_VERSIONS,
  MenuSourceAcquisitionRequestSchema,
  MenuSourceInputSchema,
  PUBLIC_ERROR_REGISTRY,
  PortInvocationContextSchema,
  PublicErrorEnvelopeSchema,
  PublicOutcomeSchema,
  isTimeoutAbortSignal,
  type MenuContentKind,
  type MenuSourceAcquisitionPort,
  type MenuSourceAcquisitionRequest,
  type MenuSourceInput,
  type MenuSourceType,
  type PortInvocationContext,
  type PortResult,
  type PublicErrorCode,
  type PublicErrorEnvelope,
  type PublicOutcome,
  type SafeSourceReference,
  type TransientMenuContent,
} from "@foodseyo/contracts";

type CandidateStatus =
  | "supported"
  | "unsupported"
  | "unsafe"
  | "no_source"
  | "timeout"
  | "upstream_unavailable";

interface SourceCandidate {
  readonly sourceType: MenuSourceType;
  readonly sourceRef: string;
  readonly sourceFingerprint: string;
  readonly content: TransientMenuContent;
  readonly rawUrl: string | null;
}

export interface TransientContentIdentity {
  readonly sourceRef: string;
  readonly sourceFingerprint: string;
}

/**
 * Package-owned transient resolver. Implementations may inspect uploaded bytes
 * behind the opaque handle, but bytes, filenames, and derived text never cross
 * this interface.
 */
export interface TransientContentIdentityPort {
  identify(
    content: TransientMenuContent,
    context: PortInvocationContext,
  ): Promise<TransientContentIdentity | null>;
}

/**
 * Provider-local discovery material. `rawUrl` is accepted only inside this
 * package so the common URL policy can reject unsafe targets. It is never
 * returned by the frozen acquisition port or included in public diagnostics.
 */
export interface TransientDiscoveredMenuSource {
  readonly sourceRef: string;
  readonly sourceFingerprint: string;
  readonly content: TransientMenuContent;
  readonly rawUrl: string;
}

export interface MenuSourceDiscoveryPort {
  discover(
    request: MenuSourceAcquisitionRequest,
    context: PortInvocationContext,
  ): Promise<readonly TransientDiscoveredMenuSource[]>;
}

interface CandidateProbeResult {
  readonly status: CandidateStatus;
  readonly candidates: readonly SourceCandidate[];
}

export interface MenuSourceCandidateAdapter {
  readonly sourceType: MenuSourceType;
  probe(
    request: MenuSourceAcquisitionRequest,
    context: PortInvocationContext,
  ): Promise<CandidateProbeResult>;
}

const noCandidates = (status: CandidateStatus): CandidateProbeResult => ({
  status,
  candidates: [],
});

const SAFE_HOST_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u;
const BLOCKED_HOST_SUFFIXES = [
  ".home",
  ".internal",
  ".lan",
  ".local",
  ".localhost",
] as const;

/** Returns only a decision; it never returns or logs the supplied raw URL. */
export const isSafePublicHttpsSourceUrl = (rawUrl: string): boolean => {
  if (rawUrl.length === 0 || rawUrl.length > 2048) {
    return false;
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }

  if (
    parsed.protocol !== "https:" ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    (parsed.port !== "" && parsed.port !== "443")
  ) {
    return false;
  }

  const hostname = parsed.hostname.toLowerCase().replace(/\.$/u, "");
  if (
    hostname.length === 0 ||
    hostname === "localhost" ||
    hostname.includes(":") ||
    /^\d{1,3}(?:\.\d{1,3}){3}$/u.test(hostname) ||
    BLOCKED_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix))
  ) {
    return false;
  }

  const labels = hostname.split(".");
  return labels.length >= 2 && labels.every((label) => SAFE_HOST_LABEL.test(label));
};

const supportsContentKind = (
  sourceType: MenuSourceType,
  contentKind: MenuContentKind,
): boolean => {
  switch (sourceType) {
    case "uploaded_menu":
      return true;
    case "official_website":
    case "ordering_page":
      return contentKind === "html" || contentKind === "plain_text";
    case "official_pdf":
      return contentKind === "pdf";
    case "web_search_discovery":
      return (
        contentKind === "html" ||
        contentKind === "pdf" ||
        contentKind === "plain_text"
      );
  }
};

const classifyCandidate = (candidate: SourceCandidate): CandidateStatus => {
  if (!supportsContentKind(candidate.sourceType, candidate.content.kind)) {
    return "unsupported";
  }
  if (
    candidate.sourceType !== "uploaded_menu" &&
    (candidate.rawUrl === null ||
      !isSafePublicHttpsSourceUrl(candidate.rawUrl))
  ) {
    return "unsafe";
  }
  if (candidate.sourceType === "uploaded_menu" && candidate.rawUrl !== null) {
    return "unsafe";
  }
  return "supported";
};

export class UploadedMenuSourceAdapter implements MenuSourceCandidateAdapter {
  readonly sourceType = "uploaded_menu" as const;

  constructor(private readonly identities: TransientContentIdentityPort) {}

  async probe(
    request: MenuSourceAcquisitionRequest,
    context: PortInvocationContext,
  ): Promise<CandidateProbeResult> {
    if (context.signal.aborted) {
      return noCandidates(
        isTimeoutAbortSignal(context.signal) ? "timeout" : "upstream_unavailable",
      );
    }

    const settled = await Promise.allSettled(
      request.submissionContent.map(async (content) => {
        const identity = await this.identities.identify(content, context);
        return identity === null
          ? null
          : ({
              sourceType: this.sourceType,
              sourceRef: identity.sourceRef,
              sourceFingerprint: identity.sourceFingerprint,
              content,
              rawUrl: null,
            } satisfies SourceCandidate);
      }),
    );
    if (context.signal.aborted) {
      return noCandidates(
        isTimeoutAbortSignal(context.signal) ? "timeout" : "upstream_unavailable",
      );
    }

    const candidates = settled.flatMap((result) =>
      result.status === "fulfilled" && result.value !== null ? [result.value] : [],
    );
    if (candidates.length > 0) {
      return { status: "supported", candidates };
    }
    return noCandidates(
      settled.some((result) => result.status === "rejected")
        ? "upstream_unavailable"
        : "no_source",
    );
  }
}

abstract class InterfaceOnlyDiscoveryAdapter
  implements MenuSourceCandidateAdapter
{
  abstract readonly sourceType: Exclude<MenuSourceType, "uploaded_menu">;

  constructor(private readonly discovery: MenuSourceDiscoveryPort) {}

  async probe(
    request: MenuSourceAcquisitionRequest,
    context: PortInvocationContext,
  ): Promise<CandidateProbeResult> {
    if (context.signal.aborted) {
      return noCandidates(
        isTimeoutAbortSignal(context.signal) ? "timeout" : "upstream_unavailable",
      );
    }

    let discovered: readonly TransientDiscoveredMenuSource[];
    try {
      discovered = await this.discovery.discover(request, context);
    } catch {
      return noCandidates("upstream_unavailable");
    }
    if (context.signal.aborted) {
      return noCandidates(
        isTimeoutAbortSignal(context.signal) ? "timeout" : "upstream_unavailable",
      );
    }
    if (discovered.length === 0) {
      return noCandidates("no_source");
    }

    const candidates = discovered.map(
      (candidate): SourceCandidate => ({
        sourceType: this.sourceType,
        sourceRef: candidate.sourceRef,
        sourceFingerprint: candidate.sourceFingerprint,
        content: candidate.content,
        rawUrl: candidate.rawUrl,
      }),
    );
    const classifications = candidates.map(classifyCandidate);
    const supported = candidates.filter(
      (_candidate, index) => classifications[index] === "supported",
    );
    if (supported.length > 0) {
      return { status: "supported", candidates: supported };
    }
    return noCandidates(
      classifications.includes("unsafe") ? "unsafe" : "unsupported",
    );
  }
}

export class OfficialWebsiteDiscoveryAdapter extends InterfaceOnlyDiscoveryAdapter {
  readonly sourceType = "official_website" as const;
}

export class OfficialPdfDiscoveryAdapter extends InterfaceOnlyDiscoveryAdapter {
  readonly sourceType = "official_pdf" as const;
}

export class OrderingPageDiscoveryAdapter extends InterfaceOnlyDiscoveryAdapter {
  readonly sourceType = "ordering_page" as const;
}

export class WebSearchDiscoveryAdapter extends InterfaceOnlyDiscoveryAdapter {
  readonly sourceType = "web_search_discovery" as const;
}

export interface SourceAcquisitionDependencies {
  readonly uploaded: MenuSourceCandidateAdapter;
  readonly official: readonly MenuSourceCandidateAdapter[];
  readonly webSearch: MenuSourceCandidateAdapter;
}

const restaurantContextFrom = (
  request: MenuSourceAcquisitionRequest,
): MenuSourceInput["restaurantContext"] => {
  const resolution = request.restaurantResolution;
  if (
    (resolution.state !== "user_confirmed" &&
      resolution.state !== "externally_verified") ||
    resolution.selectedCandidateId === null
  ) {
    return null;
  }
  const candidate = resolution.candidates.find(
    (item) => item.candidateId === resolution.selectedCandidateId,
  );
  if (candidate === undefined) {
    return null;
  }
  return {
    restaurantId: resolution.restaurantId,
    candidateId: candidate.candidateId,
    googlePlaceId: candidate.googlePlaceId,
    resolutionState: resolution.state,
  };
};

const publicOutcome = (
  code: "MENU_SOURCE_NOT_FOUND" | "MENU_SOURCE_CONFLICT",
  context: PortInvocationContext,
): PublicOutcome =>
  PublicOutcomeSchema.parse({
    code,
    stage: "source_acquisition",
    correlationId: context.correlationId,
    retryable: code === "MENU_SOURCE_NOT_FOUND",
    canContinueMenuOnly: true,
  });

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

const sameCandidate = (left: SourceCandidate, right: SourceCandidate): boolean =>
  left.sourceType === right.sourceType &&
  left.sourceRef === right.sourceRef &&
  left.sourceFingerprint === right.sourceFingerprint &&
  left.content.kind === right.content.kind &&
  left.content.contentHandle === right.content.contentHandle &&
  left.content.byteCount === right.content.byteCount &&
  left.content.pageCount === right.content.pageCount;

const selectCandidate = (
  probes: readonly CandidateProbeResult[],
  context: PortInvocationContext,
): PortResult<SourceCandidate | null> => {
  const candidates = probes.flatMap((probe) => probe.candidates);
  const unique = new Map<string, SourceCandidate>();
  for (const candidate of candidates) {
    const existing = unique.get(candidate.sourceFingerprint);
    if (existing !== undefined && !sameCandidate(existing, candidate)) {
      return {
        status: "outcome",
        outcome: publicOutcome("MENU_SOURCE_CONFLICT", context),
      };
    }
    unique.set(candidate.sourceFingerprint, candidate);
  }
  if (unique.size > 1) {
    return {
      status: "outcome",
      outcome: publicOutcome("MENU_SOURCE_CONFLICT", context),
    };
  }
  if (unique.size === 1) {
    return { status: "success", value: [...unique.values()][0] ?? null };
  }
  if (probes.some((probe) => probe.status === "unsafe")) {
    return { status: "error", error: publicError("UNSAFE_SOURCE", context) };
  }
  if (probes.some((probe) => probe.status === "timeout")) {
    return { status: "error", error: publicError("UPSTREAM_TIMEOUT", context) };
  }
  if (probes.some((probe) => probe.status === "upstream_unavailable")) {
    return {
      status: "error",
      error: publicError("UPSTREAM_UNAVAILABLE", context),
    };
  }
  return { status: "success", value: null };
};

export class FoundationMenuSourceAcquisitionPort
  implements MenuSourceAcquisitionPort
{
  #callCount = 0;

  constructor(private readonly dependencies: SourceAcquisitionDependencies) {}

  get callCount(): number {
    return this.#callCount;
  }

  async acquire(
    request: MenuSourceAcquisitionRequest,
    context: PortInvocationContext,
  ): Promise<PortResult<MenuSourceInput>> {
    this.#callCount += 1;
    PortInvocationContextSchema.parse(context);
    const requestResult = MenuSourceAcquisitionRequestSchema.safeParse(request);
    if (!requestResult.success) {
      return { status: "error", error: publicError("INVALID_INPUT", context) };
    }
    if (context.signal.aborted) {
      return {
        status: "error",
        error: publicError(
          isTimeoutAbortSignal(context.signal)
            ? "UPSTREAM_TIMEOUT"
            : "UPSTREAM_UNAVAILABLE",
          context,
        ),
      };
    }

    const attemptedProbes: CandidateProbeResult[] = [];
    const uploadProbe = await this.dependencies.uploaded.probe(
      requestResult.data,
      context,
    );
    attemptedProbes.push(uploadProbe);
    const uploadSelection = selectCandidate([uploadProbe], context);
    const uploadResult = this.toMenuSourceResult(
      uploadSelection,
      requestResult.data,
      context,
      false,
    );
    if (uploadResult !== null) {
      return uploadResult;
    }

    if (restaurantContextFrom(requestResult.data) !== null) {
      const officialSettled = await Promise.allSettled(
        this.dependencies.official.map((adapter) =>
          adapter.probe(requestResult.data, context),
        ),
      );
      const officialProbes = officialSettled.map((result) =>
        result.status === "fulfilled"
          ? result.value
          : noCandidates("upstream_unavailable"),
      );
      attemptedProbes.push(...officialProbes);
      const officialResult = this.toMenuSourceResult(
        selectCandidate(officialProbes, context),
        requestResult.data,
        context,
        false,
      );
      if (officialResult !== null) {
        return officialResult;
      }

      const webProbe = await this.dependencies.webSearch.probe(
        requestResult.data,
        context,
      );
      attemptedProbes.push(webProbe);
      const webResult = this.toMenuSourceResult(
        selectCandidate([webProbe], context),
        requestResult.data,
        context,
        false,
      );
      if (webResult !== null) {
        return webResult;
      }
    }

    const aggregateFailure = this.toMenuSourceResult(
      selectCandidate(attemptedProbes, context),
      requestResult.data,
      context,
      true,
    );
    if (aggregateFailure !== null) {
      return aggregateFailure;
    }

    return {
      status: "outcome",
      outcome: publicOutcome("MENU_SOURCE_NOT_FOUND", context),
    };
  }

  private toMenuSourceResult(
    selection: PortResult<SourceCandidate | null>,
    request: MenuSourceAcquisitionRequest,
    context: PortInvocationContext,
    includeErrors: boolean,
  ): PortResult<MenuSourceInput> | null {
    if (selection.status !== "success") {
      return selection.status === "outcome" || includeErrors ? selection : null;
    }
    if (selection.value === null) {
      return null;
    }
    const candidate = selection.value;
    try {
      const source: SafeSourceReference = {
        sourceRef: candidate.sourceRef,
        sourceType: candidate.sourceType,
        sourceFingerprint: candidate.sourceFingerprint,
        collectedAt: request.requestedAt,
      };
      return {
        status: "success",
        value: MenuSourceInputSchema.parse({
          contractVersion: CONTRACT_VERSIONS.menuSource,
          source,
          restaurantContext: restaurantContextFrom(request),
          menuScope: request.menuScope,
          content: candidate.content,
          requestedAt: request.requestedAt,
        }),
      };
    } catch {
      return {
        status: "error",
        error: publicError("INVALID_UPSTREAM_RESULT", context),
      };
    }
  }
}
