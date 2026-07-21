import {
  PUBLIC_ERROR_REGISTRY,
  PortInvocationContextSchema,
  PublicErrorEnvelopeSchema,
  PublicOutcomeSchema,
  TransientMenuContentSchema,
  isTimeoutAbortSignal,
  type MenuContentKind,
  type PortInvocationContext,
  type PortResult,
  type PublicErrorCode,
  type PublicErrorEnvelope,
  type PublicOutcome,
  type TransientMenuContent,
} from "@foodseyo/contracts";

import type {
  TransientContentIdentity,
  TransientContentIdentityPort,
} from "./foundation.js";
import {
  OfficialMenuCollectorService,
  type OfficialMenuCollector,
} from "./official-menu-collector.js";
import { OfficialMenuSourceAcquisitionOrchestrator } from "./official-menu-source-acquisition-orchestrator.js";
import {
  OfficialMenuCollectorKind,
  selectOfficialMenuCollector,
  type OfficialMenuCollectorSelection,
} from "./official-menu-collector-selection.js";

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const SAFE_HOST_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u;
const BLOCKED_HOST_SUFFIXES = [
  ".home",
  ".internal",
  ".lan",
  ".local",
  ".localhost",
] as const;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

type TimeoutHandle = ReturnType<typeof setTimeout>;

export interface OfficialMenuRetrievalLimits {
  readonly maxRedirects: number;
  readonly maxResponseBytes: number;
}

export interface OfficialMenuDnsResolver {
  resolve(
    hostname: string,
    signal: AbortSignal,
  ): Promise<readonly string[]>;
}

export interface OfficialMenuTransportRequest {
  readonly url: string;
  readonly method: "GET";
  readonly redirect: "manual";
  readonly approvedAddresses: readonly string[];
  readonly signal: AbortSignal;
}

export interface OfficialMenuTransportResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string | undefined>>;
  readonly body: AsyncIterable<Uint8Array> | null;
  /** Idempotently stops and releases any unconsumed response body. */
  cancel(): Promise<void>;
}

/**
 * Server implementations must disable automatic redirects and connect only to
 * one of `approvedAddresses`; resolving the hostname again inside the transport
 * would reopen the DNS-rebinding window closed by this boundary.
 */
export interface OfficialMenuHttpTransport {
  request(
    request: OfficialMenuTransportRequest,
  ): Promise<OfficialMenuTransportResponse>;
}

export interface OfficialMenuContentStoreInput {
  readonly selection: OfficialMenuCollectorSelection;
  readonly contentKind: Exclude<MenuContentKind, "image_collection">;
  readonly bytes: Uint8Array;
  readonly normalizedSourceUrl: string;
  readonly finalUrl: string;
  readonly redirectUrls: readonly string[];
  readonly mimeType: string;
}

/** Request-scoped raw-content owner. Nothing here is durable or canonical. */
export interface OfficialMenuTransientContentStore
  extends TransientContentIdentityPort
{
  store(
    input: OfficialMenuContentStoreInput,
    context: PortInvocationContext,
  ): Promise<PortResult<TransientMenuContent>>;
  read(
    content: TransientMenuContent,
    context: PortInvocationContext,
  ): Promise<Uint8Array | null>;
  releaseScope(context: PortInvocationContext): void;
}

interface OfficialMenuRetrievalDependencies {
  readonly dnsResolver: OfficialMenuDnsResolver;
  readonly transport: OfficialMenuHttpTransport;
  readonly scheduleTimeout: (
    callback: () => void,
    timeoutMs: number,
  ) => TimeoutHandle;
  readonly clearScheduledTimeout: (handle: TimeoutHandle) => void;
}

export interface BoundedOfficialMenuAcquisitionDependencies {
  readonly dnsResolver: OfficialMenuDnsResolver;
  readonly transport: OfficialMenuHttpTransport;
  readonly limits: OfficialMenuRetrievalLimits;
  readonly scheduleTimeout?: (
    callback: () => void,
    timeoutMs: number,
  ) => TimeoutHandle;
  readonly clearScheduledTimeout?: (handle: TimeoutHandle) => void;
  readonly collectionClock?: () => string;
}

interface BoundedOfficialMenuCollectorDependencies
  extends BoundedOfficialMenuAcquisitionDependencies {
  readonly contentStore: OfficialMenuTransientContentStore;
}

export interface BoundedOfficialMenuAcquisitionRuntime {
  readonly orchestrator: OfficialMenuSourceAcquisitionOrchestrator;
  releaseScope(context: PortInvocationContext): void;
}

