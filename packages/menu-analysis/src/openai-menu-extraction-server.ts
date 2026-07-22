import {
  CONTRACT_VERSIONS,
  MENU_SCOPES,
  MenuSourceInputSchema,
  CompactMenuExtractionSchema,
  PortInvocationContextSchema,
  PUBLIC_ERROR_REGISTRY,
  PublicErrorEnvelopeSchema,
  SERVER_ENV_NAMES,
  isTimeoutAbortSignal,
  type CompactMenuExtraction,
  type CompactMenuExtractionPort,
  type MenuScope,
  type MenuSourceInput,
  type PortInvocationContext,
  type PortResult,
  type PublicErrorCode,
  type PublicErrorEnvelope,
} from "@foodseyo/contracts";

const OPENAI_RESPONSES_ENDPOINT = "https://api.openai.com/v1/responses";
const EXTRACTION_PROMPT_VERSION = "foodseyo-menu-image/1.0.0";
const PROVIDER_SCHEMA_VERSION = "foodseyo-menu-image-schema/1.0.0";
const MAX_OUTPUT_TOKENS = 12_000;

export interface TransientUploadedMenuImage {
  readonly bytes: Uint8Array;
  readonly mediaType: "image/jpeg" | "image/png" | "image/webp";
}

export interface ExtractedRestaurantClues {
  readonly name: string | null;
  readonly address: string | null;
  readonly visualText: string | null;
}

export interface OpenAIMenuExtractionResult {
  readonly extraction: CompactMenuExtraction;
  readonly restaurantClues: ExtractedRestaurantClues;
}

type TransientImageResolver = (
  contentHandle: string,
) => TransientUploadedMenuImage | readonly TransientUploadedMenuImage[] | null;

interface OpenAIMenuExtractionDependencies {
  readonly fetchImplementation: typeof fetch;
  readonly now: () => string;
}

interface ProviderMenuItem {
  readonly name: string;
  readonly description: string | null;
  readonly price: { readonly amountMinor: number; readonly currency: string } | null;
  readonly optionTexts: readonly string[];
  readonly sourceIndexes: readonly number[];
}

interface ProviderMenuSection {
  readonly name: string | null;
  readonly items: readonly ProviderMenuItem[];
}

interface ProviderMenuOutput {
  readonly analysisQuality: "good" | "partial" | "unreadable";
  readonly restaurantName: string | null;
  readonly restaurantAddress: string | null;
  readonly menuScope: MenuScope;
  readonly sections: readonly ProviderMenuSection[];
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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const hasExactKeys = (
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean => {
  const actual = Object.keys(value).sort();
  return (
    actual.length === expected.length &&
    expected.slice().sort().every((key, index) => actual[index] === key)
  );
};

const boundedText = (value: unknown, maximum: number): string | null => {
  if (value === null) return null;
  if (typeof value !== "string") return null;
  const normalized = value.normalize("NFKC").replace(/\s+/gu, " ").trim();
  return normalized.length > 0 && normalized.length <= maximum
    ? normalized
    : null;
};

const parseProviderOutput = (
  value: unknown,
  imageCount: number,
): ProviderMenuOutput | null => {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "analysisQuality",
      "menuScope",
      "restaurantAddress",
      "restaurantName",
      "sections",
    ]) ||
    !["good", "partial", "unreadable"].includes(
      typeof value.analysisQuality === "string" ? value.analysisQuality : "",
    ) ||
    !MENU_SCOPES.includes(value.menuScope as MenuScope) ||
    !Array.isArray(value.sections) ||
    value.sections.length > 30
  ) {
    return null;
  }

  const restaurantName = boundedText(value.restaurantName, 200);
  const restaurantAddress = boundedText(value.restaurantAddress, 400);
  if (
    (value.restaurantName !== null && restaurantName === null) ||
    (value.restaurantAddress !== null && restaurantAddress === null)
  ) {
    return null;
  }

  const sections: ProviderMenuSection[] = [];
  let totalItems = 0;
  for (const sectionValue of value.sections) {
    if (
      !isRecord(sectionValue) ||
      !hasExactKeys(sectionValue, ["items", "name"]) ||
      !Array.isArray(sectionValue.items) ||
      sectionValue.items.length > 100
    ) {
      return null;
    }
    const sectionName = boundedText(sectionValue.name, 200);
    if (sectionValue.name !== null && sectionName === null) return null;
    const items: ProviderMenuItem[] = [];
    for (const itemValue of sectionValue.items) {
      if (
        !isRecord(itemValue) ||
        !hasExactKeys(itemValue, [
          "description",
          "name",
          "optionTexts",
          "price",
          "sourceIndexes",
        ]) ||
        !Array.isArray(itemValue.optionTexts) ||
        itemValue.optionTexts.length > 30 ||
        !itemValue.optionTexts.every(
          (option) => typeof option === "string" && option.trim().length > 0 && option.length <= 200,
        ) ||
        !Array.isArray(itemValue.sourceIndexes) ||
        itemValue.sourceIndexes.length === 0 ||
        itemValue.sourceIndexes.length > imageCount ||
        !itemValue.sourceIndexes.every(
          (index) =>
            Number.isInteger(index) &&
            (index as number) >= 0 &&
            (index as number) < imageCount,
        ) ||
        new Set(itemValue.sourceIndexes).size !== itemValue.sourceIndexes.length
      ) {
        return null;
      }
      const name = boundedText(itemValue.name, 300);
      const description = boundedText(itemValue.description, 1_500);
      if (
        name === null ||
        (itemValue.description !== null && description === null)
      ) {
        return null;
      }
      let price: ProviderMenuItem["price"] = null;
      if (itemValue.price !== null) {
        if (
          !isRecord(itemValue.price) ||
          !hasExactKeys(itemValue.price, ["amountMinor", "currency"]) ||
          !Number.isSafeInteger(itemValue.price.amountMinor) ||
          (itemValue.price.amountMinor as number) < 0 ||
          typeof itemValue.price.currency !== "string" ||
          !/^[A-Z]{3}$/u.test(itemValue.price.currency)
        ) {
          return null;
        }
        price = {
          amountMinor: itemValue.price.amountMinor as number,
          currency: itemValue.price.currency,
        };
      }
      items.push({
        name,
        description,
        price,
        optionTexts: itemValue.optionTexts.map((option) => option.trim()),
        sourceIndexes: itemValue.sourceIndexes as readonly number[],
      });
      totalItems += 1;
      if (totalItems > 200) return null;
    }
    sections.push({ name: sectionName, items });
  }
  if (totalItems === 0 || value.analysisQuality === "unreadable") return null;

  return {
    analysisQuality: value.analysisQuality as ProviderMenuOutput["analysisQuality"],
    restaurantName,
    restaurantAddress,
    menuScope: value.menuScope as MenuScope,
    sections,
  };
};

