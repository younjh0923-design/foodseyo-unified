import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import type { IncomingHttpHeaders } from "node:http";
import { isIP } from "node:net";
import { request as httpsRequest } from "node:https";

import {
  CONTRACT_VERSIONS,
  MENU_SCOPES,
  MenuSourceAcquisitionRequestSchema,
  CompactMenuExtractionSchema,
  PUBLIC_ERROR_REGISTRY,
  PublicErrorEnvelopeSchema,
  PublicOutcomeSchema,
  SERVER_ENV_NAMES,
  type CompactMenuExtraction,
  type MenuSourceAcquisitionPort,
  type MenuSourceInput,
  type PortInvocationContext,
  type PortResult,
  type PublicErrorCode,
  type RestaurantResolution,
} from "@foodseyo/contracts";
import {
  OpenAIWebSearchMenuSourceDiscovery,
  OfficialMenuSourceDiscoveryService,
  createBoundedOfficialMenuAcquisitionRuntime,
  createBoundedWebSearchFallbackRuntime,
  selectOfficialMenuCollectors,
  verifyOfficialMenuCollectorSelection,
  type OfficialMenuDnsResolver,
  type OfficialMenuHttpTransport,
  type OfficialMenuSourceCandidate,
  type WebSearchMenuSourceCandidate,
} from "@foodseyo/source-acquisition";

const OPENAI_RESPONSES_ENDPOINT = "https://api.openai.com/v1/responses";
const GOOGLE_PLACE_DETAILS_ENDPOINT =
  "https://places.googleapis.com/v1/places/";
const MAX_SOURCE_BYTES = 10 * 1024 * 1024;
const MAX_SOURCE_ATTEMPTS = 4;
const MAX_HTML_TEXT_CHARS = 120_000;

