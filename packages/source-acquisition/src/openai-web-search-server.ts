import {
  MenuSourceAcquisitionRequestSchema,
  PUBLIC_ERROR_REGISTRY,
  SERVER_ENV_NAMES,
  PortInvocationContextSchema,
  PublicErrorEnvelopeSchema,
  isTimeoutAbortSignal,
  type MenuSourceAcquisitionRequest,
  type PortInvocationContext,
  type PortResult,
  type PublicErrorCode,
  type PublicErrorEnvelope,
  type RestaurantCandidate,
} from "@foodseyo/contracts";

import { restaurantContextFromMenuSourceRequest } from "./foundation.js";
import type {
  WebSearchMenuSourceCandidate,
  WebSearchMenuSourceDiscoveryPort,
} from "./web-search-fallback.js";

const OPENAI_RESPONSES_ENDPOINT = "https://api.openai.com/v1/responses";
const MAX_WEB_SEARCH_CANDIDATES = 6;
const DEFAULT_MAX_RESPONSE_BYTES = 512 * 1024;
const MENU_SIGNAL = /(?:^|[\s/_-])(menu|menus|order|ordering)(?:$|[\s/_.?-])/iu;
const WORD = /[\p{L}\p{N}]+/gu;

type TimeoutHandle = ReturnType<typeof setTimeout>;

interface OpenAIWebSearchDependencies {
  readonly fetchImplementation: typeof fetch;
  readonly scheduleTimeout: (
    callback: () => void,
    timeoutMs: number,
  ) => TimeoutHandle;
  readonly clearScheduledTimeout: (handle: TimeoutHandle) => void;
  readonly maxResponseBytes: number;
}

