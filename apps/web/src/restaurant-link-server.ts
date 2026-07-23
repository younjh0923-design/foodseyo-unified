import { createHash, randomUUID } from "node:crypto";
import { isIP } from "node:net";

import {
  CONTRACT_VERSIONS,
  PUBLIC_ERROR_REGISTRY,
  SERVER_ENV_NAMES,
  PortInvocationContextSchema,
  PublicErrorEnvelopeSchema,
  PublicOutcomeSchema,
  RestaurantCandidateSchema,
  isTimeoutAbortSignal,
  type PortInvocationContext,
  type PortResult,
  type PublicErrorCode,
  type GeoPoint,
  type RestaurantCandidate,
} from "@foodseyo/contracts";

const OPENAI_RESPONSES_ENDPOINT = "https://api.openai.com/v1/responses";
const GOOGLE_PLACE_DETAILS_ENDPOINT =
  "https://places.googleapis.com/v1/places/";
const MAX_LINK_LENGTH = 2_048;
const MAX_REDIRECTS = 4;
const GOOGLE_MAPS_HOST_PATTERN =
  /^(?:(?:www|maps)\.)?google\.(?:com|ca|de|fr|it|es|co\.uk|co\.kr|co\.jp|com\.au|com\.br|co\.in|com\.mx)$/u;

type CandidateFinder = (
  clues: {
    readonly name: string | null;
    readonly address: string | null;
    readonly visualText: string | null;
    readonly linkFingerprint: string | null;
    readonly location: GeoPoint | null;
  },
  context: PortInvocationContext,
) => Promise<PortResult<readonly RestaurantCandidate[]>>;

interface RestaurantLinkResolverDependencies {
  readonly fetchImplementation: typeof fetch;
  readonly generateId: () => string;
}

interface LinkClues {
  readonly name: string;
  readonly address: string | null;
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

const notResolved = (context: PortInvocationContext) =>
  PublicOutcomeSchema.parse({
    code: "RESTAURANT_NOT_RESOLVED",
    stage: "restaurant_resolution",
    correlationId: context.correlationId,
    retryable: true,
    canContinueMenuOnly: true,
  });

const normalizedHostname = (hostname: string): string =>
  hostname
    .toLocaleLowerCase("en-US")
    .replace(/^\[/u, "")
    .replace(/\]$/u, "")
    .replace(/\.$/u, "");

const isNonPublicHostname = (hostname: string): boolean => {
  const host = normalizedHostname(hostname);
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  const ipVersion = isIP(host);
  if (ipVersion === 4) {
    const octets = host.split(".").map(Number);
    const [first = -1, second = -1] = octets;
    return (
      first === 0 ||
      first === 10 ||
      first === 127 ||
      (first === 100 && second >= 64 && second <= 127) ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168) ||
      (first === 198 && (second === 18 || second === 19)) ||
      first >= 224
    );
  }
  if (ipVersion === 6) {
    return (
      host === "::" ||
      host === "::1" ||
      host.startsWith("fc") ||
      host.startsWith("fd") ||
      /^fe[89ab]/u.test(host) ||
      host.startsWith("::ffff:127.") ||
      host.startsWith("::ffff:10.") ||
      host.startsWith("::ffff:192.168.")
    );
  }
  return false;
};

const safeLink = (value: string): URL | null => {
  const normalized = value.normalize("NFKC").trim();
  if (normalized.length === 0 || normalized.length > MAX_LINK_LENGTH) return null;
  try {
    const url = new URL(normalized);
    if (
      (url.protocol !== "https:" && url.protocol !== "http:") ||
      url.hostname.length === 0 ||
      url.username.length > 0 ||
      url.password.length > 0 ||
      isNonPublicHostname(url.hostname)
    ) {
      return null;
    }
    url.hash = "";
    return url;
  } catch {
    return null;
  }
};

const isGoogleMapsHost = (hostname: string): boolean => {
  const host = normalizedHostname(hostname);
  return (
    host === "maps.app.goo.gl" ||
    host === "goo.gl" ||
    GOOGLE_MAPS_HOST_PATTERN.test(host)
  );
};

const decodedSegment = (value: string): string | null => {
  try {
    const normalized = decodeURIComponent(value)
      .replace(/\+/gu, " ")
      .normalize("NFKC")
      .replace(/\s+/gu, " ")
      .trim();
    return normalized.length > 0 && normalized.length <= 400
      ? normalized
      : null;
  } catch {
    return null;
  }
};