export type OfficialMenuRetrievalFailureReason =
  | "malformed_url"
  | "unsupported_scheme"
  | "embedded_credentials"
  | "unsafe_destination"
  | "unsafe_ip"
  | "dns_failure"
  | "redirect_escape"
  | "redirect_loop"
  | "redirect_limit"
  | "timeout"
  | "aborted"
  | "unsupported_mime"
  | "oversized_response"
  | "transport_failure"
  | "source_not_found"
  | "invalid_response";

interface OfficialMenuRetrievalSuccess {
  readonly status: "success";
  readonly value: Omit<OfficialMenuContentStoreInput, "selection">;
}

interface OfficialMenuRetrievalFailure {
  readonly status: "failure";
  readonly reason: OfficialMenuRetrievalFailureReason;
}

export type OfficialMenuRetrievalResult =
  | OfficialMenuRetrievalSuccess
  | OfficialMenuRetrievalFailure;

interface NormalizedUrlSuccess {
  readonly status: "success";
  readonly value: URL;
}

interface NormalizedUrlFailure {
  readonly status: "failure";
  readonly reason:
    | "malformed_url"
    | "unsupported_scheme"
    | "embedded_credentials"
    | "unsafe_destination";
}

type NormalizedUrlResult = NormalizedUrlSuccess | NormalizedUrlFailure;

interface ParsedIpAddress {
  readonly family: 4 | 6;
  readonly words: readonly number[];
}

interface StoredOfficialMenuContent {
  readonly ownerCorrelationId: string;
  readonly content: TransientMenuContent;
  readonly bytes: Uint8Array;
  readonly identity: TransientContentIdentity;
  readonly retrieval: {
    readonly sourceId: string;
    readonly sourceKind: OfficialMenuCollectorSelection["candidate"]["kind"];
    readonly normalizedSourceUrl: string;
    readonly finalUrl: string;
    readonly redirectUrls: readonly string[];
    readonly mimeType: string;
  };
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

const sourceNotFound = (context: PortInvocationContext): PublicOutcome =>
  PublicOutcomeSchema.parse({
    code: "MENU_SOURCE_NOT_FOUND",
    stage: "source_acquisition",
    correlationId: context.correlationId,
    retryable: true,
    canContinueMenuOnly: true,
  });

const failure = (
  reason: OfficialMenuRetrievalFailureReason,
): OfficialMenuRetrievalFailure => ({ status: "failure", reason });

const isRetrievalFailure = (
  value: unknown,
): value is OfficialMenuRetrievalFailure =>
  typeof value === "object" &&
  value !== null &&
  "status" in value &&
  value.status === "failure" &&
  "reason" in value &&
  typeof value.reason === "string" &&
  [
    "malformed_url",
    "unsupported_scheme",
    "embedded_credentials",
    "unsafe_destination",
    "unsafe_ip",
    "dns_failure",
    "redirect_escape",
    "redirect_loop",
    "redirect_limit",
    "timeout",
    "aborted",
    "unsupported_mime",
    "oversized_response",
    "transport_failure",
    "source_not_found",
    "invalid_response",
  ].includes(value.reason);

const validLimits = (limits: OfficialMenuRetrievalLimits): boolean =>
  Number.isSafeInteger(limits.maxRedirects) &&
  limits.maxRedirects >= 0 &&
  Number.isSafeInteger(limits.maxResponseBytes) &&
  limits.maxResponseBytes > 0;

const stripIpv6Brackets = (hostname: string): string =>
  hostname.startsWith("[") && hostname.endsWith("]")
    ? hostname.slice(1, -1)
    : hostname;

const parseIpv4 = (value: string): readonly number[] | null => {
  const parts = value.split(".");
  if (parts.length !== 4) return null;
  const octets = parts.map((part) =>
    /^\d{1,3}$/u.test(part) ? Number(part) : Number.NaN,
  );
  return octets.every(
    (octet) => Number.isInteger(octet) && octet >= 0 && octet <= 255,
  )
    ? octets
    : null;
};

const parseIpv6 = (rawValue: string): readonly number[] | null => {
  let value = rawValue.toLowerCase();
  if (value.includes("%") || value.length === 0) return null;

  if (value.includes(".")) {
    const separator = value.lastIndexOf(":");
    if (separator < 0) return null;
    const ipv4 = parseIpv4(value.slice(separator + 1));
    if (ipv4 === null) return null;
    const high = ((ipv4[0] ?? 0) << 8) | (ipv4[1] ?? 0);
    const low = ((ipv4[2] ?? 0) << 8) | (ipv4[3] ?? 0);
    value = `${value.slice(0, separator)}:${high.toString(16)}:${low.toString(16)}`;
  }

  const compressionParts = value.split("::");
  if (compressionParts.length > 2) return null;
  const parseWords = (part: string): readonly number[] | null => {
    if (part.length === 0) return [];
    const words = part.split(":");
    if (
      words.some((word) => !/^[0-9a-f]{1,4}$/u.test(word))
    ) {
      return null;
    }
    return words.map((word) => Number.parseInt(word, 16));
  };
  const left = parseWords(compressionParts[0] ?? "");
  const right = parseWords(compressionParts[1] ?? "");
  if (left === null || right === null) return null;

  if (compressionParts.length === 1) {
    return left.length === 8 ? left : null;
  }
  const missing = 8 - left.length - right.length;
  return missing >= 1
    ? [...left, ...Array.from({ length: missing }, () => 0), ...right]
    : null;
};

const parseIpAddress = (value: string): ParsedIpAddress | null => {
  const unwrapped = stripIpv6Brackets(value);
  const ipv4 = parseIpv4(unwrapped);
  if (ipv4 !== null) return { family: 4, words: ipv4 };
  const ipv6 = parseIpv6(unwrapped);
  return ipv6 === null ? null : { family: 6, words: ipv6 };
};

const isUnsafeIpv4 = (octets: readonly number[]): boolean => {
  const [a = -1, b = -1, c = -1] = octets;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 192 && b === 88 && c === 99) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113)
  );
};

