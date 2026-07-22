import {
  BASIC_TASTES,
  FLAVOR_NOTES,
  HEAT_ADJUSTABILITY_STATES,
  HEAT_LEVELS,
  PUBLIC_ERROR_REGISTRY,
  RICHNESS_LEVELS,
  SERVER_ENV_NAMES,
  TEXTURES,
  PublicErrorEnvelopeSchema,
  type CanonicalMenuAnalysis,
  type PortInvocationContext,
  type PortResult,
  type PublicErrorCode,
} from "@foodseyo/contracts";

import type {
  ResultScreenView,
  SourceBoundMenuGuidance,
  UiLanguage,
} from "./foundation.js";

const OPENAI_RESPONSES_ENDPOINT = "https://api.openai.com/v1/responses";
const MAX_GUIDANCE_ITEMS = 200;
const SAFETY_QUESTION_PATTERN =
  /\b(?:allerg(?:y|en|ic)|celiac|gluten[- ]free|dietary safety|safe to eat)\b|알레르기|알러지|식이 안전|먹어도 (?:돼|되)/iu;
const UNSAFE_GUARANTEE_PATTERN =
  /\b(?:allergen[- ](?:free|safe)|allergy[- ]safe|safe for (?:a |your |people with )?(?:allerg|celiac)|guaranteed (?:safe|free)|contains no allergens?)\b|(?:알레르기|알러지|식이).{0,24}(?:안전|없(?:습니다|어요|음)|보장)/iu;
const UNVERIFIED_RECIPE_CLAIM_PATTERN =
  /\b(?:the|this) restaurant(?:'s)?\s+(?:(?:actual|real)\s+)?(?:recipe|ingredients?|preparation)\b|\b(?:the|this) restaurant\s+(?:uses|makes|prepares|cooks)\b|(?:이|해당)?\s*식당(?:의|은|에서는)?.{0,24}(?:실제\s*)?(?:레시피|조리법|재료를\s*사용)/iu;
const SAFETY_CAVEAT: Readonly<Record<UiLanguage, string>> = {
  en: "I can't confirm allergen or dietary safety from this menu. Ask the restaurant directly before ordering.",
  ko: "이 메뉴 정보만으로 알레르기 또는 식이 안전을 확인할 수 없습니다. 주문 전에 식당에 직접 문의하세요.",
};
const RECIPE_CAVEAT: Readonly<Record<UiLanguage, string>> = {
  en: "The supplied menu does not confirm this restaurant's actual recipe or preparation. Ask the restaurant directly for that information.",
  ko: "제공된 메뉴만으로는 이 식당의 실제 레시피나 조리법을 확인할 수 없습니다. 식당에 직접 문의하세요.",
};

interface GuidanceDependencies {
  readonly fetchImplementation: typeof fetch;
}

export interface OrderingAssistantAnswer {
  readonly answer: string;
  readonly suggestedMenuItemIds: readonly string[];
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

const guidanceSchema = {
  type: "object",
  additionalProperties: false,
  required: ["items"],
  properties: {
    items: {
      type: "array",
      maxItems: MAX_GUIDANCE_ITEMS,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "menuItemId",
          "basicTastes",
          "flavorNotes",
          "textures",
          "heat",
          "richness",
          "heatAdjustability",
          "ingredients",
          "orderTip",
        ],
        properties: {
          menuItemId: { type: "string" },
          basicTastes: {
            type: "array",
            uniqueItems: true,
            items: { type: "string", enum: [...BASIC_TASTES] },
          },
          flavorNotes: {
            type: "array",
            uniqueItems: true,
            items: { type: "string", enum: [...FLAVOR_NOTES] },
          },
          textures: {
            type: "array",
            uniqueItems: true,
            items: { type: "string", enum: [...TEXTURES] },
          },
          heat: { type: ["string", "null"], enum: [...HEAT_LEVELS, null] },
          richness: {
            type: ["string", "null"],
            enum: [...RICHNESS_LEVELS, null],
          },
          heatAdjustability: {
            type: ["string", "null"],
            enum: [...HEAT_ADJUSTABILITY_STATES, null],
          },
          ingredients: {
            type: "array",
            maxItems: 30,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["name", "basis"],
              properties: {
                name: { type: "string" },
                basis: {
                  type: "string",
                  enum: ["source_stated", "inferred_from_source"],
                },
              },
            },
          },
          orderTip: { type: ["string", "null"] },
        },
      },
    },
  },
} as const;