interface RawSearchSource {
  readonly url: string;
  readonly title: string | null;
  readonly providerOrdinal: number;
  readonly responseId: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

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

const normalizeText = (value: string): string =>
  value.normalize("NFKC").toLocaleLowerCase("en-US").replace(/\s+/gu, " ").trim();

const tokens = (value: string): readonly string[] =>
  normalizeText(value).match(WORD)?.filter((token) => token.length >= 2) ?? [];

const normalizedHttpsUrl = (raw: string): string | null => {
  try {
    const url = new URL(raw);
    if (
      url.protocol !== "https:" ||
      url.username.length > 0 ||
      url.password.length > 0 ||
      (url.port.length > 0 && url.port !== "443") ||
      url.hostname.length === 0
    ) {
      return null;
    }
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
};

const selectedCandidate = (
  request: MenuSourceAcquisitionRequest,
): RestaurantCandidate | null => {
  const restaurant = restaurantContextFromMenuSourceRequest(request);
  if (restaurant === null) return null;
  return (
    request.restaurantResolution.candidates.find(
      (candidate) => candidate.candidateId === restaurant.candidateId,
    ) ?? null
  );
};

const buildQuery = (
  candidate: RestaurantCandidate,
  request: MenuSourceAcquisitionRequest,
): string =>
  [
    "Search the web for menu source webpages for this already-confirmed restaurant branch.",
    `Exact restaurant: ${candidate.displayName}`,
    `Full address: ${candidate.fullAddress ?? candidate.shortAddress ?? "not provided"}`,
    `Requested menu scope: ${request.menuScope}`,
    "Find menu pages, menu PDFs, or first-party ordering pages that display menu items.",
    "Do not identify a different restaurant or branch. Do not provide restaurant facts.",
    "Use web search and return cited source URLs.",
  ].join("\n");

const extractSources = (payload: unknown): readonly RawSearchSource[] | null => {
  if (
    !isRecord(payload) ||
    typeof payload.id !== "string" ||
    payload.id.trim().length === 0 ||
    !Array.isArray(payload.output)
  ) {
    return null;
  }
  const sources: RawSearchSource[] = [];
  for (const output of payload.output) {
    if (!isRecord(output) || output.type !== "web_search_call") continue;
    if (!isRecord(output.action) || !Array.isArray(output.action.sources)) {
      continue;
    }
    for (const source of output.action.sources) {
      if (!isRecord(source) || typeof source.url !== "string") return null;
      if (
        source.title !== undefined &&
        source.title !== null &&
        typeof source.title !== "string"
      ) {
        return null;
      }
      sources.push({
        url: source.url,
        title: typeof source.title === "string" ? source.title : null,
        providerOrdinal: sources.length + 1,
        responseId: payload.id,
      });
    }
  }
  return sources;
};

const rankingScore = (
  source: RawSearchSource,
  url: string,
  candidate: RestaurantCandidate,
): number => {
  const evidence = normalizeText(`${source.title ?? ""} ${url}`);
  const name = normalizeText(candidate.displayName);
  const nameTokens = new Set(tokens(candidate.displayName));
  const addressTokens = new Set(
    tokens(candidate.fullAddress ?? candidate.shortAddress ?? ""),
  );
  let score = MENU_SIGNAL.test(evidence) ? 40 : 0;
  if (name.length > 0 && evidence.includes(name)) score += 100;
  for (const token of nameTokens) if (evidence.includes(token)) score += 10;
  for (const token of addressTokens) if (evidence.includes(token)) score += 2;
  if (new URL(url).pathname.toLocaleLowerCase("en-US").endsWith(".pdf")) {
    score += 5;
  }
  return score;
};

const rankWebSearchMenuSources = (
  rawSources: readonly RawSearchSource[],
  candidate: RestaurantCandidate,
): readonly WebSearchMenuSourceCandidate[] => {
  const deduplicated = new Map<string, RawSearchSource>();
  for (const source of rawSources) {
    const url = normalizedHttpsUrl(source.url);
    if (url === null) continue;
    const evidence = `${source.title ?? ""} ${new URL(url).pathname}`;
    if (!MENU_SIGNAL.test(evidence)) continue;
    const existing = deduplicated.get(url);
    if (
      existing === undefined ||
      source.providerOrdinal < existing.providerOrdinal
    ) {
      deduplicated.set(url, { ...source, url });
    }
  }

  return [...deduplicated.values()]
    .map((source) => ({
      source,
      score: rankingScore(source, source.url, candidate),
    }))
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.source.providerOrdinal - right.source.providerOrdinal ||
        left.source.url.localeCompare(right.source.url),
    )
    .slice(0, MAX_WEB_SEARCH_CANDIDATES)
    .map(({ source }, index) => ({
      sourceId: `web-search:${source.responseId}:${source.providerOrdinal}`,
      locator: source.url,
      title: source.title,
      providerOrdinal: source.providerOrdinal,
      rank: index + 1,
    }));
};

const readBoundedJson = async (
  response: Response,
  maxBytes: number,
  signal: AbortSignal,
): Promise<unknown> => {
  if (response.body === null) throw new Error("missing body");
  const declared = response.headers.get("content-length");
  if (declared !== null) {
    if (!/^\d+$/u.test(declared) || Number(declared) > maxBytes) {
      throw new RangeError("response too large");
    }
  }
  const reader = response.body.getReader();
  const onAbort = (): void => {
    void reader.cancel(signal.reason).catch(() => undefined);
  };
  signal.addEventListener("abort", onAbort, { once: true });
  const chunks: Uint8Array[] = [];
  let byteCount = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      byteCount += next.value.byteLength;
      if (byteCount > maxBytes) throw new RangeError("response too large");
      chunks.push(next.value.slice());
    }
  } finally {
    signal.removeEventListener("abort", onAbort);
    reader.releaseLock();
  }
  const bytes = new Uint8Array(byteCount);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
};