const matchesIpv6Prefix = (
  words: readonly number[],
  prefixWords: readonly number[],
  prefixLength: number,
): boolean => {
  const completeWords = Math.floor(prefixLength / 16);
  for (let index = 0; index < completeWords; index += 1) {
    if (words[index] !== prefixWords[index]) return false;
  }
  const remainingBits = prefixLength % 16;
  if (remainingBits === 0) return true;
  const mask = (0xffff << (16 - remainingBits)) & 0xffff;
  return (
    ((words[completeWords] ?? 0) & mask) ===
    ((prefixWords[completeWords] ?? 0) & mask)
  );
};

/**
 * IANA IPv6 Special-Purpose Address Space entries inside otherwise public
 * unicast space. The broad non-2000::/3 check below already rejects NAT64,
 * discard-only, dummy, unique-local, link-local, site-local, and multicast.
 * Keep this list aligned with the IANA special-purpose registry.
 */
const BLOCKED_PUBLIC_SHAPED_IPV6_PREFIXES = [
  { words: [0x2001, 0x0000], prefixLength: 23 }, // IETF assignments/ORCHID
  { words: [0x2001, 0x0db8], prefixLength: 32 }, // documentation
  { words: [0x2002], prefixLength: 16 }, // 6to4
  { words: [0x2620, 0x004f, 0x8000], prefixLength: 48 }, // AS112
  { words: [0x3fff, 0x0000], prefixLength: 20 }, // documentation
] as const;

const isUnsafeIpv6 = (words: readonly number[]): boolean => {
  const first = words[0] ?? -1;
  const allZero = words.every((word) => word === 0);
  const loopback = words.slice(0, 7).every((word) => word === 0) &&
    words[7] === 1;
  const mappedIpv4 = words.slice(0, 5).every((word) => word === 0) &&
    words[5] === 0xffff;
  const compatibleIpv4 = words.slice(0, 6).every((word) => word === 0);
  if (mappedIpv4 || compatibleIpv4) {
    return true;
  }
  return (
    allZero ||
    loopback ||
    (first & 0xe000) !== 0x2000 ||
    BLOCKED_PUBLIC_SHAPED_IPV6_PREFIXES.some(({ words: prefix, prefixLength }) =>
      matchesIpv6Prefix(words, prefix, prefixLength),
    )
  );
};

const isUnsafeIpAddress = (address: ParsedIpAddress): boolean =>
  address.family === 4
    ? isUnsafeIpv4(address.words)
    : isUnsafeIpv6(address.words);

const validPublicHostname = (hostname: string): boolean => {
  const normalized = hostname.toLowerCase().replace(/\.$/u, "");
  if (
    normalized.length === 0 ||
    normalized === "localhost" ||
    BLOCKED_HOST_SUFFIXES.some((suffix) => normalized.endsWith(suffix))
  ) {
    return false;
  }
  if (parseIpAddress(normalized) !== null) return true;
  const labels = normalized.split(".");
  return (
    labels.length >= 2 &&
    labels.every((label) => SAFE_HOST_LABEL.test(label))
  );
};