const mapsReference = (
  url: URL,
): {
  readonly placeId: string | null;
  readonly query: string | null;
  readonly location: GeoPoint | null;
} => {
  const explicitPlaceId =
    decodedSegment(url.searchParams.get("query_place_id") ?? "") ??
    decodedSegment(url.searchParams.get("place_id") ?? "");
  const embeddedPlaceId = (() => {
    try {
      const match = decodeURIComponent(url.toString()).match(
        /(?:!1s|[?&](?:query_place_id|place_id)=)(ChIJ[A-Za-z0-9_-]{10,})/u,
      );
      return match?.[1] ?? null;
    } catch {
      return null;
    }
  })();
  const placeId = explicitPlaceId ?? embeddedPlaceId;
  const parameterQuery =
    decodedSegment(url.searchParams.get("query") ?? "") ??
    decodedSegment(url.searchParams.get("q") ?? "");
  const segments = url.pathname.split("/").filter(Boolean);
  const placeIndex = segments.findIndex((segment) => segment === "place");
  const searchIndex = segments.findIndex((segment) => segment === "search");
  const pathQuery =
    (placeIndex >= 0 && segments[placeIndex + 1]
      ? decodedSegment(segments[placeIndex + 1] ?? "")
      : null) ??
    (searchIndex >= 0 && segments[searchIndex + 1]
      ? decodedSegment(segments[searchIndex + 1] ?? "")
      : null);
  const coordinateMatch = url.pathname.match(
    /@(-?\d{1,2}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)(?:,|\/|$)/u,
  );
  const latitude = coordinateMatch?.[1] === undefined
    ? Number.NaN
    : Number(coordinateMatch[1]);
  const longitude = coordinateMatch?.[2] === undefined
    ? Number.NaN
    : Number(coordinateMatch[2]);
  const location =
    Number.isFinite(latitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    Number.isFinite(longitude) &&
    longitude >= -180 &&
    longitude <= 180
      ? { latitude, longitude }
      : null;
  return {
    placeId,
    query: parameterQuery ?? pathQuery,
    location,
  };
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

const parseLinkClues = (value: unknown): LinkClues | null => {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== 2 ||
    typeof value.restaurantName !== "string" ||
    (value.restaurantAddress !== null &&
      typeof value.restaurantAddress !== "string")
  ) {
    return null;
  }
  const name = value.restaurantName
    .normalize("NFKC")
    .replace(/\s+/gu, " ")
    .trim();
  const address =
    value.restaurantAddress === null
      ? null
      : value.restaurantAddress
          .normalize("NFKC")
          .replace(/\s+/gu, " ")
          .trim();
  if (
    name.length === 0 ||
    name.length > 200 ||
    (address !== null && (address.length === 0 || address.length > 400))
  ) {
    return null;
  }
  return { name, address };
};

export class RestaurantLinkCandidateResolver {
  readonly #apiKey: string;
  readonly #webSearchModel: string;
  readonly #placesApiKey: string;
  readonly #dependencies: RestaurantLinkResolverDependencies;

  constructor(
    environment: Readonly<Record<string, string | undefined>>,
    private readonly findCandidates: CandidateFinder,
    dependencies: Partial<RestaurantLinkResolverDependencies> = {},
  ) {
    this.#apiKey = environment[SERVER_ENV_NAMES.openAiApiKey]?.trim() ?? "";
    this.#webSearchModel =
      environment[SERVER_ENV_NAMES.webSearchModel]?.trim() ||
      environment[SERVER_ENV_NAMES.menuExtractionModel]?.trim() ||
      "";
    this.#placesApiKey =
      environment[SERVER_ENV_NAMES.googlePlacesApiKey]?.trim() ?? "";
    this.#dependencies = {
      fetchImplementation:
        dependencies.fetchImplementation ?? globalThis.fetch.bind(globalThis),
      generateId: dependencies.generateId ?? (() => randomUUID()),
    };
  }

  async resolve(
    rawLink: string,
    context: PortInvocationContext,
  ): Promise<PortResult<readonly RestaurantCandidate[]>> {
    PortInvocationContextSchema.parse(context);
    const initial = safeLink(rawLink);
    if (initial === null) {
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
    const fingerprint = `sha256:${createHash("sha256")
      .update(initial.toString())
      .digest("hex")}`;

    if (isGoogleMapsHost(initial.hostname)) {
      const expanded = await this.expandGoogleMapsLink(initial, context.signal);
      if (expanded === null) {
        return { status: "outcome", outcome: notResolved(context) };
      }
      const reference = mapsReference(expanded);
      if (reference.placeId !== null) {
        const direct = await this.placeDetails(
          reference.placeId,
          context,
        );
        if (direct !== null) return { status: "success", value: [direct] };
      }
      if (reference.query !== null) {
        return this.findCandidates(
          {
            name: reference.query,
            address: null,
            visualText: null,
            linkFingerprint: fingerprint,
            location: reference.location,
          },
          context,
        );
      }
      return { status: "outcome", outcome: notResolved(context) };
    }

    const clues = await this.searchLink(initial, context);
    if (clues.status !== "success") return clues;
    return this.findCandidates(
      {
        name: clues.value.name,
        address: clues.value.address,
        visualText: null,
        linkFingerprint: fingerprint,
        location: null,
      },
      context,
    );
  }

  private async expandGoogleMapsLink(
    initial: URL,
    signal: AbortSignal,
  ): Promise<URL | null> {
    let current = initial;
    let redirectCount = 0;
    while (true) {
      if (!isGoogleMapsHost(current.hostname)) return null;
      if (
        current.hostname !== "maps.app.goo.gl" &&
        current.hostname !== "goo.gl"
      ) {
        return current;
      }
      if (redirectCount >= MAX_REDIRECTS) return null;
      let response: Response;
      try {
        response = await this.#dependencies.fetchImplementation(current, {
          method: "GET",
          redirect: "manual",
          signal,
        });
      } catch {
        return null;
      }
      const location = response.headers.get("location");
      await response.body?.cancel().catch(() => undefined);
      if (location === null || ![301, 302, 303, 307, 308].includes(response.status)) {
        return current;
      }
      const next = safeLink(new URL(location, current).toString());
      if (next === null) return null;
      current = next;
      redirectCount += 1;
    }
  }

  private async placeDetails(
    placeId: string,
    context: PortInvocationContext,
  ): Promise<RestaurantCandidate | null> {
    if (this.#placesApiKey.length === 0) return null;
    let response: Response;
    try {
      response = await this.#dependencies.fetchImplementation(
        `${GOOGLE_PLACE_DETAILS_ENDPOINT}${encodeURIComponent(placeId)}`,
        {
          headers: {
            "X-Goog-Api-Key": this.#placesApiKey,
            "X-Goog-FieldMask":
              "id,displayName,formattedAddress,location",
          },
          signal: context.signal,
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
    if (
      !isRecord(payload) ||
      typeof payload.id !== "string" ||
      !isRecord(payload.displayName) ||
      typeof payload.displayName.text !== "string" ||
      (payload.formattedAddress !== undefined &&
        typeof payload.formattedAddress !== "string")
    ) {
      return null;
    }
    const location =
      isRecord(payload.location) &&
      typeof payload.location.latitude === "number" &&
      typeof payload.location.longitude === "number"
        ? {
            latitude: payload.location.latitude,
            longitude: payload.location.longitude,
          }
        : null;
    const parsed = RestaurantCandidateSchema.safeParse({
      contractVersion: CONTRACT_VERSIONS.restaurantResolution,
      candidateId: this.#dependencies.generateId(),
      googlePlaceId: payload.id,
      displayName: payload.displayName.text,
      fullAddress:
        typeof payload.formattedAddress === "string"
          ? payload.formattedAddress
          : null,
      shortAddress: null,
      location,
      matchSignals: ["user_link"],
      rank: 1,
    });
    return parsed.success ? parsed.data : null;
  }

  private async searchLink(
    link: URL,
    context: PortInvocationContext,
  ): Promise<PortResult<LinkClues>> {
    if (this.#apiKey.length === 0 || this.#webSearchModel.length === 0) {
      return {
        status: "error",
        error: publicError("ANALYSIS_TEMPORARILY_UNAVAILABLE", context),
      };
    }
    let response: Response;
    try {
      response = await this.#dependencies.fetchImplementation(
        OPENAI_RESPONSES_ENDPOINT,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.#apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: this.#webSearchModel,
            tools: [{ type: "web_search", search_context_size: "low" }],
            tool_choice: "auto",
            instructions:
              "Identify only the restaurant represented by the supplied link. Use the linked page and web search evidence. Return the exact restaurant name and branch address when supported. Do not invent a restaurant or menu facts.",
            input: `Restaurant or menu link: ${link.toString()}`,
            text: {
              format: {
                type: "json_schema",
                name: "foodseyo_restaurant_link_clues",
                strict: true,
                schema: {
                  type: "object",
                  additionalProperties: false,
                  required: ["restaurantName", "restaurantAddress"],
                  properties: {
                    restaurantName: { type: "string" },
                    restaurantAddress: { type: ["string", "null"] },
                  },
                },
              },
            },
            max_output_tokens: 300,
            store: false,
          }),
          signal: context.signal,
        },
      );
    } catch {
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
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      return { status: "error", error: publicError("UPSTREAM_UNAVAILABLE", context) };
    }
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      return {
        status: "error",
        error: publicError("INVALID_UPSTREAM_RESULT", context),
      };
    }
    const text = responseText(payload);
    if (text === null) {
      return {
        status: "error",
        error: publicError("INVALID_UPSTREAM_RESULT", context),
      };
    }
    let decoded: unknown;
    try {
      decoded = JSON.parse(text);
    } catch {
      return {
        status: "error",
        error: publicError("INVALID_UPSTREAM_RESULT", context),
      };
    }
    const clues = parseLinkClues(decoded);
    return clues === null
      ? { status: "outcome", outcome: notResolved(context) }
      : { status: "success", value: clues };
  }
}