interface OfficialMenuAnalysisDependencies {
  readonly fetchImplementation: typeof fetch;
  readonly now: () => string;
  readonly dnsResolver: OfficialMenuDnsResolver;
  readonly transport: OfficialMenuHttpTransport;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const publicError = (
  code: PublicErrorCode,
  context: PortInvocationContext,
) => {
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

const noSource = (context: PortInvocationContext) =>
  PublicOutcomeSchema.parse({
    code: "MENU_SOURCE_NOT_FOUND",
    stage: "source_acquisition",
    correlationId: context.correlationId,
    retryable: true,
    canContinueMenuOnly: true,
  });

const sourceKind = (locator: string): OfficialMenuSourceCandidate["kind"] => {
  const path = new URL(locator).pathname.toLocaleLowerCase("en-US");
  if (path.endsWith(".pdf")) return "official_pdf";
  if (/(?:^|\/)(?:order|ordering)(?:\/|$)/u.test(path)) {
    return "official_order_page";
  }
  return "official_menu_page";
};

const normalizedHttpsLink = (value: string): string | null => {
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username.length > 0 ||
      url.password.length > 0 ||
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

const rootDomain = (hostname: string): string =>
  hostname.toLocaleLowerCase("en-US").replace(/^www\./u, "");

const sameOfficialDomain = (candidate: string, official: string): boolean => {
  const candidateHost = rootDomain(new URL(candidate).hostname);
  const officialHost = rootDomain(new URL(official).hostname);
  return (
    candidateHost === officialHost ||
    candidateHost.endsWith(`.${officialHost}`) ||
    officialHost.endsWith(`.${candidateHost}`)
  );
};

const headersRecord = (
  headers: IncomingHttpHeaders,
): Readonly<Record<string, string | undefined>> => {
  const result: Record<string, string | undefined> = {};
  for (const [name, value] of Object.entries(headers)) {
    result[name] = Array.isArray(value) ? value.join(", ") : value;
  }
  return result;
};

const dnsResolver: OfficialMenuDnsResolver = {
  async resolve(hostname, signal) {
    if (signal.aborted) throw signal.reason;
    const records = await lookup(hostname, { all: true, verbatim: true });
    if (signal.aborted) throw signal.reason;
    return [...new Set(records.map((record) => record.address))];
  },
};

const httpsTransport: OfficialMenuHttpTransport = {
  request(input) {
    return new Promise((resolve, reject) => {
      const url = new URL(input.url);
      const address = input.approvedAddresses.find((value) => isIP(value) !== 0);
      if (address === undefined) {
        reject(new Error("approved address unavailable"));
        return;
      }
      let settled = false;
      const request = httpsRequest(
        {
          protocol: "https:",
          hostname: url.hostname,
          port: url.port.length > 0 ? Number(url.port) : 443,
          path: `${url.pathname}${url.search}`,
          method: "GET",
          servername: url.hostname,
          headers: {
            Host: url.host,
            Accept: "text/html,application/pdf,text/plain;q=0.9,*/*;q=0.1",
            "Accept-Encoding": "identity",
            "User-Agent": "FoodseyoMenuCollector/1.0",
          },
          lookup: (_hostname, _options, callback) =>
            callback(null, address, isIP(address) as 4 | 6),
        },
        (response) => {
          settled = true;
          resolve({
            status: response.statusCode ?? 0,
            headers: headersRecord(response.headers),
            body: response,
            cancel: async () => {
              response.destroy();
            },
          });
        },
      );
      const onAbort = (): void => {
        request.destroy(input.signal.reason);
      };
      input.signal.addEventListener("abort", onAbort, { once: true });
      request.once("close", () =>
        input.signal.removeEventListener("abort", onAbort),
      );
      request.once("error", (error) => {
        if (!settled) reject(error);
      });
      request.end();
    });
  },
};

const officialWebsiteForPlace = async (
  placeId: string,
  apiKey: string,
  fetchImplementation: typeof fetch,
  signal: AbortSignal,
): Promise<string | null> => {
  let response: Response;
  try {
    response = await fetchImplementation(
      `${GOOGLE_PLACE_DETAILS_ENDPOINT}${encodeURIComponent(placeId)}`,
      {
        headers: {
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": "websiteUri",
        },
        signal,
      },
    );
  } catch {
    return null;
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    return null;
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return null;
  }
  return isRecord(payload) && typeof payload.websiteUri === "string"
    ? normalizedHttpsLink(payload.websiteUri)
    : null;
};

const responseText = (payload: unknown): string | null => {
  if (!isRecord(payload) || !Array.isArray(payload.output)) return null;
  for (const output of payload.output) {
    if (!isRecord(output) || !Array.isArray(output.content)) continue;
    for (const content of output.content) {
      if (
        isRecord(content) &&
        content.type === "output_text" &&
        typeof content.text === "string"
      ) {
        return content.text;
      }
    }
  }
  return null;
};

const compactSchema = {
  type: "object",
  additionalProperties: false,
  required: ["analysisQuality", "menuScope", "sections"],
  properties: {
    analysisQuality: { type: "string", enum: ["good", "partial", "unreadable"] },
    menuScope: { type: "string", enum: [...MENU_SCOPES] },
    sections: {
      type: "array",
      maxItems: 30,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "items"],
        properties: {
          name: { type: ["string", "null"] },
          items: {
            type: "array",
            maxItems: 100,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["name", "description", "price", "optionTexts"],
              properties: {
                name: { type: "string" },
                description: { type: ["string", "null"] },
                price: {
                  anyOf: [
                    { type: "null" },
                    {
                      type: "object",
                      additionalProperties: false,
                      required: ["amountMinor", "currency"],
                      properties: {
                        amountMinor: { type: "integer", minimum: 0 },
                        currency: { type: "string", pattern: "^[A-Z]{3}$" },
                      },
                    },
                  ],
                },
                optionTexts: {
                  type: "array",
                  maxItems: 30,
                  items: { type: "string" },
                },
              },
            },
          },
        },
      },
    },
  },
} as const;

const visibleHtmlText = (bytes: Uint8Array): string =>
  new TextDecoder()
    .decode(bytes)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/giu, " ")
    .replace(/<!--[\s\S]*?-->/gu, " ")
    .replace(/<[^>]+>/gu, " ")
    .replace(/&nbsp;/giu, " ")
    .replace(/&amp;/giu, "&")
    .replace(/&lt;/giu, "<")
    .replace(/&gt;/giu, ">")
    .replace(/&#39;|&apos;/giu, "'")
    .replace(/&quot;/giu, '"')
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, MAX_HTML_TEXT_CHARS);

const boundedText = (value: unknown, maximum: number): string | null => {
  if (value === null) return null;
  if (typeof value !== "string") return null;
  const normalized = value.normalize("NFKC").replace(/\s+/gu, " ").trim();
  return normalized.length > 0 && normalized.length <= maximum
    ? normalized
    : null;
};