const normalizeUrl = (rawUrl: string, baseUrl?: string): NormalizedUrlResult => {
  if (
    typeof rawUrl !== "string" ||
    rawUrl.trim().length === 0 ||
    rawUrl.length > 2_048
  ) {
    return { status: "failure", reason: "malformed_url" };
  }

  let parsed: URL;
  try {
    parsed = baseUrl === undefined ? new URL(rawUrl) : new URL(rawUrl, baseUrl);
  } catch {
    return { status: "failure", reason: "malformed_url" };
  }
  if (parsed.protocol !== "https:") {
    return { status: "failure", reason: "unsupported_scheme" };
  }
  if (parsed.username.length > 0 || parsed.password.length > 0) {
    return { status: "failure", reason: "embedded_credentials" };
  }
  if (parsed.port !== "" && parsed.port !== "443") {
    return { status: "failure", reason: "unsupported_scheme" };
  }

  const hostname = parsed.hostname.toLowerCase().replace(/\.$/u, "");
  if (!validPublicHostname(hostname)) {
    return { status: "failure", reason: "unsafe_destination" };
  }
  parsed.hash = "";
  parsed.port = "";
  if (!hostname.startsWith("[")) parsed.hostname = hostname;
  return { status: "success", value: parsed };
};

const sameOfficialHostname = (left: string, right: string): boolean => {
  const normalizedLeft = stripIpv6Brackets(left.toLowerCase());
  const normalizedRight = stripIpv6Brackets(right.toLowerCase());
  return normalizedLeft === normalizedRight;
};

const normalizedHeaders = (
  headers: Readonly<Record<string, string | undefined>>,
): ReadonlyMap<string, string> => {
  const result = new Map<string, string>();
  for (const [name, value] of Object.entries(headers)) {
    if (typeof value === "string") result.set(name.toLowerCase(), value.trim());
  }
  return result;
};

const contentKindForMime = (
  mimeType: string,
  collectorKind: OfficialMenuCollectorKind,
): Exclude<MenuContentKind, "image_collection"> | null => {
  if (collectorKind === OfficialMenuCollectorKind.PDF_MENU) {
    return mimeType === "application/pdf" ? "pdf" : null;
  }
  if (mimeType === "text/html" || mimeType === "application/xhtml+xml") {
    return "html";
  }
  return mimeType === "text/plain" ? "plain_text" : null;
};

const combineChunks = (
  chunks: readonly Uint8Array[],
  byteCount: number,
): Uint8Array => {
  const combined = new Uint8Array(byteCount);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return combined;
};

const hasPdfSignature = (bytes: Uint8Array): boolean =>
  bytes.byteLength >= 5 &&
  bytes[0] === 0x25 &&
  bytes[1] === 0x50 &&
  bytes[2] === 0x44 &&
  bytes[3] === 0x46 &&
  bytes[4] === 0x2d;

const resolveDestination = async (
  url: URL,
  dependencies: OfficialMenuRetrievalDependencies,
  signal: AbortSignal,
  raceWithInterruption: <T>(
    operation: Promise<T>,
  ) => Promise<T | OfficialMenuRetrievalFailure>,
): Promise<readonly string[] | OfficialMenuRetrievalFailure> => {
  const hostname = stripIpv6Brackets(url.hostname);
  const literal = parseIpAddress(hostname);
  if (literal !== null) {
    return isUnsafeIpAddress(literal)
      ? failure("unsafe_ip")
      : [hostname];
  }

  let addresses: readonly string[];
  try {
    const resolved = await raceWithInterruption(
      dependencies.dnsResolver.resolve(hostname, signal),
    );
    if (isRetrievalFailure(resolved)) return resolved;
    addresses = resolved;
  } catch {
    return failure("dns_failure");
  }
  if (!Array.isArray(addresses) || addresses.length === 0) {
    return failure("dns_failure");
  }

  const normalized = new Set<string>();
  for (const address of addresses) {
    if (typeof address !== "string") return failure("dns_failure");
    const parsed = parseIpAddress(address);
    if (parsed === null) return failure("dns_failure");
    if (isUnsafeIpAddress(parsed)) return failure("unsafe_ip");
    normalized.add(stripIpv6Brackets(address).toLowerCase());
  }
  return [...normalized].sort();
};