const structuredOutputSchema = (imageCount: number) => ({
  type: "object",
  additionalProperties: false,
  required: [
    "analysisQuality",
    "restaurantName",
    "restaurantAddress",
    "menuScope",
    "sections",
  ],
  properties: {
    analysisQuality: { type: "string", enum: ["good", "partial", "unreadable"] },
    restaurantName: { type: ["string", "null"] },
    restaurantAddress: { type: ["string", "null"] },
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
              required: ["name", "description", "price", "optionTexts", "sourceIndexes"],
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
                optionTexts: { type: "array", maxItems: 30, items: { type: "string" } },
                sourceIndexes: {
                  type: "array",
                  minItems: 1,
                  maxItems: imageCount,
                  uniqueItems: true,
                  items: {
                    type: "integer",
                    enum: Array.from({ length: imageCount }, (_, index) => index),
                  },
                },
              },
            },
          },
        },
      },
    },
  },
} as const);

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

export class OpenAIMenuImageExtractionAdapter
  implements CompactMenuExtractionPort
{
  constructor(
    private readonly apiKey: string,
    readonly modelVersion: string,
    private readonly resolveImage: TransientImageResolver,
    private readonly dependencies: OpenAIMenuExtractionDependencies = {
      fetchImplementation: globalThis.fetch.bind(globalThis),
      now: () => new Date().toISOString(),
    },
  ) {}

  async extract(
    input: MenuSourceInput,
    context: PortInvocationContext,
  ): Promise<PortResult<CompactMenuExtraction>> {
    const result = await this.extractWithRestaurantClues(input, context);
    return result.status === "success"
      ? { status: "success", value: result.value.extraction }
      : result;
  }

  async extractWithRestaurantClues(
    input: MenuSourceInput,
    context: PortInvocationContext,
  ): Promise<PortResult<OpenAIMenuExtractionResult>> {
    PortInvocationContextSchema.parse(context);
    const parsedInput = MenuSourceInputSchema.safeParse(input);
    if (!parsedInput.success || parsedInput.data.content.kind !== "image_collection") {
      return { status: "error", error: publicError("INVALID_INPUT", context) };
    }
    if (context.signal.aborted) {
      return {
        status: "error",
        error: publicError(
          isTimeoutAbortSignal(context.signal)
            ? "UPSTREAM_TIMEOUT"
            : "ANALYSIS_TEMPORARILY_UNAVAILABLE",
          context,
        ),
      };
    }
    const resolvedImages = this.resolveImage(parsedInput.data.content.contentHandle);
    const images = resolvedImages === null
      ? []
      : Array.isArray(resolvedImages)
        ? resolvedImages
        : [resolvedImages];
    if (images.length === 0 || images.length > 5) {
      return { status: "error", error: publicError("INVALID_INPUT", context) };
    }

    const providerController = new AbortController();
    const abortProvider = (): void => providerController.abort(context.signal.reason);
    context.signal.addEventListener("abort", abortProvider, { once: true });
    const timeout = setTimeout(
      () => providerController.abort(new DOMException("deadline exceeded", "TimeoutError")),
      context.timeoutMs,
    );
    try {
      const imageInputs = images.map((image) => ({
        type: "input_image" as const,
        image_url: `data:${image.mediaType};base64,${Buffer.from(image.bytes).toString("base64")}`,
        detail: "high" as const,
      }));
      let response: Response;
      try {
        response = await this.dependencies.fetchImplementation(OPENAI_RESPONSES_ENDPOINT, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: this.modelVersion,
            instructions:
              `Extract only menu information visible in the ${images.length} supplied image${images.length === 1 ? "" : "s"}. Preserve image, section, and item order. Prices must be nonnegative integer minor units with ISO 4217 currency. Use null when a price, restaurant name, restaurant address, description, or section name is not visible. Do not invent ingredients, safety claims, reviews, or restaurant identity. sourceIndexes must list the zero-based source images that visibly support each item.`,
            input: [
              {
                role: "user",
                content: [
                  { type: "input_text", text: "Analyze this menu image for Foodseyo." },
                  ...imageInputs,
                ],
              },
            ],
            text: {
              format: {
                type: "json_schema",
                name: "foodseyo_compact_menu_extraction",
                strict: true,
                schema: structuredOutputSchema(images.length),
              },
            },
            max_output_tokens: MAX_OUTPUT_TOKENS,
            store: false,
          }),
          signal: providerController.signal,
        });
      } catch {
        const timedOut = providerController.signal.reason instanceof DOMException &&
          providerController.signal.reason.name === "TimeoutError";
        return {
          status: "error",
          error: publicError(
            timedOut || isTimeoutAbortSignal(context.signal)
              ? "UPSTREAM_TIMEOUT"
              : "UPSTREAM_UNAVAILABLE",
            context,
          ),
        };
      }
      if (!response.ok) {
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
      const provider = parseProviderOutput(decoded, images.length);
      if (provider === null) {
        return { status: "error", error: publicError("INVALID_UPSTREAM_RESULT", context) };
      }
      const extraction = CompactMenuExtractionSchema.safeParse({
        contractVersion: CONTRACT_VERSIONS.compactExtraction,
        extractionState: "unvalidated",
        source: parsedInput.data.source,
        restaurantContext: parsedInput.data.restaurantContext,
        menuScope: provider.menuScope,
        sections: provider.sections.map((section, sectionIndex) => ({
          sectionIndex,
          name: section.name,
          items: section.items.map((item, itemIndex) => ({
            itemIndex,
            name: item.name,
            description: item.description,
            price: item.price,
            optionTexts: item.optionTexts,
            sourceEvidence: [
              {
                kind: "menu_source",
                sourceRef: parsedInput.data.source.sourceRef,
                sourceIndexes: item.sourceIndexes,
              },
            ],
          })),
        })),
        warningCodes:
          provider.analysisQuality === "partial" ? ["partial_menu"] : [],
        completedAt: this.dependencies.now(),
      });
      if (!extraction.success) {
        return { status: "error", error: publicError("INVALID_UPSTREAM_RESULT", context) };
      }
      return {
        status: "success",
        value: {
          extraction: extraction.data,
          restaurantClues: {
            name: provider.restaurantName,
            address: provider.restaurantAddress,
            visualText: provider.restaurantName,
          },
        },
      };
    } finally {
      clearTimeout(timeout);
      context.signal.removeEventListener("abort", abortProvider);
    }
  }
}

export const createOpenAIMenuImageExtractionAdapterFromEnvironment = (
  environment: Readonly<Record<string, string | undefined>>,
  resolveImage: TransientImageResolver,
  dependencies?: Partial<OpenAIMenuExtractionDependencies>,
): OpenAIMenuImageExtractionAdapter | null => {
  const apiKey = environment[SERVER_ENV_NAMES.openAiApiKey]?.trim();
  const model = environment[SERVER_ENV_NAMES.menuExtractionModel]?.trim();
  if (!apiKey || !model) return null;
  return new OpenAIMenuImageExtractionAdapter(apiKey, model, resolveImage, {
    fetchImplementation:
      dependencies?.fetchImplementation ?? globalThis.fetch.bind(globalThis),
    now: dependencies?.now ?? (() => new Date().toISOString()),
  });
};

export const OPENAI_MENU_EXTRACTION_VERSION = {
  prompt: EXTRACTION_PROMPT_VERSION,
  providerSchema: PROVIDER_SCHEMA_VERSION,
} as const;