const extractionFromProvider = (
  value: unknown,
  source: MenuSourceInput,
  completedAt: string,
): CompactMenuExtraction | null => {
  if (
    !isRecord(value) ||
    !["good", "partial", "unreadable"].includes(
      typeof value.analysisQuality === "string" ? value.analysisQuality : "",
    ) ||
    !MENU_SCOPES.includes(value.menuScope as (typeof MENU_SCOPES)[number]) ||
    !Array.isArray(value.sections) ||
    value.sections.length > 30 ||
    value.analysisQuality === "unreadable"
  ) {
    return null;
  }
  let totalItems = 0;
  const sections = [];
  for (const [sectionIndex, rawSection] of value.sections.entries()) {
    if (!isRecord(rawSection) || !Array.isArray(rawSection.items)) return null;
    const name = boundedText(rawSection.name, 200);
    if (rawSection.name !== null && name === null) return null;
    const items = [];
    for (const [itemIndex, rawItem] of rawSection.items.entries()) {
      if (
        !isRecord(rawItem) ||
        !Array.isArray(rawItem.optionTexts) ||
        rawItem.optionTexts.length > 30
      ) {
        return null;
      }
      const itemName = boundedText(rawItem.name, 300);
      const description = boundedText(rawItem.description, 1_500);
      if (
        itemName === null ||
        (rawItem.description !== null && description === null) ||
        !rawItem.optionTexts.every(
          (option) => typeof option === "string" && boundedText(option, 200) !== null,
        )
      ) {
        return null;
      }
      let price = null;
      if (rawItem.price !== null) {
        if (
          !isRecord(rawItem.price) ||
          !Number.isSafeInteger(rawItem.price.amountMinor) ||
          (rawItem.price.amountMinor as number) < 0 ||
          typeof rawItem.price.currency !== "string" ||
          !/^[A-Z]{3}$/u.test(rawItem.price.currency)
        ) {
          return null;
        }
        price = {
          amountMinor: rawItem.price.amountMinor as number,
          currency: rawItem.price.currency,
        };
      }
      items.push({
        itemIndex,
        name: itemName,
        description,
        price,
        optionTexts: rawItem.optionTexts.map((option) =>
          (option as string).normalize("NFKC").replace(/\s+/gu, " ").trim(),
        ),
        sourceEvidence: [
          {
            kind: "menu_source" as const,
            sourceRef: source.source.sourceRef,
            sourceIndexes: [0],
          },
        ],
      });
      totalItems += 1;
      if (totalItems > 200) return null;
    }
    sections.push({ sectionIndex, name, items });
  }
  if (totalItems === 0) return null;
  const parsed = CompactMenuExtractionSchema.safeParse({
    contractVersion: CONTRACT_VERSIONS.compactExtraction,
    extractionState: "unvalidated",
    source: source.source,
    restaurantContext: source.restaurantContext,
    menuScope: value.menuScope,
    sections,
    warningCodes: value.analysisQuality === "partial" ? ["partial_menu"] : [],
    completedAt,
  });
  return parsed.success ? parsed.data : null;
};

const extractCollectedMenu = async (
  source: MenuSourceInput,
  bytes: Uint8Array,
  apiKey: string,
  model: string,
  dependencies: OfficialMenuAnalysisDependencies,
  context: PortInvocationContext,
): Promise<PortResult<CompactMenuExtraction>> => {
  const content =
    source.content.kind === "pdf"
      ? [
          {
            type: "input_file",
            filename: "menu.pdf",
            file_data: `data:application/pdf;base64,${Buffer.from(bytes).toString("base64")}`,
          },
          { type: "input_text", text: "Extract this restaurant menu." },
        ]
      : [
          {
            type: "input_text",
            text: `Extract the menu from this collected source text:\n${visibleHtmlText(bytes)}`,
          },
        ];
  let response: Response;
  try {
    response = await dependencies.fetchImplementation(OPENAI_RESPONSES_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        instructions:
          "Extract only menu items stated in the supplied official or discovered source. Preserve section and item order. Prices use nonnegative minor units and ISO 4217 currency. Do not invent ingredients, safety claims, restaurant identity, or missing prices.",
        input: [{ role: "user", content }],
        text: {
          format: {
            type: "json_schema",
            name: "foodseyo_collected_menu_extraction",
            strict: true,
            schema: compactSchema,
          },
        },
        max_output_tokens: 12_000,
        store: false,
      }),
      signal: context.signal,
    });
  } catch {
    return { status: "error", error: publicError("UPSTREAM_UNAVAILABLE", context) };
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    return { status: "error", error: publicError("UPSTREAM_UNAVAILABLE", context) };
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return { status: "error", error: publicError("INVALID_UPSTREAM_RESULT", context) };
  }
  const text = responseText(payload);
  if (text === null) {
    return { status: "error", error: publicError("INVALID_UPSTREAM_RESULT", context) };
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(text);
  } catch {
    return { status: "error", error: publicError("INVALID_UPSTREAM_RESULT", context) };
  }
  const extraction = extractionFromProvider(
    decoded,
    source,
    dependencies.now(),
  );
  return extraction === null
    ? { status: "outcome", outcome: noSource(context) }
    : { status: "success", value: extraction };
};