/** Package-internal result retains exact safe failure reasons for validation. */
export const retrieveBoundedOfficialMenu = async (
  selection: OfficialMenuCollectorSelection,
  limits: OfficialMenuRetrievalLimits,
  dependencies: Omit<OfficialMenuRetrievalDependencies, never>,
  context: PortInvocationContext,
): Promise<OfficialMenuRetrievalResult> => {
  PortInvocationContextSchema.parse(context);
  if (!validLimits(limits)) return failure("invalid_response");
  const selected = selectOfficialMenuCollector(selection.candidate, context);
  if (
    selected.status !== "success" ||
    selected.value.collectorKind !== selection.collectorKind
  ) {
    return failure("invalid_response");
  }

  const initial = normalizeUrl(selection.candidate.locator);
  if (initial.status === "failure") return initial;
  const normalizedSourceUrl = initial.value.toString();
  const initialHostname = initial.value.hostname;
  const seen = new Set([normalizedSourceUrl]);
  const redirectUrls: string[] = [];
  const providerController = new AbortController();
  let interruptedReason: "timeout" | "aborted" | null = null;
  let resolveInterruption!: (result: OfficialMenuRetrievalFailure) => void;
  const interruption = new Promise<OfficialMenuRetrievalFailure>((resolve) => {
    resolveInterruption = resolve;
  });
  const interrupt = (reason: "timeout" | "aborted"): void => {
    if (interruptedReason !== null) return;
    interruptedReason = reason;
    providerController.abort(
      reason === "timeout"
        ? new DOMException("official menu deadline exceeded", "TimeoutError")
        : context.signal.reason,
    );
    resolveInterruption(failure(reason));
  };
  const onAbort = (): void =>
    interrupt(isTimeoutAbortSignal(context.signal) ? "timeout" : "aborted");
  context.signal.addEventListener("abort", onAbort, { once: true });
  const timeoutHandle = dependencies.scheduleTimeout(
    () => interrupt("timeout"),
    context.timeoutMs,
  );
  const raceWithInterruption = <T>(
    operation: Promise<T>,
  ): Promise<T | OfficialMenuRetrievalFailure> =>
    Promise.race([operation, interruption]);
  const cancelUnconsumedResponse = async (
    response: OfficialMenuTransportResponse,
  ): Promise<void> => {
    try {
      if (typeof response.cancel !== "function") {
        interrupt("aborted");
        return;
      }
      await raceWithInterruption(Promise.resolve(response.cancel()));
    } catch {
      interrupt("aborted");
    }
  };

  try {
    if (context.signal.aborted) onAbort();
    let current = initial.value;
    while (true) {
      const approvedAddresses = await resolveDestination(
        current,
        dependencies,
        providerController.signal,
        raceWithInterruption,
      );
      if (isRetrievalFailure(approvedAddresses)) return approvedAddresses;

      let response: OfficialMenuTransportResponse;
      try {
        const requested = await raceWithInterruption(
          dependencies.transport.request({
            url: current.toString(),
            method: "GET",
            redirect: "manual",
            approvedAddresses,
            signal: providerController.signal,
          }),
        );
        if (requested.status === "failure") return requested;
        response = requested;
      } catch {
        return failure(interruptedReason ?? "transport_failure");
      }

      let responseBodyConsumed = false;
      try {
        if (
          !Number.isInteger(response.status) ||
          response.status < 100 ||
          response.status > 599 ||
          typeof response.headers !== "object" ||
          response.headers === null ||
          Array.isArray(response.headers)
        ) {
          return failure("invalid_response");
        }
        const headers = normalizedHeaders(response.headers);
        if (REDIRECT_STATUSES.has(response.status)) {
          const location = headers.get("location");
          if (location === undefined) return failure("invalid_response");
          const redirected = normalizeUrl(location, current.toString());
          if (redirected.status === "failure") {
            return failure("redirect_escape");
          }
          if (
            !sameOfficialHostname(initialHostname, redirected.value.hostname)
          ) {
            return failure("redirect_escape");
          }
          const target = redirected.value.toString();
          if (seen.has(target)) return failure("redirect_loop");
          if (redirectUrls.length >= limits.maxRedirects) {
            return failure("redirect_limit");
          }
          seen.add(target);
          redirectUrls.push(target);
          current = redirected.value;
          continue;
        }

        if (response.status === 404 || response.status === 410) {
          return failure("source_not_found");
        }
        if (response.status >= 500) return failure("transport_failure");
        if (response.status < 200 || response.status >= 300) {
          return failure("invalid_response");
        }

        const rawContentType = headers.get("content-type");
        const mimeType = rawContentType?.split(";", 1)[0]?.trim().toLowerCase();
        if (mimeType === undefined || mimeType.length === 0) {
          return failure("unsupported_mime");
        }
        const contentKind = contentKindForMime(
          mimeType,
          selection.collectorKind,
        );
        if (contentKind === null) return failure("unsupported_mime");

        const contentLength = headers.get("content-length");
        if (contentLength !== undefined) {
          if (!/^\d+$/u.test(contentLength)) return failure("invalid_response");
          const declaredLength = Number(contentLength);
          if (!Number.isSafeInteger(declaredLength)) {
            return failure("invalid_response");
          }
          if (declaredLength > limits.maxResponseBytes) {
            return failure("oversized_response");
          }
        }
        if (
          typeof response.body !== "object" ||
          response.body === null ||
          !(Symbol.asyncIterator in response.body)
        ) {
          return failure("invalid_response");
        }

        const chunks: Uint8Array[] = [];
        let byteCount = 0;
        let iterator: AsyncIterator<Uint8Array>;
        try {
          iterator = response.body[Symbol.asyncIterator]();
        } catch {
          return failure("invalid_response");
        }
        while (true) {
          let next: IteratorResult<Uint8Array>;
          try {
            const raced = await raceWithInterruption(iterator.next());
            if (isRetrievalFailure(raced)) return raced;
            next = raced;
          } catch {
            return failure(interruptedReason ?? "transport_failure");
          }
          if (next.done === true) {
            responseBodyConsumed = true;
            break;
          }
          if (!(next.value instanceof Uint8Array)) {
            return failure("invalid_response");
          }
          byteCount += next.value.byteLength;
          if (byteCount > limits.maxResponseBytes) {
            return failure("oversized_response");
          }
          chunks.push(next.value.slice());
        }
        if (byteCount === 0) return failure("invalid_response");
        const bytes = combineChunks(chunks, byteCount);
        if (contentKind === "pdf" && !hasPdfSignature(bytes)) {
          return failure("invalid_response");
        }
        return {
          status: "success",
          value: {
            contentKind,
            bytes,
            normalizedSourceUrl,
            finalUrl: current.toString(),
            redirectUrls: [...redirectUrls],
            mimeType,
          },
        };
      } finally {
        if (!responseBodyConsumed) {
          await cancelUnconsumedResponse(response);
        }
      }
    }
  } finally {
    context.signal.removeEventListener("abort", onAbort);
    dependencies.clearScheduledTimeout(timeoutHandle);
  }
};