export class OpenAIWebSearchMenuSourceDiscovery
  implements WebSearchMenuSourceDiscoveryPort
{
  readonly #apiKey: string;
  readonly #model: string;
  readonly #dependencies: OpenAIWebSearchDependencies;

  constructor(
    apiKey: string,
    model: string,
    dependencies: Partial<OpenAIWebSearchDependencies> = {},
  ) {
    if (typeof window !== "undefined") {
      throw new Error("OpenAI web search discovery is server-only.");
    }
    this.#apiKey = apiKey.trim();
    this.#model = model.trim();
    if (this.#apiKey.length === 0 || this.#model.length === 0) {
      throw new Error("OpenAI web search configuration is unavailable.");
    }
    this.#dependencies = {
      fetchImplementation:
        dependencies.fetchImplementation ?? globalThis.fetch.bind(globalThis),
      scheduleTimeout:
        dependencies.scheduleTimeout ??
        ((callback, timeoutMs) => setTimeout(callback, timeoutMs)),
      clearScheduledTimeout:
        dependencies.clearScheduledTimeout ?? ((handle) => clearTimeout(handle)),
      maxResponseBytes:
        dependencies.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES,
    };
    if (
      !Number.isSafeInteger(this.#dependencies.maxResponseBytes) ||
      this.#dependencies.maxResponseBytes < 1
    ) {
      throw new Error("OpenAI web search response limit is invalid.");
    }
  }

  async discover(
    request: MenuSourceAcquisitionRequest,
    context: PortInvocationContext,
  ): Promise<PortResult<readonly WebSearchMenuSourceCandidate[]>> {
    PortInvocationContextSchema.parse(context);
    const parsedRequest = MenuSourceAcquisitionRequestSchema.safeParse(request);
    if (!parsedRequest.success) {
      return { status: "error", error: publicError("INVALID_INPUT", context) };
    }
    const parsed = parsedRequest.data;
    const candidate = selectedCandidate(parsed);
    if (candidate === null) {
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

    const controller = new AbortController();
    let deadlineExpired = false;
    const interrupted = Symbol("webSearchInterrupted");
    let resolveInterruption!: (value: typeof interrupted) => void;
    const interruption = new Promise<typeof interrupted>((resolve) => {
      resolveInterruption = resolve;
    });
    const onAbort = (): void => {
      controller.abort(context.signal.reason);
      resolveInterruption(interrupted);
    };
    context.signal.addEventListener("abort", onAbort, { once: true });
    const timeout = this.#dependencies.scheduleTimeout(() => {
      deadlineExpired = true;
      controller.abort(new DOMException("web search deadline exceeded", "TimeoutError"));
      resolveInterruption(interrupted);
    }, context.timeoutMs);

    try {
      const requested = await Promise.race([
        this.#dependencies.fetchImplementation(OPENAI_RESPONSES_ENDPOINT, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.#apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: this.#model,
            tools: [{ type: "web_search", search_context_size: "low" }],
            tool_choice: "auto",
            include: ["web_search_call.action.sources"],
            max_output_tokens: 256,
            input: buildQuery(candidate, parsed),
          }),
          signal: controller.signal,
        }),
        interruption,
      ]);
      if (requested === interrupted) {
        return {
          status: "error",
          error: publicError(
            deadlineExpired || isTimeoutAbortSignal(context.signal)
              ? "UPSTREAM_TIMEOUT"
              : "UPSTREAM_UNAVAILABLE",
            context,
          ),
        };
      }
      const response = requested;
      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined);
        return {
          status: "error",
          error: publicError("UPSTREAM_UNAVAILABLE", context),
        };
      }
      let payload: unknown;
      try {
        const read = await Promise.race([
          readBoundedJson(
            response,
            this.#dependencies.maxResponseBytes,
            controller.signal,
          ),
          interruption,
        ]);
        if (read === interrupted) {
          await response.body?.cancel().catch(() => undefined);
          return {
            status: "error",
            error: publicError(
              deadlineExpired || isTimeoutAbortSignal(context.signal)
                ? "UPSTREAM_TIMEOUT"
                : "UPSTREAM_UNAVAILABLE",
              context,
            ),
          };
        }
        payload = read;
      } catch (error) {
        await response.body?.cancel().catch(() => undefined);
        return {
          status: "error",
          error: publicError(
            error instanceof RangeError
              ? "PAYLOAD_TOO_LARGE"
              : "INVALID_UPSTREAM_RESULT",
            context,
          ),
        };
      }
      const sources = extractSources(payload);
      if (sources === null) {
        return {
          status: "error",
          error: publicError("INVALID_UPSTREAM_RESULT", context),
        };
      }
      return {
        status: "success",
        value: rankWebSearchMenuSources(sources, candidate),
      };
    } catch {
      return {
        status: "error",
        error: publicError(
          deadlineExpired || isTimeoutAbortSignal(context.signal)
            ? "UPSTREAM_TIMEOUT"
            : "UPSTREAM_UNAVAILABLE",
          context,
        ),
      };
    } finally {
      context.signal.removeEventListener("abort", onAbort);
      this.#dependencies.clearScheduledTimeout(timeout);
    }
  }
}

export const createOpenAIWebSearchMenuSourceDiscoveryFromEnvironment = (
  environment: Readonly<Record<string, string | undefined>>,
  dependencies: Partial<OpenAIWebSearchDependencies> = {},
): OpenAIWebSearchMenuSourceDiscovery => {
  if (environment[SERVER_ENV_NAMES.webSearchDiscoveryEnabled] !== "true") {
    throw new Error("OpenAI web search discovery is disabled.");
  }
  return new OpenAIWebSearchMenuSourceDiscovery(
    environment[SERVER_ENV_NAMES.openAiApiKey] ?? "",
    environment[SERVER_ENV_NAMES.webSearchModel] ?? "",
    dependencies,
  );
};