const noOfficialAcquisition: MenuSourceAcquisitionPort = {
  acquire(_request, context) {
    return Promise.resolve({ status: "outcome", outcome: noSource(context) });
  },
};

export class OfficialMenuAnalysisService {
  readonly #apiKey: string;
  readonly #model: string;
  readonly #webSearchModel: string;
  readonly #placesApiKey: string;
  readonly #dependencies: OfficialMenuAnalysisDependencies;

  constructor(
    environment: Readonly<Record<string, string | undefined>>,
    dependencies: Partial<OfficialMenuAnalysisDependencies> = {},
  ) {
    this.#apiKey = environment[SERVER_ENV_NAMES.openAiApiKey]?.trim() ?? "";
    this.#model =
      environment[SERVER_ENV_NAMES.menuExtractionModel]?.trim() ?? "";
    this.#webSearchModel =
      environment[SERVER_ENV_NAMES.webSearchModel]?.trim() ||
      environment[SERVER_ENV_NAMES.menuExtractionModel]?.trim() ||
      "";
    this.#placesApiKey =
      environment[SERVER_ENV_NAMES.googlePlacesApiKey]?.trim() ?? "";
    this.#dependencies = {
      fetchImplementation:
        dependencies.fetchImplementation ?? globalThis.fetch.bind(globalThis),
      now: dependencies.now ?? (() => new Date().toISOString()),
      dnsResolver: dependencies.dnsResolver ?? dnsResolver,
      transport: dependencies.transport ?? httpsTransport,
    };
  }

  async extract(
    submittedLink: string,
    resolution: RestaurantResolution,
    context: PortInvocationContext,
  ): Promise<
    PortResult<{ readonly extraction: CompactMenuExtraction; readonly byteCount: number }>
  > {
    if (
      this.#apiKey.length === 0 ||
      this.#model.length === 0 ||
      this.#placesApiKey.length === 0 ||
      resolution.restaurantId === null ||
      resolution.selectedCandidateId === null
    ) {
      return {
        status: "error",
        error: publicError("ANALYSIS_TEMPORARILY_UNAVAILABLE", context),
      };
    }
    const selected = resolution.candidates.find(
      (candidate) => candidate.candidateId === resolution.selectedCandidateId,
    );
    if (selected === undefined) {
      return { status: "error", error: publicError("INVALID_INPUT", context) };
    }
    const request = MenuSourceAcquisitionRequestSchema.parse({
      restaurantResolution: resolution,
      menuScope: "default",
      submissionContent: [
        {
          kind: "plain_text",
          contentHandle: `link:${createHash("sha256")
            .update(submittedLink)
            .digest("hex")}`,
          sensitivity: "sensitive_transient",
          byteCount: new TextEncoder().encode(submittedLink).byteLength,
          pageCount: null,
        },
      ],
      requestedAt: this.#dependencies.now(),
    });
    const officialWebsite = await officialWebsiteForPlace(
      selected.googlePlaceId,
      this.#placesApiKey,
      this.#dependencies.fetchImplementation,
      context.signal,
    );

    let discovered: readonly WebSearchMenuSourceCandidate[] = [];
    if (this.#webSearchModel.length > 0) {
      const discovery = new OpenAIWebSearchMenuSourceDiscovery(
        this.#apiKey,
        this.#webSearchModel,
        { fetchImplementation: this.#dependencies.fetchImplementation },
      );
      const result = await discovery.discover(request, context);
      if (result.status === "success") discovered = result.value;
      else if (result.status === "error") return result;
    }
    const submitted = normalizedHttpsLink(submittedLink);
    const candidates = [...discovered];
    if (
      submitted !== null &&
      !candidates.some((candidate) => candidate.locator === submitted)
    ) {
      candidates.unshift({
        sourceId: "submitted-link",
        locator: submitted,
        title: null,
        providerOrdinal: 1,
        rank: 1,
      });
    }

    const officialCandidates =
      officialWebsite === null
        ? []
        : candidates
            .filter((candidate) =>
              sameOfficialDomain(candidate.locator, officialWebsite),
            )
            .map(
              (candidate): OfficialMenuSourceCandidate => ({
                sourceId: candidate.sourceId,
                kind: sourceKind(candidate.locator),
                locator: candidate.locator,
              }),
            );
    if (
      officialWebsite !== null &&
      !officialCandidates.some(
        (candidate) => candidate.locator === officialWebsite,
      )
    ) {
      officialCandidates.push({
        sourceId: "official-website",
        kind: "official_menu_page",
        locator: officialWebsite,
      });
    }

    const limits = { maxRedirects: 4, maxResponseBytes: MAX_SOURCE_BYTES };
    const officialRuntime = createBoundedOfficialMenuAcquisitionRuntime({
      dnsResolver: this.#dependencies.dnsResolver,
      transport: this.#dependencies.transport,
      limits,
      collectionClock: this.#dependencies.now,
    });
    let attempts = 0;
    try {
      if (officialCandidates.length > 0) {
        const discoveryService = new OfficialMenuSourceDiscoveryService({
          discover: async () => ({ status: "success", value: officialCandidates }),
        });
        const verified = await discoveryService.discoverVerified(
          {
            googlePlaceId: selected.googlePlaceId,
            restaurantId: resolution.restaurantId,
            menuScope: request.menuScope,
          },
          context,
        );
        if (verified.status !== "success") return verified;
        const selections = selectOfficialMenuCollectors(
          verified.value.candidates,
          context,
        );
        if (selections.status !== "success") return selections;
        for (const selection of selections.value) {
          if (attempts >= MAX_SOURCE_ATTEMPTS) break;
          attempts += 1;
          const proof = verifyOfficialMenuCollectorSelection(
            verified.value,
            selection,
            context,
          );
          if (proof.status !== "success") continue;
          const acquired = await officialRuntime.orchestrator.acquire(
            { request, verifiedSelection: proof.value },
            context,
          );
          if (acquired.status !== "success") continue;
          const bytes = await officialRuntime.readContent(
            acquired.value.content,
            context,
          );
          if (bytes === null) continue;
          const extracted = await extractCollectedMenu(
            acquired.value,
            bytes,
            this.#apiKey,
            this.#model,
            this.#dependencies,
            context,
          );
          if (extracted.status === "success") {
            return {
              status: "success",
              value: { extraction: extracted.value, byteCount: bytes.byteLength },
            };
          }
          if (extracted.status === "error") return extracted;
        }
      }
    } finally {
      officialRuntime.releaseScope(context);
    }

    const officialLocators = new Set(
      officialCandidates.map((candidate) => candidate.locator),
    );
    for (const candidate of candidates) {
      if (
        attempts >= MAX_SOURCE_ATTEMPTS ||
        officialLocators.has(candidate.locator)
      ) {
        continue;
      }
      attempts += 1;
      const fallbackRuntime = createBoundedWebSearchFallbackRuntime({
        officialAcquisition: noOfficialAcquisition,
        discovery: {
          discover: async () => ({ status: "success", value: [candidate] }),
        },
        dnsResolver: this.#dependencies.dnsResolver,
        transport: this.#dependencies.transport,
        limits,
        collectionClock: this.#dependencies.now,
      });
      try {
        const resolved = await fallbackRuntime.service.resolve(request, context);
        if (
          resolved.status !== "success" ||
          resolved.value.menuSource === null
        ) {
          if (resolved.status === "error") return resolved;
          continue;
        }
        const bytes = await fallbackRuntime.readContent(
          resolved.value.menuSource.content,
          context,
        );
        if (bytes === null) continue;
        const extracted = await extractCollectedMenu(
          resolved.value.menuSource,
          bytes,
          this.#apiKey,
          this.#model,
          this.#dependencies,
          context,
        );
        if (extracted.status === "success") {
          return {
            status: "success",
            value: { extraction: extracted.value, byteCount: bytes.byteLength },
          };
        }
        if (extracted.status === "error") return extracted;
      } finally {
        fallbackRuntime.releaseScope(context);
      }
    }
    return { status: "outcome", outcome: noSource(context) };
  }
}