const failureToPortResult = (
  reason: OfficialMenuRetrievalFailureReason,
  context: PortInvocationContext,
): PortResult<TransientMenuContent> => {
  switch (reason) {
    case "source_not_found":
      return { status: "outcome", outcome: sourceNotFound(context) };
    case "malformed_url":
    case "unsupported_scheme":
    case "embedded_credentials":
    case "unsafe_destination":
    case "unsafe_ip":
    case "redirect_escape":
      return { status: "error", error: publicError("UNSAFE_SOURCE", context) };
    case "oversized_response":
      return {
        status: "error",
        error: publicError("PAYLOAD_TOO_LARGE", context),
      };
    case "timeout":
      return {
        status: "error",
        error: publicError("UPSTREAM_TIMEOUT", context),
      };
    case "dns_failure":
    case "transport_failure":
    case "aborted":
      return {
        status: "error",
        error: publicError("UPSTREAM_UNAVAILABLE", context),
      };
    case "redirect_loop":
    case "redirect_limit":
    case "unsupported_mime":
    case "invalid_response":
      return {
        status: "error",
        error: publicError("INVALID_UPSTREAM_RESULT", context),
      };
  }
};

abstract class BoundedOfficialMenuCollector implements OfficialMenuCollector {
  abstract readonly collectorKind: OfficialMenuCollectorKind;
  readonly #dependencies: OfficialMenuRetrievalDependencies;