const assistantSchema = {
  type: "object",
  additionalProperties: false,
  required: ["answer", "suggestedMenuItemIds"],
  properties: {
    answer: { type: "string" },
    suggestedMenuItemIds: {
      type: "array",
      maxItems: 5,
      items: { type: "string" },
    },
  },
} as const;

const normalizedText = (
  value: unknown,
  maximum: number,
): string | null => {
  if (typeof value !== "string") return null;
  const text = value.normalize("NFKC").replace(/\s+/gu, " ").trim();
  return text.length > 0 && text.length <= maximum ? text : null;
};

const stringArray = (
  value: unknown,
  allowed: readonly string[],
): readonly string[] | null =>
  Array.isArray(value) &&
  value.every((entry) => typeof entry === "string" && allowed.includes(entry)) &&
  new Set(value).size === value.length
    ? value
    : null;

const parseGuidance = (
  value: unknown,
  validItemIds: ReadonlySet<string>,
): readonly SourceBoundMenuGuidance[] | null => {
  if (!isRecord(value) || !Array.isArray(value.items)) return null;
  const items: SourceBoundMenuGuidance[] = [];
  const seen = new Set<string>();
  for (const item of value.items) {
    if (
      !isRecord(item) ||
      typeof item.menuItemId !== "string" ||
      !validItemIds.has(item.menuItemId) ||
      seen.has(item.menuItemId)
    ) {
      return null;
    }
    const basicTastes = stringArray(item.basicTastes, BASIC_TASTES);
    const flavorNotes = stringArray(item.flavorNotes, FLAVOR_NOTES);
    const textures = stringArray(item.textures, TEXTURES);
    if (
      basicTastes === null ||
      flavorNotes === null ||
      textures === null ||
      (item.heat !== null && !HEAT_LEVELS.includes(item.heat as never)) ||
      (item.richness !== null &&
        !RICHNESS_LEVELS.includes(item.richness as never)) ||
      (item.heatAdjustability !== null &&
        !HEAT_ADJUSTABILITY_STATES.includes(item.heatAdjustability as never)) ||
      !Array.isArray(item.ingredients)
    ) {
      return null;
    }
    const ingredients: Array<{
      name: string;
      basis: "source_stated" | "inferred_from_source";
    }> = [];
    for (const ingredient of item.ingredients) {
      if (
        !isRecord(ingredient) ||
        (ingredient.basis !== "source_stated" &&
          ingredient.basis !== "inferred_from_source")
      ) {
        return null;
      }
      const name = normalizedText(ingredient.name, 240);
      if (name === null) return null;
      ingredients.push({
        name,
        basis: ingredient.basis as
          | "source_stated"
          | "inferred_from_source",
      });
    }
    const orderTip =
      item.orderTip === null ? null : normalizedText(item.orderTip, 500);
    if (item.orderTip !== null && orderTip === null) return null;
    seen.add(item.menuItemId);
    items.push({
      menuItemId: item.menuItemId,
      basicTastes,
      flavorNotes,
      textures,
      heat: item.heat as string | null,
      richness: item.richness as string | null,
      heatAdjustability: item.heatAdjustability as string | null,
      ingredients,
      orderTip,
    });
  }
  return items;
};

export class OpenAIMenuGuidanceService {
  readonly #apiKey: string;
  readonly #guidanceModel: string;
  readonly #assistantModel: string;
  readonly #dependencies: GuidanceDependencies;