  protected constructor(
    private readonly configuration: BoundedOfficialMenuCollectorDependencies,
  ) {
    this.#dependencies = {
      dnsResolver: configuration.dnsResolver,
      transport: configuration.transport,
      scheduleTimeout:
        configuration.scheduleTimeout ??
        ((callback, timeoutMs) => setTimeout(callback, timeoutMs)),
      clearScheduledTimeout:
        configuration.clearScheduledTimeout ??
        ((handle) => clearTimeout(handle)),
    };
  }

  async collect(
    selection: OfficialMenuCollectorSelection,
    context: PortInvocationContext,
  ): Promise<PortResult<TransientMenuContent>> {
    PortInvocationContextSchema.parse(context);
    if (selection.collectorKind !== this.collectorKind) {
      return {
        status: "error",
        error: publicError("INVALID_UPSTREAM_RESULT", context),
      };
    }
    let retrieved: OfficialMenuRetrievalResult;
    try {
      retrieved = await retrieveBoundedOfficialMenu(
        selection,
        this.configuration.limits,
        this.#dependencies,
        context,
      );
    } catch {
      return {
        status: "error",
        error: publicError("INTERNAL_ERROR", context),
      };
    }
    if (retrieved.status === "failure") {
      return failureToPortResult(retrieved.reason, context);
    }

    let stored: PortResult<TransientMenuContent>;
    try {
      stored = await this.configuration.contentStore.store(
        {
          selection: {
            candidate: { ...selection.candidate },
            collectorKind: selection.collectorKind,
          },
          contentKind: retrieved.value.contentKind,
          bytes: retrieved.value.bytes.slice(),
          normalizedSourceUrl: retrieved.value.normalizedSourceUrl,
          finalUrl: retrieved.value.finalUrl,
          redirectUrls: [...retrieved.value.redirectUrls],
          mimeType: retrieved.value.mimeType,
        },
        context,
      );
    } catch {
      return {
        status: "error",
        error: publicError("UPSTREAM_UNAVAILABLE", context),
      };
    }
    if (stored.status !== "success") return stored;
    const parsed = TransientMenuContentSchema.safeParse(stored.value);
    if (
      !parsed.success ||
      parsed.data.kind !== retrieved.value.contentKind ||
      parsed.data.byteCount !== retrieved.value.bytes.byteLength
    ) {
      return {
        status: "error",
        error: publicError("INVALID_UPSTREAM_RESULT", context),
      };
    }
    return { status: "success", value: { ...parsed.data } };
  }
}

export class BoundedHtmlMenuPageCollector extends BoundedOfficialMenuCollector {
  readonly collectorKind = OfficialMenuCollectorKind.HTML_MENU_PAGE;

  constructor(dependencies: BoundedOfficialMenuCollectorDependencies) {
    super(dependencies);
  }
}

export class BoundedPdfMenuCollector extends BoundedOfficialMenuCollector {
  readonly collectorKind = OfficialMenuCollectorKind.PDF_MENU;

  constructor(dependencies: BoundedOfficialMenuCollectorDependencies) {
    super(dependencies);
  }
}

export class BoundedOrderPageCollector extends BoundedOfficialMenuCollector {
  readonly collectorKind = OfficialMenuCollectorKind.ORDER_PAGE;

  constructor(dependencies: BoundedOfficialMenuCollectorDependencies) {
    super(dependencies);
  }
}

const fingerprintFor = async (
  input: OfficialMenuContentStoreInput,
): Promise<string> => {
  const metadata = new TextEncoder().encode(
    [
      input.selection.candidate.sourceId,
      input.selection.candidate.kind,
      input.normalizedSourceUrl,
      input.finalUrl,
      input.mimeType,
    ].join("\u0000"),
  );
  const fingerprintInput = new Uint8Array(
    metadata.byteLength + 1 + input.bytes.byteLength,
  );
  fingerprintInput.set(metadata, 0);
  fingerprintInput[metadata.byteLength] = 0;
  fingerprintInput.set(input.bytes, metadata.byteLength + 1);
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    fingerprintInput,
  );
  return `sha256:${[...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("")}`;
};

/**
 * Request-scoped implementation that keeps source bytes only in memory and
 * exposes them solely through their opaque transient handle.
 */
export class RequestScopedOfficialMenuContentStore
  implements OfficialMenuTransientContentStore
{
  readonly #records = new Map<string, StoredOfficialMenuContent>();

  constructor(
    private readonly idFactory: () => string = () =>
      globalThis.crypto.randomUUID(),
  ) {}

  async store(
    input: OfficialMenuContentStoreInput,
    context: PortInvocationContext,
  ): Promise<PortResult<TransientMenuContent>> {
    PortInvocationContextSchema.parse(context);
    const selected = selectOfficialMenuCollector(
      input.selection.candidate,
      context,
    );
    if (
      selected.status !== "success" ||
      selected.value.collectorKind !== input.selection.collectorKind ||
      !(input.bytes instanceof Uint8Array) ||
      input.bytes.byteLength === 0 ||
      input.normalizedSourceUrl.length === 0 ||
      input.finalUrl.length === 0 ||
      !Array.isArray(input.redirectUrls) ||
      input.redirectUrls.some((url) => typeof url !== "string") ||
      input.mimeType.length === 0 ||
      contentKindForMime(input.mimeType, input.selection.collectorKind) !==
        input.contentKind
    ) {
      return {
        status: "error",
        error: publicError("INVALID_UPSTREAM_RESULT", context),
      };
    }

    const snapshot: OfficialMenuContentStoreInput = {
      selection: {
        candidate: { ...input.selection.candidate },
        collectorKind: input.selection.collectorKind,
      },
      contentKind: input.contentKind,
      bytes: input.bytes.slice(),
      normalizedSourceUrl: input.normalizedSourceUrl,
      finalUrl: input.finalUrl,
      redirectUrls: [...input.redirectUrls],
      mimeType: input.mimeType,
    };

    let sourceRef: string;
    let contentHandleId: string;
    let sourceFingerprint: string;
    try {
      sourceRef = this.idFactory();
      contentHandleId = this.idFactory();
      sourceFingerprint = await fingerprintFor(snapshot);
    } catch {
      return {
        status: "error",
        error: publicError("INTERNAL_ERROR", context),
      };
    }
    const contentHandle = `official:${contentHandleId}`;
    if (
      !UUID_PATTERN.test(sourceRef) ||
      !UUID_PATTERN.test(contentHandleId) ||
      this.#records.has(contentHandle)
    ) {
      return {
        status: "error",
        error: publicError("INTERNAL_ERROR", context),
      };
    }

    const content = TransientMenuContentSchema.parse({
      kind: snapshot.contentKind,
      contentHandle,
      sensitivity: "sensitive_transient",
      byteCount: snapshot.bytes.byteLength,
      pageCount: null,
    });
    this.#records.set(contentHandle, {
      ownerCorrelationId: context.correlationId,
      content: { ...content },
      bytes: snapshot.bytes,
      identity: { sourceRef, sourceFingerprint },
      retrieval: {
        sourceId: snapshot.selection.candidate.sourceId,
        sourceKind: snapshot.selection.candidate.kind,
        normalizedSourceUrl: snapshot.normalizedSourceUrl,
        finalUrl: snapshot.finalUrl,
        redirectUrls: snapshot.redirectUrls,
        mimeType: snapshot.mimeType,
      },
    });
    return { status: "success", value: { ...content } };
  }

  identify(
    content: TransientMenuContent,
    context: PortInvocationContext,
  ): Promise<TransientContentIdentity | null> {
    PortInvocationContextSchema.parse(context);
    const parsed = TransientMenuContentSchema.safeParse(content);
    if (!parsed.success) return Promise.resolve(null);
    const record = this.#records.get(parsed.data.contentHandle);
    return Promise.resolve(
      record !== undefined &&
        record.ownerCorrelationId === context.correlationId &&
        record.content.kind === parsed.data.kind &&
        record.content.byteCount === parsed.data.byteCount &&
        record.content.pageCount === parsed.data.pageCount
        ? { ...record.identity }
        : null,
    );
  }

  read(
    content: TransientMenuContent,
    context: PortInvocationContext,
  ): Promise<Uint8Array | null> {
    PortInvocationContextSchema.parse(context);
    const parsed = TransientMenuContentSchema.safeParse(content);
    if (!parsed.success) return Promise.resolve(null);
    const record = this.#records.get(parsed.data.contentHandle);
    return Promise.resolve(
      record !== undefined &&
        record.ownerCorrelationId === context.correlationId &&
        record.content.kind === parsed.data.kind &&
        record.content.byteCount === parsed.data.byteCount &&
        record.content.pageCount === parsed.data.pageCount
        ? record.bytes.slice()
        : null,
    );
  }

  releaseScope(context: PortInvocationContext): void {
    PortInvocationContextSchema.parse(context);
    for (const [contentHandle, record] of this.#records) {
      if (record.ownerCorrelationId !== context.correlationId) continue;
      record.bytes.fill(0);
      this.#records.delete(contentHandle);
    }
  }
}

/**
 * Creates the public, opaque runtime while retaining raw storage and reading
 * exclusively inside this module.
 */
export const createBoundedOfficialMenuAcquisitionRuntime = (
  dependencies: BoundedOfficialMenuAcquisitionDependencies,
): BoundedOfficialMenuAcquisitionRuntime => {
  const contentStore = new RequestScopedOfficialMenuContentStore();
  const collectorDependencies: BoundedOfficialMenuCollectorDependencies = {
    ...dependencies,
    contentStore,
  };
  const collectorService = new OfficialMenuCollectorService(
    new BoundedHtmlMenuPageCollector(collectorDependencies),
    new BoundedPdfMenuCollector(collectorDependencies),
    new BoundedOrderPageCollector(collectorDependencies),
  );
  const orchestrator =
    dependencies.collectionClock === undefined
      ? new OfficialMenuSourceAcquisitionOrchestrator(
          collectorService,
          contentStore,
        )
      : new OfficialMenuSourceAcquisitionOrchestrator(
          collectorService,
          contentStore,
          dependencies.collectionClock,
        );
  return Object.freeze({
    orchestrator,
    releaseScope: (context: PortInvocationContext): void =>
      contentStore.releaseScope(context),
  });
};