  constructor(
    environment: Readonly<Record<string, string | undefined>>,
    dependencies: Partial<GuidanceDependencies> = {},
  ) {
    this.#apiKey = environment[SERVER_ENV_NAMES.openAiApiKey]?.trim() ?? "";
    this.#guidanceModel =
      environment[SERVER_ENV_NAMES.menuExtractionModel]?.trim() ?? "";
    this.#assistantModel =
      environment[SERVER_ENV_NAMES.explanationModel]?.trim() ??
      this.#guidanceModel;
    this.#dependencies = {
      fetchImplementation:
        dependencies.fetchImplementation ?? globalThis.fetch.bind(globalThis),
    };
  }

  async build(
    analysis: CanonicalMenuAnalysis,
    language: UiLanguage,
    context: PortInvocationContext,
  ): Promise<readonly SourceBoundMenuGuidance[]> {
    if (
      this.#apiKey.length === 0 ||
      this.#guidanceModel.length === 0 ||
      analysis.menuItems.length === 0
    ) {
      return [];
    }
    const menuItems = analysis.menuItems.map((item) => ({
      menuItemId: item.menuItemId,
      name: item.name,
      description: item.description,
      optionTexts: item.optionTexts,
    }));
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
            model: this.#guidanceModel,
            instructions: [
              "Create source-honest ordering guidance only from the supplied validated menu item names, descriptions, and options.",
              "Use only the provided controlled sensory vocabulary.",
              "An ingredient is source_stated only when explicitly named; otherwise use inferred_from_source.",
              "Leave arrays empty or fields null when evidence is insufficient.",
              "Never make allergen, dietary-safety, health, review, popularity, or restaurant-preparation guarantees.",
              `Write orderTip in ${language === "ko" ? "Korean" : "English"}.`,
            ].join(" "),
            input: JSON.stringify({ menuItems }),
            text: {
              format: {
                type: "json_schema",
                name: "foodseyo_source_bound_menu_guidance",
                strict: true,
                schema: guidanceSchema,
              },
            },
            max_output_tokens: 8_000,
            store: false,
          }),
          signal: context.signal,
        },
      );
    } catch {
      return [];
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      return [];
    }
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      return [];
    }
    const text = responseText(payload);
    if (text === null) return [];
    let decoded: unknown;
    try {
      decoded = JSON.parse(text);
    } catch {
      return [];
    }
    return (
      parseGuidance(
        decoded,
        new Set(analysis.menuItems.map((item) => item.menuItemId)),
      ) ?? []
    );
  }

  async answer(
    result: ResultScreenView,
    question: string,
    language: UiLanguage,
    context: PortInvocationContext,
  ): Promise<PortResult<OrderingAssistantAnswer>> {
    if (this.#apiKey.length === 0 || this.#assistantModel.length === 0) {
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
            model: this.#assistantModel,
            instructions: [
              "You are Foodseyo's ordering copilot.",
              "Answer only from the supplied confirmed restaurant menu and source-bound dish facts.",
              "Recommend only menuItemIds that appear in the supplied menu.",
              "Clearly say when information is unknown.",
              "Never claim to know the restaurant's actual recipe, ingredients, or preparation unless the supplied menu facts state it.",
              "Never guarantee allergen or dietary safety; tell the user to ask the restaurant when safety matters.",
              `Answer in ${language === "ko" ? "Korean" : "English"}.`,
            ].join(" "),
            input: JSON.stringify({
              question,
              restaurantName: result.restaurantName,
              restaurantAddress: result.restaurantAddress,
              menuItems: result.menuItems.map((item) => ({
                menuItemId: item.menuItemId,
                name: item.name,
                description: item.description,
                price: item.price,
                facts: item.facts,
                orderTip: item.orderTip,
              })),
            }),
            text: {
              format: {
                type: "json_schema",
                name: "foodseyo_ordering_assistant_answer",
                strict: true,
                schema: assistantSchema,
              },
            },
            max_output_tokens: 800,
            store: false,
          }),
          signal: context.signal,
        },
      );
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
    if (
      !isRecord(decoded) ||
      !Array.isArray(decoded.suggestedMenuItemIds) ||
      new Set(decoded.suggestedMenuItemIds).size !==
        decoded.suggestedMenuItemIds.length ||
      decoded.suggestedMenuItemIds.some(
        (id) =>
          typeof id !== "string" ||
          !result.menuItems.some((item) => item.menuItemId === id),
      )
    ) {
      return { status: "error", error: publicError("INVALID_UPSTREAM_RESULT", context) };
    }
    const answer = normalizedText(decoded.answer, 2_000);
    if (answer === null) {
      return { status: "error", error: publicError("INVALID_UPSTREAM_RESULT", context) };
    }
    const safetyRelevant =
      SAFETY_QUESTION_PATTERN.test(question) ||
      SAFETY_QUESTION_PATTERN.test(answer);
    const unsafeGuarantee = UNSAFE_GUARANTEE_PATTERN.test(answer);
    const unverifiedRecipeClaim = UNVERIFIED_RECIPE_CLAIM_PATTERN.test(answer);
    const safeAnswer = unsafeGuarantee
      ? SAFETY_CAVEAT[language]
      : unverifiedRecipeClaim
        ? RECIPE_CAVEAT[language]
      : safetyRelevant && !answer.includes(SAFETY_CAVEAT[language])
        ? `${answer} ${SAFETY_CAVEAT[language]}`
        : answer;
    return {
      status: "success",
      value: {
        answer: safeAnswer,
        suggestedMenuItemIds: unsafeGuarantee || unverifiedRecipeClaim
          ? []
          : (decoded.suggestedMenuItemIds as readonly string[]),
      },
    };
  }
}
